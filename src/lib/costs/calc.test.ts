import { describe, expect, it } from 'vitest'
import { budgetOf, eventDays, labourRows, summarise, type CCost, type CEvent } from './calc'

const ev = (o: Partial<CEvent>): CEvent => ({ id: 'e1', title: 'First fix', event_date: '2026-11-23', end_date: null, all_day: true, start_time: null, end_time: null, assigned_to: 'p1', ...o })
const cost = (o: Partial<CCost>): CCost => ({ id: 'c1', job_id: 'j', kind: 'material', status: 'actual', description: '', supplier: null, person: null, days: null, rate_pence: null, amount_pence: 0, cost_date: null, source_event_id: null, notes: null, ...o })
const TODAY = '2026-11-27'
const RATE = 200_00

describe('days from the diary', () => {
  it('one all-day entry is one day', () => expect(eventDays(ev({}), TODAY)).toEqual({ done: 1, planned: 0 }))
  it('a multi-day entry counts each day, split at today', () => {
    expect(eventDays(ev({ event_date: '2026-11-25', end_date: '2026-11-30' }), TODAY)).toEqual({ done: 3, planned: 3 })
  })
  it('a future entry is all planned', () => expect(eventDays(ev({ event_date: '2026-12-01' }), TODAY)).toEqual({ done: 0, planned: 1 }))
  it('a timed entry is hours over eight, never more than a day', () => {
    expect(eventDays(ev({ all_day: false, start_time: '08:00', end_time: '12:00' }), TODAY).done).toBe(0.5)
    expect(eventDays(ev({ all_day: false, start_time: '07:00', end_time: '18:00' }), TODAY).done).toBe(1)
  })
})

describe('labour from the diary, overruled by hand', () => {
  it('uses the diary at the default day cost', () => {
    const rows = labourRows([ev({ event_date: '2026-11-25', end_date: '2026-11-26' })], [], RATE, TODAY)
    expect(rows[0]).toMatchObject({ source: 'diary', days: 2, amount: 400_00 })
  })
  it('a changed row replaces the diary figures', () => {
    const o = cost({ kind: 'labour', source_event_id: 'e1', days: 3, rate_pence: 250_00, amount_pence: 750_00 })
    const rows = labourRows([ev({})], [o], RATE, TODAY)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ source: 'changed', days: 3, amount: 750_00 })
  })
  it('"not worked" is zero days', () => {
    const o = cost({ kind: 'labour', source_event_id: 'e1', days: 0, rate_pence: RATE, amount_pence: 0 })
    expect(labourRows([ev({})], [o], RATE, TODAY)[0].amount).toBe(0)
  })
  it('time added by hand is included', () => {
    const m = cost({ id: 'm1', kind: 'labour', days: 2, rate_pence: 180_00, amount_pence: 360_00, cost_date: '2026-11-20', person: 'Sam' })
    const rows = labourRows([], [m], RATE, TODAY)
    expect(rows[0]).toMatchObject({ source: 'manual', amount: 360_00 })
  })
})

describe('budget and totals', () => {
  it('splits the estimate cost into materials, labour and other', () => {
    const b = budgetOf([
      { kind: 'material', qty: 10, unit_cost: 5_00, hours_per_unit: 0.5, labour_cost_hr_pence: 20_00 },
      { kind: 'point', qty: 4, unit_cost: 30_00, hours_per_unit: 0, labour_cost_hr_pence: 0 },
      { kind: 'prelim', qty: 1, unit_cost: 100_00, hours_per_unit: 0, labour_cost_hr_pence: 0 },
    ])
    expect(b).toEqual({ materials: 50_00, labour: 100_00 + 120_00, other: 100_00, total: 370_00 })
  })
  it('adds up actual, still to buy and planned', () => {
    const rows = labourRows([ev({}), ev({ id: 'e2', event_date: '2026-12-01' })], [], RATE, TODAY)
    const s = summarise(rows, [
      cost({ id: 'a', kind: 'material', amount_pence: 300_00 }),
      cost({ id: 'b', kind: 'material', status: 'needed', amount_pence: 150_00 }),
      cost({ id: 'c', kind: 'misc', amount_pence: 40_00 }),
      cost({ id: 'd', kind: 'non_recoverable', amount_pence: 60_00 }),
    ])
    expect(s).toMatchObject({ labour: 200_00, materials: 300_00, misc: 40_00, nonRecoverable: 60_00, actual: 600_00, stillToBuy: 150_00, plannedLabour: 200_00, forecast: 950_00 })
  })
})
