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
