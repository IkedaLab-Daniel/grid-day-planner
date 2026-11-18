/**
 * Smoke test for the chat helper against the REAL Azure model and the real Supabase project.
 * Not part of CI: it makes real model calls (cost) and creates then deletes a throwaway user.
 *
 *   npm run chat:smoke
 *
 * Reads settings from .env.local. Never prints any environment value.
 */
import { createClient } from '@supabase/supabase-js'
import { listActivities } from '@/lib/db/activities'
import { listBlocks } from '@/lib/db/blocks'
import { updateProfile } from '@/lib/db/profile'
import { createChatModel } from '@/lib/chat/model'
import { sendMessage } from '@/lib/chat/service'
import { formatLocalTime } from '@/lib/chat/time'
import { dateKeyOf, dayRangeFor } from '@/lib/time/day'

const need = (name: string) => {
  const v = process.env[name]
  if (!v) throw new Error(`Missing ${name} in .env.local`)
  return v
}

const url = need('NEXT_PUBLIC_SUPABASE_URL')
const admin = createClient(url, need('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

const hhmm = (d: Date) => d.toISOString().slice(11, 16)
const minutesAgo = (now: Date, m: number) => new Date(now.getTime() - m * 60_000)

async function main() {
  const now = new Date()
  if (now.getUTCHours() < 4) {
    console.log('Run this after 04:00 UTC: the script logs blocks up to 3 hours back on today.')
    return
  }

  const email = `t${Date.now()}smoke@example.com`
  const password = `smoke-${Math.random().toString(36).slice(2)}-${Date.now()}`
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { timezone: 'UTC' } })
  if (created.error) throw created.error
  const userId = created.data.user.id

  try {
    const sb = createClient(url, need('NEXT_PUBLIC_SUPABASE_ANON_KEY'), { auth: { persistSession: false } })
    const signedIn = await sb.auth.signInWithPassword({ email, password })
    if (signedIn.error) throw signedIn.error
    const profile = { timezone: 'UTC', dayStart: '00:00' }
    await updateProfile(sb, userId, profile)

    const model = createChatModel()
    const script = [
      `I started CS50 at ${hhmm(minutesAgo(now, 40))}`,
      'still on it',
      `I was on AI-101 from ${hhmm(minutesAgo(now, 180))} to ${hhmm(minutesAgo(now, 150))}`,
      `I started DP-700 at ${hhmm(minutesAgo(now, 120))} and finished at ${hhmm(minutesAgo(now, 90))}`,
      'nothing, skip it',
    ]
    for (const message of script) {
      const r = await sendMessage({ sb, userId, model }, message)
      console.log(`you:    ${message}\nhelper: ${r.reply}${r.changed ? '   [changed]' : ''}\n`)
    }

    const range = dayRangeFor(dateKeyOf(now, profile.timezone, profile.dayStart), profile.timezone, profile.dayStart)
    const [blocks, activities] = await Promise.all([listBlocks(sb, range), listActivities(sb)])
    console.log('Resulting actual blocks:')
    for (const b of blocks.filter((x) => x.kind === 'actual').sort((a, c) => a.startAt.getTime() - c.startAt.getTime())) {
      const name = activities.find((a) => a.id === b.activityId)?.name
      console.log(`  ${formatLocalTime(b.startAt, 'UTC')}-${formatLocalTime(b.endAt, 'UTC')} ${name} (${b.source})`)
    }
  } finally {
    await admin.auth.admin.deleteUser(userId)
    console.log('\nThrowaway user deleted.')
  }
}

main().catch((e) => {
  console.error('smoke test failed:', e instanceof Error ? `${e.name}: ${e.message}` : e)
  process.exit(1)
})
