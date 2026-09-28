import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, ChevronDown, ChevronLeft, ChevronRight, Dumbbell } from 'lucide-react';
import { supabase } from '../lib/supabase';
import '../styles/student-training-progress.css';

const groupAliases = {
  core: 'Abdominais',
  abdominal: 'Abdominais',
  abdominais: 'Abdominais',
  peito: 'Peito',
  peitoral: 'Peito',
  posterior: 'Isquiotibiais',
  posteriores: 'Isquiotibiais',
  'posterior da coxa': 'Isquiotibiais',
  'posteriores da coxa': 'Isquiotibiais',
  isquiotibiais: 'Isquiotibiais',
  quadriceps: 'Quadríceps',
  gluteo: 'Glúteos',
  gluteos: 'Glúteos',
  adutor: 'Adutores',
  adutores: 'Adutores',
  abdutor: 'Abdutores',
  abdutores: 'Abdutores',
  ombro: 'Ombros',
  ombros: 'Ombros',
  bicep: 'Bíceps',
  biceps: 'Bíceps',
  tricep: 'Tríceps',
  triceps: 'Tríceps',
  costas: 'Costas',
  dorsal: 'Costas',
  dorsais: 'Costas',
  antebraco: 'Antebraço',
  lombar: 'Lombar',
  gemeo: 'Gémeos',
  gemeos: 'Gémeos',
  panturrilha: 'Gémeos',
  panturrilhas: 'Gémeos',
};

function normalize(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function groupName(value = '') {
  const key = normalize(value);
  return groupAliases[key] || String(value || 'Outro').trim() || 'Outro';
}

function localIso(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function fromIso(value) {
  const [year, month, day] = String(value || '').split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12);
}

function monthWindow(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1, 12);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 1, 12);
  return {
    start,
    end,
    startIso: localIso(start),
    endIso: localIso(end),
    label: new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric' })
      .format(start)
      .replace(/^./, char => char.toUpperCase()),
  };
}

function weeksForMonth(window) {
  const cursor = new Date(window.start);
  const day = cursor.getDay();
  cursor.setDate(cursor.getDate() - (day === 0 ? 6 : day - 1));
  const weeks = [];
  while (cursor < window.end) {
    const end = new Date(cursor);
    end.setDate(end.getDate() + 6);
    weeks.push({
      start: new Date(cursor),
      end,
      label: `Sem. ${weeks.length + 1}`,
    });
    cursor.setDate(cursor.getDate() + 7);
  }
  return weeks;
}

function weekIndex(value, weeks) {
  const date = fromIso(value);
  return weeks.findIndex(week => {
    const end = new Date(week.end);
    end.setHours(23, 59, 59, 999);
    return date >= week.start && date <= end;
  });
}

function formatKg(value) {
  return new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0));
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit' }).format(date);
}

function aggregateRows(records, weeks, mode) {
  const map = new Map();
  records.forEach(record => {
    const name = mode === 'exercise'
      ? (record.exercise_name || 'Exercício')
      : groupName(record.muscle_group);
    if (!map.has(name)) {
      map.set(name, {
        name,
        weekly: Array(weeks.length).fill(0),
        total: 0,
        latestWeight: null,
        latestDate: '',
      });
    }
    const entry = map.get(name);
    const index = weekIndex(record.completed_on, weeks);
    const volume = Number(record.volume_kg || 0);
    if (index >= 0) entry.weekly[index] += volume;
    entry.total += volume;
    if (record.weight_kg != null && (!entry.latestDate || record.completed_on >= entry.latestDate)) {
      entry.latestDate = record.completed_on;
      entry.latestWeight = Number(record.weight_kg);
    }
  });
  return [...map.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt'));
}

export default function StudentTrainingProgress({ studentId }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('muscle');
  const [offset, setOffset] = useState(0);
  const [records, setRecords] = useState([]);
  const [loadedFor, setLoadedFor] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !studentId || loadedFor === studentId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    supabase
      .from('workout_exercise_loads')
      .select('exercise_name,muscle_group,weight_kg,volume_kg,completed_on,created_at')
      .eq('student_id', studentId)
      .order('completed_on', { ascending: true })
      .order('created_at', { ascending: true })
      .then(({ data, error: queryError }) => {
        if (cancelled) return;
        if (queryError) {
          setError(queryError.message || 'Não foi possível carregar o teu progresso.');
          setRecords([]);
          return;
        }
        setRecords(data || []);
        setLoadedFor(studentId);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, studentId, loadedFor]);

  useEffect(() => {
    const refresh = () => {
      setLoadedFor('');
      if (open) setRecords([]);
    };
    window.addEventListener('uf:exercise-load-saved', refresh);
    return () => window.removeEventListener('uf:exercise-load-saved', refresh);
  }, [open]);

  const view = useMemo(() => {
    const window = monthWindow(offset);
    const weeks = weeksForMonth(window);
    const monthRecords = records.filter(record => record.completed_on >= window.startIso && record.completed_on < window.endIso);
    const weekly = weeks.map((_, index) =>
      monthRecords.reduce((sum, record) => weekIndex(record.completed_on, weeks) === index ? sum + Number(record.volume_kg || 0) : sum, 0)
    );
    const rows = aggregateRows(monthRecords, weeks, mode);
    return {
      window,
      weeks,
      monthRecords,
      weekly,
      rows,
      totalVolume: weekly.reduce((sum, value) => sum + value, 0),
      weightedExercises: monthRecords.filter(record => Number(record.weight_kg) > 0).length,
      trainingDays: new Set(monthRecords.map(record => record.completed_on)).size,
    };
  }, [records, offset, mode]);

  const maxWeekly = Math.max(1, ...view.weekly);

  return <section className="studentTrainingProgress">
    <button
      type="button"
      className={`studentTrainingProgressToggle ${open ? 'open' : ''}`}
      onClick={() => setOpen(value => !value)}
      aria-expanded={open}
    >
      <span>Meu progresso</span>
      {open ? <ChevronDown size={24}/> : <ChevronRight size={24}/>}
    </button>

    {open && <div className="studentTrainingProgressPanel">
      <div className="studentTrainingProgressHead">
        <div>
          <span className="eyebrow">EVOLUÇÃO DE CARGA</span>
          <h2>Volume realizado</h2>
          <p>Acompanha os kg movimentados nos exercícios que vais registando.</p>
        </div>
        <BarChart3 size={24}/>
      </div>

      <div className="studentTrainingProgressToolbar">
        <div className="studentTrainingProgressModes" role="group" aria-label="Agrupar evolução">
          <button type="button" className={mode === 'muscle' ? 'active' : ''} onClick={() => setMode('muscle')}>Por músculo</button>
          <button type="button" className={mode === 'exercise' ? 'active' : ''} onClick={() => setMode('exercise')}>Por exercício</button>
        </div>
        <div className="studentTrainingProgressMonth">
          <button type="button" onClick={() => setOffset(value => value - 1)} aria-label="Mês anterior"><ChevronLeft size={18}/></button>
          <b>{view.window.label}</b>
          <button type="button" onClick={() => setOffset(value => Math.min(0, value + 1))} disabled={offset >= 0} aria-label="Mês seguinte"><ChevronRight size={18}/></button>
        </div>
      </div>

      {loading ? <div className="studentTrainingProgressLoading">A carregar o teu progresso…</div> :
        error ? <div className="studentTrainingProgressError">{error}</div> :
        <>
          <div className="studentTrainingProgressStats">
            <div><small>VOLUME NO MÊS</small><b>{formatKg(view.totalVolume)} kg</b></div>
            <div><small>EXERCÍCIOS COM CARGA</small><b>{view.weightedExercises}</b></div>
            <div><small>DIAS COM REGISTO</small><b>{view.trainingDays}</b></div>
          </div>

          {view.monthRecords.length > 0 ? <>
            <div className="studentTrainingProgressChart" style={{ '--weeks': view.weeks.length }}>
              {view.weeks.map((week, index) => {
                const value = view.weekly[index];
                const height = value ? Math.max(7, (value / maxWeekly) * 100) : 0;
                return <div className="studentTrainingProgressBar" key={week.label}>
                  <b>{formatKg(value)} kg</b>
                  <div className="studentTrainingProgressBarTrack"><span style={{ height: `${height}%` }}/></div>
                  <small>{week.label}</small>
                </div>;
              })}
            </div>

            <div className="studentTrainingProgressTableWrap">
              <table className="studentTrainingProgressTable">
                <thead>
                  <tr>
                    <th>{mode === 'muscle' ? 'Músculo' : 'Exercício'}</th>
                    {view.weeks.map(week => <th key={week.label}><b>{week.label}</b><small>{formatShortDate(week.start)}–{formatShortDate(week.end)}</small></th>)}
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map(row => <tr key={row.name}>
                    <td><b>{row.name}</b>{mode === 'exercise' && row.latestWeight != null && <small>Última carga: {row.latestWeight} kg</small>}</td>
                    {row.weekly.map((value, index) => <td key={index}>{formatKg(value)} kg</td>)}
                    <td className="studentTrainingProgressTotal">{formatKg(row.total)} kg</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          </> : <div className="studentTrainingProgressEmpty">
            <Dumbbell size={30}/>
            <b>Ainda não tens registos neste mês</b>
            <span>Abre um treino, introduz a carga no campo “Hoje” de cada exercício e regista o treino. A evolução aparecerá aqui automaticamente.</span>
          </div>}

          <div className="studentTrainingProgressFormula"><b>Cálculo:</b> carga × séries × repetições. Exercícios sem carga podem ser registados, mas somam 0 kg ao volume.</div>
        </>}
    </div>}
  </section>;
}
