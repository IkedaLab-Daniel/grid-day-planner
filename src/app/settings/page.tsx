import { Suspense } from 'react'
import Link from 'next/link'
import { connection } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/db/profile'
import { listActivities } from '@/lib/db/activities'
import { CATEGORIES } from '@/lib/settings/parse'
import { Button } from '@/components/ui/button'
import {
  archiveActivityAction,
  createActivityAction,
  updateActivityAction,
  updateProfileAction,
} from './actions'
import type { Activity } from '@/lib/types'

export default function SettingsPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading…</p>}>
      <SettingsContent />
    </Suspense>
  )
}

function ActivityFields({ a }: { a?: Activity }) {
  return (
    <>
      <input name="name" required maxLength={40} defaultValue={a?.name} placeholder="Name" aria-label="Name" className="rounded border px-2 py-1" />
      <input name="color" type="color" defaultValue={a?.color ?? '#7cb342'} aria-label="Colour" />
      <label className="flex items-center gap-1 text-sm">
        <input name="gradient" type="checkbox" defaultChecked={!!a?.colorTo} /> gradient to
      </label>
      <input name="colorTo" type="color" defaultValue={a?.colorTo ?? '#e86dbf'} aria-label="Second colour" />
      <select name="category" defaultValue={a?.category ?? 'study'} aria-label="Category" className="rounded border px-2 py-1">
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </>
  )
}

async function SettingsContent() {
  await connection()
  const sb = await createServerClient()
  const [profile, activities] = await Promise.all([getProfile(sb), listActivities(sb)])
  const zones = Intl.supportedValuesOf('timeZone')

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Settings</h1>
        <Link className="rounded border px-3 py-1" href="/">
          ‹ Back to planner
        </Link>
      </header>

      <section aria-labelledby="day">
        <h2 id="day" className="mb-2 font-medium">Your day</h2>
        <form action={updateProfileAction} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Timezone
            <select name="timezone" defaultValue={profile.timezone} className="rounded border px-2 py-1">
              {!zones.includes(profile.timezone) && <option value={profile.timezone}>{profile.timezone}</option>}
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Day starts at
            <input name="dayStart" type="time" required defaultValue={profile.dayStart} className="rounded border px-2 py-1" />
          </label>
          <Button type="submit">Save</Button>
        </form>
        <p className="mt-2 text-sm text-muted-foreground">Changing these never deletes anything; days are re-drawn from your saved blocks.</p>
      </section>

      <section aria-labelledby="acts">
        <h2 id="acts" className="mb-2 font-medium">Activities</h2>
        <ul className="flex flex-col gap-3">
          {activities
            .filter((a) => !a.archivedAt)
            .map((a) => (
              <li key={a.id}>
                <form action={updateActivityAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={a.id} />
                  <ActivityFields a={a} />
                  <Button type="submit" size="sm">Save</Button>
                  <Button type="submit" size="sm" variant="outline" formAction={archiveActivityAction}>
                    Archive
                  </Button>
                </form>
              </li>
            ))}
        </ul>
        <h3 className="mt-6 mb-2 text-sm font-medium">Add an activity</h3>
        <form action={createActivityAction} className="flex flex-wrap items-center gap-2">
          <ActivityFields />
          <Button type="submit" size="sm">Add</Button>
        </form>
      </section>
    </main>
  )
}
