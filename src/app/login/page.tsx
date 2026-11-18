'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createBrowserClient } from '@/lib/supabase/client'
import { MIN_PASSWORD_LENGTH, authErrorMessage, validateCredentials, type AuthMode } from '@/lib/auth/credentials'

type Mode = AuthMode | 'link'

const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

function LoginForm() {
  const linkFailed = useSearchParams().get('error')
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function switchTo(next: Mode) {
    setMode(next)
    setError(null)
    setNotice(null)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    const supabase = createBrowserClient()

    if (mode === 'link') {
      if (validateCredentials('signin', { email, password: 'x' })) return setError('Enter a valid email address.')
      setBusy(true)
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback`, data: { timezone: timezone() } },
      })
      setBusy(false)
      return error ? setError(authErrorMessage(error)) : setNotice('Check your email for the sign-in link.')
    }

    const invalid = validateCredentials(mode, { email, password, confirm })
    if (invalid) return setError(invalid)

    setBusy(true)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) return setError(authErrorMessage(error))
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { timezone: timezone() } },
        })
        if (error) return setError(authErrorMessage(error))
        // Supabase may answer an existing email with a user that has no identities instead of an error.
        if (data.user && (data.user.identities ?? []).length === 0) {
          return setError(authErrorMessage({ code: 'user_already_exists' }))
        }
        if (!data.session) return setNotice('Account created. Check your email to confirm it, then sign in.')
      }
      // The session cookie is set by now; refresh so server components render signed in.
      router.replace('/')
      router.refresh()
    } catch (e) {
      setError(authErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const tab = (value: AuthMode, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === value}
      onClick={() => switchTo(value)}
      className={`flex-1 rounded-md px-3 py-1.5 text-sm ${mode === value ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'}`}
    >
      {label}
    </button>
  )

  const submitLabel = {
    signin: busy ? 'Signing in…' : 'Sign in',
    signup: busy ? 'Creating account…' : 'Create account',
    link: busy ? 'Sending…' : 'Email me a sign-in link',
  }[mode]

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4">
      <h1 className="text-2xl font-semibold">Planner</h1>
      {linkFailed && (
        <p role="alert" className="text-sm text-red-600">
          That sign-in link did not work. Request a new one or sign in with your password.
        </p>
      )}

      {mode !== 'link' && (
        <div role="tablist" aria-label="Sign in or sign up" className="flex gap-1 rounded-lg bg-muted p-1">
          {tab('signin', 'Sign in')}
          {tab('signup', 'Sign up')}
        </div>
      )}

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />

        {mode !== 'link' && (
          <>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </>
        )}

        {mode === 'signup' && (
          <>
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">At least {MIN_PASSWORD_LENGTH} characters.</p>
          </>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        {notice && <p className="text-sm">{notice}</p>}

        <Button type="submit" disabled={busy}>
          {submitLabel}
        </Button>
      </form>

      <button
        type="button"
        className="self-start text-sm text-muted-foreground underline"
        onClick={() => switchTo(mode === 'link' ? 'signin' : 'link')}
      >
        {mode === 'link' ? 'Use a password instead' : 'Email me a link instead'}
      </button>
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
