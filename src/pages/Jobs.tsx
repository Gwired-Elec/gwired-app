import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { fmtDate, typeLabel, useClients, useJobs, useReasons, useStatuses, useStatusFlow, type Job, type Status } from '../lib/jobs'
import { useOutboxIds } from '../lib/sync/useOutbox'

export default function Jobs() {
  const { can, profile } = useAuth()
  const nav = useNavigate()
  const jobs = useJobs()
  const clients = useClients()
  const statuses = useStatuses()
  const reasons = useReasons()
  const unsynced = useOutboxIds()
  const [view, setView] = useState<'list' | 'board'>(() => (localStorage.getItem('gw-jobs-view') as 'list' | 'board') || 'list')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('open')
  const user = { id: profile!.id, name: profile!.full_name || profile!.email }
  const [ask, dialog] = useStatusFlow(statuses, reasons, user)

  const clientName = useMemo(() => new Map((clients ?? []).map((c) => [c.id, c.name])), [clients])
  const closed = new Set(['closed', 'lost'])
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (jobs ?? [])
      .filter((j) => (filter === 'all' ? true : filter === 'open' ? !closed.has(j.status) : j.status === filter))
      .filter((j) => !t || [j.title, j.job_number, j.site_address, clientName.get(j.client_id ?? '')].some((v) => (v ?? '').toLowerCase().includes(t)))
      .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, q, filter, clientName])

  const setV = (v: 'list' | 'board') => (setView(v), localStorage.setItem('gw-jobs-view', v))
  const editable = can('jobs.edit')

  return (
    <>
      <div className="rowtop">
        <h1>Jobs</h1>
        {editable && <button className="btn primary" style={{ width: 'auto', marginTop: 0 }} onClick={() => nav('/jobs/new')}>+ New job</button>}
      </div>
      <div className="toolbar">
        <input type="text" placeholder="Search jobs…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search jobs" />
        <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by status">
          <option value="open">Open jobs</option>
          <option value="all">All jobs</option>
          {statuses?.map((s) => <option key={s.id} value={s.slug}>{s.name}</option>)}
        </select>
        <div className="seg" role="group" aria-label="View">
          <button className={view === 'list' ? 'on' : ''} onClick={() => setV('list')}>List</button>
          <button className={view === 'board' ? 'on' : ''} onClick={() => setV('board')}>Board</button>
        </div>
      </div>

      {!jobs && <p className="muted">Loading…</p>}
      {jobs && !shown.length && <div className="card"><p className="muted">{jobs.length ? 'No jobs match.' : 'No jobs yet. Add your first one with “+ New job”.'}</p></div>}

      {view === 'list' &&
        shown.map((j) => (
          <JobCard key={j.id} job={j} client={clientName.get(j.client_id ?? '')} statuses={statuses} unsynced={unsynced.has(j.id)} editable={editable} onStatus={(s) => ask(j, s)} />
        ))}

      {view === 'board' && (
        <div className="board">
          {statuses?.filter((s) => filter === 'all' || filter === 'open' ? (filter === 'all' || !closed.has(s.slug)) : s.slug === filter).map((s) => {
            const col = shown.filter((j) => j.status === s.slug)
            return (
              <div className="col" key={s.id}>
                <h3 style={{ borderColor: s.colour }}>{s.name} <span className="muted">{col.length}</span></h3>
                {col.map((j) => (
                  <JobCard key={j.id} job={j} client={clientName.get(j.client_id ?? '')} statuses={statuses} unsynced={unsynced.has(j.id)} editable={editable} onStatus={(x) => ask(j, x)} compact />
                ))}
              </div>
            )
          })}
        </div>
      )}
      {dialog}
    </>
  )
}

function JobCard({ job, client, statuses, unsynced, editable, onStatus, compact }: { job: Job; client?: string; statuses?: Status[]; unsynced: boolean; editable: boolean; onStatus: (slug: string) => void; compact?: boolean }) {
  return (
    <div className="card job">
      <Link to={`/jobs/${job.id}`} className="jobmain">
        <span className="muted small">{job.job_number ?? 'Number pending'} · {typeLabel(job.job_type)}{unsynced && <span className="badge"> not yet synced</span>}</span>
        <strong>{job.title}</strong>
        {!compact && <span className="muted">{[client, job.site_address].filter(Boolean).join(' · ')}</span>}
        {job.chase_date && job.status === 'awaiting_feedback' && <span className="small">Chase {fmtDate(job.chase_date)}</span>}
      </Link>
      <select value={job.status} disabled={!editable} onChange={(e) => onStatus(e.target.value)} aria-label={`Status of ${job.title}`}>
        {statuses?.map((s) => <option key={s.id} value={s.slug}>{s.name}</option>)}
      </select>
    </div>
  )
}
