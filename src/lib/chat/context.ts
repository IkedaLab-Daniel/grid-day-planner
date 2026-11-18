import { describeNow } from '@/lib/chat/time'
import { getDay, type BlockView, type ToolContext } from '@/lib/chat/tools'
import type { Category, Profile } from '@/lib/types'

export interface DayContext {
  now: Date
  profile: Profile
  dayKey: string
  actual: BlockView[]
  plan: BlockView[]
  /** Non-archived activities only. */
  activities: { name: string; category: Category }[]
}

export async function loadDayContext(ctx: ToolContext): Promise<DayContext> {
  const day = await getDay(ctx, {})
  if (!day.ok) throw new Error(`Could not load the day: ${day.error}`)
  return {
    now: ctx.now,
    profile: ctx.profile,
    dayKey: day.date,
    actual: day.actual,
    plan: day.plan,
    activities: day.activities.filter((a) => !a.archived).map(({ name, category }) => ({ name, category })),
  }
}

const line = (b: BlockView) => `- ${b.id} ${b.start}-${b.end} ${b.activity}`

export function buildSystemPrompt(c: DayContext): string {
  const { timezone, dayStart } = c.profile
  const lastEnd = c.actual.length
    ? `Last actual block ends at ${[...c.actual].sort((a, b) => (a.end < b.end ? 1 : -1))[0].end}.`
    : 'No actual blocks logged yet today.'

  return [
    'You are the logging helper inside a day-planner app. The user tells you what they are doing and you record it as ACTUAL time blocks using your tools. Be brief and friendly.',
    '',
    `Right now it is ${describeNow(c.now, timezone)} (timezone ${timezone}).`,
    `Today's grid day is ${c.dayKey}. A day starts at ${dayStart}, so times earlier than ${dayStart} belong to the previous day's grid. Time is a grid of 10-minute cells: a start is rounded down to its cell and an end is rounded up.`,
    '',
    'Activities (name (category)):',
    ...c.activities.map((a) => `- ${a.name} (${a.category})`),
    '',
    "Today's actual blocks (id start-end activity):",
    ...(c.actual.length ? c.actual.map(line) : ['- none']),
    lastEnd,
    '',
    "Today's plan (read-only context; you cannot change plan blocks):",
    ...(c.plan.length ? c.plan.map(line) : ['- none']),
    '',
    'Tools: get_day (re-read a day), log_activity (start a block), set_end (extend or finish the latest block), edit_block, delete_block, create_activity. Block ids change whenever a block is edited, so use the ids listed above or from the latest tool result.',
    '',
    'Rules:',
    '- Act on clear requests with one tool call, then confirm in one short line that repeats the logged times, e.g. "Logged CS50 16:10-16:20".',
    '- If the activity, start time or intent is missing or ambiguous, ask one short question instead of guessing. If you cannot tell whether the user is extending the current block or starting something new, ask.',
    '- Before logging a block that starts after the previous one ended, ask what the user was doing in the gap. If the tool answers GAP, ask "what were you doing <from>-<to>?". Log what they answer; use gap "skip" only when they say it was nothing or to skip.',
    '- "Still on it" extends the latest block with set_end; "done" or "stopped at <time>" finishes it.',
    '- Never delete or rewrite a block unless the user asked for that change. Never invent entries the user did not describe.',
    '- Only create a new activity after the user agrees to it in chat.',
    '- You cannot plan or change future time; you only record what has already happened.',
  ].join('\n')
}
