import { createClient } from 'npm:@supabase/supabase-js@2.111.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const permissionKeys = [
  'edit_student_profiles',
  'manage_assessments',
  'manage_workout_plans',
  'manage_nutrition',
  'manage_goals',
  'manage_progress_photos',
  'generate_reports',
  'send_announcements',
  'manage_challenges',
  'manage_exercise_library',
] as const

type AppRole = 'owner' | 'admin' | 'trainer' | 'student'
type Action = 'invite' | 'set_permissions' | 'deactivate' | 'reactivate' | 'delete'

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
      return parsed.default ?? Object.values(parsed)[0]
    } catch {
      return raw
    }
  }
  return Deno.env.get(legacyName)
}

function cleanEmail(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function cleanName(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

function normalizePermissions(value: unknown) {
  const selected = new Set(Array.isArray(value) ? value.map(String) : [])
  return permissionKeys.map((permissionKey) => ({
    permission_key: permissionKey,
    is_granted: selected.has(permissionKey),
  }))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const publishableKey = getKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY')
  const secretKey = getKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY')
  const appUrl = (Deno.env.get('APP_URL') || 'https://ultimatefit-app.vercel.app').replace(/\/$/, '')

  if (!supabaseUrl || !publishableKey || !secretKey) {
    return json({ error: 'A função não tem as chaves necessárias.' }, 500)
  }

  const authHeader = req.headers.get('Authorization')
  const token = authHeader?.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Sessão em falta.' }, 401)

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData.user) return json({ error: 'Sessão inválida.' }, 401)

  const { data: caller, error: callerError } = await admin
    .from('profiles')
    .select('id,email,full_name,role,is_active,deleted_at')
    .eq('id', userData.user.id)
    .single()

  if (callerError || !caller || !caller.is_active || caller.deleted_at) {
    return json({ error: 'A conta não tem acesso administrativo ativo.' }, 403)
  }
  if (!['owner', 'admin'].includes(caller.role)) {
    return json({ error: 'Não tens permissão para gerir a equipa.' }, 403)
  }

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Pedido inválido.' }, 400)
  }

  const action = String(payload.action ?? '') as Action

  async function getTarget(profileId: string) {
    const { data, error } = await admin
      .from('profiles')
      .select('id,email,full_name,role,is_active,deleted_at')
      .eq('id', profileId)
      .single()
    if (error || !data) throw new Error('Membro da equipa não encontrado.')
    return data as {
      id: string
      email: string
      full_name: string
      role: AppRole
      is_active: boolean
      deleted_at: string | null
    }
  }

  function canManage(target: { id: string; role: AppRole; deleted_at: string | null }) {
    if (target.id === caller.id || target.role === 'owner' || target.deleted_at) return false
    if (caller.role === 'owner') return ['admin', 'trainer'].includes(target.role)
    return target.role === 'trainer'
  }

  let createdAuthUserId: string | null = null

  try {
    if (action === 'invite') {
      const email = cleanEmail(payload.email)
      const fullName = cleanName(payload.fullName)
      const requestedRole = String(payload.role ?? 'trainer') as AppRole
      const professionalTitle = cleanName(payload.professionalTitle) || 'Personal Trainer'
      const whatsappPhone = String(payload.whatsappPhone ?? '').trim().replace(/[^0-9+]/g, '').slice(0, 20)

      if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Indica um email válido.' }, 400)
      if (fullName.length < 2) return json({ error: 'Indica o nome completo.' }, 400)
      if (whatsappPhone.length < 9) return json({ error: 'Indica o número de WhatsApp profissional.' }, 400)
      if (!['admin', 'trainer'].includes(requestedRole)) return json({ error: 'Tipo de acesso inválido.' }, 400)
      if (caller.role === 'admin' && requestedRole !== 'trainer') {
        return json({ error: 'Um administrador só pode convidar professores.' }, 403)
      }

      const { data: existingProfile } = await admin
        .from('profiles')
        .select('id,deleted_at')
        .ilike('email', email)
        .maybeSingle()
      if (existingProfile) {
        return json({ error: existingProfile.deleted_at
          ? 'Este email pertence a uma conta removida. Contacta o proprietário.'
          : 'Já existe uma conta com este email.' }, 409)
      }

      const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName },
        redirectTo: `${appUrl}/definir-palavra-passe`,
      })
      if (inviteError || !invited.user) throw inviteError ?? new Error('Não foi possível criar o convite.')

      const authUser = invited.user
      createdAuthUserId = authUser.id
      const appMetadata = { ...(authUser.app_metadata ?? {}), app_role: requestedRole }
      const { error: metadataError } = await admin.auth.admin.updateUserById(authUser.id, {
        app_metadata: appMetadata,
        user_metadata: { ...(authUser.user_metadata ?? {}), full_name: fullName },
      })
      if (metadataError) throw metadataError

      const { error: profileError } = await admin
        .from('profiles')
        .update({
          full_name: fullName,
          role: requestedRole,
          is_active: true,
          deleted_at: null,
        })
        .eq('id', authUser.id)
      if (profileError) throw profileError

      await admin.from('student_profiles').delete().eq('profile_id', authUser.id)

      const { data: trainerProfile, error: trainerError } = await admin
        .from('trainer_profiles')
        .update({ professional_title: professionalTitle, whatsapp_phone: whatsappPhone })
        .eq('profile_id', authUser.id)
        .select('id')
        .single()
      if (trainerError || !trainerProfile) throw trainerError ?? new Error('Perfil profissional não criado.')

      if (requestedRole === 'trainer') {
        const permissionRows = normalizePermissions(payload.permissions).map((row) => ({
          trainer_id: trainerProfile.id,
          ...row,
          updated_by: caller.id,
        }))
        const { error: permissionsError } = await admin
          .from('trainer_permissions')
          .upsert(permissionRows, { onConflict: 'trainer_id,permission_key' })
        if (permissionsError) throw permissionsError
      }

      const { error: invitationError } = await admin.from('team_invitations').insert({
        email,
        full_name: fullName,
        requested_role: requestedRole,
        status: 'pending',
        invited_by: caller.id,
        auth_user_id: authUser.id,
      })
      if (invitationError) throw invitationError

      return json({ ok: true, message: `Convite enviado para ${email}.` })
    }

    const profileId = String(payload.profileId ?? '')
    if (!profileId) return json({ error: 'Membro da equipa em falta.' }, 400)
    const target = await getTarget(profileId)
    if (!canManage(target)) {
      return json({ error: 'Esta conta está protegida ou fora das tuas permissões.' }, 403)
    }

    if (action === 'set_permissions') {
      if (target.role !== 'trainer') return json({ error: 'As permissões individuais aplicam-se apenas a professores.' }, 400)
      const { data: trainerProfile, error: trainerError } = await admin
        .from('trainer_profiles')
        .select('id')
        .eq('profile_id', target.id)
        .single()
      if (trainerError || !trainerProfile) throw trainerError ?? new Error('Perfil profissional não encontrado.')

      const rows = normalizePermissions(payload.permissions).map((row) => ({
        trainer_id: trainerProfile.id,
        ...row,
        updated_by: caller.id,
      }))
      const { error } = await admin
        .from('trainer_permissions')
        .upsert(rows, { onConflict: 'trainer_id,permission_key' })
      if (error) throw error
      return json({ ok: true, message: 'Permissões atualizadas.' })
    }

    if (action === 'deactivate') {
      const { error: banError } = await admin.auth.admin.updateUserById(target.id, {
        ban_duration: '876000h',
      })
      if (banError) throw banError
      const { error } = await admin.from('profiles').update({ is_active: false }).eq('id', target.id)
      if (error) {
        await admin.auth.admin.updateUserById(target.id, { ban_duration: 'none' })
        throw error
      }
      return json({ ok: true, message: 'Conta desativada. O histórico foi preservado.' })
    }

    if (action === 'reactivate') {
      const { error: unbanError } = await admin.auth.admin.updateUserById(target.id, {
        ban_duration: 'none',
      })
      if (unbanError) throw unbanError
      const { error } = await admin.from('profiles').update({ is_active: true }).eq('id', target.id)
      if (error) throw error
      return json({ ok: true, message: 'Conta reativada.' })
    }

    if (action === 'delete') {
      const { data: trainerProfile } = await admin
        .from('trainer_profiles')
        .select('id')
        .eq('profile_id', target.id)
        .maybeSingle()

      if (trainerProfile?.id) {
        await admin
          .from('trainer_students')
          .update({ ended_at: new Date().toISOString(), is_primary: false })
          .eq('trainer_id', trainerProfile.id)
          .is('ended_at', null)
      }

      const { error: archiveError } = await admin.from('archived_team_members').insert({
        original_profile_id: target.id,
        full_name: target.full_name,
        email: target.email,
        previous_role: target.role,
        archived_by: caller.id,
        metadata: { removal_type: 'safe_permanent_removal' },
      })
      if (archiveError) throw archiveError

      const { error: banError } = await admin.auth.admin.updateUserById(target.id, {
        ban_duration: '876000h',
        app_metadata: { removed: true, app_role: target.role },
      })
      if (banError) throw banError

      const now = new Date().toISOString()
      const { error: profileError } = await admin
        .from('profiles')
        .update({ is_active: false, deleted_at: now })
        .eq('id', target.id)
      if (profileError) throw profileError

      await admin
        .from('team_invitations')
        .update({ status: 'revoked', revoked_at: now })
        .eq('auth_user_id', target.id)
        .eq('status', 'pending')

      return json({
        ok: true,
        message: 'Acesso eliminado. A autoria e o histórico profissional foram preservados.',
      })
    }

    return json({ error: 'Ação desconhecida.' }, 400)
  } catch (error) {
    console.error(error)
    if (action === 'invite' && createdAuthUserId) {
      const { error: cleanupError } = await admin.auth.admin.deleteUser(createdAuthUserId)
      if (cleanupError) console.error('Falha ao limpar utilizador após convite incompleto:', cleanupError)
    }
    const message = error instanceof Error ? error.message : 'Ocorreu um erro inesperado.'
    return json({ error: message }, 400)
  }
})
