// notify-clubhouse-resident-status
// Called (fire-and-forget, from the client, same pattern as notify-comment /
// notify-clubhouse-escalation / notify-clubhouse-rcp) right after RCP
// processes a booking request — acknowledging it (with or without a fee) or
// resolving an escalation. Answers Keith's ask, 2026-09-03: a confirmation
// email to the resident, including the check payee/mailing address when a
// fee is actually due. The on-screen counterpart (same information, shown
// right on the event) is ClubhouseReservationPanel in SocialCalendar.jsx.
//
// Only fires for the two outcomes RCP's acknowledge/resolve actions produce:
//   status = 'pending_payment' — fee now due, needs the payment instructions
//   status = 'confirmed'       — no fee required, booking just stands
// Anything else (pending_rcp, escalated, cancelled) is a no-op here — those
// have their own notifications (notify-clubhouse-rcp, notify-clubhouse-
// escalation) or don't need a resident email.
//
// Deploy with: supabase functions deploy notify-clubhouse-resident-status --no-verify-jwt

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

function formatDeadline(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function money(n: number | null): string {
  return n == null ? '' : `$${Number(n).toFixed(2)}`
}

function buildEmail(opts: {
  status: 'pending_payment' | 'confirmed'
  eventTitle: string
  when: string
  resources: string
  feeMain: number | null
  feeSideRoom: number | null
  feeTablesChairs: number | null
  deposit: number | null
  totalDue: number | null
  deadline: string
  payableTo: string | null
  mailingAddress: string | null
  linkUrl: string
}): { subject: string; html: string } {
  const { status, eventTitle, when, resources, feeMain, feeSideRoom, feeTablesChairs, deposit, totalDue, deadline, payableTo, mailingAddress, linkUrl } = opts

  const headerColor = status === 'pending_payment' ? '#C9922A' : '#2F7D5C'
  const headerLabel = status === 'pending_payment' ? 'Payment Due' : 'Booking Confirmed'
  const subject = status === 'pending_payment'
    ? `Payment due for your clubhouse booking — ${eventTitle}`
    : `Your clubhouse booking is confirmed — ${eventTitle}`

  const feeRows = status === 'pending_payment'
    ? [
        feeMain != null ? `<tr><td style="padding:4px 16px;font-size:14px;color:#666;">Main Clubhouse fee</td><td style="padding:4px 16px;font-size:14px;color:#1A3F5C;">${money(feeMain)}</td></tr>` : '',
        feeSideRoom != null ? `<tr><td style="padding:4px 16px;font-size:14px;color:#666;">Side Room fee</td><td style="padding:4px 16px;font-size:14px;color:#1A3F5C;">${money(feeSideRoom)}</td></tr>` : '',
        feeTablesChairs != null ? `<tr><td style="padding:4px 16px;font-size:14px;color:#666;">Tables &amp; Chairs fee</td><td style="padding:4px 16px;font-size:14px;color:#1A3F5C;">${money(feeTablesChairs)}</td></tr>` : '',
        deposit != null ? `<tr><td style="padding:4px 16px;font-size:14px;color:#666;">Security deposit</td><td style="padding:4px 16px;font-size:14px;color:#1A3F5C;">${money(deposit)}</td></tr>` : '',
        `<tr><td style="padding:8px 16px 4px;font-size:14px;color:#1A3F5C;font-weight:700;">Total due</td><td style="padding:8px 16px 4px;font-size:14px;color:#1A3F5C;font-weight:700;">${money(totalDue)}</td></tr>`,
        deadline ? `<tr><td style="padding:4px 16px;font-size:14px;color:#666;">Due by</td><td style="padding:4px 16px;font-size:14px;color:#1A3F5C;font-weight:700;">${deadline}</td></tr>` : '',
      ].filter(Boolean).join('')
    : ''

  const paymentInstructions = status === 'pending_payment'
    ? (payableTo || mailingAddress
        ? `<table width="100%" cellpadding="0" cellspacing="0" style="background:#FBF3E4;border-radius:6px;padding:16px;margin:0 0 24px;">
             <tr><td style="padding:12px 16px;font-size:14px;line-height:1.7;color:#5C4419;">
               ${payableTo ? `Make your check payable to <strong>${payableTo}</strong>.<br/>` : ''}
               ${mailingAddress ? `Mail to: <strong>${mailingAddress}</strong>` : ''}
             </td></tr>
           </table>`
        : `<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#888;font-style:italic;">
             Payment instructions haven't been posted yet — RCP will follow up with you directly.
           </p>`)
    : ''

  const intro = status === 'pending_payment'
    ? `RCP has reviewed and approved your clubhouse booking request. A fee is due before your event — see the details below.`
    : `RCP has reviewed your clubhouse booking request and confirmed it — no fee is required. You're all set.`

  return {
    subject,
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${headerLabel} — Vintage @ Hamilton</title>
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
              <p style="margin:6px 0 0;color:#EAF0F7;font-size:13px;">${headerLabel}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px;">
              <p style="margin:0 0 8px;font-size:13px;color:${headerColor};font-weight:700;text-transform:uppercase;letter-spacing:1px;">
                Clubhouse Reservation
              </p>
              <h2 style="margin:0 0 16px;color:#1A3F5C;font-family:Georgia,serif;font-size:22px;">
                ${eventTitle}
              </h2>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#444;">
                ${intro}
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;border-radius:6px;padding:16px;margin:0 0 24px;">
                <tr><td style="padding:4px 16px;font-size:14px;color:#666;">When</td><td style="padding:4px 16px;font-size:14px;color:#1A3F5C;">${when}</td></tr>
                <tr><td style="padding:4px 16px;font-size:14px;color:#666;">Resources</td><td style="padding:4px 16px;font-size:14px;color:#1A3F5C;">${resources}</td></tr>
                ${feeRows}
              </table>
              ${paymentInstructions}
              <a href="${linkUrl}"
                 style="display:inline-block;background:#2C5F8A;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:15px;font-weight:700;">
                View on the Calendar →
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#888;line-height:1.6;">
                You're receiving this because you requested a clubhouse reservation at Vintage @ Hamilton.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  }
}

async function sendEmail(email: string, subject: string, html: string) {
  const RESEND_API_KEY = (Deno.env.get('RESEND_API_KEY') ?? '').trim()
  if (!RESEND_API_KEY) {
    console.log('RESEND_API_KEY not set, skipping resident status email')
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
      console.log('Resident status notification sent to ' + email)
    }
  } catch (e) {
    console.error('Failed to send resident status notification to ' + email + ':', e.message)
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
      .select('calendar_event_id, reserved_by, wants_main_clubhouse, wants_side_room, wants_tables_chairs, starts_at, ends_at, status, fee_main, fee_side_room, fee_tables_chairs, deposit_amount, total_due, payment_deadline_date')
      .eq('id', reservationId)
      .maybeSingle()
    if (resErr) throw resErr
    if (!reservation) throw new Error('Reservation not found')

    if (reservation.status !== 'pending_payment' && reservation.status !== 'confirmed') {
      return new Response(JSON.stringify({ success: true, notified: 0, reason: 'not_applicable_status' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const [{ data: event }, { data: resident }, settingsResult] = await Promise.all([
      supabaseAdmin.from('calendar_events').select('title').eq('id', reservation.calendar_event_id).maybeSingle(),
      supabaseAdmin.from('profiles').select('emails').eq('id', reservation.reserved_by).maybeSingle(),
      reservation.status === 'pending_payment'
        ? supabaseAdmin.from('community_settings').select('clubhouse_check_payable_to, clubhouse_check_mailing_address').eq('id', 1).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    const residentEmails: string[] = resident?.emails || []
    if (residentEmails.length === 0) {
      return new Response(JSON.stringify({ success: true, notified: 0, reason: 'no_resident_email' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const eventTitle = event?.title || '(untitled reservation)'

    const { subject, html } = buildEmail({
      status: reservation.status,
      eventTitle,
      when: formatDateTime(reservation.starts_at, reservation.ends_at),
      resources: resourceList(reservation),
      feeMain: reservation.fee_main,
      feeSideRoom: reservation.fee_side_room,
      feeTablesChairs: reservation.fee_tables_chairs,
      deposit: reservation.deposit_amount,
      totalDue: reservation.total_due,
      deadline: formatDeadline(reservation.payment_deadline_date),
      payableTo: settingsResult?.data?.clubhouse_check_payable_to ?? null,
      mailingAddress: settingsResult?.data?.clubhouse_check_mailing_address ?? null,
      linkUrl: `${SITE_URL}/apps/calendar?openEvent=${reservation.calendar_event_id}`,
    })

    for (const email of residentEmails) {
      await sendEmail(email, subject, html)
    }

    return new Response(JSON.stringify({ success: true, notified: residentEmails.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('notify-clubhouse-resident-status error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
