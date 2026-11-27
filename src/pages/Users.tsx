import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { PERMISSIONS, PRESETS, type Permissions } from '../lib/permissions'
import { createUser, listUsers, resetPassword, setDisabled, updateUser, type UserRow } from '../lib/users'

const presetLabel = (p: string) => PRESETS[p]?.label ?? 'Custom'
const fmt = (d: string | null) => (d ? new Date(d).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : 'never')

export default function Users() {
  const { can, profile } = useAuth()
  const [rows, setRows] = useState<UserRow[] | null>(null)
  const [err, setErr] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [shown, setShown] = useState<{ email: string; password: string } | null>(null)

  const load = useCallback(async () => {
    const r = await listUsers()
    if (r.ok) {
      setRows(r.users ?? [])
      setErr('')
    } else setErr(r.detail ?? 'Something went wrong.')
  }, [])
  useEffect(() => void load(), [load])

  if (!can('users')) return <><h1>Users</h1><div className="card"><p className="muted">You don't have permission to manage users.</p></div></>

  return (
    <>
      <p><Link to="/more">← More</Link></p>
      <h1>Users</h1>
      {err && <p className="err" role="alert">{err}</p>}

      {shown && (
        <div className="card notice">
          <strong>Temporary password for {shown.email}</strong>
          <p className="pw">{shown.password}</p>
          <p className="muted">Shown once. Give it to them privately; they'll be asked to choose their own password when they first sign in.</p>
          <button className="btn" onClick={() => setShown(null)}>Done</button>
        </div>
      )}

      {adding ? (
        <AddUser onCancel={() => setAdding(false)} onCreated={(email, password) => { setAdding(false); setShown({ email, password }); void load() }} />
      ) : (
        <button className="btn primary" style={{ width: 'auto' }} onClick={() => setAdding(true)}>+ Add user</button>
      )}

      {!rows && !err && <p className="muted">Loading…</p>}
      {rows?.map((u) => (
        <div className="card" key={u.id}>
          <div className="rowtop">
            <div>
              <strong>{u.full_name || u.email}</strong> {u.id === profile?.id && <span className="muted">(you)</span>}
              <div className="muted">{u.email}</div>
              <div className="muted">{presetLabel(u.preset)} · last signed in {fmt(u.last_sign_in_at)}</div>
            </div>
            {(u.disabled || !u.active) && <span className="pill warn">Switched off</span>}
          </div>
          {editing === u.id ? (
            <EditPermissions user={u} onDone={() => { setEditing(null); void load() }} />
          ) : (
            <div className="actions">
              <button className="btn" onClick={() => setEditing(u.id)}>Permissions</button>
              <button className="btn" onClick={async () => { const r = await resetPassword(u.id); r.ok ? setShown({ email: u.email, password: r.password! }) : setErr(r.detail ?? 'Failed') }}>Reset password</button>
              {u.id !== profile?.id && (
                <button className="btn" onClick={async () => { const r = await setDisabled(u.id, !(u.disabled || !u.active)); r.ok ? void load() : setErr(r.detail ?? 'Failed') }}>
                  {u.disabled || !u.active ? 'Switch on' : 'Switch off'}
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </>
  )
}

function PermissionBoxes({ value, onChange }: { value: Permissions; onChange: (p: Permissions) => void }) {
  return (
    <div className="permgrid">
      {PERMISSIONS.map((p) => (
        <label className="check" key={p.key}>
          <input type="checkbox" checked={!!value[p.key]} onChange={(e) => onChange({ ...value, [p.key]: e.target.checked })} /> {p.label}
        </label>
      ))}
    </div>
  )
}

function PresetPicker({ preset, setPreset, setPerms }: { preset: string; setPreset: (p: string) => void; setPerms: (p: Permissions) => void }) {
  return (
    <select value={preset} onChange={(e) => { setPreset(e.target.value); if (PRESETS[e.target.value]) setPerms({ ...PRESETS[e.target.value].permissions }) }}>
      {Object.entries(PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      <option value="custom">Custom</option>
    </select>
  )
}

function AddUser({ onCancel, onCreated }: { onCancel: () => void; onCreated: (email: string, password: string) => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [preset, setPreset] = useState('operative')
  const [perms, setPerms] = useState<Permissions>({ ...PRESETS.operative.permissions })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    const r = await createUser({ email, full_name: name, preset, permissions: perms })
    setBusy(false)
    if (!r.ok) return setErr(r.detail ?? 'Failed')
    onCreated(email.trim().toLowerCase(), r.password!)
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Add user</h2>
      <label htmlFor="un">Name</label>
      <input id="un" type="text" required value={name} onChange={(e) => setName(e.target.value)} />
      <label htmlFor="ue">Email</label>
      <input id="ue" type="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <label>Starting point</label>
      <PresetPicker preset={preset} setPreset={setPreset} setPerms={setPerms} />
      <label>What they can use</label>
      <PermissionBoxes value={perms} onChange={(p) => { setPerms(p); setPreset('custom') }} />
      {err && <p className="err" role="alert">{err}</p>}
      <div className="actions">
        <button className="btn primary" style={{ width: 'auto' }} disabled={busy}>{busy ? 'Adding…' : 'Add user'}</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function EditPermissions({ user, onDone }: { user: UserRow; onDone: () => void }) {
  const [preset, setPreset] = useState(user.preset)
  const [perms, setPerms] = useState<Permissions>(user.permissions ?? {})
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <div>
      <label>Starting point</label>
      <PresetPicker preset={preset} setPreset={setPreset} setPerms={setPerms} />
      <PermissionBoxes value={perms} onChange={(p) => { setPerms(p); setPreset('custom') }} />
      {err && <p className="err" role="alert">{err}</p>}
      <div className="actions">
        <button className="btn primary" style={{ width: 'auto' }} disabled={busy} onClick={async () => { setBusy(true); const r = await updateUser(user.id, { preset, permissions: perms }); setBusy(false); r.ok ? onDone() : setErr(r.detail ?? 'Failed') }}>Save</button>
        <button className="btn" onClick={onDone}>Cancel</button>
      </div>
    </div>
  )
}
