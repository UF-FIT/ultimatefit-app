import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, CheckCircle2, ChevronDown, ChevronUp, Dumbbell,
  Timer, TrendingUp,
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
  return <article className="ufProfessorWorkoutRun">
    <button type="button" className="ufProfessorWorkoutRunHead" onClick={() => setOpen(value => !value)}>
      <div>
        <span>{formatDate(run.workoutDate)}</span>
        <b>{run.planTitle || 'Plano de treino'} · {run.sessionTitle || 'Treino'}</b>
      </div>
      <div className="ufProfessorWorkoutRunQuick">
        {open ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}
      </div>
    </button>
    {open && <div className="ufProfessorWorkoutRunBody">
      <div className="ufProfessorWorkoutRunStats">
        <span><Timer size={14}/><b>{formatDuration(run?.summary?.durationSeconds)}</b><small>Duração</small></span>
        <span><Dumbbell size={14}/><b>{formatKg(run?.summary?.volumeKg)} kg</b><small>Volume</small></span>
        <span><CheckCircle2 size={14}/><b>{run?.summary?.completionPercent ?? '—'}%</b><small>Concluído</small></span>
      </div>
      <div className="ufProfessorWorkoutActivities">
        {activities.length ? activities.map((activity, index) => <div className="ufProfessorWorkoutActivity" key={activity.workoutItemId || `${run.id}-${index}`}>
          <div className="ufProfessorWorkoutActivityMain">
            <span>{activity.group || 'Atividade'}</span>
            <b>{activity.name || 'Atividade'}</b>
            <small>{activitySetSummary(activity)}</small>
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
        };
        if (!groups.has(key)) groups.set(key, { key, name: activity.name || 'Exercício', points: [] });
        groups.get(key).points.push(point);
      });
    });
    return [...groups.values()]
      .map(group => ({ ...group, points: group.points.slice(-12) }))
      .filter(group => group.points.some(point => point.load != null))
      .sort((a,b) => b.points.length - a.points.length || a.name.localeCompare(b.name, 'pt'));
  }, [completedRuns]);

  useEffect(() => {
    if (!exerciseSeries.length) { setExerciseKey(''); return; }
    if (!exerciseSeries.some(item => item.key === exerciseKey)) setExerciseKey(exerciseSeries[0].key);
  }, [exerciseSeries, exerciseKey]);

  const selectedExercise = exerciseSeries.find(item => item.key === exerciseKey) || exerciseSeries[0] || null;

  return <section className="ufProfessorWorkoutAnalytics card pad">
    <div className="ufProfessorWorkoutAnalyticsHead">
      <div>
        <span className="eyebrow">ACOMPANHAMENTO DE TREINO</span>
        <h2>Acompanhamento de treino</h2>
        <p>Cargas, volume, duração e conclusão registados pelo aluno durante os treinos.</p>
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
          </div>
          <div className="ufProfessorWorkoutKpis">
            <div><Timer size={16}/><strong>{formatDuration(latestRun?.summary?.durationSeconds)}</strong><span>Duração</span></div>
            <div><Dumbbell size={16}/><strong>{formatKg(latestRun?.summary?.volumeKg)} kg</strong><span>Volume</span></div>
            <div><CheckCircle2 size={16}/><strong>{latestRun?.summary?.completionPercent ?? '—'}%</strong><span>Concluído</span></div>
          </div>
        </div>}

        <div className="ufProfessorWorkoutGrid">
          <div className="ufProfessorWorkoutPanel">
            <div className="ufProfessorWorkoutPanelHead"><div><span>EVOLUÇÃO POR EXERCÍCIO</span><h3>Evolução da carga</h3></div><Dumbbell size={20}/></div>
            {exerciseSeries.length ? <>
              <select className="ufProfessorWorkoutExerciseSelect" value={selectedExercise?.key || ''} onChange={event => setExerciseKey(event.target.value)}>
                {exerciseSeries.map(item => <option key={item.key} value={item.key}>{item.name}</option>)}
              </select>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={selectedExercise?.points || []} margin={{ top:8, right:2, left:-18, bottom:0 }}>
                  <XAxis dataKey="label" tick={{ fill:'#777', fontSize:10 }} tickLine={false} axisLine={false}/>
                  <YAxis yAxisId="load" tick={{ fill:'#777', fontSize:10 }} tickLine={false} axisLine={false}/>
                  <Tooltip contentStyle={{ background:'#101012', border:'1px solid #303034', borderRadius:10 }} labelStyle={{ color:'#fff' }}/>
                  <Line yAxisId="load" type="monotone" dataKey="load" name="Carga máxima (kg)" stroke="#ffd908" strokeWidth={3} connectNulls/>
                </LineChart>
              </ResponsiveContainer>
              <div className="ufProfessorWorkoutLegend"><span><i className="load"></i>Carga máxima</span></div>
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
