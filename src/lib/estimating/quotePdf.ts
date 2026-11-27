// Builds the client's quote as a PDF, on the device (works offline). A4 portrait. The client sees prices only: overheads, profit,
// contingency and discount are spread across the lines so the lines add up exactly to the net figure, and costs and margins
// never appear.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { estimateTotals, lineSell, revLetter, upliftOf } from './estimate'
import type { Estimate, Line, Section } from './estimates'
import { formatGBP, roundHalfUp } from '../money'

export interface QuoteClause { kind: 'exclusion' | 'assumption'; title: string; body: string; sort: number }
export interface QuoteInput {
  company: { name: string; address?: string | null; vat_number?: string | null; email?: string | null; phone?: string | null; terms?: string | null; valid_days?: number | null }
  job: { job_number: string | null; title: string; site_address: string | null }
  client: { name: string; address?: string | null } | null
  estimate: Estimate
  sections: Section[]
  lines: Line[]
  clauses?: QuoteClause[]
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
  s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—−]/g, '-').replace(/…/g, '...').replace(/ /g, ' ').replace(/[^\x20-\x7e£©°±×÷½¼¾\n]/g, '?')

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
  const W = 595.28, H = 841.89, M = 40, R = W - M
  const ink = rgb(0.09, 0.09, 0.1), grey = rgb(0.4, 0.4, 0.43), rule = rgb(0.85, 0.85, 0.87), tint = rgb(0.955, 0.955, 0.965), white = rgb(1, 1, 1), red = rgb(0.69, 0.12, 0.12)
  let page!: PDFPage
  let y = 0
  const text = (s: string, x: number, size = 9, f = font, color = ink) => page.drawText(clean(s), { x, y, size, font: f, color })
  const right = (s: string, xr: number, size = 9, f = font, color = ink) => page.drawText(clean(s), { x: xr - f.widthOfTextAtSize(clean(s), size), y, size, font: f, color })

  // columns. With "lines" detail: Item | Description | Qty | Unit | Rate | Total | Notes. With "sections" detail: Description | Total.
  const lines = q.detail === 'lines'
  const xItem = M, xDesc = M + 28
  const cQty = 280, xUnit = 285, cRate = 372, cTot = lines ? 434 : R, xNote = 443
  const descW = (lines ? cQty - 34 : cTot - 100) - xDesc
  const noteW = R - xNote

  const header = () => {
    page.drawRectangle({ x: M, y: y - 5, width: R - M, height: 17, color: ink })
    const top = y
    y = top - 0.5
    text('Item', xItem + 4, 7.5, bold, white); text('Description of works', xDesc, 7.5, bold, white)
    if (lines) { right('Qty', cQty, 7.5, bold, white); text('Unit', xUnit, 7.5, bold, white); right('Rate', cRate, 7.5, bold, white) }
    right('Total', cTot, 7.5, bold, white)
    if (lines) text('Notes', xNote, 7.5, bold, white)
    y = top - 22
  }
  const newPage = (withHeader = false) => { page = pdf.addPage([W, H]); y = H - M; if (withHeader) header() }
  const need = (h: number, repeat = false) => { if (y - h < M + 34) newPage(repeat) }
  newPage()

  // ---- masthead: the logo on the left, company details on the right
  const t = estimateTotals(q.lines, q.estimate)
  const co = q.company
  let logoH = 0
  if (q.logoPng) {
    try {
      const img = await pdf.embedPng(q.logoPng)
      const w = 150, h = (img.height / img.width) * w
      page.drawImage(img, { x: M, y: y - h, width: w, height: h })
      logoH = h
    } catch { /* no logo: the company name on the right is enough */ }
  }
  const coLines = [co.name, ...(co.address ? co.address.split('\n') : []), co.phone ?? '', co.email ?? '', co.vat_number ? `VAT no. ${co.vat_number}` : ''].filter(Boolean)
  let cy = y - 8
  coLines.forEach((s, i) => { page.drawText(clean(s), { x: R - (i === 0 ? bold : font).widthOfTextAtSize(clean(s), i === 0 ? 11 : 9), y: cy, size: i === 0 ? 11 : 9, font: i === 0 ? bold : font, color: i === 0 ? ink : grey }); cy -= i === 0 ? 15 : 12 })
  y -= Math.max(logoH, y - cy) + 14
  page.drawLine({ start: { x: M, y }, end: { x: R, y }, thickness: 1.2, color: ink })
  y -= 28

  // ---- title, reference and dates
  text('QUOTATION', M, 22, bold)
  const ref = `${q.job.job_number ?? 'Quote'}${q.estimate.rev > 1 ? ` rev ${revLetter(q.estimate.rev)}` : ''}`
  right(`Ref ${ref}`, R, 10, bold)
  y -= 14
  text('Scope of works and priced schedule', M, 10, font, grey)
  right(`Date ${fmtDate(q.date)}`, R, 9, font, grey)
  y -= 12
  const valid = new Date(q.date)
  valid.setDate(valid.getDate() + (co.valid_days ?? 30))
  right(`Valid until ${fmtDate(valid)}`, R, 9, font, grey)
  y -= 26

  // ---- who it is for, and where
  const boxW = (R - M - 14) / 2
  const forRows = q.client ? [q.client.name, ...wrap(q.client.address ?? '', font, 9, boxW - 20).filter(Boolean)] : ['-']
  const siteRows = [...wrap(q.job.title, bold, 9, boxW - 20), ...(q.job.site_address ? wrap(q.job.site_address, font, 9, boxW - 20) : [])]
  const rowsN = Math.max(forRows.length, siteRows.length)
  const boxH = 26 + rowsN * 12
  const drawBox = (x: number, label: string, rows: string[], firstBold: boolean) => {
    page.drawRectangle({ x, y: y - boxH + 6, width: boxW, height: boxH, color: tint })
    page.drawText(label, { x: x + 10, y: y - 6, size: 7.5, font: bold, color: grey })
    rows.forEach((r, i) => page.drawText(clean(r), { x: x + 10, y: y - 20 - i * 12, size: 9, font: firstBold && i === 0 ? bold : font, color: ink }))
  }
  drawBox(M, 'PREPARED FOR', forRows, true)
  drawBox(M + boxW + 14, 'WORKS AND SITE', siteRows, true)
  y -= boxH + 14

  // ---- the schedule, each price scaled so everything adds up to the net value
  const uplift = upliftOf(q.estimate)
  const sells = q.lines.map((l) => lineSell(l, uplift))
  const shown = spreadToNet(sells, t.netPence)
  const shownById = new Map(q.lines.map((l, i) => [l.id, shown[i]]))
  need(80)
  header()
  const ordered = [...q.sections].sort((a, b) => a.sort - b.sort)
  const summary: [string, string, number][] = []
  let letter = 0
  for (const s of ordered) {
    const ls = q.lines.filter((l) => l.section_id === s.id).sort((a, b) => a.sort - b.sort)
    if (!ls.length) continue
    letter += 1
    const code = revLetter(letter)
    const secTotal = ls.reduce((a, l) => a + (shownById.get(l.id) ?? 0), 0)
    summary.push([code, s.name, secTotal])
    need(48, true)
    page.drawRectangle({ x: M, y: y - 5, width: R - M, height: 17, color: tint })
    text(code, xItem + 4, 9.5, bold, red)
    text(s.name.toUpperCase(), xDesc, 9.5, bold)
    if (!lines) right(formatGBP(secTotal), cTot, 9.5, bold)
    y -= 20
    if (lines) {
      ls.forEach((l, i) => {
        const amount = shownById.get(l.id) ?? 0
        const rate = l.qty > 0 ? roundHalfUp(amount / l.qty) : 0
        const dl = wrap(l.description, font, 8.8, descW)
        const nl = l.notes && l.notes.trim() ? wrap(l.notes, font, 7.5, noteW) : []
        const rows = Math.max(dl.length, nl.length, 1)
        need(rows * 11 + 8, true)
        text(`${code}.${i + 1}`, xItem + 4, 8.5, font, grey)
        dl.forEach((r, k) => page.drawText(r, { x: xDesc, y: y - k * 11, size: 8.8, font, color: ink }))
        right(String(l.qty), cQty, 8.8); text(l.unit.slice(0, 7), xUnit, 8.5, font, grey)
        right(formatGBP(rate), cRate, 8.8); right(formatGBP(amount), cTot, 8.8)
        nl.forEach((r, k) => page.drawText(r, { x: xNote, y: y - k * 10, size: 7.5, font, color: grey }))
        y -= rows * 11 + 3
        page.drawLine({ start: { x: M, y: y + 1 }, end: { x: R, y: y + 1 }, thickness: 0.4, color: rule })
        y -= 6
      })
      need(18, true)
      text(`Total for ${s.name}`, xDesc, 9, bold); right(formatGBP(secTotal), cTot, 9.5, bold)
      y -= 20
    }
  }

  // ---- totals: summary of sections, then net, VAT and the amount to pay
  need(130)
  y -= 4
  const colL = M + 230
  page.drawLine({ start: { x: M, y: y + 6 }, end: { x: R, y: y + 6 }, thickness: 0.6, color: rule })
  y -= 10
  if (summary.length > 1) {
    text('SUMMARY', M, 7.5, bold, grey); y -= 13
    for (const [c, n, v] of summary) { need(16); text(`${c}   ${n}`, M, 9.5); right(formatGBP(v), R, 9.5); y -= 14 }
    y -= 4
  }
  text('Total excluding VAT', colL, 10.5, bold); right(formatGBP(t.netPence), R, 10.5, bold); y -= 16
  if (q.estimate.reverse_charge) {
    text('VAT', colL); right('Domestic reverse charge', R); y -= 14
    for (const l of wrap('Domestic reverse charge applies: the customer must account for the VAT due on these works to HMRC.', font, 8.5, R - colL)) { text(l, colL, 8.5, font, grey); y -= 11 }
    y -= 6
  } else {
    text(`VAT at ${q.estimate.vat_rate}%`, colL); right(formatGBP(t.vatPence), R); y -= 18
    page.drawRectangle({ x: colL - 8, y: y - 6, width: R - colL + 8, height: 22, color: ink })
    text('TOTAL TO PAY', colL, 11, bold, white); right(formatGBP(t.totalPence), R - 8, 11, bold, white); y -= 36
  }

  // ---- assumptions and exclusions, notes and terms
  const clauses = (q.clauses ?? []).slice().sort((a, b) => a.sort - b.sort)
  const list = (title: string, items: string[]) => {
    if (!items.length) return
    need(30 + 12)
    text(title, M, 7.5, bold, grey); y -= 14
    items.forEach((it, i) => {
      const ls = wrap(it, font, 9, R - M - 22)
      need(ls.length * 12 + 4)
      text(`${i + 1}.`, M, 9, font, grey)
      ls.forEach((l) => { text(l, M + 22, 9); y -= 12 })
      y -= 2
    })
    y -= 8
  }
  list('ASSUMPTIONS', clauses.filter((c) => c.kind === 'assumption').map((c) => c.body))
  list('EXCLUSIONS', clauses.filter((c) => c.kind === 'exclusion').map((c) => c.body))
  const notes = [q.estimate.notes, co.terms].filter((x): x is string => !!x && !!x.trim())
  if (notes.length) {
    need(30); text('NOTES AND TERMS', M, 7.5, bold, grey); y -= 14
    for (const n of notes) { for (const r of wrap(n, font, 9, R - M)) { need(12); text(r, M, 9, font, grey); y -= 11.5 } y -= 5 }
  }

  // ---- acceptance
  need(96)
  y -= 6
  text('ACCEPTANCE', M, 7.5, bold, grey); y -= 14
  for (const l of wrap(`To accept this quotation please sign and return a copy, or send us your purchase order quoting reference ${ref}.`, font, 9.5, R - M)) { text(l, M, 9.5); y -= 13 }
  y -= 26
  const sigW = (R - M - 40) / 3
  const sig = (i: number, label: string) => { const x = M + i * (sigW + 20); page.drawLine({ start: { x, y }, end: { x: x + sigW, y }, thickness: 0.6, color: ink }); page.drawText(label, { x, y: y - 11, size: 8, font, color: grey }) }
  sig(0, 'Signed for the client'); sig(1, 'Print name and position'); sig(2, 'Date')

  // page numbers
  const pages = pdf.getPages()
  pages.forEach((p, i) => p.drawText(clean(`${co.name}  -  ${ref}  -  page ${i + 1} of ${pages.length}`), { x: M, y: 22, size: 8, font, color: grey }))
  return pdf.save()
}
