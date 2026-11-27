import { describe, expect, it } from 'vitest'
import { chain, type AppTerms } from '../money/applications'
import type { Application, ApplicationLine, Invoice, Variation, VariationLine } from './data'
import { buildApplicationPdf, buildInvoicePdf, buildVariationPdf } from './pdf'

const base = {
  company: { name: 'G|Wired Electrical Services', address: '1 High St\nTown', vat_number: '123', company_number: '999', terms: 'Payment within 14 days.', bank: 'Sort 00-00-00, Acc 12345678' },
  job: { job_number: 'GW-001', title: 'Rewire', site_address: '2 Low Rd' }, client: { name: 'Mr Smith', address: '3 Mid Ln' }, date: new Date('2026-11-27'),
}
const row = { id: 'x' }
const isPdf = (b: Uint8Array) => new TextDecoder().decode(b.slice(0, 5)) === '%PDF-'

describe('commercial PDFs', () => {
  it('makes a variation', async () => {
    const v = { ...row, job_id: 'j', number: 1, title: 'Extra sockets', description: 'As instructed', status: 'issued', var_date: '2026-11-27' } as unknown as Variation
    const lines = [{ ...row, variation_id: 'x', sort: 1, description: 'Twin socket', qty: 4, unit: 'nr', rate_pence: 6500 }] as unknown as VariationLine[]
    expect(isPdf(await buildVariationPdf({ ...base, variation: v, lines }))).toBe(true)
  })
  it('makes an application with many lines (several pages)', async () => {
    const terms: AppTerms = { retention_pct: 5, retention_release_pence: 0, cis_on: true, cis_rate: 20, cis_labour_pct: 50, reverse_charge: false, vat_rate: 20 }
    const app = { ...row, ...terms, job_id: 'j', number: 2, status: 'draft', app_date: '2026-11-27', period_to: '2026-11-25', notes: 'Thank you', paid_pence: null, paid_date: null } as unknown as Application
    const lines = Array.from({ length: 80 }, (_, i) => ({ ...row, id: 'l' + i, application_id: 'x', sort: i, line_key: 'q:' + i, group_name: i < 40 ? 'First fix' : 'Second fix', description: 'Line number ' + i + ' with some descriptive wording that wraps over a couple of lines on the page', contract_pence: 100_00, to_date_pence: 50_00 })) as unknown as ApplicationLine[]
    const [before, v] = chain([{ grossToDate: 1000_00, terms }, { grossToDate: 4000_00, terms }])
    const bytes = await buildApplicationPdf({ ...base, app, lines, prev: new Map(lines.map((l) => [l.line_key, 10_00])), v, before })
    expect(isPdf(bytes)).toBe(true)
  })
  it('makes an invoice', async () => {
    const inv = { ...row, job_id: 'j', number: 1, kind: 'deposit', description: 'Deposit', net_pence: 1000_00, vat_rate: 20, reverse_charge: false, inv_date: '2026-11-27', due_date: '2026-12-11', status: 'draft', paid_date: null, notes: null } as unknown as Invoice
    expect(isPdf(await buildInvoicePdf({ ...base, inv, ref: 'INV-GW-001-1' }))).toBe(true)
  })
})
