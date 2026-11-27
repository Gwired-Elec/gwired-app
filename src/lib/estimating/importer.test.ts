import { describe, expect, it } from 'vitest'
import { parseDelimited } from './files'
import { guessMapping, planImport, type ImportOptions } from './importer'
import type { Material, MaterialPrice } from './data'

describe('parseDelimited', () => {
  it('reads commas, quotes and doubled quotes', () => {
    expect(parseDelimited('a,b\n"x, y","say ""hi"""\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"']])
  })
  it('detects semicolons and tabs, and ignores a BOM and blank lines', () => {
    expect(parseDelimited('﻿a;b\n1;2\n\n3;4')).toEqual([['a', 'b'], ['1', '2'], ['3', '4']])
    expect(parseDelimited('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']])
  })
  it('handles Windows line endings and a final line with no newline', () => {
    expect(parseDelimited('a,b\r\n1,2')).toEqual([['a', 'b'], ['1', '2']])
  })
})

describe('guessMapping', () => {
  it('finds typical wholesaler columns', () => {
    const m = guessMapping(['Stock Code', 'Description', 'UoM', 'List Price', 'Discount %', 'Net Price'])
    expect(m).toMatchObject({ supplier_code: 0, description: 1, unit: 2, list: 3, discount: 4, net: 5 })
  })
  it('does not use one column twice', () => {
    const m = guessMapping(['Product Code', 'Product Description', 'Price'])
    expect(new Set(Object.values(m)).size).toBe(Object.values(m).length)
    expect(m.description).toBe(1)
  })
})

const opts: ImportOptions = { supplierId: 'rexel', defaultPerQty: 1, defaultDiscountPct: null, defaultUnit: 'each', source: 'rexel.csv', today: '2026-11-27' }
const mat = (id: string, code: string | null, description = 'x'): Material => ({ id, code, description, category: null, unit: 'each', labour_hours: null, markup_pct: null, preferred_supplier_id: null, active: true, notes: null })
const price = (id: string, material_id: string, supplier_id: string, supplier_code: string | null, cost_pence: number, per_qty = 1): MaterialPrice => ({
  id, material_id, supplier_id, supplier_code, list_pence: null, discount_pct: null, cost_pence, per_qty, price_date: '2026-01-01', source: null,
})
const map = { supplier_code: 0, description: 1, net: 2 }

describe('planImport', () => {
  it('creates new materials with their price', () => {
    const p = planImport([['R100', '13A double socket', '3.45']], map, opts, [], [])
    expect(p.newMaterials).toBe(1)
    expect(p.items[0]).toMatchObject({ materialId: null, priceId: null, price: { cost_pence: 345, per_qty: 1, supplier_code: 'R100' } })
  })
  it('matches an existing price by supplier code and flags a change', () => {
    const p = planImport([['R100', '13A double socket', '3.60']], map, opts, [mat('m1', null)], [price('p1', 'm1', 'rexel', 'R100', 345)])
    expect(p.newMaterials).toBe(0)
    expect(p.items[0]).toMatchObject({ materialId: 'm1', priceId: 'p1', changed: true, was: { cost_pence: 345 } })
  })
  it('confirms an unchanged price without calling it a change', () => {
    const p = planImport([['R100', 'x', '3.45']], map, opts, [mat('m1', null)], [price('p1', 'm1', 'rexel', 'R100', 345)])
    expect(p).toMatchObject({ priceChanges: 0, confirmed: 1 })
  })
  it("matches another supplier's material by your own code and adds a second supplier price", () => {
    const p = planImport([['R100', 'socket', '3.00']], { ...map, code: 3 }, opts, [mat('m1', 'SOCK2G')], [price('p9', 'm1', 'tlc', 'T5', 400)].slice(0, 0))
    expect(p.items[0].materialId).toBeNull() // no code column value -> new
    const q = planImport([['R100', 'socket', '3.00', 'SOCK2G']], { ...map, code: 3 }, opts, [mat('m1', 'SOCK2G')], [price('p9', 'm1', 'tlc', 'T5', 400)])
    expect(q.items[0]).toMatchObject({ materialId: 'm1', priceId: null })
  })
  it('works out net cost from list price and discount', () => {
    const p = planImport([['R1', 'cable', '100.00', '40']], { supplier_code: 0, description: 1, list: 2, discount: 3 }, opts, [], [])
    expect(p.items[0].price).toMatchObject({ list_pence: 10000, discount_pct: 40, cost_pence: 6000 })
  })
  it('uses a default discount when the file has none', () => {
    const p = planImport([['R1', 'cable', '100.00']], { supplier_code: 0, description: 1, list: 2 }, { ...opts, defaultDiscountPct: 25 }, [], [])
    expect(p.items[0].price.cost_pence).toBe(7500)
  })
  it('keeps sub-penny prices exact by pricing per 10', () => {
    const p = planImport([['C1', 'cable per m', '0.234']], map, opts, [], [])
    expect(p.items[0].price).toMatchObject({ cost_pence: 234, per_qty: 10 })
  })
  it('reports unreadable rows without stopping', () => {
    const p = planImport([['A', 'ok', '1.00'], ['B', 'bad price', 'call us'], ['', '', '2.00'], ['A', 'dup', '1.50']], map, opts, [], [])
    expect(p.items).toHaveLength(1)
    expect(p.errors.map((e) => e.line)).toEqual([2, 3, 4])
  })
})
