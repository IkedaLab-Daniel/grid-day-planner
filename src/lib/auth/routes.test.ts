import { describe, test, expect } from 'vitest'
import { isApiPath, isPublicPath } from '@/lib/auth/routes'

describe('isPublicPath', () => {
  test.each(['/login', '/auth/callback', '/manifest.webmanifest', '/icons/icon-192.png'])(
    '%s is public',
    (p) => expect(isPublicPath(p)).toBe(true),
  )

  test.each(['/', '/day/2026-08-16', '/settings'])('%s requires sign-in', (p) =>
    expect(isPublicPath(p)).toBe(false),
  )
})

describe('isApiPath', () => {
  test.each(['/api', '/api/chat'])('%s is an API path', (p) => expect(isApiPath(p)).toBe(true))
  test.each(['/day/2026-08-16', '/apiary', '/'])('%s is not an API path', (p) => expect(isApiPath(p)).toBe(false))
})
