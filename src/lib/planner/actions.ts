// Ticking a to-do off (or back on). A repeating to-do starts its next one straight away, and never one that is already in the past.
import { newId, save, saveBatch } from '../sync/store'
import { nextDue, todayIso, type Todo } from './data'

export async function toggleTodo(t: Todo) {
  if (t.done_at) return save('todos', t.id, { done_at: null })
  const items: { tbl: 'todos'; id: string; patch: Record<string, unknown> }[] = [{ tbl: 'todos', id: t.id, patch: { done_at: new Date().toISOString() } }]
  if (t.recurrence !== 'none' && t.due_date) {
    const t0 = todayIso()
    let nd = nextDue(t.due_date, t.recurrence)
    for (let i = 0; i < 400 && nd < t0; i++) nd = nextDue(nd, t.recurrence)
    items.push({ tbl: 'todos', id: newId(), patch: { title: t.title, notes: t.notes, job_id: t.job_id, assigned_to: t.assigned_to, due_date: nd, recurrence: t.recurrence, show_in_diary: t.show_in_diary, created_by: t.created_by } })
  }
  await saveBatch(items)
}
