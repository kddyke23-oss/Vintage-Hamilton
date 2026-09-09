// Shared helper: enqueue a notification instead of sending it immediately.
//
// Every notify-* / clubhouse-payment-check function used to build its own
// HTML email and POST it straight to Resend's /emails endpoint, once per
// recipient, the moment the triggering event happened. With comments and the
// clubhouse booking workflow both growing, that put us on track to blow
// through Resend's 100/day free-plan transactional quota.
//
// Now each event just inserts a short row here. Once a day,
// `send-daily-notifications` groups everything by recipient and sends ONE
// combined email per person — so volume scales with "residents with
// activity today", not "events today".
//
// Import with: import { enqueueNotifications } from '../_shared/notify-queue.ts'

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type NotificationCategory =
  | 'comment'
  | 'access_request'
  | 'clubhouse_rcp'
  | 'clubhouse_cancellation'
  | 'clubhouse_escalation'
  | 'clubhouse_resident_status'
  | 'clubhouse_payment_overdue'

export interface QueueItem {
  recipientEmail: string
  category: NotificationCategory
  subjectLine: string   // short one-line summary, e.g. "New comment on your post 'Spring Fling Recap'"
  bodyHtml: string       // small HTML fragment for this one item (no <html>/<body> wrapper)
  linkUrl?: string | null
}

/**
 * Insert one or more notifications into the queue. Never throws on its own —
 * logs and returns { inserted: 0 } on failure, since a queueing failure
 * should not fail the caller's main action (the comment/booking/etc. is
 * already saved).
 */
export async function enqueueNotifications(
  supabaseAdmin: SupabaseClient,
  items: QueueItem[]
): Promise<{ inserted: number }> {
  const rows = items
    .filter((i) => i.recipientEmail)
    .map((i) => ({
      recipient_email: i.recipientEmail,
      category: i.category,
      subject_line: i.subjectLine,
      body_html: i.bodyHtml,
      link_url: i.linkUrl ?? null,
    }))

  if (rows.length === 0) return { inserted: 0 }

  const { error } = await supabaseAdmin.from('pending_notifications').insert(rows)
  if (error) {
    console.error('enqueueNotifications failed:', error.message)
    return { inserted: 0 }
  }
  return { inserted: rows.length }
}

/** Convenience for the common case of a single recipient. */
export async function enqueueNotification(
  supabaseAdmin: SupabaseClient,
  item: QueueItem
): Promise<{ inserted: number }> {
  return enqueueNotifications(supabaseAdmin, [item])
}
