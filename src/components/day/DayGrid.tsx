'use client'

import { useRef, useState } from 'react'
import {
  CELLS_PER_ROW,
  cellCount,
  cellFromPoint,
  cellIndexOf,
  rowLabel,
} from '@/lib/grid/grid'
import type { Activity, Block, DayRange, Kind } from '@/lib/types'

export interface DayGridProps {
  range: DayRange
  tz: string
  layer: Kind
  blocks: Block[]
  activities: Activity[]
  activeActivityId: string | null
  onPaint(p: { startCell: number; endCell: number }): void
  onBlockTap?(block: Block): void
}

interface CellFill {
  activity: Activity
  block: Block
  /** 0..1 position within its block, for gradients */
  t: number
}

function fillFor(a: Activity, t: number): string {
  return a.colorTo
    ? `color-mix(in srgb, ${a.color} ${Math.round((1 - t) * 100)}%, ${a.colorTo} ${Math.round(t * 100)}%)`
    : a.color
}

export function DayGrid({ range, tz, layer, blocks, activities, activeActivityId, onPaint, onBlockTap }: DayGridProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ start: number; current: number } | null>(null)
  const count = cellCount(range)
  const rows = Math.ceil(count / CELLS_PER_ROW)
  const mode = activeActivityId ? 'paint' : 'scroll'
  const byId = new Map(activities.map((a) => [a.id, a]))

  const fills: (CellFill | undefined)[] = new Array(count)
  for (const b of blocks) {
    if (b.kind !== layer) continue
    const activity = byId.get(b.activityId)
    if (!activity) continue
    const from = Math.max(cellIndexOf(range, b.startAt), 0)
    const to = Math.min(cellIndexOf(range, b.endAt), count)
    for (let i = from; i < to; i++) {
      fills[i] = { activity, block: b, t: to - from <= 1 ? 0 : (i - from) / (to - from - 1) }
    }
  }

  const active = activeActivityId ? byId.get(activeActivityId) : undefined
  const lo = drag ? Math.min(drag.start, drag.current) : -1
  const hi = drag ? Math.max(drag.start, drag.current) : -1

  const cellAt = (e: React.PointerEvent) =>
    cellFromPoint(ref.current!.getBoundingClientRect(), e.clientX, e.clientY, count)

  return (
    <div className="flex gap-1 select-none">
      <div className="flex flex-col pt-5 text-right text-xs text-muted-foreground" aria-hidden>
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex h-8 w-6 items-center justify-end pr-1">
            {rowLabel(range, r, tz)}
          </div>
        ))}
      </div>
      <div className="flex-1">
        <div className="flex h-5 justify-between text-xs text-muted-foreground" aria-hidden>
          <span>01</span>
          <span>59</span>
        </div>
        <div
          ref={ref}
          data-testid="grid"
          data-mode={mode}
          className="grid auto-rows-[2rem] grid-cols-6 border border-foreground/60"
          style={{ touchAction: mode === 'paint' ? 'none' : 'pan-y' }}
          onPointerDown={(e) => {
            if (mode !== 'paint') return
            e.currentTarget.setPointerCapture?.(e.pointerId)
            const c = cellAt(e)
            setDrag({ start: c, current: c })
          }}
          onPointerMove={(e) => {
            if (drag) setDrag({ ...drag, current: cellAt(e) })
          }}
          onPointerUp={(e) => {
            if (!drag) return
            onPaint({ startCell: drag.start, endCell: cellAt(e) })
            setDrag(null)
          }}
          onPointerCancel={() => setDrag(null)}
        >
          {Array.from({ length: count }, (_, i) => {
            const fill = fills[i]
            const preview = i >= lo && i <= hi && active
            const background = preview ? fillFor(active, 0) : fill ? fillFor(fill.activity, fill.t) : undefined
            return (
              <div
                key={i}
                data-cell={i}
                data-activity={fill?.activity.id}
                onClick={() => mode === 'scroll' && fill && onBlockTap?.(fill.block)}
                className={`border border-foreground/20 ${preview ? 'opacity-70' : ''}`}
                style={background ? { background } : undefined}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
