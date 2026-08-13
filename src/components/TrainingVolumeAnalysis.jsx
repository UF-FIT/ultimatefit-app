import React, { useMemo, useState } from 'react';
import { Dumbbell, Layers3 } from 'lucide-react';
import '../styles/training-volume-analysis.css';

const groupAliases = {
  core: 'Abdominais',
  abdominal: 'Abdominais',
  abdominais: 'Abdominais',
  peito: 'Peitoral',
  peitoral: 'Peitoral',
  posterior: 'Isquiotibiais',
  posteriores: 'Isquiotibiais',
  'posterior da coxa': 'Isquiotibiais',
  'posteriores da coxa': 'Isquiotibiais',
  isquiotibiais: 'Isquiotibiais',
  panturrilha: 'Gémeos',
  panturrilhas: 'Gémeos',
  gemeo: 'Gémeos',
  gemeos: 'Gémeos',
  gluteo: 'Glúteos',
  gluteos: 'Glúteos',
  ombro: 'Ombros',
  ombros: 'Ombros',
  bicep: 'Bíceps',
  biceps: 'Bíceps',
  tricep: 'Tríceps',
  triceps: 'Tríceps',
  trapezio: 'Trapézio',
  trapezios: 'Trapézio',
  quadriceps: 'Quadríceps',
  costas: 'Costas',
  antebraco: 'Antebraço',
  adutor: 'Adutores',
  adutores: 'Adutores',
  abdutor: 'Abdutores',
  abdutores: 'Abdutores',
  perna: 'Pernas',
  pernas: 'Pernas',
  lombar: 'Lombar',
  funcional: 'Funcional',
};

function key(value = '') {
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

function canonicalGroup(value = '') {
  const normalized = key(value);
  if (!normalized) return '';
  if (['cardio', 'mobilidade', 'alongamento', 'alongamentos', 'stretching', 'stretching mobility'].includes(normalized)) return '';
  return groupAliases[normalized] || String(value).trim();
}

function plannedSets(item) {
  const sets = Number(item?.sets);
  return Number.isFinite(sets) && sets > 0 ? sets : 0;
}

export function calculateTrainingVolume(plan, sessionIndex = 'all') {
  if (!plan?.sessions?.length) return { rows: [], totalSets: 0, exerciseCount: 0, groups: 0 };
  const sessions = sessionIndex === 'all'
    ? plan.sessions
    : plan.sessions.filter((_, index) => String(index) === String(sessionIndex));
  const totals = new Map();
  let exerciseCount = 0;

  sessions.forEach(session => {
    (session.blocks || []).forEach(block => {
      (block.items || []).forEach(item => {
        const group = canonicalGroup(item?.exercise?.group || '');
        const sets = plannedSets(item);
        if (!group || !sets || !item?.exercise) return;
        totals.set(group, (totals.get(group) || 0) + sets);
        exerciseCount += 1;
      });
    });
  });

  const rows = Array.from(totals.entries())
    .map(([group, sets]) => ({ group, sets }))
    .sort((a, b) => b.sets - a.sets || a.group.localeCompare(b.group, 'pt'));
  return {
    rows,
    totalSets: rows.reduce((sum, row) => sum + row.sets, 0),
    exerciseCount,
    groups: rows.length,
  };
}

export default function TrainingVolumeAnalysis({ plan, compact = false, studentFacing = false, onOpenPlan }) {
  const [sessionIndex, setSessionIndex] = useState('all');
  const analysis = useMemo(() => calculateTrainingVolume(plan, compact ? 'all' : sessionIndex), [plan, compact, sessionIndex]);
  const max = Math.max(1, ...analysis.rows.map(row => row.sets));
  const visibleRows = compact ? analysis.rows.slice(0, 6) : analysis.rows;

  if (!plan) return null;

  return <section className={`trainingVolumeAnalysis card ${compact ? 'compact' : 'full'}`}>
    <div className="trainingVolumeHeader">
      <div>
        <span className="eyebrow">ANÁLISE DO PLANO</span>
        <h2>Volume planeado</h2>
        <p>{compact ? `Distribuição das séries diretas do plano “${plan.title}”.` : 'Distribuição das séries prescritas pelos grupos musculares principais.'}</p>
      </div>
      <div className="trainingVolumeHeaderIcon"><Layers3/></div>
    </div>

    {!compact && plan.sessions?.length > 1 && <div className="trainingVolumeScope">
      <label>Âmbito
        <select value={sessionIndex} onChange={event => setSessionIndex(event.target.value)}>
          <option value="all">Plano completo</option>
          {plan.sessions.map((session, index) => <option value={String(index)} key={session.id || index}>{session.title || `Treino ${index + 1}`}</option>)}
        </select>
      </label>
    </div>}

    <div className="trainingVolumeStats">
      <div><small>SÉRIES DIRETAS</small><b>{analysis.totalSets}</b></div>
      <div><small>GRUPOS</small><b>{analysis.groups}</b></div>
      {!compact && <div><small>EXERCÍCIOS CONTABILIZADOS</small><b>{analysis.exerciseCount}</b></div>}
    </div>

    {visibleRows.length ? <div className="trainingVolumeRows">
      {visibleRows.map(row => <div className="trainingVolumeRow" key={row.group}>
        <b>{row.group}</b>
        <div className="trainingVolumeBar"><span style={{ width: `${Math.max(7, (row.sets / max) * 100)}%` }}/></div>
        <strong>{row.sets}</strong>
      </div>)}
    </div> : <div className="trainingVolumeEmpty"><Dumbbell/><b>Sem volume muscular calculável</b><span>O plano ainda não tem exercícios da biblioteca com séries prescritas.</span></div>}

    {!compact && <div className="trainingVolumeMethod"><b>Como é calculado?</b><span>Somam-se as séries prescritas de cada exercício ao respetivo grupo muscular principal. Exercícios em texto livre, cardio e alongamentos automáticos não entram neste indicador.</span></div>}
    {compact && analysis.rows.length > 6 && <small className="trainingVolumeMore">+ {analysis.rows.length - 6} grupo(s) no plano completo</small>}
    {compact && onOpenPlan && <button className="secondary trainingVolumeOpen" onClick={onOpenPlan}>Ver plano e análise</button>}
  </section>;
}
