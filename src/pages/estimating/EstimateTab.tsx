import { useMemo, useState } from 'react'
import MaterialPicker from '../../components/MaterialPicker'
import PriceAge from '../../components/PriceAge'
import { useAuth } from '../../lib/auth'
import {
  useAllPrices, useAssemblies, useEstSettings, useLabourRates, useMaterials, usePointRates, usePrelims, useSuppliers,
  type Material,
} from '../../lib/estimating/data'
import { estimateTotals, lineCost, lineHours, lineSell, revLetter, type Totals } from '../../lib/estimating/estimate'
import { perUnitText, useJobEstimates, type Estimate, type Line, type Section } from '../../lib/estimating/estimates'
import { planJobPrice } from '../../lib/estimating/learn'
import { bestPrice, costPerUnit, isStale, priceAndPer, sellPerUnit } from '../../lib/estimating/pricing'
import type { Job } from '../../lib/jobs'
import { formatGBP } from '../../lib/money'
import { db, WRITABLE } from '../../lib/sync/db'
import { logActivity, newId, remove, save, saveBatch } from '../../lib/sync/store'
import { METHODS } from '../../lib/estimating/data'
import { buildQuotePdf } from '../../lib/estimating/quotePdf'
import { cachedCompany, loadCompany } from '../../lib/company'
import { useClients } from '../../lib/jobs'

const today = () => new Date().toISOString().slice(0, 10)
const r4 = (n: number) => Number(n.toFixed(4))
type User = { id: string; name: string }
const MODES: [string, string][] = [['material', 'Material'], ['point', 'Price per point'], ['day', 'Day rate'], ['assembly', 'Assembly'], ['prelim', 'Prelim'], ['own', 'Own item']]

// ---------------------------------------------------------------- the Estimate tab on a job
export default function EstimateTab({ job, user }: { job: Job; user: User }) {
  const { can } = useAuth()
  const data = useJobEstimates(job.id)
  const settings = useEstSettings()
  const labour = useLabourRates()
  const [sel, setSel] = useState('')

  if (!can('estimates.view')) return <div className="card"><p className="muted">You don't have permission to see estimates.</p></div>
  if (!data || !labour) return <p className="muted">Loading…</p>
  const { estimates, sections, lines } = data
  const est = estimates.find((e) => e.id === sel) ?? estimates.at(-1)
  const canEdit = can('estimates.edit')

  // a new estimate (first one, or a revision copied from an earlier one)
  async function create(from?: Estimate) {
    const id = newId()
    const rev = (estimates.at(-1)?.rev ?? 0) + 1
    const method = from?.method ?? (settings.method_defaults?.[job.job_type] as Estimate['method']) ?? 'units'
    const items: { tbl: 'estimates' | 'estimate_sections' | 'estimate_lines'; id: string; patch: Record<string, unknown> }[] = [{
      tbl: 'estimates', id,
      patch: {
        job_id: job.id, rev, status: 'draft', method, labour_rate_id: from?.labour_rate_id ?? labour!.find((l) => l.active !== false)?.id ?? null,
        ohp_mode: from?.ohp_mode ?? 'combined', ohp_pct: from?.ohp_pct ?? settings.oh_pct + settings.profit_pct,
        ohp_materials_pct: from?.ohp_materials_pct ?? settings.oh_pct + settings.profit_pct, ohp_labour_pct: from?.ohp_labour_pct ?? settings.oh_pct + settings.profit_pct, contingency_pct: from?.contingency_pct ?? settings.contingency_pct,
        discount_pct: from?.discount_pct ?? 0, vat_rate: from?.vat_rate ?? settings.vat_rate, reverse_charge: from?.reverse_charge ?? false, notes: from?.notes ?? null,
      },
    }]
    if (from) {
      const map = new Map<string, string>()
      for (const s of sections.filter((x) => x.estimate_id === from.id)) {
        const sid = newId()
        map.set(s.id, sid)
        items.push({ tbl: 'estimate_sections', id: sid, patch: { estimate_id: id, name: s.name, sort: s.sort } })
      }
      for (const l of lines.filter((x) => x.estimate_id === from.id)) {
        const patch: Record<string, unknown> = {}
        for (const k of WRITABLE.estimate_lines) if (k !== 'deleted_at') patch[k] = (l as Record<string, unknown>)[k] ?? null
        patch.estimate_id = id
        patch.section_id = l.section_id ? map.get(l.section_id) ?? null : null
        items.push({ tbl: 'estimate_lines', id: newId(), patch })
      }
      if (from.status === 'issued') items.push({ tbl: 'estimates', id: from.id, patch: { status: 'superseded' } })
    } else {
      items.push({ tbl: 'estimate_sections', id: newId(), patch: { estimate_id: id, name: 'Works', sort: 10 } })
    }
    await saveBatch(items)
    await logActivity('job', job.id, 'estimate', { rev: revLetter(rev), from: from ? revLetter(from.rev) : null }, user)
    setSel(id)
  }

  if (!est) {
    return (
      <div className="card">
        <h2>Estimate</h2>
        <p className="muted">No estimate for this job yet.</p>
        {canEdit && <button className="btn primary" onClick={() => create()}>Start estimate A</button>}
      </div>
    )
  }

  return (
    <>
      <Revisions estimates={estimates} lines={lines} current={est} onPick={setSel} onNew={canEdit ? () => create(est) : undefined} />
      <Editor key={est.id} job={job} est={est} sections={sections.filter((s) => s.estimate_id === est.id)} lines={lines.filter((l) => l.estimate_id === est.id)} others={estimates.filter((e) => e.id !== est.id)} user={user} canEdit={canEdit} />
    </>
  )
}

// ---------------------------------------------------------------- revisions A, B, C and how they compare
function Revisions({ estimates, lines, current, onPick, onNew }: { estimates: Estimate[]; lines: Line[]; current: Estimate; onPick: (id: string) => void; onNew?: () => void }) {
  const { can } = useAuth()
  const seeCost = can('estimates.view_cost')
  const rows = estimates.map((e) => ({ e, t: estimateTotals(lines.filter((l) => l.estimate_id === e.id), e) }))
  return (
    <div className="card">
      <div className="rowtop">
        <h2 style={{ margin: 0 }}>Estimate</h2>
        {onNew && <button className="btn" style={{ width: 'auto', marginTop: 0 }} onClick={onNew}>New revision (copy of {revLetter(current.rev)})</button>}
      </div>
      <div className="chips" role="group" aria-label="Revisions">
        {estimates.map((e) => (
          <button key={e.id} className={`chip ${e.id === current.id ? 'on' : ''}`} onClick={() => onPick(e.id)}>Rev {revLetter(e.rev)} <span>{e.status}</span></button>
        ))}
      </div>
      {estimates.length > 1 && (
        <table className="mini">
          <thead><tr><th>Rev</th><th>Status</th><th>Net</th><th>Change</th>{seeCost && <th>Margin</th>}</tr></thead>
          <tbody>
            {rows.map(({ e, t }, i) => (
              <tr key={e.id}>
                <td>{revLetter(e.rev)}</td><td>{e.status}</td><td>{formatGBP(t.netPence)}</td>
                <td>{i === 0 ? '' : `${t.netPence - rows[i - 1].t.netPence >= 0 ? '+' : '−'}${formatGBP(Math.abs(t.netPence - rows[i - 1].t.netPence))}`}</td>
                {seeCost && <td>{t.marginPct}%</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- one revision
function Editor({ job, est, sections, lines, others, user, canEdit }: { job: Job; est: Estimate; sections: Section[]; lines: Line[]; others: Estimate[]; user: User; canEdit: boolean }) {
  const { can } = useAuth()
  const settings = useEstSettings()
  const labour = useLabourRates()
  const materials = useMaterials()
  const prices = useAllPrices()
  const suppliers = useSuppliers()
  const points = usePointRates()
  const assemblies = useAssemblies()
  const prelims = usePrelims()
  const [warns, setWarns] = useState<string[]>([])
  const [adding, setAdding] = useState<{ section: string; mode: string; prefill?: string } | null>(null)
  const seeCost = can('estimates.view_cost')
  const draft = est.status === 'draft'
  const editable = canEdit && draft
  const totals = useMemo(() => estimateTotals(lines, est), [lines, est])
  const jobRef = job.job_number ?? 'unnumbered job'
  const rate = labour?.find((l) => l.id === est.labour_rate_id) ?? labour?.[0]

  if (!materials || !prices || !labour || !suppliers || !points || !assemblies || !prelims) return <p className="muted">Loading…</p>

  const ordered = [...sections].sort((a, b) => a.sort - b.sort)
  const nextSort = () => (lines.reduce((m, l) => Math.max(m, l.sort), 0) || 0) + 10
  const setEst = (patch: Record<string, unknown>) => save('estimates', est.id, patch)

  // old or missing prices among the material lines (price over the limit, about 6 months)
  const staleLines = lines.filter((l) => l.kind === 'material' && l.material_id && isStale(l.price_date, settings.stale_days))
  const unpriced = lines.filter((l) => (l.kind === 'material' || l.kind === 'point' || l.kind === 'day') && l.unit_sell === 0)

  function base(sectionId: string, extra: Record<string, unknown>) {
    return { estimate_id: est.id, section_id: sectionId, sort: nextSort(), qty: 1, unit: 'each', unit_cost: 0, unit_sell: 0, hours_per_unit: 0, labour_cost_hr_pence: 0, labour_charge_hr_pence: 0, ...extra }
  }

  function materialPatch(m: Material, sectionId: string, withLabour: boolean, notes: string[], qty = 1) {
    const best = bestPrice(prices!.get(m.id) ?? [], m.preferred_supplier_id)
    const cost = best ? costPerUnit(best.price) : 0
    const markup = m.markup_pct ?? settings.default_markup_pct
    if (!best) notes.push(`${m.description} has no price yet, so it is in at £0. Type its cost on the line.`)
    else if (isStale(best.price.price_date, settings.stale_days)) notes.push(`The price for ${m.description} is over ${Math.round(settings.stale_days / 30)} months old. Check it with the supplier.`)
    const hours = withLabour ? m.labour_hours ?? 0 : 0
    return base(sectionId, {
      kind: 'material', description: m.description, unit: m.unit, qty, material_id: m.id, markup_pct: markup,
      unit_cost: r4(cost), unit_sell: r4(sellPerUnit(cost, markup)),
      hours_per_unit: hours, labour_rate_id: rate?.id ?? null, labour_cost_hr_pence: hours ? rate?.cost_per_hour_pence ?? 0 : 0, labour_charge_hr_pence: hours ? rate?.charge_per_hour_pence ?? 0 : 0,
      price_date: best?.price.price_date ?? null, price_source: best ? suppliers!.find((s) => s.id === best.price.supplier_id)?.name ?? null : null,
    })
  }
  async function addLine(patch: Record<string, unknown>) {
    await save('estimate_lines', newId(), patch)
  }

  async function addMaterial(m: Material, sectionId: string) {
    const notes: string[] = []
    if (est.method === 'units' && (m.labour_hours ?? 0) > 0 && (rate?.charge_per_hour_pence ?? 0) === 0) notes.push(`The labour rate "${rate?.name ?? 'none'}" is £0 an hour, so labour on this line costs nothing. Set labour rates under More, Estimating data.`)
    await addLine(materialPatch(m, sectionId, est.method === 'units', notes))
    setWarns(notes)
  }
  // Enter on something that isn't in the database: it goes into the materials database now (no price yet) and onto the estimate
  async function createAndAdd(text: string, sectionId: string) {
    const id = await findOrCreateMaterial(text, 'each')
    const markup = settings.default_markup_pct
    await addLine(base(sectionId, { kind: 'material', description: text, unit: 'each', material_id: id, markup_pct: markup }))
    setWarns([`"${text}" is now in the materials database with no price. Type its cost on the line and it is saved there, dated today.`])
  }
  async function addPoint(id: string, qty: number, sectionId: string) {
    const p = points!.find((x) => x.id === id)
    if (!p) return
    setWarns(p.sell_pence === 0 ? [`${p.name} has no price set yet (£0).`] : [])
    await addLine(base(sectionId, { kind: 'point', description: p.name, unit: p.unit, qty, point_rate_id: p.id, unit_cost: p.cost_pence, unit_sell: p.sell_pence }))
  }
  async function addDay(id: string, days: number, sectionId: string) {
    const g = labour!.find((x) => x.id === id)
    if (!g) return
    setWarns(g.day_rate_pence === 0 ? [`${g.name} has no day rate set yet (£0).`] : [])
    await addLine(base(sectionId, { kind: 'day', description: `${g.name}, day rate`, unit: 'day', qty: days, labour_rate_id: g.id, unit_cost: g.day_cost_pence, unit_sell: g.day_rate_pence }))
  }
  async function addAssembly(id: string, sectionId: string) {
    const a = assemblies!.find((x) => x.id === id)
    if (!a) return
    const items = ((await db().assembly_items.where('assembly_id').equals(id).filter((r) => !r.deleted_at).toArray()) as unknown as { material_id: string; qty: number; sort: number }[]).sort((x, y) => Number(x.sort) - Number(y.sort))
    const notes: string[] = []
    const batch: { tbl: 'estimate_lines'; id: string; patch: Record<string, unknown> }[] = []
    let sort = nextSort()
    for (const it of items) {
      const m = materials!.find((x) => x.id === it.material_id)
      if (!m) continue
      const patch = materialPatch(m, sectionId, true, notes, Number(it.qty))
      patch.sort = sort
      sort += 10
      batch.push({ tbl: 'estimate_lines', id: newId(), patch })
    }
    if (Number(a.extra_labour_hours) > 0) {
      batch.push({ tbl: 'estimate_lines', id: newId(), patch: base(sectionId, { sort, kind: 'item', description: `${a.name}: extra labour`, unit: 'hour', qty: Number(a.extra_labour_hours), labour_rate_id: rate?.id ?? null, unit_cost: rate?.cost_per_hour_pence ?? 0, unit_sell: rate?.charge_per_hour_pence ?? 0 }) })
    }
    if ((rate?.charge_per_hour_pence ?? 0) === 0) notes.push(`The labour rate "${rate?.name ?? 'none'}" is £0 an hour, so the labour in this assembly costs nothing.`)
    await saveBatch(batch)
    setWarns([...new Set(notes)])
  }
  async function addPrelim(id: string, sectionId: string) {
    const p = prelims!.find((x) => x.id === id)
    if (!p) return
    const amount = p.kind === 'fixed' ? p.amount_pence : Math.round((totals.linesPence * p.percent) / 100)
    await addLine(base(sectionId, { kind: 'prelim', description: p.kind === 'fixed' ? p.name : `${p.name} (${p.percent}% of lines at the time)`, unit_cost: amount, unit_sell: amount }))
  }
  async function addOwn(f: { description: string; qty: number; unit: string; cost: string; sell: string }, sectionId: string): Promise<string> {
    const cost = f.cost.trim() ? priceAndPer(f.cost) : { costPence: 0, perQty: 1 }
    if (!cost) return 'Check the cost: use pounds and pence, e.g. 12.50'
    const unitCost = cost.costPence / cost.perQty
    const sellP = f.sell.trim() ? priceAndPer(f.sell) : null
    if (f.sell.trim() && !sellP) return 'Check the sell price: use pounds and pence, e.g. 18.00'
    const markup = settings.default_markup_pct
    const unitSell = sellP ? sellP.costPence / sellP.perQty : sellPerUnit(unitCost, markup)
    let materialId: string | null = null
    // an item that isn't in the materials database yet goes in as soon as it has a cost
    if (unitCost > 0) {
      materialId = await findOrCreateMaterial(f.description, f.unit || 'each')
      await learnPrice(materialId, unitCost)
    }
    await addLine(base(sectionId, { kind: materialId ? 'material' : 'item', description: f.description, unit: f.unit || 'each', qty: f.qty, material_id: materialId, markup_pct: markup, unit_cost: r4(unitCost), unit_sell: r4(unitSell), price_date: unitCost > 0 ? today() : null, price_source: `Priced on job ${jobRef}` }))
    return ''
  }

  // the material with this description if there is one already (so nothing is entered twice), otherwise a new one
  async function findOrCreateMaterial(description: string, unit: string): Promise<string> {
    const key = description.trim().toLowerCase()
    const found = materials!.find((m) => m.active !== false && m.description.trim().toLowerCase() === key)
    if (found) return found.id
    const id = newId()
    await save('materials', id, { description: description.trim(), unit, active: true })
    return id
  }

  // writes a price someone typed on this estimate back into the materials database (dated today, tagged with the job)
  async function learnPrice(materialId: string, unitCostPence: number) {
    const scaled = priceAndPer((unitCostPence / 100).toFixed(4))
    if (!scaled) return
    let supplierId = suppliers!.find((s) => s.name === 'Priced on jobs')?.id
    if (!supplierId) {
      supplierId = newId()
      await save('suppliers', supplierId, { name: 'Priced on jobs', active: true })
    }
    const plan = planJobPrice(prices!.get(materialId) ?? [], { materialId, supplierId, costPence: scaled.costPence, perQty: scaled.perQty, jobRef, today: today() })
    await save('material_prices', plan.priceId ?? newId(), plan.patch)
  }

  async function editLine(l: Line, patch: Record<string, unknown>) {
    // hours typed on a line that has no labour rate yet pick up the estimate's labour grade
    if (Number(patch.hours_per_unit) > 0 && !l.labour_charge_hr_pence && rate) Object.assign(patch, { labour_rate_id: rate.id, labour_cost_hr_pence: rate.cost_per_hour_pence, labour_charge_hr_pence: rate.charge_per_hour_pence })
    await save('estimate_lines', l.id, patch)
  }
  async function newCost(l: Line, text: string) {
    const c = priceAndPer(text)
    if (!c) return setWarns(['Check the cost: use pounds and pence, e.g. 12.50'])
    const unitCost = r4(c.costPence / c.perQty)
    if (unitCost === l.unit_cost) return
    const patch: Record<string, unknown> = { unit_cost: unitCost }
    let materialId = l.material_id
    if (l.kind === 'item' && !materialId && unitCost > 0 && l.unit !== 'hour') {
      // a one-off item that now has a cost joins the materials database and becomes a normal material line
      materialId = await findOrCreateMaterial(l.description, l.unit || 'each')
      Object.assign(patch, { kind: 'material', material_id: materialId, markup_pct: l.markup_pct ?? settings.default_markup_pct })
      l = { ...l, kind: 'material', markup_pct: l.markup_pct ?? settings.default_markup_pct }
    }
    if (l.kind === 'material') {
      patch.unit_sell = r4(sellPerUnit(unitCost, l.markup_pct ?? settings.default_markup_pct))
      patch.price_date = today()
      patch.price_source = `Priced on job ${jobRef}`
    }
    await editLine(l, patch)
    if (l.kind === 'material' && materialId) await learnPrice(materialId, unitCost)
    setWarns([])
  }
  async function newSell(l: Line, text: string) {
    const c = priceAndPer(text)
    if (!c) return setWarns(['Check the sell price: use pounds and pence, e.g. 18.00'])
    const v = r4(c.costPence / c.perQty)
    if (v !== l.unit_sell) await editLine(l, { unit_sell: v })
  }
  // existing lines keep the labour rate they were added with; the grade only applies to lines added from now on
  const changeRate = (id: string) => setEst({ labour_rate_id: id || null })

  async function issue() {
    if (staleLines.length && !window.confirm(`${staleLines.length} line${staleLines.length === 1 ? ' uses' : 's use'} prices over ${Math.round(settings.stale_days / 30)} months old. Issue the quote anyway?`)) return
    const items: { tbl: 'estimates' | 'job_financials'; id: string; patch: Record<string, unknown> }[] = [
      { tbl: 'estimates', id: est.id, patch: { status: 'issued', issued_at: new Date().toISOString() } },
      { tbl: 'job_financials', id: job.id, patch: { quote_value_pence: totals.netPence, quote_date: today() } },
    ]
    for (const o of others) if (o.status === 'issued') items.push({ tbl: 'estimates', id: o.id, patch: { status: 'superseded' } })
    await saveBatch(items)
    await logActivity('job', job.id, 'quote', { fields: ['quote_value_pence'], rev: revLetter(est.rev), net: totals.netPence }, user)
  }

  const methodName = METHODS.find((m) => m[0] === est.method)?.[1]

  return (
    <>
      {!draft && (
        <div className="card notice">
          <p><strong>Revision {revLetter(est.rev)} is {est.status}</strong>, so it is locked. To change the price, make a new revision.</p>
          {canEdit && est.status !== 'superseded' && <button className="btn" onClick={() => setEst({ status: 'draft' })}>Re-open as draft</button>}
        </div>
      )}
      {draft && (!!staleLines.length || !!unpriced.length) && (
        <div className="warnbox" role="alert">
          {!!staleLines.length && <p>⚠ {staleLines.length} line{staleLines.length === 1 ? '' : 's'} use{staleLines.length === 1 ? 's' : ''} a price over {Math.round(settings.stale_days / 30)} months old. Check {staleLines.length === 1 ? 'it' : 'them'} before you send the quote.</p>}
          {!!unpriced.length && <p>⚠ {unpriced.length} line{unpriced.length === 1 ? ' has' : 's have'} no price (£0).</p>}
        </div>
      )}
      {!!warns.length && <div className="warnbox" role="alert">{warns.map((w) => <p key={w}>⚠ {w}</p>)} <button className="link small" onClick={() => setWarns([])}>Dismiss</button></div>}

      {editable && (
        <div className="card">
          <div className="fieldgrid">
            <div className="f">
              <label htmlFor="em">How new lines are priced</label>
              <select id="em" value={est.method} onChange={(e) => setEst({ method: e.target.value })}>
                {METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div className="f">
              <label htmlFor="el">Labour grade for new lines</label>
              <select id="el" value={est.labour_rate_id ?? ''} onChange={(e) => changeRate(e.target.value)}>
                {labour.filter((l) => l.active !== false).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </div>
          <p className="muted small">{est.method === 'units' ? 'Materials you add bring their labour units with them.' : 'Materials you add are materials only. Add labour as a price per point or a day rate.'} You can mix methods in one estimate by adding any kind of line below.</p>
        </div>
      )}

      {ordered.map((s) => {
        const sl = lines.filter((l) => l.section_id === s.id).sort((a, b) => a.sort - b.sort)
        const sectionTotal = sl.reduce((a, l) => a + lineSell(l), 0)
        return (
          <div className="card" key={s.id}>
            <div className="rowtop">
              <input key={s.name} type="text" defaultValue={s.name} disabled={!editable} aria-label="Section name" style={{ fontWeight: 700, flex: 1 }} onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && save('estimate_sections', s.id, { name: e.target.value.trim() })} />
              <strong style={{ whiteSpace: 'nowrap', alignSelf: 'center' }}>{formatGBP(sectionTotal)}</strong>
            </div>
            {!sl.length && <p className="muted">Nothing in this section yet.</p>}
            {sl.map((l) => (
              <LineCard key={l.id} line={l} editable={editable} seeCost={seeCost} staleDays={settings.stale_days} onEdit={(p) => editLine(l, p)} onCost={(t) => newCost(l, t)} onSell={(t) => newSell(l, t)} onRemove={() => remove('estimate_lines', l.id)} />
            ))}
            {editable && (
              <>
                <div className="chips" role="group" aria-label="Add to this section">
                  {MODES.map(([k, l]) => (
                    <button key={k} className={`chip ${adding?.section === s.id && adding.mode === k ? 'on' : ''}`} onClick={() => setAdding(adding?.section === s.id && adding.mode === k ? null : { section: s.id, mode: k })}>+ {l}</button>
                  ))}
                </div>
                {adding?.section === s.id && (
                  <AddPanel key={adding.mode + (adding.prefill ?? '')} mode={adding.mode} prefill={adding.prefill} onNewItem={(t) => setAdding({ section: s.id, mode: 'own', prefill: t })} onCreate={(t) => createAndAdd(t, s.id)} materials={materials} prices={prices} points={points} labour={labour} assemblies={assemblies} prelims={prelims} staleDays={settings.stale_days} defaultMarkup={settings.default_markup_pct} seeCost={seeCost}
                    onMaterial={(m) => addMaterial(m, s.id)} onPoint={(id, q) => addPoint(id, q, s.id)} onDay={(id, d) => addDay(id, d, s.id)} onAssembly={(id) => addAssembly(id, s.id)} onPrelim={(id) => addPrelim(id, s.id)} onOwn={(f) => addOwn(f, s.id)} />
                )}
                {!sl.length && ordered.length > 1 && <button className="link small" onClick={() => remove('estimate_sections', s.id)}>Remove this empty section</button>}
              </>
            )}
          </div>
        )
      })}
      {editable && <button className="btn" onClick={() => save('estimate_sections', newId(), { estimate_id: est.id, name: 'New section', sort: (ordered.at(-1)?.sort ?? 0) + 10 })}>+ Add a section</button>}

      <Terms est={est} editable={editable} onSet={setEst} />
      <TotalsCard t={totals} est={est} seeCost={seeCost} methodName={methodName} />

      {canEdit && draft && <button className="btn primary" onClick={issue} disabled={!lines.length}>Issue this quote (revision {revLetter(est.rev)})</button>}
      <QuoteButton job={job} est={est} sections={sections} lines={lines} />
      {canEdit && est.status === 'issued' && <button className="btn" onClick={() => setEst({ status: 'accepted' })}>Mark as accepted</button>}
      <p className="muted small">Issuing sets the job's quote value to the net figure above. Emailing the quote arrives once Outlook is connected.</p>
    </>
  )
}

// ---------------------------------------------------------------- one line
function LineCard({ line: l, editable, seeCost, staleDays, onEdit, onCost, onSell, onRemove }: {
  line: Line; editable: boolean; seeCost: boolean; staleDays: number
  onEdit: (p: Record<string, unknown>) => void; onCost: (t: string) => void; onSell: (t: string) => void; onRemove: () => void
}) {
  const hours = lineHours(l)
  const num = (v: string) => Number(v.replace(/,/g, ''))
  return (
    <div className="lcard">
      <div className="rowtop">
        <input key={l.description} type="text" defaultValue={l.description} disabled={!editable} aria-label="Description" onBlur={(e) => e.target.value.trim() && e.target.value !== l.description && onEdit({ description: e.target.value.trim() })} style={{ flex: 1 }} />
        {editable && <button className="btn" style={{ width: 'auto', marginTop: 0 }} onClick={onRemove} aria-label={`Remove ${l.description}`}>✕</button>}
      </div>
      <div className="lgrid">
        <div className="f"><label>Qty ({l.unit})</label>
          <input key={'q' + l.qty} type="text" inputMode="decimal" defaultValue={String(l.qty)} disabled={!editable} onBlur={(e) => { const n = num(e.target.value); if (Number.isFinite(n) && n >= 0 && n !== l.qty) onEdit({ qty: n }) }} /></div>
        {seeCost && <div className="f"><label>Cost each £</label>
          <input key={'c' + l.unit_cost} type="text" inputMode="decimal" defaultValue={perUnitText(l.unit_cost)} disabled={!editable} onBlur={(e) => onCost(e.target.value)} /></div>}
        <div className="f"><label>Sell each £</label>
          <input key={'s' + l.unit_sell} type="text" inputMode="decimal" defaultValue={perUnitText(l.unit_sell)} disabled={!editable} onBlur={(e) => onSell(e.target.value)} /></div>
        {(l.kind === 'material' || l.hours_per_unit > 0) && <div className="f"><label>Hours each</label>
          <input key={'h' + l.hours_per_unit} type="text" inputMode="decimal" defaultValue={String(l.hours_per_unit)} disabled={!editable} onBlur={(e) => { const n = num(e.target.value); if (Number.isFinite(n) && n >= 0 && n !== l.hours_per_unit) onEdit({ hours_per_unit: n }) }} /></div>}
      </div>
      <p className="small" style={{ margin: '4px 0 0' }}>
        <strong>{formatGBP(lineSell(l))}</strong>
        {seeCost && <span className="muted"> · cost {formatGBP(lineCost(l))}</span>}
        {hours > 0 && <span className="muted"> · {hours} h labour</span>}
        {l.kind === 'material' && <> · <PriceAge date={l.price_date} staleDays={staleDays} />{l.price_source ? <span className="muted"> ({l.price_source})</span> : null}</>}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------- the panel for adding things to a section
function AddPanel(p: {
  mode: string
  prefill?: string
  onNewItem: (text: string) => void
  onCreate: (text: string) => void
  materials: Material[]
  prices: ReturnType<typeof useAllPrices> & object
  points: NonNullable<ReturnType<typeof usePointRates>>
  labour: NonNullable<ReturnType<typeof useLabourRates>>
  assemblies: NonNullable<ReturnType<typeof useAssemblies>>
  prelims: NonNullable<ReturnType<typeof usePrelims>>
  staleDays: number; defaultMarkup: number; seeCost: boolean
  onMaterial: (m: Material) => void
  onPoint: (id: string, qty: number) => void
  onDay: (id: string, days: number) => void
  onAssembly: (id: string) => void
  onPrelim: (id: string) => void
  onOwn: (f: { description: string; qty: number; unit: string; cost: string; sell: string }) => Promise<string>
}) {
  const [pick, setPick] = useState('')
  const [qty, setQty] = useState('1')
  const [own, setOwn] = useState({ description: p.prefill ?? '', qty: '1', unit: 'each', cost: '', sell: '' })
  const [err, setErr] = useState('')
  const n = Number(qty)
  const okQty = Number.isFinite(n) && n > 0

  if (p.mode === 'material') return <div className="subform"><MaterialPicker materials={p.materials} prices={p.prices} staleDays={p.staleDays} defaultMarkup={p.defaultMarkup} seeCost={p.seeCost} onPick={p.onMaterial} onNew={p.onNewItem} onCreate={p.onCreate} /></div>

  const select = (opts: [string, string][], label: string) => (
    <>
      <label htmlFor="ap">{label}</label>
      <select id="ap" value={pick} onChange={(e) => setPick(e.target.value)}>
        <option value="">Choose…</option>
        {opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </>
  )
  const qtyField = (label: string) => (<><label htmlFor="aq">{label}</label><input id="aq" type="text" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></>)

  if (p.mode === 'point') return (
    <div className="subform">
      {select(p.points.filter((x) => x.active !== false).map((x) => [x.id, `${x.name} (${formatGBP(x.sell_pence)})`]), 'Point type')}
      {qtyField('How many')}
      <button className="btn primary" disabled={!pick || !okQty} onClick={() => (p.onPoint(pick, n), setPick(''))}>Add</button>
    </div>
  )
  if (p.mode === 'day') return (
    <div className="subform">
      {select(p.labour.filter((x) => x.active !== false).map((x) => [x.id, `${x.name} (${formatGBP(x.day_rate_pence)} a day)`]), 'Who')}
      {qtyField('How many days')}
      <button className="btn primary" disabled={!pick || !okQty} onClick={() => (p.onDay(pick, n), setPick(''))}>Add</button>
    </div>
  )
  if (p.mode === 'assembly') return (
    <div className="subform">
      {select(p.assemblies.filter((x) => x.active !== false).map((x) => [x.id, x.name]), 'Assembly')}
      <button className="btn primary" disabled={!pick} onClick={() => (p.onAssembly(pick), setPick(''))}>Add the whole kit</button>
    </div>
  )
  if (p.mode === 'prelim') return (
    <div className="subform">
      {select(p.prelims.filter((x) => x.active !== false).map((x) => [x.id, x.kind === 'fixed' ? `${x.name} (${formatGBP(x.amount_pence)})` : `${x.name} (${x.percent}%)`]), 'Prelim')}
      <button className="btn primary" disabled={!pick} onClick={() => (p.onPrelim(pick), setPick(''))}>Add</button>
    </div>
  )
  // own item
  return (
    <form className="subform" onSubmit={async (e) => {
      e.preventDefault()
      const q = Number(own.qty)
      if (!own.description.trim() || !Number.isFinite(q) || q <= 0) return setErr('Add a description and a quantity.')
      const msg = await p.onOwn({ description: own.description.trim(), qty: q, unit: own.unit.trim(), cost: own.cost, sell: own.sell })
      setErr(msg)
      if (!msg) setOwn({ description: '', qty: '1', unit: 'each', cost: '', sell: '' })
    }}>
      <label htmlFor="od">Description</label>
      <input id="od" type="text" value={own.description} onChange={(e) => setOwn({ ...own, description: e.target.value })} />
      <div className="lgrid">
        <div className="f"><label htmlFor="oq">Qty</label><input id="oq" type="text" inputMode="decimal" value={own.qty} onChange={(e) => setOwn({ ...own, qty: e.target.value })} /></div>
        <div className="f"><label htmlFor="ou">Unit</label><input id="ou" type="text" value={own.unit} onChange={(e) => setOwn({ ...own, unit: e.target.value })} /></div>
        {p.seeCost && <div className="f"><label htmlFor="oc">Cost each £</label><input id="oc" type="text" inputMode="decimal" value={own.cost} onChange={(e) => setOwn({ ...own, cost: e.target.value })} /></div>}
        <div className="f"><label htmlFor="os">Sell each £ (blank = cost + {p.defaultMarkup}%)</label><input id="os" type="text" inputMode="decimal" value={own.sell} onChange={(e) => setOwn({ ...own, sell: e.target.value })} /></div>
      </div>
      {p.seeCost && <p className="muted small">If it has a cost and isn't in the materials database yet, it is added there automatically, dated today.</p>}
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn primary">Add</button>
    </form>
  )
}

// ---------------------------------------------------------------- terms and totals
function Terms({ est, editable, onSet }: { est: Estimate; editable: boolean; onSet: (p: Record<string, unknown>) => void }) {
  const pct = (key: 'ohp_pct' | 'ohp_materials_pct' | 'ohp_labour_pct' | 'contingency_pct' | 'discount_pct' | 'vat_rate', label: string) => (
    <div className="f">
      <label htmlFor={'t' + key}>{label}</label>
      <input id={'t' + key} key={String(est[key])} type="text" inputMode="decimal" disabled={!editable} defaultValue={String(est[key])}
        onBlur={(e) => { const n = Number(e.target.value.replace('%', '')); if (Number.isFinite(n) && n >= 0 && n <= 100 && n !== est[key]) onSet({ [key]: n }) }} />
    </div>
  )
  return (
    <div className="card">
      <h2>Overheads, profit and VAT</h2>
      <label htmlFor="ohm">Overheads and profit</label>
      <select id="ohm" disabled={!editable} value={est.ohp_mode} onChange={(e) => onSet({ ohp_mode: e.target.value })}>
        <option value="combined">One percentage on everything</option>
        <option value="split">Separate percentages for materials and labour</option>
      </select>
      <p className="muted small">This is added on top of every line. The client never sees it as a separate line: it is built into their prices.</p>
      <div className="lgrid">
        {est.ohp_mode === 'split' ? <>{pct('ohp_materials_pct', 'On materials %')}{pct('ohp_labour_pct', 'On labour %')}</> : pct('ohp_pct', 'Overheads + profit %')}
        {pct('contingency_pct', 'Contingency %')}
        {pct('discount_pct', 'Discount %')}
        {pct('vat_rate', 'VAT %')}
      </div>
      <label className="check"><input type="checkbox" disabled={!editable} checked={est.reverse_charge} onChange={(e) => onSet({ reverse_charge: e.target.checked })} /> Domestic reverse charge (no VAT on the quote; the customer accounts for it)</label>
    </div>
  )
}

function TotalsCard({ t, est, seeCost, methodName }: { t: Totals; est: Estimate; seeCost: boolean; methodName?: string }) {
  const row = (label: string, v: number, strong = false, minus = false) => (
    <tr className={strong ? 'strong' : ''}><td>{label}</td><td style={{ textAlign: 'right' }}>{minus && v > 0 ? '−' : ''}{formatGBP(v)}</td></tr>
  )
  return (
    <div className="card">
      <h2>Totals</h2>
      <table className="mini" style={{ width: '100%' }}>
        <tbody>
          {row('Lines', t.linesPence)}
          {t.ohpPence > 0 && row(est.ohp_mode === 'split' ? `Overheads and profit (materials ${est.ohp_materials_pct}%, labour ${est.ohp_labour_pct}%)` : `Overheads and profit ${est.ohp_pct}%`, t.ohpPence)}
          {est.contingency_pct > 0 && row(`Contingency ${est.contingency_pct}%`, t.contingencyPence)}
          {est.discount_pct > 0 && row(`Discount ${est.discount_pct}%`, t.discountPence, false, true)}
          {row('Net (the quote value)', t.netPence, true)}
          {est.reverse_charge ? <tr><td>VAT</td><td style={{ textAlign: 'right' }}>Reverse charge</td></tr> : row(`VAT ${est.vat_rate}%`, t.vatPence)}
          {row('Total to pay', t.totalPence, true)}
        </tbody>
      </table>
      {t.hours > 0 && <p className="muted small">{t.hours} hours of labour in this estimate.</p>}
      {seeCost && (
        <p className="muted small">Cost to you {formatGBP(t.costPence)} · margin {formatGBP(t.marginPence)} ({t.marginPct}% of the net){methodName ? ` · lines default to: ${methodName}` : ''}</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- the quote PDF
function QuoteButton({ job, est, sections, lines }: { job: Job; est: Estimate; sections: Section[]; lines: Line[] }) {
  const clients = useClients()
  const [detail, setDetail] = useState<'lines' | 'sections'>('lines')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function make() {
    setBusy(true)
    setErr('')
    try {
      const company = navigator.onLine ? await loadCompany() : cachedCompany()
      let logo: Uint8Array | null = null
      try {
        const res = await fetch('/brand/gwired-logo-full.png')
        if (res.ok) logo = new Uint8Array(await res.arrayBuffer())
      } catch { /* no logo */ }
      const client = clients?.find((c) => c.id === job.client_id) ?? null
      const bytes = await buildQuotePdf({
        company, job: { job_number: job.job_number, title: job.title, site_address: job.site_address },
        client: client ? { name: client.name, address: client.address } : null, estimate: est, sections, lines, detail, date: new Date(), logoPng: logo,
      })
      const name = 'Quote ' + (job.job_number ?? 'draft') + (est.rev > 1 ? ' rev ' + revLetter(est.rev) : '') + '.pdf'
      const file = new File([bytes as BlobPart], name, { type: 'application/pdf' })
      if (navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: name }); return } catch (e) { if ((e as Error).name === 'AbortError') return }
      }
      const url = URL.createObjectURL(file)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (e) {
      setErr((e as Error).message || 'Could not make the PDF.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="card">
      <h2>Quote PDF</h2>
      <label htmlFor="qd">What the client sees</label>
      <select id="qd" value={detail} onChange={(e) => setDetail(e.target.value as 'lines' | 'sections')}>
        <option value="lines">Every line with quantities and prices</option>
        <option value="sections">Section totals only</option>
      </select>
      <p className="muted small">Overheads, profit and any discount are built into the prices. Costs and margins are never shown.</p>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn" onClick={make} disabled={busy || !lines.length}>{busy ? 'Making…' : 'Make quote PDF'}</button>
    </div>
  )
}
