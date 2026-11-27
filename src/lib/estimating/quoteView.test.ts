import { describe, expect, it } from 'vitest'
import { buildQuoteSnapshot } from './quoteView'
import { starterTodos, STARTER_TODOS } from '../planner/starter'
import type { Estimate, Line, Section } from './estimates'

const est = { id: 'e', job_id: 'j', rev: 2, status: 'issued', method: 'units', labour_rate_id: null, ohp_mode: 'combined', ohp_pct: 20, ohp_materials_pct: 20, ohp_labour_pct: 20, contingency_pct: 0, discount_pct: 0, vat_rate: 20, reverse_charge: false, notes: 'Note', issued_at: null } as unknown as Estimate
const sections = [{ id: 's1', estimate_id: 'e', name: 'Lighting', sort: 10 }, { id: 's2', estimate_id: 'e', name: 'Empty', sort: 20 }, { id: 's3', estimate_id: 'e', name: 'Power', sort: 30 }] as unknown as Section[]
const line = (id: string, section_id: string, sort: number, qty: number) => ({ id, estimate_id: 'e', section_id, sort, kind: 'item', description: id, qty, unit: 'each', unit_cost: 700, unit_sell: 1111, hours_per_unit: 0, labour_cost_hr_pence: 0, labour_charge_hr_pence: 0, notes: null })
const lines = [line('a', 's1', 1, 3), line('b', 's1', 2, 7), line('c', 's3', 1, 2)] as unknown as Line[]
const input = { company: { name: 'G|Wired', valid_days: 30, terms: 'Pay in 30 days' }, job: { job_number: 'GW-1', title: 'Rewire', site_address: '1 High St' }, client: { name: 'Mr Smith' }, estimate: est, sections, lines, clauses: [{ kind: 'exclusion' as const, title: 'x', body: 'No decoration', sort: 1 }], date: new Date(2026, 10, 27) }

describe('quote snapshot (what the client sees on the link)', () => {
  it('lines and sections add up to the net, skipping empty sections', () => {
    const s = buildQuoteSnapshot({ ...input, detail: 'lines' })
    expect(s.sections.map((x) => x.code)).toEqual(['A', 'B'])
    expect(s.sections.reduce((a, x) => a + x.total, 0)).toBe(s.net)
    expect(s.sections[0].lines.reduce((a, l) => a + l.amount, 0)).toBe(s.sections[0].total)
    expect(s.total).toBe(s.net + s.vat)
    expect(s.ref).toBe('GW-1 rev B')
    expect(s.validUntil).toBe('2026-12-27')
    expect(s.exclusions).toEqual(['No decoration'])
    expect(s.notes).toEqual(['Note', 'Pay in 30 days'])
  })
  it('section-only detail has no lines but the same totals', () => {
    const a = buildQuoteSnapshot({ ...input, detail: 'lines' })
    const b = buildQuoteSnapshot({ ...input, detail: 'sections' })
    expect(b.sections.every((x) => x.lines.length === 0)).toBe(true)
    expect(b.net).toBe(a.net)
  })
  it('never carries cost figures', () => {
    expect(JSON.stringify(buildQuoteSnapshot({ ...input, detail: 'lines' }))).not.toMatch(/unit_cost|margin|cost/i)
  })
})

describe('starter checklist', () => {
  it('dates are counted from today', () => {
    const t = starterTodos('2026-11-27', [])
    expect(t).toHaveLength(STARTER_TODOS.length)
    expect(t[0].due_date).toBe('2026-11-28')
  })
  it('does not double up on ones the job already has', () => {
    const t = starterTodos('2026-11-27', ['confirm the start date with the client ', 'Something else'])
    expect(t).toHaveLength(STARTER_TODOS.length - 1)
  })
})
