import { Suspense, type ReactNode } from 'react'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/db/profile'
import { dateKeyOf } from '@/lib/time/day'

export default function Home() {
  return (
    <Suspense>
      <GoToToday />
    </Suspense>
  )
}

async function GoToToday(): Promise<ReactNode> {
  await connection()
  const profile = await getProfile(await createServerClient())
  redirect(`/day/${dateKeyOf(new Date(), profile.timezone, profile.dayStart)}`)
}
