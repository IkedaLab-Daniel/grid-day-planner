// @vitest-environment node
import { describe, test, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const pub = path.resolve(__dirname, '../../public')
const manifest = () => JSON.parse(readFileSync(path.join(pub, 'manifest.webmanifest'), 'utf8'))

describe('web app manifest', () => {
  test('is a standalone app that starts at /', () => {
    const m = manifest()
    expect(m).toMatchObject({ name: 'Planner', display: 'standalone', start_url: '/' })
  })

  test('declares 192 and 512 PNG icons that exist on disk', () => {
    const sizes = manifest().icons.map((i: { sizes: string }) => i.sizes)
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']))
    for (const icon of manifest().icons as { src: string; type: string }[]) {
      expect(icon.type).toBe('image/png')
      expect(existsSync(path.join(pub, icon.src))).toBe(true)
    }
  })
})
