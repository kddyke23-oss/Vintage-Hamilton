import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FROM_EMAIL = "noreply@vintageathamilton.com";
const SITE_URL = "https://vintageathamilton.com";

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
                You're receiving this because you opted in to the daily digest.<br/>
                To stop, visit your
                <a href="${SITE_URL}/apps/directory" style="color:#2C5F8A;">Resident Profile</a>
                and turn off the Daily Digest option.
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

// ── Main handler ─────────────────────────────────────────────────────────────
serve(async (_req) => {
  // Read env vars fresh inside the handler (avoid Deno caching)
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Determine the time window: last 24 hours
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // 1. Fetch new blog posts (not removed) created in the last 24h
    const { data: rawPosts, error: blogErr } = await supabase
      .from("blog_posts")
      .select("title, author_id, created_at")
      .gte("created_at", since)
      .or("removed.is.null,removed.eq.false")
      .order("created_at", { ascending: true });

    if (blogErr) throw blogErr;

    // Look up author names for blog posts
    const blogPosts: { title: string; author: string }[] = [];
    if (rawPosts && rawPosts.length > 0) {
      const authorIds = [...new Set(rawPosts.map((p) => p.author_id))];
      const { data: authors } = await supabase
        .from("profiles")
        .select("resident_id, names, surname")
        .in("resident_id", authorIds);

      const authorMap: Record<number, string> = {};
      authors?.forEach((a) => {
        authorMap[a.resident_id] = `${a.names} ${a.surname}`;
      });

      rawPosts.forEach((p) => {
        blogPosts.push({
          title: p.title || "New Blog Post",
          author: authorMap[p.author_id] || "A neighbor",
        });
      });
    }

    // 2. Fetch new calendar events created in the last 24h (future-dated only, not removed)
    const today = new Date().toISOString().split("T")[0];
    const { data: rawEvents, error: calErr } = await supabase
      .from("calendar_events")
      .select("title, start_date, location, created_at")
      .gte("created_at", since)
      .gte("start_date", today)
      .or("removed.is.null,removed.eq.false")
      .order("start_date", { ascending: true });

    if (calErr) throw calErr;

    const calendarEvents = (rawEvents || []).map((e) => ({
      title: e.title || "New Event",
      start_date: e.start_date,
      location: e.location,
    }));

    // 3. If nothing new, skip sending
    if (blogPosts.length === 0 && calendarEvents.length === 0) {
      console.log("No new content today — skipping digest.");
      return new Response(
        JSON.stringify({ skipped: true, reason: "no_new_content" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 4. Fetch opted-in residents (notify_digest = true, has email addresses)
    const { data: residents, error: resErr } = await supabase
      .from("profiles")
      .select("emails")
      .eq("notify_digest", true)
      .eq("is_active", true)
      .not("emails", "is", null);

    if (resErr) throw resErr;

    const allEmails: string[] = (residents || [])
      .flatMap((r) => r.emails ?? [])
      .filter(Boolean);

    if (allEmails.length === 0) {
      console.log("No opted-in residents with emails.");
      return new Response(
        JSON.stringify({ skipped: true, reason: "no_recipients" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 5. Build the digest email
    const html = buildDigestEmail(blogPosts, calendarEvents);

    const itemSummary = [
      blogPosts.length > 0 ? `${blogPosts.length} blog post${blogPosts.length > 1 ? "s" : ""}` : "",
      calendarEvents.length > 0 ? `${calendarEvents.length} new event${calendarEvents.length > 1 ? "s" : ""}` : "",
    ].filter(Boolean).join(" & ");

    const subject = `📬 Vintage @ Hamilton — ${itemSummary}`;

    // 6. Send via BCC batches (Resend allows max 50 BCC per email)
    //    We send TO a no-reply address and BCC all residents
    const BCC_BATCH_SIZE = 50;
    let sent = 0;
    let failed = 0;

    for (let i = 0; i < allEmails.length; i += BCC_BATCH_SIZE) {
      const bccBatch = allEmails.slice(i, i + BCC_BATCH_SIZE);

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: FROM_EMAIL,       // send TO ourselves
          bcc: bccBatch,        // actual recipients via BCC
          subject,
          html,
        }),
      });

      if (res.ok) {
        sent += bccBatch.length;
      } else {
        const err = await res.text();
        console.error(`BCC batch send failed: ${err}`);
        failed += bccBatch.length;
      }
    }

    // 7. Log the digest send
    await supabase.from("digest_log").insert({
      blog_count: blogPosts.length,
      event_count: calendarEvents.length,
      recipient_count: sent,
      status: failed > 0 ? "partial" : "success",
    });

    console.log(
      `Daily digest sent: ${sent} recipients, ${failed} failed. ` +
      `Content: ${blogPosts.length} blog posts, ${calendarEvents.length} events.`
    );

    return new Response(
      JSON.stringify({
        sent,
        failed,
        blog_count: blogPosts.length,
        event_count: calendarEvents.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("daily-digest error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
