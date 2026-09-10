import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITE_URL = "https://vintageathamilton.com";
const FROM_EMAIL = "noreply@vintageathamilton.com";

// Resend contact "segments" are what Audiences used to be called (Resend
// renamed Audiences -> Segments and moved to a global-contacts model — see
// https://resend.com/docs/dashboard/segments/migrating-from-audiences-to-segments).
// One Broadcast sent to this segment replaces the old "BCC up to 49
// recipients per /emails call" loop.
//
// WHY: Broadcasts/Segments run on Resend's separate Marketing quota
// ("unlimited emails to up to 1,000 contacts/month" on the free plan),
// completely apart from the 100/day Transactional quota. The old BCC-loop
// digest alone was burning 100+ of that 100/day allowance most nights it
// sent — this moves it off that budget entirely. 2026-09-08.
const DIGEST_SEGMENT_NAME = "Daily Digest Subscribers";

// ── HTML digest email template ──────────────────────────────────────────────
function buildDigestEmail(
  blogPosts: { title: string; author: string }[],
  calendarEvents: { title: string; start_date: string; location?: string }[]
): string {
  const blogSection =
    blogPosts.length > 0
      ? `
        <tr>
          <td style="padding:0 32px 24px;">
            <p style="margin:0 0 12px;font-size:13px;color:#C9922A;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
              📝 New Blog Post${blogPosts.length > 1 ? "s" : ""}
            </p>
            ${blogPosts
              .map(
                (p) => `
              <div style="margin-bottom:12px;padding:12px 16px;background:#F9FAFB;border-radius:8px;border-left:3px solid #2C5F8A;">
                <div style="font-size:15px;font-weight:700;color:#1A3F5C;font-family:Georgia,serif;">${p.title}</div>
                <div style="font-size:13px;color:#6b7280;margin-top:4px;">by ${p.author}</div>
              </div>`
              )
              .join("")}
            <a href="${SITE_URL}/apps/blog"
               style="display:inline-block;background:#2C5F8A;color:#ffffff;text-decoration:none;padding:10px 24px;border-radius:6px;font-size:14px;font-weight:700;">
              Read on the Blog →
            </a>
          </td>
        </tr>`
      : "";

  const calSection =
    calendarEvents.length > 0
      ? `
        <tr>
          <td style="padding:0 32px 24px;">
            <p style="margin:0 0 12px;font-size:13px;color:#C9922A;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
              📅 New Event${calendarEvents.length > 1 ? "s" : ""} Posted
            </p>
            ${calendarEvents
              .map(
                (e) => `
              <div style="margin-bottom:12px;padding:12px 16px;background:#F9FAFB;border-radius:8px;border-left:3px solid #C9922A;">
                <div style="font-size:15px;font-weight:700;color:#1A3F5C;font-family:Georgia,serif;">${e.title}</div>
                <div style="font-size:13px;color:#6b7280;margin-top:4px;">
                  ${formatDate(e.start_date)}${e.location ? ` · ${e.location}` : ""}
                </div>
              </div>`
              )
              .join("")}
            <a href="${SITE_URL}/apps/calendar"
               style="display:inline-block;background:#C9922A;color:#ffffff;text-decoration:none;padding:10px 24px;border-radius:6px;font-size:14px;font-weight:700;">
              View the Calendar →
            </a>
          </td>
        </tr>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Vintage @ Hamilton — Daily Digest</title>
</head>
<body style="margin:0;padding:0;background:#F5F7FA;font-family:'Lato',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#2C5F8A;padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-family:Georgia,serif;font-size:24px;letter-spacing:0.5px;">
                Vintage @ Hamilton
              </h1>
              <p style="margin:6px 0 0;color:#EAF0F7;font-size:13px;">Your Community Portal</p>
            </td>
          </tr>

          <!-- Intro -->
          <tr>
            <td style="padding:28px 32px 16px;">
              <h2 style="margin:0 0 8px;color:#1A3F5C;font-family:Georgia,serif;font-size:20px;">
                Today's Community Update
              </h2>
              <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.5;">
                Here's what's new on the portal today.
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 32px 20px;">
              <hr style="border:none;border-top:1px solid #EAF0F7;margin:0;" />
            </td>
          </tr>

          ${blogSection}
          ${calSection}

          <!-- Divider -->
          <tr>
            <td style="padding:0 32px;">
              <hr style="border:none;border-top:1px solid #EAF0F7;margin:0;" />
            </td>
          </tr>

          <!-- Opt-out footer -->
          <tr>
            <td style="padding:20px 32px 28px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#888;line-height:1.6;">
                To unsubscribe, update your notification settings in your
                <a href="${SITE_URL}/apps/directory" style="color:#2C5F8A;">Vintage @ Hamilton Directory</a> profile —
                turn off the Daily Digest option there. Preferences set on the portal are what control your subscription;
                if you're re-added later it's because that setting is back on.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

// ── Resend Segment/Contact sync helpers ──────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resend enforces a hard 10 requests/second cap per API key. Syncing ~100+
 * resident contacts back-to-back can burst past that and knock the *next*
 * call (often the actual broadcast send) into a 429 — so every call here
 * transparently retries on rate-limit, honoring Retry-After when present.
 */
async function resendFetch(
  path: string,
  apiKey: string,
  init: RequestInit = {},
  retriesLeft = 3
): Promise<Response> {
  const res = await fetch(`https://api.resend.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (res.status === 429 && retriesLeft > 0) {
    const retryAfterHeader = res.headers.get("Retry-After");
    const waitMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 1500;
    console.warn(`Resend rate limit hit on ${path}, retrying in ${waitMs}ms (${retriesLeft} retries left)`);
    await sleep(waitMs);
    return resendFetch(path, apiKey, init, retriesLeft - 1);
  }

  return res;
}

/** Find the digest segment by name, or create it once if it doesn't exist yet. */
async function getOrCreateSegmentId(apiKey: string): Promise<string> {
  const listRes = await resendFetch("/segments", apiKey);
  if (listRes.ok) {
    const listJson = await listRes.json();
    const existing = (listJson?.data || []).find((s: { name: string }) => s.name === DIGEST_SEGMENT_NAME);
    if (existing?.id) return existing.id;
  } else {
    console.error("Failed to list Resend segments:", await listRes.text());
  }

  const createRes = await resendFetch("/segments", apiKey, {
    method: "POST",
    body: JSON.stringify({ name: DIGEST_SEGMENT_NAME }),
  });
  if (!createRes.ok) {
    throw new Error(`Failed to create Resend segment: ${await createRes.text()}`);
  }
  const created = await createRes.json();
  return created.id;
}

/**
 * Make sure one email's Resend contact record matches our own opt-in state.
 * `unsubscribed` is ALWAYS driven by `notify_digest` in our own database —
 * never by anything a resident does directly in Resend — so the portal
 * stays the single source of truth even if someone gets re-added later
 * after opting back in. Tries update-by-email first (the common case, once
 * everyone's synced at least once); falls back to create on a 404.
 */
async function syncContact(
  apiKey: string,
  segmentId: string,
  email: string,
  firstName: string | undefined,
  unsubscribed: boolean
): Promise<boolean> {
  const updateRes = await resendFetch(`/contacts/${encodeURIComponent(email)}`, apiKey, {
    method: "PATCH",
    body: JSON.stringify({ unsubscribed, ...(firstName ? { first_name: firstName } : {}) }),
  });

  if (updateRes.ok) return true;

  if (updateRes.status === 404) {
    const createRes = await resendFetch("/contacts", apiKey, {
      method: "POST",
      body: JSON.stringify({
        email,
        unsubscribed,
        ...(firstName ? { first_name: firstName } : {}),
        segments: [{ id: segmentId }],
      }),
    });
    if (createRes.ok) return true;
    console.error(`Failed to create Resend contact ${email}:`, await createRes.text());
    return false;
  }

  console.error(`Failed to update Resend contact ${email}:`, await updateRes.text());
  return false;
}

// ── Main handler ─────────────────────────────────────────────────────────────
// Responds immediately and does the real work in the background via
// EdgeRuntime.waitUntil(). The per-contact Resend sync (paced ~120ms/call
// to respect Resend's rate limit) can take well past the external cron
// caller's response timeout as the resident count grows — cron-job.org
// marked a run "Failed (timeout)" on 2026-09-10 even though the underlying
// work either completed or was about to. Returning fast avoids that
// entirely; real status now lives in digest_log / function logs, not the
// HTTP response body.
serve(async (_req) => {
  EdgeRuntime.waitUntil(runDigest());
  return new Response(
    JSON.stringify({ accepted: true }),
    { status: 202, headers: { "Content-Type": "application/json" } }
  );
});

async function runDigest(): Promise<void> {
  // Read env vars fresh inside the handler (avoid Deno caching)
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Determine the time window.
    // Anchor `since` to the last successful digest send (digest_log.sent_at)
    // rather than a fixed `now() - 24h`. This means:
    //   - If yesterday's digest ran on time, the window is ~24h (same as before).
    //   - If a run was missed, delayed, or errored, the next successful run
    //     back-fills everything since the last good send.
    // Fall back to 24h if digest_log is empty (first-ever run).
    const { data: lastLog, error: lastLogErr } = await supabase
      .from("digest_log")
      .select("sent_at")
      .eq("status", "success")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastLogErr) {
      console.error("Failed to read last digest_log row:", lastLogErr);
    }

    const since = lastLog?.sent_at
      ? lastLog.sent_at
      : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    console.log(`daily-digest: window since ${since}`);

    // 1. Fetch new blog posts (not removed) created since `since`
    const { data: rawPosts, error: blogErr } = await supabase
      .from("blog_posts")
      .select("title, created_by, created_at")
      .gte("created_at", since)
      .or("removed.is.null,removed.eq.false")
      .order("created_at", { ascending: true });

    if (blogErr) throw blogErr;

    // Look up author names for blog posts
    const blogPosts: { title: string; author: string }[] = [];
    if (rawPosts && rawPosts.length > 0) {
      // created_by is a uuid (auth.users.id), need to join through profiles.id
      const authorIds = [...new Set(rawPosts.map((p) => p.created_by).filter(Boolean))];
      const { data: authors } = await supabase
        .from("profiles")
        .select("id, names, surname")
        .in("id", authorIds);

      const authorMap: Record<string, string> = {};
      authors?.forEach((a) => {
        if (a.id) authorMap[a.id] = `${a.names} ${a.surname}`;
      });

      rawPosts.forEach((p) => {
        blogPosts.push({
          title: p.title || "New Blog Post",
          author: authorMap[p.created_by] || "A neighbor",
        });
      });
    }

    // 2. Fetch new calendar events created in the last 24h (future-dated only, not removed)
    const today = new Date().toISOString().split("T")[0];
    const { data: rawEvents, error: calErr } = await supabase
      .from("calendar_events")
      .select("title, event_date, location, created_at")
      .gte("created_at", since)
      .gte("event_date", today)
      .or("removed.is.null,removed.eq.false")
      .order("event_date", { ascending: true });

    if (calErr) throw calErr;

    const calendarEvents = (rawEvents || []).map((e) => ({
      title: e.title || "New Event",
      start_date: e.event_date,
      location: e.location,
    }));

    // 3. Sync every active resident's email(s) into the Resend segment,
    //    regardless of today's content — this keeps Resend's subscription
    //    state converged with `notify_digest` even on quiet days, and is
    //    cheap (one PATCH/POST per email, not per send).
    const { data: allResidents, error: residentsErr } = await supabase
      .from("profiles")
      .select("names, emails, notify_digest")
      .eq("is_active", true)
      .not("emails", "is", null);

    if (residentsErr) throw residentsErr;

    let optedInCount = 0;
    let syncFailures = 0;

    if (!RESEND_API_KEY) {
      console.log("RESEND_API_KEY not set, skipping segment sync and digest send");
      return;
    }

    {
      try {
        const segmentId = await getOrCreateSegmentId(RESEND_API_KEY);

        for (const resident of allResidents || []) {
          const optedIn = !!resident.notify_digest;
          for (const email of resident.emails ?? []) {
            if (!email) continue;
            if (optedIn) optedInCount++;
            const ok = await syncContact(RESEND_API_KEY, segmentId, email, resident.names, !optedIn);
            if (!ok) syncFailures++;
            await sleep(120); // stay comfortably under Resend's 10 req/sec cap
          }
        }

        console.log(`Resend segment sync: ${optedInCount} subscribed, ${syncFailures} sync failures.`);

        // 4. If nothing new, log a "skipped" row and stop (sync above still ran).
        //    Logging this (rather than just returning silently) means the
        //    Email Volume-style history stays honest about quiet days too.
        if (blogPosts.length === 0 && calendarEvents.length === 0) {
          console.log("No new content today — skipping digest broadcast.");
          const { error: skipLogErr } = await supabase.from("digest_log").insert({
            blog_count: 0,
            event_count: 0,
            recipient_count: optedInCount,
            status: "skipped",
          });
          if (skipLogErr) console.error("digest_log insert (skipped) FAILED:", JSON.stringify(skipLogErr));
          return;
        }

        // 5. Build and send the digest as a Broadcast to the segment.
        //    Broadcasts run on Resend's separate Marketing quota, not the
        //    100/day Transactional cap — see the comment on
        //    DIGEST_SEGMENT_NAME above for why that matters here.
        const html = buildDigestEmail(blogPosts, calendarEvents);
        const itemSummary = [
          blogPosts.length > 0 ? `${blogPosts.length} blog post${blogPosts.length > 1 ? "s" : ""}` : "",
          calendarEvents.length > 0 ? `${calendarEvents.length} new event${calendarEvents.length > 1 ? "s" : ""}` : "",
        ].filter(Boolean).join(" & ");
        const subject = `📬 Vintage @ Hamilton — ${itemSummary}`;

        const broadcastRes = await resendFetch("/broadcasts", RESEND_API_KEY, {
          method: "POST",
          body: JSON.stringify({
            segment_id: segmentId,
            from: FROM_EMAIL,
            subject,
            html,
            name: `Daily Digest — ${new Date().toISOString().slice(0, 10)}`,
            send: true,
          }),
        });

        if (!broadcastRes.ok) {
          throw new Error(`Broadcast send failed: ${await broadcastRes.text()}`);
        }
        const broadcast = await broadcastRes.json();

        const { error: logErr } = await supabase.from("digest_log").insert({
          blog_count: blogPosts.length,
          event_count: calendarEvents.length,
          recipient_count: optedInCount,
          status: syncFailures > 0 ? "partial" : "success",
        });
        if (logErr) console.error("digest_log insert FAILED:", JSON.stringify(logErr));

        console.log(
          `Daily digest broadcast sent (id ${broadcast.id}): ${optedInCount} subscribed recipients, ` +
          `${syncFailures} sync failures. Content: ${blogPosts.length} blog posts, ${calendarEvents.length} events.`
        );
      } catch (broadcastErr) {
        console.error("daily-digest broadcast error:", broadcastErr);
        await supabase.from("digest_log").insert({
          blog_count: blogPosts.length,
          event_count: calendarEvents.length,
          recipient_count: optedInCount,
          status: "error",
        });
      }
    }
  } catch (err) {
    console.error("daily-digest error:", err);
  }
}
