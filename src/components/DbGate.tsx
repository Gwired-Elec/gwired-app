import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import { dbIsOpen, openDb } from '../lib/sync/db'
import { startSync, stopSync } from '../lib/sync/engine'

// Opens this person's local database and starts syncing; the app below only renders once it is ready.
export default function DbGate({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session?.user.id
  const [ready, setReady] = useState(dbIsOpen())

  useEffect(() => {
    if (!userId) return
    openDb(userId)
    setReady(true)
    startSync()
    return () => stopSync()
  }, [userId])

  return ready ? <>{children}</> : <div className="centre"><p className="muted">Opening…</p></div>
}
