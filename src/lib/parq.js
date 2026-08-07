import { supabase } from './supabase';

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado.');
  return supabase;
}

export async function fetchActiveParqVersion() {
  const client = requireSupabase();
  const { data, error } = await client
    .from('parq_versions')
    .select('id,version_code,title,intro_text,questions,declaration_text,is_active,activated_at')
    .eq('is_active', true)
    .order('activated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Não existe uma versão ativa do PAR-Q.');
  return data;
}

export async function currentStudentHasRequiredParq() {
  const client = requireSupabase();
  const { data, error } = await client.rpc('current_student_has_required_parq');
  if (error) throw error;
  return Boolean(data);
}

export async function submitOwnParq(versionId, answers) {
  const client = requireSupabase();
  const { data, error } = await client.rpc('submit_own_parq', {
    target_version_id: versionId,
    answer_payload: answers,
    acceptance_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  });
  if (error) throw error;
  return data;
}

export async function fetchParqStatusForStudent(studentId) {
  if (!studentId) return null;
  const client = requireSupabase();
  const { data, error } = await client.rpc('parq_status_for_student', {
    target_student_id: studentId,
  });
  if (error) throw error;
  return Array.isArray(data) ? (data[0] || null) : data;
}

export function formatParqDate(value) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('pt-PT', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

export function renderDeclaration(text, studentName) {
  return String(text || '').replaceAll('{{student_name}}', studentName || 'Aluno');
}
