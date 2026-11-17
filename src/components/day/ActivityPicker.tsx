'use client'

import type { Activity } from '@/lib/types'

export function ActivityPicker({
  activities,
  activeId,
  onChange,
}: {
  activities: Activity[]
  activeId: string | null
  onChange(id: string | null): void
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Activities">
      {activities
        .filter((a) => !a.archivedAt)
        .map((a) => {
          const pressed = a.id === activeId
          return (
            <button
              key={a.id}
              type="button"
              aria-pressed={pressed}
              onClick={() => onChange(pressed ? null : a.id)}
              className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${pressed ? 'border-foreground ring-2 ring-foreground/40' : 'border-foreground/20'}`}
            >
              <span
                className="inline-block size-3 rounded-full"
                style={{ background: a.colorTo ? `linear-gradient(to right, ${a.color}, ${a.colorTo})` : a.color }}
              />
              {a.name}
            </button>
          )
        })}
    </div>
  )
}
