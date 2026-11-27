import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import RateGrid, { type Col } from '../../components/RateGrid'
import { useAuth } from '../../lib/auth'
import { CATEGORIES, useAllPrices, useEstSettings, useMaterials, useSuppliers, type Material, type MaterialPrice } from '../../lib/estimating/data'
import { bestPrice, cheapestPrice, costPerUnit, isStale, netCost, sellPerUnit } from '../../lib/estimating/pricing'
import PriceAge from '../../components/PriceAge'
import { formatGBP } from '../../lib/money'
import { newId, save, saveBatch } from '../../lib/sync/store'

// pence per unit can be fractional (23.4p a metre)
export const fmtUnit = (p: number) => (p >= 100 ? formatGBP(Math.round(p)) : `${Number(p.toFixed(2))}p`)
const today = () => new Date().toISOString().slice(0, 10)
const PAGE = 100

export function MaterialList() {
  const { can, profile } = useAuth()
  const isOwner = profile?.preset === 'owner'
  const materials = useMaterials()
  const prices = useAllPrices()
  const suppliers = useSuppliers()
  const settings = useEstSettings()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [flag, setFlag] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const seeCost = can('estimates.view_cost')
  const supName = useMemo(() => new Map((suppliers ?? []).map((s) => [s.id, s.name])), [suppliers])

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (materials ?? [])
      .filter((m) => m.active !== false)
      .filter((m) => !cat || m.category === cat)
      .filter((m) => !t || `${m.code ?? ''} ${m.description}`.toLowerCase().includes(t) || (prices?.get(m.id) ?? []).some((p) => (p.supplier_code ?? '').toLowerCase().includes(t)))
      .filter((m) => {
        if (!flag) return true
        const ps = prices?.get(m.id) ?? []
        return flag === 'none' ? !ps.length : ps.length > 0 && ps.some((p) => isStale(p.price_date, settings.stale_days))
      })
      .sort((a, b) => a.description.localeCompare(b.description))
  }, [materials, prices, q, cat, flag, settings.stale_days])

  if (!can('estimates.view')) return <><h1>Materials</h1><p className="muted">You don't have permission to see estimating data.</p></>

  async function add() {
    const id = newId()
    await save('materials', id, { description: 'New material', unit: 'each', active: true })
    nav(`/more/estimating/materials/${id}`)
  }

  return (
    <>
      <p><Link to="/more/estimating">← Estimating data</Link></p>
      <div className="rowtop">
        <h1>Materials</h1>
        {can('estimates.edit') && (
          <div className="actions" style={{ margin: 0 }}>
            <Link className="btn" to="/more/estimating/import" style={{ display: 'inline-grid', placeItems: 'center', textDecoration: 'none' }}>Import prices</Link>
            <button className="btn primary" style={{ width: 'auto', marginTop: 0 }} onClick={add}>+ New</button>
          </div>
        )}
      </div>
      <div className="toolbar">
        <input type="text" placeholder="Search code, description or supplier code…" value={q} onChange={(e) => (setQ(e.target.value), setLimit(PAGE))} aria-label="Search materials" />
        <select value={cat} onChange={(e) => (setCat(e.target.value), setLimit(PAGE))} aria-label="Category">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={flag} onChange={(e) => (setFlag(e.target.value), setLimit(PAGE))} aria-label="Price check">
          <option value="">All prices</option>
          <option value="stale">Stale prices</option>
          <option value="none">No price yet</option>
        </select>
      </div>
      {!materials && <p className="muted">Loading…</p>}
      {materials && <p className="muted small">{shown.length} material{shown.length === 1 ? '' : 's'}</p>}
      {materials && !materials.length && <div className="card"><p className="muted">No materials yet. Use <strong>Import prices</strong> with a Rexel or TLC file, or add one with + New.</p></div>}

      {shown.slice(0, limit).map((m) => {
        const ps = prices?.get(m.id) ?? []
        const best = bestPrice(ps, m.preferred_supplier_id)
        const markup = m.markup_pct ?? settings.default_markup_pct
        const cost = best ? costPerUnit(best.price) : null
        return (
          <div key={m.id} style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
          <Link to={`/more/estimating/materials/${m.id}`} className="card linkcard" style={{ flex: 1, minWidth: 0 }}>
            <span className="muted small">{m.code ?? ''}{m.category ? ` · ${m.category}` : ''}</span>
            <strong>{m.description}</strong>
            <span className="muted">
              {best && cost !== null
                ? <>{seeCost && <>{supName.get(best.price.supplier_id)} {fmtUnit(cost)} · </>}sell <strong>{fmtUnit(sellPerUnit(cost, markup))}</strong> per {m.unit}{ps.length > 1 && <> · {best.reason === 'preferred' ? 'preferred supplier' : 'cheapest of ' + ps.length}</>}</>
                : 'No price yet'}
              {best && <> · <PriceAge date={best.price.price_date} staleDays={settings.stale_days} /></>}
            </span>
          </Link>
          {isOwner && (
            <button type="button" className="btn" aria-label={`Delete ${m.description}`} title="Delete this material" style={{ width: 52, flex: 'none', marginTop: 0, alignSelf: 'center', fontSize: '1.3rem' }}
              onClick={async () => {
                if (!confirm('Delete ' + m.description + ' and its supplier prices?')) return
                const now = new Date().toISOString()
                await saveBatch([...ps.map((p) => ({ tbl: 'material_prices' as const, id: p.id, patch: { deleted_at: now } })), { tbl: 'materials' as const, id: m.id, patch: { deleted_at: now } }])
              }}>🗑</button>
          )}
          </div>
        )
      })}
      {shown.length > limit && <button className="btn" onClick={() => setLimit(limit + PAGE)}>Show more ({shown.length - limit} left)</button>}
    </>
  )
}

export function MaterialDetail() {
  const { id = '' } = useParams()
  const { can, profile } = useAuth()
  const nav = useNavigate()
  const materials = useMaterials()
  const allPrices = useAllPrices()
  const suppliers = useSuppliers()
  const settings = useEstSettings()
  const material = materials?.find((m) => m.id === id)
  const prices = allPrices?.get(id) ?? []
  const editable = can('estimates.edit')
  const seeCost = can('estimates.view_cost')

  if (!can('estimates.view')) return <><h1>Material</h1><p className="muted">You don't have permission to see estimating data.</p></>
  if (!materials || !suppliers) return <p className="muted">Loading…</p>
  if (!material) return <><p><Link to="/more/estimating/materials">← Materials</Link></p><div className="card"><p>That material isn't on this device.</p></div></>

  const supplierOpts: [string, string][] = suppliers.map((s) => [s.id, s.name])
  const cols: Col[] = [
    { key: 'description', label: 'Description', kind: 'text', wide: true },
    { key: 'code', label: 'Your code', kind: 'text', nullable: true },
    { key: 'category', label: 'Category', kind: 'text', nullable: true, list: CATEGORIES },
    { key: 'unit', label: 'Unit', kind: 'text' },
    { key: 'labour_hours', label: 'Labour units (hours per unit)', kind: 'number', nullable: true },
    { key: 'markup_pct', label: `Markup (empty = default ${settings.default_markup_pct}%)`, kind: 'percent', nullable: true, hidden: !seeCost },
    { key: 'preferred_supplier_id', label: 'Preferred supplier', kind: 'select', options: [['', 'None (use the cheapest)'], ...supplierOpts] },
    { key: 'notes', label: 'Notes', kind: 'text', nullable: true, wide: true },
    { key: 'active', label: 'In use', kind: 'bool' },
  ]
  const priceCols: Col[] = [
    { key: 'supplier_id', label: 'Supplier', kind: 'select', options: supplierOpts },
    { key: 'supplier_code', label: "Supplier's code", kind: 'text', nullable: true },
    { key: 'list_pence', label: 'List price', kind: 'money', nullable: true, hidden: !seeCost },
    { key: 'discount_pct', label: 'Discount', kind: 'percent', nullable: true, hidden: !seeCost },
    { key: 'cost_pence', label: 'Your cost', kind: 'money', hidden: !seeCost },
    { key: 'per_qty', label: 'Price is per', kind: 'number' },
    { key: 'price_date', label: 'Price checked on', kind: 'date' },
  ]
  const best = bestPrice(prices, material.preferred_supplier_id)
  const cheapest = cheapestPrice(prices)
  const supName = new Map(suppliers.map((s) => [s.id, s.name]))
  const markup = material.markup_pct ?? settings.default_markup_pct

  return (
    <>
      <p><Link to="/more/estimating/materials">← Materials</Link></p>
      <h1>{material.description}</h1>
      <RateGrid tbl="materials" rows={[material as Material]} cols={cols} editable={editable} newDefaults={{}} addLabel="" />

      <h2>Supplier prices</h2>
      {best && <p className="muted">Estimates use <strong>{supName.get(best.price.supplier_id)}</strong> ({best.reason === 'preferred' ? 'preferred supplier' : 'cheapest'}): sell <strong>{fmtUnit(sellPerUnit(costPerUnit(best.price), markup))}</strong> per {material.unit}.</p>}
      <RateGrid
        tbl="material_prices"
        rows={prices as MaterialPrice[]}
        cols={priceCols}
        editable={editable}
        newDefaults={{ material_id: id, supplier_id: material.preferred_supplier_id ?? suppliers[0]?.id, cost_pence: 0, per_qty: 1, price_date: today(), source: 'Entered by hand' }}
        addLabel="Add a supplier price"
        empty="No prices yet."
        extra={(r) => {
          const p = r as MaterialPrice
          return (
            <p className="small" style={{ margin: '8px 0 0' }}>
              {cheapest?.id === p.id && prices.length > 1 && <span className="tag">cheapest</span>}{' '}
              {material.preferred_supplier_id === p.supplier_id && <span className="tag">preferred</span>}{' '}
              <PriceAge date={p.price_date} staleDays={settings.stale_days} />
              {editable && seeCost && p.list_pence != null && p.discount_pct != null && netCost(p.list_pence, p.discount_pct) !== p.cost_pence && (
                <> <button className="link small" onClick={() => save('material_prices', p.id, { cost_pence: netCost(p.list_pence!, p.discount_pct!) })}>Set cost to list less discount ({formatGBP(netCost(p.list_pence, p.discount_pct))})</button></>
              )}
              {editable && <> <button className="link small" onClick={() => save('material_prices', p.id, { price_date: today() })}>Mark as checked today</button></>}
            </p>
          )
        }}
      />

      {profile?.preset === 'owner' && (
        <div className="card" style={{ marginTop: 24 }}>
          <h2>Delete this material</h2>
          <p className="muted small">Takes it out of the materials list and its supplier prices with it. Estimates that already use it keep their lines and prices as they are. Only owners can do this.</p>
          <button className="btn" onClick={async () => {
            if (!confirm('Delete ' + material.description + ' and its supplier prices?')) return
            const now = new Date().toISOString()
            await saveBatch([...prices.map((p) => ({ tbl: 'material_prices' as const, id: p.id, patch: { deleted_at: now } })), { tbl: 'materials' as const, id: material.id, patch: { deleted_at: now } }])
            nav('/more/estimating/materials')
          }}>Delete material</button>
        </div>
      )}
    </>
  )
}
