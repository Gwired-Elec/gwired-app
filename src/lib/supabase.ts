import { createClient } from '@supabase/supabase-js'

// Strip invisible characters (a byte-order mark can sneak in when the values are copied into GitHub). Chrome ignores them,
// but Safari on iPhone rejects the request outright.
const tidy = (v: unknown) => (typeof v === 'string' ? v.replace(/[​-‍﻿]/g, '').trim() : undefined)
const url = tidy(import.meta.env.VITE_SUPABASE_URL)
const anonKey = tidy(import.meta.env.VITE_SUPABASE_ANON_KEY)
export const supabaseUrl = url?.replace(/\/+$/, '')

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
