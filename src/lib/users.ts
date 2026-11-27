import { supabase } from './supabase'
import type { Permissions } from './permissions'

export interface UserRow {
  id: string
  email: string
  full_name: string | null
  preset: string
  permissions: Permissions
  active: boolean
  last_sign_in_at: string | null
  disabled: boolean
}

interface Reply {
  ok: boolean
  detail?: string
  users?: UserRow[]
  password?: string
  warning?: string
}

// All user management goes through the manage-users Edge Function (it holds the server key and checks the caller's permission).
async function call(body: Record<string, unknown>): Promise<Reply> {
  const { data, error } = await supabase.functions.invoke('manage-users', { body })
  if (error) {
    // a non-2xx answer still carries our JSON message in error.context
    try {
      const j = await (error as { context?: Response }).context?.json()
      if (j?.detail) return { ok: false, detail: j.detail }
    } catch {
      /* fall through */
    }
    return {
      ok: false,
      detail: "Couldn't reach the user service. Check you're online, and that the manage-users function has been deployed.",
    }
  }
  return data as Reply
}

export const listUsers = () => call({ action: 'list' })
export const createUser = (v: { email: string; full_name: string; preset: string; permissions: Permissions }) => call({ action: 'create', ...v })
export const updateUser = (user_id: string, v: { full_name?: string; preset?: string; permissions?: Permissions }) => call({ action: 'update', user_id, ...v })
export const resetPassword = (user_id: string) => call({ action: 'reset_password', user_id })
export const setDisabled = (user_id: string, disabled: boolean) => call({ action: disabled ? 'disable' : 'enable', user_id })
export const signOutEverywhere = () => call({ action: 'sign_out_all' })
