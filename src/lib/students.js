import { supabase } from './supabase';
import { optimiseStudentAvatar } from './image';

export const trackingTypeOptions = [
  { value: 'personal_training', label: 'Treino Personalizado' },
  { value: 'online_training', label: 'Treino Online' },
  { value: 'home_training', label: 'Treino ao Domicílio' },
  { value: 'group_classes', label: 'Aulas de Grupo do Estúdio' },
];

export const studentStatusLabels = {
  active: 'Ativo',
  inactive: 'Inativo',
  paused: 'Pausado',
  archived: 'Arquivado',
  removed: 'Removido',
};

export const sexOptions = [
  { value: 'female', label: 'Feminino' },
  { value: 'male', label: 'Masculino' },
  { value: 'other', label: 'Outro' },
  { value: 'prefer_not_to_say', label: 'Prefere não indicar' },
];

export function formatStudentNumber(value) {
  if (!value) return '—';
  return `UF-${String(value).padStart(5, '0')}`;
}

export function calculateAge(birthDate) {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const beforeBirthday = today.getMonth() < birth.getMonth()
    || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function mapBy(items, key) {
  return new Map((items || []).map(item => [item[key], item]));
}

async function signedUrl(path, expires = 3600) {
  if (!path) return '';
  const { data, error } = await supabase.storage.from('student-avatars').createSignedUrl(path, expires);
  if (error) return '';
  return data?.signedUrl || '';
}

export async function fetchStudents() {
  const { data: studentRows, error: studentError } = await supabase
    .from('student_profiles')
    .select('id,profile_id,student_number,nif,birth_date,sex,occupation,address,emergency_contact_name,start_date,status,notes,postal_code,city,tracking_type,archived_at,deleted_at,created_at')
    .order('student_number', { ascending: true });
  if (studentError) throw studentError;
  if (!studentRows?.length) return [];

  const profileIds = studentRows.map(item => item.profile_id);
  const studentIds = studentRows.map(item => item.id);

  const [profilesResult, assignmentsResult, invitesResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id,email,full_name,phone,avatar_path,avatar_thumb_path,is_active,deleted_at,created_at')
      .in('id', profileIds),
    supabase
      .from('trainer_students')
      .select('id,trainer_id,student_id,is_primary,assigned_at')
      .in('student_id', studentIds)
      .is('ended_at', null),
    supabase
      .from('student_invitations')
      .select('id,email,status,student_id,invited_at,accepted_at,last_sent_at')
      .in('student_id', studentIds)
      .order('invited_at', { ascending: false }),
  ]);

  const firstError = profilesResult.error || assignmentsResult.error || invitesResult.error;
  if (firstError) throw firstError;

  const assignments = assignmentsResult.data || [];
  const trainerIds = [...new Set(assignments.map(item => item.trainer_id))];
  let trainerProfiles = [];
  let trainerUserProfiles = [];
  if (trainerIds.length) {
    const trainerResult = await supabase
      .from('trainer_profiles')
      .select('id,profile_id,professional_title,whatsapp_phone,is_accepting_students')
      .in('id', trainerIds);
    if (trainerResult.error) throw trainerResult.error;
    trainerProfiles = trainerResult.data || [];
    const trainerProfileUserIds = trainerProfiles.map(item => item.profile_id);
    if (trainerProfileUserIds.length) {
      const userResult = await supabase
        .from('profiles')
        .select('id,full_name,email,is_active,deleted_at')
        .in('id', trainerProfileUserIds);
      if (userResult.error) throw userResult.error;
      trainerUserProfiles = userResult.data || [];
    }
  }

  const profileById = mapBy(profilesResult.data, 'id');
  const trainerById = mapBy(trainerProfiles, 'id');
  const trainerUserById = mapBy(trainerUserProfiles, 'id');
  const latestInviteByStudent = new Map();
  for (const invite of invitesResult.data || []) {
    if (!latestInviteByStudent.has(invite.student_id)) latestInviteByStudent.set(invite.student_id, invite);
  }

  return Promise.all(studentRows.map(async row => {
    const profile = profileById.get(row.profile_id) || {};
    const studentAssignments = assignments.filter(item => item.student_id === row.id);
    const trainers = studentAssignments.map(assignment => {
      const trainerProfile = trainerById.get(assignment.trainer_id) || {};
      const trainerUser = trainerUserById.get(trainerProfile.profile_id) || {};
      return {
        assignmentId: assignment.id,
        trainerProfileId: assignment.trainer_id,
        profileId: trainerProfile.profile_id,
        name: trainerUser.full_name || 'Professor',
        email: trainerUser.email || '',
        whatsappPhone: trainerProfile.whatsapp_phone || '',
        professionalTitle: trainerProfile.professional_title || 'Personal Trainer',
        isPrimary: assignment.is_primary,
        assignedAt: assignment.assigned_at,
      };
    });
    const primaryTrainer = trainers.find(item => item.isPrimary) || trainers[0] || null;
    const [photoUrl, thumbUrl] = await Promise.all([
      signedUrl(profile.avatar_path),
      signedUrl(profile.avatar_thumb_path || profile.avatar_path),
    ]);

    return {
      id: row.id,
      profileId: row.profile_id,
      userId: row.profile_id,
      studentNumber: row.student_number,
      studentCode: formatStudentNumber(row.student_number),
      name: profile.full_name || profile.email || 'Aluno',
      email: profile.email || '',
      phone: profile.phone || '',
      photoUrl,
      thumbUrl,
      avatarPath: profile.avatar_path || '',
      avatarThumbPath: profile.avatar_thumb_path || '',
      birth: row.birth_date,
      age: calculateAge(row.birth_date),
      sex: row.sex,
      nif: row.nif || '',
      occupation: row.occupation || '',
      address: row.address || '',
      postalCode: row.postal_code || '',
      city: row.city || '',
      emergencyContactName: row.emergency_contact_name || '',
      startDate: row.start_date,
      status: row.status,
      active: Boolean(profile.is_active && row.status === 'active' && !profile.deleted_at && !row.deleted_at),
      trackingType: row.tracking_type || '',
      notes: row.notes || '',
      archivedAt: row.archived_at,
      deletedAt: row.deleted_at || profile.deleted_at,
      trainerIds: trainers.map(item => item.profileId),
      trainerProfileIds: trainers.map(item => item.trainerProfileId),
      trainers,
      primaryTrainer,
      invitation: latestInviteByStudent.get(row.id) || null,
    };
  }));
}

export async function fetchAvailableTrainers() {
  const { data: trainerProfiles, error: trainerError } = await supabase
    .from('trainer_profiles')
    .select('id,profile_id,professional_title,whatsapp_phone,is_accepting_students');
  if (trainerError) throw trainerError;
  const profileIds = (trainerProfiles || []).map(item => item.profile_id);
  if (!profileIds.length) return [];
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id,full_name,email,role,is_active,deleted_at')
    .in('id', profileIds)
    .in('role', ['owner', 'admin', 'trainer']);
  if (profileError) throw profileError;
  const profileById = mapBy(profiles, 'id');
  return (trainerProfiles || [])
    .map(item => ({ ...item, profile: profileById.get(item.profile_id) }))
    .filter(item => item.profile?.is_active && !item.profile?.deleted_at)
    .map(item => ({
      trainerProfileId: item.id,
      profileId: item.profile_id,
      name: item.profile.full_name,
      email: item.profile.email,
      role: item.profile.role,
      professionalTitle: item.professional_title || 'Personal Trainer',
      whatsappPhone: item.whatsapp_phone || '',
      isAcceptingStudents: item.is_accepting_students,
    }));
}

export async function invokeStudentAction(body) {
  const { data, error } = await supabase.functions.invoke('manage-student', { body });
  if (error) {
    let message = error.message || 'Não foi possível concluir a operação.';
    try {
      const context = await error.context?.json?.();
      if (context?.error) message = context.error;
    } catch {
      // Keep original message.
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function uploadStudentAvatar(studentId, file) {
  if (!file) return null;
  const optimised = await optimiseStudentAvatar(file);
  const avatarPath = `${studentId}/profile.webp`;
  const avatarThumbPath = `${studentId}/thumb.webp`;

  const [profileUpload, thumbUpload] = await Promise.all([
    supabase.storage.from('student-avatars').upload(avatarPath, optimised.profile, {
      contentType: 'image/webp',
      cacheControl: '3600',
      upsert: true,
    }),
    supabase.storage.from('student-avatars').upload(avatarThumbPath, optimised.thumb, {
      contentType: 'image/webp',
      cacheControl: '3600',
      upsert: true,
    }),
  ]);

  const uploadError = profileUpload.error || thumbUpload.error;
  if (uploadError) throw uploadError;

  await invokeStudentAction({ action: 'set_avatar', studentId, avatarPath, avatarThumbPath });
  return { avatarPath, avatarThumbPath };
}

export function buildStudentAccessMessage(student) {
  const firstName = student.name?.split(' ')[0] || 'Olá';
  const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://ultimatefit-app.vercel.app';
  return `${firstName}, a tua conta na ULTIMATE FIT APP está preparada.\n\nAcesso: ${appUrl}\nEmail: ${student.email}\n\n1. Abre o email enviado pela ULTIMATE FIT e define a tua palavra-passe.\n2. Entra na app com o email acima.\n3. Caso não te recordes da password, usa “Esqueci-me da palavra-passe”.\n\nPara instalar no telemóvel:\n• iPhone/Safari: Partilhar → Adicionar ao ecrã principal.\n• Android/Chrome: menu ⋮ → Instalar aplicação ou Adicionar ao ecrã principal.\n\nNa app poderás consultar avaliações, plano de treino e plano alimentar.`;
}

export function whatsappUrl(phone, message = '') {
  let clean = String(phone || '').replace(/\D/g, '');
  if (!clean) return '';
  if (clean.length === 9 && clean.startsWith('9')) clean = `351${clean}`;
  return `https://wa.me/${clean}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}

