// Tagging people in a to-do with @ then their name. Pure code (no database), tested in mentions.test.ts.
export interface Person { id: string; name: string }

// the "@something" being typed at the very end of the text (spaces are allowed, so full names can be typed)
export function mentionQuery(text: string): string | null {
  const m = /(?:^|\s)@([^@\n]*)$/.exec(text)
  if (!m) return null
  return m[1].length > 40 ? null : m[1]
}

// people to suggest for what has been typed after the @
export function suggestPeople(query: string, team: Person[], max = 5): Person[] {
  const q = query.trim().toLowerCase()
  return team.filter((p) => !q || p.name.toLowerCase().includes(q)).slice(0, max)
}

// replace the unfinished "@xyz" at the end with "@Full Name "
export function applyMention(text: string, name: string): string {
  return text.replace(/(^|\s)@[^@\n]*$/, (_m, lead: string) => `${lead}@${name} `)
}

const isWordChar = (c: string | undefined) => c !== undefined && /[a-z0-9]/i.test(c)

// where each tagged person is in the text: a team member's full name straight after an @ (and not part of a longer word)
function findTags(text: string, team: Person[]): { start: number; end: number; id: string }[] {
  const lower = text.toLowerCase()
  const found: { start: number; end: number; id: string }[] = []
  for (const p of [...team].filter((x) => x.name).sort((a, b) => b.name.length - a.name.length)) {
    const tag = '@' + p.name.toLowerCase()
    let i = lower.indexOf(tag)
    while (i >= 0) {
      const end = i + tag.length
      const before = i === 0 ? ' ' : lower[i - 1]
      const overlaps = found.some((f) => i < f.end && end > f.start)
      if (!overlaps && /\s/.test(before) && !isWordChar(lower[end])) found.push({ start: i, end, id: p.id })
      i = lower.indexOf(tag, i + 1)
    }
  }
  return found.sort((a, b) => a.start - b.start)
}

// who is tagged (longest name wins when one name starts another, e.g. Rich and Richard Millman)
export function mentionedIds(text: string, team: Person[]): string[] {
  return [...new Set(findTags(text, team).map((f) => f.id))]
}

// split a title into plain and tagged parts so the tags can be shown in bold
export function splitMentions(text: string, team: Person[]): { text: string; tag: boolean }[] {
  const out: { text: string; tag: boolean }[] = []
  let last = 0
  for (const f of findTags(text, team)) {
    if (f.start > last) out.push({ text: text.slice(last, f.start), tag: false })
    out.push({ text: text.slice(f.start, f.end), tag: true })
    last = f.end
  }
  if (last < text.length) out.push({ text: text.slice(last), tag: false })
  return out.length ? out : [{ text, tag: false }]
}
