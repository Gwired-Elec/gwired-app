// Makes docs/sow-template-sample.pdf: a sample scope of works / priced schedule with made-up data.
// Run: node docs/make-sow-sample.cjs
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib')
const fs = require('fs')
const path = require('path')

const gbp = (p) => '£' + (p / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const sections = [
  { code: 'A', name: 'Distribution & Containment', items: [
    ['Supply and install 12-way TP&N distribution board complete with 100A isolator', 1, 'nr', 64500, 'Located in plant room. Existing board removed.'],
    ['Supply and install 50mm galvanised steel trunking, fixed to wall', 85, 'm', 1850, ''],
    ['Supply and install 100mm cable tray, fixed to soffit', 40, 'm', 1425, 'Route to be agreed on site.'],
  ] },
  { code: 'B', name: 'Small Power', items: [
    ['Supply and install twin 13A switched socket outlet, white, flush mounted', 36, 'nr', 8250, 'Includes back box and final connection.'],
    ['Supply and install twin 13A socket with USB-C charging port', 8, 'nr', 10400, ''],
    ['Supply and install floor box with 2 power and 2 data outlets', 6, 'nr', 24800, 'Floor box supplied by others.'],
  ] },
  { code: 'C', name: 'Lighting & Emergency', items: [
    ['Supply and install 600x600 LED recessed panel, 36W, 4000K, to suspended ceiling', 42, 'nr', 7800, ''],
    ['Supply and install maintained emergency luminaire, 3-hour duration', 14, 'nr', 9600, ''],
    ['Supply and install PIR presence detector, ceiling mounted', 10, 'nr', 5400, 'Not dimmable.'],
  ] },
  { code: 'D', name: 'Testing & Certification', items: [
    ['Inspect, test and issue EIC and schedules of test results for all new work', 1, 'sum', 125000, 'Provisional until final quantities confirmed.'],
    ['Emergency lighting commissioning and completion certificate', 1, 'sum', 45000, ''],
  ] },
]
const inclusions = [
  'All labour, materials, plant and equipment needed to complete the works described above.',
  'Making good of chases and penetrations made by G|Wired to a paint-ready finish.',
  'Testing, inspection and certification to BS 7671 (current edition).',
  'Removal of G|Wired waste from site.',
]
const exclusions = [
  'Decoration, builder\'s work and fire-stopping other than to G|Wired penetrations.',
  'Out-of-hours working, unless stated in the schedule above.',
  'Any works to the incoming supply, or DNO charges.',
  'Fire alarm, data cabling and security systems.',
]
const assumptions = [
  'Free and clear access to all working areas during normal working hours.',
  'A suitable supply of temporary power and welfare facilities will be available.',
  'The existing installation is in a safe condition to connect to. Defects found will be reported and priced separately as a variation.',
]

;(async () => {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const W = 841.89, H = 595.28, M = 36 // A4 landscape
  const ink = rgb(0.09, 0.09, 0.1), grey = rgb(0.4, 0.4, 0.43), rule = rgb(0.85, 0.85, 0.87), red = rgb(0.69, 0.12, 0.12), tint = rgb(0.96, 0.96, 0.97)
  let page, y
  const newPage = () => { page = pdf.addPage([W, H]); y = H - M }
  const T = (s, x, size = 9, f = font, color = ink) => page.drawText(s, { x, y, size, font: f, color })
  const R = (s, xr, size = 9, f = font, color = ink) => page.drawText(s, { x: xr - f.widthOfTextAtSize(s, size), y, size, font: f, color })
  const need = (h) => { if (y - h < M + 28) { newPage(); header() } }
  const wrap = (s, f, size, width) => {
    const out = []; let line = ''
    for (const w of s.split(/\s+/).filter(Boolean)) { const t = line ? line + ' ' + w : w; if (f.widthOfTextAtSize(t, size) <= width) line = t; else { out.push(line); line = w } }
    if (line) out.push(line); return out.length ? out : ['']
  }
  // columns (left edges / right edges)
  const cItem = M, cDesc = M + 30, cQty = 440, cUnit = 452, cRate = 548, cTot = 628, cNote = 640, cEnd = W - M
  const header = () => {
    page.drawRectangle({ x: M, y: y - 4, width: cEnd - M, height: 18, color: ink })
    const hy = y; y = hy + 1
    T('Item', cItem + 4, 8, bold, rgb(1, 1, 1)); T('Description of works', cDesc, 8, bold, rgb(1, 1, 1))
    R('Qty', cQty, 8, bold, rgb(1, 1, 1)); T('Unit', cUnit, 8, bold, rgb(1, 1, 1))
    R('Rate', cRate, 8, bold, rgb(1, 1, 1)); R('Total', cTot, 8, bold, rgb(1, 1, 1)); T('Notes', cNote + 8, 8, bold, rgb(1, 1, 1))
    y = hy - 20
  }

  newPage()
  // ---- title block
  page.drawRectangle({ x: M, y: y - 40, width: 40, height: 40, color: ink })
  page.drawText('G', { x: M + 12, y: y - 30, size: 26, font: bold, color: rgb(1, 1, 1) })
  page.drawText('G | WIRED', { x: M + 52, y: y - 20, size: 16, font: bold, color: ink })
  page.drawText('ELECTRICAL SERVICES', { x: M + 52, y: y - 34, size: 7.5, font: bold, color: red })
  const co = ['G|Wired Electrical Services Ltd', '1 Example Road, Anytown, AB1 2CD', '01234 567890  ·  george@gwired.co.uk', 'VAT no. 123 4567 89']
  co.forEach((s, i) => { const f = i ? font : bold; page.drawText(s, { x: cEnd - f.widthOfTextAtSize(s, i ? 8.5 : 10), y: y - 8 - i * 11, size: i ? 8.5 : 10, font: f, color: i ? grey : ink }) })
  y -= 62
  page.drawLine({ start: { x: M, y }, end: { x: cEnd, y }, thickness: 1.2, color: ink })
  y -= 26
  T('SCOPE OF WORKS & PRICED SCHEDULE', M, 18, bold)
  R('Ref  GW-1042 rev A', cEnd, 10, bold); y -= 14
  R('Date  27 November 2026', cEnd, 9, font, grey); y -= 10

  // ---- details boxes
  const box = (x, w, label, rows) => {
    page.drawRectangle({ x, y: y - 62, width: w, height: 66, color: tint })
    page.drawText(label, { x: x + 10, y: y - 8, size: 7.5, font: bold, color: grey })
    rows.forEach((r, i) => page.drawText(r, { x: x + 10, y: y - 22 - i * 12, size: 9, font: i === 0 ? bold : font, color: ink }))
  }
  const bw = (cEnd - M - 20) / 3
  box(M, bw, 'PREPARED FOR', ['Example Construction Ltd', 'Attn: A. Contractor', '2 Client Street, Anytown'])
  box(M + bw + 10, bw, 'SITE', ['Unit 4, Riverside Business Park', 'Anytown, AB3 4EF', 'Contact: Site manager 07700 900123'])
  box(M + 2 * (bw + 10), bw, 'PROJECT', ['Office fit-out: electrical installation', 'Programme: 6 weeks from order', 'Valid for 30 days'])
  y -= 84

  T('SUMMARY OF WORKS', M, 8, bold, grey); y -= 6
  const para = 'Electrical installation to a new office fit-out comprising distribution, containment, small power, lighting and emergency lighting, testing and certification, in accordance with BS 7671 and the drawings and specification listed below.'
  y -= 8
  for (const l of wrap(para, font, 9.5, cEnd - M)) { T(l, M, 9.5); y -= 13 }
  y -= 8

  // ---- schedule
  need(60); header()
  const subtotals = []
  for (const s of sections) {
    need(48)
    page.drawRectangle({ x: M, y: y - 5, width: cEnd - M, height: 17, color: tint })
    T(s.code, cItem + 4, 9.5, bold, red); T(s.name.toUpperCase(), cDesc, 9.5, bold); y -= 20
    let sub = 0
    s.items.forEach((it, i) => {
      const [desc, qty, unit, rate, note] = it
      const total = Math.round(qty * rate); sub += total
      const dl = wrap(desc, font, 8.8, cQty - cDesc - 42), nl = wrap(note, font, 8, cEnd - cNote - 12)
      const rows = Math.max(dl.length, note ? nl.length : 1)
      need(rows * 11 + 8)
      T(`${s.code}.${i + 1}`, cItem + 4, 8.8, font, grey)
      dl.forEach((l, k) => page.drawText(l, { x: cDesc, y: y - k * 11, size: 8.8, font, color: ink }))
      R(String(qty), cQty, 8.8); T(unit, cUnit, 8.8)
      R(gbp(rate), cRate, 8.8); R(gbp(total), cTot, 8.8)
      if (note) nl.forEach((l, k) => page.drawText(l, { x: cNote + 8, y: y - k * 11, size: 8, font, color: grey }))
      y -= rows * 11 + 4
      page.drawLine({ start: { x: M, y: y + 2 }, end: { x: cEnd, y: y + 2 }, thickness: 0.4, color: rule })
      y -= 4
    })
    need(18)
    T(`Total for ${s.name}`, cDesc, 9, bold); R(gbp(sub), cTot, 9.5, bold)
    subtotals.push([s.code, s.name, sub]); y -= 22
  }

  // ---- summary + totals
  need(150)
  const net = subtotals.reduce((a, s) => a + s[2], 0), vat = Math.round(net * 0.2)
  T('SUMMARY', M, 8, bold, grey); y -= 14
  for (const [c, n, v] of subtotals) { T(`${c}   ${n}`, M, 9.5); R(gbp(v), cTot, 9.5); y -= 14 }
  page.drawLine({ start: { x: M, y: y + 6 }, end: { x: cTot, y: y + 6 }, thickness: 0.8, color: ink }); y -= 8
  T('Total excluding VAT', M, 10.5, bold); R(gbp(net), cTot, 10.5, bold); y -= 15
  T('VAT at 20%', M, 9.5); R(gbp(vat), cTot, 9.5); y -= 17
  page.drawRectangle({ x: M, y: y - 6, width: cTot - M, height: 22, color: ink })
  T('TOTAL TO PAY', M + 8, 11, bold, rgb(1, 1, 1)); R(gbp(net + vat), cTot - 8, 11, bold, rgb(1, 1, 1)); y -= 34

  // ---- clauses
  const list = (title, items) => {
    need(28 + items.length * 13); T(title, M, 8, bold, grey); y -= 14
    items.forEach((it, i) => { const ls = wrap(it, font, 9, cEnd - M - 24); need(ls.length * 12 + 4); T(`${i + 1}.`, M, 9, font, grey); ls.forEach((l) => { T(l, M + 20, 9); y -= 12 }); y -= 2 })
    y -= 8
  }
  list('INCLUDED IN THIS PRICE', inclusions)
  list('EXCLUDED FROM THIS PRICE', exclusions)
  list('ASSUMPTIONS', assumptions)
  list('DOCUMENTS THIS PRICE IS BASED ON', ['Drawing E-001 rev C (power and lighting layout), Drawing E-002 rev B (distribution schematic), Specification section M&E rev 2.'])
  list('TERMS', ['Payment: monthly applications, 30 days from invoice. Retention and any other commercial terms are as agreed in the contract.', 'Variations will be priced and agreed in writing before the work is carried out.', 'This price is valid for 30 days from the date above.'])

  // ---- acceptance
  need(90)
  T('ACCEPTANCE', M, 8, bold, grey); y -= 14
  T('To accept this quotation please sign and return a copy, or send us your purchase order quoting reference GW-1042 rev A.', M, 9.5); y -= 30
  const sig = (x, label) => { page.drawLine({ start: { x, y }, end: { x: x + 220, y }, thickness: 0.6, color: ink }); page.drawText(label, { x, y: y - 11, size: 8, font, color: grey }) }
  sig(M, 'Signed for and on behalf of the client'); sig(M + 260, 'Print name and position'); sig(M + 520, 'Date')

  // ---- footers
  const pages = pdf.getPages()
  pages.forEach((p, i) => p.drawText(`G|Wired Electrical Services Ltd  -  GW-1042 rev A  -  page ${i + 1} of ${pages.length}`, { x: M, y: 18, size: 7.5, font, color: grey }))
  const out = path.join(__dirname, 'sow-template-sample.pdf')
  fs.writeFileSync(out, await pdf.save())
  console.log('wrote', out, pages.length, 'pages')
})()
