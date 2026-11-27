import { useState } from 'react'
import { MoneyInput, NumInput } from '../../components/MoneyInput'
import { useAuth } from '../../lib/auth'
import { useCommercial, variationValue, vref, type Variation, type VariationLine } from '../../lib/commercial/data'
import { buildVariationPdf } from '../../lib/commercial/pdf'
import { deliverPdf, docBase } from '../../lib/commercial/share'
import { useClients, type Job } from '../../lib/jobs'
import { formatGBP } from '../../lib/money'
import { variationLine } from '../../lib/money/applications'
import { newId, remove, save } from '../../lib/sync/store'

const STATUS: [Variation['status'], string][] = [['draft', 'Draft'], ['issued', 'Issued to client'], ['approved', 'Approved'], ['rejected', 'Rejected']]

export default function VariationsTab({ job }: { job: Job }) {
  const { can } = useAuth()
  const data = useCommercial(job.id)
  const [open, setOpen] = useState<string | null>(null)
  if (!can('estimates.view')) return <div className="card"><p className="muted">You do not have access to prices.</p></div>
  if (!data) return <p className="muted">Loading…</p>
  const edit = can('estimates.edit')
  const approved = data.variations.filter((v) => v.status === 'approved').reduce((a, v) => a + variationValue(data.vlines.filter((l) => l.variation_id === v.id)), 0)

  async function add() {
    const id = newId()
    await save('variations', id, { job_id: job.id, number: (data!.variations.at(-1)?.number ?? 0) + 1, title: '', status: 'draft', var_date: new Date().toISOString().slice(0, 10) })
    setOpen(id)
  }
  return (
    <>
      <div className="card">
        <h2>Variations</h2>
        <p className="muted small">Changes to the work after the quote was accepted. Price each one by quantity and rate. Once a variation is marked Approved it is added to the contract and appears on the next application for payment.</p>
        <p>Approved so far: <strong>{formatGBP(approved)}</strong> excluding VAT</p>
        {edit && <button className="btn primary" onClick={add}>+ New variation</button>}
      </div>
      {!data.variations.length && <div className="card"><p className="muted">No variations on this job yet.</p></div>}
      {data.variations.map((v) => {
        const lines = data.vlines.filter((l) => l.variation_id === v.id)
        return (
          <div className="card" key={v.id}>
            <button className="linklike" style={{ width: '100%', textAlign: 'left' }} onClick={() => setOpen(open === v.id ? null : v.id)} aria-expanded={open === v.id}>
              <div className="rowtop"><strong>{vref(v.number)} {v.title || 'Untitled variation'}</strong><span>{formatGBP(variationValue(lines))}</span></div>
              <span className="muted small">{STATUS.find(([k]) => k === v.status)?.[1]}</span>
            </button>
            {open === v.id && <Editor job={job} v={v} lines={lines} edit={edit} onGone={() => setOpen(null)} />}
          </div>
        )
      })}
    </>
  )
}

function Editor({ job, v, lines, edit, onGone }: { job: Job; v: Variation; lines: VariationLine[]; edit: boolean; onGone: () => void }) {
  const clients = useClients()
  const [title, setTitle] = useState(v.title)
  const [desc, setDesc] = useState(v.description ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const locked = !edit || v.status === 'approved'
  const total = variationValue(lines)

  async function addLine() {
    await save('variation_lines', newId(), { variation_id: v.id, sort: (lines.at(-1)?.sort ?? 0) + 10, description: '', qty: 1, unit: 'nr', rate_pence: 0 })
  }
  async function pdf() {
    setBusy(true); setErr('')
    try {
      const client = clients?.find((c) => c.id === job.client_id) ?? null
      const base = await docBase(job, client ? { name: client.name, address: client.address } : null)
      await deliverPdf(await buildVariationPdf({ ...base, variation: { ...v, title, description: desc }, lines }), `Variation ${vref(v.number)} ${job.job_number ?? ''}.pdf`.replace(/\s+/g, ' '))
    } catch (e) { setErr((e as Error).message || 'Could not make the PDF.') } finally { setBusy(false) }
  }
  return (
    <div style={{ marginTop: 12 }}>
      <label htmlFor={'vt' + v.id}>Title</label>
      <input id={'vt' + v.id} type="text" disabled={locked} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== v.title && save('variations', v.id, { title })} placeholder="e.g. Extra sockets to kitchen" />
      <label htmlFor={'vd' + v.id}>What changed and why</label>
      <textarea id={'vd' + v.id} rows={3} disabled={locked} value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== (v.description ?? '') && save('variations', v.id, { description: desc || null })} />
      <label htmlFor={'vs' + v.id}>Status</label>
      <select id={'vs' + v.id} disabled={!edit} value={v.status} onChange={(e) => save('variations', v.id, { status: e.target.value })}>
        {STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {v.status === 'approved' && <p className="muted small">Approved variations are locked. Change the status back to Issued to edit it.</p>}

      <h3 style={{ marginTop: 16 }}>Items</h3>
      {lines.map((l) => (
        <div className="lcard" key={l.id}>
          <input type="text" aria-label="Description" disabled={locked} defaultValue={l.description} placeholder="Description" onBlur={(e) => e.target.value !== l.description && save('variation_lines', l.id, { description: e.target.value })} />
          <div className="lgrid">
            <div className="f"><label>Qty</label><NumInput value={l.qty} disabled={locked} label="Quantity" onCommit={(qty) => save('variation_lines', l.id, { qty })} /></div>
            <div className="f"><label>Unit</label><input type="text" aria-label="Unit" disabled={locked} defaultValue={l.unit} onBlur={(e) => e.target.value !== l.unit && save('variation_lines', l.id, { unit: e.target.value || 'nr' })} /></div>
            <div className="f"><label>Rate (£)</label><MoneyInput pence={l.rate_pence} disabled={locked} label="Rate" onCommit={(rate_pence) => save('variation_lines', l.id, { rate_pence })} /></div>
          </div>
          <div className="rowtop"><span className="muted small">Total {formatGBP(variationLine(l.qty, l.rate_pence))}</span>{!locked && <button className="linklike" onClick={() => remove('variation_lines', l.id)}>Remove</button>}</div>
        </div>
      ))}
      {!locked && <button className="btn" onClick={addLine}>+ Add item</button>}
      <p style={{ marginTop: 12 }}><strong>Total: {formatGBP(total)}</strong> <span className="muted small">excluding VAT</span></p>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn primary" onClick={pdf} disabled={busy || !lines.length}>{busy ? 'Making…' : 'Make variation PDF'}</button>
      {edit && v.status === 'draft' && <button className="btn" onClick={async () => { if (confirm('Delete this variation?')) { await remove('variations', v.id); onGone() } }}>Delete variation</button>}
    </div>
  )
}
