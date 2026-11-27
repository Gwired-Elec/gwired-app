// The sync engine. Runs while the app is open and a user is signed in.
//  PUSH: send queued changes (outbox) to the server in order, in small batches. Each has its own id, so a retry after a
//        dropped connection never duplicates anything. A change the server refuses for good is parked (shown in the sync log)
//        so it never blocks the ones behind it.
//  PULL: for each table, fetch rows changed since the last pull. A pulled row never overwrites a change still waiting to be
//        sent: the waiting change is laid back on top.
// iOS has no background sync, so we sync: on launch, when the connection returns, when the app comes back to the front,
// on a timer while it is open, shortly after any change, and on the "Sync now" button.
import { useSyncExternalStore } from 'react'
import { supabase } from '../supabase'
import { db, dbIsOpen, SYNC_TABLES, type OutboxOp, type Row, type SyncTable } from './db'

export type SyncPhase = 'synced' | 'syncing' | 'offline' | 'error'
export interface SyncStatus {
  phase: SyncPhase
  pending: number // changes waiting to send
  parked: number // changes the server refused (need a person)
  conflicts: number
  lastSync: string | null
  error: string | null
}

let status: SyncStatus = { phase: navigator.onLine ? 'synced' : 'offline', pending: 0, parked: 0, conflicts: 0, lastSync: null, error: null }
const listeners = new Set<() => void>()
const set = (p: Partial<SyncStatus>) => {
  status = { ...status, ...p }
  listeners.forEach((l) => l())
}
export const useSyncStatus = () => useSyncExternalStore((cb) => (listeners.add(cb), () => listeners.delete(cb)), () => status)

const BATCH = 50
const PAGE = 1000
const isNetwork = (m: string) => !navigator.onLine || /fetch|network|load failed|timeout/i.test(m)

async function refreshCounts() {
  if (!dbIsOpen()) return
  const d = db()
  const all = await d.outbox.toArray()
  set({ pending: all.filter((o) => !o.error).length, parked: all.filter((o) => o.error).length, conflicts: await d.conflicts.count() })
}

// ---------------- push ----------------
async function push(): Promise<'ok' | 'offline'> {
  const d = db()
  for (;;) {
    const ops = (await d.outbox.orderBy('seq').toArray()).filter((o) => !o.error).slice(0, BATCH)
    if (!ops.length) return 'ok'
    const wire = ops.map((o) => ({ op_id: o.op_id, table: o.tbl, row_id: o.row_id, patch: o.patch, base: o.base, ts: o.ts, force: !!o.force }))
    const { data, error } = await supabase.rpc('sync_push', { p_ops: wire })
    if (error) {
      if (isNetwork(error.message)) return 'offline'
      throw new Error(error.message)
    }
    const results = data as { op_id: string; status: string; message?: string }[]
    const byId = new Map(results.map((r) => [r.op_id, r]))
    await d.transaction('rw', d.outbox, async () => {
      for (const o of ops) {
        const r = byId.get(o.op_id)
        if (!r) continue
        if (r.status === 'error') await d.outbox.update(o.seq!, { error: r.message ?? 'The server refused this change.', tries: o.tries + 1 })
        else await d.outbox.delete(o.seq!) // applied, duplicate or conflict (a conflict is now recorded on the server)
      }
    })
    await refreshCounts()
  }
}

// ---------------- pull ----------------
async function applyPulled(tbl: SyncTable, rows: Row[]) {
  if (!rows.length) return
  const d = db()
  await d.transaction('rw', d.table(tbl), d.outbox, async () => {
    await d.table(tbl).bulkPut(rows)
    // lay still-waiting local changes back on top of what we just received
    const ids = new Set(rows.map((r) => r.id))
    const waiting = (await d.outbox.where('tbl').equals(tbl).toArray()).filter((o) => ids.has(o.row_id) && !o.error).sort((a, b) => a.seq! - b.seq!)
    for (const o of waiting) {
      const row = (await d.table(tbl).get(o.row_id)) as Row | undefined
      if (row) await d.table(tbl).put({ ...row, ...o.patch })
    }
  })
}

async function pull() {
  const d = db()
  for (const tbl of SYNC_TABLES) {
    const key = 'cursor:' + tbl
    let cursor = ((await d.meta.get(key))?.value as string | undefined) ?? null
    for (;;) {
      let q = supabase.from(tbl).select('*').order('updated_at', { ascending: true }).order('id', { ascending: true }).limit(PAGE)
      if (cursor) q = q.gte('updated_at', cursor)
      const { data, error } = await q
      if (error) throw new Error(`${tbl}: ${error.message}`)
      const rows = (data ?? []) as Row[]
      await applyPulled(tbl, rows)
      if (!rows.length) break
      const last = rows[rows.length - 1].updated_at as string
      const advanced = last !== cursor
      cursor = last
      await d.meta.put({ key, value: cursor })
      if (rows.length < PAGE || !advanced) break
    }
  }
  // unresolved conflicts (replace the local list)
  const { data, error } = await supabase.from('conflicts').select('*').is('resolved_at', null)
  if (error) throw new Error('conflicts: ' + error.message)
  await d.transaction('rw', d.conflicts, async () => {
    await d.conflicts.clear()
    await d.conflicts.bulkPut((data ?? []) as never[])
  })
}

// ---------------- run ----------------
let running: Promise<void> | null = null
export function syncNow(): Promise<void> {
  if (running) return running
  running = (async () => {
    if (!dbIsOpen()) return
    if (!navigator.onLine) {
      await refreshCounts()
      return set({ phase: 'offline' })
    }
    const { data } = await supabase.auth.getSession()
    if (!data.session) return
    set({ phase: 'syncing', error: null })
    try {
      if ((await push()) === 'offline') {
        await refreshCounts()
        return set({ phase: 'offline' })
      }
      await pull()
      await refreshCounts()
      set({ phase: 'synced', lastSync: new Date().toISOString(), error: null })
      try {
        await db().meta.put({ key: 'lastSync', value: status.lastSync })
      } catch {
        /* ignore */
      }
    } catch (e) {
      await refreshCounts().catch(() => {})
      const m = e instanceof Error ? e.message : String(e)
      set(isNetwork(m) ? { phase: 'offline' } : { phase: 'error', error: m })
    }
  })().finally(() => {
    running = null
  })
  return running
}

let kickTimer: ReturnType<typeof setTimeout> | undefined
export function kickSync() {
  void refreshCounts()
  clearTimeout(kickTimer)
  kickTimer = setTimeout(() => void syncNow(), 800)
}

let stop: (() => void) | null = null
export function startSync() {
  if (stop) return
  const onOnline = () => void syncNow()
  const onOffline = () => (set({ phase: 'offline' }), void refreshCounts())
  const onVis = () => document.visibilityState === 'visible' && void syncNow()
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  document.addEventListener('visibilitychange', onVis)
  const timer = setInterval(() => document.visibilityState === 'visible' && void syncNow(), 30_000)
  void db().meta.get('lastSync').then((m) => m && set({ lastSync: m.value as string }))
  void refreshCounts()
  void syncNow()
  stop = () => {
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    document.removeEventListener('visibilitychange', onVis)
    clearInterval(timer)
    clearTimeout(kickTimer)
    stop = null
  }
}
export const stopSync = () => stop?.()

// ---------------- helpers for the sync log screen ----------------
export async function retryParked() {
  await db().outbox.toCollection().modify((o: OutboxOp) => void delete o.error)
  void syncNow()
}
export async function discardParked() {
  const d = db()
  const bad = (await d.outbox.toArray()).filter((o) => o.error)
  await d.outbox.bulkDelete(bad.map((o) => o.seq!))
  await refreshCounts()
}
export async function pendingCount() {
  if (!dbIsOpen()) return 0
  return (await db().outbox.count())
}
export async function resolveConflict(id: string, useMine: boolean) {
  const { error } = await supabase.rpc('resolve_conflict', { p_id: id, p_use_mine: useMine })
  if (error) throw new Error(error.message)
  await syncNow()
}
