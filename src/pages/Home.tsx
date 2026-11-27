import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useLock } from '../lib/lock'
import { toggleTodo } from '../lib/planner/actions'
import { addDaysIso, eventDays, mondayOf, newDayLabel, shortDay, timeText, todayIso, useEvents, useReminders, useTodos } from '../lib/planner/data'
import { newId, save } from '../lib/sync/store'
import { useLabels } from './planner/shared'
import Notices from '../components/Notices'

export default function Home() {
  const { profile, can, isOwner } = useAuth()
  const lockOn = useLock().enabled
  const name = profile?.full_name?.split(' ')[0]
  const todos = useTodos()
  const events = useEvents()
  const reminders = useReminders()
  const labels = useLabels()
  const t0 = todayIso()
  const me = profile?.id
  const [mine, setMine] = useState(true)
  const [day, setDay] = useState(t0)
  const [title, setTitle] = useState('')
  const show = (a: string | null) => !mine || !a || a === me

  const week = Array.from({ length: 7 }, (_, i) => addDaysIso(mondayOf(t0), i))
  const evs = can('diary') ? (events ?? []).filter((e) => show(e.assigned_to)) : []
  const onDay = (d: string) => evs.filter((e) => eventDays(e).includes(d)).sort((a, b) => (a.all_day ? '' : a.start_time ?? '').localeCompare(b.all_day ? '' : b.start_time ?? ''))
  const remsOn = (d: string) => reminders.filter((r) => r.date === d || (d === t0 && r.date < t0))
  const open = can('todos') ? (todos ?? []).filter((t) => !t.done_at && show(t.assigned_to)) : []
  const by = (a: { due_date: string | null }, b: { due_date: string | null }) => String(a.due_date ?? '9999').localeCompare(String(b.due_date ?? '9999'))
  const late = open.filter((t) => t.due_date && t.due_date < t0).sort(by)
  const today = open.filter((t) => t.due_date === t0)
  const soon = open.filter((t) => t.due_date && t.due_date > t0 && t.due_date <= addDaysIso(t0, 7)).sort(by)
  const undated = open.filter((t) => !t.due_date).slice(0, 5)

  async function add() {
    if (!title.trim()) return
    await save('todos', newId(), { title: title.trim(), job_id: null, assigned_to: null, due_date: t0, recurrence: 'none', show_in_diary: true, created_by: me ?? null })
    setTitle('')
  }
  const dayEvents = onDay(day)
  const dayRems = remsOn(day)

  const Row = ({ t }: { t: NonNullable<typeof todos>[number] }) => (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '4px 0' }}>
      <button type="button" aria-label={`Mark ${t.title} as done`} onClick={() => toggleTodo(t)}
        style={{ flex: 'none', width: 30, height: 30, minHeight: 30, borderRadius: '50%', border: '2px solid var(--black, #111)', background: 'transparent', padding: 0, cursor: 'pointer' }} />
      <Link to="/todos" className="linklike" style={{ flex: 1, textDecoration: 'none', minHeight: 30, display: 'block' }}>
        {t.title}
        <span className="muted small" style={t.due_date && t.due_date < t0 ? { color: 'var(--red, #b01e1e)' } : undefined}>{t.due_date && t.due_date !== t0 ? ` · ${t.due_date < t0 ? 'overdue, was ' : ''}${shortDay(t.due_date)}` : ''}{t.job_id ? ` · ${labels.jobName(t.job_id)}` : ''}</span>
      </Link>
    </div>
  )

  return (
    <>
      <div className="rowtop" style={{ alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>{name ? `Hello, ${name}` : 'Hello'}</h1>
        <div className="chips" role="group" aria-label="Whose" style={{ padding: 0 }}>
          <button className={`chip seg ${mine ? 'on' : ''}`} onClick={() => setMine(true)}>Mine</button>
          <button className={`chip seg ${!mine ? 'on' : ''}`} onClick={() => setMine(false)}>Everyone</button>
        </div>
      </div>
      {!lockOn && (
        <Link className="card linkcard notice" to="/more/security"><strong>Protect this device</strong><span className="muted"> Set a PIN or Face ID so the app locks if the phone is left in the van.</span></Link>
      )}
      <Notices />
      {isOwner && <Link className="card linkcard" to="/more/dashboard"><strong>Dashboard</strong><span className="muted"> Money owed, how late, pipeline and live jobs</span></Link>}

      {can('diary') && (
        <div className="card">
          <div className="rowtop"><h2 style={{ margin: 0 }}>Calendar</h2><Link to="/diary" className="small">Open diary →</Link></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, margin: '10px 0' }}>
            {week.map((d) => {
              const n = onDay(d).length + remsOn(d).length
              const sel = d === day
              return (
                <button key={d} type="button" onClick={() => setDay(d)} aria-label={newDayLabel(d)}
                  style={{ minHeight: 56, borderRadius: 10, padding: 2, cursor: 'pointer', border: sel ? '2px solid var(--black, #111)' : '1px solid var(--grey-2, #ddd)', background: sel ? 'var(--black, #111)' : d === t0 ? 'var(--grey-1, #f4f4f6)' : 'transparent', color: sel ? '#fff' : 'inherit' }}>
                  <div style={{ fontSize: '.7rem', opacity: 0.8 }}>{new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short' })}</div>
                  <div style={{ fontWeight: 700 }}>{Number(d.slice(8))}</div>
                  <div style={{ fontSize: '.6rem', color: sel ? '#fff' : 'var(--red, #b01e1e)', height: 10 }}>{n > 0 ? '●'.repeat(Math.min(n, 3)) : ''}</div>
                </button>
              )
            })}
          </div>
          <h3 style={{ margin: '4px 0' }}>{day === t0 ? 'Today' : newDayLabel(day)}</h3>
          {!dayEvents.length && !dayRems.length && <p className="muted small">Nothing in the diary.</p>}
          {dayEvents.map((e) => (
            <Link key={e.id} to="/diary" className="linklike" style={{ display: 'block', textDecoration: 'none' }}>
              <strong>{e.title}</strong> <span className="muted small">{timeText(e)}</span>
              {(e.job_id || e.location) && <><br /><span className="muted small">{[e.job_id ? labels.jobName(e.job_id) : '', e.location].filter(Boolean).join(' · ')}</span></>}
            </Link>
          ))}
          {dayRems.map((r) => <Link key={r.key} to={`/jobs/${r.job_id}`} className="linklike" style={{ display: 'block', textDecoration: 'none' }}>⏰ {r.text}</Link>)}
        </div>
      )}

      {can('todos') && (
        <div className="card">
          <div className="rowtop"><h2 style={{ margin: 0 }}>Tasks</h2><Link to="/todos" className="small">Open to-dos →</Link></div>
          <div style={{ display: 'flex', gap: 8, margin: '8px 0' }}>
            <input type="text" aria-label="Add a task for today" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Add a task for today" />
            <button className="btn primary" style={{ width: 'auto', marginTop: 0 }} onClick={add} disabled={!title.trim()}>Add</button>
          </div>
          {!late.length && !today.length && !soon.length && !undated.length && <p className="muted">Nothing to do. Nicely done.</p>}
          {late.length > 0 && <><h3 style={{ margin: '8px 0 0', color: 'var(--red, #b01e1e)' }}>Overdue</h3>{late.map((t) => <Row key={t.id} t={t} />)}</>}
          {today.length > 0 && <><h3 style={{ margin: '8px 0 0' }}>Today</h3>{today.map((t) => <Row key={t.id} t={t} />)}</>}
          {soon.length > 0 && <><h3 style={{ margin: '8px 0 0' }}>Next 7 days</h3>{soon.map((t) => <Row key={t.id} t={t} />)}</>}
          {undated.length > 0 && <><h3 style={{ margin: '8px 0 0' }}>No date</h3>{undated.map((t) => <Row key={t.id} t={t} />)}</>}
        </div>
      )}
    </>
  )
}
