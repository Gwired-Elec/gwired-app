// Estimate maths. Pure functions, no database: unit-tested in estimate.test.ts.
//
// Every line holds a cost and a sell price PER UNIT (in pence, may be fractional) plus optional labour (hours per unit at an
// hourly cost / charge rate). Each line's total is worked out and rounded ONCE to the penny.
//
// How the totals build up (shown step by step on screen):
//   Lines (sell)  = sum of every line's sell price
//   + Overheads & profit = ONE percentage of the lines (ohp_pct), or, in "split" mode, a percentage of the materials part
//                           plus a different percentage of the labour part (ohp_materials_pct, ohp_labour_pct)
//   + Contingency = contingency_pct % of (lines + overheads & profit)
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
// the labour part of a line's sell price (hours at the charge rate, or a whole day-rate line); the rest is materials
export const lineLabourSell = (l: LineMaths, kind?: string) => roundHalfUp(l.qty * (l.hours_per_unit * l.labour_charge_hr_pence + (kind === 'day' ? l.unit_sell : 0)))
export const lineHours = (l: Pick<LineMaths, 'qty' | 'hours_per_unit'>) => Math.round(l.qty * l.hours_per_unit * 1000) / 1000

export interface Terms {
  ohp_mode: 'combined' | 'split'
  ohp_pct: number
  ohp_materials_pct: number
  ohp_labour_pct: number
  contingency_pct: number
  discount_pct: number
  vat_rate: number
  reverse_charge: boolean
}
export interface Totals {
  costPence: number
  linesPence: number
  ohpPence: number
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

export function estimateTotals(lines: (LineMaths & { kind?: string })[], t: Terms): Totals {
  const costPence = sum(lines.map(lineCost))
  const linesPence = sum(lines.map(lineSell))
  let ohpPence: number
  if (t.ohp_mode === 'split') {
    const labourPence = sum(lines.map((l) => lineLabourSell(l, l.kind)))
    ohpPence = percentOf(linesPence - labourPence, t.ohp_materials_pct) + percentOf(labourPence, t.ohp_labour_pct)
  } else {
    ohpPence = percentOf(linesPence, t.ohp_pct)
  }
  const contingencyPence = percentOf(linesPence + ohpPence, t.contingency_pct)
  const grossPence = linesPence + ohpPence + contingencyPence
  const discountPence = percentOf(grossPence, t.discount_pct)
  const netPence = grossPence - discountPence
  const vatPence = t.reverse_charge ? 0 : percentOf(netPence, t.vat_rate)
  const marginPence = netPence - costPence
  return {
    costPence, linesPence, ohpPence, contingencyPence, grossPence, discountPence, netPence, vatPence,
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
