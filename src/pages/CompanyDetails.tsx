import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { cachedCompany, loadCompany, saveCompany, type Company } from '../lib/company'

export default function CompanyDetails() {
  const { can } = useAuth()
  const [c, setC] = useState<Company>(cachedCompany)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => { void loadCompany().then(setC) }, [])
  if (!can('settings')) return <><h1>Company details</h1><p className="muted">You don't have permission to change these.</p></>
  const set = (k: keyof Company, v: string) => setC((x) => ({ ...x, [k]: k === 'valid_days' ? Number(v.replace(/\D/g, '')) || 0 : v }))
  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(''); setMsg('')
    if (!navigator.onLine) return setErr('You need to be online to save these.')
    const m = await saveCompany(c)
    if (m) setErr(m); else setMsg('Saved.')
  }
  return (
    <>
      <p><Link to="/more">← More</Link></p>
      <h1>Company details</h1>
      <p className="muted">These appear on every quote PDF.</p>
      <form className="card" onSubmit={submit}>
        <label htmlFor="cn">Company name</label><input id="cn" type="text" value={c.name} onChange={(e) => set('name', e.target.value)} />
        <label htmlFor="ca">Address</label><textarea id="ca" rows={3} value={c.address} onChange={(e) => set('address', e.target.value)} />
        <label htmlFor="cp">Phone</label><input id="cp" type="text" value={c.phone} onChange={(e) => set('phone', e.target.value)} />
        <label htmlFor="ce">Email</label><input id="ce" type="text" value={c.email} onChange={(e) => set('email', e.target.value)} />
        <label htmlFor="cv">VAT number</label><input id="cv" type="text" value={c.vat_number} onChange={(e) => set('vat_number', e.target.value)} />
        <label htmlFor="cr">Company registration number</label><input id="cr" type="text" value={c.company_number} onChange={(e) => set('company_number', e.target.value)} />
        <label htmlFor="cd">Quotes are valid for (days)</label><input id="cd" type="text" inputMode="numeric" value={String(c.valid_days)} onChange={(e) => set('valid_days', e.target.value)} />
        <label htmlFor="ct">Standard terms (printed at the bottom of every quote)</label>
        <textarea id="ct" rows={6} value={c.terms} onChange={(e) => set('terms', e.target.value)} placeholder="Payment terms, exclusions, how variations are handled…" />
        {err && <p className="err" role="alert">{err}</p>}
        {msg && <p className="ok" role="status">{msg}</p>}
        <button className="btn primary">Save</button>
      </form>
    </>
  )
}
