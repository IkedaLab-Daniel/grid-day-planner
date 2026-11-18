import { describe, test, expect } from 'vitest'
import { matchActivity } from '@/lib/chat/matchActivity'
import type { Activity } from '@/lib/types'

const act = (name: string, archived = false): Activity => ({
  id: name,
  name,
  color: '#000000',
  colorTo: null,
  category: 'study',
  archivedAt: archived ? new Date() : null,
})
const activities = [act('AI-101'), act('CS50'), act('IOT commission'), act('CS50 Lab'), act('Old', true)]

describe('matchActivity', () => {
  test('exact match beats substring, ignoring case and whitespace', () => {
    expect(matchActivity(' cs50 ', activities)).toMatchObject({ kind: 'match', activity: { name: 'CS50' } })
  })

  test('matches ignoring punctuation and spaces', () => {
    expect(matchActivity('ai 101', activities)).toMatchObject({ kind: 'match', activity: { name: 'AI-101' } })
    expect(matchActivity('ai101', activities)).toMatchObject({ kind: 'match', activity: { name: 'AI-101' } })
  })

  test('a unique substring matches', () => {
    expect(matchActivity('iot', activities)).toMatchObject({ kind: 'match', activity: { name: 'IOT commission' } })
  })

  test('several substring matches are ambiguous', () => {
    expect(matchActivity('cs', activities)).toEqual({ kind: 'ambiguous', names: ['CS50', 'CS50 Lab'] })
  })

  test('no match lists the available names', () => {
    expect(matchActivity('gym', activities)).toEqual({
      kind: 'none',
      names: ['AI-101', 'CS50', 'IOT commission', 'CS50 Lab'],
    })
  })

  test('archived activities are ignored', () => {
    expect(matchActivity('old', activities).kind).toBe('none')
  })
})
