import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { signOutEverywhere } from '../lib/users'

export default function More() {
  const { profile, signOut, can } = useAuth()
  const [msg, setMsg] = useState('')
  return (
    <>
      <h1>More</h1>
      <div className="card">
        <p><strong>{profile?.full_name ?? profile?.email}</strong></p>
        <p className="muted">{profile?.email}</p>
        <div className="actions">
          <button className="btn" onClick={signOut}>Sign out</button>
          <button
            className="btn"
            onClick={async () => {
              const r = await signOutEverywhere()
              if (r.ok) await signOut()
              else setMsg(r.detail ?? 'Failed')
            }}
          >
            Sign out of all devices
          </button>
        </div>
        {msg && <p className="err">{msg}</p>}
      </div>
      <Link className="card linkcard" to="/more/security"><strong>Security</strong><span className="muted"> PIN, Face ID, auto-lock and passkeys</span></Link>
      {can('users') && (
        <Link className="card linkcard" to="/more/users"><strong>Users</strong><span className="muted"> Add staff and choose what they can see</span></Link>
      )}
      <div className="card">
        <p className="muted">Clients, materials, settings and the other sections will be listed here as they are built.</p>
      </div>
    </>
  )
}
