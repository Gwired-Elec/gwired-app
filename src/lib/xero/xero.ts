// The app's side of the Xero link: is Xero connected, what happened to each invoice we sent, and the calls to the "xero" function.
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Row } from '../sync/db'
import { supabase } from '../supabase'
import { syncNow } from '../sync/engine'

export interface XeroLink extends Row {
  source_type: 'application' | 'invoice'; source_id: string; xero_invoice_id: string | null; xero_number: string | null
  xero_status: string | null; total_pence: number | null; paid_pence: number | null; last_error: string | null; synced_at: string | null
}

export const useXeroLink = (sourceId: string) => useLiveQuery(async () => (await db().xero_invoice_links.where('source_id').equals(sourceId).filter((r) => !r.deleted_at).first()) as XeroLink | undefined, [sourceId])
export const useXeroLinks = () => useLiveQuery(() => db().xero_invoice_links.filter((r) => !r.deleted_at).toArray() as unknown as Promise<XeroLink[]>, [])

interface Reply { ok: boolean; detail?: string; url?: string; number?: string | null; status?: string; checked?: number; paid?: number }
export async function xeroCall(body: Record<string, unknown>): Promise<Reply> {
  const { data, error } = await supabase.functions.invoke('xero', { body })
  if (error) {
    try { const j = await (error as { context?: Response }).context?.json(); if (j?.detail) return { ok: false, detail: j.detail } } catch { /* fall through */ }
    return { ok: false, detail: "Couldn't reach the Xero service. Check you're online, and that the xero function has been deployed." }
  }
  return data as Reply
}

// null = not known yet (or offline); otherwise whether Xero is connected, and to which organisation
export function useXeroStatus(): { connected: boolean; tenant: string | null } | null {
  const [s, setS] = useState<{ connected: boolean; tenant: string | null } | null>(() => { try { return JSON.parse(localStorage.getItem('gw-xero') ?? 'null') } catch { return null } })
  useEffect(() => {
    if (!navigator.onLine) return
    void supabase.rpc('xero_status').then(({ data, error }) => {
      if (error || !Array.isArray(data) || !data.length) return
      const v = { connected: !!data[0].connected, tenant: (data[0].tenant_name as string | null) ?? null }
      setS(v)
      try { localStorage.setItem('gw-xero', JSON.stringify(v)) } catch { /* ignore */ }
    })
  }, [])
  return s
}

// Quietly asks Xero whether anything sent has been paid (on opening the app, then every few minutes while it is open).
// Paid ones are marked paid on the server, a note appears on the job, and the next sync brings it to this device.
export function useXeroAutoCheck(enabled: boolean) {
  const status = useXeroStatus()
  const links = useXeroLinks()
  const waiting = (links ?? []).some((l) => l.xero_invoice_id && l.xero_status !== 'PAID' && l.xero_status !== 'VOIDED')
  useEffect(() => {
    if (!enabled || !status?.connected || !waiting) return
    const run = async () => {
      if (!navigator.onLine || document.visibilityState === 'hidden') return
      let last = 0
      try { last = Number(localStorage.getItem('gw-xero-checked') ?? 0) } catch { /* ignore */ }
      if (Date.now() - last < 4 * 60_000) return
      try { localStorage.setItem('gw-xero-checked', String(Date.now())) } catch { /* ignore */ }
      const r = await xeroCall({ action: 'refresh' })
      if (r.ok && r.paid) void syncNow()
    }
    void run()
    const t = setInterval(run, 5 * 60_000)
    document.addEventListener('visibilitychange', run)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', run) }
  }, [enabled, status?.connected, waiting])
}

export const XERO_WORDS: Record<string, string> = { DRAFT: 'Draft in Xero', SUBMITTED: 'Awaiting approval in Xero', AUTHORISED: 'Approved in Xero, awaiting payment', PAID: 'Paid in Xero', VOIDED: 'Voided in Xero' }
