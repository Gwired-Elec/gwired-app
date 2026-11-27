// Builds the client's quote as a PDF, on the device (works offline). The client sees prices only: overheads, profit,
// contingency and discount are spread across the lines so the lines add up exactly to the net figure, and costs and margins
// never appear.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { estimateTotals, lineSell, revLetter, upliftOf } from './estimate'
import type { Estimate, Line, Section } from './estimates'
import { formatGBP, roundHalfUp } from '../money'

export interface QuoteInput {
  company: { name: string; address?: string | null; vat_number?: string | null; email?: string | null; phone?: string | null; terms?: string | null; valid_days?: number | null }
  job: { job_number: string | null; title: string; site_address: string | null }
  client: { name: string; address?: string | null } | null
  estimate: Estimate
  sections: Section[]
  lines: Line[]
  detail: 'lines' | 'sections'
  date: Date
  logoPng?: Uint8Array | null
}

// Scale line prices up (or down) so they add up to `net`, rounding each to the penny and putting any leftover pennies on the
// largest line. Keeps the lines honest: they always sum to the net quote value.
export function spreadToNet(sells: number[], net: number): number[] {
  const total = sells.reduce((a, b) => a + b, 0)
  if (!sells.length) return []
  if (total === 0) return sells.map(() => 0)
  const out = sells.map((s) => roundHalfUp((s * net) / total))
  const diff = net - out.reduce((a, b) => a + b, 0)
  if (diff !== 0) {
    let big = 0
    sells.forEach((s, i) => { if (s > sells[big]) big = i })
    out[big] += diff
  }
  return out
}

// the standard PDF fonts only cover Western characters
const clean = (s: string) =>
  s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—−]/g, '-').replace(/…/g, '...').replace(/ /g, ' ').replace(/[^\x20-\x7e£©°±×÷½¼¾\n]/g, '?')

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = []
  for (const para of clean(text).split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const t = line ? line + ' ' + word : word
      if (font.widthOfTextAtSize(t, size) <= width) line = t
      else { if (line) out.push(line); line = word }
    }
    out.push(line)
  }
  return out
}

const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

export async function buildQuotePdf(q: QuoteInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const W = 595.28, H = 841.89, M = 44
  const ink = rgb(0.09, 0.09, 0.1), grey = rgb(0.4, 0.4, 0.43), line = rgb(0.85, 0.85, 0.87)
  let page!: PDFPage
  let y = 0
  const newPage = () => { page = pdf.addPage([W, H]); y = H - M }
  const need = (h: number) => { if (y - h < M + 30) newPage() }
  const text = (s: string, x: number, size = 10, f = font, color = ink) => page.drawText(clean(s), { x, y, size, font: f, color })
  const right = (s: string, xr: number, size = 10, f = font, color = ink) => page.drawText(clean(s), { x: xr - f.widthOfTextAtSize(clean(s), size), y, size, font: f, color })
  newPage()

  // header
  const t = estimateTotals(q.lines, q.estimate)
  let logoH = 0
  if (q.logoPng) {
    try {
      const img = await pdf.embedPng(q.logoPng)
      const w = 150, h = (img.height / img.width) * w
      page.drawImage(img, { x: M, y: y - h, width: w, height: h })
      logoH = h
    } catch { /* no logo: the company name below is enough */ }
  }
  const co = q.company
  const coLines = [co.name, ...(co.address ? co.address.split('\n') : []), co.phone ?? '', co.email ?? '', co.vat_number ? `VAT no. ${co.vat_number}` : ''].filter(Boolean)
  let cy = y
  coLines.forEach((s, i) => { page.drawText(clean(s), { x: W - M - (i === 0 ? bold : font).widthOfTextAtSize(clean(s), i === 0 ? 11 : 9), y: cy, size: i === 0 ? 11 : 9, font: i === 0 ? bold : font, color: i === 0 ? ink : grey }); cy -= i === 0 ? 14 : 12 })
  y -= Math.max(logoH, y - cy) + 18

  text('QUOTATION', M, 20, bold)
  y -= 20
  const ref = `${q.job.job_number ?? 'Quote'}${q.estimate.rev > 1 ? ` rev ${revLetter(q.estimate.rev)}` : ''}`
  text(`Ref ${ref}`, M, 10, font, grey)
  right(`Date ${fmtDate(q.date)}`, W - M, 10, font, grey)
  y -= 13
  const valid = new Date(q.date)
  valid.setDate(valid.getDate() + (co.valid_days ?? 30))
  right(`Valid until ${fmtDate(valid)}`, W - M, 10, font, grey)
  y -= 22

  const block = (label: string, rows: string[]) => {
    text(label, M, 8, bold, grey)
    y -= 12
    for (const r of rows) for (const l of wrap(r, font, 10, W - 2 * M)) { text(l, M); y -= 13 }
    y -= 6
  }
  if (q.client) block('FOR', [q.client.name, ...(q.client.address ? [q.client.address] : [])])
  block('WORKS', [q.job.title, ...(q.job.site_address ? [`Site: ${q.job.site_address}`] : [])])
  y -= 4

  // the lines, each scaled so everything adds up to the net value
  const uplift = upliftOf(q.estimate)
  const sells = q.lines.map((l) => lineSell(l, uplift))
  const shown = spreadToNet(sells, t.netPence)
  const shownById = new Map(q.lines.map((l, i) => [l.id, shown[i]]))
  const xQty = W - M - 200, xRate = W - M - 80, xTot = W - M
  const header = () => {
    need(30)
    page.drawLine({ start: { x: M, y: y + 4 }, end: { x: W - M, y: y + 4 }, thickness: 0.6, color: line })
    y -= 8
    text('Description', M, 8, bold, grey)
    if (q.detail === 'lines') { right('Qty', xQty, 8, bold, grey); right('Rate', xRate, 8, bold, grey) }
    right('Amount', xTot, 8, bold, grey)
    y -= 8
    page.drawLine({ start: { x: M, y: y + 3 }, end: { x: W - M, y: y + 3 }, thickness: 0.6, color: line })
    y -= 10
  }
  header()
  const ordered = [...q.sections].sort((a, b) => a.sort - b.sort)
  for (const s of ordered) {
    const ls = q.lines.filter((l) => l.section_id === s.id).sort((a, b) => a.sort - b.sort)
    if (!ls.length) continue
    const secTotal = ls.reduce((a, l) => a + (shownById.get(l.id) ?? 0), 0)
    need(34)
    text(s.name, M, 10.5, bold)
    if (q.detail === 'sections') right(formatGBP(secTotal), xTot, 10.5, bold)
    y -= 15
    if (q.detail === 'lines') {
      for (const l of ls) {
        const amount = shownById.get(l.id) ?? 0
        const rate = l.qty > 0 ? roundHalfUp(amount / l.qty) : 0
        const rows = wrap(l.description, font, 9.5, xQty - M - 60)
        need(rows.length * 12 + 4)
        rows.forEach((r, i) => { text(r, M + 8, 9.5); if (i === 0) { right(`${l.qty} ${l.unit}`.slice(0, 14), xQty + 10, 9, font, grey); right(formatGBP(rate), xRate, 9.5); right(formatGBP(amount), xTot, 9.5) } y -= 12 })
      }
      y -= 4
    }
  }

  // totals
  need(110)
  page.drawLine({ start: { x: M, y: y + 6 }, end: { x: W - M, y: y + 6 }, thickness: 0.6, color: line })
  y -= 12
  text('Total excluding VAT', M, 10.5, bold); right(formatGBP(t.netPence), xTot, 10.5, bold); y -= 15
  if (q.estimate.reverse_charge) {
    text('VAT', M); right('Domestic reverse charge', xTot); y -= 13
    for (const l of wrap('Domestic reverse charge applies: the customer must account for the VAT due on these works to HMRC.', font, 9, W - 2 * M)) { text(l, M, 9, font, grey); y -= 12 }
  } else {
    text(`VAT at ${q.estimate.vat_rate}%`, M); right(formatGBP(t.vatPence), xTot); y -= 15
    text('Total to pay', M, 12, bold); right(formatGBP(t.totalPence), xTot, 12, bold); y -= 20
  }

  const notes = [q.estimate.notes, co.terms].filter((x): x is string => !!x && !!x.trim())
  for (const n of notes) {
    const rows = wrap(n, font, 9, W - 2 * M)
    y -= 6
    for (const r of rows) { need(12); text(r, M, 9, font, grey); y -= 11.5 }
  }

  // page numbers
  const pages = pdf.getPages()
  pages.forEach((p, i) => p.drawText(`${co.name}  -  page ${i + 1} of ${pages.length}`, { x: M, y: 22, size: 8, font, color: grey }))
  return pdf.save()
}
