import { describe, expect, it } from 'vitest'
import { assemblyTotals } from './assembly'
import type { Material, MaterialPrice } from './data'

const m = (id: string, description: string, labour_hours: number | null = null, markup_pct: number | null = null): Material => ({
  id, code: null, description, category: null, unit: 'each', labour_hours, markup_pct, preferred_supplier_id: null, active: true, notes: null,
})
const pr = (material_id: string, cost_pence: number, per_qty = 1): MaterialPrice => ({
  id: 'p' + material_id, material_id, supplier_id: 's', supplier_code: null, list_pence: null, discount_pct: null, cost_pence, per_qty, price_date: '2026-11-01', source: null,
})

describe('assemblyTotals', () => {
  const materials = new Map([m('socket', 'Double socket', 0.25), m('box', 'Back box', 0.1), m('cable', 'T&E 2.5mm per m', 0.02, 30)].map((x) => [x.id, x]))
  const prices = new Map([['socket', [pr('socket', 350)]], ['box', [pr('box', 80)]], ['cable', [pr('cable', 234, 10)]]])

  it('adds up cost, sell with markup, and labour hours', () => {
    // 1 socket 350p + 1 box 80p + 10 m cable at 23.4p = 234p  -> cost 664p
    const t = assemblyTotals([{ material_id: 'socket', qty: 1 }, { material_id: 'box', qty: 1 }, { material_id: 'cable', qty: 10 }], materials, prices, 20)
    expect(t.costPence).toBe(664)
    // sell: socket 350 x1.2 = 420, box 80 x1.2 = 96, cable 234 x1.3 = 304.2 -> 304  => 820
    expect(t.sellPence).toBe(820)
    // labour: 0.25 + 0.1 + 10 x 0.02 = 0.55
    expect(t.labourHours).toBe(0.55)
    expect(t.missing).toEqual([])
  })
  it('adds the assembly\'s own extra labour hours', () => {
    expect(assemblyTotals([{ material_id: 'socket', qty: 2 }], materials, prices, 20, 0.5).labourHours).toBe(1)
  })
  it('counts a material with no price as £0 and says so', () => {
    const t = assemblyTotals([{ material_id: 'socket', qty: 1 }, { material_id: 'box', qty: 1 }], materials, new Map([['socket', [pr('socket', 350)]]]), 20)
    expect(t.costPence).toBe(350)
    expect(t.missing).toEqual(['Back box'])
  })
})
