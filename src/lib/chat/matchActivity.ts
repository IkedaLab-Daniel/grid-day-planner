import type { Activity } from '@/lib/types'

export type MatchResult =
  | { kind: 'match'; activity: Activity }
  | { kind: 'ambiguous'; names: string[] }
  | { kind: 'none'; names: string[] }

export const normaliseName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const normalise = normaliseName

/** Match a spoken/typed activity name: exact (normalised) first, then a unique substring. */
export function matchActivity(name: string, activities: Activity[]): MatchResult {
  const live = activities.filter((a) => !a.archivedAt)
  const names = live.map((a) => a.name)
  const q = normalise(name)
  if (!q) return { kind: 'none', names }

  const exact = live.filter((a) => normalise(a.name) === q)
  if (exact.length === 1) return { kind: 'match', activity: exact[0] }
  if (exact.length > 1) return { kind: 'ambiguous', names: exact.map((a) => a.name) }

  const partial = live.filter((a) => normalise(a.name).includes(q))
  if (partial.length === 1) return { kind: 'match', activity: partial[0] }
  if (partial.length > 1) return { kind: 'ambiguous', names: partial.map((a) => a.name) }
  return { kind: 'none', names }
}
