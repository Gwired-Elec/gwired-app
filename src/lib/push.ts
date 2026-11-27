// Push notifications from the installed app: ask permission, subscribe this device, and remember it in push_subscriptions.
// The server side is the "push" function (supabase/functions/push).
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

export type PushState = 'unsupported' | 'needs-install' | 'blocked' | 'off' | 'on'

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isInstalled = () => (navigator as unknown as { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches

function keyBytes(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function call(body: Record<string, unknown>): Promise<{ ok: boolean; data?: Record<string, unknown>; detail?: string }> {
  const { data, error } = await supabase.functions.invoke('push', { body })
  if (error) {
    try { const j = await (error as { context?: Response }).context?.json(); if (j?.detail) return { ok: false, detail: j.detail } } catch { /* fall through */ }
    return { ok: false, detail: "Couldn't reach the notification service. Check you're online and that the push function has been deployed." }
  }
  return { ok: true, data: data as Record<string, unknown> }
}

async function currentState(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return isIos() && !isInstalled() ? 'needs-install' : 'unsupported'
  if (isIos() && !isInstalled()) return 'needs-install'
  if (Notification.permission === 'denied') return 'blocked'
  try {
    const reg = await navigator.serviceWorker.ready
    return (await reg.pushManager.getSubscription()) && Notification.permission === 'granted' ? 'on' : 'off'
  } catch { return 'off' }
}

export function usePush() {
  const [state, setState] = useState<PushState | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const refresh = useCallback(async () => setState(await currentState()), [])
  useEffect(() => { void refresh() }, [refresh])

  async function enable() {
    setBusy(true); setMsg('')
    try {
      const k = await call({ action: 'key' })
      const key = k.data?.key as string | undefined
      if (!k.ok || !key) throw new Error(k.detail || 'The notification keys have not been set up on the server yet.')
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') throw new Error('Notifications were not allowed. You can allow them in the phone\'s Settings, under Notifications, G|Wired.')
      const reg = await navigator.serviceWorker.ready
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) as BufferSource }))
      const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
      const { data: s } = await supabase.auth.getSession()
      const uid = s.session?.user.id
      if (!uid) throw new Error('Sign in first.')
      const { error } = await supabase.from('push_subscriptions').upsert({ user_id: uid, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200) }, { onConflict: 'endpoint' })
      if (error) throw new Error(/does not exist|schema cache/i.test(error.message) ? 'Notifications need database script 028 to be run first.' : error.message)
      setMsg('Notifications are on for this device.')
    } catch (e) { setMsg((e as Error).message || 'Could not turn notifications on.') }
    setBusy(false); await refresh()
  }
  async function disable() {
    setBusy(true); setMsg('')
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) { await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe() }
      setMsg('Notifications are off for this device.')
    } catch (e) { setMsg((e as Error).message || 'Could not turn notifications off.') }
    setBusy(false); await refresh()
  }
  async function test() {
    setBusy(true); setMsg('')
    const r = await call({ action: 'test' })
    setMsg(!r.ok ? (r.detail ?? 'Could not send a test.') : r.data?.sent ? 'Test sent. It should arrive in a few seconds.' : 'Nothing was sent: this device is not registered. Turn notifications off and on again.')
    setBusy(false)
  }
  return { state, msg, busy, enable, disable, test }
}

// tell tagged people about a to-do (fire and forget: they also get an in-app notice, so a failure here is harmless)
export function notifyTagged(title: string, jobId: string | null, ids: string[]) {
  if (!ids.length || !navigator.onLine) return
  void call({ action: 'todo', title, job_id: jobId, ids }).catch(() => undefined)
}
