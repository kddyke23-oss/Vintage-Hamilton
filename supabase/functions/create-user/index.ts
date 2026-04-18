import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// RESEND_API_KEY is read fresh inside sendWelcomeEmail to avoid caching issues
const FROM_EMAIL = 'noreply@vintageathamilton.com'
const SITE_URL = 'https://vintageathamilton.com'

// ── Welcome email HTML ──────────────────────────────────────────────────────
function buildWelcomeEmail(names: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Welcome to Vintage @ Hamilton</title>
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
            <td style="padding:36px 32px;">
              <p style="margin:0 0 8px;font-size:13px;color:#C9922A;font-weight:700;text-transform:uppercase;letter-spacing:1px;">
                \u{1F3E0} Welcome to the Community
              </p>
              <h2 style="margin:0 0 16px;color:#1A3F5C;font-family:Georgia,serif;font-size:22px;">
                Hi ${names}, you're all set!
              </h2>
              <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.6;">
                Your access request has been approved. You can now log in to the Vintage @ Hamilton community portal.
              </p>
              <table cellpadding="0" cellspacing="0" style="background:#F0F5FA;border-radius:8px;padding:0;margin:0 0 24px;width:100%;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 8px;font-size:14px;color:#1A3F5C;font-weight:700;">Your login details:</p>
                    <p style="margin:0 0 4px;font-size:14px;color:#444;">
                      <strong>Website:</strong> <a href="${SITE_URL}" style="color:#2C5F8A;">${SITE_URL}</a>
                    </p>
                    <p style="margin:0 0 4px;font-size:14px;color:#444;">
                      <strong>Temporary Password:</strong> <code style="background:#E8E8E8;padding:2px 8px;border-radius:4px;font-size:14px;">Pa55word</code>
                    </p>
                    <p style="margin:8px 0 0;font-size:13px;color:#888;">
                      You will be asked to set a new password when you first log in.
                    </p>
                  </td>
                </tr>
              </table>
              <a href="${SITE_URL}"
                 style="display:inline-block;background:#C9922A;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:15px;font-weight:700;">
                Log In Now \u{2192}
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px;">
              <hr style="border:none;border-top:1px solid #EAF0F7;margin:0;" />
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#888;line-height:1.6;">
                If you did not request access, please ignore this email.
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

// ── Send welcome email via Resend ───────────────────────────────────────────
async function sendWelcomeEmail(email: string, names: string) {
  const RESEND_API_KEY = (Deno.env.get('RESEND_API_KEY') ?? '').trim()
  if (!RESEND_API_KEY) {
    console.log('RESEND_API_KEY not set, skipping welcome email')
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
        subject: '\u{1F3E0} Welcome to Vintage @ Hamilton!',
        html: buildWelcomeEmail(names),
      }),
    })
    if (!res.ok) {
      const errText = await res.text()
      console.error('Resend error for ' + email + ':', errText)
    } else {
      console.log('Welcome email sent to ' + email)
    }
  } catch (e) {
    console.error('Failed to send welcome email to ' + email + ':', e.message)
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

    const body = await req.json()
    const { mode } = body

    // ─── Mode: invite ────────────────────────────────────────────────────
    // Mirrors approve-request for a single email: finds the existing profile,
    // creates (or links) an auth user with temp password Pa55word, grants
    // directory access, and sends the branded welcome email.
    if (mode === 'invite') {
      console.log('invite mode called')
      const { email } = body
      if (!email) throw new Error('Email is required')

      // 1. Find the profile that owns this email
      const { data: profile, error: profileErr } = await supabaseAdmin
        .from('profiles')
        .select('resident_id, id, names')
        .filter('emails', 'cs', `{${email}}`)
        .maybeSingle()

      if (profileErr) throw profileErr
      if (!profile) {
        throw new Error(`No profile found for ${email}. Add them to the Directory first.`)
      }

      // 2. Create auth user with Pa55word, handling "already exists" gracefully
      let authUserId: string
      let status: 'created' | 'already_exists'

      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: 'Pa55word',
        email_confirm: true,
      })

      if (authError) {
        if (authError.message.includes('already been registered')) {
          console.log('Auth user already exists for ' + email)
          const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
          const existing = listData?.users?.find(u => u.email === email)
          if (!existing) {
            throw new Error('Auth user reported as existing but not found for ' + email)
          }
          authUserId = existing.id
          status = 'already_exists'
          // Ensure profile is linked
          if (!profile.id) {
            await supabaseAdmin
              .from('profiles')
              .update({ id: authUserId })
              .eq('resident_id', profile.resident_id)
          }
        } else {
          throw new Error(`Failed to create auth user for ${email}: ${authError.message}`)
        }
      } else {
        authUserId = authData.user.id
        status = 'created'
        // Link profile to new auth user and force password change on first login
        await supabaseAdmin
          .from('profiles')
          .update({ id: authUserId, password_set: false })
          .eq('resident_id', profile.resident_id)
      }

      // 3. Grant directory access (idempotent)
      await supabaseAdmin
        .from('app_access')
        .upsert({
          user_id: authUserId,
          app_id: 'directory',
          role: 'user',
          granted_at: new Date().toISOString(),
        }, { onConflict: 'user_id,app_id' })

      // 4. Send welcome email (always, whether newly created or already existed)
      await sendWelcomeEmail(email, profile.names)

      return new Response(JSON.stringify({ success: true, mode: 'invite', status }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })

    // ─── Mode: approve-request ───────────────────────────────────────────
    } else if (mode === 'approve-request') {
      console.log('approve-request mode called')
      const { requestId, people, reviewerId } = body

      if (!requestId) throw new Error('requestId is required')
      if (!people || people.length === 0) throw new Error('At least one person is required')

      const results = []
      const emailsToWelcome: { email: string; names: string }[] = []

      for (const person of people) {
        if (!person.email) throw new Error('Email is required for each person')

        // 1. Check if a profile with this email already exists
        const { data: existingProfile } = await supabaseAdmin
          .from('profiles')
          .select('resident_id, id, emails')
          .filter('emails', 'cs', `{${person.email}}`)
          .maybeSingle()

        let profileResidentId = existingProfile?.resident_id

        if (!existingProfile) {
          // 2. Create profile row
          const { data: newProfile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .insert({
              surname: person.surname.toUpperCase(),
              names: person.names,
              address: person.address,
              emails: [person.email],
              phones: person.phone ? [person.phone] : [],
              is_active: true,
              directory_visible: person.directoryVisible ?? true,
              notify_digest: person.notifyDigest ?? true,
              password_set: false,
            })
            .select('resident_id')
            .single()

          if (profileError) throw new Error(`Failed to create profile for ${person.email}: ${profileError.message}`)
          profileResidentId = newProfile.resident_id
        }

        // 3. Try to create auth user with Pa55word
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: person.email,
          password: 'Pa55word',
          email_confirm: true,
        })

        if (authError) {
          if (authError.message.includes('already been registered')) {
            console.log('Auth user already exists for ' + person.email)
            const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
            const existing = listData?.users?.find(u => u.email === person.email)
            if (existing) {
              await supabaseAdmin.from('profiles').update({ id: existing.id }).eq('resident_id', profileResidentId)
              results.push({ email: person.email, status: 'already_exists', userId: existing.id })
              // Also send welcome email to already-existing users so approval
              // always results in a clear "you're set up" email (closes BRAIN TODO)
              emailsToWelcome.push({ email: person.email, names: person.names })
            } else {
              throw new Error('Auth user reported as existing but not found for ' + person.email)
            }
          } else {
            throw new Error(`Failed to create auth user for ${person.email}: ${authError.message}`)
          }
        } else {
          // 4. Link profile to new auth user
          await supabaseAdmin
            .from('profiles')
            .update({ id: authData.user.id, password_set: false })
            .eq('resident_id', profileResidentId)

          // 5. Grant directory access
          await supabaseAdmin
            .from('app_access')
            .upsert({
              user_id: authData.user.id,
              app_id: 'directory',
              role: 'user',
              granted_at: new Date().toISOString(),
            }, { onConflict: 'user_id,app_id' })

          results.push({ email: person.email, status: 'created', userId: authData.user.id })
          emailsToWelcome.push({ email: person.email, names: person.names })
        }
      }

      // 6. Mark the access request as approved
      await supabaseAdmin
        .from('access_requests')
        .update({
          status: 'approved',
          reviewed_by: reviewerId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', requestId)

      // 7. Send welcome emails
      for (const w of emailsToWelcome) {
        await sendWelcomeEmail(w.email, w.names)
      }

      return new Response(JSON.stringify({ success: true, mode: 'approve-request', results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })

    // ─── Mode: create (original) ─────────────────────────────────────────
    } else {
      const { email, password, surname, names, address, phone } = body
      if (!email) throw new Error('Email is required')
      if (!password) throw new Error('Password is required')
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      if (error) throw error

      const profileUpdates: Record<string, unknown> = {}
      if (surname) profileUpdates.surname = surname.toUpperCase()
      if (names)   profileUpdates.names   = names
      if (address) profileUpdates.address = address
      if (phone)   profileUpdates.phones  = [phone]

      if (Object.keys(profileUpdates).length > 0) {
        await supabaseAdmin.from('profiles')
          .update(profileUpdates)
          .eq('id', data.user.id)
      }

      return new Response(JSON.stringify({ success: true, mode: 'create', userId: data.user.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
  } catch (error) {
    console.error('Edge function error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
