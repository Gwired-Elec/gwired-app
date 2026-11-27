import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '../../lib/auth'
import type { Job } from '../../lib/jobs'
import { db, type Row } from '../../lib/sync/db'
import { newId, remove, save } from '../../lib/sync/store'

interface Area extends Row { walkaround_id: string; name: string; notes: string | null; sort: number }
interface Element extends Row { area_id: string; description: string; qty: number; unit: string; notes: string | null; sort: number }

const alive = (r: Row) => !r.deleted_at
const COMMON = ['Reception', 'Office', 'Kitchen', 'Plant room', 'Comms room', 'Toilets', 'Corridor', 'Roof', 'External']
const UNITS = ['nr', 'm', 'sum', 'item', 'pt']

// Everything on the walkaround is read from and saved to this device first, so it works with no signal and syncs later.
function useWalkaround(jobId: string) {
  return useLiveQuery(async () => {
    const walks = (await db().walkarounds.where('job_id').equals(jobId).filter(alive).toArray()).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    const walk = walks[0]
    const areas = walk ? ((await db().walkaround_areas.where('walkaround_id').equals(walk.id).filter(alive).toArray()) as Area[]).map((a) => ({ ...a, sort: Number(a.sort ?? 0) })).sort((a, b) => a.sort - b.sort) : []
    const ids = areas.map((a) => a.id)
    const elements = ids.length ? ((await db().walkaround_elements.where('area_id').anyOf(ids).filter(alive).toArray()) as Element[]).map((e) => ({ ...e, qty: Number(e.qty ?? 1), sort: Number(e.sort ?? 0) })).sort((a, b) => a.sort - b.sort) : []
    return { walk, areas, elements }
  }, [jobId])
}

export default function WalkaroundTab({ job }: { job: Job }) {
  const { can } = useAuth()
  const data = useWalkaround(job.id)
  const [name, setName] = useState('')
  const edit = can('walkarounds')
  if (!edit) return <div className="card"><p className="muted">You don't have permission to see site walkarounds.</p></div>
  if (!data) return <p className="muted">Loading…</p>
  const { walk, areas, elements } = data

  async function addArea(n: string) {
    const nm = n.trim()
    if (!nm) return
    let wid = walk?.id
    if (!wid) { wid = newId(); await save('walkarounds', wid, { job_id: job.id, title: 'Site walkaround', visit_date: new Date().toISOString().slice(0, 10) }) }
    await save('walkaround_areas', newId(), { walkaround_id: wid, name: nm, sort: (areas.at(-1)?.sort ?? 0) + 10 })
    setName('')
  }
  const submit = (e: FormEvent) => { e.preventDefault(); void addArea(name) }

  return (
    <>
      <div className="card">
        <h2>Site walkaround</h2>
        <p className="muted small">Add each area as you walk the site. Write notes first, then list what is needed there with a quantity. It saves on this device straight away and syncs when there is signal. Photos arrive in the next update.</p>
        <div className="chips" role="group" aria-label="Quick add an area">
          {COMMON.filter((c) => !areas.some((a) => a.name.toLowerCase() === c.toLowerCase())).map((c) => <button key={c} className="chip" onClick={() => addArea(c)}>+ {c}</button>)}
        </div>
        <form onSubmit={submit}>
          <label htmlFor="an">Or name your own area</label>
          <input id="an" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. First floor open plan" />
          <button className="btn primary" disabled={!name.trim()}>Add area</button>
        </form>
      </div>
      {!areas.length && <div className="card"><p className="muted">No areas yet. Tap one above to start.</p></div>}
      {areas.map((a) => <AreaCard key={a.id} area={a} elements={elements.filter((e) => e.area_id === a.id)} />)}
    </>
  )
}

function AreaCard({ area: a, elements }: { area: Area; elements: Element[] }) {
  const [desc, setDesc] = useState('')
  const [qty, setQty] = useState('1')
  const [unit, setUnit] = useState('nr')
  const addEl = async (e: FormEvent) => {
    e.preventDefault()
    const q = Number(qty.replace(/,/g, ''))
    if (!desc.trim() || !Number.isFinite(q) || q < 0) return
    await save('walkaround_elements', newId(), { area_id: a.id, description: desc.trim(), qty: q, unit: unit.trim() || 'nr', sort: (elements.at(-1)?.sort ?? 0) + 10 })
    setDesc(''); setQty('1')
  }
  return (
    <div className="card">
      <div className="rowtop">
        <input key={a.name} type="text" defaultValue={a.name} aria-label="Area name" style={{ fontWeight: 700, flex: 1 }} onBlur={(e) => e.target.value.trim() && e.target.value !== a.name && save('walkaround_areas', a.id, { name: e.target.value.trim() })} />
        <button className="btn" style={{ width: 'auto', marginTop: 0 }} aria-label={`Remove ${a.name}`} onClick={() => confirm(`Remove ${a.name} and everything listed in it?`) && (elements.forEach((e) => void remove('walkaround_elements', e.id)), void remove('walkaround_areas', a.id))}>✕</button>
      </div>
      <label htmlFor={'n' + a.id}>Notes</label>
      <textarea id={'n' + a.id} key={a.notes ?? ''} rows={3} defaultValue={a.notes ?? ''} placeholder="What you see, what the client wants, access, existing condition…" onBlur={(e) => e.target.value !== (a.notes ?? '') && save('walkaround_areas', a.id, { notes: e.target.value.trim() || null })} />

      <h3 style={{ margin: '14px 0 4px' }}>What is needed here</h3>
      {!elements.length && <p className="muted small">Nothing listed yet.</p>}
      {elements.map((el) => (
        <div key={el.id} className="lcard">
          <div className="rowtop">
            <input key={el.description} type="text" defaultValue={el.description} aria-label="What is needed" style={{ flex: 1 }} onBlur={(e) => e.target.value.trim() && e.target.value !== el.description && save('walkaround_elements', el.id, { description: e.target.value.trim() })} />
            <button className="btn" style={{ width: 'auto', marginTop: 0 }} aria-label={`Remove ${el.description}`} onClick={() => remove('walkaround_elements', el.id)}>✕</button>
          </div>
          <div className="lgrid">
            <div className="f"><label>Qty</label>
              <input key={'q' + el.qty} type="text" inputMode="decimal" defaultValue={String(el.qty)} onBlur={(e) => { const n = Number(e.target.value.replace(/,/g, '')); if (Number.isFinite(n) && n >= 0 && n !== el.qty) void save('walkaround_elements', el.id, { qty: n }) }} /></div>
            <div className="f"><label>Unit</label>
              <input key={'u' + el.unit} type="text" defaultValue={el.unit} list="wunits" onBlur={(e) => e.target.value.trim() && e.target.value !== el.unit && save('walkaround_elements', el.id, { unit: e.target.value.trim() })} /></div>
          </div>
          <input key={'m' + (el.notes ?? '')} type="text" defaultValue={el.notes ?? ''} placeholder="Note (optional)" aria-label="Note" style={{ marginTop: 8 }} onBlur={(e) => e.target.value !== (el.notes ?? '') && save('walkaround_elements', el.id, { notes: e.target.value.trim() || null })} />
        </div>
      ))}
      <form onSubmit={addEl} className="lcard">
        <label htmlFor={'d' + a.id}>Add an item</label>
        <input id={'d' + a.id} type="text" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Twin socket outlets" />
        <div className="lgrid">
          <div className="f"><label htmlFor={'nq' + a.id}>Qty</label><input id={'nq' + a.id} type="text" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
          <div className="f"><label htmlFor={'nu' + a.id}>Unit</label><input id={'nu' + a.id} type="text" value={unit} list="wunits" onChange={(e) => setUnit(e.target.value)} /></div>
        </div>
        <button className="btn" disabled={!desc.trim()}>+ Add item</button>
      </form>
      <datalist id="wunits">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
    </div>
  )
}
