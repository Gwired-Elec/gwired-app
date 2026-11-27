import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { fmtDate, typeLabel, useClients, useJobs, useReasons, useStatuses, useStatusFlow, type Job, type Status } from '../lib/jobs'
import { useOutboxIds } from '../lib/sync/useOutbox'

export default function Jobs({ archive = false }: { archive?: boolean }) {
  const { can, profile } = useAuth()
  const nav = useNavigate()
  const allJobs = useJobs()
  // closed and lost jobs are archived automatically: they leave the main list and live under Archive (closed and lost shown separately)
  const isArchived = (j: Job) => j.status === 'closed' || j.status === 'lost'
  const jobs = useMemo(() => allJobs?.filter((j) => isArchived(j) === archive), [allJobs, archive])
  const archivedCount = allJobs?.filter(isArchived).length ?? 0
  const clients = useClients()
  const statuses = useStatuses()
  const reasons = useReasons()
  const unsynced = useOutboxIds()
  const [view, setView] = useState<'list' | 'board'>(() => (localStorage.getItem('gw-jobs-view') as 'list' | 'board') || 'list')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const user = { id: profile!.id, name: profile!.full_name || profile!.email }
  const [ask, dialog] = useStatusFlow(statuses, reasons, user)

  const clientName = useMemo(() => new Map((clients ?? []).map((c) => [c.id, c.name])), [clients])
  const flowStatuses = statuses?.filter((s) => s.slug !== 'closed' && s.slug !== 'lost')
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (jobs ?? [])
      .filter((j) => (archive || filter === 'all' ? true : j.status === filter))
      .filter((j) => !t || [j.title, j.job_number, j.site_address, clientName.get(j.client_id ?? '')].some((v) => (v ?? '').toLowerCase().includes(t)))
      .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, q, filter, clientName])

  const setV = (v: 'list' | 'board') => (setView(v), localStorage.setItem('gw-jobs-view', v))
  const editable = can('jobs.edit')

  return (
    <>
      <div className="rowtop">
        <h1>{archive ? 'Archived jobs' : 'Jobs'}</h1>
        {archive && <button className="btn" style={{ width: 'auto', marginTop: 0 }} onClick={() => nav('/jobs')}>← Jobs</button>}
      </div>
      <div className="toolbar">
        <input type="text" placeholder="Search jobs…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search jobs" />
        {!archive && (
          <div className="seg" role="group" aria-label="View">
            <button className={view === 'list' ? 'on' : ''} onClick={() => setV('list')} aria-label="List view" title="List">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" /></svg>
            </button>
            <button className={view === 'board' ? 'on' : ''} onClick={() => setV('board')} aria-label="Board view" title="Board">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><rect x="2.5" y="3.5" width="4" height="13" rx="1" /><rect x="8" y="3.5" width="4" height="9" rx="1" /><rect x="13.5" y="3.5" width="4" height="11" rx="1" /></svg>
            </button>
          </div>
        )}
        {!archive && editable && <button className="btn primary newjob" aria-label="New job" onClick={() => nav('/jobs/new')}>+<span className="lbl"> New job</span></button>}
      </div>
      {!archive && <div className="chips" role="group" aria-label="Filter by status">
        <button className={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>All active <span>{jobs?.length ?? 0}</span></button>
        {flowStatuses?.map((s) => (
          <button key={s.id} className={`chip ${filter === s.slug ? 'on' : ''}`} style={{ '--c': s.colour } as React.CSSProperties} onClick={() => setFilter(s.slug)}>
            <i className="dot" />{s.name} <span>{(jobs ?? []).filter((j) => j.status === s.slug).length}</span>
          </button>
        ))}
        <button className="chip" onClick={() => nav('/jobs/archive')}>Archive <span>{archivedCount}</span></button>
      </div>}

      {!jobs && <p className="muted">Loading…</p>}
      {jobs && !shown.length && <div className="card"><p className="muted">{jobs.length ? 'No jobs match.' : archive ? 'Nothing archived yet. Jobs appear here when their status is set to Closed or Lost.' : 'No jobs yet. Add your first one with “+ New job”.'}</p></div>}

      {archive && ['closed', 'lost'].map((slug) => {
        const list = shown.filter((j) => j.status === slug)
        const st = statuses?.find((x) => x.slug === slug)
        return (
          <section key={slug}>
            <h2 style={{ borderLeft: `6px solid ${st?.colour}`, paddingLeft: 10 }}>{slug === 'closed' ? 'Closed jobs' : 'Lost jobs'} <span className="muted">{list.length}</span></h2>
            {!list.length && <p className="muted small">None.</p>}
            {list.map((j) => <JobCard key={j.id} job={j} client={clientName.get(j.client_id ?? '')} statuses={statuses} unsynced={unsynced.has(j.id)} editable={editable} onStatus={(x) => ask(j, x)} />)}
          </section>
        )
      })}

      {!archive && view === 'list' &&
        shown.map((j) => (
          <JobCard key={j.id} job={j} client={clientName.get(j.client_id ?? '')} statuses={statuses} unsynced={unsynced.has(j.id)} editable={editable} onStatus={(s) => ask(j, s)} />
        ))}

      {!archive && view === 'board' && (
        <div className="board">
          {statuses?.filter((s) => s.slug !== 'closed' && s.slug !== 'lost').filter((s) => filter === 'all' || s.slug === filter).map((s) => {
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
  const current = statuses?.find((s) => s.slug === job.status)
  return (
    <div className="card job" style={{ borderLeft: `6px solid ${current?.colour ?? '#a1a1aa'}` }}>
      <Link to={`/jobs/${job.id}`} className="jobmain">
        <span className="muted small">{job.job_number ?? 'Number pending'} · {typeLabel(job.job_type)}{unsynced && <span className="badge"> not yet synced</span>}</span>
        <strong>{job.title}</strong>
        {!compact && <span className="muted">{[client, job.site_address].filter(Boolean).join(' · ')}</span>}
        {job.chase_date && current?.asks_chase && <span className="small">Chase {fmtDate(job.chase_date)}</span>}
      </Link>
      <select value={job.status} disabled={!editable} onChange={(e) => onStatus(e.target.value)} aria-label={`Status of ${job.title}`} style={{ borderColor: current?.colour, color: current?.colour, fontWeight: 600 }}>
        {statuses?.map((s) => <option key={s.id} value={s.slug}>{s.name}</option>)}
      </select>
    </div>
  )
}
