import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/Toast'
import LoadingSpinner from '@/components/LoadingSpinner'

// ─── Clubhouse Reservations — RCP / social-committee review queue ───────────
// Narrow, dedicated page (not folded into the general /admin/reports hub) so
// RCP staff and committee volunteers only ever get access to this one thing,
// not the rest of the admin panel. See Reservations/REQUIREMENTS.md §2.6/§2.13.
//
// RCP and the Social Committee are two different 'clubhouse' app_access
// roles (2026-09-03, replacing an earlier design where they shared one admin
// role and "committee only touches escalations" was just a convention):
//   role = 'admin' → RCP. Full queue, every action.
//   role = 'user'  → Social Committee. Only ever sees/acts on escalated
//                     reservations — enforced by RLS (see
//                     clubhouse_committee_role.sql), reinforced here by only
//                     rendering Confirm/Dismiss for them, nothing else.

function formatDateTime(startsAt, endsAt) {
  const s = new Date(startsAt)
  const e = new Date(endsAt)
  const dateStr = s.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  const fmtTime = d => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${dateStr} · ${fmtTime(s)}–${fmtTime(e)}`
}

function money(n) {
  return n == null ? '—' : `$${Number(n).toFixed(2)}`
}

// Same derivation as ClubhouseReservationPanel in SocialCalendar.jsx (kept
// local rather than shared, matching this codebase's existing per-file
// helper convention) — the full "what happened" trail read straight off
// columns already on the row, not a separate log table. See Keith,
// 2026-09-23, Reservations/REQUIREMENTS.md 2.25.
function buildClubhouseAuditTrail(r, namesById) {
  const name = id => (id && namesById[id]) || (id ? 'Unknown' : 'System')
  const entries = []

  if (r.created_at) entries.push({ at: r.created_at, who: name(r.reserved_by), action: 'Submitted the booking' })
  if (r.terms_acknowledged_at) entries.push({ at: r.terms_acknowledged_at, who: name(r.reserved_by), action: 'Accepted the Clubhouse Lease Agreement / Rules & Regulations' })
  if (r.acknowledged_at) entries.push({ at: r.acknowledged_at, who: name(r.acknowledged_by), action: 'Acknowledged the booking — fee required' })
  if (r.escalated_at) entries.push({ at: r.escalated_at, who: name(r.escalated_by), action: 'Escalated to the Social Committee' })
  if (r.escalation_resolved_at) {
    entries.push({
      at: r.escalation_resolved_at,
      who: name(r.escalation_resolved_by),
      action: r.escalation_outcome === 'confirmed_private' ? 'Confirmed the escalation — this is private' : 'Dismissed the escalation — not private',
    })
  }
  if (r.late_notice_sent_at) entries.push({ at: r.late_notice_sent_at, who: 'System', action: 'Sent an overdue-payment notice (past the payment deadline, still unpaid)' })
  if (r.check_received_at) entries.push({ at: r.check_received_at, who: name(r.check_received_by), action: 'Marked the payment received' })
  if (r.cancelled_at) {
    entries.push({
      at: r.cancelled_at,
      who: name(r.cancelled_by),
      action: r.cancelled_by === r.reserved_by ? 'Cancelled the booking (self)' : 'Cancelled the booking',
      detail: r.cancellation_reason || null,
    })
  }
  if (r.refund_issued_at) entries.push({ at: r.refund_issued_at, who: name(r.refund_issued_by), action: 'Marked the cancellation refund issued' })
  if (r.post_event_reviewed_at) {
    entries.push({
      at: r.post_event_reviewed_at,
      who: name(r.post_event_reviewed_by),
      action: 'Recorded the post-event deposit review',
      detail: Number(r.post_event_fee_amount) > 0 ? `${money(r.post_event_fee_amount)} withheld — ${r.post_event_fee_reason}` : 'No fee withheld',
    })
  }
  if (r.deposit_refund_issued_at) entries.push({ at: r.deposit_refund_issued_at, who: name(r.deposit_refund_issued_by), action: 'Marked the deposit refund issued' })

  return entries.sort((a, b) => new Date(a.at) - new Date(b.at))
}

const STATUS_LABEL = {
  confirmed: { label: 'Confirmed', color: 'bg-green-100 text-green-700' },
  pending_rcp: { label: 'Awaiting RCP review', color: 'bg-amber-100 text-amber-700' },
  pending_payment: { label: 'Payment due', color: 'bg-orange-100 text-orange-700' },
  escalated: { label: 'Escalated to committee', color: 'bg-purple-100 text-purple-700' },
  cancelled: { label: 'Cancelled', color: 'bg-gray-200 text-gray-600' },
}

export default function ClubhouseReservationsPage() {
  const { user, isAdmin } = useAuth()
  const toast = useToast()
  // 'admin' (RCP, full queue) | 'user' (Social Committee, escalated-only) |
  // 'none' (no clubhouse access) | null (still checking)
  const [myRole, setMyRole] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('needs_action') // needs_action | all — RCP only
  const [expandedAudit, setExpandedAudit] = useState(() => new Set()) // row ids with the audit trail open

  useEffect(() => {
    if (!user) return
    if (isAdmin) { setMyRole('admin'); return } // global super admin acts as RCP
    supabase
      .from('app_access')
      .select('role')
      .eq('user_id', user.id)
      .eq('app_id', 'clubhouse')
      .maybeSingle()
      .then(({ data }) => setMyRole(data?.role || 'none'))
  }, [user, isAdmin])

  const isRCP = myRole === 'admin'
  const isCommittee = myRole === 'user'
  const eligible = isRCP || isCommittee

  const fetchRows = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('clubhouse_reservations')
      .select(`
        id, calendar_event_id, reserved_by, wants_main_clubhouse, wants_side_room, wants_tables_chairs,
        starts_at, ends_at, private_event_answer, fee_main, fee_side_room, fee_tables_chairs, fee_additional_hours, deposit_amount, total_due,
        payment_deadline_date, status, acknowledged_at, acknowledged_by, check_received_at, check_received_by,
        escalated_at, escalated_by, escalation_resolved_at, escalation_resolved_by, escalation_outcome,
        cancelled_at, cancelled_by, cancellation_reason, refund_issued_at, refund_issued_by, is_test, actual_title,
        post_event_reviewed_at, post_event_reviewed_by, post_event_fee_amount, post_event_fee_reason,
        deposit_refund_amount, deposit_refund_issued_at, deposit_refund_issued_by,
        guest_count, extra_tables_requested, extra_chairs_requested, wants_late_end, liability_insurance_confirmed,
        created_at, terms_acknowledged_at, late_notice_sent_at,
        calendar_events ( title )
      `)
      .order('starts_at', { ascending: true })
    if (error) {
      console.error('Failed to load clubhouse reservations', error)
      toast.error('Failed to load reservations')
      setLoading(false)
      return
    }

    // The audit trail needs a name for every actor a row can mention, not
    // just the requester — union every actor-id column across every row.
    const actorIds = [...new Set((data || []).flatMap(r => [
      r.reserved_by, r.acknowledged_by, r.check_received_by, r.escalated_by,
      r.escalation_resolved_by, r.cancelled_by, r.refund_issued_by,
      r.post_event_reviewed_by, r.deposit_refund_issued_by,
    ].filter(Boolean)))]
    let namesById = {}
    let plainNamesById = {}
    if (actorIds.length > 0) {
      const { data: people } = await supabase.from('profiles').select('id, names, surname, address').in('id', actorIds)
      namesById = Object.fromEntries((people || []).map(p => [p.id, { name: `${p.names} ${p.surname}`.trim(), address: p.address }]))
      plainNamesById = Object.fromEntries((people || []).map(p => [p.id, `${p.names ?? ''} ${p.surname ?? ''}`.trim() || 'Resident']))
    }

    setRows((data || []).map(r => ({
      ...r,
      requester: namesById[r.reserved_by] || { name: 'Unknown', address: '' },
      auditTrail: buildClubhouseAuditTrail(r, plainNamesById),
    })))
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { if (eligible) fetchRows() }, [eligible, fetchRows])

  const resourceLabel = r => [
    r.wants_main_clubhouse && 'Main Clubhouse',
    r.wants_side_room && 'Side Room',
    r.wants_tables_chairs && 'Tables & Chairs',
  ].filter(Boolean).join(' + ')

  // Post-event deposit check-in (Keith, 2026-09-18, Reservations/
  // REQUIREMENTS.md 2.21) — only relevant once a booking actually collected
  // a deposit (a 'no'-answer booking that was never escalated never did:
  // deposit_amount stays NULL) and was actually paid for, and only once the
  // event itself has passed.
  const needsPostEventReview = r =>
    r.status === 'confirmed' && !!r.check_received_at && Number(r.deposit_amount) > 0 &&
    !r.post_event_reviewed_at && new Date(r.ends_at) < new Date()

  const needsDepositRefund = r =>
    !!r.post_event_reviewed_at && Number(r.deposit_refund_amount) > 0 && !r.deposit_refund_issued_at

  // ── Actions ────────────────────────────────────────────────────────────
  const act = async (id, update, successMsg) => {
    const { error } = await supabase.from('clubhouse_reservations').update(update).eq('id', id)
    if (error) { console.error('Clubhouse reservation action failed', error); toast.error('Action failed'); return }
    toast.success(successMsg)
    fetchRows()
  }

  // A pending_rcp booking is always private/not-sure by definition, and
  // every clubhouse resource plus the security deposit is priced now (Keith:
  // "Scenario 5 does not exist, we have priced everything") — so there is no
  // longer a legitimate no-fee outcome here. There used to be an
  // "Acknowledge — no fee needed" action offered right alongside this one;
  // removed 2026-09-10 after RCP's test run used it on a private booking and
  // produced an incorrectly-confirmed $0 reservation. A dismissed escalation
  // (resolveEscalation below) still correctly confirms with no fee — that's
  // a *non*-private booking by the time it's dismissed, a different case.
  const acknowledgeFeeRequired = async row => {
    await act(row.id, { status: 'pending_payment', acknowledged_at: new Date().toISOString(), acknowledged_by: user.id },
      'Acknowledged — fee required')
    notifyResident(row.id) // fire-and-forget — the acknowledgment itself already succeeded
  }

  const markCheckReceived = async row => {
    await act(row.id, { status: 'confirmed', check_received_at: new Date().toISOString(), check_received_by: user.id },
      'Check marked received — confirmed')
    notifyResident(row.id) // fire-and-forget — sends the payment-received confirmation (2026-09-18)
  }

  // Fire-and-forget notifiers — a notification hiccup should never look like
  // a failed action to RCP, so none of these are awaited before the toast.
  const notifyCommittee = async (reservationId) => {
    try {
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-clubhouse-escalation`,
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
      console.error('notify-clubhouse-escalation call failed:', e)
    }
  }

  // Emails the resident once RCP has processed their request — approved with
  // a fee due (includes the check payee/address, per Keith 2026-09-03),
  // confirmed outright with no fee, confirmed because their check was marked
  // received, or (2026-09-18) flagged for committee review — and again once
  // that review resolves, one way or the other. The function itself no-ops
  // for any other status, so it's safe to call after any acknowledge/
  // resolve/check-received/escalate action.
  const notifyResident = async (reservationId) => {
    try {
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-clubhouse-resident-status`,
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
      console.error('notify-clubhouse-resident-status call failed:', e)
    }
  }

  // Fires after ANY cancellation (RCP's own cancelReservation below, or a
  // resident's self-cancel in SocialCalendar.jsx), and again once a refund
  // on a paid cancellation is marked issued (markRefundIssued below) — the
  // Edge Function itself figures out who to email and what to say, based on
  // who cancelled it, whether a fee had already been collected, and now
  // eventType ('cancelled', the default, vs 'refund_issued'). See
  // notify-clubhouse-cancellation/index.ts and Reservations/REQUIREMENTS.md
  // 2.9 and 2.20.
  const notifyCancellation = async (reservationId, eventType) => {
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
          body: JSON.stringify(eventType ? { reservationId, eventType } : { reservationId }),
        }
      )
    } catch (e) {
      console.error('notify-clubhouse-cancellation call failed:', e)
    }
  }

  const escalate = async row => {
    await act(row.id, { status: 'escalated', escalated_at: new Date().toISOString(), escalated_by: user.id },
      'Escalated to the social committee')
    notifyCommittee(row.id) // fire-and-forget — the escalation itself already succeeded
    // Without this, a resident whose already-confirmed booking gets escalated
    // has no way to know anything changed — they'd only find out once the
    // committee resolves it (or not at all, if they never re-check). Added
    // 2026-09-18, same notifyResident() used everywhere else; the Edge
    // Function now has a status='escalated' branch for this.
    notifyResident(row.id)
  }

  const resolveEscalation = async (row, outcome) => {
    if (outcome === 'dismissed') {
      await act(row.id, {
        status: 'confirmed', escalation_resolved_at: new Date().toISOString(),
        escalation_resolved_by: user.id, escalation_outcome: 'dismissed',
      }, 'Escalation dismissed — booking stands')
      notifyResident(row.id)
      return
    }
    // confirmed_private: now owes a fee that wasn't snapshotted at submission (it was a 'no' answer)
    const { data: settings } = await supabase
      .from('community_settings')
      .select('clubhouse_main_fee, clubhouse_side_room_fee, clubhouse_tables_chairs_fee, clubhouse_additional_hour_fee, clubhouse_security_deposit, clubhouse_payment_deadline_days')
      .eq('id', 1)
      .maybeSingle()
    // Same 6-hours-included / pay-for-extra math as a fresh submission
    // (SocialCalendar.jsx) — a 'no' answer never went through that at
    // booking time, so it's computed here from the row's own start/end.
    const extraHours = Math.max(0, Math.ceil((new Date(row.ends_at) - new Date(row.starts_at)) / 3600000 - 6))
    // A 'no'-answer booking was never masked at submission — calendar_events
    // .title/.description hold the resident's real event details, visible to
    // every resident on the shared calendar (only a 'yes'/'not_sure' answer
    // gets the "Private Event — Name" treatment at submission time, in
    // SocialCalendar.jsx). Now that the committee has determined this one IS
    // private, mask it retroactively the same way — found by Keith
    // 2026-09-18, a confirmed-private test booking was still fully visible
    // to everyone. Capture the real title into actual_title first (same
    // field a private/not-sure booking uses from birth) so the resident
    // still sees it — on their own calendar (SocialCalendar.jsx's
    // displayTitle(), extended alongside this fix) and in this escalation-
    // resolved email — and so does RCP/committee, via "Ref: {actual_title}"
    // above. Doesn't touch private_event_answer itself — that stays the
    // resident's original 'no' answer, the historical record of what they
    // actually submitted; escalation_outcome is what now marks it private.
    const realTitle = row.calendar_events?.title || null
    const displayName = row.requester?.name || 'A resident'
    await supabase.from('calendar_events').update({
      title: `Private Event — ${displayName}`,
      description: '',
    }).eq('id', row.calendar_event_id)
    await act(row.id, {
      status: 'pending_payment',
      escalation_resolved_at: new Date().toISOString(), escalation_resolved_by: user.id, escalation_outcome: 'confirmed_private',
      actual_title: realTitle,
      fee_main: row.wants_main_clubhouse ? settings?.clubhouse_main_fee : null,
      fee_side_room: row.wants_side_room ? settings?.clubhouse_side_room_fee : null,
      fee_tables_chairs: row.wants_tables_chairs ? settings?.clubhouse_tables_chairs_fee : null,
      fee_additional_hours: extraHours > 0 && settings?.clubhouse_additional_hour_fee != null ? extraHours * Number(settings.clubhouse_additional_hour_fee) : null,
      deposit_amount: settings?.clubhouse_security_deposit,
      payment_deadline_days_snapshot: settings?.clubhouse_payment_deadline_days,
    }, 'Escalation confirmed — fee now due')
    notifyResident(row.id)
  }

  // RCP only ever cancels a reservation BEFORE a fee has been received (see
  // the Cancel button's guard below, and Reservations/REQUIREMENTS.md 2.9) —
  // once a check is in hand, cancelling is the resident's own action (via
  // the calendar), which automatically starts the refund flow instead.
  const cancelReservation = async row => {
    const reason = window.prompt('Reason for cancelling (shown to the resident)?')
    if (reason === null) return
    // Cancelling the reservation record alone leaves the booking sitting on
    // the shared calendar looking exactly as before — residents (and RCP)
    // would still see it as a live event. Pull it off the calendar the same
    // way a resident's own "Remove event" does: flip removed=true, not a
    // hard delete — clubhouse_reservations.calendar_event_id is ON DELETE
    // CASCADE, so deleting the calendar_events row would destroy this
    // reservation (and its cancellation/refund history) along with it.
    await supabase.from('calendar_events').update({ removed: true }).eq('id', row.calendar_event_id)
    await act(row.id, {
      status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: user.id, cancellation_reason: reason || null,
      // Same snapshot handleRemove takes on the resident's own self-cancel
      // path (SocialCalendar.jsx, 2026-09-18) — the resident's "My Events"
      // view reads this back afterward without ever querying calendar_events
      // again, so it needs to be captured here too for an RCP-cancelled
      // booking, not just a self-cancelled one.
      actual_title: row.actual_title || row.calendar_events?.title || null,
    }, 'Reservation cancelled')
    notifyCancellation(row.id) // fire-and-forget — emails the resident with the reason
  }

  const markRefundIssued = async row => {
    await act(row.id, { refund_issued_at: new Date().toISOString(), refund_issued_by: user.id }, 'Refund marked issued')
    notifyCancellation(row.id, 'refund_issued') // fire-and-forget — lets the resident know it's sent
  }

  // Fire-and-forget — tells the resident what RCP found on inspection (and
  // again once the refund is actually sent). See notify-clubhouse-deposit/
  // index.ts and Reservations/REQUIREMENTS.md 2.21.
  const notifyDeposit = async (reservationId, eventType) => {
    try {
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-clubhouse-deposit`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify(eventType ? { reservationId, eventType } : { reservationId }),
        }
      )
    } catch (e) {
      console.error('notify-clubhouse-deposit call failed:', e)
    }
  }

  // Step 1 of the post-event deposit check-in: RCP records what they found
  // when they inspected the room(s) after the event. window.prompt matches
  // the existing style used for cancelReservation's reason prompt — no
  // dedicated modal exists elsewhere in this page, so this stays consistent
  // rather than introducing a one-off form component for a two-field input.
  const recordPostEventReview = async row => {
    const feeInput = window.prompt(`Fee to withhold from the ${money(row.deposit_amount)} security deposit for cleaning/corrective work? Enter 0 if none.`)
    if (feeInput === null) return
    const fee = Number(feeInput)
    if (Number.isNaN(fee) || fee < 0) { toast.error('Enter a valid amount — 0 or more'); return }
    let reason = 'n/a'
    if (fee > 0) {
      const reasonInput = window.prompt('Reason for the fee (shown to the resident)?')
      if (reasonInput === null) return
      if (!reasonInput.trim()) { toast.error('A reason is required when a fee is applied'); return }
      reason = reasonInput.trim()
    }
    await act(row.id, {
      post_event_reviewed_at: new Date().toISOString(), post_event_reviewed_by: user.id,
      post_event_fee_amount: fee, post_event_fee_reason: reason,
    }, 'Post-event review recorded')
    notifyDeposit(row.id) // fire-and-forget — tells the resident what was found and what refund (if any) is coming
  }

  // Step 2: RCP has actually written and mailed the refund check. Only ever
  // offered when needsDepositRefund(row) is true, i.e. there's something
  // left to refund — see the button's guard below.
  const markDepositRefundIssued = async row => {
    await act(row.id, { deposit_refund_issued_at: new Date().toISOString(), deposit_refund_issued_by: user.id }, 'Deposit refund marked issued')
    notifyDeposit(row.id, 'refund_issued') // fire-and-forget — lets the resident know it's sent
  }

  if (myRole === null) return <LoadingSpinner label="Checking access…" />

  if (!eligible) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-4">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="font-display text-2xl text-brand-800 mb-2">Authorisation Required</h2>
        <p className="text-brand-500 text-sm max-w-sm">You don&apos;t have access to clubhouse reservations. Please contact your community administrator.</p>
      </div>
    )
  }

  // Committee members only ever have escalated rows (+ their own bookings)
  // in `rows` at all, via RLS — no client-side filtering needed for them.
  const visibleRows = isCommittee ? rows : rows.filter(r => filter === 'all' || ['pending_rcp', 'pending_payment', 'escalated'].includes(r.status) ||
    (r.status === 'cancelled' && r.check_received_at && !r.refund_issued_at) ||
    needsPostEventReview(r) || needsDepositRefund(r))

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Link to="/apps/calendar" className="text-brand-400 hover:text-brand-600 text-sm">← Calendar</Link>
      <h1 className="text-2xl font-bold text-gray-900 mt-2">Clubhouse Reservations</h1>
      <p className="text-gray-500 text-sm mt-1">
        {isCommittee
          ? 'Bookings RCP believes may be private but weren\'t marked as such. Confirm or dismiss each one.'
          : 'Acknowledge requests, confirm payment received, escalate suspected-private bookings, and process cancellations/refunds.'}
      </p>

      {isRCP && (
        <div className="flex gap-2 my-4">
          <button onClick={() => setFilter('needs_action')} className={`px-4 py-2 rounded-lg text-sm font-medium ${filter === 'needs_action' ? 'bg-brand-700 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>Needs action</button>
          <button onClick={() => setFilter('all')} className={`px-4 py-2 rounded-lg text-sm font-medium ${filter === 'all' ? 'bg-brand-700 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>All</button>
        </div>
      )}

      {loading ? (
        <LoadingSpinner label="Loading reservations…" />
      ) : visibleRows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-400 text-sm">Nothing here right now.</div>
      ) : (
        <div className="space-y-3">
          {visibleRows.map(r => {
            const st = STATUS_LABEL[r.status] || { label: r.status, color: 'bg-gray-100 text-gray-600' }
            const needsRefund = r.status === 'cancelled' && r.check_received_at && !r.refund_issued_at
            return (
              <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div>
                    <div className="font-semibold text-gray-900">
                      {r.calendar_events?.title || resourceLabel(r)}
                      {r.is_test && <span className="ml-2 text-xs font-normal text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">TEST</span>}
                    </div>
                    <div className="text-sm text-gray-500">{formatDateTime(r.starts_at, r.ends_at)} · {resourceLabel(r)}</div>
                    <div className="text-sm text-gray-500">{r.requester.name}{r.requester.address ? ` · ${r.requester.address}` : ''} · Private: {r.private_event_answer}</div>
                    {/* The resident's own reference title for a masked booking (Keith,
                        2026-09-05) — the calendar itself only ever shows "Private Event
                        — Name", so this is the only place RCP/committee can see what a
                        resident actually called it (e.g. a test-plan "Test scenario 1"). */}
                    {r.actual_title && <div className="text-sm text-gray-500 italic">Ref: {r.actual_title}</div>}
                    {(r.guest_count != null || r.extra_tables_requested > 0 || r.extra_chairs_requested > 0) && (
                      <div className="text-sm text-gray-500">
                        {[
                          r.guest_count != null ? `${r.guest_count} guests` : null,
                          r.extra_tables_requested > 0 ? `${r.extra_tables_requested} extra table${r.extra_tables_requested === 1 ? '' : 's'}` : null,
                          r.extra_chairs_requested > 0 ? `${r.extra_chairs_requested} extra chair${r.extra_chairs_requested === 1 ? '' : 's'}` : null,
                        ].filter(Boolean).join(' · ')}
                        {r.liability_insurance_confirmed && ' · Insurance confirmed'}
                      </div>
                    )}
                    {r.total_due > 0 && <div className="text-sm text-gray-700 mt-1">Due: {money(r.total_due)}{r.fee_additional_hours ? ` (incl. ${money(r.fee_additional_hours)} additional-hour fee)` : ''}{r.payment_deadline_date ? ` by ${r.payment_deadline_date}` : ''}</div>}
                    {/* Keith, 2026-09-16: the resident checked "I need to stay later
                        than the vacate time" — this is a flag for RCP to take to the
                        Board offline (per the signed Clubhouse Lease Agreement),
                        not a separate blocking status; the normal acknowledge/fee
                        flow below proceeds regardless. */}
                    {r.wants_late_end && (
                      <div className="text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1 inline-block">
                        ⚠ Requested to stay past the vacate time — check with the Board
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${st.color}`}>{st.label}</span>
                    {needsPostEventReview(r) && (
                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-teal-100 text-teal-700">Deposit review due</span>
                    )}
                    {needsDepositRefund(r) && (
                      <span className="text-xs font-medium px-2 py-1 rounded-full bg-orange-100 text-orange-700">Deposit refund pending</span>
                    )}
                  </div>
                </div>

                {r.post_event_reviewed_at && (
                  <div className="text-sm text-gray-500 mt-1">
                    Deposit review: {Number(r.post_event_fee_amount) > 0 ? `${money(r.post_event_fee_amount)} withheld (${r.post_event_fee_reason})` : 'No fee applied'} — Refund {money(r.deposit_refund_amount)}{r.deposit_refund_issued_at ? ' — issued' : Number(r.deposit_refund_amount) > 0 ? ' — pending' : ''}
                  </div>
                )}

                {/* Audit trail (Keith, 2026-09-23) — same derived-from-existing-
                    columns trail as the resident's own on-screen panel in
                    SocialCalendar.jsx, surfaced here too since this queue is
                    where RCP/committee actually work day to day. */}
                {r.auditTrail?.length > 0 && (
                  <div className="mt-1">
                    <button
                      type="button"
                      onClick={() => setExpandedAudit(prev => {
                        const next = new Set(prev)
                        next.has(r.id) ? next.delete(r.id) : next.add(r.id)
                        return next
                      })}
                      className="text-xs font-medium text-gray-500 hover:text-gray-700"
                    >
                      {expandedAudit.has(r.id) ? 'Hide' : 'Show'} audit trail ({r.auditTrail.length}) {expandedAudit.has(r.id) ? '▲' : '▼'}
                    </button>
                    {expandedAudit.has(r.id) && (
                      <ol className="mt-2 space-y-2 border-l-2 border-gray-200 pl-3">
                        {r.auditTrail.map((e, i) => (
                          <li key={i} className="text-xs text-gray-600">
                            <div className="text-gray-400">{new Date(e.at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                            <div><span className="font-medium text-gray-800">{e.who}</span> — {e.action}</div>
                            {e.detail && <div className="text-gray-500 italic">{e.detail}</div>}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}

                <div className="flex gap-2 flex-wrap mt-3">
                  {/* RCP-only actions — a committee member (role='user') never sees
                      these, whether or not RLS would technically let them touch
                      the row (it only would for an escalated one anyway). */}
                  {isRCP && r.status === 'pending_rcp' && (
                    <button onClick={() => acknowledgeFeeRequired(r)} className="text-xs font-medium bg-brand-700 text-white px-3 py-1.5 rounded-lg hover:bg-brand-800">Acknowledge — fee required</button>
                  )}
                  {isRCP && r.status === 'pending_payment' && (
                    <button onClick={() => markCheckReceived(r)} className="text-xs font-medium bg-brand-700 text-white px-3 py-1.5 rounded-lg hover:bg-brand-800">Mark check received</button>
                  )}
                  {isRCP && r.status === 'confirmed' && r.private_event_answer === 'no' && (
                    <button onClick={() => escalate(r)} className="text-xs font-medium border border-purple-300 text-purple-700 px-3 py-1.5 rounded-lg hover:bg-purple-50">Escalate — I believe this is private</button>
                  )}
                  {/* The one action set the Social Committee gets, RCP too */}
                  {r.status === 'escalated' && (isRCP || isCommittee) && (
                    <>
                      <button onClick={() => resolveEscalation(r, 'confirmed_private')} className="text-xs font-medium bg-purple-700 text-white px-3 py-1.5 rounded-lg hover:bg-purple-800">Confirm — this is private</button>
                      <button onClick={() => resolveEscalation(r, 'dismissed')} className="text-xs font-medium border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50">Dismiss — not private</button>
                    </>
                  )}
                  {isRCP && needsRefund && (
                    <button onClick={() => markRefundIssued(r)} className="text-xs font-medium bg-orange-600 text-white px-3 py-1.5 rounded-lg hover:bg-orange-700">Mark refund issued</button>
                  )}
                  {isRCP && needsPostEventReview(r) && (
                    <button onClick={() => recordPostEventReview(r)} className="text-xs font-medium bg-teal-700 text-white px-3 py-1.5 rounded-lg hover:bg-teal-800">Record post-event deposit review</button>
                  )}
                  {isRCP && needsDepositRefund(r) && (
                    <button onClick={() => markDepositRefundIssued(r)} className="text-xs font-medium bg-orange-600 text-white px-3 py-1.5 rounded-lg hover:bg-orange-700">Mark deposit refund issued</button>
                  )}
                  {isRCP && r.status !== 'cancelled' && !r.check_received_at && (
                    <button onClick={() => cancelReservation(r)} className="text-xs font-medium text-red-600 hover:text-red-700 px-3 py-1.5">Cancel</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
