import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Shown on screen instead of a blank page if .env.local hasn't been filled in.
export const configError =
  !url || !anonKey || url.includes('YOUR-PROJECT') || anonKey.startsWith('your-')
    ? 'The Supabase Project URL and publishable key are missing. Copy .env.example to .env.local, paste them in, then restart npm run dev.'
    : null

// "Keep me signed in on this device": on = the session lives in localStorage (survives closing the app);
// off = sessionStorage (gone when the tab or app closes). The choice itself is remembered in localStorage.
const KEEP = 'gw-keep-signed-in'
export const getKeepSignedIn = () => {
  try {
    return localStorage.getItem(KEEP) !== '0'
  } catch {
    return true
  }
}
export const setKeepSignedIn = (keep: boolean) => {
  try {
    localStorage.setItem(KEEP, keep ? '1' : '0')
  } catch {
    /* private mode: ignore */
  }
}
const store = () => {
  try {
    return getKeepSignedIn() ? localStorage : sessionStorage
  } catch {
    return undefined
  }
}
const authStorage = {
  getItem: (k: string) => store()?.getItem(k) ?? null,
  setItem: (k: string, v: string) => store()?.setItem(k, v),
  removeItem: (k: string) => {
    try {
      localStorage.removeItem(k)
      sessionStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  },
}

export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'missing', {
  auth: { storage: authStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
