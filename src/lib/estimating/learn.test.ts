import { describe, expect, it } from 'vitest'
import { planJobPrice } from './learn'
import { priceAge, stalePricesIn } from './pricing'
import type { MaterialPrice } from './data'

const price = (over: Partial<MaterialPrice>): MaterialPrice => ({
  id: 'p1', material_id: 'm1', supplier_id: 'jobs', supplier_code: null, list_pence: null, discount_pct: null, cost_pence: 500, per_qty: 1, price_date: '2026-01-01', source: null, ...over,
})
const job = { materialId: 'm1', supplierId: 'jobs', costPence: 520, perQty: 1, jobRef: 'GW-2026-014', today: '2026-11-27' }

describe('planJobPrice (learning from a priced job)', () => {
  it('adds a first price when the material has none from this supplier', () => {
    const p = planJobPrice([], job)
    expect(p).toMatchObject({ priceId: null, changed: true, patch: { cost_pence: 520, price_date: '2026-11-27', source: 'Priced on job GW-2026-014' } })
  })
  it('updates the existing price from the same supplier, with the new date and job', () => {
    const p = planJobPrice([price({})], job)
    expect(p).toMatchObject({ priceId: 'p1', changed: true, patch: { cost_pence: 520, price_date: '2026-11-27' } })
  })
  it('leaves other suppliers prices alone', () => {
    const p = planJobPrice([price({ id: 'rexel', supplier_id: 'rexel' })], job)
    expect(p.priceId).toBeNull()
  })
  it('only moves the date when the cost is unchanged', () => {
    expect(planJobPrice([price({ cost_pence: 520 })], job)).toMatchObject({ changed: false, priceId: 'p1' })
  })
})

describe('price age', () => {
  const today = new Date(2026, 10, 27)
  it('puts a price in a tier against the limit', () => {
    expect(priceAge('2026-11-20', 180, today)).toMatchObject({ days: 7, tier: 'fresh', label: '7 days ago' })
    expect(priceAge('2026-07-01', 180, today).tier).toBe('ageing') // ~5 months
    expect(priceAge('2026-05-01', 180, today)).toMatchObject({ tier: 'stale', label: '7 months ago' })
    expect(priceAge(null, 180, today)).toMatchObject({ tier: 'unknown', label: 'no date' })
  })
  it('words today and yesterday', () => {
    expect(priceAge('2026-11-27', 180, today).label).toBe('today')
    expect(priceAge('2026-11-26', 180, today).label).toBe('yesterday')
  })
  it('lists only the prices over 6 months old', () => {
    const old = stalePricesIn([{ price_date: '2026-11-01' }, { price_date: '2026-03-01' }, { price_date: null }], 180, today)
    expect(old).toHaveLength(2)
  })
})
