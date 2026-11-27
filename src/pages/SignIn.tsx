import { useState, type FormEvent } from 'react'
import { supabase, getKeepSignedIn, setKeepSignedIn } from '../lib/supabase'

type Mode = 'password' | 'magic' | 'forgot'

// Generic messages on purpose: never reveal whether an email address has an account.
const GENERIC_FAIL = "That email and password don't match. Check them and try again."

export default function SignIn() {
  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
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
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
        if (error) {
          // the real reason is shown only while developing (npm run dev), never in the built app
          const detail = import.meta.env.DEV ? ` [dev only: ${error.status ?? ''} ${error.code ?? ''} ${error.message}]` : ''
          setMsg({ kind: 'err', text: (navigator.onLine ? GENERIC_FAIL : "You're offline. Connect to sign in for the first time on this device.") + detail })
        }
      } else if (mode === 'magic') {
        await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: false, emailRedirectTo: window.location.origin } })
        setMsg({ kind: 'ok', text: 'If that email has an account, a sign-in link is on its way.' })
      } else {
        await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: window.location.origin })
        setMsg({ kind: 'ok', text: 'If that email has an account, a reset link is on its way.' })
      }
    } catch (e) {
      setMsg({ kind: 'err', text: 'Something went wrong. Check your connection and try again.' + (import.meta.env.DEV ? ` [dev only: ${String(e)}]` : '') })
    }
    setBusy(false)
  }

  async function passkeySignIn() {
    setMsg(null)
    setKeepSignedIn(keep)
    const { error } = await supabase.auth.signInWithPasskey()
    if (error && !/cancel|abort|not allowed/i.test(error.message)) {
      setMsg({ kind: 'err', text: "That didn't work. Use your password, or add a passkey first from More > Security." + (import.meta.env.DEV ? ` [dev only: ${error.message}]` : '') })
    }
  }

  return (
    <div className="login">
      <div className="login-box">
        <div className="logo">
          <img src="/brand/gwired-logo.png" alt="G|Wired" onError={(e) => (e.currentTarget.style.display = 'none')} />
          <div className="logo-text">G | WIRED<span>ELECTRICAL SERVICES</span></div>
        </div>
        <form onSubmit={submit}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          {mode === 'password' && (
            <>
              <label htmlFor="pw">Password</label>
              <input id="pw" autoCapitalize="none" autoCorrect="off" spellCheck={false} type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              <label className="check"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show password</label>
              <label className="check"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Keep me signed in on this device</label>
            </>
          )}
          {msg && <p className={msg.kind === 'ok' ? 'ok' : 'err'} role="status">{msg.text}</p>}
          <button className="btn primary" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'password' ? 'Sign in' : mode === 'magic' ? 'Email me a sign-in link' : 'Email me a reset link'}
          </button>
        </form>
        {mode === 'password' && !!window.PublicKeyCredential && (
          <button type="button" className="btn" style={{ width: '100%', marginTop: 12 }} disabled={busy} onClick={passkeySignIn}>
            Sign in with Face ID / passkey
          </button>
        )}
        <div className="links">
          {mode !== 'password' && <button className="link" onClick={() => (setMode('password'), setMsg(null))}>Back to password sign-in</button>}
          {mode === 'password' && <button className="link" onClick={() => (setMode('forgot'), setMsg(null))}>Forgot password?</button>}
          {mode === 'password' && <button className="link" onClick={() => (setMode('magic'), setMsg(null))}>Email me a sign-in link instead</button>}
        </div>
      </div>
    </div>
  )
}
