import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '../../lib/auth'
import type { Job } from '../../lib/jobs'
import { db } from '../../lib/sync/db'
import { commitAllDrafts, loadWalkaround, registerDraft, unregisterDraft, type Area, type Element, type Photo } from '../../lib/walkaround/data'
import { diff, newId, remove, save } from '../../lib/sync/store'
import { keepLocal, keepOriginal, photoWaiting, uploadPendingPhotos, usePhotoUrl } from '../../lib/walkaround/photoStore'
import { PhotoCapture, PhotoViewer } from './PhotoEditor'
import SowExport from './SowExport'

export type { Area, Element, Photo } from '../../lib/walkaround/data'

const COMMON = ['Reception', 'Office', 'Kitchen', 'Plant room', 'Comms room', 'Toilets', 'Corridor', 'Roof', 'External']
const UNITS = ['nr', 'm', 'sum', 'item', 'pt']

// Everything on the walkaround is read from and saved to this device first, so it works with no signal and syncs later.
export function useWalkaround(jobId: string) {
  return useLiveQuery(() => loadWalkaround(jobId), [jobId])
}
export default function WalkaroundTab({ job }: { job: Job }) {
  const { can } = useAuth()
  const data = useWalkaround(job.id)
  const [name, setName] = useState('')
  useEffect(() => {
    const hide = () => { if (document.visibilityState === 'hidden') void commitAllDrafts() }
    document.addEventListener('visibilitychange', hide)
    window.addEventListener('pagehide', hide)
    return () => { document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', hide) }
  }, [])
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
      {areas.length > 0 && <SowExport job={job} />}
    </>
  )
}

// A picture the person has accepted (already shrunk by the preview screen). If it was marked up, the untouched picture is kept
// too so the markup can be removed later. Saved on the device first; the upload happens when there is signal.
export interface Kept { blob: Blob; original?: Blob }
export async function attachPhotos(items: Kept[], jobId: string, areaId: string | null, elementId: string | null, firstSort: number, extra: Record<string, unknown> = {}) {
  let sort = firstSort
  for (const it of items) {
    const id = newId()
    const fields: Record<string, unknown> = { area_id: areaId, element_id: elementId, sort, ...extra }
    if (it.original) {
      fields.original_path = `${jobId}/${id}.jpg`
      fields.path = `${jobId}/${id}-m.jpg`
      await keepOriginal(id, it.original, fields.original_path as string)
    } else fields.path = `${jobId}/${id}.jpg`
    await keepLocal(id, it.blob, fields.path as string)
    await save('walkaround_photos', id, fields)
    sort += 10
  }
  void uploadPendingPhotos()
}

// an existing item: camera and note buttons side by side, then the note, then the thumbnails
function ItemExtras({ jobId, areaId, el, photos }: { jobId: string; areaId: string; el: Element; photos: Photo[] }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  const sortRef = useRef(0)
  async function keep(blob: Blob, original?: Blob) {
    setBusy(true); setErr('')
    try {
      sortRef.current = Math.max(sortRef.current, photos.at(-1)?.sort ?? 0) + 10
      await attachPhotos([{ blob, original }], jobId, areaId, el.id, sortRef.current)
    } catch (e) { setErr(e instanceof Error ? e.message : 'A photo could not be added.') }
    setBusy(false)
  }
  const showNote = noteOpen || !!el.notes
  return (
    <>
      <div className="walk-actions">
        <PhotoCapture busy={busy} onKeep={keep} />
        <button type="button" className="iconbtn" aria-expanded={showNote} onClick={() => setNoteOpen((o) => !o)}>📝 {el.notes ? 'Note' : 'Add note'}</button>
      </div>
      {showNote && <input key={'m' + (el.notes ?? '')} type="text" defaultValue={el.notes ?? ''} autoFocus={noteOpen && !el.notes} placeholder="Note" aria-label="Note" style={{ marginTop: 8 }} onBlur={(e) => e.target.value !== (el.notes ?? '') && save('walkaround_elements', el.id, { notes: e.target.value.trim() || null })} />}
      {err && <p className="err" role="alert">{err}</p>}
      {photos.length > 0 && <div className="thumbs">{photos.map((p) => <PhotoThumb key={p.id} photo={p} />)}</div>}
    </>
  )
}

function AreaCard({ area: a, jobId, elements, photos }: { area: Area; jobId: string; elements: Element[]; photos: Photo[] }) {
  const [desc, setDesc] = useState('')
  const [qty, setQty] = useState('1')
  const [unit, setUnit] = useState('nr')
  const [note, setNote] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  const [draftId, setDraftId] = useState<string | null>(null) // the item being filled in below: it is already saved
  const [adding, setAdding] = useState(false)
  const [addErr, setAddErr] = useState('')
  // what is in the form right now, in a ref so it can be saved from anywhere (even as this card goes away)
  const live = useRef<{ id: string | null; desc: string; qty: string; unit: string; note: string }>({ id: null, desc: '', qty: '1', unit: 'nr', note: '' })
  live.current = { id: draftId ?? live.current.id, desc, qty, unit, note }
  const working = useRef(false)
  const photoSort = useRef(0)
  // The item being filled in is part of the scope as soon as it has a description: it is created then, and every change to it
  // is saved as you go. "Add another item" only clears the form to start the next one.
  async function flush(): Promise<string | null> {
    const d = live.current
    if (!d.desc.trim()) return d.id
    while (working.current) await new Promise((r) => setTimeout(r, 30))
    working.current = true
    try {
      const q = Number(d.qty.replace(/,/g, ''))
      const fields = { description: d.desc.trim(), qty: Number.isFinite(q) && q >= 0 ? q : 1, unit: d.unit.trim() || 'nr', notes: d.note.trim() || null }
      let id = live.current.id
      if (!id) {
        id = newId()
        live.current.id = id
        const existing = await db().walkaround_elements.where('area_id').equals(a.id).filter((r) => !r.deleted_at).toArray()
        const sort = existing.reduce((m, r) => Math.max(m, Number(r.sort ?? 0)), 0) + 10
        await save('walkaround_elements', id, { area_id: a.id, sort, ...fields })
        setDraftId(id)
      } else {
        const patch = diff(await db().walkaround_elements.get(id), fields)
        if (Object.keys(patch).length) await save('walkaround_elements', id, patch)
      }
      return id
    } finally {
      working.current = false
    }
  }
  // save a moment after typing stops
  useEffect(() => {
    if (!desc.trim()) return
    const t = setTimeout(() => void flush().catch(() => {}), 700)
    return () => clearTimeout(t)
  }, [desc, qty, unit, note]) // eslint-disable-line react-hooks/exhaustive-deps
  // and always before leaving this screen, switching apps, or making the PDF / Excel file
  useEffect(() => {
    registerDraft(a.id, async () => { await flush() })
    return () => { unregisterDraft(a.id); void flush().catch(() => {}) }
  }, [a.id]) // eslint-disable-line react-hooks/exhaustive-deps
  async function another() {
    setAdding(true); setAddErr('')
    try { await flush() } catch (er) { setAddErr(er instanceof Error ? er.message : 'Could not save the item.'); setAdding(false); return }
    live.current = { id: null, desc: '', qty: '1', unit: 'nr', note: '' }
    setDraftId(null); setDesc(''); setQty('1'); setUnit('nr'); setNote(''); setNoteOpen(false)
    setAdding(false)
  }
  const draftPhotos = photos.filter((p) => draftId && p.element_id === draftId)
  const listed = elements.filter((e) => e.id !== draftId)
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
      {!listed.length && !draftId && <p className="muted small">Nothing listed yet.</p>}
      {listed.map((el) => (
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
          <ItemExtras jobId={jobId} areaId={a.id} el={el} photos={photos.filter((p) => p.element_id === el.id)} />
        </div>
      ))}
      <div className="lcard">
        <div className="rowtop"><label htmlFor={'d' + a.id}>Add an item</label>{draftId && <span className="tag">saved</span>}</div>
        <input id={'d' + a.id} type="text" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Twin socket outlets" />
        <div className="lgrid">
          <div className="f"><label htmlFor={'nq' + a.id}>Qty</label><input id={'nq' + a.id} type="text" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
          <div className="f"><label htmlFor={'nu' + a.id}>Unit</label><input id={'nu' + a.id} type="text" value={unit} list="wunits" onChange={(e) => setUnit(e.target.value)} /></div>
        </div>
        <div className="walk-actions">
          <PhotoCapture
            canOpen={() => { if (!desc.trim()) { setAddErr('Type what the item is first, then add photos.'); return false } setAddErr(''); return true }}
            onKeep={async (blob, original) => {
              const id = await flush()
              if (!id) { setAddErr('Type what the item is first, then add photos.'); return }
              photoSort.current = Math.max(photoSort.current, draftPhotos.at(-1)?.sort ?? 0) + 10
              await attachPhotos([{ blob, original }], jobId, a.id, id, photoSort.current)
            }} />
          <button type="button" className="iconbtn" aria-expanded={noteOpen || !!note} onClick={() => setNoteOpen((o) => !o)}>📝 {note ? 'Note' : 'Add note'}</button>
        </div>
        {(noteOpen || !!note) && <input type="text" value={note} autoFocus={noteOpen && !note} onChange={(e) => setNote(e.target.value)} placeholder="Note" aria-label="Note for this item" style={{ marginTop: 8 }} />}
        {draftPhotos.length > 0 && <div className="thumbs">{draftPhotos.map((p) => <PhotoThumb key={p.id} photo={p} />)}</div>}
        {addErr && <p className="err" role="alert">{addErr}</p>}
        <button type="button" className="btn" style={{ marginTop: 14 }} disabled={!desc.trim() || adding} onClick={another}>{adding ? 'Saving…' : '+ Add another item'}</button>
        <p className="muted small" style={{ margin: '6px 0 0' }}>This item is already part of the scope as soon as you have typed what it is. Tap Add another item only to start the next one.</p>
      </div>
      {loose.length > 0 && (
        <>
          <h3 style={{ margin: '14px 0 4px' }}>Other photos of this area</h3>
          <div className="thumbs">{loose.map((p) => <PhotoThumb key={p.id} photo={p} />)}</div>
        </>
      )}
      <datalist id="wunits">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
    </div>
  )
}

// a small thumbnail; tap it to open the photo full screen (delete, mark up, caption)
export function PhotoThumb({ photo: p }: { photo: Photo }) {
  const url = usePhotoUrl(p)
  const [open, setOpen] = useState(false)
  const [waiting, setWaiting] = useState(false)
  useEffect(() => {
    let live = true
    const check = () => void photoWaiting(p.id).then((w) => live && setWaiting(w))
    check()
    const t = setInterval(check, 8000)
    return () => { live = false; clearInterval(t) }
  }, [p.id])
  return (
    <>
      <button type="button" className="thumb" aria-label="Open photo" onClick={() => setOpen(true)}>
        {url ? <img src={url} alt={p.caption || 'Site photo'} /> : <div className="ph">{url === null ? 'Not on this device yet' : '…'}</div>}
        {waiting && <span className="wait" title="Waiting to upload">⏳</span>}
      </button>
      {open && <PhotoViewer photo={p} onClose={() => setOpen(false)} />}
    </>
  )
}
