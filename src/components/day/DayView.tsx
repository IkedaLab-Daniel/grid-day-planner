'use client'

import { useOptimistic, useState, useTransition } from 'react'
import { applyPaintResult, paintBlocks } from '@/lib/blocks/paint'
import { computeTotals } from '@/lib/blocks/totals'
import { rangeFromCells } from '@/lib/grid/grid'
import { ActivityPicker } from '@/components/day/ActivityPicker'
import { BlockEditSheet } from '@/components/day/BlockEditSheet'
import { DayGrid } from '@/components/day/DayGrid'
import { TotalsStrip } from '@/components/day/TotalsStrip'
import type { Activity, Block, DayRange, Kind, NewBlock } from '@/lib/types'

export interface PaintInput {
  dateKey: string
  kind: Kind
  activityId: string
  startCell: number
  endCell: number
}

export interface DayViewProps {
  dateKey: string
  range: DayRange
  tz: string
  blocks: Block[]
  activities: Activity[]
  paint(input: PaintInput): Promise<void>
  updateBlock(input: { id: string; startAt: string; endAt: string }): Promise<void>
  deleteBlock(id: string): Promise<void>
}

const LAYERS: { kind: Kind; label: string }[] = [
  { kind: 'plan', label: 'Plan' },
  { kind: 'actual', label: 'Actual' },
]

export function DayView({ dateKey, range, tz, blocks, activities, paint, updateBlock, deleteBlock }: DayViewProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [layer, setLayer] = useState<Kind>('plan')
  const [editing, setEditing] = useState<Block | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const [shown, addOptimistic] = useOptimistic(blocks, (current: Block[], painted: NewBlock) =>
    applyPaintResult(current, paintBlocks(current, painted)),
  )
  const totals = computeTotals(shown, range)

  const SAVE_ERROR = 'Could not save. Check your connection and try again.'

  return (
    <div data-testid="day-view" data-active-layer={layer} className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      <ActivityPicker activities={activities} activeId={activeId} onChange={setActiveId} />

      <div className="flex gap-2 md:hidden" role="group" aria-label="Layer">
        {LAYERS.map((l) => (
          <button
            key={l.kind}
            type="button"
            aria-pressed={layer === l.kind}
            onClick={() => setLayer(l.kind)}
            className={`flex-1 rounded border px-3 py-1 ${layer === l.kind ? 'bg-foreground text-background' : ''}`}
          >
            {l.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {LAYERS.map((l) => (
          <section key={l.kind} data-layer={l.kind} className={layer === l.kind ? '' : 'hidden md:block'}>
            <h2 className="mb-1 hidden text-sm font-medium md:block">{l.label}</h2>
            <DayGrid
              range={range}
              tz={tz}
              layer={l.kind}
              blocks={shown}
              activities={activities}
              activeActivityId={activeId}
              onBlockTap={setEditing}
              onPaint={({ startCell, endCell }) => {
                if (!activeId) return
                const { start, end } = rangeFromCells(range, startCell, endCell)
                setError(null)
                startTransition(async () => {
                  addOptimistic({ activityId: activeId, kind: l.kind, startAt: start, endAt: end, source: 'manual' })
                  try {
                    await paint({ dateKey, kind: l.kind, activityId: activeId, startCell, endCell })
                  } catch {
                    setError(SAVE_ERROR)
                  }
                })
              }}
            />
          </section>
        ))}
      </div>

      <TotalsStrip totals={totals} activities={activities} />

      {editing && (
        <BlockEditSheet
          key={editing.id}
          block={editing}
          range={range}
          tz={tz}
          error={editError}
          onClose={() => {
            setEditing(null)
            setEditError(null)
          }}
          onSave={async (startAt, endAt) => {
            try {
              await updateBlock({ id: editing.id, startAt: startAt.toISOString(), endAt: endAt.toISOString() })
              setEditing(null)
              setEditError(null)
            } catch {
              setEditError(SAVE_ERROR)
            }
          }}
          onDelete={async () => {
            try {
              await deleteBlock(editing.id)
              setEditing(null)
              setEditError(null)
            } catch {
              setEditError(SAVE_ERROR)
            }
          }}
        />
      )}
    </div>
  )
}
