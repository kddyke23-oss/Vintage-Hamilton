// send-daily-notifications
// Scheduled (pg_cron, same mechanism as daily-digest) — NOT called from the
// frontend. Runs once a day, a little after the community digest, and
// flushes the `pending_notifications` queue: every comment, clubhouse
// booking update, access request, cancellation, escalation, and overdue-
// payment notice that landed there since the last run gets grouped by
// recipient and sent as ONE combined email per person, instead of each
// event firing its own /emails call.
//
// Why this exists: comments + the clubhouse booking workflow were on track
// to push well past Resend's 100/day free-plan transactional quota, because
// every single event sent its own email. Folding everything into one email
// per person per day bounds volume by "residents with activity today," not
// "events today." See supabase/functions/_shared/notify-queue.ts for the
// producer side.
//
// Deploy with: supabase functions deploy send-daily-notifications --no-verify-jwt
// (per BRAIN "Supabase deploy gotcha" — a plain `deploy` re-enables
// legacy-secret JWT verification, which would 401 the pg_cron call since it
// carries the service-role key, not a user JWT.)
//
// Schedule with supabase/send-daily-notifications-cron.sql AFTER deploying.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FROM_EMAIL = 'noreply@vintageathamilton.com'
const SITE_URL = 'https://vintageathamilton.com'

const CATEGORY_LABEL: Record<string, string> = {
  comment: '💬 Comment',
  access_request: '🆕 Access Request',
  clubhouse_rcp: '📅 Clubhouse Booking',
  clubhouse_cancellation: '↩ Clubhouse Cancellation',
  clubhouse_escalation: '📋 Clubhouse Escalation',
  clubhouse_resident_status: '🏠 Clubhouse Booking',
  clubhouse_payment_overdue: '⚠ Payment Overdue',
}

interface QueueRow {
  id: number
  recipient_email: string
  category: string
  subject_line: string
  body_html: string
  link_url: string | null
}

function buildCombinedEmail(items: QueueRow[]): string {
  const itemsHtml = items.map((item, idx) => {
    const label = CATEGORY_LABEL[item.category] || 'Update'
    const divider = idx === 0 ? '' : '<hr style="border:none;border-top:1px solid #EAF0F7;margin:20px 0;" />'
    const link = item.link_url
      ? `<a href="${item.link_url}" style="display:inline-block;margin-top:10px;color:#2C5F8A;font-size:13px;font-weight:700;text-decoration:none;">View →</a>`
      : ''
    return `${divider}
      <p style="margin:0 0 4px;font-size:12px;color:#C9922A;font-weight:700;text-transform:uppercase;letter-spacing:1px;">${label}</p>
      <h3 style="margin:0 0 10px;color:#1A3F5C;font-family:Georgia,serif;font-size:17px;">${item.subject_line}</h3>
      ${item.body_html}
      ${link}`
  }).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Vintage @ Hamilton — Updates</title>
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
              <p style="margin:6px 0 0;color:#EAF0F7;font-size:13px;">Your Community Portal</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;">
              <h2 style="margin:0 0 4px;color:#1A3F5C;font-family:Georgia,serif;font-size:20px;">
                ${items.length} update${items.length === 1 ? '' : 's'} for you
              </h2>
              <p style="margin:0;font-size:13px;color:#6b7280;">Everything below happened on the portal today.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 8px;">
              ${itemsHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;">
              <hr style="border:none;border-top:1px solid #EAF0F7;margin:0;" />
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#888;line-height:1.6;">
                To change what you're notified about, update your notification settings in your
                <a href="${SITE_URL}/apps/directory" style="color:#2C5F8A;">Vintage @ Hamilton Directory</a> profile.
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

async function sendEmail(email: string, subject: string, html: string, resendApiKey: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_EMAIL, to: email, subject, html }),
    })
    if (!res.ok) {
      console.error('Resend error for ' + email + ':', await res.text())
      return false
    }
    return true
  } catch (e) {
    console.error('Failed to send daily notification to ' + email + ':', e.message)
    return false
  }
}

Deno.serve(async (req) => {
  try {
    const RESEND_API_KEY = (Deno.env.get('RESEND_API_KEY') ?? '').trim()
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // 1. Pull every pending item, oldest first, grouped by recipient in JS
    //    (Postgres row order preserved by created_at is enough here — daily
    //    volume is small).
    const { data: pending, error: pendingErr } = await supabaseAdmin
      .from('pending_notifications')
      .select('id, recipient_email, category, subject_line, body_html, link_url')
      .is('sent_at', null)
      .order('recipient_email', { ascending: true })
      .order('created_at', { ascending: true })
    if (pendingErr) throw pendingErr

    if (!pending || pending.length === 0) {
      return new Response(JSON.stringify({ success: true, recipients: 0, items: 0, reason: 'nothing_pending' }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const byRecipient = new Map<string, QueueRow[]>()
    for (const row of pending as QueueRow[]) {
      const list = byRecipient.get(row.recipient_email) ?? []
      list.push(row)
      byRecipient.set(row.recipient_email, list)
    }

    let recipientsSent = 0
    let itemsSent = 0
    let recipientsFailed = 0
    const sentIds: number[] = []

    if (!RESEND_API_KEY) {
      console.log('RESEND_API_KEY not set, skipping daily notification send (items stay queued)')
    } else {
      for (const [email, items] of byRecipient) {
        const subject = `🔔 Vintage @ Hamilton — ${items.length} update${items.length === 1 ? '' : 's'} for you`
        const html = buildCombinedEmail(items)
        const ok = await sendEmail(email, subject, html, RESEND_API_KEY)
        if (ok) {
          recipientsSent++
          itemsSent += items.length
          sentIds.push(...items.map((i) => i.id))
        } else {
          recipientsFailed++
        }
      }

      // 2. Mark only the items that actually went out — anything that failed
      //    stays pending and rolls into tomorrow's run along with new items.
      if (sentIds.length > 0) {
        const { error: markErr } = await supabaseAdmin
          .from('pending_notifications')
          .update({ sent_at: new Date().toISOString() })
          .in('id', sentIds)
        if (markErr) console.error('Failed to mark notifications sent:', markErr.message)
      }

      // 3. Safety-net: bump the daily transactional send counter and warn
      //    as we approach Resend's 100/day free-plan cap.
      if (recipientsSent > 0) {
        const { data: total, error: bumpErr } = await supabaseAdmin.rpc('bump_email_volume', { n: recipientsSent })
        if (bumpErr) {
          console.error('bump_email_volume failed:', bumpErr.message)
        } else if (typeof total === 'number' && total >= 80) {
          console.warn(`⚠ Daily transactional email volume at ${total}/100 (Resend free-plan cap) after today's notification run.`)
        }
      }
    }

    const { error: logErr } = await supabaseAdmin.from('notification_send_log').insert({
      recipient_count: recipientsSent,
      item_count: itemsSent,
      status: recipientsFailed > 0 ? 'partial' : 'success',
    })
    if (logErr) console.error('notification_send_log insert failed:', logErr.message)

    console.log(`Daily notifications sent: ${recipientsSent} recipients, ${itemsSent} items, ${recipientsFailed} recipients failed.`)

    return new Response(JSON.stringify({
      success: true,
      recipients: recipientsSent,
      items: itemsSent,
      recipientsFailed,
    }), { headers: { 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('send-daily-notifications error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }
})
