// Estimate maths. Pure functions, no database: unit-tested in estimate.test.ts.
//
// Every line holds a cost and a sell price PER UNIT (in pence, may be fractional) plus optional labour (hours per unit at an
// hourly cost / charge rate). Each line's total is worked out and rounded ONCE to the penny.
//
// How the totals build up (shown step by step on screen):
//   A line's suggested sell price per unit = its materials part + its labour part, each with the estimate's overheads and profit %
//   added (ONE percentage for everything, or, in "split" mode, one for materials and another for labour). Typing a different
//   "sell each" on a line overrides the suggestion for that line.
//   Lines (sell)  = sum of every line's sell price (overheads and profit already inside)
//   + Contingency = contingency_pct % of the lines
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
  sell_override?: number | null // pence per unit, all-in; set by hand to override the suggestion
  kind?: string
}

// the overheads and profit % to add to the materials part and to the labour part
export interface Uplift { mat: number; lab: number }
export const NO_UPLIFT: Uplift = { mat: 0, lab: 0 }
export const upliftOf = (t: Pick<Terms, 'ohp_mode' | 'ohp_pct' | 'ohp_materials_pct' | 'ohp_labour_pct'>): Uplift =>
  t.ohp_mode === 'split' ? { mat: t.ohp_materials_pct, lab: t.ohp_labour_pct } : { mat: t.ohp_pct, lab: t.ohp_pct }
export const lineCost = (l: LineMaths) => roundHalfUp(l.qty * (l.unit_cost + l.hours_per_unit * l.labour_cost_hr_pence))
// the labour part of one unit's price (hours at the charge rate, or a whole day-rate line); the rest is materials
const labourPart = (l: LineMaths) => l.hours_per_unit * l.labour_charge_hr_pence + (l.kind === 'day' ? l.unit_sell : 0)
// suggested sell price of one unit (pence, may be fractional), with overheads and profit added
export const suggestedSell = (l: LineMaths, u: Uplift = NO_UPLIFT) => {
  const lab = labourPart(l)
  const mat = l.unit_sell + l.hours_per_unit * l.labour_charge_hr_pence - lab
  return (mat * (100 + u.mat)) / 100 + (lab * (100 + u.lab)) / 100
}
// what one unit actually sells for: the hand-set price if there is one, otherwise the suggestion. Always a whole number of pence
// (two decimal places in pounds), so the price on screen times the quantity is exactly the line total.
export const sellEach = (l: LineMaths, u: Uplift = NO_UPLIFT) => (l.sell_override != null ? roundHalfUp(l.sell_override) : roundHalfUp(suggestedSell(l, u)))
export const lineSell = (l: LineMaths, u: Uplift = NO_UPLIFT) => roundHalfUp(l.qty * sellEach(l, u))
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
  const u = upliftOf(t)
  const costPence = sum(lines.map(lineCost))
  const linesPence = sum(lines.map((l) => lineSell(l, u)))
  const contingencyPence = percentOf(linesPence, t.contingency_pct)
  const grossPence = linesPence + contingencyPence
  const discountPence = percentOf(grossPence, t.discount_pct)
  const netPence = grossPence - discountPence
  const vatPence = t.reverse_charge ? 0 : percentOf(netPence, t.vat_rate)
  const marginPence = netPence - costPence
  return {
    costPence, linesPence, contingencyPence, grossPence, discountPence, netPence, vatPence,
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
