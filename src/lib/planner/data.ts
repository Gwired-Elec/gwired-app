// To-dos and the diary: types, live queries (from the local database, so they work offline), date helpers and the automatic
// reminders worked out from jobs (chase dates, quotes about to run out).
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Row } from '../sync/db'

export type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly'
export interface Todo extends Row {
  title: string; notes: string | null; job_id: string | null; assigned_to: string | null; due_date: string | null
  recurrence: Recurrence; show_in_diary: boolean; done_at: string | null; created_by: string | null
}
export interface CalEvent extends Row {
  title: string; notes: string | null; location: string | null; job_id: string | null; assigned_to: string | null
  event_date: string; end_date: string | null; all_day: boolean; start_time: string | null; end_time: string | null; created_by: string | null
}
export interface Reminder { key: string; date: string; text: string; job_id: string }

const alive = (r: Row) => !r.deleted_at
export const useTodos = () => useLiveQuery(() => db().todos.filter(alive).toArray() as unknown as Promise<Todo[]>, [])
export const useEvents = () => useLiveQuery(() => db().calendar_events.filter(alive).toArray() as unknown as Promise<CalEvent[]>, [])

// ---------------------------------------------------------------- dates (all in the phone's own timezone, as plain YYYY-MM-DD)
export const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const todayIso = () => isoDate(new Date())
export const parseIso = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d) }
export const addDaysIso = (s: string, n: number) => { const d = parseIso(s); d.setDate(d.getDate() + n); return isoDate(d) }
export const mondayOf = (s: string) => { const d = parseIso(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoDate(d) }
export const newDayLabel = (s: string) => parseIso(s).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
export const dayLabel = (s: string) => parseIso(s).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
export const shortDay = (s: string) => parseIso(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

// the next date a repeating to-do falls due (monthly keeps the day, or the last day of a shorter month)
export function nextDue(from: string, rec: Recurrence): string {
  if (rec === 'daily') return addDaysIso(from, 1)
  if (rec === 'weekly') return addDaysIso(from, 7)
  if (rec === 'monthly') {
    const d = parseIso(from)
    const day = d.getDate()
    const n = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    const last = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate()
    n.setDate(Math.min(day, last))
    return isoDate(n)
  }
  return from
}

// an event runs from event_date to end_date (the same day when there is no end date)
export const eventDays = (e: CalEvent) => {
  const out: string[] = []
  const end = e.end_date && e.end_date > e.event_date ? e.end_date : e.event_date
  for (let d = e.event_date; d <= end && out.length < 60; d = addDaysIso(d, 1)) out.push(d)
  return out
}
export const timeText = (e: CalEvent) => (e.all_day || !e.start_time ? 'All day' : e.end_time ? `${e.start_time} to ${e.end_time}` : e.start_time)

// ---------------------------------------------------------------- automatic reminders (nothing to type: worked out from the jobs)
export function useReminders(): Reminder[] {
  return (
    useLiveQuery(async () => {
      const statuses = (await db().job_statuses.toArray()).filter(alive)
      const asks = new Set(statuses.filter((s) => s.asks_chase).map((s) => String(s.slug)))
      const jobs = (await db().jobs.filter(alive).toArray()).filter((j) => asks.has(String(j.status)))
      const out: Reminder[] = []
      for (const j of jobs) {
        const name = `${j.job_number ?? ''} ${j.title ?? ''}`.trim()
        if (j.chase_date) out.push({ key: 'c' + j.id, date: String(j.chase_date).slice(0, 10), text: `Chase ${name}`, job_id: j.id })
      }
      const fin = await db().job_financials.toArray()
      for (const f of fin.filter(alive)) {
        const j = jobs.find((x) => x.id === f.id)
        if (j && f.valid_until) out.push({ key: 'v' + j.id, date: String(f.valid_until).slice(0, 10), text: `Quote runs out: ${`${j.job_number ?? ''} ${j.title ?? ''}`.trim()}`, job_id: j.id })
      }
      return out
    }, []) ?? []
  )
}

// ---------------------------------------------------------------- diary file (.ics) for Outlook, Google and Apple calendars
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
const ymd = (s: string) => s.replace(/-/g, '')
// to-dos are deliberately not written to the calendar file (the second argument is kept so callers need not change)
export function buildIcs(events: CalEvent[], _todos: Todo[], jobName: (id: string | null) => string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//G|Wired Electrical Services//Diary//EN', 'CALSCALE:GREGORIAN']
  for (const e of events) {
    const job = jobName(e.job_id)
    out.push('BEGIN:VEVENT', `UID:${e.id}@gwired`, `DTSTAMP:${stamp}`, `SUMMARY:${esc(e.title)}`)
    if (e.all_day || !e.start_time) {
      out.push(`DTSTART;VALUE=DATE:${ymd(e.event_date)}`, `DTEND;VALUE=DATE:${ymd(addDaysIso(e.end_date && e.end_date > e.event_date ? e.end_date : e.event_date, 1))}`)
    } else {
      const day = ymd(e.event_date)
      const st = e.start_time.replace(':', '') + '00'
      const en = (e.end_time ?? e.start_time).replace(':', '') + '00'
      out.push(`DTSTART:${day}T${st}`, `DTEND:${ymd(e.end_date && e.end_date > e.event_date ? e.end_date : e.event_date)}T${en}`)
    }
    if (e.location) out.push(`LOCATION:${esc(e.location)}`)
    const desc = [job, e.notes].filter(Boolean).join('\n')
    if (desc) out.push(`DESCRIPTION:${esc(desc)}`)
    out.push('END:VEVENT')
  }
  out.push('END:VCALENDAR')
  return out.join('\r\n') + '\r\n'
}
