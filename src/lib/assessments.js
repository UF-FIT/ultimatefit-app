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

async function signedProfessionalUrl(path, expiresIn = 3600) {
  if (!path) return '';
  const { data, error } = await supabase.storage.from('professional-avatars').createSignedUrl(path, expiresIn);
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


export const assessmentReferences = {
  activity: 'World Health Organization. Guidelines on physical activity and sedentary behaviour. Geneva: WHO; 2020. Enquadramento complementar: recomendações ACSM/CDC para atividade física em adultos.',
  risk: 'Estratificação auxiliar baseada no modelo clássico de fatores de risco do ACSM. Atualização de segurança: Riebe D, Franklin BA, Thompson PD, et al. Med Sci Sports Exerc. 2015;47(11):2473–2479. doi:10.1249/MSS.0000000000000664 — o algoritmo ACSM atual deixou de usar a simples contagem de fatores de risco para decidir autorização médica.',
  bodyFat: 'Gallagher D, Heymsfield SB, Heo M, Jebb SA, Murgatroyd PR, Sakamoto Y. Am J Clin Nutr. 2000;72(3):694–701. doi:10.1093/ajcn/72.3.694.',
};

export function activityLevelDescription(value) {
  return ({
    sedentary: 'Não pratica atividade física regular.',
    moderately_active: 'Pratica atividade física 1–2 dias por semana, cerca de 30 minutos por dia.',
    active: 'Pratica atividade física 3 dias por semana, pelo menos 30 minutos por dia.',
    very_active: 'Pratica atividade física 4–5 dias por semana, pelo menos 30 minutos por dia.',
    athlete: 'Realiza exercício vigoroso diariamente ou apresenta volume de treino equivalente a perfil de atleta.',
  })[value] || '';
}

const riskFactorKeys = [
  'risk_dyslipidemia','risk_hypertension','risk_family_history','risk_obesity',
  'risk_smoking','risk_sedentary','risk_fasting_glucose',
];
const knownDiseaseKeys = ['known_cardiovascular','known_pulmonary','known_metabolic'];

export function automaticRiskSummary(anamnesis = {}) {
  const requiredKeys = [...riskFactorKeys, 'protective_high_hdl', ...knownDiseaseKeys];
  const complete = requiredKeys.every(key => anamnesis[key] === true || anamnesis[key] === false);
  const positives = riskFactorKeys.filter(key => anamnesis[key] === true).length;
  const protective = anamnesis.protective_high_hdl === true ? 1 : 0;
  const adjustedScore = Math.max(0, positives - protective);
  const knownDisease = knownDiseaseKeys.some(key => anamnesis[key] === true);
  const result = !complete ? 'not_assessed' : knownDisease ? 'known_disease' : adjustedScore >= 2 ? 'increased_risk' : 'apparently_healthy';
  return { result, complete, positives, protective, adjustedScore, knownDisease };
}

export function automaticRiskResult(anamnesis = {}) {
  return automaticRiskSummary(anamnesis).result;
}

export const bodyFatReferenceTable = {
  male: [
    { minAge:20, maxAge:39, low:8, healthyMax:20, overweightMax:25 },
    { minAge:40, maxAge:59, low:11, healthyMax:22, overweightMax:28 },
    { minAge:60, maxAge:79, low:13, healthyMax:25, overweightMax:30 },
  ],
  female: [
    { minAge:20, maxAge:39, low:21, healthyMax:33, overweightMax:39 },
    { minAge:40, maxAge:59, low:23, healthyMax:34, overweightMax:40 },
    { minAge:60, maxAge:79, low:24, healthyMax:36, overweightMax:42 },
  ],
};

export function ageAtAssessment(birthDate, assessmentDate) {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T12:00:00`);
  const ref = assessmentDate ? new Date(`${assessmentDate}T12:00:00`) : new Date();
  if (Number.isNaN(birth.getTime()) || Number.isNaN(ref.getTime())) return null;
  let age = ref.getFullYear() - birth.getFullYear();
  const beforeBirthday = ref.getMonth() < birth.getMonth() || (ref.getMonth() === birth.getMonth() && ref.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

export function bodyFatReference(age, sex) {
  const normalizedSex = sex === 'Masculino' ? 'male' : sex === 'Feminino' ? 'female' : sex;
  const rows = bodyFatReferenceTable[normalizedSex];
  const numericAge = Number(age);
  if (!rows || !Number.isFinite(numericAge)) return null;
  return rows.find(row => numericAge >= row.minAge && numericAge <= row.maxAge) || null;
}

export function bodyFatCategory(value, age, sex) {
  const fat = Number(value);
  const ref = bodyFatReference(age, sex);
  if (!Number.isFinite(fat) || fat < 0 || !ref) return '';
  if (fat < ref.low) return 'Baixo';
  if (fat <= ref.healthyMax) return 'Normal/Saudável';
  if (fat <= ref.overweightMax) return 'Sobrepeso';
  return 'Obeso';
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

  const assessorIds = [...new Set(headers.map(item => item.assessor_profile_id).filter(Boolean))];
  const assessorById = new Map();
  if (assessorIds.length) {
    const [profileRes, trainerRes] = await Promise.all([
      supabase.from('profiles').select('id,full_name,first_name,last_name,email,phone,avatar_path,avatar_thumb_path').in('id', assessorIds),
      supabase.from('trainer_profiles').select('profile_id,professional_title,whatsapp_phone,social_url').in('profile_id', assessorIds),
    ]);
    const trainerByProfile = new Map((trainerRes.data || []).map(item => [item.profile_id, item]));
    const assessorEntries = await Promise.all((profileRes.data || []).map(async profile => {
      const trainer = trainerByProfile.get(profile.id) || {};
      const [photoUrl, thumbUrl] = await Promise.all([
        signedProfessionalUrl(profile.avatar_path),
        signedProfessionalUrl(profile.avatar_thumb_path || profile.avatar_path),
      ]);
      return [profile.id, {
        id: profile.id,
        name: profile.full_name || [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Professor ULTIMATE FIT',
        firstName: profile.first_name || '',
        lastName: profile.last_name || '',
        email: profile.email || '',
        phone: trainer.whatsapp_phone || profile.phone || '',
        professionalTitle: trainer.professional_title || 'Personal Trainer',
        socialUrl: trainer.social_url || '',
        photoUrl,
        thumbUrl: thumbUrl || photoUrl,
      }];
    }));
    assessorEntries.forEach(([id, value]) => assessorById.set(id, value));
  }

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
      assessor: assessorById.get(header.assessor_profile_id) || null,
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
