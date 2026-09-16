// notify-clubhouse-rcp
// Called (fire-and-forget, from the client, same pattern as notify-comment /
// notify-clubhouse-escalation) right after a resident submits a clubhouse
// booking that needs RCP's attention (private or "not sure" — lands in
// status='pending_rcp'). Queues a notification for everyone with clubhouse
// app_access role='admin'. Answers Keith's question, 2026-09-03: "notify RCP
// that there's something in their queue."
//
// As of the notification-queue rework, this no longer emails immediately —
// it inserts into `pending_notifications`, which `send-daily-notifications`
// flushes once a day into one combined email per reviewer. See
// supabase/functions/_shared/notify-queue.ts for why.
//
// This is the "new booking" half of RCP's queue. The other half — a
// cancelled/refund-pending booking — doesn't need a separate trigger here:
// today only RCP themselves can cancel a booking (see
// ClubhouseReservationsPage.jsx), so they already know when that happens.
// The "subject to cancellation" case (payment overdue) already queues via
// clubhouse-payment-check. If a resident-initiated cancellation request
// gets built later, extend this the same way notify-clubhouse-escalation
// does for escalations.
//
// Deploy with: supabase functions deploy notify-clubhouse-rcp --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { enqueueNotifications } from '../_shared/notify-queue.ts'
import { buildBookingDetailsTable, buildSignatureBlock } from '../_shared/clubhouse-form.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SITE_URL = 'https://vintageathamilton.com'

function formatDateTime(startsAt: string, endsAt: string): string {
  const s = new Date(startsAt)
  const e = new Date(endsAt)
  const dateStr = s.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const fmtTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${dateStr} · ${fmtTime(s)}–${fmtTime(e)}`
}

function formatDateOnly(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function privateAnswerLabel(answer: string): string {
  return answer === 'yes' ? 'Yes' : answer === 'not_sure' ? 'Not sure' : 'No'
}

// wantsLateEnd, 2026-09-16: resident is asking to stay past the board-editable
// vacate time — per the signed Clubhouse Lease Agreement that needs advance
// written Board approval, so it's called out here for RCP to follow up on;
// it doesn't change the normal acknowledge/fee flow below.
function buildNewBookingFragment(opts: {
  wantsLateEnd: boolean
  formTableHtml: string
  signatureHtml: string
}): string {
  const { wantsLateEnd, formTableHtml, signatureHtml } = opts
  return `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#444;">
      A resident has requested this booking and marked it private (or wasn't sure). Please
      acknowledge it in the portal so the fee and payment deadline are set.
    </p>
    ${formTableHtml}
    ${wantsLateEnd ? `<p style="margin:10px 0 0;font-size:13px;line-height:1.5;color:#8a5a00;background:#FBF3E4;border-radius:6px;padding:10px 12px;">⚠ Resident asked to stay past the standard vacate time — please check with the Board.</p>` : ''}
    ${signatureHtml}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { reservationId } = await req.json()
    if (!reservationId) throw new Error('reservationId is required')

    const { data: reservation, error: resErr } = await supabaseAdmin
      .from('clubhouse_reservations')
      .select('calendar_event_id, reserved_by, wants_main_clubhouse, wants_side_room, wants_tables_chairs, starts_at, ends_at, status, private_event_answer, guest_count, extra_tables_requested, extra_chairs_requested, wants_late_end, liability_insurance_confirmed, terms_acknowledged_at, fee_main, fee_side_room, fee_tables_chairs, fee_additional_hours, deposit_amount, total_due')
      .eq('id', reservationId)
      .maybeSingle()
    if (resErr) throw resErr
    if (!reservation) throw new Error('Reservation not found')
    if (reservation.status !== 'pending_rcp') {
      return new Response(JSON.stringify({ success: true, queued: 0, reason: 'not_pending_rcp' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: rcpAccess, error: rcpErr } = await supabaseAdmin
      .from('app_access')
      .select('user_id')
      .eq('app_id', 'clubhouse')
      .eq('role', 'admin')
    if (rcpErr) throw rcpErr
    const rcpIds = (rcpAccess || []).map(r => r.user_id)

    if (rcpIds.length === 0) {
      console.log('No RCP reviewers have clubhouse access yet, skipping notification')
      return new Response(JSON.stringify({ success: true, queued: 0, reason: 'no_rcp' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const [{ data: event }, { data: resident }, { data: rcpProfiles }] = await Promise.all([
      supabaseAdmin.from('calendar_events').select('title').eq('id', reservation.calendar_event_id).maybeSingle(),
      supabaseAdmin.from('profiles').select('names, surname').eq('id', reservation.reserved_by).maybeSingle(),
      supabaseAdmin.from('profiles').select('id, emails').in('id', rcpIds),
    ])

    const eventTitle = event?.title || '(untitled reservation)'
    const residentName = resident ? `${resident.names ?? ''} ${resident.surname ?? ''}`.trim() || 'Resident' : 'Resident'
    const rcpEmails: string[] = (rcpProfiles || []).flatMap(p => p.emails || [])

    if (rcpEmails.length === 0) {
      return new Response(JSON.stringify({ success: true, queued: 0, reason: 'no_rcp_email' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const formTableHtml = buildBookingDetailsTable({
      residentName,
      when: formatDateTime(reservation.starts_at, reservation.ends_at),
      wantsMainClubhouse: !!reservation.wants_main_clubhouse,
      wantsSideRoom: !!reservation.wants_side_room,
      extraTables: reservation.extra_tables_requested || 0,
      extraChairs: reservation.extra_chairs_requested || 0,
      privateAnswerLabel: privateAnswerLabel(reservation.private_event_answer),
      guestCount: reservation.guest_count,
      wantsLateEnd: !!reservation.wants_late_end,
      insuranceConfirmed: !!reservation.liability_insurance_confirmed,
      feeMain: reservation.fee_main,
      feeSideRoom: reservation.fee_side_room,
      feeTablesChairs: reservation.fee_tables_chairs,
      feeAdditionalHours: reservation.fee_additional_hours,
      deposit: reservation.deposit_amount,
      totalDue: reservation.total_due,
    })

    const signatureHtml = buildSignatureBlock({
      residentName,
      residentSignedAt: reservation.terms_acknowledged_at ? formatDateOnly(reservation.terms_acknowledged_at) : null,
      rcpName: null,
      rcpSignedAt: null,
      rulesUrl: `${SITE_URL}/clubhouse-rules`,
    })

    const bodyHtml = buildNewBookingFragment({
      wantsLateEnd: !!reservation.wants_late_end,
      formTableHtml,
      signatureHtml,
    })

    const { inserted } = await enqueueNotifications(
      supabaseAdmin,
      rcpEmails.map((email) => ({
        recipientEmail: email,
        category: 'clubhouse_rcp' as const,
        subjectLine: `New clubhouse booking needs review — ${eventTitle}`,
        bodyHtml,
        linkUrl: `${SITE_URL}/admin/reservations`,
      }))
    )

    return new Response(JSON.stringify({ success: true, queued: inserted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('notify-clubhouse-rcp error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
