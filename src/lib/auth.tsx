import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, configError } from './supabase'
import type { PermissionKey, Permissions } from './permissions'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  preset: string
  permissions: Permissions
  active: boolean
}

interface AuthState {
  loading: boolean
  session: Session | null
  profile: Profile | null
  recovering: boolean // arrived from a password-reset email: must set a new password
  can: (p: PermissionKey) => boolean
  signOut: () => Promise<void>
  doneRecovering: () => void
}

const Ctx = createContext<AuthState | null>(null)
export const useAuth = () => {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(!configError)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [recovering, setRecovering] = useState(false)

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) return setProfile(null)
    const { data } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle()
    setProfile((data as Profile | null) ?? null)
  }, [])

  useEffect(() => {
    if (configError) return
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await loadProfile(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      // defer: never call supabase inside this callback directly (can deadlock)
      setTimeout(() => void loadProfile(s), 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [loadProfile])

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      profile,
      recovering,
      can: (p) => !!profile?.active && !!profile.permissions?.[p],
      signOut: async () => {
        await supabase.auth.signOut()
      },
      doneRecovering: () => setRecovering(false),
    }),
    [loading, session, profile, recovering],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
