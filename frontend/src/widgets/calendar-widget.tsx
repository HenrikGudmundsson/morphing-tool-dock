import { useState } from 'react'

// One week, Monday to Sunday, with made-up events. The schedule is
// generated from the week itself, so a given week always shows the same
// events -- there is no storage behind this.

type CalendarEvent = { time: string; title: string }

const WEEKDAY_EVENTS: CalendarEvent[] = [
  { time: '10:00', title: 'Design review' },
  { time: '11:30', title: '1:1 with Sara' },
  { time: '12:00', title: 'Lunch with Jonas' },
  { time: '13:00', title: 'Sprint planning' },
  { time: '14:00', title: 'Customer call' },
  { time: '15:00', title: 'Demo prep' },
  { time: '16:00', title: 'Retro' },
  { time: '17:30', title: 'Gym' },
]
const WEEKEND_EVENTS: CalendarEvent[] = [
  { time: '09:00', title: 'Long run' },
  { time: '11:00', title: 'Brunch' },
  { time: '14:00', title: 'Hike' },
  { time: '18:00', title: 'Family dinner' },
]

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function startOfWeek(weekOffset: number): Date {
  const day = new Date()
  day.setHours(0, 0, 0, 0)
  // getDay() is 0 for Sunday; shift so Monday starts the week.
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7) + weekOffset * 7)
  return day
}

function isoWeek(date: Date): number {
  // ISO 8601: the week belongs to the year its Thursday falls in.
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7))
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1)
  return Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7)
}

const RELATIVE_LABEL: Record<number, string> = {
  [-1]: 'Last week',
  0: 'This week',
  1: 'Next week',
}

function eventsForWeek(monday: Date): CalendarEvent[][] {
  const random = mulberry32(
    monday.getFullYear() * 10_000 + (monday.getMonth() + 1) * 100 + monday.getDate(),
  )
  const pick = (pool: CalendarEvent[], count: number) => {
    const remaining = [...pool]
    const picked: CalendarEvent[] = []
    for (let i = 0; i < count && remaining.length > 0; i++) {
      picked.push(remaining.splice(Math.floor(random() * remaining.length), 1)[0]!)
    }
    return picked
  }

  return Array.from({ length: 7 }, (_, dayIndex) => {
    const events =
      dayIndex < 5
        ? [{ time: '09:00', title: 'Standup' }, ...pick(WEEKDAY_EVENTS, 1 + Math.floor(random() * 2))]
        : pick(WEEKEND_EVENTS, Math.floor(random() * 2))
    return events.sort((a, b) => a.time.localeCompare(b.time))
  })
}

const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'short' })
const monthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

export function CalendarWidget({ weekOffset }: { weekOffset: number }) {
  // Previous/next step locally from the week the agent (or the tray) asked
  // for; no agent call is needed to look at another week.
  const [offset, setOffset] = useState(weekOffset)

  const monday = startOfWeek(offset)
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    return date
  })
  const events = eventsForWeek(monday)
  const today = new Date().toDateString()

  const stepClass =
    'flex size-7 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100'

  return (
    <div className="@container p-4">
      {/* Right padding keeps clear of the corner glyph and pin/close buttons. */}
      <div className="pr-36">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          showCalendar
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2">
          <h3 className="text-lg font-semibold">
            {RELATIVE_LABEL[offset] ?? `Week ${isoWeek(monday)}`}
          </h3>
          <span className="flex">
            <button
              type="button"
              aria-label="Previous week"
              onClick={() => setOffset(offset - 1)}
              className={stepClass}
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next week"
              onClick={() => setOffset(offset + 1)}
              className={stepClass}
            >
              ›
            </button>
          </span>
        </div>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {monthDay.format(days[0])} – {monthDay.format(days[6])} · week {isoWeek(monday)}
        </p>
      </div>

      <ol className="mt-4 grid gap-2 @lg:grid-cols-7 @lg:gap-1.5">
        {days.map((date, i) => {
          const isToday = date.toDateString() === today
          return (
            <li
              key={date.toISOString()}
              aria-current={isToday ? 'date' : undefined}
              className={`flex gap-3 rounded-md border p-2 @lg:min-h-28 @lg:flex-col @lg:gap-1.5 ${
                isToday
                  ? 'border-blue-600 dark:border-blue-500'
                  : 'border-neutral-200 dark:border-neutral-800'
              }`}
            >
              <p className="w-14 shrink-0 text-xs @lg:w-auto">
                <span className="font-medium">{dayName.format(date)}</span>{' '}
                <span className="tabular-nums text-neutral-500 dark:text-neutral-400">
                  {date.getDate()}
                </span>
                {isToday && <span className="sr-only"> (today)</span>}
              </p>
              {/* Fixed tracks in the list layout, so times line up down the days. */}
              <ul className="grid min-w-0 flex-1 grid-cols-3 gap-1 @lg:flex @lg:flex-col">
                {events[i]!.length === 0 && (
                  <li className="text-xs text-neutral-400 dark:text-neutral-600">–</li>
                )}
                {events[i]!.map((event) => (
                  <li
                    key={event.time + event.title}
                    className="min-w-0 truncate rounded bg-neutral-100 px-1.5 py-1 text-[11px] leading-tight dark:bg-neutral-900"
                  >
                    <span className="tabular-nums text-neutral-500 dark:text-neutral-400">
                      {event.time}
                    </span>{' '}
                    <span className="@lg:block @lg:truncate">{event.title}</span>
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
