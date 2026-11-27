import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { biometricAvailable, enrolBiometric, removeBiometric, removePin, setAutoMinutes, setPin, useLock, validPin } from '../lib/lock'
import { supabase } from '../lib/supabase'

const AUTO = [
  [1, '1 minute'],
  [5, '5 minutes'],
  [15, '15 minutes'],
  [30, '30 minutes'],
  [0, 'Never'],
] as const

export default function Security() {
  const { profile } = useAuth()
  const { config, refresh, lock } = useLock()
  const [bio, setBio] = useState(false)
  const [pin, setPinText] = useState('')
  const [pin2, setPin2] = useState('')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [passkeys, setPasskeys] = useState<{ id: string; friendly_name?: string | null; created_at: string }[] | null>(null)

  useEffect(() => void biometricAvailable().then(setBio), [])
  const loadPasskeys = async () => {
    const r = await supabase.auth.passkey.list()
    setPasskeys(r.data ?? [])
  }
  useEffect(() => void loadPasskeys().catch(() => setPasskeys(null)), [])

  const ok = (text: string) => setMsg({ kind: 'ok', text })
  const err = (text: string) => setMsg({ kind: 'err', text })

  async function savePin(e: FormEvent) {
    e.preventDefault()
    if (!validPin(pin)) return err('Use 4 to 6 digits.')
    if (pin !== pin2) return err("The two PINs don't match.")
    await setPin(pin)
    setPinText('')
    setPin2('')
    refresh()
    ok('PIN saved. This device will ask for it when it locks.')
  }

  return (
    <>
      <p><Link to="/more">← More</Link></p>
      <h1>Security</h1>
      {msg && <p className={msg.kind === 'ok' ? 'ok' : 'err'} role="status">{msg.text}</p>}

      <div className="card">
        <h2>App lock on this device</h2>
        <p className="muted">Locks when you leave the app idle or in the background. Works offline.</p>
        <form onSubmit={savePin}>
          <label htmlFor="p1">{config.pin ? 'Change PIN (4 to 6 digits)' : 'Set a PIN (4 to 6 digits)'}</label>
          <input id="p1" type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoComplete="off" value={pin} onChange={(e) => setPinText(e.target.value.replace(/\D/g, ''))} />
          <label htmlFor="p2">Repeat it</label>
          <input id="p2" type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoComplete="off" value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} />
          <div className="actions">
            <button className="btn primary" style={{ width: 'auto' }}>Save PIN</button>
            {config.pin && <button type="button" className="btn" onClick={() => (removePin(), refresh(), ok('PIN removed.'))}>Remove PIN</button>}
          </div>
        </form>

        <label>Face ID / Touch ID</label>
        {!bio ? (
          <p className="muted">This device doesn't offer Face ID or Touch ID to web apps.</p>
        ) : config.credId ? (
          <div className="actions" style={{ marginTop: 0 }}>
            <span className="ok">On for this device.</span>
            <button className="btn" onClick={() => (removeBiometric(), refresh(), ok('Face ID unlock turned off.'))}>Turn off</button>
          </div>
        ) : (
          <button className="btn" onClick={async () => { try { await enrolBiometric(profile?.email ?? 'user'); refresh(); ok('Face ID unlock is on for this device.') } catch (e) { err(e instanceof Error ? e.message : 'Could not set up Face ID.') } }}>Use Face ID to unlock this device</button>
        )}

        <label htmlFor="auto">Lock after</label>
        <select id="auto" value={config.autoMinutes} onChange={(e) => (setAutoMinutes(Number(e.target.value)), refresh())}>
          {AUTO.map(([m, l]) => <option key={m} value={m}>{l} {m ? 'idle' : ''}</option>)}
        </select>
        <div className="actions">
          <button className="btn" disabled={!config.pin && !config.credId} onClick={lock}>Lock now</button>
        </div>
        {!config.pin && !config.credId && <p className="muted">Set a PIN or Face ID first, then the lock turns on.</p>}
      </div>

      <div className="card">
        <h2>Sign in with Face ID / passkey</h2>
        <p className="muted">Lets you sign in on this device with Face ID or Touch ID instead of typing your password, including on a new device. Needs a connection.</p>
        {passkeys?.map((p) => <p key={p.id}>✓ {p.friendly_name ?? 'Passkey'} <span className="muted">added {new Date(p.created_at).toLocaleDateString('en-GB')}</span></p>)}
        <button className="btn" onClick={async () => {
          const r = await supabase.auth.registerPasskey()
          if (r.error) err(/not enabled|disabled|404|not found/i.test(r.error.message) ? 'Passkeys are not switched on in Supabase yet (Authentication settings).' : r.error.message)
          else { try { localStorage.setItem('gw-has-passkey', '1') } catch { /* ignore */ }; ok('Passkey added. Next time, choose "Sign in with Face ID / passkey".'); void loadPasskeys() }
        }}>Add a passkey on this device</button>
      </div>
    </>
  )
}
