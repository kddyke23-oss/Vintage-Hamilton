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

    const { email, password, surname, names, address, phone, mode } = await req.json()

    if (!email) throw new Error('Email is required')

    if (mode === 'invite') {
      // Send invite email — profile must already exist (or will be created by trigger)
      const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email)
      if (error) throw error
      return new Response(JSON.stringify({ success: true, mode: 'invite' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })

    } else {
      // Create auth user with confirmed email
      if (!password) throw new Error('Password is required')
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      if (error) throw error

      // Update the profile record that the trigger created (matched by email via on_auth_user_created)
      // Allow a short moment for the trigger to fire before we update
      const profileUpdates = {}
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
