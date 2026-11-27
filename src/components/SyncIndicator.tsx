import { Link } from 'react-router-dom'
import { useSyncStatus } from '../lib/sync/engine'

// Always visible: ✓ Synced · ⟳ Syncing · ⚠ Offline, n waiting · ✕ Sync error (tap for the sync log)
export default function SyncIndicator() {
  const s = useSyncStatus()
  let text = '✓ Synced'
  let cls = 'good'
  if (s.phase === 'syncing') (text = `⟳ Syncing${s.pending ? ` (${s.pending})` : ''}`), (cls = '')
  else if (s.phase === 'offline') (text = s.pending ? `⚠ Offline, ${s.pending} waiting` : '⚠ Offline'), (cls = 'warn')
  else if (s.phase === 'error') (text = '✕ Sync error'), (cls = 'bad')
  else if (s.pending) (text = `⟳ ${s.pending} waiting`), (cls = 'warn')
  if (s.conflicts || s.parked) (text += ` · ${s.conflicts + s.parked} to check`), (cls = 'bad')
  return <Link to="/more/sync" className={'pill ' + cls} aria-live="polite">{text}</Link>
}
