// notify-access-request
// Called (anonymously, right after insert) by the public Request Access form.
// Looks up everyone flagged as a Directory admin (app_access role='admin' for
// app_id='directory') plus super admins, and queues a notification that a new
// access request is waiting for review.
//
// As of the notification-queue rework, this no longer emails immediately —
// it inserts into `pending_notifications`, which `send-daily-notifications`
// flushes once a day into one combined email per admin. See
// supabase/functions/_shared/notify-queue.ts for why.
//
// Deploy with: supabase functions deploy notify-access-request --no-verify-jwt
// (public/unauthenticated caller — see BRAIN "Supabase deploy gotcha": deploying
// without --no-verify-jwt flips "Verify JWT with legacy secret" back on and this
// call will start 401ing.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { enqueueNotifications } from '../_shared/notify-queue.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SITE_URL = 'https://vintageathamilton.com'

function buildRequestFragment(opts: { primaryName: string; address: string; hasSecondary: boolean }): string {
  const { primaryName, address, hasSecondary } = opts
  return `<p style="margin:0;color:#444;font-size:14px;line-height:1.6;">
      <strong>${primaryName}${hasSecondary ? ' & household' : ''}</strong> at <strong>${address}</strong>
      has requested portal access and is waiting for review. Sign in, then open
      <strong>Access Requests</strong> from the Directory toolbar.
    </p>`
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
      return new Response(JSON.stringify({ success: true, queued: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 3. Queue one item per admin email
    const primaryName = `${reqRow.primary_names} ${reqRow.primary_surname}`.trim()
    const bodyHtml = buildRequestFragment({
      primaryName,
      address: reqRow.address,
      hasSecondary: !!reqRow.secondary_names,
    })

    const { inserted } = await enqueueNotifications(
      supabaseAdmin,
      Array.from(emails).map((email) => ({
        recipientEmail: email,
        category: 'access_request' as const,
        subjectLine: `New access request — ${primaryName}${reqRow.secondary_names ? ' & household' : ''}`,
        bodyHtml,
        linkUrl: `${SITE_URL}/apps/directory`,
      }))
    )

    return new Response(JSON.stringify({ success: true, queued: inserted }), {
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
