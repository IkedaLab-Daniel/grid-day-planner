export const MIN_PASSWORD_LENGTH = 8

export type AuthMode = 'signin' | 'signup'

/** A message to show, or null when the form can be submitted. */
export function validateCredentials(
  mode: AuthMode,
  input: { email: string; password: string; confirm?: string },
): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return 'Enter a valid email address.'
  if (mode === 'signin') return input.password ? null : 'Enter your password.'
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`
  }
  if (input.password !== input.confirm) return 'The passwords do not match.'
  return null
}

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'Wrong email or password.',
  user_already_exists: 'An account with this email already exists. Sign in instead.',
  email_exists: 'An account with this email already exists. Sign in instead.',
  weak_password: 'That password is too weak. Try a longer one.',
  over_request_rate_limit: 'Too many attempts. Wait a minute and try again.',
  email_not_confirmed: 'This account still needs email confirmation.',
}

/** A friendly message for a Supabase auth error; never shows the raw error text. */
export function authErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
  return MESSAGES[code] ?? 'Something went wrong. Please try again.'
}
