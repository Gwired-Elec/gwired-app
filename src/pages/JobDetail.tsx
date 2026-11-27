import { useEffect, useState, type FormEvent } from 'react'
import EstimateTab from './estimating/EstimateTab'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '../lib/auth'
import { fmtDate, fmtDateTime, JOB_TYPES, useClients, useReasons, useStatuses, useStatusFlow, type Job } from '../lib/jobs'
import { formatGBP, parsePounds, toInputPounds } from '../lib/money'
import { db, type Row } from '../lib/sync/db'
import { diff, logActivity, save } from '../lib/sync/store'
import { useOutboxIds } from '../lib/sync/useOutbox'

const TABS = ['Overview', 'SoW', 'Estimate', 'Variations', 'Applications', 'Costs', 'To-dos', 'Diary', 'Files', 'Activity'] as const
const PHASE: Record<string, string> = { SoW: 'Phase 3', Variations: 'Phase 5', Applications: 'Phase 5', Costs: 'Phase 8', 'To-dos': 'Phase 8', Diary: 'Phase 8', Files: 'a later phase' }

export default function JobDetail() {
  const { id = '' } = useParams()
  const { can, profile } = useAuth()
  const job = useLiveQuery(() => db().jobs.get(id) as Promise<Job | undefined>, [id])
  const fin = useLiveQuery(() => db().job_financials.get(id) as Promise<Row | undefined>, [id])
  const statuses = useStatuses()
  const reasons = useReasons()
  const unsynced = useOutboxIds()
  const user = { id: profile!.id, name: profile!.full_name || profile!.email }
  const [ask, dialog] = useStatusFlow(statuses, reasons, user)
  // the tab lives in the address (?tab=Estimate), so refreshing or coming back lands on the same tab
  const [params, setParams] = useSearchParams()
  const asked = params.get('tab')
  const tab = (TABS as readonly string[]).includes(asked ?? '') ? (asked as (typeof TABS)[number]) : 'Overview'
  const setTab = (t: (typeof TABS)[number]) => setParams(t === 'Overview' ? {} : { tab: t }, { replace: true })

  if (job === undefined) return <p className="muted">Loading…</p>
  if (!job || job.deleted_at) return <><p><Link to="/jobs">← Jobs</Link></p><div className="card"><p>That job isn't on this device. It may not have synced yet, or it may have been removed.</p></div></>

  const status = statuses?.find((s) => s.slug === job.status)
  const editable = can('jobs.edit')
  return (
    <>
      <p><Link to="/jobs">← Jobs</Link></p>
      <div className="rowtop">
        <div>
          <div className="muted small">{job.job_number ?? 'Number pending (sent when synced)'}{unsynced.has(job.id) && <span className="badge"> not yet synced</span>}</div>
          <h1 style={{ marginBottom: 4 }}>{job.title}</h1>
        </div>
        <select value={job.status} disabled={!editable} onChange={(e) => ask(job, e.target.value)} aria-label="Status" style={{ width: 'auto', borderColor: status?.colour }}>
          {statuses?.map((s) => <option key={s.id} value={s.slug}>{s.name}</option>)}
        </select>
      </div>
      {job.status === 'lost' && job.lost_reason && <p className="err">Lost: {job.lost_reason}{job.lost_note ? ` (${job.lost_note})` : ''}</p>}
      {status?.asks_chase && job.chase_date && <p>Chase on <strong>{fmtDate(job.chase_date)}</strong></p>}

      <div className="tabs" role="tablist">
        {TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {tab === 'Overview' && <Overview job={job} fin={fin} editable={editable} user={user} />}
      {tab === 'Activity' && <Activity jobId={job.id} />}
      {tab === 'Estimate' && <div className="est"><EstimateTab job={job} user={user} /></div>}
      {tab !== 'Overview' && tab !== 'Activity' && tab !== 'Estimate' && <div className="card"><p className="muted">{tab} arrives in {PHASE[tab]}.</p></div>}
      {dialog}
    </>
  )
}

function Overview({ job, fin, editable, user }: { job: Job; fin: Row | undefined; editable: boolean; user: { id: string; name: string } }) {
  const { can } = useAuth()
  const clients = useClients()
  const [f, setF] = useState(() => toForm(job))
  const [money, setMoney] = useState(() => toMoney(fin))
  const [saved, setSaved] = useState('')
  const [err, setErr] = useState('')
  // pick up changes that arrive from the server while this screen is open and untouched
  useEffect(() => setF(toForm(job)), [job.updated_at]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setMoney(toMoney(fin)), [fin?.updated_at]) // eslint-disable-line react-hooks/exhaustive-deps

  const showMoney = can('estimates.view')
  const editMoney = can('estimates.edit')
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr('')
    const changes = diff(job, { ...f, client_id: f.client_id || null })
    if (Object.keys(changes).length) {
      await save('jobs', job.id, changes)
      await logActivity('job', job.id, 'edited', { fields: Object.keys(changes) }, user)
    }
    if (showMoney && editMoney) {
      const pence = money.value.trim() === '' ? null : parsePounds(money.value)
      if (money.value.trim() !== '' && pence === null) return setErr('Check the quote value: use pounds and pence, e.g. 1250.00')
      const next = { quote_value_pence: pence, quote_date: money.date || null, valid_until: money.valid || null, probability: money.prob === '' ? null : Number(money.prob) }
      const mChanges = fin ? diff(fin, next) : Object.fromEntries(Object.entries(next).filter(([, v]) => v !== null))
      if (Object.keys(mChanges).length) {
        await save('job_financials', job.id, mChanges)
        await logActivity('job', job.id, 'quote', { fields: Object.keys(mChanges) }, user)
      }
    }
    setSaved('Saved on this device' + (navigator.onLine ? '.' : ', and will send when you are back online.'))
    setTimeout(() => setSaved(''), 4000)
  }

  const ro = !editable
  return (
    <form className="card" onSubmit={submit}>
      <label htmlFor="t">Title</label>
      <input id="t" type="text" required disabled={ro} value={f.title} onChange={(e) => set('title', e.target.value)} />
      <label htmlFor="c">Client</label>
      <select id="c" disabled={ro} value={f.client_id} onChange={(e) => set('client_id', e.target.value)}>
        <option value="">No client</option>
        {clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <label htmlFor="s">Site address</label>
      <input id="s" type="text" disabled={ro} value={f.site_address} onChange={(e) => set('site_address', e.target.value)} />
      <label htmlFor="mc">Main contractor (if any)</label>
      <input id="mc" type="text" disabled={ro} value={f.main_contractor} onChange={(e) => set('main_contractor', e.target.value)} />
      <label htmlFor="jt">Job type</label>
      <select id="jt" disabled={ro} value={f.job_type} onChange={(e) => set('job_type', e.target.value)}>
        {JOB_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <label htmlFor="so">Source</label>
      <input id="so" type="text" disabled={ro} value={f.source} onChange={(e) => set('source', e.target.value)} />
      <label htmlFor="n">Notes</label>
      <textarea id="n" rows={4} disabled={ro} value={f.notes} onChange={(e) => set('notes', e.target.value)} />

      {showMoney && (
        <>
          <h2 style={{ marginTop: 20 }}>Quote</h2>
          {fin?.quote_value_pence != null && <p className="muted">Currently {formatGBP(fin.quote_value_pence as number)}</p>}
          <label htmlFor="qv">Quote value (£)</label>
          <input id="qv" type="text" inputMode="decimal" disabled={!editMoney} value={money.value} onChange={(e) => setMoney({ ...money, value: e.target.value })} />
          <label htmlFor="qd">Quote date</label>
          <input id="qd" type="date" disabled={!editMoney} value={money.date} onChange={(e) => setMoney({ ...money, date: e.target.value })} />
          <label htmlFor="vu">Valid until</label>
          <input id="vu" type="date" disabled={!editMoney} value={money.valid} onChange={(e) => setMoney({ ...money, valid: e.target.value })} />
          <label htmlFor="pr">Probability (%)</label>
          <input id="pr" type="text" inputMode="numeric" disabled={!editMoney} value={money.prob} onChange={(e) => setMoney({ ...money, prob: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
        </>
      )}
      {err && <p className="err" role="alert">{err}</p>}
      {saved && <p className="ok" role="status">{saved}</p>}
      {editable && <button className="btn primary">Save changes</button>}
    </form>
  )
}

const toForm = (j: Job) => ({ title: j.title ?? '', client_id: j.client_id ?? '', site_address: j.site_address ?? '', main_contractor: j.main_contractor ?? '', job_type: j.job_type ?? 'domestic', source: j.source ?? '', notes: j.notes ?? '' })
const toMoney = (r: Row | undefined) => ({
  value: toInputPounds(r?.quote_value_pence as number | null | undefined),
  date: (r?.quote_date as string) ?? '',
  valid: (r?.valid_until as string) ?? '',
  prob: r?.probability == null ? '' : String(r.probability),
})

const ACTION: Record<string, (d: Record<string, unknown>) => string> = {
  created: () => 'created the job',
  status: (d) => `changed status ${String(d.from).replace(/_/g, ' ')} → ${String(d.to).replace(/_/g, ' ')}${d.lost_reason ? ` (${d.lost_reason})` : ''}`,
  edited: (d) => `edited ${((d.fields as string[]) ?? []).join(', ').replace(/_/g, ' ')}`,
  estimate: (d) => (d.from ? `made estimate revision ${d.rev} from ${d.from}` : `started estimate ${d.rev}`),
  quote: (d) => `updated the quote (${((d.fields as string[]) ?? []).join(', ').replace(/_/g, ' ')})`,
}
function Activity({ jobId }: { jobId: string }) {
  const rows = useLiveQuery(() => db().activity_log.where('entity_id').equals(jobId).toArray(), [jobId])
  const sorted = [...(rows ?? [])].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  return (
    <div className="card">
      {!sorted.length && <p className="muted">Nothing yet.</p>}
      {sorted.map((r) => (
        <p key={r.id} style={{ margin: '0 0 10px' }}>
          <strong>{String(r.user_name ?? 'Someone')}</strong> {(ACTION[String(r.action)] ?? (() => String(r.action)))((r.detail as Record<string, unknown>) ?? {})}
          <br /><span className="muted small">{fmtDateTime(String(r.created_at))}</span>
        </p>
      ))}
    </div>
  )
}
