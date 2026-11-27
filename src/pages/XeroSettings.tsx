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
        <p className="muted small" style={{ marginTop: 8 }}>You need three things open at once: this app, the Xero developer website, and Supabase. It takes about ten minutes and you only do it once. Keep this page open and work through the steps in order.</p>

        <h3 style={{ margin: '14px 0 4px' }}>Part 1: Make the app in Xero</h3>
        <ol className="small">
          <li>Open a new browser tab and go to <strong>developer.xero.com</strong>.</li>
          <li>Click <strong>Log in</strong> (top right) and sign in with the same email and password you use for Xero.</li>
          <li>Click <strong>My Apps</strong>, then the blue <strong>New app</strong> button.</li>
          <li><strong>App name:</strong> type <strong>G|Wired</strong> (or anything you will recognise).</li>
          <li><strong>Integration type:</strong> choose <strong>Web app</strong>.</li>
          <li><strong>Company or application URL:</strong> type <strong>https://gwired-app.web.app</strong></li>
          <li><strong>Redirect URI:</strong> copy this and paste it in exactly, with nothing before or after it:<br /><strong style={{ wordBreak: 'break-all' }}>{supabaseUrl}/functions/v1/xero</strong></li>
          <li>Tick the box to accept Xero's terms, then click <strong>Create app</strong>.</li>
        </ol>

        <h3 style={{ margin: '14px 0 4px' }}>Part 2: Copy the two secret codes from Xero</h3>
        <ol className="small">
          <li>In Xero, click your new app, then click <strong>Configuration</strong> in the left-hand list.</li>
          <li>You will see <strong>Client id</strong>: a long mix of capital letters and numbers. Click the copy button next to it. This is your <strong>Client id</strong>.</li>
          <li>Click <strong>Generate a secret</strong>. A second long code appears. <strong>Copy it straight away</strong>, because Xero only shows it once. If you miss it, click Generate a secret again to get a new one. This is your <strong>Client secret</strong>.</li>
          <li>These are two different codes. Do not mix them up, and do not send either one to anyone by email or chat.</li>
        </ol>

        <h3 style={{ margin: '14px 0 4px' }}>Part 3: Put them into Supabase</h3>
        <ol className="small">
          <li>Open Supabase in another tab and open the G|Wired project.</li>
          <li>In the left-hand menu click <strong>Edge Functions</strong>, then <strong>Secrets</strong> (you may need to click the function called <strong>xero</strong> first).</li>
          <li>You will see an <strong>Add or replace secrets</strong> box with a <strong>Name</strong> box and a <strong>Value</strong> box. Fill it in like this, clicking <strong>Add another</strong> for each new row:
            <ul>
              <li>Name: <strong>XERO_CLIENT_ID</strong> &nbsp; Value: the Client id you copied.</li>
              <li>Name: <strong>XERO_CLIENT_SECRET</strong> &nbsp; Value: the Client secret you copied.</li>
              <li>Name: <strong>APP_URL</strong> &nbsp; Value: <strong>https://gwired-app.web.app</strong></li>
            </ul>
          </li>
          <li>Type the names in capitals exactly as shown, and paste the values with no quote marks and no spaces at either end. Then click <strong>Save</strong>.</li>
          <li>Supabase hides secrets after saving. That is normal.</li>
          <li>Check the <strong>xero</strong> function has been deployed, and that <strong>Verify JWT</strong> is switched <strong>off</strong> in its settings.</li>
        </ol>

        <h3 style={{ margin: '14px 0 4px' }}>Part 4: Connect</h3>
        <ol className="small">
          <li>Come back to this page and tap <strong>Connect to Xero</strong> at the top.</li>
          <li>Xero's own page opens. Sign in if it asks, and choose <strong>G|Wired Electrical Services</strong> from the list of organisations.</li>
          <li>Click <strong>Allow access</strong>.</li>
          <li>You are sent back here and it says <strong>Connected</strong>. That is it. You do not need to do any of this again.</li>
        </ol>

        <h3 style={{ margin: '14px 0 4px' }}>If it fails</h3>
        <ul className="small">
          <li><strong>Xero says the redirect address does not match:</strong> in the Xero app, open Configuration and check the Redirect URI is exactly the one in Part 1, with nothing added or missing.</li>
          <li><strong>The app says Xero is not set up on the server yet:</strong> the secrets in Part 3 are missing or the names are misspelt. Add them again, click Save, then retry.</li>
          <li><strong>The app says Xero refused the sign-in, or invalid client:</strong> the Client id or secret was copied wrongly. In Xero click Generate a secret for a fresh one, replace XERO_CLIENT_SECRET in Supabase, and retry.</li>
          <li><strong>The app says it could not reach the Xero service:</strong> check you are online and that the function is deployed, with the name exactly <strong>xero</strong>.</li>
          <li><strong>You see an error page after signing in to Xero:</strong> Verify JWT is probably still on. Turn it off for the function and retry.</li>
          <li><strong>Xero says invalid scope:</strong> the permission names do not suit your Xero app. Tell the person who built this app what Xero says.</li>
          <li><strong>The link has expired:</strong> just tap Connect to Xero again.</li>
          <li>To start again from scratch, tap <strong>Disconnect Xero</strong> at the top, then follow these steps from Part 1 again.</li>
        </ul>

        <p className="muted small">Invoices arrive in Xero as <strong>drafts</strong> on your sales account 200, for the bookkeeper to check and approve. The tax types used are UK standard 20%, zero rate and domestic reverse charge. If Xero rejects an invoice, the reason shows under the invoice in the app.</p>
      </details>
    </>
  )
}
