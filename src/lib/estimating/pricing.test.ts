import { describe, expect, it } from 'vitest'
import { bestPrice, cheapestPrice, costPerUnit, daysOld, isStale, lineTotal, netCost, priceAndPer, sellPerUnit } from './pricing'

const p = (supplier_id: string, cost_pence: number, per_qty = 1, price_date = '2026-11-01') => ({ supplier_id, cost_pence, per_qty, price_date })

describe('price per unit', () => {
  it('divides by the quantity the price is quoted for', () => {
    expect(costPerUnit(p('a', 234, 10))).toBe(23.4)
    expect(costPerUnit(p('a', 4500, 100))).toBe(45)
  })
  it('adds markup without losing precision', () => {
    expect(sellPerUnit(1000, 20)).toBe(1200)
    expect(sellPerUnit(23.4, 25)).toBeCloseTo(29.25, 10)
  })
  it('rounds once, on the line total', () => {
    // 37 metres at 23.4p = 865.8p -> 866p, not 37 x 23p = 851p
    expect(lineTotal(37, 23.4)).toBe(866)
    expect(lineTotal(0.5, 1)).toBe(1)
  })
})

describe('choosing a supplier price', () => {
  const prices = [p('rexel', 500), p('tlc', 450), p('other', 480)]
  it('finds the cheapest per unit, even when quoted per different quantities', () => {
    expect(cheapestPrice([p('a', 1000, 100), p('b', 15, 1)])?.supplier_id).toBe('a') // 10p each vs 15p each
  })
  it('on a tie takes the most recently checked', () => {
    expect(cheapestPrice([p('a', 100, 1, '2026-01-01'), p('b', 100, 1, '2026-06-01')])?.supplier_id).toBe('b')
  })
  it('uses the preferred supplier when it has a price', () => {
    expect(bestPrice(prices, 'rexel')).toMatchObject({ reason: 'preferred', price: { supplier_id: 'rexel' } })
  })
  it('falls back to the cheapest when the preferred supplier has no price', () => {
    expect(bestPrice(prices, 'screwfix')).toMatchObject({ reason: 'cheapest', price: { supplier_id: 'tlc' } })
    expect(bestPrice(prices, null)?.price.supplier_id).toBe('tlc')
  })
  it('returns nothing when there are no prices', () => {
    expect(bestPrice([], 'rexel')).toBeNull()
  })
})

describe('stale prices', () => {
  const today = new Date(2026, 10, 27) // 27 Nov 2026
  it('counts days since the price was checked', () => {
    expect(daysOld('2026-11-27', today)).toBe(0)
    expect(daysOld('2026-08-29', today)).toBe(90)
  })
  it('flags prices older than the limit, and prices with no date', () => {
    expect(isStale('2026-08-29', 90, today)).toBe(false)
    expect(isStale('2026-08-28', 90, today)).toBe(true)
    expect(isStale(null, 90, today)).toBe(true)
  })
})

describe('list price and discount', () => {
  it('works out net cost to the penny', () => {
    expect(netCost(10000, 40)).toBe(6000)
    expect(netCost(1999, 35)).toBe(1299) // 1299.35
  })
})

describe('reading prices from a file', () => {
  it('keeps whole-penny prices as they are', () => {
    expect(priceAndPer('12.34')).toEqual({ costPence: 1234, perQty: 1 })
    expect(priceAndPer('£1,250.00', 1)).toEqual({ costPence: 125000, perQty: 1 })
  })
  it('scales sub-penny prices up so nothing is lost', () => {
    expect(priceAndPer('0.234')).toEqual({ costPence: 234, perQty: 10 })
    expect(priceAndPer('0.0234')).toEqual({ costPence: 234, perQty: 100 })
    expect(priceAndPer('0.2345')).toEqual({ costPence: 2345, perQty: 100 })
  })
  it('keeps a price per 100 and scales it too', () => {
    // £23.456 per 100 = 2345.6p per 100 = 23456p per 1000
    expect(priceAndPer('23.456', 100)).toEqual({ costPence: 23456, perQty: 1000 })
  })
  it('rejects anything that is not a price', () => {
    expect(priceAndPer('abc')).toBeNull()
    expect(priceAndPer('1.23456')).toBeNull()
    expect(priceAndPer('-5')).toBeNull()
  })
})
