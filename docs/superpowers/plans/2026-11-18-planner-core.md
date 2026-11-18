# Planner Core (Stage 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A phone-first, multi-user web app where a user paints plan and actual time blocks on a 10-minute grid, flips between days, and sees per-activity planned-vs-actual totals.

**Architecture:** Next.js App Router app. All time, grid, overlap and totals logic is pure TypeScript in `src/lib` (unit-tested). Supabase provides Auth, Postgres and Row Level Security; server actions call pure logic, then persist. A day is derived from the user's timezone and day-start, never stored.

**Tech Stack:** Next.js (App Router) + React + TypeScript, Tailwind, shadcn/ui, Supabase (`@supabase/ssr`, `@supabase/supabase-js`, local CLI + Docker), `date-fns` v4 + `@date-fns/tz`, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-18-planner-core-design.md`

## Global Constraints

- Grid: 10-minute cells, 6 per row, one row per hour, 24 rows on a normal day (rows labeled by local hour; header `01 … 59`).
- Day = user's day-start (default `05:00`) to the same time next calendar day, in the user's timezone. Derived, not stored.
- Block `kind` is `plan` or `actual`; painting affects only blocks of the same kind. Blocks never cross the day boundary (split at write time).
- Block rules: `end_at > start_at`; start/end are 10-minute multiples measured from the day start (validated in the app, **no** DB epoch check: it would break `:45`-offset timezones).
- `activities.category` is one of `study | sleep | exercise | meal | caffeine | other`.
- RLS on `profiles`, `activities`, `blocks`: rows are visible/writable only for `auth.uid()`.
- Seed activities (all `study`; colors approximated from the owner's Canva chart): AI-101 `#7CB342`, DP-700 `#56BADB`, CS50 `#A6A6A6`, QR SaaS `#FADF6F`, Capstone `#5C6BF5`→`#E86DBF` (gradient), IOT commission `#EF4637`.
- Stack is fixed: no MongoDB, no Express. Nothing from stages 2–4 (AI, LangGraph, push, coach) and no week/month charts, offline mode, sharing or billing.
- Phone-first layout; installable via web app manifest (no service-worker push).

## Review Focus

1. **DST days (23h and 25h):** grid cell count, row count and totals stay correct. Pinned in Tasks 2, 3.
2. **Drag backward, or start and end in the same cell:** produces a valid block (a single cell = 10 minutes). Pinned in Task 3.
3. **Block referencing another user's activity:** rejected by the database, not just the UI. Pinned in Task 6.
4. **Blocks whose activity is archived, and an empty day:** still render in their color, and the page shows an empty state instead of breaking. Pinned in Task 9.
5. **Drag released outside the grid, and touch scrolling vs painting on phones:** end cell clamps to the nearest cell; with no activity selected the grid scrolls normally. Pinned in Tasks 3, 9.

---

### Task 1: Project scaffold and tooling

**Files:**
- Create: Next.js project at the repo root (`/Users/markdanielcallejas/Desktop/Main/Projects/planner`), `vitest.config.ts`, `vitest.setup.ts`, `src/lib/smoke.test.ts`, `supabase/` (via CLI)

**Interfaces:**
- Produces: path alias `@/` → `src/`; scripts `test` (unit), `test:db` (integration, Task 6), `dev`, `build`.

- [ ] **Step 1:** Run `git init`, then scaffold Next.js (TypeScript, Tailwind, App Router, `src/` dir, `@/*` alias) into the existing folder keeping `docs/`; `npx shadcn@latest init`; install `date-fns @date-fns/tz @supabase/supabase-js @supabase/ssr`; dev-install `vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/user-event`; `npx supabase init`.
- [ ] **Step 2:** Configure Vitest (jsdom, `@/` alias, `vitest.setup.ts` importing nothing yet) and a `src/lib/smoke.test.ts` with `test('runs', () => expect(1 + 1).toBe(2))`.
- [ ] **Step 3:** Run `npm test` → 1 passed; `npm run build` → succeeds.
- [ ] **Step 4:** Commit `chore: scaffold next, tailwind, shadcn, vitest, supabase`.

### Task 2: Types and day logic

**Files:**
- Create: `src/lib/types.ts`, `src/lib/time/day.ts`
- Test: `src/lib/time/day.test.ts`

**Interfaces:**
- Produces (`types.ts`): `Kind = 'plan'|'actual'`; `Category` (six values above); `Activity {id; name; color; colorTo: string|null; category: Category; archivedAt: Date|null}`; `Block {id; activityId; kind: Kind; startAt: Date; endAt: Date; source: 'manual'|'ai'}`; `NewBlock = Omit<Block,'id'>`; `DayRange {start: Date; end: Date}`; `Profile {timezone: string; dayStart: string /* 'HH:mm' */}`.
- Produces (`day.ts`): `dayRangeFor(dateKey: string, tz: string, dayStart: string): DayRange`; `dateKeyOf(instant: Date, tz: string, dayStart: string): string` (`YYYY-MM-DD`); `shiftDateKey(key: string, days: number): string`.

- [ ] **Step 1:** Write failing tests (use `toISOString()` and `(end-start)/3.6e6`):
  - `dayRangeFor('2026-08-16','UTC','05:00')` → start `2026-08-16T05:00:00.000Z`, end `2026-08-17T05:00:00.000Z`.
  - `dayRangeFor('2026-08-16','UTC','06:30').start` → `2026-08-16T06:30:00.000Z`.
  - `dayRangeFor('2026-03-07','America/New_York','05:00')` is 23 hours; `('2026-10-31', same tz)` is 25 hours.
  - `dateKeyOf(new Date('2026-08-17T01:00:00Z'),'UTC','05:00')` → `'2026-08-16'`; at `'2026-08-17T05:00:00Z'` → `'2026-08-17'`.
  - `shiftDateKey('2026-08-31', 1)` → `'2026-09-01'`; `-1` from `'2026-03-01'` → `'2026-02-28'`.
- [ ] **Step 2:** Run `npx vitest run src/lib/time` → FAIL (module missing).
- [ ] **Step 3:** Implement with `TZDate` from `@date-fns/tz`; build start/end as local wall-clock times in `tz` so DST days come out 23/25h; `dateKeyOf` subtracts one calendar day when local time-of-day < `dayStart`.
- [ ] **Step 4:** Run the same command → PASS.
- [ ] **Step 5:** Commit `feat: day range logic with DST support`.

### Task 3: Grid mapping

**Files:**
- Create: `src/lib/grid/grid.ts`
- Test: `src/lib/grid/grid.test.ts`

**Interfaces:**
- Consumes: `DayRange`.
- Produces: `CELL_MINUTES = 10`; `CELLS_PER_ROW = 6`; `cellCount(range): number`; `cellStart(range, i: number): Date`; `rangeFromCells(range, a: number, b: number): {start: Date; end: Date}` (order-insensitive, both cells inclusive); `cellFromPoint(rect: {left;top;width;height}, x: number, y: number, count: number): number` (clamped to `0..count-1`); `isOnGrid(range, start: Date, end: Date): boolean`; `rowLabel(range, row: number, tz: string): string` (local 12-hour number, e.g. `"5"`, `"12"`, `"1"`).

- [ ] **Step 1:** Write failing tests:
  - `cellCount` is 144 for a UTC day, 138 for the NY 2026-03-07 day, 150 for the NY 2026-10-31 day.
  - `rangeFromCells(r, 5, 2)` equals `rangeFromCells(r, 2, 5)`, with start `cellStart(r,2)` and end `cellStart(r,6)`; `rangeFromCells(r, 3, 3)` spans exactly 10 minutes.
  - `cellFromPoint({left:0,top:0,width:600,height:2400}, 150, 250, 144)` → `13`; `(-50,-50,144)` → `0`; `(9999,9999,144)` → `143`.
  - `isOnGrid`: true for `[cellStart(r,0), cellStart(r,3)]`; false when end ≤ start, when start is 5 minutes off a cell, and when end is past `range.end`.
  - `rowLabel(UTC range with dayStart 05:00, 0, 'UTC')` → `"5"`; row 7 → `"12"`; row 8 → `"1"`.
- [ ] **Step 2:** Run `npx vitest run src/lib/grid` → FAIL.
- [ ] **Step 3:** Implement. Cells are fixed 10-minute slots counted from `range.start` (so cell count follows the range length); rows = `ceil(count / 6)`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: grid cell mapping and hit testing`.

### Task 4: Paint (overlap replacement)

**Files:**
- Create: `src/lib/blocks/paint.ts`
- Test: `src/lib/blocks/paint.test.ts`

**Interfaces:**
- Consumes: `Block`, `NewBlock`.
- Produces: `PaintResult = {deleteIds: string[]; updates: Block[]; inserts: NewBlock[]}`; `paintBlocks(existing: Block[], paint: NewBlock): PaintResult`. The painted block itself is always in `inserts`.

- [ ] **Step 1:** Write failing tests (blocks with minute offsets from a fixed base time):
  - Empty `existing` → `inserts = [paint]`, nothing else.
  - Paint overlapping the tail of a same-kind block → that block in `updates` with `endAt = paint.startAt`.
  - Paint overlapping the head → block's `startAt = paint.endAt`.
  - Paint strictly inside a same-kind block → original updated to end at `paint.startAt`; `inserts` has two entries: the remainder `[paint.endAt, oldEnd)` with the original's activity, plus the paint.
  - Paint fully covering a block → its id in `deleteIds`.
  - Different `kind` untouched; blocks that only touch (`end == paint.start`) untouched.
- [ ] **Step 2:** Run `npx vitest run src/lib/blocks/paint` → FAIL.
- [ ] **Step 3:** Implement as a pure function; no merging of adjacent same-activity blocks.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: same-kind overlap replacement for painted blocks`.

### Task 5: Day-boundary split and totals

**Files:**
- Create: `src/lib/blocks/boundary.ts`, `src/lib/blocks/totals.ts`
- Test: `src/lib/blocks/boundary.test.ts`, `src/lib/blocks/totals.test.ts`

**Interfaces:**
- Consumes: `NewBlock`, `Block`, `DayRange`, `dayRangeFor`, `dateKeyOf`.
- Produces: `splitAtDayBoundaries(block: NewBlock, tz: string, dayStart: string): NewBlock[]`; `Totals = Record<string, {plannedMin: number; actualMin: number; diffMin: number}>`; `computeTotals(blocks: Block[], range: DayRange): Totals` (`diffMin = actualMin - plannedMin`; blocks clipped to the range).

- [ ] **Step 1:** Write failing tests:
  - UTC, dayStart 05:00: block 04:50–05:20 → two blocks, `04:50–05:00` and `05:00–05:20`; block 09:00–10:00 → one block unchanged.
  - Block spanning two boundaries (06:00 day 1 → 06:00 day 3) → three pieces.
  - Totals: plan 120 min + actual 80 min for one activity → `{plannedMin:120, actualMin:80, diffMin:-40}`; a block partly outside the range counts only the inside part; activity with only actual blocks has `plannedMin: 0`.
  - Totals on the NY 25-hour day sum a full-day block to 1500 minutes.
- [ ] **Step 2:** Run `npx vitest run src/lib/blocks` → FAIL for the new files.
- [ ] **Step 3:** Implement both as pure functions; split by walking successive `dayRangeFor` ends.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: boundary splitting and per-activity totals`.

### Task 6: Database schema, RLS, seed trigger

**Files:**
- Create: `supabase/migrations/20261118000000_init.sql`, `supabase/tests/rls.test.ts`, `vitest.db.config.ts`
- Modify: `package.json` (`"test:db": "vitest run --config vitest.db.config.ts"`)

**Interfaces:**
- Produces tables per spec §7.2: `profiles(id → auth.users, timezone, day_start time default '05:00')`; `activities(id, user_id, name, color, color_to, category, archived_at)`; `blocks(id, user_id, activity_id, kind, start_at, end_at, source default 'manual', created_at)`; enums or checks for `category`, `kind`, `source`; `check (end_at > start_at)`; trigger `handle_new_user` creating a profile (timezone from `raw_user_meta_data->>'timezone'`, fallback `'UTC'`) and the six seed activities.
- Consumed by Tasks 7–10 through snake_case columns.

- [ ] **Step 1:** Prereq: Docker running, then `npx supabase start`; copy API URL, anon key and service-role key into `.env.local` (and `.env.test` for `test:db`).
- [ ] **Step 2:** Write failing integration tests (admin client creates users with `admin.createUser({email, password, email_confirm: true, user_metadata: {timezone: 'Asia/Tokyo'}})`; each user signs in with a separate anon client):
  - New user has a profile with `timezone = 'Asia/Tokyo'` and exactly six activities named as in the Global Constraints.
  - User B selecting A's `blocks` / `activities` / `profiles` gets 0 rows.
  - User B inserting a block with `user_id = A` → error; updating or deleting A's block affects 0 rows.
  - **User B inserting a block with own `user_id` but A's `activity_id` → error** (policy `WITH CHECK` requires the activity to belong to `auth.uid()`).
  - Insert with `end_at <= start_at` → error.
- [ ] **Step 3:** Run `npm run test:db` → FAIL.
- [ ] **Step 4:** Write the migration (tables, RLS enabled with `user_id = auth.uid()` policies, the activity-ownership check on `blocks` insert/update, the trigger, index on `blocks(user_id, start_at)`); `npx supabase db reset` to apply.
- [ ] **Step 5:** Run `npm run test:db` → PASS.
- [ ] **Step 6:** Commit `feat: schema, RLS, new-user seeding`.

### Task 7: Supabase clients, magic-link auth, route protection

**Files:**
- Create: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/middleware.ts`, `src/lib/auth/routes.ts`, `src/app/login/page.tsx`, `src/app/auth/callback/route.ts`
- Test: `src/lib/auth/routes.test.ts`

**Interfaces:**
- Produces: `createBrowserClient(): SupabaseClient`; `createServerClient(): Promise<SupabaseClient>` (cookie-based); `isPublicPath(pathname: string): boolean` (true for `/login`, `/auth/*`, static assets, manifest).

- [ ] **Step 1:** Write failing tests: `isPublicPath('/login')`, `('/auth/callback')`, `('/manifest.webmanifest')` → true; `('/')`, `('/day/2026-08-16')`, `('/settings')` → false.
- [ ] **Step 2:** Run `npx vitest run src/lib/auth` → FAIL.
- [ ] **Step 3:** Implement `routes.ts`, the two clients with `@supabase/ssr`, middleware that refreshes the session and redirects unauthenticated non-public requests to `/login`, the login page (email field → `signInWithOtp` with `options.data.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone` and `emailRedirectTo` the callback), and the callback route exchanging the code and redirecting to `/`.
- [ ] **Step 4:** Run tests → PASS. Manual: sign in with a local email; read the link at Inbucket `http://127.0.0.1:54324`; confirm landing on `/` and that `/day/2026-08-16` while signed out redirects to `/login`.
- [ ] **Step 5:** Commit `feat: supabase clients and magic-link auth`.

### Task 8: Data access and server actions

**Files:**
- Create: `src/lib/db/blocks.ts`, `src/lib/db/activities.ts`, `src/lib/db/profile.ts`, `src/app/day/[date]/actions.ts`
- Test: `src/lib/db/blocks.db.test.ts` (included in `test:db`)

**Interfaces:**
- Consumes: `paintBlocks`, `splitAtDayBoundaries`, `rangeFromCells`, `isOnGrid`, `dayRangeFor`, `Profile`.
- Produces: `listBlocks(sb, range): Promise<Block[]>` (blocks with `start_at < range.end` and `end_at > range.start`); `saveBlock(sb, userId: string, profile: Profile, block: NewBlock): Promise<void>` (splits at boundaries, then paints each piece, persisting deletes/updates/inserts); `deleteBlock(sb, id): Promise<void>`; `listActivities(sb): Promise<Activity[]>` (including archived); `getProfile(sb): Promise<Profile>`; server actions `paintAction(input: {dateKey: string; kind: Kind; activityId: string; startCell: number; endCell: number})`, `updateBlockAction(input: {id: string; startAt: string; endAt: string})`, `deleteBlockAction(id: string)`. Actions validate with `isOnGrid` and `revalidatePath` the day page. `updateBlockAction` = delete the original from the working set, then `paintBlocks` the edited block, then delete the original row.

- [ ] **Step 1:** Write failing integration tests (signed-in test client): painting over part of an existing block persists the trimmed block and the new one; a block 04:50–05:20 (UTC profile) is stored as two rows; `listBlocks` excludes blocks entirely outside the range; `updateBlock` to overlap a neighbour trims the neighbour.
- [ ] **Step 2:** Run `npm run test:db` → FAIL.
- [ ] **Step 3:** Implement the data functions (map snake_case rows to the camelCase types, ISO strings to `Date`) and the actions.
- [ ] **Step 4:** Run `npm run test:db` → PASS.
- [ ] **Step 5:** Commit `feat: block persistence and server actions`.

### Task 9: Day page and painting grid

**Files:**
- Create: `src/app/page.tsx` (redirects to today's `/day/[date]`), `src/app/day/[date]/page.tsx`, `src/components/day/DayView.tsx`, `DayGrid.tsx`, `ActivityPicker.tsx`, `TotalsStrip.tsx`, `DayNav.tsx`
- Test: `src/components/day/DayGrid.test.tsx`, `src/components/day/DayView.test.tsx`

**Interfaces:**
- Consumes: `cellCount`, `cellFromPoint`, `rowLabel`, `computeTotals`, `paintAction`, `listBlocks`, `listActivities`, `getProfile`.
- Produces: `DayGrid` props `{range: DayRange; tz: string; layer: Kind; blocks: Block[]; activities: Activity[]; activeActivityId: string | null; onPaint(p: {startCell: number; endCell: number}): void}`; `DayView` props `{dateKey: string; range; tz; blocks; activities}` (client component owning active activity and the phone Plan/Actual toggle; sets `data-active-layer`).

- [ ] **Step 1:** Write failing tests (mock the grid element's `getBoundingClientRect`):
  - `DayGrid` renders `cellCount(range)` cells (`data-cell`).
  - With `activeActivityId = null`: pointer down/up never calls `onPaint` and the grid has `data-mode="scroll"`; with an activity: `data-mode="paint"`.
  - Pointer down on cell 2, move, up on cell 5 → `onPaint({startCell:2, endCell:5})`.
  - Pointer released at coordinates far outside the grid → `endCell` is `cellCount-1` (or `0` for far above/left).
  - A block whose activity has `archivedAt` set renders with the activity's color.
  - `DayView` with no blocks renders the grid plus the empty-state text `Nothing planned yet`; toggling Plan/Actual changes `data-active-layer`.
- [ ] **Step 2:** Run `npx vitest run src/components/day` → FAIL.
- [ ] **Step 3:** Implement. Grid uses pointer events with `setPointerCapture`; `touch-action: none` only in paint mode; layers side by side from `md:` up, one layer plus toggle below. Block color/gradient from `color`/`colorTo`. `DayNav` has previous / today / next buttons and a date picker, all navigating to `/day/[date]` via `shiftDateKey` and `dateKeyOf`. Page: server component loading profile, derived range for `[date]`, blocks, activities; unknown/invalid `[date]` → redirect to today.
- [ ] **Step 4:** Run tests → PASS. Manual with the built-in browser at 375×812 and at desktop width: select an activity, drag to paint in both layers, confirm persistence after reload, confirm totals strip updates.
- [ ] **Step 5:** Commit `feat: day page with painting grid and totals`.

### Task 10: Block editing, activities, settings

**Files:**
- Create: `src/components/day/BlockEditSheet.tsx`, `src/app/settings/page.tsx`, `src/app/settings/actions.ts`, `src/lib/settings/validate.ts`
- Test: `src/lib/settings/validate.test.ts`, `src/components/day/BlockEditSheet.test.tsx`

**Interfaces:**
- Produces: `isValidTimezone(tz: string): boolean`; `isValidDayStart(s: string): boolean` (`HH:mm`, 00:00–23:59); `BlockEditSheet` props `{block: Block; range: DayRange; onSave(startAt: Date, endAt: Date): void; onDelete(): void}` (10-minute steps; Save disabled when `isOnGrid` fails); settings actions to update profile (`timezone`, `dayStart`), create an activity, edit name/color/category, and archive an activity.

- [ ] **Step 1:** Write failing tests: `isValidTimezone('America/New_York')` true, `('Mars/Base')` false; `isValidDayStart('05:00')` true, `('5:00')`, `('24:00')`, `('05:60')` false; `BlockEditSheet` disables Save when end ≤ start and calls `onDelete` on Delete.
- [ ] **Step 2:** Run `npx vitest run src/lib/settings src/components/day/BlockEditSheet` → FAIL.
- [ ] **Step 3:** Implement. Tapping a block in `DayGrid` (when not painting) opens the sheet; settings page is a simple form list (timezone, day start, activity list with add/edit/archive). Changing timezone or day start deletes nothing.
- [ ] **Step 4:** Run tests → PASS. Manual: change day start to `06:00` and confirm existing blocks reappear on the correct days; archive an activity and confirm its old blocks still render.
- [ ] **Step 5:** Commit `feat: block editing, activity management, settings`.

### Task 11: PWA install, README, final checks

**Files:**
- Create: `public/manifest.webmanifest`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `README.md`
- Modify: `src/app/layout.tsx` (manifest link, `viewport` meta, theme color)

- [ ] **Step 1:** Add the manifest (name `Planner`, `display: standalone`, `start_url: /`, both icons) and link it in the layout; write `README.md` covering Docker + `supabase start`, `.env.local` keys, `npm run dev`, `npm test`, `npm run test:db`.
- [ ] **Step 2:** Run `npm test && npm run test:db && npm run build` → all pass.
- [ ] **Step 3:** Manual end-to-end at 375×812: sign in, plan a day, log actuals, flip days, edit and delete a block, see totals. Confirm the Lighthouse/DevTools manifest check reports installable.
- [ ] **Step 4:** Commit `feat: installable web app manifest and readme`.
