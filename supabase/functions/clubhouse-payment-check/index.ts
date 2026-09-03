// clubhouse-payment-check
// Scheduled (pg_cron, same mechanism as daily-digest) — NOT called from the
// frontend. Runs once a day, finds clubhouse_reservations that are still
// status='pending_payment' after their payment_deadline_date has passed, and
// emails both the resident and every RCP/social-committee reviewer (anyone
// with app_access app_id='clubhouse' role='admin') that the booking is late
// and subject to cancellation. Does NOT cancel anything itself — a human
// (RCP or the board) decides that; this just makes sure nobody misses the
// deadline silently. Dedupes via late_notice_sent_at so each booking only
// gets one notice, ever (a human handles it from there — see
// Reservations/REQUIREMENTS.md §2.8).
//
// Deploy with: supabase functions deploy clubhouse-payment-check --no-verify-jwt
// (per BRAIN "Supabase deploy gotcha" — a plain `deploy` re-enables
// legacy-secret JWT verification, which would 401 the pg_cron call since it
// carries the service-role key, not a user JWT.)
//
// Schedule with supabase/clubhouse-payment-check-cron.sql (mirrors
// daily-digest-cron.sql) AFTER deploying.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FROM_EMAIL = 'noreply@vintageathamilton.com'
const SITE_URL = 'https://vintageathamilton.com'

function money(n: number | null): string {
  if (n === null || n === undefined) return '$0.00'
  return '$' + Number(n).toFixed(2)
}

function formatDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

function resourceList(r: { wants_main_clubhouse: boolean; wants_side_room: boolean; wants_tables_chairs: boolean }): string {
  const items: string[] = []
  if (r.wants_main_clubhouse) items.push('Main Clubhouse')
  if (r.wants_side_room) items.push('Small Side Room')
  if (r.wants_tables_chairs) items.push('Extra Tables & Chairs')
  return items.join(', ') || '(no resource on file)'
}

function buildLateNoticeEmail(opts: {
  recipientIsResident: boolean
  residentName: string
  eventTitle: string
  eventDate: string
  resources: string
  totalDue: string
  deadlineDate: string
  linkUrl: string
}): string {
  const { recipientIsResident, residentName, eventTitle, eventDate, resources, totalDue, deadlineDate, linkUrl } = opts
  const intro = recipientIsResident
    ? `Your clubhouse reservation below has not received payment, and the payment deadline of <strong>${deadlineDate}</strong> has now passed. Please remediate this as soon as possible — the reservation is subject to cancellation.`
    : `The clubhouse reservation below has not received payment, and the payment deadline of <strong>${deadlineDate}</strong> has now passed. It is subject to cancellation — please follow up with the resident or the board.`
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Payment Overdue — Vintage @ Hamilton</title>
</head>
<body style="margin:0;padding:0;background:#F5F7FA;font-family:'Lato',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#B23B3B;padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-family:Georgia,serif;font-size:24px;letter-spacing:0.5px;">
                Vintage @ Hamilton
              </h1>
              <p style="margin:6px 0 0;color:#FBEAEA;font-size:13px;">Clubhouse Reservation — Payment Overdue</p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px;">
              <p style="margin:0 0 8px;font-size:13px;color:#B23B3B;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
                ⚠ Late, Subject to Cancellation
              </p>
              <h2 style="margin:0 0 16px;color:#1A3F5C;font-family:Georgia,serif;font-size:22px;">
                ${eventTitle}
              </h2>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#444;">${intro}</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;border-radius:6px;padding:16px;margin:0 0 20px;">
                <tr><td style="padding:4px 16px;font-size:14px;color:#666;">Resident</td><td style="padding:4px 16px;font-size:14px;color:#1A3F5C;font-weight:700;">${residentName}</td></tr>
                <tr><td style="padding:4px 16px;font-size:14px;color:#666;">Event date</td><td style="padding:4px 16px;font-size:14px;color:#1A3F5C;">${eventDate}</td></tr>
                <tr><td style="padding:4px 16px;font-size:14px;color:#666;">Resources</td><td style="padding:4px 16px;font-size:14px;color:#1A3F5C;">${resources}</td></tr>
                <tr><td style="padding:4px 16px;font-size:14px;color:#666;">Total due</td><td style="padding:4px 16px;font-size:14px;color:#1A3F5C;font-weight:700;">${totalDue}</td></tr>
              </table>
              <a href="${linkUrl}"
                 style="display:inline-block;background:#C9922A;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:15px;font-weight:700;">
                View Reservation →
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#888;line-height:1.6;">
                Payment is by check, coordinated with RCP Management. This is an automated reminder — no action is taken on this reservation automatically.
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
    console.log('RESEND_API_KEY not set, skipping late-payment notice email')
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
      console.log('Late-payment notice sent to ' + email)
    }
  } catch (e) {
    console.error('Failed to send late-payment notice to ' + email + ':', e.message)
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

    const today = new Date().toISOString().slice(0, 10)

    // 1. Find overdue, unpaid, not-yet-notified reservations.
    const { data: overdue, error: overdueErr } = await supabaseAdmin
      .from('clubhouse_reservations')
      .select('id, calendar_event_id, reserved_by, wants_main_clubhouse, wants_side_room, wants_tables_chairs, starts_at, total_due, payment_deadline_date')
      .eq('status', 'pending_payment')
      .lt('payment_deadline_date', today)
      .is('late_notice_sent_at', null)
    if (overdueErr) throw overdueErr

    if (!overdue || overdue.length === 0) {
      return new Response(JSON.stringify({ success: true, notified: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 2. Load RCP/committee reviewer emails (anyone with clubhouse admin access) — once.
    const { data: reviewerAccess, error: reviewerErr } = await supabaseAdmin
      .from('app_access')
      .select('user_id')
      .eq('app_id', 'clubhouse')
      .eq('role', 'admin')
    if (reviewerErr) throw reviewerErr
    const reviewerIds = (reviewerAccess || []).map(r => r.user_id)

    let reviewerEmails: string[] = []
    if (reviewerIds.length > 0) {
      const { data: reviewerProfiles, error: reviewerProfErr } = await supabaseAdmin
        .from('profiles')
        .select('id, emails')
        .in('id', reviewerIds)
      if (reviewerProfErr) throw reviewerProfErr
      reviewerEmails = (reviewerProfiles || []).flatMap(p => p.emails || [])
    }

    let notified = 0

    for (const res of overdue) {
      // Event title + resident info
      const { data: event } = await supabaseAdmin
        .from('calendar_events')
        .select('title')
        .eq('id', res.calendar_event_id)
        .maybeSingle()

      const { data: resident } = await supabaseAdmin
        .from('profiles')
        .select('names, surname, emails')
        .eq('id', res.reserved_by)
        .maybeSingle()

      const residentName = resident
        ? `${resident.names ?? ''} ${resident.surname ?? ''}`.trim() || 'Resident'
        : 'Resident'
      const residentEmails: string[] = resident?.emails || []

      const eventTitle = event?.title || '(untitled reservation)'
      const eventDate = formatDate(res.starts_at.slice(0, 10))
      const resources = resourceList(res)
      const totalDue = money(res.total_due)
      const deadlineDate = formatDate(res.payment_deadline_date)
      const linkUrl = `${SITE_URL}/admin/reservations`

      const subject = `⚠ Clubhouse reservation payment overdue — ${eventTitle}`

      for (const email of residentEmails) {
        await sendEmail(email, subject, buildLateNoticeEmail({
          recipientIsResident: true, residentName, eventTitle, eventDate, resources, totalDue, deadlineDate, linkUrl,
        }))
      }
      for (const email of reviewerEmails) {
        await sendEmail(email, subject, buildLateNoticeEmail({
          recipientIsResident: false, residentName, eventTitle, eventDate, resources, totalDue, deadlineDate, linkUrl,
        }))
      }

      // 3. Mark as sent so this reservation is never notified twice.
      await supabaseAdmin
        .from('clubhouse_reservations')
        .update({ late_notice_sent_at: new Date().toISOString() })
        .eq('id', res.id)

      notified++
    }

    return new Response(JSON.stringify({ success: true, notified }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('clubhouse-payment-check error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
