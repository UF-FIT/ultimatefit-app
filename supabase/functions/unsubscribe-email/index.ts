import { createClient } from 'npm:@supabase/supabase-js@2.111.0'

const CONFIRMATION_URL = 'https://app.ultimatefit.pt/cancelar-subscricao.html'

function redirect(state: 'cancelled' | 'already' | 'invalid' | 'error', status = 303) {
  const location = `${CONFIRMATION_URL}?state=${encodeURIComponent(state)}`
  return new Response(null, {
    status,
    headers: {
      Location: location,
      'Cache-Control': 'no-store, max-age=0',
      Pragma: 'no-cache',
      'Referrer-Policy': 'no-referrer',
    },
  })
}

Deno.serve(async (req) => {
  if (!['GET', 'POST'].includes(req.method)) return redirect('invalid', 303)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY')
  if (!supabaseUrl || !serviceKey) return redirect('error', 303)

  const token = String(new URL(req.url).searchParams.get('token') || '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(token)) return redirect('invalid', 303)

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: preference, error } = await admin
    .from('email_marketing_preferences')
    .select('email,enabled')
    .eq('unsubscribe_token', token)
    .maybeSingle()

  if (error || !preference) return redirect('invalid', 303)
  if (!preference.enabled) return redirect('already', 303)

  const now = new Date().toISOString()
  const { error: updateError } = await admin
    .from('email_marketing_preferences')
    .update({
      enabled: false,
      opted_out_at: now,
      source: 'unsubscribe',
      updated_at: now,
      updated_by: null,
    })
    .eq('unsubscribe_token', token)

  if (updateError) return redirect('error', 303)

  await admin
    .from('email_campaign_recipients')
    .update({ status: 'unsubscribed', updated_at: now })
    .eq('email', preference.email)
    .in('status', ['sent', 'delivered', 'opened', 'clicked'])

  return redirect('cancelled', 303)
})
