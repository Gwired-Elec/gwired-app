// Reads everything the dashboard needs from the local database (so it works offline) and hands it to the maths.
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Row } from '../sync/db'
import { acceptedValue, contractEstimate, variationValues, type Application, type ApplicationLine, type Invoice, type Variation, type VariationLine } from '../commercial/data'
import { estimateTotals } from '../estimating/estimate'
import { fixEst, fixLine, type Estimate, type Line } from '../estimating/estimates'
import { todayIso } from '../planner/data'
import { dashboard, type Dashboard } from './metrics'

const alive = (r: Row) => !r.deleted_at
const n = (v: unknown) => Number(v ?? 0)

export function useDashboard(): Dashboard | undefined {
  return useLiveQuery(async () => {
    const jobs = await db().jobs.filter(alive).toArray()
    const fin = await db().job_financials.filter(alive).toArray()
    const every = ((await db().estimates.filter(alive).toArray()) as unknown as Estimate[]).map(fixEst)
    const lines = ((await db().estimate_lines.filter(alive).toArray()) as unknown as Line[]).map(fixLine)
    const variations = ((await db().variations.filter(alive).toArray()) as unknown as Variation[]).map((v) => ({ ...v, approved_pence: v.approved_pence == null ? null : n(v.approved_pence) }))
    const vlines = ((await db().variation_lines.filter(alive).toArray()) as unknown as VariationLine[]).map((l) => ({ ...l, qty: n(l.qty), rate_pence: n(l.rate_pence) }))
    const apps = (await db().applications.filter(alive).toArray()) as unknown as Application[]
    const alines = (await db().application_lines.filter(alive).toArray()) as unknown as ApplicationLine[]
    const invs = (await db().invoices.filter(alive).toArray()) as unknown as Invoice[]

    // each job's quote: the accepted estimate (else the latest), leaving out the estimates that price variations
    const quoteNet: Record<string, number> = {}
    for (const jobId of new Set(every.filter((e) => !e.variation_id).map((e) => e.job_id))) {
      const e = contractEstimate(every.filter((x) => x.job_id === jobId && !x.variation_id).sort((a, b) => a.rev - b.rev))
      if (e) quoteNet[jobId] = estimateTotals(lines.filter((l) => l.estimate_id === e.id), e).netPence
    }
    const values = variationValues(variations, vlines, every.filter((e) => !!e.variation_id), lines)
    const variationsAccepted: Record<string, number> = {}
    for (const v of variations.filter((x) => x.status === 'approved')) variationsAccepted[v.job_id] = (variationsAccepted[v.job_id] ?? 0) + acceptedValue(v, values.get(v.id) ?? 0)

    return dashboard({
      today: todayIso(),
      jobs: jobs.map((j) => ({ id: j.id, job_number: (j.job_number as string | null) ?? null, title: String(j.title ?? ''), status: String(j.status), chase_date: (j.chase_date as string | null) ?? null })),
      fin: fin.map((f) => ({ job_id: f.id, quote_value_pence: f.quote_value_pence == null ? null : n(f.quote_value_pence), probability: f.probability == null ? null : n(f.probability), valid_until: (f.valid_until as string | null) ?? null })),
      quoteNet, variationsAccepted,
      apps: apps.map((a) => ({
        id: a.id, job_id: a.job_id, number: n(a.number), status: a.status, app_date: String(a.app_date), paid_pence: a.paid_pence == null ? null : n(a.paid_pence),
        grossToDate: alines.filter((l) => l.application_id === a.id).reduce((s, l) => s + n(l.to_date_pence), 0),
        terms: { retention_pct: n(a.retention_pct), retention_release_pence: n(a.retention_release_pence), cis_on: !!a.cis_on, cis_rate: n(a.cis_rate), cis_labour_pct: n(a.cis_labour_pct), reverse_charge: !!a.reverse_charge, vat_rate: n(a.vat_rate) },
      })),
      invs: invs.map((i) => ({ id: i.id, job_id: i.job_id, number: n(i.number), status: i.status, inv_date: String(i.inv_date), due_date: i.due_date ?? null, net_pence: n(i.net_pence), vat_rate: n(i.vat_rate), reverse_charge: !!i.reverse_charge })),
    })
  }, [])
}
