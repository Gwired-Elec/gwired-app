import { describe, expect, it } from 'vitest'
import { chain, invoiceTotals, pctFromValue, valuation, valueFromPct, variationLine, type AppTerms } from './applications'

const base: AppTerms = { retention_pct: 0, retention_release_pence: 0, cis_on: false, cis_rate: 20, cis_labour_pct: 50, reverse_charge: false, vat_rate: 20 }

describe('application for payment', () => {
  it('first application, no retention: value plus VAT', () => {
    const v = valuation(10_000_00, base)
    expect(v.thisNet).toBe(10_000_00)
    expect(v.vat).toBe(2_000_00)
    expect(v.due).toBe(12_000_00)
  })
  it('holds retention', () => {
    const v = valuation(10_000_00, { ...base, retention_pct: 5 })
    expect(v.retentionHeld).toBe(500_00)
    expect(v.thisNet).toBe(9_500_00)
    expect(v.vat).toBe(1_900_00)
  })
  it('is cumulative: the second application only asks for the difference', () => {
    const t = { ...base, retention_pct: 5 }
    const [a, b] = chain([{ grossToDate: 10_000_00, terms: t }, { grossToDate: 25_000_00, terms: t }])
    expect(a.thisNet).toBe(9_500_00)
    expect(b.netToDate).toBe(23_750_00)
    expect(b.thisNet).toBe(14_250_00)
  })
  it('releases retention (half at practical completion) and never more than is held', () => {
    const t = { ...base, retention_pct: 5 }
    const [, b] = chain([{ grossToDate: 20_000_00, terms: t }, { grossToDate: 20_000_00, terms: { ...t, retention_release_pence: 500_00 } }])
    expect(b.retentionHeld).toBe(500_00)
    expect(b.thisNet).toBe(500_00)
    const [, c] = chain([{ grossToDate: 20_000_00, terms: t }, { grossToDate: 20_000_00, terms: { ...t, retention_release_pence: 99_999_00 } }])
    expect(c.retentionHeld).toBe(0)
    expect(c.thisNet).toBe(1_000_00)
  })
  it('CIS is taken off the labour part only, not VAT', () => {
    const v = valuation(10_000_00, { ...base, cis_on: true, cis_rate: 20, cis_labour_pct: 50 })
    expect(v.cis).toBe(1_000_00) // 20% of the 5,000 labour
    expect(v.due).toBe(10_000_00 + 2_000_00 - 1_000_00)
  })
  it('domestic reverse charge: no VAT charged', () => {
    const v = valuation(10_000_00, { ...base, reverse_charge: true })
    expect(v.vat).toBe(0)
    expect(v.due).toBe(10_000_00)
  })
  it('can go negative when work is taken back off', () => {
    const [, b] = chain([{ grossToDate: 10_000_00, terms: base }, { grossToDate: 8_000_00, terms: base }])
    expect(b.thisNet).toBe(-2_000_00)
  })
})

describe('lines, variations, invoices', () => {
  it('percent and value convert both ways', () => {
    expect(valueFromPct(12_345_67, 35)).toBe(4_320_98)
    expect(pctFromValue(1_000_00, 250_00)).toBe(25)
    expect(pctFromValue(0, 5)).toBe(0)
  })
  it('variation line rounds to the penny', () => {
    expect(variationLine(3, 33.333)).toBe(100)
    expect(variationLine(2.5, 1000)).toBe(2500)
  })
  it('invoice totals, with and without reverse charge', () => {
    expect(invoiceTotals(1_000_00, 20, false)).toEqual({ net: 1_000_00, vat: 200_00, total: 1_200_00 })
    expect(invoiceTotals(1_000_00, 20, true)).toEqual({ net: 1_000_00, vat: 0, total: 1_000_00 })
  })
})
