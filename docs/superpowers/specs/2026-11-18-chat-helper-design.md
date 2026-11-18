# Chat Helper (Stage 2) — Design

Date: 2026-11-18
Status: Draft, awaiting approval
Builds on: `2026-11-18-planner-core-design.md` (stage 1, shipped)

## 1. Intent and the why

The owner wants logging a day to cost almost nothing. Stage 1 made painting blocks
cheap; stage 2 removes painting for the common case: a chat helper asks "what are you
doing now, and when did you start?", then writes the entry itself through tool calls.

It is the second of four stages (planner core → **chat helper** → pings → coach). Stage 3
will let the helper message first; stage 4 adds research-based guidance. Stage 2 must leave
the data and conversation history in a shape those stages can use.

## 2. Goals

- A chat sheet on the day page: say what you're doing, and the grid updates.
- Log **actual** blocks from natural messages ("started CS50 at 4:10", "was on DP-700
  from 2 to 3").
- A block you're still in **stretches**: each check-in extends it; "done" ends it.
- Ask about every **gap** between your last logged block and a new start, every time.
- Fix mistakes by chat: change times or activity, delete a block (only when asked).
- Add a new activity by chat after confirming with the user.
- Keep chat history per user for stages 3-4.

## 3. Non-goals (stage 2)

- Planning by chat (the **plan** layer stays hand-painted; tools are built with a `kind`
  so it can be added later).
- Pings / helper-initiated messages, push notifications, scheduling (stage 3).
- Coaching advice, sleep/caffeine/exercise guidance (stage 4).
- Voice input, streaming token output, multiple languages, editing activity colours or
  categories by chat, week/month insights.

## 4. Anti-goals

- The helper talks more than it acts, or needs several messages for a simple log.
- It invents entries the user did not say, or writes times without saying them back.
- It deletes or rewrites data nobody asked it to change.
- The Azure key ever reaches the browser, a log line, or git.
- Unbounded model cost (runaway tool loops, unlimited messages).

## 5. Constraints

- Approach chosen by the owner: **LangGraph.js inside the Next app** (a route handler).
  No separate Python service in this stage.
- Model: Azure OpenAI deployment `gpt-4.1-mini` through the OpenAI-compatible v1
  endpoint; confirmed to return tool calls. Config comes from env vars
  `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`
  (server-side only, never `NEXT_PUBLIC_`). Values live in the git-ignored `.env.local`;
  `.env.example` lists names with empty values.
- Tools write through the signed-in user's Supabase session so Row Level Security applies;
  no service-role key in the chat path.
- Reuse stage 1 logic (`saveBlock`, `moveBlock`, `deleteBlock`, `listBlocks`,
  `listActivities`, `createActivity`, grid and day helpers). No second implementation of
  painting, day boundaries or DST handling.
- Stage 1 facts that bind this stage: a block needs `start_at` and `end_at`; cells are
  10 minutes from the day start; painting replaces same-kind overlap; edited blocks get a
  new id; writes are not transactional.

## 6. Approaches considered

| | Approach | Trade-offs |
|---|---|---|
| **A (chosen)** | LangGraph.js agent in a Next route handler | One deploy; reuses the TypeScript block logic and RLS; LangGraph.js is less mature than Python's. |
| B | Python (FastAPI/Django) LangGraph service | Richer agent ecosystem, but a second app and a second copy of block logic that can drift. |
| C | Plain Azure tool loop, no LangGraph | Smallest now, but stages 3-4 want LangGraph state handling, so likely redone. |

Python vs JS can be revisited at stage 4 if the coach needs it.

## 7. Design

### 7.1 How a block "stretches" (owner's choice: no schema change to `blocks`)

There is no open-ended block. Logging "CS50 since 4:10" at 4:12 writes
`actual CS50 4:10-4:20` (start floored, end = now rounded **up** to the next cell, at
least one cell). A later check-in ("still on it") or "done" moves the end via `set_end`.
If the user never checks in, the block simply ends at the last known time.
"Running" is not stored: the helper treats the most recent actual block of the day as
the current one and decides from the user's words whether they are extending it,
ending it, or starting something else.

### 7.2 Gap rule (owner's choice: ask every time)

Before creating a block that starts later than the end of the previous actual block on
the same day, the helper must ask "what were you doing 3:30-4:10?". Enforced in the tool,
not only the prompt: `log_activity` refuses with `GAP` (and the range) unless the call
carries `gap: "skip"`; the helper then asks the user and either logs the gap activity
(a second `log_activity` call) or retries with `gap: "skip"` when the user says nothing /
skip. The first actual block of a day has no previous block and is never asked about.
New start earlier than the previous block's end: the previous block is trimmed to the new
start (existing same-kind overlap rule).

### 7.3 Tools (all `kind = 'actual'`, `source = 'ai'`)

Times from the model are `HH:mm` 24-hour in the user's timezone plus an optional day key;
the server converts using the profile timezone/day start, floors starts and ceils ends to
cells, and validates with `isOnGrid`. Tool results are structured JSON, never prose.

- `get_day({ date? })` → today's (or given day's) actual and plan blocks and activities,
  each block with id, activity name, start, end.
- `log_activity({ activity, start, end?, date?, gap? })` → create an actual block.
  `end` defaults to now rounded up (only when `date` is today). Activity is matched by
  name (exact, then unique case-insensitive substring); otherwise returns
  `ACTIVITY_NOT_FOUND` with the known names. May return `GAP`, `INVALID_TIME`
  (future end, off-day, end ≤ start).
- `set_end({ end?, block_id? })` → set the end of the latest actual block of today (or
  `block_id`), extending or finishing it. `end` defaults to now rounded up. Overlapped
  same-kind blocks are trimmed.
- `edit_block({ block_id, start?, end?, activity? })`, `delete_block({ block_id })`
  → only when the user asked for the change. Edited blocks get new ids; results return the
  current id.
- `create_activity({ name, category? })` → only after the user agreed in chat; colour is
  chosen automatically from an unused palette colour; `category` defaults to `other`.

Ids are never cached across messages: the system context lists today's blocks with their
current ids on every message.

### 7.4 Conversation

- **Context per message** (system prompt): current local date/time with weekday, timezone,
  day key and day start, today's actual blocks (with ids) and plan blocks (read-only),
  the end of the last actual block, and the activity names with categories.
- **History**: the last 20 text messages (user/assistant) are replayed.
- **Behaviour rules in the prompt**: act on clear requests with one tool call and a
  one-line confirmation that repeats the logged times ("Logged CS50 4:10-4:20"); ask one
  short question when something is missing or ambiguous (activity, start time, gap);
  never delete or rewrite unless asked; if unsure whether the user is extending or
  switching, ask; keep replies short. Temperature low (0.2).
- **First message**: when the sheet opens with no messages from the last two hours, the
  helper's opening line is "What are you doing now, and when did you start?" (a static
  client-side line, not a model call).

### 7.5 Persistence (migration)

New table `chat_messages(id uuid pk, user_id uuid → auth.users on delete cascade,
role text check in ('user','assistant'), content text not null, tool_calls jsonb null,
created_at timestamptz default now())` with an index on `(user_id, created_at)`.
RLS: select and insert only where `user_id = auth.uid()`; no update/delete policies.
`tool_calls` on assistant rows records the tool names, arguments and a result summary
(debugging and later coaching). Applied like the stage 1 migration.

### 7.6 API and graph

- `POST /api/chat` `{ message: string }` → `{ reply: string, changed: boolean }`.
  Node runtime. Requires a signed-in user (JSON 401, not the login redirect). Message
  length ≤ 1000 chars. Rate limit: 30 user messages per rolling hour per user (429),
  counted from `chat_messages`. Model/network failure → 503 with a friendly message and
  nothing half-saved: the user message is stored only once the turn completes.
- `GET /api/chat` → the last 20 messages for the sheet.
- The LangGraph agent is a tool-calling loop (model node ↔ tools node) with at most 6
  tool iterations per message; hitting the cap replies that it got stuck and asks the
  user to rephrase. `changed` is true if any write tool succeeded.
- A server-side module wraps config, model creation and the graph; tools are plain
  functions over `(supabase client, profile)` so they are testable without the model.

### 7.7 UI

A "Chat" button on the day page opens a bottom sheet (full-height on phones, side panel
on wide screens): message list, text input, send button, a "thinking…" indicator, inline
error text with retry. After a reply with `changed: true` the page refreshes so the grid
and totals update. The sheet stays usable while the grid is visible above it on wide
screens. Styling follows shadcn/Tailwind conventions already in the app.

### 7.8 Quality

- Tool functions: integration tests against the Supabase test project (as in stage 1):
  logging creates an `ai` actual block; gap refusal and `gap: "skip"`; first block of day;
  switching trims the previous block; `set_end` extends and finishes; activity matching
  (exact, substring, ambiguous, unknown); future end rejected; DST day and :30 offset
  zones; cross-user ids rejected by RLS.
- Graph wiring: tests with a scripted fake chat model (tool-call → tool result → reply)
  covering the iteration cap and `changed`.
- Route: auth (401), validation, rate limit (429), failure (503) with the model faked.
- UI: component tests for the sheet states (empty, sending, error, refresh on change).
- A manual smoke script (`npm run chat:smoke`, not part of CI) runs a few scripted
  messages against the real deployment.
- Chat tests never print or require the key; the key is read only from env.

## 8. Decisions

By the owner: stage order; LangGraph.js in Next (A); Azure `gpt-4.1-mini`; blocks stretch
(no schema change to `blocks`); gap is asked every time; credentials supplied, to be
rotated by the owner.

By the designer (proposals): actual-only logging in this stage; bottom sheet on the day
page; switching handled by trimming plus the gap rule; stored chat history in one new
table; deterministic gap enforcement inside the tool; `HH:mm` tool time inputs; floor
start / ceil end rounding; no gap question for the day's first block; 30 messages/hour and
6 tool iterations as cost guards; non-streaming replies; opening line is static.

## 9. Left to the builder

Exact system-prompt wording; file layout under `src/lib/chat/` and `src/app/api/chat/`;
LangGraph/LangChain package versions and the minimal compatible model client setup for the
Azure v1 endpoint; sheet visuals and copy; palette for auto-chosen activity colours;
whether to add streaming later; error copy; accessibility details.

## 10. Builder check (done by reading as the builder)

- *What does "now" mean?* Answered: server time, formatted in the profile timezone; the
  Mac clock was fixed on 2026-11-18, so dev "today" is correct.
- *How is the current block identified without a "running" flag?* Answered in 7.1: the
  latest actual block of the day.
- *What if "now" ends past the day boundary or the start is on a different day?* Settled:
  the `date` argument is the day key; blocks are split at boundaries by `saveBlock`;
  future end is rejected.
- *Where do the blocks' `ai` source and ids matter?* Settled: `source = 'ai'`; ids are
  re-read each message.
- *Which Azure auth header?* Builder's call; the v1 endpoint accepts the OpenAI client with
  the key (verified with the `api-key` header).
- *Is the gap rule only for the same day?* Settled: yes, the previous actual block on
  the same day grid.
- Nothing remains that only the owner can answer.
