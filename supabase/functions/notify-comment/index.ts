// notify-comment
// Called (fire-and-forget, authenticated) right after a new blog_comments or
// calendar_comments row is inserted. Emails the ORIGINAL post/event author
// (not the commenter) that a new comment is waiting for them. Never sent when
// someone comments on their own post/event.
//
// Deploy with: supabase functions deploy notify-comment --no-verify-jwt
// (per BRAIN "Supabase deploy gotcha" — Vintage@Hamilton functions called from
// the authenticated frontend are still deployed with --no-verify-jwt, since a
// plain `deploy` re-enables legacy-secret JWT verification and 401s the call.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FROM_EMAIL = 'noreply@vintageathamilton.com'
const SITE_URL = 'https://vintageathamilton.com'

function truncate(text: string, max: number): string {
  const clean = (text || '').trim()
  return clean.length > max ? clean.slice(0, max).trim() + '…' : clean
}

function buildCommentEmail(opts: {
  commenterName: string
  parentLabel: string   // "Calendar Event" or "Blog Post"
  parentTitle: string
  bodySnippet: string
  linkUrl: string
}): string {
  const { commenterName, parentLabel, parentTitle, bodySnippet, linkUrl } = opts
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>New Comment — Vintage @ Hamilton</title>
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
              <p style="margin:6px 0 0;color:#EAF0F7;font-size:13px;">${parentLabel} Comment</p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px;">
              <p style="margin:0 0 8px;font-size:13px;color:#C9922A;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
                💬 New Comment
              </p>
              <h2 style="margin:0 0 16px;color:#1A3F5C;font-family:Georgia,serif;font-size:22px;">
                ${parentTitle}
              </h2>
              <p style="margin:0 0 8px;font-size:14px;color:#666;">
                <strong>${commenterName}</strong> commented:
              </p>
              <p style="margin:0 0 20px;padding:14px 16px;background:#F5F7FA;border-left:3px solid #C9922A;border-radius:4px;color:#444;font-size:15px;line-height:1.6;">
                “${bodySnippet}”
              </p>
              <a href="${linkUrl}"
                 style="display:inline-block;background:#C9922A;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:15px;font-weight:700;">
                View & Reply →
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#888;line-height:1.6;">
                You're receiving this because you posted the ${parentLabel.toLowerCase()} this comment was left on.
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
    console.log('RESEND_API_KEY not set, skipping comment notification email')
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
      console.log('Comment notification sent to ' + email)
    }
  } catch (e) {
    console.error('Failed to send comment notification to ' + email + ':', e.message)
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

    const { commentType, commentId } = await req.json()
    if (!commentType || !['blog', 'calendar'].includes(commentType)) {
      throw new Error('commentType must be "blog" or "calendar"')
    }
    if (!commentId) throw new Error('commentId is required')

    const isBlog = commentType === 'blog'
    const commentTable = isBlog ? 'blog_comments' : 'calendar_comments'
    const parentTable = isBlog ? 'blog_posts' : 'calendar_events'
    const parentIdCol = isBlog ? 'post_id' : 'event_id'
    const parentLabel = isBlog ? 'Blog Post' : 'Calendar Event'
    const linkPath = isBlog ? '/apps/blog?openPost=' : '/apps/calendar?openEvent='

    // 1. Load the comment (service role — bypasses RLS)
    const { data: comment, error: commentErr } = await supabaseAdmin
      .from(commentTable)
      .select(`id, body, created_by, ${parentIdCol}`)
      .eq('id', commentId)
      .maybeSingle()
    if (commentErr) throw commentErr
    if (!comment) throw new Error('Comment not found')

    const parentId = comment[parentIdCol]

    // 2. Load the parent post/event
    const { data: parent, error: parentErr } = await supabaseAdmin
      .from(parentTable)
      .select('id, title, created_by')
      .eq('id', parentId)
      .maybeSingle()
    if (parentErr) throw parentErr
    if (!parent) throw new Error('Parent post/event not found')

    // Never notify someone about their own comment on their own post/event
    if (!parent.created_by || parent.created_by === comment.created_by) {
      return new Response(JSON.stringify({ success: true, notified: 0, reason: 'own_content' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 3. Load commenter's display name + owner's email(s)
    const { data: profiles, error: profErr } = await supabaseAdmin
      .from('profiles')
      .select('id, names, surname, emails')
      .in('id', [comment.created_by, parent.created_by])
    if (profErr) throw profErr

    const commenterProfile = profiles?.find(p => p.id === comment.created_by)
    const ownerProfile = profiles?.find(p => p.id === parent.created_by)

    const commenterName = commenterProfile
      ? `${commenterProfile.names ?? ''} ${commenterProfile.surname ?? ''}`.trim() || 'A neighbour'
      : 'A neighbour'

    const ownerEmails: string[] = ownerProfile?.emails || []
    if (ownerEmails.length === 0) {
      console.log('No email found for post/event owner, skipping notification')
      return new Response(JSON.stringify({ success: true, notified: 0, reason: 'no_owner_email' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 4. Send
    const html = buildCommentEmail({
      commenterName,
      parentLabel,
      parentTitle: parent.title || '(untitled)',
      bodySnippet: truncate(comment.body, 200),
      linkUrl: `${SITE_URL}${linkPath}${parentId}`,
    })
    const subject = `💬 New comment on your ${isBlog ? 'post' : 'event'} — Vintage @ Hamilton`
    for (const email of ownerEmails) {
      await sendEmail(email, subject, html)
    }

    return new Response(JSON.stringify({ success: true, notified: ownerEmails.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('notify-comment error:', error.message)
    // Non-fatal from the caller's perspective — the comment was already saved.
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
