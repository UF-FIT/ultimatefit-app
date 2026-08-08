import { supabase } from './supabase';
import { optimiseAssessmentPhoto } from './image';

const moduleTables = {
  anamnesis: 'assessment_anamnesis',
  perimetry: 'assessment_perimetry',
  skinfolds: 'assessment_skinfolds',
  bioimpedance: 'assessment_bioimpedance',
  posture: 'assessment_posture',
};

function byAssessment(rows = []) {
  return new Map(rows.map(row => [row.assessment_id, row]));
}

async function signedUrl(path, expiresIn = 3600) {
  if (!path) return '';
  const { data, error } = await supabase.storage.from('assessment-photos').createSignedUrl(path, expiresIn);
  if (error) return '';
  return data?.signedUrl || '';
}

export function assessmentStatusLabel(status) {
  return ({ draft: 'Rascunho', published: 'Publicada', archived: 'Arquivada' })[status] || status;
}

export function activityLevelLabel(value) {
  return ({
    sedentary: 'Sedentário',
    moderately_active: 'Moderadamente ativo',
    active: 'Ativo',
    very_active: 'Muito ativo',
    athlete: 'Atleta',
  })[value] || '—';
}

export function riskResultLabel(value) {
  return ({
    apparently_healthy: 'Aparentemente saudável',
    increased_risk: 'Risco aumentado',
    known_disease: 'Doença conhecida',
    not_assessed: 'Não avaliado',
  })[value] || '—';
}

export function assessmentModuleLabels(assessment) {
  const result = [];
  if (assessment?.modules?.anamnesis) result.push('Anamnese');
  if (assessment?.modules?.perimetry) result.push('Perimetria');
  if (assessment?.modules?.skinfolds) result.push('Dobras cutâneas');
  if (assessment?.modules?.bioimpedance) result.push('TANITA');
  if (assessment?.modules?.posture) result.push('Postura');
  if (assessment?.photos?.length) result.push('Fotografias');
  return result;
}

export function skinfoldSum(skinfolds) {
  if (!skinfolds) return null;
  const keys = ['pectoral_mm','bicipital_mm','tricipital_mm','subscapular_mm','midaxillary_mm','suprailiac_mm','abdominal_mm','thigh_mm','calf_mm'];
  const values = keys.map(key => Number(skinfolds[key])).filter(Number.isFinite);
  return values.length ? values.reduce((a,b)=>a+b,0) : null;
}

export function bmiCategory(value) {
  const bmi = Number(value);
  if (!Number.isFinite(bmi) || bmi <= 0) return '';
  if (bmi < 18.5) return 'Abaixo do peso';
  if (bmi <= 25) return 'Peso normal';
  if (bmi <= 30) return 'Sobrepeso';
  if (bmi < 40) return 'Obesidade';
  return 'Obesidade mórbida';
}

export function assessmentMetrics(assessment) {
  const bio = assessment?.modules?.bioimpedance || {};
  const per = assessment?.modules?.perimetry || {};
  const folds = assessment?.modules?.skinfolds || {};
  return {
    weight: bio.weight_kg ?? null,
    fat: bio.body_fat_pct ?? null,
    muscle: bio.muscle_mass_kg ?? null,
    water: bio.water_pct ?? null,
    visceral: bio.visceral_fat_rating ?? null,
    bmi: bio.bmi ?? null,
    waist: per.waist_cm ?? null,
    hip: per.hip_cm ?? null,
    abdominal: per.abdominal_cm ?? null,
    skinfoldSum: skinfoldSum(folds),
  };
}

export async function fetchAssessments() {
  const { data: headers, error: headerError } = await supabase
    .from('physical_assessments')
    .select('id,student_id,assessor_profile_id,assessment_date,status,general_notes,published_at,created_at,updated_at')
    .order('assessment_date', { ascending: true })
    .order('created_at', { ascending: true });
  if (headerError) {
    if (headerError.code === '42P01') return [];
    throw headerError;
  }
  if (!headers?.length) return [];

  const ids = headers.map(item => item.id);
  const [anamnesisRes, perimetryRes, skinfoldsRes, bioRes, postureRes, photosRes] = await Promise.all([
    supabase.from('assessment_anamnesis').select('*').in('assessment_id', ids),
    supabase.from('assessment_perimetry').select('*').in('assessment_id', ids),
    supabase.from('assessment_skinfolds').select('*').in('assessment_id', ids),
    supabase.from('assessment_bioimpedance').select('*').in('assessment_id', ids),
    supabase.from('assessment_posture').select('*').in('assessment_id', ids),
    supabase.from('assessment_photos').select('*').in('assessment_id', ids).order('created_at', { ascending: true }),
  ]);
  const firstError = anamnesisRes.error || perimetryRes.error || skinfoldsRes.error || bioRes.error || postureRes.error || photosRes.error;
  if (firstError) throw firstError;

  const maps = {
    anamnesis: byAssessment(anamnesisRes.data),
    perimetry: byAssessment(perimetryRes.data),
    skinfolds: byAssessment(skinfoldsRes.data),
    bioimpedance: byAssessment(bioRes.data),
    posture: byAssessment(postureRes.data),
  };

  const photosByAssessment = new Map();
  for (const photo of photosRes.data || []) {
    if (!photosByAssessment.has(photo.assessment_id)) photosByAssessment.set(photo.assessment_id, []);
    photosByAssessment.get(photo.assessment_id).push(photo);
  }

  return Promise.all(headers.map(async header => {
    const photos = await Promise.all((photosByAssessment.get(header.id) || []).map(async photo => ({
      ...photo,
      imageUrl: await signedUrl(photo.image_path),
      thumbUrl: await signedUrl(photo.thumb_path || photo.image_path),
    })));
    const assessment = {
      id: header.id,
      studentId: header.student_id,
      assessorProfileId: header.assessor_profile_id,
      date: header.assessment_date,
      status: header.status,
      notes: header.general_notes || '',
      publishedAt: header.published_at,
      createdAt: header.created_at,
      updatedAt: header.updated_at,
      modules: {
        anamnesis: maps.anamnesis.get(header.id) || null,
        perimetry: maps.perimetry.get(header.id) || null,
        skinfolds: maps.skinfolds.get(header.id) || null,
        bioimpedance: maps.bioimpedance.get(header.id) || null,
        posture: maps.posture.get(header.id) || null,
      },
      photos,
    };
    return { ...assessment, ...assessmentMetrics(assessment) };
  }));
}

function cleanModule(value = {}) {
  const output = {};
  for (const [key, raw] of Object.entries(value)) {
    if (raw === '' || raw === undefined) output[key] = null;
    else output[key] = raw;
  }
  return output;
}

async function upsertModule(table, assessmentId, payload, extra = {}) {
  const clean = cleanModule(payload);
  const { error } = await supabase.from(table).upsert({ assessment_id: assessmentId, ...extra, ...clean }, { onConflict: 'assessment_id' });
  if (error) throw error;
}

async function removeModule(table, assessmentId) {
  const { error } = await supabase.from(table).delete().eq('assessment_id', assessmentId);
  if (error) throw error;
}

export async function saveAssessment({ id, studentId, date, notes, modules }) {
  if (!studentId) throw new Error('Seleciona o aluno.');
  if (!date) throw new Error('Indica a data da avaliação.');

  let assessmentId = id;
  if (assessmentId) {
    const { error } = await supabase.from('physical_assessments').update({ assessment_date: date, general_notes: notes || null }).eq('id', assessmentId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from('physical_assessments')
      .insert({ student_id: studentId, assessment_date: date, status: 'draft', general_notes: notes || null })
      .select('id')
      .single();
    if (error) throw error;
    assessmentId = data.id;
  }

  for (const [key, table] of Object.entries(moduleTables)) {
    const value = modules?.[key];
    if (value) await upsertModule(table, assessmentId, value, key === 'anamnesis' ? { student_id: studentId } : {});
    else await removeModule(table, assessmentId);
  }

  return assessmentId;
}

export async function publishAssessment(assessmentId) {
  const { data, error } = await supabase.rpc('publish_physical_assessment', { target_assessment_id: assessmentId });
  if (error) throw error;
  return data;
}

export async function archiveAssessment(id) {
  const { error } = await supabase.from('physical_assessments').update({ status: 'archived' }).eq('id', id);
  if (error) throw error;
}

export async function deleteDraftAssessment(id) {
  const { error } = await supabase.from('physical_assessments').delete().eq('id', id).eq('status', 'draft');
  if (error) throw error;
}

export async function deleteAssessmentPermanently(assessment) {
  if (!assessment?.id) throw new Error('Avaliação inválida.');
  const paths = [...new Set((assessment.photos || []).flatMap(photo => [photo.image_path, photo.thumb_path]).filter(Boolean))];
  if (paths.length) {
    const { error: storageError } = await supabase.storage.from('assessment-photos').remove(paths);
    if (storageError) throw new Error(`Não foi possível eliminar as fotografias da avaliação: ${storageError.message}`);
  }
  const { error } = await supabase.rpc('delete_physical_assessment_permanently', { target_assessment_id: assessment.id });
  if (error) throw error;
}

export async function uploadAssessmentPhoto({ studentId, assessmentId, photoType, file, caption = '' }) {
  if (!file) return null;
  const optimised = await optimiseAssessmentPhoto(file);
  const stamp = Date.now();
  const safeType = String(photoType || 'other').replace(/[^a-z0-9_-]/gi, '-');
  const imagePath = `${studentId}/${assessmentId}/${safeType}-${stamp}.webp`;
  const thumbPath = `${studentId}/${assessmentId}/${safeType}-${stamp}-thumb.webp`;

  const [fullUpload, thumbUpload] = await Promise.all([
    supabase.storage.from('assessment-photos').upload(imagePath, optimised.image, { contentType: 'image/webp', cacheControl: '3600', upsert: false }),
    supabase.storage.from('assessment-photos').upload(thumbPath, optimised.thumb, { contentType: 'image/webp', cacheControl: '3600', upsert: false }),
  ]);
  const uploadError = fullUpload.error || thumbUpload.error;
  if (uploadError) throw uploadError;

  const { data, error } = await supabase.from('assessment_photos').insert({
    assessment_id: assessmentId,
    student_id: studentId,
    photo_type: photoType,
    image_path: imagePath,
    thumb_path: thumbPath,
    caption: caption || null,
  }).select().single();
  if (error) throw error;
  return data;
}

export async function removeAssessmentPhoto(photo) {
  if (!photo?.id) return;
  const paths = [photo.image_path, photo.thumb_path].filter(Boolean);
  if (paths.length) await supabase.storage.from('assessment-photos').remove(paths);
  const { error } = await supabase.from('assessment_photos').delete().eq('id', photo.id);
  if (error) throw error;
}
