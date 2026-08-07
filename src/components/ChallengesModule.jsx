import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, CalendarDays, CheckCircle2, Flag, Medal, Pencil, Plus, RefreshCw,
  Save, Target, Trophy, Users,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import BrandLogo from './BrandLogo';
import {
  challengeDays, challengeProgress, challengeStatusLabel, fetchChallengeLeaderboard,
  fetchChallengeRecords, fetchChallenges, saveChallenge, saveChallengeRecord,
  setChallengeParticipants,
} from '../lib/challenges';

function fmtDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
}
function isoDate(date) { return date.toISOString().slice(0, 10); }
function buildDates(start, end) {
  if (!start || !end) return [];
  const rows = [];
  const cursor = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  while (cursor <= last && rows.length < 370) {
    rows.push(isoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return rows;
}
function tone(status) { return status === 'active' ? 'green' : status === 'draft' ? 'yellow' : 'gray'; }

function ChallengeCard({ challenge, onOpen }) {
  const count = (challenge.challenge_participants || []).filter(item => item.status === 'active').length;
  return <article className="challengeChoiceCard" onClick={() => onOpen(challenge.id)}>
    <div className="challengeChoiceTop"><span className={`badge ${tone(challenge.status)}`}>{challengeStatusLabel(challenge.status)}</span><Flag size={22}/></div>
    <h2>{challenge.title}</h2>
    <p>{challenge.description || 'Desafio do estúdio.'}</p>
    <div className="challengeChoiceMeta"><span><CalendarDays size={15}/>{fmtDate(challenge.start_date)} → {fmtDate(challenge.end_date)}</span><span><Target size={15}/>{Number(challenge.target_total).toLocaleString('pt-PT')} {challenge.unit}</span></div>
    <div className="challengeChoiceFooter"><span>{challengeDays(challenge)} dias</span><span>{count} participante{count === 1 ? '' : 's'}</span></div>
  </article>;
}

function ChallengeForm({ challenge, onCancel, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      const saved = await saveChallenge({
        id: challenge?.id,
        title: form.get('title'), description: form.get('description'), unit: form.get('unit'),
        targetTotal: form.get('targetTotal'), dailyTarget: form.get('dailyTarget'),
        startDate: form.get('startDate'), endDate: form.get('endDate'), status: form.get('status'),
        prizeText: form.get('prizeText'), rules: form.get('rules'),
      });
      await onSaved(saved);
    } catch (err) { setError(err.message || 'Não foi possível guardar o desafio.'); }
    finally { setBusy(false); }
  }
  return <div className="challengeFormPage">
    <button className="backButton" onClick={onCancel}><ArrowLeft size={17}/>Voltar aos desafios</button>
    <div className="heading"><div><h1>{challenge ? 'Editar desafio' : 'Novo desafio'}</h1><p>O desafio ficará ligado às mesmas contas da aplicação.</p></div></div>
    <form className="card pad challengeForm" onSubmit={submit}>
      {error && <div className="errorBanner wide">{error}</div>}
      <label className="wide">Título *<input name="title" defaultValue={challenge?.title || ''} required/></label>
      <label className="wide">Descrição<textarea name="description" defaultValue={challenge?.description || ''} rows="3"/></label>
      <label>Data de início *<input type="date" name="startDate" defaultValue={challenge?.start_date || ''} required/></label>
      <label>Data de fim *<input type="date" name="endDate" defaultValue={challenge?.end_date || ''} required/></label>
      <label>Objetivo total *<input type="number" min="0.01" step="0.01" name="targetTotal" defaultValue={challenge?.target_total || ''} required/></label>
      <label>Objetivo diário<input type="number" min="0" step="0.01" name="dailyTarget" defaultValue={challenge?.daily_target ?? ''}/></label>
      <label>Unidade<input name="unit" defaultValue={challenge?.unit || 'repetições'} placeholder="repetições, km, min…"/></label>
      <label>Estado<select name="status" defaultValue={challenge?.status || 'draft'}><option value="draft">Rascunho</option><option value="active">Ativo</option><option value="completed">Concluído</option><option value="archived">Arquivado</option></select></label>
      <label className="wide">Prémio / destaque<input name="prizeText" defaultValue={challenge?.prize_text || ''} placeholder="Ex.: Prémio para o 1.º classificado"/></label>
      <label className="wide">Regras / notas<textarea name="rules" defaultValue={challenge?.rules || ''} rows="4"/></label>
      <div className="modalActions wide"><button type="button" className="secondary" onClick={onCancel}>Cancelar</button><button className="primary" disabled={busy}><Save size={16}/>{busy ? 'A guardar…' : 'Guardar desafio'}</button></div>
    </form>
  </div>;
}

function ParticipantsEditor({ challenge, students, onSaved }) {
  const initial = useMemo(() => new Set((challenge.challenge_participants || []).filter(item => item.status === 'active').map(item => item.student_id)), [challenge]);
  const [selected, setSelected] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  function toggle(id) { setSelected(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; }); }
  async function save() {
    setBusy(true); setMessage('');
    try { await setChallengeParticipants(challenge.id, [...selected]); setMessage('Participantes atualizados.'); await onSaved(); }
    catch (err) { setMessage(err.message || 'Não foi possível atualizar.'); }
    finally { setBusy(false); }
  }
  return <section className="card pad challengeParticipants"><div className="panelTitle"><div><h2>Participantes</h2><p>Atribui o desafio às contas de alunos existentes.</p></div><Users size={24}/></div>
    <div className="participantGrid">{students.filter(s => s.active && !s.deletedAt).map(student => <label key={student.id} className={selected.has(student.id) ? 'participantChoice selected' : 'participantChoice'}><input type="checkbox" checked={selected.has(student.id)} onChange={() => toggle(student.id)}/><span>{student.name}</span><small>{student.studentCode}</small></label>)}</div>
    {message && <p className="challengeInlineMessage">{message}</p>}
    <button className="primary" onClick={save} disabled={busy}>{busy ? 'A guardar…' : 'Guardar participantes'}</button>
  </section>;
}

function Leaderboard({ rows }) {
  return <section className="card pad challengeLeaderboard"><div className="panelTitle"><div><h2>Ranking</h2><p>Classificação pelo total registado.</p></div><Trophy size={25}/></div>
    {rows.length ? <div className="leaderboardList">{rows.map((row, index) => <div className="leaderboardRow" key={row.student_id}><span className="rank"><Medal size={17}/>{index + 1}</span><b>{row.student_name}</b><span>{Number(row.total_value || 0).toLocaleString('pt-PT')}</span><small>{row.days_recorded} dias</small></div>)}</div> : <div className="emptyMini">Ainda não existem registos para o ranking.</div>}
  </section>;
}

function StudentChallenge({ challenge, participant, onBack }) {
  const [records, setRecords] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const dates = useMemo(() => buildDates(challenge.start_date, challenge.end_date), [challenge.start_date, challenge.end_date]);
  const today = isoDate(new Date());

  async function reload() {
    const [recordRows, rankingRows] = await Promise.all([fetchChallengeRecords(participant.id), fetchChallengeLeaderboard(challenge.id)]);
    setRecords(recordRows); setLeaderboard(rankingRows);
  }
  useEffect(() => { reload().catch(err => setMessage(err.message)); }, [participant.id, challenge.id]);
  useEffect(() => {
    const initial = dates.includes(today) ? today : dates.filter(d => d <= today).at(-1) || dates[0] || '';
    setSelectedDate(initial);
  }, [challenge.id]);
  useEffect(() => { const row = records.find(item => item.record_date === selectedDate); setValue(row ? String(row.value) : ''); }, [selectedDate, records]);

  const total = records.reduce((sum, row) => sum + Number(row.value || 0), 0);
  const best = records.reduce((max, row) => Math.max(max, Number(row.value || 0)), 0);
  const progress = challengeProgress(total, challenge.target_total);
  const recordMap = new Map(records.map(row => [row.record_date, row]));

  async function save() {
    setBusy(true); setMessage('');
    try { await saveChallengeRecord(participant.id, selectedDate, value || 0); setMessage('Registo atualizado.'); await reload(); }
    catch (err) { setMessage(err.message || 'Não foi possível guardar o registo.'); }
    finally { setBusy(false); }
  }

  return <div className="challengeDetailPage">
    <button className="backButton" onClick={onBack}><ArrowLeft size={17}/>Escolher outro desafio</button>
    <section className="challengeHero"><div><span className="eyebrow">DESAFIO ATIVO</span><h1>{challenge.title}</h1><p>{challenge.description}</p></div>{challenge.prize_text && <div className="challengePrize"><Trophy/><span>{challenge.prize_text}</span></div>}</section>
    <div className="challengeStats"><div><Flag/><small>Total realizado</small><strong>{total.toLocaleString('pt-PT')}</strong><span>/ {Number(challenge.target_total).toLocaleString('pt-PT')} {challenge.unit}</span></div><div><CalendarDays/><small>Dias preenchidos</small><strong>{records.length}</strong><span>/ {dates.length}</span></div><div><Target/><small>Objetivo diário</small><strong>{challenge.daily_target ?? '—'}</strong><span>{challenge.unit}</span></div><div><Trophy/><small>Melhor dia</small><strong>{best || '—'}</strong><span>{challenge.unit}</span></div></div>
    <div className="challengeProgress"><div><span>Progresso</span><b>{progress}% concluído</b></div><div className="progress"><span style={{ width: `${progress}%` }}/></div></div>

    <section className="card pad challengeDaysPanel"><div className="panelTitle"><div><h2>Registo diário</h2><p>Seleciona um dia para consultar ou atualizar o valor.</p></div><Pencil size={22}/></div><div className="challengeDayGrid">{dates.map((date, index) => { const row = recordMap.get(date); const future = date > today; return <button key={date} disabled={future} className={`${selectedDate === date ? 'selected' : ''} ${row ? 'filled' : ''}`} onClick={() => setSelectedDate(date)}><small>DIA {index + 1}</small><b>{row ? Number(row.value).toLocaleString('pt-PT') : '—'}</b>{row ? <CheckCircle2 size={16}/> : <span className="emptyDot"/>}</button>; })}</div></section>

    <section className="card pad challengeRecordEditor"><div><span className="eyebrow">ATUALIZAR REGISTO</span><h2>{selectedDate ? fmtDate(selectedDate) : 'Seleciona um dia'}</h2></div><label>Valor ({challenge.unit})<input type="number" min="0" step="0.01" value={value} onChange={e => setValue(e.target.value)} disabled={!selectedDate}/></label><button className="primary" onClick={save} disabled={!selectedDate || busy}>{busy ? 'A guardar…' : 'Atualizar registo'}</button>{message && <span className="challengeInlineMessage">{message}</span>}</section>
    <Leaderboard rows={leaderboard}/>
  </div>;
}

function StaffChallengeDetail({ challenge, students, canManage, onBack, onEdit, onReload }) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => { fetchChallengeLeaderboard(challenge.id).then(setLeaderboard).catch(err => setError(err.message)); }, [challenge.id, challenge.challenge_participants?.length]);
  const activeParticipants = (challenge.challenge_participants || []).filter(item => item.status === 'active');
  return <div className="challengeDetailPage"><div className="challengeDetailActions"><button className="backButton" onClick={onBack}><ArrowLeft size={17}/>Voltar aos desafios</button>{canManage && <button className="secondary" onClick={onEdit}><Pencil size={16}/>Editar desafio</button>}</div>
    <section className="challengeHero"><div><span className="eyebrow">{challengeStatusLabel(challenge.status).toUpperCase()}</span><h1>{challenge.title}</h1><p>{challenge.description || 'Sem descrição.'}</p><div className="challengeHeroMeta"><span><CalendarDays size={16}/>{fmtDate(challenge.start_date)} → {fmtDate(challenge.end_date)}</span><span><Target size={16}/>{Number(challenge.target_total).toLocaleString('pt-PT')} {challenge.unit}</span><span><Users size={16}/>{activeParticipants.length} participantes</span></div></div>{challenge.prize_text && <div className="challengePrize"><Trophy/><span>{challenge.prize_text}</span></div>}</section>
    {error && <div className="errorBanner">{error}</div>}
    <div className="grid two challengeAdminGrid">{canManage && <ParticipantsEditor challenge={challenge} students={students} onSaved={onReload}/>}<Leaderboard rows={leaderboard}/></div>
  </div>;
}

export default function ChallengesModule() {
  const { currentUser, data } = useApp();
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const canManage = currentUser.role === 'admin';
  const student = currentUser.role === 'aluno' ? data.students.find(item => item.userId === currentUser.id) : null;

  async function reload() {
    setLoading(true); setError('');
    try { setChallenges(await fetchChallenges()); }
    catch (err) { setError(err.message || 'Não foi possível carregar os desafios. Confirma a Migração 006.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { reload(); }, [currentUser.id]);

  const visible = useMemo(() => {
    if (currentUser.role !== 'aluno') return challenges;
    if (!student) return [];
    return challenges.filter(challenge => ['active', 'completed'].includes(challenge.status) && (challenge.challenge_participants || []).some(item => item.student_id === student.id && item.status === 'active'));
  }, [challenges, currentUser.role, student?.id]);
  const selected = visible.find(item => item.id === selectedId) || challenges.find(item => item.id === selectedId);

  if (creating || editing) return <ChallengeForm challenge={editing ? selected : null} onCancel={() => { setCreating(false); setEditing(false); }} onSaved={async saved => { await reload(); setSelectedId(saved.id); setCreating(false); setEditing(false); }}/>;
  if (selected) {
    if (currentUser.role === 'aluno') {
      const participant = (selected.challenge_participants || []).find(item => item.student_id === student?.id && item.status === 'active');
      return participant ? <StudentChallenge challenge={selected} participant={participant} onBack={() => setSelectedId('')}/> : <div className="emptyState card pad"><Flag size={36}/><h2>Desafio indisponível</h2><p>Este desafio já não está atribuído à tua conta.</p><button className="secondary" onClick={() => setSelectedId('')}>Voltar</button></div>;
    }
    return <StaffChallengeDetail challenge={selected} students={data.students} canManage={canManage} onBack={() => setSelectedId('')} onEdit={() => setEditing(true)} onReload={reload}/>;
  }

  return <>
    <div className="heading"><div><h1>Desafios</h1><p>{currentUser.role === 'aluno' ? 'Regista o teu progresso, acompanha o ranking e supera-te dia após dia.' : 'Cria desafios, atribui alunos e acompanha o ranking no mesmo sistema de login.'}</p></div>{canManage && <button className="primary" onClick={() => setCreating(true)}><Plus size={17}/>Novo desafio</button>}</div>
    <section className="challengeSelectHero"><BrandLogo className="challengeBrand"/><span className="eyebrow">DESAFIOS</span><h2>ESCOLHE O <span>DESAFIO.</span></h2><p>Compromisso, foco e consistência. Uma única conta para toda a plataforma.</p><div className="challengeBenefits"><span><CheckCircle2/>Compromisso</span><span><Target/>Foco</span><span><RefreshCw/>Consistência</span></div></section>
    {error && <div className="errorBanner">{error}</div>}
    {loading ? <div className="card pad loadingCard"><div className="loader"/><p>A carregar desafios…</p></div> : visible.length ? <div className="challengeChoiceGrid">{visible.map(challenge => <ChallengeCard key={challenge.id} challenge={challenge} onOpen={setSelectedId}/>)}</div> : <div className="emptyState card pad"><Flag size={38}/><h2>{currentUser.role === 'aluno' ? 'Sem desafios atribuídos' : 'Ainda não existem desafios'}</h2><p>{currentUser.role === 'aluno' ? 'Quando o estúdio te atribuir um desafio, aparecerá aqui automaticamente.' : 'Cria o primeiro desafio. Já não é necessário um login ou PIN separado.'}</p>{canManage && <button className="primary" onClick={() => setCreating(true)}><Plus size={17}/>Criar primeiro desafio</button>}</div>}
  </>;
}
