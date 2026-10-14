import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, CheckCircle2, ChevronDown, ChevronUp, Dumbbell,
  Gauge, Timer, TrendingUp,
} from 'lucide-react';
import {
  Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { fetchWorkoutRuns } from '../lib/studentWorkoutRuns';

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: '2-digit' })
      .format(new Date(`${value}T12:00:00`));
  } catch {
    return value;
  }
}

function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m} min`;
}

function formatKg(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 1 }).format(number);
}

function rpeLabel(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'Sem registo';
  if (n <= 2) return 'Muito leve';
  if (n <= 4) return 'Leve';
  if (n <= 6) return 'Moderado';
  if (n <= 8) return 'Difícil';
  return 'Muito difícil';
}

function runAverageRpe(run) {
  const fromSummary = Number(run?.summary?.averageRpe);
  if (Number.isFinite(fromSummary) && fromSummary > 0) return fromSummary;
  const values = (run?.state?.activities || [])
    .map(item => Number(item?.rpe))
    .filter(value => Number.isFinite(value) && value > 0);
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function activityVolume(activity) {
  return (activity?.sets || []).reduce((sum, set) => {
    if (!set?.completed) return sum;
    const reps = Number(set.reps);
    const kg = Number(set.weightKg);
    if (!Number.isFinite(reps) || !Number.isFinite(kg) || reps <= 0 || kg <= 0) return sum;
    return sum + reps * kg;
  }, 0);
}

function maxActivityLoad(activity) {
  const values = (activity?.sets || [])
    .filter(set => set?.completed)
    .map(set => Number(set.weightKg))
    .filter(value => Number.isFinite(value) && value > 0);
  return values.length ? Math.max(...values) : null;
}

function activitySetSummary(activity) {
  const completed = (activity?.sets || []).filter(set => set?.completed);
  if (!completed.length) return 'Sem séries registadas';
  return completed.map(set => {
    const reps = Number(set.reps);
    const kg = Number(set.weightKg);
    if (Number.isFinite(kg) && kg > 0) return `${Number.isFinite(reps) ? reps : '—'} × ${formatKg(kg)} kg`;
    return Number.isFinite(reps) ? `${reps} reps` : 'Concluída';
  }).join(' · ');
}

function WorkoutDetails({ run }) {
  const [open, setOpen] = useState(false);
  const activities = run?.state?.activities || [];
  const averageRpe = runAverageRpe(run);
  return <article className="ufProfessorWorkoutRun">
    <button type="button" className="ufProfessorWorkoutRunHead" onClick={() => setOpen(value => !value)}>
      <div>
        <span>{formatDate(run.workoutDate)}</span>
        <b>{run.planTitle || 'Plano de treino'} · {run.sessionTitle || 'Treino'}</b>
      </div>
      <div className="ufProfessorWorkoutRunQuick">
        <span><Gauge size={13}/>{averageRpe == null ? '—' : `${averageRpe}/10`}</span>
        {open ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}
      </div>
    </button>
    {open && <div className="ufProfessorWorkoutRunBody">
      <div className="ufProfessorWorkoutRunStats">
        <span><Timer size={14}/><b>{formatDuration(run?.summary?.durationSeconds)}</b><small>Duração</small></span>
        <span><Dumbbell size={14}/><b>{formatKg(run?.summary?.volumeKg)} kg</b><small>Volume</small></span>
        <span><CheckCircle2 size={14}/><b>{run?.summary?.completionPercent ?? '—'}%</b><small>Concluído</small></span>
        <span><Gauge size={14}/><b>{averageRpe == null ? '—' : averageRpe}</b><small>RPE médio</small></span>
      </div>
      <div className="ufProfessorWorkoutActivities">
        {activities.length ? activities.map((activity, index) => <div className="ufProfessorWorkoutActivity" key={activity.workoutItemId || `${run.id}-${index}`}>
          <div className="ufProfessorWorkoutActivityMain">
            <span>{activity.group || 'Atividade'}</span>
            <b>{activity.name || 'Atividade'}</b>
            <small>{activitySetSummary(activity)}</small>
          </div>
          <div className="ufProfessorWorkoutActivityRpe">
            <b>{activity.rpe == null ? '—' : activity.rpe}</b>
            <small>RPE</small>
          </div>
        </div>) : <p className="ufProfessorWorkoutEmptyInline">Sem detalhe de atividades disponível.</p>}
      </div>
    </div>}
  </article>;
}

export default function ProfessorWorkoutAnalytics({ studentId }) {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exerciseKey, setExerciseKey] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    fetchWorkoutRuns(studentId, { limit: 80 })
      .then(rows => { if (alive) setRuns(rows || []); })
      .catch(err => { if (alive) setError(err?.message || 'Não foi possível carregar os dados de treino.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [studentId]);

  const completedRuns = useMemo(
    () => runs.filter(run => run.status === 'completed').sort((a,b) => String(b.startedAt || '').localeCompare(String(a.startedAt || ''))),
    [runs]
  );
  const activeRun = useMemo(() => runs.find(run => run.status === 'active') || null, [runs]);
  const latestRun = completedRuns[0] || null;

  const rpeTrend = useMemo(() => completedRuns
    .map(run => ({ date: run.workoutDate, rpe: runAverageRpe(run), title: run.sessionTitle || run.planTitle || 'Treino' }))
    .filter(row => Number.isFinite(row.rpe))
    .slice(0, 12)
    .reverse()
    .map(row => ({ ...row, label: formatDate(row.date) })), [completedRuns]);

  const exerciseSeries = useMemo(() => {
    const groups = new Map();
    completedRuns.slice().reverse().forEach(run => {
      (run.state?.activities || []).forEach(activity => {
        if (!activity?.exerciseId && !activity?.name) return;
        if (activity?.status !== 'completed') return;
        const key = activity.exerciseId || `name:${String(activity.name).toLowerCase()}`;
        const point = {
          date: run.workoutDate,
          label: formatDate(run.workoutDate),
          load: maxActivityLoad(activity),
          volume: Math.round(activityVolume(activity) * 10) / 10,
          rpe: Number.isFinite(Number(activity.rpe)) ? Number(activity.rpe) : null,
        };
        if (!groups.has(key)) groups.set(key, { key, name: activity.name || 'Exercício', points: [] });
        groups.get(key).points.push(point);
      });
    });
    return [...groups.values()]
      .map(group => ({ ...group, points: group.points.slice(-12) }))
      .filter(group => group.points.some(point => point.load != null || point.rpe != null))
      .sort((a,b) => b.points.length - a.points.length || a.name.localeCompare(b.name, 'pt'));
  }, [completedRuns]);

  useEffect(() => {
    if (!exerciseSeries.length) { setExerciseKey(''); return; }
    if (!exerciseSeries.some(item => item.key === exerciseKey)) setExerciseKey(exerciseSeries[0].key);
  }, [exerciseSeries, exerciseKey]);

  const selectedExercise = exerciseSeries.find(item => item.key === exerciseKey) || exerciseSeries[0] || null;
  const latestRpe = latestRun ? runAverageRpe(latestRun) : null;

  return <section className="ufProfessorWorkoutAnalytics card pad">
    <div className="ufProfessorWorkoutAnalyticsHead">
      <div>
        <span className="eyebrow">ACOMPANHAMENTO DE TREINO</span>
        <h2>Treino e esforço percebido</h2>
        <p>Cargas, volume, conclusão e RPE registados pelo aluno durante os treinos.</p>
      </div>
      <TrendingUp size={26}/>
    </div>

    {loading ? <div className="ufProfessorWorkoutState">A carregar dados de treino…</div>
      : error ? <div className="ufProfessorWorkoutState error">{error}</div>
      : !latestRun && !activeRun ? <div className="ufProfessorWorkoutState"><Dumbbell size={26}/><b>Ainda sem treinos registados</b><span>Os dados aparecem aqui assim que o aluno concluir os primeiros treinos na app.</span></div>
      : <>
        {activeRun && <div className="ufProfessorWorkoutLive"><span></span><div><b>Treino em curso</b><small>{activeRun.planTitle || 'Plano'} · {activeRun.sessionTitle || 'Treino'}</small></div></div>}

        {latestRun && <div className="ufProfessorWorkoutLatest">
          <div className="ufProfessorWorkoutLatestTitle">
            <div><span>ÚLTIMO TREINO · {formatDate(latestRun.workoutDate)}</span><b>{latestRun.planTitle || 'Plano'} · {latestRun.sessionTitle || 'Treino'}</b></div>
            <div className="ufProfessorWorkoutRpeBadge"><strong>{latestRpe ?? '—'}</strong><small>RPE médio</small></div>
          </div>
          <div className="ufProfessorWorkoutKpis">
            <div><Timer size={16}/><strong>{formatDuration(latestRun?.summary?.durationSeconds)}</strong><span>Duração</span></div>
            <div><Dumbbell size={16}/><strong>{formatKg(latestRun?.summary?.volumeKg)} kg</strong><span>Volume</span></div>
            <div><CheckCircle2 size={16}/><strong>{latestRun?.summary?.completionPercent ?? '—'}%</strong><span>Concluído</span></div>
            <div><Gauge size={16}/><strong>{latestRpe == null ? '—' : `${latestRpe}/10`}</strong><span>{rpeLabel(latestRpe)}</span></div>
          </div>
        </div>}

        <div className="ufProfessorWorkoutGrid">
          <div className="ufProfessorWorkoutPanel">
            <div className="ufProfessorWorkoutPanelHead"><div><span>ESFORÇO PERCEBIDO</span><h3>Evolução do RPE médio</h3></div><Gauge size={20}/></div>
            {rpeTrend.length ? <ResponsiveContainer width="100%" height={220}>
              <LineChart data={rpeTrend} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fill:'#777', fontSize:10 }} tickLine={false} axisLine={false}/>
                <YAxis domain={[1,10]} ticks={[1,3,5,7,10]} tick={{ fill:'#777', fontSize:10 }} tickLine={false} axisLine={false}/>
                <Tooltip contentStyle={{ background:'#101012', border:'1px solid #303034', borderRadius:10 }} labelStyle={{ color:'#fff' }}/>
                <Line type="monotone" dataKey="rpe" name="RPE" stroke="#ffd908" strokeWidth={3} dot={{ r:3 }} activeDot={{ r:5 }}/>
              </LineChart>
            </ResponsiveContainer> : <div className="ufProfessorWorkoutEmptyInline">Ainda não existem treinos concluídos com RPE.</div>}
          </div>

          <div className="ufProfessorWorkoutPanel">
            <div className="ufProfessorWorkoutPanelHead"><div><span>EVOLUÇÃO POR EXERCÍCIO</span><h3>Carga × esforço</h3></div><Dumbbell size={20}/></div>
            {exerciseSeries.length ? <>
              <select className="ufProfessorWorkoutExerciseSelect" value={selectedExercise?.key || ''} onChange={event => setExerciseKey(event.target.value)}>
                {exerciseSeries.map(item => <option key={item.key} value={item.key}>{item.name}</option>)}
              </select>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={selectedExercise?.points || []} margin={{ top:8, right:2, left:-18, bottom:0 }}>
                  <XAxis dataKey="label" tick={{ fill:'#777', fontSize:10 }} tickLine={false} axisLine={false}/>
                  <YAxis yAxisId="load" tick={{ fill:'#777', fontSize:10 }} tickLine={false} axisLine={false}/>
                  <YAxis yAxisId="rpe" orientation="right" domain={[1,10]} ticks={[1,5,10]} tick={{ fill:'#777', fontSize:10 }} tickLine={false} axisLine={false}/>
                  <Tooltip contentStyle={{ background:'#101012', border:'1px solid #303034', borderRadius:10 }} labelStyle={{ color:'#fff' }}/>
                  <Line yAxisId="load" type="monotone" dataKey="load" name="Carga máxima (kg)" stroke="#ffd908" strokeWidth={3} connectNulls/>
                  <Line yAxisId="rpe" type="monotone" dataKey="rpe" name="RPE" stroke="#a8abb2" strokeWidth={2} connectNulls/>
                </LineChart>
              </ResponsiveContainer>
              <div className="ufProfessorWorkoutLegend"><span><i className="load"></i>Carga máxima</span><span><i className="rpe"></i>RPE</span></div>
            </> : <div className="ufProfessorWorkoutEmptyInline">Ainda não existem dados suficientes por exercício.</div>}
          </div>
        </div>

        <div className="ufProfessorWorkoutHistory">
          <div className="ufProfessorWorkoutPanelHead"><div><span>HISTÓRICO</span><h3>Treinos realizados</h3></div><Activity size={20}/></div>
          {completedRuns.length ? completedRuns.slice(0,12).map(run => <WorkoutDetails key={run.id} run={run}/>)
            : <div className="ufProfessorWorkoutEmptyInline">Ainda não existem treinos concluídos.</div>}
        </div>
      </>}
  </section>;
}
