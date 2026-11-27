// Reading a price file (CSV, TSV or Excel) into rows of text. Nothing is uploaded: it is read on this device.

// CSV/TSV text -> rows. Handles quotes, doubled quotes, a leading BOM, and picks comma / semicolon / tab by what the first line uses.
export function parseDelimited(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const first = src.split(/\r?\n/, 1)[0] ?? ''
  const counts: [string, number][] = [',', ';', '\t'].map((d) => [d, first.split(d).length - 1])
  const delim = counts.sort((a, b) => b[1] - a[1])[0][0]
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQ = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQ) {
      if (c === '"') {
        if (src[i + 1] === '"') (cell += '"'), i++
        else inQ = false
      } else cell += c
    } else if (c === '"') inQ = true
    else if (c === delim) (row.push(cell), (cell = ''))
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length) (row.push(cell), rows.push(row))
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''))
}

type CellValue = string | number | boolean | Date | null | undefined | { text?: string; result?: unknown; richText?: { text: string }[] }
function cellText(v: CellValue): string {
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    if ('richText' in v && v.richText) return v.richText.map((r) => r.text).join('')
    if ('result' in v) return cellText(v.result as CellValue)
    if ('text' in v) return String(v.text ?? '')
    return ''
  }
  return String(v).trim()
}

export async function readTable(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase()
  if (/\.xlsx$/.test(name)) {
    const { default: ExcelJS } = await import('exceljs') // loaded only when someone imports an Excel file
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await file.arrayBuffer())
    const ws = wb.worksheets[0]
    if (!ws) return []
    const rows: string[][] = []
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = []
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cells[col - 1] = cellText(cell.value as CellValue)
      })
      rows.push(Array.from(cells, (c) => c ?? ''))
    })
    return rows.filter((r) => r.some((c) => c !== ''))
  }
  if (/\.xls$/.test(name)) throw new Error('Old .xls files can\'t be read. Open it in Excel and save as .xlsx or .csv, then try again.')
  return parseDelimited(await file.text())
}
