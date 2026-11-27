import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '../lib/auth'
import { useReasons, type Reason, type Status } from '../lib/jobs'
import { db } from '../lib/sync/db'
import { newId, remove, save } from '../lib/sync/store'

// every status, including switched-off ones (the job list itself only offers the active ones)
const useAllStatuses = () => useLiveQuery(async () => ((await db().job_statuses.orderBy('sort').filter((s) => !s.deleted_at).toArray()) as unknown as Status[]), [])

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

export default function PipelineSettings() {
  const { can } = useAuth()
  const statuses = useAllStatuses()
  const reasons = useReasons()
  const [name, setName] = useState('')
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')

  if (!can('settings')) return <><h1>Job pipeline</h1><p className="muted">You don't have permission to change settings.</p></>

  async function move<T extends { id: string; sort: number }>(tbl: 'job_statuses' | 'lost_reasons', list: T[], i: number, dir: -1 | 1) {
    const a = list[i]
    const b = list[i + dir]
    if (!b) return
    // swap their positions; give them distinct numbers first in case two share one
    const sa = a.sort === b.sort ? (dir === 1 ? b.sort + 1 : b.sort - 1) : a.sort
    await save(tbl, a.id, { sort: b.sort })
    await save(tbl, b.id, { sort: sa })
  }

  async function addStatus(e: FormEvent) {
    e.preventDefault()
    setErr('')
    const slug = slugify(name)
    if (!slug) return
    if (statuses?.some((s) => s.slug === slug)) return setErr('There is already a status with that name.')
    await save('job_statuses', newId(), { slug, name: name.trim(), sort: (statuses?.at(-1)?.sort ?? 0) + 10, colour: '#52525b', is_lost: false, asks_chase: false, active: true })
    setName('')
  }

  async function toggleActive(s: Status) {
    setErr('')
    if (s.active !== false) {
      const used = await db().jobs.filter((j) => !j.deleted_at && j.status === s.slug).count()
      if (used) return setErr(`${used} job${used === 1 ? ' is' : 's are'} still "${s.name}". Move ${used === 1 ? 'it' : 'them'} first, then switch this status off.`)
    }
    await save('job_statuses', s.id, { active: s.active === false })
  }

  async function addReason(e: FormEvent) {
    e.preventDefault()
    if (!reason.trim()) return
    await save('lost_reasons', newId(), { name: reason.trim(), sort: (reasons?.at(-1)?.sort ?? 0) + 10, needs_note: false })
    setReason('')
  }

  return (
    <>
      <p><Link to="/more">← More</Link></p>
      <h1>Job pipeline</h1>
      {err && <p className="err" role="alert">{err}</p>}

      <div className="card">
        <h2>Job statuses</h2>
        <p className="muted">The order here is the order on the jobs board. A status that asks for a lost reason will prompt for it whenever a job is moved to it.</p>
        {statuses?.map((s, i) => (
          <div key={s.id} className="setrow" style={{ opacity: s.active === false ? 0.55 : 1 }}>
            <input type="color" aria-label={`Colour for ${s.name}`} value={s.colour} onChange={(e) => save('job_statuses', s.id, { colour: e.target.value })} />
            <input type="text" aria-label="Status name" defaultValue={s.name} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== s.name && save('job_statuses', s.id, { name: e.target.value.trim() })} />
            <label className="check mini"><input type="checkbox" checked={s.is_lost} onChange={(e) => save('job_statuses', s.id, { is_lost: e.target.checked })} /> Asks lost reason</label>
            <div className="actions" style={{ margin: 0 }}>
              <button className="btn" aria-label="Move up" disabled={i === 0} onClick={() => move('job_statuses', statuses, i, -1)}>↑</button>
              <button className="btn" aria-label="Move down" disabled={i === statuses.length - 1} onClick={() => move('job_statuses', statuses, i, 1)}>↓</button>
              <button className="btn" onClick={() => toggleActive(s)}>{s.active === false ? 'Switch on' : 'Switch off'}</button>
            </div>
          </div>
        ))}
        <form onSubmit={addStatus} className="actions">
          <input type="text" placeholder="New status name" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: '1 1 200px' }} />
          <button className="btn primary" style={{ width: 'auto', marginTop: 0 }} disabled={!name.trim()}>Add status</button>
        </form>
      </div>

      <div className="card">
        <h2>Lost reasons</h2>
        {reasons?.map((r: Reason, i) => (
          <div key={r.id} className="setrow">
            <input type="text" aria-label="Reason" defaultValue={r.name} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== r.name && save('lost_reasons', r.id, { name: e.target.value.trim() })} />
            <label className="check mini"><input type="checkbox" checked={r.needs_note} onChange={(e) => save('lost_reasons', r.id, { needs_note: e.target.checked })} /> Asks for a note</label>
            <div className="actions" style={{ margin: 0 }}>
              <button className="btn" aria-label="Move up" disabled={i === 0} onClick={() => move('lost_reasons', reasons, i, -1)}>↑</button>
              <button className="btn" aria-label="Move down" disabled={i === reasons.length - 1} onClick={() => move('lost_reasons', reasons, i, 1)}>↓</button>
              <button className="btn" onClick={() => remove('lost_reasons', r.id)}>Remove</button>
            </div>
          </div>
        ))}
        <form onSubmit={addReason} className="actions">
          <input type="text" placeholder="New reason" value={reason} onChange={(e) => setReason(e.target.value)} style={{ flex: '1 1 200px' }} />
          <button className="btn primary" style={{ width: 'auto', marginTop: 0 }} disabled={!reason.trim()}>Add reason</button>
        </form>
      </div>
    </>
  )
}
