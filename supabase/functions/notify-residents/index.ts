import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM_EMAIL = "noreply@vintageathamilton.com";
const SITE_URL = "https://vintageathamilton.com";

// ── HTML email template ──────────────────────────────────────────────────────
function buildEmail(type: "blog" | "calendar", title: string, description: string): string {
  const emoji = type === "calendar" ? "📅" : "📝";
  const typeLabel = type === "calendar" ? "Calendar Event" : "Blog Post";
  const linkPath = type === "calendar" ? "/calendar" : "/blog";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Vintage @ Hamilton</title>
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

          <!-- Body -->
          <tr>
            <td style="padding:36px 32px;">
              <p style="margin:0 0 8px;font-size:13px;color:#C9922A;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
                ${emoji} New ${typeLabel}
              </p>
              <h2 style="margin:0 0 16px;color:#1A3F5C;font-family:Georgia,serif;font-size:22px;">
                ${title}
              </h2>
              ${description ? `<p style="margin:0 0 24px;color:#444;font-size:15px;line-height:1.6;">${description}</p>` : ""}
              <a href="${SITE_URL}${linkPath}"
                 style="display:inline-block;background:#C9922A;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:15px;font-weight:700;">
                Check It Out →
              </a>
            </td>
          </tr>

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
                You're receiving this because you opted in to community notifications.<br/>
                To stop receiving these emails, visit your
                <a href="${SITE_URL}/directory" style="color:#2C5F8A;">Resident Profile</a>
                and update your notification preferences.
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

// ── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload.record;
    const table = payload.table; // "blog_posts" or "calendar_events"

    // Determine notification type
    const type: "blog" | "calendar" = table === "blog_posts" ? "blog" : "calendar";

    // For calendar events, skip past-dated events
    if (type === "calendar") {
      const startDate = new Date(record.start_date);
      if (startDate <= new Date()) {
        console.log("Skipping past-dated calendar event");
        return new Response("Skipped", { status: 200 });
      }
    }

    // Build subject + content
    const title = record.title ?? (type === "blog" ? "New Blog Post" : "New Event");
    const description = record.description ?? record.content ?? "";
    const subject =
      type === "calendar"
        ? `📅 New Event Posted – Vintage @ Hamilton`
        : `📝 New Blog Post – Vintage @ Hamilton`;

    // Fetch opted-in residents
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const notifyColumn = type === "calendar" ? "notify_calendar" : "notify_blog";

    const { data: residents, error } = await supabase
      .from("profiles")
      .select("emails")
      .eq(notifyColumn, true)
      .not("emails", "is", null);

    if (error) throw error;

    if (!residents || residents.length === 0) {
      console.log("No opted-in residents found");
      return new Response("No recipients", { status: 200 });
    }

    // Collect all email addresses
    const recipients: string[] = residents
      .flatMap((r) => r.emails ?? [])
      .filter(Boolean);

    if (recipients.length === 0) {
      return new Response("No valid emails", { status: 200 });
    }

    const html = buildEmail(type, title, description);

    // Use Resend Batch API — sends up to 100 emails per request, avoids rate limits
    const batches: string[][] = [];
    for (let i = 0; i < recipients.length; i += 100) {
      batches.push(recipients.slice(i, i + 100));
    }

    let sent = 0;
    let failed = 0;

    for (const batch of batches) {
      const emails = batch.map((email) => ({
        from: FROM_EMAIL,
        to: email,
        subject,
        html,
      }));

      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(emails),
      });

      if (res.ok) {
        sent += batch.length;
      } else {
        const err = await res.text();
        console.error(`Batch send failed: ${err}`);
        failed += batch.length;
      }
    }

    console.log(`Notifications sent: ${sent}, failed: ${failed}`);

    return new Response(JSON.stringify({ sent, failed }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("notify-residents error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});