// Small pieces shared by the to-do and diary screens.
import { useMemo } from 'react'
import { useJobs } from '../../lib/jobs'
import { useTeam } from '../../lib/planner/team'

export function useLabels() {
  const jobs = useJobs()
  const team = useTeam()
  return useMemo(() => {
    const jobName = (id: string | null) => { const j = jobs?.find((x) => x.id === id); return j ? `${j.job_number ?? ''} ${j.title}`.trim() : '' }
    const who = (id: string | null) => team.find((m) => m.id === id)?.name ?? ''
    return { jobs: (jobs ?? []).filter((j) => !['lost', 'complete', 'completed'].includes(j.status) || true), jobName, who, team }
  }, [jobs, team])
}

export function JobSelect({ id, value, onChange, labels }: { id: string; value: string; onChange: (v: string) => void; labels: ReturnType<typeof useLabels> }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">No job</option>
      {[...labels.jobs].sort((a, b) => String(b.job_number ?? '').localeCompare(String(a.job_number ?? ''))).map((j) => <option key={j.id} value={j.id}>{`${j.job_number ?? ''} ${j.title}`.trim()}</option>)}
    </select>
  )
}

export function PersonSelect({ id, value, onChange, labels }: { id: string; value: string; onChange: (v: string) => void; labels: ReturnType<typeof useLabels> }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Anyone</option>
      {labels.team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select>
  )
}
