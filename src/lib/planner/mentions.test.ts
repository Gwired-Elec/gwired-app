import { describe, expect, it } from 'vitest'
import { applyMention, mentionQuery, mentionedIds, splitMentions, suggestPeople } from './mentions'

const team = [{ id: '1', name: 'George Smith' }, { id: '2', name: 'Richard Millman' }, { id: '3', name: 'Rich' }]

describe('mentions', () => {
  it('spots an @ being typed at the end', () => {
    expect(mentionQuery('Call @ge')).toBe('ge')
    expect(mentionQuery('Call @')).toBe('')
    expect(mentionQuery('Call George')).toBeNull()
    expect(mentionQuery('a@b.com')).toBeNull()
  })
  it('suggests people by part of their name', () => {
    expect(suggestPeople('mill', team).map((p) => p.id)).toEqual(['2'])
    expect(suggestPeople('', team)).toHaveLength(3)
  })
  it('completes the tag', () => {
    expect(applyMention('Order cable @geo', 'George Smith')).toBe('Order cable @George Smith ')
  })
  it('finds who is tagged, longest name first', () => {
    expect(mentionedIds('Ask @Richard Millman about it', team)).toEqual(['2'])
    expect(mentionedIds('Ask @Rich about it', team)).toEqual(['3'])
    expect(mentionedIds('@George Smith and @Rich', team).sort()).toEqual(['1', '3'])
    expect(mentionedIds('email george@x.com', team)).toEqual([])
  })
  it('splits a title so tags can be bold', () => {
    expect(splitMentions('Ask @George Smith now', team)).toEqual([{ text: 'Ask ', tag: false }, { text: '@George Smith', tag: true }, { text: ' now', tag: false }])
  })
})
