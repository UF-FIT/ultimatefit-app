import { supabase } from './supabase';

export const trainerPermissionOptions = [
  { key: 'edit_student_profiles', label: 'Editar dados dos alunos', description: 'Atualizar dados dos alunos que lhe estão atribuídos.' },
  { key: 'manage_assessments', label: 'Avaliações físicas', description: 'Criar e editar avaliações dos alunos atribuídos.' },
  { key: 'manage_workout_plans', label: 'Planos de treino', description: 'Criar, editar e publicar planos próprios.' },
  { key: 'manage_nutrition', label: 'Nutrição', description: 'Adicionar planos e notas de nutrição.' },
  { key: 'manage_goals', label: 'Objetivos', description: 'Definir e acompanhar objetivos.' },
  { key: 'manage_progress_photos', label: 'Fotografias de evolução', description: 'Adicionar e consultar fotografias autorizadas.' },
  { key: 'generate_reports', label: 'Relatórios PDF', description: 'Gerar relatórios para os alunos atribuídos.' },
  { key: 'send_announcements', label: 'Avisos', description: 'Enviar avisos aos alunos atribuídos.' },
  { key: 'manage_challenges', label: 'Desafios', description: 'Gerir participação e registos em desafios.' },
  { key: 'manage_exercise_library', label: 'Biblioteca de exercícios', description: 'Criar e editar exercícios globais.' },
];

export const defaultTrainerPermissions = trainerPermissionOptions
  .filter(item => !['manage_challenges', 'manage_exercise_library'].includes(item.key))
  .map(item => item.key);

export async function fetchTeamMembers() {
  const [{ data: profiles, error: profilesError }, { data: trainerProfiles, error: trainerError }, { data: permissions, error: permissionsError }, { data: invitations, error: invitationsError }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id,email,full_name,first_name,last_name,avatar_path,avatar_thumb_path,role,is_active,created_at,deleted_at')
      .in('role', ['owner', 'admin', 'trainer'])
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    supabase
      .from('trainer_profiles')
      .select('id,profile_id,professional_title,specialties,is_accepting_students,whatsapp_phone,social_url'),
    supabase
      .from('trainer_permissions')
      .select('trainer_id,permission_key,is_granted'),
    supabase
      .from('team_invitations')
      .select('id,email,status,requested_role,auth_user_id,invited_at,accepted_at,revoked_at')
      .order('invited_at', { ascending: false }),
  ]);

  const firstError = profilesError || trainerError || permissionsError || invitationsError;
  if (firstError) throw firstError;

  const trainerByProfile = new Map((trainerProfiles || []).map(item => [item.profile_id, item]));
  const permissionsByTrainer = new Map();
  for (const item of permissions || []) {
    if (!permissionsByTrainer.has(item.trainer_id)) permissionsByTrainer.set(item.trainer_id, []);
    if (item.is_granted) permissionsByTrainer.get(item.trainer_id).push(item.permission_key);
  }

  const latestInviteByUser = new Map();
  for (const invite of invitations || []) {
    if (invite.auth_user_id && !latestInviteByUser.has(invite.auth_user_id)) {
      latestInviteByUser.set(invite.auth_user_id, invite);
    }
  }

  return Promise.all((profiles || []).map(async profile => {
    const trainerProfile = trainerByProfile.get(profile.id);
    let photoUrl = '';
    let thumbUrl = '';
    if (profile.avatar_path) {
      const [{ data: photoData }, { data: thumbData }] = await Promise.all([
        supabase.storage.from('professional-avatars').createSignedUrl(profile.avatar_path, 3600),
        supabase.storage.from('professional-avatars').createSignedUrl(profile.avatar_thumb_path || profile.avatar_path, 3600),
      ]);
      photoUrl = photoData?.signedUrl || '';
      thumbUrl = thumbData?.signedUrl || photoUrl;
    }
    return {
      ...profile,
      photoUrl,
      thumbUrl,
      trainerProfile,
      permissions: trainerProfile ? (permissionsByTrainer.get(trainerProfile.id) || []) : [],
      invitation: latestInviteByUser.get(profile.id) || null,
    };
  }));
}

export async function invokeTeamAction(body) {
  const { data, error } = await supabase.functions.invoke('manage-team-member', { body });
  if (error) {
    let message = error.message || 'Não foi possível concluir a operação.';
    try {
      const context = await error.context?.json?.();
      if (context?.error) message = context.error;
    } catch {
      // Keep the original function error.
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}


export async function updateTrainerWhatsApp(trainerProfileId, whatsappPhone) {
  const cleaned = String(whatsappPhone || '').trim().replace(/[^0-9+]/g, '');
  if (cleaned.length < 9) throw new Error('Indica um número de WhatsApp válido.');
  const { error } = await supabase
    .from('trainer_profiles')
    .update({ whatsapp_phone: cleaned })
    .eq('id', trainerProfileId);
  if (error) throw error;
}
