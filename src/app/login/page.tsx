'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createBrowserClient } from '@/lib/supabase/client'

function LoginForm() {
  const failed = useSearchParams().get('error')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    const { error } = await createBrowserClient().auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      },
    })
    setStatus(error ? 'error' : 'sent')
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4">
      <h1 className="text-2xl font-semibold">Planner</h1>
      {failed && <p role="alert" className="text-sm text-red-600">That sign-in link did not work. Request a new one.</p>}
      {status === 'sent' ? (
        <p>Check your email for the sign-in link.</p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" disabled={status === 'sending'}>
            {status === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
          </Button>
          {status === 'error' && <p role="alert" className="text-sm text-red-600">Could not send the link. Try again.</p>}
        </form>
      )}
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
