import { describe, test, expect } from 'vitest'
import { applyPaintResult, paintBlocks } from '@/lib/blocks/paint'
import type { Block, NewBlock } from '@/lib/types'

const BASE = Date.UTC(2026, 7, 16, 5, 0)
const at = (min: number) => new Date(BASE + min * 60_000)

const block = (id: string, from: number, to: number, kind: Block['kind'] = 'plan', activityId = 'A'): Block => ({
  id,
  activityId,
  kind,
  startAt: at(from),
  endAt: at(to),
  source: 'manual',
})

const paint = (from: number, to: number, kind: Block['kind'] = 'plan', activityId = 'B'): NewBlock => ({
  activityId,
  kind,
  startAt: at(from),
  endAt: at(to),
  source: 'manual',
})

describe('paintBlocks', () => {
  test('painting on an empty day only inserts the paint', () => {
    const p = paint(10, 30)
    expect(paintBlocks([], p)).toEqual({ deleteIds: [], updates: [], inserts: [p] })
  })

  test('overlapping the tail of a block trims its end', () => {
    const r = paintBlocks([block('x', 0, 30)], paint(20, 50))
    expect(r.updates).toEqual([block('x', 0, 20)])
    expect(r.deleteIds).toEqual([])
    expect(r.inserts).toEqual([paint(20, 50)])
  })

  test('overlapping the head of a block trims its start', () => {
    const r = paintBlocks([block('x', 20, 60)], paint(0, 30))
    expect(r.updates).toEqual([block('x', 30, 60)])
  })

  test('painting strictly inside a block splits it around the paint', () => {
    const r = paintBlocks([block('x', 0, 60, 'plan', 'A')], paint(20, 30))
    expect(r.updates).toEqual([block('x', 0, 20)])
    expect(r.inserts).toHaveLength(2)
    expect(r.inserts).toContainEqual(paint(20, 30))
    expect(r.inserts).toContainEqual({
      activityId: 'A',
      kind: 'plan',
      startAt: at(30),
      endAt: at(60),
      source: 'manual',
    })
  })

  test('fully covering a block deletes it', () => {
    const r = paintBlocks([block('x', 10, 20)], paint(0, 30))
    expect(r.deleteIds).toEqual(['x'])
    expect(r.updates).toEqual([])
  })

  test('blocks of the other kind are untouched', () => {
    const r = paintBlocks([block('x', 0, 60, 'actual')], paint(10, 20, 'plan'))
    expect(r).toEqual({ deleteIds: [], updates: [], inserts: [paint(10, 20, 'plan')] })
  })

  test('blocks that only touch the paint are untouched', () => {
    const r = paintBlocks([block('x', 0, 20), block('y', 40, 60)], paint(20, 40))
    expect(r.updates).toEqual([])
    expect(r.deleteIds).toEqual([])
  })
})

describe('applyPaintResult', () => {
  test('applies deletes, updates and inserts, giving inserted blocks temporary ids', () => {
    const existing = [block('keep', 100, 120), block('cut', 0, 60), block('gone', 200, 210)]
    const painted = paint(20, 30)
    const result = paintBlocks([block('cut', 0, 60)], painted)
    const out = applyPaintResult([...existing.slice(0, 2), existing[2]], { ...result, deleteIds: ['gone'] })
    expect(out.find((b) => b.id === 'gone')).toBeUndefined()
    expect(out.find((b) => b.id === 'keep')).toEqual(block('keep', 100, 120))
    expect(out.find((b) => b.id === 'cut')).toEqual(block('cut', 0, 20))
    const added = out.filter((b) => b.id.startsWith('optimistic-'))
    expect(added.map((b) => [b.startAt, b.endAt])).toEqual(
      expect.arrayContaining([[at(20), at(30)], [at(30), at(60)]]),
    )
  })
})
