import { describe, test, expect } from 'vitest'
import { MIN_PASSWORD_LENGTH, authErrorMessage, validateCredentials } from '@/lib/auth/credentials'

describe('validateCredentials', () => {
  const ok = { email: 'me@example.com', password: 'longenough' }

  test('valid sign-in and sign-up input passes', () => {
    expect(validateCredentials('signin', ok)).toBeNull()
    expect(validateCredentials('signup', { ...ok, confirm: 'longenough' })).toBeNull()
  })

  test('email must look like an email', () => {
    expect(validateCredentials('signin', { ...ok, email: 'nope' })).toBe('Enter a valid email address.')
    expect(validateCredentials('signin', { ...ok, email: '   ' })).toBe('Enter a valid email address.')
  })

  test('sign-in only needs a password to be present', () => {
    expect(validateCredentials('signin', { ...ok, password: '' })).toBe('Enter your password.')
    expect(validateCredentials('signin', { ...ok, password: 'short' })).toBeNull()
  })

  test(`sign-up needs at least ${8} characters and a matching confirmation`, () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8)
    expect(validateCredentials('signup', { ...ok, password: 'short', confirm: 'short' })).toBe(
      'Use at least 8 characters for your password.',
    )
    expect(validateCredentials('signup', { ...ok, confirm: 'different1' })).toBe('The passwords do not match.')
  })
})

describe('authErrorMessage', () => {
  test.each([
    [{ code: 'invalid_credentials', message: 'Invalid login credentials' }, 'Wrong email or password.'],
    [{ code: 'user_already_exists', message: 'User already registered' }, 'An account with this email already exists. Sign in instead.'],
    [{ code: 'email_exists', message: 'Email exists' }, 'An account with this email already exists. Sign in instead.'],
    [{ code: 'weak_password', message: 'Password should be at least 6 characters' }, 'That password is too weak. Try a longer one.'],
    [{ code: 'over_request_rate_limit', message: 'rate limit' }, 'Too many attempts. Wait a minute and try again.'],
    [{ code: 'email_not_confirmed', message: 'Email not confirmed' }, 'This account still needs email confirmation.'],
  ])('%o maps to a friendly message', (error, expected) => {
    expect(authErrorMessage(error)).toBe(expected)
  })

  test('unknown errors get a generic message, never the raw text', () => {
    expect(authErrorMessage({ code: 'something_new', message: 'internal stack trace' })).toBe(
      'Something went wrong. Please try again.',
    )
    expect(authErrorMessage(new Error('Failed to fetch'))).toBe('Something went wrong. Please try again.')
  })
})
