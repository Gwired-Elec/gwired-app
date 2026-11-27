import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import RateGrid, { type Col } from '../../components/RateGrid'
import { useAuth } from '../../lib/auth'
import { CATEGORIES, DEFAULT_SETTINGS, METHODS, SETTINGS_ID, hourlyCharge, hourlyCost, useEstSettings, useLabourRates, usePointRates, usePrelims, useSuppliers, type LabourRate } from '../../lib/estimating/data'
import { formatGBP } from '../../lib/money'
import { JOB_TYPES } from '../../lib/jobs'
import { save } from '../../lib/sync/store'

function Page({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <>
      <p><Link to="/more/estimating">← Estimating data</Link></p>
      <h1>{title}</h1>
      {intro && <p className="muted">{intro}</p>}
      {children}
    </>
  )
}
function useGate() {
  const { can } = useAuth()
  return { view: can('estimates.view'), edit: can('estimates.edit'), cost: can('estimates.view_cost'), settings: can('settings') }
}
const NoAccess = () => <><h1>Estimating</h1><p className="muted">You don't have permission to see estimating data.</p></>

export function Suppliers() {
  const g = useGate()
  const rows = useSuppliers()
  if (!g.view) return <NoAccess />
  const cols: Col[] = [
    { key: 'name', label: 'Supplier', kind: 'text', wide: true },
    { key: 'notes', label: 'Notes (account number, branch…)', kind: 'text', nullable: true, wide: true },
    { key: 'active', label: 'In use', kind: 'bool' },
  ]
  return (
    <Page title="Suppliers" intro="Rexel, TLC Direct and anyone else you buy from. Each material can hold a price from each supplier.">
      <RateGrid tbl="suppliers" rows={rows} cols={cols} editable={g.edit} newDefaults={{ name: 'New supplier', active: true }} addLabel="Add supplier" />
    </Page>
  )
}

export function LabourRates() {
  const g = useGate()
  const rows = useLabourRates()
  if (!g.view) return <NoAccess />
  const cols: Col[] = [
    { key: 'name', label: 'Grade', kind: 'text', wide: true },
    { key: 'day_cost_pence', label: 'Cost per day', kind: 'money', hidden: !g.cost },
    { key: 'day_rate_pence', label: 'Charged out per day', kind: 'money' },
    { key: 'night_cost_pence', label: 'Night shift cost', kind: 'money', hidden: !g.cost },
    { key: 'night_rate_pence', label: 'Night shift charged out', kind: 'money' },
    { key: 'active', label: 'In use', kind: 'bool' },
  ]
  const unset = rows?.filter((r) => r.active !== false && !r.day_rate_pence).length
  return (
    <Page title="Labour rates" intro="What each grade costs you and what you charge out, for an 8-hour day, plus the price for a night shift. Hourly rates are worked out from the day (divided by 8) and used to price labour units on materials.">
      {!!unset && <p className="err">{unset} grade{unset === 1 ? ' has' : 's have'} no rate set yet. Estimates will show £0 labour for {unset === 1 ? 'it' : 'them'}.</p>}
      <RateGrid tbl="labour_rates" rows={rows} cols={cols} editable={g.edit} newDefaults={{ name: 'New grade', sort: (rows?.at(-1)?.sort ?? 0) + 10, day_cost_pence: 0, day_rate_pence: 0, night_cost_pence: 0, night_rate_pence: 0, active: true }} addLabel="Add grade"
        extra={(row) => { const x = row as unknown as LabourRate; return <p className="muted small" style={{ margin: '8px 0 0' }}>Works out at {formatGBP(hourlyCharge(x))} an hour charged out{g.cost ? `, ${formatGBP(hourlyCost(x))} an hour cost` : ''} (8-hour day).</p> }} />
    </Page>
  )
}

export function PointRates() {
  const g = useGate()
  const all = usePointRates()
  const [q, setQ] = useState('')
  const rows = useMemo(() => all?.filter((r) => !q.trim() || `${r.name} ${r.category ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())), [all, q])
  if (!g.view) return <NoAccess />
  const cols: Col[] = [
    { key: 'name', label: 'Point', kind: 'text', wide: true },
    { key: 'category', label: 'Category', kind: 'text', nullable: true, list: CATEGORIES },
    { key: 'unit', label: 'Unit', kind: 'text' },
    { key: 'sell_pence', label: 'Sell price', kind: 'money' },
    { key: 'cost_pence', label: 'Cost to you', kind: 'money', hidden: !g.cost },
    { key: 'notes', label: 'Notes', kind: 'text', nullable: true, wide: true },
    { key: 'active', label: 'In use', kind: 'bool' },
  ]
  return (
    <Page title="Point rates" intro="A fixed price you charge per socket, light, switch and so on. Mainly for domestic jobs.">
      <div className="toolbar"><input type="text" placeholder="Search point rates…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search point rates" /></div>
      <RateGrid tbl="point_rates" rows={rows} cols={cols} editable={g.edit} newDefaults={{ name: 'New point', unit: 'point', sell_pence: 0, cost_pence: 0, active: true }} addLabel="Add point rate" empty={all?.length ? 'No point rates match.' : 'No point rates yet. Add your first.'} />
    </Page>
  )
}

export function Prelims() {
  const g = useGate()
  const rows = usePrelims()
  if (!g.view) return <NoAccess />
  const cols: Col[] = [
    { key: 'name', label: 'Item', kind: 'text', wide: true },
    { key: 'kind', label: 'Charged as', kind: 'select', options: [['fixed', 'Fixed amount'], ['percent', '% of direct cost']] },
    { key: 'amount_pence', label: 'Amount (if fixed)', kind: 'money' },
    { key: 'percent', label: '% of direct cost (if %)', kind: 'number' },
    { key: 'active', label: 'In use', kind: 'bool' },
  ]
  return (
    <Page title="Prelims and overheads" intro="Access equipment, waste, welfare, parking, testing and certification, design, O&M manuals. Add the ones a job needs when you build the estimate.">
      <RateGrid tbl="prelim_items" rows={rows} cols={cols} editable={g.edit} newDefaults={{ name: 'New item', kind: 'fixed', amount_pence: 0, percent: 0, active: true }} addLabel="Add item" />
    </Page>
  )
}

export function Defaults() {
  const g = useGate()
  const s = useEstSettings()
  const [f, setF] = useState(() => toForm(s))
  const [msg, setMsg] = useState('')
  useEffect(() => setF(toForm(s)), [s.updated_at]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!g.view) return <NoAccess />
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))
  const pct = (k: keyof typeof f, label: string, hint?: string) => (
    <div className="f">
      <label htmlFor={k}>{label} (%)</label>
      <input id={k} type="text" inputMode="decimal" disabled={!g.settings} value={f[k] as string} onChange={(e) => set(k, e.target.value)} />
      {hint && <span className="muted small">{hint}</span>}
    </div>
  )
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const n = (t: string, d: number) => (Number.isFinite(Number(t)) && t.trim() !== '' ? Number(t) : d)
    await save('estimating_settings', SETTINGS_ID, {
      default_markup_pct: n(f.default_markup_pct, DEFAULT_SETTINGS.default_markup_pct),
      oh_pct: n(f.oh_pct, DEFAULT_SETTINGS.oh_pct),
      profit_pct: n(f.profit_pct, DEFAULT_SETTINGS.profit_pct),
      contingency_pct: n(f.contingency_pct, DEFAULT_SETTINGS.contingency_pct),
      stale_days: Math.round(n(f.stale_days, DEFAULT_SETTINGS.stale_days)),
      vat_rate: n(f.vat_rate, DEFAULT_SETTINGS.vat_rate),
      method_defaults: f.methods,
    })
    setMsg('Saved.')
    setTimeout(() => setMsg(''), 3000)
  }
  return (
    <Page title="Estimating defaults" intro="Starting values for every new estimate. You can change them on each estimate.">
      <form className="card" onSubmit={submit}>
        <div className="fieldgrid">
          {pct('default_markup_pct', 'Markup on materials', 'Used when a material has no markup of its own')}
          {pct('oh_pct', 'Overheads (added to profit for new estimates)')}
          {pct('profit_pct', 'Profit')}
          {pct('contingency_pct', 'Contingency')}
          {pct('vat_rate', 'VAT rate')}
          <div className="f">
            <label htmlFor="stale">Warn about prices older than (days, 180 = about 6 months)</label>
            <input id="stale" type="text" inputMode="numeric" disabled={!g.settings} value={f.stale_days} onChange={(e) => set('stale_days', e.target.value.replace(/\D/g, ''))} />
          </div>
        </div>
        <h2 style={{ marginTop: 16 }}>Default pricing method by job type</h2>
        <div className="fieldgrid">
          {JOB_TYPES.map(([k, l]) => (
            <div className="f" key={k}>
              <label htmlFor={'m-' + k}>{l}</label>
              <select id={'m-' + k} disabled={!g.settings} value={f.methods[k] ?? 'units'} onChange={(e) => setF((x) => ({ ...x, methods: { ...x.methods, [k]: e.target.value } }))}>
                {METHODS.map(([m, ml]) => <option key={m} value={m}>{ml}</option>)}
              </select>
            </div>
          ))}
        </div>
        {msg && <p className="ok" role="status">{msg}</p>}
        {g.settings ? <button className="btn primary">Save defaults</button> : <p className="muted">Only people with the Settings permission can change these.</p>}
      </form>
    </Page>
  )
}
const toForm = (s: ReturnType<typeof useEstSettings>) => ({
  default_markup_pct: String(s.default_markup_pct),
  oh_pct: String(s.oh_pct),
  profit_pct: String(s.profit_pct),
  contingency_pct: String(s.contingency_pct),
  vat_rate: String(s.vat_rate),
  stale_days: String(s.stale_days),
  methods: { ...s.method_defaults } as Record<string, string>,
})
