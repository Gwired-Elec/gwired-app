// Shared by the variation, application and invoice screens: the company / client / logo details every PDF needs, and handing the
// finished file to the phone's share sheet (or downloading it on a computer).
import { cachedCompany, loadCompany } from '../company'
import type { Job } from '../jobs'
import type { DocBase } from './pdf'

export async function docBase(job: Job, client: { name: string; address?: string | null } | null): Promise<DocBase> {
  const c = navigator.onLine ? await loadCompany() : cachedCompany()
  let logo: Uint8Array | null = null
  try {
    const res = await fetch('/brand/gwired-logo-full.png')
    if (res.ok) logo = new Uint8Array(await res.arrayBuffer())
  } catch { /* no logo */ }
  return {
    company: { name: c.name, address: c.address, vat_number: c.vat_number, company_number: c.company_number, email: c.email, phone: c.phone, terms: c.terms, bank: c.bank },
    job: { job_number: job.job_number, title: job.title, site_address: job.site_address },
    client, date: new Date(), logoPng: logo,
  }
}

export async function deliverPdf(bytes: Uint8Array, name: string) {
  const file = new File([bytes as BlobPart], name, { type: 'application/pdf' })
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return } catch (e) { if ((e as Error).name === 'AbortError') return }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
