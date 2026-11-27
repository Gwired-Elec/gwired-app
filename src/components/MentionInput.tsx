import { applyMention, mentionQuery, suggestPeople } from '../lib/planner/mentions'
import { useTeam } from '../lib/planner/team'

// A text box where typing @ offers the team's names; tapping one completes the tag.
export default function MentionInput({ id, value, onChange, onEnter, placeholder }: { id: string; value: string; onChange: (v: string) => void; onEnter?: () => void; placeholder?: string }) {
  const team = useTeam()
  const q = mentionQuery(value)
  const options = q === null ? [] : suggestPeople(q, team)
  return (
    <>
      <input id={id} type="text" value={value} autoComplete="off" onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        onKeyDown={(e) => { if (e.key === 'Enter') { if (options.length) { e.preventDefault(); onChange(applyMention(value, options[0].name)) } else onEnter?.() } }} />
      {options.length > 0 && (
        <div className="chips" role="listbox" aria-label="Tag someone">
          {options.map((p) => <button key={p.id} type="button" role="option" aria-selected="false" className="chip" onClick={() => onChange(applyMention(value, p.name))}>@{p.name}</button>)}
        </div>
      )}
      {q === '' && !options.length && <p className="muted small">No team list on this device yet. Open the app online once to load it.</p>}
    </>
  )
}
