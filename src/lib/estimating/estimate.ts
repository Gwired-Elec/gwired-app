// Estimate maths. Pure functions, no database: unit-tested in estimate.test.ts.
//
// Every line holds a cost and a sell price PER UNIT (in pence, may be fractional) plus optional labour (hours per unit at an
// hourly cost / charge rate). Each line's total is worked out and rounded ONCE to the penny.
//
// How the totals build up (shown step by step on screen):
//   Lines (sell)  = sum of every line's sell price
//   + Overheads   = oh_pct % of the lines
//   + Profit      = profit_pct % of the lines
//   + Contingency = contingency_pct % of (lines + overheads + profit)
//   - Discount    = discount_pct % of all that
//   = Net (the quote value, ex VAT)
//   + VAT         = vat_rate % of net, or nothing under the domestic reverse charge
import { percentOf, roundHalfUp, sum } from '../money'

export interface LineMaths {
  qty: number
  unit_cost: number
  unit_sell: number
  hours_per_unit: number
  labour_cost_hr_pence: number
  labour_charge_hr_pence: number
}
export const lineCost = (l: LineMaths) => roundHalfUp(l.qty * (l.unit_cost + l.hours_per_unit * l.labour_cost_hr_pence))
export const lineSell = (l: LineMaths) => roundHalfUp(l.qty * (l.unit_sell + l.hours_per_unit * l.labour_charge_hr_pence))
export const lineHours = (l: Pick<LineMaths, 'qty' | 'hours_per_unit'>) => Math.round(l.qty * l.hours_per_unit * 1000) / 1000

export interface Terms {
  oh_pct: number
  profit_pct: number
  contingency_pct: number
  discount_pct: number
  vat_rate: number
  reverse_charge: boolean
}
export interface Totals {
  costPence: number
  linesPence: number
  ohPence: number
  profitPence: number
  contingencyPence: number
  grossPence: number
  discountPence: number
  netPence: number
  vatPence: number
  totalPence: number
  marginPence: number
  marginPct: number // of net
  hours: number
}

export function estimateTotals(lines: LineMaths[], t: Terms): Totals {
  const costPence = sum(lines.map(lineCost))
  const linesPence = sum(lines.map(lineSell))
  const ohPence = percentOf(linesPence, t.oh_pct)
  const profitPence = percentOf(linesPence, t.profit_pct)
  const contingencyPence = percentOf(linesPence + ohPence + profitPence, t.contingency_pct)
  const grossPence = linesPence + ohPence + profitPence + contingencyPence
  const discountPence = percentOf(grossPence, t.discount_pct)
  const netPence = grossPence - discountPence
  const vatPence = t.reverse_charge ? 0 : percentOf(netPence, t.vat_rate)
  const marginPence = netPence - costPence
  return {
    costPence, linesPence, ohPence, profitPence, contingencyPence, grossPence, discountPence, netPence, vatPence,
    totalPence: netPence + vatPence,
    marginPence,
    marginPct: netPence > 0 ? Math.round((marginPence / netPence) * 1000) / 10 : 0,
    hours: Math.round(lines.reduce((a, l) => a + l.qty * l.hours_per_unit, 0) * 1000) / 1000,
  }
}

// revision number -> letter: 1 = A, 2 = B ... 27 = AA
export function revLetter(rev: number): string {
  let n = Math.max(1, Math.floor(rev))
  let s = ''
  while (n > 0) {
    n--
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26)
  }
  return s
}
