import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useNotices } from '../lib/notices'
import { useJobs } from '../lib/jobs'

// "What's new" cards: quotes accepted and payments received. On Home they list every job; on a job page only that job.
export default function Notices({ jobId }: { jobId?: string }) {
  const { profile, can } = useAuth()
  const { notices, dismiss } = useNotices(profile?.id, jobId)
  const jobs = useJobs()
  if (!can('jobs.view') || !notices.length) return null
  const name = (id: string) => { const j = jobs?.find((x) => x.id === id); return j ? `${j.job_number ?? ''} ${j.title}`.trim() : 'a job' }
  return (
    <>
      {notices.map((n) => (
        <div key={n.id} className="card notice good" role="status" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span aria-hidden style={{ fontSize: '1.4rem' }}>{n.kind === 'paid' ? '💷' : '✅'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong>{n.text}</strong>
            {!jobId && <div className="small">{<Link to={`/jobs/${n.job_id}`}>{name(n.job_id)}</Link>}</div>}
          </div>
          <button className="btn" style={{ width: 'auto', minHeight: 40, padding: '0 12px' }} onClick={() => dismiss(n.id)} aria-label="Dismiss">✕</button>
        </div>
      ))}
    </>
  )
}
