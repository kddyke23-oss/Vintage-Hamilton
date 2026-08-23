// notify-access-request
// Called (anonymously, right after insert) by the public Request Access form.
// Looks up everyone flagged as a Directory admin (app_access role='admin' for
// app_id='directory') plus super admins, and emails them that a new access
// request is waiting for review.
//
// Deploy with: supabase functions deploy notify-access-request --no-verify-jwt
// (public/unauthenticated caller — see BRAIN "Supabase deploy gotcha": deploying
// without --no-verify-jwt flips "Verify JWT with legacy secret" back on and this
// call will start 401ing.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FROM_EMAIL = 'noreply@vintageathamilton.com'
const SITE_URL = 'https://vintageathamilton.com'

function buildNotifyEmail(opts: { primaryName: string; address: string; hasSecondary: boolean }): string {
  const { primaryName, address, hasSecondary } = opts
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>New Access Request — Vintage @ Hamilton</title>
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
              <p style="margin:6px 0 0;color:#EAF0F7;font-size:13px;">Directory Admin Notice</p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px;">
              <p style="margin:0 0 8px;font-size:13px;color:#C9922A;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
                🆕 New Access Request
              </p>
              <h2 style="margin:0 0 16px;color:#1A3F5C;font-family:Georgia,serif;font-size:22px;">
                ${primaryName}${hasSecondary ? ' & household' : ''}
              </h2>
              <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.6;">
                A resident at <strong>${address}</strong> has requested portal access and is waiting for review.
              </p>
              <a href="${SITE_URL}/apps/directory"
                 style="display:inline-block;background:#C9922A;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:15px;font-weight:700;">
                Review Request →
              </a>
              <p style="margin:16px 0 0;font-size:13px;color:#888;">
                Sign in, then open <strong>Access Requests</strong> from the Directory toolbar.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#888;line-height:1.6;">
                You're receiving this because you're a Directory admin for Vintage @ Hamilton.
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

async function sendEmail(email: string, html: string) {
  const RESEND_API_KEY = (Deno.env.get('RESEND_API_KEY') ?? '').trim()
  if (!RESEND_API_KEY) {
    console.log('RESEND_API_KEY not set, skipping admin notification email')
    return
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: email,
        subject: '🆕 New access request — Vintage @ Hamilton',
        html,
      }),
    })
    if (!res.ok) {
      const errText = await res.text()
      console.error('Resend error for ' + email + ':', errText)
    } else {
      console.log('Admin notification sent to ' + email)
    }
  } catch (e) {
    console.error('Failed to send admin notification to ' + email + ':', e.message)
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

    const { requestId } = await req.json()
    if (!requestId) throw new Error('requestId is required')

    // 1. Load the request (service role — bypasses RLS)
    const { data: reqRow, error: reqErr } = await supabaseAdmin
      .from('access_requests')
      .select('primary_names, primary_surname, secondary_names, address')
      .eq('id', requestId)
      .maybeSingle()
    if (reqErr) throw reqErr
    if (!reqRow) throw new Error('Request not found')

    // 2. Collect recipient emails: Directory app-admins + super admins
    const { data: directoryAdminRows, error: aaErr } = await supabaseAdmin
      .from('app_access')
      .select('user_id')
      .eq('app_id', 'directory')
      .eq('role', 'admin')
    if (aaErr) throw aaErr

    const adminUserIds = new Set((directoryAdminRows || []).map(r => r.user_id))

    const { data: superAdminProfiles, error: superErr } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('is_admin', true)
    if (superErr) throw superErr
    superAdminProfiles?.forEach(p => { if (p.id) adminUserIds.add(p.id) })

    const emails = new Set<string>()
    if (adminUserIds.size > 0) {
      const { data: adminProfiles, error: profErr } = await supabaseAdmin
        .from('profiles')
        .select('id, emails')
        .in('id', Array.from(adminUserIds))
      if (profErr) throw profErr
      adminProfiles?.forEach(p => (p.emails || []).forEach((e: string) => emails.add(e)))
    }

    if (emails.size === 0) {
      console.log('No Directory admin emails found to notify')
      return new Response(JSON.stringify({ success: true, notified: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 3. Send
    const primaryName = `${reqRow.primary_names} ${reqRow.primary_surname}`.trim()
    const html = buildNotifyEmail({
      primaryName,
      address: reqRow.address,
      hasSecondary: !!reqRow.secondary_names,
    })
    for (const email of emails) {
      await sendEmail(email, html)
    }

    return new Response(JSON.stringify({ success: true, notified: emails.size }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('notify-access-request error:', error.message)
    // Non-fatal from the caller's perspective — the request was already saved.
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
