import { useMemo, useState } from 'react'
import { MoneyInput, NumInput } from '../../components/MoneyInput'
import { useAuth } from '../../lib/auth'
import { contractEstimate, contractItems, freshLines, lineFromPct, useCommercial, variationValue, vref, type Application, type ApplicationLine, type Invoice } from '../../lib/commercial/data'
import { buildApplicationPdf, buildInvoicePdf } from '../../lib/commercial/pdf'
import { deliverPdf, docBase } from '../../lib/commercial/share'
import { useJobEstimates } from '../../lib/estimating/estimates'
import { useClients, type Job } from '../../lib/jobs'
import { formatGBP, percentOf } from '../../lib/money'
import { chain, invoiceTotals, pctFromValue, type Valuation } from '../../lib/money/applications'
import { newId, remove, save, saveBatch } from '../../lib/sync/store'

const today = () => new Date().toISOString().slice(0, 10)
const STEPS = Array.from({ length: 21 }, (_, i) => i * 5)

export default function ApplicationsTab({ job }: { job: Job }) {
  const { can } = useAuth()
  const data = useCommercial(job.id)
  const est = useJobEstimates(job.id)
  const [mode, setMode] = useState<'applications' | 'invoices'>(job.job_type === 'domestic' ? 'invoices' : 'applications')
  const contract = useMemo(() => {
    if (!est) return null
    const e = contractEstimate(est.estimates)
    return e ? { e, ...contractItems(e, est.sections, est.lines) } : null
  }, [est])
  if (!can('estimates.view')) return <div className="card"><p className="muted">You do not have access to prices.</p></div>
  if (!data || !est) return <p className="muted">Loading…</p>
  const approved = data.variations.filter((v) => v.status === 'approved').map((v) => ({ id: v.id, label: `${vref(v.number)} ${v.title || 'Variation'}`, pence: variationValue(data.vlines.filter((l) => l.variation_id === v.id)) }))
  const approvedTotal = approved.reduce((a, v) => a + v.pence, 0)
  const total = (contract?.net ?? 0) + approvedTotal
  return (
    <>
      <div className="card">
        <h2>Money in</h2>
        {contract ? (
          <p className="muted small">
            Contract: quote{contract.e.rev > 1 ? ` revision ${contract.e.rev}` : ''} {formatGBP(contract.net)}
            {approvedTotal ? ` + approved variations ${formatGBP(approvedTotal)}` : ''} = <strong>{formatGBP(total)}</strong> excluding VAT.
            {contract.e.status !== 'accepted' && <> <strong>This quote is not marked as accepted yet</strong> (Estimate tab).</>}
          </p>
        ) : <p className="muted small">There is no estimate on this job yet, so there is nothing to apply against. Make and accept a quote first.</p>}
        <div className="tabs" style={{ margin: '8px 0 0' }}>
          <button className={mode === 'applications' ? 'on' : ''} onClick={() => setMode('applications')}>Applications for payment</button>
          <button className={mode === 'invoices' ? 'on' : ''} onClick={() => setMode('invoices')}>Invoices</button>
        </div>
      </div>
      {mode === 'applications'
        ? <Applications job={job} data={data} contract={contract} approved={approved} />
        : <Invoices job={job} data={data} total={total} />}
    </>
  )
}

type Data = NonNullable<ReturnType<typeof useCommercial>>
type Contract = { net: number; items: ReturnType<typeof contractItems>['items'] } | null

// ---------------------------------------------------------------- applications for payment
function Applications({ job, data, contract, approved }: { job: Job; data: Data; contract: Contract; approved: { id: string; label: string; pence: number }[] }) {
  const { can } = useAuth()
  const edit = can('estimates.edit')
  const [open, setOpen] = useState<string | null>(data.applications.at(-1)?.id ?? null)
  const apps = data.applications
  const grossOf = (id: string) => data.alines.filter((l) => l.application_id === id).reduce((a, l) => a + l.to_date_pence, 0)
  const vals = chain(apps.map((a) => ({ grossToDate: grossOf(a.id), terms: a })))

  async function start() {
    if (!contract) return
    const last = apps.at(-1)
    const id = newId()
    const prevLines = last ? data.alines.filter((l) => l.application_id === last.id) : []
    const lines = freshLines(contract.items, approved, prevLines)
    await saveBatch([
      { tbl: 'applications', id, patch: {
        job_id: job.id, number: (last?.number ?? 0) + 1, status: 'draft', app_date: today(),
        // retention only normally applies to commercial work; later applications carry on from the last one
        retention_pct: last?.retention_pct ?? (['commercial', 'industrial'].includes(job.job_type) ? 5 : 0), retention_release_pence: 0,
        cis_on: last?.cis_on ?? false, cis_rate: last?.cis_rate ?? 20, cis_labour_pct: last?.cis_labour_pct ?? 50, reverse_charge: last?.reverse_charge ?? false, vat_rate: last?.vat_rate ?? 20,
      } },
      ...lines.map((l) => ({ tbl: 'application_lines' as const, id: newId(), patch: { application_id: id, ...l } })),
    ])
    setOpen(id)
  }
  const draftExists = apps.some((a) => a.status === 'draft')
  return (
    <>
      <div className="card">
        <h2>Applications for payment</h2>
        <p className="muted small">Each application states the value of everything done to date; the amount due is the difference from last time, after retention.</p>
        {edit && contract && <button className="btn primary" onClick={start} disabled={draftExists || !contract.items.length}>{draftExists ? 'Finish the open application first' : `+ Start application ${(apps.at(-1)?.number ?? 0) + 1}`}</button>}
      </div>
      {!apps.length && <div className="card"><p className="muted">No applications yet.</p></div>}
      {apps.map((a, i) => (
        <div className="card" key={a.id}>
          <button className="linklike" style={{ width: '100%', textAlign: 'left' }} onClick={() => setOpen(open === a.id ? null : a.id)} aria-expanded={open === a.id}>
            <div className="rowtop"><strong>Application {a.number}</strong><span>{formatGBP(vals[i].due)} due</span></div>
            <span className="muted small">{a.status === 'draft' ? 'Draft' : a.status === 'issued' ? 'Issued' : 'Paid'} · to date {formatGBP(vals[i].grossToDate)}</span>
          </button>
          {open === a.id && <AppEditor job={job} app={a} lines={data.alines.filter((l) => l.application_id === a.id)} prevLines={i ? data.alines.filter((l) => l.application_id === apps[i - 1].id) : []} v={vals[i]} before={i ? vals[i - 1] : null} edit={edit} last={i === apps.length - 1} onGone={() => setOpen(null)} />}
        </div>
      ))}
    </>
  )
}

function AppEditor({ job, app, lines, prevLines, v, before, edit, last, onGone }: { job: Job; app: Application; lines: ApplicationLine[]; prevLines: ApplicationLine[]; v: Valuation; before: Valuation | null; edit: boolean; last: boolean; onGone: () => void }) {
  const clients = useClients()
  const [pct, setPct] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const locked = !edit || app.status !== 'draft'
  const prev = new Map(prevLines.map((l) => [l.line_key, l.to_date_pence]))
  const groups = [...new Set(lines.map((l) => l.group_name))]
  const set = (patch: Record<string, unknown>) => save('applications', app.id, patch)

  async function fill() {
    await saveBatch(lines.map((l) => ({ tbl: 'application_lines' as const, id: l.id, patch: { to_date_pence: lineFromPct(l.contract_pence, pct) } })))
  }
  async function pdf() {
    setBusy(true); setErr('')
    try {
      const client = clients?.find((c) => c.id === job.client_id) ?? null
      const base = await docBase(job, client ? { name: client.name, address: client.address } : null)
      await deliverPdf(await buildApplicationPdf({ ...base, app, lines, prev, v, before }), `Application ${app.number} ${job.job_number ?? ''}.pdf`.replace(/\s+/g, ' '))
    } catch (e) { setErr((e as Error).message || 'Could not make the PDF.') } finally { setBusy(false) }
  }
  const paid = app.status === 'paid'
  return (
    <div style={{ marginTop: 12 }}>
      <div className="lgrid">
        <div className="f"><label htmlFor={'ad' + app.id}>Application date</label><input id={'ad' + app.id} type="date" disabled={locked} value={app.app_date ?? ''} onChange={(e) => set({ app_date: e.target.value || today() })} /></div>
        <div className="f"><label htmlFor={'ap' + app.id}>Valuation to</label><input id={'ap' + app.id} type="date" disabled={locked} value={app.period_to ?? ''} onChange={(e) => set({ period_to: e.target.value || null })} /></div>
      </div>
      <div className="lgrid">
        <div className="f"><label>Retention %</label><NumInput value={app.retention_pct} max={100} disabled={locked} label="Retention percent" onCommit={(n) => set({ retention_pct: n })} /></div>
        <div className="f"><label>Release retention this time (£)</label><MoneyInput pence={app.retention_release_pence} disabled={locked} label="Retention released" onCommit={(p) => set({ retention_release_pence: p })} /></div>
      </div>
      <label className="check"><input type="checkbox" disabled={locked} checked={app.cis_on} onChange={(e) => set({ cis_on: e.target.checked })} /> CIS deduction applies</label>
      {app.cis_on && (
        <div className="lgrid">
          <div className="f"><label htmlFor={'cr' + app.id}>CIS rate</label>
            <select id={'cr' + app.id} disabled={locked} value={String(app.cis_rate)} onChange={(e) => set({ cis_rate: Number(e.target.value) })}><option value="20">20%</option><option value="30">30%</option><option value="0">0% (gross)</option></select></div>
          <div className="f"><label>Labour share of this application (%)</label><NumInput value={app.cis_labour_pct} max={100} disabled={locked} label="Labour percent" onCommit={(n) => set({ cis_labour_pct: n })} /></div>
        </div>
      )}
      <label className="check"><input type="checkbox" disabled={locked} checked={app.reverse_charge} onChange={(e) => set({ reverse_charge: e.target.checked })} /> Domestic reverse charge VAT (no VAT charged)</label>

      {!locked && (
        <div className="card" style={{ background: 'var(--grey-1, #f4f4f6)', margin: '12px 0' }}>
          <label htmlFor={'fp' + app.id}>Set every line to this % complete</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <select id={'fp' + app.id} value={pct} onChange={(e) => setPct(Number(e.target.value))}>{STEPS.map((s) => <option key={s} value={s}>{s}%</option>)}</select>
            <button className="btn" onClick={fill}>Apply to all</button>
          </div>
          <p className="muted small" style={{ margin: '6px 0 0' }}>Then adjust any line by hand, with a % or a £ amount.</p>
        </div>
      )}

      {groups.map((g) => (
        <div key={g}>
          <h3 style={{ margin: '16px 0 4px' }}>{g}</h3>
          {lines.filter((l) => l.group_name === g).map((l) => <LineRow key={l.id} l={l} prev={prev.get(l.line_key) ?? 0} locked={locked} />)}
        </div>
      ))}

      <div className="card" style={{ marginTop: 16, background: 'var(--grey-1, #f4f4f6)' }}>
        <Sum a="Gross value of work to date" b={formatGBP(v.grossToDate)} />
        {app.retention_pct > 0 && <Sum a={`Less retention held (${app.retention_pct}%)`} b={'-' + formatGBP(v.retentionHeld)} />}
        <Sum a="Net value to date" b={formatGBP(v.netToDate)} />
        <Sum a="Less previously applied for" b={'-' + formatGBP(before?.netToDate ?? 0)} />
        <Sum a="This application (excl. VAT)" b={formatGBP(v.thisNet)} bold />
        <Sum a={app.reverse_charge ? 'VAT (reverse charge)' : `VAT at ${app.vat_rate}%`} b={formatGBP(v.vat)} />
        {app.cis_on && <Sum a={`Less CIS (${app.cis_rate}% of labour)`} b={'-' + formatGBP(v.cis)} />}
        <Sum a="Amount now due" b={formatGBP(v.due)} bold />
      </div>

      <label htmlFor={'an' + app.id}>Notes (printed on the application)</label>
      <textarea id={'an' + app.id} rows={2} disabled={locked} defaultValue={app.notes ?? ''} onBlur={(e) => e.target.value !== (app.notes ?? '') && set({ notes: e.target.value || null })} />
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn primary" onClick={pdf} disabled={busy}>{busy ? 'Making…' : 'Make application PDF'}</button>
      {edit && app.status === 'draft' && <button className="btn" onClick={() => set({ status: 'issued' })}>Mark as issued</button>}
      {edit && app.status === 'issued' && <><button className="btn" onClick={() => set({ status: 'paid', paid_pence: v.due, paid_date: today() })}>Mark as paid ({formatGBP(v.due)})</button><button className="btn" onClick={() => set({ status: 'draft' })}>Reopen as draft</button></>}
      {edit && paid && <p className="muted small">Paid {app.paid_date ?? ''}{app.paid_pence != null ? ` · ${formatGBP(app.paid_pence)}` : ''}</p>}
      {edit && app.status === 'draft' && last && <button className="btn" onClick={async () => { if (confirm('Delete this application?')) { await saveBatch([...lines.map((l) => ({ tbl: 'application_lines' as const, id: l.id, patch: { deleted_at: new Date().toISOString() } })), { tbl: 'applications' as const, id: app.id, patch: { deleted_at: new Date().toISOString() } }]); onGone() } }}>Delete application</button>}
    </div>
  )
}

const Sum = ({ a, b, bold }: { a: string; b: string; bold?: boolean }) => (
  <div className="rowtop" style={{ fontWeight: bold ? 700 : 400, margin: '2px 0' }}><span>{a}</span><span>{b}</span></div>
)

// one line of the application: the value earned to date, as a % or as a £ amount (changing one updates the other)
function LineRow({ l, prev, locked }: { l: ApplicationLine; prev: number; locked: boolean }) {
  const pct = pctFromValue(l.contract_pence, l.to_date_pence)
  return (
    <div className="lcard">
      <div className="rowtop"><span>{l.description || '(no description)'}</span><span className="muted small">{formatGBP(l.contract_pence)}</span></div>
      <div className="lgrid">
        <div className="f"><label>% complete</label><NumInput value={pct} max={100} disabled={locked} label="Percent complete" onCommit={(n) => save('application_lines', l.id, { to_date_pence: lineFromPct(l.contract_pence, n) })} /></div>
        <div className="f"><label>Value to date (£)</label><MoneyInput pence={l.to_date_pence} disabled={locked} label="Value to date" onCommit={(p) => save('application_lines', l.id, { to_date_pence: p })} /></div>
      </div>
      <span className="muted small">Previously {formatGBP(prev)} · this application {formatGBP(l.to_date_pence - prev)}{l.to_date_pence > l.contract_pence ? ' · over the contract value' : ''}{l.to_date_pence < prev ? ' · less than last time' : ''}</span>
    </div>
  )
}

// ---------------------------------------------------------------- simple invoices (domestic jobs): deposit, stage payments, balance
function Invoices({ job, data, total }: { job: Job; data: Data; total: number }) {
  const { can } = useAuth()
  const edit = can('estimates.edit')
  const [open, setOpen] = useState<string | null>(null)
  const [kind, setKind] = useState<Invoice['kind']>('deposit')
  const [pct, setPct] = useState(30)
  const invoiced = data.invoices.reduce((a, i) => a + i.net_pence, 0)

  async function add() {
    const n = (data.invoices.at(-1)?.number ?? 0) + 1
    const net = kind === 'balance' ? Math.max(0, total - invoiced) : percentOf(total, pct)
    const id = newId()
    const due = new Date(); due.setDate(due.getDate() + 14)
    await save('invoices', id, {
      job_id: job.id, number: n, kind, status: 'draft', net_pence: net, vat_rate: 20, reverse_charge: false, inv_date: today(), due_date: due.toISOString().slice(0, 10),
      description: kind === 'deposit' ? `Deposit (${pct}%) - ${job.title}` : kind === 'balance' ? `Balance of contract - ${job.title}` : `Stage payment (${pct}%) - ${job.title}`,
    })
    setOpen(id)
  }
  return (
    <>
      <div className="card">
        <h2>Invoices</h2>
        <p className="muted small">For smaller jobs: a deposit up front, any stage payments, then the balance. Invoiced so far {formatGBP(invoiced)} of {formatGBP(total)} excluding VAT.</p>
        {edit && (
          <>
            <label htmlFor="ik">New invoice</label>
            <select id="ik" value={kind} onChange={(e) => { const k = e.target.value as Invoice['kind']; setKind(k); setPct(k === 'deposit' ? 30 : 50) }}>
              <option value="deposit">Deposit</option><option value="stage">Stage payment</option><option value="balance">Balance (whatever is left)</option>
            </select>
            {kind !== 'balance' && <><label htmlFor="ip">Percentage of the contract</label><select id="ip" value={pct} onChange={(e) => setPct(Number(e.target.value))}>{STEPS.filter((s) => s > 0).map((s) => <option key={s} value={s}>{s}%</option>)}</select></>}
            <button className="btn primary" onClick={add} disabled={!total}>+ Create invoice</button>
            {!total && <p className="muted small">There is no contract value yet: make a quote first.</p>}
          </>
        )}
      </div>
      {!data.invoices.length && <div className="card"><p className="muted">No invoices yet.</p></div>}
      {data.invoices.map((inv) => {
        const t = invoiceTotals(inv.net_pence, inv.vat_rate, inv.reverse_charge)
        return (
          <div className="card" key={inv.id}>
            <button className="linklike" style={{ width: '100%', textAlign: 'left' }} onClick={() => setOpen(open === inv.id ? null : inv.id)} aria-expanded={open === inv.id}>
              <div className="rowtop"><strong>{ref(job, inv)}</strong><span>{formatGBP(t.total)}</span></div>
              <span className="muted small">{inv.kind === 'deposit' ? 'Deposit' : inv.kind === 'balance' ? 'Balance' : 'Stage'} · {inv.status === 'draft' ? 'Draft' : inv.status === 'issued' ? 'Issued' : 'Paid'}</span>
            </button>
            {open === inv.id && <InvoiceEditor job={job} inv={inv} edit={edit} onGone={() => setOpen(null)} />}
          </div>
        )
      })}
    </>
  )
}
const ref = (job: Job, inv: Invoice) => `INV-${job.job_number ?? 'X'}-${inv.number}`

function InvoiceEditor({ job, inv, edit, onGone }: { job: Job; inv: Invoice; edit: boolean; onGone: () => void }) {
  const clients = useClients()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const locked = !edit || inv.status !== 'draft'
  const t = invoiceTotals(inv.net_pence, inv.vat_rate, inv.reverse_charge)
  const set = (patch: Record<string, unknown>) => save('invoices', inv.id, patch)
  async function pdf() {
    setBusy(true); setErr('')
    try {
      const client = clients?.find((c) => c.id === job.client_id) ?? null
      const base = await docBase(job, client ? { name: client.name, address: client.address } : null)
      await deliverPdf(await buildInvoicePdf({ ...base, inv, ref: ref(job, inv), date: new Date(inv.inv_date) }), `Invoice ${ref(job, inv)}.pdf`)
    } catch (e) { setErr((e as Error).message || 'Could not make the PDF.') } finally { setBusy(false) }
  }
  return (
    <div style={{ marginTop: 12 }}>
      <label htmlFor={'id' + inv.id}>Description</label>
      <input id={'id' + inv.id} type="text" disabled={locked} defaultValue={inv.description} onBlur={(e) => e.target.value !== inv.description && set({ description: e.target.value })} />
      <div className="lgrid">
        <div className="f"><label>Amount excluding VAT (£)</label><MoneyInput pence={inv.net_pence} disabled={locked} label="Amount" onCommit={(p) => set({ net_pence: p })} /></div>
        <div className="f"><label>VAT rate (%)</label><NumInput value={inv.vat_rate} max={100} disabled={locked} label="VAT rate" onCommit={(n) => set({ vat_rate: n })} /></div>
      </div>
      <div className="lgrid">
        <div className="f"><label htmlFor={'in' + inv.id}>Invoice date</label><input id={'in' + inv.id} type="date" disabled={locked} value={inv.inv_date ?? ''} onChange={(e) => set({ inv_date: e.target.value || today() })} /></div>
        <div className="f"><label htmlFor={'iu' + inv.id}>Payment due</label><input id={'iu' + inv.id} type="date" disabled={locked} value={inv.due_date ?? ''} onChange={(e) => set({ due_date: e.target.value || null })} /></div>
      </div>
      <label className="check"><input type="checkbox" disabled={locked} checked={inv.reverse_charge} onChange={(e) => set({ reverse_charge: e.target.checked })} /> Domestic reverse charge VAT (no VAT charged)</label>
      <p><strong>Total {formatGBP(t.total)}</strong> <span className="muted small">({formatGBP(t.net)} + VAT {formatGBP(t.vat)})</span></p>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn primary" onClick={pdf} disabled={busy}>{busy ? 'Making…' : 'Make invoice PDF'}</button>
      {edit && inv.status === 'draft' && <button className="btn" onClick={() => set({ status: 'issued' })}>Mark as issued</button>}
      {edit && inv.status === 'issued' && <><button className="btn" onClick={() => set({ status: 'paid', paid_date: today() })}>Mark as paid</button><button className="btn" onClick={() => set({ status: 'draft' })}>Reopen as draft</button></>}
      {edit && inv.status === 'draft' && <button className="btn" onClick={async () => { if (confirm('Delete this invoice?')) { await remove('invoices', inv.id); onGone() } }}>Delete invoice</button>}
    </div>
  )
}
