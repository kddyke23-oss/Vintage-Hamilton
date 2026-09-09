// notify-comment
// Called (fire-and-forget, authenticated) right after a new blog_comments or
// calendar_comments row is inserted. Queues a notification for the ORIGINAL
// post/event author (not the commenter) that a new comment is waiting for
// them. Never queued when someone comments on their own post/event.
//
// As of the notification-queue rework, this no longer emails immediately —
// it inserts into `pending_notifications`, which `send-daily-notifications`
// flushes once a day into one combined email per resident. See
// supabase/functions/_shared/notify-queue.ts for why.
//
// Deploy with: supabase functions deploy notify-comment --no-verify-jwt
// (per BRAIN "Supabase deploy gotcha" — Vintage@Hamilton functions called from
// the authenticated frontend are still deployed with --no-verify-jwt, since a
// plain `deploy` re-enables legacy-secret JWT verification and 401s the call.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { enqueueNotifications } from '../_shared/notify-queue.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SITE_URL = 'https://vintageathamilton.com'

function truncate(text: string, max: number): string {
  const clean = (text || '').trim()
  return clean.length > max ? clean.slice(0, max).trim() + '…' : clean
}

function buildCommentFragment(opts: {
  commenterName: string
  parentLabel: string   // "Calendar Event" or "Blog Post"
  bodySnippet: string
}): string {
  const { commenterName, parentLabel, bodySnippet } = opts
  return `<p style="margin:0 0 6px;font-size:14px;color:#666;">
      <strong>${commenterName}</strong> commented on your ${parentLabel.toLowerCase()}:
    </p>
    <p style="margin:0;padding:12px 14px;background:#F5F7FA;border-left:3px solid #C9922A;border-radius:4px;color:#444;font-size:14px;line-height:1.5;">
      "${bodySnippet}"
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
      return new Response(JSON.stringify({ success: true, queued: 0, reason: 'own_content' }), {
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
      return new Response(JSON.stringify({ success: true, queued: 0, reason: 'no_owner_email' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 4. Queue one item per owner email
    const subjectLine = `New comment on your ${isBlog ? 'post' : 'event'} — ${parent.title || '(untitled)'}`
    const bodyHtml = buildCommentFragment({
      commenterName,
      parentLabel,
      bodySnippet: truncate(comment.body, 200),
    })
    const linkUrl = `${SITE_URL}${linkPath}${parentId}`

    const { inserted } = await enqueueNotifications(
      supabaseAdmin,
      ownerEmails.map((email) => ({
        recipientEmail: email,
        category: 'comment' as const,
        subjectLine,
        bodyHtml,
        linkUrl,
      }))
    )

    return new Response(JSON.stringify({ success: true, queued: inserted }), {
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
