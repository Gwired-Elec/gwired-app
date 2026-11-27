// The people who can be given a task or an event. Kept apart from data.ts so the date and calendar maths can be tested without a Supabase connection.
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

export interface Member { id: string; name: string }
const KEY = 'gw-team'
export function useTeam(): Member[] {
  const [team, setTeam] = useState<Member[]>(() => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Member[] } catch { return [] } })
  useEffect(() => {
    if (!navigator.onLine) return
    void supabase.rpc('team_members').then(({ data }) => {
      if (!Array.isArray(data)) return
      const t = (data as { id: string; full_name: string | null; email: string }[]).map((m) => ({ id: m.id, name: m.full_name || m.email }))
      setTeam(t)
      try { localStorage.setItem(KEY, JSON.stringify(t)) } catch { /* ignore */ }
    })
  }, [])
  return team
}

