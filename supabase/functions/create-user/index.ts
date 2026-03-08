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

    const { email, password, full_name, unit_number, phone, mode } = await req.json()

    if (!email) throw new Error('Email is required')

    if (mode === 'invite') {
      const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { full_name }
      })
      if (error) throw error
      return new Response(JSON.stringify({ success: true, mode: 'invite' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    } else {
      if (!password) throw new Error('Password is required')
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name }
      })
      if (error) throw error

      if (unit_number || phone) {
        await supabaseAdmin.from('profiles')
          .update({ unit_number, phone })
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
