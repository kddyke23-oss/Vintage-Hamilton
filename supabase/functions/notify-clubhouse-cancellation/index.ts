// notify-clubhouse-cancellation
// Fire-and-forget, called after ANY clubhouse reservation cancellation —
// whether RCP cancelled it (ClubhouseReservationsPage.jsx's cancelReservation)
// or a resident cancelled their own booking (SocialCalendar.jsx's
// handleRemove). One function handles both directions since the audience
// and message are the only things that differ, both derived from the row
// itself (cancelled_by vs reserved_by, and whether check_received_at was
// already set when it was cancelled):
//
//   RCP cancelled (cancelled_by !== reserved_by)
//     -> emails the resident with RCP's cancellation_reason. Per policy,
//        RCP only ever cancels before a fee is received (see
//        ClubhouseReservationsPage.jsx — the Cancel button itself is hidden
//        once check_received_at is set), so this is always a "nothing was
//        collected, nothing to refund" message. Handles a paid case
//        defensively anyway in case that restriction is ever relaxed.
//
//   Resident cancelled their own booking (cancelled_by === reserved_by)
//     -> if no fee had been collected yet, no email at all: the booking is
//        just cancelled and drops out of RCP's queue on its own (see
//        Reservations/REQUIREMENTS.md 2.9).
//     -> if a fee HAD already been collected (check_received_at set), emails
//        every clubhouse role='admin' reviewer that a refund now needs
//        processing (mirrors notify-clubhouse-rcp's recipient lookup).
//
// Deploy with: supabase functions deploy notify-clubhouse-cancellation --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FROM_EMAIL = 'noreply@vintageathamilton.com'
const SITE_URL = 'https://vintageathamilton.com'

function resourceList(r: { wants_main_clubhouse: boolean; wants_side_room: boolean; wants_tables_chairs: boolean }): string {
  const items: string[] = []
  if (r.wants_main_clubhouse) items.push('Main Clubhouse')
  if (r.wants_side_room) items.push('Small Side Room')
  if (r.wants_tables_chairs) items.push('Extra Tables & Chairs')
  return items.join(', ') || '(no resource on file)'
}

function formatDateTime(startsAt: string, endsAt: string): string {
  const s = new Date(startsAt)
  const e = new Date(endsAt)
  const dateStr = s.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const fmtTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${dateStr} · ${fmtTime(s)}–${fmtTime(e)}`
}

function money(n: number | null): string {
  return n == null ? '$0.00' : `$${Number(n).toFixed(2)}`
}

function wrapEmail(opts: { headline: string; subtitle: string; bodyHtml: string; linkUrl: string; linkLabel: string }): string {
  const { headline, subtitle, bodyHtml, linkUrl, linkLabel } = opts
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${headline} — Vintage @ Hamilton</title></head>
<body style="margin:0;padding:0;background:#F5F7FA;font-family:'Lato',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#2C5F8A;padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-family:Georgia,serif;font-size:24px;letter-spacing:0.5px;">Vintage @ Hamilton</h1>
              <p style="margin:6px 0 0;color:#EAF0F7;font-size:13px;">${subtitle}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px;">
              <h2 style="margin:0 0 16px;color:#1A3F5C;font-family:Georgia,serif;font-size:22px;">${headline}</h2>
              ${bodyHtml}
              <a href="${linkUrl}" style="display:inline-block;background:#C9922A;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:15px;font-weight:700;margin-top:8px;">${linkLabel} →</a>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#888;line-height:1.6;">Vintage @ Hamilton — Community Portal</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

async function sendEmail(email: string, subject: string, html: string) {
  const RESEND_API_KEY = (Deno.env.get('RESEND_API_KEY') ?? '').trim()
  if (!RESEND_API_KEY) {
    console.log('RESEND_API_KEY not set, skipping cancellation email')
    return
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: email, subject, html }),
    })
    if (!res.ok) {
      console.error('Resend error for ' + email + ':', await res.text())
    } else {
      console.log('Cancellation notification sent to ' + email)
    }
  } catch (e) {
    console.error('Failed to send cancellation notification to ' + email + ':', e.message)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

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
      .select(`
        id, calendar_event_id, reserved_by, cancelled_by, cancellation_reason, check_received_at,
        status, starts_at, ends_at, wants_main_clubhouse, wants_side_room, wants_tables_chairs, total_due
      `)
      .eq('id', reservationId)
      .maybeSingle()
    if (resErr) throw resErr
    if (!reservation) throw new Error('Reservation not found')
    if (reservation.status !== 'cancelled') {
      return new Response(JSON.stringify({ success: true, notified: 0, reason: 'not_cancelled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const selfCancelled = reservation.cancelled_by === reservation.reserved_by
    // NOT an ?openEvent= deep link: a cancelled reservation's calendar_events
    // row is removed=true, and the calendar's fetchEvents always filters
    // removed=false — that link would just silently fail to open anything.
    const linkUrl = `${SITE_URL}/apps/calendar`
    const when = formatDateTime(reservation.starts_at, reservation.ends_at)
    const resources = resourceList(reservation)

    const { data: event } = await supabaseAdmin
      .from('calendar_events').select('title').eq('id', reservation.calendar_event_id).maybeSingle()
    const eventTitle = event?.title || '(untitled reservation)'

    // ── Resident cancelled their own booking ───────────────────────────
    if (selfCancelled) {
      if (!reservation.check_received_at) {
        // No fee had been collected — nothing to refund, and the booking
        // already dropped out of RCP's queue by virtue of status=cancelled.
        return new Response(JSON.stringify({ success: true, notified: 0, reason: 'no_refund_needed' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data: rcpAccess, error: rcpErr } = await supabaseAdmin
        .from('app_access').select('user_id').eq('app_id', 'clubhouse').eq('role', 'admin')
      if (rcpErr) throw rcpErr
      const rcpIds = (rcpAccess || []).map(r => r.user_id)
      if (rcpIds.length === 0) {
        return new Response(JSON.stringify({ success: true, notified: 0, reason: 'no_rcp' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const [{ data: resident }, { data: rcpProfiles }] = await Promise.all([
        supabaseAdmin.from('profiles').select('names, surname').eq('id', reservation.reserved_by).maybeSingle(),
        supabaseAdmin.from('profiles').select('id, emails').in('id', rcpIds),
      ])
      const residentName = resident ? `${resident.names ?? ''} ${resident.surname ?? ''}`.trim() || 'A resident' : 'A resident'
      const rcpEmails: string[] = (rcpProfiles || []).flatMap(p => p.emails || [])
      if (rcpEmails.length === 0) {
        return new Response(JSON.stringify({ success: true, notified: 0, reason: 'no_rcp_email' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const bodyHtml = `
        <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#444;">
          ${residentName} cancelled a reservation that had already been paid. Please process the refund and mark it issued once it's sent.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;border-radius:6px;padding:16px;margin:0 0 24px;">
          <tr><td style="padding:4px 16px;font-size:14px;color:#666;">Resident</td><td style="padding:4px 16px;font-size:14px;color:#1A3F5C;font-weight:700;">${residentName}</td></tr>
          <tr><td style="padding:4px 16px;font-size:14px;color:#666;">When</td><td style="padding:4px 16px;font-size:14px;color:#1A3F5C;">${when}</td></tr>
          <tr><td style="padding:4px 16px;font-size:14px;color:#666;">Resources</td><td style="padding:4px 16px;font-size:14px;color:#1A3F5C;">${resources}</td></tr>
          <tr><td style="padding:4px 16px;font-size:14px;color:#666;">Amount collected</td><td style="padding:4px 16px;font-size:14px;color:#1A3F5C;">${money(reservation.total_due)}</td></tr>
          ${reservation.cancellation_reason ? `<tr><td style="padding:4px 16px;font-size:14px;color:#666;">Resident's reason</td><td style="padding:4px 16px;font-size:14px;color:#1A3F5C;">${reservation.cancellation_reason}</td></tr>` : ''}
        </table>`
      const html = wrapEmail({
        headline: eventTitle, subtitle: 'Cancelled Reservation — Refund Needed',
        bodyHtml, linkUrl: `${SITE_URL}/admin/reservations`, linkLabel: 'Process This Refund',
      })
      const subject = `↩ Refund needed — ${eventTitle}`
      for (const email of rcpEmails) await sendEmail(email, subject, html)
      return new Response(JSON.stringify({ success: true, notified: rcpEmails.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── RCP (or the board acting as RCP) cancelled it ───────────────────
    const { data: residentProfile } = await supabaseAdmin
      .from('profiles').select('names, surname, emails').eq('id', reservation.reserved_by).maybeSingle()
    const residentEmails: string[] = residentProfile?.emails || []
    if (residentEmails.length === 0) {
      return new Response(JSON.stringify({ success: true, notified: 0, reason: 'no_resident_email' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const refundLine = reservation.check_received_at
      ? `We had already received your payment for this reservation — RCP will process a refund separately.`
      : `No payment had been collected for this reservation, so there's nothing further needed on your end.`
    const reasonLine = reservation.cancellation_reason
      ? `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#444;"><strong>Reason given:</strong> ${reservation.cancellation_reason}</p>`
      : `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#444;">No specific reason was given.</p>`
    const bodyHtml = `
      <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#444;">Your reservation below has been cancelled by RCP.</p>
      ${reasonLine}
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#444;">${refundLine}</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;border-radius:6px;padding:16px;margin:0 0 24px;">
        <tr><td style="padding:4px 16px;font-size:14px;color:#666;">When</td><td style="padding:4px 16px;font-size:14px;color:#1A3F5C;">${when}</td></tr>
        <tr><td style="padding:4px 16px;font-size:14px;color:#666;">Resources</td><td style="padding:4px 16px;font-size:14px;color:#1A3F5C;">${resources}</td></tr>
      </table>`
    const html = wrapEmail({
      headline: eventTitle, subtitle: 'Reservation Cancelled',
      bodyHtml, linkUrl, linkLabel: 'Go To The Calendar',
    })
    const subject = `Reservation cancelled — ${eventTitle}`
    for (const email of residentEmails) await sendEmail(email, subject, html)
    return new Response(JSON.stringify({ success: true, notified: residentEmails.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('notify-clubhouse-cancellation error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
