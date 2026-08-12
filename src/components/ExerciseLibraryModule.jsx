import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, Archive, BookOpen, CheckCircle2, Dumbbell, Edit3, Eye, Footprints,
  HeartPulse, Layers3, Move, PersonStanding, Plus, RefreshCw, Save, Search,
  Settings2, Sparkles, Upload, Video, X
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import ExerciseMedia, { hasExerciseMedia } from './ExerciseMedia';
import {
  archiveExercise, archiveMuscleGroup, archiveWorkoutBlockType, canManageExerciseLibrary,
  createExercise, createMuscleGroup, createWorkoutBlockType, updateExercise,
  updateMuscleGroup, updateWorkoutBlockType, uploadExerciseMedia
} from '../lib/training';
import { supabase } from '../lib/supabase';
import {
  automaticStretchingCatalog,
  applyAutomaticStretchingCatalog,
} from '../lib/stretching';
import {
  automaticStretchToExercise,
  fetchAutomaticStretchingCatalog,
  saveAutomaticStretchingCatalog,
} from '../lib/automaticStretchingSettings';
import '../styles/exercise-library-v2.css';

const categories = ['Força','Hipertrofia','Funcional','Cross Training','Mobilidade','Alongamento','Cardio','Pliometria','Estabilidade','Condicionamento','Prevenção'];
const difficulties = ['Iniciante','Intermédio','Avançado'];
const PAGE_SIZE = 36;
const iconOptions = [
  ['default','Genérico'],['abdominals','Abdominais'],['cardio','Cardio'],['biceps','Braços'],
  ['back','Tronco/Costas'],['glutes','Glúteos'],['mobility','Mobilidade'],['shoulders','Ombros'],
  ['chest','Peitoral'],['legs','Pernas'],['stretching','Alongamentos'],['functional','Funcional']
];

const iconMap = {
  default:Dumbbell, abdominals:Activity, cardio:HeartPulse, forearm:Dumbbell, biceps:Dumbbell,
  back:PersonStanding, glutes:Footprints, mobility:Move, shoulders:PersonStanding, chest:PersonStanding,
  legs:Footprints, stretching:Move, traps:PersonStanding, triceps:Dumbbell, quads:Footprints,
  hamstrings:Footprints, 'lower-back':Activity, calves:Footprints, functional:Layers3,
  adductors:Footprints, abductors:Footprints,
};

function normaliseGroupKey(value = '') {
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

const groupAliases = {
  'mobilidade':'stretching mobility',
  'alongamento':'stretching mobility',
  'alongamentos':'stretching mobility',
  'stretching':'stretching mobility',
  'stretching mobility':'stretching mobility',
  'core':'abdominais',
  'abdominal':'abdominais',
  'peito':'peitoral',
  'posterior':'isquiotibiais',
  'posteriores':'isquiotibiais',
  'posterior da coxa':'isquiotibiais',
  'posteriores da coxa':'isquiotibiais',
  'corpo inteiro':'funcional',
  'full body':'funcional',
  'fullbody':'funcional',
  'panturrilha':'gemeos',
  'panturrilhas':'gemeos',
  'gemeo':'gemeos',
  'perna':'pernas',
  'ombro':'ombros',
  'gluteo':'gluteos',
  'trapezios':'trapezio',
  'tricep':'triceps',
  'bicep':'biceps',
  'adutor':'adutores',
  'abdutor':'abdutores',
};

function canonicalGroupKey(value = '') {
  const key = normaliseGroupKey(value);
  return groupAliases[key] || key;
}

function isStretchingMobilityGroupName(name = '') {
  return canonicalGroupKey(name) === 'stretching mobility';
}

function displayGroupName(name = '') {
  return isStretchingMobilityGroupName(name) ? 'Stretching & Mobility' : name;
}

function preferredStretchingMobilityGroup(groups = []) {
  const active = groups.filter(item => item.active);
  const pool = active.length ? active : groups;
  return pool.find(item => /^stretching\s*&\s*mobility$/i.test(item.name?.trim() || ''))
    || pool.find(item => /^mobilidade$/i.test(item.name?.trim() || ''))
    || pool.find(item => /^alongamentos?$/i.test(item.name?.trim() || ''))
    || null;
}

function inferExerciseGroupKey(exercise, availableKeys) {
  const category = normaliseGroupKey(exercise?.category || '');
  const name = normaliseGroupKey(exercise?.name || '');

  const categoryMap = {
    'mobilidade':'stretching mobility',
    'alongamento':'stretching mobility',
    'cardio':'cardio',
    'pliometria':'pernas',
    'funcional':'funcional',
    'cross training':'funcional',
    'condicionamento':'funcional',
  };
  if (categoryMap[category] && availableKeys.has(categoryMap[category])) return categoryMap[category];

  const patterns = [
    ['abdominais', /(abdom|crunch|prancha|plank|hollow|core|sit up|dead bug|pallof|russian twist|canivete|infra)/],
    ['biceps', /(biceps|curl|rosca)/],
    ['triceps', /(triceps|pushdown)/],
    ['peitoral', /(peito|supino|crucifixo|chest fly|flexao de braco|flexoes)/],
    ['costas', /(remada|puxada|pulldown|pull up|barra fixa|dorsal|lat pull)/],
    ['ombros', /(ombro|deltoide|elevacao lateral|elevacao frontal|press militar|desenvolvimento militar|face pull)/],
    ['trapezio', /(trapezio|encolhimento)/],
    ['gemeos', /(gemeos|panturr|calf raise|calf)/],
    ['adutores', /(adutor)/],
    ['abdutores', /(abdutor)/],
    ['quadriceps', /(quadriceps|extensora|extensao de pernas)/],
    ['isquiotibiais', /(isquio|femoral|leg curl|curl femoral|stiff|romeno)/],
    ['gluteos', /(glute|hip thrust|ponte de glute|coice)/],
    ['lombar', /(lombar|superman|back extension)/],
    ['stretching mobility', /(mobilidade|alongamento|stretch)/],
    ['cardio', /(corrida|passadeira|bike|bicicleta|remo ergometro|eliptica|cardio)/],
    ['antebraco', /(antebraco|punho|wrist|forearm)/],
    ['pernas', /(agachamento|afundo|lunge|leg press|step up|box jump)/],
    ['funcional', /(burpee|thruster|wall ball|farmer|sled|kettlebell swing)/],
  ];
  for (const [key, pattern] of patterns) {
    if (availableKeys.has(key) && pattern.test(name)) return key;
  }
  return '';
}

function buildGroupModel(rawGroups = []) {
  const allGroups = [...rawGroups].sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name));
  const activeGroups = allGroups.filter(item=>item.active);
  const legacyMobilityGroups = allGroups.filter(item=>isStretchingMobilityGroupName(item.name));
  const canonicalMobility = preferredStretchingMobilityGroup(legacyMobilityGroups);
  const visualGroups = [];
  const seenKeys = new Set();

  for (const group of activeGroups) {
    const key = canonicalGroupKey(group.name);
    if (key === 'stretching mobility') {
      if (canonicalMobility && group.id === canonicalMobility.id && !seenKeys.has(key)) {
        visualGroups.push({...canonicalMobility,name:'Stretching & Mobility',iconKey:'mobility',canonicalKey:key});
        seenKeys.add(key);
      }
      continue;
    }
    if (seenKeys.has(key)) continue;
    visualGroups.push({...group,canonicalKey:key});
    seenKeys.add(key);
  }

  const groupByKey = new Map(visualGroups.map(group=>[group.canonicalKey,group]));
  const allGroupById = new Map(allGroups.map(group=>[group.id,group]));
  return { allGroups, activeGroups, visualGroups, canonicalMobility, groupByKey, allGroupById };
}

function resolveExerciseGroup(exercise, model) {
  const availableKeys = new Set(model.groupByKey.keys());
  const currentGroup = model.allGroupById.get(exercise?.groupId);
  const candidates = [currentGroup?.name, exercise?.group, ...(exercise?.secondaryMuscles || [])];

  for (const candidate of candidates) {
    const key = canonicalGroupKey(candidate);
    if (key && model.groupByKey.has(key)) return model.groupByKey.get(key);
  }

  const inferredKey = inferExerciseGroupKey(exercise, availableKeys);
  return inferredKey ? model.groupByKey.get(inferredKey) || null : null;
}

async function repairExerciseGroupAssignments(exercises, model) {
  const byTarget = new Map();
  let unresolved = 0;

  for (const exercise of exercises || []) {
    const target = resolveExerciseGroup(exercise, model);
    if (!target) {
      unresolved += 1;
      continue;
    }
    const targetName = target.canonicalKey === 'stretching mobility'
      ? (model.allGroupById.get(target.id)?.name || target.name)
      : (model.allGroupById.get(target.id)?.name || target.name);
    if (exercise.groupId === target.id && canonicalGroupKey(exercise.group) === canonicalGroupKey(targetName)) continue;
    const current = byTarget.get(target.id) || { name: targetName, ids: [] };
    current.ids.push(exercise.id);
    byTarget.set(target.id, current);
  }

  let repaired = 0;
  for (const [targetId, payload] of byTarget.entries()) {
    for (let index = 0; index < payload.ids.length; index += 80) {
      const ids = payload.ids.slice(index, index + 80);
      const { error } = await supabase
        .from('exercise_library')
        .update({ muscle_group_id: targetId, muscle_group: payload.name })
        .in('id', ids);
      if (error) throw error;
      repaired += ids.length;
    }
  }
  return { repaired, unresolved };
}

function GroupIcon({ iconKey, size = 30 }) {
  const Icon = iconMap[iconKey] || Dumbbell;
  return <Icon size={size}/>;
}

function emptyExercise(groups, preferredGroup = null) {
  const first = preferredGroup || groups.find(item => item.active) || groups[0];
  return { id:'', name:'', description:'', group:first?.name || '', groupId:first?.id || '', secondaryMuscles:[], equipment:'', category:isStretchingMobilityGroupName(first?.name)?'Mobilidade':'Força', difficulty:'', instructions:'', mediaPath:'', mediaKind:'', externalMediaUrl:'', active:true };
}

function ExerciseForm({ initial, groups, onCancel, onSaved }) {
  const { refreshTraining } = useApp();
  const mergeGroups = groups.filter(item => isStretchingMobilityGroupName(item.name));
  const canonicalMobility = preferredStretchingMobilityGroup(mergeGroups);
  const initialIsLegacyMobility = mergeGroups.some(item => item.id === initial.groupId);
  const [draft,setDraft] = useState(()=>({...initial,groupId:initialIsLegacyMobility&&canonicalMobility?.id?canonicalMobility.id:initial.groupId}));
  const [file,setFile] = useState(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const activeGroups = groups
    .filter(item => item.active || item.id === draft.groupId)
    .filter(item => !isStretchingMobilityGroupName(item.name) || item.id === canonicalMobility?.id);
  function patch(key,value){setDraft(current=>({...current,[key]:value}))}
  async function submit(event){
    event.preventDefault(); setBusy(true); setError('');
    try{
      let mediaPath=draft.mediaPath; let mediaKind=draft.mediaKind;
      if(file){ const uploaded=await uploadExerciseMedia(file); mediaPath=uploaded.path; mediaKind=uploaded.kind; }
      const selectedGroup = groups.find(item => item.id === draft.groupId);
      if(!selectedGroup) throw new Error('Seleciona um grupo muscular.');
      const payload={...draft, group:selectedGroup.name, mediaPath,mediaKind};
      const saved=draft.id?await updateExercise(draft.id,payload):await createExercise(payload);
      await refreshTraining(); onSaved(saved.id);
    }catch(err){setError(err.message||'Não foi possível guardar o exercício.')}finally{setBusy(false)}
  }
  return <div className="exerciseFormPage">
    <button className="backButton" onClick={onCancel}>← Voltar à biblioteca</button>
    <div className="heading"><div><span className="eyebrow">BIBLIOTECA DE EXERCÍCIOS</span><h1>{draft.id?'Editar exercício':'Novo exercício'}</h1><p>Podes usar imagem, GIF, vídeo próprio ou ligação YouTube/Vimeo.</p></div></div>
    {error&&<div className="errorBanner">{error}</div>}
    <form onSubmit={submit} className="card pad exerciseEditorForm">
      <div className="formGrid">
        <label className="wide">Nome*<input required value={draft.name} onChange={event=>patch('name',event.target.value)} placeholder="Ex.: Press de ombros com halteres"/></label>
        <label>Grupo muscular*<select required value={draft.groupId} onChange={event=>patch('groupId',event.target.value)}><option value="">Selecionar</option>{activeGroups.map(item=><option key={item.id} value={item.id}>{displayGroupName(item.name)}</option>)}</select></label>
        <label>Categoria<select value={draft.category} onChange={event=>patch('category',event.target.value)}><option value="">Sem categoria</option>{categories.map(item=><option key={item}>{item}</option>)}</select></label>
        <label>Equipamento<input value={draft.equipment} onChange={event=>patch('equipment',event.target.value)} placeholder="Barra, halteres, TRX…"/></label>
        <label>Dificuldade<select value={draft.difficulty} onChange={event=>patch('difficulty',event.target.value)}><option value="">Por definir</option>{difficulties.map(item=><option key={item}>{item}</option>)}</select></label>
        <label className="wide">Descrição<textarea value={draft.description} onChange={event=>patch('description',event.target.value)} placeholder="Resumo simples do exercício."/></label>
        <label className="wide">Instruções técnicas<textarea value={draft.instructions} onChange={event=>patch('instructions',event.target.value)} placeholder="Pontos de execução, erros a evitar, adaptações…"/></label>
        <div className="wide exerciseMediaUpload"><div><Video/><b>Demonstração</b><small>JPG/PNG/WebP são otimizados. GIF/MP4/WebM até 15 MB. Também podes usar YouTube ou Vimeo.</small></div><label className="secondary"><Upload size={16}/>Escolher ficheiro<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" onChange={event=>setFile(event.target.files?.[0]||null)} hidden/></label>{file&&<span>{file.name}</span>}</div>
        <label className="wide">Ou URL externa<input value={draft.externalMediaUrl} onChange={event=>patch('externalMediaUrl',event.target.value)} placeholder="https://youtube.com/… ou https://vimeo.com/…"/></label>
        <label className="exerciseActiveToggle"><input type="checkbox" checked={draft.active} onChange={event=>patch('active',event.target.checked)}/><span>Exercício ativo e disponível para novos planos</span></label>
      </div>
      <div className="modalActions"><button type="button" className="secondary" onClick={onCancel}>Cancelar</button><button className="primary" disabled={busy}><Save size={17}/>{busy?'A guardar…':'Guardar exercício'}</button></div>
    </form>
  </div>;
}

function AutomaticStretchEditor({ stretch, catalog, onCancel, onSaved }) {
  const [draft,setDraft]=useState({...stretch});
  const [file,setFile]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  async function submit(event){
    event.preventDefault(); setBusy(true); setError('');
    try{
      let mediaPath=draft.mediaPath||'';
      let mediaKind=draft.mediaKind||'';
      let externalMediaUrl=draft.externalMediaUrl||'';
      if(file){
        const uploaded=await uploadExerciseMedia(file);
        mediaPath=uploaded.path;
        mediaKind=uploaded.kind;
        externalMediaUrl='';
      }
      const next=catalog.map(item=>item.key===draft.key?{...item,...draft,mediaPath,mediaKind,externalMediaUrl}:item);
      const saved=await saveAutomaticStretchingCatalog(next);
      applyAutomaticStretchingCatalog(saved);
      onSaved(saved);
    }catch(err){setError(err.message||'Não foi possível guardar o alongamento automático.')}finally{setBusy(false)}
  }

  return <div className="exerciseFormPage">
    <button className="backButton" onClick={onCancel}>← Voltar aos alongamentos automáticos</button>
    <div className="heading"><div><span className="eyebrow">RECUPERAÇÃO AUTOMÁTICA</span><h1>Editar · {stretch.title}</h1><p>Estas alterações serão usadas automaticamente nos planos de treino. Podes substituir a imagem atual por imagem, GIF ou vídeo.</p></div></div>
    {error&&<div className="errorBanner">{error}</div>}
    <form className="card pad exerciseEditorForm" onSubmit={submit}>
      <div className="formGrid">
        <label className="wide">Nome*<input required value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
        <label className="wide">Nome do movimento / subtítulo<input value={draft.subtitle||''} onChange={e=>setDraft({...draft,subtitle:e.target.value})} placeholder="Ex.: Deltoide cruzado"/></label>
        <label className="wide">Instruções<textarea value={draft.description||''} onChange={e=>setDraft({...draft,description:e.target.value})} rows="5"/></label>
        <div className="wide exerciseMediaUpload"><div><Video/><b>Imagem ou vídeo do alongamento</b><small>JPG/PNG/WebP, GIF, MP4 ou WebM. O ficheiro passa a substituir a imagem base atual.</small></div><label className="secondary"><Upload size={16}/>Escolher ficheiro<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" onChange={e=>setFile(e.target.files?.[0]||null)} hidden/></label>{file&&<span>{file.name}</span>}</div>
        <label className="wide">Ou URL externa<input value={draft.externalMediaUrl||''} onChange={e=>setDraft({...draft,externalMediaUrl:e.target.value})} placeholder="YouTube, Vimeo ou URL direta de imagem/vídeo"/></label>
        <div className="wide autoStretchEditorPreview"><span className="eyebrow">PRÉ-VISUALIZAÇÃO ATUAL</span><div className="exerciseMedia"><ExerciseMedia exercise={automaticStretchToExercise(draft)} compact/></div></div>
      </div>
      <div className="modalActions"><button type="button" className="secondary" onClick={onCancel}>Cancelar</button><button className="primary" disabled={busy}><Save size={17}/>{busy?'A guardar…':'Guardar alterações'}</button></div>
    </form>
  </div>;
}

function MuscleGroupManager({ groups, exercises, onBack }) {
  const { refreshTraining } = useApp();
  const [editing,setEditing] = useState(null);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const model = buildGroupModel(groups);
  const visibleGroups = model.visualGroups;
  const counts = Object.fromEntries(visibleGroups.map(group=>[
    group.id,
    exercises.filter(ex=>ex.active&&resolveExerciseGroup(ex,model)?.id===group.id).length
  ]));
  const draft = editing || null;
  function startNew(){setEditing({id:'',name:'',iconKey:'default',sortOrder:100,active:true,system:false})}
  async function save(){
    if(!draft?.name?.trim()) return setError('Indica o nome do grupo muscular.');
    setError('');
    try{
      if(draft.id) await updateMuscleGroup(draft.id,draft); else await createMuscleGroup(draft);
      await refreshTraining(); setEditing(null); setNotice('Grupo muscular guardado.');
    }catch(err){setError(err.message||'Não foi possível guardar o grupo.')}
  }
  async function toggle(group){
    if(counts[group.id] > 0 && group.active) return setError('Este grupo ainda tem exercícios ativos. Move-os para outro grupo antes de o arquivar.');
    try{await archiveMuscleGroup(group.id,!group.active);await refreshTraining();setNotice(group.active?'Grupo arquivado.':'Grupo reativado.')}catch(err){setError(err.message)}
  }
  return <div className="libraryManagerPage">
    <button className="backButton" onClick={onBack}>← Voltar à biblioteca</button>
    <div className="heading"><div><span className="eyebrow">BIBLIOTECA</span><h1>Grupos musculares</h1><p>Cria e organiza grupos para manter a biblioteca preparada para exercícios futuros.</p></div><button className="primary" onClick={startNew}><Plus size={17}/>Criar grupo muscular</button></div>
    {error&&<div className="errorBanner">{error}</div>}{notice&&<div className="successBanner"><CheckCircle2 size={17}/>{notice}</div>}
    {draft&&<div className="card pad libraryInlineEditor"><div className="formGrid"><label>Nome*<input value={draft.name} onChange={e=>setEditing({...draft,name:e.target.value})} placeholder="Ex.: Rotadores da coifa"/></label><label>Ícone<select value={draft.iconKey} onChange={e=>setEditing({...draft,iconKey:e.target.value})}>{iconOptions.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><label>Ordem<input type="number" min="1" value={draft.sortOrder} onChange={e=>setEditing({...draft,sortOrder:e.target.value})}/></label></div><div className="modalActions"><button className="secondary" onClick={()=>setEditing(null)}>Cancelar</button><button className="primary" onClick={save}><Save size={16}/>Guardar</button></div></div>}
    <div className="muscleGroupManagerGrid">{visibleGroups.map(group=><article className={`card muscleGroupManageCard ${!group.active?'inactive':''}`} key={group.id}><div className="muscleGroupIcon"><GroupIcon iconKey={group.canonicalKey==='stretching mobility'?'mobility':group.iconKey}/></div><div><h3>{displayGroupName(group.name)}</h3><small>{counts[group.id]||0} exercício(s){group.system?' · Base Ultimate Fit':''}</small></div><div className="exerciseCardActions"><button className="secondary" onClick={()=>setEditing({...model.allGroupById.get(group.id),name:displayGroupName(group.name)})}><Edit3 size={15}/>Editar</button><button className="secondary" onClick={()=>toggle(model.allGroupById.get(group.id)||group)}>{group.active?<Archive size={15}/>:<RefreshCw size={15}/>} {group.active?'Arquivar':'Reativar'}</button></div></article>)}</div>
  </div>;
}

function SeriesTypeManager({ types, onBack }) {
  const { refreshTraining } = useApp();
  const [editing,setEditing] = useState(null);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  function startNew(){setEditing({code:'',name:'',description:'',iconKey:'layers',supportsRounds:true,sortOrder:100,active:true,system:false})}
  async function save(){
    if(!editing?.name?.trim()) return setError('Indica o nome da série especial.');
    try{
      if(editing.code) await updateWorkoutBlockType(editing.code,editing); else await createWorkoutBlockType(editing);
      await refreshTraining(); setEditing(null); setNotice('Tipo de série guardado.'); setError('');
    }catch(err){setError(err.message||'Não foi possível guardar a série especial.')}
  }
  async function toggle(type){
    if(type.system) return setError('As três séries base não podem ser arquivadas.');
    try{await archiveWorkoutBlockType(type.code,!type.active);await refreshTraining();setNotice(type.active?'Série especial arquivada.':'Série especial reativada.')}catch(err){setError(err.message)}
  }
  return <div className="libraryManagerPage">
    <button className="backButton" onClick={onBack}>← Voltar à biblioteca</button>
    <div className="heading"><div><span className="eyebrow">PLANOS DE TREINO</span><h1>Séries especiais</h1><p>Além de série normal, supersérie e circuito, podes criar formatos próprios para a tua equipa.</p></div><button className="primary" onClick={startNew}><Plus size={17}/>Criar série especial</button></div>
    {error&&<div className="errorBanner">{error}</div>}{notice&&<div className="successBanner"><CheckCircle2 size={17}/>{notice}</div>}
    {editing&&<div className="card pad libraryInlineEditor"><div className="formGrid"><label>Nome*<input value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})} placeholder="Ex.: Tri-set"/></label><label>Ordem<input type="number" min="1" value={editing.sortOrder} onChange={e=>setEditing({...editing,sortOrder:e.target.value})}/></label><label className="wide">Descrição<input value={editing.description} onChange={e=>setEditing({...editing,description:e.target.value})} placeholder="Como deve ser usada esta série?"/></label><label className="exerciseActiveToggle"><input type="checkbox" checked={editing.supportsRounds} onChange={e=>setEditing({...editing,supportsRounds:e.target.checked)}/><span>Permitir definir voltas/rondas e descanso após o bloco</span></label></div><div className="modalActions"><button className="secondary" onClick={()=>setEditing(null)}>Cancelar</button><button className="primary" onClick={save}><Save size={16}/>Guardar</button></div></div>}
    <div className="seriesTypeGrid">{types.map(type=><article className={`card pad seriesTypeCard ${!type.active?'inactive':''}`} key={type.code}><div className="seriesTypeTop"><div className="muscleGroupIcon"><Layers3/></div><div><h3>{type.name}</h3><small>{type.system?'Série base':'Série personalizada'}{type.supportsRounds?' · com voltas':''}</small></div></div><p>{type.description||'Sem descrição.'}</p><div className="exerciseCardActions"><button className="secondary" onClick={()=>setEditing({...type})}><Edit3 size={15}/>Editar</button>{!type.system&&<button className="secondary" onClick={()=>toggle(type)}>{type.active?<Archive size={15}/>:<RefreshCw size={15}/>} {type.active?'Arquivar':'Reativar'}</button>}</div></article>)}</div>
  </div>;
}

function StandardExerciseCard({ exercise, canManage, onPreview, onEdit, onToggle }) {
  return <article className="card exerciseCard realExerciseCard">
    <div className="exerciseMedia"><ExerciseMedia exercise={exercise} compact/></div>
    <div className="pad">
      <div className="exerciseCardBadges">
        <span className="badge yellow">{displayGroupName(exercise.group)}</span>
        {exercise.category&&<span className="badge gray">{exercise.category}</span>}
        {hasExerciseMedia(exercise)&&<span className="badge green">Media</span>}
        {!exercise.active&&<span className="badge gray">Arquivado</span>}
      </div>
      <h3>{exercise.name}</h3>
      <small>{exercise.equipment||'Sem equipamento definido'}{exercise.difficulty?` · ${exercise.difficulty}`:''}</small>
      <p>{exercise.description||'Exercício disponível para prescrição nos planos de treino.'}</p>
      <div className="exerciseCardActions">
        {hasExerciseMedia(exercise)&&<button className="secondary" onClick={()=>onPreview(exercise)}><Eye size={15}/>Ver</button>}
        {canManage&&<><button className="secondary" onClick={()=>onEdit(exercise)}><Edit3 size={15}/>Editar</button><button className="secondary" onClick={()=>onToggle(exercise)}>{exercise.active?<Archive size={15}/>:<RefreshCw size={15}/>} {exercise.active?'Arquivar':'Reativar'}</button></>}
      </div>
    </div>
  </article>;
}

export default function ExerciseLibraryModule(){
  const {data,currentUser,refreshTraining,trainingLoading,trainingError}=useApp();
  const [canManage,setCanManage]=useState(currentUser.role==='admin');
  const [section,setSection]=useState('exercises');
  const [q,setQ]=useState('');
  const [group,setGroup]=useState('all');
  const [status,setStatus]=useState('active');
  const [editing,setEditing]=useState(null);
  const [editingAuto,setEditingAuto]=useState(null);
  const [view,setView]=useState('library');
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const [preview,setPreview]=useState(null);
  const [autoCatalog,setAutoCatalog]=useState(()=>automaticStretchingCatalog.map(item=>({...item})));
  const [visibleCount,setVisibleCount]=useState(PAGE_SIZE);
  const repairStarted=useRef(false);

  useEffect(()=>{if(currentUser.role!=='aluno')canManageExerciseLibrary().then(setCanManage)},[currentUser.id,currentUser.role]);
  useEffect(()=>setVisibleCount(PAGE_SIZE),[q,group,status,section]);
  useEffect(()=>{
    let alive=true;
    fetchAutomaticStretchingCatalog().then(items=>{
      if(!alive)return;
      setAutoCatalog(items);
      applyAutomaticStretchingCatalog(items);
    }).catch(()=>{});
    return()=>{alive=false};
  },[]);

  useEffect(()=>{
    if(currentUser.role!=='admin'||trainingLoading||repairStarted.current)return;
    if(!(data.exercises||[]).length||!(data.muscleGroups||[]).length)return;
    repairStarted.current=true;
    const model=buildGroupModel(data.muscleGroups||[]);
    repairExerciseGroupAssignments(data.exercises||[],model).then(async result=>{
      if(result.repaired>0){
        await refreshTraining();
        setNotice(`${result.repaired} exercício(s) foram associados ao respetivo grupo muscular.`);
      }
      if(result.unresolved>0){
        setError(`${result.unresolved} exercício(s) continuam sem um grupo reconhecido e precisam de revisão.`);
      }
    }).catch(err=>setError(err.message||'Não foi possível corrigir as associações dos exercícios.'));
  },[currentUser.role,trainingLoading,data.exercises?.length,data.muscleGroups?.length]);

  const model=buildGroupModel(data.muscleGroups||[]);
  const groups=model.activeGroups;
  const visualGroups=model.visualGroups;
  const normalisedExercises=(data.exercises||[]).map(exercise=>{
    const target=resolveExerciseGroup(exercise,model);
    if(!target)return {...exercise,resolvedGroupId:'',resolvedGroupKey:''};
    const dbTarget=model.allGroupById.get(target.id)||target;
    return {...exercise,group:displayGroupName(dbTarget.name),groupId:target.id,resolvedGroupId:target.id,resolvedGroupKey:target.canonicalKey};
  });
  const counts=Object.fromEntries(visualGroups.map(item=>[
    item.id,
    normalisedExercises.filter(ex=>ex.active&&ex.resolvedGroupId===item.id).length
  ]));
  const unresolvedActive=normalisedExercises.filter(ex=>ex.active&&!ex.resolvedGroupId);
  const baseExercises=normalisedExercises;
  const list=baseExercises.filter(exercise=>{
    const query=q.trim().toLowerCase();
    if(status==='active'&&!exercise.active)return false;
    if(status==='inactive'&&exercise.active)return false;
    if(group==='__unassigned__'&&exercise.resolvedGroupId)return false;
    if(group!=='all'&&group!=='__unassigned__'&&exercise.resolvedGroupId!==group)return false;
    return !query
      ||exercise.name.toLowerCase().includes(query)
      ||(exercise.equipment||'').toLowerCase().includes(query)
      ||(exercise.category||'').toLowerCase().includes(query)
      ||(exercise.aliases||[]).some(alias=>alias.toLowerCase().includes(query));
  });
  const autoList=useMemo(()=>autoCatalog.filter(stretch=>{
    const query=q.trim().toLowerCase();
    return !query||`${stretch.title} ${stretch.subtitle} ${stretch.description}`.toLowerCase().includes(query);
  }),[autoCatalog,q]);

  if(view==='groups')return <MuscleGroupManager groups={data.muscleGroups||[]} exercises={data.exercises} onBack={()=>setView('library')}/>;
  if(view==='series')return <SeriesTypeManager types={data.blockTypes||[]} onBack={()=>setView('library')}/>;
  if(editing)return <ExerciseForm initial={editing} groups={data.muscleGroups||[]} onCancel={()=>setEditing(null)} onSaved={()=>{setEditing(null);setNotice('Exercício guardado.')}}/>;
  if(editingAuto)return <AutomaticStretchEditor stretch={editingAuto} catalog={autoCatalog} onCancel={()=>setEditingAuto(null)} onSaved={items=>{setAutoCatalog(items);setEditingAuto(null);setNotice('Alongamento automático atualizado. A nova versão será usada nos planos de treino.')}}/>;

  async function toggle(exercise){
    setError('');
    try{await archiveExercise(exercise.id,!exercise.active);await refreshTraining();setNotice(exercise.active?'Exercício arquivado.':'Exercício reativado.')}catch(err){setError(err.message)}
  }

  function chooseSection(next){
    setSection(next);setQ('');setGroup('all');setStatus('active');setPreview(null);
  }

  const selectedGroup=group==='all'||group==='__unassigned__'?null:visualGroups.find(item=>item.id===group);
  const preferredNewGroup=selectedGroup?groups.find(item=>item.id===selectedGroup.id):null;

  return <div className="exerciseLibraryPage">
    <div className="heading libraryHeading">
      <div><h1>Biblioteca</h1><p>Biblioteca de exercícios e recuperação automática num único local.</p></div>
      {canManage&&<div className="libraryHeadingActions"><button className="secondary" onClick={()=>setView('groups')}><Settings2 size={16}/>Grupos musculares</button><button className="secondary" onClick={()=>setView('series')}><Layers3 size={16}/>Séries especiais</button>{section!=='automatic'&&<button className="primary" onClick={()=>setEditing(emptyExercise(groups,preferredNewGroup))}><Plus size={17}/>Novo exercício</button>}</div>}
    </div>

    <nav className="librarySectionTabs" aria-label="Áreas da biblioteca">
      <button className={section==='exercises'?'active':''} onClick={()=>chooseSection('exercises')}><Dumbbell size={18}/><span><b>Exercícios</b><small>Força, cardio, Stretching & Mobility e restantes grupos</small></span></button>
      <button className={section==='automatic'?'active':''} onClick={()=>chooseSection('automatic')}><Sparkles size={18}/><span><b>Alongamentos automáticos</b><small>Gerados no final do treino</small></span></button>
    </nav>

    {(trainingError||error)&&<div className="errorBanner">{trainingError||error}</div>}
    {notice&&<div className="successBanner"><CheckCircle2 size={17}/>{notice}</div>}

    {section==='automatic'?<>
      <section className="card pad automaticStretchIntro">
        <div className="automaticStretchIntroIcon"><Sparkles/></div>
        <div><span className="eyebrow">RECUPERAÇÃO AUTOMÁTICA</span><h2>Alongamentos usados automaticamente pela app</h2><p>Estes movimentos são escolhidos de acordo com os grupos musculares trabalhados em cada sessão. Não aparecem na seleção normal de exercícios, evitando confusão durante a prescrição.</p><small>Editar um alongamento aqui altera a versão apresentada nos planos futuros e nos planos já existentes quando forem consultados.</small></div>
      </section>
      <div className="filters exerciseLibraryFilters"><div className="search"><Search size={18}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Pesquisar alongamento automático…"/></div></div>
      <div className="grid three exerciseLibraryGrid automaticExerciseGrid">
        {autoList.map(stretch=>{
          const mediaExercise=automaticStretchToExercise(stretch);
          return <article className="card exerciseCard realExerciseCard automaticExerciseCard" key={stretch.key}>
            <div className="exerciseMedia"><ExerciseMedia exercise={mediaExercise} compact/></div>
            <div className="pad"><div className="exerciseCardBadges"><span className="badge yellow">Automático</span><span className="badge gray">20–30 s · 1–2 séries</span>{hasExerciseMedia(mediaExercise)&&<span className="badge green">Media</span>}</div><h3>{stretch.title}</h3><small>{stretch.subtitle}</small><p>{stretch.description}</p><div className="exerciseCardActions"><button className="secondary" onClick={()=>setPreview(mediaExercise)}><Eye size={15}/>Ver</button>{currentUser.role==='admin'&&<button className="secondary" onClick={()=>setEditingAuto({...stretch})}><Edit3 size={15}/>Editar</button>}</div></div>
          </article>;
        })}
      </div>
      {!autoList.length&&<div className="notice">Nenhum alongamento automático corresponde à pesquisa.</div>}
    </>:<>
      <section className="card pad muscleGroupSection"><div className="librarySectionTitle"><div><span className="eyebrow">GRUPOS MUSCULARES</span><h2>{group==='__unassigned__'?'Por classificar':selectedGroup?displayGroupName(selectedGroup.name):'Todos os grupos'}</h2></div><small>Todos os exercícios são associados a um único grupo principal para que os totais sejam coerentes.</small></div><div className="muscleGroupVisualGrid"><button className={`muscleGroupVisualCard ${group==='all'?'active':''}`} onClick={()=>setGroup('all')}><div className="muscleGroupIcon"><BookOpen/></div><b>Todos</b><span>{baseExercises.filter(ex=>ex.active).length}</span></button>{visualGroups.map(item=><button className={`muscleGroupVisualCard ${group===item.id?'active':''}`} key={item.id} onClick={()=>setGroup(item.id)}><div className="muscleGroupIcon"><GroupIcon iconKey={item.iconKey}/></div><b>{displayGroupName(item.name)}</b><span>{counts[item.id]||0}</span></button>)}{unresolvedActive.length>0&&<button className={`muscleGroupVisualCard ${group==='__unassigned__'?'active':''}`} onClick={()=>setGroup('__unassigned__')}><div className="muscleGroupIcon"><Settings2/></div><b>Por classificar</b><span>{unresolvedActive.length}</span></button>}</div></section>
      <div className="filters exerciseLibraryFilters"><div className="search"><Search size={18}/><input value={q} onChange={event=>setQ(event.target.value)} placeholder={selectedGroup&&isStretchingMobilityGroupName(selectedGroup.name)?'Pesquisar stretching ou mobilidade…':'Pesquisar exercício, equipamento ou nome alternativo…'}/></div><select value={status} onChange={event=>setStatus(event.target.value)}><option value="active">Ativos</option><option value="inactive">Arquivados</option><option value="all">Todos</option></select></div>
      {trainingLoading?<div className="notice">A carregar biblioteca…</div>:<><div className="grid three exerciseLibraryGrid">{list.slice(0,visibleCount).map(exercise=><StandardExerciseCard key={exercise.id} exercise={exercise} canManage={canManage} onPreview={setPreview} onEdit={item=>setEditing({...item})} onToggle={toggle}/>)}</div>{visibleCount<list.length&&<div className="libraryLoadMore"><button className="secondary" onClick={()=>setVisibleCount(v=>v+PAGE_SIZE)}>Mostrar mais · {Math.min(PAGE_SIZE,list.length-visibleCount)} de {list.length-visibleCount} restantes</button></div>}{list.length===0&&<div className="notice">Não existem exercícios para estes filtros.</div>}</>}
    </>}

    {preview&&<div className="overlay" onClick={()=>setPreview(null)}><div className="modal exerciseDemoModal" onClick={event=>event.stopPropagation()}><div className="title"><div><span className="eyebrow">DEMONSTRAÇÃO</span><h2>{preview.name}</h2></div><button className="iconButton" onClick={()=>setPreview(null)}><X/></button></div><div className="exerciseDemoMedia"><ExerciseMedia exercise={preview}/></div><div className="exerciseCardBadges"><span className="badge yellow">{displayGroupName(preview.group)}</span>{preview.equipment&&<span className="badge gray">{preview.equipment}</span>}</div>{preview.description&&<p>{preview.description}</p>}{preview.instructions&&<div className="notice">{preview.instructions}</div>}</div></div>}
  </div>;
}
