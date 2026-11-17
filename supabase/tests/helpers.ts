import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const admin = createClient(url, service, { auth: { persistSession: false } })

const created: string[] = []

export interface TestUser {
  id: string
  email: string
  client: SupabaseClient
}

export async function createTestUser(timezone = 'UTC'): Promise<TestUser> {
  const email = `t${Date.now()}${Math.random().toString(36).slice(2, 8)}@example.com`
  const password = 'test-password-123'
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { timezone },
  })
  if (error) throw error
  created.push(data.user.id)
  const client = createClient(url, anon, { auth: { persistSession: false } })
  const signIn = await client.auth.signInWithPassword({ email, password })
  if (signIn.error) throw signIn.error
  return { id: data.user.id, email, client }
}

/** Delete every user created through createTestUser (cascades to their rows). */
export async function cleanupTestUsers(): Promise<void> {
  for (const id of created.splice(0)) await admin.auth.admin.deleteUser(id)
}

/** One-off sweep of leftovers from interrupted runs (test emails only). */
export async function sweepTestUsers(): Promise<number> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const stale = data.users.filter((u) => /^t\d+[a-z0-9]+@example\.com$/.test(u.email ?? ''))
  for (const u of stale) await admin.auth.admin.deleteUser(u.id)
  return stale.length
}
