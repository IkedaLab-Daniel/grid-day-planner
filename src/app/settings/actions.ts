'use server'

import { revalidatePath } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'
import { archiveActivity, createActivity, updateActivity } from '@/lib/db/activities'
import { updateProfile } from '@/lib/db/profile'
import { parseActivityForm } from '@/lib/settings/parse'
import { isValidDayStart, isValidTimezone } from '@/lib/settings/validate'

async function context() {
  const sb = await createServerClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) throw new Error('Not signed in')
  return { sb, userId: user.id }
}

export async function updateProfileAction(fd: FormData): Promise<void> {
  const timezone = String(fd.get('timezone') ?? '')
  const dayStart = String(fd.get('dayStart') ?? '')
  if (!isValidTimezone(timezone)) throw new Error('Invalid timezone')
  if (!isValidDayStart(dayStart)) throw new Error('Invalid day start')
  const { sb, userId } = await context()
  await updateProfile(sb, userId, { timezone, dayStart })
  revalidatePath('/', 'layout')
}

export async function createActivityAction(fd: FormData): Promise<void> {
  const input = parseActivityForm(fd)
  const { sb, userId } = await context()
  await createActivity(sb, userId, input)
  revalidatePath('/', 'layout')
}

export async function updateActivityAction(fd: FormData): Promise<void> {
  const input = parseActivityForm(fd)
  const { sb } = await context()
  await updateActivity(sb, String(fd.get('id')), input)
  revalidatePath('/', 'layout')
}

export async function archiveActivityAction(fd: FormData): Promise<void> {
  const { sb } = await context()
  await archiveActivity(sb, String(fd.get('id')))
  revalidatePath('/', 'layout')
}
