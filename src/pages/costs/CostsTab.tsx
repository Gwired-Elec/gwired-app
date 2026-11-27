// Costs on a job: what the estimate said it would cost, what has actually been spent, and what is still to come.
// Time on site comes from the diary (days x day cost) and can be overruled by hand; materials, misc and non-recoverable costs are typed in.
import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { MoneyInput, NumInput } from '../../components/MoneyInput'
import { useAuth } from '../../lib/auth'
import { acceptedValue, contractEstimate, useCommercial, variationValues } from '../../lib/commercial/data'
import { budgetOf, labourRows, summarise, type CCost, type CEvent, type LabourRow } from '../../lib/costs/calc'
import { estimateTotals } from '../../lib/estimating/estimate'
import { useLabourRates } from '../../lib/estimating/data'
import { useJobEstimates } from '../../lib/estimating/estimates'
import { fmtDate, type Job } from '../../lib/jobs'
import { formatGBP } from '../../lib/money'
import { todayIso, useEvents } from '../../lib/planner/data'
import { db } from '../../lib/sync/db'
import { newId, remove, save } from '../../lib/sync/store'
import { useLabels } from '../planner/shared'

const n = (v: unknown) => Number(v ?? 0)
const gradeKey = (jobId: string) => 'gw-costgrade-' + jobId

export default function CostsTab({ job }: { job: Job }) {
  const { can, profile } = useAuth()
  const labels = useLabels()
  const events = useEvents()
  const est = useJobEstimates(job.id)
  const com = useCommercial(job.id)
  const grades = useLabourRates()
  const costs = useLiveQuery(async () => ((await db().job_costs.where('job_id').equals(job.id).filter((r) => !r.deleted_at).toArray()) as unknown as CCost[]).map((c) => ({ ...c, days: c.days == null ? null : n(c.days), rate_pence: c.rate_pence == null ? null : n(c.rate_pence), amount_pence: n(c.amount_pence) })), [job.id])
  const [grade, setGrade] = useState(() => { try { return localStorage.getItem(gradeKey(job.id)) ?? '' } catch { return '' } })
  const [open, setOpen] = useState<string | null>(null)
  const edit = can('costs')
  const t0 = todayIso()

  const data = useMemo(() => {
    if (!est || !com || !grades || !events || !costs) return null
    const e = contractEstimate(est.estimates)
    const g = grades.find((x) => x.id === (grade || e?.labour_rate_id)) ?? grades.find((x) => x.active !== false) ?? grades[0]
    const dayRate = n(g?.day_cost_pence)
    const jobEvents: CEvent[] = events.filter((x) => x.job_id === job.id).map((x) => ({ id: x.id, title: x.title, event_date: x.event_date, end_date: x.end_date, all_day: x.all_day, start_time: x.start_time, end_time: x.end_time, assigned_to: x.assigned_to }))
    const rows = labourRows(jobEvents, costs, dayRate, t0)
    const sum = summarise(rows, costs)
    // contract and budget: the quote plus approved variations (at the value the client accepted)
    const quoteLines = e ? est.lines.filter((l) => l.estimate_id === e.id) : []
    const quoteNet = e ? estimateTotals(quoteLines, e).netPence : 0
    const values = variationValues(com.variations, com.vlines, est.varEstimates, est.lines)
    const approved = com.variations.filter((v) => v.status === 'approved')
    const varNet = approved.reduce((a, v) => a + acceptedValue(v, values.get(v.id) ?? 0), 0)
    const varLines = approved.flatMap((v) => { const ve = est.varEstimates.find((x) => x.variation_id === v.id); return ve ? est.lines.filter((l) => l.estimate_id === ve.id) : [] })
    const budget = budgetOf([...quoteLines, ...varLines])
    return { g, dayRate, rows, sum, contract: quoteNet + varNet, budget, hasEstimate: !!e }
  }, [est, com, grades, events, costs, grade, job.id, t0])

  if (!can('costs')) return <div className="card"><p className="muted">You do not have access to costs.</p></div>
  if (!data || !grades || !costs) return <p className="muted">Loading…</p>
  const { sum, budget, rows, contract } = data
  const other = sum.misc + sum.nonRecoverable
  const profit = contract - sum.forecast
  const mark = (a: number, b: number) => (b > 0 && a > b ? { color: '#b91c1c', fontWeight: 700 } : undefined)

  const cell = { textAlign: 'right' as const, padding: '2px 0' }
  return (
    <>
      <div className="card">
        <h2>Costs</h2>
        {!data.hasEstimate && <p className="muted small">There is no estimate on this job yet, so there is no budget to compare against. Costs can still be recorded below.</p>}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr className="muted small"><th style={{ textAlign: 'left' }}></th><th style={cell}>Budget</th><th style={cell}>Spent</th><th style={cell}>Left</th></tr></thead>
          <tbody>
            {([['Labour', budget.labour, sum.labour], ['Materials', budget.materials, sum.materials], ['Other, misc and non-recoverable', budget.other, other]] as [string, number, number][]).map(([l, b, a]) => (
              <tr key={l}><td>{l}</td><td style={cell}>{formatGBP(b)}</td><td style={{ ...cell, ...mark(a, b) }}>{formatGBP(a)}</td><td style={{ ...cell, ...mark(a, b) }}>{formatGBP(b - a)}</td></tr>
            ))}
            <tr style={{ fontWeight: 700, borderTop: '1px solid var(--grey-2, #ddd)' }}><td>Total</td><td style={cell}>{formatGBP(budget.total)}</td><td style={{ ...cell, ...mark(sum.actual, budget.total) }}>{formatGBP(sum.actual)}</td><td style={{ ...cell, ...mark(sum.actual, budget.total) }}>{formatGBP(budget.total - sum.actual)}</td></tr>
          </tbody>
        </table>
        <p className="muted small" style={{ marginBottom: 4 }}>Budget is the estimate's cost (the quote plus approved variations). Excluding VAT.</p>
        <div style={{ borderTop: '1px solid var(--grey-2, #ddd)', paddingTop: 8 }}>
          <div className="rowtop"><span>Contract value</span><strong>{formatGBP(contract)}</strong></div>
          <div className="rowtop"><span>Still to buy (materials needed)</span><span>{formatGBP(sum.stillToBuy)}</span></div>
          <div className="rowtop"><span>Days still planned in the diary</span><span>{formatGBP(sum.plannedLabour)}</span></div>
          <div className="rowtop"><span>Expected total cost</span><strong>{formatGBP(sum.forecast)}</strong></div>
          <div className="rowtop"><span>Expected profit</span><strong style={{ color: profit < 0 ? '#b91c1c' : '#15803d' }}>{formatGBP(profit)}{contract > 0 ? ` (${Math.round((profit / contract) * 1000) / 10}%)` : ''}</strong></div>
        </div>
      </div>

      <div className="card">
        <h2>Time on site</h2>
        <p className="muted small">Worked out from this job's diary entries: one day for each all-day day, or hours over eight for a timed entry, at the day cost below. If the diary is wrong, tap a line to change it, or add time by hand.</p>
        <label htmlFor="cg">Day cost used for diary days</label>
        <select id="cg" value={data.g?.id ?? ''} onChange={(e) => { setGrade(e.target.value); try { localStorage.setItem(gradeKey(job.id), e.target.value) } catch { /* ignore */ } }}>
          {grades.filter((x) => x.active !== false).map((x) => <option key={x.id} value={x.id}>{x.name} · {formatGBP(n(x.day_cost_pence))} a day</option>)}
        </select>
        {!rows.length && <p className="muted">No diary entries on this job yet. Add them on the Diary tab, or add time by hand below.</p>}
        {rows.map((r) => <LabourLine key={r.key} r={r} open={open === r.key} onOpen={() => setOpen(open === r.key ? null : r.key)} edit={edit} job={job} who={labels.who} />)}
        <p className="rowtop" style={{ marginTop: 8 }}><strong>Labour to date</strong><strong>{formatGBP(sum.labour)}</strong></p>
        {edit && <AddTime job={job} dayRate={data.dayRate} createdBy={profile?.id ?? null} />}
      </div>

      <CostList title="Materials bought" help="Supplier invoices and materials paid for." kind="material" status="actual" costs={costs} job={job} edit={edit} createdBy={profile?.id ?? null} total={sum.materials} open={open} setOpen={setOpen} />
      <CostList title="Materials still needed" help="What still has to be bought. It counts as still to buy, not as spent, until you mark it as bought." kind="material" status="needed" costs={costs} job={job} edit={edit} createdBy={profile?.id ?? null} total={sum.stillToBuy} open={open} setOpen={setOpen} />
      <CostList title="Misc and non-recoverable" help="Other costs on the job. Tick 'cannot be charged to the client' for costs the company has to absorb." kind="misc" status="actual" costs={costs} job={job} edit={edit} createdBy={profile?.id ?? null} total={other} open={open} setOpen={setOpen} />
    </>
  )
}

// ---------------------------------------------------------------- a line of time on site
function LabourLine({ r, open, onOpen, edit, job, who }: { r: LabourRow; open: boolean; onOpen: () => void; edit: boolean; job: Job; who: (id: string | null) => string }) {
  const name = r.person ? who(r.person) || r.person : ''
  // changing a diary line writes a row that overrules it (days x rate); changing a manual line just updates it
  async function put(patch: { days?: number; rate?: number; person?: string | null }) {
    const d = patch.days ?? r.days, rate = patch.rate ?? r.rate
    const fields = { days: d, rate_pence: rate, amount_pence: Math.round(d * rate), ...(patch.person !== undefined ? { person: patch.person } : {}) }
    if (r.cost) await save('job_costs', r.cost.id, fields)
    else if (r.event) await save('job_costs', newId(), { job_id: job.id, kind: 'labour', status: 'actual', description: r.label, source_event_id: r.event.id, cost_date: r.event.event_date, person: r.person, ...fields })
  }
  const tag = r.source === 'changed' ? 'changed by hand' : r.source === 'manual' ? 'added by hand' : 'from the diary'
  return (
    <div className="lcard">
      <button type="button" className="linklike" style={{ width: '100%', textAlign: 'left' }} onClick={onOpen} aria-expanded={open}>
        <div className="rowtop"><span><strong>{r.label}</strong></span><strong>{formatGBP(r.amount)}</strong></div>
        <span className="muted small">{r.date ? fmtDate(r.date) : ''}{name ? ` · ${name}` : ''} · {r.days} day{r.days === 1 ? '' : 's'} at {formatGBP(r.rate)} · {tag}{r.plannedDays > 0 ? ` · plus ${r.plannedDays} planned` : ''}</span>
      </button>
      {open && (
        <div style={{ marginTop: 8 }}>
          <div className="lgrid">
            <div className="f"><label>Days worked</label><NumInput value={r.days} disabled={!edit} label="Days worked" onCommit={(v) => put({ days: v })} /></div>
            <div className="f"><label>Day cost (£)</label><MoneyInput pence={r.rate} disabled={!edit} label="Day cost" onCommit={(p) => put({ rate: p })} /></div>
          </div>
          {r.source === 'manual' && edit && (
            <><label>Who</label><input type="text" defaultValue={r.cost?.person ?? ''} onBlur={(e) => r.cost && e.target.value !== (r.cost.person ?? '') && save('job_costs', r.cost.id, { person: e.target.value.trim() || null })} /></>
          )}
          {edit && (
            <div className="actions">
              {r.source !== 'manual' && <button className="btn" onClick={() => put({ days: 0 })}>Not worked (0 days)</button>}
              {r.source === 'changed' && r.cost && <button className="btn" onClick={() => remove('job_costs', r.cost!.id)}>Back to the diary figures</button>}
              {r.source === 'manual' && r.cost && <button className="btn" onClick={() => confirm('Delete this time?') && remove('job_costs', r.cost!.id)}>Delete</button>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AddTime({ job, dayRate, createdBy }: { job: Job; dayRate: number; createdBy: string | null }) {
  const [on, setOn] = useState(false)
  const [date, setDate] = useState(todayIso())
  const [person, setPerson] = useState('')
  const [days, setDays] = useState(1)
  const [rate, setRate] = useState(dayRate)
  if (!on) return <button className="btn" onClick={() => { setRate(dayRate); setOn(true) }}>+ Add time by hand</button>
  return (
    <div className="lcard">
      <div className="lgrid">
        <div className="f"><label htmlFor="at-d">Date</label><input id="at-d" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="f"><label htmlFor="at-p">Who</label><input id="at-p" type="text" value={person} onChange={(e) => setPerson(e.target.value)} /></div>
      </div>
      <div className="lgrid">
        <div className="f"><label>Days</label><NumInput value={days} label="Days" onCommit={setDays} /></div>
        <div className="f"><label>Day cost (£)</label><MoneyInput pence={rate} label="Day cost" onCommit={setRate} /></div>
      </div>
      <button className="btn primary" onClick={async () => { await save('job_costs', newId(), { job_id: job.id, kind: 'labour', status: 'actual', description: 'Time on site', person: person.trim() || null, days, rate_pence: rate, amount_pence: Math.round(days * rate), cost_date: date, created_by: createdBy }); setOn(false); setPerson(''); setDays(1) }}>Add time</button>
      <button className="btn" onClick={() => setOn(false)}>Cancel</button>
    </div>
  )
}

// ---------------------------------------------------------------- materials and other costs
function CostList({ title, help, kind, status, costs, job, edit, createdBy, total, open, setOpen }: {
  title: string; help: string; kind: CCost['kind']; status: CCost['status']; costs: CCost[]; job: Job; edit: boolean; createdBy: string | null; total: number; open: string | null; setOpen: (k: string | null) => void
}) {
  const [desc, setDesc] = useState('')
  const [supplier, setSupplier] = useState('')
  const [amount, setAmount] = useState(0)
  const [noCharge, setNoCharge] = useState(false)
  const isMisc = kind === 'misc'
  const rows = costs.filter((c) => (isMisc ? c.kind === 'misc' || c.kind === 'non_recoverable' : c.kind === 'material') && c.status === status).sort((a, b) => String(b.cost_date ?? '').localeCompare(String(a.cost_date ?? '')))

  async function add() {
    if (!desc.trim()) return
    await save('job_costs', newId(), { job_id: job.id, kind: isMisc && noCharge ? 'non_recoverable' : kind, status, description: desc.trim(), supplier: supplier.trim() || null, amount_pence: amount, cost_date: todayIso(), created_by: createdBy })
    setDesc(''); setSupplier(''); setAmount(0); setNoCharge(false)
  }
  return (
    <div className="card">
      <div className="rowtop"><h2 style={{ margin: 0 }}>{title}</h2><strong>{formatGBP(total)}</strong></div>
      <p className="muted small">{help}</p>
      {!rows.length && <p className="muted small">Nothing here yet.</p>}
      {rows.map((c) => (
        <div className="lcard" key={c.id}>
          <button type="button" className="linklike" style={{ width: '100%', textAlign: 'left' }} onClick={() => setOpen(open === c.id ? null : c.id)} aria-expanded={open === c.id}>
            <div className="rowtop"><span><strong>{c.description || '(no description)'}</strong>{c.kind === 'non_recoverable' && <span className="tag"> non-recoverable</span>}</span><strong>{formatGBP(c.amount_pence)}</strong></div>
            <span className="muted small">{[c.supplier, c.cost_date ? fmtDate(c.cost_date) : ''].filter(Boolean).join(' · ')}</span>
          </button>
          {open === c.id && (
            <div style={{ marginTop: 8 }}>
              <label>Description</label>
              <input type="text" disabled={!edit} defaultValue={c.description} onBlur={(e) => e.target.value.trim() !== c.description && save('job_costs', c.id, { description: e.target.value.trim() })} />
              <div className="lgrid">
                <div className="f"><label>Supplier</label><input type="text" disabled={!edit} defaultValue={c.supplier ?? ''} onBlur={(e) => e.target.value.trim() !== (c.supplier ?? '') && save('job_costs', c.id, { supplier: e.target.value.trim() || null })} /></div>
                <div className="f"><label>Cost (£)</label><MoneyInput pence={c.amount_pence} disabled={!edit} label="Cost" onCommit={(p) => save('job_costs', c.id, { amount_pence: p })} /></div>
              </div>
              <label>Date</label>
              <input type="date" disabled={!edit} value={c.cost_date ?? ''} onChange={(e) => save('job_costs', c.id, { cost_date: e.target.value || null })} />
              {isMisc && <label className="check"><input type="checkbox" disabled={!edit} checked={c.kind === 'non_recoverable'} onChange={(e) => save('job_costs', c.id, { kind: e.target.checked ? 'non_recoverable' : 'misc' })} /> Cannot be charged to the client</label>}
              {edit && (
                <div className="actions">
                  {status === 'needed' && <button className="btn primary" onClick={() => save('job_costs', c.id, { status: 'actual', cost_date: todayIso() })}>Mark as bought</button>}
                  <button className="btn" onClick={() => confirm('Delete this?') && remove('job_costs', c.id)}>Delete</button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      {edit && (
        <div style={{ marginTop: 8 }}>
          <label htmlFor={'cd' + title}>{status === 'needed' ? 'Add something that is needed' : 'Add a cost'}</label>
          <input id={'cd' + title} type="text" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={kind === 'material' ? 'e.g. 100m 2.5mm twin and earth' : 'e.g. Skip hire'} />
          <div className="lgrid">
            <div className="f"><label>{kind === 'material' ? 'Supplier' : 'Who / where'}</label><input type="text" value={supplier} onChange={(e) => setSupplier(e.target.value)} /></div>
            <div className="f"><label>{status === 'needed' ? 'Expected cost (£)' : 'Cost (£)'}</label><MoneyInput pence={amount} label="Cost" onCommit={setAmount} /></div>
          </div>
          {isMisc && <label className="check"><input type="checkbox" checked={noCharge} onChange={(e) => setNoCharge(e.target.checked)} /> Cannot be charged to the client (non-recoverable)</label>}
          <button className="btn primary" disabled={!desc.trim()} onClick={add}>Add</button>
        </div>
      )}
    </div>
  )
}
