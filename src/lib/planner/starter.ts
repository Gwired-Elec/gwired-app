// The checklist added to a job's to-dos when its quote is accepted. (The quote-portal Edge Function adds the same list when a
// client accepts online: keep the two in step.) Pure, so it can be tested.
export const STARTER_TODOS: { title: string; days: number }[] = [
  { title: 'Confirm the start date with the client', days: 1 },
  { title: 'Send order acknowledgement and payment terms', days: 1 },
  { title: 'Order materials (see the Costs tab: materials still needed)', days: 2 },
  { title: 'Book the job into the diary', days: 2 },
  { title: 'Raise the deposit invoice or first application for payment', days: 3 },
  { title: 'Prepare RAMS and site induction', days: 5 },
]

const plus = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// the to-dos still to be added: leaves out any the job already has (so accepting twice never doubles them up)
export function starterTodos(today: string, existingTitles: string[]): { title: string; due_date: string }[] {
  const have = new Set(existingTitles.map((t) => t.trim().toLowerCase()))
  return STARTER_TODOS.filter((s) => !have.has(s.title.toLowerCase())).map((s) => ({ title: s.title, due_date: plus(today, s.days) }))
}
