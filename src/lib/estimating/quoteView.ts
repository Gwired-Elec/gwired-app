// A frozen copy of an issued quote, exactly as the client sees it on the web link. Prices only: overheads, profit and discount are
// spread across the lines (the same way as the PDF) so lines add up to the net figure, and costs never appear. Pure: no database.
import { estimateTotals, lineSell, revLetter, upliftOf } from './estimate'
import { spreadToNet, type QuoteInput } from './quotePdf'
import { roundHalfUp } from '../money'

export interface SnapLine { ref: string; description: string; qty: number; unit: string; rate: number; amount: number; notes: string }
export interface SnapSection { code: string; name: string; total: number; lines: SnapLine[] }
export interface QuoteSnapshot {
  v: 1
  company: { name: string; address: string; phone: string; email: string; vat_number: string; company_number: string }
  ref: string
  date: string // YYYY-MM-DD
  validUntil: string // YYYY-MM-DD
  client: { name: string; address: string } | null
  job: { title: string; site_address: string }
  detail: 'lines' | 'sections'
  sections: SnapSection[]
  net: number; vat: number; total: number; vat_rate: number; reverse_charge: boolean
  assumptions: string[]; exclusions: string[]; notes: string[]
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function buildQuoteSnapshot(q: Omit<QuoteInput, 'logoPng'>): QuoteSnapshot {
  const t = estimateTotals(q.lines, q.estimate)
  const uplift = upliftOf(q.estimate)
  const shown = spreadToNet(q.lines.map((l) => lineSell(l, uplift)), t.netPence)
  const byId = new Map(q.lines.map((l, i) => [l.id, shown[i]]))
  const sections: SnapSection[] = []
  for (const s of [...q.sections].sort((a, b) => a.sort - b.sort)) {
    const ls = q.lines.filter((l) => l.section_id === s.id).sort((a, b) => a.sort - b.sort)
    if (!ls.length) continue
    const code = revLetter(sections.length + 1)
    const lines = ls.map((l, i) => {
      const amount = byId.get(l.id) ?? 0
      return { ref: `${code}.${i + 1}`, description: l.description, qty: l.qty, unit: l.unit, rate: l.qty > 0 ? roundHalfUp(amount / l.qty) : 0, amount, notes: (l.notes ?? '').trim() }
    })
    sections.push({ code, name: s.name, total: lines.reduce((a, l) => a + l.amount, 0), lines: q.detail === 'lines' ? lines : [] })
  }
  const valid = new Date(q.date)
  valid.setDate(valid.getDate() + (q.company.valid_days ?? 30))
  const clauses = (q.clauses ?? []).slice().sort((a, b) => a.sort - b.sort)
  const co = q.company
  return {
    v: 1,
    company: { name: co.name, address: co.address ?? '', phone: co.phone ?? '', email: co.email ?? '', vat_number: co.vat_number ?? '', company_number: co.company_number ?? '' },
    ref: `${[q.job.job_number, q.job.title].filter(Boolean).join(' ') || 'Quote'}${q.estimate.rev > 1 ? ` rev ${revLetter(q.estimate.rev)}` : ''}`,
    date: iso(q.date), validUntil: iso(valid),
    client: q.client ? { name: q.client.name, address: q.client.address ?? '' } : null,
    job: { title: q.job.title, site_address: q.job.site_address ?? '' },
    detail: q.detail, sections,
    net: t.netPence, vat: t.vatPence, total: t.totalPence, vat_rate: q.estimate.vat_rate, reverse_charge: !!q.estimate.reverse_charge,
    assumptions: clauses.filter((c) => c.kind === 'assumption').map((c) => c.body),
    exclusions: clauses.filter((c) => c.kind === 'exclusion').map((c) => c.body),
    notes: [q.estimate.notes, co.terms].filter((x): x is string => !!x && !!x.trim()),
  }
}
