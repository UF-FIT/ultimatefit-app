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
  bodyFat: 'TANITA RD-953. Faixas de gordura corporal por sexo e idade: Baixo, Saudável — faixa inferior, Saudável — faixa superior, Excesso de gordura e Obesidade. As duas faixas “Saudável” correspondem ao intervalo saudável TANITA. Base indicada pelo fabricante: Gallagher D, Heymsfield SB, Heo M, Jebb SA, Murgatroyd PR, Sakamoto Y. Am J Clin Nutr. 2000;72(3):694–701. doi:10.1093/ajcn/72.3.694; orientações NIH/WHO de IMC.',
  weight: 'World Health Organization / WHO Europe. BMI em adultos: <18,5 baixo peso; 18,5–24,9 peso normal; 25,0–29,9 excesso de peso; ≥30 obesidade.',
  water: 'TANITA DC-360 / Understanding your measurements. Água corporal total em adultos: mulheres 45–60%; homens 50–65%. Deve ser interpretada como referência e acompanhada ao longo do tempo.',
  visceral: 'TANITA DC-360. Visceral Fat Rating: 1–12 = faixa saudável; 13–59 = excesso de gordura visceral. Não constitui diagnóstico médico.',
  bone: 'TANITA DC-360 / RD-953. Massa óssea estimada: comparação com médias por sexo e peso; não mede densidade, resistência óssea nem risco de fratura.',
  muscle: 'Enquadramento complementar pela massa isenta de gordura ajustada à altura (FFMI), com percentis por sexo e idade de Schutz Y, Kyle UUG, Pichard C. Int J Obes Relat Metab Disord. 2002;26(7):953–960. doi:10.1038/sj.ijo.0802033. O FFMI é um indicador de massa magra total, não o Muscle Score TANITA nem uma medição direta de músculo esquelético.',
  metabolism: 'Comparação do metabolismo basal TANITA com a estimativa de gasto energético de repouso pela equação de Mifflin–St Jeor: Mifflin MD, St Jeor ST, Hill LA, Scott BJ, Daugherty SA, Koh YO. Am J Clin Nutr. 1990;51(2):241–247. doi:10.1093/ajcn/51.2.241. O intervalo comparativo de ±10% é usado em estudos de validação como critério de concordância de previsões, não como diagnóstico clínico. Frankenfield D, Roth-Yousey L, Compher C. J Am Diet Assoc. 2005;105(5):775–789. doi:10.1016/j.jada.2005.02.005.',
  biaCaution: 'A bioimpedância varia com hidratação, exercício, refeições e outras condições. Comparar preferencialmente medições realizadas em condições semelhantes.',
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
    { minAge:20, maxAge:39, low:8, standardPlus:14, overfat:20, obese:25 },
    { minAge:40, maxAge:59, low:11, standardPlus:17, overfat:22, obese:28 },
    { minAge:60, maxAge:99, low:13, standardPlus:19, overfat:25, obese:30 },
  ],
  female: [
    { minAge:20, maxAge:39, low:21, standardPlus:27, overfat:33, obese:39 },
    { minAge:40, maxAge:59, low:23, standardPlus:29, overfat:34, obese:40 },
    { minAge:60, maxAge:99, low:24, standardPlus:30, overfat:36, obese:42 },
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
  if (fat < ref.standardPlus) return 'Saudável · faixa inferior';
  if (fat < ref.overfat) return 'Saudável · faixa superior';
  if (fat < ref.obese) return 'Excesso de gordura';
  return 'Obesidade';
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
  if (bmi < 25) return 'Peso normal';
  if (bmi < 30) return 'Excesso de peso';
  if (bmi < 35) return 'Obesidade grau I';
  if (bmi < 40) return 'Obesidade grau II';
  return 'Obesidade grau III';
}

function normalizedSex(sex) {
  if (sex === 'Masculino' || sex === 'male' || sex === 'M') return 'male';
  if (sex === 'Feminino' || sex === 'female' || sex === 'F') return 'female';
  return '';
}

export function effectiveBmi(bio = {}) {
  const height = Number(bio?.height_cm);
  const weight = Number(bio?.weight_kg);
  if (Number.isFinite(height) && height > 0 && Number.isFinite(weight) && weight > 0) {
    return weight / ((height / 100) ** 2);
  }
  const entered = Number(bio?.bmi);
  return Number.isFinite(entered) && entered > 0 ? entered : null;
}

export function bodyWaterCategory(value, age, sex) {
  const water = Number(value);
  const years = Number(age);
  const sx = normalizedSex(sex);
  if (!Number.isFinite(water) || water <= 0 || !Number.isFinite(years) || years < 18 || !sx) return '';
  const min = sx === 'female' ? 45 : 50;
  const max = sx === 'female' ? 60 : 65;
  if (water < min) return 'Abaixo do intervalo esperado';
  if (water <= max) return 'Dentro do intervalo esperado';
  return 'Acima do intervalo esperado';
}

export function visceralFatCategory(value, age) {
  const rating = Number(value);
  const years = Number(age);
  if (!Number.isFinite(rating) || rating <= 0 || !Number.isFinite(years) || years < 18) return '';
  if (rating < 13) return 'Nível saudável';
  return 'Nível elevado';
}

export function boneMassReference(weight, sex) {
  const kg = Number(weight);
  const sx = normalizedSex(sex);
  if (!Number.isFinite(kg) || kg <= 0 || !sx) return null;
  if (sx === 'female') {
    if (kg < 50) return 1.95;
    if (kg < 75) return 2.40;
    return 2.95;
  }
  if (kg < 65) return 2.66;
  if (kg < 95) return 3.29;
  return 3.69;
}

export function boneMassContext(value, weight, sex) {
  const measured = Number(value);
  const ref = boneMassReference(weight, sex);
  if (!Number.isFinite(measured) || measured <= 0 || ref === null) return '';
  const delta = measured - ref;
  if (Math.abs(delta) < 0.005) return 'Na média de referência';
  return `${delta < 0 ? 'Abaixo' : 'Acima'} da média de referência`;
}

const ffmiReferenceTable = {
  male: [
    { minAge: 18, maxAge: 34, p5: 16.8, p25: 18.0, p50: 18.9, p75: 19.8, p95: 21.1 },
    { minAge: 35, maxAge: 54, p5: 17.2, p25: 18.3, p50: 19.2, p75: 20.1, p95: 21.7 },
    { minAge: 55, maxAge: 74, p5: 17.0, p25: 18.4, p50: 19.4, p75: 20.3, p95: 22.1 },
    { minAge: 75, maxAge: 120, p5: 16.6, p25: 17.6, p50: 18.5, p75: 19.4, p95: 21.2 },
  ],
  female: [
    { minAge: 18, maxAge: 34, p5: 13.8, p25: 14.7, p50: 15.4, p75: 16.2, p95: 17.6 },
    { minAge: 35, maxAge: 54, p5: 14.4, p25: 15.3, p50: 15.9, p75: 16.7, p95: 18.0 },
    { minAge: 55, maxAge: 74, p5: 14.1, p25: 15.4, p50: 16.2, p75: 17.4, p95: 19.0 },
    { minAge: 75, maxAge: 120, p5: 12.9, p25: 14.7, p50: 15.9, p75: 17.0, p95: 18.7 },
  ],
};

export function ffmiReference(age, sex) {
  const years = Number(age);
  const sx = normalizedSex(sex);
  if (!Number.isFinite(years) || years < 18 || !sx) return null;
  return ffmiReferenceTable[sx]?.find(row => years >= row.minAge && years <= row.maxAge) || null;
}

export function fatFreeMassIndex(bio = {}) {
  const weight = Number(bio?.weight_kg);
  const fat = Number(bio?.body_fat_pct);
  const heightCm = Number(bio?.height_cm);
  if (!Number.isFinite(weight) || weight <= 0 || !Number.isFinite(fat) || fat < 0 || fat >= 100 || !Number.isFinite(heightCm) || heightCm <= 0) return null;
  const heightM = heightCm / 100;
  return (weight * (1 - fat / 100)) / (heightM * heightM);
}

export function muscleMassContext(value, bio = {}, student = {}, assessmentDate = null) {
  const muscle = Number(value);
  if (!Number.isFinite(muscle) || muscle <= 0) return '';
  const age = ageAtAssessment(student?.birth, assessmentDate);
  const ffmi = fatFreeMassIndex(bio);
  const ref = ffmiReference(age, student?.sex);
  if (!Number.isFinite(ffmi) || !ref) return '';
  if (ffmi < ref.p5) return 'Muito abaixo da referência';
  if (ffmi < ref.p25) return 'Abaixo da referência';
  if (ffmi <= ref.p75) return 'Dentro da referência';
  if (ffmi <= ref.p95) return 'Acima da referência';
  return 'Muito acima da referência';
}


export function mifflinStJeorRmr(bio = {}, student = {}, assessmentDate = null) {
  const weight = Number(bio?.weight_kg);
  const height = Number(bio?.height_cm);
  const age = ageAtAssessment(student?.birth, assessmentDate);
  const sx = normalizedSex(student?.sex);
  if (!Number.isFinite(weight) || weight <= 0 || !Number.isFinite(height) || height <= 0 || !Number.isFinite(age) || age < 18 || !sx) return null;
  const sexConstant = sx === 'male' ? 5 : -161;
  return (10 * weight) + (6.25 * height) - (5 * age) + sexConstant;
}

export function basalMetabolicRateContext(value, bio = {}, student = {}, assessmentDate = null) {
  const measured = Number(value);
  const predicted = mifflinStJeorRmr(bio, student, assessmentDate);
  if (!Number.isFinite(measured) || measured <= 0 || !Number.isFinite(predicted) || predicted <= 0) return '';
  const ratio = measured / predicted;
  if (ratio < 0.9) return 'Abaixo do valor estimado';
  if (ratio > 1.1) return 'Acima do valor estimado';
  return 'Dentro do intervalo estimado';
}

export function bioimpedanceIndicator(key, value, bio = {}, student = {}, assessmentDate = null) {
  const age = ageAtAssessment(student?.birth, assessmentDate);
  if (key === 'weight_kg' || key === 'bmi') return bmiCategory(effectiveBmi({ ...bio, [key]: value }));
  if (key === 'body_fat_pct') return bodyFatCategory(value, age, student?.sex);
  if (key === 'water_pct') return bodyWaterCategory(value, age, student?.sex);
  if (key === 'visceral_fat_rating') return visceralFatCategory(value, age);
  if (key === 'bone_mass_kg') return boneMassContext(value, bio?.weight_kg, student?.sex);
  if (key === 'muscle_mass_kg') return muscleMassContext(value, bio, student, assessmentDate);
  if (key === 'basal_metabolic_rate_kcal') return basalMetabolicRateContext(value, bio, student, assessmentDate);
  return '';
}


function decimalPt(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return n.toFixed(digits).replace('.', ',');
}

function sexLabel(sex) {
  const sx = normalizedSex(sex);
  return sx === 'female' ? 'mulher' : sx === 'male' ? 'homem' : 'adulto';
}

export function bioimpedanceInterpretation(key, value, bio = {}, student = {}, assessmentDate = null) {
  const age = ageAtAssessment(student?.birth, assessmentDate);
  const label = bioimpedanceIndicator(key, value, bio, student, assessmentDate);
  if (!label) return { label: '', detail: '' };

  if (key === 'weight_kg') {
    const bmi = effectiveBmi({ ...bio, weight_kg: value });
    return {
      label,
      detail: bmi ? `Classificação pelo IMC calculado: ${decimalPt(bmi, 1)} kg/m².` : '',
    };
  }

  if (key === 'bmi') return { label, detail: '' };

  if (key === 'body_fat_pct') {
    const ref = bodyFatReference(age, student?.sex);
    if (!ref) return { label, detail: '' };
    const fat = Number(value);
    const healthyRange = `${ref.low}–${decimalPt(ref.overfat - 0.1, 1)}%`;
    const ageRange = `${ref.minAge}–${ref.maxAge} anos`;
    let currentBand = '';
    let bandName = '';
    if (fat >= ref.low && fat < ref.standardPlus) {
      currentBand = `${ref.low}–${decimalPt(ref.standardPlus - 0.1, 1)}%`;
      bandName = 'faixa inferior';
    } else if (fat >= ref.standardPlus && fat < ref.overfat) {
      currentBand = `${ref.standardPlus}–${decimalPt(ref.overfat - 0.1, 1)}%`;
      bandName = 'faixa superior';
    }
    return {
      label,
      detail: currentBand
        ? `Intervalo saudável TANITA: ${healthyRange}; este valor está na ${bandName} (${currentBand}) para ${sexLabel(student?.sex)}, ${ageRange}.`
        : `Intervalo saudável TANITA: ${healthyRange} para ${sexLabel(student?.sex)}, ${ageRange}.`,
    };
  }

  if (key === 'water_pct') {
    const sx = normalizedSex(student?.sex);
    const range = sx === 'female' ? '45–60%' : sx === 'male' ? '50–65%' : '';
    return {
      label,
      detail: range ? `Intervalo TANITA para ${sexLabel(student?.sex)} adulta/o: ${range}.` : '',
    };
  }

  if (key === 'visceral_fat_rating') {
    return {
      label,
      detail: 'Escala TANITA: 1–12 = nível saudável; 13–59 = nível elevado.',
    };
  }

  if (key === 'bone_mass_kg') {
    const ref = boneMassReference(bio?.weight_kg, student?.sex);
    return {
      label,
      detail: ref
        ? `Média TANITA estimada para ${sexLabel(student?.sex)} com este peso: ${decimalPt(ref, 2)} kg. Não corresponde a densidade óssea.`
        : '',
    };
  }

  if (key === 'muscle_mass_kg') {
    const ffmi = fatFreeMassIndex(bio);
    const ref = ffmiReference(age, student?.sex);
    if (!Number.isFinite(ffmi) || !ref) {
      return {
        label,
        detail: 'Para obter a classificação automática são necessários altura, peso, percentual de gordura, idade e sexo.',
      };
    }
    return {
      label,
      detail: `Enquadramento por FFMI: ${decimalPt(ffmi, 1)} kg/m². Intervalo central de referência (P25–P75) para ${sexLabel(student?.sex)}, ${ref.minAge}–${ref.maxAge === 120 ? '75+' : ref.maxAge} anos: ${decimalPt(ref.p25, 1)}–${decimalPt(ref.p75, 1)} kg/m²; mediana ${decimalPt(ref.p50, 1)}. O FFMI avalia massa magra total e não equivale ao Muscle Score TANITA nem a uma medição direta de músculo esquelético.`,
    };
  }


  if (key === 'basal_metabolic_rate_kcal') {
    const measured = Number(value);
    const predicted = mifflinStJeorRmr(bio, student, assessmentDate);
    if (!Number.isFinite(measured) || !Number.isFinite(predicted) || predicted <= 0) {
      return {
        label,
        detail: 'Para obter o enquadramento automático são necessários peso, altura, idade e sexo.',
      };
    }
    const deltaPct = ((measured - predicted) / predicted) * 100;
    const low = predicted * 0.9;
    const high = predicted * 1.1;
    const signed = `${deltaPct >= 0 ? '+' : '−'}${decimalPt(Math.abs(deltaPct), 1)}%`;
    return {
      label,
      detail: `Estimativa Mifflin–St Jeor: ${Math.round(predicted).toLocaleString('pt-PT')} kcal/dia; TANITA: ${Math.round(measured).toLocaleString('pt-PT')} kcal/dia (${signed}). Intervalo comparativo ±10%: ${Math.round(low).toLocaleString('pt-PT')}–${Math.round(high).toLocaleString('pt-PT')} kcal/dia. Não corresponde às necessidades calóricas diárias totais.`,
    };
  }

  return { label, detail: '' };
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
