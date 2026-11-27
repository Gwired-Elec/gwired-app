import { describe, expect, it } from 'vitest'
import { buildIcs, eventDays, mondayOf, nextDue, type CalEvent, type Todo } from './data'

describe('repeating to-dos', () => {
  it('daily and weekly', () => {
    expect(nextDue('2026-11-27', 'daily')).toBe('2026-11-28')
    expect(nextDue('2026-11-27', 'weekly')).toBe('2026-12-04')
  })
  it('monthly keeps the day, or the last day of a shorter month', () => {
    expect(nextDue('2026-11-15', 'monthly')).toBe('2026-12-15')
    expect(nextDue('2026-01-31', 'monthly')).toBe('2026-02-28')
    expect(nextDue('2026-12-31', 'monthly')).toBe('2027-01-31')
  })
  it('none stays put', () => expect(nextDue('2026-11-27', 'none')).toBe('2026-11-27'))
})

describe('diary dates', () => {
  it('week starts on Monday', () => {
    expect(mondayOf('2026-11-27')).toBe('2026-11-23') // a Friday
    expect(mondayOf('2026-11-29')).toBe('2026-11-23') // a Sunday
    expect(mondayOf('2026-11-23')).toBe('2026-11-23')
  })
  it('a multi-day event lists every day', () => {
    const e = { event_date: '2026-11-27', end_date: '2026-11-29' } as CalEvent
    expect(eventDays(e)).toEqual(['2026-11-27', '2026-11-28', '2026-11-29'])
    expect(eventDays({ event_date: '2026-11-27', end_date: null } as CalEvent)).toEqual(['2026-11-27'])
  })
})

describe('calendar file', () => {
  it('writes timed and all-day entries, and leaves to-dos out', () => {
    const ev = [
      { id: 'a', title: 'Site, survey', event_date: '2026-11-27', end_date: null, all_day: false, start_time: '09:30', end_time: '11:00', location: '2 Low Rd', job_id: 'j', notes: null },
      { id: 'b', title: 'Delivery', event_date: '2026-11-28', end_date: '2026-11-29', all_day: true, start_time: null, end_time: null, location: null, job_id: null, notes: 'Rexel' },
    ] as unknown as CalEvent[]
    const td = [{ id: 'c', title: 'Order cable', due_date: '2026-12-01', done_at: null, show_in_diary: true, job_id: null, notes: null }] as unknown as Todo[]
    const ics = buildIcs(ev, td, (id) => (id ? 'GW-001 Rewire' : ''), new Date('2026-11-27T10:00:00Z'))
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('SUMMARY:Site\\, survey')
    expect(ics).toContain('DTSTART:20261127T093000')
    expect(ics).toContain('DTEND:20261127T110000')
    expect(ics).toContain('DTSTART;VALUE=DATE:20261128')
    expect(ics).toContain('DTEND;VALUE=DATE:20261130')
    expect(ics).not.toContain('Order cable')
    expect(ics).toContain('DESCRIPTION:GW-001 Rewire')
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })
})
