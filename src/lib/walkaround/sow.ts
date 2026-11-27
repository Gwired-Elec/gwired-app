// The scope of works, built from a site walkaround: a PDF (same look as the quote, photos included) and an Excel file.
// No prices are held on a walkaround, so the Rate and Total columns are left blank (and in Excel the Total works itself out
// once a Rate is typed) for whoever is pricing it.
import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib'
import { clean, wrap } from '../estimating/quotePdf'
import { revLetter } from '../estimating/estimate'
import type ExcelJS from 'exceljs'

export interface SowCompany { name: string; address?: string | null; vat_number?: string | null; company_number?: string | null; email?: string | null; phone?: string | null }
export interface SowPhoto { blob: Blob; caption: string | null; width?: number; height?: number }
export interface SowItem { description: string; qty: number; unit: string; notes: string | null; photos?: SowPhoto[] }
export interface SowArea { name: string; notes: string | null; items: SowItem[]; photos: SowPhoto[] } // area photos: only any taken against the whole area
export interface SowInput {
  company: SowCompany
  job: { job_number: string | null; title: string; site_address: string | null }
  client: { name: string; address?: string | null } | null
  areas: SowArea[]
  showRates: boolean // blank Rate and Total columns
  date: Date
  logoPng?: Uint8Array | null
}

const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
const code = (i: number) => revLetter(i + 1)

export async function buildSowPdf(q: SowInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const W = 595.28, H = 841.89, M = 40, R = W - M
  const ink = rgb(0.09, 0.09, 0.1), grey = rgb(0.4, 0.4, 0.43), rule = rgb(0.85, 0.85, 0.87), tint = rgb(0.955, 0.955, 0.965), white = rgb(1, 1, 1), red = rgb(0.69, 0.12, 0.12)
  let page!: PDFPage
  let y = 0
  const text = (s: string, x: number, size = 9, f = font, color = ink) => page.drawText(clean(s), { x, y, size, font: f, color })
  const right = (s: string, xr: number, size = 9, f = font, color = ink) => page.drawText(clean(s), { x: xr - f.widthOfTextAtSize(clean(s), size), y, size, font: f, color })

  const rates = q.showRates
  const xItem = M, xDesc = M + 28
  const cQty = rates ? 290 : 335, xUnit = cQty + 5, cRate = 382, cTot = 444, xNote = rates ? 453 : 378
  const descW = cQty - 34 - xDesc
  const noteW = R - xNote

  const header = () => {
    page.drawRectangle({ x: M, y: y - 5, width: R - M, height: 17, color: ink })
    const top = y
    y = top + 1
    text('Item', xItem + 4, 7.5, bold, white); text('Description of works', xDesc, 7.5, bold, white)
    right('Qty', cQty, 7.5, bold, white); text('Unit', xUnit, 7.5, bold, white)
    if (rates) { right('Rate', cRate, 7.5, bold, white); right('Total', cTot, 7.5, bold, white) }
    text('Notes', xNote, 7.5, bold, white)
    y = top - 22
  }
  const newPage = (withHeader = false) => { page = pdf.addPage([W, H]); y = H - M; if (withHeader) header() }
  const need = (h: number, repeat = false) => { if (y - h < M + 34) newPage(repeat) }
  newPage()

  // a grid of photos starting at x0 across a given width, 'cols' to a row, each with its caption underneath
  const drawPhotos = async (list: SowPhoto[], x0: number, width: number, cols: number) => {
    const gap = 10
    const gw = (width - gap * (cols - 1)) / cols, maxH = gw * 0.75
    for (let i = 0; i < list.length; i += cols) {
      const embedded: { img: Awaited<ReturnType<PDFDocument['embedJpg']>>; cap: string | null }[] = []
      for (const p of list.slice(i, i + cols)) {
        try { embedded.push({ img: await pdf.embedJpg(new Uint8Array(await p.blob.arrayBuffer())), cap: p.caption }) } catch { /* skip a picture that cannot be read */ }
      }
      if (!embedded.length) continue
      const dims = embedded.map((e) => { const sc = Math.min(gw / e.img.width, maxH / e.img.height); return { w: e.img.width * sc, h: e.img.height * sc } })
      const rowHgt = Math.max(...dims.map((d) => d.h)) + 20
      need(rowHgt)
      embedded.forEach((e, k) => {
        const x = x0 + k * (gw + gap)
        page.drawImage(e.img, { x, y: y - dims[k].h, width: dims[k].w, height: dims[k].h })
        if (e.cap) page.drawText(clean(wrap(e.cap, font, 8, gw)[0]), { x, y: y - dims[k].h - 10, size: 8, font, color: grey })
      })
      y -= rowHgt
    }
  }

  // masthead
  const co = q.company
  let logoH = 0
  if (q.logoPng) {
    try {
      const img = await pdf.embedPng(q.logoPng)
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

  text('SCOPE OF WORKS', M, 22, bold)
  right(`Ref ${q.job.job_number ?? 'Scope'}`, R, 10, bold)
  y -= 14
  text('Prepared from a site walkaround', M, 10, font, grey)
  right(`Date ${fmtDate(q.date)}`, R, 9, font, grey)
  y -= 26

  // who it is for, and where
  const boxW = (R - M - 14) / 2
  const forRows = q.client ? [q.client.name, ...wrap(q.client.address ?? '', font, 9, boxW - 20).filter(Boolean)] : ['-']
  const siteRows = [...wrap(q.job.title, bold, 9, boxW - 20), ...(q.job.site_address ? wrap(q.job.site_address, font, 9, boxW - 20) : [])]
  const boxH = 26 + Math.max(forRows.length, siteRows.length) * 12
  const drawBox = (x: number, label: string, rows: string[]) => {
    page.drawRectangle({ x, y: y - boxH + 6, width: boxW, height: boxH, color: tint })
    page.drawText(label, { x: x + 10, y: y - 6, size: 7.5, font: bold, color: grey })
    rows.forEach((r, i) => page.drawText(clean(r), { x: x + 10, y: y - 20 - i * 12, size: 9, font: i === 0 ? bold : font, color: ink }))
  }
  drawBox(M, 'PREPARED FOR', forRows)
  drawBox(M + boxW + 14, 'WORKS AND SITE', siteRows)
  y -= boxH + 14

  need(80)
  header()
  for (let ai = 0; ai < q.areas.length; ai++) {
    const a = q.areas[ai]
    need(60, true)
    page.drawRectangle({ x: M, y: y - 5, width: R - M, height: 17, color: tint })
    y += 0.5
    text(code(ai), xItem + 4, 9.5, bold, red)
    text(a.name.toUpperCase(), xDesc, 9.5, bold)
    y -= 20.5
    if (a.notes && a.notes.trim()) {
      for (const l of wrap(a.notes, font, 8.8, R - xDesc)) { need(13, true); text(l, xDesc, 8.8, font, grey); y -= 11.5 }
      y -= 4
    }
    for (let i = 0; i < a.items.length; i++) {
      const it = a.items[i]
      const dl = wrap(it.description, font, 8.8, descW)
      const nl = it.notes && it.notes.trim() ? wrap(it.notes, font, 7.5, noteW) : []
      const DL = 11, NL = 10, PAD = 6
      const rowH = Math.max(dl.length * DL, nl.length * NL, DL) + PAD * 2
      need(rowH + 2, true)
      const rowTop = y + 12
      const base = (n: number, k: number, lh: number, sz: number) => rowTop - (rowH - n * lh) / 2 - lh / 2 - k * lh - sz * 0.35
      const one = (sz: number) => base(1, 0, DL, sz)
      const put = (s: string, x: number, yy: number, sz: number, f = font, color = ink) => page.drawText(clean(s), { x, y: yy, size: sz, font: f, color })
      const putR = (s: string, xr: number, yy: number, sz: number, f = font, color = ink) => page.drawText(clean(s), { x: xr - f.widthOfTextAtSize(clean(s), sz), y: yy, size: sz, font: f, color })
      put(`${code(ai)}.${i + 1}`, xItem + 4, one(8.5), 8.5, font, grey)
      dl.forEach((r, k) => put(r, xDesc, base(dl.length, k, DL, 8.8), 8.8))
      putR(String(it.qty), cQty, one(8.8), 8.8); put(it.unit.slice(0, 7), xUnit, one(8.5), 8.5, font, grey)
      if (rates) {
        // empty boxes for the person pricing it to fill in
        page.drawRectangle({ x: cRate - 52, y: rowTop - rowH + 4, width: 56, height: rowH - 8, borderColor: rule, borderWidth: 0.6 })
        page.drawRectangle({ x: cTot - 56, y: rowTop - rowH + 4, width: 60, height: rowH - 8, borderColor: rule, borderWidth: 0.6 })
      }
      nl.forEach((r, k) => put(r, xNote, base(nl.length, k, NL, 7.5), 7.5, font, grey))
      const bottom = rowTop - rowH
      page.drawLine({ start: { x: M, y: bottom }, end: { x: R, y: bottom }, thickness: 0.4, color: rule })
      y = bottom - 12
      // this item's photos sit straight under it, three across
      if (it.photos?.length) { y += 4; await drawPhotos(it.photos, xDesc, R - xDesc, 3); y -= 6 }
    }
    if (!a.items.length) { need(14, true); text('No items listed for this area.', xDesc, 8.8, font, grey); y -= 14 }

    // photos taken against the whole area (from before photos belonged to items)
    if (a.photos.length) {
      y -= 2
      need(30)
      text(`OTHER PHOTOS: ${a.name.toUpperCase()}`, M, 7.5, bold, grey)
      y -= 10
      await drawPhotos(a.photos, M, R - M, 2)
      y -= 4
    }
    y -= 8
  }

  const pages = pdf.getPages()
  pages.forEach((p, i) => p.drawText(clean(`${co.name}  -  Scope of works ${q.job.job_number ?? ''}  -  page ${i + 1} of ${pages.length}`), { x: M, y: 22, size: 8, font, color: grey }))
  return pdf.save()
}

// ---------------------------------------------------------------- Excel
export async function buildSowXlsx(q: SowInput): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs') // loaded only when someone exports to Excel
  const wb = new ExcelJS.Workbook()
  wb.creator = q.company.name
  const ws = wb.addWorksheet('Scope of works', { pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } })
  const rates = q.showRates
  const cols = rates ? ['Item', 'Description of works', 'Qty', 'Unit', 'Rate', 'Total', 'Notes'] : ['Item', 'Description of works', 'Qty', 'Unit', 'Notes']
  ws.columns = (rates ? [8, 52, 9, 8, 13, 14, 40] : [8, 60, 9, 8, 50]).map((width) => ({ width }))
  const last = cols.length
  const line = (text: string, o: { bold?: boolean; size?: number; grey?: boolean } = {}) => {
    const r = ws.addRow([text])
    ws.mergeCells(r.number, 1, r.number, last)
    r.getCell(1).font = { bold: o.bold, size: o.size ?? 10, color: o.grey ? { argb: 'FF666666' } : undefined }
    return r
  }
  line(q.company.name, { bold: true, size: 14 })
  line('SCOPE OF WORKS', { bold: true, size: 16 })
  line(`Ref ${q.job.job_number ?? ''}    Date ${fmtDate(q.date)}`, { grey: true })
  if (q.client) line(`For: ${q.client.name}${q.client.address ? ', ' + q.client.address.replace(/\n/g, ', ') : ''}`)
  line(`Works: ${q.job.title}${q.job.site_address ? ', ' + q.job.site_address : ''}`)
  ws.addRow([])
  const head = ws.addRow(cols)
  head.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17171A' } }; c.alignment = { vertical: 'middle', horizontal: 'left' } })
  head.height = 20
  ws.views = [{ state: 'frozen', ySplit: head.number }]
  const money = '"£"#,##0.00'
  // Pictures go in their own rows under the item, up to three across, each about 112 x 84 pixels (the sheet stays a sensible size)
  const colBpx = (rates ? 52 : 60) * 7 + 5 // width of column B in pixels, to place pictures inside it
  const putPhotos = async (list: SowPhoto[]) => {
    for (let i = 0; i < list.length; i += 3) {
      const row = ws.addRow([])
      row.height = 68
      for (let k = 0; k < Math.min(3, list.length - i); k++) {
        const p = list[i + k]
        const ratio = p.width && p.height ? p.width / p.height : 4 / 3
        const w = ratio >= 112 / 84 ? 112 : Math.round(84 * ratio)
        const h = ratio >= 112 / 84 ? Math.round(112 / ratio) : 84
        const id = wb.addImage({ buffer: (await p.blob.arrayBuffer()) as unknown as ExcelJS.Buffer, extension: 'jpeg' })
        ws.addImage(id, { tl: { col: 1 + (k * 120 + 4) / colBpx, row: row.number - 1 + 0.04 }, ext: { width: w, height: h } })
      }
    }
  }
  const totalRows: number[] = []

  for (let ai = 0; ai < q.areas.length; ai++) {
    const a = q.areas[ai]
    const band = ws.addRow([code(ai), a.name.toUpperCase()])
    ws.mergeCells(band.number, 2, band.number, last)
    band.eachCell({ includeEmpty: true }, (c) => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F1F4' } } })
    band.getCell(1).font = { bold: true, color: { argb: 'FFB01E1E' } }
    if (a.notes && a.notes.trim()) {
      const n = ws.addRow(['', a.notes.trim()])
      ws.mergeCells(n.number, 2, n.number, last)
      n.getCell(2).font = { italic: true, color: { argb: 'FF666666' } }
      n.getCell(2).alignment = { wrapText: true, vertical: 'top' }
      n.height = Math.max(15, Math.ceil(a.notes.length / 95) * 15)
    }
    for (let i = 0; i < a.items.length; i++) {
      const it = a.items[i]
      const r = rates
        ? ws.addRow([`${code(ai)}.${i + 1}`, it.description, it.qty, it.unit, null, null, it.notes ?? ''])
        : ws.addRow([`${code(ai)}.${i + 1}`, it.description, it.qty, it.unit, it.notes ?? ''])
      if (rates) {
        r.getCell(6).value = { formula: `IF(E${r.number}="","",C${r.number}*E${r.number})` }
        r.getCell(5).numFmt = money
        r.getCell(6).numFmt = money
        r.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8DC' } } // yellow: type the rate here
        totalRows.push(r.number)
      }
      r.eachCell({ includeEmpty: true }, (c) => { c.alignment = { vertical: 'middle', wrapText: true }; c.border = { bottom: { style: 'hair', color: { argb: 'FFBBBBBB' } } } })
      r.getCell(1).font = { color: { argb: 'FF666666' } }
      r.getCell(3).alignment = { vertical: 'middle', horizontal: 'right' }
      r.getCell(last).font = { color: { argb: 'FF666666' }, size: 9 }
      r.height = Math.max(16, Math.ceil(it.description.length / 55) * 15)
      if (it.photos?.length) await putPhotos(it.photos)
    }
    if (a.photos.length) await putPhotos(a.photos)
    ws.addRow([])
  }

  if (rates && totalRows.length) {
    const t = ws.addRow([])
    t.getCell(2).value = 'Total excluding VAT'
    t.getCell(2).font = { bold: true }
    t.getCell(6).value = { formula: `SUM(F${totalRows[0]}:F${totalRows[totalRows.length - 1]})` }
    t.getCell(6).numFmt = money
    t.getCell(6).font = { bold: true }
    const note = ws.addRow(['', 'Type each rate in the yellow cells. Totals and this sum work themselves out.'])
    note.getCell(2).font = { italic: true, size: 9, color: { argb: 'FF666666' } }
  }
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>
}
