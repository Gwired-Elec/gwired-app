import { useMemo, useState } from 'react'
import PriceAge from './PriceAge'
import { bestPrice, costPerUnit, sellPerUnit } from '../lib/estimating/pricing'
import type { Material, MaterialPrice } from '../lib/estimating/data'
import { fmtUnit } from '../pages/estimating/Materials'

// Type to find a material, tap to choose it. Shows each match's sell price and how old its price is, and says so when the
// price is over the limit (about 6 months), so nobody builds an estimate on an old number without noticing.
export default function MaterialPicker({ materials, prices, staleDays, defaultMarkup, seeCost, onPick }: {
  materials: Material[]
  prices: Map<string, MaterialPrice[]>
  staleDays: number
  defaultMarkup: number
  seeCost: boolean
  onPick: (m: Material) => void
}) {
  const [q, setQ] = useState('')
  const found = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (t.length < 2) return []
    return materials.filter((m) => m.active !== false && `${m.code ?? ''} ${m.description}`.toLowerCase().includes(t)).slice(0, 15)
  }, [materials, q])
  return (
    <div>
      <label htmlFor="mp">Find a material</label>
      <input id="mp" type="text" placeholder="Type at least 2 letters…" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      {found.map((m) => {
        const best = bestPrice(prices.get(m.id) ?? [], m.preferred_supplier_id)
        const cost = best ? costPerUnit(best.price) : null
        return (
          <button type="button" key={m.id} className="pick" onClick={() => (onPick(m), setQ(''))}>
            <strong>{m.description}</strong>
            <span className="muted small">
              {m.code ? `${m.code} · ` : ''}
              {cost !== null ? <>{seeCost ? `cost ${fmtUnit(cost)} · ` : ''}sell {fmtUnit(sellPerUnit(cost, m.markup_pct ?? defaultMarkup))} per {m.unit} · <PriceAge date={best!.price.price_date} staleDays={staleDays} /></> : 'no price yet'}
            </span>
          </button>
        )
      })}
      {q.trim().length >= 2 && !found.length && <p className="muted small">No materials match.</p>}
    </div>
  )
}
