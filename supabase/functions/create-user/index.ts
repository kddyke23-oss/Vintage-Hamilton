import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    if (mode === 'invite') {
      const { email } = body
      if (!email) throw new Error('Email is required')
      const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email)
      if (error) throw error
      return new Response(JSON.stringify({ success: true, mode: 'invite' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })

    // ─── Mode: approve-request ───────────────────────────────────────────
    // Creates profile row(s) + auth user(s) with Pa55word for an access request.
    // Caller must be a super admin.
    } else if (mode === 'approve-request') {
      const { requestId, people, reviewerId } = body
      // people: array of { surname, names, email, phone, address, directoryVisible, notifyCalendar, notifyBlog }

      if (!requestId) throw new Error('requestId is required')
      if (!people || people.length === 0) throw new Error('At least one person is required')

      const results = []

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
          // 2. Create profile row (no auth link yet — trigger will do that)
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
              notify_calendar: person.notifyCalendar ?? false,
              notify_blog: person.notifyBlog ?? false,
              password_set: false,
            })
            .select('resident_id')
            .single()

          if (profileError) throw new Error(`Failed to create profile for ${person.email}: ${profileError.message}`)
          profileResidentId = newProfile.resident_id
        }

        // 3. Check if auth user already exists for this email
        // Use getUserByEmail for an efficient single lookup instead of listing all users
        const { data: existingAuthData } = await supabaseAdmin.auth.admin.getUserByEmail(person.email)
        const existingAuth = existingAuthData?.user

        if (!existingAuth) {
          // 4. Create auth user with Pa55word (email confirmed)
          const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: person.email,
            password: 'Pa55word',
            email_confirm: true,
          })
          if (authError) throw new Error(`Failed to create auth user for ${person.email}: ${authError.message}`)

          // 5. Ensure profile is linked (trigger should do it, but let's be safe)
          await supabaseAdmin
            .from('profiles')
            .update({ id: authData.user.id, password_set: false })
            .eq('resident_id', profileResidentId)

          // 6. Grant directory access
          await supabaseAdmin
            .from('app_access')
            .upsert({
              user_id: authData.user.id,
              app_id: 'directory',
              role: 'user',
              granted_at: new Date().toISOString(),
            }, { onConflict: 'user_id,app_id' })

          results.push({ email: person.email, status: 'created', userId: authData.user.id })
        } else {
          results.push({ email: person.email, status: 'already_exists', userId: existingAuth.id })
        }
      }

      // 7. Mark the access request as approved
      const updatePayload: Record<string, unknown> = {
        status: 'approved',
        reviewed_at: new Date().toISOString(),
      }
      if (reviewerId) updatePayload.reviewed_by = reviewerId

      await supabaseAdmin
        .from('access_requests')
        .update(updatePayload)
        .eq('id', requestId)

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

      // Update the profile record that the trigger created
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
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
