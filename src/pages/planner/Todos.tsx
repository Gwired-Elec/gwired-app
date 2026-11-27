import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { addDaysIso, nextDue, shortDay, todayIso, useReminders, useTodos, type Recurrence, type Todo } from '../../lib/planner/data'
import { newId, remove, save, saveBatch } from '../../lib/sync/store'
import { JobSelect, PersonSelect, useLabels } from './shared'

const REPEAT: [Recurrence, string][] = [['none', 'Does not repeat'], ['daily', 'Every day'], ['weekly', 'Every week'], ['monthly', 'Every month']]

export default function TodosPage() {
  const { can } = useAuth()
  if (!can('todos')) return <><h1>To-dos</h1><p className="muted">You do not have access to to-dos.</p></>
  return <><h1>To-dos</h1><TodoPanel /></>
}

// The to-do list, for the whole business (the To-dos tab) or for one job (jobId).
export function TodoPanel({ jobId }: { jobId?: string }) {
  const { can, profile } = useAuth()
  const todos = useTodos()
  const reminders = useReminders()
  const labels = useLabels()
  const edit = can('todos')
  const me = profile?.id ?? ''
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [job, setJob] = useState(jobId ?? '')
  const [who, setWho] = useState('')
  const [rep, setRep] = useState<Recurrence>('none')
  const [more, setMore] = useState(false)
  const [mine, setMine] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  if (!todos) return <p className="muted">Loading…</p>

  async function add() {
    if (!title.trim()) return
    await save('todos', newId(), { title: title.trim(), job_id: jobId ?? (job || null), assigned_to: who || null, due_date: due || null, recurrence: due ? rep : 'none', show_in_diary: true, created_by: me })
    setTitle(''); setDue(''); setRep('none'); setMore(false)
  }

  const t0 = todayIso()
  const mineOnly = (t: Todo) => !mine || t.assigned_to === me
  const rows = todos.filter((t) => (!jobId || t.job_id === jobId) && mineOnly(t))
  const openRows = rows.filter((t) => !t.done_at)
  const by = (a: Todo, b: Todo) => String(a.due_date ?? '9999').localeCompare(String(b.due_date ?? '9999')) || String(a.created_at).localeCompare(String(b.created_at))
  const overdue = openRows.filter((t) => t.due_date && t.due_date < t0).sort(by)
  const today = openRows.filter((t) => t.due_date === t0).sort(by)
  const soon = openRows.filter((t) => t.due_date && t.due_date > t0).sort(by)
  const undated = openRows.filter((t) => !t.due_date).sort(by)
  const done = rows.filter((t) => t.done_at).sort((a, b) => String(b.done_at).localeCompare(String(a.done_at))).slice(0, 20)
  const rem = reminders.filter((r) => (!jobId || r.job_id === jobId) && r.date <= addDaysIso(t0, 7)).sort((a, b) => a.date.localeCompare(b.date))

  const group = (heading: string, list: Todo[]) => list.length > 0 && (
    <div className="card">
      <h2>{heading} <span className="muted small">({list.length})</span></h2>
      {list.map((t) => <TodoCard key={t.id} t={t} labels={labels} open={open === t.id} onOpen={() => setOpen(open === t.id ? null : t.id)} edit={edit} hideJob={!!jobId} />)}
    </div>
  )
  return (
    <>
      {edit && (
        <div className="card">
          <label htmlFor="td-new">Add a to-do</label>
          <input id="td-new" type="text" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="e.g. Order 100m 2.5mm twin and earth" />
          <div className="chips" role="group" aria-label="When">
            <button className={`chip ${due === t0 ? 'on' : ''}`} onClick={() => setDue(due === t0 ? '' : t0)}>Today</button>
            <button className={`chip ${due === addDaysIso(t0, 1) ? 'on' : ''}`} onClick={() => setDue(due === addDaysIso(t0, 1) ? '' : addDaysIso(t0, 1))}>Tomorrow</button>
            <button className={`chip ${due === addDaysIso(t0, 7) ? 'on' : ''}`} onClick={() => setDue(due === addDaysIso(t0, 7) ? '' : addDaysIso(t0, 7))}>Next week</button>
            <button className="chip" onClick={() => setMore(!more)} aria-expanded={more}>{more ? 'Fewer options' : 'More options'}</button>
          </div>
          {more && (
            <>
              <div className="lgrid">
                <div className="f"><label htmlFor="td-due">Due date</label><input id="td-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
                <div className="f"><label htmlFor="td-rep">Repeats</label><select id="td-rep" value={rep} disabled={!due} onChange={(e) => setRep(e.target.value as Recurrence)}>{REPEAT.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
              </div>
              {!jobId && <><label htmlFor="td-job">Job</label><JobSelect id="td-job" value={job} onChange={setJob} labels={labels} /></>}
              <label htmlFor="td-who">For</label><PersonSelect id="td-who" value={who} onChange={setWho} labels={labels} />
            </>
          )}
          <button className="btn primary" onClick={add} disabled={!title.trim()}>Add to-do</button>
        </div>
      )}
      {!jobId && (
        <div className="chips" role="group" aria-label="Whose">
          <button className={`chip ${!mine ? 'on' : ''}`} onClick={() => setMine(false)}>Everyone</button>
          <button className={`chip ${mine ? 'on' : ''}`} onClick={() => setMine(true)}>Mine</button>
        </div>
      )}
      {rem.length > 0 && (
        <div className="card">
          <h2>Reminders <span className="muted small">(automatic)</span></h2>
          {rem.map((r) => (
            <Link key={r.key} to={`/jobs/${r.job_id}`} className="linklike" style={{ display: 'block', width: '100%', textAlign: 'left', textDecoration: 'none' }}>
              <span style={r.date < t0 ? { color: 'var(--red, #b01e1e)', fontWeight: 600 } : undefined}>{r.text}</span> <span className="muted small">· {r.date === t0 ? 'today' : r.date < t0 ? `overdue, was ${shortDay(r.date)}` : shortDay(r.date)}</span>
            </Link>
          ))}
        </div>
      )}
      {group('Overdue', overdue)}
      {group('Today', today)}
      {group('Coming up', soon)}
      {group('No date', undated)}
      {!openRows.length && <div className="card"><p className="muted">Nothing to do. Nicely done.</p></div>}
      {done.length > 0 && (
        <div className="card">
          <button className="linklike" onClick={() => setShowDone(!showDone)} aria-expanded={showDone}><strong>Done recently</strong> <span className="muted small">({done.length}) {showDone ? '▴' : '▾'}</span></button>
          {showDone && done.map((t) => <TodoCard key={t.id} t={t} labels={labels} open={open === t.id} onOpen={() => setOpen(open === t.id ? null : t.id)} edit={edit} hideJob={!!jobId} />)}
        </div>
      )}
    </>
  )
}

function TodoCard({ t, labels, open, onOpen, edit, hideJob }: { t: Todo; labels: ReturnType<typeof useLabels>; open: boolean; onOpen: () => void; edit: boolean; hideJob: boolean }) {
  const t0 = todayIso()
  const isDone = !!t.done_at

  async function tick() {
    if (isDone) return save('todos', t.id, { done_at: null })
    const items: { tbl: 'todos'; id: string; patch: Record<string, unknown> }[] = [{ tbl: 'todos', id: t.id, patch: { done_at: new Date().toISOString() } }]
    // a repeating to-do starts its next one straight away (never one that is already in the past)
    if (t.recurrence !== 'none' && t.due_date) {
      let nd = nextDue(t.due_date, t.recurrence)
      for (let i = 0; i < 400 && nd < t0; i++) nd = nextDue(nd, t.recurrence)
      items.push({ tbl: 'todos', id: newId(), patch: { title: t.title, notes: t.notes, job_id: t.job_id, assigned_to: t.assigned_to, due_date: nd, recurrence: t.recurrence, show_in_diary: t.show_in_diary, created_by: t.created_by } })
    }
    await saveBatch(items)
  }
  const meta = [
    t.due_date ? (t.due_date < t0 && !isDone ? `overdue, was ${shortDay(t.due_date)}` : t.due_date === t0 ? 'today' : shortDay(t.due_date)) : '',
    t.recurrence !== 'none' ? '↻ ' + t.recurrence : '',
    !hideJob && t.job_id ? labels.jobName(t.job_id) : '',
    t.assigned_to ? labels.who(t.assigned_to) : '',
  ].filter(Boolean).join(' · ')
  return (
    <div className="lcard">
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <button type="button" aria-label={isDone ? 'Mark as not done' : 'Mark as done'} disabled={!edit} onClick={tick}
          style={{ flex: 'none', width: 32, height: 32, minHeight: 32, marginTop: 2, borderRadius: '50%', border: '2px solid var(--black, #111)', background: isDone ? 'var(--black, #111)' : 'transparent', color: '#fff', cursor: 'pointer', padding: 0 }}>{isDone ? '✓' : ''}</button>
        <button type="button" className="linklike" style={{ flex: 1, textAlign: 'left', minHeight: 36 }} onClick={onOpen} aria-expanded={open}>
          <span style={{ textDecoration: isDone ? 'line-through' : undefined, opacity: isDone ? 0.6 : 1 }}>{t.title}</span>
          {meta && <><br /><span className="muted small" style={t.due_date && t.due_date < t0 && !isDone ? { color: 'var(--red, #b01e1e)' } : undefined}>{meta}</span></>}
        </button>
      </div>
      {open && <TodoEditor t={t} labels={labels} edit={edit} hideJob={hideJob} />}
    </div>
  )
}

function TodoEditor({ t, labels, edit, hideJob }: { t: Todo; labels: ReturnType<typeof useLabels>; edit: boolean; hideJob: boolean }) {
  const set = (patch: Record<string, unknown>) => save('todos', t.id, patch)
  return (
    <div style={{ marginTop: 8 }}>
      <label htmlFor={'tt' + t.id}>To-do</label>
      <input id={'tt' + t.id} type="text" disabled={!edit} defaultValue={t.title} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== t.title && set({ title: e.target.value.trim() })} />
      <label htmlFor={'tn' + t.id}>Notes</label>
      <textarea id={'tn' + t.id} rows={2} disabled={!edit} defaultValue={t.notes ?? ''} onBlur={(e) => e.target.value.trim() !== (t.notes ?? '') && set({ notes: e.target.value.trim() || null })} />
      <div className="lgrid">
        <div className="f"><label htmlFor={'td' + t.id}>Due date</label><input id={'td' + t.id} type="date" disabled={!edit} value={t.due_date ?? ''} onChange={(e) => set({ due_date: e.target.value || null, ...(e.target.value ? {} : { recurrence: 'none' }) })} /></div>
        <div className="f"><label htmlFor={'tr' + t.id}>Repeats</label><select id={'tr' + t.id} disabled={!edit || !t.due_date} value={t.recurrence} onChange={(e) => set({ recurrence: e.target.value })}>{REPEAT.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      </div>
      {!hideJob && <><label htmlFor={'tj' + t.id}>Job</label><JobSelect id={'tj' + t.id} value={t.job_id ?? ''} onChange={(v) => set({ job_id: v || null })} labels={labels} /></>}
      <label htmlFor={'tw' + t.id}>For</label><PersonSelect id={'tw' + t.id} value={t.assigned_to ?? ''} onChange={(v) => set({ assigned_to: v || null })} labels={labels} />
      <label className="check"><input type="checkbox" disabled={!edit} checked={t.show_in_diary} onChange={(e) => set({ show_in_diary: e.target.checked })} /> Show on the diary on its due date</label>
      {t.job_id && !hideJob && <p className="small"><Link to={`/jobs/${t.job_id}`}>Open the job →</Link></p>}
      {edit && <button className="btn" onClick={() => confirm('Delete this to-do?') && remove('todos', t.id)}>Delete</button>}
    </div>
  )
}
