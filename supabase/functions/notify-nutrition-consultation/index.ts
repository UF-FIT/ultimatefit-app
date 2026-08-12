import { createClient } from 'npm:@supabase/supabase-js@2.111.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function getKey(jsonName: string, legacyName: string) {
  const raw = Deno.env.get(jsonName)
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      return String(parsed.default ?? Object.values(parsed)[0] ?? '')
    } catch {
      return raw
    }
  }
  return Deno.env.get(legacyName) || ''
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const secretKey = getKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY')
  const resendApiKey = Deno.env.get('RESEND_API_KEY') || ''
  const notifyTo = Deno.env.get('NUTRITION_NOTIFY_TO') || 'geral@ultimatefit.pt'
  const mailFrom = Deno.env.get('NOTIFICATION_EMAIL_FROM') || 'ULTIMATE FIT <no-reply@auth.ultimatefit.pt>'
  const appUrl = (Deno.env.get('APP_URL') || 'https://app.ultimatefit.pt').replace(/\/$/, '')

  if (!supabaseUrl || !secretKey) return json({ error: 'Configuração Supabase em falta.' }, 500)
  if (!resendApiKey) return json({ error: 'RESEND_API_KEY não configurada.' }, 500)

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Sessão em falta.' }, 401)

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData.user) return json({ error: 'Sessão inválida.' }, 401)

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Pedido inválido.' }, 400)
  }

  const requestId = String(payload.requestId || '')
  if (!requestId) return json({ error: 'Pedido de consulta em falta.' }, 400)

  const { data: requestRow, error: requestError } = await admin
    .from('nutrition_consultation_requests')
    .select('id,student_id,requested_by,status,message,notification_sent_at,created_at')
    .eq('id', requestId)
    .single()

  if (requestError || !requestRow) return json({ error: 'Pedido de consulta não encontrado.' }, 404)
  if (requestRow.requested_by !== userData.user.id) return json({ error: 'Não tens acesso a este pedido.' }, 403)
  if (requestRow.notification_sent_at) return json({ ok: true, alreadySent: true })

  const { data: student, error: studentError } = await admin
    .from('student_profiles')
    .select('id,student_number,profile_id,profile:profiles!student_profiles_profile_id_fkey(full_name,email,phone)')
    .eq('id', requestRow.student_id)
    .single()

  if (studentError || !student) return json({ error: 'Aluno não encontrado.' }, 404)
  if (student.profile_id !== userData.user.id) return json({ error: 'O pedido não pertence ao aluno autenticado.' }, 403)

  const profile = Array.isArray(student.profile) ? student.profile[0] : student.profile
  const studentName = profile?.full_name || profile?.email || 'Aluno'
  const studentEmail = profile?.email || ''
  const studentPhone = profile?.phone || ''
  const notes = String(requestRow.message || '').trim()

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;background:#111;color:#f5f5f5;padding:28px;border-radius:12px">
    <div style="font-size:12px;font-weight:700;letter-spacing:1.5px;color:#ffd900;margin-bottom:10px">ULTIMATE FIT APP</div>
    <h1 style="font-size:24px;margin:0 0 20px">Novo pedido de consulta de nutrição</h1>
    <p style="color:#cfcfcf">Um aluno pediu acompanhamento com nutricionista através da app.</p>
    <div style="margin:22px 0;padding:18px;background:#1a1a1a;border:1px solid #333;border-radius:10px">
      <p><strong>Aluno:</strong> ${escapeHtml(studentName)}</p>
      <p><strong>Email:</strong> ${escapeHtml(studentEmail || '—')}</p>
      <p><strong>Telemóvel:</strong> ${escapeHtml(studentPhone || '—')}</p>
      <p><strong>N.º aluno:</strong> ${escapeHtml(student.student_number || '—')}</p>
      <p><strong>Observações:</strong><br>${notes ? escapeHtml(notes).replaceAll('\n', '<br>') : 'Sem observações adicionais.'}</p>
    </div>
    <p><a href="${appUrl}/nutricao" style="display:inline-block;background:#ffd900;color:#111;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:6px">Abrir Nutrição na app</a></p>
    <p style="margin-top:26px;font-size:12px;color:#888">Pedido registado automaticamente na ULTIMATE FIT APP.</p>
  </div>`

  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: mailFrom,
      to: [notifyTo],
      reply_to: studentEmail || undefined,
      subject: `Pedido de consulta de nutrição · ${studentName}`,
      html,
    }),
  })

  if (!emailResponse.ok) {
    const detail = await emailResponse.text()
    console.error('Resend error:', detail)
    return json({ error: 'O pedido foi registado, mas o email de notificação não foi enviado.' }, 502)
  }

  const { error: updateError } = await admin
    .from('nutrition_consultation_requests')
    .update({ notification_sent_at: new Date().toISOString() })
    .eq('id', requestId)

  if (updateError) console.error('Could not mark notification as sent:', updateError)

  return json({ ok: true })
})
