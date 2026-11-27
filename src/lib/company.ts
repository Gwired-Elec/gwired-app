// Company details used on quotes (name, address, VAT number, standard terms). Kept on the server; a copy is cached on this
// device so quotes can still be made offline.
import { supabase } from './supabase'

export interface Company { name: string; address: string; vat_number: string; email: string; phone: string; terms: string; valid_days: number }
const KEY = 'gw-company'
export const EMPTY: Company = { name: 'G|Wired Electrical Services', address: '', vat_number: '', email: '', phone: '', terms: '', valid_days: 30 }

export function cachedCompany(): Company {
  try { return { ...EMPTY, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Company>) } } catch { return EMPTY }
}
export async function loadCompany(): Promise<Company> {
  const { data, error } = await supabase.from('company_settings').select('company_name,address,vat_number,email,phone,settings').eq('id', 1).maybeSingle()
  if (error || !data) return cachedCompany()
  const s = (data.settings ?? {}) as Record<string, unknown>
  const c: Company = {
    name: data.company_name || EMPTY.name, address: data.address ?? '', vat_number: data.vat_number ?? '', email: data.email ?? '', phone: data.phone ?? '',
    terms: String(s.quote_terms ?? ''), valid_days: Number(s.quote_valid_days ?? 30) || 30,
  }
  try { localStorage.setItem(KEY, JSON.stringify(c)) } catch { /* ignore */ }
  return c
}
export async function saveCompany(c: Company): Promise<string | null> {
  const { data: cur } = await supabase.from('company_settings').select('settings').eq('id', 1).maybeSingle()
  const settings = { ...((cur?.settings ?? {}) as Record<string, unknown>), quote_terms: c.terms, quote_valid_days: c.valid_days }
  const { error } = await supabase.from('company_settings').update({ company_name: c.name, address: c.address || null, vat_number: c.vat_number || null, email: c.email || null, phone: c.phone || null, settings }).eq('id', 1)
  if (error) return error.message
  try { localStorage.setItem(KEY, JSON.stringify(c)) } catch { /* ignore */ }
  return null
}
