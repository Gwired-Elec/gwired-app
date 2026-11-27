// What an assembly (a kit of materials plus labour) costs and sells for. Pure code, tested in assembly.test.ts.
import type { Material, MaterialPrice } from './data'
import { bestPrice, costPerUnit, lineTotal, sellPerUnit } from './pricing'

export interface AssemblyTotals {
  costPence: number
  sellPence: number // materials only, with markup
  labourHours: number
  missing: string[] // materials that have no supplier price, so are counted at £0
}

export function assemblyTotals(
  items: { material_id: string; qty: number }[],
  materials: Map<string, Material>,
  prices: Map<string, MaterialPrice[]>,
  defaultMarkupPct: number,
  extraLabourHours = 0,
): AssemblyTotals {
  let costPence = 0
  let sellPence = 0
  let labourHours = extraLabourHours
  const missing: string[] = []
  for (const it of items) {
    const m = materials.get(it.material_id)
    if (!m) continue
    labourHours += it.qty * (m.labour_hours ?? 0)
    const best = bestPrice(prices.get(m.id) ?? [], m.preferred_supplier_id)
    if (!best) {
      missing.push(m.description)
      continue
    }
    const cost = costPerUnit(best.price)
    costPence += lineTotal(it.qty, cost)
    sellPence += lineTotal(it.qty, sellPerUnit(cost, m.markup_pct ?? defaultMarkupPct))
  }
  return { costPence, sellPence, labourHours: Math.round(labourHours * 1000) / 1000, missing }
}
