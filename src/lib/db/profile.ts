import type { SupabaseClient } from '@supabase/supabase-js'
import type { Profile } from '@/lib/types'

function safeTimezone(tz: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return tz
  } catch {
    return 'UTC'
  }
}

export async function getProfile(sb: SupabaseClient): Promise<Profile> {
  const { data, error } = await sb.from('profiles').select('timezone, day_start').single()
  if (error) throw error
  return { timezone: safeTimezone(data.timezone), dayStart: String(data.day_start).slice(0, 5) }
}
