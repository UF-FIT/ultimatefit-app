import { supabase } from './supabase';
import { optimiseStudentAvatar } from './image';

function cleanSocialUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^@[A-Za-z0-9._]+$/.test(raw)) return `https://instagram.com/${raw.slice(1)}`;
  if (/^[A-Za-z0-9._]+$/.test(raw) && !raw.includes('.')) return `https://instagram.com/${raw}`;
  try {
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(candidate).toString();
  } catch {
    throw new Error('Indica um endereço de rede social válido.');
  }
}

async function signedProfessionalUrl(path, expires = 3600) {
  if (!path) return '';
  const { data, error } = await supabase.storage
    .from('professional-avatars')
    .createSignedUrl(path, expires);
  if (error) return '';
  return data?.signedUrl || '';
}

export async function fetchProfessionalProfile(profileId) {
  const [{ data: profile, error: profileError }, { data: trainer, error: trainerError }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id,email,full_name,first_name,last_name,phone,avatar_path,avatar_thumb_path,role,is_active,deleted_at')
      .eq('id', profileId)
      .single(),
    supabase
      .from('trainer_profiles')
      .select('id,profile_id,professional_title,biography,whatsapp_phone,social_url,is_accepting_students')
      .eq('profile_id', profileId)
      .single(),
  ]);
  if (profileError) throw profileError;
  if (trainerError) throw trainerError;

  const [photoUrl, thumbUrl] = await Promise.all([
    signedProfessionalUrl(profile.avatar_path),
    signedProfessionalUrl(profile.avatar_thumb_path || profile.avatar_path),
  ]);

  return {
    ...profile,
    firstName: profile.first_name || profile.full_name?.split(' ')[0] || '',
    lastName: profile.last_name || profile.full_name?.split(' ').slice(1).join(' ') || '',
    photoUrl,
    thumbUrl,
    trainerProfileId: trainer.id,
    professionalTitle: trainer.professional_title || 'Personal Trainer',
    biography: trainer.biography || '',
    whatsappPhone: trainer.whatsapp_phone || '',
    socialUrl: trainer.social_url || '',
    isAcceptingStudents: trainer.is_accepting_students,
  };
}

export async function updateProfessionalProfile({ profileId, trainerProfileId, firstName, lastName, whatsappPhone, professionalTitle, biography, socialUrl }) {
  const cleanFirst = String(firstName || '').trim().replace(/\s+/g, ' ');
  const cleanLast = String(lastName || '').trim().replace(/\s+/g, ' ');
  const fullName = [cleanFirst, cleanLast].filter(Boolean).join(' ');
  const cleanWhatsapp = String(whatsappPhone || '').trim().replace(/[^0-9+]/g, '');
  const normalizedSocial = cleanSocialUrl(socialUrl);

  if (cleanFirst.length < 2) throw new Error('Indica o teu nome.');
  if (cleanLast.length < 2) throw new Error('Indica o teu apelido.');
  if (cleanWhatsapp.length < 9) throw new Error('Indica um número de WhatsApp profissional válido.');

  const [{ error: profileError }, { error: trainerError }] = await Promise.all([
    supabase
      .from('profiles')
      .update({ first_name: cleanFirst, last_name: cleanLast, full_name: fullName })
      .eq('id', profileId),
    supabase
      .from('trainer_profiles')
      .update({
        whatsapp_phone: cleanWhatsapp,
        professional_title: String(professionalTitle || '').trim().slice(0, 120) || 'Personal Trainer',
        biography: String(biography || '').trim().slice(0, 1500) || null,
        social_url: normalizedSocial || null,
      })
      .eq('id', trainerProfileId),
  ]);

  if (profileError) throw profileError;
  if (trainerError) throw trainerError;
  return { fullName, socialUrl: normalizedSocial };
}

export async function uploadProfessionalAvatar(profileId, file) {
  if (!file) return null;
  const optimised = await optimiseStudentAvatar(file);
  const avatarPath = `${profileId}/profile.webp`;
  const avatarThumbPath = `${profileId}/thumb.webp`;

  const [profileUpload, thumbUpload] = await Promise.all([
    supabase.storage.from('professional-avatars').upload(avatarPath, optimised.profile, {
      contentType: 'image/webp',
      cacheControl: '3600',
      upsert: true,
    }),
    supabase.storage.from('professional-avatars').upload(avatarThumbPath, optimised.thumb, {
      contentType: 'image/webp',
      cacheControl: '3600',
      upsert: true,
    }),
  ]);
  const uploadError = profileUpload.error || thumbUpload.error;
  if (uploadError) throw uploadError;

  const { error } = await supabase
    .from('profiles')
    .update({ avatar_path: avatarPath, avatar_thumb_path: avatarThumbPath })
    .eq('id', profileId);
  if (error) throw error;
  return { avatarPath, avatarThumbPath };
}

export function socialDisplay(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('instagram.com')) {
      const handle = parsed.pathname.split('/').filter(Boolean)[0];
      return handle ? `@${handle}` : 'Instagram';
    }
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
