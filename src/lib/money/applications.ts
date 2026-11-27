// The maths of an application for payment and of a simple invoice. Whole pence throughout; each percentage is rounded half up
// once, at the end of its own calculation (see ./index.ts).
//
// An application is CUMULATIVE: it states the value of everything done to date, then takes off what was certified last time.
//   gross to date      = sum of the value earned on each line, to date
//   retention held     = retention % of gross to date, less anything released so far
//   net to date        = gross to date - retention held
//   this application   = net to date - net to date at the last application          (before VAT)
//   VAT                = VAT rate on this application, or nothing under the domestic reverse charge
//   CIS deduction      = CIS rate on the labour part of this application (VAT is never part of it)
//   amount due         = this application + VAT - CIS deduction
import { percentOf, roundHalfUp, type Pence } from './index'

export interface AppTerms {
  retention_pct: number
  retention_release_pence: Pence // released THIS application (on top of anything released before)
  cis_on: boolean
  cis_rate: number
  cis_labour_pct: number // how much of this application is labour (CIS only applies to labour)
  reverse_charge: boolean
  vat_rate: number
}
export interface Cumulative { netToDate: Pence; releasedToDate: Pence }
export const START: Cumulative = { netToDate: 0, releasedToDate: 0 }

export interface Valuation extends Cumulative {
  grossToDate: Pence
  retentionHeld: Pence // still held after any release
  thisNet: Pence // this application, before VAT
  vat: Pence
  cis: Pence
  due: Pence
}

export function valuation(grossToDate: Pence, t: AppTerms, prev: Cumulative = START): Valuation {
  const retained = percentOf(grossToDate, t.retention_pct)
  const releasedToDate = Math.min(retained, Math.max(0, prev.releasedToDate + t.retention_release_pence))
  const retentionHeld = retained - releasedToDate
  const netToDate = grossToDate - retentionHeld
  const thisNet = netToDate - prev.netToDate
  const vat = t.reverse_charge ? 0 : percentOf(thisNet, t.vat_rate)
  const cis = t.cis_on ? percentOf(percentOf(thisNet, t.cis_labour_pct), t.cis_rate) : 0
  return { grossToDate, retentionHeld, netToDate, releasedToDate, thisNet, vat, cis, due: thisNet + vat - cis }
}

// all of a job's applications in order, each starting from where the one before left off
export function chain(apps: { grossToDate: Pence; terms: AppTerms }[]): Valuation[] {
  const out: Valuation[] = []
  let prev = START
  for (const a of apps) {
    const v = valuation(a.grossToDate, a.terms, prev)
    out.push(v)
    prev = v
  }
  return out
}

// a line's value from a percentage, and back
export const valueFromPct = (contract: Pence, pct: number): Pence => percentOf(contract, pct)
export const pctFromValue = (contract: Pence, value: Pence): number => (contract ? Math.round((value / contract) * 10000) / 100 : 0)

// a variation line: quantity x rate (rate may have fractions of a penny)
export const variationLine = (qty: number, ratePence: number): Pence => roundHalfUp(qty * ratePence)

export interface InvoiceTotals { net: Pence; vat: Pence; total: Pence }
export function invoiceTotals(net: Pence, vatRate: number, reverseCharge: boolean): InvoiceTotals {
  const vat = reverseCharge ? 0 : percentOf(net, vatRate)
  return { net, vat, total: net + vat }
}
