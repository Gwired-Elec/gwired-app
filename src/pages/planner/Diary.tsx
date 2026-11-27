import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { addDaysIso, buildIcs, dayLabel, eventDays, isoDate, mondayOf, parseIso, timeText, todayIso, useEvents, useReminders, useTodos, type CalEvent } from '../../lib/planner/data'
import { newId, remove, save } from '../../lib/sync/store'
import CalendarLink from './CalendarLink'
import { JobSelect, PersonSelect, useLabels } from './shared'

export default function DiaryPage() {
  const { can } = useAuth()
  if (!can('diary')) return <><h1>Diary</h1><p className="muted">You do not have access to the diary.</p></>
  return <><h1>Diary</h1><DiaryPanel /></>
}

type Labels = ReturnType<typeof useLabels>

// The diary: a week or a month for the whole business (the Diary tab), or one job's entries (jobId).
export function DiaryPanel({ jobId }: { jobId?: string }) {
  const { can, profile } = useAuth()
  const events = useEvents()
  const todos = useTodos()
  const reminders = useReminders()
  const labels = useLabels()
  const edit = can('diary')
  const me = profile?.id ?? ''
  const t0 = todayIso()
  const [view, setView] = useState<'week' | 'month'>('week')
  const [anchor, setAnchor] = useState(t0)
  const [picked, setPicked] = useState(t0)
  const [mine, setMine] = useState(false)
  const [form, setForm] = useState<{ id?: string; date: string } | null>(null)

  const evs = useMemo(() => (events ?? []).filter((e) => (!jobId || e.job_id === jobId) && (!mine || !e.assigned_to || e.assigned_to === me)), [events, jobId, mine, me])
  const tds = useMemo(() => (todos ?? []).filter((t) => t.due_date && !t.done_at && t.show_in_diary && (!jobId || t.job_id === jobId) && (!mine || t.assigned_to === me)), [todos, jobId, mine, me])
  const rems = useMemo(() => reminders.filter((r) => !jobId || r.job_id === jobId), [reminders, jobId])
  if (!events || !todos) return <p className="muted">Loading…</p>

  const dayItems = (d: string) => ({
    events: evs.filter((e) => eventDays(e).includes(d)).sort((a, b) => (a.all_day ? '' : a.start_time ?? '').localeCompare(b.all_day ? '' : b.start_time ?? '')),
    todos: tds.filter((t) => t.due_date === d),
    rems: rems.filter((r) => r.date === d),
  })

  function download() {
    const ics = buildIcs(evs, tds, labels.jobName)
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'G-Wired diary.ics'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  const DayBlock = ({ d, heading }: { d: string; heading?: string }) => {
    const it = dayItems(d)
    const empty = !it.events.length && !it.todos.length && !it.rems.length
    return (
      <div className="card">
        <div className="rowtop">
          <h2 style={{ margin: 0, color: d === t0 ? 'var(--red, #b01e1e)' : undefined }}>{heading ?? dayLabel(d)}{d === t0 && !heading ? ' (today)' : ''}</h2>
          {edit && <button className="btn" style={{ width: 'auto', marginTop: 0 }} onClick={() => setForm({ date: d })}>+ Add</button>}
        </div>
        {empty && <p className="muted small">Nothing booked.</p>}
        {it.events.map((e) => (
          <button key={e.id} className="linklike" style={{ display: 'block', width: '100%', textAlign: 'left' }} onClick={() => setForm({ id: e.id, date: d })}>
            <strong>{e.title}</strong> <span className="muted small">{timeText(e)}</span>
            <br /><span className="muted small">{[e.job_id ? labels.jobName(e.job_id) : '', e.location, e.assigned_to ? labels.who(e.assigned_to) : ''].filter(Boolean).join(' · ')}</span>
          </button>
        ))}
        {it.todos.map((t) => <Link key={t.id} to="/todos" className="linklike" style={{ display: 'block', textDecoration: 'none' }}>✓ {t.title} <span className="muted small">{t.job_id ? '· ' + labels.jobName(t.job_id) : ''}</span></Link>)}
        {it.rems.map((r) => <Link key={r.key} to={`/jobs/${r.job_id}`} className="linklike" style={{ display: 'block', textDecoration: 'none' }}>⏰ {r.text}</Link>)}
      </div>
    )
  }

  // a job's own diary: everything from today onwards, then what has passed
  if (jobId) {
    const all = [...new Set([...evs.flatMap((e) => eventDays(e)), ...tds.map((t) => t.due_date!), ...rems.map((r) => r.date)])].sort()
    return (
      <>
        {edit && <div className="card"><button className="btn primary" onClick={() => setForm({ date: t0 })}>+ Add a diary entry for this job</button></div>}
        {form && <EventForm key={form.id ?? 'new'} ev={evs.find((e) => e.id === form.id)} date={form.date} jobId={jobId} labels={labels} me={me} onClose={() => setForm(null)} />}
        {!all.length && <div className="card"><p className="muted">Nothing in the diary for this job.</p></div>}
        {all.filter((d) => d >= t0).map((d) => <DayBlock key={d} d={d} />)}
        {all.some((d) => d < t0) && <h3 style={{ margin: '16px 0 4px' }}>Earlier</h3>}
        {all.filter((d) => d < t0).reverse().map((d) => <DayBlock key={d} d={d} />)}
      </>
    )
  }

  const monday = mondayOf(anchor)
  const week = Array.from({ length: 7 }, (_, i) => addDaysIso(monday, i))
  const first = parseIso(anchor.slice(0, 8) + '01')
  const gridStart = mondayOf(isoDate(first))
  const cells = Array.from({ length: 42 }, (_, i) => addDaysIso(gridStart, i))
  const step = (n: number) => {
    if (view === 'week') setAnchor(addDaysIso(anchor, 7 * n))
    else { const d = parseIso(anchor); d.setDate(1); d.setMonth(d.getMonth() + n); setAnchor(isoDate(d)) }
  }
  const title = view === 'week' ? `${parseIso(week[0]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} to ${parseIso(week[6]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : parseIso(anchor).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  return (
    <>
      <div className="card">
        <div className="rowtop">
          <div className="chips" role="group" aria-label="View">
            <button className={`chip seg ${view === 'week' ? 'on' : ''}`} onClick={() => setView('week')}>Week</button>
            <button className={`chip seg ${view === 'month' ? 'on' : ''}`} onClick={() => setView('month')}>Month</button>
            <button className={`chip seg ${!mine ? 'on' : ''}`} onClick={() => setMine(false)}>Everyone</button>
            <button className={`chip seg ${mine ? 'on' : ''}`} onClick={() => setMine(true)}>Mine</button>
          </div>
        </div>
        <div className="rowtop" style={{ alignItems: 'center', marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button className="btn" style={{ width: 'auto', marginTop: 0, minHeight: 36, padding: '0 12px' }} onClick={() => step(-1)} aria-label="Earlier">‹</button>
            <button className="btn" style={{ width: 'auto', marginTop: 0, minHeight: 36, padding: '0 10px', fontSize: '.85rem' }} onClick={() => (setAnchor(t0), setPicked(t0))}>Today</button>
          </div>
          <strong>{title}</strong>
          <button className="btn" style={{ width: 'auto', marginTop: 0, minHeight: 36, padding: '0 12px' }} onClick={() => step(1)} aria-label="Later">›</button>
        </div>
        <div className="actions" style={{ marginTop: 8 }}>
          {edit && <button className="btn primary" onClick={() => setForm({ date: view === 'month' ? picked : t0 })}>+ Add a diary entry</button>}
          <button className="btn" onClick={download} title="A calendar file you can open in Outlook, Google or Apple Calendar">Download calendar file</button>
        </div>
      </div>
      {form && <EventForm key={form.id ?? 'new' + form.date} ev={evs.find((e) => e.id === form.id)} date={form.date} labels={labels} me={me} onClose={() => setForm(null)} />}

      {view === 'week' && week.map((d) => <DayBlock key={d} d={d} />)}
      {view === 'month' && (
        <>
          <div className="card" style={{ padding: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, textAlign: 'center' }}>
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x, i) => <span key={i} className="muted small">{x}</span>)}
              {cells.map((d) => {
                const it = dayItems(d)
                const n = it.events.length + it.todos.length + it.rems.length
                const inMonth = d.slice(0, 7) === anchor.slice(0, 7)
                return (
                  <button key={d} type="button" onClick={() => setPicked(d)} aria-label={dayLabel(d)}
                    style={{ minHeight: 48, border: d === picked ? '2px solid var(--black, #111)' : '1px solid var(--grey-2, #ddd)', borderRadius: 8, background: d === t0 ? 'var(--grey-1, #f4f4f6)' : 'transparent', opacity: inMonth ? 1 : 0.4, cursor: 'pointer', padding: 2 }}>
                    <div>{parseIso(d).getDate()}</div>
                    {n > 0 && <div style={{ fontSize: '.7rem', color: 'var(--red, #b01e1e)' }}>{'●'.repeat(Math.min(n, 3))}</div>}
                  </button>
                )
              })}
            </div>
          </div>
          <DayBlock d={picked} />
        </>
      )}
      <CalendarLink />
    </>
  )
}

function EventForm({ ev, date, jobId, labels, me, onClose }: { ev?: CalEvent; date: string; jobId?: string; labels: Labels; me: string; onClose: () => void }) {
  const [title, setTitle] = useState(ev?.title ?? '')
  const [d, setD] = useState(ev?.event_date ?? date)
  const [end, setEnd] = useState(ev?.end_date ?? '')
  const [allDay, setAllDay] = useState(ev ? ev.all_day : true)
  const [st, setSt] = useState(ev?.start_time ?? '09:00')
  const [en, setEn] = useState(ev?.end_time ?? '')
  const [job, setJob] = useState(ev?.job_id ?? jobId ?? '')
  const [who, setWho] = useState(ev?.assigned_to ?? '')
  const [loc, setLoc] = useState(ev?.location ?? '')
  const [notes, setNotes] = useState(ev?.notes ?? '')
  const [err, setErr] = useState('')

  async function submit() {
    if (!title.trim()) return setErr('Give the entry a title.')
    if (!d) return setErr('Choose a date.')
    if (end && end < d) return setErr('The end date is before the start date.')
    if (!allDay && en && en < st) return setErr('The end time is before the start time.')
    await save('calendar_events', ev?.id ?? newId(), {
      title: title.trim(), event_date: d, end_date: end || null, all_day: allDay, start_time: allDay ? null : st || null, end_time: allDay ? null : en || null,
      job_id: jobId ?? (job || null), assigned_to: who || null, location: loc.trim() || null, notes: notes.trim() || null, ...(ev ? {} : { created_by: me }),
    })
    onClose()
  }
  return (
    <div className="card">
      <h2>{ev ? 'Diary entry' : 'New diary entry'}</h2>
      <label htmlFor="ev-t">Title</label>
      <input id="ev-t" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Site survey" autoFocus={!ev} />
      <div className="lgrid">
        <div className="f"><label htmlFor="ev-d">Date</label><input id="ev-d" type="date" value={d} onChange={(e) => setD(e.target.value)} /></div>
        <div className="f"><label htmlFor="ev-e">Until (if more than a day)</label><input id="ev-e" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
      </div>
      <label className="check"><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All day</label>
      {!allDay && (
        <div className="lgrid">
          <div className="f"><label htmlFor="ev-s">Starts</label><input id="ev-s" type="time" value={st} onChange={(e) => setSt(e.target.value)} /></div>
          <div className="f"><label htmlFor="ev-n">Ends</label><input id="ev-n" type="time" value={en} onChange={(e) => setEn(e.target.value)} /></div>
        </div>
      )}
      {!jobId && <><label htmlFor="ev-j">Job</label><JobSelect id="ev-j" value={job} onChange={setJob} labels={labels} /></>}
      <label htmlFor="ev-w">For</label><PersonSelect id="ev-w" value={who} onChange={setWho} labels={labels} />
      <label htmlFor="ev-l">Where</label>
      <input id="ev-l" type="text" value={loc} onChange={(e) => setLoc(e.target.value)} />
      <label htmlFor="ev-o">Notes</label>
      <textarea id="ev-o" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn primary" onClick={submit}>{ev ? 'Save' : 'Add to diary'}</button>
      <button className="btn" onClick={onClose}>Cancel</button>
      {ev && <button className="btn" onClick={async () => { if (confirm('Delete this diary entry?')) { await remove('calendar_events', ev.id); onClose() } }}>Delete</button>}
    </div>
  )
}
