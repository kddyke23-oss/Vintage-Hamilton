// notify-clubhouse-deposit
// Fire-and-forget, called from ClubhouseReservationsPage.jsx's post-event
// deposit check-in workflow (added 2026-09-18, see Reservations/
// REQUIREMENTS.md 2.21) — RCP inspects the room(s) after a paid, confirmed
// booking's event has passed, decides how much (if any) of the security
// deposit to withhold for cleaning/corrective work, and refunds the rest by
// check. Two eventType values, told apart the same way notify-clubhouse-
// cancellation does it:
//
//   eventType: 'reviewed' (default) — called right after recordPostEventReview
//     records the findings (post_event_fee_amount/reason, and the derived
//     deposit_refund_amount). Tells the resident what was found and, if
//     anything's coming back, that a refund is on its way.
//
//   eventType: 'refund_issued' — called from markDepositRefundIssued once
//     RCP has actually sent the refund check. Only ever fires when there was
//     something to refund in the first place (the button that triggers this
//     doesn't render otherwise) — resident-only, RCP already knows.
//
// As of the notification-queue rework, this no longer emails immediately —
// it inserts into `pending_notifications`, which `send-daily-notifications`
// flushes once a day into one combined email per resident. See
// supabase/functions/_shared/notify-queue.ts for why.
//
// Deploy with: supabase functions deploy notify-clubhouse-deposit --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { enqueueNotifications } from '../_shared/notify-queue.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SITE_URL = 'https://vintageathamilton.com'

function money(n: number | null): string {
  return n == null ? '$0.00' : `$${Number(n).toFixed(2)}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { reservationId, eventType } = await req.json()
    if (!reservationId) throw new Error('reservationId is required')
    const kind: 'reviewed' | 'refund_issued' = eventType === 'refund_issued' ? 'refund_issued' : 'reviewed'

    const { data: reservation, error: resErr } = await supabaseAdmin
      .from('clubhouse_reservations')
      .select(`
        id, calendar_event_id, reserved_by, actual_title,
        deposit_amount, post_event_reviewed_at, post_event_fee_amount, post_event_fee_reason,
        deposit_refund_amount, deposit_refund_issued_at
      `)
      .eq('id', reservationId)
      .maybeSingle()
    if (resErr) throw resErr
    if (!reservation) throw new Error('Reservation not found')

    if (kind === 'reviewed' && !reservation.post_event_reviewed_at) {
      return new Response(JSON.stringify({ success: true, queued: 0, reason: 'not_reviewed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    if (kind === 'refund_issued' && !reservation.deposit_refund_issued_at) {
      return new Response(JSON.stringify({ success: true, queued: 0, reason: 'refund_not_marked' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: resident } = await supabaseAdmin
      .from('profiles').select('names, surname, emails').eq('id', reservation.reserved_by).maybeSingle()
    const residentEmails: string[] = resident?.emails || []
    if (residentEmails.length === 0) {
      return new Response(JSON.stringify({ success: true, queued: 0, reason: 'no_resident_email' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: event } = await supabaseAdmin
      .from('calendar_events').select('title').eq('id', reservation.calendar_event_id).maybeSingle()
    // Same reasoning as notify-clubhouse-resident-status: the resident's own
    // reference title, not the masked calendar placeholder, since this email
    // only ever goes to them.
    const eventTitle = reservation.actual_title || event?.title || '(untitled reservation)'
    const calendarLinkUrl = `${SITE_URL}/apps/calendar`

    let subjectLine: string
    let bodyHtml: string

    if (kind === 'reviewed') {
      const feeAmount = reservation.post_event_fee_amount
      const hasFee = feeAmount != null && Number(feeAmount) > 0
      subjectLine = `Clubhouse deposit review — ${eventTitle}`
      const feeLine = hasFee
        ? `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#444;">A fee of <strong>${money(feeAmount)}</strong> was withheld from your security deposit: ${reservation.post_event_fee_reason || 'n/a'}.</p>`
        : `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#444;">No fee was applied — the space was left as required.</p>`
      const refundLine = Number(reservation.deposit_refund_amount) > 0
        ? `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#444;">A refund of <strong>${money(reservation.deposit_refund_amount)}</strong> is being processed and will be mailed to you by check.</p>`
        : `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#444;">The full deposit was applied to the fee above, so no refund is due.</p>`
      bodyHtml = `
        <p style="margin:0 0 6px;font-size:14px;line-height:1.6;color:#444;">RCP has inspected the clubhouse following your event below.</p>
        ${feeLine}
        ${refundLine}
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;border-radius:6px;padding:12px;margin:0;">
          <tr><td style="padding:3px 12px;font-size:13px;color:#666;">Security deposit</td><td style="padding:3px 12px;font-size:13px;color:#1A3F5C;">${money(reservation.deposit_amount)}</td></tr>
          <tr><td style="padding:3px 12px;font-size:13px;color:#666;">Fee withheld</td><td style="padding:3px 12px;font-size:13px;color:#1A3F5C;">${hasFee ? money(feeAmount) : '$0.00'}</td></tr>
          <tr><td style="padding:3px 12px;font-size:13px;color:#666;">Refund</td><td style="padding:3px 12px;font-size:13px;color:#1A3F5C;font-weight:700;">${money(reservation.deposit_refund_amount)}</td></tr>
        </table>`
    } else {
      subjectLine = `Deposit refund issued — ${eventTitle}`
      bodyHtml = `
        <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#444;">
          Your security deposit refund of <strong>${money(reservation.deposit_refund_amount)}</strong> for the reservation below has been mailed to you by check.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;border-radius:6px;padding:12px;margin:0;">
          <tr><td style="padding:3px 12px;font-size:13px;color:#666;">Amount refunded</td><td style="padding:3px 12px;font-size:13px;color:#1A3F5C;font-weight:700;">${money(reservation.deposit_refund_amount)}</td></tr>
        </table>`
    }

    const { inserted } = await enqueueNotifications(
      supabaseAdmin,
      residentEmails.map((email) => ({
        recipientEmail: email,
        category: 'clubhouse_resident_status' as const,
        subjectLine,
        bodyHtml,
        linkUrl: calendarLinkUrl,
      }))
    )
    return new Response(JSON.stringify({ success: true, queued: inserted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('notify-clubhouse-deposit error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
