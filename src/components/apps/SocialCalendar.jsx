import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { deleteStoragePhoto } from '@/lib/storage'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/components/ui/Toast'
import { useImageUpload } from '@/hooks/useImageUpload'

// ─── Helpers ────────────────────────────────────────────────────────────────

// Fire-and-forget: let the event's original author know a comment was added.
// Never blocks the comment UI — the comment row is already saved, so a
// notification hiccup shouldn't look like a failed submission to the commenter.
const notifyCommentOwner = async (commentType, commentId) => {
  try {
    await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-comment`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ commentType, commentId }),
      }
    )
  } catch (e) {
    console.error('notify-comment call failed:', e)
  }
}

// Fire-and-forget: let RCP know a new clubhouse reservation is waiting in
// their queue (pending_rcp). Only called when a reservation actually lands
// in that status — never blocks the resident's submission on an email hiccup.
const notifyClubhouseRcp = async (reservationId) => {
  try {
    await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-clubhouse-rcp`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ reservationId }),
      }
    )
  } catch (e) {
    console.error('notify-clubhouse-rcp call failed:', e)
  }
}

// Fire-and-forget: called after a resident cancels their OWN clubhouse
// reservation (handleRemove, below) when a fee had already been collected
// on it — tells RCP a refund needs processing. Not called for a booking
// that was never paid; those just quietly drop out of RCP's queue. Also
// reused by ClubhouseReservationsPage.jsx when RCP cancels one instead —
// same function, it figures out the right audience from who cancelled it.
const notifyClubhouseCancellation = async (reservationId) => {
  try {
    await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-clubhouse-cancellation`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ reservationId }),
      }
    )
  } catch (e) {
    console.error('notify-clubhouse-cancellation call failed:', e)
  }
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTime(timeStr) {
  if (!timeStr) return ''
  const [h, m] = timeStr.split(':')
  const hour = parseInt(h, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const display = ((hour % 12) || 12) + ':' + m + ' ' + ampm
  return display
}

function monthLabel(year, month) {
  return new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay()
}

function isToday(year, month, day) {
  const t = new Date()
  return t.getFullYear() === year && t.getMonth() === month && t.getDate() === day
}

function isFutureOrToday(dateStr) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(dateStr + 'T00:00:00') >= today
}

// ─── Add/Edit Event Modal ────────────────────────────────────────────────────

function EventModal({ categories, editEvent, onClose, onSaved, profile, isCalendarAdmin, toast, user }) {
  // TEST-PHASE GATE (2026-09-03, revised 2026-09-05): clubhouse/side-room
  // booking is only shown to RCP/committee accounts OR an explicitly-listed
  // resident tester, until the board's Oct 1 cutover — see
  // Reservations/REQUIREMENTS.md §2.13. A plain resident tester can't be
  // modeled as an app_access row: app_access.role is DB-constrained to just
  // 'admin'/'user' (app_access_role_check), which mean RCP/Social Committee
  // here — not "can book" — and granting either would also hand the tester
  // committee/RCP powers and escalation emails they shouldn't get. So this
  // is a short-lived hardcoded allowlist instead, checked ONLY here.
  // At cutover: delete TEST_PHASE_TESTER_IDS and this comment, and change
  // canRequestClubhouse to simply `true`.
  const TEST_PHASE_TESTER_IDS = [
    'a61a5768-a710-4fc3-9d41-087605b58dd3', // Keith — kddyke23@gmail.com (plain-resident test account)
  ]
  const { hasAppAccess } = useAuth()
  const canRequestClubhouse = hasAppAccess('clubhouse') || TEST_PHASE_TESTER_IDS.includes(user?.id)
  const today = new Date().toISOString().split('T')[0]

  // Filter categories based on profile tags — compute before form init
  const allowedCategories = categories.filter(cat => {
    if (!cat.required_tag) return true           // NULL = open to all
    if (isCalendarAdmin) return true             // admins see everything
    if (!profile?.tags?.length) return false     // no tags = no restricted categories
    return profile.tags.includes(cat.required_tag)
  })

  const [form, setForm] = useState({
    title: editEvent?.title || '',
    description: editEvent?.description || '',
    location: editEvent?.location || '',
    event_date: editEvent?.event_date || today,
    event_time: editEvent?.event_time?.slice(0, 5) || '',
    category_id: editEvent?.category_id || (allowedCategories[0]?.id ?? ''),
    external_url: editEvent?.external_url || '',
    event_end_time: '',
    wantsMainClubhouse: false,
    wantsSideRoom: false,
    wantsTablesChairs: false,
    privateAnswer: '', // 'yes' | 'no' | 'not_sure'
  })
  const [saving, setSaving] = useState(false)

  // Clubhouse reservation settings (fees, deposit, deadline, side-room
  // availability) — only relevant for NEW events (editing an existing
  // clubhouse reservation isn't supported from this modal; see
  // Reservations/REQUIREMENTS.md §2.1). Fetched once so the resident sees
  // real prices before submitting, not just after.
  const [clubhouseSettings, setClubhouseSettings] = useState(null)
  useEffect(() => {
    if (editEvent) return // editing an existing event never shows the reservation panel
    supabase
      .from('community_settings')
      .select('clubhouse_main_fee, clubhouse_side_room_fee, clubhouse_tables_chairs_fee, clubhouse_security_deposit, clubhouse_payment_deadline_days, clubhouse_side_room_available')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => setClubhouseSettings(data || null))
  }, [editEvent])

  const wantsAnyClubhouseResource = form.wantsMainClubhouse || form.wantsSideRoom || form.wantsTablesChairs

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // If categories load after modal opens, set default once available
  useEffect(() => {
    if (!editEvent && !form.category_id && allowedCategories.length > 0) {
      set('category_id', allowedCategories[0].id)
    }
  }, [allowedCategories.length])

  async function handleSubmit() {
    if (!wantsAnyClubhouseResource && !form.title.trim()) return toast.error('Please enter a title')
    if (!form.event_date) return toast.error('Please select a date')
    if (!form.category_id) return toast.error('Please select a category')

    // Validate URL if provided
    if (form.external_url.trim()) {
      try {
        const url = form.external_url.trim()
        const withProtocol = url.startsWith('http') ? url : 'https://' + url
        new URL(withProtocol)
      } catch {
        return toast.error('Please enter a valid URL')
      }
    }

    // ── Clubhouse reservation validation (new events only) ──────────────────
    if (wantsAnyClubhouseResource) {
      if (!form.privateAnswer) return toast.error('Please answer whether this is a private event')
      if (!form.event_time || !form.event_end_time) return toast.error('Please enter a start and end time for the reservation')
      if (form.event_end_time <= form.event_time) return toast.error('End time must be after the start time')
      if (form.wantsSideRoom && !clubhouseSettings?.clubhouse_side_room_available) return toast.error('The Side Room is not yet available to book')
      if (form.wantsTablesChairs && clubhouseSettings?.clubhouse_tables_chairs_fee == null) return toast.error('Extra Tables & Chairs pricing has not been set yet — contact an administrator')
    }

    const displayName = `${profile?.names || ''} ${profile?.surname || ''}`.trim() || 'A resident'
    const isMasked = wantsAnyClubhouseResource && (form.privateAnswer === 'yes' || form.privateAnswer === 'not_sure')

    setSaving(true)

    const resourceLabel = [
      form.wantsMainClubhouse && 'Main Clubhouse',
      form.wantsSideRoom && 'Side Room',
    ].filter(Boolean).join(' + ')

    const payload = {
      title: isMasked ? `Private Event — ${displayName}` : (wantsAnyClubhouseResource ? form.title.trim() || resourceLabel : form.title.trim()),
      description: isMasked ? '' : form.description.trim(), // never store free text for a masked private booking
      location: wantsAnyClubhouseResource ? resourceLabel : form.location.trim(),
      event_date: form.event_date,
      event_time: form.event_time || null,
      category_id: parseInt(form.category_id),
      external_url: form.external_url.trim()
        ? (form.external_url.startsWith('http') ? form.external_url.trim() : 'https://' + form.external_url.trim())
        : null,
    }

    if (editEvent) {
      // Editing never touches the clubhouse reservation flow — unchanged behavior.
      const { error } = await supabase.from('calendar_events').update(payload).eq('id', editEvent.id)
      setSaving(false)
      if (error) { toast.error('Failed to save event'); return }
      toast.success('Event updated')
      onSaved()
      onClose()
      return
    }

    // ── New event, not a clubhouse reservation: unchanged behavior ──────────
    if (!wantsAnyClubhouseResource) {
      const { error } = await supabase.from('calendar_events').insert({ ...payload, created_by: user.id })
      setSaving(false)
      if (error) { toast.error('Failed to save event'); return }
      toast.success('Event added!')
      onSaved()
      onClose()
      return
    }

    // ── New clubhouse reservation: create the calendar event, then the
    // linked reservation row. If the reservation insert fails (e.g. the slot
    // was just booked by someone else), delete the calendar event we just
    // created so we don't leave an orphaned entry on the shared calendar. ──
    const { data: newEvent, error: eventError } = await supabase
      .from('calendar_events')
      .insert({ ...payload, created_by: user.id })
      .select('id')
      .single()

    if (eventError) {
      setSaving(false)
      toast.error('Failed to save event')
      return
    }

    const isPrivateOrUnsure = form.privateAnswer === 'yes' || form.privateAnswer === 'not_sure'
    const reservationPayload = {
      calendar_event_id: newEvent.id,
      reserved_by: user.id,
      wants_main_clubhouse: form.wantsMainClubhouse,
      wants_side_room: form.wantsSideRoom,
      wants_tables_chairs: form.wantsTablesChairs,
      starts_at: `${form.event_date}T${form.event_time}:00`,
      ends_at: `${form.event_date}T${form.event_end_time}:00`,
      private_event_answer: form.privateAnswer,
      status: isPrivateOrUnsure ? 'pending_rcp' : 'confirmed',
      ...(isPrivateOrUnsure ? {
        fee_main: form.wantsMainClubhouse ? clubhouseSettings.clubhouse_main_fee : null,
        fee_side_room: form.wantsSideRoom ? clubhouseSettings.clubhouse_side_room_fee : null,
        fee_tables_chairs: form.wantsTablesChairs ? clubhouseSettings.clubhouse_tables_chairs_fee : null,
        deposit_amount: clubhouseSettings.clubhouse_security_deposit,
        payment_deadline_days_snapshot: clubhouseSettings.clubhouse_payment_deadline_days,
      } : {}),
    }

    const { data: newReservation, error: reservationError } = await supabase
      .from('clubhouse_reservations')
      .insert(reservationPayload)
      .select('id')
      .single()

    if (reservationError) {
      await supabase.from('calendar_events').delete().eq('id', newEvent.id) // roll back the orphaned event
      setSaving(false)
      if (reservationError.message?.includes('no_double_book')) {
        toast.error('That time was just booked by someone else for this space — please pick another time.')
      } else {
        console.error('Failed to create clubhouse reservation', reservationError)
        toast.error('Failed to create the reservation')
      }
      return
    }

    if (isPrivateOrUnsure && newReservation?.id) notifyClubhouseRcp(newReservation.id)

    setSaving(false)
    toast.success(isPrivateOrUnsure ? 'Reservation submitted — awaiting RCP review' : 'Reservation confirmed!')
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="font-display text-xl text-brand-800 mb-5">
            {editEvent ? 'Edit Event' : 'Add Event'}
          </h2>

          <div className="space-y-4">
            {/* Title */}
            {wantsAnyClubhouseResource && (form.privateAnswer === 'yes' || form.privateAnswer === 'not_sure') ? (
              <div className="bg-brand-50 border border-brand-100 rounded-lg px-3 py-2 text-sm text-brand-600">
                Shown on the shared calendar as <strong>&quot;Private Event&quot;</strong> plus your name — not a custom title, so other residents can see the space is taken without the details being public.
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-brand-700 mb-1">Title {wantsAnyClubhouseResource ? <span className="text-brand-400">(optional)</span> : '*'}</label>
                <input
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  value={form.title}
                  onChange={e => set('title', e.target.value)}
                  placeholder="Event title"
                  maxLength={100}
                />
              </div>
            )}

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-brand-700 mb-1">Category *</label>
              <select
                className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                value={form.category_id}
                onChange={e => set('category_id', e.target.value)}
              >
                {allowedCategories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            {/* Date + Time */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-brand-700 mb-1">Date *</label>
                <input
                  type="date"
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  value={form.event_date}
                  onChange={e => set('event_date', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-700 mb-1">
                  {wantsAnyClubhouseResource ? 'Start time *' : <>Time <span className="text-brand-400">(optional)</span></>}
                </label>
                <input
                  type="time"
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  value={form.event_time}
                  onChange={e => set('event_time', e.target.value)}
                />
              </div>
            </div>
            {wantsAnyClubhouseResource && (
              <div>
                <label className="block text-sm font-medium text-brand-700 mb-1">End time *</label>
                <input
                  type="time"
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  value={form.event_end_time}
                  onChange={e => set('event_end_time', e.target.value)}
                />
              </div>
            )}

            {/* Location */}
            <div>
              <label className="block text-sm font-medium text-brand-700 mb-1">Location <span className="text-brand-400">(optional)</span></label>
              {!editEvent && canRequestClubhouse && (
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => set('wantsMainClubhouse', !form.wantsMainClubhouse)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      form.wantsMainClubhouse ? 'bg-brand-700 text-white border-brand-700' : 'border-brand-200 text-brand-600 hover:bg-brand-50'
                    }`}
                  >
                    🏛️ Main Clubhouse
                  </button>
                  <button
                    type="button"
                    disabled={!clubhouseSettings?.clubhouse_side_room_available}
                    onClick={() => set('wantsSideRoom', !form.wantsSideRoom)}
                    title={clubhouseSettings?.clubhouse_side_room_available ? '' : 'Coming soon — not yet available to book'}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      form.wantsSideRoom ? 'bg-brand-700 text-white border-brand-700' : 'border-brand-200 text-brand-600 hover:bg-brand-50'
                    } ${!clubhouseSettings?.clubhouse_side_room_available ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    🚪 Side Room{!clubhouseSettings?.clubhouse_side_room_available ? ' (coming soon)' : ''}
                  </button>
                </div>
              )}
              {!wantsAnyClubhouseResource && (
                <input
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  value={form.location}
                  onChange={e => set('location', e.target.value)}
                  placeholder="e.g. Pool deck, off-site…"
                  maxLength={100}
                />
              )}
              {!wantsAnyClubhouseResource && form.location.trim() && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                  ⚠️ Adding a location here does not book or reserve it — please make a separate reservation for the Pickleball Court if required, or use the Main Clubhouse / Side Room buttons above to reserve the clubhouse.
                </p>
              )}
            </div>

            {/* Clubhouse reservation panel — only for a NEW event with a resource selected */}
            {wantsAnyClubhouseResource && (
              <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 space-y-3">
                <label className="flex items-center gap-2 text-sm text-brand-700">
                  <input
                    type="checkbox"
                    checked={form.wantsTablesChairs}
                    disabled={clubhouseSettings?.clubhouse_tables_chairs_fee == null}
                    onChange={e => set('wantsTablesChairs', e.target.checked)}
                  />
                  Extra Tables &amp; Chairs
                  {clubhouseSettings?.clubhouse_tables_chairs_fee == null && (
                    <span className="text-brand-400 text-xs">(pricing not yet set)</span>
                  )}
                </label>

                <div>
                  <label className="block text-sm font-medium text-brand-700 mb-1">Is this a private event? *</label>
                  <div className="flex gap-4 text-sm text-brand-700">
                    {[['yes', 'Yes'], ['no', 'No'], ['not_sure', 'Not sure']].map(([val, label]) => (
                      <label key={val} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="privateAnswer"
                          checked={form.privateAnswer === val}
                          onChange={() => set('privateAnswer', val)}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  {(form.privateAnswer === 'yes' || form.privateAnswer === 'not_sure') && (
                    <p className="text-xs text-brand-500 mt-1">This goes to RCP for review, and a fee/deposit applies. Not confirmed until payment is received.</p>
                  )}
                </div>

                {clubhouseSettings && (form.privateAnswer === 'yes' || form.privateAnswer === 'not_sure') && (
                  <div className="text-xs text-brand-600 bg-white rounded-lg border border-brand-100 px-3 py-2 space-y-0.5">
                    {form.wantsMainClubhouse && <div>Main Clubhouse: ${Number(clubhouseSettings.clubhouse_main_fee).toFixed(2)}</div>}
                    {form.wantsSideRoom && clubhouseSettings.clubhouse_side_room_fee != null && <div>Side Room: ${Number(clubhouseSettings.clubhouse_side_room_fee).toFixed(2)}</div>}
                    {form.wantsTablesChairs && clubhouseSettings.clubhouse_tables_chairs_fee != null && <div>Extra Tables &amp; Chairs: ${Number(clubhouseSettings.clubhouse_tables_chairs_fee).toFixed(2)}</div>}
                    <div>Security deposit: ${Number(clubhouseSettings.clubhouse_security_deposit).toFixed(2)}</div>
                    <div className="font-semibold pt-1 border-t border-brand-100 mt-1">
                      Total due: ${(
                        (form.wantsMainClubhouse ? Number(clubhouseSettings.clubhouse_main_fee) : 0) +
                        (form.wantsSideRoom && clubhouseSettings.clubhouse_side_room_fee != null ? Number(clubhouseSettings.clubhouse_side_room_fee) : 0) +
                        (form.wantsTablesChairs && clubhouseSettings.clubhouse_tables_chairs_fee != null ? Number(clubhouseSettings.clubhouse_tables_chairs_fee) : 0) +
                        Number(clubhouseSettings.clubhouse_security_deposit)
                      ).toFixed(2)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Description — hidden for a masked private/not-sure clubhouse reservation,
                since it would otherwise be visible to every resident just like the title. */}
            {!(wantsAnyClubhouseResource && (form.privateAnswer === 'yes' || form.privateAnswer === 'not_sure')) && (
              <div>
                <label className="block text-sm font-medium text-brand-700 mb-1">Description <span className="text-brand-400">(optional)</span></label>
                <textarea
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
                  rows={3}
                  value={form.description}
                  onChange={e => set('description', e.target.value)}
                  placeholder="More details about the event…"
                  maxLength={500}
                />
              </div>
            )}

            {/* External URL */}
            <div>
              <label className="block text-sm font-medium text-brand-700 mb-1">
                External Link <span className="text-brand-400">(optional)</span>
              </label>
              <input
                className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                value={form.external_url}
                onChange={e => set('external_url', e.target.value)}
                placeholder="https://example.com"
              />
              <p className="text-xs text-brand-400 mt-1">Link to an external website, ticketing page, or more info</p>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-brand-200 text-brand-600 text-sm hover:bg-brand-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 px-4 py-2 rounded-lg bg-brand-700 text-white text-sm hover:bg-brand-600 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : (editEvent ? 'Save Changes' : 'Add Event')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Event Detail Modal ──────────────────────────────────────────────────────

// Status labels shown to the resident/admin viewing their own booking's
// detail panel — a small local copy of ClubhouseReservationsPage.jsx's
// STATUS_LABEL, kept separate since this file doesn't share code with the
// admin page and the wording here is resident-facing, not RCP-facing.
const CLUBHOUSE_STATUS_INFO = {
  pending_rcp: { label: 'Submitted — awaiting RCP review', color: 'bg-amber-100 text-amber-700' },
  pending_payment: { label: 'Payment due', color: 'bg-orange-100 text-orange-700' },
  confirmed: { label: 'Confirmed', color: 'bg-green-100 text-green-700' },
  escalated: { label: 'Under review by the Social Committee', color: 'bg-purple-100 text-purple-700' },
  cancelled: { label: 'Cancelled', color: 'bg-gray-200 text-gray-600' },
}

function money(n) {
  return n == null ? null : `$${Number(n).toFixed(2)}`
}

// On-screen counterpart to the "booking processed" email (notify-clubhouse-
// resident-status) — same payment info, shown right on the event so a
// resident doesn't have to go dig up the email. Only rendered for the
// event's creator or a calendar admin (canView), and only when the event is
// actually a clubhouse reservation (a linked clubhouse_reservations row
// exists) — most calendar events aren't.
function ClubhouseReservationPanel({ eventId, canView }) {
  const [reservation, setReservation] = useState(null)
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!canView) { setLoading(false); return }
    let cancelledEffect = false
    ;(async () => {
      const { data } = await supabase
        .from('clubhouse_reservations')
        .select('status, fee_main, fee_side_room, fee_tables_chairs, deposit_amount, total_due, payment_deadline_date, cancellation_reason, check_received_at')
        .eq('calendar_event_id', eventId)
        .maybeSingle()
      if (cancelledEffect) return
      setReservation(data)
      if (data?.status === 'pending_payment') {
        const { data: s } = await supabase
          .from('community_settings')
          .select('clubhouse_check_payable_to, clubhouse_check_mailing_address')
          .eq('id', 1)
          .maybeSingle()
        if (!cancelledEffect) setSettings(s)
      }
      setLoading(false)
    })()
    return () => { cancelledEffect = true }
  }, [eventId, canView])

  if (!canView || loading || !reservation) return null

  const info = CLUBHOUSE_STATUS_INFO[reservation.status]

  return (
    <div className="mt-4 bg-brand-50 border border-brand-100 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-brand-800">Clubhouse Reservation</p>
        {info && (
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${info.color}`}>{info.label}</span>
        )}
      </div>

      {reservation.status === 'pending_payment' && (
        <div className="text-sm text-brand-700 space-y-1.5">
          <div className="space-y-0.5">
            {reservation.fee_main != null && <p>Main Clubhouse fee: {money(reservation.fee_main)}</p>}
            {reservation.fee_side_room != null && <p>Side Room fee: {money(reservation.fee_side_room)}</p>}
            {reservation.fee_tables_chairs != null && <p>Tables &amp; Chairs fee: {money(reservation.fee_tables_chairs)}</p>}
            {reservation.deposit_amount != null && <p>Security deposit: {money(reservation.deposit_amount)}</p>}
            <p className="font-semibold">Total due: {money(reservation.total_due)}</p>
          </div>
          {reservation.payment_deadline_date && (
            <p>Due by <span className="font-medium">{formatDate(reservation.payment_deadline_date)}</span></p>
          )}
          <div className="mt-2 pt-2 border-t border-brand-200">
            {settings?.clubhouse_check_payable_to || settings?.clubhouse_check_mailing_address ? (
              <>
                {settings.clubhouse_check_payable_to && <p>Make check payable to: <span className="font-medium">{settings.clubhouse_check_payable_to}</span></p>}
                {settings.clubhouse_check_mailing_address && <p>Mail to: <span className="font-medium">{settings.clubhouse_check_mailing_address}</span></p>}
              </>
            ) : (
              <p className="text-brand-500 italic">Payment instructions haven&apos;t been posted yet — RCP will follow up directly.</p>
            )}
          </div>
        </div>
      )}

      {reservation.status === 'confirmed' && (
        <p className="text-sm text-brand-700">
          {reservation.check_received_at ? 'Payment received — you\'re all set.' : 'No payment required — you\'re all set.'}
        </p>
      )}

      {reservation.status === 'cancelled' && reservation.cancellation_reason && (
        <p className="text-sm text-brand-700">Reason: {reservation.cancellation_reason}</p>
      )}
    </div>
  )
}

function EventDetailModal({ event, categories, currentUserId, isCalendarAdmin, onClose, onEdit, onRemove, onReport, onRsvp, onRepeat, userRsvp, toast }) {
  const cat = categories.find(c => c.id === event.category_id)
  const canModify = isCalendarAdmin || event.created_by === currentUserId
  const upcoming = isFutureOrToday(event.event_date)
  const [showAttendees, setShowAttendees] = useState(false)
  const [attendees, setAttendees] = useState([])
  const [loadingAttendees, setLoadingAttendees] = useState(false)

  // ── Comments ──────────────────────────────────────────────────────────────
  const [comments, setComments] = useState([])
  const [loadingComments, setLoadingComments] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [showCommentReport, setShowCommentReport] = useState(false)
  const [reportCommentId, setReportCommentId] = useState(null)
  const [commentReportReason, setCommentReportReason] = useState('')

  const [commentPhotoFile, setCommentPhotoFile] = useState(null)
  const [commentPhotoPreview, setCommentPhotoPreview] = useState(null)
  const commentPhotoRef = useRef(null)
  const { uploading: commentPhotoUploading, error: commentPhotoError, uploadImage: uploadCommentPhoto } = useImageUpload({
    bucket: 'calendar-comments',
    maxDimension: 1200,
  })

  const fetchComments = useCallback(async () => {
    setLoadingComments(true)
    const { data, error } = await supabase
      .from('calendar_comments')
      .select('id, body, photo_url, created_by, created_at, removed')
      .eq('event_id', event.id)
      .eq('removed', false)
      .order('created_at', { ascending: true })

    if (error) { setLoadingComments(false); return }

    const userIds = [...new Set(data.map(c => c.created_by).filter(Boolean))]
    let nameMap = {}
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, names, surname')
        .in('id', userIds)
      if (profiles) {
        profiles.forEach(p => {
          const first = p.names?.split(' ')[0] || ''
          nameMap[p.id] = `${first} ${p.surname || ''}`.trim()
        })
      }
    }

    setComments(data.map(c => ({ ...c, author_name: nameMap[c.created_by] || 'Resident' })))
    setLoadingComments(false)
  }, [event.id])

  useEffect(() => { fetchComments() }, [fetchComments])

  const handleAddComment = async () => {
    if (!newComment.trim()) return
    setSubmittingComment(true)

    let photo_url = null
    if (commentPhotoFile) {
      photo_url = await uploadCommentPhoto(commentPhotoFile)
      if (!photo_url) { setSubmittingComment(false); return }
    }

    const { data: inserted, error } = await supabase
      .from('calendar_comments')
      .insert({ event_id: event.id, body: newComment.trim(), created_by: currentUserId, photo_url })
      .select('id')
      .single()
    setSubmittingComment(false)
    if (error) { toast.error('Could not add comment.'); return }
    setNewComment('')
    setCommentPhotoFile(null)
    if (commentPhotoPreview) URL.revokeObjectURL(commentPhotoPreview)
    setCommentPhotoPreview(null)
    if (commentPhotoRef.current) commentPhotoRef.current.value = ''
    fetchComments()
    if (inserted?.id) notifyCommentOwner('calendar', inserted.id)
  }

  const handleRemoveComment = async (comment) => {
    if (!window.confirm('Remove this comment?')) return
    const { error } = await supabase
      .from('calendar_comments')
      .update({ removed: true })
      .eq('id', comment.id)
    if (error) { toast.error('Could not remove comment.'); return }
    deleteStoragePhoto(comment.photo_url, 'calendar-comments')
    toast.success('Comment removed.')
    fetchComments()
  }

  const openCommentReport = (commentId) => {
    setReportCommentId(commentId)
    setCommentReportReason('')
    setShowCommentReport(true)
  }

  const submitCommentReport = async () => {
    if (!commentReportReason.trim()) return
    const { error } = await supabase
      .from('blog_reports')
      .insert({ target_type: 'calendar_comment', target_id: reportCommentId, reported_by: currentUserId, reason: commentReportReason.trim() })
    if (error) { toast.error('Could not submit report.'); return }
    toast.success('Report submitted. Thank you.')
    setShowCommentReport(false)
  }

  async function fetchAttendees() {
    if (attendees.length > 0) { setShowAttendees(true); return }
    setLoadingAttendees(true)
    const { data: rsvpRows } = await supabase
      .from('calendar_rsvps')
      .select('resident_id')
      .eq('event_id', event.id)
    if (rsvpRows && rsvpRows.length > 0) {
      const ids = rsvpRows.map(r => r.resident_id)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('resident_id, names, surname')
        .in('resident_id', ids)
      setAttendees(profiles?.map(p => [p.names, p.surname].filter(Boolean).join(' ')) || [])
    } else {
      setAttendees([])
    }
    setLoadingAttendees(false)
    setShowAttendees(true)
  }

  function toggleAttendees() {
    if (showAttendees) { setShowAttendees(false) }
    else { fetchAttendees() }
  }

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Category badge */}
          {cat && (
            <span
              className="inline-block text-xs font-semibold px-3 py-1 rounded-full mb-3"
              style={{ backgroundColor: cat.color + '22', color: cat.color }}
            >
              {cat.name}
            </span>
          )}

          <h2 className="font-display text-2xl text-brand-800 mb-1">{event.title}</h2>

          <div className="space-y-2 mt-3 text-sm text-brand-600">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-brand-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>{formatDate(event.event_date)}{event.event_time ? ' · ' + formatTime(event.event_time) : ''}</span>
            </div>
            {event.location && (
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-brand-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>{event.location}</span>
              </div>
            )}
            {event.author_name && (
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-brand-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span>Added by {event.author_name}</span>
              </div>
            )}
          </div>

          {event.description && (
            <p className="mt-4 text-sm text-brand-700 leading-relaxed">{event.description}</p>
          )}

          <ClubhouseReservationPanel eventId={event.id} canView={canModify} />

          {/* External link */}
          {event.external_url && (
            <a
              href={event.external_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex items-center gap-2 text-sm text-brand-600 hover:text-brand-800 underline underline-offset-2"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              More information
            </a>
          )}

          {/* RSVP + attendees */}
          {upcoming && (
            <div className="mt-5">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => onRsvp(event)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    userRsvp
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-brand-700 text-white hover:bg-brand-600'
                  }`}
                >
                  {userRsvp ? '✓ I\'m going' : 'I\'m going'}
                </button>
                {event.rsvp_count > 0 && (
                  <button
                    onClick={toggleAttendees}
                    className="text-sm text-brand-500 hover:text-brand-700 underline underline-offset-2 transition-colors"
                  >
                    {event.rsvp_count} {event.rsvp_count === 1 ? 'person' : 'people'} going
                    <span className="ml-1">{showAttendees ? '▲' : '▼'}</span>
                  </button>
                )}
              </div>

              {/* Attendee list */}
              {showAttendees && (
                <div className="mt-3 p-3 bg-brand-50 rounded-lg">
                  {loadingAttendees ? (
                    <p className="text-xs text-brand-400">Loading…</p>
                  ) : attendees.length === 0 ? (
                    <p className="text-xs text-brand-400">No attendees found.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {attendees.map((name, i) => (
                        <span key={i} className="text-xs bg-white border border-brand-200 text-brand-700 px-2 py-1 rounded-full">
                          {name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Comments */}
          <div className="mt-6 pt-4 border-t border-brand-100">
            <h3 className="text-sm font-semibold text-brand-700 mb-3">
              Comments {!loadingComments && `(${comments.length})`}
            </h3>

            {loadingComments ? (
              <p className="text-xs text-brand-400">Loading comments…</p>
            ) : comments.length === 0 ? (
              <p className="text-xs text-brand-400 italic mb-3">No comments yet — ask a question or leave a note!</p>
            ) : (
              <div className="space-y-3 mb-3">
                {comments.map(comment => {
                  const isOwnComment = comment.created_by === currentUserId
                  const canRemoveComment = isCalendarAdmin || isOwnComment
                  return (
                    <div key={comment.id} className="flex gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-xs font-semibold text-brand-700 flex-shrink-0 mt-0.5">
                        {(comment.author_name || 'R')[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="bg-brand-50 rounded-xl px-3 py-2">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <span className="text-xs font-semibold text-brand-700">{comment.author_name || 'Resident'}</span>
                            <span className="text-xs text-brand-400">{formatDate(comment.created_at.slice(0, 10))}</span>
                          </div>
                          <p className="text-sm text-brand-800 whitespace-pre-wrap">{comment.body}</p>
                          {comment.photo_url && (
                            <img src={comment.photo_url} alt="Comment attachment" loading="lazy" className="mt-2 rounded-lg max-h-40 object-cover w-full" />
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 pl-1">
                          {!isOwnComment && (
                            <button onClick={() => openCommentReport(comment.id)} className="text-xs text-brand-400 hover:text-brand-600">
                              🚩 Report
                            </button>
                          )}
                          {canRemoveComment && (
                            <button onClick={() => handleRemoveComment(comment)} className="text-xs text-red-400 hover:text-red-600">
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Add comment */}
            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <textarea
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  placeholder="Ask a question or leave a comment…"
                  rows={2}
                  className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
                {commentPhotoPreview ? (
                  <div className="relative inline-block mt-2 rounded-lg overflow-hidden border border-brand-200">
                    <img src={commentPhotoPreview} alt="Preview" className="max-h-24 object-cover" />
                    <button
                      type="button"
                      onClick={() => { setCommentPhotoFile(null); URL.revokeObjectURL(commentPhotoPreview); setCommentPhotoPreview(null); if (commentPhotoRef.current) commentPhotoRef.current.value = '' }}
                      className="absolute top-1 right-1 bg-white bg-opacity-90 rounded-full w-5 h-5 flex items-center justify-center shadow text-brand-700 font-bold text-xs"
                    >×</button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => commentPhotoRef.current?.click()}
                    className="mt-2 text-xs text-brand-500 hover:text-brand-700 flex items-center gap-1"
                  >
                    📷 Add a photo
                  </button>
                )}
                <input ref={commentPhotoRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (!f) return; setCommentPhotoFile(f); setCommentPhotoPreview(URL.createObjectURL(f)) }} />
                {commentPhotoError && <p className="text-xs text-red-500 mt-1">{commentPhotoError}</p>}
              </div>
              <button
                onClick={handleAddComment}
                disabled={submittingComment || commentPhotoUploading || !newComment.trim()}
                className="px-3 py-2 text-sm bg-brand-700 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors flex-shrink-0"
              >
                {commentPhotoUploading ? 'Uploading…' : submittingComment ? 'Posting…' : 'Post'}
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-brand-100">
            <div className="flex gap-2 flex-wrap">
              {canModify && (
                <>
                  <button
                    onClick={() => { onEdit(event); onClose() }}
                    className="text-xs px-3 py-1.5 rounded-lg border border-brand-200 text-brand-600 hover:bg-brand-50 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onRemove(event)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Remove
                  </button>
                </>
              )}
              {canModify && onRepeat && (
                <button
                  onClick={() => { onRepeat(event); onClose() }}
                  className="text-xs px-3 py-1.5 rounded-lg border border-brand-200 text-brand-600 hover:bg-brand-50 transition-colors"
                  title="Create a copy of this event on a new date"
                >
                  🔁 Next occurrence
                </button>
              )}
              {!canModify && (
                <button
                  onClick={() => onReport(event)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-brand-200 text-brand-500 hover:bg-brand-50 transition-colors"
                >
                  Report
                </button>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-sm text-brand-400 hover:text-brand-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Report Comment modal */}
      {showCommentReport && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 1600, backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowCommentReport(false) }}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h3 className="font-display text-lg text-brand-800 mb-1">Report Comment</h3>
            <p className="text-sm text-brand-500 mb-3">Let the admin team know why this comment is inappropriate.</p>
            <textarea
              value={commentReportReason}
              onChange={e => setCommentReportReason(e.target.value)}
              placeholder="Describe the issue…"
              aria-label="Report reason"
              rows={3}
              className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-400 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCommentReport(false)} className="px-4 py-2 text-sm text-brand-600 hover:bg-brand-50 rounded-lg">Cancel</button>
              <button
                onClick={submitCommentReport}
                disabled={!commentReportReason.trim()}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                Submit Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Event Card (List View) ──────────────────────────────────────────────────

function EventCard({ event, categories, onSelect }) {
  const cat = categories.find(c => c.id === event.category_id)
  const upcoming = isFutureOrToday(event.event_date)

  return (
    <div
      onClick={() => onSelect(event)}
      className={`bg-white rounded-xl border border-brand-100 shadow-sm hover:shadow-md hover:border-brand-300 transition-all cursor-pointer p-4 ${
        !upcoming ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Date column */}
        <div className="flex-shrink-0 w-14 text-center">
          <div className="text-xs text-brand-400 uppercase font-medium">
            {new Date(event.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
          </div>
          <div className="text-2xl font-bold text-brand-800 leading-tight">
            {new Date(event.event_date + 'T00:00:00').getDate()}
          </div>
          <div className="text-xs text-brand-400">
            {new Date(event.event_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {cat && (
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: cat.color + '22', color: cat.color }}
              >
                {cat.name}
              </span>
            )}
            {event.external_url && (
              <span className="text-xs text-brand-400" title="Has external link">
                <svg className="w-3.5 h-3.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </span>
            )}
          </div>
          <h3 className="font-semibold text-brand-800 text-sm leading-snug truncate">{event.title}</h3>
          <div className="flex items-center gap-3 mt-1 text-xs text-brand-500 flex-wrap">
            {event.event_time && <span>{formatTime(event.event_time)}</span>}
            {event.location && <span>📍 {event.location}</span>}
          </div>
        </div>

        {/* RSVP pill */}
        {upcoming && event.rsvp_count > 0 && (
          <div className="flex-shrink-0 text-xs text-green-600 font-medium bg-green-50 rounded-full px-2 py-0.5 whitespace-nowrap">
            {event.rsvp_count} going
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Grid View ──────────────────────────────────────────────────────────────

function CalendarGrid({ events, categories, year, month, onSelect }) {
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)

  // Build event map: day → events[]
  const eventMap = {}
  events.forEach(ev => {
    const d = new Date(ev.event_date + 'T00:00:00')
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate()
      if (!eventMap[day]) eventMap[day] = []
      eventMap[day].push(ev)
    }
  })

  const cells = []
  // Empty leading cells
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div>
      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {dayNames.map(d => (
          <div key={d} className="text-center text-xs font-semibold text-brand-400 py-1">{d}</div>
        ))}
      </div>
      {/* Cells */}
      <div className="grid grid-cols-7 gap-px bg-brand-100 border border-brand-100 rounded-xl overflow-hidden">
        {cells.map((day, i) => (
          <div
            key={i}
            className={`bg-white min-h-[80px] p-1 ${day ? '' : 'bg-brand-50'}`}
          >
            {day && (
              <>
                <div className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full mb-1 ${
                  isToday(year, month, day) ? 'bg-brand-700 text-white' : 'text-brand-600'
                }`}>
                  {day}
                </div>
                <div className="space-y-0.5">
                  {(eventMap[day] || []).slice(0, 3).map(ev => {
                    const cat = categories.find(c => c.id === ev.category_id)
                    return (
                      <button
                        key={ev.id}
                        onClick={() => onSelect(ev)}
                        className="w-full text-left text-xs px-1.5 py-0.5 rounded truncate font-medium leading-tight"
                        style={{ backgroundColor: (cat?.color || '#2C5F8A') + '22', color: cat?.color || '#2C5F8A' }}
                        title={ev.title}
                      >
                        {ev.external_url && '🔗 '}{ev.title}
                      </button>
                    )
                  })}
                  {(eventMap[day] || []).length > 3 && (
                    <div className="text-xs text-brand-400 px-1">+{eventMap[day].length - 3} more</div>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Report Modal ────────────────────────────────────────────────────────────

function ReportModal({ event, currentUserId, onClose, onSubmitted, toast }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    if (!reason.trim()) return toast.error('Please provide a reason')
    setSaving(true)
    const { error } = await supabase.from('blog_reports').insert({
      target_type: 'event',
      target_id: event.id,
      reported_by: currentUserId,
      reason: reason.trim(),
    })
    setSaving(false)
    if (error) {
      toast.error('Failed to submit report')
    } else {
      toast.success('Report submitted — thank you')
      onSubmitted()
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h2 className="font-display text-xl text-brand-800 mb-1">Report Event</h2>
        <p className="text-sm text-brand-500 mb-4">Let the admin team know why this event is inappropriate.</p>
        <textarea
          className="w-full border border-brand-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-400"
          rows={3}
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Describe the issue…"
        />
        <div className="flex gap-3 mt-4">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-brand-200 text-brand-600 text-sm hover:bg-brand-50">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-50">
            {saving ? 'Submitting…' : 'Submit Report'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Repeat Modal ────────────────────────────────────────────────────────────

// Given a date string, return the date that is the same weekday occurrence
// in the following calendar month (e.g. 2nd Friday → 2nd Friday next month).
function nextMonthSameOccurrence(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const dayOfWeek = d.getDay()                        // 0=Sun … 6=Sat
  const occurrence = Math.ceil(d.getDate() / 7)       // 1st, 2nd, 3rd, 4th, (5th)

  // First day of next month
  const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  const firstDow = nextMonth.getDay()

  // How many days until the target weekday first appears in next month?
  let offset = dayOfWeek - firstDow
  if (offset < 0) offset += 7
  // First occurrence of that weekday in next month
  let target = new Date(nextMonth)
  target.setDate(1 + offset + (occurrence - 1) * 7)

  // If we've overshot into the following month (e.g. there's no 5th Friday),
  // step back one week to land on the 4th occurrence instead.
  if (target.getMonth() !== nextMonth.getMonth()) {
    target.setDate(target.getDate() - 7)
  }

  return target.toISOString().split('T')[0]
}

function RepeatModal({ event, onClose, onConfirm }) {
  const [mode, setMode] = useState('weeks_1')  // 'weeks_1' | 'weeks_2' | 'month_same'

  const previewDate = (() => {
    const base = event.event_date
    let newDate
    if (mode === 'weeks_1') {
      const d = new Date(base + 'T00:00:00'); d.setDate(d.getDate() + 7); newDate = d.toISOString().split('T')[0]
    } else if (mode === 'weeks_2') {
      const d = new Date(base + 'T00:00:00'); d.setDate(d.getDate() + 14); newDate = d.toISOString().split('T')[0]
    } else {
      newDate = nextMonthSameOccurrence(base)
    }
    return new Date(newDate + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    })
  })()

  // Describe the monthly option label dynamically
  const monthLabel = (() => {
    const d = new Date(event.event_date + 'T00:00:00')
    const occurrence = Math.ceil(d.getDate() / 7)
    const ordinals = ['', '1st', '2nd', '3rd', '4th', '5th']
    const dayName = d.toLocaleDateString('en-US', { weekday: 'long' })
    return `Next month (${ordinals[occurrence]} ${dayName})`
  })()

  const [saving, setSaving] = useState(false)

  async function handleConfirm() {
    setSaving(true)
    await onConfirm(mode)
    setSaving(false)
  }

  const options = [
    { value: 'weeks_1', label: '1 week later' },
    { value: 'weeks_2', label: '2 weeks later' },
    { value: 'month_same', label: monthLabel },
  ]

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h2 className="font-display text-xl text-brand-800 mb-1">Create Next Occurrence</h2>
        <p className="text-sm text-brand-500 mb-5">
          A copy of <strong className="text-brand-700">"{event.title}"</strong> will be created on the new date. You can edit any details afterwards.
        </p>

        <div className="space-y-3 mb-5">
          {options.map(opt => (
            <label key={opt.value} className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-brand-100 hover:bg-brand-50 transition-colors">
              <input
                type="radio"
                name="repeat_mode"
                value={opt.value}
                checked={mode === opt.value}
                onChange={() => setMode(opt.value)}
                className="accent-brand-700"
              />
              <span className="text-sm text-brand-700 font-medium">{opt.label}</span>
            </label>
          ))}
        </div>

        <div className="bg-brand-50 rounded-lg px-4 py-2 text-sm text-brand-600 mb-5">
          📅 New date: <strong>{previewDate}</strong>
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-brand-200 text-brand-600 text-sm hover:bg-brand-50">
            Cancel
          </button>
          <button onClick={handleConfirm} disabled={saving} className="flex-1 px-4 py-2 rounded-lg bg-brand-700 text-white text-sm hover:bg-brand-600 disabled:opacity-50">
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function SocialCalendar() {
  const { user } = useAuth()
  const toast = useToast()

  const now = new Date()
  const [viewMode, setViewMode] = useState(() => {
    // If arriving from blog with an event to open, force list mode so event is fetched
    const params = new URLSearchParams(window.location.search)
    if (params.get('openEvent')) return 'list'
    return window.innerWidth < 768 ? 'list' : 'grid'
  })
  const [currentYear, setCurrentYear] = useState(now.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(now.getMonth())
  const [filterCategory, setFilterCategory] = useState('all')
  const [showPast, setShowPast] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return !!params.get('openEvent') // show past events if arriving from a blog link
  })
  const [showAll, setShowAll] = useState(false) // list view: ignore date bounds entirely
  const [filterMine, setFilterMine] = useState(false) // "Show my events" — only events this resident created

  const [categories, setCategories] = useState([])
  const [events, setEvents] = useState([])
  const [userRsvps, setUserRsvps] = useState(new Set())
  const [profile, setProfile] = useState(null)
  const [isCalendarAdmin, setIsCalendarAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  const [showAddModal, setShowAddModal] = useState(false)
  const [editEvent, setEditEvent] = useState(null)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [reportEvent, setReportEvent] = useState(null)
  const [repeatEvent, setRepeatEvent] = useState(null)

  const [searchParams, setSearchParams] = useSearchParams()

  // ── Auto-open event from ?openEvent=id (linked from blog) ─────────────────
  useEffect(() => {
    const openId = searchParams.get('openEvent')
    if (!openId || loading || events.length === 0) return
    const match = events.find(e => e.id === parseInt(openId))
    if (match) {
      setSelectedEvent(match)
      setSearchParams({}, { replace: true }) // clean up URL after opening
    }
  }, [searchParams, events, loading, setSearchParams])

  // ── Fetch profile + admin status ─────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    async function fetchProfile() {
      const [{ data: accessRows }, { data: prof }] = await Promise.all([
        supabase.from('app_access').select('app_id, role').eq('user_id', user.id),
        supabase.from('profiles').select('resident_id, names, surname, tags').eq('id', user.id).single(),
      ])
      setProfile(prof)
      const admin = accessRows?.some(r => r.app_id === 'admin' || (r.app_id === 'calendar' && r.role === 'admin'))
      setIsCalendarAdmin(!!admin)
    }
    fetchProfile()
  }, [user])

  // ── Fetch categories ──────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('calendar_categories').select('*').order('name').then(({ data }) => {
      setCategories(data || [])
    })
  }, [])

  // ── Fetch events ──────────────────────────────────────────────────────────
  const fetchEvents = useCallback(async () => {
    setLoading(true)

    // Build date range for current month view (grid) or broader window (list)
    let query = supabase
      .from('calendar_events')
      .select('*')
      .eq('removed', false)
      .order('event_date', { ascending: true })
      .order('event_time', { ascending: true, nullsFirst: true })

    if (viewMode === 'grid') {
      const start = new Date(currentYear, currentMonth, 1).toISOString().split('T')[0]
      const end = new Date(currentYear, currentMonth + 1, 0).toISOString().split('T')[0]
      query = query.gte('event_date', start).lte('event_date', end)
    } else if (showAll) {
      // No date bounds at all — every event, oldest first.
    } else {
      const isCurrentRealMonth = currentYear === now.getFullYear() && currentMonth === now.getMonth()
      if (isCurrentRealMonth) {
        // Default "what's coming up" list: today (or the whole current month
        // if "Show past" is on) through 3 months ahead.
        let start
        if (showPast) {
          start = new Date(currentYear, currentMonth, 1)
        } else {
          start = new Date()
          start.setHours(0, 0, 0, 0)
        }
        query = query.gte('event_date', start.toISOString().split('T')[0])
        query = query.lte('event_date', new Date(currentYear, currentMonth + 3, 0).toISOString().split('T')[0])
      } else {
        // The month nav has moved to a specific month — show just that month
        // (same bounds as Grid view for that month), so every click of ‹ / ›
        // visibly changes what's shown instead of subtly sliding a window
        // that, with only a handful of events, often looks like it did nothing.
        const start = new Date(currentYear, currentMonth, 1).toISOString().split('T')[0]
        const end = new Date(currentYear, currentMonth + 1, 0).toISOString().split('T')[0]
        query = query.gte('event_date', start).lte('event_date', end)
      }
    }

    if (filterCategory !== 'all') {
      query = query.eq('category_id', parseInt(filterCategory))
    }

    if (filterMine && user) {
      query = query.eq('created_by', user.id)
    }

    const { data: evData } = await query

    // Fetch RSVP counts + author names separately
    if (evData && evData.length > 0) {
      const eventIds = evData.map(e => e.id)

      // RSVP counts
      const { data: rsvpRows } = await supabase
        .from('calendar_rsvps')
        .select('event_id')
        .in('event_id', eventIds)

      const rsvpCounts = {}
      rsvpRows?.forEach(r => {
        rsvpCounts[r.event_id] = (rsvpCounts[r.event_id] || 0) + 1
      })

      // User's own RSVPs
      if (user) {
        const { data: myProfile } = await supabase
          .from('profiles')
          .select('resident_id')
          .eq('id', user.id)
          .single()
        if (myProfile) {
          const { data: myRsvps } = await supabase
            .from('calendar_rsvps')
            .select('event_id')
            .eq('resident_id', myProfile.resident_id)
            .in('event_id', eventIds)
          setUserRsvps(new Set(myRsvps?.map(r => r.event_id) || []))
        }
      }

      // Author names — fetch profiles for created_by UUIDs
      const authorIds = [...new Set(evData.map(e => e.created_by).filter(Boolean))]
      const { data: authorProfiles } = await supabase
        .from('profiles')
        .select('id, names, surname')
        .in('id', authorIds)
      const authorMap = {}
      authorProfiles?.forEach(p => {
        authorMap[p.id] = [p.names, p.surname].filter(Boolean).join(' ')
      })

      setEvents(evData.map(ev => ({
        ...ev,
        rsvp_count: rsvpCounts[ev.id] || 0,
        author_name: authorMap[ev.created_by] || 'Resident',
      })))
    } else {
      setEvents([])
      setUserRsvps(new Set())
    }

    setLoading(false)
  }, [viewMode, currentYear, currentMonth, filterCategory, showPast, showAll, filterMine, user])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  // ── RSVP toggle ───────────────────────────────────────────────────────────
  async function handleRsvp(event) {
    if (!profile) return
    const has = userRsvps.has(event.id)
    if (has) {
      await supabase.from('calendar_rsvps').delete()
        .eq('event_id', event.id)
        .eq('resident_id', profile.resident_id)
    } else {
      await supabase.from('calendar_rsvps').insert({
        event_id: event.id,
        resident_id: profile.resident_id,
      })
    }
    fetchEvents()
    // Update detail modal if open
    if (selectedEvent?.id === event.id) {
      setSelectedEvent(ev => ev ? { ...ev, rsvp_count: has ? ev.rsvp_count - 1 : ev.rsvp_count + 1 } : null)
    }
  }

  // ── Remove event ──────────────────────────────────────────────────────────
  async function handleRemove(event) {
    if (!window.confirm(`Remove "${event.title}"? This cannot be undone.`)) return

    // If this is a clubhouse reservation, cancelling it needs to update the
    // reservation record too, not just pull the event off the calendar — see
    // Reservations/REQUIREMENTS.md 2.9. A resident can cancel their own
    // booking either before or after the fee's been paid: before, it just
    // cancels (and drops out of RCP's queue on its own, nothing further
    // needed); after, RCP is notified a refund needs processing.
    const { data: reservation } = await supabase
      .from('clubhouse_reservations')
      .select('id, status, check_received_at')
      .eq('calendar_event_id', event.id)
      .maybeSingle()

    if (reservation && reservation.status !== 'cancelled') {
      const reason = window.prompt('Any reason you\'d like to share with RCP? (optional)')
      const { error: cancelError } = await supabase
        .from('clubhouse_reservations')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_by: user.id,
          cancellation_reason: reason || null,
        })
        .eq('id', reservation.id)
      if (cancelError) {
        toast.error('Failed to cancel the reservation')
        return
      }
      if (reservation.check_received_at) notifyClubhouseCancellation(reservation.id) // fire-and-forget — RCP needs to process a refund
    }

    const { error } = await supabase.from('calendar_events').update({ removed: true }).eq('id', event.id)
    if (error) {
      toast.error('Failed to remove event')
    } else {
      toast.success('Event removed')
      setSelectedEvent(null)
      fetchEvents()
    }
  }

  // ── Repeat event (create next occurrence) ────────────────────────────────
  async function handleRepeat(event, mode) {
    let newDate
    if (mode === 'weeks_1') {
      const d = new Date(event.event_date + 'T00:00:00'); d.setDate(d.getDate() + 7); newDate = d.toISOString().split('T')[0]
    } else if (mode === 'weeks_2') {
      const d = new Date(event.event_date + 'T00:00:00'); d.setDate(d.getDate() + 14); newDate = d.toISOString().split('T')[0]
    } else {
      newDate = nextMonthSameOccurrence(event.event_date)
    }
    const payload = {
      title: event.title,
      description: event.description,
      location: event.location,
      event_date: newDate,
      event_time: event.event_time || null,
      category_id: event.category_id,
      external_url: event.external_url || null,
      created_by: user.id,
    }
    const { error } = await supabase.from('calendar_events').insert(payload)
    if (error) {
      toast.error('Failed to create next occurrence')
    } else {
      toast.success('Next occurrence created!')
      setRepeatEvent(null)
      fetchEvents()
    }
  }

  // ── Month navigation ──────────────────────────────────────────────────────
  // Navigating by month always exits "Show All" — it's a distinct mode, and
  // clicking ‹ / › or the month label is a clear signal to browse a specific
  // period again instead.
  function prevMonth() {
    setShowAll(false)
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1) }
    else setCurrentMonth(m => m - 1)
  }
  function nextMonth() {
    setShowAll(false)
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1) }
    else setCurrentMonth(m => m + 1)
  }
  function goToToday() {
    setShowAll(false)
    setCurrentYear(now.getFullYear())
    setCurrentMonth(now.getMonth())
  }

  // "Show my events" — switches into list view filtered to this resident's
  // own events, resetting to the same "today forward" starting point as the
  // default list view. Show past / Show All / month nav all keep working
  // normally on top of it, same as the unfiltered list.
  function toggleMine() {
    setFilterMine(m => {
      const next = !m
      if (next) {
        setViewMode('list')
        setShowAll(false)
        setShowPast(false)
        setCurrentYear(now.getFullYear())
        setCurrentMonth(now.getMonth())
      }
      return next
    })
  }

  // ── Can current user create events ───────────────────────────────────────
  const canCreate = isCalendarAdmin || !!profile

  // ── Filtered events for list view ─────────────────────────────────────────
  const listEvents = events

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl text-brand-800">Social Calendar</h1>
          <p className="text-brand-500 text-sm mt-1">Community events and activities</p>
        </div>
        {canCreate && (
          <button
            onClick={() => { setEditEvent(null); setShowAddModal(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-gold-500 hover:bg-gold-400 text-brand-900 font-semibold text-sm rounded-lg transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Event
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        {/* View toggle */}
        <div className="flex rounded-lg border border-brand-200 overflow-hidden text-sm">
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 transition-colors ${viewMode === 'list' ? 'bg-brand-700 text-white' : 'text-brand-600 hover:bg-brand-50'}`}
          >
            List
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`px-3 py-1.5 transition-colors ${viewMode === 'grid' ? 'bg-brand-700 text-white' : 'text-brand-600 hover:bg-brand-50'}`}
          >
            Grid
          </button>
        </div>

        {/* Month nav */}
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-1.5 rounded-lg border border-brand-200 hover:bg-brand-50 transition-colors">
            <svg className="w-4 h-4 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button onClick={goToToday} className="text-sm font-medium text-brand-700 min-w-[140px] text-center hover:text-brand-900 transition-colors">
            {monthLabel(currentYear, currentMonth)}
          </button>
          <button onClick={nextMonth} className="p-1.5 rounded-lg border border-brand-200 hover:bg-brand-50 transition-colors">
            <svg className="w-4 h-4 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Category filter */}
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="border border-brand-200 rounded-lg px-3 py-1.5 text-sm text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          <option value="all">All categories</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>

        {/* My events toggle — always visible; switches into list view */}
        <button
          onClick={toggleMine}
          className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
            filterMine ? 'bg-gold-100 border-gold-400 text-brand-800 font-medium' : 'border-brand-200 text-brand-500 hover:bg-brand-50'
          }`}
        >
          {filterMine ? '✓ My Events' : 'My Events'}
        </button>

        {/* Show past toggle (list only) — moot once "Show All" is on */}
        {viewMode === 'list' && !showAll && (
          <button
            onClick={() => setShowPast(p => !p)}
            className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
              showPast ? 'bg-brand-100 border-brand-300 text-brand-700' : 'border-brand-200 text-brand-500 hover:bg-brand-50'
            }`}
          >
            {showPast ? 'Hiding past' : 'Show past'}
          </button>
        )}

        {/* Show All toggle (list only) — every event, no date filtering */}
        {viewMode === 'list' && (
          <button
            onClick={() => setShowAll(a => !a)}
            className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
              showAll ? 'bg-gold-100 border-gold-400 text-brand-800 font-medium' : 'border-brand-200 text-brand-500 hover:bg-brand-50'
            }`}
          >
            {showAll ? '✓ Showing All' : 'Show All'}
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-16 text-brand-400 text-sm">Loading events…</div>
      ) : viewMode === 'grid' ? (
        <CalendarGrid
          events={events}
          categories={categories}
          year={currentYear}
          month={currentMonth}
          onSelect={setSelectedEvent}
        />
      ) : (
        <div className="space-y-3">
          {listEvents.length === 0 ? (
            <div className="text-center py-16 text-brand-400">
              <div className="text-4xl mb-3">📅</div>
              <p className="text-sm">No events found.</p>
              {canCreate && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="mt-3 text-sm text-brand-600 underline hover:text-brand-800"
                >
                  Add the first event
                </button>
              )}
            </div>
          ) : (
            listEvents.map(ev => (
              <EventCard
                key={ev.id}
                event={ev}
                categories={categories}
                onSelect={setSelectedEvent}
              />
            ))
          )}
        </div>
      )}

      {/* Modals */}
      {(showAddModal || editEvent) && (
        <EventModal
          categories={categories}
          editEvent={editEvent}
          profile={profile}
          isCalendarAdmin={isCalendarAdmin}
          toast={toast}
          user={user}
          onClose={() => { setShowAddModal(false); setEditEvent(null) }}
          onSaved={fetchEvents}
        />
      )}

      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          categories={categories}
          currentUserId={user?.id}
          isCalendarAdmin={isCalendarAdmin}
          onClose={() => setSelectedEvent(null)}
          onEdit={ev => { setEditEvent(ev); setSelectedEvent(null) }}
          onRemove={ev => handleRemove(ev)}
          onReport={ev => { setReportEvent(ev); setSelectedEvent(null) }}
          onRsvp={handleRsvp}
          onRepeat={ev => { setRepeatEvent(ev); setSelectedEvent(null) }}
          userRsvp={userRsvps.has(selectedEvent.id)}
          toast={toast}
        />
      )}

      {reportEvent && (
        <ReportModal
          event={reportEvent}
          currentUserId={user?.id}
          toast={toast}
          onClose={() => setReportEvent(null)}
          onSubmitted={fetchEvents}
        />
      )}

      {repeatEvent && (
        <RepeatModal
          event={repeatEvent}
          onClose={() => setRepeatEvent(null)}
          onConfirm={(mode) => handleRepeat(repeatEvent, mode)}
        />
      )}
    </div>
  )
}
