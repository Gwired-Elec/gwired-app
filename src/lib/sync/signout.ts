import { useAuth } from '../auth'
import { wipeLocalData } from './db'
import { pendingCount, syncNow } from './engine'

// Signing out wipes this device's local copy (so a shared phone doesn't keep the last person's data). Never silently
// throw away work that hasn't reached the server: try to sync first, then warn.
export function useSafeSignOut() {
  const { signOut } = useAuth()
  return async (force = false) => {
    if (!force) {
      if (navigator.onLine) await syncNow().catch(() => {})
      const n = await pendingCount()
      if (n > 0 && !confirm(`${n} change${n === 1 ? '' : 's'} on this device haven't been sent yet and will be lost if you sign out. Sign out anyway?`)) return false
    }
    await wipeLocalData()
    await signOut()
    return true
  }
}
