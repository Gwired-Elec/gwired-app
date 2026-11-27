import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useClauseLibrary, type LibraryClause } from '../../lib/estimating/data'
import { newId, remove, save } from '../../lib/sync/store'

// The standard exclusions and assumptions. Tick them onto each quote from the Estimate tab; wording can be changed there per quote.
export default function Clauses() {
  const { can } = useAuth()
  const rows = useClauseLibrary()
  if (!can('estimates.view')) return <><h1>Exclusions and assumptions</h1><p className="muted">You don't have permission to see estimating data.</p></>
  const edit = can('estimates.edit')
  const add = (kind: LibraryClause['kind']) => save('clause_library', newId(), { kind, title: 'New clause', body: 'Wording…', sort: (rows?.filter((r) => r.kind === kind).at(-1)?.sort ?? 0) + 10, default_on: false, active: true })

  const card = (c: LibraryClause) => (
    <div className="card" key={c.id}>
      <label htmlFor={'t' + c.id}>Short title</label>
      <input id={'t' + c.id} key={c.title} type="text" defaultValue={c.title} disabled={!edit} onBlur={(e) => e.target.value.trim() && e.target.value !== c.title && save('clause_library', c.id, { title: e.target.value.trim() })} />
      <label htmlFor={'b' + c.id}>Wording on the quote</label>
      <textarea id={'b' + c.id} key={c.body} rows={4} defaultValue={c.body} disabled={!edit} onBlur={(e) => e.target.value.trim() && e.target.value !== c.body && save('clause_library', c.id, { body: e.target.value.trim() })} />
      <label className="check"><input type="checkbox" disabled={!edit} checked={c.default_on} onChange={(e) => save('clause_library', c.id, { default_on: e.target.checked })} /> Ticked automatically on every new estimate</label>
      <label className="check"><input type="checkbox" disabled={!edit} checked={c.active !== false} onChange={(e) => save('clause_library', c.id, { active: e.target.checked })} /> In use (untick to hide it from the list)</label>
      {edit && <button className="link small" onClick={() => remove('clause_library', c.id)}>Delete this clause</button>}
    </div>
  )
  const section = (kind: LibraryClause['kind'], title: string, hint: string) => (
    <>
      <h2>{title}</h2>
      <p className="muted small">{hint}</p>
      {(rows ?? []).filter((r) => r.kind === kind).map(card)}
      {edit && <button className="btn" onClick={() => add(kind)}>+ Add {kind === 'exclusion' ? 'an exclusion' : 'an assumption'}</button>}
    </>
  )
  return (
    <>
      <p><Link to="/more/estimating">← Estimating data</Link></p>
      <h1>Exclusions and assumptions</h1>
      <p className="muted">Your standard wording. On each estimate you tick the ones that apply and they print on the quote PDF. Changing the wording here does not change quotes already made.</p>
      {!rows ? <p className="muted">Loading…</p> : !rows.length ? <p className="muted">Nothing here yet. If you have just updated the app, the database script 012 still needs to be run, then this fills in with a starter list.</p> : null}
      {section('assumption', 'Assumptions', 'What the price relies on being true: access, power, the state of the existing installation.')}
      {section('exclusion', 'Exclusions', 'What the price does not include.')}
    </>
  )
}
