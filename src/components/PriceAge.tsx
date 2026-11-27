import { priceAge } from '../lib/estimating/pricing'

// "checked 4 months ago", coloured: green while fresh, amber when ageing, red with a warning mark once over the limit.
export default function PriceAge({ date, staleDays }: { date: string | null | undefined; staleDays: number }) {
  const a = priceAge(date, staleDays)
  return (
    <span className={`age ${a.tier}`} title={date ? `Price last checked ${date.split('-').reverse().join('/')}` : 'No date on this price'}>
      {a.tier === 'stale' || a.tier === 'unknown' ? '⚠ ' : ''}
      {a.tier === 'unknown' ? 'no date' : `checked ${a.label}`}
    </span>
  )
}
