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
// Both RCP and the social committee share the same 'clubhouse' admin role —
// the distinction ("committee only handles escalations") is enforced here by
// which filter someone uses, not by a second role. See the migration's header
// comment for the reasoning.

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
  const [eligible, setEligible] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('needs_action') // needs_action | all

  useEffect(() => {
    if (!user) return
    supabase
      .from('app_access')
      .select('app_id, role')
      .eq('user_id', user.id)
      .eq('app_id', 'clubhouse')
      .eq('role', 'admin')
      .maybeSingle()
      .then(({ data }) => setEligible(isAdmin || !!data))
  }, [user, isAdmin])

  const fetchRows = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('clubhouse_reservations')
      .select(`
        id, calendar_event_id, reserved_by, wants_main_clubhouse, wants_side_room, wants_tables_chairs,
        starts_at, ends_at, private_event_answer, fee_main, fee_side_room, fee_tables_chairs, deposit_amount, total_due,
        payment_deadline_date, status, acknowledged_at, check_received_at, escalated_at, escalation_outcome,
        cancelled_at, refund_issued_at, is_test,
        calendar_events ( title )
      `)
      .order('starts_at', { ascending: true })
    if (error) {
      console.error('Failed to load clubhouse reservations', error)
      toast.error('Failed to load reservations')
      setLoading(false)
      return
    }

    const ids = [...new Set((data || []).map(r => r.reserved_by))]
    let namesById = {}
    if (ids.length > 0) {
      const { data: people } = await supabase.from('profiles').select('id, names, surname, address').in('id', ids)
      namesById = Object.fromEntries((people || []).map(p => [p.id, { name: `${p.names} ${p.surname}`.trim(), address: p.address }]))
    }

    setRows((data || []).map(r => ({ ...r, requester: namesById[r.reserved_by] || { name: 'Unknown', address: '' } })))
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { if (eligible) fetchRows() }, [eligible, fetchRows])

  const resourceLabel = r => [
    r.wants_main_clubhouse && 'Main Clubhouse',
    r.wants_side_room && 'Side Room',
    r.wants_tables_chairs && 'Tables & Chairs',
  ].filter(Boolean).join(' + ')

  // ── Actions ────────────────────────────────────────────────────────────
  const act = async (id, update, successMsg) => {
    const { error } = await supabase.from('clubhouse_reservations').update(update).eq('id', id)
    if (error) { console.error('Clubhouse reservation action failed', error); toast.error('Action failed'); return }
    toast.success(successMsg)
    fetchRows()
  }

  const acknowledgeFeeRequired = row =>
    act(row.id, { status: 'pending_payment', acknowledged_at: new Date().toISOString(), acknowledged_by: user.id },
      'Acknowledged — fee required')

  const acknowledgeNoFee = row =>
    act(row.id, {
      status: 'confirmed', acknowledged_at: new Date().toISOString(), acknowledged_by: user.id,
      fee_main: null, fee_side_room: null, fee_tables_chairs: null, deposit_amount: null,
    }, 'Acknowledged — no fee needed, confirmed')

  const markCheckReceived = row =>
    act(row.id, { status: 'confirmed', check_received_at: new Date().toISOString(), check_received_by: user.id },
      'Check marked received — confirmed')

  const escalate = row =>
    act(row.id, { status: 'escalated', escalated_at: new Date().toISOString(), escalated_by: user.id },
      'Escalated to the social committee')

  const resolveEscalation = async (row, outcome) => {
    if (outcome === 'dismissed') {
      return act(row.id, {
        status: 'confirmed', escalation_resolved_at: new Date().toISOString(),
        escalation_resolved_by: user.id, escalation_outcome: 'dismissed',
      }, 'Escalation dismissed — booking stands')
    }
    // confirmed_private: now owes a fee that wasn't snapshotted at submission (it was a 'no' answer)
    const { data: settings } = await supabase
      .from('community_settings')
      .select('clubhouse_main_fee, clubhouse_side_room_fee, clubhouse_tables_chairs_fee, clubhouse_security_deposit, clubhouse_payment_deadline_days')
      .eq('id', 1)
      .maybeSingle()
    await act(row.id, {
      status: 'pending_payment',
      escalation_resolved_at: new Date().toISOString(), escalation_resolved_by: user.id, escalation_outcome: 'confirmed_private',
      fee_main: row.wants_main_clubhouse ? settings?.clubhouse_main_fee : null,
      fee_side_room: row.wants_side_room ? settings?.clubhouse_side_room_fee : null,
      fee_tables_chairs: row.wants_tables_chairs ? settings?.clubhouse_tables_chairs_fee : null,
      deposit_amount: settings?.clubhouse_security_deposit,
      payment_deadline_days_snapshot: settings?.clubhouse_payment_deadline_days,
    }, 'Escalation confirmed — fee now due')
  }

  const cancelReservation = row => {
    const reason = window.prompt('Reason for cancelling (shown to the resident)?')
    if (reason === null) return
    act(row.id, { status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: user.id, cancellation_reason: reason || null },
      'Reservation cancelled')
  }

  const markRefundIssued = row =>
    act(row.id, { refund_issued_at: new Date().toISOString(), refund_issued_by: user.id }, 'Refund marked issued')

  if (eligible === null) return <LoadingSpinner label="Checking access…" />

  if (!eligible) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-4">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="font-display text-2xl text-brand-800 mb-2">Authorisation Required</h2>
        <p className="text-brand-500 text-sm max-w-sm">You don&apos;t have access to clubhouse reservations. Please contact your community administrator.</p>
      </div>
    )
  }

  const visibleRows = rows.filter(r => filter === 'all' || ['pending_rcp', 'pending_payment', 'escalated'].includes(r.status) ||
    (r.status === 'cancelled' && r.check_received_at && !r.refund_issued_at))

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Link to="/apps/calendar" className="text-brand-400 hover:text-brand-600 text-sm">← Calendar</Link>
      <h1 className="text-2xl font-bold text-gray-900 mt-2">Clubhouse Reservations</h1>
      <p className="text-gray-500 text-sm mt-1">Acknowledge requests, confirm payment received, escalate suspected-private bookings, and process cancellations/refunds.</p>

      <div className="flex gap-2 my-4">
        <button onClick={() => setFilter('needs_action')} className={`px-4 py-2 rounded-lg text-sm font-medium ${filter === 'needs_action' ? 'bg-brand-700 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>Needs action</button>
        <button onClick={() => setFilter('all')} className={`px-4 py-2 rounded-lg text-sm font-medium ${filter === 'all' ? 'bg-brand-700 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>All</button>
      </div>

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
                    {r.total_due > 0 && <div className="text-sm text-gray-700 mt-1">Due: {money(r.total_due)}{r.payment_deadline_date ? ` by ${r.payment_deadline_date}` : ''}</div>}
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${st.color}`}>{st.label}</span>
                </div>

                <div className="flex gap-2 flex-wrap mt-3">
                  {r.status === 'pending_rcp' && (
                    <>
                      <button onClick={() => acknowledgeFeeRequired(r)} className="text-xs font-medium bg-brand-700 text-white px-3 py-1.5 rounded-lg hover:bg-brand-800">Acknowledge — fee required</button>
                      <button onClick={() => acknowledgeNoFee(r)} className="text-xs font-medium border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50">Acknowledge — no fee needed</button>
                    </>
                  )}
                  {r.status === 'pending_payment' && (
                    <button onClick={() => markCheckReceived(r)} className="text-xs font-medium bg-brand-700 text-white px-3 py-1.5 rounded-lg hover:bg-brand-800">Mark check received</button>
                  )}
                  {r.status === 'confirmed' && r.private_event_answer === 'no' && (
                    <button onClick={() => escalate(r)} className="text-xs font-medium border border-purple-300 text-purple-700 px-3 py-1.5 rounded-lg hover:bg-purple-50">Escalate — I believe this is private</button>
                  )}
                  {r.status === 'escalated' && (
                    <>
                      <button onClick={() => resolveEscalation(r, 'confirmed_private')} className="text-xs font-medium bg-purple-700 text-white px-3 py-1.5 rounded-lg hover:bg-purple-800">Confirm — this is private</button>
                      <button onClick={() => resolveEscalation(r, 'dismissed')} className="text-xs font-medium border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50">Dismiss — not private</button>
                    </>
                  )}
                  {needsRefund && (
                    <button onClick={() => markRefundIssued(r)} className="text-xs font-medium bg-orange-600 text-white px-3 py-1.5 rounded-lg hover:bg-orange-700">Mark refund issued</button>
                  )}
                  {r.status !== 'cancelled' && (
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
