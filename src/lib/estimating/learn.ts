// Learning from priced jobs: when someone prices an item on an estimate (types their own cost, or picks an item that isn't
// in the database yet), that cost is written back to the materials database, dated today and tagged with the job, so the
// database fills itself from real pricing and every price carries its age. Pure planning code, tested in learn.test.ts.
import type { MaterialPrice } from './data'

export interface JobPrice {
  materialId: string
  supplierId: string // normally the "Priced on jobs" supplier, or the supplier the person chose
  costPence: number
  perQty: number
  jobRef: string // e.g. "GW-2026-014"
  today: string // yyyy-mm-dd
}
export interface PricePlan {
  priceId: string | null // existing price row to update, or null to add a new one
  patch: Record<string, unknown>
  changed: boolean // false = same cost as before; only the "checked on" date moves
}

export function planJobPrice(existing: MaterialPrice[], p: JobPrice): PricePlan {
  const prev = existing.find((e) => e.supplier_id === p.supplierId)
  const patch: Record<string, unknown> = {
    material_id: p.materialId,
    supplier_id: p.supplierId,
    cost_pence: p.costPence,
    per_qty: p.perQty,
    price_date: p.today,
    source: `Priced on job ${p.jobRef}`,
  }
  const changed = !prev || prev.cost_pence !== p.costPence || prev.per_qty !== p.perQty
  return { priceId: prev?.id ?? null, patch, changed }
}
