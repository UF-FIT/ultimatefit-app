import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Archive, ArchiveRestore, CalendarDays, CheckCircle2, ChevronDown, ChevronRight,
  CirclePlay, Copy, Dumbbell, Edit3, Eye, FilePenLine, GripVertical, Layers3, LockKeyhole,
  ListPlus, Plus, Save, Search, Timer, Trash2, UserRound, X
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import ExerciseMedia from './ExerciseMedia';
import {
  archiveWorkoutPlan, restoreWorkoutPlan, canManageWorkoutPlans, deleteWorkoutPlanPermanently, formatSeconds, saveWorkoutPlan, recordWorkoutCompletion
} from '../lib/training';
import { getSessionStretchingRecommendations, stretchingRules } from '../lib/stretching';
import '../styles/training-plans-fix.css';

const cx = (...items) => items.filter(Boolean).join(' ');

function Badge({ children, tone = 'gray' }) { return <span className={`badge ${tone}`}>{children}</span>; }
function Card({ children, className = '' }) { return <div className={cx('card', className)}>{children}</div>; }

function emptyItem() {
  return { exerciseId: '', manualName: '', sets: 3, reps: '10', durationSeconds: '', restSeconds: 60, tempo: '', loadText: '', rpe: '', notes: '' };
}

function emptyBlock(type = 'standard') {
  return { type, title: '', rounds: 1, restAfterSeconds: '', items: [emptyItem()] };
}
function emptySession(index = 0) {
  return { title: `Treino ${String.fromCharCode(65 + index)}`, description: '', blocks: [emptyBlock()] };
}
function emptyPlan(studentId = '') {
  return { id: '', studentId, title: '', description: '', goal: '', status: 'draft', active: true, startDate: '', endDate: '', autoStretchingEnabled: true, sessions: [emptySession(0)] };
}
function deepCopyPlan(plan) {
  return JSON.parse(JSON.stringify(plan));
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
        <p>{studentFacing ? 'Realiza estes alongamentos no final da sessão.' : 'Selecionados automaticamente a partir dos grupos musculares trabalhados nesta sessão.'}</p>
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
        <div className="trainingSessionTitle"><div><span className="eyebrow">SESSÃO {sessionIndex + 1}</span><h2>{session.title}</h2>{session.description && <p>{session.description}</p>}</div><Dumbbell/></div>
        <div className="trainingBlocksView">
          {session.blocks.map((block, blockIndex) => { const definition = typeByCode[block.type] || { name:block.type, supportsRounds:block.type !== 'standard' }; return <div className={cx('trainingBlockView', block.type, block.type !== 'standard' && 'special')} key={block.id || blockIndex}>
            <div className="trainingBlockHeading"><div><Badge tone={block.type === 'standard' ? 'gray' : 'yellow'}>{definition.name}</Badge>{block.title && <b>{block.title}</b>}</div>{definition.supportsRounds && <span>{block.rounds || 1} volta(s){block.restAfterSeconds ? ` · ${formatSeconds(block.restAfterSeconds)} após bloco` : ''}</span>}</div>
            {block.items.map((item, itemIndex) => <button className={cx('trainingExerciseView', item.manualName && 'manual')} key={item.id || itemIndex} onClick={() => item.exercise && setOpenExercise(item)}>
              <div className="trainingExerciseThumb"><ExerciseMedia exercise={item.exercise || { name:item.manualName, group:'Texto livre' }} compact manual={!item.exercise}/></div>
              <div className="trainingExerciseCopy"><div><b>{itemExerciseName(item)}</b>{item.exercise && <ChevronRight size={17}/>}</div><small>{item.exercise ? `${item.exercise.group || ''}${item.exercise.equipment ? ` · ${item.exercise.equipment}` : ''}` : 'Texto livre · sem vídeo demonstrativo'}</small><ExercisePrescription item={item}/>{item.loadText && <span>Carga: {item.loadText}</span>}{item.rpe != null && <span>RPE: {item.rpe}</span>}{item.notes && <p>{item.notes}</p>}</div>
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
        <div className="exercisePickerHint">{query ? `${results.length} resultado(s) visíveis` : group !== 'Todos' ? `Exercícios de ${group}` : 'Escreve para encontrar rapidamente um exercício ou escolhe um grupo muscular.'}</div>
        <div className="exercisePickerResults">
          {results.map(exercise=><button type="button" className="exercisePickerResult" key={exercise.id} onClick={()=>selectExercise(exercise)}>
            <span className="exercisePickerResultThumb"><ExerciseMedia exercise={exercise} compact/></span>
            <span><b>{exercise.name}</b><small>{exercise.group}{exercise.equipment ? ` · ${exercise.equipment}` : ''}</small></span>
          </button>)}
          {results.length===0 && <div className="exercisePickerEmpty">Nenhum exercício encontrado com estes filtros.</div>}
        </div>
      </div>}
    </>}
  </div>;
}

function PlanEditor({ initialPlan, students, exercises, blockTypes = [], onCancel, onSaved }) {
  const { refreshTraining } = useApp();
  const [draft, setDraft] = useState(() => deepCopyPlan(initialPlan));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const activeBlockTypes = useMemo(() => blockTypes.filter(type => type.active), [blockTypes]);
  const typeByCode = useMemo(() => Object.fromEntries(blockTypes.map(type => [type.code, type])), [blockTypes]);
  const selectedStudent = useMemo(() => students.find(student => student.id === draft.studentId) || null, [students, draft.studentId]);
  const selectedStudentInitials = selectedStudent?.name?.split(' ').map(part => part[0]).slice(0, 2).join('') || 'AL';
  const selectedStudentPhoto = selectedStudent?.photoUrl || selectedStudent?.thumbUrl || '';

  function patchPlan(patch) { setDraft(current => ({ ...current, ...patch })); }
  function patchSession(sessionIndex, patch) { setDraft(current => ({ ...current, sessions: current.sessions.map((session,index) => index === sessionIndex ? { ...session, ...patch } : session) })); }
  function patchBlock(sessionIndex, blockIndex, patch) { setDraft(current => ({ ...current, sessions: current.sessions.map((session,index) => index !== sessionIndex ? session : { ...session, blocks: session.blocks.map((block,bIndex) => bIndex === blockIndex ? { ...block, ...patch } : block) }) })); }
  function patchItem(sessionIndex, blockIndex, itemIndex, patch) { setDraft(current => ({ ...current, sessions: current.sessions.map((session,index) => index !== sessionIndex ? session : { ...session, blocks: session.blocks.map((block,bIndex) => bIndex !== blockIndex ? block : { ...block, items: block.items.map((item,iIndex) => iIndex === itemIndex ? { ...item, ...patch } : item) }) }) })); }

  function addSession() { setDraft(current => ({ ...current, sessions: [...current.sessions, emptySession(current.sessions.length)] })); }
  function removeSession(index) { if (draft.sessions.length === 1) return; setDraft(current => ({ ...current, sessions: current.sessions.filter((_,i) => i !== index) })); }
  function addBlock(sessionIndex, type='standard') { setDraft(current => ({ ...current, sessions: current.sessions.map((session,index) => index === sessionIndex ? { ...session, blocks: [...session.blocks, emptyBlock(type)] } : session) })); }
  function removeBlock(sessionIndex, blockIndex) { setDraft(current => ({ ...current, sessions: current.sessions.map((session,index) => index !== sessionIndex ? session : { ...session, blocks: session.blocks.filter((_,i) => i !== blockIndex) }) })); }
  function addItem(sessionIndex, blockIndex) { setDraft(current => ({ ...current, sessions: current.sessions.map((session,index) => index !== sessionIndex ? session : { ...session, blocks: session.blocks.map((block,bIndex) => bIndex !== blockIndex ? block : { ...block, items: [...block.items, emptyItem()] }) }) })); }
  function removeItem(sessionIndex, blockIndex, itemIndex) { setDraft(current => ({ ...current, sessions: current.sessions.map((session,index) => index !== sessionIndex ? session : { ...session, blocks: session.blocks.map((block,bIndex) => bIndex !== blockIndex ? block : { ...block, items: block.items.filter((_,i) => i !== itemIndex) }) }) })); }

  async function submit(status) {
    setError('');
    if (!draft.studentId) { setError('Seleciona o aluno.'); return; }
    if (!draft.title.trim()) { setError('Indica o nome do plano.'); return; }
    setBusy(true);
    try {
      const id = await saveWorkoutPlan({ ...draft, status });
      await refreshTraining();
      onSaved(id);
    } catch (err) { setError(err.message || 'Não foi possível guardar o plano.'); }
    finally { setBusy(false); }
  }

  return <div className="trainingEditor">
    <button className="backButton" onClick={onCancel}><ArrowLeft size={17}/>Cancelar edição</button>
    <div className="heading trainingEditorHeading">
      <div><span className="eyebrow">PRESCRIÇÃO DE EXERCÍCIO</span><h1>{draft.id ? 'Editar plano' : 'Novo plano'}</h1><p>Organiza sessões, séries normais, superséries e circuitos.</p></div>
      <div style={{display:'flex',alignItems:'center',gap:'14px',marginLeft:'auto'}}>
        {selectedStudent && <div title={`Plano de ${selectedStudent.name}`} aria-label={`Aluno selecionado: ${selectedStudent.name}`} style={{width:'clamp(78px,11vw,104px)',height:'clamp(78px,11vw,104px)',borderRadius:'24px',overflow:'hidden',border:'2px solid #ffd908',background:'#121212',display:'grid',placeItems:'center',flex:'0 0 auto',fontWeight:800,fontSize:'24px',color:'#ffd908'}}>{selectedStudentPhoto ? <img src={selectedStudentPhoto} alt={selectedStudent.name} style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/> : <span>{selectedStudentInitials}</span>}</div>}
        <div className="trainingEditorActions"><button className="secondary" disabled={busy} onClick={() => submit('draft')}><Save size={17}/>Guardar rascunho</button><button className="primary" disabled={busy} onClick={() => submit('published')}><CheckCircle2 size={17}/>Publicar para o aluno</button></div>
      </div>
    </div>
    {error && <div className="errorBanner">{error}</div>}

    <section className="card pad trainingPlanInfo"><div className="formGrid">
      <label>Aluno*<select value={draft.studentId} onChange={event => patchPlan({ studentId: event.target.value })}><option value="">Selecionar aluno</option>{students.map(student => <option value={student.id} key={student.id}>{student.name}</option>)}</select></label>
      <label>Título do plano*<input value={draft.title} onChange={event => patchPlan({ title: event.target.value })} placeholder="Ex.: Fase 1 · Força e mobilidade"/></label>
      <label>Data de início<input type="date" value={draft.startDate || ''} onChange={event => patchPlan({ startDate: event.target.value })}/></label>
      <label>Data de fim<input type="date" value={draft.endDate || ''} onChange={event => patchPlan({ endDate: event.target.value })}/></label>
      <label className="wide">Objetivo do plano<input value={draft.goal} onChange={event => patchPlan({ goal: event.target.value })} placeholder="Ex.: ganho de força, redução de dor, hipertrofia…"/></label>
      <label className="wide">Notas gerais<textarea value={draft.description} onChange={event => patchPlan({ description: event.target.value })} placeholder="Indicações gerais para o aluno."/></label>
      <div className="wide automaticStretchingPlanOption">
        <div>
          <span className="eyebrow">RECUPERAÇÃO AUTOMÁTICA</span>
          <b>Alongamentos automáticos no final do treino</b>
          <small>Quando ligado, a app escolhe os alongamentos adequados a partir dos grupos musculares trabalhados em cada sessão.</small>
        </div>
        <label className="switchControl" title="Ativar ou desativar alongamentos automáticos">
          <input type="checkbox" checked={draft.autoStretchingEnabled !== false} onChange={event => patchPlan({ autoStretchingEnabled: event.target.checked })}/>
          <span aria-hidden="true"></span>
          <strong>{draft.autoStretchingEnabled !== false ? 'Ligado' : 'Desligado'}</strong>
        </label>
      </div>
    </div></section>

    <div className="trainingSessionsEditor">
      {draft.sessions.map((session,sessionIndex) => <section className="card pad trainingSessionEditor" key={sessionIndex}>
        <div className="trainingEditorSectionHead"><div><span className="eyebrow">SESSÃO {sessionIndex + 1}</span><input className="trainingTitleInput" value={session.title} onChange={event => patchSession(sessionIndex,{title:event.target.value})}/></div><button className="iconButton dangerText" onClick={() => removeSession(sessionIndex)} disabled={draft.sessions.length === 1} title="Remover sessão"><Trash2 size={18}/></button></div>
        <input className="trainingDescriptionInput" value={session.description} onChange={event => patchSession(sessionIndex,{description:event.target.value})} placeholder="Descrição opcional da sessão"/>

        {session.blocks.map((block,blockIndex) => <div className={cx('trainingBlockEditor',block.type,block.type !== 'standard' && 'special')} key={blockIndex}>
          <div className="trainingBlockEditorHead"><GripVertical size={17}/><select value={block.type} onChange={event => patchBlock(sessionIndex,blockIndex,{type:event.target.value})}>{activeBlockTypes.map(type=><option value={type.code} key={type.code}>{type.name}</option>)}</select><input value={block.title} onChange={event => patchBlock(sessionIndex,blockIndex,{title:event.target.value})} placeholder="Nome do bloco (opcional)"/>{(typeByCode[block.type]?.supportsRounds ?? block.type !== 'standard') && <><label>Voltas<input type="number" min="1" max="50" value={block.rounds} onChange={event => patchBlock(sessionIndex,blockIndex,{rounds:event.target.value})}/></label><label>Descanso após<input type="number" min="0" value={block.restAfterSeconds} onChange={event => patchBlock(sessionIndex,blockIndex,{restAfterSeconds:event.target.value})} placeholder="seg"/></label></>}<button className="iconButton dangerText" onClick={() => removeBlock(sessionIndex,blockIndex)}><Trash2 size={16}/></button></div>

          <div className="trainingItemsEditor">
            {block.items.map((item,itemIndex) => <div className="trainingItemEditor" key={itemIndex}>
              <div className="trainingItemMain"><ExercisePicker item={item} exercises={exercises} onChange={patch => patchItem(sessionIndex,blockIndex,itemIndex,patch)}/><button className="iconButton dangerText" onClick={() => removeItem(sessionIndex,blockIndex,itemIndex)}><X size={16}/></button></div>
              <div className="trainingPrescriptionGrid"><label>Séries<input type="number" min="1" value={item.sets ?? ''} onChange={event => patchItem(sessionIndex,blockIndex,itemIndex,{sets:event.target.value})}/></label><label>Repetições<input value={item.reps} onChange={event => patchItem(sessionIndex,blockIndex,itemIndex,{reps:event.target.value})} placeholder="10-12"/></label><label>Duração (seg)<input type="number" min="0" value={item.durationSeconds ?? ''} onChange={event => patchItem(sessionIndex,blockIndex,itemIndex,{durationSeconds:event.target.value})}/></label><label>Descanso (seg)<input type="number" min="0" value={item.restSeconds ?? ''} onChange={event => patchItem(sessionIndex,blockIndex,itemIndex,{restSeconds:event.target.value})}/></label><label>Tempo<input value={item.tempo} onChange={event => patchItem(sessionIndex,blockIndex,itemIndex,{tempo:event.target.value})} placeholder="3-1-1"/></label><label>Carga<input value={item.loadText} onChange={event => patchItem(sessionIndex,blockIndex,itemIndex,{loadText:event.target.value})} placeholder="20 kg / moderada"/></label><label>RPE<input type="number" step="0.5" min="0" max="10" value={item.rpe ?? ''} onChange={event => patchItem(sessionIndex,blockIndex,itemIndex,{rpe:event.target.value})}/></label><label className="wide">Notas<input value={item.notes} onChange={event => patchItem(sessionIndex,blockIndex,itemIndex,{notes:event.target.value})} placeholder="Indicações técnicas ou adaptações"/></label></div>
            </div>)}
          </div>
          <button className="textButton" onClick={() => addItem(sessionIndex,blockIndex)}><Plus size={15}/>Adicionar exercício</button>
        </div>)}
        <div className="trainingAddBlocks">{activeBlockTypes.map(type=><button className="secondary" key={type.code} onClick={() => addBlock(sessionIndex,type.code)}>{type.code==='standard'?<Plus size={15}/>:type.code==='circuit'?<CirclePlay size={15}/>:<Layers3 size={15}/>} {type.name}</button>)}</div>
      </section>)}
    </div>
    <button className="secondary trainingAddSession" onClick={addSession}><ListPlus size={17}/>Adicionar sessão</button>
    <div className="trainingStickyActions"><button className="secondary" disabled={busy} onClick={() => submit('draft')}><Save size={17}/>Guardar rascunho</button><button className="primary" disabled={busy} onClick={() => submit('published')}><CheckCircle2 size={17}/>Publicar plano</button></div>
  </div>;
}

export default function TrainingPlansModule({ context = {}, onNavigate }) {
  const { data, currentUser, refreshTraining, trainingLoading, trainingError } = useApp();
  const location = useLocation();
  const routeNavigate = useNavigate();
  const planIdFromUrl = useMemo(() => new URLSearchParams(location.search).get('plano') || '', [location.search]);
  const [canManage, setCanManage] = useState(currentUser.role === 'admin');
  const [activePlanId, setActivePlanId] = useState(planIdFromUrl);
  const [editing, setEditing] = useState(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateStudentId, setDuplicateStudentId] = useState('');
  const [completionBusy, setCompletionBusy] = useState(false);
  const [filterStudent, setFilterStudent] = useState(context.studentId || 'all');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  const ownStudent = data.students.find(student => student.userId === currentUser.id);
  const visibleStudents = currentUser.role === 'aluno' ? (ownStudent ? [ownStudent] : []) : data.students.filter(student => !student.deletedAt);
  const isStudentAssignedToCurrentProfessional = student => Boolean(student && (student.trainerIds || []).includes(currentUser.id));
  const manageableStudents = currentUser.role === 'aluno' || !canManage ? [] : visibleStudents.filter(isStudentAssignedToCurrentProfessional);
  const canManageStudent = student => currentUser.role !== 'aluno' && canManage && isStudentAssignedToCurrentProfessional(student);
  const plans = useMemo(() => data.plans.filter(plan => {
    if (currentUser.role === 'aluno') return plan.studentId === ownStudent?.id && plan.status === 'published';
    if (filterStudent !== 'all' && plan.studentId !== filterStudent) return false;
    const query = q.trim().toLowerCase();
    const studentName = data.students.find(student => student.id === plan.studentId)?.name || '';
    return !query || plan.title.toLowerCase().includes(query) || studentName.toLowerCase().includes(query);
  }), [data.plans, data.students, currentUser.role, ownStudent?.id, filterStudent, q]);

  useEffect(() => { if (currentUser.role !== 'aluno') canManageWorkoutPlans().then(setCanManage); }, [currentUser.id, currentUser.role]);
  useEffect(() => { if (context.studentId) setFilterStudent(context.studentId); }, [context.studentId]);
  useEffect(() => { setActivePlanId(planIdFromUrl); setPreviewMode(false); }, [planIdFromUrl]);

  const setPlanRoute = (planId, { replace = false } = {}) => {
    const params = new URLSearchParams(location.search);
    if (planId) params.set('plano', planId);
    else params.delete('plano');
    const search = params.toString();
    setActivePlanId(planId || '');
    routeNavigate({ pathname: location.pathname, search: search ? `?${search}` : '' }, { replace });
  };

  const activePlan = data.plans.find(plan => plan.id === activePlanId);
  if (editing) return <PlanEditor initialPlan={editing} students={manageableStudents} exercises={data.exercises} blockTypes={data.blockTypes||[]} onCancel={() => setEditing(null)} onSaved={async id => { setEditing(null); await refreshTraining(); setPlanRoute(id, { replace: true }); }}/>;
  if (activePlan) {
    const student=data.students.find(item=>item.id===activePlan.studentId);
    const canManageActivePlan = canManageStudent(student);
    const responsibleTrainerName = student?.primaryTrainer?.name || 'o professor responsável';
    const readOnlyReason = currentUser.role !== 'aluno' && !canManageActivePlan
      ? `Este aluno está associado a ${responsibleTrainerName}. Podes consultar o plano, mas apenas o professor responsável pode criar, editar, arquivar, restaurar, duplicar ou eliminar os seus planos.`
      : '';
    const openDuplicate=()=>{if(!canManageActivePlan)return;setDuplicateStudentId(activePlan.studentId);setDuplicateOpen(true)};
    const confirmDuplicate=()=>{
      const target=duplicateStudentId||activePlan.studentId;
      setDuplicateOpen(false);setPreviewMode(false);setPlanRoute('', { replace: true });setEditing(duplicatePlanFor(activePlan,target));
    };
    return <>
      <PlanViewer plan={activePlan} student={student} canManage={canManageActivePlan && !previewMode} readOnlyReason={readOnlyReason} blockTypes={data.blockTypes||[]} previewMode={previewMode} studentView={currentUser.role==='aluno'} completions={(data.workoutCompletions||[]).filter(item=>item.studentId===activePlan.studentId)} completionBusy={completionBusy} onCompleteSession={async session=>{if(!student||currentUser.role!=='aluno')return;setCompletionBusy(true);setError('');try{await recordWorkoutCompletion({studentId:student.id,planId:activePlan.id,sessionId:session.id,completedOn:localToday(),source:'student'});await refreshTraining()}catch(err){setError(err.message||'Não foi possível registar o treino.')}finally{setCompletionBusy(false)}}} onExitPreview={()=>setPreviewMode(false)} onBack={() => {setPreviewMode(false);setPlanRoute('')}} onPreview={()=>setPreviewMode(true)} onDuplicate={openDuplicate} onEdit={() => setEditing(deepCopyPlan(activePlan))} onArchive={async () => { if (!window.confirm('Arquivar este plano? O aluno deixará de o ver como plano ativo. Poderás reativá-lo mais tarde.')) return; try { await archiveWorkoutPlan(activePlan.id); await refreshTraining(); setPlanRoute('', { replace: true }); } catch (err) { setError(err.message); } }} onRestore={async () => { const wasPublished = Boolean(activePlan.publishedAt); const message = wasPublished ? 'Reativar este plano? Voltará a ficar publicado e visível para o aluno.' : 'Restaurar este plano? Voltará ao estado de rascunho.'; if (!window.confirm(message)) return; try { await restoreWorkoutPlan(activePlan.id); await refreshTraining(); } catch (err) { setError(err.message || 'Não foi possível restaurar o plano.'); } }} onDelete={async () => { if (!window.confirm('Eliminar definitivamente este plano de treino? Esta ação não pode ser anulada. Os registos de treinos já concluídos pelo aluno são preservados.')) return; try { await deleteWorkoutPlanPermanently(activePlan.id); await refreshTraining(); setPreviewMode(false); setPlanRoute('', { replace: true }); } catch (err) { setError(err.message||'Não foi possível eliminar o plano.'); } }}/>
      {duplicateOpen && <div className="overlay" onClick={()=>setDuplicateOpen(false)}><div className="modal duplicatePlanModal" onClick={event=>event.stopPropagation()}><div className="title"><div><span className="eyebrow">DUPLICAR PLANO</span><h2>Aplicar a outro aluno</h2></div><button className="iconButton" onClick={()=>setDuplicateOpen(false)}><X/></button></div><p>É criada uma nova cópia em rascunho. O plano original não é alterado.</p><label className="duplicatePlanStudent">Aluno<select value={duplicateStudentId} onChange={event=>setDuplicateStudentId(event.target.value)}>{manageableStudents.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="modalActions"><button className="secondary" onClick={()=>setDuplicateOpen(false)}>Cancelar</button><button className="primary" onClick={confirmDuplicate}><Copy size={16}/>Criar cópia</button></div></div></div>}
    </>;
  }

  if (activePlanId && trainingLoading) return <div className="notice">A carregar o plano de treino…</div>;
  if (activePlanId && !trainingLoading && !activePlan) {
    window.setTimeout(() => setPlanRoute('', { replace: true }), 0);
  }

  const targetStudent = filterStudent !== 'all' ? data.students.find(student => student.id === filterStudent) : null;
  const targetStudentManageable = targetStudent ? canManageStudent(targetStudent) : false;
  const canCreateForCurrentSelection = canManage && (targetStudent ? targetStudentManageable : manageableStudents.length > 0);
  const defaultNewPlanStudentId = targetStudentManageable ? targetStudent.id : (manageableStudents[0]?.id || '');
  return <div className="trainingPlansPage">
    <div className="heading"><div><h1>{currentUser.role === 'aluno' ? 'O meu treino' : targetStudent ? `Planos · ${targetStudent.name}` : 'Planos de treino'}</h1><p>{currentUser.role === 'aluno' ? 'Consulta o plano publicado pelo teu professor.' : targetStudent && !targetStudentManageable ? `Modo só de leitura · ${targetStudent.primaryTrainer?.name || 'outro professor'} é o professor responsável por este aluno.` : 'Cria e publica prescrições individuais com sessões e séries especiais configuráveis.'}</p></div>{canCreateForCurrentSelection && <button className="primary" onClick={() => setEditing(emptyPlan(defaultNewPlanStudentId))}><Plus size={17}/>Novo plano</button>}</div>
    {currentUser.role !== 'aluno' && targetStudent && !targetStudentManageable && <div className="trainingReadOnlyBanner trainingReadOnlyBannerList"><LockKeyhole size={18}/><div><b>Aluno associado a outro professor</b><span>Podes consultar todos os planos deste aluno, mas não os podes alterar. A gestão fica reservada a {targetStudent.primaryTrainer?.name || 'quem estiver definido como professor responsável'}.</span></div></div>}
    {(trainingError || error) && <div className="errorBanner">{trainingError || error}</div>}
    {currentUser.role !== 'aluno' && <div className="filters trainingFilters"><div className="search"><Search size={18}/><input value={q} onChange={event => setQ(event.target.value)} placeholder="Pesquisar plano ou aluno…"/></div><select value={filterStudent} onChange={event => setFilterStudent(event.target.value)}><option value="all">Todos os alunos</option>{visibleStudents.map(student => <option value={student.id} key={student.id}>{student.name}</option>)}</select></div>}
    {trainingLoading ? <div className="notice">A carregar planos de treino…</div> : plans.length === 0 ? <Card className="pad trainingEmpty"><Dumbbell size={40}/><h2>{currentUser.role === 'aluno' ? 'Ainda não tens um plano publicado' : 'Ainda não existem planos nesta seleção'}</h2><p>{currentUser.role === 'aluno' ? 'Quando o teu professor publicar o plano, aparecerá aqui.' : 'Cria o primeiro plano e guarda-o como rascunho ou publica-o diretamente.'}</p>{canCreateForCurrentSelection && <button className="primary" onClick={() => setEditing(emptyPlan(defaultNewPlanStudentId))}><Plus size={17}/>Criar plano</button>}</Card> : <div className="trainingPlanGrid">{plans.map(plan => { const [label,tone] = planStatus(plan); const student = data.students.find(item => item.id === plan.studentId); const exerciseCount = plan.sessions.reduce((sum,session) => sum + session.blocks.reduce((blockSum,block) => blockSum + block.items.length,0),0); return <button className="card trainingPlanCard" key={plan.id} onClick={() => setPlanRoute(plan.id)}><div className="trainingPlanCardTop"><div className="trainingPlanCardIcon"><Dumbbell/></div><Badge tone={tone}>{label}</Badge></div><h2>{plan.title}</h2>{currentUser.role !== 'aluno' && <span className="trainingStudentName"><UserRound size={14}/>{student?.name || 'Aluno'}</span>}{currentUser.role !== 'aluno' && student && !canManageStudent(student) && <span className="trainingPlanLock"><LockKeyhole size={13}/>Só leitura · {student.primaryTrainer?.name || 'outro professor'}</span>}<p>{plan.goal || plan.description || 'Plano de treino individual.'}</p><div className="trainingPlanStats"><span><Dumbbell size={14}/>{plan.sessions.length} sessão(ões)</span><span><ListPlus size={14}/>{exerciseCount} exercício(s)</span></div><div className="trainingPlanCardFooter"><small>{plan.startDate ? `Início ${plan.startDate}` : 'Sem data definida'}</small><ChevronRight size={18}/></div></button>})}</div>}
  </div>;
}
