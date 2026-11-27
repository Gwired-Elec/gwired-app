// Live queries and types for the estimating data (all read from the local database, so they work offline).
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Row } from '../sync/db'

export interface Supplier extends Row { name: string; notes: string | null; active: boolean }
export interface Material extends Row {
  code: string | null
  description: string
  category: string | null
  unit: string
  labour_hours: number | null
  markup_pct: number | null
  preferred_supplier_id: string | null
  active: boolean
  notes: string | null
}
export interface MaterialPrice extends Row {
  material_id: string
  supplier_id: string
  supplier_code: string | null
  list_pence: number | null
  discount_pct: number | null
  cost_pence: number
  per_qty: number
  price_date: string | null
  source: string | null
}
export interface LabourRate extends Row {
  name: string
  day_cost_pence: number // what the person costs you for an 8-hour day
  day_rate_pence: number // what you charge out for an 8-hour day
  night_cost_pence: number // the same person on a night shift
  night_rate_pence: number
  sort: number
  active: boolean
}
// hourly figures are worked out from the day figures: a day is 8 hours
export const DAY_HOURS = 8
export const hourlyCost = (r?: Pick<LabourRate, 'day_cost_pence'> | null) => (r ? Math.round(r.day_cost_pence / DAY_HOURS) : 0)
export const hourlyCharge = (r?: Pick<LabourRate, 'day_rate_pence'> | null) => (r ? Math.round(r.day_rate_pence / DAY_HOURS) : 0)
export interface PointRate extends Row { name: string; category: string | null; unit: string; sell_pence: number; cost_pence: number; notes: string | null; active: boolean }
export interface Assembly extends Row { code: string | null; name: string; category: string | null; description: string | null; extra_labour_hours: number; active: boolean }
export interface AssemblyItem extends Row { assembly_id: string; material_id: string; qty: number; sort: number }
export interface Prelim extends Row { name: string; kind: 'fixed' | 'percent'; amount_pence: number; percent: number; active: boolean }
export interface EstSettings extends Row {
  default_markup_pct: number
  oh_pct: number
  profit_pct: number
  contingency_pct: number
  stale_days: number
  vat_rate: number
  method_defaults: Record<string, string>
}

export const SETTINGS_ID = '00000000-0000-0000-0000-000000000001'
export const DEFAULT_SETTINGS: EstSettings = {
  id: SETTINGS_ID,
  default_markup_pct: 20,
  oh_pct: 10,
  profit_pct: 10,
  contingency_pct: 0,
  stale_days: 180,
  vat_rate: 20,
  method_defaults: { domestic: 'point', commercial: 'units', industrial: 'units', eicr: 'day', testing: 'day', maintenance: 'day' },
}

export const CATEGORIES = [
  'Power', 'Lighting', 'Containment', 'Distribution / DB', 'Fire alarm', 'Emergency lighting', 'Data', 'Access control', 'EV',
  'Testing', 'Remedial', 'Strip-out', 'Cable', 'Accessories', 'Fixings', 'Other',
]
export const METHODS: [string, string][] = [
  ['units', 'Labour units + materials'],
  ['point', 'Price per point'],
  ['day', 'Day rate + materials'],
]

const alive = (r: Row) => !r.deleted_at
const cast = <T,>(p: Promise<unknown>) => p as Promise<T>

export const useSuppliers = () => useLiveQuery(() => cast<Supplier[]>(db().suppliers.filter(alive).toArray().then((a) => a.sort((x, y) => String(x.name).localeCompare(String(y.name))))), [])
export const useMaterials = () => useLiveQuery(() => cast<Material[]>(db().materials.filter(alive).toArray()), [])
export const useAllPrices = () =>
  useLiveQuery(async () => {
    const all = (await db().material_prices.filter(alive).toArray()) as unknown as MaterialPrice[]
    const m = new Map<string, MaterialPrice[]>()
    for (const p of all) (m.get(p.material_id) ?? m.set(p.material_id, []).get(p.material_id)!).push(p)
    return m
  }, [])
export const useLabourRates = () => useLiveQuery(() => cast<LabourRate[]>(db().labour_rates.orderBy('sort').filter(alive).toArray()), [])
export const usePointRates = () => useLiveQuery(() => cast<PointRate[]>(db().point_rates.filter(alive).toArray().then((a) => a.sort((x, y) => String(x.name).localeCompare(String(y.name))))), [])
export const useAssemblies = () => useLiveQuery(() => cast<Assembly[]>(db().assemblies.filter(alive).toArray().then((a) => a.sort((x, y) => String(x.name).localeCompare(String(y.name))))), [])
export const useAssemblyItems = (assemblyId: string) => useLiveQuery(() => cast<AssemblyItem[]>(db().assembly_items.where('assembly_id').equals(assemblyId).filter(alive).toArray().then((a) => a.sort((x, y) => Number(x.sort) - Number(y.sort)))), [assemblyId])
export const usePrelims = () => useLiveQuery(() => cast<Prelim[]>(db().prelim_items.filter(alive).toArray()), [])
export const useEstSettings = (): EstSettings => useLiveQuery(async () => ({ ...DEFAULT_SETTINGS, ...(((await db().estimating_settings.get(SETTINGS_ID)) as EstSettings | undefined) ?? {}) }), [], DEFAULT_SETTINGS)
