import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import RateGrid, { type Col } from '../../components/RateGrid'
import MaterialPicker from '../../components/MaterialPicker'
import PriceAge from '../../components/PriceAge'
import { useAuth } from '../../lib/auth'
import { assemblyTotals } from '../../lib/estimating/assembly'
import { CATEGORIES, useAllPrices, useAssemblies, useAssemblyItems, useEstSettings, useMaterials, type Assembly, type Material } from '../../lib/estimating/data'
import { bestPrice, isStale } from '../../lib/estimating/pricing'
import { formatGBP } from '../../lib/money'
import { newId, remove, save } from '../../lib/sync/store'

export function AssemblyList() {
  const { can } = useAuth()
  const assemblies = useAssemblies()
  const nav = useNavigate()
  if (!can('estimates.view')) return <><h1>Assemblies</h1><p className="muted">You don't have permission to see estimating data.</p></>
  return (
    <>
      <p><Link to="/more/estimating">← Estimating data</Link></p>
      <div className="rowtop">
        <h1>Assemblies</h1>
        {can('estimates.edit') && <button className="btn primary" style={{ width: 'auto', marginTop: 0 }} onClick={async () => { const id = newId(); await save('assemblies', id, { name: 'New assembly', extra_labour_hours: 0, active: true }); nav(`/more/estimating/assemblies/${id}`) }}>+ New</button>}
      </div>
      <p className="muted">A kit of materials plus labour, e.g. "Double socket on a dry-lined wall": back box, socket, cable, clips. Add the whole kit to an estimate in one go.</p>
      {assemblies && !assemblies.length && <div className="card"><p className="muted">No assemblies yet.</p></div>}
      {assemblies?.filter((a) => a.active !== false).map((a) => (
        <Link key={a.id} to={`/more/estimating/assemblies/${a.id}`} className="card linkcard">
          <strong>{a.name}</strong><span className="muted">{[a.code, a.category].filter(Boolean).join(' · ')}</span>
        </Link>
      ))}
    </>
  )
}

export function AssemblyDetail() {
  const { id = '' } = useParams()
  const { can } = useAuth()
  const assemblies = useAssemblies()
  const items = useAssemblyItems(id)
  const materials = useMaterials()
  const prices = useAllPrices()
  const settings = useEstSettings()
  const [warn, setWarn] = useState<string[]>([])
  const editable = can('estimates.edit')
  const seeCost = can('estimates.view_cost')
  const byId = useMemo(() => new Map((materials ?? []).map((m) => [m.id, m])), [materials])
  const assembly = assemblies?.find((a) => a.id === id)

  if (!can('estimates.view')) return <><h1>Assembly</h1><p className="muted">You don't have permission to see estimating data.</p></>
  if (!assemblies || !materials || !prices || !items) return <p className="muted">Loading…</p>
  if (!assembly) return <><p><Link to="/more/estimating/assemblies">← Assemblies</Link></p><div className="card"><p>That assembly isn't on this device.</p></div></>

  const cols: Col[] = [
    { key: 'name', label: 'Name', kind: 'text', wide: true },
    { key: 'code', label: 'Code', kind: 'text', nullable: true },
    { key: 'category', label: 'Category', kind: 'text', nullable: true, list: CATEGORIES },
    { key: 'extra_labour_hours', label: 'Extra labour hours (on top of the materials)', kind: 'number' },
    { key: 'description', label: 'Description', kind: 'text', nullable: true, wide: true },
    { key: 'active', label: 'In use', kind: 'bool' },
  ]
  const t = assemblyTotals(items, byId, prices, settings.default_markup_pct, assembly.extra_labour_hours ?? 0)

  function add(m: Material) {
    // warn when the price an estimate would use is over the limit (about 6 months), or missing
    const ps = prices!.get(m.id) ?? []
    const best = bestPrice(ps, m.preferred_supplier_id)
    const notes: string[] = []
    if (!best) notes.push(`${m.description} has no price yet, so it counts as £0.`)
    else if (isStale(best.price.price_date, settings.stale_days)) notes.push(`The price for ${m.description} is over ${Math.round(settings.stale_days / 30)} months old. Check it with the supplier.`)
    setWarn(notes)
    void save('assembly_items', newId(), { assembly_id: id, material_id: m.id, qty: 1, sort: (items!.at(-1)?.sort ?? 0) + 10 })
  }

  return (
    <>
      <p><Link to="/more/estimating/assemblies">← Assemblies</Link></p>
      <h1>{assembly.name}</h1>
      <RateGrid tbl="assemblies" rows={[assembly as Assembly]} cols={cols} editable={editable} newDefaults={{}} addLabel="" />

      <div className="card">
        <h2>Contents</h2>
        {!items.length && <p className="muted">Nothing in this assembly yet.</p>}
        {items.map((it) => {
          const m = byId.get(it.material_id)
          const best = m ? bestPrice(prices.get(m.id) ?? [], m.preferred_supplier_id) : null
          return (
            <div key={it.id} className="setrow">
              <div style={{ flex: '1 1 220px' }}>
                <strong>{m?.description ?? 'Unknown material'}</strong>
                <div className="muted small">{best ? <PriceAge date={best.price.price_date} staleDays={settings.stale_days} /> : '⚠ no price yet'}</div>
              </div>
              <div className="f" style={{ flex: '0 0 110px' }}>
                <label htmlFor={'q' + it.id}>Quantity</label>
                <input id={'q' + it.id} key={String(it.qty)} type="text" inputMode="decimal" disabled={!editable} defaultValue={String(it.qty)} onBlur={(e) => { const n = Number(e.target.value); if (Number.isFinite(n) && n > 0 && n !== it.qty) void save('assembly_items', it.id, { qty: n }) }} />
              </div>
              {editable && <button className="btn" onClick={() => remove('assembly_items', it.id)}>Remove</button>}
            </div>
          )
        })}
        {!!warn.length && <div className="warnbox" role="alert">{warn.map((w) => <p key={w}>⚠ {w}</p>)}</div>}
        {editable && <MaterialPicker materials={materials} prices={prices} staleDays={settings.stale_days} defaultMarkup={settings.default_markup_pct} seeCost={seeCost} onPick={add} />}
      </div>

      <div className="card">
        <h2>Worked out</h2>
        <p>Labour: <strong>{t.labourHours} hours</strong></p>
        {seeCost && <p>Materials cost: <strong>{formatGBP(t.costPence)}</strong></p>}
        <p>Materials sell (with markup): <strong>{formatGBP(t.sellPence)}</strong></p>
        {!!t.missing.length && <p className="err">No price for: {t.missing.join(', ')}</p>}
      </div>
    </>
  )
}
