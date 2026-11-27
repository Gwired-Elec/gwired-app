import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'

// ids of rows that still have a change waiting to be sent (for the "not yet synced" badges)
export function useOutboxIds(): Set<string> {
  return useLiveQuery(async () => new Set((await db().outbox.toArray()).map((o) => o.row_id)), [], new Set<string>())
}
