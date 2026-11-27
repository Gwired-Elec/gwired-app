import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { JOB_TYPES, useClients } from '../lib/jobs'
import { logActivity, newId, save } from '../lib/sync/store'
import { addDaysIso, todayIso } from '../lib/planner/data'

const NEW = '__new'

export default function NewJob() {
  const { can, profile } = useAuth()
  const nav = useNavigate()
  const clients = useClients()
  const [title, setTitle] = useState('')
  const [clientId, setClientId] = useState('')
  const [nc, setNc] = useState({ name: '', client_type: 'domestic', email: '', phone: '', address: '' }) // the new client, if adding one here
  const [site, setSite] = useState('')
  const [type, setType] = useState('domestic')
  const [mainContractor, setMainContractor] = useState('')
  const [source, setSource] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  if (!can('jobs.edit')) return <><h1>New job</h1><p className="muted">You don't have permission to create jobs.</p></>
  const canAddClient = can('clients.edit')
  const adding = clientId === NEW

  function pickClient(id: string) {
    setClientId(id)
    if (id === NEW) return
    const c = clients?.find((x) => x.id === id)
    if (c) {
      if (!site && c.address) setSite(c.address)
      setType(c.client_type === 'commercial' ? 'commercial' : 'domestic')
    }
  }

  function setNewClient(k: keyof typeof nc, v: string) {
    setNc((x) => ({ ...x, [k]: v }))
    if (k === 'client_type') setType(v === 'commercial' ? 'commercial' : 'domestic')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    let cid: string | null = clientId && !adding ? clientId : null
    if (adding) {
      // the new client is saved first, so it reaches the server before the job that points at it
      cid = newId()
      await save('clients', cid, {
        name: nc.name.trim(),
        client_type: nc.client_type,
        email: nc.email.trim() || null,
        phone: nc.phone.trim() || null,
        address: nc.address.trim() || null,
      })
    }
    const id = newId()
    // job_number is left empty: the server assigns the next GW-year-number when the job first syncs (so two devices never clash)
    await save('jobs', id, {
      title: title.trim(),
      client_id: cid,
      site_address: site.trim() || (adding ? nc.address.trim() : '') || null,
      main_contractor: mainContractor.trim() || null,
      job_type: type,
      source: source.trim() || null,
      notes: notes.trim() || null,
      status: 'estimating',
    })
    // a job under a main contractor needs RAMS: leave a to-do so it is not forgotten
    if (mainContractor.trim() && can('todos')) {
      await save('todos', newId(), { title: `Create RAMS (main contractor: ${mainContractor.trim()})`, job_id: id, assigned_to: null, due_date: addDaysIso(todayIso(), 2), recurrence: 'none', show_in_diary: true, created_by: profile!.id })
    }
    await logActivity('job', id, 'created', { title: title.trim() }, { id: profile!.id, name: profile!.full_name || profile!.email })
    nav(`/jobs/${id}`, { replace: true })
  }

  return (
    <>
      <p><Link to="/jobs">← Jobs</Link></p>
      <h1>New job</h1>
      <form className="card" onSubmit={submit}>
        <label htmlFor="t">Job title</label>
        <input id="t" type="text" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Full rewire, 14 Elm Road" />

        <label htmlFor="c">Client</label>
        <select id="c" value={clientId} onChange={(e) => pickClient(e.target.value)}>
          <option value="">No client yet</option>
          {clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          {canAddClient && <option value={NEW}>+ Add new client…</option>}
        </select>

        {adding && (
          <div className="subform">
            <h2>New client</h2>
            <label htmlFor="ncn">Client name</label>
            <input id="ncn" type="text" required autoFocus value={nc.name} onChange={(e) => setNewClient('name', e.target.value)} />
            <label htmlFor="nct">Type</label>
            <select id="nct" value={nc.client_type} onChange={(e) => setNewClient('client_type', e.target.value)}>
              <option value="domestic">Domestic</option>
              <option value="commercial">Commercial</option>
            </select>
            <label htmlFor="nce">Email</label>
            <input id="nce" type="email" inputMode="email" autoComplete="off" value={nc.email} onChange={(e) => setNewClient('email', e.target.value)} />
            <label htmlFor="ncp">Phone</label>
            <input id="ncp" type="text" inputMode="tel" value={nc.phone} onChange={(e) => setNewClient('phone', e.target.value)} />
            <label htmlFor="nca">Client address</label>
            <input id="nca" type="text" value={nc.address} onChange={(e) => setNewClient('address', e.target.value)} />
            <p className="muted small">Saved with the job. You can add contacts and more detail later under More, then Clients.</p>
          </div>
        )}

        <label htmlFor="s">Site address</label>
        <input id="s" type="text" value={site} onChange={(e) => setSite(e.target.value)} placeholder={adding && nc.address ? `Same as client: ${nc.address}` : undefined} />
        <label htmlFor="mc">Main contractor</label>
        <input id="mc" type="text" value={mainContractor} onChange={(e) => setMainContractor(e.target.value)} placeholder="Only if you are working for one. A reminder to create RAMS is added." />
        <label htmlFor="jt">Job type</label>
        <select id="jt" value={type} onChange={(e) => setType(e.target.value)}>
          {JOB_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <label htmlFor="so">Source</label>
        <input id="so" type="text" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Referral, website, repeat client…" />
        <label htmlFor="n">Notes</label>
        <textarea id="n" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <button className="btn primary" disabled={busy || !title.trim() || (adding && !nc.name.trim())}>Create job</button>
      </form>
    </>
  )
}
