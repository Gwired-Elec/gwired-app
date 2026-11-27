// "Apple Calendar" card: shows this person's private calendar link and a button that subscribes the phone's calendar to it.
import { useState } from 'react'
import { supabase, supabaseUrl } from '../../lib/supabase'

export default function CalendarLink({ onDownload }: { onDownload: () => void }) {
  const [token, setToken] = useState('')
  const [mine, setMine] = useState(true)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)

  async function load(replace = false) {
    setBusy(true); setErr('')
    const { data, error } = await supabase.rpc('my_calendar_token', { replace_it: replace })
    if (error || typeof data !== 'string') setErr('Could not get your calendar link. Check you are online, and that script 022 has been run.')
    else setToken(data)
    setBusy(false)
  }
  const https = token && supabaseUrl ? `${supabaseUrl}/functions/v1/diary-feed?t=${token}${mine ? '&mine=1' : ''}` : ''
  const webcal = https.replace(/^https:/, 'webcal:')

  return (
    <div className="card">
      <button className="linklike" onClick={() => { setOpen(!open); if (!open && !token) void load() }} aria-expanded={open}><strong>Calendar options</strong> <span className="muted small">{open ? '▴' : '▾'}</span></button>
      {open && (
        <>
          <h3 style={{ margin: '12px 0 4px' }}>Show in Apple Calendar</h3>
          <p className="muted small">Subscribe your phone's calendar to the diary. It updates by itself (Apple decides how often, usually within the hour). It is read-only: add and change entries here in G|Wired. The link is private to you, so do not share it.</p>
          <label className="check"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Only entries and to-dos for me (or for anyone)</label>
          {err && <p className="err" role="alert">{err}</p>}
          {busy && <p className="muted small">Getting your link…</p>}
          {https && (
            <>
              <a className="btn primary" href={webcal} style={{ display: 'grid', placeItems: 'center', textDecoration: 'none' }}>Subscribe in Calendar</a>
              <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(https); setCopied(true); setTimeout(() => setCopied(false), 3000) } catch { setErr('Could not copy. Press and hold the link below to copy it.') } }}>{copied ? 'Copied' : 'Copy the link (for Outlook or Google)'}</button>
              <p className="small" style={{ wordBreak: 'break-all' }}>{https}</p>
              <button className="btn" onClick={() => confirm('Make a new link? The old one stops working, and you will need to subscribe again.') && load(true)}>Make a new link (stops the old one)</button>
            </>
          )}
          <h3 style={{ margin: '16px 0 4px' }}>Download a calendar file</h3>
          <p className="muted small">A one-off copy of the diary as it is now, to open in Outlook, Google or Apple Calendar. It does not update afterwards.</p>
          <button className="btn" onClick={onDownload}>Download calendar file</button>
        </>
      )}
    </div>
  )
}
