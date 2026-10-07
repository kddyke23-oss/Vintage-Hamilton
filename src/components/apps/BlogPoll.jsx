import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Poll helpers shared by the Blog ─────────────────────────────────────────
// Rules (Keith, 2026-10-07): any resident can vote; ONLY the original poster
// can create the poll or add options later. Enforced by RLS in
// supabase/migrations/blog_polls_and_comment_toggle.sql — the UI below just
// hides what the database would refuse anyway.

export const MAX_POLL_OPTIONS = 20
const MAX_LABEL = 120

// Validate the create-poll form. Returns { error } or { question, options, allowMultiple }.
export function validatePollDraft(draft) {
  const question = draft.question.trim()
  if (!question) return { error: 'Please enter a poll question.' }
  const seen = new Set()
  const options = []
  for (const raw of draft.options) {
    const label = raw.trim()
    if (!label) continue
    const key = label.toLowerCase()
    if (seen.has(key)) return { error: `"${label}" is listed twice in the poll.` }
    seen.add(key)
    options.push(label)
  }
  if (options.length < 2) return { error: 'A poll needs at least two options.' }
  return { question, options, allowMultiple: !!draft.allowMultiple }
}

// Insert poll + options for a post. Returns true on success.
export async function createPoll(postId, userId, { question, options, allowMultiple }) {
  const { data: poll, error } = await supabase
    .from('blog_polls')
    .insert({ post_id: postId, question, allow_multiple: allowMultiple, created_by: userId })
    .select('id')
    .single()
  if (error || !poll) return false
  const { error: optError } = await supabase
    .from('blog_poll_options')
    .insert(options.map(label => ({ poll_id: poll.id, label })))
  return !optError
}

// ─── PollEditor — the "add a poll" form inside the New/Edit Post modal ───────

export function PollEditor({ draft, onChange }) {
  const set = (patch) => onChange({ ...draft, ...patch })
  const setOption = (i, value) => set({ options: draft.options.map((o, idx) => (idx === i ? value : o)) })
  const removeOption = (i) => set({ options: draft.options.filter((_, idx) => idx !== i) })

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={e => set({ enabled: e.target.checked })}
          className="rounded border-gray-300"
        />
        📊 Add a poll to this post
      </label>

      {draft.enabled && (
        <div className="space-y-2">
          <input
            type="text"
            value={draft.question}
            onChange={e => set({ question: e.target.value })}
            maxLength={200}
            placeholder="Poll question…"
            aria-label="Poll question"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          {draft.options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={opt}
                onChange={e => setOption(i, e.target.value)}
                maxLength={MAX_LABEL}
                placeholder={`Option ${i + 1}`}
                aria-label={`Poll option ${i + 1}`}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              {draft.options.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeOption(i)}
                  aria-label={`Remove option ${i + 1}`}
                  className="text-gray-400 hover:text-red-500 px-1"
                >✕</button>
              )}
            </div>
          ))}
          {draft.options.length < MAX_POLL_OPTIONS && (
            <button
              type="button"
              onClick={() => set({ options: [...draft.options, ''] })}
              className="text-sm text-blue-600 hover:text-blue-800"
            >+ Add another option</button>
          )}
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.allowMultiple}
              onChange={e => set({ allowMultiple: e.target.checked })}
              className="rounded border-gray-300"
            />
            Let people pick more than one option
          </label>
          <p className="text-xs text-gray-400">
            You can add more options later from the post (for example, based on the comments). Options can't be removed once the poll is live.
          </p>
        </div>
      )}
    </div>
  )
}

export const emptyPollDraft = () => ({ enabled: false, question: '', options: ['', ''], allowMultiple: false })

// ─── BlogPoll — the live poll shown in the post detail view ──────────────────

export default function BlogPoll({ postId, userId, isOwner, toast, onLoaded }) {
  const [poll, setPoll] = useState(null)       // { id, question, allow_multiple }
  const [options, setOptions] = useState([])   // [{ id, label }]
  const [votes, setVotes] = useState([])       // [{ option_id, voter_id }]
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [newOption, setNewOption] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  const load = useCallback(async () => {
    const { data: p } = await supabase
      .from('blog_polls')
      .select('id, question, allow_multiple')
      .eq('post_id', postId)
      .maybeSingle()
    if (!p) { setPoll(null); setLoading(false); onLoaded?.(false); return }
    const [{ data: opts }, { data: vs }] = await Promise.all([
      supabase.from('blog_poll_options').select('id, label').eq('poll_id', p.id).order('id', { ascending: true }),
      supabase.from('blog_poll_votes').select('option_id, voter_id').eq('poll_id', p.id),
    ])
    setPoll(p)
    setOptions(opts || [])
    setVotes(vs || [])
    setLoading(false)
    onLoaded?.(true)
  }, [postId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  if (loading || !poll) return null

  const myOptionIds = new Set(votes.filter(v => v.voter_id === userId).map(v => v.option_id))
  const totalVoters = new Set(votes.map(v => v.voter_id)).size

  const handleVote = async (optionId) => {
    if (busy) return
    setBusy(true)
    let error = null
    if (myOptionIds.has(optionId)) {
      // tap your own choice again to take the vote back
      ;({ error } = await supabase.from('blog_poll_votes').delete()
        .eq('poll_id', poll.id).eq('option_id', optionId).eq('voter_id', userId))
    } else {
      if (!poll.allow_multiple && myOptionIds.size > 0) {
        ;({ error } = await supabase.from('blog_poll_votes').delete()
          .eq('poll_id', poll.id).eq('voter_id', userId))
      }
      if (!error) {
        ;({ error } = await supabase.from('blog_poll_votes')
          .insert({ poll_id: poll.id, option_id: optionId, voter_id: userId }))
      }
    }
    if (error) toast.error('Could not record your vote.')
    await load()
    setBusy(false)
  }

  const handleAddOption = async () => {
    const label = newOption.trim()
    if (!label) return
    if (options.some(o => o.label.trim().toLowerCase() === label.toLowerCase())) {
      toast.error('That option is already in the poll.')
      return
    }
    if (options.length >= MAX_POLL_OPTIONS) {
      toast.error(`A poll can have at most ${MAX_POLL_OPTIONS} options.`)
      return
    }
    setBusy(true)
    const { error } = await supabase.from('blog_poll_options').insert({ poll_id: poll.id, label })
    if (error) { toast.error('Could not add option.'); setBusy(false); return }
    setNewOption('')
    setShowAdd(false)
    await load()
    setBusy(false)
    toast.success('Option added.')
  }

  return (
    <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
      <h3 className="font-semibold text-gray-900 text-sm mb-0.5">📊 {poll.question}</h3>
      <p className="text-xs text-gray-400 mb-3">
        {poll.allow_multiple ? 'Pick as many as you like' : 'Pick one'} · {totalVoters} {totalVoters === 1 ? 'person has' : 'people have'} voted
      </p>

      <div className="space-y-2">
        {options.map(opt => {
          const count = votes.filter(v => v.option_id === opt.id).length
          const pct = totalVoters > 0 ? Math.round((count / totalVoters) * 100) : 0
          const mine = myOptionIds.has(opt.id)
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleVote(opt.id)}
              disabled={busy}
              aria-pressed={mine}
              className={`relative w-full text-left rounded-lg border px-3 py-2 text-sm overflow-hidden transition-colors disabled:opacity-70 ${
                mine ? 'border-blue-500 bg-white' : 'border-gray-200 bg-white hover:border-blue-300'
              }`}
            >
              <span
                className={`absolute inset-y-0 left-0 ${mine ? 'bg-blue-100' : 'bg-gray-100'}`}
                style={{ width: `${pct}%` }}
                aria-hidden="true"
              />
              <span className="relative flex items-center justify-between gap-3">
                <span className={`${mine ? 'font-semibold text-blue-800' : 'text-gray-800'}`}>
                  {mine && '✓ '}{opt.label}
                </span>
                <span className="text-xs text-gray-500 flex-shrink-0">{count} · {pct}%</span>
              </span>
            </button>
          )
        })}
      </div>

      {/* Only the original poster sees this */}
      {isOwner && (
        <div className="mt-3">
          {showAdd ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newOption}
                onChange={e => setNewOption(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddOption() }}
                maxLength={MAX_LABEL}
                placeholder="New option…"
                aria-label="New poll option"
                autoFocus
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <button
                type="button"
                onClick={handleAddOption}
                disabled={busy || !newOption.trim()}
                className="text-sm bg-blue-700 text-white px-3 py-1.5 rounded-lg hover:bg-blue-800 disabled:opacity-50"
              >Add</button>
              <button
                type="button"
                onClick={() => { setShowAdd(false); setNewOption('') }}
                className="text-sm text-gray-500 hover:text-gray-700 px-2"
              >Cancel</button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="text-sm text-blue-600 hover:text-blue-800"
            >+ Add an option</button>
          )}
        </div>
      )}
    </div>
  )
}
