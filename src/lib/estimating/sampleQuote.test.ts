// Makes docs/sow-template-sample.pdf from the real quote template, with made-up data, so the layout can be reviewed.
// Run it with:  MAKE_SAMPLE=1 npx vitest run src/lib/estimating/sampleQuote.test.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { buildQuotePdf } from './quotePdf'
import type { Estimate, Line, Section } from './estimates'

const SECTIONS: [string, [string, number, string, number, string][]][] = [
  ['Distribution and containment', [
    ['Supply and install 12-way TP&N distribution board complete with 100A isolator', 1, 'nr', 64500, 'Plant room. Existing board removed.'],
    ['Supply and install 50mm galvanised steel trunking, fixed to wall', 85, 'm', 1850, ''],
    ['Supply and install 100mm cable tray, fixed to soffit', 40, 'm', 1425, 'Route to be agreed on site.'],
  ]],
  ['Small power', [
    ['Supply and install twin 13A switched socket outlet, white, flush mounted', 36, 'nr', 8250, 'Includes back box and final connection.'],
    ['Supply and install twin socket with USB-C charging port', 8, 'nr', 10400, ''],
    ['Supply and install floor box with 2 power and 2 data outlets', 6, 'nr', 24800, 'Floor box supplied by others.'],
  ]],
  ['Lighting and emergency', [
    ['Supply and install 600x600 LED recessed panel, 36W, 4000K, to suspended ceiling', 42, 'nr', 7800, ''],
    ['Supply and install maintained emergency luminaire, 3-hour duration', 14, 'nr', 9600, ''],
    ['Supply and install PIR presence detector, ceiling mounted', 10, 'nr', 5400, 'Not dimmable.'],
  ]],
  ['Testing and certification', [
    ['Inspect, test and issue EIC and schedules of test results for all new work', 1, 'sum', 125000, 'Provisional until final quantities are confirmed.'],
    ['Emergency lighting commissioning and completion certificate', 1, 'sum', 45000, ''],
  ]],
]

it.runIf(process.env.MAKE_SAMPLE)('writes the sample quote', async () => {
  const est = { id: 'e', job_id: 'j', rev: 1, name: null, status: 'draft', method: 'units', labour_rate_id: null, ohp_mode: 'combined', ohp_pct: 0, ohp_materials_pct: 0, ohp_labour_pct: 0, contingency_pct: 0, discount_pct: 0, vat_rate: 20, reverse_charge: false, notes: null, issued_at: null } as unknown as Estimate
  const sections: Section[] = SECTIONS.map(([name], i) => ({ id: 's' + i, estimate_id: 'e', name, sort: i * 10 }) as unknown as Section)
  const lines: Line[] = SECTIONS.flatMap(([, items], si) => items.map(([description, qty, unit, sell, notes], i) => ({ id: `l${si}-${i}`, estimate_id: 'e', section_id: 's' + si, sort: i, kind: 'item', description, qty, unit, unit_cost: 0, unit_sell: sell, hours_per_unit: 0, labour_cost_hr_pence: 0, labour_charge_hr_pence: 0, notes: notes || null }) as unknown as Line))
  const clauses = [
    { kind: 'assumption' as const, title: 'Access', body: 'Free and clear access to all working areas during normal working hours (Monday to Friday, 08:00 to 17:00).', sort: 10 },
    { kind: 'assumption' as const, title: 'Existing installation', body: 'The existing installation is in a safe condition to connect to. Any defects found will be reported and priced separately as a variation.', sort: 30 },
    { kind: 'assumption' as const, title: 'Standards', body: 'All work is carried out to the current edition of BS 7671 and certified on completion.', sort: 80 },
    { kind: 'exclusion' as const, title: 'Out-of-hours', body: 'Out-of-hours, night, weekend and bank holiday working, unless stated in the schedule.', sort: 10 },
    { kind: 'exclusion' as const, title: 'Builders work', body: "Builder's work, chasing into structural elements, core drilling, fire stopping (other than to our own penetrations), decoration and making good beyond our own work.", sort: 20 },
    { kind: 'exclusion' as const, title: 'Incoming supply', body: 'Works to the incoming supply, DNO or meter operator charges, and supply upgrades.', sort: 30 },
  ]
  const bytes = await buildQuotePdf({
    company: { name: 'G|Wired Electrical Services', address: 'Your company address\nis set under More > Company details', phone: '01234 567890', email: 'george@gwired.co.uk', vat_number: '000 0000 00', terms: 'Payment: 30 days from the date of invoice.', valid_days: 30 },
    job: { job_number: 'GW-1042', title: 'Office fit-out: electrical installation', site_address: 'Unit 4, Riverside Business Park, Anytown' },
    client: { name: 'Example Construction Ltd', address: '2 Client Street, Anytown' },
    estimate: est, sections, lines, clauses, detail: 'lines', date: new Date('2026-11-27'),
    logoPng: new Uint8Array(readFileSync('public/brand/gwired-logo-full.png')),
  })
  writeFileSync('docs/sow-template-sample.pdf', bytes)
})
