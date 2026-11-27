// Turning a supplier price file into changes: which materials are new, which prices to update. Pure code (no database),
// unit-tested in importer.test.ts. The screen shows the plan before anything is saved.
import { netCost, priceAndPer } from './pricing'
import type { Material, MaterialPrice } from './data'

export type Field = 'code' | 'description' | 'unit' | 'category' | 'supplier_code' | 'list' | 'discount' | 'net' | 'per_qty'
export const FIELDS: { key: Field; label: string; hint: string }[] = [
  { key: 'description', label: 'Description', hint: 'Required' },
  { key: 'supplier_code', label: "Supplier's product code", hint: 'Used to match the same item next time' },
  { key: 'code', label: 'Your own code', hint: 'Optional' },
  { key: 'net', label: 'Your net cost', hint: 'What you pay (use this, or list price + discount)' },
  { key: 'list', label: 'List price', hint: 'Before discount' },
  { key: 'discount', label: 'Discount %', hint: 'Off list' },
  { key: 'per_qty', label: 'Price per (quantity)', hint: 'e.g. 100 when priced per 100m' },
  { key: 'unit', label: 'Unit', hint: 'each, m, box…' },
  { key: 'category', label: 'Category', hint: 'Optional' },
]
export type Mapping = Partial<Record<Field, number>> // column index per field

const PATTERNS: Record<Field, RegExp> = {
  description: /^(product )?(description|desc|name|title|item)\b|^description/i,
  supplier_code: /(stock|part|product|catalogue|cat|sku|item|order)\s*(code|no|number|ref|#)|^sku$|^code$|^part$/i,
  code: /^(our|my|own|internal)\s*(code|ref)/i,
  net: /(net|your|nett|trade|customer|cost|buy)\s*(price|cost)?|^net\b|^cost$/i,
  list: /(list|retail|rrp|gross|catalogue)\s*(price)?|^list\b|^price$/i,
  discount: /disc(ount)?\b|%/i,
  per_qty: /^per\b|price\s*per|^qty\s*per|^unit\s*qty|^pack/i,
  unit: /^(uom|unit|u\/m|unit of (measure|sale)|sold (by|in))\b/i,
  category: /^(category|cat\b|group|family|range|type)/i,
}

// best guess of which column is which, from the header names
export function guessMapping(headers: string[]): Mapping {
  const out: Mapping = {}
  const used = new Set<number>()
  // most specific first
  const order: Field[] = ['code', 'supplier_code', 'discount', 'per_qty', 'unit', 'category', 'net', 'list', 'description']
  for (const f of order) {
    const i = headers.findIndex((h, idx) => !used.has(idx) && PATTERNS[f].test(h.trim()))
    if (i >= 0) (out[f] = i), used.add(i)
  }
  return out
}

export interface ImportOptions {
  supplierId: string
  defaultPerQty: number
  defaultDiscountPct: number | null
  defaultUnit: string
  source: string
  today: string // yyyy-mm-dd
}
export interface PlannedPrice {
  supplier_id: string
  supplier_code: string | null
  list_pence: number | null
  discount_pct: number | null
  cost_pence: number
  per_qty: number
  price_date: string
  source: string
}
export interface PlanItem {
  line: number // row number in the file
  materialId: string | null // null = a new material
  newMaterial?: { code: string | null; description: string; category: string | null; unit: string }
  priceId: string | null // null = a new price
  price: PlannedPrice
  changed: boolean // false = same price as before (only the "checked on" date moves)
  was?: { cost_pence: number; per_qty: number }
}
export interface Plan {
  items: PlanItem[]
  errors: { line: number; message: string }[]
  newMaterials: number
  priceChanges: number
  confirmed: number
}

const num = (s: string | undefined) => {
  if (s === undefined || s.trim() === '') return null
  const n = Number(s.replace(/[%\s]/g, ''))
  return Number.isFinite(n) ? n : NaN
}

export function planImport(rows: string[][], mapping: Mapping, opts: ImportOptions, materials: Material[], prices: MaterialPrice[]): Plan {
  const get = (r: string[], f: Field) => (mapping[f] === undefined ? undefined : (r[mapping[f]!] ?? '').trim())
  const bySupplierCode = new Map<string, MaterialPrice>()
  for (const p of prices) if (p.supplier_id === opts.supplierId && p.supplier_code) bySupplierCode.set(p.supplier_code.toLowerCase(), p)
  const byCode = new Map<string, Material>()
  for (const m of materials) if (m.code) byCode.set(m.code.toLowerCase(), m)
  const priceOf = new Map<string, MaterialPrice>() // existing price of this supplier per material
  for (const p of prices) if (p.supplier_id === opts.supplierId) priceOf.set(p.material_id, p)
  const matById = new Map(materials.map((m) => [m.id, m]))

  const plan: Plan = { items: [], errors: [], newMaterials: 0, priceChanges: 0, confirmed: 0 }
  const seen = new Set<string>() // the same product twice in one file: keep the first, say so
  rows.forEach((r, i) => {
    const line = i + 1
    const description = get(r, 'description') ?? ''
    const supplierCode = get(r, 'supplier_code') || null
    const ownCode = get(r, 'code') || null
    if (!description && !supplierCode) return plan.errors.push({ line, message: 'No description or product code' })

    // price
    const perText = get(r, 'per_qty')
    const per = perText ? Number(perText.replace(/\D/g, '')) || opts.defaultPerQty : opts.defaultPerQty
    const netText = get(r, 'net')
    const listText = get(r, 'list')
    let cost: { costPence: number; perQty: number } | null = null
    let listPence: number | null = null
    let disc: number | null = null
    if (netText) {
      cost = priceAndPer(netText, per)
      if (!cost) return plan.errors.push({ line, message: `Can't read the net price "${netText}"` })
      if (listText) {
        const l = priceAndPer(listText, per)
        if (l && l.perQty === cost.perQty) listPence = l.costPence
      }
    } else if (listText) {
      const l = priceAndPer(listText, per)
      if (!l) return plan.errors.push({ line, message: `Can't read the list price "${listText}"` })
      const d = num(get(r, 'discount')) ?? opts.defaultDiscountPct ?? 0
      if (Number.isNaN(d) || d < 0 || d > 100) return plan.errors.push({ line, message: 'The discount is not a sensible percentage' })
      disc = d
      listPence = l.costPence
      cost = { costPence: netCost(l.costPence, d), perQty: l.perQty }
    } else return plan.errors.push({ line, message: 'No price on this row' })

    // which material is it?
    const key = (supplierCode ?? ownCode ?? description).toLowerCase()
    if (seen.has(key)) return plan.errors.push({ line, message: 'Same product appears earlier in the file; first one used' })
    seen.add(key)
    const existingPrice = supplierCode ? bySupplierCode.get(supplierCode.toLowerCase()) : undefined
    let material: Material | undefined = existingPrice ? matById.get(existingPrice.material_id) : undefined
    if (!material && ownCode) material = byCode.get(ownCode.toLowerCase())
    if (!material && supplierCode) material = byCode.get(supplierCode.toLowerCase())

    const price: PlannedPrice = {
      supplier_id: opts.supplierId,
      supplier_code: supplierCode,
      list_pence: listPence,
      discount_pct: disc,
      cost_pence: cost.costPence,
      per_qty: cost.perQty,
      price_date: opts.today,
      source: opts.source,
    }
    const prev = existingPrice ?? (material ? priceOf.get(material.id) : undefined)
    const changed = !prev || prev.cost_pence !== price.cost_pence || prev.per_qty !== price.per_qty
    const item: PlanItem = { line, materialId: material?.id ?? null, priceId: prev?.id ?? null, price, changed, was: prev ? { cost_pence: prev.cost_pence, per_qty: prev.per_qty } : undefined }
    if (!material) {
      item.newMaterial = { code: ownCode ?? supplierCode, description: description || supplierCode!, category: get(r, 'category') || null, unit: get(r, 'unit') || opts.defaultUnit }
      plan.newMaterials++
    }
    if (changed) plan.priceChanges++
    else plan.confirmed++
    plan.items.push(item)
  })
  return plan
}
