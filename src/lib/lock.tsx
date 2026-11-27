// App lock (phones get left in vans). Two ways to unlock, both work offline:
//  - a 4-6 digit PIN, stored only as a salted PBKDF2 hash on this device
//  - Face ID / Touch ID (a platform WebAuthn credential created on this device; the unlock asks the device to verify
//    the person, so it is a device-level gate, not a server check)
// The lock sits in front of the app on launch and after inactivity or time in the background. It does NOT sign the user out,
// so the saved session (and offline use) carries on. Honest limit: a browser cannot protect data from someone who can
// already read this browser's storage; the lock stops casual access to an unlocked phone, which is what it is for.
// Too many wrong PINs slow down, then sign the user out of this device (back to password / passkey sign-in).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from './auth'
import { wipeLocalData } from './sync/db'

const CFG = 'gw-lock-v1'
const FAILS = 'gw-lock-fails-v1'
const MAX_FAILS = 10 // then sign out of this device
const FREE_TRIES = 5 // then a growing wait

interface LockConfig {
  pin?: { salt: string; hash: string; iter: number }
  credId?: string // base64url id of this device's Face ID credential
  autoMinutes: number // 0 = never
}
const DEFAULT: LockConfig = { autoMinutes: 5 }

// ---------- storage ----------
const read = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k)
    return v ? (JSON.parse(v) as T) : d
  } catch {
    return d
  }
}
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* private mode: ignore */
  }
}
export const loadConfig = (): LockConfig => ({ ...DEFAULT, ...read<Partial<LockConfig>>(CFG, {}) })
const saveConfig = (c: LockConfig) => write(CFG, c)
export const clearLockData = () => {
  try {
    localStorage.removeItem(CFG)
    localStorage.removeItem(FAILS)
  } catch {
    /* ignore */
  }
}
const lockEnabled = (c: LockConfig) => !!c.pin || !!c.credId

// When the person last touched the app, kept for this tab only (sessionStorage). A refresh keeps it, so refreshing inside the
// auto-lock time does not lock the app. Closing the tab or the Home Screen app, or restarting the phone, clears it, so a cold
// start always asks for the PIN or Face ID.
const ACTIVE = 'gw-last-active'
const readStamp = (): number | null => {
  try {
    const v = Number(sessionStorage.getItem(ACTIVE))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}
const writeStamp = (t: number) => {
  try {
    sessionStorage.setItem(ACTIVE, String(t))
  } catch {
    /* ignore */
  }
}
// locked at launch unless this is a refresh within the auto-lock time
const startsLocked = (c: LockConfig) => {
  if (!lockEnabled(c)) return false
  const stamp = readStamp()
  if (stamp === null) return true
  return c.autoMinutes > 0 && Date.now() - stamp > c.autoMinutes * 60_000
}

// ---------- helpers ----------
const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const a = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  a.forEach((x) => (s += String.fromCharCode(x)))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const unb64 = (s: string) => {
  const p = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  return Uint8Array.from(atob(p), (c) => c.charCodeAt(0))
}
async function hashPin(pin: string, salt: Uint8Array, iter: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: iter }, key, 256)
  return b64(bits)
}

export const validPin = (pin: string) => /^\d{4,6}$/.test(pin)

// ---------- PIN ----------
export async function setPin(pin: string) {
  if (!validPin(pin)) throw new Error('Use 4 to 6 digits.')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iter = 150_000
  saveConfig({ ...loadConfig(), pin: { salt: b64(salt), hash: await hashPin(pin, salt, iter), iter } })
}
export const removePin = () => {
  const c = loadConfig()
  delete c.pin
  saveConfig(c)
}
export const setAutoMinutes = (m: number) => saveConfig({ ...loadConfig(), autoMinutes: m })

export type PinResult = { result: 'ok' } | { result: 'bad'; left: number } | { result: 'wait'; seconds: number } | { result: 'wipe' }
export async function checkPin(pin: string): Promise<PinResult> {
  const f = read<{ n: number; until: number }>(FAILS, { n: 0, until: 0 })
  if (Date.now() < f.until) return { result: 'wait', seconds: Math.ceil((f.until - Date.now()) / 1000) }
  const c = loadConfig()
  if (!c.pin) return { result: 'bad', left: 0 }
  const ok = (await hashPin(pin, unb64(c.pin.salt), c.pin.iter)) === c.pin.hash
  if (ok) {
    localStorage.removeItem(FAILS)
    return { result: 'ok' }
  }
  const n = f.n + 1
  if (n >= MAX_FAILS) return { result: 'wipe' }
  // after 5 free tries: 30s, 60s, 120s, ... between tries
  const until = n >= FREE_TRIES ? Date.now() + 30_000 * 2 ** (n - FREE_TRIES) : 0
  write(FAILS, { n, until })
  return until ? { result: 'wait', seconds: Math.ceil((until - Date.now()) / 1000) } : { result: 'bad', left: FREE_TRIES - n }
}

// ---------- Face ID / Touch ID (device-level) ----------
export async function biometricAvailable() {
  try {
    return !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
  } catch {
    return false
  }
}
export async function enrolBiometric(email: string) {
  const cred = (await navigator.credentials.create({
    publicKey: {
      rp: { name: 'G|Wired', id: location.hostname },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: email, displayName: email },
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null
  if (!cred) throw new Error('Face ID setup was cancelled.')
  saveConfig({ ...loadConfig(), credId: b64(cred.rawId) })
}
export const removeBiometric = () => {
  const c = loadConfig()
  delete c.credId
  saveConfig(c)
}
async function biometricCheck(): Promise<boolean> {
  const c = loadConfig()
  if (!c.credId) return false
  try {
    const got = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: unb64(c.credId) as BufferSource }],
        userVerification: 'required',
        rpId: location.hostname,
        timeout: 60_000,
      },
    })
    return !!got
  } catch {
    return false
  }
}

// ---------- the lock itself ----------
interface LockState {
  locked: boolean
  enabled: boolean
  config: LockConfig
  lock: () => void
  unlockWithPin: (pin: string) => Promise<PinResult>
  unlockWithBiometric: () => Promise<boolean>
  refresh: () => void // re-read settings after the Security page changes them
}
const Ctx = createContext<LockState | null>(null)
export const useLock = () => {
  const v = useContext(Ctx)
  if (!v) throw new Error('useLock outside LockProvider')
  return v
}

export function LockProvider({ children }: { children: ReactNode }) {
  const { session, loading, signOut } = useAuth()
  const [config, setConfig] = useState<LockConfig>(loadConfig)
  const [locked, setLocked] = useState(() => startsLocked(loadConfig())) // locked on a cold start; a quick refresh stays unlocked
  const lastActive = useRef(readStamp() ?? Date.now())
  const lockedRef = useRef(locked) // activity is only recorded while unlocked, so a refresh on the lock screen stays locked
  lockedRef.current = locked
  const enabled = lockEnabled(config)

  const refresh = useCallback(() => setConfig(loadConfig()), [])
  const lock = useCallback(() => {
    if (lockEnabled(loadConfig())) setLocked(true)
  }, [])

  // signed out (or never signed in): no lock, and forget this device's PIN / Face ID
  useEffect(() => {
    if (loading || session) return
    clearLockData()
    setConfig(loadConfig())
    setLocked(false)
  }, [loading, session])

  // inactivity and time spent in the background
  useEffect(() => {
    if (!session || !enabled) return
    const touch = () => {
      const now = Date.now()
      if (!lockedRef.current) writeStamp(now)
      lastActive.current = now
    }
    const check = () => {
      const m = loadConfig().autoMinutes
      if (m > 0 && Date.now() - lastActive.current > m * 60_000) setLocked(true)
    }
    const onVis = () => (document.visibilityState === 'visible' ? check() : lockedRef.current ? void 0 : writeStamp(lastActive.current))
    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll']
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }))
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', onVis)
    const t = setInterval(check, 15_000)
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch))
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', onVis)
      clearInterval(t)
    }
  }, [session, enabled])

  const value = useMemo<LockState>(
    () => ({
      locked: locked && enabled && !!session,
      enabled,
      config,
      lock,
      refresh,
      unlockWithPin: async (pin) => {
        const r = await checkPin(pin)
        if (r.result === 'ok') {
          lastActive.current = Date.now()
          writeStamp(lastActive.current)
          setLocked(false)
        } else if (r.result === 'wipe') {
          // too many wrong PINs: this is a forced sign-out, so the local copy goes too
          clearLockData()
          await wipeLocalData()
          await signOut()
        }
        return r
      },
      unlockWithBiometric: async () => {
        const ok = await biometricCheck()
        if (ok) {
          lastActive.current = Date.now()
          writeStamp(lastActive.current)
          setLocked(false)
        }
        return ok
      },
    }),
    [locked, enabled, session, config, lock, refresh, signOut],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
