import { supabase } from './supabase';
import { automaticStretchingCatalog as fallbackCatalog } from './stretching';

const SETTING_KEY = 'automatic_stretching_catalog';
const MEDIA_BUCKET = 'exercise-media';

function publicMediaUrl(path = '') {
  if (!path || !supabase) return '';
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl || '';
}

function normaliseStretch(stored = {}, fallback) {
  const mediaPath = stored.mediaPath || '';
  const externalMediaUrl = stored.externalMediaUrl || '';
  const mediaKind = stored.mediaKind || '';
  const customMediaUrl = externalMediaUrl || publicMediaUrl(mediaPath);
  const mediaUrl = customMediaUrl || stored.image || fallback.image || '';

  return {
    ...fallback,
    ...stored,
    key: fallback.key,
    title: stored.title || fallback.title,
    subtitle: stored.subtitle || fallback.subtitle,
    description: stored.description || fallback.description,
    image: mediaUrl || fallback.image,
    mediaPath,
    mediaKind,
    externalMediaUrl,
    mediaUrl,
  };
}

export function defaultAutomaticStretchingCatalog() {
  return fallbackCatalog.map(item => normaliseStretch({}, item));
}

export async function fetchAutomaticStretchingCatalog() {
  if (!supabase) return defaultAutomaticStretchingCatalog();

  const { data, error } = await supabase
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', SETTING_KEY)
    .maybeSingle();

  if (error) {
    // The automatic catalogue is an enhancement. Keep the app usable with the
    // built-in defaults if settings are temporarily unavailable.
    console.warn('Automatic stretching settings unavailable:', error.message);
    return defaultAutomaticStretchingCatalog();
  }

  const stored = Array.isArray(data?.setting_value) ? data.setting_value : [];
  return fallbackCatalog.map(fallback => {
    const override = stored.find(item => item?.key === fallback.key) || {};
    return normaliseStretch(override, fallback);
  });
}

export async function saveAutomaticStretchingCatalog(catalog) {
  if (!supabase) throw new Error('Supabase indisponível.');

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;

  const payload = fallbackCatalog.map(fallback => {
    const item = catalog.find(stretch => stretch.key === fallback.key) || fallback;
    return {
      key: fallback.key,
      title: String(item.title || fallback.title).trim(),
      subtitle: String(item.subtitle || fallback.subtitle).trim(),
      description: String(item.description || fallback.description).trim(),
      mediaPath: item.mediaPath || '',
      mediaKind: item.mediaKind || '',
      externalMediaUrl: String(item.externalMediaUrl || '').trim(),
    };
  });

  const { error } = await supabase
    .from('app_settings')
    .upsert({
      setting_key: SETTING_KEY,
      setting_value: payload,
      updated_by: authData?.user?.id || null,
    }, { onConflict: 'setting_key' });

  if (error) throw error;
  return fetchAutomaticStretchingCatalog();
}

export function automaticStretchToExercise(stretch) {
  return {
    id: `automatic-stretch-${stretch.key}`,
    name: stretch.title,
    description: stretch.description || '',
    group: 'Alongamentos automáticos',
    equipment: 'Sem equipamento',
    category: 'Alongamento automático',
    mediaPath: stretch.mediaPath || '',
    mediaKind: stretch.mediaKind || '',
    externalMediaUrl: stretch.externalMediaUrl || '',
    mediaUrl: stretch.mediaUrl || stretch.externalMediaUrl || stretch.image || '',
    active: true,
  };
}
