// Client links for issued quotes: made online, kept in quote_links (not part of the offline sync).
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import type { QuoteSnapshot } from './quoteView'

export interface QuoteLink {
  id: string; estimate_id: string; token: string; created_at: string; revoked_at: string | null
  first_viewed_at: string | null; last_viewed_at: string | null; view_count: number
  accepted_at: string | null; accepted_name: string | null
}

export const linkUrl = (token: string, preview = false) => `${window.location.origin}/q/${token}${preview ? '?p=1' : ''}`

export function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

export function useQuoteLinks(estimateId: string) {
  const [links, setLinks] = useState<QuoteLink[] | null>(null)
  const [err, setErr] = useState('')
  const reload = useCallback(async () => {
    if (!navigator.onLine) return
    const { data, error } = await supabase.from('quote_links')
      .select('id, estimate_id, token, created_at, revoked_at, first_viewed_at, last_viewed_at, view_count, accepted_at, accepted_name')
      .eq('estimate_id', estimateId).order('created_at', { ascending: false })
    if (error) setErr(/does not exist|schema cache/i.test(error.message) ? 'Client links need database script 026 to be run first.' : error.message)
    else { setErr(''); setLinks((data ?? []) as QuoteLink[]) }
  }, [estimateId])
  useEffect(() => { void reload(); const t = setInterval(reload, 20_000); return () => clearInterval(t) }, [reload])
  return { links, err, reload }
}

export async function createQuoteLink(a: { estimateId: string; jobId: string; snapshot: QuoteSnapshot; pdf: Uint8Array | null }): Promise<string | null> {
  const token = newToken()
  let pdf_path: string | null = null
  if (a.pdf) {
    pdf_path = `${a.estimateId}/${token}.pdf`
    const up = await supabase.storage.from('quote-pdfs').upload(pdf_path, new Blob([a.pdf as BlobPart], { type: 'application/pdf' }), { contentType: 'application/pdf' })
    if (up.error) return up.error.message
  }
  const { error } = await supabase.from('quote_links').insert({ estimate_id: a.estimateId, job_id: a.jobId, token, snapshot: a.snapshot, pdf_path })
  if (error) return /does not exist|schema cache/i.test(error.message) ? 'Client links need database script 026 to be run first.' : error.message
  return null
}

export async function revokeQuoteLink(id: string): Promise<string | null> {
  const { error } = await supabase.from('quote_links').update({ revoked_at: new Date().toISOString() }).eq('id', id)
  return error?.message ?? null
}
