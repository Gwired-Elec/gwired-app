import { useAuth } from '../lib/auth'

export default function Home() {
  const { profile } = useAuth()
  const name = profile?.full_name?.split(' ')[0]
  return (
    <>
      <h1>{name ? `Hello, ${name}` : 'Hello'}</h1>
      <div className="card">
        <p>You're signed in. The jobs pipeline, diary and to-dos arrive in the next phases.</p>
      </div>
    </>
  )
}
