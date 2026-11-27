import { useState } from 'react'
import { cachedCompany, loadCompany } from '../../lib/company'
import type { Job } from '../../lib/jobs'
import { useClients } from '../../lib/jobs'
import { getPhotoBlob, shrinkImage } from '../../lib/walkaround/photoStore'
import { buildSowPdf, buildSowXlsx, type SowInput, type SowPhoto } from '../../lib/walkaround/sow'
import type { Area, Element, Photo } from './WalkaroundTab'

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// hands the finished file to the phone's share sheet where there is one, otherwise downloads it
async function deliver(file: File) {
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: file.name }); return } catch (e) { if ((e as Error).name === 'AbortError') return }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export default function SowExport({ job, areas, elements, photos }: { job: Job; areas: Area[]; elements: Element[]; photos: Photo[] }) {
  const clients = useClients()
  const [showRates, setShowRates] = useState(true)
  const [withPhotos, setWithPhotos] = useState(true)
  const [busy, setBusy] = useState<'' | 'pdf' | 'xlsx'>('')
  const [err, setErr] = useState('')
  const [skipped, setSkipped] = useState(0)

  async function make(kind: 'pdf' | 'xlsx') {
    setBusy(kind)
    setErr('')
    setSkipped(0)
    try {
      const company = navigator.onLine ? await loadCompany() : cachedCompany()
      let logo: Uint8Array | null = null
      try {
        const res = await fetch('/brand/gwired-logo-full.png')
        if (res.ok) logo = new Uint8Array(await res.arrayBuffer())
      } catch { /* no logo */ }
      const client = clients?.find((c) => c.id === job.client_id) ?? null
      let missing = 0
      const sowAreas = await Promise.all(areas.map(async (a) => {
        const load = async (list: Photo[]) => {
          const out: SowPhoto[] = []
          if (!withPhotos) return out
          for (const p of list) {
            const full = await getPhotoBlob(p)
            if (!full) { missing += 1; continue }
            if (kind === 'pdf') { out.push({ blob: full, caption: p.caption }); continue }
            // Excel: a small copy keeps the file light
            try {
              const small = await shrinkImage(full, 700, 0.7)
              const bm = await createImageBitmap(small)
              out.push({ blob: small, caption: p.caption, width: bm.width, height: bm.height })
              bm.close()
            } catch { missing += 1 }
          }
          return out
        }
        const items = await Promise.all(elements.filter((e) => e.area_id === a.id).map(async (e) => ({ description: e.description, qty: e.qty, unit: e.unit, notes: e.notes, photos: await load(photos.filter((p) => p.element_id === e.id)) })))
        return { name: a.name, notes: a.notes, items, photos: await load(photos.filter((p) => p.area_id === a.id && !p.element_id)) }
      }))
      const input: SowInput = {
        company, job: { job_number: job.job_number, title: job.title, site_address: job.site_address },
        client: client ? { name: client.name, address: client.address } : null, areas: sowAreas, showRates, date: new Date(), logoPng: logo,
      }
      const stem = 'Scope of works ' + (job.job_number ?? 'draft')
      if (kind === 'pdf') await deliver(new File([(await buildSowPdf(input)) as BlobPart], stem + '.pdf', { type: 'application/pdf' }))
      else await deliver(new File([await buildSowXlsx(input)], stem + '.xlsx', { type: XLSX }))
      setSkipped(missing)
    } catch (e) {
      setErr((e as Error).message || 'Could not make the file.')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="card">
      <h2>Scope of works</h2>
      <p className="muted small">Made from the areas, notes, items and photos above. Send it out as a PDF, or as an Excel sheet for pricing.</p>
      <label className="check"><input type="checkbox" checked={showRates} onChange={(e) => setShowRates(e.target.checked)} /> Include blank Rate and Total columns for pricing</label>
      <label className="check"><input type="checkbox" checked={withPhotos} onChange={(e) => setWithPhotos(e.target.checked)} /> Include the photos (PDF and Excel)</label>
      {err && <p className="err" role="alert">{err}</p>}
      {skipped > 0 && <p className="warnbox" role="status">{skipped} photo{skipped === 1 ? ' was' : 's were'} left out because {skipped === 1 ? 'it is' : 'they are'} not on this device yet. Connect to the internet and try again.</p>}
      <button className="btn primary" onClick={() => make('pdf')} disabled={!!busy}>{busy === 'pdf' ? 'Making the PDF…' : 'Make PDF'}</button>
      <button className="btn" onClick={() => make('xlsx')} disabled={!!busy}>{busy === 'xlsx' ? 'Making the Excel file…' : 'Make Excel file'}</button>
      <p className="muted small">The estimate can bring these items in as sections and lines: open the job's Estimate tab and use "Bring in items from the walkaround".</p>
    </div>
  )
}
