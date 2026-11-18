import { Suspense } from 'react'
import { connection } from 'next/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/db/profile'
import { listActivities } from '@/lib/db/activities'
import { listBlocks } from '@/lib/db/blocks'
import { dateKeyOf, dayRangeFor } from '@/lib/time/day'
import { DayView } from '@/components/day/DayView'
import { DayNav } from '@/components/day/DayNav'
import { ChatLauncher } from '@/components/chat/ChatLauncher'
import { deleteBlockAction, paintAction, updateBlockAction } from './actions'

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

export default function DayPage({ params }: { params: Promise<{ date: string }> }) {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading…</p>}>
      <DayContent params={params} />
    </Suspense>
  )
}

async function DayContent({ params }: { params: Promise<{ date: string }> }) {
  await connection()
  const { date } = await params
  const sb = await createServerClient()
  const profile = await getProfile(sb)
  const todayKey = dateKeyOf(new Date(), profile.timezone, profile.dayStart)

  if (!DATE_KEY.test(date) || Number.isNaN(Date.parse(date))) redirect(`/day/${todayKey}`)

  const range = dayRangeFor(date, profile.timezone, profile.dayStart)
  const [blocks, activities] = await Promise.all([listBlocks(sb, range), listActivities(sb)])

  return (
    <>
      <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4">
        <header className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">{date}</h1>
            <Link className="text-sm underline" href="/settings">
              Settings
            </Link>
          </div>
          <DayNav dateKey={date} todayKey={todayKey} />
        </header>
        <DayView
          dateKey={date}
          range={range}
          tz={profile.timezone}
          blocks={blocks}
          activities={activities}
          paint={paintAction}
          updateBlock={updateBlockAction}
          deleteBlock={deleteBlockAction}
        />
      </main>
      <ChatLauncher />
    </>
  )
}
