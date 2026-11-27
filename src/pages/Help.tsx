import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { supabase, supabaseUrl } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { db, dbIsOpen, wipeLocalData } from '../lib/sync/db'
import { pendingCount, syncNow, useSyncStatus } from '../lib/sync/engine'
import { fmtDateTime } from '../lib/jobs'

// Plain-English guide to the whole app, plus what to do when a connection fails.
// Keep this up to date whenever a feature is added.

const S = ({ title, children, open }: { title: string; children: ReactNode; open?: boolean }) => (
  <details className="card" open={open}>
    <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{title}</summary>
    <div className="small" style={{ marginTop: 8 }}>{children}</div>
  </details>
)
const H = ({ children }: { children: ReactNode }) => <h3 style={{ margin: '14px 0 4px' }}>{children}</h3>

const SCRIPTS: [string, string][] = [
  ['001', 'Foundation: users, permissions, company settings'], ['002', 'Lets signed-in users reach the tables'], ['003', 'Lets the server functions reach the tables'],
  ['004', 'Sync engine, clients, contacts, jobs, job numbers'], ['005', 'Estimating data: suppliers, materials, rates, assemblies'], ['006', 'Job statuses simplified'],
  ['007', '"Won" renamed "Live"'], ['008', 'Estimates, sections and lines'], ['009', 'Overheads and profit'], ['010', 'Line sell price override'],
  ['011', 'Labour day and night rates'], ['012', 'Assumptions and exclusions library'], ['013', 'Site walkaround'], ['014', 'Walkaround photos and photo storage'],
  ['015', 'Photos belong to items'], ['016', 'Keep original photo when marked up'], ['017', 'Variations, applications, invoices'], ['018', 'Part-accepted variations'],
  ['019', 'Price variations like an estimate'], ['020', 'Photos on variation items'], ['021', 'To-dos and diary'], ['022', 'Calendar link for Apple Calendar'],
  ['023', 'Xero link'], ['024', 'Files on a job'], ['025', 'Job costs'], ['026', 'Client quote links'], ['027', 'Materials procurement list'], ['028', 'Push notifications'], ['029', 'The 7am daily summary'],
]

export default function Help() {
  const { profile, can, isOwner } = useAuth()
  const sync = useSyncStatus()
  const waiting = useLiveQuery(async () => (dbIsOpen() ? await db().outbox.count() : 0), [], 0)
  const [check, setCheck] = useState<{ label: string; ok: boolean; note: string }[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function runCheck() {
    setBusy(true); setCheck(null)
    const out: { label: string; ok: boolean; note: string }[] = []
    out.push({ label: 'This device is online', ok: navigator.onLine, note: navigator.onLine ? '' : 'Switch on Wi-Fi or mobile data.' })
    try {
      const { error } = await supabase.from('company_settings').select('id').limit(1)
      out.push({ label: 'Database (Supabase) answers', ok: !error, note: error ? error.message : '' })
    } catch (e) { out.push({ label: 'Database (Supabase) answers', ok: false, note: e instanceof Error ? e.message : 'No answer' }) }
    try {
      const { data } = await supabase.auth.getSession()
      out.push({ label: 'You are signed in', ok: !!data.session, note: data.session ? '' : 'Sign out and sign in again.' })
    } catch { out.push({ label: 'You are signed in', ok: false, note: 'Could not check.' }) }
    try {
      const r = await fetch(`${supabaseUrl}/functions/v1/diary-feed`, { method: 'GET' })
      out.push({ label: 'Calendar function is deployed', ok: r.status !== 404, note: r.status === 404 ? 'Not found: deploy diary-feed (see "If something stops working").' : '' })
    } catch { out.push({ label: 'Calendar function is deployed', ok: false, note: 'No answer.' }) }
    try {
      const r = await fetch(`${supabaseUrl}/functions/v1/quote-portal`, { method: 'GET' })
      const ok = r.status !== 404 || (await r.text()).includes('not_found')
      out.push({ label: 'Client quote link function is deployed', ok, note: ok ? '' : 'Not found: deploy quote-portal (see "If something stops working").' })
    } catch { out.push({ label: 'Client quote link function is deployed', ok: false, note: 'No answer.' }) }
    try {
      const r = await fetch(`${supabaseUrl}/functions/v1/xero`, { method: 'GET' })
      out.push({ label: 'Xero function is deployed', ok: r.status !== 404, note: r.status === 404 ? 'Not found: deploy xero (see "If something stops working").' : '' })
    } catch { out.push({ label: 'Xero function is deployed', ok: false, note: 'No answer.' }) }
    setCheck(out); setBusy(false)
  }

  async function reload() {
    setMsg('')
    if (!navigator.onLine) { setMsg('You need to be online to download a fresh copy.'); return }
    setBusy(true)
    await syncNow().catch(() => {})
    const n = await pendingCount()
    if (n > 0 && !confirm(`${n} change${n === 1 ? '' : 's'} on this device have not reached the server and will be lost. Carry on anyway?`)) { setBusy(false); return }
    if (!confirm('Delete this device\'s copy and download everything fresh from the server? Your data on the server is not touched.')) { setBusy(false); return }
    await wipeLocalData()
    location.reload()
  }

  return (
    <>
      <p><Link to="/more">← More</Link></p>
      <h1>Help</h1>
      <p className="muted small">Everything the app does, how to use it, and what to do if a connection breaks. Tap a heading to open it.</p>

      <div className="card">
        <h2>Is everything connected?</h2>
        <p className="muted small">Last synced {sync.lastSync ? fmtDateTime(sync.lastSync) : 'never'} · {waiting} change{waiting === 1 ? '' : 's'} waiting to send · signed in as {profile?.email}</p>
        <div className="actions">
          <button className="btn primary" onClick={runCheck} disabled={busy}>{busy ? 'Checking…' : 'Check connections'}</button>
          <button className="btn" onClick={() => syncNow()} disabled={sync.phase === 'syncing'}>Sync now</button>
        </div>
        {check && check.map((c) => <p key={c.label} style={{ margin: '8px 0 0' }}>{c.ok ? '✅' : '❌'} {c.label}{c.note && <span className="muted small"> — {c.note}</span>}</p>)}
        {check && check.some((c) => !c.ok) && <p className="small" style={{ marginTop: 10 }}>Something is red. Open <strong>If something stops working</strong> below and follow the matching step.</p>}
      </div>

      <S title="Getting started" open>
        <ol>
          <li><strong>Put it on your Home Screen.</strong> On iPhone or iPad open <strong>gwired-app.web.app</strong> in Safari, tap Share, then <strong>Add to Home Screen</strong>. Use the icon from then on. It works like a normal app and keeps working with no signal.</li>
          <li><strong>Sign in</strong> with your email and password, then set a PIN and switch on Face ID in <strong>More → Security</strong>. Next time the app asks for Face ID first, and falls back to your PIN or password.</li>
          <li><strong>Offline is fine.</strong> Anything you type is saved on the device straight away and sent to the server when there's signal. The cloud icon / <strong>More → Sync and storage</strong> shows what's waiting.</li>
          <li>The bottom bar: <strong>Home</strong> (calendar and tasks), <strong>Jobs</strong>, and <strong>More</strong> (everything else).</li>
        </ol>
      </S>

      <S title="Home">
        <p>The week's diary across the top, your tasks underneath. Use <strong>Mine / Everyone</strong> to switch between your own and the whole team's, and <strong>Week / Month</strong> to change the calendar. Tap a day to see or add things. Owners also get a link to the Dashboard here.</p>
        <p><strong>Notifications:</strong> green cards at the top of Home (and on the job itself) tell you when a client accepts a quote, and when Xero shows an application or invoice as paid. They stay for 14 days; tap the cross to clear one on your device. Payments are checked in Xero automatically whenever the app is open (every few minutes), and the application or invoice is marked paid for you.</p>
      </S>

      <S title="Jobs, from enquiry to finished">
        <p>Every job moves through <strong>Estimating → Quoted → Live → Closed</strong> (or <strong>Lost</strong>, with a reason). Change the status on the job's Overview tab. Job numbers are given automatically.</p>
        <p>Tap a job to see its tabs:</p>
        <ul>
          <li><strong>Overview:</strong> client, site, contacts, status and the quote value / chance of winning (this feeds the dashboard pipeline).</li>
          <li><strong>Walkaround:</strong> on the site visit add areas, then notes and items with photos. Tap a photo to mark it up with a pen. The original is always kept. Walkaround items can be pulled into the estimate.</li>
          <li><strong>Estimate:</strong> build the price from materials, price per point, assemblies and day rates. Overheads and profit are added at the bottom. Tick the standard assumptions and exclusions that go on the quote, then make the quote PDF or Excel. Revisions are kept; the accepted one becomes the contract.<br /><strong>Client link:</strong> once a quote is issued, tap <strong>Make client link</strong>, then <strong>Send or copy link</strong> and send it by text, WhatsApp or email. The client opens it with no login, reads the quote, downloads the PDF and taps <strong>Accept</strong> (they type their name and tick a box). It shows the quote exactly as issued. You can see whether it has been opened and when. When they accept, the quote is marked accepted, the job goes to Live and a starter checklist appears in the job's To-dos. <strong>Stop link</strong> switches a link off. If you issue a new revision, the old link tells the client it has been replaced.<br /><strong>Accept and start job:</strong> if the client says yes by phone or in person, tap this instead: it does the same thing (accepted, job Live, starter checklist) in one tap.</li>
          <li><strong>Variations:</strong> priced the same way as an estimate. When the client approves, enter the value they accepted (it starts at the full amount; tap it to change). Any shortfall shows as a discount on the next application.</li>
          <li><strong>Applications:</strong> applications for payment on commercial jobs (set each line by % or £, or set every line at once in 5% steps). Retention applies on commercial jobs only. CIS and domestic reverse charge VAT are tick-boxes at the top. Domestic jobs use simple invoices: deposit, stage payments and balance. Issue makes a PDF; mark it paid when the money arrives.</li>
          <li><strong>Costs:</strong> money going out. Budget comes from the estimate. Time on site comes from the diary at the day rate and can be overruled by hand if the diary was not kept up. The Materials list is a mini procurement list: pull in every material from the estimate with one tap, tick each off as it is ordered and put its real cost in, and add small items by hand. </li>
          <li><strong>To-dos / Diary:</strong> jobs' own tasks and diary entries.</li>
          <li><strong>Files:</strong> a place for tech sheets, drawings and anything else. Needs signal to upload or open.</li>
        </ul>
      </S>

      <S title="To-dos and diary">
        <p>To-dos can be given to a person, a date and a job, and ticked off. Turn on <strong>Notifications</strong> under More (on an iPhone the app must be on the Home Screen first) to get a notice when a client accepts a quote, an invoice is paid in Xero, someone tags you, and a 7am summary. Type <strong>@</strong> in a to-do and pick a name to tag someone: they get a green notice on Home until they dismiss it or the to-do is done. The diary is for who is where and when. Add anything from Home or from inside a job.</p>
        <p><strong>Apple Calendar:</strong> Home → bottom of the page → <strong>Calendar options</strong>. <strong>Show in Apple Calendar</strong> subscribes your calendar so jobs appear on your phone and stay up to date. <strong>Download calendar file</strong> gives a one-off copy. Each person has their own private link; keep it to yourself. <em>Make a new link</em> if it is ever shared by mistake.</p>
      </S>

      <S title="Estimating data (More → Estimating data)">
        <p>The prices everything is built from: <strong>materials</strong> (with several supplier prices each), <strong>suppliers</strong>, <strong>labour rates</strong> (cost and charge per 8-hour day, plus night shift), <strong>price per point</strong>, <strong>assemblies</strong> (a bundle of materials and labour), <strong>prelims</strong>, <strong>defaults</strong> (overheads and profit) and the <strong>assumptions and exclusions</strong> library.</p>
        <p><strong>Import prices</strong> loads a supplier's price list from Excel. Owners can delete materials with the bin icon on the right of the list.</p>
        <p>Headings on an estimate (for example "Materials") can be renamed: tap the bold name.</p>
      </S>

      {isOwner && (
        <S title="Dashboard (owners only)">
          <p><strong>Money in:</strong> invoiced, paid, owed and late. The ageing shows how late each unpaid amount is. <strong>Money out:</strong> costs so far (from each job's Costs tab) and the expected profit on live jobs. <strong>Pipeline:</strong> quoted jobs, plain and weighted by the chance of winning. <strong>Live jobs</strong> each get a traffic light:</p>
          <ul>
            <li><strong>Red:</strong> a payment is more than 30 days late, or the job is expected to cost more than the contract.</li>
            <li><strong>Amber:</strong> a payment is late, billed more than the contract, no contract value found, or expected margin under 10%.</li>
            <li><strong>Green:</strong> nothing wrong.</li>
          </ul>
          <p>The figures are only as good as what is entered: keep the diary up to date, and add the materials as they are bought. All figures exclude VAT unless it says otherwise.</p>
        </S>
      )}

      <S title="Clients, users, security and company">
        <ul>
          <li><strong>Clients:</strong> a client can have several contacts. Jobs link to a client.</li>
          <li><strong>Users</strong> (needs the Users permission): add a person, then choose exactly what they can see and change. A new person is emailed a link to set their password. Staff only see the parts you give them.</li>
          <li><strong>Security:</strong> PIN, Face ID, how quickly the app locks itself, and passkeys.</li>
          <li><strong>Company details:</strong> name, address, VAT number, bank details and standard terms; they print on every quote, application and invoice.</li>
          <li><strong>Job pipeline:</strong> rename the statuses and edit the lost reasons.</li>
        </ul>
      </S>

      {can('settings') && (
        <S title="Xero">
          <p>Once connected (<strong>More → Xero</strong>), open an issued application or invoice on the job and tap <strong>Send to Xero</strong>. It arrives in Xero as a sales invoice. Check payments to bring "paid" back across. The full set-up steps are on the Xero page and can be repeated if the connection ever fails. Always check the first invoice in Xero (tax rates and account codes) before relying on it.</p>
        </S>
      )}

      <S title="If something stops working">
        <p>Start with <strong>Check connections</strong> at the top of this page. It tells you which link is broken. The app has four connections (database, website, server functions, Xero), and they only break in a few ways:</p>

        <H>1. Changes are not saving or not appearing on another device</H>
        <ol>
          <li>Open <strong>More → Sync and storage</strong>. If it says <em>Offline</em>, get a signal and tap <strong>Sync now</strong>.</li>
          <li>If it lists "Changes the server refused", read the reason, then <strong>Try again</strong>. Use <strong>Discard</strong> only if it is wrong data.</li>
          <li>If you see "Conflicts to resolve", two people changed the same thing. Choose the server's or yours. Nothing is overwritten without asking.</li>
          <li>Still wrong? Use the button below to throw away this device's copy and download a fresh one. <strong>Your data is safe on the server.</strong> It first tries to send anything waiting.</li>
        </ol>
        <button className="btn" onClick={reload} disabled={busy}>Delete this device's copy and download fresh</button>
        {msg && <p className="err">{msg}</p>}

        <H>2. You cannot sign in, or you see "not configured"</H>
        <ul>
          <li>Wrong password: use <strong>Forgot password</strong> on the sign-in page.</li>
          <li>Signed in but everything blank or "no permission": ask an owner to check your permissions in <strong>More → Users</strong>.</li>
          <li>A missing-configuration error means the website was built without its Supabase address. See part B below.</li>
          <li>Face ID not offered: sign in with your password once, then switch it back on in <strong>More → Security</strong>. On iPhone Safari, Face ID sometimes needs one tap on the button first.</li>
        </ul>

        <H>3. The pages look old after an update</H>
        <p>Close the app fully (swipe it away) and reopen it. On a computer press <strong>Ctrl + Shift + R</strong>. The app updates itself, but a phone may need to be told to look.</p>

        <H>4. A job's section says "table does not exist" or stays empty</H>
        <p>A database script has not been run. See part A below.</p>

        <H>A. Re-linking the database (Supabase) from scratch</H>
        <p className="muted small">Only needed if you set up a new Supabase project, or a script was missed. You need the Supabase login.</p>
        <ol>
          <li>Go to <strong>supabase.com</strong>, sign in, and open the project.</li>
          <li>Click <strong>SQL Editor</strong> (left), then <strong>New query</strong>.</li>
          <li>Open the script on GitHub: <strong>github.com/Gwired-Elec/gwired-app</strong> → folder <strong>supabase</strong> → the script. Click the copy button, paste it into the query box and click <strong>Run</strong>.</li>
          <li>Run them <strong>one at a time, in number order</strong>. Each should say "Success". A script is safe to run again if it says things already exist, but only run a script twice if you have to; never skip one.</li>
          <li>Any new feature that needs a script will say so when it is added; run it before using that feature.</li>
        </ol>
        <table className="small" style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>{SCRIPTS.map(([n, w]) => <tr key={n}><td style={{ padding: '2px 8px 2px 0', fontWeight: 700, whiteSpace: 'nowrap' }}>{n}</td><td style={{ padding: '2px 0' }}>{w}</td></tr>)}</tbody>
        </table>
        <p>The first person to sign in after script 001 becomes the owner.</p>

        <H>B. Re-linking the website (GitHub and Firebase)</H>
        <p className="muted small">The website is built on GitHub and published on Firebase every time a change is saved. If the live site stops updating, look here.</p>
        <ol>
          <li>Go to <strong>github.com/Gwired-Elec/gwired-app</strong> and click the <strong>Actions</strong> tab. The newest line should have a green tick. A red cross means the last update failed: open it to read why.</li>
          <li>The build needs these <strong>secrets</strong> (<strong>Settings → Secrets and variables → Actions</strong>). Their names must match exactly:
            <ul>
              <li><strong>VITE_SUPABASE_URL</strong>: the project's address from Supabase (<em>Project Settings → API → Project URL</em>), which looks like https://xxxx.supabase.co</li>
              <li><strong>VITE_SUPABASE_ANON_KEY</strong>: the public key from the same page (the <em>anon</em> or <em>publishable</em> key, never the secret one).</li>
              <li><strong>FIREBASE_PROJECT_ID</strong>: the Firebase project's ID.</li>
              <li><strong>FIREBASE_SERVICE_ACCOUNT</strong>: the Firebase publishing key (Firebase → Project settings → Service accounts → Generate new private key). Paste its contents straight into GitHub. <strong>Never send it to anyone or put it in a message.</strong></li>
            </ul>
          </li>
          <li>After fixing a secret, open the failed run and click <strong>Re-run all jobs</strong>.</li>
          <li>If the Supabase address ever changes, update the two VITE secrets and re-run the build, and add the website address (https://gwired-app.web.app) under Supabase → <strong>Authentication → URL Configuration</strong> so sign-in links come back to the app.</li>
        </ol>

        <H>C. Re-linking the server functions (Supabase Edge Functions)</H>
        <p className="muted small">Four small programs run on Supabase: they cannot run from the website itself.</p>
        <ol>
          <li>In Supabase click <strong>Edge Functions</strong> (left) and look for these three:
            <ul>
              <li><strong>manage-users</strong>: adds and edits staff. <strong>Verify JWT: ON.</strong></li>
              <li><strong>diary-feed</strong>: the Apple Calendar link. <strong>Verify JWT: OFF</strong> (a calendar app cannot sign in).</li>
              <li><strong>xero</strong>: the Xero link. <strong>Verify JWT: OFF</strong> (Xero comes back with no sign-in).</li>
              <li><strong>push</strong>: notifications to phones. <strong>Verify JWT: OFF</strong>. Needs the secrets VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and CRON_SECRET.</li>
              <li><strong>quote-portal</strong>: the client's quote link page. <strong>Verify JWT: OFF</strong> (clients do not sign in).</li>
            </ul>
          </li>
          <li>A function that is missing needs deploying. Click <strong>Deploy a new function → Via Editor</strong>, name it exactly as above, paste in the file from GitHub (<strong>supabase → functions → [name] → index.ts</strong>) and click <strong>Deploy</strong>. Then open its settings and set <strong>Verify JWT</strong> as above.</li>
          <li>The Xero function needs three secrets in <strong>Edge Functions → Secrets</strong>: <strong>XERO_CLIENT_ID</strong>, <strong>XERO_CLIENT_SECRET</strong> (both from your app on developer.xero.com → Configuration) and <strong>APP_URL</strong> = https://gwired-app.web.app. The detailed steps are on <strong>More → Xero</strong>.</li>
          <li>Changed a function's file? Paste it in again and Deploy again, or the live copy stays old.</li>
        </ol>

        <H>D. Re-linking Xero</H>
        <p>Open <strong>More → Xero</strong>. If it says not connected, press <strong>Connect to Xero</strong>. If that errors, follow the <strong>Setup steps</strong> on that page from the top. The connection can expire if it is not used for a long time or if the Xero app is changed; connecting again fixes it and invoices already sent stay in Xero.</p>

        <H>E. Last resort</H>
        <p>If you are stuck, take a screenshot of the red error and the Check connections result and send it to whoever looks after the app. The error text is nearly always enough to say which of A to D is at fault.</p>
      </S>
    </>
  )
}
