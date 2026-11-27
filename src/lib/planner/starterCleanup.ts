// One-off tidy-up: the automatic "starter" to-dos that used to be added when a quote was accepted were removed as a feature.
// This quietly deletes any that are still lying about (only these exact wordings, only ones created before the feature went, only open ones).
import { useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../sync/db'
import { remove } from '../sync/store'

const TITLES = new Set([
  'confirm the start date with the client',
  'send order acknowledgement and payment terms',
  'order materials (see the costs tab: materials still needed)',
  'book the job into the diary',
  'raise the deposit invoice or first application for payment',
  'prepare rams and site induction',
])
const CUTOFF = '2026-11-27T19:00:00Z'

export const isOldStarter = (t: { title?: unknown; job_id?: unknown; done_at?: unknown; created_at?: unknown }) => {
  const title = String(t.title ?? '').trim().toLowerCase()
  const old = !t.created_at || String(t.created_at) < CUTOFF
  return !!t.job_id && !t.done_at && old && (TITLES.has(title) || /^quote .* accepted online by .*: phone to say thank you and confirm$/.test(title))
}

export function useStarterCleanup(enabled: boolean) {
  const ids = useLiveQuery(async () => (await db().todos.filter((t) => !t.deleted_at && isOldStarter(t)).toArray()).map((t) => t.id), [])
  useEffect(() => {
    if (!enabled || !ids?.length) return
    for (const id of ids) void remove('todos', id)
  }, [enabled, ids])
}
