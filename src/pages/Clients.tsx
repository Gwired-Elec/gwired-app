import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '../lib/auth'
import { typeLabel, useClients, useJobs, type Client } from '../lib/jobs'
import { db, type Row } from '../lib/sync/db'
import { diff, newId, remove, save } from '../lib/sync/store'
import { useOutboxIds } from '../lib/sync/useOutbox'

export function ClientList() {
  const { can } = useAuth()
  const clients = useClients()
  const unsynced = useOutboxIds()
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (clients ?? []).filter((c) => !t || [c.name, c.email, c.phone, c.address].some((v) => (v ?? '').toLowerCase().includes(t)))
  }, [clients, q])
  return (
    <>
      <p><Link to="/more">← More</Link></p>
      <div className="rowtop">
        <h1>Clients</h1>
        {can('clients.edit') && <Link className="btn primary" style={{ width: 'auto', marginTop: 0, display: 'inline-grid', placeItems: 'center', textDecoration: 'none' }} to="/clients/new">+ New client</Link>}
      </div>
      <div className="toolbar"><input type="text" placeholder="Search clients…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search clients" /></div>
      {!clients && <p className="muted">Loading…</p>}
      {clients && !shown.length && <div className="card"><p className="muted">{clients.length ? 'No clients match.' : 'No clients yet.'}</p></div>}
      {shown.map((c) => (
        <Link key={c.id} to={`/clients/${c.id}`} className="card linkcard">
          <strong>{c.name}</strong>{unsynced.has(c.id) && <span className="badge"> not yet synced</span>}
          <span className="muted">{typeLabel(c.client_type)}{c.phone ? ` · ${c.phone}` : ''}{c.email ? ` · ${c.email}` : ''}</span>
        </Link>
      ))}
    </>
  )
}

const blank = { name: '', client_type: 'domestic', email: '', phone: '', address: '', notes: '' }
const toForm = (c?: Client) => (c ? { name: c.name ?? '', client_type: c.client_type ?? 'domestic', email: c.email ?? '', phone: c.phone ?? '', address: c.address ?? '', notes: c.notes ?? '' } : blank)

export function ClientDetail() {
  const { id = '' } = useParams()
  const isNew = id === 'new'
  const { can } = useAuth()
  const nav = useNavigate()
  const client = useLiveQuery(() => (isNew ? Promise.resolve(undefined) : (db().clients.get(id) as Promise<Client | undefined>)), [id])
  const jobs = useJobs()
  const [f, setF] = useState(blank)
  const [saved, setSaved] = useState('')
  const editable = can('clients.edit')
  useEffect(() => setF(toForm(client)), [client?.updated_at]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))

  if (!isNew && client === undefined) return <p className="muted">Loading…</p>
  if (!isNew && (!client || client.deleted_at)) return <><p><Link to="/clients">← Clients</Link></p><div className="card"><p>That client isn't on this device.</p></div></>

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (isNew) {
      const nid = newId()
      await save('clients', nid, { ...f, name: f.name.trim(), email: f.email.trim() || null, phone: f.phone.trim() || null, address: f.address.trim() || null, notes: f.notes.trim() || null })
      nav(`/clients/${nid}`, { replace: true })
    } else {
      const changes = diff(client, f)
      if (Object.keys(changes).length) await save('clients', id, changes)
      setSaved('Saved.')
      setTimeout(() => setSaved(''), 3000)
    }
  }

  return (
    <>
      <p><Link to="/clients">← Clients</Link></p>
      <h1>{isNew ? 'New client' : client?.name}</h1>
      <form className="card" onSubmit={submit}>
        <label htmlFor="n">Name</label>
        <input id="n" type="text" required disabled={!editable} value={f.name} onChange={(e) => set('name', e.target.value)} />
        <label htmlFor="t">Type</label>
        <select id="t" disabled={!editable} value={f.client_type} onChange={(e) => set('client_type', e.target.value)}>
          <option value="domestic">Domestic</option>
          <option value="commercial">Commercial</option>
        </select>
        <label htmlFor="e">Email</label>
        <input id="e" type="email" inputMode="email" autoComplete="off" disabled={!editable} value={f.email} onChange={(e) => set('email', e.target.value)} />
        <label htmlFor="p">Phone</label>
        <input id="p" type="text" inputMode="tel" disabled={!editable} value={f.phone} onChange={(e) => set('phone', e.target.value)} />
        <label htmlFor="a">Address</label>
        <input id="a" type="text" disabled={!editable} value={f.address} onChange={(e) => set('address', e.target.value)} />
        <label htmlFor="no">Notes</label>
        <textarea id="no" rows={3} disabled={!editable} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        {saved && <p className="ok" role="status">{saved}</p>}
        {editable && <button className="btn primary">{isNew ? 'Add client' : 'Save changes'}</button>}
      </form>

      {!isNew && <Contacts clientId={id} editable={editable} />}
      {!isNew && (
        <div className="card">
          <h2>Jobs</h2>
          {(jobs ?? []).filter((j) => j.client_id === id).map((j) => (
            <p key={j.id} style={{ margin: '0 0 8px' }}><Link to={`/jobs/${j.id}`}>{j.job_number ?? 'Pending'} · {j.title}</Link></p>
          ))}
          {!(jobs ?? []).some((j) => j.client_id === id) && <p className="muted">No jobs yet.</p>}
        </div>
      )}
    </>
  )
}

function Contacts({ clientId, editable }: { clientId: string; editable: boolean }) {
  const contacts = useLiveQuery(() => db().contacts.where('client_id').equals(clientId).filter((c) => !c.deleted_at).toArray(), [clientId])
  const [adding, setAdding] = useState(false)
  const [c, setC] = useState({ name: '', role: '', email: '', phone: '' })

  async function add(e: FormEvent) {
    e.preventDefault()
    await save('contacts', newId(), { client_id: clientId, name: c.name.trim(), role: c.role.trim() || null, email: c.email.trim() || null, phone: c.phone.trim() || null })
    setC({ name: '', role: '', email: '', phone: '' })
    setAdding(false)
  }
  return (
    <div className="card">
      <h2>Contacts</h2>
      {!contacts?.length && <p className="muted">No contacts yet.</p>}
      {contacts?.map((x: Row) => (
        <div key={x.id} className="rowtop" style={{ marginBottom: 10 }}>
          <div>
            <strong>{String(x.name)}</strong>{x.role ? <span className="muted"> · {String(x.role)}</span> : null}
            <div className="muted">{[x.phone, x.email].filter(Boolean).join(' · ')}</div>
          </div>
          {editable && <button className="btn" onClick={() => remove('contacts', x.id)}>Remove</button>}
        </div>
      ))}
      {editable && !adding && <button className="btn" onClick={() => setAdding(true)}>+ Add contact</button>}
      {adding && (
        <form onSubmit={add}>
          <label htmlFor="cn">Name</label>
          <input id="cn" type="text" required value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
          <label htmlFor="cr">Role</label>
          <input id="cr" type="text" value={c.role} onChange={(e) => setC({ ...c, role: e.target.value })} />
          <label htmlFor="ce">Email</label>
          <input id="ce" type="email" inputMode="email" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} />
          <label htmlFor="cp">Phone</label>
          <input id="cp" type="text" inputMode="tel" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} />
          <div className="actions">
            <button className="btn primary" style={{ width: 'auto' }}>Add contact</button>
            <button type="button" className="btn" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  )
}
