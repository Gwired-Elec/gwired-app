// Pricing maths for materials. Pure functions, no database: unit-tested in pricing.test.ts.
// A supplier price is "cost_pence for per_qty units" (e.g. 234 pence per 10 metres), so nothing is lost to rounding
// until a LINE total is worked out, and that is rounded once, half up, to the penny.
import { roundHalfUp, type Pence } from '../money'

export interface PriceLike {
  id?: string
  supplier_id: string
  cost_pence: number
  per_qty: number
  price_date?: string | null
}

// cost of ONE unit, in (fractional) pence
export const costPerUnit = (p: Pick<PriceLike, 'cost_pence' | 'per_qty'>) => p.cost_pence / (p.per_qty || 1)

// sell price of one unit in (fractional) pence: cost plus markup %
export const sellPerUnit = (costPerUnitPence: number, markupPct: number) => (costPerUnitPence * (100 + markupPct)) / 100

// quantity x price per unit, rounded once to whole pence
export const lineTotal = (qty: number, perUnitPence: number): Pence => roundHalfUp(qty * perUnitPence)

// the cheapest price per unit; on a tie, the most recently checked
export function cheapestPrice<T extends PriceLike>(prices: T[]): T | null {
  let best: T | null = null
  for (const p of prices) {
    if (!best) best = p
    else {
      const a = costPerUnit(p)
      const b = costPerUnit(best)
      if (a < b || (a === b && (p.price_date ?? '') > (best.price_date ?? ''))) best = p
    }
  }
  return best
}

// the price an estimate should use: the preferred supplier's if it has one, otherwise the cheapest
export function bestPrice<T extends PriceLike>(prices: T[], preferredSupplierId?: string | null): { price: T; reason: 'preferred' | 'cheapest' } | null {
  if (preferredSupplierId) {
    const mine = cheapestPrice(prices.filter((p) => p.supplier_id === preferredSupplierId))
    if (mine) return { price: mine, reason: 'preferred' }
  }
  const c = cheapestPrice(prices)
  return c ? { price: c, reason: 'cheapest' } : null
}

export function daysOld(priceDate: string | null | undefined, today = new Date()): number | null {
  if (!priceDate) return null
  const d = new Date(priceDate + 'T00:00:00Z').getTime()
  const t = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.floor((t - d) / 86_400_000)
}
export const isStale = (priceDate: string | null | undefined, staleDays: number, today = new Date()) => {
  const d = daysOld(priceDate, today)
  return d === null || d > staleDays
}

// list price less discount %, rounded to the penny
export const netCost = (listPence: number, discountPct: number): Pence => roundHalfUp((listPence * (100 - discountPct)) / 100)

// "0.234" (pounds, per 1) -> { costPence: 234, perQty: 10 }. Finds the smallest scale where the price is a whole number of pence.
// Accepts up to 4 decimal places of a pound; anything finer, or not a number, returns null.
export function priceAndPer(pounds: string, perQty = 1): { costPence: number; perQty: number } | null {
  const s = pounds.replace(/[£,\s]/g, '')
  const m = /^(\d+)(?:\.(\d{1,4}))?$/.exec(s)
  if (!m) return null
  const tenThousandths = Number(m[1]) * 10_000 + Number((m[2] ?? '').padEnd(4, '0')) // pounds x 10,000
  for (const f of [1, 10, 100, 1000, 10_000]) {
    if ((tenThousandths * f) % 100 === 0) return { costPence: (tenThousandths * f) / 100, perQty: perQty * f }
  }
  return null
}

// How old a price is, in words, and how worried to be: fresh (up to half the limit), ageing (up to the limit), stale (over it).
export type AgeTier = 'fresh' | 'ageing' | 'stale' | 'unknown'
export function priceAge(priceDate: string | null | undefined, staleDays: number, today = new Date()): { days: number | null; label: string; tier: AgeTier } {
  const days = daysOld(priceDate, today)
  if (days === null) return { days, label: 'no date', tier: 'unknown' }
  const tier: AgeTier = days > staleDays ? 'stale' : days > staleDays / 2 ? 'ageing' : 'fresh'
  let label: string
  if (days <= 0) label = 'today'
  else if (days === 1) label = 'yesterday'
  else if (days < 14) label = `${days} days ago`
  else if (days < 60) label = `${Math.round(days / 7)} weeks ago`
  else if (days < 730) label = `${Math.round(days / 30.4)} months ago`
  else label = `${Math.round(days / 365)} years ago`
  return { days, label, tier }
}

// Prices that are over the limit among the ones an estimate would actually use (for the "this price is old" warning).
export function stalePricesIn<T extends { price_date?: string | null }>(prices: T[], staleDays: number, today = new Date()): T[] {
  return prices.filter((p) => isStale(p.price_date, staleDays, today))
}
