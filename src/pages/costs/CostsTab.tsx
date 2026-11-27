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
import { newId, remove, save, saveBatch } from '../../lib/sync/store'
import { useLabels } from '../planner/shared'

export interface PLine { id: string; description: string; unit: string; qty: number; costPence: number }

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
    // every material on the quote and on approved variations: what the procurement list is built from
    const matLines: PLine[] = [...quoteLines, ...varLines].filter((l) => l.kind === 'material').sort((a, b) => Number(a.sort) - Number(b.sort))
      .map((l) => ({ id: l.id, description: l.description, unit: l.unit || 'each', qty: n(l.qty), costPence: Math.round(n(l.qty) * n(l.unit_cost)) }))
    return { g, dayRate, rows, sum, contract: quoteNet + varNet, budget, hasEstimate: !!e, matLines }
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

      <Procurement costs={costs} lines={data.matLines} job={job} edit={edit} createdBy={profile?.id ?? null} spent={sum.materials} toBuy={sum.stillToBuy} open={open} setOpen={setOpen} />
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

// ---------------------------------------------------------------- materials: a mini procurement list
// Every material from the estimate (and approved variations) can be pulled in; tick each one off as it is ordered and put its real cost in.
// A row with status 'needed' is still to order (its cost is the expected cost); ticking it makes it 'actual' (ordered, money spent).
function Procurement({ costs, lines, job, edit, createdBy, spent, toBuy, open, setOpen }: {
  costs: CCost[]; lines: PLine[]; job: Job; edit: boolean; createdBy: string | null; spent: number; toBuy: number; open: string | null; setOpen: (k: string | null) => void
}) {
  const [desc, setDesc] = useState('')
  const [qty, setQty] = useState(1)
  const [unit, setUnit] = useState('each')
  const [supplier, setSupplier] = useState('')
  const [amount, setAmount] = useState(0)
  const [bought, setBought] = useState(false)
  const rows = costs.filter((x) => x.kind === 'material')
    .sort((a, b) => (a.status === b.status ? String(a.description).localeCompare(String(b.description)) : a.status === 'needed' ? -1 : 1))
  const done = rows.filter((x) => x.status === 'actual').length
  const have = new Set(rows.map((x) => x.estimate_line_id).filter(Boolean))
  const missing = lines.filter((l) => !have.has(l.id))

  async function pullIn() {
    await saveBatch(missing.map((l) => ({ tbl: 'job_costs' as const, id: newId(), patch: { job_id: job.id, kind: 'material', status: 'needed', description: l.description, qty: l.qty, unit: l.unit, estimate_line_id: l.id, amount_pence: l.costPence, created_by: createdBy } })))
  }
  async function add() {
    if (!desc.trim()) return
    await save('job_costs', newId(), { job_id: job.id, kind: 'material', status: bought ? 'actual' : 'needed', description: desc.trim(), qty, unit: unit.trim() || 'each', supplier: supplier.trim() || null, amount_pence: amount, cost_date: bought ? todayIso() : null, created_by: createdBy })
    setDesc(''); setQty(1); setUnit('each'); setSupplier(''); setAmount(0); setBought(false)
  }
  async function tick(x: CCost, on: boolean) {
    await save('job_costs', x.id, on ? { status: 'actual', cost_date: todayIso() } : { status: 'needed' })
    if (on) setOpen(x.id) // open it so the real cost can be put in
  }
  const qtyText = (x: CCost) => (x.qty != null && Number(x.qty) ? `${Number(x.qty)} ${x.unit ?? ''}`.trim() : '')

  return (
    <div className="card">
      <div className="rowtop"><h2 style={{ margin: 0 }}>Materials</h2><strong>{done} of {rows.length} ordered</strong></div>
      <p className="muted small">Tick each material off as it is ordered, and put its real cost in. Spent {formatGBP(spent)}; still to order about {formatGBP(toBuy)}.</p>
      {rows.length > 0 && <div style={{ height: 8, background: 'var(--grey-2, #ddd)', borderRadius: 4, overflow: 'hidden', margin: '4px 0 10px' }}><div style={{ width: `${Math.round((done / rows.length) * 100)}%`, height: '100%', background: '#15803d' }} /></div>}
      {edit && missing.length > 0 && (
        <div className="notice" style={{ margin: '8px 0' }}>
          <p style={{ margin: '0 0 6px' }}><strong>{missing.length} material{missing.length === 1 ? '' : 's'} from the estimate not on this list yet.</strong></p>
          <button className="btn primary" style={{ marginTop: 0 }} onClick={pullIn}>Pull them in from the estimate</button>
        </div>
      )}
      {!rows.length && !missing.length && <p className="muted small">Nothing here yet. Add the materials this job needs below.</p>}
      {rows.map((x) => {
        const ordered = x.status === 'actual'
        return (
          <div className="lcard" key={x.id}>
            <div className="rowtop">
              <label className="check" style={{ margin: 0, flex: 1, minWidth: 0 }}>
                <input type="checkbox" disabled={!edit} checked={ordered} onChange={(e) => tick(x, e.target.checked)} aria-label={`Ordered: ${x.description}`} />
                <span style={{ textDecoration: ordered ? 'line-through' : 'none', opacity: ordered ? 0.7 : 1 }}><strong>{x.description || '(no description)'}</strong></span>
              </label>
              <strong>{formatGBP(x.amount_pence)}</strong>
            </div>
            <button type="button" className="linklike" style={{ width: '100%', textAlign: 'left', minHeight: 0, marginLeft: 28 }} onClick={() => setOpen(open === x.id ? null : x.id)} aria-expanded={open === x.id}>
              <span className="muted small">{[qtyText(x), x.supplier, ordered ? (x.cost_date ? `ordered ${fmtDate(x.cost_date)}` : 'ordered') : 'to order'].filter(Boolean).join(' · ')} · {open === x.id ? 'close' : 'details'}</span>
            </button>
            {open === x.id && (
              <div style={{ marginTop: 8 }}>
                <label>Description</label>
                <input type="text" disabled={!edit} defaultValue={x.description} onBlur={(e) => e.target.value.trim() !== x.description && save('job_costs', x.id, { description: e.target.value.trim() })} />
                <div className="lgrid">
                  <div className="f"><label>Quantity</label><NumInput value={Number(x.qty ?? 0)} disabled={!edit} label="Quantity" onCommit={(v) => save('job_costs', x.id, { qty: v })} /></div>
                  <div className="f"><label>Unit</label><input type="text" disabled={!edit} defaultValue={x.unit ?? ''} onBlur={(e) => e.target.value.trim() !== (x.unit ?? '') && save('job_costs', x.id, { unit: e.target.value.trim() || null })} /></div>
                </div>
                <div className="lgrid">
                  <div className="f"><label>Supplier</label><input type="text" disabled={!edit} defaultValue={x.supplier ?? ''} onBlur={(e) => e.target.value.trim() !== (x.supplier ?? '') && save('job_costs', x.id, { supplier: e.target.value.trim() || null })} /></div>
                  <div className="f"><label>{ordered ? 'Cost (£)' : 'Expected cost (£)'}</label><MoneyInput pence={x.amount_pence} disabled={!edit} label="Cost" onCommit={(p) => save('job_costs', x.id, { amount_pence: p })} /></div>
                </div>
                {ordered && <><label>Date ordered</label><input type="date" disabled={!edit} value={x.cost_date ?? ''} onChange={(e) => save('job_costs', x.id, { cost_date: e.target.value || null })} /></>}
                {edit && <div className="actions"><button className="btn" onClick={() => confirm('Delete this material?') && remove('job_costs', x.id)}>Delete</button></div>}
              </div>
            )}
          </div>
        )
      })}
      {edit && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--grey-2, #ddd)', paddingTop: 8 }}>
          <label htmlFor="pm-d">Add a material (small items too)</label>
          <input id="pm-d" type="text" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Cable clips, 20mm glands, fixings" />
          <div className="lgrid">
            <div className="f"><label>Quantity</label><NumInput value={qty} label="Quantity" onCommit={setQty} /></div>
            <div className="f"><label htmlFor="pm-u">Unit</label><input id="pm-u" type="text" value={unit} onChange={(e) => setUnit(e.target.value)} /></div>
          </div>
          <div className="lgrid">
            <div className="f"><label htmlFor="pm-s">Supplier</label><input id="pm-s" type="text" value={supplier} onChange={(e) => setSupplier(e.target.value)} /></div>
            <div className="f"><label>{bought ? 'Cost (£)' : 'Expected cost (£)'}</label><MoneyInput pence={amount} label="Cost" onCommit={setAmount} /></div>
          </div>
          <label className="check"><input type="checkbox" checked={bought} onChange={(e) => setBought(e.target.checked)} /> Already bought</label>
          <button className="btn primary" disabled={!desc.trim()} onClick={add}>Add</button>
        </div>
      )}
    </div>
  )
}
