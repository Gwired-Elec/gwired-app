// In-app notifications: things that happened that the team should notice (a quote accepted, a payment received in Xero).
// They come from the job activity log, so they sync to every device. Each person can dismiss a notice on their own device.
import { useCallback, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, dbIsOpen } from './sync/db'
import { formatGBP } from './money'

export interface Notice { id: string; job_id: string; kind: 'accepted' | 'paid'; text: string; at: string }
interface Row { id: string; entity_id: string; action: string; detail: Record<string, unknown> | null; user_id: string | null; created_at: string; deleted_at?: string | null }

export const NOTICE_DAYS = 14

// what to tell people: recent accepted quotes and payments, newest first, leaving out anything the person did themselves
export function buildNotices(rows: Row[], me: string | undefined, now: Date, dismissed: string[]): Notice[] {
  const since = now.getTime() - NOTICE_DAYS * 86_400_000
  const out: Notice[] = []
  for (const r of rows) {
    if (r.deleted_at || (r.action !== 'quote_accepted' && r.action !== 'payment_received')) continue
    if (dismissed.includes(r.id) || new Date(r.created_at).getTime() < since || (me && r.user_id === me)) continue
    const d = r.detail ?? {}
    if (r.action === 'quote_accepted') {
      out.push({ id: r.id, job_id: r.entity_id, kind: 'accepted', at: r.created_at, text: d.by === 'client' ? `Quote ${d.quote ?? ''} accepted online by ${d.name ?? 'the client'}` : `Quote accepted${d.rev ? ` (revision ${d.rev})` : ''}` })
    } else {
      const amt = typeof d.amount_pence === 'number' && d.amount_pence > 0 ? ` (${formatGBP(d.amount_pence)})` : ''
      out.push({ id: r.id, job_id: r.entity_id, kind: 'paid', at: r.created_at, text: `${d.label ?? 'Payment'} paid in Xero${amt}` })
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at))
}

const KEY = 'gw-notices-dismissed'
const read = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] } }

export function useNotices(me: string | undefined, jobId?: string): { notices: Notice[]; dismiss: (id: string) => void } {
  const [gone, setGone] = useState<string[]>(read)
  const rows = useLiveQuery(async () => (dbIsOpen() ? ((await db().activity_log.where('created_at').above(new Date(Date.now() - NOTICE_DAYS * 86_400_000).toISOString()).toArray()) as unknown as Row[]) : []), [], [])
  const dismiss = useCallback((id: string) => {
    const next = [...read(), id].slice(-200)
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ignore */ }
    setGone(next)
  }, [])
  const all = buildNotices(rows, me, new Date(), gone)
  return { notices: jobId ? all.filter((n) => n.job_id === jobId) : all, dismiss }
}
