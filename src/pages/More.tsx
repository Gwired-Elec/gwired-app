import { useAuth } from '../lib/auth'

export default function More() {
  const { profile, signOut } = useAuth()
  return (
    <>
      <h1>More</h1>
      <div className="card">
        <p><strong>{profile?.full_name ?? profile?.email}</strong></p>
        <p className="muted">{profile?.email}</p>
        <button className="btn" onClick={signOut}>Sign out</button>
      </div>
      <div className="card">
        <p className="muted">Settings, users, clients, materials and the other sections will be listed here as they are built.</p>
      </div>
    </>
  )
}
