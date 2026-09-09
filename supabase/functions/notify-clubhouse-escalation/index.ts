// notify-clubhouse-escalation
// Called (fire-and-forget, from the client, same pattern as notify-comment)
// right after RCP escalates a "not private" clubhouse booking. Queues a
// notification for every Social Committee member (app_access
// app_id='clubhouse' role='user') that something is waiting on them — this
// is the only way they currently find out an escalation exists, since the
// admin page only shows them what's already escalated, not a live feed.
// Answers Keith's question, 2026-09-03: "how will the committee know" —
// email, plus a home-screen highlight (see AdminReportsWidget.jsx's
// Clubhouse Escalations card).
//
// As of the notification-queue rework, this no longer emails immediately —
// it inserts into `pending_notifications`, which `send-daily-notifications`
// flushes once a day into one combined email per committee member. See
// supabase/functions/_shared/notify-queue.ts for why.
//
// Deploy with: supabase functions deploy notify-clubhouse-escalation --no-verify-jwt
// (per BRAIN "Supabase deploy gotcha" — called from the authenticated
// frontend with the anon key, same as notify-comment.)

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

function buildEscalationFragment(opts: { residentName: string; when: string; resources: string }): string {
  const { residentName, when, resources } = opts
  return `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#444;">
      RCP believes this booking may actually be a private event, even though it wasn't marked as one.
      As a Social Committee member, please confirm or dismiss it.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;border-radius:6px;padding:12px;margin:0;">
      <tr><td style="padding:3px 12px;font-size:13px;color:#666;">Resident</td><td style="padding:3px 12px;font-size:13px;color:#1A3F5C;font-weight:700;">${residentName}</td></tr>
      <tr><td style="padding:3px 12px;font-size:13px;color:#666;">When</td><td style="padding:3px 12px;font-size:13px;color:#1A3F5C;">${when}</td></tr>
      <tr><td style="padding:3px 12px;font-size:13px;color:#666;">Resources</td><td style="padding:3px 12px;font-size:13px;color:#1A3F5C;">${resources}</td></tr>
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
      return new Response(JSON.stringify({ success: true, queued: 0, reason: 'not_escalated' }), {
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
      return new Response(JSON.stringify({ success: true, queued: 0, reason: 'no_committee' }), {
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
      return new Response(JSON.stringify({ success: true, queued: 0, reason: 'no_committee_email' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 4. Queue one item per committee member
    const bodyHtml = buildEscalationFragment({
      residentName,
      when: formatDateTime(reservation.starts_at, reservation.ends_at),
      resources: resourceList(reservation),
    })

    const { inserted } = await enqueueNotifications(
      supabaseAdmin,
      committeeEmails.map((email) => ({
        recipientEmail: email,
        category: 'clubhouse_escalation' as const,
        subjectLine: `Booking escalated for review — ${eventTitle}`,
        bodyHtml,
        linkUrl: `${SITE_URL}/admin/reservations`,
      }))
    )

    return new Response(JSON.stringify({ success: true, queued: inserted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('notify-clubhouse-escalation error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
