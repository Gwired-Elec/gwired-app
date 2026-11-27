// The local database on this device (Dexie / IndexedDB). The app reads and writes HERE; the sync engine moves changes to and
// from Supabase in the background. One database per signed-in user, so a shared device never mixes people's data.
import Dexie, { type Table } from 'dexie'

export const SYNC_TABLES = ['job_statuses', 'lost_reasons', 'clients', 'contacts', 'jobs', 'job_financials', 'activity_log'] as const
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
