import { useState, type FormEvent } from 'react'
import { supabase, getKeepSignedIn, setKeepSignedIn } from '../lib/supabase'

type Mode = 'password' | 'magic' | 'forgot'

// Generic messages on purpose: never reveal whether an email address has an account.
const GENERIC_FAIL = "That email and password don't match. Check them and try again."

export default function SignIn() {
  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [keep, setKeep] = useState(getKeepSignedIn())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    setKeepSignedIn(keep) // must be set before the session is stored
    try {
      if (mode === 'password') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) setMsg({ kind: 'err', text: navigator.onLine ? GENERIC_FAIL : "You're offline. Connect to sign in for the first time on this device." })
      } else if (mode === 'magic') {
        await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false, emailRedirectTo: window.location.origin } })
        setMsg({ kind: 'ok', text: 'If that email has an account, a sign-in link is on its way.' })
      } else {
        await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin })
        setMsg({ kind: 'ok', text: 'If that email has an account, a reset link is on its way.' })
      }
    } catch {
      setMsg({ kind: 'err', text: 'Something went wrong. Check your connection and try again.' })
    }
    setBusy(false)
  }

  return (
    <div className="login">
      <div className="login-box">
        <div className="logo">
          <img src="/brand/gwired-logo.png" alt="G|Wired Electrical Services" onError={(e) => ((e.currentTarget.style.display = 'none'), (e.currentTarget.nextElementSibling as HTMLElement | null)?.removeAttribute('hidden'))} />
          <div hidden className="logo-text">G | WIRED<span>ELECTRICAL SERVICES</span></div>
        </div>
        <form onSubmit={submit}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" inputMode="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          {mode === 'password' && (
            <>
              <label htmlFor="pw">Password</label>
              <input id="pw" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              <label className="check"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Keep me signed in on this device</label>
            </>
          )}
          {msg && <p className={msg.kind === 'ok' ? 'ok' : 'err'} role="status">{msg.text}</p>}
          <button className="btn primary" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'password' ? 'Sign in' : mode === 'magic' ? 'Email me a sign-in link' : 'Email me a reset link'}
          </button>
        </form>
        <div className="links">
          {mode !== 'password' && <button className="link" onClick={() => (setMode('password'), setMsg(null))}>Back to password sign-in</button>}
          {mode === 'password' && <button className="link" onClick={() => (setMode('forgot'), setMsg(null))}>Forgot password?</button>}
          {mode === 'password' && <button className="link" onClick={() => (setMode('magic'), setMsg(null))}>Email me a sign-in link instead</button>}
        </div>
      </div>
    </div>
  )
}
