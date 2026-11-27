// Job costs maths: pure functions, so every figure can be tested. Money is whole pence.
//  - BUDGET: what the estimate said the job would cost (materials, labour, other), from the estimate's cost figures.
//  - ACTUAL labour: worked out from the diary (days on site x day cost) unless someone has overruled that diary entry.
//  - ACTUAL materials, misc and non-recoverable costs: typed in. "Needed" materials are not spent yet: they show as still to buy.
import type { Line } from '../estimating/estimates'
import { roundHalfUp } from '../money'

export interface CEvent { id: string; title: string; event_date: string; end_date: string | null; all_day: boolean; start_time: string | null; end_time: string | null; assigned_to: string | null }
export interface CCost {
  id: string; job_id: string; kind: 'labour' | 'material' | 'misc' | 'non_recoverable'; status: 'actual' | 'needed'; description: string; supplier: string | null; person: string | null
  days: number | null; rate_pence: number | null; amount_pence: number; cost_date: string | null; source_event_id: string | null; notes: string | null
  qty?: number | null; unit?: string | null; estimate_line_id?: string | null
}

const dayNum = (s: string) => Date.parse(s.slice(0, 10) + 'T00:00:00Z') / 86_400_000
const hours = (a: string, b: string) => { const [ah, am] = a.split(':').map(Number), [bh, bm] = b.split(':').map(Number); return (bh * 60 + bm - (ah * 60 + am)) / 60 }

// days of work in a diary entry, split into what has happened (up to and including today) and what is still planned
export function eventDays(e: CEvent, today: string): { done: number; planned: number } {
  if (e.all_day || !e.start_time) {
    const last = e.end_date && e.end_date > e.event_date ? e.end_date : e.event_date
    const total = dayNum(last) - dayNum(e.event_date) + 1
    const done = Math.max(0, Math.min(total, dayNum(today) - dayNum(e.event_date) + 1))
    return { done, planned: total - done }
  }
  // a timed entry: eight hours is a full day, never more than one
  const d = e.end_time && hours(e.start_time, e.end_time) > 0 ? Math.min(1, Math.round((hours(e.start_time, e.end_time) / 8) * 100) / 100) : 1
  return e.event_date <= today ? { done: d, planned: 0 } : { done: 0, planned: d }
}

export interface LabourRow {
  key: string
  event: CEvent | null // the diary entry it came from
  cost: CCost | null // the row that overrules (or adds to) the diary
  source: 'diary' | 'changed' | 'manual'
  days: number
  rate: number
  amount: number
  plannedDays: number
  plannedAmount: number
  person: string | null
  date: string
  label: string
}

// every piece of labour on a job: the diary entries (as they stand, or as overruled), plus time added by hand
export function labourRows(events: CEvent[], costs: CCost[], defaultRate: number, today: string): LabourRow[] {
  const rows: LabourRow[] = []
  const over = new Map(costs.filter((c) => c.kind === 'labour' && c.source_event_id).map((c) => [c.source_event_id!, c]))
  for (const e of events) {
    const o = over.get(e.id)
    const { done, planned } = eventDays(e, today)
    if (o) {
      const days = o.days ?? 0, rate = o.rate_pence ?? defaultRate
      rows.push({ key: e.id, event: e, cost: o, source: 'changed', days, rate, amount: o.amount_pence, plannedDays: 0, plannedAmount: 0, person: o.person ?? e.assigned_to, date: e.event_date, label: e.title })
    } else {
      rows.push({ key: e.id, event: e, cost: null, source: 'diary', days: done, rate: defaultRate, amount: roundHalfUp(done * defaultRate), plannedDays: planned, plannedAmount: roundHalfUp(planned * defaultRate), person: e.assigned_to, date: e.event_date, label: e.title })
    }
  }
  for (const c of costs.filter((x) => x.kind === 'labour' && !x.source_event_id)) {
    rows.push({ key: c.id, event: null, cost: c, source: 'manual', days: c.days ?? 0, rate: c.rate_pence ?? defaultRate, amount: c.amount_pence, plannedDays: 0, plannedAmount: 0, person: c.person, date: c.cost_date ?? '', label: c.description || 'Time on site' })
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date))
}

export interface Budget { materials: number; labour: number; other: number; total: number }
// the estimate's cost, by kind of cost. A material line's labour hours count as labour; point and day-rate lines are labour.
export function budgetOf(lines: Pick<Line, 'kind' | 'qty' | 'unit_cost' | 'hours_per_unit' | 'labour_cost_hr_pence'>[]): Budget {
  let materials = 0, labour = 0, other = 0
  for (const l of lines) {
    const hoursCost = l.qty * l.hours_per_unit * l.labour_cost_hr_pence
    if (l.kind === 'material') { materials += l.qty * l.unit_cost; labour += hoursCost }
    else if (l.kind === 'point' || l.kind === 'day') labour += l.qty * l.unit_cost + hoursCost
    else other += l.qty * l.unit_cost + hoursCost
  }
  const m = roundHalfUp(materials), lb = roundHalfUp(labour), o = roundHalfUp(other)
  return { materials: m, labour: lb, other: o, total: m + lb + o }
}

export interface CostSummary {
  labour: number; materials: number; misc: number; nonRecoverable: number
  actual: number // everything spent so far
  stillToBuy: number // materials marked as needed
  plannedLabour: number // diary days that have not happened yet
  forecast: number // actual + still to buy + planned labour
}
export function summarise(rows: LabourRow[], costs: CCost[]): CostSummary {
  const labour = rows.reduce((a, r) => a + r.amount, 0) + 0
  const mine = costs.filter((c) => c.kind !== 'labour')
  const sum = (f: (c: CCost) => boolean) => mine.filter(f).reduce((a, c) => a + c.amount_pence, 0)
  const materials = sum((c) => c.kind === 'material' && c.status === 'actual')
  const misc = sum((c) => c.kind === 'misc' && c.status === 'actual')
  const nonRecoverable = sum((c) => c.kind === 'non_recoverable' && c.status === 'actual')
  const stillToBuy = sum((c) => c.status === 'needed')
  const plannedLabour = rows.reduce((a, r) => a + r.plannedAmount, 0)
  const actual = labour + materials + misc + nonRecoverable
  return { labour, materials, misc, nonRecoverable, actual, stillToBuy, plannedLabour, forecast: actual + stillToBuy + plannedLabour }
}
