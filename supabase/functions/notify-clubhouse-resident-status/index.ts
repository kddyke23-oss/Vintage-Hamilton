// notify-clubhouse-resident-status
// Called (fire-and-forget, from the client, same pattern as notify-comment /
// notify-clubhouse-escalation / notify-clubhouse-rcp) right after RCP
// processes a booking request — acknowledging it (with or without a fee) or
// resolving an escalation. Answers Keith's ask, 2026-09-03: a confirmation
// to the resident, including the check payee/mailing address when a fee is
// actually due. The on-screen counterpart (same information, shown right on
// the event) is ClubhouseReservationPanel in SocialCalendar.jsx.
//
// Only fires for the outcomes RCP's acknowledge/resolve/check-received/
// escalate actions produce:
//   status = 'escalated'                                — flagged for committee review (2026-09-18)
//   status = 'pending_payment'                          — fee now due, needs the payment instructions
//     (escalation_outcome = 'confirmed_private' means it got here via the
//     committee's review rather than RCP's ordinary acknowledge — 2026-09-18)
//   status = 'confirmed', check_received_at is null      — no fee required, booking just stands
//     (escalation_outcome = 'dismissed' means the committee's review is what
//     confirmed it — 2026-09-18)
//   status = 'confirmed', check_received_at is set        — payment received (2026-09-18), booking confirmed
// Anything else (pending_rcp, cancelled) is a no-op here — those have their
// own notifications (notify-clubhouse-rcp, notify-clubhouse-cancellation) or
// don't need a resident email. The Social Committee's OWN notification for a
// new escalation is separate (notify-clubhouse-escalation) — this one is
// always about telling the *resident* what's happening to their booking.
//
// As of the notification-queue rework, this no longer emails immediately —
// it inserts into `pending_notifications`, which `send-daily-notifications`
// flushes once a day into one combined email per resident. See
// supabase/functions/_shared/notify-queue.ts for why.
//
// Deploy with: supabase functions deploy notify-clubhouse-resident-status --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { enqueueNotifications } from '../_shared/notify-queue.ts'
import { buildBookingDetailsTable, buildSignatureBlock } from '../_shared/clubhouse-form.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SITE_URL = 'https://vintageathamilton.com'

function privateAnswerLabel(answer: string | null): string {
  return answer === 'yes' ? 'Yes' : answer === 'not_sure' ? 'Not sure' : 'No'
}

function formatDateTime(startsAt: string, endsAt: string): string {
  const s = new Date(startsAt)
  const e = new Date(endsAt)
  const dateStr = s.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const fmtTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${dateStr} · ${fmtTime(s)}–${fmtTime(e)}`
}

function formatDeadline(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

// For a real timestamptz column, NOT a date-only one — formatDeadline()'s
// dateStr + 'T00:00:00' trick assumes a bare 'YYYY-MM-DD' value; fed a full
// UTC timestamp's date slice instead, it silently re-anchors that slice to
// local midnight and can print the wrong calendar day once the UTC date has
// already rolled over. Takes the full ISO string and lets it resolve in the
// server's own locale/timezone instead.
function formatDateOnly(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function buildStatusFragment(opts: {
  status: 'escalated' | 'pending_payment' | 'confirmed'
  escalationOutcome: 'confirmed_private' | 'dismissed' | null
  paymentReceived: boolean
  formTableHtml: string
  deadline: string
  payableTo: string | null
  mailingAddress: string | null
  signatureHtml: string
}): { subjectLine: string; bodyHtml: string } {
  const { status, escalationOutcome, paymentReceived, formTableHtml, deadline, payableTo, mailingAddress, signatureHtml } = opts

  const deadlineRow = status === 'pending_payment' && deadline
    ? `<p style="margin:8px 0 0;font-size:13px;color:#1A3F5C;"><strong>Due by ${deadline}</strong></p>`
    : ''

  const paymentInstructions = status === 'pending_payment'
    ? (payableTo || mailingAddress
        ? `<table width="100%" cellpadding="0" cellspacing="0" style="background:#FBF3E4;border-radius:6px;padding:12px;margin:8px 0 0;">
             <tr><td style="padding:8px 12px;font-size:13px;line-height:1.6;color:#5C4419;">
               ${payableTo ? `Make your check payable to <strong>${payableTo}</strong>.<br/>` : ''}
               ${mailingAddress ? `Mail to: <strong>${mailingAddress}</strong>` : ''}
             </td></tr>
           </table>`
        : `<p style="margin:8px 0 0;font-size:13px;line-height:1.5;color:#888;font-style:italic;">
             Payment instructions haven't been posted yet — RCP will follow up with you directly.
           </p>`)
    : ''

  // Five distinct outcomes reach this point (see the header comment above).
  // `escalationOutcome` (from `clubhouse_reservations.escalation_outcome`)
  // tells the escalation-driven cases apart from the ordinary ones — both
  // 'pending_payment' and 'confirmed' can arrive here either way.
  // `paymentReceived` (from `check_received_at`) separately tells the two
  // 'confirmed' cases apart. All added 2026-09-18 except the original
  // plain pending_payment/confirmed pair.
  const intro = status === 'escalated'
    ? `Your clubhouse booking request has been flagged for a closer look by the Social Committee. There's nothing you need to do — we'll email you again as soon as that review is complete.`
    : status === 'pending_payment'
      ? (escalationOutcome === 'confirmed_private'
          ? `Following review, the Social Committee has determined this event is private. A fee is now due — see the full booking details below.`
          : `RCP has reviewed and approved your clubhouse booking request. A fee is due before your event — see the full booking details below.`)
      : paymentReceived
        ? `Your payment has been received — your clubhouse booking is confirmed. Your full booking details are below.`
        : escalationOutcome === 'dismissed'
          ? `Following review, the Social Committee has confirmed your booking stands as submitted — no fee is required. You're all set. Your full booking details are below.`
          : `RCP has reviewed your clubhouse booking request and confirmed it — no fee is required. You're all set. Your full booking details are below.`

  const subjectLine = status === 'escalated'
    ? `Your clubhouse booking is under review`
    : status === 'pending_payment'
      ? `Payment due for your clubhouse booking`
      : paymentReceived
        ? `Payment received — your clubhouse booking is confirmed`
        : `Your clubhouse booking is confirmed`

  const bodyHtml = `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#444;">${intro}</p>
    ${formTableHtml}
    ${deadlineRow}
    ${paymentInstructions}
    ${signatureHtml}`

  return { subjectLine, bodyHtml }
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
      .select('calendar_event_id, reserved_by, wants_main_clubhouse, wants_side_room, wants_tables_chairs, starts_at, ends_at, status, fee_main, fee_side_room, fee_tables_chairs, fee_additional_hours, deposit_amount, total_due, payment_deadline_date, actual_title, terms_acknowledged_at, acknowledged_at, acknowledged_by, guest_count, extra_tables_requested, extra_chairs_requested, wants_late_end, liability_insurance_confirmed, private_event_answer, check_received_at, escalation_outcome')
      .eq('id', reservationId)
      .maybeSingle()
    if (resErr) throw resErr
    if (!reservation) throw new Error('Reservation not found')

    if (reservation.status !== 'escalated' && reservation.status !== 'pending_payment' && reservation.status !== 'confirmed') {
      return new Response(JSON.stringify({ success: true, queued: 0, reason: 'not_applicable_status' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const [{ data: event }, { data: resident }, { data: rcpProfile }, settingsResult] = await Promise.all([
      supabaseAdmin.from('calendar_events').select('title').eq('id', reservation.calendar_event_id).maybeSingle(),
      supabaseAdmin.from('profiles').select('names, surname, emails').eq('id', reservation.reserved_by).maybeSingle(),
      reservation.acknowledged_by
        ? supabaseAdmin.from('profiles').select('names, surname').eq('id', reservation.acknowledged_by).maybeSingle()
        : Promise.resolve({ data: null }),
      reservation.status === 'pending_payment'
        ? supabaseAdmin.from('community_settings').select('clubhouse_check_payable_to, clubhouse_check_mailing_address').eq('id', 1).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const residentEmails: string[] = resident?.emails || []
    if (residentEmails.length === 0) {
      return new Response(JSON.stringify({ success: true, queued: 0, reason: 'no_resident_email' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const residentName = resident ? `${resident.names ?? ''} ${resident.surname ?? ''}`.trim() || 'Resident' : 'Resident'
    const rcpName = rcpProfile ? `${rcpProfile.names ?? ''} ${rcpProfile.surname ?? ''}`.trim() || null : null

    // This email only ever goes to the resident who made the booking, so
    // it's safe to use their own reference title here — calendar_events.title
    // is always the masked "Private Event — Name" placeholder for a private/
    // not-sure booking, which told the resident nothing about which of their
    // own bookings this was (Keith, 2026-09-10, spotted in RCP's test run).
    // Same fallback as everywhere else this was fixed: falls back to the
    // masked title if they never set one.
    const eventTitle = reservation.actual_title || event?.title || '(untitled reservation)'

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
      totalDue: reservation.status === 'pending_payment' ? reservation.total_due : null,
    })

    const signatureHtml = buildSignatureBlock({
      residentName,
      // formatDeadline() is for a real date-only column (payment_deadline_date);
      // terms_acknowledged_at/acknowledged_at are timestamptz, so formatDateOnly()
      // (full ISO string, not a sliced date) is used here instead — slicing first
      // and re-anchoring to local midnight can print the wrong calendar day once
      // the UTC date has already rolled over (Keith, 2026-09-23, same bug fixed
      // on the on-screen panel in SocialCalendar.jsx).
      residentSignedAt: reservation.terms_acknowledged_at ? formatDateOnly(reservation.terms_acknowledged_at) : null,
      rcpName,
      rcpSignedAt: reservation.acknowledged_at ? formatDateOnly(reservation.acknowledged_at) : null,
      rulesUrl: `${SITE_URL}/clubhouse-rules`,
    })

    const { subjectLine, bodyHtml } = buildStatusFragment({
      status: reservation.status,
      escalationOutcome: reservation.escalation_outcome ?? null,
      paymentReceived: !!reservation.check_received_at,
      formTableHtml,
      deadline: formatDeadline(reservation.payment_deadline_date),
      payableTo: settingsResult?.data?.clubhouse_check_payable_to ?? null,
      mailingAddress: settingsResult?.data?.clubhouse_check_mailing_address ?? null,
      signatureHtml,
    })

    const { inserted } = await enqueueNotifications(
      supabaseAdmin,
      residentEmails.map((email) => ({
        recipientEmail: email,
        category: 'clubhouse_resident_status' as const,
        subjectLine: `${subjectLine} — ${eventTitle}`,
        bodyHtml,
        linkUrl: `${SITE_URL}/apps/calendar?openEvent=${reservation.calendar_event_id}`,
      }))
    )

    return new Response(JSON.stringify({ success: true, queued: inserted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('notify-clubhouse-resident-status error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
