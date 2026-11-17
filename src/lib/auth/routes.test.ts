import { describe, test, expect } from 'vitest'
import { isPublicPath } from '@/lib/auth/routes'

describe('isPublicPath', () => {
  test.each(['/login', '/auth/callback', '/manifest.webmanifest', '/icons/icon-192.png'])(
    '%s is public',
    (p) => expect(isPublicPath(p)).toBe(true),
  )

  test.each(['/', '/day/2026-08-16', '/settings'])('%s requires sign-in', (p) =>
    expect(isPublicPath(p)).toBe(false),
  )
})
