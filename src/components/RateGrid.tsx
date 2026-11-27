import { useState, type ReactNode } from 'react'
import { parsePounds, toInputPounds } from '../lib/money'
import type { Row, SyncTable } from '../lib/sync/db'
import { newId, remove, save } from '../lib/sync/store'

export interface Col {
  key: string
  label: string
  kind: 'text' | 'money' | 'number' | 'percent' | 'bool' | 'select' | 'date'
  options?: [string, string][] // for select: [value, label]
  nullable?: boolean // an empty box means "no value" rather than 0
  hidden?: boolean // e.g. cost columns for people who may not see cost
  wide?: boolean
  list?: string[] // suggestions for a text box
}

// One card per row with labelled fields. Each field saves when you leave it (or tick/choose it); nothing needs a connection.
export default function RateGrid({ tbl, rows, cols, editable, newDefaults, addLabel, empty, extra }: {
  tbl: SyncTable
  rows: Row[] | undefined
  cols: Col[]
  editable: boolean
  newDefaults: Record<string, unknown>
  addLabel: string
  empty?: string
  extra?: (row: Row) => ReactNode
}) {
  const shown = cols.filter((c) => !c.hidden)
  return (
    <>
      {!rows && <p className="muted">Loading…</p>}
      {rows && !rows.length && <div className="card"><p className="muted">{empty ?? 'Nothing here yet.'}</p></div>}
      {rows?.map((r) => (
        <div className="card" key={r.id}>
          <div className="fieldgrid">
            {shown.map((c) => <Cell key={c.key} tbl={tbl} row={r} col={c} editable={editable} />)}
          </div>
          {extra?.(r)}
          {editable && <button className="link small" onClick={() => confirm('Remove this?') && remove(tbl, r.id)}>Remove</button>}
        </div>
      ))}
      {editable && <button className="btn" onClick={() => save(tbl, newId(), newDefaults)}>+ {addLabel}</button>}
    </>
  )
}

function Cell({ tbl, row, col, editable }: { tbl: SyncTable; row: Row; col: Col; editable: boolean }) {
  const v = row[col.key]
  const [err, setErr] = useState(false)
  const id = `${row.id}-${col.key}`
  const commit = (patch: unknown) => save(tbl, row.id, { [col.key]: patch })
  const cls = col.wide ? 'f wide' : 'f'

  if (col.kind === 'bool')
    return <label className={cls + ' check'}><input type="checkbox" disabled={!editable} checked={!!v} onChange={(e) => commit(e.target.checked)} /> {col.label}</label>

  let control: ReactNode
  if (col.kind === 'date')
    control = <input id={id} type="date" disabled={!editable} value={String(v ?? '')} onChange={(e) => commit(e.target.value || null)} />
  else if (col.kind === 'select')
    control = <select id={id} disabled={!editable} value={String(v ?? '')} onChange={(e) => commit(e.target.value === '' ? null : e.target.value)}>{col.options!.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
  else {
    const text = col.kind === 'money' ? toInputPounds(v as number | null) : v == null ? '' : String(v)
    const listId = col.list ? id + '-list' : undefined
    control = (
      <>
        <input
          id={id}
          key={String(v ?? '') + (row.updated_at ?? '')} // refresh when a synced change arrives
          type="text"
          list={listId}
          inputMode={col.kind === 'money' || col.kind === 'number' || col.kind === 'percent' ? 'decimal' : undefined}
          disabled={!editable}
          defaultValue={text}
          aria-invalid={err}
          onBlur={(e) => {
            const t = e.target.value.trim()
            if (t === text) return setErr(false)
            if (col.kind === 'text') return void (setErr(false), commit(t === '' && col.nullable ? null : t))
            if (t === '') return void (setErr(false), commit(col.nullable ? null : 0))
            if (col.kind === 'money') {
              const p = parsePounds(t)
              if (p === null) return setErr(true)
              return void (setErr(false), commit(p))
            }
            const n = Number(t.replace('%', ''))
            if (!Number.isFinite(n)) return setErr(true)
            setErr(false)
            commit(n)
          }}
        />
        {col.list && <datalist id={listId}>{col.list.map((o) => <option key={o} value={o} />)}</datalist>}
      </>
    )
  }
  return (
    <div className={cls}>
      <label htmlFor={id}>{col.label}{col.kind === 'money' ? ' (£)' : col.kind === 'percent' ? ' (%)' : ''}</label>
      {control}
      {err && <span className="err small">Check this value</span>}
    </div>
  )
}
