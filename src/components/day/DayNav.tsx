'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { shiftDateKey } from '@/lib/time/day'

export function DayNav({ dateKey, todayKey }: { dateKey: string; todayKey: string }) {
  const router = useRouter()
  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label="Day navigation">
      <Link className="rounded border px-3 py-1" href={`/day/${shiftDateKey(dateKey, -1)}`}>
        ‹ Prev
      </Link>
      <Link className="rounded border px-3 py-1" href={`/day/${todayKey}`}>
        Today
      </Link>
      <Link className="rounded border px-3 py-1" href={`/day/${shiftDateKey(dateKey, 1)}`}>
        Next ›
      </Link>
      <input
        type="date"
        aria-label="Pick a date"
        className="rounded border px-2 py-1"
        value={dateKey}
        onChange={(e) => e.target.value && router.push(`/day/${e.target.value}`)}
      />
    </nav>
  )
}
