import type { SupabaseClient } from '@supabase/supabase-js'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: Date
}

interface Row {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

/** The latest `limit` messages, oldest first. */
export async function loadHistory(sb: SupabaseClient, limit = 20): Promise<ChatMessage[]> {
  const { data, error } = await sb
    .from('chat_messages')
    .select('id, role, content, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data as Row[]).reverse().map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    createdAt: new Date(r.created_at),
  }))
}

/** Store a finished turn: the user message (at `startedAt`) and the assistant reply (after it). */
export async function saveTurn(
  sb: SupabaseClient,
  userId: string,
  turn: { user: string; assistant: string; toolCalls: unknown[]; startedAt: Date },
): Promise<void> {
  const repliedAt = new Date(Math.max(Date.now(), turn.startedAt.getTime() + 1))
  const { error } = await sb.from('chat_messages').insert([
    { user_id: userId, role: 'user', content: turn.user, created_at: turn.startedAt.toISOString() },
    {
      user_id: userId,
      role: 'assistant',
      content: turn.assistant,
      tool_calls: turn.toolCalls,
      created_at: repliedAt.toISOString(),
    },
  ])
  if (error) throw error
}

export async function countUserMessagesSince(sb: SupabaseClient, since: Date): Promise<number> {
  const { count, error } = await sb
    .from('chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'user')
    .gte('created_at', since.toISOString())
  if (error) throw error
  return count ?? 0
}
