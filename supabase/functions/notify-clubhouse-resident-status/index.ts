// notify-clubhouse-resident-status
// Called (fire-and-forget, from the client, same pattern as notify-comment /
// notify-clubhouse-escalation / notify-clubhouse-rcp) right after RCP
// processes a booking request — acknowledging it (with or without a fee) or
// resolving an escalation. Answers Keith's ask, 2026-09-03: a confirmation
// to the resident, including the check payee/mailing address when a fee is
// actually due. The on-screen counterpart (same information, shown right on
// the event) is ClubhouseReservationPanel in SocialCalendar.jsx.
//
// Only fires for the two outcomes RCP's acknowledge/resolve actions produce:
//   status = 'pending_payment' — fee now due, needs the payment instructions
//   status = 'confirmed'       — no fee required, booking just stands
// Anything else (pending_rcp, escalated, cancelled) is a no-op here — those
// have their own notifications (notify-clubhouse-rcp, notify-clubhouse-
// escalation) or don't need a resident email.
//
// As of the notification-queue rework, this no longer emails immediately —
// it inserts into `pending_notifications`, which `send-daily-notifications`
// flushes once a day into one combined email per resident. See
// supabase/functions/_shared/notify-queue.ts for why.
//
// Deploy with: supabase functions deploy notify-clubhouse-resident-status --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { enqueueNotifications } from '../_shared/notify-queue.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

function buildStatusFragment(opts: {
  status: 'pending_payment' | 'confirmed'
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
}): { subjectLine: string; bodyHtml: string } {
  const { status, when, resources, feeMain, feeSideRoom, feeTablesChairs, deposit, totalDue, deadline, payableTo, mailingAddress } = opts

  const feeRows = status === 'pending_payment'
    ? [
        feeMain != null ? `<tr><td style="padding:3px 12px;font-size:13px;color:#666;">Main Clubhouse fee</td><td style="padding:3px 12px;font-size:13px;color:#1A3F5C;">${money(feeMain)}</td></tr>` : '',
        feeSideRoom != null ? `<tr><td style="padding:3px 12px;font-size:13px;color:#666;">Side Room fee</td><td style="padding:3px 12px;font-size:13px;color:#1A3F5C;">${money(feeSideRoom)}</td></tr>` : '',
        feeTablesChairs != null ? `<tr><td style="padding:3px 12px;font-size:13px;color:#666;">Tables &amp; Chairs fee</td><td style="padding:3px 12px;font-size:13px;color:#1A3F5C;">${money(feeTablesChairs)}</td></tr>` : '',
        deposit != null ? `<tr><td style="padding:3px 12px;font-size:13px;color:#666;">Security deposit</td><td style="padding:3px 12px;font-size:13px;color:#1A3F5C;">${money(deposit)}</td></tr>` : '',
        `<tr><td style="padding:6px 12px 3px;font-size:13px;color:#1A3F5C;font-weight:700;">Total due</td><td style="padding:6px 12px 3px;font-size:13px;color:#1A3F5C;font-weight:700;">${money(totalDue)}</td></tr>`,
        deadline ? `<tr><td style="padding:3px 12px;font-size:13px;color:#666;">Due by</td><td style="padding:3px 12px;font-size:13px;color:#1A3F5C;font-weight:700;">${deadline}</td></tr>` : '',
      ].filter(Boolean).join('')
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

  const intro = status === 'pending_payment'
    ? `RCP has reviewed and approved your clubhouse booking request. A fee is due before your event — see the details below.`
    : `RCP has reviewed your clubhouse booking request and confirmed it — no fee is required. You're all set.`

  const subjectLine = status === 'pending_payment'
    ? `Payment due for your clubhouse booking`
    : `Your clubhouse booking is confirmed`

  const bodyHtml = `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#444;">${intro}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;border-radius:6px;padding:12px;margin:0;">
      <tr><td style="padding:3px 12px;font-size:13px;color:#666;">When</td><td style="padding:3px 12px;font-size:13px;color:#1A3F5C;">${when}</td></tr>
      <tr><td style="padding:3px 12px;font-size:13px;color:#666;">Resources</td><td style="padding:3px 12px;font-size:13px;color:#1A3F5C;">${resources}</td></tr>
      ${feeRows}
    </table>
    ${paymentInstructions}`

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
      .select('calendar_event_id, reserved_by, wants_main_clubhouse, wants_side_room, wants_tables_chairs, starts_at, ends_at, status, fee_main, fee_side_room, fee_tables_chairs, deposit_amount, total_due, payment_deadline_date')
      .eq('id', reservationId)
      .maybeSingle()
    if (resErr) throw resErr
    if (!reservation) throw new Error('Reservation not found')

    if (reservation.status !== 'pending_payment' && reservation.status !== 'confirmed') {
      return new Response(JSON.stringify({ success: true, queued: 0, reason: 'not_applicable_status' }), {
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
      return new Response(JSON.stringify({ success: true, queued: 0, reason: 'no_resident_email' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const eventTitle = event?.title || '(untitled reservation)'

    const { subjectLine, bodyHtml } = buildStatusFragment({
      status: reservation.status,
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
