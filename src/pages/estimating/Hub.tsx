import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useAllPrices, useEstSettings, useMaterials } from '../../lib/estimating/data'
import { isStale } from '../../lib/estimating/pricing'

const LINKS: [string, string, string][] = [
  ['materials', 'Materials', 'Items with supplier prices, labour units and markup'],
  ['import', 'Import supplier prices', 'Bring in a Rexel, TLC Direct or other price file'],
  ['suppliers', 'Suppliers', 'Who you buy from'],
  ['labour', 'Labour rates', 'Charge and cost rates by grade'],
  ['points', 'Point rates', 'Fixed price per socket, light, switch…'],
  ['assemblies', 'Assemblies', 'Kits of materials and labour'],
  ['prelims', 'Prelims and overheads', 'Access, waste, welfare, testing…'],
  ['defaults', 'Estimating defaults', 'Markup, overheads, profit, pricing method by job type'],
]

export default function Hub() {
  const { can } = useAuth()
  const materials = useMaterials()
  const prices = useAllPrices()
  const settings = useEstSettings()
  if (!can('estimates.view')) return <><h1>Estimating data</h1><p className="muted">You don't have permission to see estimating data.</p></>
  const old = materials?.filter((m) => m.active !== false && (prices?.get(m.id) ?? []).length > 0 && (prices?.get(m.id) ?? []).every((p) => isStale(p.price_date, settings.stale_days))).length
  return (
    <>
      <p><Link to="/more">← More</Link></p>
      <h1>Estimating data</h1>
      {!!old && <Link className="card linkcard notice" to="/more/estimating/materials"><strong>{old} material{old === 1 ? ' has' : 's have'} only prices over {Math.round(settings.stale_days / 30)} months old</strong><span className="muted">Check or re-import them before they go into an estimate.</span></Link>}
      {LINKS.map(([to, title, sub]) => (
        <Link key={to} className="card linkcard" to={`/more/estimating/${to}`}><strong>{title}</strong><span className="muted">{sub}</span></Link>
      ))}
    </>
  )
}
