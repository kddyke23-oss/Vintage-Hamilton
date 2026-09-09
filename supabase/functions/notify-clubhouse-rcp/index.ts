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

function buildNewBookingFragment(opts: {
  residentName: string
  when: string
  resources: string
  privateAnswer: string
}): string {
  const { residentName, when, resources, privateAnswer } = opts
  const answerLabel = privateAnswer === 'yes' ? 'Yes' : privateAnswer === 'not_sure' ? 'Not sure' : 'No'
  return `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#444;">
      A resident has requested this booking and marked it private (or wasn't sure). Please
      acknowledge it in the portal so the fee and payment deadline are set.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;border-radius:6px;padding:12px;margin:0;">
      <tr><td style="padding:3px 12px;font-size:13px;color:#666;">Resident</td><td style="padding:3px 12px;font-size:13px;color:#1A3F5C;font-weight:700;">${residentName}</td></tr>
      <tr><td style="padding:3px 12px;font-size:13px;color:#666;">When</td><td style="padding:3px 12px;font-size:13px;color:#1A3F5C;">${when}</td></tr>
      <tr><td style="padding:3px 12px;font-size:13px;color:#666;">Resources</td><td style="padding:3px 12px;font-size:13px;color:#1A3F5C;">${resources}</td></tr>
      <tr><td style="padding:3px 12px;font-size:13px;color:#666;">Private event?</td><td style="padding:3px 12px;font-size:13px;color:#1A3F5C;">${answerLabel}</td></tr>
    </table>`
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

    const bodyHtml = buildNewBookingFragment({
      residentName,
      when: formatDateTime(reservation.starts_at, reservation.ends_at),
      resources: resourceList(reservation),
      privateAnswer: reservation.private_event_answer,
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
