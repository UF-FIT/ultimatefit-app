import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Circle,
  Dumbbell, Flame, History, MoreVertical, Play, SkipForward, Timer, Volume2, VolumeX, X
} from 'lucide-react';
import ExerciseMedia from './ExerciseMedia';
import StudentTrainingProgress from './StudentTrainingProgress';
import StudentTrainingProgressPage from './StudentTrainingProgressPage';
import {
  buildWorkoutRunState,
  cancelWorkoutRun,
  completeWorkoutRun,
  elapsedRunSeconds,
  fetchActiveWorkoutRun,
  fetchLegacyWorkoutLoads,
  fetchWorkoutRuns,
  fetchWorkoutSetHistory,
  normaliseRunState,
  saveWorkoutRunState,
  startWorkoutRun,
  workoutRunSummary,
} from '../lib/studentWorkoutRuns';
import '../styles/student-training-experience.css';

const cx = (...items) => items.filter(Boolean).join(' ');
const cloneValue = value => typeof structuredClone === 'function'
  ? structuredClone(value)
  : JSON.parse(JSON.stringify(value));

function isoLocal(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function startOfWeek(date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const day = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - day);
  return result;
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function formatDuration(totalSeconds = 0) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatKg(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 1 }).format(number);
}

function numberFrom(value) {
  if (value == null || value === '') return null;
  const number = Number(String(value).replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

function repsDisplay(value) {
  if (value == null || value === '') return '—';
  return String(value);
}

function planSort(a, b) {
  if (a.active !== b.active) return a.active ? -1 : 1;
  return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
}

function sessionLabel(index) {
  return `TREINO ${index + 1}`;
}

function sessionGroups(session) {
  const groups = [];
  (session?.blocks || []).forEach(block => (block.items || []).forEach(item => {
    const group = String(item?.exercise?.group || '').trim();
    if (group && !groups.includes(group)) groups.push(group);
  }));
  return groups.slice(0, 4);
}

function sessionExerciseCount(session) {
  return (session?.blocks || []).reduce((sum, block) => sum + (block.items || []).length, 0);
}

function streakWeeks(completions = []) {
  const days = new Set(completions.map(item => item.completedOn).filter(Boolean));
  if (!days.size) return 0;
  const weeks = new Set();
  days.forEach(value => {
    const [year, month, day] = value.split('-').map(Number);
    const monday = startOfWeek(new Date(year, month - 1, day, 12));
    weeks.add(isoLocal(monday));
  });
  let cursor = startOfWeek(new Date());
  let streak = 0;
  while (weeks.has(isoLocal(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -7);
  }
  return streak;
}

function groupHistoryRows(setHistory, legacyLoads, activity) {
  const matches = (setHistory || []).filter(row =>
    (activity.workoutItemId && row.workout_item_id === activity.workoutItemId)
    || (activity.exerciseId && row.exercise_id === activity.exerciseId)
  );
  const legacy = (legacyLoads || []).filter(row =>
    (activity.workoutItemId && row.workout_item_id === activity.workoutItemId)
    || (activity.exerciseId && row.exercise_id === activity.exerciseId)
  );
  const byDay = new Map();
  matches.forEach(row => {
    const key = row.completed_on;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push({
      setIndex: Number(row.set_index) || 1,
      reps: Number(row.reps_completed) || 1,
      weight: row.weight_kg == null ? null : Number(row.weight_kg),
      source: 'run',
    });
  });
  legacy.forEach(row => {
    const key = row.completed_on;
    if (byDay.has(key)) return;
    const sets = Math.max(1, Number(row.sets_completed) || 1);
    byDay.set(key, Array.from({ length: sets }, (_, index) => ({
      setIndex: index + 1,
      reps: Number(row.reps_completed) || 1,
      weight: row.weight_kg == null ? null : Number(row.weight_kg),
      source: 'legacy',
    })));
  });
  return [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 8)
    .map(([date, sets]) => ({ date, sets: sets.sort((a, b) => a.setIndex - b.setIndex) }));
}

function latestSetFor(historyRows, setIndex) {
  for (const day of historyRows) {
    const exact = day.sets.find(set => set.setIndex === setIndex);
    if (exact) return exact;
    if (day.sets[0]) return day.sets[0];
  }
  return null;
}

function WeekStrip({ completions, selectedDate, onSelect }) {
  const [offset, setOffset] = useState(0);
  const touch = useRef(null);
  const completed = useMemo(() => new Set(completions.map(item => item.completedOn).filter(Boolean)), [completions]);
  const base = addDays(startOfWeek(new Date()), offset * 7);
  const days = Array.from({ length: 7 }, (_, index) => addDays(base, index));
  const labels = ['seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.', 'dom.'];

  function move(delta) {
    setOffset(current => current + delta);
  }

  return <div
    className="ufTrainingWeekWrap"
    onTouchStart={event => { touch.current = event.touches?.[0]?.clientX ?? null; }}
    onTouchEnd={event => {
      if (touch.current == null) return;
      const end = event.changedTouches?.[0]?.clientX ?? touch.current;
      const delta = end - touch.current;
      touch.current = null;
      if (Math.abs(delta) < 45) return;
      move(delta > 0 ? -1 : 1);
    }}
  >
    <button type="button" className="ufTrainingWeekArrow left" onClick={() => move(-1)} aria-label="Semana anterior"><ChevronLeft size={17}/></button>
    <div className="ufTrainingWeek">
      {days.map((date, index) => {
        const iso = isoLocal(date);
        const done = completed.has(iso);
        const selected = selectedDate === iso;
        return <button
          type="button"
          className={cx('ufTrainingDay', selected && 'selected', done && 'completed')}
          key={iso}
          onClick={() => onSelect(iso)}
        >
          <span>{labels[index]}</span>
          <b>{date.getDate()}</b>
          {done && <i aria-label="Treino realizado">🔥</i>}
        </button>;
      })}
    </div>
    <button type="button" className="ufTrainingWeekArrow right" onClick={() => move(1)} aria-label="Semana seguinte"><ChevronRight size={17}/></button>
  </div>;
}

function VideoModal({ activity, onClose }) {
  if (!activity) return null;
  const exercise = {
    id: activity.exerciseId,
    name: activity.name,
    group: activity.group,
    description: activity.description,
    instructions: activity.instructions,
    mediaUrl: activity.mediaUrl,
    mediaKind: activity.mediaKind,
    externalMediaUrl: activity.externalMediaUrl,
  };
  return createPortal(<div className="ufWorkoutModalBackdrop" onClick={onClose}>
    <div className="ufWorkoutVideoModal" onClick={event => event.stopPropagation()}>
      <button type="button" className="ufWorkoutModalClose" onClick={onClose}><X/></button>
      <span className="ufWorkoutKicker">{activity.group || 'EXERCÍCIO'}</span>
      <h2>{activity.name}</h2>
      <div className="ufWorkoutVideoMedia"><ExerciseMedia exercise={exercise}/></div>
      {(activity.instructions || activity.description) && <p>{activity.instructions || activity.description}</p>}
    </div>
  </div>, document.body);
}

function HistoryModal({ activity, rows, onClose }) {
  if (!activity) return null;
  return createPortal(<div className="ufWorkoutModalBackdrop" onClick={onClose}>
    <div className="ufWorkoutHistoryModal" onClick={event => event.stopPropagation()}>
      <div className="ufWorkoutHistoryHead">
        <div><span className="ufWorkoutKicker">HISTÓRICO DA ATIVIDADE</span><h2>{activity.name}</h2></div>
        <button type="button" className="ufWorkoutModalClose static" onClick={onClose}><X/></button>
      </div>
      {rows.length ? <div className="ufWorkoutHistoryDays">{rows.map(day => <div key={day.date} className="ufWorkoutHistoryDay">
        <b>{new Intl.DateTimeFormat('pt-PT', { day:'2-digit', month:'2-digit', year:'numeric' }).format(new Date(`${day.date}T12:00:00`))}</b>
        <div>{day.sets.map(set => <span key={set.setIndex}>{set.reps} × {set.weight == null ? 'sem carga' : `${formatKg(set.weight)} kg`}</span>)}</div>
      </div>)}</div> : <div className="ufWorkoutEmptyHistory">Ainda não há registos anteriores para esta atividade.</div>}
    </div>
  </div>, document.body);
}

function QuickSetModal({ activity, set, onClose, onSave }) {
  const [reps, setReps] = useState(String(set?.reps ?? ''));
  const [weight, setWeight] = useState(set?.weightKg == null ? '' : String(set.weightKg).replace('.', ','));
  if (!activity || !set) return null;
  return createPortal(<div className="ufWorkoutModalBackdrop" onClick={onClose}>
    <div className="ufWorkoutQuickSetModal" onClick={event => event.stopPropagation()}>
      <span className="ufWorkoutKicker">{activity.name}</span>
      <h2>Série {set.index}</h2>
      <div className="ufWorkoutQuickSetFields">
        <label>Repetições<input inputMode="numeric" value={reps} onChange={event => setReps(event.target.value.replace(/[^0-9]/g,''))}/></label>
        <label>Carga (kg)<input inputMode="decimal" value={weight} onChange={event => setWeight(event.target.value.replace(/[^0-9,.]/g,''))} placeholder="Sem carga"/></label>
      </div>
      <div className="ufWorkoutModalActions">
        <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
        <button type="button" className="primary" onClick={() => onSave({
          reps: Math.max(1, Number(reps) || 1),
          weightKg: numberFrom(weight),
        })}>Guardar</button>
      </div>
    </div>
  </div>, document.body);
}

function RestView({ rest, activity, nextActivity, simplified = false, onSkip }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!rest?.active) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [rest?.active, rest?.endsAt]);
  if (!rest?.active || !rest?.endsAt) return null;
  const remaining = Math.max(0, Math.ceil((new Date(rest.endsAt).getTime() - now) / 1000));
  const total = Math.max(1, Math.round((new Date(rest.endsAt).getTime() - new Date(rest.startedAt || Date.now()).getTime()) / 1000));
  const progress = Math.max(0, Math.min(100, (remaining / total) * 100));

  if (simplified) return <div className="ufSimplifiedRestCard">
    <button type="button" onClick={onSkip} aria-label="Pular intervalo"><X/></button>
    <b>{formatDuration(remaining)}</b>
    <div className="ufSimplifiedRestTrack"><span style={{ width: `${progress}%` }}/></div>
    <span>Pausa para a próxima atividade</span>
  </div>;

  return createPortal(<div className="ufWorkoutModalBackdrop dark">
    <div className="ufWorkoutRestModal">
      <h2>Intervalo</h2>
      <p>Tempo de espera para a próxima atividade</p>
      <div className="ufWorkoutRestRing" style={{ '--rest-progress': `${progress * 3.6}deg` }}><b>{formatDuration(remaining)}</b></div>
      {nextActivity && <div className="ufWorkoutNextActivity"><b>Próxima atividade</b><span>{nextActivity.group || 'TREINO'}</span><strong>{nextActivity.name}</strong></div>}
      <button type="button" className="primary full" onClick={onSkip}>Pular</button>
    </div>
  </div>, document.body);
}

function PlanExerciseCard({ item, blockType, expanded, onToggle, onVideo }) {
  const manual = !item.exercise;
  const setCount = Math.max(1, Number(item.sets) || 1);
  const chips = manual ? [] : Array.from({ length:setCount }, (_, index) => {
    if (item.durationSeconds) {
      const minutes = Math.max(1, Math.round(Number(item.durationSeconds) / 60));
      return `${minutes} min${item.loadText ? ` · ${item.loadText}` : ''}`;
    }
    return `${item.reps || '—'}${item.loadText ? ` × ${item.loadText}` : ''}`;
  });

  return <article className={cx('ufPlanExerciseCard', manual && 'manual')}>
    {blockType && blockType !== 'standard' && <span className="ufPlanSpecialTag">{String(blockType).replace(/-/g,' ').toUpperCase()}</span>}
    <div className="ufPlanExerciseTop">
      <div>
        <span className="ufWorkoutKicker">{manual ? 'DESCRITIVA' : (item.exercise?.group || 'EXERCÍCIO')}</span>
        <h3>{manual ? 'Texto livre' : item.exercise?.name}</h3>
      </div>
      {!manual && (item.exercise?.mediaUrl || item.exercise?.externalMediaUrl) && <button type="button" className="ufPlanVideoButton" onClick={onVideo}><Play size={16}/>Ver vídeo</button>}
    </div>
    {(item.notes || manual) && <p className="ufPlanExerciseNote">{item.notes || item.manualName}</p>}
    {!!chips.length && <div className="ufPlanSetChips">{chips.map((chip,index)=><span key={index}>{chip}</span>)}</div>}
    {(item.exercise?.instructions || item.exercise?.description || item.tempo || item.restSeconds) && <button type="button" className="ufPlanMore" onClick={onToggle}>{expanded ? 'VER MENOS' : 'VER MAIS'}<ChevronDown size={16}/></button>}
    {expanded && <div className="ufPlanExpandedCopy">
      {item.exercise?.instructions && <p>{item.exercise.instructions}</p>}
      {!item.exercise?.instructions && item.exercise?.description && <p>{item.exercise.description}</p>}
      <div>{item.tempo && <span>Tempo: {item.tempo}</span>}{item.restSeconds && <span>Intervalo: {item.restSeconds}s</span>}</div>
    </div>}
  </article>;
}

function PlanDetail({ plan, selectedSessionId, activeRun, completions = [], onBack, onStart, onAccessRun }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [expandedItem, setExpandedItem] = useState('');
  const [video, setVideo] = useState(null);
  const selectedSession = plan.sessions.find(session => session.id === selectedSessionId) || plan.sessions[0];
  const selectedSessionCompletions = completions.filter(item => item.planId === plan.id && item.sessionId === selectedSession?.id).length;

  const distribution = useMemo(() => {
    const totals = new Map();
    let total = 0;
    (plan.sessions || []).forEach(session => (session.blocks || []).forEach(block => (block.items || []).forEach(item => {
      if (!item.exercise) return;
      const sets = Math.max(1, Number(item.sets) || 1);
      const group = item.exercise.group || 'Outro';
      totals.set(group, (totals.get(group) || 0) + sets);
      total += sets;
    })));
    return [...totals.entries()].map(([group, sets]) => ({ group, sets, percent: total ? Math.round((sets / total) * 100) : 0 })).sort((a,b)=>b.sets-a.sets);
  }, [plan]);

  return <div className="ufStudentPlanDetail">
    <button type="button" className="ufRoundBack" onClick={onBack}><ArrowLeft/></button>
    <section className="ufStudentPlanHero">
      <div className="ufStudentPlanHeroIcon"><Dumbbell/></div>
      <h1>{plan.title}</h1>
      <p>{selectedSession?.title || 'Treino'}</p>
      <span className="ufStudentPlanRunCount">{selectedSessionCompletions ? `${selectedSessionCompletions} treino${selectedSessionCompletions===1?'':'s'} realizado${selectedSessionCompletions===1?'':'s'}` : 'Nenhum treino realizado'}</span>
      {activeRun ? <button type="button" className="ufBigYellowButton" onClick={onAccessRun}>Aceder ao treino em curso</button>
        : <button type="button" className="ufBigYellowButton" onClick={() => onStart(selectedSession)}>Iniciar treino</button>}
    </section>

    <section className={cx('ufPlanDetailsPanel', detailsOpen && 'open')}>
      <button type="button" onClick={()=>setDetailsOpen(value=>!value)}>Ver detalhes<ChevronDown/></button>
      {detailsOpen && <div className="ufPlanDetailsContent">
        <div><span>Data início</span><b>{plan.startDate || '—'}</b></div>
        <div><span>Objetivo</span><b>{plan.goal || 'Plano individual'}</b></div>
        {!!distribution.length && <div className="ufPlanDistribution">
          {distribution.map(row => <div key={row.group}><span>{row.group}</span><i><b style={{width:`${Math.max(4,row.percent)}%`}}/></i><strong>{row.percent}%</strong></div>)}
        </div>}
      </div>}
    </section>

    <div className="ufPlanSessionsCompact">
      {plan.sessions.map((session, sessionIndex) => <section key={session.id || sessionIndex} className={cx('ufPlanSessionCompact', session.id===selectedSession?.id && 'selected')}>
        <div className="ufPlanSessionLabel">{sessionLabel(sessionIndex)}</div>
        {session.id !== selectedSession?.id && <button type="button" className="ufPlanChooseSession" onClick={() => onStart(session)} disabled={Boolean(activeRun)}>Iniciar este treino</button>}
        {(session.blocks || []).map((block, blockIndex) => block.type !== 'standard'
          ? <React.Fragment key={block.id || blockIndex}>
              <div className="ufPlanSpecialGroup">
                <span className="ufPlanSpecialGroupTitle">{(block.title || block.type).replace(/-/g,' ').toUpperCase()}</span>
                {(block.items || []).map((item, itemIndex) => <PlanExerciseCard
                  key={item.id || itemIndex}
                  item={item}
                  expanded={expandedItem === item.id}
                  onToggle={()=>setExpandedItem(current=>current===item.id?'':item.id)}
                  onVideo={()=>setVideo({
                    exerciseId:item.exerciseId, name:item.exercise?.name, group:item.exercise?.group,
                    description:item.exercise?.description, instructions:item.exercise?.instructions,
                    mediaUrl:item.exercise?.mediaUrl, mediaKind:item.exercise?.mediaKind,
                    externalMediaUrl:item.exercise?.externalMediaUrl,
                  })}
                />)}
              </div>
              {Number(block.restAfterSeconds)>0 && <div className="ufPlanRestPill"><Timer size={15}/>Intervalo de {block.restAfterSeconds}s</div>}
            </React.Fragment>
          : (block.items || []).map((item, itemIndex) => <React.Fragment key={item.id || itemIndex}>
              <PlanExerciseCard
                item={item}
                expanded={expandedItem === item.id}
                onToggle={()=>setExpandedItem(current=>current===item.id?'':item.id)}
                onVideo={()=>setVideo({
                  exerciseId:item.exerciseId, name:item.exercise?.name, group:item.exercise?.group,
                  description:item.exercise?.description, instructions:item.exercise?.instructions,
                  mediaUrl:item.exercise?.mediaUrl, mediaKind:item.exercise?.mediaKind,
                  externalMediaUrl:item.exercise?.externalMediaUrl,
                })}
              />
              {Number(item.restSeconds)>0 && <div className="ufPlanRestPill"><Timer size={15}/>Intervalo de {item.restSeconds}s</div>}
            </React.Fragment>)
        )}
      </section>)}
    </div>
    <VideoModal activity={video} onClose={()=>setVideo(null)}/>
  </div>;
}

function SummaryScreen({ run, state, elapsed, onBackToRun, onFinish, busy }) {
  const summary = workoutRunSummary(state, elapsed);
  return <div className="ufWorkoutSummaryScreen">
    <button type="button" className="ufRoundBack dark" onClick={onBackToRun}><ArrowLeft/></button>
    <div className="ufWorkoutSummaryMedal"><CheckCircle2/></div>
    <h1>Treino completo!</h1>
    <p>{run?.planTitle || state.planTitle}</p>
    <div className="ufWorkoutSummaryInsight">
      <span>RESUMO DO TREINO</span>
      <strong>{summary.completionPercent}% concluído em {formatDuration(summary.durationSeconds)}</strong>
      <p>{summary.volumeKg > 0 ? `${formatKg(summary.volumeKg)} kg de volume registado.` : 'Treino registado sem volume de carga calculável.'}</p>
    </div>
    <div className="ufWorkoutSummaryGrid">
      <div><small>DURAÇÃO</small><b>{formatDuration(summary.durationSeconds)}</b></div>
      <div><small>VOLUME</small><b>{formatKg(summary.volumeKg)} kg</b></div>
      <div><small>CONCLUÍDO</small><b>{summary.completionPercent}%</b></div>
      <div><small>ATIVIDADES</small><b>{summary.completedActivities}/{summary.totalActivities}</b></div>
      <div><small>SÉRIES</small><b>{summary.completedSets}</b></div>
    </div>
    <button type="button" className="ufBigYellowButton" disabled={busy} onClick={()=>onFinish(summary)}>{busy?'A guardar…':'Finalizar treino'}</button>
  </div>;
}

function GuidedActivity({ activity, historyRows, onChangeSet, onToggleSet, onVideo, onHistory }) {
  if (!activity) return null;
  const manual = activity.type === 'manual';
  const cardio = activity.type === 'cardio';
  const timed = activity.type === 'timed';

  return <div className="ufGuidedActivityWrap">
    <span className="ufGuidedActivityNumber">ATIVIDADE {activity.activityIndex + 1}</span>
    <section className={cx('ufGuidedActivityCard', manual && 'manual')}>
      {manual ? <>
        <h2>Texto livre</h2>
        <p className="ufGuidedManualText">{activity.manualName || activity.name}{activity.notes ? `\n\n${activity.notes}` : ''}</p>
      </> : <>
        <div className="ufGuidedActivityTop">
          <span>{activity.group || 'EXERCÍCIO'}</span>
          {(activity.mediaUrl || activity.externalMediaUrl) && <button type="button" onClick={onVideo}><Play size={17}/>Ver vídeo</button>}
        </div>
        <h2>{activity.name}</h2>
        {(activity.notes || activity.instructions) && <p className="ufGuidedInstructions">{activity.notes || activity.instructions}</p>}

        {cardio ? <div className="ufGuidedCardioGrid">
          <label><span>Minutos</span><input inputMode="numeric" value={activity.cardio?.minutes || ''} readOnly/></label>
          <label><span>Carga (%)</span><input inputMode="decimal" value={activity.cardio?.intensity ?? ''} readOnly/></label>
          <div><span>Último treino</span><b>—</b></div>
          <button type="button" className={cx('ufGuidedSetDone', activity.sets?.[0]?.completed && 'done')} onClick={()=>onToggleSet(0)}>{activity.sets?.[0]?.completed?<Check/>:<Circle/>}</button>
        </div> : timed && activity.sets?.length ? <div className="ufGuidedTimedSets">
          <div className="ufGuidedTimedLabels"><span></span><span>Tempo</span><span></span></div>
          {activity.sets.map((set,index)=><div className={cx('ufGuidedTimedRow',set.completed&&'done')} key={set.index}>
            <b>{set.index}</b>
            <span>{set.durationSeconds || activity.durationSeconds}s</span>
            <button type="button" className={cx('ufGuidedSetDone', set.completed && 'done')} onClick={()=>onToggleSet(index)}>{set.completed?<Check/>:<Circle/>}</button>
          </div>)}
        </div> : activity.sets?.length ? <div className="ufGuidedSets">
          <div className="ufGuidedSetLabels"><span></span><span>Reps</span><span>Carga (kg)</span><span>Último treino</span><span></span></div>
          {activity.sets.map((set, index) => {
            const latest = latestSetFor(historyRows, set.index);
            return <div className={cx('ufGuidedSetRow', set.completed && 'done')} key={set.index}>
              <b>{set.index}</b>
              <input inputMode="numeric" value={set.reps} onChange={event=>onChangeSet(index,{reps:Math.max(1,Number(event.target.value)||1)})}/>
              <input inputMode="decimal" value={set.weightKg == null ? '' : String(set.weightKg).replace('.',',')} onChange={event=>onChangeSet(index,{weightKg:numberFrom(event.target.value)})} placeholder="—"/>
              <span>{latest ? (latest.weight == null ? `${latest.reps} reps` : `${latest.reps} × ${formatKg(latest.weight)} kg`) : '—'}</span>
              <button type="button" className={cx('ufGuidedSetDone', set.completed && 'done')} onClick={()=>onToggleSet(index)}>{set.completed?<Check/>:<Circle/>}</button>
            </div>;
          })}
        </div> : null}
        <button type="button" className="ufActivityHistoryButton" onClick={onHistory}><History size={19}/>HISTÓRICO DA ATIVIDADE</button>
      </>}
    </section>
  </div>;
}

function SimplifiedActivityCard({ activity, blockTitle, onVideo, onComplete, onEditSet }) {
  const done = activity.status === 'completed';
  const skipped = activity.status === 'skipped';
  const manual = activity.type === 'manual';
  const cardio = activity.type === 'cardio';
  const timed = activity.type === 'timed';

  return <article className={cx('ufSimplifiedActivityCard', done && 'done', skipped && 'skipped')}>
    {blockTitle && <span className="ufSimplifiedBlockTitle">{blockTitle}</span>}
    <div className="ufSimplifiedActivityHead">
      <div className="ufSimplifiedActivityMeta">
        <span>{manual ? 'Texto livre' : (activity.group || 'EXERCÍCIO')}</span>
        {!manual && (activity.mediaUrl || activity.externalMediaUrl) && <button type="button" onClick={onVideo}><Play size={18}/>Ver vídeo</button>}
      </div>
      <button type="button" className={cx('ufSimplifiedDoneCircle', done && 'done', skipped && 'skipped')} onClick={onComplete}>{done?<Check/>:<Circle/>}</button>
    </div>
    <h3>{manual ? 'Texto livre' : activity.name}</h3>
    {manual ? <p className="ufSimplifiedManual">{activity.manualName || activity.name}{activity.notes ? `\n${activity.notes}` : ''}</p>
      : <>
        {activity.notes && <p>{activity.notes}</p>}
        {cardio ? <div className="ufSimplifiedSetChips"><button type="button">{activity.cardio?.minutes || 0} × {activity.cardio?.intensity ?? '—'}%</button></div>
          : <div className="ufSimplifiedSetChips">{activity.sets.map((set,index)=><button
              type="button"
              className={set.completed?'done':''}
              key={set.index}
              onClick={timed ? undefined : ()=>onEditSet(index)}
            >{timed ? (set.plannedReps || `${activity.durationSeconds}s`) : `${repsDisplay(set.plannedReps || set.reps)} × ${set.weightKg == null ? '—' : `${formatKg(set.weightKg)} kg`}`}</button>)}</div>}
      </>}
  </article>;
}

function WorkoutRunner({
  run, initialState, historySets, legacyLoads,
  onExitToHome, onRunCancelled, onRunCompleted,
}) {
  const [state, setState] = useState(()=>normaliseRunState(initialState || run?.state || {}));
  const [mode, setMode] = useState(run?.mode || 'guided');
  const [menuOpen, setMenuOpen] = useState(false);
  const [video, setVideo] = useState(null);
  const [historyActivity, setHistoryActivity] = useState(null);
  const [quickSet, setQuickSet] = useState(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(()=>elapsedRunSeconds(run));
  const saveTimer = useRef(null);
  const lastRestActive = useRef(state.rest?.active === true);

  useEffect(() => {
    document.body.classList.add('ufWorkoutImmersiveOpen');
    return () => {
      document.body.classList.remove('ufWorkoutImmersiveOpen');
      window.clearTimeout(saveTimer.current);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed(elapsedRunSeconds(run)), 1000);
    return () => window.clearInterval(timer);
  }, [run?.startedAt]);

  useEffect(() => {
    if (!state.activities.length) return;
    const index = Math.max(0, Math.min(state.currentIndex || 0, state.activities.length - 1));
    if (state.activities[index]?.status !== 'pending') return;
    setState(current => {
      const next = cloneValue(current);
      next.activities[index].status = 'active';
      next.activities[index].startedAt ||= new Date().toISOString();
      return next;
    });
  }, [state.currentIndex, state.activities.length]);

  useEffect(() => {
    if (!run?.id) return undefined;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveWorkoutRunState(run.id, mode, state).catch(error => console.warn('Não foi possível sincronizar o treino em curso.', error));
    }, 500);
    return () => window.clearTimeout(saveTimer.current);
  }, [run?.id, mode, state]);

  useEffect(() => {
    if (!run?.id) return undefined;
    const flush = () => {
      window.clearTimeout(saveTimer.current);
      saveWorkoutRunState(run.id, mode, state).catch(() => {});
    };
    const visibility = () => { if (document.hidden) flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [run?.id, mode, state]);

  useEffect(() => {
    if (!state.rest?.active || !state.rest?.endsAt) {
      lastRestActive.current = false;
      return undefined;
    }
    lastRestActive.current = true;
    const tick = () => {
      const remaining = new Date(state.rest.endsAt).getTime() - Date.now();
      if (remaining > 0) return;
      setState(current => ({ ...current, rest:{ active:false, startedAt:null, endsAt:null, afterActivityIndex:null } }));
      if (state.soundEnabled) {
        try {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (AudioContextClass) {
            const ctx = new AudioContextClass();
            const oscillator = ctx.createOscillator();
            const gain = ctx.createGain();
            oscillator.frequency.value = 720;
            gain.gain.value = .06;
            oscillator.connect(gain); gain.connect(ctx.destination);
            oscillator.start(); oscillator.stop(ctx.currentTime + .14);
          }
        } catch {}
      }
    };
    const timer = window.setInterval(tick, 250);
    tick();
    return () => window.clearInterval(timer);
  }, [state.rest?.active, state.rest?.endsAt, state.soundEnabled]);

  const activities = state.activities || [];
  const current = activities[state.currentIndex] || activities.find(item => !['completed','skipped'].includes(item.status)) || activities[activities.length - 1];
  const historyRows = current ? groupHistoryRows(historySets, legacyLoads, current) : [];
  const completedCount = activities.filter(item=>item.status==='completed').length;
  const progressPercent = activities.length ? (completedCount / activities.length) * 100 : 0;
  const currentSets = current?.sets || [];
  const currentRequiresSets = currentSets.length > 0;
  const currentSetsComplete = !currentRequiresSets || currentSets.every(set => set.completed);
  const canCompleteCurrent = Boolean(current) && currentSetsComplete;

  function patchState(mutator) {
    setState(currentState => {
      const next = cloneValue(currentState);
      mutator(next);
      return next;
    });
  }

  function patchSet(activityIndex, setIndex, patch) {
    patchState(next => {
      Object.assign(next.activities[activityIndex].sets[setIndex], patch);
    });
  }

  function toggleSet(activityIndex, setIndex) {
    patchState(next => {
      const set = next.activities[activityIndex].sets[setIndex];
      set.completed = !set.completed;
      set.completedAt = set.completed ? new Date().toISOString() : null;
    });
  }

  function requestComplete(index, completeAllSets = false) {
    const activity = activities[index];
    if (!activity || activity.status === 'completed') return;
    if (!completeAllSets && (activity.sets || []).length && !(activity.sets || []).every(set => set.completed)) return;
    finishActivity(index, completeAllSets);
  }

  function finishActivity(index, completeAllSets = false) {
    const now = new Date();
    patchState(next => {
      const activity = next.activities[index];
      activity.status = 'completed';
      activity.completedAt = now.toISOString();
      if (completeAllSets) {
        (activity.sets || []).forEach(set => {
          if (!set.completed) {
            set.completed = true;
            set.completedAt = now.toISOString();
          }
        });
      }
      const nextPending = next.activities.findIndex((item, itemIndex) => itemIndex > index && !['completed','skipped'].includes(item.status));
      const fallbackPending = next.activities.findIndex(item => !['completed','skipped'].includes(item.status));
      const nextIndex = nextPending >= 0 ? nextPending : fallbackPending;
      if (nextIndex >= 0) {
        next.currentIndex = nextIndex;
        next.activities[nextIndex].status = 'active';
        next.activities[nextIndex].startedAt ||= now.toISOString();
      }
      if (activity.restSeconds > 0 && nextIndex >= 0) {
        next.rest = {
          active:true,
          startedAt:now.toISOString(),
          endsAt:new Date(now.getTime() + activity.restSeconds * 1000).toISOString(),
          afterActivityIndex:index,
        };
      } else {
        next.rest = { active:false, startedAt:null, endsAt:null, afterActivityIndex:null };
      }
    });
    const after = activities.map((item,i)=>i===index?{...item,status:'completed'}:item);
    if (after.every(item => ['completed','skipped'].includes(item.status))) {
      window.setTimeout(()=>setSummaryOpen(true), 200);
    }
  }

  function skipActivity(index) {
    patchState(next => {
      const now = new Date().toISOString();
      next.activities[index].status = 'skipped';
      next.activities[index].skippedAt = now;
      const nextIndex = next.activities.findIndex((item, itemIndex) => itemIndex > index && !['completed','skipped'].includes(item.status));
      const fallback = next.activities.findIndex(item => !['completed','skipped'].includes(item.status));
      const resolved = nextIndex >= 0 ? nextIndex : fallback;
      if (resolved >= 0) {
        next.currentIndex = resolved;
        next.activities[resolved].status = 'active';
        next.activities[resolved].startedAt ||= now;
      }
      next.rest = { active:false, startedAt:null, endsAt:null, afterActivityIndex:null };
    });
  }

  function skipRest() {
    patchState(next => { next.rest = { active:false, startedAt:null, endsAt:null, afterActivityIndex:null }; });
  }

  async function cancelRun() {
    if (!window.confirm('Cancelar este treino? O progresso desta sessão não será registado como treino concluído.')) return;
    setBusy(true);
    try {
      await cancelWorkoutRun(run.id);
      onRunCancelled();
    } catch (error) {
      window.alert(error.message || 'Não foi possível cancelar o treino.');
    } finally { setBusy(false); }
  }

  async function exitToHome() {
    window.clearTimeout(saveTimer.current);
    try {
      if (run?.id) await saveWorkoutRunState(run.id, mode, state);
    } catch (error) {
      console.warn('Não foi possível sincronizar o treino antes de sair.', error);
    } finally {
      onExitToHome();
    }
  }

  async function finalise(summary) {
    setBusy(true);
    try {
      await completeWorkoutRun(run.id, state, summary);
      onRunCompleted(summary);
    } catch (error) {
      window.alert(error.message || 'Não foi possível concluir o treino.');
    } finally { setBusy(false); }
  }

  const menu = <div className="ufWorkoutMoreMenu">
    <button type="button" onClick={()=>{setMode(mode==='guided'?'simplified':'guided');setMenuOpen(false);}}>{mode==='guided'?'Modo simplificado':'Modo guiado'}</button>
    <button type="button" className="danger" onClick={()=>{setMenuOpen(false);cancelRun();}}>Cancelar treino</button>
  </div>;

  const topControls = <div className="ufWorkoutTopControls">
    <button type="button" className="ufWorkoutCircleButton" onClick={exitToHome}><ArrowLeft/></button>
    <div className="ufWorkoutTopRight">
      <button type="button" className="ufWorkoutCircleButton sound" onClick={()=>patchState(next=>{next.soundEnabled=!next.soundEnabled;})}>{state.soundEnabled?<Volume2/>:<VolumeX/>}</button>
      <button type="button" className="ufWorkoutEndButton" onClick={()=>setSummaryOpen(true)}><Check/>Encerrar</button>
      <div className="ufWorkoutMenuWrap">
        <button type="button" className="ufWorkoutCircleButton" onClick={()=>setMenuOpen(value=>!value)}><MoreVertical/></button>
        {menuOpen && menu}
      </div>
    </div>
  </div>;

  const runner = <div className={cx('ufWorkoutRunner', mode==='simplified' && 'simplified')}>
    {topControls}
    {mode === 'guided' ? <>
      <GuidedActivity
        activity={current}
        historyRows={historyRows}
        onChangeSet={(setIndex,patch)=>patchSet(current.activityIndex,setIndex,patch)}
        onToggleSet={setIndex=>toggleSet(current.activityIndex,setIndex)}
        onVideo={()=>setVideo(current)}
        onHistory={()=>setHistoryActivity(current)}
      />
      <div className="ufGuidedBottomBar">
        <div className="ufGuidedBottomMeta"><b>{run.planTitle || state.planTitle}</b><strong>{formatDuration(elapsed)}</strong></div>
        <div className="ufGuidedProgressSegments">{activities.map((item,index)=><span key={item.key||index} className={cx(item.status==='completed'&&'done',item.status==='skipped'&&'skipped',index===state.currentIndex&&'current')}/>)}</div>
        <div className="ufGuidedBottomActions">
          <button type="button" className="ufSkipButton" onClick={()=>skipActivity(current.activityIndex)} disabled={busy}><X/>Pular</button>
          <button type="button" className="ufCompleteActivityButton" onClick={()=>requestComplete(current.activityIndex, false)} disabled={busy || !canCompleteCurrent} aria-disabled={busy || !canCompleteCurrent} title={!canCompleteCurrent ? 'Conclui primeiro todas as séries desta atividade.' : undefined}><CheckCircle2/>Completar atividade</button>
        </div>
      </div>
      <RestView rest={state.rest} activity={activities[state.rest?.afterActivityIndex]} nextActivity={current} onSkip={skipRest}/>
    </> : <>
      <div className="ufSimplifiedList">
        {state.blocks?.map((block, blockIndex) => {
          const blockActivities = activities.filter(activity => activity.blockId === block.id);
          if (!blockActivities.length) return null;
          if (block.type !== 'standard') return <section className="ufSimplifiedSpecialGroup" key={block.id||blockIndex}>
            <span className="ufSimplifiedSpecialTitle">{(block.title || block.type).replace(/-/g,' ').toUpperCase()}</span>
            {blockActivities.map(activity => <React.Fragment key={activity.key}>
              <SimplifiedActivityCard
                activity={activity}
                onVideo={()=>setVideo(activity)}
                onComplete={()=>requestComplete(activity.activityIndex, true)}
                onEditSet={setIndex=>setQuickSet({activityIndex:activity.activityIndex,setIndex})}
              />
              {state.rest?.active && state.rest.afterActivityIndex===activity.activityIndex && <RestView rest={state.rest} activity={activity} nextActivity={activities[state.currentIndex]} simplified onSkip={skipRest}/>}
            </React.Fragment>)}
          </section>;
          return blockActivities.map(activity => <React.Fragment key={activity.key}>
            <SimplifiedActivityCard
              activity={activity}
              onVideo={()=>setVideo(activity)}
              onComplete={()=>requestComplete(activity.activityIndex, true)}
              onEditSet={setIndex=>setQuickSet({activityIndex:activity.activityIndex,setIndex})}
            />
            {state.rest?.active && state.rest.afterActivityIndex===activity.activityIndex && <RestView rest={state.rest} activity={activity} nextActivity={activities[state.currentIndex]} simplified onSkip={skipRest}/>}
          </React.Fragment>);
        })}
      </div>
      <div className="ufSimplifiedFooter">
        <div><b>{run.planTitle || state.planTitle}</b><strong>{formatDuration(elapsed)}</strong></div>
        <i><span style={{width:`${progressPercent}%`}}/></i>
      </div>
    </>}

    <VideoModal activity={video} onClose={()=>setVideo(null)}/>
    <HistoryModal activity={historyActivity} rows={historyActivity?groupHistoryRows(historySets,legacyLoads,historyActivity):[]} onClose={()=>setHistoryActivity(null)}/>
    {quickSet && <QuickSetModal
      activity={activities[quickSet.activityIndex]}
      set={activities[quickSet.activityIndex]?.sets?.[quickSet.setIndex]}
      onClose={()=>setQuickSet(null)}
      onSave={patch=>{patchSet(quickSet.activityIndex,quickSet.setIndex,patch);setQuickSet(null);}}
    />}
    {summaryOpen && <SummaryScreen run={run} state={state} elapsed={elapsed} busy={busy} onBackToRun={()=>setSummaryOpen(false)} onFinish={finalise}/>}
  </div>;

  return createPortal(runner, document.body);
}

export default function StudentTrainingExperience({ student, plans = [], completions = [], onRefreshTraining }) {
  const studentId = student?.id || '';
  const publishedPlans = useMemo(() => plans.filter(plan =>
    plan.studentId===studentId
    && plan.status==='published'
    && plan.active !== false
    && !plan.archivedAt
  ).sort(planSort), [plans, studentId]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [selectedDate, setSelectedDate] = useState(isoLocal());
  const [view, setView] = useState('home');
  const [activeRun, setActiveRun] = useState(null);
  const [historySets, setHistorySets] = useState([]);
  const [legacyLoads, setLegacyLoads] = useState([]);
  const [workoutRuns, setWorkoutRuns] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastSummary, setLastSummary] = useState(null);

  const selectedPlan = publishedPlans.find(plan=>plan.id===selectedPlanId) || publishedPlans[0] || null;
  const selectedSession = selectedPlan?.sessions?.find(session=>session.id===selectedSessionId) || selectedPlan?.sessions?.[0] || null;
  const streak = streakWeeks(completions);
  const lastCompletionDate = useMemo(() => (completions || [])
    .map(item => item.completedOn)
    .filter(Boolean)
    .sort((a,b)=>b.localeCompare(a))[0] || '', [completions]);
  const daysSinceLastWorkout = lastCompletionDate
    ? Math.floor((new Date(`${isoLocal()}T12:00:00`).getTime() - new Date(`${lastCompletionDate}T12:00:00`).getTime()) / 86400000)
    : null;

  useEffect(() => {
    if (!selectedPlan && publishedPlans[0]) setSelectedPlanId(publishedPlans[0].id);
    else if (selectedPlan && selectedPlanId !== selectedPlan.id) setSelectedPlanId(selectedPlan.id);
  }, [publishedPlans.length, selectedPlan?.id]);

  useEffect(() => {
    if (!selectedPlan) return;
    const exists = selectedPlan.sessions?.some(session=>session.id===selectedSessionId);
    if (!exists) setSelectedSessionId(selectedPlan.sessions?.[0]?.id || '');
  }, [selectedPlan?.id, selectedPlan?.sessions?.length]);

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    Promise.all([
      fetchActiveWorkoutRun(studentId),
      fetchWorkoutSetHistory(studentId).catch(()=>[]),
      fetchLegacyWorkoutLoads(studentId).catch(()=>[]),
      fetchWorkoutRuns(studentId, { limit: 120 }).catch(()=>[]),
    ]).then(([run, sets, legacy, runs]) => {
      if (cancelled) return;
      setActiveRun(run);
      setHistorySets(sets);
      setLegacyLoads(legacy);
      setWorkoutRuns(runs);
    }).catch(err => {
      if (!cancelled) setError(err.message || 'Não foi possível carregar o treino.');
    });
    return () => { cancelled = true; };
  }, [studentId]);

  async function reloadRunData() {
    const [run, sets, legacy, runs] = await Promise.all([
      fetchActiveWorkoutRun(studentId),
      fetchWorkoutSetHistory(studentId).catch(()=>[]),
      fetchLegacyWorkoutLoads(studentId).catch(()=>[]),
      fetchWorkoutRuns(studentId, { limit: 120 }).catch(()=>[]),
    ]);
    setActiveRun(run);
    setHistorySets(sets);
    setLegacyLoads(legacy);
    setWorkoutRuns(runs);
    return run;
  }

  async function begin(session = selectedSession) {
    if (!studentId || !selectedPlan || !session) return;
    setBusy(true); setError('');
    try {
      const existing = await fetchActiveWorkoutRun(studentId);
      if (existing) {
        setActiveRun(existing);
        setView('runner');
        return;
      }
      const run = await startWorkoutRun({ studentId, plan:selectedPlan, session });
      setActiveRun(run);
      setView('runner');
    } catch (err) {
      setError(err.message || 'Não foi possível iniciar o treino.');
    } finally { setBusy(false); }
  }

  async function handleCancelled() {
    setView('home');
    setActiveRun(null);
    setLastSummary(null);
    await reloadRunData();
  }

  async function handleCompleted(summary) {
    setLastSummary(summary);
    setView('home');
    setActiveRun(null);
    window.dispatchEvent(new Event('uf:exercise-load-saved'));
    await onRefreshTraining?.();
    await reloadRunData();
  }

  const dayCompletion = completions.find(item=>item.completedOn===selectedDate);
  const dayCompletionPlan = dayCompletion ? publishedPlans.find(plan => plan.id === dayCompletion.planId) : null;
  const dayCompletionSession = dayCompletionPlan?.sessions?.find(session => session.id === dayCompletion?.sessionId) || null;
  const selectedDateRuns = workoutRuns.filter(run => run.status === 'completed' && run.workoutDate === selectedDate);

  if (view==='progress') return <StudentTrainingProgressPage studentId={studentId} onBack={()=>setView('home')}/>;

  if (view==='plan' && selectedPlan) return <PlanDetail
    plan={selectedPlan}
    selectedSessionId={selectedSession?.id}
    activeRun={activeRun}
    completions={completions}
    onBack={()=>setView('home')}
    onStart={begin}
    onAccessRun={()=>setView('runner')}
  />;

  return <>
    <div className="ufStudentTrainingExperience">
      <div className="ufStudentTrainingHeader">
        <div className="ufStudentTrainingTitle"><span><Dumbbell/></span><h1>Meu treino</h1></div>
        <div className="ufStudentTrainingStreak"><Flame/><b>{streak}</b><span>{streak===1?'semana':'semanas'}</span></div>
      </div>

      <StudentTrainingProgress studentId={studentId} onOpenPage={()=>setView('progress')}/>

      <WeekStrip completions={completions} selectedDate={selectedDate} onSelect={setSelectedDate}/>

      {selectedDateRuns.length ? <div className="ufTrainingHistoryCards">
        {selectedDateRuns.map(run => {
          const summary = run.summary || {};
          return <article className="ufTrainingHistoryCard" key={run.id}>
            <div className="ufTrainingHistoryIcon">🔥</div>
            <div className="ufTrainingHistoryMain">
              <b>{run.planTitle || 'Treino realizado'}</b>
              <span>{run.sessionTitle || selectedDate}</span>
              <div className="ufTrainingHistoryMeta">
                {summary.durationSeconds != null && <small><Timer size={12}/>{formatDuration(summary.durationSeconds)}</small>}
                {summary.volumeKg != null && <small><Dumbbell size={12}/>{formatKg(summary.volumeKg)} kg</small>}
                {summary.completionPercent != null && <small><CheckCircle2 size={12}/>{summary.completionPercent}%</small>}
              </div>
            </div>
          </article>;
        })}
      </div> : dayCompletion && <div className="ufTrainingDayHistoryNotice"><span>🔥</span><div><b>{dayCompletionPlan?.title || 'Treino realizado'}</b><small>{dayCompletionSession?.title ? `${dayCompletionSession.title} · ${selectedDate}` : selectedDate}</small></div></div>}

      {error && <div className="errorBanner">{error}</div>}
      {lastSummary && <div className="ufTrainingSuccessNote"><CheckCircle2/><span>Treino concluído · {lastSummary.completionPercent}% · {formatDuration(lastSummary.durationSeconds)}</span></div>}

      {!selectedPlan ? <section className="ufTrainingNoPlan">
        <Dumbbell/>
        <h2>Ainda não tens um plano publicado</h2>
        <p>Quando o teu professor publicar o plano, aparecerá aqui.</p>
      </section> : activeRun ? <section className="ufTrainingCurrentCard active-run">
        <h2>{activeRun.planTitle || selectedPlan.title}</h2>
        <button type="button" className="ufBigYellowButton" onClick={()=>setView('runner')}>Aceder ao treino em curso</button>
      </section> : <section className="ufTrainingCurrentCard">
        {publishedPlans.length > 1 ? <label className="ufTrainingPlanSelector">Plano
          <select value={selectedPlan.id} onChange={event=>{setSelectedPlanId(event.target.value);setSelectedSessionId('');}}>
            {publishedPlans.map(plan=><option key={plan.id} value={plan.id}>{plan.title}</option>)}
          </select>
        </label> : <h2>{selectedPlan.title}</h2>}

        <label className="ufTrainingSessionSelector">
          <select value={selectedSession?.id || ''} onChange={event=>setSelectedSessionId(event.target.value)}>
            {(selectedPlan.sessions || []).map((session,index)=><option key={session.id||index} value={session.id}>{sessionLabel(index)}</option>)}
          </select>
          <ChevronDown/>
          <small>{sessionGroups(selectedSession).map(group=>group.toLowerCase()).join(', ') || `${sessionExerciseCount(selectedSession)} atividades`}</small>
        </label>
        <button type="button" className="ufBigYellowButton" disabled={busy} onClick={()=>begin(selectedSession)}>{busy?'A iniciar…':'Iniciar treino'}</button>
        <button type="button" className="ufViewPlanButton" onClick={()=>setView('plan')}>Ver treino</button>
      </section>}

      {daysSinceLastWorkout != null && daysSinceLastWorkout >= 7 && <div className="ufTrainingReturnCaution">
        <b>Já passou algum tempo desde o teu último treino.</b>
        <span>Recomeça com calma e respeita os limites do teu corpo.</span>
      </div>}
    </div>

    {view==='runner' && activeRun && <WorkoutRunner
      run={activeRun}
      initialState={activeRun.state}
      historySets={historySets}
      legacyLoads={legacyLoads}
      onExitToHome={()=>setView('home')}
      onRunCancelled={handleCancelled}
      onRunCompleted={handleCompleted}
    />}
  </>;
}
