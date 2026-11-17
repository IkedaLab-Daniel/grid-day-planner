import { formatDiff, formatMinutes } from '@/lib/format'
import type { Totals } from '@/lib/blocks/totals'
import type { Activity } from '@/lib/types'

export function TotalsStrip({ totals, activities }: { totals: Totals; activities: Activity[] }) {
  const rows = activities.filter((a) => totals[a.id])
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Nothing planned yet</p>
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-muted-foreground">
          <th className="font-normal">Activity</th>
          <th className="font-normal">Plan</th>
          <th className="font-normal">Actual</th>
          <th className="font-normal">Diff</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((a) => {
          const t = totals[a.id]
          return (
            <tr key={a.id}>
              <td>{a.name}</td>
              <td>{formatMinutes(t.plannedMin)}</td>
              <td>{formatMinutes(t.actualMin)}</td>
              <td>{formatDiff(t.diffMin)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
