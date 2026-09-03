// notify-clubhouse-escalation
// Called (fire-and-forget, from the client, same pattern as notify-comment)
// right after RCP escalates a "not private" clubhouse booking. Emails every
// Social Committee member (app_access app_id='clubhouse' role='user') that
// something is waiting on them — this is the only way they currently find
// out an escalation exists, since the admin page only shows them what's
// already escalated, not a live feed. Answers Keith's question, 2026-09-03:
// "how will the committee know" — email, plus a home-screen highlight (see
// AdminReportsWidget.jsx's Clubhouse Escalations card).
//
// Deploy with: supabase functions deploy notify-clubhouse-escalation --no-verify-jwt
// (per BRAIN "Supabase deploy gotcha" — called from the authenticated
// frontend with the anon key, same as notify-comment.)

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

function buildEscalationEmail(opts: {
  eventTitle: string
  residentName: string
  when: string
  resources: string
  linkUrl: string
}): string {
  const { eventTitle, residentName, when, resources, linkUrl } = opts
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Booking Escalated — Vintage @ Hamilton</title>
</head>
<body style="margin:0;padding:0;background:#F5F7FA;font-family:'Lato',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#6B3FA0;padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-family:Georgia,serif;font-size:24px;letter-spacing:0.5px;">
                Vintage @ Hamilton
              </h1>
              <p style="margin:6px 0 0;color:#EDE5F7;font-size:13px;">Social Committee — Escalated Booking</p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px;">
              <p style="margin:0 0 8px;font-size:13px;color:#6B3FA0;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
                \u{1F4CB} Needs Your Review
              </p>
              <h2 style="margin:0 0 16px;color:#1A3F5C;font-family:Georgia,serif;font-size:22px;">
                ${eventTitle}
              </h2>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#444;">
                RCP believes this booking may actually be a private event, even though it wasn't marked as one.
                As a Social Committee member, please confirm or dismiss it.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;border-radius:6px;padding:16px;margin:0 0 24px;">
                <tr><td style="padding:4px 16px;font-size:14px;color:#666;">Resident</td><td style="padding:4px 16px;font-size:14px;color:#1A3F5C;font-weight:700;">${residentName}</td></tr>
                <tr><td style="padding:4px 16px;font-size:14px;color:#666;">When</td><td style="padding:4px 16px;font-size:14px;color:#1A3F5C;">${when}</td></tr>
                <tr><td style="padding:4px 16px;font-size:14px;color:#666;">Resources</td><td style="padding:4px 16px;font-size:14px;color:#1A3F5C;">${resources}</td></tr>
              </table>
              <a href="${linkUrl}"
                 style="display:inline-block;background:#6B3FA0;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:15px;font-weight:700;">
                Review This Booking →
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#888;line-height:1.6;">
                You're receiving this because you're a Social Committee reviewer. This page only ever shows bookings RCP has escalated — nothing else in the queue.
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
    console.log('RESEND_API_KEY not set, skipping escalation notification email')
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
      console.log('Escalation notification sent to ' + email)
    }
  } catch (e) {
    console.error('Failed to send escalation notification to ' + email + ':', e.message)
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

    // 1. Load the reservation (service role — bypasses RLS)
    const { data: reservation, error: resErr } = await supabaseAdmin
      .from('clubhouse_reservations')
      .select('calendar_event_id, reserved_by, wants_main_clubhouse, wants_side_room, wants_tables_chairs, starts_at, ends_at, status')
      .eq('id', reservationId)
      .maybeSingle()
    if (resErr) throw resErr
    if (!reservation) throw new Error('Reservation not found')
    if (reservation.status !== 'escalated') {
      // Defensive — only notify for an actual escalation, in case of a race
      // with a fast dismiss/confirm right after.
      return new Response(JSON.stringify({ success: true, notified: 0, reason: 'not_escalated' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 2. Committee members: everyone with clubhouse app_access role='user'
    const { data: committeeAccess, error: committeeErr } = await supabaseAdmin
      .from('app_access')
      .select('user_id')
      .eq('app_id', 'clubhouse')
      .eq('role', 'user')
    if (committeeErr) throw committeeErr
    const committeeIds = (committeeAccess || []).map(r => r.user_id)

    if (committeeIds.length === 0) {
      console.log('No Social Committee members have clubhouse access yet, skipping notification')
      return new Response(JSON.stringify({ success: true, notified: 0, reason: 'no_committee' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 3. Event title + resident name, committee emails
    const [{ data: event }, { data: resident }, { data: committeeProfiles }] = await Promise.all([
      supabaseAdmin.from('calendar_events').select('title').eq('id', reservation.calendar_event_id).maybeSingle(),
      supabaseAdmin.from('profiles').select('names, surname').eq('id', reservation.reserved_by).maybeSingle(),
      supabaseAdmin.from('profiles').select('id, emails').in('id', committeeIds),
    ])

    const eventTitle = event?.title || '(untitled reservation)'
    const residentName = resident ? `${resident.names ?? ''} ${resident.surname ?? ''}`.trim() || 'Resident' : 'Resident'
    const committeeEmails: string[] = (committeeProfiles || []).flatMap(p => p.emails || [])

    if (committeeEmails.length === 0) {
      return new Response(JSON.stringify({ success: true, notified: 0, reason: 'no_committee_email' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 4. Send
    const html = buildEscalationEmail({
      eventTitle,
      residentName,
      when: formatDateTime(reservation.starts_at, reservation.ends_at),
      resources: resourceList(reservation),
      linkUrl: `${SITE_URL}/admin/reservations`,
    })
    const subject = `\u{1F4CB} Booking escalated for review — ${eventTitle}`
    for (const email of committeeEmails) {
      await sendEmail(email, subject, html)
    }

    return new Response(JSON.stringify({ success: true, notified: committeeEmails.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('notify-clubhouse-escalation error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
