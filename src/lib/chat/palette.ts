/** Colours for activities created by chat; none collide with the six seed colours. */
export const PALETTE: string[] = [
  '#E91E63',
  '#009688',
  '#FF9800',
  '#9C27B0',
  '#795548',
  '#3F51B5',
  '#00BCD4',
  '#607D8B',
]

export function pickColor(used: string[]): string {
  const taken = new Set(used.map((c) => c.toLowerCase()))
  return PALETTE.find((c) => !taken.has(c.toLowerCase())) ?? PALETTE[used.length % PALETTE.length]
}
