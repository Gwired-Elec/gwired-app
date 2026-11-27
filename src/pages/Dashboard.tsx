import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useDashboard } from '../lib/dashboard/load'
import { formatGBP } from '../lib/money'
import { fmtDate } from '../lib/jobs'

const RAG: Record<string, { colour: string; word: string }> = { red: { colour: '#b91c1c', word: 'Red' }, amber: { colour: '#d97706', word: 'Amber' }, green: { colour: '#15803d', word: 'Green' } }

const Tile = ({ label, value, sub, colour }: { label: string; value: string; sub?: string; colour?: string }) => (
  <div className="card" style={{ margin: 0, flex: '1 1 150px' }}>
    <span className="muted small">{label}</span>
    <div style={{ fontSize: '1.4rem', fontWeight: 700, color: colour }}>{value}</div>
    {sub && <span className="muted small">{sub}</span>}
  </div>
)

export default function Dashboard() {
  const { profile } = useAuth()
  const d = useDashboard()
  if (profile?.preset !== 'owner') return <><h1>Dashboard</h1><p className="muted">The dashboard is for owners only.</p></>
  if (!d) return <><h1>Dashboard</h1><p className="muted">Loading…</p></>
  const a = d.ageing
  const ageTotal = a.notDue + a.d1_30 + a.d31_60 + a.d61plus
  const bar = (v: number, colour: string) => <div style={{ height: 10, borderRadius: 5, background: colour, width: ageTotal && v ? `${Math.max(2, (v / ageTotal) * 100)}%` : 0 }} />
  const rows: [string, number, string][] = [['Not yet due', a.notDue, '#15803d'], ['1 to 30 days late', a.d1_30, '#d97706'], ['31 to 60 days late', a.d31_60, '#c2410c'], ['Over 60 days late', a.d61plus, '#b91c1c']]
  return (
    <>
      <p><Link to="/more">← More</Link></p>
      <h1>Dashboard</h1>
      <p className="muted small">All figures exclude VAT unless it says otherwise. Taken from the quotes, applications and invoices in the app.</p>

      <h2>Money in</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <Tile label="Invoiced" value={formatGBP(d.money.invoiced)} sub="applications and invoices issued" />
        <Tile label="Received" value={formatGBP(d.money.paid)} sub="marked as paid (inc. VAT)" />
        <Tile label="Owed to you" value={formatGBP(d.money.outstanding)} sub="issued, not yet paid (inc. VAT)" />
        <Tile label="Late" value={formatGBP(d.money.overdue)} sub="past its payment date (inc. VAT)" colour={d.money.overdue ? '#b91c1c' : undefined} />
      </div>
      <p className="muted small">Money out (costs, wages, suppliers) is not tracked in the app yet, so there is no profit figure here.</p>

      <div className="card">
        <h2>Who owes what, by how late</h2>
        {!d.owed.length && <p className="muted">Nothing outstanding.</p>}
        {d.owed.length > 0 && (
          <>
            {rows.map(([l, v, c]) => (
              <div key={l} style={{ margin: '8px 0' }}>
                <div className="rowtop"><span>{l}</span><strong>{formatGBP(v)}</strong></div>
                {bar(v, c)}
              </div>
            ))}
            <h3 style={{ marginTop: 16 }}>The items</h3>
            {d.owed.map((o) => {
              const j = d.jobs.find((x) => x.job.id === o.job_id)?.job
              return (
                <Link key={o.job_id + o.label} to={`/jobs/${o.job_id}?tab=Applications`} className="linklike" style={{ display: 'block', textDecoration: 'none', width: '100%' }}>
                  <div className="rowtop"><span>{j ? `${j.job_number ?? ''} ${j.title}`.trim() : 'Job'} · {o.label}</span><strong>{formatGBP(o.amount)}</strong></div>
                  <span className="muted small" style={o.overdueDays > 0 ? { color: '#b91c1c' } : undefined}>{o.overdueDays > 0 ? `${o.overdueDays} day${o.overdueDays === 1 ? '' : 's'} late, was due ${fmtDate(o.due)}` : `due ${fmtDate(o.due)}`}</span>
                </Link>
              )
            })}
            <p className="muted small">Applications count as late 30 days after their date. Invoices use their own due date.</p>
          </>
        )}
      </div>

      <div className="card">
        <h2>Pipeline</h2>
        <p><strong>{d.pipeline.open}</strong> quote{d.pipeline.open === 1 ? '' : 's'} out, worth <strong>{formatGBP(d.pipeline.value)}</strong>
          {d.pipeline.weighted > 0 && <> · about <strong>{formatGBP(d.pipeline.weighted)}</strong> after probability</>}</p>
        {d.pipeline.unweightedCount > 0 && <p className="muted small">{d.pipeline.unweightedCount} quote{d.pipeline.unweightedCount === 1 ? ' has' : 's have'} no probability set, so {d.pipeline.unweightedCount === 1 ? 'it is' : 'they are'} not in the weighted figure (set it on the job's Overview tab).</p>}
        {d.pipeline.chaseOverdue > 0 && <p style={{ color: '#b91c1c' }}>⏰ {d.pipeline.chaseOverdue} quote{d.pipeline.chaseOverdue === 1 ? ' is' : 's are'} overdue a chase. <Link to="/todos">See reminders</Link></p>}
        {d.pipeline.byStatus.map((s) => <div key={s.status} className="rowtop"><span style={{ textTransform: 'capitalize' }}>{s.status}</span><span>{s.count} · {formatGBP(s.value)}</span></div>)}
      </div>

      <div className="card">
        <h2>Live jobs</h2>
        <p><strong>{d.live.jobs}</strong> live · contract value <strong>{formatGBP(d.live.contract)}</strong> · billed <strong>{formatGBP(d.live.billed)}</strong> · still to bill <strong>{formatGBP(d.live.toBill)}</strong></p>
        {!d.jobs.length && <p className="muted">No live jobs.</p>}
        {d.jobs.map((r) => (
          <Link key={r.job.id} to={`/jobs/${r.job.id}`} className="linklike" style={{ display: 'block', textDecoration: 'none', width: '100%', borderTop: '1px solid var(--grey-2, #e4e4e7)', padding: '8px 0' }}>
            <span><span aria-hidden style={{ color: RAG[r.rag].colour }}>●</span> <strong>{RAG[r.rag].word}</strong> · {`${r.job.job_number ?? ''} ${r.job.title}`.trim()}</span><br />
            <span className="muted small">{r.why}</span><br />
            <span className="muted small">Contract {formatGBP(r.contract)} · billed {formatGBP(r.billed)} · owed {formatGBP(r.owed)} · to bill {formatGBP(r.toBill)}</span>
          </Link>
        ))}
        <p className="muted small">Red: a payment is more than 30 days late. Amber: a payment is late, the job has been billed more than its contract value, or there is no contract value. Green: nothing late.</p>
      </div>
    </>
  )
}
