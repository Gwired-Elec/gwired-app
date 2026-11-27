// Types and live queries for estimates (read from the local database, so they work offline).
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Row } from '../sync/db'
import type { LineMaths } from './estimate'

export interface Estimate extends Row {
  job_id: string
  rev: number
  name: string | null
  status: 'draft' | 'issued' | 'accepted' | 'superseded'
  method: 'units' | 'point' | 'day'
  labour_rate_id: string | null
  ohp_mode: 'combined' | 'split'
  ohp_pct: number
  ohp_materials_pct: number
  ohp_labour_pct: number
  contingency_pct: number
  discount_pct: number
  vat_rate: number
  reverse_charge: boolean
  notes: string | null
  issued_at: string | null
  variation_id: string | null // set when this estimate prices a variation rather than the main quote
}
export interface Section extends Row { estimate_id: string; name: string; sort: number }
export interface EstClause extends Row { estimate_id: string; library_id: string | null; kind: 'exclusion' | 'assumption'; title: string; body: string; sort: number }
export interface Line extends Row, LineMaths {
  estimate_id: string
  section_id: string | null
  sort: number
  kind: 'material' | 'point' | 'day' | 'prelim' | 'item'
  description: string
  unit: string
  material_id: string | null
  point_rate_id: string | null
  labour_rate_id: string | null
  markup_pct: number | null
  price_date: string | null
  price_source: string | null
  notes: string | null
}

const alive = (r: Row) => !r.deleted_at
// numeric columns can come back from the server as numbers or strings; make sure the maths always sees numbers
const num = (v: unknown) => Number(v ?? 0)
const fixLine = (l: Line): Line => ({
  ...l,
  sell_override: l.sell_override == null ? null : num(l.sell_override),
  qty: num(l.qty), unit_cost: num(l.unit_cost), unit_sell: num(l.unit_sell), hours_per_unit: num(l.hours_per_unit),
  labour_cost_hr_pence: num(l.labour_cost_hr_pence), labour_charge_hr_pence: num(l.labour_charge_hr_pence), sort: num(l.sort),
})
const fixEst = (e: Estimate): Estimate => ({
  ...e, rev: num(e.rev), ohp_pct: num(e.ohp_pct), ohp_materials_pct: num(e.ohp_materials_pct), ohp_labour_pct: num(e.ohp_labour_pct), ohp_mode: e.ohp_mode === 'split' ? 'split' : 'combined', contingency_pct: num(e.contingency_pct), discount_pct: num(e.discount_pct), vat_rate: num(e.vat_rate),
})

// everything about one job's estimates in one go
export function useJobEstimates(jobId: string) {
  return useLiveQuery(async () => {
    const every = ((await db().estimates.where('job_id').equals(jobId).filter(alive).toArray()) as unknown as Estimate[]).map(fixEst).sort((a, b) => a.rev - b.rev)
    const estimates = every.filter((e) => !e.variation_id) // the quote and its revisions
    const varEstimates = every.filter((e) => !!e.variation_id) // one per variation
    const ids = every.map((e) => e.id)
    const sections = ids.length ? ((await db().estimate_sections.where('estimate_id').anyOf(ids).filter(alive).toArray()) as unknown as Section[]).map((s) => ({ ...s, sort: num(s.sort) })).sort((a, b) => a.sort - b.sort) : []
    const lines = ids.length ? ((await db().estimate_lines.where('estimate_id').anyOf(ids).filter(alive).toArray()) as unknown as Line[]).map(fixLine).sort((a, b) => a.sort - b.sort) : []
    const clauses = ids.length ? ((await db().estimate_clauses.where('estimate_id').anyOf(ids).filter(alive).toArray()) as unknown as EstClause[]).map((c) => ({ ...c, sort: num(c.sort) })).sort((a, b) => a.sort - b.sort) : []
    return { estimates, varEstimates, sections, lines, clauses }
  }, [jobId])
}

// pence per unit as text for an input box: "12.00" or, for sub-penny prices, "0.2340"
export function perUnitText(pence: number): string {
  const pounds = pence / 100
  if (Number.isInteger(pence)) return pounds.toFixed(2)
  return String(Number(pounds.toFixed(4))).replace(/^(\d+)$/, '$1.00').replace(/^(\d+\.\d)$/, '$10')
}
