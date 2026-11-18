# Planner Core (Stage 1) — Design

Date: 2026-11-18
Status: Draft, awaiting approval

## 1. Intent and the why

The owner plans their day on a hand-drawn Canva chart: a grid of 10-minute cells
(6 per hour, 24 rows), filled with colored bars, one color per project
(AI-101, DP-700, CS50, QR SaaS, Capstone, IOT commission). Drawing every element
by hand is slow, and the result is a picture, so nothing can be learned from it.

The long-term vision is an AI coach ("buddy") that helps the user maximize their
cognitive potential: it logs what they are doing by asking them, pings them,
and gives research-based guidance (e.g. no social media on waking, no caffeine
within 8 hours of sleep, challenging late-night study vs. sleep, nudging exercise).
It should eventually grow into a SaaS.

That vision is split into four stages, built in this order, each with its own design:

1. **Planner core (this doc):** plan vs. actual grid, saved as structured data.
2. Chat helper that creates entries through tool calls (LangGraph + Azure OpenAI).
3. Proactive pings (push notifications + scheduler).
4. Coach: research-based guidance and judgment.

Stage 1 exists to make daily planning cheap and to store each day as data
(not a picture) so that plan-vs-actual comparison, and later the helper and coach,
have something to work with.

## 2. Goals

- Sign in and see one day as the owner's grid; flip between days.
- Paint **plan** blocks and **actual** blocks by dragging across 10-minute cells.
- Show plan and actual so gaps are visible at a glance.
- Show per-activity totals for the day: planned minutes, actual minutes, difference.
- Phone-first, installable on the home screen.
- Multi-user from day one (every record belongs to a user, enforced in the database).
- Data model that stage 2-4 can use without a rewrite.

## 3. Non-goals (stage 1)

- Chat helper, AI of any kind, pings, push notifications, the coach.
- Week/month charts and trend insights (the data will support them later).
- Offline mode, sharing/teams, billing, calendar import/export, native apps.

## 4. Anti-goals (a failure even if it technically works)

- Logging a day is not clearly faster than drawing it in Canva.
- It turns into a generic calendar app (events, invites, recurrence).
- Times have to be typed in for normal use. Painting is the primary input.
- The data model only fits "study projects" and cannot represent sleep, exercise,
  caffeine, meals, which the stage 4 coach needs.

## 5. Constraints

- Stack chosen by the owner: Next.js (App Router) + React, shadcn/ui + Tailwind,
  Supabase (Auth + Postgres + Row Level Security). No MongoDB, no Express: the data
  is relational and Postgres handles it.
- LangChain/LangGraph and Azure OpenAI are for later stages, not installed now.
- SaaS direction: data isolation per user is a requirement, not an option.

## 6. Approaches considered

| | Approach | Trade-offs |
|---|---|---|
| **A (chosen)** | Next.js + Supabase only | Fewest moving parts; fastest to a working planner; standard SaaS start. LangGraph.js is less mature than the Python version. |
| B | Next.js + Django REST + Postgres | Python-native for LangGraph later, but two apps to build/deploy/secure before the first block can be painted. |
| C | A now, separate Python agent service at stage 2-3 | A with the JS-vs-Python decision deferred to stage 2. Not a stage 1 decision. |

The owner picked A. Python vs. JS for the stage 2 helper is left open until then.

## 7. Design

### 7.1 Concepts

- **Activity:** a thing the user spends time on. Has name, color (optionally a
  second color for a gradient), and a **category**: `study | sleep | exercise |
  meal | caffeine | other`. Categories exist so the stage 4 coach can reason
  about the day. Stage 1 only needs `study` and `other` in the UI but stores the full set.
- **Block:** a time range of one activity, of kind `plan` or `actual`.
- **Day:** *derived, not stored.* A day runs from the user's day-start time
  (default 05:00) to the same time the next calendar day, in the user's timezone.
  So a 1 AM study session belongs to the previous day, matching the owner's chart
  (rows 5 AM through 4 AM).

### 7.2 Data model (Postgres on Supabase)

```
profiles    id (= auth.users.id), timezone text, day_start time default '05:00'
activities  id, user_id, name, color, color_to null, category, archived_at null
blocks      id, user_id, activity_id, kind ('plan'|'actual'),
            start_at timestamptz, end_at timestamptz,
            source ('manual'|'ai') default 'manual', created_at
```

- `blocks`: check `end_at > start_at`; start/end are multiples of 10 minutes
  (enforced in the app; a DB check is optional).
- Row Level Security on all three tables: a user can only read/write rows where
  `user_id = auth.uid()` (profiles: `id = auth.uid()`).
- On first sign-in, seed the owner's 6 activities (AI-101 green, DP-700 light blue,
  CS50 grey, QR SaaS yellow, Capstone blue-to-pink gradient, IOT commission red),
  all category `study`. Seeding for new users in general: same defaults are fine
  for stage 1; a proper onboarding is out of scope.
- Schema changes via Supabase migrations kept in the repo.
- `source` is set now so stage 2 can mark AI-created blocks; stage 1 only writes `manual`.

### 7.3 Behaviour

- **Grid:** 24 hourly rows x 6 ten-minute cells, labeled like the chart
  (hour on the left, 01...59 header). Row labels follow the user's day-start.
- **Painting:** choose an activity (color chips), drag across cells to create a block.
  Painting over existing blocks of the **same kind** replaces the overlapped
  part (trims or splits existing blocks); plan and actual never affect each other.
- **Editing:** tap a block to change start/end (10-minute steps) or delete it.
- **Plan vs actual:** wide screens show two columns side by side; phones show a
  Plan/Actual toggle. Gaps (planned but not done, done but not planned) are visible
  by looking at the two layers.
- **Day navigation:** previous / today / next, and a date picker.
- **Totals strip:** per activity: planned min, actual min, difference. Computed
  from blocks, not stored.
- **Blocks cannot cross the day boundary.** Painting is limited to the current
  day's grid. Any block that would cross the boundary (relevant later for AI entries
  like "started at 4:50 AM") is split at the boundary when written.
- **Auth:** Supabase Auth; minimum is email magic link. No profile screen
  beyond timezone and day-start (can be a simple settings sheet).
- **Installable:** web app manifest + icons so it can be added to the home
  screen. No service worker push in this stage.

### 7.4 Quality

- Unit tests for the pure logic: day boundaries and timezone conversion
  (including DST), cell-to-timestamp mapping, overlap replacement, totals.
- Tests that prove RLS: user A cannot read or write user B's rows.
- Manual check on a phone-sized viewport that dragging to paint works with touch.

## 8. Decisions

Made by the owner: the 4-stage order; Approach A; multi-user from day one
(SaaS vision); phone-first; plan-vs-actual as the core comparison; activities
beyond study projects (sleep, exercise, etc.) are modeled from the start.

Made by the designer (marked as proposals, owner can change): 5 AM day start;
day derived rather than stored; overwrite-on-same-kind painting; side by side on
desktop vs. toggle on phone; activity categories enum; gradient via an optional
second color; blocks split at the day boundary; email magic link as minimum sign-in.

## 9. Left to the builder

Project layout and component structure; exact grid/drag implementation (pointer
events for touch + mouse); hosting (Vercel is the natural fit); exact colors and
visual polish within the chart's look; sign-in extras (e.g. Google) if cheap;
error and empty states; accessibility details (keyboard painting is a nice-to-have).

## 10. Builder check (done by reading as the builder)

Questions a builder would ask, and answers:

- *What counts as "a day" for blocks after midnight?* Answered: day-start boundary, default 05:00.
- *What if painting overlaps?* Answered: replaces same kind only.
- *How do gradients work?* Settled: optional `color_to`. Minor.
- *Time zones when the user travels?* Minor, settled: block times are absolute
  (`timestamptz`); the grid uses the profile timezone. Changing timezone re-renders
  past days in the new zone; acceptable for now.
- *Are meals/caffeine "blocks"?* Minor, settled: yes, as 10-minute blocks. A true
  instant event model is a stage 4 question.
- Nothing remains that only the owner can answer.
