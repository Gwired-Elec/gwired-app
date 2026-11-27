import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useLock } from '../lib/lock'
import { eventDays, timeText, todayIso, useEvents, useReminders, useTodos } from '../lib/planner/data'
import { useLabels } from './planner/shared'

export default function Home() {
  const { profile, can } = useAuth()
  const lockOn = useLock().enabled
  const name = profile?.full_name?.split(' ')[0]
  const todos = useTodos()
  const events = useEvents()
  const reminders = useReminders()
  const labels = useLabels()
  const t0 = todayIso()
  const me = profile?.id
  // what is on for me today: my to-dos (or anyone's unassigned), overdue ones first, today's diary entries and any reminders
  const mineOrOpen = (a: string | null) => !a || a === me
  const due = can('todos') ? (todos ?? []).filter((t) => !t.done_at && t.due_date && t.due_date <= t0 && mineOrOpen(t.assigned_to)).sort((a, b) => String(a.due_date).localeCompare(String(b.due_date))) : []
  const today = can('diary') ? (events ?? []).filter((e) => eventDays(e).includes(t0) && mineOrOpen(e.assigned_to)) : []
  const rem = reminders.filter((r) => r.date <= t0)
  const empty = !due.length && !today.length && !rem.length
  return (
    <>
      <h1>{name ? `Hello, ${name}` : 'Hello'}</h1>
      {!lockOn && (
        <Link className="card linkcard notice" to="/more/security"><strong>Protect this device</strong><span className="muted"> Set a PIN or Face ID so the app locks if the phone is left in the van.</span></Link>
      )}
      <div className="card">
        <h2>Today</h2>
        {empty && <p className="muted">Nothing due today. <Link to="/todos">To-dos</Link> · <Link to="/diary">Diary</Link></p>}
        {today.map((e) => (
          <Link key={e.id} to="/diary" className="linklike" style={{ display: 'block', textDecoration: 'none' }}>
            <strong>{e.title}</strong> <span className="muted small">{timeText(e)}{e.job_id ? ' · ' + labels.jobName(e.job_id) : ''}</span>
          </Link>
        ))}
        {rem.map((r) => <Link key={r.key} to={`/jobs/${r.job_id}`} className="linklike" style={{ display: 'block', textDecoration: 'none' }}>⏰ {r.text}</Link>)}
        {due.map((t) => (
          <Link key={t.id} to="/todos" className="linklike" style={{ display: 'block', textDecoration: 'none' }}>
            ✓ {t.title} {t.due_date! < t0 && <span style={{ color: 'var(--red, #b01e1e)' }} className="small">overdue</span>}
          </Link>
        ))}
      </div>
    </>
  )
}
