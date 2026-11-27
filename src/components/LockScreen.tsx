import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { useLock } from '../lib/lock'

export default function LockScreen() {
  const { profile, signOut } = useAuth()
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

  async function face() {
    setMsg('')
    if (!(await unlockWithBiometric())) setMsg("Face ID didn't work. Try again or use your PIN.")
  }

  return (
    <div className="login">
      <div className="login-box" style={{ textAlign: 'center' }}>
        <div className="logo-text">G | WIRED<span>LOCKED</span></div>
        <p className="muted" style={{ color: '#a1a1aa' }}>{profile?.full_name ?? profile?.email}</p>
        {config.credId && <button className="btn primary" onClick={face}>Unlock with Face ID</button>}
        {config.pin && (
          <form onSubmit={submit}>
            <label htmlFor="pin">PIN</label>
            <input id="pin" type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoComplete="off" autoFocus={!config.credId} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} disabled={wait > 0} style={{ textAlign: 'center', letterSpacing: '0.4em' }} />
            <button className="btn primary" disabled={wait > 0 || pin.length < 4}>{wait > 0 ? `Wait ${wait}s` : 'Unlock'}</button>
          </form>
        )}
        {msg && <p className="err" role="alert">{msg}</p>}
        <div className="links"><button className="link" onClick={signOut}>Sign out of this device</button></div>
      </div>
    </div>
  )
}
