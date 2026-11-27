import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useAllPrices, useMaterials, useSuppliers, type MaterialPrice } from '../../lib/estimating/data'
import { readTable } from '../../lib/estimating/files'
import { FIELDS, guessMapping, planImport, type Field, type Mapping, type Plan } from '../../lib/estimating/importer'
import { fmtUnit } from './Materials'
import { costPerUnit } from '../../lib/estimating/pricing'
import { db } from '../../lib/sync/db'
import { newId, saveBatch } from '../../lib/sync/store'
import { useLiveQuery } from 'dexie-react-hooks'

const today = () => new Date().toISOString().slice(0, 10)
// the header is the first row with a decent number of filled cells
const detectHeader = (rows: string[][]) => {
  const widest = Math.max(0, ...rows.slice(0, 15).map((r) => r.filter((c) => c).length))
  const i = rows.slice(0, 15).findIndex((r) => r.filter((c) => c).length >= Math.max(2, Math.ceil(widest * 0.6)))
  return Math.max(0, i)
}

export default function ImportPrices() {
  const { can } = useAuth()
  const suppliers = useSuppliers()
  const materials = useMaterials()
  const allPrices = useAllPrices()
  const savedMaps = useLiveQuery(() => db().import_mappings.filter((m) => !m.deleted_at).toArray(), [])
  const [supplierId, setSupplierId] = useState('')
  const [fileName, setFileName] = useState('')
  const [table, setTable] = useState<string[][] | null>(null)
  const [headerRow, setHeaderRow] = useState(1) // 1-based
  const [mapping, setMapping] = useState<Mapping>({})
  const [perQty, setPerQty] = useState('1')
  const [disc, setDisc] = useState('')
  const [unit, setUnit] = useState('each')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [busy, setBusy] = useState('')
  const [done, setDone] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => { if (!supplierId && suppliers?.length) setSupplierId(suppliers[0].id) }, [suppliers, supplierId])

  const headers = table?.[headerRow - 1] ?? []
  const body = table?.slice(headerRow) ?? []
  const saved = savedMaps?.find((m) => m.supplier_id === supplierId)

  // when the file or header row changes, start from the saved map for this supplier, else a guess from the headers
  useEffect(() => {
    if (!table) return
    const sm = saved?.mapping as Mapping | undefined
    setMapping(sm && Object.values(sm).every((i) => (i as number) < headers.length) && Object.keys(sm).length ? sm : guessMapping(headers))
    setPlan(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, headerRow, supplierId, saved?.id])

  const allPriceList = useMemo(() => [...(allPrices?.values() ?? [])].flat() as MaterialPrice[], [allPrices])
  const supName = useMemo(() => new Map((suppliers ?? []).map((s) => [s.id, s.name])), [suppliers])
  const matName = useMemo(() => new Map((materials ?? []).map((m) => [m.id, m.description])), [materials])

  if (!can('estimates.edit')) return <><h1>Import prices</h1><p className="muted">You don't have permission to import prices.</p></>

  async function pick(file: File | undefined) {
    if (!file) return
    setErr(''); setDone(''); setPlan(null); setBusy('Reading the file…')
    try {
      const rows = await readTable(file)
      if (!rows.length) throw new Error('That file looks empty.')
      setFileName(file.name)
      setTable(rows)
      setHeaderRow(detectHeader(rows) + 1)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not read that file.')
      setTable(null)
    }
    setBusy('')
  }

  function check() {
    setErr('')
    if (mapping.description === undefined && mapping.supplier_code === undefined) return setErr('Choose which column holds the description or product code.')
    if (mapping.net === undefined && mapping.list === undefined) return setErr('Choose which column holds the price (net cost, or list price with a discount).')
    const d = disc.trim() === '' ? null : Number(disc)
    if (d !== null && (!Number.isFinite(d) || d < 0 || d > 100)) return setErr('The default discount should be a percentage between 0 and 100.')
    setPlan(planImport(body, mapping, { supplierId, defaultPerQty: Math.max(1, Math.round(Number(perQty)) || 1), defaultDiscountPct: d, defaultUnit: unit.trim() || 'each', source: fileName, today: today() }, materials ?? [], allPriceList))
  }

  async function run() {
    if (!plan) return
    setBusy('Saving…'); setErr('')
    try {
      const CHUNK = 300
      for (let i = 0; i < plan.items.length; i += CHUNK) {
        const batch: Parameters<typeof saveBatch>[0] = []
        for (const it of plan.items.slice(i, i + CHUNK)) {
          let mid = it.materialId
          if (!mid) {
            mid = newId()
            batch.push({ tbl: 'materials', id: mid, patch: { ...it.newMaterial, active: true } })
          }
          batch.push({ tbl: 'material_prices', id: it.priceId ?? newId(), patch: { material_id: mid, ...it.price } })
        }
        await saveBatch(batch)
        setBusy(`Saving… ${Math.min(i + CHUNK, plan.items.length)} of ${plan.items.length}`)
      }
      // remember the column map for next time
      await saveBatch([{ tbl: 'import_mappings', id: saved?.id ?? newId(), patch: { supplier_id: supplierId, mapping } }])
      setDone(`Imported ${plan.items.length} prices from ${fileName}: ${plan.newMaterials} new material${plan.newMaterials === 1 ? '' : 's'}, ${plan.priceChanges} price change${plan.priceChanges === 1 ? '' : 's'}, ${plan.confirmed} confirmed. They will sync in the background.`)
      setPlan(null); setTable(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong while saving.')
    }
    setBusy('')
  }

  const colOptions = headers.map((h, i) => <option key={i} value={i}>{h || `(column ${i + 1})`}</option>)
  return (
    <>
      <p><Link to="/more/estimating/materials">← Materials</Link></p>
      <h1>Import supplier prices</h1>
      <p className="muted">Use a price list or export from Rexel, TLC Direct or anyone else (.csv or .xlsx). The file is read on this device and you see exactly what will change before anything is saved.</p>

      <div className="card">
        <label htmlFor="sup">Supplier</label>
        <select id="sup" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          {suppliers?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <p className="small"><Link to="/more/estimating/suppliers">Add or edit suppliers</Link></p>
        <label htmlFor="file">Price file</label>
        <input id="file" type="file" accept=".csv,.tsv,.txt,.xlsx" onChange={(e) => pick(e.target.files?.[0])} />
        {busy && <p className="muted">{busy}</p>}
      </div>

      {err && <p className="err" role="alert">{err}</p>}
      {done && <div className="card notice"><p className="ok" role="status">{done}</p><Link to="/more/estimating/materials">See the materials</Link></div>}

      {table && (
        <>
          <div className="card">
            <h2>1. Which row has the column names?</h2>
            <label htmlFor="hr">Header row</label>
            <input id="hr" type="text" inputMode="numeric" value={headerRow} onChange={(e) => setHeaderRow(Math.min(Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1), table.length))} style={{ maxWidth: 100 }} />
            <div className="scroll"><table className="mini"><tbody>
              {table.slice(Math.max(0, headerRow - 1), headerRow + 3).map((r, i) => <tr key={i} className={i === 0 ? 'hdr' : ''}>{headers.map((_, c) => <td key={c}>{r[c] ?? ''}</td>)}</tr>)}
            </tbody></table></div>
            <p className="muted small">{body.length} rows below the header.{saved ? ' Using the column map saved for this supplier.' : ''}</p>
          </div>

          <div className="card">
            <h2>2. Match the columns</h2>
            <div className="fieldgrid">
              {FIELDS.map((f) => (
                <div className="f" key={f.key}>
                  <label htmlFor={'map-' + f.key}>{f.label}</label>
                  <select id={'map-' + f.key} value={mapping[f.key] ?? ''} onChange={(e) => (setPlan(null), setMapping((m) => { const n = { ...m }; if (e.target.value === '') delete n[f.key as Field]; else n[f.key as Field] = Number(e.target.value); return n }))}>
                    <option value="">(not in the file)</option>
                    {colOptions}
                  </select>
                  <span className="muted small">{f.hint}</span>
                </div>
              ))}
            </div>
            <h2 style={{ marginTop: 16 }}>3. Anything the file doesn't say</h2>
            <div className="fieldgrid">
              <div className="f"><label htmlFor="pq">Prices are per (quantity)</label><input id="pq" type="text" inputMode="numeric" value={perQty} onChange={(e) => setPerQty(e.target.value)} /><span className="muted small">1 = each. Use 100 if the file prices per 100m. A "Price per" column overrides this.</span></div>
              <div className="f"><label htmlFor="dd">Your discount off list (%)</label><input id="dd" type="text" inputMode="decimal" value={disc} onChange={(e) => setDisc(e.target.value)} /><span className="muted small">Only used when the file has a list price and no discount or net price.</span></div>
              <div className="f"><label htmlFor="du">Unit for new materials</label><input id="du" type="text" value={unit} onChange={(e) => setUnit(e.target.value)} /></div>
            </div>
            <button className="btn primary" onClick={check} disabled={!!busy}>Check the file</button>
          </div>
        </>
      )}

      {plan && (
        <div className="card notice">
          <h2>4. What will happen</h2>
          <ul>
            <li><strong>{plan.newMaterials}</strong> new material{plan.newMaterials === 1 ? '' : 's'} will be added</li>
            <li><strong>{plan.priceChanges}</strong> price{plan.priceChanges === 1 ? '' : 's'} will change or be added</li>
            <li><strong>{plan.confirmed}</strong> price{plan.confirmed === 1 ? ' is' : 's are'} the same, and will just be marked as checked today</li>
            <li><strong>{plan.errors.length}</strong> row{plan.errors.length === 1 ? '' : 's'} can't be used</li>
          </ul>
          {plan.items.filter((i) => i.changed && i.was).slice(0, 8).map((i) => (
            <p key={i.line} className="small" style={{ margin: '0 0 4px' }}>
              {matName.get(i.materialId ?? '') ?? i.newMaterial?.description} ({supName.get(i.price.supplier_id)}): {fmtUnit(costPerUnit(i.was!))} → <strong>{fmtUnit(costPerUnit(i.price))}</strong>
            </p>
          ))}
          {!!plan.errors.length && (
            <details><summary>Rows that can't be used</summary>
              {plan.errors.slice(0, 40).map((e) => <p key={e.line} className="small" style={{ margin: '4px 0' }}>Row {e.line + headerRow}: {e.message}</p>)}
              {plan.errors.length > 40 && <p className="muted small">…and {plan.errors.length - 40} more</p>}
            </details>
          )}
          <div className="actions">
            <button className="btn primary" style={{ width: 'auto' }} onClick={run} disabled={!!busy || !plan.items.length}>{busy || `Import ${plan.items.length} prices`}</button>
            <button className="btn" onClick={() => setPlan(null)}>Cancel</button>
          </div>
        </div>
      )}
    </>
  )
}
