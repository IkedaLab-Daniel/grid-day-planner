import { describe, test, expect, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { admin } from '../../../supabase/tests/helpers'

const created: string[] = []
afterAll(async () => {
  for (const id of created) await admin.auth.admin.deleteUser(id)
})

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  })

describe('email + password auth', () => {
  const email = `t${Date.now()}pw@example.com`
  const password = 'correct-horse-9'

  test('sign-up returns a session right away (no email confirmation) and seeds the profile', async () => {
    const sb = anon()
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { timezone: 'Asia/Tokyo' } } })
    expect(error).toBeNull()
    created.push(data.user!.id)
    expect(data.session).not.toBeNull()
    const profile = await sb.from('profiles').select('timezone').single()
    expect(profile.data?.timezone).toBe('Asia/Tokyo')
    const acts = await sb.from('activities').select('id')
    expect(acts.data).toHaveLength(6)
  })

  test('the same email cannot sign up twice', async () => {
    const { data, error } = await anon().auth.signUp({ email, password })
    // Supabase either errors or returns a user with no identities for an existing email.
    expect(error !== null || (data.user?.identities ?? []).length === 0).toBe(true)
  })

  test('sign-in works with the right password and fails with a wrong one', async () => {
    expect((await anon().auth.signInWithPassword({ email, password })).error).toBeNull()
    const wrong = await anon().auth.signInWithPassword({ email, password: 'not-the-password' })
    expect(wrong.error?.code).toBe('invalid_credentials')
  })
})
