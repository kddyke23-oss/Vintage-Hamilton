// notify-clubhouse-rcp
// Called (fire-and-forget, from the client, same pattern as notify-comment /
// notify-clubhouse-escalation) right after a resident submits a clubhouse
// booking that needs RCP's attention (private or "not sure" — lands in
// status='pending_rcp'). Emails everyone with clubhouse app_access
// role='admin'. Answers Keith's question, 2026-09-03: "notify RCP that
// there's something in their queue."
//
// This is the "new booking" half of RCP's queue. The other half — a
// cancelled/refund-pending booking — doesn't need a separate trigger here:
// today only RCP themselves can cancel a booking (see
// ClubhouseReservationsPage.jsx), so they already know when that happens.
// The "subject to cancellation" case (payment overdue) already emails RCP
// via clubhouse-payment-check. If a resident-initiated cancellation request
// gets built later, extend this the same way notify-clubhouse-escalation
// does for escalations.
//
// Deploy with: supabase functions deploy notify-clubhouse-rcp --no-verify-jwt

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

function buildNewBookingEmail(opts: {
  eventTitle: string
  residentName: string
  when: string
  resources: string
  privateAnswer: string
  linkUrl: string
}): string {
  const { eventTitle, residentName, when, resources, privateAnswer, linkUrl } = opts
  const answerLabel = privateAnswer === 'yes' ? 'Yes' : privateAnswer === 'not_sure' ? 'Not sure' : 'No'
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>New Clubhouse Booking — Vintage @ Hamilton</title>
</head>
<body style="margin:0;padding:0;background:#F5F7FA;font-family:'Lato',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#2C5F8A;padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-family:Georgia,serif;font-size:24px;letter-spacing:0.5px;">
                Vintage @ Hamilton
              </h1>
              <p style="margin:6px 0 0;color:#EAF0F7;font-size:13px;">New Clubhouse Booking — Action Needed</p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px;">
              <p style="margin:0 0 8px;font-size:13px;color:#2C5F8A;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
                \u{1F4C5} Needs Acknowledgment
              </p>
              <h2 style="margin:0 0 16px;color:#1A3F5C;font-family:Georgia,serif;font-size:22px;">
                ${eventTitle}
              </h2>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#444;">
                A resident has requested this booking and marked it private (or wasn't sure). Please
                acknowledge it in the portal so the fee and payment deadline are set.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;border-radius:6px;padding:16px;margin:0 0 24px;">
                <tr><td style="padding:4px 16px;font-size:14px;color:#666;">Resident</td><td style="padding:4px 16px;font-size:14px;color:#1A3F5C;font-weight:700;">${residentName}</td></tr>
                <tr><td style="padding:4px 16px;font-size:14px;color:#666;">When</td><td style="padding:4px 16px;font-size:14px;color:#1A3F5C;">${when}</td></tr>
                <tr><td style="padding:4px 16px;font-size:14px;color:#666;">Resources</td><td style="padding:4px 16px;font-size:14px;color:#1A3F5C;">${resources}</td></tr>
                <tr><td style="padding:4px 16px;font-size:14px;color:#666;">Private event?</td><td style="padding:4px 16px;font-size:14px;color:#1A3F5C;">${answerLabel}</td></tr>
              </table>
              <a href="${linkUrl}"
                 style="display:inline-block;background:#C9922A;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:15px;font-weight:700;">
                Review This Booking →
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#888;line-height:1.6;">
                You're receiving this because you review clubhouse bookings for Vintage @ Hamilton.
              </p>
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
    console.log('RESEND_API_KEY not set, skipping RCP new-booking email')
    return
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_EMAIL, to: email, subject, html }),
    })
    if (!res.ok) {
      const errText = await res.text()
      console.error('Resend error for ' + email + ':', errText)
    } else {
      console.log('RCP new-booking notification sent to ' + email)
    }
  } catch (e) {
    console.error('Failed to send RCP new-booking notification to ' + email + ':', e.message)
  }
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
      .select('calendar_event_id, reserved_by, wants_main_clubhouse, wants_side_room, wants_tables_chairs, starts_at, ends_at, status, private_event_answer')
      .eq('id', reservationId)
      .maybeSingle()
    if (resErr) throw resErr
    if (!reservation) throw new Error('Reservation not found')
    if (reservation.status !== 'pending_rcp') {
      return new Response(JSON.stringify({ success: true, notified: 0, reason: 'not_pending_rcp' }), {
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
      return new Response(JSON.stringify({ success: true, notified: 0, reason: 'no_rcp' }), {
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
      return new Response(JSON.stringify({ success: true, notified: 0, reason: 'no_rcp_email' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const html = buildNewBookingEmail({
      eventTitle,
      residentName,
      when: formatDateTime(reservation.starts_at, reservation.ends_at),
      resources: resourceList(reservation),
      privateAnswer: reservation.private_event_answer,
      linkUrl: `${SITE_URL}/admin/reservations`,
    })
    const subject = `\u{1F4C5} New clubhouse booking needs review — ${eventTitle}`
    for (const email of rcpEmails) {
      await sendEmail(email, subject, html)
    }

    return new Response(JSON.stringify({ success: true, notified: rcpEmails.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('notify-clubhouse-rcp error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
