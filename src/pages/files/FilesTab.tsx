// Files on a job: tech sheets, drawings, photos, anything. Added from the phone's files, photos or camera, kept in the cloud, opened with a tap.
import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '../../lib/auth'
import { fmtDate, type Job } from '../../lib/jobs'
import { supabase } from '../../lib/supabase'
import { db, type Row } from '../../lib/sync/db'
import { newId, remove, save } from '../../lib/sync/store'

interface JobFile extends Row { job_id: string; name: string; category: 'tech_sheet' | 'drawing' | 'photo' | 'other'; path: string; size_bytes: number | null; mime: string | null; notes: string | null; created_by: string | null }
const CATS: [JobFile['category'], string][] = [['tech_sheet', 'Tech sheets'], ['drawing', 'Drawings'], ['photo', 'Photos'], ['other', 'Other']]
const BUCKET = 'job-files'
const MAX = 50 * 1024 * 1024 // Supabase's per-file limit on the standard plan

const sizeText = (n: number | null) => (n == null ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)
// a name that is safe as a storage path (the proper name is kept on the record)
const safeName = (s: string) => s.normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').slice(-80) || 'file'
const guess = (name: string, mime: string): JobFile['category'] => (mime.startsWith('image/') ? 'photo' : /\.(dwg|dxf|rvt|ifc)$/i.test(name) ? 'drawing' : 'other')
const icon = (f: JobFile) => (f.mime?.startsWith('image/') ? '🖼' : f.mime === 'application/pdf' ? '📄' : f.category === 'drawing' ? '📐' : '📎')

export default function FilesTab({ job }: { job: Job }) {
  const { can, profile } = useAuth()
  const files = useLiveQuery(async () => ((await db().job_files.where('job_id').equals(job.id).filter((r) => !r.deleted_at).toArray()) as unknown as JobFile[]).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))), [job.id])
  const edit = can('jobs.edit')
  const [cat, setCat] = useState<'all' | JobFile['category']>('all')
  const [addAs, setAddAs] = useState<'auto' | JobFile['category']>('auto')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const pick = useRef<HTMLInputElement>(null)
  if (!can('jobs.view')) return <div className="card"><p className="muted">You do not have access to jobs.</p></div>
  if (!files) return <p className="muted">Loading…</p>

  async function add(list: FileList | null) {
    if (!list?.length) return
    setErr('')
    if (!navigator.onLine) return setErr('You are offline. Files can only be added when you have a connection.')
    const failed: string[] = []
    for (const f of Array.from(list)) {
      setBusy(`Adding ${f.name}…`)
      if (f.size > MAX) { failed.push(`${f.name} is over 50 MB`); continue }
      const id = newId()
      const path = `${job.id}/${id}-${safeName(f.name)}`
      const up = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type || 'application/octet-stream', upsert: false })
      if (up.error) { failed.push(`${f.name}: ${up.error.message}`); continue }
      await save('job_files', id, { job_id: job.id, name: f.name, category: addAs === 'auto' ? guess(f.name, f.type) : addAs, path, size_bytes: f.size, mime: f.type || null, created_by: profile?.id ?? null })
    }
    setBusy('')
    if (failed.length) setErr(`Not added: ${failed.join('; ')}`)
    if (pick.current) pick.current.value = ''
  }

  async function view(f: JobFile) {
    setErr('')
    // opened in a new tab; the address is private and stops working after an hour
    const w = window.open('', '_blank')
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(f.path, 3600, { download: false })
    if (error || !data?.signedUrl) { w?.close(); return setErr(navigator.onLine ? `Could not open it: ${error?.message ?? 'not found'}` : 'You are offline. Files open when you have a connection.') }
    if (w) w.location.href = data.signedUrl
    else window.location.href = data.signedUrl
  }
  async function del(f: JobFile) {
    if (!confirm(`Delete ${f.name}?`)) return
    await remove('job_files', f.id)
    if (navigator.onLine) void supabase.storage.from(BUCKET).remove([f.path])
    setOpen(null)
  }

  const shown = files.filter((f) => cat === 'all' || f.category === cat)
  return (
    <>
      {edit && (
        <div className="card">
          <h2>Add files</h2>
          <label htmlFor="fa">Put them under</label>
          <select id="fa" value={addAs} onChange={(e) => setAddAs(e.target.value as typeof addAs)}>
            <option value="auto">Sort them for me</option>
            {CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <input ref={pick} type="file" multiple style={{ display: 'none' }} onChange={(e) => void add(e.target.files)} />
          <button className="btn primary" disabled={!!busy} onClick={() => pick.current?.click()}>{busy || '+ Add files'}</button>
          <p className="muted small">PDFs, drawings, photos, anything up to 50 MB each. On a phone you can pick from Files, your photos, or take a photo.</p>
          {err && <p className="err" role="alert">{err}</p>}
        </div>
      )}
      {!edit && err && <p className="err" role="alert">{err}</p>}
      <div className="chips fit" role="group" aria-label="Filter">
        <button className={`chip seg ${cat === 'all' ? 'on' : ''}`} onClick={() => setCat('all')}>All</button>
        {CATS.map(([k, l]) => <button key={k} className={`chip seg ${cat === k ? 'on' : ''}`} onClick={() => setCat(k)}>{l}</button>)}
      </div>
      {!shown.length && <div className="card"><p className="muted">{files.length ? 'Nothing under this heading.' : 'No files on this job yet.'}</p></div>}
      {shown.map((f) => (
        <div className="card" key={f.id}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button type="button" className="linklike" style={{ flex: 1, textAlign: 'left', minWidth: 0 }} onClick={() => view(f)}>
              <span aria-hidden>{icon(f)}</span> <strong style={{ wordBreak: 'break-word' }}>{f.name}</strong><br />
              <span className="muted small">{CATS.find(([k]) => k === f.category)?.[1]} · {sizeText(f.size_bytes)} · {fmtDate(f.created_at)}</span>
            </button>
            {edit && <button type="button" className="btn" style={{ width: 'auto', marginTop: 0 }} aria-expanded={open === f.id} onClick={() => setOpen(open === f.id ? null : f.id)}>⋯</button>}
          </div>
          {open === f.id && (
            <div style={{ marginTop: 8 }}>
              <label htmlFor={'fn' + f.id}>Name</label>
              <input id={'fn' + f.id} type="text" defaultValue={f.name} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== f.name && save('job_files', f.id, { name: e.target.value.trim() })} />
              <label htmlFor={'fc' + f.id}>Heading</label>
              <select id={'fc' + f.id} value={f.category} onChange={(e) => save('job_files', f.id, { category: e.target.value })}>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <label htmlFor={'fo' + f.id}>Note</label>
              <input id={'fo' + f.id} type="text" defaultValue={f.notes ?? ''} placeholder="e.g. Rev C, issued 12 Nov" onBlur={(e) => e.target.value.trim() !== (f.notes ?? '') && save('job_files', f.id, { notes: e.target.value.trim() || null })} />
              <button className="btn" onClick={() => del(f)}>Delete file</button>
            </div>
          )}
          {f.notes && open !== f.id && <p className="muted small" style={{ margin: '6px 0 0' }}>{f.notes}</p>}
        </div>
      ))}
    </>
  )
}
