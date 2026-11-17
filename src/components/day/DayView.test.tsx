import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
