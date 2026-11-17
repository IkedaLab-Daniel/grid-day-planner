import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DayGrid } from '@/components/day/DayGrid'
import { dayRangeFor } from '@/lib/time/day'
import { cellCount, cellStart } from '@/lib/grid/grid'
import type { Activity, Block } from '@/lib/types'

const range = dayRangeFor('2026-08-16', 'UTC', '05:00')
const activity = (over: Partial<Activity> = {}): Activity => ({
  id: 'a1',
  name: 'CS50',
  color: '#A6A6A6',
  colorTo: null,
  category: 'study',
  archivedAt: null,
  ...over,
})

function setup(props: Partial<React.ComponentProps<typeof DayGrid>> = {}) {
  const onPaint = vi.fn()
  render(
    <DayGrid
      range={range}
      tz="UTC"
      layer="plan"
      blocks={[]}
      activities={[activity()]}
      activeActivityId={null}
      onPaint={onPaint}
      {...props}
    />,
  )
  const grid = screen.getByTestId('grid')
  grid.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 600, height: 2400, right: 600, bottom: 2400, x: 0, y: 0, toJSON() {} }) as DOMRect
  return { onPaint, grid }
}

// centre of cell i in a 600x2400 grid with 6 columns and 24 rows
const at = (i: number) => ({ clientX: (i % 6) * 100 + 50, clientY: Math.floor(i / 6) * 100 + 50 })

describe('DayGrid', () => {
  test('renders one cell per 10 minutes of the day', () => {
    setup()
    expect(document.querySelectorAll('[data-cell]')).toHaveLength(cellCount(range))
  })

  test('with no activity selected it is in scroll mode and never paints', () => {
    const { onPaint, grid } = setup()
    expect(grid).toHaveAttribute('data-mode', 'scroll')
    fireEvent.pointerDown(grid, { pointerId: 1, ...at(2) })
    fireEvent.pointerUp(grid, { pointerId: 1, ...at(5) })
    expect(onPaint).not.toHaveBeenCalled()
  })

  test('with an activity selected it is in paint mode', () => {
    const { grid } = setup({ activeActivityId: 'a1' })
    expect(grid).toHaveAttribute('data-mode', 'paint')
  })

  test('dragging from cell 2 to cell 5 paints that range', () => {
    const { onPaint, grid } = setup({ activeActivityId: 'a1' })
    fireEvent.pointerDown(grid, { pointerId: 1, ...at(2) })
    fireEvent.pointerMove(grid, { pointerId: 1, ...at(4) })
    fireEvent.pointerUp(grid, { pointerId: 1, ...at(5) })
    expect(onPaint).toHaveBeenCalledWith({ startCell: 2, endCell: 5 })
  })

  test('releasing far below the grid clamps to the last cell', () => {
    const { onPaint, grid } = setup({ activeActivityId: 'a1' })
    fireEvent.pointerDown(grid, { pointerId: 1, ...at(140) })
    fireEvent.pointerUp(grid, { pointerId: 1, clientX: 9999, clientY: 9999 })
    expect(onPaint).toHaveBeenCalledWith({ startCell: 140, endCell: cellCount(range) - 1 })
  })

  test('releasing far above-left of the grid clamps to cell 0', () => {
    const { onPaint, grid } = setup({ activeActivityId: 'a1' })
    fireEvent.pointerDown(grid, { pointerId: 1, ...at(3) })
    fireEvent.pointerUp(grid, { pointerId: 1, clientX: -500, clientY: -500 })
    expect(onPaint).toHaveBeenCalledWith({ startCell: 3, endCell: 0 })
  })

  test('a block of an archived activity still renders in its colour', () => {
    const block: Block = {
      id: 'b1',
      activityId: 'a1',
      kind: 'plan',
      startAt: cellStart(range, 6),
      endAt: cellStart(range, 8),
      source: 'manual',
    }
    setup({ blocks: [block], activities: [activity({ archivedAt: new Date() })] })
    expect(document.querySelector('[data-cell="6"]')).toHaveStyle('background-color: #A6A6A6')
    expect(document.querySelector('[data-cell="7"]')).toHaveStyle('background-color: #A6A6A6')
    expect(document.querySelector('[data-cell="8"]')).not.toHaveStyle('background-color: #A6A6A6')
  })

  test('blocks of the other layer are not drawn', () => {
    const block: Block = {
      id: 'b1',
      activityId: 'a1',
      kind: 'actual',
      startAt: cellStart(range, 6),
      endAt: cellStart(range, 8),
      source: 'manual',
    }
    setup({ blocks: [block], layer: 'plan' })
    expect(document.querySelector('[data-cell="6"]')).not.toHaveStyle('background-color: #A6A6A6')
  })
})

describe('DayGrid block tapping', () => {
  const block: Block = {
    id: 'b1',
    activityId: 'a1',
    kind: 'plan',
    startAt: cellStart(range, 6),
    endAt: cellStart(range, 8),
    source: 'manual',
  }

  test('tapping a block in scroll mode reports it', () => {
    const onBlockTap = vi.fn()
    setup({ blocks: [block], onBlockTap })
    fireEvent.click(document.querySelector('[data-cell="7"]')!)
    expect(onBlockTap).toHaveBeenCalledWith(block)
  })

  test('tapping an empty cell reports nothing', () => {
    const onBlockTap = vi.fn()
    setup({ blocks: [block], onBlockTap })
    fireEvent.click(document.querySelector('[data-cell="20"]')!)
    expect(onBlockTap).not.toHaveBeenCalled()
  })

  test('in paint mode a click does not open the block', () => {
    const onBlockTap = vi.fn()
    setup({ blocks: [block], onBlockTap, activeActivityId: 'a1' })
    fireEvent.click(document.querySelector('[data-cell="7"]')!)
    expect(onBlockTap).not.toHaveBeenCalled()
  })
})
