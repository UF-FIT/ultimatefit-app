import { supabase } from './supabase';
import { optimiseExerciseImage } from './image';

const EXERCISE_BUCKET = 'exercise-media';
const MAX_VIDEO_BYTES = 15 * 1024 * 1024;

function asNumber(value) {
  if (value === '' || value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function mediaUrl(row) {
  if (row.external_media_url) return row.external_media_url;
  if (!row.media_path) return '';
  return supabase.storage.from(EXERCISE_BUCKET).getPublicUrl(row.media_path).data.publicUrl || '';
}

export function mapExercise(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    group: row.muscle_group || '',
    groupId: row.muscle_group_id || '',
    secondaryMuscles: row.secondary_muscles || [],
    equipment: row.equipment || '',
    category: row.category || '',
    difficulty: row.difficulty || '',
    instructions: row.instructions || '',
    mediaPath: row.media_path || '',
    mediaKind: row.media_kind || '',
    externalMediaUrl: row.external_media_url || '',
    mediaUrl: mediaUrl(row),
    active: row.is_active !== false,
    aliases: row.aliases || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sortNestedPlan(row) {
  const sessions = [...(row.workout_sessions || [])]
    .sort((a,b) => a.sort_order - b.sort_order)
    .map(session => ({
      id: session.id,
      title: session.title,
      description: session.description || '',
      sortOrder: session.sort_order,
      blocks: [...(session.workout_blocks || [])]
        .sort((a,b) => a.sort_order - b.sort_order)
        .map(block => ({
          id: block.id,
          type: block.block_type,
          title: block.title || '',
          rounds: block.rounds || 1,
          restAfterSeconds: block.rest_after_seconds,
          sortOrder: block.sort_order,
          items: [...(block.workout_items || [])]
            .sort((a,b) => a.sort_order - b.sort_order)
            .map(item => ({
              id: item.id,
              exerciseId: item.exercise_id || '',
              manualName: item.custom_exercise_name || '',
              exercise: mapExercise(item.exercise_library),
              sets: item.sets,
              reps: item.reps || '',
              durationSeconds: item.duration_seconds,
              restSeconds: item.rest_seconds,
              tempo: item.tempo || '',
              loadText: item.load_text || '',
              rpe: item.rpe == null ? null : Number(item.rpe),
              notes: item.notes || '',
              sortOrder: item.sort_order,
            })),
        })),
    }));

  return {
    id: row.id,
    studentId: row.student_id,
    trainerId: row.trainer_id,
    title: row.title,
    description: row.description || '',
    goal: row.goal || '',
    status: row.status,
    active: row.is_active !== false,
    startDate: row.start_date || '',
    endDate: row.end_date || '',
    autoStretchingEnabled: row.auto_stretching_enabled !== false,
    publishedAt: row.published_at,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sessions,
  };
}

export async function fetchExercises({ includeInactive = true } = {}) {
  let query = supabase
    .from('exercise_library')
    .select('id,name,description,muscle_group,muscle_group_id,secondary_muscles,equipment,category,difficulty,instructions,media_path,media_kind,external_media_url,is_active,aliases,created_at,updated_at')
    .order('name');
  if (!includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(mapExercise);
}

export async function fetchWorkoutPlans() {
  const { data, error } = await supabase
    .from('workout_plans')
    .select(`
      id,student_id,trainer_id,title,description,goal,status,is_active,start_date,end_date,auto_stretching_enabled,published_at,archived_at,created_at,updated_at,
      workout_sessions(
        id,title,description,sort_order,
        workout_blocks(
          id,block_type,title,rounds,rest_after_seconds,sort_order,
          workout_items(
            id,exercise_id,custom_exercise_name,sort_order,sets,reps,duration_seconds,rest_seconds,tempo,load_text,rpe,notes,
            exercise_library(id,name,description,muscle_group,muscle_group_id,secondary_muscles,equipment,category,difficulty,instructions,media_path,media_kind,external_media_url,is_active,aliases,created_at,updated_at)
          )
        )
      )
    `)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(sortNestedPlan);
}

export async function canManageWorkoutPlans() {
  const { data, error } = await supabase.rpc('trainer_has_permission', { target_permission: 'manage_workout_plans' });
  if (error) return false;
  return Boolean(data);
}

export async function canManageExerciseLibrary() {
  const { data, error } = await supabase.rpc('trainer_has_permission', { target_permission: 'manage_exercise_library' });
  if (error) return false;
  return Boolean(data);
}


export function mapMuscleGroup(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    iconKey: row.icon_key || 'default',
    sortOrder: row.sort_order || 100,
    active: row.is_active !== false,
    system: row.is_system === true,
  };
}

export function mapWorkoutBlockType(row) {
  return {
    code: row.code,
    name: row.name,
    description: row.description || '',
    iconKey: row.icon_key || 'layers',
    supportsRounds: row.supports_rounds !== false,
    special: row.is_special !== false,
    system: row.is_system === true,
    active: row.is_active !== false,
    sortOrder: row.sort_order || 100,
  };
}

function slugify(value = '') {
  return value
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function fetchMuscleGroups() {
  const { data, error } = await supabase
    .from('exercise_muscle_groups')
    .select('id,name,slug,icon_key,sort_order,is_active,is_system')
    .order('sort_order')
    .order('name');
  if (error) throw error;
  return (data || []).map(mapMuscleGroup);
}

export async function createMuscleGroup(input) {
  const { data, error } = await supabase
    .from('exercise_muscle_groups')
    .insert({
      name: input.name.trim(),
      slug: slugify(input.name),
      icon_key: input.iconKey || 'default',
      sort_order: Number(input.sortOrder) || 100,
      is_active: true,
    })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('Já existe um grupo muscular com esse nome.');
    throw error;
  }
  return mapMuscleGroup(data);
}

export async function updateMuscleGroup(groupId, input) {
  const { data, error } = await supabase
    .from('exercise_muscle_groups')
    .update({ name: input.name.trim(), icon_key: input.iconKey || 'default', sort_order: Number(input.sortOrder) || 100 })
    .eq('id', groupId)
    .select()
    .single();
  if (error) throw error;
  return mapMuscleGroup(data);
}

export async function archiveMuscleGroup(groupId, active = false) {
  const { error } = await supabase.from('exercise_muscle_groups').update({ is_active: active }).eq('id', groupId);
  if (error) throw error;
}

export async function fetchWorkoutBlockTypes() {
  const { data, error } = await supabase
    .from('workout_block_types')
    .select('code,name,description,icon_key,supports_rounds,is_special,is_system,is_active,sort_order')
    .order('sort_order')
    .order('name');
  if (error) throw error;
  return (data || []).map(mapWorkoutBlockType);
}

export async function createWorkoutBlockType(input) {
  const code = `custom-${slugify(input.name)}`;
  const { data, error } = await supabase
    .from('workout_block_types')
    .insert({
      code,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      icon_key: input.iconKey || 'layers',
      supports_rounds: input.supportsRounds !== false,
      is_special: true,
      is_active: true,
      sort_order: Number(input.sortOrder) || 100,
    })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('Já existe uma série especial com esse nome.');
    throw error;
  }
  return mapWorkoutBlockType(data);
}

export async function updateWorkoutBlockType(code, input) {
  const { data, error } = await supabase
    .from('workout_block_types')
    .update({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      icon_key: input.iconKey || 'layers',
      supports_rounds: input.supportsRounds !== false,
      sort_order: Number(input.sortOrder) || 100,
    })
    .eq('code', code)
    .select()
    .single();
  if (error) throw error;
  return mapWorkoutBlockType(data);
}

export async function archiveWorkoutBlockType(code, active = false) {
  const { error } = await supabase.from('workout_block_types').update({ is_active: active }).eq('code', code);
  if (error) throw error;
}

export async function saveWorkoutPlan(plan) {
  const payload = {
    planId: plan.id || '',
    studentId: plan.studentId,
    title: plan.title,
    description: plan.description || '',
    goal: plan.goal || '',
    status: plan.status || 'draft',
    isActive: plan.active !== false,
    startDate: plan.startDate || '',
    endDate: plan.endDate || '',
    autoStretchingEnabled: plan.autoStretchingEnabled !== false,
    sessions: (plan.sessions || []).map(session => ({
      title: session.title,
      description: session.description || '',
      blocks: (session.blocks || []).map(block => ({
        type: block.type || 'standard',
        title: block.title || '',
        rounds: asNumber(block.rounds) || 1,
        restAfterSeconds: asNumber(block.restAfterSeconds),
        items: (block.items || []).map(item => ({
          exerciseId: item.exerciseId || '',
          manualName: item.manualName || '',
          sets: asNumber(item.sets),
          reps: item.reps || '',
          durationSeconds: asNumber(item.durationSeconds),
          restSeconds: asNumber(item.restSeconds),
          tempo: item.tempo || '',
          loadText: item.loadText || '',
          rpe: asNumber(item.rpe),
          notes: item.notes || '',
        })),
      })),
    })),
  };
  const { data, error } = await supabase.rpc('save_workout_plan', { payload });
  if (error) throw error;
  return data;
}

export async function archiveWorkoutPlan(planId) {
  const { error } = await supabase.rpc('archive_workout_plan', { target_plan_id: planId });
  if (error) throw error;
}

export async function restoreWorkoutPlan(planId) {
  if (!planId) throw new Error('Plano de treino inválido.');
  const { data, error } = await supabase.rpc('restore_workout_plan', { target_plan_id: planId });
  if (error) throw error;
  return data;
}

export async function deleteWorkoutPlanPermanently(planId) {
  if (!planId) throw new Error('Plano de treino inválido.');
  const { error } = await supabase.rpc('delete_workout_plan_permanently', { target_plan_id: planId });
  if (error) throw error;
}

export async function createExercise(input) {
  const { data, error } = await supabase
    .from('exercise_library')
    .insert({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      muscle_group: input.group,
      muscle_group_id: input.groupId || null,
      secondary_muscles: input.secondaryMuscles || [],
      equipment: input.equipment?.trim() || null,
      category: input.category || null,
      difficulty: input.difficulty || null,
      instructions: input.instructions?.trim() || null,
      media_path: input.mediaPath || null,
      media_kind: input.mediaKind || null,
      external_media_url: input.externalMediaUrl?.trim() || null,
      is_active: input.active !== false,
    })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('Já existe um exercício igual ou equivalente na biblioteca.');
    throw error;
  }
  return mapExercise(data);
}

export async function updateExercise(exerciseId, input) {
  const { data, error } = await supabase
    .from('exercise_library')
    .update({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      muscle_group: input.group,
      muscle_group_id: input.groupId || null,
      secondary_muscles: input.secondaryMuscles || [],
      equipment: input.equipment?.trim() || null,
      category: input.category || null,
      difficulty: input.difficulty || null,
      instructions: input.instructions?.trim() || null,
      media_path: input.mediaPath || null,
      media_kind: input.mediaKind || null,
      external_media_url: input.externalMediaUrl?.trim() || null,
      is_active: input.active !== false,
    })
    .eq('id', exerciseId)
    .select()
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('Já existe um exercício igual ou equivalente na biblioteca.');
    throw error;
  }
  return mapExercise(data);
}

export async function archiveExercise(exerciseId, active = false) {
  const { error } = await supabase.from('exercise_library').update({ is_active: active }).eq('id', exerciseId);
  if (error) throw error;
}

export async function uploadExerciseMedia(file) {
  if (!file) return { path: '', kind: '' };
  let blob = file;
  let extension = (file.name.split('.').pop() || '').toLowerCase();
  let kind = 'video';

  if (file.type.startsWith('image/') && file.type !== 'image/gif') {
    blob = await optimiseExerciseImage(file);
    extension = 'webp';
    kind = 'image';
  } else if (file.type === 'image/gif') {
    if (file.size > MAX_VIDEO_BYTES) throw new Error('O GIF não pode ultrapassar 15 MB.');
    kind = 'gif';
  } else if (file.type === 'video/mp4' || file.type === 'video/webm') {
    if (file.size > MAX_VIDEO_BYTES) throw new Error('O vídeo não pode ultrapassar 15 MB.');
    kind = 'video';
  } else {
    throw new Error('Usa JPG, PNG, WebP, GIF, MP4 ou WebM.');
  }

  const folder = crypto.randomUUID();
  const path = `${folder}/demo.${extension}`;
  const { error } = await supabase.storage.from(EXERCISE_BUCKET).upload(path, blob, {
    cacheControl: '31536000',
    upsert: false,
    contentType: blob.type || file.type,
  });
  if (error) throw error;
  return { path, kind };
}

export function formatSeconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 60) return `${seconds}s`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function mapWorkoutCompletion(row) {
  return {
    id: row.id,
    studentId: row.student_id,
    planId: row.plan_id || '',
    sessionId: row.session_id || '',
    completedOn: row.completed_on,
    source: row.source || 'student',
    notes: row.notes || '',
    createdBy: row.created_by || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchWorkoutCompletions() {
  const { data, error } = await supabase
    .from('workout_completions')
    .select('id,student_id,plan_id,session_id,completed_on,source,notes,created_by,created_at,updated_at')
    .order('completed_on', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapWorkoutCompletion);
}

export async function recordWorkoutCompletion({
  studentId,
  planId = '',
  sessionId = '',
  completedOn = '',
  source = 'student',
  notes = '',
}) {
  const { data, error } = await supabase.rpc('record_workout_completion', {
    target_student_id: studentId,
    target_plan_id: planId || null,
    target_session_id: sessionId || null,
    target_completed_on: completedOn || null,
    requested_source: source,
    target_notes: notes || null,
  });
  if (error) throw error;
  return data;
}
