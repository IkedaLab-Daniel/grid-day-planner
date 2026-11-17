'use client'

import { useState } from 'react'
import { computeTotals } from '@/lib/blocks/totals'
import { ActivityPicker } from '@/components/day/ActivityPicker'
import { DayGrid } from '@/components/day/DayGrid'
import { TotalsStrip } from '@/components/day/TotalsStrip'
import type { Activity, Block, DayRange, Kind } from '@/lib/types'

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
}

const LAYERS: { kind: Kind; label: string }[] = [
  { kind: 'plan', label: 'Plan' },
  { kind: 'actual', label: 'Actual' },
]

export function DayView({ dateKey, range, tz, blocks, activities, paint }: DayViewProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [layer, setLayer] = useState<Kind>('plan')
  const totals = computeTotals(blocks, range)

  return (
    <div data-testid="day-view" data-active-layer={layer} className="flex flex-col gap-4">
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
              blocks={blocks}
              activities={activities}
              activeActivityId={activeId}
              onPaint={({ startCell, endCell }) => {
                if (activeId) void paint({ dateKey, kind: l.kind, activityId: activeId, startCell, endCell })
              }}
            />
          </section>
        ))}
      </div>

      <TotalsStrip totals={totals} activities={activities} />
    </div>
  )
}
