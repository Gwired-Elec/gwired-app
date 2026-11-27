// Full-screen photo tools for the walkaround:
//  - ReviewQueue: right after taking photos. Each one is shown big; tick (top right) keeps it, the pen marks it up first.
//  - PhotoViewer: tap a thumbnail later. X (top right) deletes it, the pen marks it up, "Close" goes back.
//  - MarkupEditor: draw on the picture (finger or Apple Pencil, which draws thicker when pressed harder), pick a colour, undo.
import { useEffect, useMemo, useRef, useState } from 'react'
import { remove, save } from '../../lib/sync/store'
import { getPhotoBlob, markUpPhoto, removeMarkup, shrinkImage, uploadPendingPhotos, usePhotoUrl } from '../../lib/walkaround/photoStore'
import type { Photo } from './WalkaroundTab'

const COLOURS = ['#ef2b2b', '#ffd60a', '#ffffff', '#111111', '#2f7bff']
type Pt = [number, number, number] // x, y, pressure
interface Stroke { colour: string; size: number; pts: Pt[] }

const Pen = () => <span aria-hidden="true">✏️</span>

// lock the page behind a full-screen tool so it does not scroll
function useLockScroll() {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
}

// ---------------------------------------------------------------- drawing on a picture
export function MarkupEditor({ blob, onDone, onCancel }: { blob: Blob; onDone: (b: Blob) => void; onCancel: () => void }) {
  useLockScroll()
  const canvas = useRef<HTMLCanvasElement>(null)
  const bmp = useRef<ImageBitmap | null>(null)
  const strokes = useRef<Stroke[]>([])
  const live = useRef<Stroke | null>(null)
  const penSeen = useRef(false)
  const [colour, setColour] = useState(COLOURS[0])
  const [thick, setThick] = useState(false)
  const [count, setCount] = useState(0)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)

  const base = () => (bmp.current ? Math.max(4, bmp.current.width / 170) : 8) // line width scales with the picture size

  function paint() {
    const c = canvas.current, b = bmp.current
    if (!c || !b) return
    const g = c.getContext('2d')!
    g.drawImage(b, 0, 0)
    g.lineCap = 'round'
    g.lineJoin = 'round'
    const all = live.current ? [...strokes.current, live.current] : strokes.current
    for (const s of all) {
      g.strokeStyle = s.colour
      g.fillStyle = s.colour
      if (s.pts.length === 1) { g.beginPath(); g.arc(s.pts[0][0], s.pts[0][1], (s.size * s.pts[0][2]) / 2, 0, Math.PI * 2); g.fill(); continue }
      for (let i = 1; i < s.pts.length; i++) {
        g.lineWidth = s.size * ((s.pts[i][2] + s.pts[i - 1][2]) / 2)
        g.beginPath(); g.moveTo(s.pts[i - 1][0], s.pts[i - 1][1]); g.lineTo(s.pts[i][0], s.pts[i][1]); g.stroke()
      }
    }
  }

  useEffect(() => {
    let dead = false
    void createImageBitmap(blob).then((b) => {
      if (dead) return
      bmp.current = b
      const c = canvas.current!
      c.width = b.width
      c.height = b.height
      setReady(true)
      paint()
    })
    return () => { dead = true; bmp.current?.close() }
  }, [blob]) // eslint-disable-line react-hooks/exhaustive-deps

  const at = (x: number, y: number, type: string, pressure: number): Pt => {
    const c = canvas.current!
    const r = c.getBoundingClientRect()
    // a pen sends real pressure; a finger or mouse gives a steady line
    const p = type === 'pen' && pressure > 0 ? 0.45 + pressure * 1.1 : 1
    return [((x - r.left) / r.width) * c.width, ((y - r.top) / r.height) * c.height, p]
  }
  const down = (e: React.PointerEvent) => {
    if (e.pointerType === 'pen') penSeen.current = true
    if (penSeen.current && e.pointerType === 'touch') return // resting palm while using the Pencil
    e.preventDefault()
    canvas.current!.setPointerCapture(e.pointerId)
    live.current = { colour, size: base() * (thick ? 2.2 : 1), pts: [at(e.clientX, e.clientY, e.pointerType, e.pressure)] }
    paint()
  }
  const move = (e: React.PointerEvent) => {
    if (!live.current) return
    // every sample the pen or finger reported since the last frame, so fast strokes stay smooth
    const evs = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? []
    if (evs.length) for (const ce of evs) live.current.pts.push(at(ce.clientX, ce.clientY, e.pointerType, ce.pressure))
    else live.current.pts.push(at(e.clientX, e.clientY, e.pointerType, e.pressure))
    paint()
  }
  const up = () => {
    if (!live.current) return
    strokes.current.push(live.current)
    live.current = null
    setCount(strokes.current.length)
    paint()
  }
  const undo = () => { strokes.current.pop(); setCount(strokes.current.length); paint() }
  async function done() {
    setBusy(true)
    live.current = null
    paint()
    const out = await new Promise<Blob | null>((res) => canvas.current!.toBlob(res, 'image/jpeg', 0.85))
    if (out) onDone(out); else setBusy(false)
  }

  return (
    <div className="pe" role="dialog" aria-label="Mark up photo">
      <div className="pe-bar">
        <button type="button" className="pe-btn" onClick={onCancel} aria-label="Cancel markup">✕</button>
        <button type="button" className="pe-btn" onClick={undo} disabled={!count} aria-label="Undo last mark">↶</button>
        <div className="pe-sw" role="group" aria-label="Colour">
          {COLOURS.map((c) => <button key={c} type="button" aria-label={'Colour ' + c} aria-pressed={c === colour} className={'pe-dot' + (c === colour ? ' on' : '')} style={{ background: c }} onClick={() => setColour(c)} />)}
        </div>
        <button type="button" className="pe-btn" aria-pressed={thick} onClick={() => setThick((t) => !t)} aria-label="Thicker pen">{thick ? '●' : '•'}</button>
        <button type="button" className="pe-btn ok" onClick={done} disabled={busy || !ready} aria-label="Save markup">✓</button>
      </div>
      <div className="pe-stage">
        <canvas ref={canvas} className="pe-canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- right after taking photos
// onAccept gets the picture to keep and, if it was marked up, the untouched one too
export function ReviewQueue({ files, onAccept, onDone }: { files: (File | Blob)[]; onAccept: (b: Blob, original?: Blob) => Promise<void> | void; onDone: () => void }) {
  useLockScroll()
  const [i, setI] = useState(0)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [marking, setMarking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  // shrink the next picture so it is quick to show
  useEffect(() => {
    let dead = false
    setBlob(null); setErr('')
    shrinkImage(files[i]).then((b) => { if (!dead) setBlob(b) }, () => { if (!dead) setErr('That picture could not be read.') })
    return () => { dead = true }
  }, [files, i])

  const next = () => (i + 1 >= files.length ? onDone() : setI(i + 1))
  async function accept(b: Blob, original?: Blob) {
    setBusy(true)
    try { await onAccept(b, original) } finally { setBusy(false) }
    setMarking(false)
    next()
  }
  if (marking && blob) return <MarkupEditor blob={blob} onCancel={() => setMarking(false)} onDone={(b) => void accept(b, blob)} />
  return (
    <div className="pe" role="dialog" aria-label="Photo preview">
      <div className="pe-bar">
        <button type="button" className="pe-btn" onClick={next} aria-label="Discard this photo">✕</button>
        <span className="pe-title">{files.length > 1 ? `Photo ${i + 1} of ${files.length}` : 'Photo'}</span>
        <button type="button" className="pe-btn" onClick={() => setMarking(true)} disabled={!blob} aria-label="Mark up this photo"><Pen /></button>
        <button type="button" className="pe-btn ok" onClick={() => blob && void accept(blob)} disabled={!blob || busy} aria-label="Keep this photo">✓</button>
      </div>
      <div className="pe-stage">{url ? <img src={url} alt="Preview" className="pe-img" /> : <p className="pe-msg">{err || 'Loading…'}</p>}</div>
    </div>
  )
}

// ---------------------------------------------------------------- opening a saved photo
export function PhotoViewer({ photo, onClose }: { photo: Photo; onClose: () => void }) {
  useLockScroll()
  const url = usePhotoUrl(photo)
  const [marking, setMarking] = useState(false)
  const [src, setSrc] = useState<Blob | null>(null)
  const [removing, setRemoving] = useState(false)
  const [msg, setMsg] = useState('')
  const jobId = photo.path.split('/')[0]

  async function startMarkup() {
    // the picture as it is on this device (or fetched)
    const b = await getPhotoBlob(photo)
    if (b) { setSrc(b); setMarking(true) }
  }
  async function saveMarkup(b: Blob) {
    const fields = await markUpPhoto(photo, jobId, b)
    await save('walkaround_photos', photo.id, fields)
    void uploadPendingPhotos()
    setMarking(false)
  }
  if (marking && src) return <MarkupEditor blob={src} onCancel={() => setMarking(false)} onDone={(b) => void saveMarkup(b)} />
  return (
    <div className="pe" role="dialog" aria-label="Photo">
      <div className="pe-bar">
        <button type="button" className="pe-btn wide" onClick={onClose}>‹ Close</button>
        <span className="pe-title" />
        <button type="button" className="pe-btn" onClick={() => void startMarkup()} disabled={!url} aria-label="Mark up this photo"><Pen /></button>
        <button type="button" className="pe-btn" onClick={() => { if (confirm('Delete this photo?')) { void remove('walkaround_photos', photo.id); onClose() } }} aria-label="Delete this photo">✕</button>
      </div>
      <div className="pe-stage">{url ? <img src={url} alt={photo.caption || 'Site photo'} className="pe-img" /> : <p className="pe-msg">{url === null ? 'This photo is not on this device yet. Connect to the internet to load it.' : 'Loading…'}</p>}</div>
      <div className="pe-foot">
        {photo.original_path && (
          <button type="button" className="pe-btn wide" style={{ width: '100%', marginBottom: 8 }} disabled={removing}
            onClick={async () => { if (!confirm('Remove the markup and go back to the original photo?')) return; setRemoving(true); setMsg(''); const ok = await removeMarkup(photo); if (ok) { await save('walkaround_photos', photo.id, { path: photo.original_path, original_path: null }); void uploadPendingPhotos() } else setMsg('The original is not on this device yet. Connect to the internet and try again.'); setRemoving(false) }}>
            ↺ Remove markup (show the original)
          </button>
        )}
        {msg && <p className="err" role="alert">{msg}</p>}
        <input key={photo.caption ?? ''} type="text" defaultValue={photo.caption ?? ''} placeholder="Caption (optional)" aria-label="Photo caption" onBlur={(e) => e.target.value !== (photo.caption ?? '') && save('walkaround_photos', photo.id, { caption: e.target.value.trim() || null })} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- the in-app camera
// A live camera inside the app, so a photo goes straight to the tick / pen screen with no separate "Use Photo" step from the
// phone's own camera screen. After each one you are back at the camera for the next. If the camera cannot be opened (no
// permission, an old browser), the phone's own camera / photo picker is used instead.
function Camera({ onShot, onClose, onLibrary, kept }: { onShot: (b: Blob) => void; onClose: () => void; onLibrary: () => void; kept: number }) {
  useLockScroll()
  const video = useRef<HTMLVideoElement>(null)
  const [err, setErr] = useState('')
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let dead = false
    let stream: MediaStream | null = null
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false }).then((st) => {
      if (dead) { st.getTracks().forEach((t) => t.stop()); return }
      stream = st
      if (video.current) { video.current.srcObject = st; void video.current.play() }
      setReady(true)
    }, () => { if (!dead) setErr('The camera could not be opened. Allow camera access for this site in your phone settings, or use the button below to pick from your photos.') })
    return () => { dead = true; stream?.getTracks().forEach((t) => t.stop()) }
  }, [])
  const snap = () => {
    const v = video.current
    if (!v || !v.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    c.getContext('2d')!.drawImage(v, 0, 0)
    c.toBlob((b) => b && onShot(b), 'image/jpeg', 0.92)
  }
  return (
    <div className="pe" role="dialog" aria-label="Camera">
      <div className="pe-bar">
        <button type="button" className="pe-btn wide" onClick={onClose}>{kept ? `Done (${kept})` : '✕ Close'}</button>
        <span className="pe-title" />
      </div>
      <div className="pe-stage">
        {err ? <p className="pe-msg">{err}</p> : <video ref={video} className="pe-img" playsInline muted autoPlay />}
      </div>
      <div className="cam-foot">
        <button type="button" className="pe-btn wide" onClick={onLibrary}>🖼 Library</button>
        <button type="button" className="cam-shutter" onClick={snap} disabled={!ready} aria-label="Take photo" />
        <span style={{ width: 90 }} />
      </div>
    </div>
  )
}

// The "Add photo" button for an item: opens the camera, shows each photo for a tick or the pen, and hands the kept ones back.
export function PhotoCapture({ busy, onKeep, canOpen }: { busy?: boolean; onKeep: (b: Blob, original?: Blob) => Promise<void> | void; canOpen?: () => boolean }) {
  const [open, setOpen] = useState(false)
  const [review, setReview] = useState<(File | Blob)[]>([])
  const [kept, setKept] = useState(0)
  const pick = useRef<HTMLInputElement>(null)
  const live = !!navigator.mediaDevices?.getUserMedia
  return (
    <>
      <button type="button" className="iconbtn" disabled={busy} style={{ opacity: busy ? 0.6 : 1 }} onClick={() => { if (canOpen && !canOpen()) return; if (live) { setKept(0); setOpen(true) } else pick.current?.click() }}>
        {busy ? 'Adding…' : '📷 Add photo'}
      </button>
      <input ref={pick} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ''; if (fs.length) setReview(fs) }} />
      {open && <Camera kept={kept} onShot={(b) => setReview([b])} onClose={() => setOpen(false)} onLibrary={() => pick.current?.click()} />}
      {review.length > 0 && <ReviewQueue files={review} onAccept={async (b, o) => { await onKeep(b, o); setKept((k) => k + 1) }} onDone={() => setReview([])} />}
    </>
  )
}
