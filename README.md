# Planner

A phone-first day planner. Paint **plan** and **actual** blocks on a 10-minute grid, flip between days, and see per-activity planned-vs-actual totals. Stage 1 of a longer plan (chat helper, pings and a coach come later); see `docs/superpowers/specs/` and `docs/superpowers/plans/`.

Stack: Next.js (App Router), React, Tailwind, shadcn/ui, Supabase (Auth, Postgres, Row Level Security).

## Setup (Supabase Cloud)

1. Create a Supabase project (dashboard, or `npx supabase projects create`).
2. Copy `.env.example` to `.env.local` and fill in the project URL, anon key and service-role key.
3. Apply the schema in `supabase/migrations/` to the project:
   ```bash
   npx supabase link --project-ref <project-ref>
   npx supabase db push --remote
   ```
4. Install and run:
   ```bash
   npm install
   npm run dev
   ```
   Sign in with an email magic link. The first sign-in creates your profile and seeds six activities.

## Chat helper

A chat sheet on the day page logs what you did, so you don't paint by hand. Say "I started CS50 at 4:10", "still on it", "done at 5", "delete that one" and it records **actual** blocks through tool calls (planning stays hand-painted). If a new block starts after a gap, it asks what you were doing in between before logging.

It runs a LangGraph.js agent inside the Next app against an Azure OpenAI deployment. Add these to `.env.local` (server-side only, never prefix with `NEXT_PUBLIC_`):

```
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com/openai/v1
AZURE_OPENAI_DEPLOYMENT=gpt-4.1-mini
```

- `.env*` is git-ignored; only `.env.example` (names, no values) is tracked. To rotate the key, edit `.env.local` and restart `npm run dev`.
- Cost guards: messages are limited to 1000 characters, 30 attempts per hour per user (failed attempts count), one message at a time per user, and at most 6 tool steps per message.
- Chat history is stored per user in `chat_messages` (apply the migrations in `supabase/migrations/` with `npx supabase db push --remote`).
- `npm run chat:smoke` runs a short scripted conversation against the **real** model and database with a throwaway user (it makes real model calls, so it costs a little; run it after 04:00 UTC).

## Tests

```bash
npm test          # unit and component tests (no network)
npm run test:db   # integration tests against the Supabase project in .env.local
```

`test:db` creates throwaway users in that project and deletes them afterwards. Use a development project, not production data.

## Notes

- A day starts at your configured day-start (default 05:00) in your timezone, so late-night work stays on the same day.
- Dragging paints only while an activity is selected; with none selected the grid scrolls normally.
- Installable: open the site on your phone and use "Add to Home Screen".
