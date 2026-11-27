import { useEffect, useRef, useState } from 'react'
import { MoneyInput } from '../../components/MoneyInput'
import { useAuth } from '../../lib/auth'
import { acceptedValue, useCommercial, variationValues, vref, type Variation } from '../../lib/commercial/data'
import { buildVariationPdf } from '../../lib/commercial/pdf'
import { deliverPdf, docBase } from '../../lib/commercial/share'
import { useEstSettings, useLabourRates } from '../../lib/estimating/data'
import { contractItems } from '../../lib/commercial/data'
import { useJobEstimates, type Estimate, type Line, type Section } from '../../lib/estimating/estimates'
import { useClients, type Job } from '../../lib/jobs'
import { formatGBP } from '../../lib/money'
import { newId, remove, save, saveBatch } from '../../lib/sync/store'
import { Editor as PriceEditor } from '../estimating/EstimateTab'

const STATUS: [Variation['status'], string][] = [['draft', 'Draft'], ['issued', 'Issued to client'], ['approved', 'Approved'], ['rejected', 'Rejected']]

export default function VariationsTab({ job }: { job: Job }) {
  const { can, profile } = useAuth()
  const data = useCommercial(job.id)
  const est = useJobEstimates(job.id)
  const settings = useEstSettings()
  const labour = useLabourRates()
  const [open, setOpen] = useState<string | null>(null)
  if (!can('estimates.view')) return <div className="card"><p className="muted">You do not have access to prices.</p></div>
  if (!data || !est || !labour) return <p className="muted">Loading…</p>
  const edit = can('estimates.edit')
  const values = variationValues(data.variations, data.vlines, est.varEstimates, est.lines)
  const approved = data.variations.filter((v) => v.status === 'approved').reduce((a, v) => a + acceptedValue(v, values.get(v.id) ?? 0), 0)
  const user = { id: profile!.id, name: profile!.full_name || profile!.email }

  // A variation is priced like an estimate: it gets its own estimate (one section to start) using the same pricing methods.
  async function newEstimateFor(variationId: string) {
    const items: { tbl: 'estimates' | 'estimate_sections'; id: string; patch: Record<string, unknown> }[] = []
    const id = newId()
    const main = est!.estimates.at(-1)
    items.push({ tbl: 'estimates', id, patch: {
      job_id: job.id, variation_id: variationId, rev: 1, status: 'draft', method: main?.method ?? 'units', labour_rate_id: main?.labour_rate_id ?? labour!.find((l) => l.active !== false)?.id ?? null,
      ohp_mode: main?.ohp_mode ?? 'combined', ohp_pct: main?.ohp_pct ?? settings.oh_pct + settings.profit_pct, ohp_materials_pct: main?.ohp_materials_pct ?? settings.oh_pct + settings.profit_pct, ohp_labour_pct: main?.ohp_labour_pct ?? settings.oh_pct + settings.profit_pct,
      contingency_pct: 0, discount_pct: 0, vat_rate: main?.vat_rate ?? settings.vat_rate, reverse_charge: main?.reverse_charge ?? false,
    } })
    items.push({ tbl: 'estimate_sections', id: newId(), patch: { estimate_id: id, name: 'Variation works', sort: 10 } })
    await saveBatch(items)
  }
  async function add() {
    const id = newId()
    await save('variations', id, { job_id: job.id, number: (data!.variations.at(-1)?.number ?? 0) + 1, title: '', status: 'draft', var_date: new Date().toISOString().slice(0, 10) })
    await newEstimateFor(id)
    setOpen(id)
  }
  return (
    <>
      <div className="card">
        <h2>Variations</h2>
        <p className="muted small">Changes to the work after the quote was accepted. Each is priced like an estimate: materials, price per point, day rates, assemblies or your own items. Once a variation is marked Approved it is added to the contract and appears on the next application for payment.</p>
        <p>Approved so far: <strong>{formatGBP(approved)}</strong> excluding VAT</p>
        {edit && <button className="btn primary" onClick={add}>+ New variation</button>}
      </div>
      {!data.variations.length && <div className="card"><p className="muted">No variations on this job yet.</p></div>}
      {data.variations.map((v) => (
        <div className="card" key={v.id}>
          <button className="linklike" style={{ width: '100%', textAlign: 'left' }} onClick={() => setOpen(open === v.id ? null : v.id)} aria-expanded={open === v.id}>
            <div className="rowtop"><strong>{vref(v.number)} {v.title || 'Untitled variation'}</strong><span>{formatGBP(values.get(v.id) ?? 0)}</span></div>
            <span className="muted small">{STATUS.find(([k]) => k === v.status)?.[1]}</span>
          </button>
          {open === v.id && <VarEditor job={job} v={v} total={values.get(v.id) ?? 0} edit={edit} user={user} estimate={est.varEstimates.find((e) => e.variation_id === v.id)} sections={est.sections} lines={est.lines} make={() => newEstimateFor(v.id)} onGone={() => setOpen(null)} />}
        </div>
      ))}
    </>
  )
}

function VarEditor({ job, v, total, edit, user, estimate, sections, lines, make, onGone }: {
  job: Job; v: Variation; total: number; edit: boolean; user: { id: string; name: string }; estimate?: Estimate; sections: Section[]; lines: Line[]; make: () => Promise<void>; onGone: () => void
}) {
  const clients = useClients()
  const [title, setTitle] = useState(v.title)
  const [desc, setDesc] = useState(v.description ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ask, setAsk] = useState(false) // the "how much was accepted?" box
  const [acc, setAcc] = useState(0)
  const locked = !edit || v.status === 'approved'
  // a variation made before pricing was added to variations gets its estimate the first time it is opened
  const making = useRef(false)
  useEffect(() => { if (!estimate && edit && !making.current) { making.current = true; void make() } }, [estimate, edit]) // eslint-disable-line react-hooks/exhaustive-deps

  async function pdf() {
    if (!estimate) return
    setBusy(true); setErr('')
    try {
      const client = clients?.find((c) => c.id === job.client_id) ?? null
      const base = await docBase(job, client ? { name: client.name, address: client.address } : null)
      // the same lines the estimate has, with the price spread so they add up exactly (as on the quote)
      const { items } = contractItems(estimate, sections, lines)
      const byId = new Map(items.map((i) => [i.key, i.pence]))
      const rows = lines.filter((l) => l.estimate_id === estimate.id).sort((a, b) => sections.findIndex((s) => s.id === a.section_id) - sections.findIndex((s) => s.id === b.section_id) || a.sort - b.sort).map((l) => {
        const t = byId.get('q:' + l.id) ?? 0
        return { description: l.description, qty: l.qty, unit: l.unit, rate: l.qty ? Math.round(t / l.qty) : t, total: t }
      })
      await deliverPdf(await buildVariationPdf({ ...base, variation: { ...v, title, description: desc }, rows }), `Variation ${vref(v.number)} ${job.job_number ?? ''}.pdf`.replace(/\s+/g, ' '))
    } catch (e) { setErr((e as Error).message || 'Could not make the PDF.') } finally { setBusy(false) }
  }
  return (
    <div style={{ marginTop: 12 }}>
      <label htmlFor={'vt' + v.id}>Title</label>
      <input id={'vt' + v.id} type="text" disabled={locked} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== v.title && save('variations', v.id, { title })} placeholder="e.g. Extra sockets to kitchen" />
      <label htmlFor={'vd' + v.id}>What changed and why</label>
      <textarea id={'vd' + v.id} rows={3} disabled={locked} value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== (v.description ?? '') && save('variations', v.id, { description: desc || null })} />
      <label htmlFor={'vs' + v.id}>Status</label>
      <select id={'vs' + v.id} disabled={!edit} value={v.status} onChange={(e) => (e.target.value === 'approved' ? (setAcc(total), setAsk(true)) : save('variations', v.id, { status: e.target.value, approved_pence: null }))}>
        {STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {ask && (
        <div className="card" style={{ background: 'var(--grey-1, #f4f4f6)' }}>
          <label htmlFor={'va' + v.id}>How much did the client accept (£, excluding VAT)?</label>
          <MoneyInput id={'va' + v.id} pence={acc} onCommit={setAcc} />
          <p className="muted small">Priced at {formatGBP(total)}. If they accepted less, the difference shows as a discount on the application for payment.</p>
          <button className="btn primary" onClick={async () => { await save('variations', v.id, { status: 'approved', approved_pence: acc >= 0 && acc !== total ? acc : null }); setAsk(false) }}>Approve at {formatGBP(acc)}</button>
          <button className="btn" onClick={() => setAsk(false)}>Cancel</button>
        </div>
      )}
      {v.status === 'approved' && !ask && <p className="muted small">Approved at {formatGBP(acceptedValue(v, total))}{acceptedValue(v, total) < total ? ` of ${formatGBP(total)} priced (discount ${formatGBP(total - acceptedValue(v, total))})` : ''}. Approved variations are locked: change the status back to Issued to edit it.</p>}

      <h3 style={{ marginTop: 16 }}>Pricing</h3>
      {estimate
        ? <PriceEditor job={job} est={estimate} sections={sections.filter((s) => s.estimate_id === estimate.id)} lines={lines.filter((l) => l.estimate_id === estimate.id)} clauses={[]} library={[]} others={[]} user={user} canEdit={edit} variation={{ locked: v.status === 'approved' }} />
        : <p className="muted small">Setting up pricing…</p>}
      <p style={{ marginTop: 12 }}><strong>Total: {formatGBP(total)}</strong> <span className="muted small">excluding VAT</span></p>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn primary" onClick={pdf} disabled={busy || !estimate || !total}>{busy ? 'Making…' : 'Make variation PDF'}</button>
      {edit && v.status === 'draft' && <button className="btn" onClick={async () => { if (confirm('Delete this variation?')) { await remove('variations', v.id); if (estimate) await remove('estimates', estimate.id); onGone() } }}>Delete variation</button>}
    </div>
  )
}
