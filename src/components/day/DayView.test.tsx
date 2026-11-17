import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { DayView } from '@/components/day/DayView'
import { dayRangeFor } from '@/lib/time/day'
import type { Activity } from '@/lib/types'

const range = dayRangeFor('2026-08-16', 'UTC', '05:00')
const activities: Activity[] = [
  { id: 'a1', name: 'CS50', color: '#A6A6A6', colorTo: null, category: 'study', archivedAt: null },
]

function setup() {
  render(
    <DayView dateKey="2026-08-16" range={range} tz="UTC" blocks={[]} activities={activities} paint={vi.fn()} updateBlock={vi.fn()} deleteBlock={vi.fn()} />,
  )
}

describe('DayView', () => {
  test('an empty day shows the grid and an empty-state message', () => {
    setup()
    expect(screen.getAllByTestId('grid').length).toBeGreaterThan(0)
    expect(screen.getByText('Nothing planned yet')).toBeInTheDocument()
  })

  test('the Plan/Actual toggle switches the active layer', () => {
    setup()
    const root = screen.getByTestId('day-view')
    expect(root).toHaveAttribute('data-active-layer', 'plan')
    fireEvent.click(screen.getByRole('button', { name: 'Actual' }))
    expect(root).toHaveAttribute('data-active-layer', 'actual')
  })

  test('selecting an activity chip toggles paint mode on the grids', () => {
    setup()
    const chip = screen.getByRole('button', { name: /CS50/ })
    fireEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByTestId('grid')[0]).toHaveAttribute('data-mode', 'paint')
    fireEvent.click(chip)
    expect(screen.getAllByTestId('grid')[0]).toHaveAttribute('data-mode', 'scroll')
  })
})

describe('DayView saving', () => {
  const at = (i: number) => ({ clientX: (i % 6) * 100 + 50, clientY: Math.floor(i / 6) * 100 + 50 })

  function planGrid() {
    const grid = screen.getAllByTestId('grid')[0]
    grid.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 600, height: 2400, right: 600, bottom: 2400, x: 0, y: 0, toJSON() {} }) as DOMRect
    return grid
  }

  async function drag(grid: HTMLElement, from: number, to: number) {
    await act(async () => {
      fireEvent.pointerDown(grid, { pointerId: 1, ...at(from) })
    })
    await act(async () => {
      fireEvent.pointerUp(grid, { pointerId: 1, ...at(to) })
    })
  }

  test('painted cells show immediately while the save is still pending', async () => {
    // React entangles async actions, so a save that never settles would leak into later tests: release it.
    let release!: () => void
    render(
      <DayView dateKey="2026-08-16" range={range} tz="UTC" blocks={[]} activities={activities}
        paint={() => new Promise<void>((resolve) => { release = resolve })} updateBlock={vi.fn()} deleteBlock={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /CS50/ }))
    await drag(planGrid(), 2, 4)
    const grid = screen.getAllByTestId('grid')[0]
    expect(grid.querySelectorAll('[data-activity="a1"]')).toHaveLength(3)
    await act(async () => release())
  })

  test('a failed paint shows an alert and the cells go back', async () => {
    render(
      <DayView dateKey="2026-08-16" range={range} tz="UTC" blocks={[]} activities={activities}
        paint={() => Promise.reject(new Error('boom'))} updateBlock={vi.fn()} deleteBlock={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /CS50/ }))
    await drag(planGrid(), 2, 4)
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not save/i)
    await waitFor(() =>
      expect(screen.getAllByTestId('grid')[0].querySelectorAll('[data-activity]')).toHaveLength(0),
    )
  })

  test('a failed edit keeps the sheet open and shows an alert', async () => {
    const block = { id: 'b1', activityId: 'a1', kind: 'plan' as const, startAt: new Date(range.start.getTime() + 6 * 600_000), endAt: new Date(range.start.getTime() + 12 * 600_000), source: 'manual' as const }
    render(
      <DayView dateKey="2026-08-16" range={range} tz="UTC" blocks={[block]} activities={activities}
        paint={vi.fn()} updateBlock={() => Promise.reject(new Error('nope'))} deleteBlock={vi.fn()} />,
    )
    fireEvent.click(screen.getAllByTestId('grid')[0].querySelector('[data-cell="7"]')!)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/could not save/i)
  })
})
