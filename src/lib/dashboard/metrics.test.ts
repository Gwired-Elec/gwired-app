import { describe, expect, it } from 'vitest'
import type { AppTerms } from '../money/applications'
import { daysBetween, dashboard, type DApp, type DInput, type DInv } from './metrics'

const terms: AppTerms = { retention_pct: 0, retention_release_pence: 0, cis_on: false, cis_rate: 20, cis_labour_pct: 50, reverse_charge: false, vat_rate: 20 }
const job = (id: string, status: string, extra = {}) => ({ id, job_number: id.toUpperCase(), title: 'Job ' + id, status, chase_date: null, ...extra })
const app = (o: Partial<DApp>): DApp => ({ id: 'a', job_id: 'j1', number: 1, status: 'issued', app_date: '2026-10-01', terms, grossToDate: 10_000_00, paid_pence: null, ...o })
const base: DInput = { today: '2026-11-27', jobs: [], fin: [], quoteNet: {}, variationsAccepted: {}, apps: [], invs: [] }

describe('dashboard', () => {
  it('counts days between dates', () => {
    expect(daysBetween('2026-11-01', '2026-11-27')).toBe(26)
    expect(daysBetween('2026-11-27', '2026-11-01')).toBe(-26)
  })

  it('pipeline: only quoted jobs count, weighted by probability', () => {
    const d = dashboard({
      ...base,
      jobs: [job('q1', 'quoted', { chase_date: '2026-11-20' }), job('q2', 'quoted'), job('e1', 'estimating'), job('l1', 'lost')],
      fin: [{ job_id: 'q1', quote_value_pence: 10_000_00, probability: 50, valid_until: null }, { job_id: 'q2', quote_value_pence: 4_000_00, probability: null, valid_until: null }, { job_id: 'l1', quote_value_pence: 9_999_00, probability: 90, valid_until: null }],
    })
    expect(d.pipeline.open).toBe(2)
    expect(d.pipeline.value).toBe(14_000_00)
    expect(d.pipeline.weighted).toBe(5_000_00)
    expect(d.pipeline.unweightedCount).toBe(1)
    expect(d.pipeline.chaseOverdue).toBe(1)
  })

  it('money owed is aged by how late it is', () => {
    const d = dashboard({
      ...base,
      jobs: [job('j1', 'live')],
      quoteNet: { j1: 50_000_00 },
      apps: [app({ id: 'a1', number: 1, app_date: '2026-09-01' }), app({ id: 'a2', number: 2, grossToDate: 20_000_00, app_date: '2026-11-20' })],
    })
    // a1 due 1 Oct (57 days late), a2 due 20 Dec (not due). a1 = 10k + VAT, a2 = 10k + VAT
    expect(d.ageing.d31_60).toBe(12_000_00)
    expect(d.ageing.notDue).toBe(12_000_00)
    expect(d.money.outstanding).toBe(24_000_00)
    expect(d.money.overdue).toBe(12_000_00)
    expect(d.jobs[0].rag).toBe('red')
  })

  it('drafts are not billed, paid ones are not owed', () => {
    const d = dashboard({ ...base, jobs: [job('j1', 'live')], quoteNet: { j1: 30_000_00 }, apps: [app({ id: 'a1', status: 'paid', paid_pence: 12_000_00 }), app({ id: 'a2', number: 2, status: 'draft', grossToDate: 25_000_00 })] })
    expect(d.money.invoiced).toBe(10_000_00)
    expect(d.money.paid).toBe(12_000_00)
    expect(d.money.outstanding).toBe(0)
    expect(d.jobs[0].toBill).toBe(20_000_00)
    expect(d.jobs[0].rag).toBe('green')
  })

  it('invoices: due date, or 14 days after the invoice date', () => {
    const inv = (o: Partial<DInv>): DInv => ({ id: 'i', job_id: 'j1', number: 1, status: 'issued', inv_date: '2026-11-01', due_date: null, net_pence: 1_000_00, vat_rate: 20, reverse_charge: false, ...o })
    const d = dashboard({ ...base, jobs: [job('j1', 'live')], quoteNet: { j1: 5_000_00 }, invs: [inv({}), inv({ id: 'i2', number: 2, due_date: '2026-12-31', net_pence: 500_00 })] })
    expect(d.owed.find((o) => o.label === 'Invoice 1')?.overdueDays).toBe(12) // due 15 Nov
    expect(d.ageing.d1_30).toBe(1_200_00)
    expect(d.ageing.notDue).toBe(600_00)
    expect(d.jobs[0].rag).toBe('amber')
  })

  it('variations raise the contract; reverse charge adds no VAT', () => {
    const d = dashboard({ ...base, jobs: [job('j1', 'live')], quoteNet: { j1: 10_000_00 }, variationsAccepted: { j1: 2_500_00 }, apps: [app({ terms: { ...terms, reverse_charge: true }, app_date: '2026-11-20' })] })
    expect(d.jobs[0].contract).toBe(12_500_00)
    expect(d.money.outstanding).toBe(10_000_00)
  })

  it('a live job with no contract value is flagged', () => {
    const d = dashboard({ ...base, jobs: [job('j1', 'live')] })
    expect(d.jobs[0].rag).toBe('amber')
  })
})
