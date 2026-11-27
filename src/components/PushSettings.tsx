import { usePush } from '../lib/push'

// A card on More: switch notifications on or off for this device.
export default function PushSettings() {
  const { state, msg, busy, enable, disable, test } = usePush()
  return (
    <div className="card">
      <h2>Notifications</h2>
      <p className="muted small">Get a notice on this device when a client accepts a quote, a Xero invoice is paid, someone tags you in a to-do, and a summary of what is due at 7am.</p>
      {state === null && <p className="muted small">Checking…</p>}
      {state === 'unsupported' && <p className="muted small">This browser can't receive notifications. On an iPhone or iPad use the app from the Home Screen.</p>}
      {state === 'needs-install' && <p><strong>First add G|Wired to your Home Screen:</strong> in Safari tap the Share button, then <em>Add to Home Screen</em>, then open the app from its icon and come back here. (Needs iOS 16.4 or newer.)</p>}
      {state === 'blocked' && <p className="err">Notifications are blocked for this app. Turn them on in the phone's Settings, under Notifications, G|Wired, then come back.</p>}
      {state === 'off' && <button className="btn primary" onClick={enable} disabled={busy}>{busy ? 'Working…' : 'Turn on notifications on this device'}</button>}
      {state === 'on' && (
        <>
          <p><strong>On for this device.</strong></p>
          <div className="actions tight">
            <button className="btn" onClick={test} disabled={busy}>Send me a test</button>
            <button className="btn" onClick={disable} disabled={busy}>Turn off</button>
          </div>
        </>
      )}
      {msg && <p className="small" role="status">{msg}</p>}
    </div>
  )
}
