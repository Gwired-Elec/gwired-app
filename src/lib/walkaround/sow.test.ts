import { describe, expect, it } from 'vitest'
import { buildSowPdf, buildSowXlsx, type SowInput } from './sow'

const input = (showRates: boolean): SowInput => ({
  company: { name: 'G|Wired Electrical Services', company_number: '12345678' },
  job: { job_number: 'GW-1', title: 'Office fit-out – “phase 1”', site_address: '1 High St' },
  client: { name: 'Mr Smith', address: 'Anytown' },
  showRates, date: new Date('2026-11-27'),
  areas: [
    { name: 'Kitchen', notes: 'Existing ring main to be retained. ' + 'x'.repeat(300), items: Array.from({ length: 40 }, (_, i) => ({ description: 'Twin socket outlets ' + i, qty: i + 1, unit: 'nr', notes: i % 3 ? null : 'Flush mounted' })), photos: [] },
    { name: 'Plant room', notes: null, items: [], photos: [] },
  ],
})

describe('scope of works export', () => {
  it('makes a PDF with and without rate columns', async () => {
    for (const r of [true, false]) {
      const b = await buildSowPdf(input(r))
      expect(new TextDecoder().decode(b.slice(0, 5))).toBe('%PDF-')
    }
  })
  it('makes an Excel file with a working Total formula', async () => {
    const buf = await buildSowXlsx(input(true))
    const { default: ExcelJS } = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    const ws = wb.getWorksheet('Scope of works')!
    let formulas = 0
    ws.eachRow((r) => { const v = r.getCell(6).value as { formula?: string } | null; if (v && typeof v === 'object' && 'formula' in v) formulas += 1 })
    expect(formulas).toBe(41) // 40 lines + the grand total
    expect(ws.getRow(8).getCell(1).value).toBe('A')
  })
})
