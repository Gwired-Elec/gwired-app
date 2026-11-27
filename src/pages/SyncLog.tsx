import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/sync/db'
import { discardParked, resolveConflict, retryParked, syncNow, useSyncStatus } from '../lib/sync/engine'
import { fmtDateTime } from '../lib/jobs'

const show = (v: unknown) => (v === null || v === undefined || v === '' ? '(empty)' : typeof v === 'object' ? JSON.stringify(v) : String(v))
const label = (s: string) => s.replace(/_/g, ' ')

export default function SyncLog() {
  const s = useSyncStatus()
  const ops = useLiveQuery(() => db().outbox.orderBy('seq').toArray(), [], [])
  const conflicts = useLiveQuery(() => db().conflicts.toArray(), [], [])
  const [storage, setStorage] = useState<{ used: number; quota: number; persisted: boolean } | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    void (async () => {
      const e = await navigator.storage?.estimate?.()
      const persisted = (await navigator.storage?.persisted?.()) ?? false
      if (e) setStorage({ used: e.usage ?? 0, quota: e.quota ?? 0, persisted })
    })()
  }, [])

  const parked = ops.filter((o) => o.error)
  const waiting = ops.filter((o) => !o.error)
  const mb = (n: number) => (n / 1048576).toFixed(1) + ' MB'

  return (
    <>
      <p><Link to="/more">← More</Link></p>
      <h1>Sync</h1>
      <div className="card">
        <p><strong>{s.phase === 'synced' ? 'Everything is up to date.' : s.phase === 'syncing' ? 'Syncing…' : s.phase === 'offline' ? 'Offline. Changes are saved on this device and will send when you reconnect.' : 'Something went wrong with the last sync.'}</strong></p>
        <p className="muted">Last synced {s.lastSync ? fmtDateTime(s.lastSync) : 'never'} · {waiting.length} waiting to send</p>
        {s.error && <p className="err">{s.error}</p>}
        <button className="btn" onClick={() => syncNow()} disabled={s.phase === 'syncing'}>Sync now</button>
      </div>

      {!!conflicts.length && (
        <div className="card notice">
          <h2>Conflicts to resolve</h2>
          <p className="muted">Two people changed the same thing. Nothing was overwritten. Choose which to keep.</p>
          {conflicts.map((c) => (
            <div key={c.id} style={{ margin: '12px 0' }}>
              <strong>{label(c.table_name)} · {label(c.field)}</strong>
              <div>On the server: <strong>{show(c.server_value)}</strong></div>
              <div>Your change: <strong>{show(c.client_value)}</strong></div>
              <div className="actions">
                <button className="btn" onClick={() => resolveConflict(c.id, false).catch((e) => setMsg(e.message))}>Keep the server's</button>
                <button className="btn" onClick={() => resolveConflict(c.id, true).catch((e) => setMsg(e.message))}>Use mine</button>
              </div>
            </div>
          ))}
          {msg && <p className="err">{msg}</p>}
        </div>
      )}

      {!!parked.length && (
        <div className="card notice">
          <h2>Changes the server refused</h2>
          {parked.map((o) => <p key={o.seq}><strong>{label(o.tbl)}</strong>: {o.error}</p>)}
          <div className="actions">
            <button className="btn" onClick={() => retryParked()}>Try again</button>
            <button className="btn" onClick={() => confirm('Discard these changes? They will be lost.') && discardParked()}>Discard</button>
          </div>
        </div>
      )}

      {!!waiting.length && (
        <div className="card">
          <h2>Waiting to send</h2>
          {waiting.map((o) => <p key={o.seq} className="muted" style={{ margin: '0 0 6px' }}>{label(o.tbl)} · {Object.keys(o.patch).map(label).join(', ')}</p>)}
        </div>
      )}

      <div className="card">
        <h2>Storage on this device</h2>
        {storage ? <p className="muted">{mb(storage.used)} used of {mb(storage.quota)} · {storage.persisted ? 'protected from automatic clean-up' : 'not yet protected from automatic clean-up'}</p> : <p className="muted">Not available in this browser.</p>}
        {storage && !storage.persisted && <button className="btn" onClick={async () => { await navigator.storage.persist(); setStorage({ ...storage, persisted: await navigator.storage.persisted() }) }}>Protect my data on this device</button>}
        <p className="muted small">On iPhone and iPad, add G|Wired to your Home Screen (Share, then Add to Home Screen). Safari can clear data for websites that aren't installed.</p>
      </div>
    </>
  )
}
