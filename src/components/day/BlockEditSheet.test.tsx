import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BlockEditSheet } from '@/components/day/BlockEditSheet'
import { dayRangeFor } from '@/lib/time/day'
import { cellStart } from '@/lib/grid/grid'
import type { Block } from '@/lib/types'

const range = dayRangeFor('2026-08-16', 'UTC', '05:00')
const block: Block = {
  id: 'b1',
  activityId: 'a1',
  kind: 'plan',
  startAt: cellStart(range, 6),
  endAt: cellStart(range, 12),
  source: 'manual',
}

function setup() {
  const onSave = vi.fn()
  const onDelete = vi.fn()
  render(<BlockEditSheet block={block} range={range} tz="UTC" onSave={onSave} onDelete={onDelete} onClose={vi.fn()} />)
  return { onSave, onDelete }
}

describe('BlockEditSheet', () => {
  test('Save is enabled for the block as it is', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  test('Save is disabled when end is not after start', () => {
    setup()
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '6' } })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  test('Save passes the chosen cell boundaries', () => {
    const { onSave } = setup()
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '18' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(cellStart(range, 6), cellStart(range, 18))
  })

  test('Delete calls onDelete', () => {
    const { onDelete } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  test('options are labelled in the profile timezone', () => {
    setup()
    expect(screen.getByLabelText('Start')).toHaveDisplayValue('06:00')
  })
})
