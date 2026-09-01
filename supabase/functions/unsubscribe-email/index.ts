import { createClient } from 'npm:@supabase/supabase-js@2.111.0'

function htmlPage(title: string, message: string, status = 200) {
  return new Response(`<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#050505;color:#fff;font-family:Arial,Helvetica,sans-serif"><main style="width:min(430px,calc(100% - 36px));text-align:center"><img src="https://app.ultimatefit.pt/brand/ultimatefit-logo.webp" alt="ULTIMATE FIT" style="width:min(250px,70vw);height:auto;margin-bottom:28px"><div style="background:#111;border:1px solid #2a2a2a;border-radius:18px;padding:30px"><h1 style="font-size:24px;margin:0 0 12px">${title}</h1><p style="color:#aaa;line-height:1.6;margin:0">${message}</p></div></main></body></html>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}

Deno.serve(async (req) => {
  if (!['GET','POST'].includes(req.method)) return htmlPage('Pedido inválido', 'Não foi possível processar este pedido.', 405)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY')
  if (!supabaseUrl || !serviceKey) return htmlPage('Serviço indisponível', 'Tenta novamente mais tarde.', 503)

  const token = String(new URL(req.url).searchParams.get('token') || '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(token)) return htmlPage('Link inválido', 'Este endereço de cancelamento não é válido ou está incompleto.', 400)

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: preference, error } = await admin.from('email_marketing_preferences').select('email,enabled').eq('unsubscribe_token', token).maybeSingle()
  if (error || !preference) return htmlPage('Link inválido', 'Este endereço de cancelamento já não é reconhecido.', 404)
  if (!preference.enabled) return htmlPage('Subscrição já cancelada', 'Este endereço de email já está excluído das futuras campanhas comerciais da ULTIMATE FIT.')

  const now = new Date().toISOString()
  const { error: updateError } = await admin.from('email_marketing_preferences').update({ enabled: false, opted_out_at: now, source: 'unsubscribe', updated_at: now, updated_by: null }).eq('unsubscribe_token', token)
  if (updateError) return htmlPage('Não foi possível concluir', 'Tenta novamente dentro de alguns minutos.', 500)

  await admin.from('email_campaign_recipients').update({ status: 'unsubscribed', updated_at: now }).eq('email', preference.email).in('status', ['sent','delivered','opened','clicked'])
  return htmlPage('Subscrição cancelada', 'O teu endereço foi removido das futuras campanhas comerciais da ULTIMATE FIT. Continuaremos a poder enviar comunicações operacionais indispensáveis ao serviço.')
})
