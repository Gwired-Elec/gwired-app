// The owner's dashboard maths: pure functions over plain data (no database), so every figure can be tested.
// Money is whole pence. "Excluding VAT" unless a label says otherwise. Money OUT (costs) is not tracked yet, so nothing here
// pretends to show profit.
import { chain, invoiceTotals, type AppTerms } from '../money/applications'

export interface DJob { id: string; job_number: string | null; title: string; status: string; chase_date: string | null }
export interface DFin { job_id: string; quote_value_pence: number | null; probability: number | null; valid_until: string | null }
export interface DApp { id: string; job_id: string; number: number; status: 'draft' | 'issued' | 'paid'; app_date: string; terms: AppTerms; grossToDate: number; paid_pence: number | null }
export interface DInv { id: string; job_id: string; number: number; status: 'draft' | 'issued' | 'paid'; inv_date: string; due_date: string | null; net_pence: number; vat_rate: number; reverse_charge: boolean }
export interface DInput {
  today: string // YYYY-MM-DD
  jobs: DJob[]
  fin: DFin[]
  quoteNet: Record<string, number> // each job's accepted (or latest) quote, excluding VAT
  variationsAccepted: Record<string, number> // approved variations at the accepted value
  apps: DApp[]
  invs: DInv[]
  appPaymentDays?: number // days an application is allowed before it counts as late (30 unless told otherwise)
}

const day = (s: string) => Date.parse(s.slice(0, 10) + 'T00:00:00Z') / 86_400_000
export const daysBetween = (from: string, to: string) => Math.round(day(to) - day(from))
const addDays = (s: string, n: number) => new Date((day(s) + n) * 86_400_000).toISOString().slice(0, 10)

export type Rag = 'red' | 'amber' | 'green'
export interface Owed { job_id: string; label: string; amount: number; date: string; due: string; overdueDays: number }
export interface JobRow { job: DJob; contract: number; billed: number; paid: number; owed: number; toBill: number; rag: Rag; why: string }
export interface Dashboard {
  pipeline: { open: number; value: number; weighted: number; unweightedCount: number; byStatus: { status: string; count: number; value: number }[]; chaseOverdue: number }
  live: { jobs: number; contract: number; billed: number; toBill: number }
  money: { invoiced: number; paid: number; outstanding: number; overdue: number }
  ageing: { notDue: number; d1_30: number; d31_60: number; d61plus: number }
  owed: Owed[]
  jobs: JobRow[]
}

export function dashboard(i: DInput): Dashboard {
  const payDays = i.appPaymentDays ?? 30
  const owed: Owed[] = []
  let invoiced = 0, paid = 0
  const per = new Map<string, { billed: number; paid: number; owed: number }>()
  const slot = (id: string) => { if (!per.has(id)) per.set(id, { billed: 0, paid: 0, owed: 0 }); return per.get(id)! }

  // applications: worked out in order for each job, because each one builds on the last
  for (const jobId of new Set(i.apps.map((a) => a.job_id))) {
    const mine = i.apps.filter((a) => a.job_id === jobId).sort((a, b) => a.number - b.number)
    const vals = chain(mine.map((a) => ({ grossToDate: a.grossToDate, terms: a.terms })))
    mine.forEach((a, k) => {
      if (a.status === 'draft') return
      const v = vals[k]
      const s = slot(jobId)
      s.billed += v.thisNet
      invoiced += v.thisNet
      if (a.status === 'paid') { const p = a.paid_pence ?? v.due; s.paid += p; paid += p } else {
        const due = addDays(a.app_date, payDays)
        s.owed += v.due
        owed.push({ job_id: jobId, label: `Application ${a.number}`, amount: v.due, date: a.app_date, due, overdueDays: daysBetween(due, i.today) })
      }
    })
  }
  for (const inv of i.invs) {
    if (inv.status === 'draft') continue
    const t = invoiceTotals(inv.net_pence, inv.vat_rate, inv.reverse_charge)
    const s = slot(inv.job_id)
    s.billed += t.net
    invoiced += t.net
    if (inv.status === 'paid') { s.paid += t.total; paid += t.total } else {
      const due = inv.due_date ?? addDays(inv.inv_date, 14)
      s.owed += t.total
      owed.push({ job_id: inv.job_id, label: `Invoice ${inv.number}`, amount: t.total, date: inv.inv_date, due, overdueDays: daysBetween(due, i.today) })
    }
  }
  owed.sort((a, b) => b.overdueDays - a.overdueDays)

  const ageing = { notDue: 0, d1_30: 0, d31_60: 0, d61plus: 0 }
  for (const o of owed) {
    if (o.overdueDays <= 0) ageing.notDue += o.amount
    else if (o.overdueDays <= 30) ageing.d1_30 += o.amount
    else if (o.overdueDays <= 60) ageing.d31_60 += o.amount
    else ageing.d61plus += o.amount
  }
  const outstanding = owed.reduce((a, o) => a + o.amount, 0)
  const overdue = owed.filter((o) => o.overdueDays > 0).reduce((a, o) => a + o.amount, 0)

  // pipeline: quotes that are out (or being worked on) and not yet won
  const finBy = new Map(i.fin.map((f) => [f.job_id, f]))
  const open = i.jobs.filter((j) => j.status === 'quoted' || j.status === 'estimating')
  const byStatus = ['estimating', 'quoted'].map((status) => {
    const js = open.filter((j) => j.status === status)
    return { status, count: js.length, value: js.reduce((a, j) => a + (finBy.get(j.id)?.quote_value_pence ?? 0), 0) }
  })
  const quoted = open.filter((j) => j.status === 'quoted')
  const value = quoted.reduce((a, j) => a + (finBy.get(j.id)?.quote_value_pence ?? 0), 0)
  const weighted = quoted.reduce((a, j) => { const f = finBy.get(j.id); return a + Math.round(((f?.quote_value_pence ?? 0) * (f?.probability ?? 0)) / 100) }, 0)
  const unweightedCount = quoted.filter((j) => finBy.get(j.id)?.probability == null).length
  const chaseOverdue = quoted.filter((j) => j.chase_date && j.chase_date.slice(0, 10) < i.today).length

  // live jobs, each with a traffic light
  const jobs: JobRow[] = i.jobs.filter((j) => j.status === 'live').map((job) => {
    const contract = (i.quoteNet[job.id] ?? 0) + (i.variationsAccepted[job.id] ?? 0)
    const s = per.get(job.id) ?? { billed: 0, paid: 0, owed: 0 }
    const late = owed.filter((o) => o.job_id === job.id && o.overdueDays > 0)
    const worst = Math.max(0, ...late.map((o) => o.overdueDays))
    let rag: Rag = 'green'
    let why = 'Nothing late'
    if (worst > 30) { rag = 'red'; why = `Payment ${worst} days late` }
    else if (worst > 0) { rag = 'amber'; why = `Payment ${worst} day${worst === 1 ? '' : 's'} late` }
    else if (contract > 0 && s.billed > contract) { rag = 'amber'; why = 'Billed more than the contract value' }
    else if (contract === 0) { rag = 'amber'; why = 'No contract value found (is the quote accepted?)' }
    return { job, contract, billed: s.billed, paid: s.paid, owed: s.owed, toBill: Math.max(0, contract - s.billed), rag, why }
  }).sort((a, b) => ['red', 'amber', 'green'].indexOf(a.rag) - ['red', 'amber', 'green'].indexOf(b.rag))

  return {
    pipeline: { open: quoted.length, value, weighted, unweightedCount, byStatus, chaseOverdue },
    live: { jobs: jobs.length, contract: jobs.reduce((a, r) => a + r.contract, 0), billed: jobs.reduce((a, r) => a + r.billed, 0), toBill: jobs.reduce((a, r) => a + r.toBill, 0) },
    money: { invoiced, paid, outstanding, overdue },
    ageing, owed, jobs,
  }
}
