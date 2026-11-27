// The public quote page a client opens from their link: no sign-in. Reads the frozen quote from the quote-portal function,
// shows it, and lets the client accept it.
import { useEffect, useState } from 'react'
import { supabaseUrl } from '../lib/supabase'
import { formatGBP } from '../lib/money'
import type { QuoteSnapshot } from '../lib/estimating/quoteView'

type State = 'open' | 'accepted' | 'replaced' | 'expired'
interface Payload { state: State; snapshot: Partial<QuoteSnapshot> & { company: QuoteSnapshot['company']; ref: string }; pdfUrl: string | null; accepted: { name: string; at: string } | null }

const fmt = (iso: string) => new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
const fmtAt = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })

export default function QuotePortal({ token, preview }: { token: string; preview: boolean }) {
  const [data, setData] = useState<Payload | null>(null)
  const [missing, setMissing] = useState(false)
  const [name, setName] = useState('')
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    document.title = 'Your quotation'
    void (async () => {
      try {
        const r = await fetch(`${supabaseUrl}/functions/v1/quote-portal?t=${encodeURIComponent(token)}${preview ? '&p=1' : ''}`)
        if (!r.ok) return setMissing(true)
        setData(await r.json())
      } catch { setErr('We could not load the quote. Please check your connection and refresh the page.') }
    })()
  }, [token, preview])

  async function accept() {
    setBusy(true); setErr('')
    try {
      const r = await fetch(`${supabaseUrl}/functions/v1/quote-portal`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: token, action: 'accept', name }) })
      const j = await r.json().catch(() => ({}))
      if (r.ok && data) setData({ ...data, state: 'accepted', accepted: j.accepted })
      else if (j.error === 'accepted') setData(data && { ...data, state: 'accepted' })
      else if (j.error === 'expired' || j.error === 'replaced') setData(data && { ...data, state: j.error })
      else setErr(j.error === 'name_needed' ? 'Please type your full name.' : 'Sorry, that did not work. Please try again.')
    } catch { setErr('Sorry, that did not work. Please check your connection and try again.') }
    setBusy(false)
  }

  if (missing) return <Shell><div className="card"><h1>Quote not found</h1><p>This link is not working. It may have been replaced or switched off. Please contact the company that sent it to you.</p></div></Shell>
  if (!data) return <Shell>{err ? <div className="card"><p className="err">{err}</p></div> : <p className="muted" style={{ textAlign: 'center' }}>Loading your quotation…</p>}</Shell>

  const s = data.snapshot
  const co = s.company
  const contact = (
    <p className="small muted">
      {co.phone && <>Phone <a href={`tel:${co.phone.replace(/\s/g, '')}`}>{co.phone}</a></>}{co.phone && co.email && ' · '}{co.email && <>Email <a href={`mailto:${co.email}`}>{co.email}</a></>}
    </p>
  )

  if (data.state === 'replaced') return (
    <Shell company={co}>
      <div className="card"><h1>This quotation has been replaced</h1><p>A newer version of quotation {s.ref} has been issued, so this one can no longer be accepted. Please contact us for the latest.</p>{contact}</div>
    </Shell>
  )

  return (
    <Shell company={co}>
      {preview && <div className="card notice"><p style={{ margin: 0 }}><strong>Preview.</strong> This is what your client sees. Opening it here is not counted as a view.</p></div>}
      <div className="card">
        <p className="muted small" style={{ margin: 0 }}>QUOTATION</p>
        <h1 style={{ margin: '2px 0 6px' }}>{s.job?.title}</h1>
        <p className="small" style={{ margin: 0 }}>Ref <strong>{s.ref}</strong> · {fmt(s.date!)}{data.state === 'expired' ? ' · expired ' : ' · valid until '}{fmt(s.validUntil!)}</p>
        {s.client && <p className="small" style={{ margin: '10px 0 0' }}>Prepared for <strong>{s.client.name}</strong>{s.client.address ? <><br />{s.client.address.split('\n').map((l, i) => <span key={i}>{l}<br /></span>)}</> : null}</p>}
        {s.job?.site_address && <p className="small" style={{ margin: '10px 0 0' }}>Site: {s.job.site_address}</p>}
        {data.pdfUrl && <p style={{ margin: '12px 0 0' }}><a className="btn" href={data.pdfUrl} target="_blank" rel="noreferrer">Download as PDF</a></p>}
      </div>

      {data.state === 'accepted' && (
        <div className="card notice"><h2 style={{ margin: 0 }}>Accepted ✓</h2><p style={{ marginBottom: 0 }}>{data.accepted ? <>Accepted by <strong>{data.accepted.name}</strong> on {fmtAt(data.accepted.at)}. </> : 'This quotation has been accepted. '}Thank you. We will be in touch to arrange the start.</p></div>
      )}
      {data.state === 'expired' && (
        <div className="card notice"><h2 style={{ margin: 0 }}>This quotation has expired</h2><p style={{ marginBottom: 0 }}>Please contact us and we will confirm the price is still valid.</p>{contact}</div>
      )}

      {s.sections?.map((sec) => (
        <div className="card" key={sec.code}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <h2 style={{ margin: 0 }}>{sec.code}. {sec.name}</h2>
            <strong>{formatGBP(sec.total)}</strong>
          </div>
          {sec.lines.map((l) => (
            <div key={l.ref} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderTop: '1px solid #e5e5e8' }}>
              <div style={{ minWidth: 0 }}>
                <div>{l.description}</div>
                <div className="muted small">{l.qty} {l.unit} at {formatGBP(l.rate)}</div>
                {l.notes && <div className="muted small">{l.notes}</div>}
              </div>
              <div style={{ whiteSpace: 'nowrap' }}>{formatGBP(l.amount)}</div>
            </div>
          ))}
        </div>
      ))}

      <div className="card">
        <Row label="Total excluding VAT" v={formatGBP(s.net!)} />
        {s.reverse_charge
          ? <p className="muted small" style={{ margin: '6px 0 0' }}>VAT: domestic reverse charge applies. The customer must account for the VAT due on these works to HMRC.</p>
          : <><Row label={`VAT at ${s.vat_rate}%`} v={formatGBP(s.vat!)} /><Row label="Total to pay" v={formatGBP(s.total!)} big /></>}
      </div>

      {!!s.assumptions?.length && <List title="Assumptions" items={s.assumptions} />}
      {!!s.exclusions?.length && <List title="Exclusions" items={s.exclusions} />}
      {!!s.notes?.length && <div className="card"><h2>Notes and terms</h2>{s.notes.map((n, i) => <p key={i} className="small" style={{ whiteSpace: 'pre-wrap' }}>{n}</p>)}</div>}

      {data.state === 'open' && !preview && (
        <div className="card">
          <h2>Accept this quotation</h2>
          <p className="small">To go ahead, type your full name and tap Accept. We record your name, the date and time as your acceptance of quotation <strong>{s.ref}</strong> for <strong>{formatGBP(s.total!)}</strong>{s.reverse_charge ? ' (no VAT, reverse charge)' : ' including VAT'}.</p>
          <label htmlFor="pn">Your full name</label>
          <input id="pn" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 12 }}>
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ width: 'auto', marginTop: 3 }} />
            <span className="small">I accept this quotation, including its assumptions, exclusions and terms, and I am authorised to accept it.</span>
          </label>
          {err && <p className="err" role="alert">{err}</p>}
          <button className="btn primary" onClick={accept} disabled={busy || name.trim().length < 2 || !agree}>{busy ? 'Accepting…' : 'Accept quotation'}</button>
          <p className="muted small">Questions first? Contact us before accepting.</p>
          {contact}
        </div>
      )}
      {data.state === 'open' && preview && <div className="card"><p className="muted small" style={{ margin: 0 }}>The Accept box appears here for the client. It is hidden in the preview so it cannot be pressed by mistake.</p></div>}
    </Shell>
  )
}

function Shell({ company, children }: { company?: QuoteSnapshot['company']; children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 16px 48px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '4px 0 12px' }}>
        <img src="/brand/gwired-logo-full.png" alt="" style={{ height: 44, maxWidth: '55%', objectFit: 'contain' }} onError={(e) => { e.currentTarget.style.display = 'none' }} />
        <div className="small" style={{ textAlign: 'right' }}><strong>{company?.name}</strong>{company?.vat_number ? <><br />VAT no. {company.vat_number}</> : null}</div>
      </div>
      {children}
    </div>
  )
}
const Row = ({ label, v, big }: { label: string; v: string; big?: boolean }) => <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontWeight: big ? 700 : 400, fontSize: big ? '1.15em' : undefined }}><span>{label}</span><span>{v}</span></div>
const List = ({ title, items }: { title: string; items: string[] }) => <div className="card"><h2>{title}</h2><ol className="small">{items.map((t, i) => <li key={i}>{t}</li>)}</ol></div>
