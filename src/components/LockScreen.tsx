import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { useLock } from '../lib/lock'
import { useSafeSignOut } from '../lib/sync/signout'

export default function LockScreen() {
  const { profile } = useAuth()
  const safeSignOut = useSafeSignOut()
  const { config, unlockWithPin, unlockWithBiometric } = useLock()
  const [pin, setPin] = useState('')
  const [msg, setMsg] = useState('')
  const [wait, setWait] = useState(0)

  useEffect(() => {
    if (wait <= 0) return
    const t = setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000)
    return () => clearInterval(t)
  }, [wait])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (wait > 0 || !pin) return
    const r = await unlockWithPin(pin)
    setPin('')
    if (r.result === 'bad') setMsg(`Wrong PIN. ${r.left} ${r.left === 1 ? 'try' : 'tries'} before a wait.`)
    else if (r.result === 'wait') {
      setWait(r.seconds)
      setMsg('Too many wrong PINs.')
    }
  }

  async function face(auto = false) {
    setMsg('')
    if (!(await unlockWithBiometric())) setMsg(auto ? (config.pin ? 'Enter your PIN, or tap Unlock with Face ID to try again.' : 'Tap Unlock with Face ID to try again.') : "Face ID didn't work. Try again or use your PIN.")
  }
  // Face ID is asked for as soon as the lock screen appears; if it fails (or the phone wants a tap first) the PIN is there
  const tried = useRef(false)
  useEffect(() => {
    if (tried.current || !config.credId) return
    tried.current = true
    void face(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="login">
      <div className="login-box" style={{ textAlign: 'center' }}>
        <div className="logo-text">G | WIRED<span>LOCKED</span></div>
        <p className="muted" style={{ color: '#a1a1aa' }}>{profile?.full_name ?? profile?.email}</p>
        {config.credId && <button className="btn primary" onClick={() => face()}>Unlock with Face ID</button>}
        {config.pin && (
          <form onSubmit={submit}>
            <label htmlFor="pin">PIN</label>
            <input id="pin" type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoComplete="off" autoFocus={!config.credId} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} disabled={wait > 0} style={{ textAlign: 'center', letterSpacing: '0.4em' }} />
            <button className="btn primary" disabled={wait > 0 || pin.length < 4}>{wait > 0 ? `Wait ${wait}s` : 'Unlock'}</button>
          </form>
        )}
        {msg && <p className="err" role="alert">{msg}</p>}
        <div className="links"><button className="link" onClick={() => safeSignOut()}>Sign out of this device</button></div>
      </div>
    </div>
  )
}
