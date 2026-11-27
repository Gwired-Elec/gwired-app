import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { JOB_TYPES, useClients } from '../lib/jobs'
import { logActivity, newId, save } from '../lib/sync/store'

export default function NewJob() {
  const { can, profile } = useAuth()
  const nav = useNavigate()
  const clients = useClients()
  const [title, setTitle] = useState('')
  const [clientId, setClientId] = useState('')
  const [site, setSite] = useState('')
  const [type, setType] = useState('domestic')
  const [source, setSource] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  if (!can('jobs.edit')) return <><h1>New job</h1><p className="muted">You don't have permission to create jobs.</p></>

  function pickClient(id: string) {
    setClientId(id)
    const c = clients?.find((x) => x.id === id)
    if (c) {
      if (!site && c.address) setSite(c.address)
      setType(c.client_type === 'commercial' ? 'commercial' : 'domestic')
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const id = newId()
    // job_number is left empty: the server assigns the next GW-year-number when the job first syncs (so two devices never clash)
    await save('jobs', id, {
      title: title.trim(),
      client_id: clientId || null,
      site_address: site.trim() || null,
      job_type: type,
      source: source.trim() || null,
      notes: notes.trim() || null,
      status: 'enquiry',
    })
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
        </select>
        {can('clients.edit') && <p className="small"><Link to="/clients/new">+ Add a new client</Link></p>}
        <label htmlFor="s">Site address</label>
        <input id="s" type="text" value={site} onChange={(e) => setSite(e.target.value)} />
        <label htmlFor="jt">Job type</label>
        <select id="jt" value={type} onChange={(e) => setType(e.target.value)}>
          {JOB_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <label htmlFor="so">Source</label>
        <input id="so" type="text" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Referral, website, repeat client…" />
        <label htmlFor="n">Notes</label>
        <textarea id="n" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <button className="btn primary" disabled={busy || !title.trim()}>Create job</button>
      </form>
    </>
  )
}
