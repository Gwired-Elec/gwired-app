import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

// Shown after someone follows a reset or invite link: set a new password before using the app.
export default function ResetPassword() {
  const { doneRecovering } = useAuth()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr('')
    if (pw.length < 10) return setErr('Use at least 10 characters.')
    if (pw !== pw2) return setErr("The two passwords don't match.")
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw, data: { must_change_password: false } })
    setBusy(false)
    if (error) return setErr(error.message)
    doneRecovering()
  }

  return (
    <div className="login">
      <div className="login-box">
        <h1>Set a new password</h1>
        <form onSubmit={submit}>
          <input type="text" autoComplete="username" hidden readOnly />
          <label htmlFor="n1">New password</label>
          <input id="n1" type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} />
          <label htmlFor="n2">Repeat it</label>
          <input id="n2" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />
          {err && <p className="err" role="alert">{err}</p>}
          <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
        </form>
      </div>
    </div>
  )
}
