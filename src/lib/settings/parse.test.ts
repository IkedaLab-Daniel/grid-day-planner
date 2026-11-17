import { describe, test, expect } from 'vitest'
import { parseActivityForm } from '@/lib/settings/parse'

const form = (o: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(o)) fd.set(k, v)
  return fd
}

describe('parseActivityForm', () => {
  test('trims the name and drops colorTo when gradient is off', () => {
    expect(parseActivityForm(form({ name: '  Run ', color: '#112233', colorTo: '#445566', category: 'exercise' }))).toEqual({
      name: 'Run',
      color: '#112233',
      colorTo: null,
      category: 'exercise',
    })
  })

  test('keeps colorTo when gradient is on', () => {
    expect(
      parseActivityForm(form({ name: 'Cap', color: '#112233', colorTo: '#445566', gradient: 'on', category: 'study' })).colorTo,
    ).toBe('#445566')
  })

  test.each([
    [{ name: ' ', color: '#112233', category: 'study' }],
    [{ name: 'x', color: 'red', category: 'study' }],
    [{ name: 'x', color: '#112233', category: 'nonsense' }],
    [{ name: 'x', color: '#112233', colorTo: 'blue', gradient: 'on', category: 'study' }],
  ])('rejects invalid input %#', (o) => {
    expect(() => parseActivityForm(form(o as Record<string, string>))).toThrow()
  })
})
