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
