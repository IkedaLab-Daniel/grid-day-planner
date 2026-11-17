import type { SupabaseClient } from '@supabase/supabase-js'
import type { Activity, Category } from '@/lib/types'

interface ActivityRow {
  id: string
  name: string
  color: string
  color_to: string | null
  category: Category
  archived_at: string | null
}

export async function listActivities(sb: SupabaseClient): Promise<Activity[]> {
  const { data, error } = await sb
    .from('activities')
    .select('id, name, color, color_to, category, archived_at')
    .order('name')
  if (error) throw error
  return (data as ActivityRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    colorTo: r.color_to,
    category: r.category,
    archivedAt: r.archived_at ? new Date(r.archived_at) : null,
  }))
}

export interface ActivityInput {
  name: string
  color: string
  colorTo: string | null
  category: Category
}

export async function createActivity(sb: SupabaseClient, userId: string, input: ActivityInput): Promise<void> {
  const { error } = await sb.from('activities').insert({
    user_id: userId,
    name: input.name,
    color: input.color,
    color_to: input.colorTo,
    category: input.category,
  })
  if (error) throw error
}

export async function updateActivity(sb: SupabaseClient, id: string, input: ActivityInput): Promise<void> {
  const { error } = await sb
    .from('activities')
    .update({ name: input.name, color: input.color, color_to: input.colorTo, category: input.category })
    .eq('id', id)
  if (error) throw error
}

export async function archiveActivity(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from('activities').update({ archived_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}
