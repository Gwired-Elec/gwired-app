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
      {/* The setup steps always stay here, so they can be followed again if the connection fails or has to be redone */}
      <details className="card" open={!connected || !!err}>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Setup steps (follow these again if the connection fails)</summary>
        <h3 style={{ margin: '12px 0 4px' }}>1. Create the Xero app (once)</h3>
        <ol className="small">
          <li>In Xero, go to <strong>developer.xero.com</strong>, then My Apps, then New app.</li>
          <li>App type: <strong>Web app</strong>. Company or application URL: <strong>https://gwired-app.web.app</strong>.</li>
          <li>Redirect URI (copy it exactly): <strong style={{ wordBreak: 'break-all' }}>{supabaseUrl}/functions/v1/xero</strong></li>
          <li>Open the app's <strong>Configuration</strong> page. Copy the <strong>Client id</strong>, then choose <strong>Generate a secret</strong> and copy it straight away (Xero only shows it once).</li>
        </ol>
        <h3 style={{ margin: '12px 0 4px' }}>2. Put the Xero details into Supabase</h3>
        <ol className="small">
          <li>Supabase, Edge Functions, <strong>xero</strong>, then Secrets.</li>
          <li>Add <strong>XERO_CLIENT_ID</strong> (the Client id), <strong>XERO_CLIENT_SECRET</strong> (the secret) and <strong>APP_URL</strong> (<strong>https://gwired-app.web.app</strong>).</li>
          <li>Check the function is deployed with <strong>Verify JWT switched off</strong>.</li>
        </ol>
        <h3 style={{ margin: '12px 0 4px' }}>3. Connect</h3>
        <ol className="small">
          <li>Tap <strong>Connect to Xero</strong> above, sign in to Xero, and choose the G|Wired organisation.</li>
          <li>You come back to this page and it says Connected.</li>
        </ol>
        <h3 style={{ margin: '12px 0 4px' }}>If it fails</h3>
        <ul className="small">
          <li><strong>Xero says the redirect address does not match:</strong> the Redirect URI in the Xero app must be exactly the one shown above, with nothing added or missing.</li>
          <li><strong>"Not set up on the server yet":</strong> the secrets in step 2 are missing or misspelt. Add them again, then retry.</li>
          <li><strong>"Refused the sign-in" or an invalid client message:</strong> the Client id or secret was copied wrongly. Generate a new secret in Xero, update XERO_CLIENT_SECRET, and retry.</li>
          <li><strong>"Couldn't reach the Xero service":</strong> check you are online and that the <strong>xero</strong> function is deployed (name must be exactly xero).</li>
          <li><strong>The page just shows an error after signing in to Xero:</strong> Verify JWT is probably still on. Turn it off for the function.</li>
          <li><strong>"Invalid scope":</strong> your Xero app needs different permission names. Tell the person who built the app which ones Xero lists, or set the secret <strong>XERO_SCOPES</strong>.</li>
          <li><strong>The link has expired:</strong> just tap Connect to Xero again.</li>
          <li>To start again from scratch, tap <strong>Disconnect Xero</strong>, then follow these steps from the top.</li>
        </ul>
        <p className="muted small">Invoices arrive in Xero as <strong>drafts</strong> on your sales account 200, for the bookkeeper to check and approve. The tax types used are UK standard 20%, zero rate and domestic reverse charge. If Xero rejects an invoice, the reason shows under the invoice in the app.</p>
      </details>
    </>
  )
}
