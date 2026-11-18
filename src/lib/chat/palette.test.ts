import { describe, test, expect } from 'vitest'
import { PALETTE, pickColor } from '@/lib/chat/palette'

const SEED = ['#7CB342', '#56BADB', '#A6A6A6', '#FADF6F', '#5C6BF5', '#EF4637']

describe('palette', () => {
  test('has 8 distinct hex colours that avoid the seed colours', () => {
    expect(PALETTE).toHaveLength(8)
    expect(new Set(PALETTE.map((c) => c.toLowerCase())).size).toBe(8)
    for (const c of PALETTE) {
      expect(c).toMatch(/^#[0-9a-fA-F]{6}$/)
      expect(SEED.map((s) => s.toLowerCase())).not.toContain(c.toLowerCase())
    }
  })

  test('picks the first unused colour, ignoring case', () => {
    expect(pickColor([])).toBe(PALETTE[0])
    expect(pickColor([PALETTE[0].toLowerCase()])).toBe(PALETTE[1])
  })

  test('still returns a palette colour when all are used', () => {
    expect(PALETTE).toContain(pickColor([...PALETTE]))
  })
})
