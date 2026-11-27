// "Client link" card on an issued quote: makes the private web address the client opens (no sign-in) to read, download and accept it.
import { useState } from 'react'
import { fmtDateTime, useClients, type Job } from '../../lib/jobs'
import { cachedCompany, loadCompany } from '../../lib/company'
import { buildQuotePdf } from '../../lib/estimating/quotePdf'
import { buildQuoteSnapshot } from '../../lib/estimating/quoteView'
import { createQuoteLink, linkUrl, revokeQuoteLink, useQuoteLinks } from '../../lib/estimating/quoteLinks'
import { revLetter } from '../../lib/estimating/estimate'
import type { EstClause, Estimate, Line, Section } from '../../lib/estimating/estimates'

export default function ClientLink({ job, est, sections, lines, clauses, canEdit }: { job: Job; est: Estimate; sections: Section[]; lines: Line[]; clauses: EstClause[]; canEdit: boolean }) {
  const clients = useClients()
  const { links, err, reload } = useQuoteLinks(est.id)
  const [detail, setDetail] = useState<'lines' | 'sections'>('lines')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [copied, setCopied] = useState('')
  const live = (links ?? []).filter((l) => !l.revoked_at)

  async function make() {
    if (!navigator.onLine) return setMsg('You need to be online to make a client link.')
    setBusy(true); setMsg('')
    try {
      const company = await loadCompany().catch(() => cachedCompany())
      const client = clients?.find((c) => c.id === job.client_id) ?? null
      const input = {
        company, job: { job_number: job.job_number, title: job.title, site_address: job.site_address },
        client: client ? { name: client.name, address: client.address } : null, estimate: est, sections, lines, clauses, detail, date: est.issued_at ? new Date(est.issued_at) : new Date(),
      }
      let logo: Uint8Array | null = null
      try { const r = await fetch('/brand/gwired-logo-full.png'); if (r.ok) logo = new Uint8Array(await r.arrayBuffer()) } catch { /* no logo */ }
      const pdf = await buildQuotePdf({ ...input, logoPng: logo })
      const e = await createQuoteLink({ estimateId: est.id, jobId: job.id, snapshot: buildQuoteSnapshot(input), pdf })
      if (e) setMsg(e)
      await reload()
    } catch (e) { setMsg((e as Error).message || 'Could not make the link.') }
    setBusy(false)
  }
  async function share(token: string) {
    const url = linkUrl(token)
    const text = `Your quotation ${job.job_number ?? ''}${est.rev > 1 ? ' rev ' + revLetter(est.rev) : ''} from ${cachedCompany().name}`
    if (navigator.share) { try { await navigator.share({ title: text, text, url }); return } catch (e) { if ((e as Error).name === 'AbortError') return } }
    try { await navigator.clipboard.writeText(url); setCopied(token); setTimeout(() => setCopied(''), 3000) } catch { setMsg(url) }
  }
  async function revoke(id: string) {
    if (!confirm('Stop this link working? Anyone who has it will see "not found".')) return
    const e = await revokeQuoteLink(id); if (e) setMsg(e); await reload()
  }

  return (
    <div className="card">
      <h2>Client link</h2>
      <p className="muted small">A private web address for this quote. The client opens it on any phone or computer, with no login, reads the quote, downloads the PDF and taps Accept. It shows the quote exactly as issued, so later changes never alter it.</p>
      {err && <p className="err" role="alert">{err}</p>}
      {msg && <p className="err" role="alert">{msg}</p>}
      {live.map((l) => (
        <div key={l.id} style={{ margin: '12px 0', paddingTop: 10, borderTop: '1px solid var(--line, #ddd)' }}>
          <p style={{ margin: 0 }}>
            {l.accepted_at ? <strong>Accepted by {l.accepted_name} on {fmtDateTime(l.accepted_at)}</strong>
              : l.view_count ? <strong>Opened {l.view_count} time{l.view_count === 1 ? '' : 's'}</strong> : <strong>Not opened yet</strong>}
          </p>
          <p className="muted small" style={{ margin: '2px 0 6px' }}>Made {fmtDateTime(l.created_at)}{l.last_viewed_at ? ` · last opened ${fmtDateTime(l.last_viewed_at)}` : ''}</p>
          <p className="small" style={{ wordBreak: 'break-all', margin: '0 0 6px' }}>{linkUrl(l.token)}</p>
          <div className="actions tight">
            <button className="btn primary" onClick={() => share(l.token)}>{copied === l.token ? 'Copied' : 'Send or copy link'}</button>
            <a className="btn" href={linkUrl(l.token, true)} target="_blank" rel="noreferrer">Preview</a>
            {canEdit && !l.accepted_at && <button className="btn" onClick={() => revoke(l.id)}>Stop link</button>}
          </div>
        </div>
      ))}
      {canEdit && est.status === 'issued' && !live.length && (
        <>
          <label htmlFor="cld">What the client sees</label>
          <select id="cld" value={detail} onChange={(e) => setDetail(e.target.value as 'lines' | 'sections')}>
            <option value="lines">Every line with quantities and prices</option>
            <option value="sections">Section totals only</option>
          </select>
          <button className="btn primary" onClick={make} disabled={busy || !lines.length}>{busy ? 'Making…' : 'Make client link'}</button>
        </>
      )}
    </div>
  )
}
