// ALL money maths lives here. Amounts are whole pence (integers), never pounds as decimals, so nothing drifts.
// Rounding rule: half up, to the nearest penny, applied once at the end of each calculation.
export type Pence = number

// "1,234.56", "£1234", "12.5" -> pence. Returns null if it isn't a sensible amount.
export function parsePounds(input: string): Pence | null {
  const s = input.replace(/[£,\s]/g, '')
  if (!/^-?\d+(\.\d{0,2})?$/.test(s)) return null
  const neg = s.startsWith('-')
  const [pounds, dec = ''] = s.replace('-', '').split('.')
  const p = Number(pounds) * 100 + Number((dec + '00').slice(0, 2))
  return neg ? -p : p
}

const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })
export const formatGBP = (p: Pence): string => gbp.format(p / 100)

// pence as an editable "1234.50" (no symbol or commas)
export const toInputPounds = (p: Pence | null | undefined): string => (p == null ? '' : (p / 100).toFixed(2))

// half up to the nearest integer (away from zero for exact halves, so -2.5 -> -3, 2.5 -> 3)
export function roundHalfUp(n: number): number {
  return n < 0 ? -Math.round(-n) : Math.round(n)
}

// a percentage of an amount, e.g. percentOf(100_00, 20) = 20_00 (VAT, retention, overheads and profit all use this)
export const percentOf = (amount: Pence, pct: number): Pence => roundHalfUp((amount * pct) / 100)

export const sum = (xs: Pence[]): Pence => xs.reduce((a, b) => a + b, 0)
