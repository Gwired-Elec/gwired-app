// The local database on this device (Dexie / IndexedDB). The app reads and writes HERE; the sync engine moves changes to and
// from Supabase in the background. One database per signed-in user, so a shared device never mixes people's data.
import Dexie, { type Table } from 'dexie'

export const SYNC_TABLES = ['job_statuses', 'lost_reasons', 'clients', 'contacts', 'jobs', 'job_financials', 'activity_log',
  'suppliers', 'materials', 'material_prices', 'labour_rates', 'point_rates', 'assemblies', 'assembly_items', 'prelim_items', 'estimating_settings', 'import_mappings', 'estimates', 'estimate_sections', 'estimate_lines', 'clause_library', 'estimate_clauses', 'walkarounds', 'walkaround_areas', 'walkaround_elements'] as const
export type SyncTable = (typeof SYNC_TABLES)[number]

// keep in step with sync_tables in supabase/004_sync_clients_jobs.sql
export const PROTECTED: Record<SyncTable, string[]> = {
  job_statuses: [],
  lost_reasons: [],
  clients: [],
  contacts: [],
  jobs: ['status', 'lost_reason'],
  job_financials: ['quote_value_pence'],
  activity_log: [],
  suppliers: [],
  materials: [],
  material_prices: ['cost_pence'],
  labour_rates: ['day_cost_pence', 'day_rate_pence', 'night_cost_pence', 'night_rate_pence'],
  point_rates: ['sell_pence', 'cost_pence'],
  assemblies: [],
  assembly_items: [],
  prelim_items: ['amount_pence'],
  estimating_settings: [],
  import_mappings: [],
  estimates: [],
  estimate_sections: [],
  estimate_lines: [],
  clause_library: [],
  estimate_clauses: [],
  walkarounds: [],
  walkaround_areas: [],
  walkaround_elements: [],
}
// columns the server accepts per table (anything else, such as server-set fields, is never sent back)
export const WRITABLE: Record<SyncTable, string[]> = {
  job_statuses: ['slug', 'name', 'sort', 'colour', 'is_lost', 'asks_chase', 'active', 'deleted_at'],
  lost_reasons: ['name', 'sort', 'needs_note', 'deleted_at'],
  clients: ['name', 'client_type', 'email', 'phone', 'address', 'notes', 'deleted_at'],
  contacts: ['client_id', 'name', 'role', 'email', 'phone', 'deleted_at'],
  jobs: ['title', 'client_id', 'contact_id', 'site_address', 'main_contractor', 'job_type', 'source', 'status', 'lost_reason', 'lost_note', 'chase_date', 'notes', 'created_at', 'deleted_at'],
  job_financials: ['quote_value_pence', 'quote_date', 'valid_until', 'probability', 'deleted_at'],
  activity_log: ['entity', 'entity_id', 'action', 'detail', 'user_id', 'user_name', 'created_at'],
  suppliers: ['name', 'notes', 'active', 'deleted_at'],
  materials: ['code', 'description', 'category', 'unit', 'labour_hours', 'markup_pct', 'preferred_supplier_id', 'active', 'notes', 'deleted_at'],
  material_prices: ['material_id', 'supplier_id', 'supplier_code', 'list_pence', 'discount_pct', 'cost_pence', 'per_qty', 'price_date', 'source', 'deleted_at'],
  labour_rates: ['name', 'day_cost_pence', 'day_rate_pence', 'night_cost_pence', 'night_rate_pence', 'sort', 'active', 'deleted_at'],
  point_rates: ['name', 'category', 'unit', 'sell_pence', 'cost_pence', 'notes', 'active', 'deleted_at'],
  assemblies: ['code', 'name', 'category', 'description', 'extra_labour_hours', 'active', 'deleted_at'],
  assembly_items: ['assembly_id', 'material_id', 'qty', 'sort', 'deleted_at'],
  prelim_items: ['name', 'kind', 'amount_pence', 'percent', 'active', 'deleted_at'],
  estimating_settings: ['default_markup_pct', 'oh_pct', 'profit_pct', 'contingency_pct', 'stale_days', 'vat_rate', 'method_defaults'],
  import_mappings: ['supplier_id', 'mapping', 'deleted_at'],
  estimates: ['job_id', 'rev', 'name', 'status', 'method', 'labour_rate_id', 'oh_pct', 'profit_pct', 'ohp_mode', 'ohp_pct', 'ohp_materials_pct', 'ohp_labour_pct', 'contingency_pct', 'discount_pct', 'vat_rate', 'reverse_charge', 'notes', 'issued_at', 'deleted_at'],
  estimate_sections: ['estimate_id', 'name', 'sort', 'deleted_at'],
  estimate_lines: ['estimate_id', 'section_id', 'sort', 'kind', 'description', 'qty', 'unit', 'material_id', 'point_rate_id', 'labour_rate_id', 'unit_cost', 'unit_sell', 'hours_per_unit', 'labour_cost_hr_pence', 'labour_charge_hr_pence', 'sell_override', 'markup_pct', 'price_date', 'price_source', 'notes', 'deleted_at'],
  clause_library: ['kind', 'title', 'body', 'sort', 'default_on', 'active', 'deleted_at'],
  estimate_clauses: ['estimate_id', 'library_id', 'kind', 'title', 'body', 'sort', 'deleted_at'],
  walkarounds: ['job_id', 'title', 'visit_date', 'notes', 'deleted_at'],
  walkaround_areas: ['walkaround_id', 'name', 'notes', 'sort', 'deleted_at'],
  walkaround_elements: ['area_id', 'description', 'qty', 'unit', 'notes', 'sort', 'deleted_at'],
}

export interface OutboxOp {
  seq?: number
  op_id: string
  tbl: SyncTable
  row_id: string
  patch: Record<string, unknown>
  base: Record<string, unknown>
  ts: string // when the change was made on this device
  tries: number
  error?: string // set when the server refused it for good; it then waits for a person to retry or discard
  force?: boolean
}

export interface Conflict {
  id: string
  table_name: string
  row_id: string
  field: string
  server_value: unknown
  client_value: unknown
  base_value: unknown
  created_at: string
  resolved_at: string | null
}

// the shapes we keep locally (server columns; extra columns the server adds are kept too)
export interface Row {
  id: string
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
  [k: string]: unknown
}

export class GwDb extends Dexie {
  outbox!: Table<OutboxOp, number>
  meta!: Table<{ key: string; value: unknown }, string>
  conflicts!: Table<Conflict, string>
  job_statuses!: Table<Row, string>
  lost_reasons!: Table<Row, string>
  clients!: Table<Row, string>
  contacts!: Table<Row, string>
  jobs!: Table<Row, string>
  job_financials!: Table<Row, string>
  activity_log!: Table<Row, string>
  suppliers!: Table<Row, string>
  materials!: Table<Row, string>
  material_prices!: Table<Row, string>
  labour_rates!: Table<Row, string>
  point_rates!: Table<Row, string>
  assemblies!: Table<Row, string>
  assembly_items!: Table<Row, string>
  prelim_items!: Table<Row, string>
  estimating_settings!: Table<Row, string>
  import_mappings!: Table<Row, string>
  estimates!: Table<Row, string>
  estimate_sections!: Table<Row, string>
  estimate_lines!: Table<Row, string>
  clause_library!: Table<Row, string>
  estimate_clauses!: Table<Row, string>
  walkarounds!: Table<Row, string>
  walkaround_areas!: Table<Row, string>
  walkaround_elements!: Table<Row, string>

  constructor(userId: string) {
    super('gwired-' + userId)
    this.version(1).stores({
      outbox: '++seq, row_id, tbl',
      meta: 'key',
      conflicts: 'id',
      job_statuses: 'id, sort',
      lost_reasons: 'id, sort',
      clients: 'id, name',
      contacts: 'id, client_id',
      jobs: 'id, status, client_id',
      job_financials: 'id',
      activity_log: 'id, entity_id, created_at',
    })
    // version 2 (Phase 2): estimating data
    this.version(2).stores({
      suppliers: 'id',
      materials: 'id, code, category',
      material_prices: 'id, material_id, supplier_id',
      labour_rates: 'id, sort',
      point_rates: 'id, category',
      assemblies: 'id, code',
      assembly_items: 'id, assembly_id',
      prelim_items: 'id',
      estimating_settings: 'id',
      import_mappings: 'id, supplier_id',
    })
    // version 3 (Phase 2b): estimates
    this.version(3).stores({
      estimates: 'id, job_id',
      estimate_sections: 'id, estimate_id',
      estimate_lines: 'id, estimate_id, section_id',
    })
    // version 4 (Phase 3): standard exclusions and assumptions
    this.version(4).stores({
      clause_library: 'id, kind, sort',
      estimate_clauses: 'id, estimate_id',
    })
    // version 5 (Phase 3): site walkaround
    this.version(5).stores({
      walkarounds: 'id, job_id',
      walkaround_areas: 'id, walkaround_id',
      walkaround_elements: 'id, area_id',
    })
  }
}

let current: GwDb | null = null
export function openDb(userId: string) {
  if (current?.name === 'gwired-' + userId) return current
  current?.close()
  current = new GwDb(userId)
  return current
}
export function db(): GwDb {
  if (!current) throw new Error('Local database is not open.')
  return current
}
export const dbIsOpen = () => !!current
export function closeDb() {
  current?.close()
  current = null
}

// every local copy on this device (used when someone signs out on purpose)
export async function wipeLocalData() {
  closeDb()
  try {
    const all = (await indexedDB.databases?.()) ?? []
    await Promise.all(all.filter((d) => d.name?.startsWith('gwired-')).map((d) => Dexie.delete(d.name!)))
  } catch {
    /* ignore */
  }
}
