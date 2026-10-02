// clubhouse-setup-check
// Scheduled daily (pg_cron, see supabase/clubhouse-setup-check-cron.sql) at
// 21:45 UTC — deliberately ~30 minutes BEFORE send-daily-notifications flushes
// the queue (22:15 UTC), so anything queued here goes out in that same
// evening's combined email. Reservations/REQUIREMENTS.md §2.29.
//
// Who physically sets up extra tables & chairs is a staffing question for
// RCP/the board; this function makes sure the people who arrange it — everyone
// with clubhouse app_access (RCP = 'admin', Social Committee = 'user') — hear
// about every request, early and again the day before. Public bookings
// auto-confirm and never pass through RCP's queue, so this is the only thing
// that tells anyone about their setup needs. No fee is charged for tables &
// chairs on a public booking (Keith, 2026-10-02) — this is notice only.
//
// Four notices, each sent at most once per booking (dedupe columns from
// clubhouse_setup_tracking.sql, which also resets them if the booking's date
// or quantities change):
//   1. New request      — the first run after a booking with tables/chairs
//                         appears (any status except cancelled).
//   2. 7-day heads-up   — event is 2–7 days out, not yet arranged.
//   3. Day-before       — event is tomorrow (America/New_York), arranged or
//                         not; says which.
//   4. Cancelled        — a booking whose setup had been marked arranged was
//                         cancelled before the event: stand the setup down.
//
// Deploy with: supabase functions deploy clubhouse-setup-check --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { enqueueNotifications } from '../_shared/notify-queue.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SITE_URL = 'https://vintageathamilton.com'
const TZ = 'America/New_York'

// 'YYYY-MM-DD' for an instant, in community local time.
function localDate(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: TZ })
}

function daysBetween(fromYmd: string, toYmd: string): number {
  const a = Date.UTC(+fromYmd.slice(0, 4), +fromYmd.slice(5, 7) - 1, +fromYmd.slice(8, 10))
  const b = Date.UTC(+toYmd.slice(0, 4), +toYmd.slice(5, 7) - 1, +toYmd.slice(8, 10))
  return Math.round((b - a) / 86400000)
}

function formatWhen(startsAt: string, endsAt: string): string {
  const s = new Date(startsAt)
  const e = new Date(endsAt)
  const date = s.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const t = (d: Date) => d.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })
  return `${date} · ${t(s)}–${t(e)}`
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

type Kind = 'new' | 'week' | 'tomorrow' | 'cancelled'

function buildFragment(kind: Kind, o: {
  title: string; when: string; rooms: string; tables: number; chairs: number;
  guests: number | null; bookedBy: string; arranged: string | null; daysOut: number
}): string {
  const intro: Record<Kind, string> = {
    new: `A new clubhouse booking has asked for extra tables &amp; chairs${o.daysOut <= 1 ? ` — <strong>the event is ${o.daysOut <= 0 ? 'today' : 'tomorrow'}</strong>` : ''}. Please arrange setup and record it on the Clubhouse Reservations page.`,
    week: `Tables &amp; chairs are needed in <strong>${o.daysOut} days</strong> and setup hasn't been recorded as arranged yet.`,
    tomorrow: `Tables &amp; chairs are needed <strong>tomorrow</strong>. Please make sure setup is in place.`,
    cancelled: `The booking below has been <strong>cancelled</strong>. Setup had been arranged — please let whoever was doing it know it's no longer needed.`,
  }
  const items = [o.tables > 0 ? `${o.tables} table${o.tables === 1 ? '' : 's'}` : null, o.chairs > 0 ? `${o.chairs} chair${o.chairs === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')
  const row = (k: string, v: string, bold = false) =>
    `<tr><td style="padding:3px 12px;font-size:13px;color:#666;">${k}</td><td style="padding:3px 12px;font-size:13px;color:#1A3F5C;${bold ? 'font-weight:700;' : ''}">${v}</td></tr>`
  const arrangedLine = kind === 'cancelled' ? '' :
    row('Setup', o.arranged ? `✅ Arranged — ${esc(o.arranged)}` : '⚠ Not yet arranged', !o.arranged)
  return `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#444;">${intro[kind]}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;border-radius:6px;padding:12px;margin:0;">
      ${row('Event', esc(o.title), true)}
      ${row('When', o.when)}
      ${row('Room', o.rooms)}
      ${row('Needed', items, true)}
      ${o.guests ? row('Guests', String(o.guests)) : ''}
      ${row('Booked by', esc(o.bookedBy))}
      ${arrangedLine}
    </table>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const db = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const now = new Date()
    const today = localDate(now)

    const { data: rows, error } = await db
      .from('clubhouse_reservations')
      .select('id, calendar_event_id, reserved_by, status, starts_at, ends_at, wants_main_clubhouse, wants_side_room, extra_tables_requested, extra_chairs_requested, guest_count, setup_arranged_at, setup_arranged_by, setup_arranged_note, setup_request_notice_sent_at, setup_7d_notice_sent_at, setup_1d_notice_sent_at, setup_cancel_notice_sent_at')
      .gte('starts_at', now.toISOString())
      .or('extra_tables_requested.gt.0,extra_chairs_requested.gt.0')
    if (error) throw error

    // Decide what each row needs before loading anything else.
    const work: { r: any; kind: Kind; daysOut: number; stamp: Record<string, string> }[] = []
    const ts = now.toISOString()
    for (const r of rows || []) {
      const daysOut = daysBetween(today, localDate(new Date(r.starts_at)))
      if (r.status === 'cancelled') {
        if (r.setup_arranged_at && !r.setup_cancel_notice_sent_at) {
          work.push({ r, kind: 'cancelled', daysOut, stamp: { setup_cancel_notice_sent_at: ts } })
        }
        continue
      }
      if (!r.setup_request_notice_sent_at) {
        // The new-request notice stands in for any reminder already due today.
        const stamp: Record<string, string> = { setup_request_notice_sent_at: ts }
        if (daysOut <= 7) stamp.setup_7d_notice_sent_at = ts
        if (daysOut <= 1) stamp.setup_1d_notice_sent_at = ts
        work.push({ r, kind: 'new', daysOut, stamp })
      } else if (daysOut === 1 && !r.setup_1d_notice_sent_at) {
        work.push({ r, kind: 'tomorrow', daysOut, stamp: { setup_1d_notice_sent_at: ts, setup_7d_notice_sent_at: r.setup_7d_notice_sent_at ?? ts } })
      } else if (daysOut >= 2 && daysOut <= 7 && !r.setup_7d_notice_sent_at && !r.setup_arranged_at) {
        work.push({ r, kind: 'week', daysOut, stamp: { setup_7d_notice_sent_at: ts } })
      }
    }

    if (work.length === 0) {
      return new Response(JSON.stringify({ success: true, queued: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Recipients: everyone with clubhouse access (RCP + Social Committee).
    const { data: access, error: accessErr } = await db.from('app_access').select('user_id').eq('app_id', 'clubhouse')
    if (accessErr) throw accessErr
    const recipientIds = [...new Set((access || []).map(a => a.user_id))]

    // Names/emails for recipients, bookers and arrangers in one query.
    const personIds = [...new Set([
      ...recipientIds,
      ...work.map(w => w.r.reserved_by),
      ...work.map(w => w.r.setup_arranged_by).filter(Boolean),
    ])]
    const { data: people } = await db.from('profiles').select('id, names, surname, emails').in('id', personIds)
    const byId = new Map((people || []).map(p => [p.id, p]))
    const nameOf = (id: string | null) => {
      const p = id ? byId.get(id) : null
      return p ? (`${p.names ?? ''} ${p.surname ?? ''}`.trim() || 'Resident') : 'Resident'
    }
    const recipientEmails = [...new Set(recipientIds.flatMap(id => byId.get(id)?.emails || []))]

    const eventIds = work.map(w => w.r.calendar_event_id)
    const { data: events } = await db.from('calendar_events').select('id, title').in('id', eventIds)
    const titleById = new Map((events || []).map(e => [e.id, e.title]))

    let queued = 0
    for (const { r, kind, daysOut, stamp } of work) {
      const title = titleById.get(r.calendar_event_id) || '(untitled booking)'
      const rooms = [r.wants_main_clubhouse && 'Main Clubhouse', r.wants_side_room && 'Small Side Room'].filter(Boolean).join(' + ') || 'Clubhouse'
      const arranged = r.setup_arranged_at
        ? `${nameOf(r.setup_arranged_by)}${r.setup_arranged_note ? ` (${r.setup_arranged_note})` : ''}`
        : null
      const subjectPrefix: Record<Kind, string> = {
        new: 'New tables & chairs request',
        week: `Tables & chairs needed in ${daysOut} days`,
        tomorrow: 'Tables & chairs needed tomorrow',
        cancelled: 'Tables & chairs no longer needed',
      }
      const bodyHtml = buildFragment(kind, {
        title, when: formatWhen(r.starts_at, r.ends_at), rooms,
        tables: r.extra_tables_requested || 0, chairs: r.extra_chairs_requested || 0,
        guests: r.guest_count, bookedBy: nameOf(r.reserved_by), arranged, daysOut,
      })
      const { inserted } = await enqueueNotifications(db, recipientEmails.map(email => ({
        recipientEmail: email,
        category: 'clubhouse_setup' as const,
        subjectLine: `${subjectPrefix[kind]} — ${title}`,
        bodyHtml,
        linkUrl: `${SITE_URL}/admin/reservations`,
      })))
      queued += inserted
      await db.from('clubhouse_reservations').update(stamp).eq('id', r.id)
    }

    return new Response(JSON.stringify({ success: true, queued, bookings: work.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('clubhouse-setup-check error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
