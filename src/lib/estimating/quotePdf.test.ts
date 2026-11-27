import { describe, expect, it } from 'vitest'
import { buildQuotePdf, spreadToNet } from './quotePdf'
import type { Estimate, Line, Section } from './estimates'

describe('spreadToNet', () => {
  it('always adds up to the net figure', () => {
    for (const [sells, net] of [[[1000, 2000, 3333], 7777], [[10, 10, 10], 100], [[1], 5], [[5000, 1], 4999]] as [number[], number][]) {
      expect(spreadToNet(sells, net).reduce((a, b) => a + b, 0)).toBe(net)
    }
  })
  it('leaves lines alone when nothing was added', () => expect(spreadToNet([100, 250], 350)).toEqual([100, 250]))
  it('handles no lines and all-zero lines', () => {
    expect(spreadToNet([], 0)).toEqual([])
    expect(spreadToNet([0, 0], 0)).toEqual([0, 0])
  })
})

describe('buildQuotePdf', () => {
  const est = { id: 'e', job_id: 'j', rev: 2, name: null, status: 'draft', method: 'units', labour_rate_id: null, oh_pct: 10, profit_pct: 10, contingency_pct: 0, discount_pct: 0, vat_rate: 20, reverse_charge: false, notes: 'Thanks – “as discussed”.', issued_at: null } as unknown as Estimate
  const sections = [{ id: 's', estimate_id: 'e', name: 'Works', sort: 10 }] as unknown as Section[]
  const lines = Array.from({ length: 80 }, (_, i) => ({ id: 'l' + i, estimate_id: 'e', section_id: 's', sort: i, kind: 'item', description: 'Socket outlet ' + i + ' ' + 'x'.repeat(40), qty: 2, unit: 'each', unit_cost: 500, unit_sell: 800, hours_per_unit: 0, labour_cost_hr_pence: 0, labour_charge_hr_pence: 0 })) as unknown as Line[]
  it('makes a multi-page PDF without crashing, with odd characters', async () => {
    const bytes = await buildQuotePdf({ company: { name: 'G|Wired Electrical Services', terms: 'Payment 30 days…' }, job: { job_number: 'GW-2026-001', title: 'Rewire – 12 High St', site_address: '12 High St' }, client: { name: 'Mr Smith' }, estimate: est, sections, lines, detail: 'lines', date: new Date('2026-11-27') })
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    const short = await buildQuotePdf({ company: { name: 'G|Wired' }, job: { job_number: null, title: 'x', site_address: null }, client: null, estimate: est, sections, lines, detail: 'sections', date: new Date() })
    expect(short.length).toBeGreaterThan(500)
  })
})
