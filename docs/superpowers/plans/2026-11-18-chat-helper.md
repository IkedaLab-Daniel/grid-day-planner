# Chat Helper (Stage 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A chat sheet on the day page where a LangGraph.js agent (Azure `gpt-4.1-mini`) logs, stretches, fixes and deletes **actual** blocks through tool calls, asks about every gap, and keeps per-user chat history.

**Architecture:** Pure helpers (time resolution, activity matching, prompt building) and tool functions over `(supabase client, profile, now)` live in `src/lib/chat/`. A small LangGraph agent (model node ↔ tools node, capped loops) wraps those tools. A `sendMessage` service adds validation, rate limiting, history and persistence; a thin `/api/chat` route and a `ChatSheet` UI sit on top. Tools write through the user's session so RLS applies and stage 1's `saveBlock`/`moveBlock` do all block mutation.

**Tech Stack:** Next.js 16 (route handler, Node runtime), `@langchain/langgraph@^1`, `@langchain/core@^1`, `@langchain/openai@^1`, `zod@^4`, `tsx` (smoke script), Supabase (RLS), Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-18-chat-helper-design.md` (builds on `2026-11-18-planner-core-design.md`; the stage 1 code is the codebase being extended).

## Global Constraints

- Agent is **LangGraph.js inside the Next app**, Node runtime; no Python service.
- Model: Azure OpenAI deployment `gpt-4.1-mini` via the OpenAI-compatible v1 endpoint. Env vars `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`: server-side only (never `NEXT_PUBLIC_`), values only in the git-ignored `.env.local`, `.env.example` lists names with empty values. The key must never appear in git, logs, error messages, test output or the browser.
- Tools run on the signed-in user's Supabase client (RLS); no service-role key in the chat path. All block mutation goes through stage 1 `saveBlock` / `moveBlock` / `deleteBlock`; do not re-implement painting, day boundaries or DST.
- Every tool-created or edited block: `kind = 'actual'`, `source = 'ai'`.
- Tool times: `HH:mm` 24-hour in the user's timezone plus optional `date` day key; start **floored**, end **ceiled** to 10-minute cells from the day start; no future starts/ends; blocks never cross the day boundary.
- Gap rule (enforced in the tool): `log_activity` returns `GAP` unless `gap: "skip"`; the day's first actual block is never asked about; same-day grid only; any gap of one or more cells counts.
- Limits: message ≤ 1000 chars; 30 user messages per rolling hour per user (HTTP 429); at most 6 tool iterations per message; history = last 20 messages; temperature 0.2.
- `chat_messages`: RLS select + insert of own rows only; no update/delete policy. `tool_calls jsonb` on assistant rows.
- `POST /api/chat` → `{ reply: string, changed: boolean }`; JSON 401 when signed out; 400/429/503 per spec; the user message and the reply are stored **only after the turn completes**.
- Stage 1 facts: a block needs `start_at` and `end_at`; edited blocks get a new id; writes are sequential, not transactional; Next 16 has `cacheComponents` on and `proxy.ts` instead of middleware (read `node_modules/next/dist/docs` before writing route handlers).
- Non-goals: planning by chat, pings, coach advice, streaming, voice, editing activity colours/categories by chat.

## Review Focus

1. **Times around midnight and the day start:** with a 05:00 day start, "00:30" belongs to the previous day's grid (stored on the next calendar date). Pinned in Tasks 1 and 4.
2. **Future or ill-ordered times:** a start/end in the future, `end ≤ start`, or a past day without `end` must be rejected with `INVALID_TIME`, never written. Pinned in Task 4.
3. **Another user's block id passed to a tool:** returns `NOT_FOUND` (RLS), never edits or deletes. Pinned in Task 5.
4. **Model or tool failure:** bad tool arguments come back to the model as a tool error, not a crash; a model/network error returns 503 and stores nothing. Pinned in Tasks 7 and 8.
5. **DST days:** logging after a spring-forward day boundary produces the right cells. Pinned in Task 4.

---

### Task 1: Dependencies, env docs and time helpers

**Files:**
- Create: `src/lib/chat/time.ts`
- Modify: `package.json` (deps, script `"chat:smoke": "tsx --env-file=.env.local scripts/chat-smoke.ts"`), `.env.example`
- Test: `src/lib/chat/time.test.ts`

**Interfaces:**
- Consumes: `Profile`, `DayRange` (`@/lib/types`); `dayRangeFor`, `shiftDateKey` (`@/lib/time/day`); `cellIndexOf`, `cellStart` (`@/lib/grid/grid`).
- Produces (`time.ts`):
  - `isHHmm(s: string): boolean`
  - `resolveLocalTime(dayKey: string, hhmm: string, profile: Profile): Date | null` (instant of that wall time **within the day grid** of `dayKey`; `null` if malformed, nonexistent (skipped DST hour), or outside the day)
  - `floorToCell(range: DayRange, instant: Date): Date`, `ceilToCell(range: DayRange, instant: Date): Date`
  - `formatLocalTime(instant: Date, tz: string): string` (`HH:mm`, 24-hour, `00:05` not `24:05`)
  - `describeNow(instant: Date, tz: string): string` (e.g. `Wednesday 2026-11-18 16:12`)

- [ ] **Step 1:** Install deps: `npm install @langchain/langgraph@^1 @langchain/core@^1 @langchain/openai@^1 zod@^4` and `npm install -D tsx`; add the `chat:smoke` script; append the three `AZURE_OPENAI_*` names (empty values, comment "server-only") to `.env.example`. Run `npm test` → still all green.
- [ ] **Step 2:** Write failing tests in `time.test.ts` (`profile = {timezone:'UTC', dayStart:'05:00'}` unless stated):
  - `resolveLocalTime('2026-08-16','16:10',p)` → `2026-08-16T16:10:00.000Z`; `'05:00'` → `2026-08-16T05:00:00.000Z`.
  - `resolveLocalTime('2026-08-16','01:30',p)` → `2026-08-17T01:30:00.000Z` and `'04:59'` → `2026-08-17T04:59:00.000Z` (**after midnight belongs to the next calendar date**).
  - Tokyo profile: `('2026-08-16','16:10')` → `2026-08-16T07:10:00.000Z`.
  - `null` for `'abc'`, `'25:00'`, `'4:10'`; NY profile `('2026-03-07','02:30')` → `null` (skipped hour).
  - NY profile fall-back `('2026-10-31','01:30')` → `2026-11-01T05:30:00.000Z` (first occurrence).
  - `floorToCell`/`ceilToCell` on the UTC 2026-08-16 range: `16:12Z` → `16:10Z`/`16:20Z`; exactly `16:10:00Z` → both `16:10Z`; `16:10:30Z` → `16:10Z`/`16:20Z`.
  - `formatLocalTime(2026-08-16T07:10Z,'Asia/Tokyo')` → `'16:10'`; `00:05` UTC → `'00:05'`.
  - `describeNow(2026-11-18T07:12Z,'Asia/Tokyo')` → `'Wednesday 2026-11-18 16:12'`.
- [ ] **Step 3:** Run `npx vitest run src/lib/chat/time` → FAIL (module missing).
- [ ] **Step 4:** Implement `time.ts` with `TZDate` (`@date-fns/tz`) and `Intl.DateTimeFormat` (`hourCycle: 'h23'`). `resolveLocalTime`: try calendar date `dayKey` then `shiftDateKey(dayKey, 1)`, keep a candidate only if it lies in `[range.start, range.end)` **and** formats back to the same `HH:mm` in the tz; prefer the earlier instant.
- [ ] **Step 5:** Run the same command → PASS; `npm test` → green.
- [ ] **Step 6:** Commit `feat(chat): deps, env names and time helpers`.

### Task 2: Activity matching and colour palette

**Files:**
- Create: `src/lib/chat/matchActivity.ts`, `src/lib/chat/palette.ts`
- Test: `src/lib/chat/matchActivity.test.ts`, `src/lib/chat/palette.test.ts`

**Interfaces:**
- Consumes: `Activity`.
- Produces: `MatchResult = { kind: 'match'; activity: Activity } | { kind: 'ambiguous'; names: string[] } | { kind: 'none'; names: string[] }`; `matchActivity(name: string, activities: Activity[]): MatchResult` (archived ignored; `names` = non-archived names); `PALETTE: string[]` (8 hex colours, none equal to the seed colours); `pickColor(used: string[]): string`.

- [ ] **Step 1:** Write failing tests. Matching, with seed-like activities `AI-101`, `CS50`, `IOT commission`, `CS50 Lab`, plus an archived `Old`:
  - `' cs50 '` → match `CS50` (exact beats substring, trimmed, case-insensitive); `'ai 101'` and `'ai101'` → match `AI-101` (normalised: lowercase, letters/digits only); `'iot'` → match `IOT commission`.
  - `'cs'` → `ambiguous` with names `['CS50','CS50 Lab']`; `'gym'` → `none` with all non-archived names; `'old'` → `none` (archived ignored).
  - `pickColor([])` → `PALETTE[0]`; `pickColor([PALETTE[0].toLowerCase()])` → `PALETTE[1]`; all used → a palette colour (no throw).
- [ ] **Step 2:** Run `npx vitest run src/lib/chat/matchActivity src/lib/chat/palette` → FAIL.
- [ ] **Step 3:** Implement both pure modules.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(chat): activity matching and palette`.

### Task 3: chat_messages table, RLS and store

**Files:**
- Create: `supabase/migrations/20261118120000_chat_messages.sql`, `supabase/tests/chat-rls.test.ts`, `src/lib/chat/store.ts`
- Test: `supabase/tests/chat-rls.test.ts`, `src/lib/chat/store.db.test.ts`

**Interfaces:**
- Produces (`store.ts`): `ChatMessage = { id: string; role: 'user' | 'assistant'; content: string; createdAt: Date }`; `loadHistory(sb: SupabaseClient, limit?: number): Promise<ChatMessage[]>` (default 20; oldest→newest of the latest `limit`); `saveTurn(sb: SupabaseClient, userId: string, turn: { user: string; assistant: string; toolCalls: unknown[]; startedAt: Date }): Promise<void>` (user row `created_at = startedAt`, assistant row `created_at = now`); `countUserMessagesSince(sb: SupabaseClient, since: Date): Promise<number>`.
- Consumes: `supabase/tests/helpers.ts` (`createTestUser`, `cleanupTestUsers`).

- [ ] **Step 1:** Write failing tests. `chat-rls.test.ts` (users A, B): A can insert and read own rows; B reading A's rows gets `[]`; B inserting `user_id = A` errors; A cannot update or delete own rows (0 rows affected); `role` outside `('user','assistant')` errors. `store.db.test.ts`: `saveTurn` then `loadHistory` returns the user message before the assistant message; `loadHistory(sb, 2)` returns only the last two of five; `tool_calls` is stored on the assistant row; `countUserMessagesSince` counts only user rows after the given time.
- [ ] **Step 2:** Run `npm run test:db` → FAIL (relation `chat_messages` missing / functions undefined). Expected: only the new tests fail.
- [ ] **Step 3:** Write the migration (table per spec §7.5: `id uuid pk default gen_random_uuid()`, `user_id` FK cascade, `role` check, `content text not null`, `tool_calls jsonb`, `created_at timestamptz not null default now()`, index `(user_id, created_at)`; RLS on; select and insert policies `user_id = auth.uid()` only). Apply it: `set -a; . ./.env.local; npx supabase db push --remote --yes -p "$SUPABASE_DB_PASSWORD"` (Expected: applies `20261118120000`; if TLS fails, apply with `npx supabase db query --remote --yes --file <migration>` and insert the version into `supabase_migrations.schema_migrations`). Implement `store.ts` with the signatures above.
- [ ] **Step 4:** Run `npm run test:db` → PASS.
- [ ] **Step 5:** Commit `feat(chat): chat_messages table, RLS and store`.

### Task 4: Tools — get_day and log_activity

**Files:**
- Create: `src/lib/chat/tools.ts`
- Test: `src/lib/chat/tools.db.test.ts`

**Interfaces:**
- Consumes: Task 1 time helpers; Task 2 `matchActivity`; stage 1 `listBlocks`, `saveBlock`, `listActivities`, `getProfile`, `dayRangeFor`, `dateKeyOf`, `isOnGrid`.
- Produces (`tools.ts`): `ToolContext = { sb: SupabaseClient; userId: string; profile: Profile; now: Date }`; `BlockView = { id: string; activity: string; kind: Kind; start: string; end: string }` (`HH:mm`); `ToolError = { ok: false; error: 'ACTIVITY_NOT_FOUND' | 'ACTIVITY_AMBIGUOUS' | 'GAP' | 'INVALID_TIME' | 'NO_ACTUAL_BLOCK' | 'NOT_FOUND' | 'EXISTS' | 'INVALID_NAME'; [detail: string]: unknown }`; `getDay(ctx: ToolContext, args: { date?: string }): Promise<{ ok: true; date: string; actual: BlockView[]; plan: BlockView[]; activities: { name: string; category: Category; archived: boolean }[] } | ToolError>`; `logActivity(ctx: ToolContext, args: { activity: string; start: string; end?: string; date?: string; gap?: 'skip' }): Promise<{ ok: true; block: BlockView } | ToolError>`.
- Behaviour (spec §7.2–7.3): `date` defaults to today's day key (`dateKeyOf(now, …)`), a future `date` is `INVALID_TIME`; start = `floorToCell(resolveLocalTime(...))`; `end` defaults to `ceilToCell(now)` (at least start + 1 cell) only when `date` is today, otherwise required; reject future start/end, `end ≤ start`, off-grid; `GAP` when an earlier actual block ends before the start and `gap !== 'skip'` (returns `from`/`to` as `HH:mm`); persist with `saveBlock(..., source: 'ai')` and re-read the block to return its id.

- [ ] **Step 1:** Write failing integration tests (test user, profile UTC/05:00, `now = 2026-08-16T16:12:00Z` unless stated; read back with `listBlocks`):
  - `logActivity({activity:'CS50',start:'16:10'})` → `ok`, block `16:10–16:20`, stored `source 'ai'`, `kind 'actual'`.
  - Then `now = 16:42`: `logActivity({activity:'DP-700',start:'16:40'})` → `{ok:false,error:'GAP',from:'16:20',to:'16:40'}` and nothing written; with `gap:'skip'` → ok and the CS50 block unchanged.
  - Day's first block never gets `GAP`.
  - Existing actual DP-700 `16:00–16:40`, `now = 16:55`: `logActivity({activity:'CS50',start:'16:30'})` → CS50 `16:30–17:00`, DP-700 trimmed to `16:00–16:30`.
  - Unknown name → `ACTIVITY_NOT_FOUND` with the activity names; ambiguous name → `ACTIVITY_AMBIGUOUS`.
  - **Rejections** (nothing written): start `16:30` with `now = 16:12`; `end:'17:00'` with `now = 16:12`; `start:'16:10', end:'16:10'`; `date:'2026-08-15'` without `end`; `date` in the future; `start:'4:10'`.
  - Past day with `end`: `date:'2026-08-15', start:'10:00', end:'11:00'` → ok.
  - **Midnight:** `now = 2026-08-17T00:42:00Z`, `logActivity({activity:'CS50',start:'00:30'})` → stored `2026-08-17T00:30Z–00:50Z`; `getDay({})` (day key `2026-08-16`) lists it as `00:30–00:50`.
  - **DST:** profile `America/New_York`/`05:00`, `now = 2026-03-08T07:45:00Z`, `start:'03:30'` → stored `07:30Z–07:50Z`.
  - `getDay` returns actual and plan blocks sorted by start, with activity names, and activities including archived flags.
- [ ] **Step 2:** Run `npm run test:db` → FAIL (module missing).
- [ ] **Step 3:** Implement `getDay` and `logActivity` per the behaviour above in `tools.ts`; the module has no LangChain imports.
- [ ] **Step 4:** Run `npm run test:db` → PASS; `npm test` → green.
- [ ] **Step 5:** Commit `feat(chat): get_day and log_activity tools`.

### Task 5: Tools — set_end, edit_block, delete_block, create_activity

**Files:**
- Modify: `src/lib/chat/tools.ts`, `src/lib/db/blocks.ts` (add `getBlock`; add optional `activityId?: string` as the last parameter of `moveBlock`)
- Test: `src/lib/chat/tools.db.test.ts` (extend), `src/lib/db/blocks.db.test.ts` (extend)

**Interfaces:**
- Produces (`blocks.ts`): `getBlock(sb: SupabaseClient, id: string): Promise<Block | null>` (RLS-hidden → `null`); `moveBlock(sb, userId, profile, id, startAt, endAt, activityId?: string): Promise<void>` (when `activityId` is given the replacement uses it).
- Produces (`tools.ts`): `setEnd(ctx: ToolContext, args: { end?: string; blockId?: string }): Promise<{ ok: true; block: BlockView; unchanged?: true } | ToolError>`; `editBlock(ctx: ToolContext, args: { blockId: string; start?: string; end?: string; activity?: string }): Promise<{ ok: true; block: BlockView } | ToolError>`; `removeBlock(ctx: ToolContext, args: { blockId: string }): Promise<{ ok: true; deleted: BlockView } | ToolError>`; `createActivityTool(ctx: ToolContext, args: { name: string; category?: Category }): Promise<{ ok: true; activity: { name: string; category: Category } } | ToolError>`.
- Behaviour: `setEnd` targets `blockId` or the latest actual block of today (`NO_ACTUAL_BLOCK` if none), `end` defaults to `ceilToCell(now)`, rejects `end ≤ block start` or future `end` (`INVALID_TIME`), unchanged end → `{ok:true, unchanged:true}`, otherwise `moveBlock`; edited blocks get new ids and the result carries the current one. `editBlock` resolves times on the block's own day, validates with `isOnGrid`, activity via `matchActivity`. `createActivityTool` validates with `isValidActivityName`, rejects a normalised duplicate (`EXISTS`), colour from `pickColor` over all existing colours, default category `other`.

- [ ] **Step 1:** Write failing tests. Blocks: `getBlock` returns the block, `null` for a random uuid; `moveBlock` with `activityId` changes the activity and keeps the cross-boundary leftovers behaviour. Tools (same fixtures as Task 4):
  - CS50 `16:10–16:20`, `now = 16:42`: `setEnd({})` → end `16:50`, one actual block remains, id differs from before; `setEnd({end:'16:40'})` → `16:40`; same end again → `unchanged`.
  - `setEnd` rejects `end:'16:10'` (= start) and `end:'17:30'` (future); with no actual blocks → `NO_ACTUAL_BLOCK`; extending over a following actual block trims it.
  - `editBlock` changes activity and times in one call; unknown `blockId` uuid → `NOT_FOUND`.
  - `removeBlock` deletes and returns the deleted view; unknown id → `NOT_FOUND`.
  - **Foreign ids:** user B's context passing user A's block id to `setEnd`, `editBlock` and `removeBlock` → `NOT_FOUND`, and A's block is untouched.
  - `createActivityTool({name:'Gym'})` → category `other`, a palette colour not used by any existing activity; `'gym'` again → `EXISTS`; `'   '` → `INVALID_NAME`; `category:'exercise'` is stored.
- [ ] **Step 2:** Run `npm run test:db` → FAIL (new functions missing).
- [ ] **Step 3:** Implement `getBlock`, the `moveBlock` parameter and the four tools.
- [ ] **Step 4:** Run `npm run test:db` → PASS; `npm test` → green.
- [ ] **Step 5:** Commit `feat(chat): set_end, edit_block, delete_block, create_activity tools`.

### Task 6: Day context and system prompt

**Files:**
- Create: `src/lib/chat/context.ts`
- Test: `src/lib/chat/context.test.ts`, `src/lib/chat/context.db.test.ts`

**Interfaces:**
- Consumes: `getDay`, `ToolContext`, `BlockView`, `describeNow`.
- Produces: `DayContext = { now: Date; profile: Profile; dayKey: string; actual: BlockView[]; plan: BlockView[]; activities: { name: string; category: Category }[] }` (non-archived activities); `loadDayContext(ctx: ToolContext): Promise<DayContext>`; `buildSystemPrompt(c: DayContext): string`.

- [ ] **Step 1:** Write failing tests. `context.test.ts` (pure): the prompt contains `describeNow` output, the timezone, the day key, every actual block as id plus `start–end` plus activity name, plan blocks marked read-only/plan, the line `Last actual block ends at 16:20` (or an explicit "no actual blocks yet"), each activity name with its category, and mentions of the tool names `log_activity`, `set_end`, `edit_block`, `delete_block`, `create_activity`, `get_day`; it does **not** contain any id from a `DayContext` it was not given. `context.db.test.ts`: `loadDayContext` for a user with one actual and one plan block returns both, and excludes archived activities.
- [ ] **Step 2:** Run `npx vitest run src/lib/chat/context` and `npm run test:db` → FAIL.
- [ ] **Step 3:** Implement. The prompt text must state (builder words it): act on clear requests with one tool call then a one-line confirmation repeating the logged times; ask one short question for missing activity/start/gap; ask what happened in a gap before logging and use `gap: "skip"` only when the user says to skip; never delete or rewrite unless asked; confirm before `create_activity`; ask when unsure whether the user is extending or switching; never invent entries; keep replies short.
- [ ] **Step 4:** Run both → PASS.
- [ ] **Step 5:** Commit `feat(chat): day context and system prompt`.

### Task 7: Model config and LangGraph agent

**Files:**
- Create: `src/lib/chat/model.ts`, `src/lib/chat/graph.ts`, `src/lib/chat/testing.ts`
- Test: `src/lib/chat/model.test.ts`, `src/lib/chat/graph.db.test.ts`

**Interfaces:**
- Produces (`model.ts`): `class ChatConfigError extends Error`; `createChatModel(env?: Record<string, string | undefined>): BaseChatModel` (reads `process.env` by default; builds `ChatOpenAI` with `model` = deployment, `apiKey`, `configuration: { baseURL: endpoint, defaultHeaders: { 'api-key': key } }`, `temperature: 0.2`, `maxRetries: 1`, `timeout: 30000`; throws `ChatConfigError` naming the missing variable, never the key).
- Produces (`testing.ts`): `scriptedModel(steps: AIMessage[]): BaseChatModel` (test double: `bindTools` returns itself; each model call returns the next scripted message; throws if exhausted).
- Produces (`graph.ts`): `MAX_TOOL_ITERATIONS = 6`; `ToolCallRecord = { name: string; args: unknown; result: unknown }`; `buildTools(ctx: ToolContext, record: ToolCallRecord[]): StructuredToolInterface[]` (six tools named `get_day`, `log_activity`, `set_end`, `edit_block`, `delete_block`, `create_activity`, zod schemas matching Tasks 4–5 args with snake_case `block_id`; each wrapper runs the tool, pushes a record, returns the result as a JSON string; invalid args or a thrown error come back as `{"ok":false,"error":"TOOL_FAILED","message":…}`); `runChatTurn(input: { model: BaseChatModel; ctx: ToolContext; history: { role: 'user' | 'assistant'; content: string }[]; message: string }): Promise<{ reply: string; changed: boolean; toolCalls: ToolCallRecord[] }>`.
- Graph: `StateGraph(MessagesAnnotation)` with an `agent` node (system prompt from `loadDayContext` + `buildSystemPrompt`, then history, then the message) and a `ToolNode`; conditional edge to tools while the last AI message has tool calls; `recursionLimit = 2 * MAX_TOOL_ITERATIONS + 1`; on `GraphRecursionError` return a fixed reply saying it got stuck and asking the user to rephrase. `changed` is true if any write tool (`log_activity`, `set_end`, `edit_block`, `delete_block`, `create_activity`) returned `ok: true`. Verify import paths (`@langchain/langgraph`, `@langchain/langgraph/prebuilt`) against the installed packages.

- [ ] **Step 1:** Write failing tests. `model.test.ts`: with all three vars set returns an object with `bindTools`; each missing var throws `ChatConfigError` whose message names that var and does **not** contain the key value used in the test. `graph.db.test.ts` (real DB tools, scripted model): a script `[tool call log_activity(CS50, 16:10), final message "Logged CS50 16:10-16:20"]` → `reply` is the final text, `changed` true, one `toolCalls` record, one `ai` actual block in the DB; a read-only script (`get_day` then reply) → `changed` false; an unknown-activity tool result is fed back and the scripted model's next reply is returned; a tool call with invalid args (`log_activity` without `start`) yields a `TOOL_FAILED` tool message, no crash and no write; a model that always returns a tool call → reply contains "stuck" and `toolCalls.length <= MAX_TOOL_ITERATIONS`.
- [ ] **Step 2:** Run `npx vitest run src/lib/chat/model` and `npm run test:db` → FAIL.
- [ ] **Step 3:** Implement `model.ts`, `testing.ts`, `graph.ts`.
- [ ] **Step 4:** Run both → PASS; `npx tsc --noEmit` → clean.
- [ ] **Step 5:** Commit `feat(chat): azure model config and langgraph agent`.

### Task 8: Chat service and API route

**Files:**
- Create: `src/lib/chat/service.ts`, `src/app/api/chat/route.ts`
- Modify: `src/lib/auth/routes.ts` (add `isApiPath(pathname: string): boolean`), `src/proxy.ts` (signed-out `/api/*` → JSON 401 instead of the login redirect)
- Test: `src/lib/chat/service.db.test.ts`, `src/lib/auth/routes.test.ts` (extend)

**Interfaces:**
- Produces (`service.ts`): `MAX_MESSAGE_LENGTH = 1000`, `RATE_LIMIT_PER_HOUR = 30`, `HISTORY_LIMIT = 20`; `class ChatError extends Error { status: 400 | 429 | 503 }`; `sendMessage(deps: { sb: SupabaseClient; userId: string; model: BaseChatModel; now?: Date }, message: string): Promise<{ reply: string; changed: boolean }>`; `getHistory(sb: SupabaseClient): Promise<ChatMessage[]>`.
- Behaviour: trim; empty or > 1000 chars → `ChatError(400)`; `countUserMessagesSince(now − 1h) ≥ 30` → `ChatError(429)`; load history and profile; `runChatTurn`; any thrown model/network error → `ChatError(503)` with nothing stored; success → `saveTurn` with the tool-call records.
- Route: `POST /api/chat` (`{ message }` → `{ reply, changed }`) and `GET /api/chat` (`{ messages: [{ id, role, content, createdAt }] }`), `export const runtime = 'nodejs'`; `getUser()` null → 401 `{ error: 'unauthorized' }`; invalid body → 400; `ChatConfigError` → 503 with a generic message (never the env var values); `ChatError` → its status with a friendly message. Follow the Next 16 route-handler docs for caching/dynamic behaviour with `cacheComponents`.

- [ ] **Step 1:** Write failing tests. `service.db.test.ts` (scripted model, real DB): a successful turn stores a user row and an assistant row (with `tool_calls`), returns `{reply, changed:true}` and creates the `ai` block; a model that throws → `ChatError` status 503 and **zero** new `chat_messages` rows; message of 1001 chars → 400 and empty/whitespace → 400; with 30 user rows already inserted in the last hour → 429, and a 31st row older than an hour does not count; history passed to the model is capped at 20 messages. `routes.test.ts`: `isApiPath('/api/chat')` true, `'/day/2026-08-16'` and `'/apiary'` false.
- [ ] **Step 2:** Run `npm run test:db` and `npx vitest run src/lib/auth` → FAIL.
- [ ] **Step 3:** Implement `service.ts`, `isApiPath`, the proxy change and `route.ts`.
- [ ] **Step 4:** Run both suites → PASS; `npx tsc --noEmit` and `npm run build` → succeed (if bundling `@langchain/*` fails, add the packages to `serverExternalPackages` in `next.config.ts`).
- [ ] **Step 5:** Manual: start the dev server; `curl -i -X POST localhost:3000/api/chat -d '{"message":"hi"}'` signed out → `401` JSON body `{"error":"unauthorized"}`.
- [ ] **Step 6:** Commit `feat(chat): chat service and api route`.

### Task 9: Chat sheet UI

**Files:**
- Create: `src/components/chat/ChatSheet.tsx`, `src/components/chat/ChatLauncher.tsx`
- Modify: `src/app/day/[date]/page.tsx` (render `<ChatLauncher />` beside the header)
- Test: `src/components/chat/ChatSheet.test.tsx`

**Interfaces:**
- Produces: `ChatMessageView = { id: string; role: 'user' | 'assistant'; content: string; createdAt: string }`; `ChatSheet` props `{ open: boolean; onClose(): void; onChanged(): void; send(message: string): Promise<{ reply: string; changed: boolean }>; loadHistory(): Promise<ChatMessageView[]> }`; `ChatLauncher` (no props; client component owning `open`, `fetch('/api/chat')` wrappers for `send`/`loadHistory`, and `router.refresh()` as `onChanged`).
- Behaviour: opening loads history; when there is no message in the last two hours show the static assistant line `What are you doing now, and when did you start?` above the history; send disabled for empty input and while pending; Enter submits; pending shows `Thinking…` and the user's bubble appears immediately; a reply appends an assistant bubble and calls `onChanged` only when `changed` is true; a failure shows a `role="alert"` message, keeps the typed text and offers retry; Escape closes; bottom sheet on phones, side panel from `md:` up.

- [ ] **Step 1:** Write failing tests with `send`/`loadHistory` as `vi.fn`: opening line shown for empty history and for history older than two hours but not for a recent message; history rendered in order; send disabled when empty and while pending; typing + Enter calls `send` with the text and shows `Thinking…`; a `changed: true` reply calls `onChanged`, `changed: false` does not; a rejected `send` shows an alert, restores the input text and a Retry button calls `send` again; Escape calls `onClose`.
- [ ] **Step 2:** Run `npx vitest run src/components/chat` → FAIL.
- [ ] **Step 3:** Implement `ChatSheet` and `ChatLauncher` (floating `Chat` button bottom-right), wire it into the day page.
- [ ] **Step 4:** Run tests → PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5:** Manual (built-in browser, 375×812 and wide): sign in with an admin-generated magic link for a throwaway user; send "I started CS50 at <a few minutes ago>" → block appears, reply repeats the times; wait, send "still on it" → block extends; send a start that leaves a gap → the helper asks about the gap; answer "skip" → logged; send "delete the last one" → removed; confirm no console errors. Delete the throwaway user afterwards (check 0 test users remain).
- [ ] **Step 6:** Commit `feat(chat): chat sheet UI`.

### Task 10: Smoke script, README and final checks

**Files:**
- Create: `scripts/chat-smoke.ts`
- Modify: `README.md`, `.env.example` (already has the names from Task 1)

- [ ] **Step 1:** Write `scripts/chat-smoke.ts`: creates a throwaway user through the admin client, runs four scripted messages through `sendMessage` with the real `createChatModel()` (log a block, extend it, create a gap, switch activity), prints each reply and the resulting blocks, then deletes the user in a `finally`. It never prints environment values.
- [ ] **Step 2:** Run `npm run chat:smoke` → four replies printed, the blocks list matches what was said, the gap question appears, exit code 0, no key in the output.
- [ ] **Step 3:** README: add a "Chat helper" section (env vars with where to get them, `npm run chat:smoke`, cost guards, "rotate the key by editing `.env.local`"); note that `.env*` stays git-ignored.
- [ ] **Step 4:** Run `npm test && npm run test:db && npx tsc --noEmit && npx eslint src && npm run build` → all pass. Run `git grep -nI "AZURE_OPENAI_API_KEY=" $(git rev-list --all)` and confirm no non-empty value is committed.
- [ ] **Step 5:** Commit `feat(chat): smoke script and docs`.
