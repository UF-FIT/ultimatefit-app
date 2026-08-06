import { createClient } from 'npm:@supabase/supabase-js@2.111.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type AppRole = 'owner' | 'admin' | 'trainer' | 'student'
type Action =
  | 'invite'
  | 'update_profile'
  | 'assign_trainers'
  | 'set_avatar'
  | 'resend_access'
  | 'deactivate'
  | 'reactivate'
  | 'archive'
  | 'delete'

type Caller = {
  id: string
  email: string
  full_name: string
  role: AppRole
  is_active: boolean
  deleted_at: string | null
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
      return parsed.default ?? Object.values(parsed)[0]
    } catch {
      return raw
    }
  }
  return Deno.env.get(legacyName)
}

function cleanText(value: unknown, maxLength = 500) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ')
  return text.slice(0, maxLength)
}

function cleanLongText(value: unknown, maxLength = 5000) {
  return String(value ?? '').trim().slice(0, maxLength)
}

function cleanEmail(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function cleanPhone(value: unknown) {
  return String(value ?? '').trim().replace(/[^0-9+]/g, '').slice(0, 20)
}

function nullable(value: string) {
  return value || null
}

function normalizeSex(value: unknown) {
  const sex = String(value ?? '')
  return ['male', 'female', 'other', 'prefer_not_to_say'].includes(sex) ? sex : null
}

function normalizeTrackingType(value: unknown) {
  const tracking = String(value ?? '')
  return ['personal_training', 'online_training', 'home_training', 'group_classes'].includes(tracking)
    ? tracking
    : null
}

function normalizeTrainerIds(value: unknown) {
  return [...new Set((Array.isArray(value) ? value : []).map(String).filter(Boolean))]
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

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Sessão em falta.' }, 401)

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const publicClient = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData.user) return json({ error: 'Sessão inválida.' }, 401)

  const { data: callerData, error: callerError } = await admin
    .from('profiles')
    .select('id,email,full_name,role,is_active,deleted_at')
    .eq('id', userData.user.id)
    .single()

  if (callerError || !callerData || !callerData.is_active || callerData.deleted_at) {
    return json({ error: 'A conta não está ativa.' }, 403)
  }
  const caller = callerData as Caller

  const { data: callerTrainer } = await admin
    .from('trainer_profiles')
    .select('id,whatsapp_phone')
    .eq('profile_id', caller.id)
    .maybeSingle()

  async function callerHasPermission(permissionKey: string) {
    if (['owner', 'admin'].includes(caller.role)) return true
    if (caller.role !== 'trainer' || !callerTrainer?.id) return false
    const { data } = await admin
      .from('trainer_permissions')
      .select('is_granted')
      .eq('trainer_id', callerTrainer.id)
      .eq('permission_key', permissionKey)
      .maybeSingle()
    return Boolean(data?.is_granted)
  }

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Pedido inválido.' }, 400)
  }
  const action = String(payload.action ?? '') as Action

  async function getStudent(studentId: string) {
    const { data, error } = await admin
      .from('student_profiles')
      .select('*,profile:profiles!student_profiles_profile_id_fkey(id,email,full_name,phone,avatar_path,avatar_thumb_path,is_active,deleted_at)')
      .eq('id', studentId)
      .single()
    if (error || !data) throw new Error('Aluno não encontrado.')
    return data as any
  }

  async function isAssigned(studentId: string) {
    if (!callerTrainer?.id) return false
    const { data } = await admin
      .from('trainer_students')
      .select('id')
      .eq('trainer_id', callerTrainer.id)
      .eq('student_id', studentId)
      .is('ended_at', null)
      .maybeSingle()
    return Boolean(data)
  }

  async function canManage(studentId: string) {
    if (['owner', 'admin'].includes(caller.role)) return true
    return caller.role === 'trainer'
      && await callerHasPermission('edit_student_profiles')
      && await isAssigned(studentId)
  }

  async function canView(studentId: string, profileId: string) {
    if (await canManage(studentId)) return true
    return caller.role === 'student' && caller.id === profileId
  }

  async function requireTrainerWhatsApp(trainerProfileId: string) {
    const { data, error } = await admin
      .from('trainer_profiles')
      .select('id,whatsapp_phone,profile:profiles!trainer_profiles_profile_id_fkey(full_name,is_active,deleted_at)')
      .eq('id', trainerProfileId)
      .single()
    if (error || !data) throw new Error('Professor não encontrado.')
    if (!data.profile?.is_active || data.profile?.deleted_at) throw new Error('O professor selecionado não está ativo.')
    if (!cleanPhone(data.whatsapp_phone)) {
      throw new Error(`${data.profile?.full_name || 'O professor principal'} tem de registar o WhatsApp antes de receber alunos.`)
    }
    return data
  }

  async function replaceAssignments(studentId: string, trainerIds: string[], primaryTrainerId: string) {
    if (!trainerIds.length || !primaryTrainerId || !trainerIds.includes(primaryTrainerId)) {
      throw new Error('Seleciona pelo menos um professor e define o professor principal.')
    }
    await requireTrainerWhatsApp(primaryTrainerId)

    const now = new Date().toISOString()
    const { error: endError } = await admin
      .from('trainer_students')
      .update({ ended_at: now, ended_by: caller.id, is_primary: false, end_reason: 'reassignment' })
      .eq('student_id', studentId)
      .is('ended_at', null)
    if (endError) throw endError

    const rows = trainerIds.map((trainerId) => ({
      trainer_id: trainerId,
      student_id: studentId,
      is_primary: trainerId === primaryTrainerId,
      assigned_by: caller.id,
    }))
    const { error: insertError } = await admin.from('trainer_students').insert(rows)
    if (insertError) throw insertError

    await admin.from('student_activity_log').insert({
      student_id: studentId,
      actor_id: caller.id,
      action: 'trainers_assigned',
      metadata: { trainer_ids: trainerIds, primary_trainer_id: primaryTrainerId },
    })
  }

  let createdAuthUserId: string | null = null

  try {
    if (action === 'invite') {
      if (!await callerHasPermission('edit_student_profiles')) {
        return json({ error: 'Não tens permissão para criar alunos.' }, 403)
      }

      const email = cleanEmail(payload.email)
      const fullName = cleanText(payload.fullName, 160)
      const phone = cleanPhone(payload.phone)
      const birthDate = cleanText(payload.birthDate, 10)
      const trackingType = normalizeTrackingType(payload.trackingType)

      if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Indica um email válido.' }, 400)
      if (fullName.length < 2) return json({ error: 'Indica o nome completo.' }, 400)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return json({ error: 'Indica a data de nascimento.' }, 400)
      if (!trackingType) return json({ error: 'Seleciona o tipo de acompanhamento.' }, 400)

      let trainerIds = normalizeTrainerIds(payload.trainerIds)
      let primaryTrainerId = cleanText(payload.primaryTrainerId, 64)
      if (caller.role === 'trainer') {
        if (!callerTrainer?.id) return json({ error: 'Perfil profissional não encontrado.' }, 400)
        trainerIds = [callerTrainer.id]
        primaryTrainerId = callerTrainer.id
      }
      if (!trainerIds.length || !primaryTrainerId || !trainerIds.includes(primaryTrainerId)) {
        return json({ error: 'Define o professor principal do aluno.' }, 400)
      }
      await requireTrainerWhatsApp(primaryTrainerId)

      const { data: existingProfile } = await admin
        .from('profiles')
        .select('id,deleted_at')
        .ilike('email', email)
        .maybeSingle()
      if (existingProfile) {
        return json({ error: existingProfile.deleted_at
          ? 'Este email pertence a uma conta removida. Contacta o Proprietário.'
          : 'Já existe uma conta com este email.' }, 409)
      }

      const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName },
        redirectTo: `${appUrl}/definir-palavra-passe`,
      })
      if (inviteError || !invited.user) throw inviteError ?? new Error('Não foi possível enviar o convite.')

      const authUser = invited.user
      createdAuthUserId = authUser.id
      const { error: metadataError } = await admin.auth.admin.updateUserById(authUser.id, {
        app_metadata: { ...(authUser.app_metadata ?? {}), app_role: 'student' },
        user_metadata: { ...(authUser.user_metadata ?? {}), full_name: fullName },
      })
      if (metadataError) throw metadataError

      const { error: profileError } = await admin
        .from('profiles')
        .update({
          full_name: fullName,
          phone: nullable(phone),
          role: 'student',
          is_active: true,
          deleted_at: null,
        })
        .eq('id', authUser.id)
      if (profileError) throw profileError

      const studentUpdate = {
        nif: nullable(cleanText(payload.nif, 20)),
        birth_date: birthDate,
        sex: normalizeSex(payload.sex),
        occupation: nullable(cleanText(payload.occupation, 160)),
        address: nullable(cleanText(payload.address, 500)),
        citizen_card: nullable(cleanText(payload.citizenCard, 40)),
        postal_code: nullable(cleanText(payload.postalCode, 24)),
        city: nullable(cleanText(payload.city, 120)),
        emergency_contact_name: nullable(cleanText(payload.emergencyContactName, 160)),
        emergency_contact_phone: nullable(cleanPhone(payload.emergencyContactPhone)),
        start_date: cleanText(payload.startDate, 10) || new Date().toISOString().slice(0, 10),
        status: 'active',
        tracking_type: trackingType,
        main_goal: nullable(cleanText(payload.mainGoal, 500)),
        notes: nullable(cleanLongText(payload.notes, 5000)),
        created_by: caller.id,
        archived_at: null,
        deleted_at: null,
      }

      const { data: student, error: studentError } = await admin
        .from('student_profiles')
        .update(studentUpdate)
        .eq('profile_id', authUser.id)
        .select('id,student_number,profile_id')
        .single()
      if (studentError || !student) throw studentError ?? new Error('Perfil do aluno não criado.')

      await replaceAssignments(student.id, trainerIds, primaryTrainerId)

      const { error: invitationError } = await admin.from('student_invitations').insert({
        email,
        full_name: fullName,
        status: 'pending',
        invited_by: caller.id,
        auth_user_id: authUser.id,
        student_id: student.id,
      })
      if (invitationError) throw invitationError

      await admin.from('student_activity_log').insert({
        student_id: student.id,
        actor_id: caller.id,
        action: 'student_created',
        metadata: { tracking_type: trackingType },
      })

      return json({
        ok: true,
        message: `Aluno criado e convite enviado para ${email}.`,
        student: { id: student.id, profileId: student.profile_id, studentNumber: student.student_number },
      })
    }

    const studentId = cleanText(payload.studentId, 64)
    if (!studentId) return json({ error: 'Aluno em falta.' }, 400)
    const student = await getStudent(studentId)
    const manager = await canManage(studentId)
    const self = caller.role === 'student' && caller.id === student.profile_id

    if (action === 'update_profile') {
      if (!manager && !self) return json({ error: 'Não tens permissão para editar este aluno.' }, 403)

      const profilePatch: Record<string, unknown> = {
        full_name: cleanText(payload.fullName, 160) || student.profile.full_name,
        phone: nullable(cleanPhone(payload.phone)),
      }
      const studentPatch: Record<string, unknown> = {
        occupation: nullable(cleanText(payload.occupation, 160)),
        address: nullable(cleanText(payload.address, 500)),
        postal_code: nullable(cleanText(payload.postalCode, 24)),
        city: nullable(cleanText(payload.city, 120)),
        emergency_contact_name: nullable(cleanText(payload.emergencyContactName, 160)),
        emergency_contact_phone: nullable(cleanPhone(payload.emergencyContactPhone)),
      }

      if (manager) {
        Object.assign(studentPatch, {
          nif: nullable(cleanText(payload.nif, 20)),
          birth_date: cleanText(payload.birthDate, 10) || null,
          sex: normalizeSex(payload.sex),
          citizen_card: nullable(cleanText(payload.citizenCard, 40)),
          tracking_type: normalizeTrackingType(payload.trackingType),
          start_date: cleanText(payload.startDate, 10) || student.start_date,
          main_goal: nullable(cleanText(payload.mainGoal, 500)),
          notes: nullable(cleanLongText(payload.notes, 5000)),
        })
      }

      const { error: profileError } = await admin.from('profiles').update(profilePatch).eq('id', student.profile_id)
      if (profileError) throw profileError
      const { error: studentError } = await admin.from('student_profiles').update(studentPatch).eq('id', studentId)
      if (studentError) throw studentError

      await admin.from('student_activity_log').insert({
        student_id: studentId,
        actor_id: caller.id,
        action: self ? 'student_self_profile_updated' : 'student_profile_updated',
      })
      return json({ ok: true, message: 'Perfil atualizado.' })
    }

    if (action === 'set_avatar') {
      if (!manager && !self) return json({ error: 'Não tens permissão para alterar esta fotografia.' }, 403)
      const avatarPath = cleanText(payload.avatarPath, 500)
      const avatarThumbPath = cleanText(payload.avatarThumbPath, 500)
      if (!avatarPath.startsWith(`${studentId}/`) || !avatarThumbPath.startsWith(`${studentId}/`)) {
        return json({ error: 'Caminho da fotografia inválido.' }, 400)
      }
      const { error } = await admin.from('profiles').update({
        avatar_path: avatarPath,
        avatar_thumb_path: avatarThumbPath,
      }).eq('id', student.profile_id)
      if (error) throw error
      return json({ ok: true, message: 'Fotografia atualizada.' })
    }

    if (!manager) return json({ error: 'Não tens permissão para gerir este aluno.' }, 403)

    if (action === 'assign_trainers') {
      if (!['owner', 'admin'].includes(caller.role)) {
        return json({ error: 'A atribuição de professores é reservada à administração.' }, 403)
      }
      await replaceAssignments(
        studentId,
        normalizeTrainerIds(payload.trainerIds),
        cleanText(payload.primaryTrainerId, 64),
      )
      return json({ ok: true, message: 'Professores atribuídos.' })
    }

    if (action === 'resend_access') {
      const { error } = await publicClient.auth.resetPasswordForEmail(student.profile.email, {
        redirectTo: `${appUrl}/definir-palavra-passe`,
      })
      if (error) throw error
      await admin.from('student_invitations').update({
        status: 'pending',
        last_sent_at: new Date().toISOString(),
        last_error: null,
      }).eq('student_id', studentId).in('status', ['pending', 'failed'])
      return json({ ok: true, message: 'Foi enviado um novo link de acesso.' })
    }

    if (action === 'deactivate') {
      const { error: banError } = await admin.auth.admin.updateUserById(student.profile_id, { ban_duration: '876000h' })
      if (banError) throw banError
      await admin.from('profiles').update({ is_active: false }).eq('id', student.profile_id)
      await admin.from('student_profiles').update({ status: 'inactive' }).eq('id', studentId)
      await admin.from('student_activity_log').insert({ student_id: studentId, actor_id: caller.id, action: 'student_deactivated' })
      return json({ ok: true, message: 'Aluno desativado. O histórico foi preservado.' })
    }

    if (action === 'reactivate') {
      const { data: primary } = await admin
        .from('trainer_students')
        .select('trainer_id')
        .eq('student_id', studentId)
        .eq('is_primary', true)
        .is('ended_at', null)
        .single()
      if (!primary?.trainer_id) throw new Error('Define primeiro um professor principal.')
      await requireTrainerWhatsApp(primary.trainer_id)
      const { error: unbanError } = await admin.auth.admin.updateUserById(student.profile_id, { ban_duration: 'none' })
      if (unbanError) throw unbanError
      await admin.from('profiles').update({ is_active: true, deleted_at: null }).eq('id', student.profile_id)
      await admin.from('student_profiles').update({ status: 'active', archived_at: null, deleted_at: null }).eq('id', studentId)
      await admin.from('student_activity_log').insert({ student_id: studentId, actor_id: caller.id, action: 'student_reactivated' })
      return json({ ok: true, message: 'Aluno reativado.' })
    }

    if (action === 'archive') {
      const now = new Date().toISOString()
      const { error: banError } = await admin.auth.admin.updateUserById(student.profile_id, { ban_duration: '876000h' })
      if (banError) throw banError
      await admin.from('profiles').update({ is_active: false }).eq('id', student.profile_id)
      await admin.from('student_profiles').update({ status: 'archived', archived_at: now }).eq('id', studentId)
      await admin.from('student_activity_log').insert({ student_id: studentId, actor_id: caller.id, action: 'student_archived' })
      return json({ ok: true, message: 'Aluno arquivado. Pode ser reativado mais tarde.' })
    }

    if (action === 'delete') {
      if (!['owner', 'admin'].includes(caller.role)) {
        return json({ error: 'A eliminação segura é reservada à administração.' }, 403)
      }
      const now = new Date().toISOString()
      const { error: banError } = await admin.auth.admin.updateUserById(student.profile_id, {
        ban_duration: '876000h',
        app_metadata: { app_role: 'student', removed: true },
      })
      if (banError) throw banError

      await admin.from('trainer_students').update({
        ended_at: now,
        ended_by: caller.id,
        is_primary: false,
        end_reason: 'student_removed',
      }).eq('student_id', studentId).is('ended_at', null)

      await admin.from('profiles').update({ is_active: false, deleted_at: now }).eq('id', student.profile_id)
      await admin.from('student_profiles').update({
        status: 'archived',
        archived_at: now,
        deleted_at: now,
      }).eq('id', studentId)
      await admin.from('student_invitations').update({ status: 'revoked', revoked_at: now }).eq('student_id', studentId).eq('status', 'pending')
      await admin.from('student_activity_log').insert({ student_id: studentId, actor_id: caller.id, action: 'student_safely_removed' })

      return json({ ok: true, message: 'Acesso eliminado com preservação do histórico.' })
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
