import { supabase } from './supabase';

export function challengeStatusLabel(status) {
  return ({ draft: 'Rascunho', active: 'Ativo', completed: 'Concluído', archived: 'Arquivado' })[status] || status;
}

export function challengeDays(challenge) {
  if (!challenge?.start_date || !challenge?.end_date) return 0;
  const start = new Date(`${challenge.start_date}T12:00:00`);
  const end = new Date(`${challenge.end_date}T12:00:00`);
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

export function challengeProgress(total, target) {
  if (!target || Number(target) <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((Number(total || 0) / Number(target)) * 100)));
}

export async function fetchChallenges() {
  const { data, error } = await supabase
    .from('challenges')
    .select('id,title,slug,description,unit,target_total,daily_target,start_date,end_date,status,prize_text,rules,created_at,updated_at,challenge_participants(id,student_id,status,joined_at)')
    .order('start_date', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function saveChallenge(payload) {
  const clean = {
    title: String(payload.title || '').trim(),
    description: String(payload.description || '').trim() || null,
    unit: String(payload.unit || 'repetições').trim() || 'repetições',
    target_total: Number(payload.targetTotal || 0),
    daily_target: payload.dailyTarget === '' || payload.dailyTarget == null ? null : Number(payload.dailyTarget),
    start_date: payload.startDate,
    end_date: payload.endDate,
    status: payload.status || 'draft',
    prize_text: String(payload.prizeText || '').trim() || null,
    rules: String(payload.rules || '').trim() || null,
  };
  if (!clean.title || !clean.start_date || !clean.end_date || clean.target_total <= 0) {
    throw new Error('Preenche título, datas e objetivo total do desafio.');
  }
  if (payload.id) {
    const { data, error } = await supabase.from('challenges').update(clean).eq('id', payload.id).select().single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase.from('challenges').insert(clean).select().single();
  if (error) throw error;
  return data;
}

export async function setChallengeParticipants(challengeId, studentIds) {
  const selected = [...new Set(studentIds || [])];
  const { data: existing, error: existingError } = await supabase
    .from('challenge_participants')
    .select('id,student_id,status')
    .eq('challenge_id', challengeId);
  if (existingError) throw existingError;

  const byStudent = new Map((existing || []).map(item => [item.student_id, item]));
  const inserts = selected.filter(id => !byStudent.has(id)).map(studentId => ({ challenge_id: challengeId, student_id: studentId, status: 'active' }));
  if (inserts.length) {
    const { error } = await supabase.from('challenge_participants').insert(inserts);
    if (error) throw error;
  }

  for (const studentId of selected) {
    const row = byStudent.get(studentId);
    if (row && row.status !== 'active') {
      const { error } = await supabase.from('challenge_participants').update({ status: 'active' }).eq('id', row.id);
      if (error) throw error;
    }
  }

  const toWithdraw = (existing || []).filter(item => item.status === 'active' && !selected.includes(item.student_id));
  if (toWithdraw.length) {
    const { error } = await supabase
      .from('challenge_participants')
      .update({ status: 'withdrawn' })
      .in('id', toWithdraw.map(item => item.id));
    if (error) throw error;
  }
}

export async function fetchChallengeRecords(participantId) {
  if (!participantId) return [];
  const { data, error } = await supabase
    .from('challenge_records')
    .select('id,participant_id,record_date,value,note,created_at,updated_at')
    .eq('participant_id', participantId)
    .order('record_date', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function saveChallengeRecord(participantId, recordDate, value) {
  const numeric = Number(value);
  if (!participantId || !recordDate || Number.isNaN(numeric) || numeric < 0) throw new Error('Indica um valor válido.');
  const { data, error } = await supabase
    .from('challenge_records')
    .upsert({ participant_id: participantId, record_date: recordDate, value: numeric }, { onConflict: 'participant_id,record_date' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchChallengeLeaderboard(challengeId) {
  const { data, error } = await supabase.rpc('challenge_leaderboard', { target_challenge_id: challengeId });
  if (error) throw error;
  return data || [];
}
