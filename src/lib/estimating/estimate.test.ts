import { describe, expect, it } from 'vitest'
import { estimateTotals, lineCost, lineSell, revLetter, type LineMaths } from './estimate'

const L = (p: Partial<LineMaths>): LineMaths => ({ qty: 1, unit_cost: 0, unit_sell: 0, hours_per_unit: 0, labour_cost_hr_pence: 0, labour_charge_hr_pence: 0, ...p })
const T = { oh_pct: 0, profit_pct: 0, contingency_pct: 0, discount_pct: 0, vat_rate: 20, reverse_charge: false }

describe('lines', () => {
  it('rounds a line once, not each part', () => {
    expect(lineCost(L({ qty: 10, unit_cost: 23.4 }))).toBe(234)
    expect(lineSell(L({ qty: 10, unit_sell: 30.42 }))).toBe(304)
  })
  it('adds labour to a material line', () => {
    const l = L({ qty: 4, unit_cost: 350, unit_sell: 420, hours_per_unit: 0.25, labour_cost_hr_pence: 2000, labour_charge_hr_pence: 4500 })
    expect(lineCost(l)).toBe(4 * (350 + 500))
    expect(lineSell(l)).toBe(4 * (420 + 1125))
  })
})

describe('estimateTotals', () => {
  const lines = [L({ qty: 2, unit_cost: 5000, unit_sell: 8000 }), L({ unit_cost: 1000, unit_sell: 2000 })]
  it('adds VAT on top', () => {
    const t = estimateTotals(lines, T)
    expect(t.linesPence).toBe(18000)
    expect(t.netPence).toBe(18000)
    expect(t.vatPence).toBe(3600)
    expect(t.totalPence).toBe(21600)
    expect(t.costPence).toBe(11000)
    expect(t.marginPence).toBe(7000)
    expect(t.marginPct).toBe(38.9)
  })
  it('applies overheads, profit, contingency and discount in order', () => {
    const t = estimateTotals(lines, { ...T, oh_pct: 10, profit_pct: 10, contingency_pct: 5, discount_pct: 10 })
    expect(t.ohPence).toBe(1800)
    expect(t.profitPence).toBe(1800)
    expect(t.contingencyPence).toBe(1080)
    expect(t.grossPence).toBe(22680)
    expect(t.discountPence).toBe(2268)
    expect(t.netPence).toBe(20412)
    expect(t.vatPence).toBe(4082)
  })
  it('charges no VAT under the domestic reverse charge', () => {
    const t = estimateTotals(lines, { ...T, reverse_charge: true })
    expect(t.vatPence).toBe(0)
    expect(t.totalPence).toBe(18000)
  })
  it('copes with an empty estimate', () => {
    const t = estimateTotals([], T)
    expect(t.totalPence).toBe(0)
    expect(t.marginPct).toBe(0)
  })
})

describe('revLetter', () => {
  it('counts A, B, C ... AA', () => {
    expect([1, 2, 3, 26, 27].map(revLetter)).toEqual(['A', 'B', 'C', 'Z', 'AA'])
  })
})
