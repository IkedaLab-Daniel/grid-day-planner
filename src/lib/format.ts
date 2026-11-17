export function formatMinutes(total: number): string {
  const m = Math.abs(Math.round(total))
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (h === 0) return `${rest}m`
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`
}

export function formatDiff(diff: number): string {
  if (diff === 0) return '0m'
  return `${diff > 0 ? '+' : '-'}${formatMinutes(diff)}`
}
