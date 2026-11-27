import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabaseUrl } from '../lib/supabase'
import { useXeroStatus, xeroCall } from '../lib/xero/xero'

export default function XeroSettings() {
  const { can } = useAuth()
  const status = useXeroStatus()
  const [params] = useSearchParams()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(params.get('error') ?? '')
  const [gone, setGone] = useState(false)
  if (!can('settings')) return <><h1>Xero</h1><p className="muted">Only someone with the Settings permission can change this.</p></>
  const connected = (status?.connected && !gone) || params.get('connected') === '1'

  async function connect() {
    setBusy(true); setErr('')
    const r = await xeroCall({ action: 'connect' })
    if (r.ok && r.url) window.location.href = r.url
    else { setErr(r.detail ?? 'Could not start the connection.'); setBusy(false) }
  }
  async function disconnect() {
    if (!confirm('Disconnect Xero? Invoices already sent stay in Xero. New ones will not be sent until you connect again.')) return
    setBusy(true); setErr('')
    const r = await xeroCall({ action: 'disconnect' })
    if (r.ok) { setGone(true); try { localStorage.removeItem('gw-xero') } catch { /* ignore */ } } else setErr(r.detail ?? 'Could not disconnect.')
    setBusy(false)
  }
  return (
    <>
      <p><Link to="/more">← More</Link></p>
      <h1>Xero</h1>
      <div className="card">
        {connected ? <p><strong>Connected</strong>{status?.tenant ? ` to ${status.tenant}` : ''}. Applications and invoices can be sent to Xero from the job's Applications tab, and payments made in Xero come back automatically when you check.</p>
          : <p>Xero is not connected. Connect it once, and applications and invoices can be sent to Xero as sales invoices with one tap.</p>}
        {err && <p className="err" role="alert">{err}</p>}
        {!connected && <button className="btn primary" onClick={connect} disabled={busy}>{busy ? 'Opening Xero…' : 'Connect to Xero'}</button>}
        {connected && <button className="btn" onClick={disconnect} disabled={busy}>Disconnect Xero</button>}
      </div>
      {!connected && (
        <div className="card">
          <h2>One-off setup (about ten minutes)</h2>
          <ol className="small">
            <li>In Xero, go to <strong>developer.xero.com</strong> then My Apps, then New app. Type: <strong>Web app</strong>. Company or application URL: <strong>https://gwired-app.web.app</strong>.</li>
            <li>Redirect URI: <strong style={{ wordBreak: 'break-all' }}>{supabaseUrl}/functions/v1/xero</strong></li>
            <li>Copy the app's <strong>Client id</strong> and create a <strong>Client secret</strong>.</li>
            <li>In Supabase, Edge Functions, <strong>xero</strong>, Secrets, add <strong>XERO_CLIENT_ID</strong>, <strong>XERO_CLIENT_SECRET</strong> and <strong>APP_URL</strong> (https://gwired-app.web.app).</li>
            <li>Come back here and tap Connect to Xero, sign in, and choose the G|Wired organisation.</li>
          </ol>
          <p className="muted small">Invoices arrive in Xero as <strong>drafts</strong> on your sales account 200, for the bookkeeper to check and approve. The tax types used are UK standard 20%, zero rate and domestic reverse charge.</p>
        </div>
      )}
    </>
  )
}
