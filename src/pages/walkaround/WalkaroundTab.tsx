import { useEffect, useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '../../lib/auth'
import type { Job } from '../../lib/jobs'
import { db, type Row } from '../../lib/sync/db'
import { newId, remove, save } from '../../lib/sync/store'
import { keepLocal, photoWaiting, shrinkImage, uploadPendingPhotos, usePhotoUrl } from '../../lib/walkaround/photoStore'
import SowExport from './SowExport'

export interface Area extends Row { walkaround_id: string; name: string; notes: string | null; sort: number }
export interface Photo extends Row { area_id: string; element_id: string | null; path: string; caption: string | null; sort: number }
export interface Element extends Row { area_id: string; description: string; qty: number; unit: string; notes: string | null; sort: number }

const alive = (r: Row) => !r.deleted_at
const COMMON = ['Reception', 'Office', 'Kitchen', 'Plant room', 'Comms room', 'Toilets', 'Corridor', 'Roof', 'External']
const UNITS = ['nr', 'm', 'sum', 'item', 'pt']

// Everything on the walkaround is read from and saved to this device first, so it works with no signal and syncs later.
export function useWalkaround(jobId: string) {
  return useLiveQuery(async () => {
    const walks = (await db().walkarounds.where('job_id').equals(jobId).filter(alive).toArray()).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    const walk = walks[0]
    const areas = walk ? ((await db().walkaround_areas.where('walkaround_id').equals(walk.id).filter(alive).toArray()) as Area[]).map((a) => ({ ...a, sort: Number(a.sort ?? 0) })).sort((a, b) => a.sort - b.sort) : []
    const ids = areas.map((a) => a.id)
    const elements = ids.length ? ((await db().walkaround_elements.where('area_id').anyOf(ids).filter(alive).toArray()) as Element[]).map((e) => ({ ...e, qty: Number(e.qty ?? 1), sort: Number(e.sort ?? 0) })).sort((a, b) => a.sort - b.sort) : []
    const photos = ids.length ? ((await db().walkaround_photos.where('area_id').anyOf(ids).filter(alive).toArray()) as Photo[]).map((p) => ({ ...p, sort: Number(p.sort ?? 0) })).sort((a, b) => a.sort - b.sort) : []
    return { walk, areas, elements, photos }
  }, [jobId])
}

export default function WalkaroundTab({ job }: { job: Job }) {
  const { can } = useAuth()
  const data = useWalkaround(job.id)
  const [name, setName] = useState('')
  const edit = can('walkarounds')
  if (!edit) return <div className="card"><p className="muted">You don't have permission to see site walkarounds.</p></div>
  if (!data) return <p className="muted">Loading…</p>
  const { walk, areas, elements, photos } = data

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
        <p className="muted small">Add each area as you walk the site. Write notes first, then list what is needed there with a quantity. It saves on this device straight away and syncs when there is signal. Add photos against each item. They are kept on the phone and uploaded when there is signal.</p>
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
      {areas.map((a) => <AreaCard key={a.id} area={a} jobId={job.id} elements={elements.filter((e) => e.area_id === a.id)} photos={photos.filter((p) => p.area_id === a.id)} />)}
      {areas.length > 0 && <SowExport job={job} areas={areas} elements={elements} photos={photos} />}
    </>
  )
}

// shrink, keep on the device, and record each picture against one item (the upload happens when there is signal)
async function attachPhotos(files: File[], jobId: string, areaId: string, elementId: string, firstSort: number) {
  let sort = firstSort
  for (const file of files) {
    const blob = await shrinkImage(file)
    const id = newId()
    await keepLocal(id, blob)
    await save('walkaround_photos', id, { area_id: areaId, element_id: elementId, path: `${jobId}/${id}.jpg`, sort })
    sort += 10
  }
  void uploadPendingPhotos()
}

function AddPhotosButton({ busy, onFiles, label = '📷 Add photos' }: { busy?: boolean; onFiles: (f: File[]) => void; label?: string }) {
  return (
    <label className="btn" style={{ marginTop: 8, opacity: busy ? 0.6 : 1 }}>
      {busy ? 'Adding…' : label}
      <input type="file" accept="image/*" multiple disabled={busy} style={{ display: 'none' }} onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ''; if (fs.length) onFiles(fs) }} />
    </label>
  )
}

// the photos of one item, with a button to add more
function ItemPhotos({ jobId, areaId, el, photos }: { jobId: string; areaId: string; el: Element; photos: Photo[] }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function add(files: File[]) {
    setBusy(true); setErr('')
    try { await attachPhotos(files, jobId, areaId, el.id, (photos.at(-1)?.sort ?? 0) + 10) } catch (e) { setErr(e instanceof Error ? e.message : 'A photo could not be added.') }
    setBusy(false)
  }
  return (
    <>
      {photos.length > 0 && <div className="photos" style={{ marginTop: 8 }}>{photos.map((p) => <PhotoTile key={p.id} photo={p} />)}</div>}
      <AddPhotosButton busy={busy} onFiles={add} label={photos.length ? '📷 Add another photo' : '📷 Add photos of this item'} />
      {err && <p className="err" role="alert">{err}</p>}
    </>
  )
}

function AreaCard({ area: a, jobId, elements, photos }: { area: Area; jobId: string; elements: Element[]; photos: Photo[] }) {
  const [desc, setDesc] = useState('')
  const [qty, setQty] = useState('1')
  const [unit, setUnit] = useState('nr')
  const [note, setNote] = useState('')
  const [pending, setPending] = useState<File[]>([]) // photos chosen for the new item before it is added
  const [adding, setAdding] = useState(false)
  const [addErr, setAddErr] = useState('')
  const addEl = async (e: FormEvent) => {
    e.preventDefault()
    const q = Number(qty.replace(/,/g, ''))
    if (!desc.trim() || !Number.isFinite(q) || q < 0) return
    setAdding(true); setAddErr('')
    const id = newId()
    try {
      await save('walkaround_elements', id, { area_id: a.id, description: desc.trim(), qty: q, unit: unit.trim() || 'nr', notes: note.trim() || null, sort: (elements.at(-1)?.sort ?? 0) + 10 })
      if (pending.length) await attachPhotos(pending, jobId, a.id, id, 10)
      setDesc(''); setQty('1'); setNote(''); setPending([])
    } catch (er) {
      setAddErr(er instanceof Error ? er.message : 'The item was added but a photo could not be.')
    }
    setAdding(false)
  }
  const loose = photos.filter((p) => !p.element_id) // photos taken against the whole area before photos moved to items
  return (
    <div className="card">
      <div className="rowtop">
        <input key={a.name} type="text" defaultValue={a.name} aria-label="Area name" style={{ fontWeight: 700, flex: 1 }} onBlur={(e) => e.target.value.trim() && e.target.value !== a.name && save('walkaround_areas', a.id, { name: e.target.value.trim() })} />
        <button className="btn" style={{ width: 'auto', marginTop: 0 }} aria-label={`Remove ${a.name}`} onClick={() => confirm(`Remove ${a.name} and everything listed in it?`) && (elements.forEach((e) => void remove('walkaround_elements', e.id)), photos.forEach((p) => void remove('walkaround_photos', p.id)), void remove('walkaround_areas', a.id))}>✕</button>
      </div>
      <label htmlFor={'n' + a.id}>Notes</label>
      <textarea id={'n' + a.id} key={a.notes ?? ''} rows={3} defaultValue={a.notes ?? ''} placeholder="What you see, what the client wants, access, existing condition…" onBlur={(e) => e.target.value !== (a.notes ?? '') && save('walkaround_areas', a.id, { notes: e.target.value.trim() || null })} />

      <h3 style={{ margin: '14px 0 4px' }}>What is needed here</h3>
      {!elements.length && <p className="muted small">Nothing listed yet.</p>}
      {elements.map((el) => (
        <div key={el.id} className="lcard">
          <div className="rowtop">
            <input key={el.description} type="text" defaultValue={el.description} aria-label="What is needed" style={{ flex: 1 }} onBlur={(e) => e.target.value.trim() && e.target.value !== el.description && save('walkaround_elements', el.id, { description: e.target.value.trim() })} />
            <button className="btn" style={{ width: 'auto', marginTop: 0 }} aria-label={`Remove ${el.description}`} onClick={() => (photos.filter((p) => p.element_id === el.id).forEach((p) => void remove('walkaround_photos', p.id)), void remove('walkaround_elements', el.id))}>✕</button>
          </div>
          <div className="lgrid">
            <div className="f"><label>Qty</label>
              <input key={'q' + el.qty} type="text" inputMode="decimal" defaultValue={String(el.qty)} onBlur={(e) => { const n = Number(e.target.value.replace(/,/g, '')); if (Number.isFinite(n) && n >= 0 && n !== el.qty) void save('walkaround_elements', el.id, { qty: n }) }} /></div>
            <div className="f"><label>Unit</label>
              <input key={'u' + el.unit} type="text" defaultValue={el.unit} list="wunits" onBlur={(e) => e.target.value.trim() && e.target.value !== el.unit && save('walkaround_elements', el.id, { unit: e.target.value.trim() })} /></div>
          </div>
          <input key={'m' + (el.notes ?? '')} type="text" defaultValue={el.notes ?? ''} placeholder="Note (optional)" aria-label="Note" style={{ marginTop: 8 }} onBlur={(e) => e.target.value !== (el.notes ?? '') && save('walkaround_elements', el.id, { notes: e.target.value.trim() || null })} />
          <ItemPhotos jobId={jobId} areaId={a.id} el={el} photos={photos.filter((p) => p.element_id === el.id)} />
        </div>
      ))}
      <form onSubmit={addEl} className="lcard">
        <label htmlFor={'d' + a.id}>Add an item</label>
        <input id={'d' + a.id} type="text" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Twin socket outlets" />
        <div className="lgrid">
          <div className="f"><label htmlFor={'nq' + a.id}>Qty</label><input id={'nq' + a.id} type="text" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
          <div className="f"><label htmlFor={'nu' + a.id}>Unit</label><input id={'nu' + a.id} type="text" value={unit} list="wunits" onChange={(e) => setUnit(e.target.value)} /></div>
        </div>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" aria-label="Note for this item" style={{ marginTop: 8 }} />
        <AddPhotosButton onFiles={(fs) => setPending((p) => [...p, ...fs])} label={pending.length ? `📷 ${pending.length} photo${pending.length === 1 ? '' : 's'} ready (add more)` : '📷 Add photos of this item'} />
        {pending.length > 0 && <button type="button" className="link small" onClick={() => setPending([])}>Clear the photos</button>}
        {addErr && <p className="err" role="alert">{addErr}</p>}
        <button className="btn" disabled={!desc.trim() || adding}>{adding ? 'Adding…' : '+ Add item'}</button>
      </form>
      {loose.length > 0 && (
        <>
          <h3 style={{ margin: '14px 0 4px' }}>Other photos of this area</h3>
          <div className="photos">{loose.map((p) => <PhotoTile key={p.id} photo={p} />)}</div>
        </>
      )}
      <datalist id="wunits">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
    </div>
  )
}

function PhotoTile({ photo: p }: { photo: Photo }) {
  const url = usePhotoUrl(p)
  const [waiting, setWaiting] = useState(false)
  useEffect(() => {
    let live = true
    const check = () => void photoWaiting(p.id).then((w) => live && setWaiting(w))
    check()
    const t = setInterval(check, 8000)
    return () => { live = false; clearInterval(t) }
  }, [p.id])
  return (
    <div className="photo">
      {url ? <img src={url} alt={p.caption || 'Site photo'} /> : <div className="ph">{url === null ? 'Not on this device yet. Connect to load it.' : 'Loading…'}</div>}
      {waiting && <span className="tag">waiting to upload</span>}
      <input key={p.caption ?? ''} type="text" defaultValue={p.caption ?? ''} placeholder="Caption (optional)" aria-label="Photo caption" onBlur={(e) => e.target.value !== (p.caption ?? '') && save('walkaround_photos', p.id, { caption: e.target.value.trim() || null })} />
      <button className="link small" onClick={() => confirm('Remove this photo?') && remove('walkaround_photos', p.id)}>Remove photo</button>
    </div>
  )
}
