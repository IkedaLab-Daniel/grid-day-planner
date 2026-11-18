import { describe, test, expect } from 'vitest'
import { buildSystemPrompt, type DayContext } from '@/lib/chat/context'
import { describeNow } from '@/lib/chat/time'

const base: DayContext = {
  now: new Date('2026-08-16T16:12:00Z'),
  profile: { timezone: 'UTC', dayStart: '05:00' },
  dayKey: '2026-08-16',
  actual: [
    { id: 'b1111111-1111-4111-8111-111111111111', activity: 'CS50', kind: 'actual', start: '15:00', end: '15:30' },
    { id: 'b2222222-2222-4222-8222-222222222222', activity: 'DP-700', kind: 'actual', start: '16:00', end: '16:20' },
  ],
  plan: [{ id: 'p3333333-3333-4333-8333-333333333333', activity: 'AI-101', kind: 'plan', start: '16:00', end: '18:00' }],
  activities: [
    { name: 'CS50', category: 'study' },
    { name: 'Gym', category: 'exercise' },
  ],
}

describe('buildSystemPrompt', () => {
  const prompt = buildSystemPrompt(base)

  test('states the current local time, timezone, day key and day start', () => {
    expect(prompt).toContain(describeNow(base.now, 'UTC'))
    expect(prompt).toContain('UTC')
    expect(prompt).toContain('2026-08-16')
    expect(prompt).toContain('05:00')
  })

  test('lists every actual block with its id, times and activity', () => {
    expect(prompt).toContain('b1111111-1111-4111-8111-111111111111')
    expect(prompt).toContain('15:00-15:30')
    expect(prompt).toContain('b2222222-2222-4222-8222-222222222222')
    expect(prompt).toContain('16:00-16:20')
    expect(prompt).toContain('DP-700')
  })

  test('says when the last actual block ends', () => {
    expect(prompt).toContain('Last actual block ends at 16:20')
  })

  test('shows plan blocks as read-only context', () => {
    expect(prompt).toContain('AI-101')
    expect(prompt.toLowerCase()).toContain('read-only')
  })

  test('lists activities with their categories', () => {
    expect(prompt).toContain('Gym (exercise)')
    expect(prompt).toContain('CS50 (study)')
  })

  test('names every tool', () => {
    for (const tool of ['get_day', 'log_activity', 'set_end', 'edit_block', 'delete_block', 'create_activity']) {
      expect(prompt).toContain(tool)
    }
  })

  test('with no actual blocks it says so instead of inventing a last end, and that no gap question is needed', () => {
    const empty = buildSystemPrompt({ ...base, actual: [], plan: [] })
    expect(empty).toContain('No actual blocks logged yet')
    expect(empty).toContain('needs no gap question')
    expect(empty).not.toContain('Last actual block ends at')
  })

  test('tells the model to confirm in one line without follow-up offers, and what to do when nothing changed', () => {
    expect(prompt).toContain('do not add follow-up questions or offers')
    expect(prompt).toContain('unchanged')
  })

  test('tells the model that only the tool decides when there is a gap, and how to skip one', () => {
    expect(prompt).toContain('Do not ask about gaps yourself')
    expect(prompt).toContain('GAP')
    expect(prompt).toContain('skipWith')
  })

  test('forbids re-logging blocks that are already listed', () => {
    expect(prompt).toContain('never log a block that is already listed')
  })

  test('includes a worked example of the gap flow', () => {
    expect(prompt).toContain('Example')
    expect(prompt).toContain('gap: "skip"')
  })
})
