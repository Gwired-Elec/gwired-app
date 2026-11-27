// PDFs for variations, applications for payment and invoices. Same look as the quote (A4 portrait, logo, company details on the
// right). Built on the device, so they work offline.
import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib'
import { clean, wrap } from '../estimating/quotePdf'
import { formatGBP } from '../money'
import { invoiceTotals, type Valuation } from '../money/applications'
import type { Application, ApplicationLine, Invoice, Variation } from './data'
import { vref } from './data'

export interface DocCompany { name: string; address?: string | null; vat_number?: string | null; company_number?: string | null; email?: string | null; phone?: string | null; terms?: string | null; bank?: string | null }
export interface DocBase {
  company: DocCompany
  job: { job_number: string | null; title: string; site_address: string | null }
  client: { name: string; address?: string | null } | null
  date: Date
  logoPng?: Uint8Array | null
}

const fmtDate = (d: Date | string) => (typeof d === 'string' ? new Date(d) : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

type Col = { label: string; x: number; align: 'l' | 'r' }

async function start(b: DocBase, title: string, sub: string, ref: string, extra: string[] = []) {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const W = 595.28, H = 841.89, M = 40, R = W - M
  const ink = rgb(0.09, 0.09, 0.1), grey = rgb(0.4, 0.4, 0.43), rule = rgb(0.85, 0.85, 0.87), tint = rgb(0.955, 0.955, 0.965), white = rgb(1, 1, 1)
  let page!: PDFPage
  let y = 0
  let cols: Col[] = []
  const text = (s: string, x: number, size = 9, f = font, color = ink) => page.drawText(clean(s), { x, y, size, font: f, color })
  const right = (s: string, xr: number, size = 9, f = font, color = ink) => page.drawText(clean(s), { x: xr - f.widthOfTextAtSize(clean(s), size), y, size, font: f, color })
  const header = () => {
    page.drawRectangle({ x: M, y: y - 5, width: R - M, height: 17, color: ink })
    const top = y
    y = top + 1
    cols.forEach((c) => (c.align === 'r' ? right(c.label, c.x, 7.5, bold, white) : text(c.label, c.x, 7.5, bold, white)))
    y = top - 22
  }
  const newPage = () => { page = pdf.addPage([W, H]); y = H - M; if (cols.length) header() }
  const need = (h: number) => { if (y - h < M + 34) newPage() }
  newPage()

  // masthead
  const co = b.company
  let logoH = 0
  if (b.logoPng) {
    try {
      const img = await pdf.embedPng(b.logoPng)
      const w = 150, h = (img.height / img.width) * w
      page.drawImage(img, { x: M, y: y - h, width: w, height: h })
      logoH = h
    } catch { /* no logo */ }
  }
  const coLines = [co.name, ...(co.address ? co.address.split('\n') : []), co.phone ?? '', co.email ?? '', co.vat_number ? `VAT no. ${co.vat_number}` : '', co.company_number ? `Company no. ${co.company_number}` : ''].filter(Boolean)
  let cy = y - 8
  coLines.forEach((s, i) => { page.drawText(clean(s), { x: R - (i === 0 ? bold : font).widthOfTextAtSize(clean(s), i === 0 ? 11 : 9), y: cy, size: i === 0 ? 11 : 9, font: i === 0 ? bold : font, color: i === 0 ? ink : grey }); cy -= i === 0 ? 15 : 12 })
  y -= Math.max(logoH, y - cy) + 14
  page.drawLine({ start: { x: M, y }, end: { x: R, y }, thickness: 1.2, color: ink })
  y -= 28
  text(title, M, 20, bold)
  right(ref, R, 10, bold)
  y -= 14
  text(sub, M, 10, font, grey)
  right(`Date ${fmtDate(b.date)}`, R, 9, font, grey)
  for (const e of extra) { y -= 12; right(e, R, 9, font, grey) }
  y -= 26
  const boxW = (R - M - 14) / 2
  const forRows = b.client ? [b.client.name, ...wrap(b.client.address ?? '', font, 9, boxW - 20).filter(Boolean)] : ['-']
  const siteRows = [...wrap(b.job.title, bold, 9, boxW - 20), ...(b.job.site_address ? wrap(b.job.site_address, font, 9, boxW - 20) : [])]
  const boxH = 26 + Math.max(forRows.length, siteRows.length) * 12
  const box = (x: number, label: string, rows: string[]) => {
    page.drawRectangle({ x, y: y - boxH + 6, width: boxW, height: boxH, color: tint })
    page.drawText(label, { x: x + 10, y: y - 6, size: 7.5, font: bold, color: grey })
    rows.forEach((r, i) => page.drawText(clean(r), { x: x + 10, y: y - 20 - i * 12, size: 9, font: i === 0 ? bold : font, color: ink }))
  }
  box(M, 'TO', forRows)
  box(M + boxW + 14, 'WORKS AND SITE', siteRows)
  y -= boxH + 14

  const setCols = (c: Col[]) => { cols = c; need(60); header() }
  // one table row, text vertically centred; `cells` line up with the columns
  const row = (cells: string[], opts: { bold?: boolean; tinted?: boolean; wrapCol?: number; grey?: boolean } = {}) => {
    const f = opts.bold ? bold : font
    const wc = opts.wrapCol ?? 0
    const wcw = (cols[wc + 1]?.x ?? R) - cols[wc].x - (cols[wc + 1] ? 80 : 0)
    const lines = wrap(cells[wc] ?? '', f, 8.8, Math.min(wcw, 230))
    const rowH = Math.max(lines.length * 11, 11) + 12
    need(rowH + 2)
    const top = y + 12
    if (opts.tinted) page.drawRectangle({ x: M, y: top - rowH, width: R - M, height: rowH, color: tint })
    const base = (k: number, n: number) => top - (rowH - n * 11) / 2 - 11 / 2 - k * 11 - 8.8 * 0.35
    cells.forEach((c, i) => {
      const col = cols[i]
      if (i === wc) { lines.forEach((l, k) => page.drawText(clean(l), { x: col.x, y: base(k, lines.length), size: 8.8, font: f, color: opts.grey ? grey : ink })); return }
      const yy = base(0, 1)
      const s = clean(c)
      page.drawText(s, { x: col.align === 'r' ? col.x - f.widthOfTextAtSize(s, 8.8) : col.x, y: yy, size: 8.8, font: f, color: opts.grey ? grey : ink })
    })
    const bottom = top - rowH
    page.drawLine({ start: { x: M, y: bottom }, end: { x: R, y: bottom }, thickness: 0.4, color: rule })
    y = bottom - 12
  }
  // label / value lines on the right (totals)
  const sums = (rows: [string, string, boolean?][]) => {
    need(rows.length * 16 + 10)
    y -= 4
    for (const [label, value, strong] of rows) {
      if (strong) { page.drawLine({ start: { x: R - 250, y: y + 12 }, end: { x: R, y: y + 12 }, thickness: 0.8, color: ink }) }
      right(label, R - 110, strong ? 10 : 9, strong ? bold : font, strong ? ink : grey)
      right(value, R, strong ? 10 : 9, strong ? bold : font)
      y -= 16
    }
  }
  const para = (s: string, size = 8.5, color = grey) => { for (const l of wrap(s, font, size, R - M)) { need(12); text(l, M, size, font, color); y -= size + 3 } }
  const finish = async () => {
    const pages = pdf.getPages()
    pages.forEach((p, i) => p.drawText(clean(`${co.name}  -  ${title.toLowerCase().replace(/^./, (c) => c.toUpperCase())} ${ref.replace(/^Ref /, '')}  -  page ${i + 1} of ${pages.length}`), { x: M, y: 22, size: 8, font, color: grey }))
    return pdf.save()
  }
  // small photos under a row, three across
  const images = async (blobs: Blob[]) => {
    const gw = 120, gh = 90
    for (let i = 0; i < blobs.length; i += 3) {
      const embedded = []
      for (const b of blobs.slice(i, i + 3)) { try { embedded.push(await pdf.embedJpg(new Uint8Array(await b.arrayBuffer()))) } catch { /* skip unreadable */ } }
      if (!embedded.length) continue
      need(gh + 14)
      embedded.forEach((img, k) => { const sc = Math.min(gw / img.width, gh / img.height); page.drawImage(img, { x: M + 28 + k * (gw + 10), y: y - img.height * sc + 6, width: img.width * sc, height: img.height * sc }) })
      y -= gh + 12
    }
  }
  return { images, setCols, row, sums, para, finish, gap: (n: number) => { y -= n }, M, R, need, text: (s: string, size = 9, f = font, color = ink) => text(s, M, size, f, color), down: (n: number) => { y -= n }, bold, font, ink, grey }
}

// ---------------------------------------------------------------- variation
export interface VariationRow { description: string; qty: number; unit: string; rate: number; total: number; notes?: string | null; photos?: Blob[] }
export async function buildVariationPdf(b: DocBase & { variation: Variation; rows: VariationRow[] }): Promise<Uint8Array> {
  const d = await start(b, 'VARIATION', 'Instruction / confirmation of variation to the contract', `Ref ${b.job.job_number ?? ''} ${vref(b.variation.number)}`.trim(), [`Status: ${b.variation.status}`])
  d.setCols([{ label: 'Item', x: 44, align: 'l' }, { label: 'Description', x: 72, align: 'l' }, { label: 'Qty', x: 330, align: 'r' }, { label: 'Unit', x: 338, align: 'l' }, { label: 'Rate', x: 440, align: 'r' }, { label: 'Total', x: 555, align: 'r' }])
  for (let i = 0; i < b.rows.length; i++) {
    const l = b.rows[i]
    d.row([String(i + 1), l.description, String(l.qty), l.unit, formatGBP(l.rate), formatGBP(l.total)], { wrapCol: 1 })
    if (l.notes) { d.down(-6); d.para(l.notes, 8, d.grey); d.down(4) }
    if (l.photos?.length) await d.images(l.photos)
  }
  const net = b.rows.reduce((a, l) => a + l.total, 0)
  d.sums([['Total of this variation, excluding VAT', formatGBP(net), true]])
  d.para('VAT is added at the applicable rate when this variation is included in an application for payment or invoice.')
  return d.finish()
}

// ---------------------------------------------------------------- application for payment
export async function buildApplicationPdf(b: DocBase & { app: Application; lines: ApplicationLine[]; prev: Map<string, number>; v: Valuation; before: Valuation | null }): Promise<Uint8Array> {
  const { app, v } = b
  const d = await start(b, 'APPLICATION FOR PAYMENT', `Application number ${app.number}${app.period_to ? ` - valuation to ${fmtDate(app.period_to)}` : ''}`, `Ref ${b.job.job_number ?? ''} App ${app.number}`.trim())
  d.setCols([{ label: 'Description', x: 44, align: 'l' }, { label: 'Contract', x: 310, align: 'r' }, { label: '%', x: 340, align: 'r' }, { label: 'To date', x: 405, align: 'r' }, { label: 'Previous', x: 475, align: 'r' }, { label: 'This app.', x: 555, align: 'r' }])
  const groups = [...new Set(b.lines.map((l) => l.group_name))]
  for (const g of groups) {
    const ls = b.lines.filter((l) => l.group_name === g).sort((a, c) => a.sort - c.sort)
    d.row([g.toUpperCase(), '', '', '', '', ''], { bold: true, tinted: true })
    for (const l of ls) {
      const prev = b.prev.get(l.line_key) ?? 0
      const pct = l.contract_pence ? Math.round((l.to_date_pence / l.contract_pence) * 1000) / 10 : 0
      d.row([l.description, formatGBP(l.contract_pence), String(pct), formatGBP(l.to_date_pence), formatGBP(prev), formatGBP(l.to_date_pence - prev)])
    }
  }
  const contract = b.lines.reduce((a, l) => a + l.contract_pence, 0)
  d.sums([
    ['Contract sum including approved variations', formatGBP(contract)],
    ['Gross value of work to date', formatGBP(v.grossToDate)],
    ...(app.retention_pct ? [[`Less retention held (${app.retention_pct}%)`, '-' + formatGBP(v.retentionHeld)] as [string, string]] : []),
    ['Net value to date', formatGBP(v.netToDate)],
    ['Less previously applied for', '-' + formatGBP(b.before?.netToDate ?? 0)],
    ['This application, excluding VAT', formatGBP(v.thisNet), true],
    [app.reverse_charge ? 'VAT (domestic reverse charge)' : `VAT at ${app.vat_rate}%`, app.reverse_charge ? formatGBP(0) : formatGBP(v.vat)],
    ...(app.cis_on ? [[`Less CIS deduction (${app.cis_rate}% of labour)`, '-' + formatGBP(v.cis)] as [string, string]] : []),
    ['Amount now due', formatGBP(v.due), true],
  ])
  d.down(4)
  if (app.reverse_charge) d.para('Domestic reverse charge: customer to pay the VAT due on this supply to HMRC. VAT Act 1994, section 55A.')
  if (app.notes) { d.para(app.notes, 9, d.ink) }
  if (b.company.terms) d.para(b.company.terms)
  if (b.company.bank) { d.down(4); d.para('Payment details: ' + b.company.bank.replace(/\n/g, ', '), 8.5, d.ink) }
  return d.finish()
}

// ---------------------------------------------------------------- invoice
export async function buildInvoicePdf(b: DocBase & { inv: Invoice; ref: string }): Promise<Uint8Array> {
  const { inv } = b
  const t = invoiceTotals(inv.net_pence, inv.vat_rate, inv.reverse_charge)
  const d = await start(b, 'INVOICE', inv.kind === 'deposit' ? 'Deposit' : inv.kind === 'balance' ? 'Balance' : 'Stage payment', `Invoice ${b.ref}`, inv.due_date ? [`Payment due ${fmtDate(inv.due_date)}`] : [])
  d.setCols([{ label: 'Description', x: 44, align: 'l' }, { label: 'Net', x: 555, align: 'r' }])
  d.row([inv.description || 'Electrical works', formatGBP(t.net)])
  d.sums([
    ['Total excluding VAT', formatGBP(t.net)],
    [inv.reverse_charge ? 'VAT (domestic reverse charge)' : `VAT at ${inv.vat_rate}%`, formatGBP(t.vat)],
    ['Total due', formatGBP(t.total), true],
  ])
  d.down(4)
  if (inv.reverse_charge) d.para('Domestic reverse charge: customer to pay the VAT due on this supply to HMRC. VAT Act 1994, section 55A.')
  if (inv.notes) d.para(inv.notes, 9, d.ink)
  if (b.company.terms) d.para(b.company.terms)
  if (b.company.bank) { d.down(4); d.para('Payment details: ' + b.company.bank.replace(/\n/g, ', '), 8.5, d.ink) }
  return d.finish()
}
