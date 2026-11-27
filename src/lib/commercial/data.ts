// Variations, applications for payment and invoices: types, live queries (from the local database, so they work offline) and the
// helpers that work out what the contract is worth.
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Row } from '../sync/db'
import { estimateTotals, lineSell, upliftOf } from '../estimating/estimate'
import type { Estimate, Line, Section } from '../estimating/estimates'
import { spreadToNet } from '../estimating/quotePdf'
import { variationLine, type AppTerms } from '../money/applications'
import { percentOf } from '../money'

export interface Variation extends Row { job_id: string; number: number; title: string; description: string | null; status: 'draft' | 'issued' | 'approved' | 'rejected'; var_date: string; approved_pence: number | null }
export interface VariationLine extends Row { variation_id: string; sort: number; description: string; qty: number; unit: string; rate_pence: number }
export interface Application extends Row, AppTerms {
  job_id: string; number: number; status: 'draft' | 'issued' | 'paid'; app_date: string; period_to: string | null
  notes: string | null; paid_pence: number | null; paid_date: string | null
}
export interface ApplicationLine extends Row { application_id: string; sort: number; line_key: string; group_name: string; description: string; contract_pence: number; to_date_pence: number }
export interface Invoice extends Row {
  job_id: string; number: number; kind: 'deposit' | 'stage' | 'balance'; description: string; net_pence: number; vat_rate: number; reverse_charge: boolean
  inv_date: string; due_date: string | null; status: 'draft' | 'issued' | 'paid'; paid_date: string | null; notes: string | null
}

const alive = (r: Row) => !r.deleted_at
const n = (v: unknown) => Number(v ?? 0)

export const variationValue = (lines: VariationLine[]) => lines.reduce((a, l) => a + variationLine(l.qty, l.rate_pence), 0)
// what the client accepted: the full price unless a lower figure was agreed when it was approved
export const acceptedValue = (v: Variation, lines: VariationLine[]) => v.approved_pence ?? variationValue(lines)
export const vref = (n: number) => 'VO-' + String(n).padStart(3, '0')

export function useCommercial(jobId: string) {
  return useLiveQuery(async () => {
    const variations = ((await db().variations.where('job_id').equals(jobId).filter(alive).toArray()) as unknown as Variation[]).map((v) => ({ ...v, number: n(v.number), approved_pence: v.approved_pence == null ? null : n(v.approved_pence) })).sort((a, b) => a.number - b.number)
    const vids = variations.map((v) => v.id)
    const vlines = vids.length ? ((await db().variation_lines.where('variation_id').anyOf(vids).filter(alive).toArray()) as unknown as VariationLine[]).map((l) => ({ ...l, qty: n(l.qty), rate_pence: n(l.rate_pence), sort: n(l.sort) })).sort((a, b) => a.sort - b.sort) : []
    const applications = ((await db().applications.where('job_id').equals(jobId).filter(alive).toArray()) as unknown as Application[]).map((a) => ({
      ...a, number: n(a.number), retention_pct: n(a.retention_pct), retention_release_pence: n(a.retention_release_pence), cis_on: !!a.cis_on, cis_rate: n(a.cis_rate), cis_labour_pct: n(a.cis_labour_pct), reverse_charge: !!a.reverse_charge, vat_rate: n(a.vat_rate),
      paid_pence: a.paid_pence == null ? null : n(a.paid_pence),
    })).sort((a, b) => a.number - b.number)
    const aids = applications.map((a) => a.id)
    const alines = aids.length ? ((await db().application_lines.where('application_id').anyOf(aids).filter(alive).toArray()) as unknown as ApplicationLine[]).map((l) => ({ ...l, sort: n(l.sort), contract_pence: n(l.contract_pence), to_date_pence: n(l.to_date_pence) })).sort((a, b) => a.sort - b.sort) : []
    const invoices = ((await db().invoices.where('job_id').equals(jobId).filter(alive).toArray()) as unknown as Invoice[]).map((i) => ({ ...i, number: n(i.number), net_pence: n(i.net_pence), vat_rate: n(i.vat_rate), reverse_charge: !!i.reverse_charge })).sort((a, b) => a.number - b.number)
    return { variations, vlines, applications, alines, invoices }
  }, [jobId])
}

// The estimate the contract is based on: the accepted one (latest revision), otherwise the latest that is not superseded.
export function contractEstimate(estimates: Estimate[]): Estimate | null {
  const live = estimates.filter((e) => e.status !== 'superseded')
  const accepted = live.filter((e) => e.status === 'accepted')
  return (accepted.length ? accepted : live).at(-1) ?? null
}

export interface ContractItem { key: string; group: string; description: string; pence: number }
// every quote line with the value the client saw (the same spread the quote PDF uses, so the lines add up to the quote's net figure)
export function contractItems(est: Estimate, sections: Section[], lines: Line[]): { items: ContractItem[]; net: number } {
  const mine = lines.filter((l) => l.estimate_id === est.id)
  const t = estimateTotals(mine, est)
  const shown = spreadToNet(mine.map((l) => lineSell(l, upliftOf(est))), t.netPence)
  const byId = new Map(mine.map((l, i) => [l.id, shown[i]]))
  const items: ContractItem[] = []
  for (const s of [...sections.filter((x) => x.estimate_id === est.id)].sort((a, b) => a.sort - b.sort)) {
    for (const l of mine.filter((x) => x.section_id === s.id).sort((a, b) => a.sort - b.sort)) items.push({ key: 'q:' + l.id, group: s.name, description: l.description, pence: byId.get(l.id) ?? 0 })
  }
  for (const l of mine.filter((x) => !x.section_id || !sections.some((s) => s.id === x.section_id)).sort((a, b) => a.sort - b.sort)) items.push({ key: 'q:' + l.id, group: 'General', description: l.description, pence: byId.get(l.id) ?? 0 })
  return { items, net: t.netPence }
}

// what a new application should contain: the quote lines and the approved variations, each starting at what the last application said
export function freshLines(items: ContractItem[], approved: { id: string; label: string; pence: number; accepted: number }[], prev: ApplicationLine[]): Omit<ApplicationLine, 'id' | 'application_id'>[] {
  const was = new Map(prev.map((l) => [l.line_key, l.to_date_pence]))
  const out: Omit<ApplicationLine, 'id' | 'application_id'>[] = []
  items.forEach((it) => out.push({ sort: out.length * 10, line_key: it.key, group_name: it.group, description: it.description, contract_pence: it.pence, to_date_pence: was.get(it.key) ?? 0 }))
  approved.forEach((v) => {
    const done = was.get('v:' + v.id) ?? 0
    out.push({ sort: out.length * 10, line_key: 'v:' + v.id, group_name: 'Variations', description: v.label, contract_pence: v.pence, to_date_pence: done })
    // part accepted: the shortfall is a discount line that follows the variation's % complete
    if (v.accepted < v.pence) out.push({ sort: out.length * 10, line_key: 'd:' + v.id, group_name: 'Variations', description: 'Less discount agreed on ' + v.label, contract_pence: v.accepted - v.pence, to_date_pence: percentOf(v.accepted - v.pence, v.pence ? (done / v.pence) * 100 : 0) })
  })
  return out
}

export const clampPct = (p: number) => Math.min(100, Math.max(0, p))
export const lineFromPct = (contract: number, pct: number) => percentOf(contract, clampPct(pct))
