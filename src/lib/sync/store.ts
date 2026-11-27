// How the app changes data: every write goes to the local database AND the outbox in one transaction, then the sync engine
// is nudged. Nothing here needs a connection.
import { db, PROTECTED, WRITABLE, type Row, type SyncTable } from './db'
import { kickSync } from './engine'

export const newId = () => crypto.randomUUID()
const now = () => new Date().toISOString()

// Create or change one row. `patch` holds only the fields being set (a new row: all of them).
// For protected fields the engine remembers the value the device started from, so the server can tell a real clash
// from a plain update.
async function applyOne(d: ReturnType<typeof db>, tbl: SyncTable, id: string, patch: Record<string, unknown>) {
  const existing = (await d.table(tbl).get(id)) as Row | undefined
  const sendable: Record<string, unknown> = {}
  for (const k of Object.keys(patch)) if (WRITABLE[tbl].includes(k)) sendable[k] = patch[k]
  if (!Object.keys(sendable).length) return
  const base: Record<string, unknown> = {}
  if (existing) for (const k of Object.keys(sendable)) if (PROTECTED[tbl].includes(k)) base[k] = existing[k] ?? null
  await d.table(tbl).put({ ...(existing ?? { created_at: now() }), ...patch, id, updated_at: existing?.updated_at ?? now() })
  await d.outbox.add({ op_id: newId(), tbl, row_id: id, patch: sendable, base, ts: now(), tries: 0 })
}

export const save = (tbl: SyncTable, id: string, patch: Record<string, unknown>) => saveBatch([{ tbl, id, patch }])

// Many rows in ONE transaction (price-file imports, assemblies): all or nothing on the device, one nudge to the sync engine.
export async function saveBatch(items: { tbl: SyncTable; id: string; patch: Record<string, unknown> }[]) {
  if (!items.length) return
  const d = db()
  const tables = [...new Set(items.map((i) => i.tbl))].map((t) => d.table(t))
  await d.transaction('rw', [...tables, d.outbox], async () => {
    for (const it of items) await applyOne(d, it.tbl, it.id, it.patch)
  })
  kickSync()
}

// Delete = set deleted_at (nothing is ever really removed; history keeps names)
export const remove = (tbl: SyncTable, id: string) => save(tbl, id, { deleted_at: now() })

// only the fields that actually changed (so two people editing different fields never overwrite each other)
export function diff<T extends Record<string, unknown>>(before: Row | undefined, after: T) {
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(after)) {
    const a = (before?.[k] ?? null) === '' ? null : (before?.[k] ?? null)
    const b = after[k] === '' ? null : (after[k] ?? null)
    if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = after[k] === '' ? null : after[k]
  }
  return out
}

export async function logActivity(entity: string, entityId: string, action: string, detail: Record<string, unknown>, user: { id: string; name: string }) {
  await save('activity_log', newId(), { entity, entity_id: entityId, action, detail, user_id: user.id, user_name: user.name, created_at: now() })
}
