export type Kind = 'plan' | 'actual'

export type Category =
  | 'study'
  | 'sleep'
  | 'exercise'
  | 'meal'
  | 'caffeine'
  | 'other'

export interface Activity {
  id: string
  name: string
  color: string
  colorTo: string | null
  category: Category
  archivedAt: Date | null
}

export interface Block {
  id: string
  activityId: string
  kind: Kind
  startAt: Date
  endAt: Date
  source: 'manual' | 'ai'
}

export type NewBlock = Omit<Block, 'id'>

export interface DayRange {
  start: Date
  end: Date
}

export interface Profile {
  timezone: string
  /** 'HH:mm' */
  dayStart: string
}
