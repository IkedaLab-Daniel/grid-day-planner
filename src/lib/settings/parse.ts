import type { ActivityInput } from '@/lib/db/activities'
import type { Category } from '@/lib/types'
import { isValidActivityName, isValidHexColor } from '@/lib/settings/validate'

export const CATEGORIES: Category[] = ['study', 'sleep', 'exercise', 'meal', 'caffeine', 'other']

export function parseActivityForm(fd: FormData): ActivityInput {
  const name = String(fd.get('name') ?? '').trim()
  const color = String(fd.get('color') ?? '')
  const category = String(fd.get('category') ?? '') as Category
  const gradient = fd.get('gradient') === 'on'
  const colorTo = gradient ? String(fd.get('colorTo') ?? '') : null

  if (!isValidActivityName(name)) throw new Error('Invalid activity name')
  if (!isValidHexColor(color)) throw new Error('Invalid colour')
  if (colorTo !== null && !isValidHexColor(colorTo)) throw new Error('Invalid second colour')
  if (!CATEGORIES.includes(category)) throw new Error('Invalid category')
  return { name, color, colorTo, category }
}
