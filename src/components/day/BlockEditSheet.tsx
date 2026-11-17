'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cellCount, cellIndexOf, cellStart, isOnGrid } from '@/lib/grid/grid'
import type { Block, DayRange } from '@/lib/types'

export interface BlockEditSheetProps {
  block: Block
  range: DayRange
  tz: string
  onSave(startAt: Date, endAt: Date): void
  onDelete(): void
  onClose(): void
}

export function BlockEditSheet({ block, range, tz, onSave, onDelete, onClose }: BlockEditSheetProps) {
  const count = cellCount(range)
  const [start, setStart] = useState(Math.max(cellIndexOf(range, block.startAt), 0))
  const [end, setEnd] = useState(Math.min(cellIndexOf(range, block.endAt), count))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const fmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz })
  const label = (i: number) => fmt.format(cellStart(range, i))
  const valid = isOnGrid(range, cellStart(range, start), cellStart(range, end))

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit block"
        className="w-full max-w-sm rounded-t-lg bg-background p-4 shadow-lg md:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 font-medium">Edit block</h2>
        <div className="mb-4 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Start
            <select className="rounded border px-2 py-1" value={start} onChange={(e) => setStart(Number(e.target.value))}>
              {Array.from({ length: count }, (_, i) => (
                <option key={i} value={i}>
                  {label(i)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            End
            <select className="rounded border px-2 py-1" value={end} onChange={(e) => setEnd(Number(e.target.value))}>
              {Array.from({ length: count }, (_, i) => i + 1).map((i) => (
                <option key={i} value={i}>
                  {label(i)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex justify-between gap-2">
          <Button type="button" variant="destructive" onClick={onDelete}>
            Delete
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" disabled={!valid} onClick={() => onSave(cellStart(range, start), cellStart(range, end))}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
