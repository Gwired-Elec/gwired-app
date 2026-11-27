// Shared bits for clients and jobs: labels, types, live queries, and the "change status" flow (which asks for a lost reason
// or a chase date when the status needs one).
import { useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Row } from './sync/db'
import { logActivity, save } from './sync/store'

export const JOB_TYPES: [string, string][] = [
  ['domestic', 'Domestic'],
  ['commercial', 'Commercial'],
  ['industrial', 'Industrial'],
  ['eicr', 'EICR'],
  ['testing', 'Testing'],
  ['maintenance', 'Maintenance'],
]
export const typeLabel = (t: string) => JOB_TYPES.find(([k]) => k === t)?.[1] ?? t

export interface Job extends Row {
  job_number: string | null
  title: string
  client_id: string | null
  contact_id: string | null
  site_address: string | null
  main_contractor: string | null
  job_type: string
  source: string | null
  status: string
  lost_reason: string | null
  lost_note: string | null
  chase_date: string | null
  notes: string | null
}
export interface Client extends Row {
  name: string
  client_type: string
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
}
export interface Status extends Row {
  slug: string
  name: string
  sort: number
  colour: string
  is_lost: boolean
  asks_chase: boolean
}
export interface Reason extends Row {
  name: string
  sort: number
  needs_note: boolean
}

const live = (r: Row) => !r.deleted_at
export const useStatuses = () => useLiveQuery(() => db().job_statuses.orderBy('sort').filter((s) => live(s) && s.active !== false).toArray() as unknown as Promise<Status[]>, [])
export const useReasons = () => useLiveQuery(() => db().lost_reasons.orderBy('sort').filter(live).toArray() as unknown as Promise<Reason[]>, [])
export const useClients = () => useLiveQuery(() => db().clients.orderBy('name').filter(live).toArray() as unknown as Promise<Client[]>, [])
export const useJobs = () => useLiveQuery(() => db().jobs.filter(live).toArray() as unknown as Promise<Job[]>, [])

export const fmtDate = (d: string | null | undefined) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '')
export const fmtDateTime = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : ''
export const addDays = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

type User = { id: string; name: string }

// Returns [ask, dialog]. Call ask(job, newStatusSlug); render `dialog` somewhere on the page.
export function useStatusFlow(statuses: Status[] | undefined, reasons: Reason[] | undefined, user: User): [(job: Job, slug: string) => void, ReactNode] {
  const [pending, setPending] = useState<{ job: Job; status: Status } | null>(null)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [chase, setChase] = useState(addDays(7))

  async function apply(job: Job, status: Status, extra: Record<string, unknown> = {}) {
    const wasLost = statuses?.find((s) => s.slug === job.status)?.is_lost
    const patch: Record<string, unknown> = { status: status.slug, ...extra }
    if (wasLost && !status.is_lost) Object.assign(patch, { lost_reason: null, lost_note: null })
    await save('jobs', job.id, patch)
    await logActivity('job', job.id, 'status', { from: job.status, to: status.slug, ...extra }, user)
    setPending(null)
  }

  const ask = (job: Job, slug: string) => {
    const status = statuses?.find((s) => s.slug === slug)
    if (!status || status.slug === job.status) return
    if (status.is_lost) {
      setReason('')
      setNote('')
      return setPending({ job, status })
    }
    if (status.asks_chase) {
      setChase(addDays(7))
      return setPending({ job, status })
    }
    void apply(job, status)
  }

  let dialog: ReactNode = null
  if (pending) {
    const { job, status } = pending
    const chosen = reasons?.find((r) => r.name === reason)
    dialog = (
      <div className="overlay" role="dialog" aria-modal="true" onClick={() => setPending(null)}>
        <div className="sheet" onClick={(e) => e.stopPropagation()}>
          <h2>{job.title}</h2>
          <p className="muted">Move to <strong>{status.name}</strong></p>
          {status.is_lost && (
            <>
              <label htmlFor="lr">Why was it lost?</label>
              <select id="lr" value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">Choose a reason…</option>
                {reasons?.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
              </select>
              {chosen?.needs_note && (
                <>
                  <label htmlFor="ln">Tell us more</label>
                  <input id="ln" type="text" value={note} onChange={(e) => setNote(e.target.value)} />
                </>
              )}
            </>
          )}
          {status.asks_chase && (
            <>
              <label htmlFor="cd">Chase on</label>
              <input id="cd" type="date" value={chase} onChange={(e) => setChase(e.target.value)} />
            </>
          )}
          <div className="actions">
            <button
              className="btn primary"
              style={{ width: 'auto' }}
              disabled={status.is_lost ? !reason || (!!chosen?.needs_note && !note.trim()) : !chase}
              onClick={() => apply(job, status, status.is_lost ? { lost_reason: reason, lost_note: note.trim() || null } : { chase_date: chase })}
            >
              Save
            </button>
            <button className="btn" onClick={() => setPending(null)}>Cancel</button>
          </div>
        </div>
      </div>
    )
  }
  return [ask, dialog]
}
