import { describe, expect, it } from 'vitest'
import { buildMentionNotices, buildNotices } from './notices'

const now = new Date('2026-11-27T12:00:00Z')
const row = (o: object) => ({ id: 'r', entity_id: 'j1', action: 'quote_accepted', detail: {}, user_id: null, created_at: '2026-11-26T10:00:00Z', ...o })

describe('notices', () => {
  it('quote accepted online and payment received show up, newest first', () => {
    const n = buildNotices([
      row({ id: 'a', detail: { by: 'client', name: 'Mr Smith', quote: 'GW-1' } }),
      row({ id: 'b', action: 'payment_received', detail: { label: 'Application 2', amount_pence: 1200000 }, created_at: '2026-11-27T09:00:00Z' }),
    ], 'me', now, [])
    expect(n.map((x) => x.id)).toEqual(['b', 'a'])
    expect(n[0].text).toBe('Application 2 paid in Xero (£12,000.00)')
    expect(n[1].text).toBe('Quote GW-1 accepted online by Mr Smith')
  })
  it('leaves out my own actions, dismissed ones, old ones and other kinds of activity', () => {
    const n = buildNotices([
      row({ id: 'mine', user_id: 'me' }), row({ id: 'gone' }), row({ id: 'old', created_at: '2026-10-01T10:00:00Z' }), row({ id: 'x', action: 'status' }), row({ id: 'keep' }),
    ], 'me', now, ['gone'])
    expect(n.map((x) => x.id)).toEqual(['keep'])
  })
})

describe('mention notices', () => {
  const team = [{ id: 'me', name: 'Richard Millman' }, { id: 'g', name: 'George Smith' }]
  const todo = (o: object) => ({ id: 't1', title: 'Order cable @Richard Millman', job_id: 'j1', created_by: 'g', created_at: '2026-11-26T10:00:00Z', ...o })
  it('tells a tagged person, who tagged them, and not the author', () => {
    const n = buildMentionNotices([todo({})], 'me', team, now, [])
    expect(n).toHaveLength(1)
    expect(n[0].text).toContain('George Smith tagged you')
    expect(buildMentionNotices([todo({ created_by: 'me' })], 'me', team, now, [])).toHaveLength(0)
  })
  it('ignores done, old, dismissed and untagged to-dos', () => {
    expect(buildMentionNotices([todo({ done_at: '2026-11-27T00:00:00Z' })], 'me', team, now, [])).toHaveLength(0)
    expect(buildMentionNotices([todo({ created_at: '2026-10-01T00:00:00Z' })], 'me', team, now, [])).toHaveLength(0)
    expect(buildMentionNotices([todo({})], 'me', team, now, ['mt1'])).toHaveLength(0)
    expect(buildMentionNotices([todo({ title: 'Order cable' })], 'me', team, now, [])).toHaveLength(0)
  })
})
