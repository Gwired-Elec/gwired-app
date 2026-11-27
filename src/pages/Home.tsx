import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useLock } from '../lib/lock'

export default function Home() {
  const { profile } = useAuth()
  const lockOn = useLock().enabled
  const name = profile?.full_name?.split(' ')[0]
  return (
    <>
      <h1>{name ? `Hello, ${name}` : 'Hello'}</h1>
      {!lockOn && (
        <Link className="card linkcard notice" to="/more/security"><strong>Protect this device</strong><span className="muted"> Set a PIN or Face ID so the app locks if the phone is left in the van.</span></Link>
      )}
      <div className="card">
        <p>You're signed in. The jobs pipeline, diary and to-dos arrive in the next phases.</p>
      </div>
    </>
  )
}
