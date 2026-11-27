// A box for an amount in pounds that keeps whole pence underneath. It saves when you leave the box (not on every key press),
// and whatever is in it is selected when you tap in, so typing replaces it.
import { useEffect, useState } from 'react'
import { parsePounds, toInputPounds } from '../lib/money'

export function MoneyInput({ pence, onCommit, disabled, id, label }: { pence: number; onCommit: (p: number) => void; disabled?: boolean; id?: string; label?: string }) {
  const [t, setT] = useState(toInputPounds(pence))
  useEffect(() => setT(toInputPounds(pence)), [pence])
  return (
    <input id={id} aria-label={label} type="text" inputMode="decimal" disabled={disabled} value={t} onChange={(e) => setT(e.target.value)}
      onBlur={() => { const p = parsePounds(t); if (p === null) setT(toInputPounds(pence)); else if (p !== pence) onCommit(p); else setT(toInputPounds(pence)) }} />
  )
}

// a plain number (percentage, quantity) that saves when you leave the box
export function NumInput({ value, onCommit, disabled, id, label, max }: { value: number; onCommit: (n: number) => void; disabled?: boolean; id?: string; label?: string; max?: number }) {
  const [t, setT] = useState(String(value))
  useEffect(() => setT(String(value)), [value])
  return (
    <input id={id} aria-label={label} type="text" inputMode="decimal" disabled={disabled} value={t} onChange={(e) => setT(e.target.value)}
      onBlur={() => { const n = Number(t.replace(/,/g, '')); if (t.trim() === '' || !Number.isFinite(n) || n < 0 || (max != null && n > max)) setT(String(value)); else if (n !== value) onCommit(n); else setT(String(value)) }} />
  )
}
