import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Archive, ArchiveRestore, CalendarDays, CheckCircle2, ChevronDown, ChevronRight,
  CirclePlay, Copy, Dumbbell, Edit3, Eye, FilePenLine, GripVertical, Layers3, LockKeyhole,
  ListPlus, Plus, Save, Search, Timer, Trash2, UserRound, X
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import ExerciseMedia from './ExerciseMedia';
import StudentTrainingExperience from './StudentTrainingExperience';
import {
  archiveWorkoutPlan, restoreWorkoutPlan, canManageWorkoutPlans, deleteWorkoutPlanPermanently, formatSeconds, saveWorkoutPlan, recordWorkoutCompletion
} from '../lib/training';
import { getSessionStretchingRecommendations, stretchingRules } from '../lib/stretching';
import '../styles/training-plans-fix.css';

const cx = (...items) => items.filter(Boolean).join(' ');
const workoutTitle = index => `Treino ${String.fromCharCode(65 + index)}`;
const normalizeWorkoutSessions = sessions => (sessions || []).map((session, index) => ({ ...session, title: workoutTitle(index) }));

function Badge({ children, tone = 'gray' }) { return <span className={`badge ${tone}`}>{children}</span>; }
function Card({ children, className = '' }) { return <div className={cx('card', className)}>{children}</div>; }

function emptyItem() {
  return { exerciseId: '', manualName: '', sets: 3, reps: '10', durationSeconds: '', restSeconds: 60, tempo: '', loadText: '', notes: '' };
}

function emptyBlock(type = 'standard') {
  return { type, title: '', rounds: 1, restAfterSeconds: '', items: [emptyItem()] };
}
function emptySession(index = 0) {
  return { title: workoutTitle(index), description: '', blocks: [emptyBlock()] };
}
function emptyPlan(studentId = '') {
  return { id: '', studentId, title: '', description: '', goal: '', status: 'draft', active: true, startDate: '', endDate: '', autoStretchingEnabled: true, sessions: [emptySession(0)] };
}
function deepCopyPlan(plan) {
  const clone = JSON.parse(JSON.stringify(plan));
  return { ...clone, sessions: normalizeWorkoutSessions(clone.sessions) };
}
function duplicatePlanFor(plan, studentId) {
  const clone = deepCopyPlan(plan);
  return {
    ...clone,
    id: '',
    studentId: studentId || clone.studentId,
    title: `Cópia de ${clone.title}`,
    status: 'draft',
    active: true,
    publishedAt: null,
    archivedAt: null,
    createdAt: null,
    updatedAt: null,
  };
}
function planStatus(plan) {
  if (plan.status === 'archived') return ['Arquivado', 'gray'];
  if (plan.status === 'published') return [plan.active ? 'Publicado · ativo' : 'Publicado', 'green'];
  return ['Rascunho', 'yellow'];
}
function getExerciseMedia(exercise, compact = false) {
  return <ExerciseMedia exercise={exercise} compact={compact}/>;
}

function itemExerciseName(item) { return item?.exercise?.name || item?.manualName || 'Exercício'; }
function localToday() { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

function ExercisePrescription({ item }) {
  const details = [];
  if (item.sets) details.push(`${item.sets} séries`);
  if (item.reps) details.push(`${item.reps} reps`);
  if (item.durationSeconds) details.push(formatSeconds(item.durationSeconds));
  if (item.restSeconds) details.push(`descanso ${formatSeconds(item.restSeconds)}`);
  return <div className="prescriptionLine">{details.join(' · ') || 'Prescrição por definir'}</div>;
}

function AutomaticStretching({ session, studentFacing = false }) {
  const recommendations = getSessionStretchingRecommendations(session);
  const [openStretch, setOpenStretch] = useState(null);
  if (!recommendations.length) return null;

  return <section className="automaticStretching">
    <div className="automaticStretchingHead">
      <div>
        <span className="eyebrow">RECUPERAÇÃO</span>
        <h3>Alongamentos recomendados</h3>
        <p>{studentFacing ? 'Realiza estes alongamentos no final do treino.' : 'Selecionados automaticamente a partir dos grupos musculares trabalhados neste treino.'}</p>
      </div>
      {!studentFacing && <span className="autoStretchBadge">AUTOMÁTICO</span>}
    </div>

    <div className="stretchingRules">
      {stretchingRules.map(rule => <div key={rule.label}><strong>{rule.label}</strong><span>{rule.detail}</span></div>)}
    </div>

    <div className="stretchingGrid">
      {recommendations.map(stretch => <article className="stretchingCard" key={stretch.key}>
        <button type="button" className="stretchingImage" onClick={() => setOpenStretch(stretch)} aria-label={`Ampliar alongamento de ${stretch.title}`}>
          <img src={stretch.image} alt={`Alongamento — ${stretch.title}`} loading="lazy"/>
          <span className="stretchingZoomHint">Ampliar</span>
        </button>
        <div className="stretchingCopy">
          <div className="stretchingTitleRow"><div><small>ALONGAMENTO</small><h4>{stretch.title}</h4></div><span>20–30 s</span></div>
          <b>{stretch.subtitle}</b>
          <p>{stretch.description}</p>
          {!studentFacing && !!stretch.matchedGroups?.length && <div className="stretchingReason">Incluído porque treinaste: {stretch.matchedGroups.join(', ')}</div>}
        </div>
      </article>)}
    </div>

    <div className="stretchingSafety"><CheckCircle2 size={17}/><span><b>Alongar não deve doer.</b> Mantém uma tensão confortável, respira normalmente e evita movimentos bruscos.</span></div>

    {openStretch && <div className="overlay stretchingLightbox" onClick={() => setOpenStretch(null)}>
      <div className="stretchingLightboxCard" onClick={event => event.stopPropagation()}>
        <button className="iconButton stretchingLightboxClose" onClick={() => setOpenStretch(null)} aria-label="Fechar"><X/></button>
        <div className="stretchingLightboxImage"><img src={openStretch.image} alt={`Alongamento — ${openStretch.title}`}/></div>
        <div className="stretchingLightboxCopy"><span className="eyebrow">ALONGAMENTO</span><h3>{openStretch.title}</h3><b>{openStretch.subtitle}</b><p>{openStretch.description}</p><strong>20–30 s · 1–2 séries por lado</strong></div>
      </div>
    </div>}
  </section>;
}

function PlanViewer({ plan, student, canManage, readOnlyReason = '', blockTypes = [], onBack, onEdit, onArchive, onRestore, onDelete, onDuplicate, onPreview, previewMode = false, onExitPreview, studentView = false, completions = [], completionBusy = false, onCompleteSession }) {
  const [openExercise, setOpenExercise] = useState(null);
  const [label, tone] = planStatus(plan);
  const typeByCode = Object.fromEntries(blockTypes.map(type => [type.code, type]));
  const todayCompletion = completions.find(item => item.completedOn === localToday());
  return <div className={cx('trainingViewer', previewMode && 'studentPreviewMode')}>
    {previewMode ? <div className="studentPreviewBanner"><div><Eye size={18}/><span><b>Pré-visualização · visão do aluno</b><small>Estás a ver este plano sem os controlos de edição do professor.</small></span></div><button className="secondary" onClick={onExitPreview}>Voltar à visão do professor</button></div> : <button className="backButton" onClick={onBack}><ArrowLeft size={17}/>Voltar aos planos</button>}
    <section className="trainingPlanHero card pad">
      <div>
        <span className="eyebrow">PLANO DE TREINO</span>
        <h1>{plan.title}</h1>
        <p>{plan.description || plan.goal || 'Plano de treino individual.'}</p>
        <div className="trainingHeroMeta">
          <Badge tone={tone}>{label}</Badge>
          {student && <span><UserRound size={14}/>{student.name}</span>}
          {(plan.startDate || plan.endDate) && <span><CalendarDays size={14}/>{plan.startDate || '—'} → {plan.endDate || '—'}</span>}
        </div>
      </div>
      {canManage && <div className="trainingHeroActions"><button className="secondary" onClick={onPreview}><Eye size={16}/>Ver como aluno</button><button className="secondary" onClick={onDuplicate}><Copy size={16}/>Duplicar plano</button><button className="secondary" onClick={onEdit}><Edit3 size={16}/>Editar</button>{plan.status === 'archived' ? <button className="primary" onClick={onRestore}><ArchiveRestore size={16}/>{plan.publishedAt ? 'Reativar plano' : 'Restaurar rascunho'}</button> : <button className="secondary" onClick={onArchive}><Archive size={16}/>Arquivar</button>}<button className="secondary destructiveButton" onClick={onDelete}><Trash2 size={16}/>Eliminar definitivamente</button></div>}
    </section>
    {readOnlyReason && !studentView && !previewMode && <div className="trainingReadOnlyBanner"><LockKeyhole size={18}/><div><b>Plano em modo só de leitura</b><span>{readOnlyReason}</span></div></div>}

    <div className="trainingSessionsView">
      {plan.sessions.map((session, sessionIndex) => <section className="card pad trainingSessionView" key={session.id || sessionIndex}>
        <div className="trainingSessionTitle"><div><h2>{workoutTitle(sessionIndex)}</h2>{session.description && <p>{session.description}</p>}</div><Dumbbell/></div>
        <div className="trainingBlocksView">
          {session.blocks.map((block, blockIndex) => { const definition = typeByCode[block.type] || { name:block.type, supportsRounds:block.type !== 'standard' }; return <div className={cx('trainingBlockView', block.type, block.type !== 'standard' && 'special')} key={block.id || blockIndex}>
            <div className="trainingBlockHeading"><div><Badge tone={block.type === 'standard' ? 'gray' : 'yellow'}>{definition.name}</Badge>{block.title && <b>{block.title}</b>}</div>{definition.supportsRounds && <span>{block.rounds || 1} volta(s){block.restAfterSeconds ? ` · ${formatSeconds(block.restAfterSeconds)} após bloco` : ''}</span>}</div>
            {block.items.map((item, itemIndex) => <button className={cx('trainingExerciseView', item.manualName && 'manual')} key={item.id || itemIndex} onClick={() => item.exercise && setOpenExercise(item)}>
              <div className="trainingExerciseThumb"><ExerciseMedia exercise={item.exercise || { name:item.manualName, group:'Texto livre' }} compact manual={!item.exercise}/></div>
              <div className="trainingExerciseCopy"><div><b>{itemExerciseName(item)}</b>{item.exercise && <ChevronRight size={17}/>}</div><small>{item.exercise ? `${item.exercise.group || ''}${item.exercise.equipment ? ` · ${item.exercise.equipment}` : ''}` : 'Texto livre · sem vídeo demonstrativo'}</small><ExercisePrescription item={item}/>{item.loadText && <span>Carga: {item.loadText}</span>}{item.notes && <p>{item.notes}</p>}</div>
            </button>)}
          </div>})}
        </div>
        {plan.autoStretchingEnabled !== false && <AutomaticStretching session={session} studentFacing={studentView || previewMode}/>} 
        {(studentView || previewMode) && <div className="trainingCompleteArea">{todayCompletion ? <div className="trainingCompletedToday"><CheckCircle2 size={20}/><div><b>Treino registado hoje</b><small>{todayCompletion.source==='trainer'?'Registado pelo teu professor.':'Marcado por ti como concluído.'}</small></div></div> : <button className="completeWorkoutButton" disabled={previewMode || completionBusy} onClick={()=>onCompleteSession?.(session)}><CheckCircle2 size={20}/>{previewMode?'Treino concluído':'Marcar treino como concluído'}</button>}</div>}
      </section>)}
    </div>

    {openExercise && <div className="overlay" onClick={() => setOpenExercise(null)}><div className="modal exerciseDemoModal" onClick={event => event.stopPropagation()}><div className="title"><div><span className="eyebrow">DEMONSTRAÇÃO</span><h2>{openExercise.exercise?.name}</h2></div><button className="iconButton" onClick={() => setOpenExercise(null)}><X/></button></div><div className="exerciseDemoMedia">{getExerciseMedia(openExercise.exercise, false)}</div><p>{openExercise.exercise?.description || 'Segue as indicações do teu professor.'}</p>{openExercise.exercise?.instructions && <div className="notice">{openExercise.exercise.instructions}</div>}<ExercisePrescription item={openExercise}/>{openExercise.notes && <div className="trainingNotes"><b>Notas do professor</b><p>{openExercise.notes}</p></div>}</div></div>}
  </div>;
}

function ExercisePicker({ item, exercises, onChange }) {
  const selected = exercises.find(exercise => exercise.id === item.exerciseId) || item.exercise || null;
  const initialMode = item.manualName && !item.exerciseId ? 'manual' : 'library';
  const [mode, setMode] = useState(initialMode);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('Todos');
  const [open, setOpen] = useState(false);

  const groups = useMemo(() => ['Todos', ...Array.from(new Set(exercises.filter(ex => ex.active).map(ex => ex.group).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'pt'))], [exercises]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exercises
      .filter(ex => ex.active)
      .filter(ex => group === 'Todos' || ex.group === group)
      .filter(ex => !q || ex.name.toLowerCase().includes(q) || (ex.aliases || []).some(alias => alias.toLowerCase().includes(q)))
      .sort((a,b) => {
        if (!q) return a.name.localeCompare(b.name,'pt');
        const aStart = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bStart = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        return aStart - bStart || a.name.localeCompare(b.name,'pt');
      })
      .slice(0, 36);
  }, [exercises, query, group]);

  function selectExercise(exercise) {
    onChange({ exerciseId: exercise.id, manualName: '' });
    setQuery(''); setOpen(false);
  }
  function changeMode(next) {
    setMode(next); setOpen(false); setQuery('');
    if (next === 'manual') onChange({ exerciseId:'', manualName:item.manualName || '' });
    else onChange({ exerciseId:item.exerciseId || '', manualName:'' });
  }

  return <div className="exercisePicker">
    <div className="exercisePickerModes">
      <button type="button" className={mode==='library'?'active':''} onClick={()=>changeMode('library')}><Search size={14}/>Biblioteca</button>
      <button type="button" className={mode==='manual'?'active':''} onClick={()=>changeMode('manual')}><FilePenLine size={14}/>Texto livre</button>
    </div>

    {mode === 'manual' ? <div className="manualExerciseInput">
      <input value={item.manualName || ''} onChange={event=>onChange({exerciseId:'',manualName:event.target.value})} placeholder="Escrever nome do exercício…"/>
      <small>O aluno verá apenas este nome e a prescrição. Não será enviado vídeo demonstrativo.</small>
    </div> : <>
      {selected && <div className="selectedExerciseCard">
        <div className="selectedExerciseThumb"><ExerciseMedia exercise={selected} compact/></div>
        <div><b>{selected.name}</b><small>{selected.group}{selected.equipment ? ` · ${selected.equipment}` : ''}</small></div>
        <button type="button" className="secondary" onClick={()=>setOpen(current=>!current)}>{open?'Fechar':'Alterar'}</button>
      </div>}
      {!selected && <button type="button" className="exercisePickerOpen" onClick={()=>setOpen(true)}><Search size={16}/><span>Pesquisar e selecionar exercício…</span></button>}
      {open && <div className="exercisePickerPanel">
        <div className="exercisePickerFilters">
          <div className="search"><Search size={16}/><input autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder="Ex.: agachamento…"/></div>
          <select value={group} onChange={event=>setGroup(event.target.value)}>{groups.map(name=><option value={name} key={name}>{name}</option>)}</select>
        </div>
        <div className="exercisePickerHint">{query ? `${results.length} resultado(s) visíveis` : group !== 'Todos' ? `Exercícios de ${gr…6568 tokens truncated…'.')))
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

// Retired fields are stripped when resuming older runs, preserving all other activity data.
function withoutRetiredEffort(activity) {
  const { rpe, prescribedRpe, ...rest } = activity || {};
  return rest;
}

export function normaliseRunState(state = {}) {
  const activities = Array.isArray(state?.activities) ? state.activities.map((activity, activityIndex) => ({
    ...withoutRetiredEffort(activity),
    activityIndex,
    status: ['pending','active','completed','skipped'].includes(activity?.status) ? activity.status : 'pending',
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

  completed.forEach(activity => {
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
  };
}
