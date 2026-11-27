// "Send to Xero" for one application or invoice: shows whether it is already in Xero, and sends it (or updates it while it is still a draft there).
import { useState } from 'react'
import { XERO_WORDS, useXeroLink, useXeroStatus, xeroCall } from '../../lib/xero/xero'
import { formatGBP } from '../../lib/money'

export interface XeroSend {
  kind: 'application' | 'invoice'; id: string; client_id: string | null
  net_pence: number; vat_rate: number; reverse_charge: boolean
  date: string; due_date: string; reference: string; description: string
}

export default function XeroPanel({ send, ready }: { send: XeroSend; ready: boolean }) {
  const status = useXeroStatus()
  const link = useXeroLink(send.id)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  if (!status?.connected) return null

  const inXero = !!link?.xero_invoice_id
  const locked = inXero && link?.xero_status !== 'DRAFT'

  async function go() {
    setBusy(true); setMsg(null)
    const r = await xeroCall({ action: 'send', ...send })
    setMsg(r.ok ? { ok: true, text: `Sent to Xero${r.number ? ' as ' + r.number : ''} (${(XERO_WORDS[r.status ?? ''] ?? r.status ?? '').toLowerCase()}).` } : { ok: false, text: r.detail ?? 'Xero did not accept it.' })
    setBusy(false)
  }
  async function check() {
    setBusy(true); setMsg(null)
    const r = await xeroCall({ action: 'refresh' })
    setMsg(r.ok ? { ok: true, text: r.paid ? `${r.paid} marked as paid from Xero.` : 'Checked Xero: nothing new paid.' } : { ok: false, text: r.detail ?? 'Could not check Xero.' })
    setBusy(false)
  }
  return (
    <div className="card" style={{ background: 'var(--grey-1, #f4f4f6)', margin: '12px 0' }}>
      <h3 style={{ margin: '0 0 4px' }}>Xero</h3>
      {inXero ? (
        <p style={{ margin: '4px 0' }}>
          <strong>{link?.xero_number ?? 'Invoice'}</strong> · {XERO_WORDS[link?.xero_status ?? ''] ?? link?.xero_status}
          {link?.total_pence != null && <span className="muted small"> · {formatGBP(link.total_pence)}{link.paid_pence ? `, ${formatGBP(link.paid_pence)} paid` : ''}</span>}
        </p>
      ) : <p className="muted small" style={{ margin: '4px 0' }}>Not in Xero yet. It is sent as an invoice for {formatGBP(send.net_pence)} plus VAT{send.reverse_charge ? ' (reverse charge)' : ''}, to {status.tenant ?? 'your Xero'}.</p>}
      {link?.last_error && <p className="err" role="alert">{link.last_error}</p>}
      {!ready && <p className="muted small">Mark it as issued first, then send it to Xero.</p>}
      {msg && <p className={msg.ok ? 'ok' : 'err'} role="status">{msg.text}</p>}
      {ready && !locked && <button className="btn primary" disabled={busy || send.net_pence <= 0} onClick={go}>{busy ? 'Working…' : inXero ? 'Update the draft in Xero' : 'Send to Xero'}</button>}
      {locked && <p className="muted small">It has moved on in Xero, so change it there.</p>}
      {inXero && link?.xero_status !== 'PAID' && <button className="btn" disabled={busy} onClick={check}>Check for payment in Xero</button>}
    </div>
  )
}
