import { supabase } from './supabase';

function asNumber(value) {
  if (value === '' || value == null) return null;
  const number = Number(String(value).replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

function firstNumber(value = '') {
  const match = String(value || '').replace(',', '.').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function repsFromText(value = '') {
  const number = firstNumber(value);
  return number && number > 0 ? Math.round(number) : 1;
}

function weightsFromText(value = '', setCount = 1) {
  const text = String(value || '');
  if (!/kg/i.test(text)) return Array.from({ length: setCount }, () => null);
  const matches = [...text.matchAll(/(?:S\s*\d+\s*)?(?:>|≥)?\s*(\d+(?:[.,]\d+)?)\s*kg/gi)]
    .map(match => Number(match[1].replace(',', '.')))
    .filter(Number.isFinite);
  if (!matches.length) return Array.from({ length: setCount }, () => null);
  if (matches.length === 1) return Array.from({ length: setCount }, () => matches[0]);
  return Array.from({ length: setCount }, (_, index) => matches[index] ?? matches[matches.length - 1]);
}

function cardioIntensity(item) {
  const fromLoad = firstNumber(item?.loadText || '');
  if (fromLoad != null) return fromLoad;
  const note = String(item?.notes || '');
  const match = note.match(/carga\s*(?:de\s*)?(\d+(?:[.,]\d+)?)/i);
  return match ? Number(match[1].replace(',', '.')) : null;
}

function isCardioItem(item) {
  const group = String(item?.exercise?.group || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /cardio|aerob/.test(group);
}

function activityFromItem(item, block, activityIndex, itemIndex = 0) {
  const cardio = isCardioItem(item);
  const manual = !item?.exercise;
  const special = Boolean(block && block.type && block.type !== 'standard');
  const blockItems = block?.items || [];
  const lastInBlock = itemIndex === Math.max(0, blockItems.length - 1);
  const fallbackRounds = special ? Math.max(1, Number(block?.rounds) || 1) : 1;
  const setCount = manual ? 0 : Math.max(1, Number(item?.sets) || fallbackRounds);
  const plannedReps = item?.reps || '';
  const timed = !cardio && !manual && Number(item?.durationSeconds) > 0 && !plannedReps;
  const defaultReps = timed ? 1 : cardio ? 1 : repsFromText(plannedReps);
  const suggestedWeights = weightsFromText(item?.loadText, setCount);
  const restSeconds = special
    ? (lastInBlock ? Math.max(0, Number(block?.restAfterSeconds) || 0) : 0)
    : Math.max(0, Number(item?.restSeconds) || 45);

  return {
    key: item?.id || `activity-${activityIndex + 1}`,
    activityIndex,
    workoutItemId: item?.id || '',
    blockId: block?.id || '',
    blockType: block?.type || 'standard',
    blockTitle: block?.title || '',
    blockRounds: Number(block?.rounds) || 1,
    exerciseId: item?.exerciseId || item?.exercise?.id || '',
    type: manual ? 'manual' : cardio ? 'cardio' : timed ? 'timed' : 'exercise',
    name: item?.exercise?.name || item?.manualName || 'Texto livre',
    manualName: item?.manualName || '',
    group: manual ? 'Texto livre' : (item?.exercise?.group || 'Outro'),
    equipment: item?.exercise?.equipment || '',
    description: item?.exercise?.description || '',
    instructions: item?.exercise?.instructions || '',
    mediaUrl: item?.exercise?.mediaUrl || '',
    mediaKind: item?.exercise?.mediaKind || '',
    externalMediaUrl: item?.exercise?.externalMediaUrl || '',
    notes: item?.notes || '',
    plannedSets: Number(item?.sets) || (manual ? 0 : fallbackRounds),
    plannedReps,
    durationSeconds: Number(item?.durationSeconds) || 0,
    restSeconds,
    loadText: item?.loadText || '',
    rpe: null,
    prescribedRpe: item?.rpe == null ? null : Number(item.rpe),
    tempo: item?.tempo || '',
    status: 'pending',
    startedAt: null,
    completedAt: null,
    skippedAt: null,
    sets: Array.from({ length: setCount }, (_, index) => ({
      index: index + 1,
      plannedReps: timed ? `${Number(item.durationSeconds)}s` : plannedReps,
      reps: defaultReps,
      weightKg: suggestedWeights[index],
      plannedWeightText: item?.loadText || '',
      durationSeconds: timed ? Number(item.durationSeconds) : 0,
      completed: false,
      completedAt: null,
    })),
    cardio: cardio ? {
      minutes: item?.durationSeconds ? Math.max(1, Math.round(Number(item.durationSeconds) / 60)) : Math.max(1, repsFromText(item?.reps || '1')),
      intensity: cardioIntensity(item),
    } : null,
  };
}

export function buildWorkoutRunState(plan, session) {
  const blocks = (session?.blocks || []).map((block, blockIndex) => ({
    id: block.id || `block-${blockIndex + 1}`,
    type: block.type || 'standard',
    title: block.title || '',
    rounds: Number(block.rounds) || 1,
    restAfterSeconds: Number(block.restAfterSeconds) || 0,
    itemIds: (block.items || []).map(item => item.id).filter(Boolean),
  }));

  const activities = [];
  (session?.blocks || []).forEach(block => {
    (block.items || []).forEach((item, itemIndex) => activities.push(activityFromItem(item, block, activities.length, itemIndex)));
  });

  return {
    version: 1,
    planTitle: plan?.title || 'Plano de treino',
    sessionTitle: session?.title || 'Treino',
    planId: plan?.id || '',
    sessionId: session?.id || '',
    blocks,
    activities,
    currentIndex: 0,
    rest: { active: false, startedAt: null, endsAt: null, afterActivityIndex: null },
    soundEnabled: true,
    createdAt: new Date().toISOString(),
  };
}

export function normaliseRunState(state = {}) {
  const activities = Array.isArray(state?.activities) ? state.activities.map((activity, activityIndex) => ({
    ...activity,
    activityIndex,
    status: ['pending','active','completed','skipped'].includes(activity?.status) ? activity.status : 'pending',
    rpe: activity?.rpe == null ? null : Number(activity.rpe),
    sets: Array.isArray(activity?.sets) ? activity.sets.map((set, index) => ({
      ...set,
      index: Number(set?.index) || index + 1,
      reps: Math.max(1, Number(set?.reps) || repsFromText(set?.plannedReps || activity?.plannedReps || '1')),
      weightKg: set?.weightKg == null || set?.weightKg === '' ? null : asNumber(set.weightKg),
      completed: set?.completed === true,
    })) : [],
  })) : [];

  let currentIndex = Number(state?.currentIndex);
  if (!Number.isInteger(currentIndex) || currentIndex < 0) currentIndex = 0;
  if (activities.length) currentIndex = Math.min(currentIndex, activities.length - 1);

  return {
    version: Number(state?.version) || 1,
    planTitle: state?.planTitle || 'Plano de treino',
    sessionTitle: state?.sessionTitle || 'Treino',
    planId: state?.planId || '',
    sessionId: state?.sessionId || '',
    blocks: Array.isArray(state?.blocks) ? state.blocks : [],
    activities,
    currentIndex,
    rest: {
      active: state?.rest?.active === true,
      startedAt: state?.rest?.startedAt || null,
      endsAt: state?.rest?.endsAt || null,
      afterActivityIndex: state?.rest?.afterActivityIndex == null ? null : Number(state.rest.afterActivityIndex),
    },
    soundEnabled: state?.soundEnabled !== false,
    createdAt: state?.createdAt || new Date().toISOString(),
  };
}

export function mapWorkoutRun(row) {
  if (!row) return null;
  return {
    id: row.id,
    studentId: row.student_id,
    planId: row.plan_id || '',
    sessionId: row.session_id || '',
    status: row.status,
    mode: row.mode || 'guided',
    workoutDate: row.workout_date,
    planTitle: row.plan_title || '',
    sessionTitle: row.session_title || '',
    startedAt: row.started_at,
    endedAt: row.ended_at,
    cancelledAt: row.cancelled_at,
    currentActivityIndex: Number(row.current_activity_index) || 0,
    state: normaliseRunState(row.state || {}),
    summary: row.summary || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchActiveWorkoutRun(studentId) {
  if (!studentId) return null;
  const { data, error } = await supabase
    .from('workout_runs')
    .select('id,student_id,plan_id,session_id,status,mode,workout_date,plan_title,session_title,started_at,ended_at,cancelled_at,current_activity_index,state,summary,created_at,updated_at')
    .eq('student_id', studentId)
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return mapWorkoutRun(data);
}

export async function fetchWorkoutRuns(studentId, { limit = 40 } = {}) {
  if (!studentId) return [];
  const { data, error } = await supabase
    .from('workout_runs')
    .select('id,student_id,plan_id,session_id,status,mode,workout_date,plan_title,session_title,started_at,ended_at,cancelled_at,current_activity_index,state,summary,created_at,updated_at')
    .eq('student_id', studentId)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(mapWorkoutRun);
}

export async function startWorkoutRun({ studentId, plan, session }) {
  const initialState = buildWorkoutRunState(plan, session);
  const { data, error } = await supabase.rpc('start_workout_run', {
    target_student_id: studentId,
    target_plan_id: plan?.id,
    target_session_id: session?.id,
    target_state: initialState,
  });
  if (error) throw error;
  const active = await fetchActiveWorkoutRun(studentId);
  if (!active) throw new Error('Não foi possível abrir o treino em curso.');
  return active;
}

export async function saveWorkoutRunState(runId, mode, state) {
  const cleanState = normaliseRunState(state);
  const { error } = await supabase.rpc('save_workout_run_state', {
    target_run_id: runId,
    target_mode: mode || 'guided',
    target_current_activity_index: cleanState.currentIndex || 0,
    target_state: cleanState,
  });
  if (error) throw error;
  return cleanState;
}

export async function cancelWorkoutRun(runId) {
  const { error } = await supabase.rpc('cancel_workout_run', { target_run_id: runId });
  if (error) throw error;
}

export async function completeWorkoutRun(runId, state, summary) {
  const cleanState = normaliseRunState(state);
  const { data, error } = await supabase.rpc('complete_workout_run', {
    target_run_id: runId,
    target_state: cleanState,
    target_summary: summary || {},
  });
  if (error) throw error;
  return data;
}

export async function fetchWorkoutSetHistory(studentId, { limit = 1200 } = {}) {
  if (!studentId) return [];
  const { data, error } = await supabase
    .from('workout_run_set_results')
    .select('id,run_id,student_id,plan_id,session_id,workout_item_id,exercise_id,exercise_name,muscle_group,set_index,reps_completed,weight_kg,volume_kg,completed_on,created_at')
    .eq('student_id', studentId)
    .order('completed_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function fetchLegacyWorkoutLoads(studentId, { limit = 1200 } = {}) {
  if (!studentId) return [];
  const { data, error } = await supabase
    .from('workout_exercise_loads')
    .select('id,student_id,plan_id,session_id,workout_item_id,exercise_id,exercise_name,muscle_group,weight_kg,sets_completed,reps_completed,volume_kg,completed_on,created_at')
    .eq('student_id', studentId)
    .order('completed_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export function elapsedRunSeconds(run, now = Date.now()) {
  if (!run?.startedAt) return 0;
  const start = new Date(run.startedAt).getTime();
  const end = run.endedAt ? new Date(run.endedAt).getTime() : now;
  return Math.max(0, Math.floor((end - start) / 1000));
}

export function workoutRunSummary(state, elapsedSeconds = 0) {
  const activities = state?.activities || [];
  const completed = activities.filter(item => item.status === 'completed');
  const skipped = activities.filter(item => item.status === 'skipped');
  const pending = activities.filter(item => !['completed','skipped'].includes(item.status));
  let volumeKg = 0;
  let completedSets = 0;
  let rpeTotal = 0;
  let rpeCount = 0;

  completed.forEach(activity => {
    if (Number.isFinite(Number(activity.rpe))) {
      rpeTotal += Number(activity.rpe);
      rpeCount += 1;
    }
    (activity.sets || []).forEach(set => {
      if (!set.completed) return;
      completedSets += 1;
      const weight = Number(set.weightKg);
      const reps = Number(set.reps);
      if (Number.isFinite(weight) && weight > 0 && Number.isFinite(reps) && reps > 0) volumeKg += weight * reps;
    });
  });

  return {
    durationSeconds: Math.max(0, Math.round(elapsedSeconds || 0)),
    totalActivities: activities.length,
    completedActivities: completed.length,
    skippedActivities: skipped.length,
    pendingActivities: pending.length,
    completedSets,
    completionPercent: activities.length ? Math.round((completed.length / activities.length) * 100) : 0,
    volumeKg: Math.round(volumeKg * 10) / 10,
    averageRpe: rpeCount ? Math.round((rpeTotal / rpeCount) * 10) / 10 : null,
  };
}
