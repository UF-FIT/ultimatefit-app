import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, Archive, BookOpen, CheckCircle2, Dumbbell, Edit3, Eye, Footprints,
  HeartPulse, Layers3, Move, PersonStanding, Plus, RefreshCw, Save, Search,
  Settings2, Upload, Video, X
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import ExerciseMedia, { hasExerciseMedia } from './ExerciseMedia';
import {
  archiveExercise, archiveMuscleGroup, archiveWorkoutBlockType, canManageExerciseLibrary,
  createExercise, createMuscleGroup, createWorkoutBlockType, updateExercise,
  updateMuscleGroup, updateWorkoutBlockType, uploadExerciseMedia
} from '../lib/training';
import { automaticStretchingCatalog } from '../lib/stretching';

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

function GroupIcon({ iconKey, size = 30 }) {
  const Icon = iconMap[iconKey] || Dumbbell;
  return <Icon size={size}/>;
}

function emptyExercise(groups) {
  const first = groups.find(item => item.active) || groups[0];
  return { id:'', name:'', description:'', group:first?.name || '', groupId:first?.id || '', secondaryMuscles:[], equipment:'', category:'Força', difficulty:'', instructions:'', mediaPath:'', mediaKind:'', externalMediaUrl:'', active:true };
}

function ExerciseForm({ initial, groups, onCancel, onSaved }) {
  const { refreshTraining } = useApp();
  const [draft,setDraft] = useState({...initial});
  const [file,setFile] = useState(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const activeGroups = groups.filter(item => item.active || item.id === draft.groupId);
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
    <div className="heading"><div><span className="eyebrow">BIBLIOTECA DE EXERCÍCIOS</span><h1>{draft.id?'Editar exercício':'Novo exercício'}</h1><p>Usa nomes claros em português de Portugal ou mantém o nome original quando o exercício é conhecido em inglês.</p></div></div>
    {error&&<div className="errorBanner">{error}</div>}
    <form onSubmit={submit} className="card pad exerciseEditorForm">
      <div className="formGrid">
        <label className="wide">Nome*<input required value={draft.name} onChange={event=>patch('name',event.target.value)} placeholder="Ex.: Press de ombros com halteres"/></label>
        <label>Grupo muscular*<select required value={draft.groupId} onChange={event=>patch('groupId',event.target.value)}><option value="">Selecionar</option>{activeGroups.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
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

function MuscleGroupManager({ groups, exercises, onBack }) {
  const { refreshTraining } = useApp();
  const [editing,setEditing] = useState(null);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const counts = useMemo(()=>Object.fromEntries(groups.map(group=>[group.id,exercises.filter(ex=>ex.groupId===group.id && ex.active).length])),[groups,exercises]);
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
    <div className="muscleGroupManagerGrid">{groups.map(group=><article className={`card muscleGroupManageCard ${!group.active?'inactive':''}`} key={group.id}><div className="muscleGroupIcon"><GroupIcon iconKey={group.iconKey}/></div><div><h3>{group.name}</h3><small>{counts[group.id]||0} exercício(s){group.system?' · Base Ultimate Fit':''}</small></div><div className="exerciseCardActions"><button className="secondary" onClick={()=>setEditing({...group})}><Edit3 size={15}/>Editar</button><button className="secondary" onClick={()=>toggle(group)}>{group.active?<Archive size={15}/>:<RefreshCw size={15}/>} {group.active?'Arquivar':'Reativar'}</button></div></article>)}</div>
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
    {editing&&<div className="card pad libraryInlineEditor"><div className="formGrid"><label>Nome*<input value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})} placeholder="Ex.: Tri-set"/></label><label>Ordem<input type="number" min="1" value={editing.sortOrder} onChange={e=>setEditing({...editing,sortOrder:e.target.value})}/></label><label className="wide">Descrição<input value={editing.description} onChange={e=>setEditing({...editing,description:e.target.value})} placeholder="Como deve ser usada esta série?"/></label><label className="exerciseActiveToggle"><input type="checkbox" checked={editing.supportsRounds} onChange={e=>setEditing({...editing,supportsRounds:e.target.checked})}/><span>Permitir definir voltas/rondas e descanso após o bloco</span></label></div><div className="modalActions"><button className="secondary" onClick={()=>setEditing(null)}>Cancelar</button><button className="primary" onClick={save}><Save size={16}/>Guardar</button></div></div>}
    <div className="seriesTypeGrid">{types.map(type=><article className={`card pad seriesTypeCard ${!type.active?'inactive':''}`} key={type.code}><div className="seriesTypeTop"><div className="muscleGroupIcon"><Layers3/></div><div><h3>{type.name}</h3><small>{type.system?'Série base':'Série personalizada'}{type.supportsRounds?' · com voltas':''}</small></div></div><p>{type.description||'Sem descrição.'}</p><div className="exerciseCardActions"><button className="secondary" onClick={()=>setEditing({...type})}><Edit3 size={15}/>Editar</button>{!type.system&&<button className="secondary" onClick={()=>toggle(type)}>{type.active?<Archive size={15}/>:<RefreshCw size={15}/>} {type.active?'Arquivar':'Reativar'}</button>}</div></article>)}</div>
  </div>;
}

export default function ExerciseLibraryModule(){
  const {data,currentUser,refreshTraining,trainingLoading,trainingError}=useApp();
  const [canManage,setCanManage]=useState(currentUser.role==='admin');
  const [q,setQ]=useState('');
  const [group,setGroup]=useState('all');
  const [status,setStatus]=useState('active');
  const [editing,setEditing]=useState(null);
  const [view,setView]=useState('library');
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const [preview,setPreview]=useState(null);
  const [autoPreview,setAutoPreview]=useState(null);
  const [visibleCount,setVisibleCount]=useState(PAGE_SIZE);

  useEffect(()=>{if(currentUser.role!=='aluno')canManageExerciseLibrary().then(setCanManage)},[currentUser.id,currentUser.role]);
  useEffect(()=>setVisibleCount(PAGE_SIZE),[q,group,status]);

  const groups=(data.muscleGroups||[]).filter(item=>item.active).sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name));
  const counts=useMemo(()=>Object.fromEntries((data.muscleGroups||[]).map(g=>[g.id,data.exercises.filter(ex=>ex.active&&ex.groupId===g.id).length])),[data.exercises,data.muscleGroups]);
  const list=useMemo(()=>data.exercises.filter(exercise=>{
    const query=q.trim().toLowerCase();
    if(status==='active'&&!exercise.active)return false;
    if(status==='inactive'&&exercise.active)return false;
    if(group!=='all'&&exercise.groupId!==group)return false;
    return !query
      ||exercise.name.toLowerCase().includes(query)
      ||(exercise.equipment||'').toLowerCase().includes(query)
      ||(exercise.category||'').toLowerCase().includes(query)
      ||(exercise.aliases||[]).some(alias=>alias.toLowerCase().includes(query));
  }),[data.exercises,q,group,status]);

  if(view==='groups')return <MuscleGroupManager groups={data.muscleGroups||[]} exercises={data.exercises} onBack={()=>setView('library')}/>;
  if(view==='series')return <SeriesTypeManager types={data.blockTypes||[]} onBack={()=>setView('library')}/>;
  if(editing)return <ExerciseForm initial={editing} groups={data.muscleGroups||[]} onCancel={()=>setEditing(null)} onSaved={()=>{setEditing(null);setNotice('Exercício guardado.')}}/>;

  async function toggle(exercise){
    setError('');
    try{
      await archiveExercise(exercise.id,!exercise.active);
      await refreshTraining();
      setNotice(exercise.active?'Exercício arquivado.':'Exercício reativado.');
    }catch(err){setError(err.message)}
  }

  const selectedGroup=(data.muscleGroups||[]).find(item=>item.id===group);
  const showingStretchingGroup=selectedGroup?.name==='Alongamentos';
  const autoStretchList=automaticStretchingCatalog.filter(stretch=>{
    const query=q.trim().toLowerCase();
    if(!query)return true;
    return `${stretch.title} ${stretch.subtitle} ${stretch.description}`.toLowerCase().includes(query);
  });
  const showAutomaticStretching=showingStretchingGroup&&status!=='inactive';

  return <div className="exerciseLibraryPage">
    <div className="heading libraryHeading">
      <div>
        <h1>Biblioteca de exercícios</h1>
        <p>{data.exercises.filter(item=>item.active).length} exercícios ativos · {data.exercises.filter(item=>item.active&&hasExerciseMedia(item)).length} com demonstração.</p>
      </div>
      {canManage&&<div className="libraryHeadingActions">
        <button className="secondary" onClick={()=>setView('groups')}><Settings2 size={16}/>Grupos musculares</button>
        <button className="secondary" onClick={()=>setView('series')}><Layers3 size={16}/>Séries especiais</button>
        <button className="primary" onClick={()=>setEditing(emptyExercise(groups))}><Plus size={17}/>Novo exercício</button>
      </div>}
    </div>

    {(trainingError||error)&&<div className="errorBanner">{trainingError||error}</div>}
    {notice&&<div className="successBanner"><CheckCircle2 size={17}/>{notice}</div>}

    <section className="card pad muscleGroupSection">
      <div className="librarySectionTitle">
        <div><span className="eyebrow">GRUPOS MUSCULARES</span><h2>{selectedGroup?selectedGroup.name:'Todos os grupos'}</h2></div>
        <small>Seleciona visualmente o grupo que queres consultar.</small>
      </div>
      <div className="muscleGroupVisualGrid">
        <button className={`muscleGroupVisualCard ${group==='all'?'active':''}`} onClick={()=>setGroup('all')}>
          <div className="muscleGroupIcon"><BookOpen/></div><b>Todos</b><span>{data.exercises.filter(ex=>ex.active).length}</span>
        </button>
        {groups.map(item=><button className={`muscleGroupVisualCard ${group===item.id?'active':''}`} key={item.id} onClick={()=>setGroup(item.id)}>
          <div className="muscleGroupIcon"><GroupIcon iconKey={item.iconKey}/></div><b>{item.name}</b><span>{counts[item.id]||0}</span>
        </button>)}
      </div>
    </section>

    <div className="filters exerciseLibraryFilters">
      <div className="search"><Search size={18}/><input value={q} onChange={event=>setQ(event.target.value)} placeholder="Pesquisar exercício, equipamento ou nome alternativo…"/></div>
      <select value={status} onChange={event=>setStatus(event.target.value)}><option value="active">Ativos</option><option value="inactive">Arquivados</option><option value="all">Todos</option></select>
    </div>

    {showAutomaticStretching&&<section className="automaticStretchLibrarySection">
      <div className="automaticStretchLibraryNotice">
        <div className="automaticStretchLibraryNoticeIcon"><Move size={22}/></div>
        <div>
          <span className="eyebrow">ALONGAMENTOS AUTOMÁTICOS</span>
          <h3>Estes alongamentos aparecem automaticamente nos planos de treino</h3>
          <p>A ULTIMATE FIT APP seleciona-os no final de cada sessão de acordo com os grupos musculares trabalhados. Não precisam de ser adicionados manualmente ao plano. O professor pode desligar esta opção ao criar ou editar cada plano.</p>
        </div>
        <span className="autoStretchBadge">AUTOMÁTICO</span>
      </div>

      <div className="automaticStretchLibraryGrid">
        {autoStretchList.map(stretch=><article className="card automaticStretchLibraryCard" key={stretch.key}>
          <button type="button" className="automaticStretchLibraryImage" onClick={()=>setAutoPreview(stretch)} aria-label={`Ver alongamento ${stretch.title}`}>
            <img src={stretch.image} alt={`Alongamento — ${stretch.title}`} loading="lazy"/>
            <span><Eye size={14}/>Ver</span>
          </button>
          <div className="pad">
            <div className="exerciseCardBadges"><span className="badge yellow">Alongamentos</span><span className="badge green">Automático</span></div>
            <h3>{stretch.title}</h3>
            <small>{stretch.subtitle}</small>
            <p>{stretch.description}</p>
            <div className="automaticStretchPrescription"><b>20–30 s</b><span>1–2 séries por lado</span></div>
          </div>
        </article>)}
      </div>
      {autoStretchList.length===0&&<div className="notice">Nenhum alongamento automático corresponde à pesquisa.</div>}

      <div className="librarySubsectionHeading">
        <span className="eyebrow">BIBLIOTECA MANUAL</span>
        <h3>Outros alongamentos da biblioteca</h3>
        <p>Estes exercícios continuam disponíveis para serem adicionados manualmente aos planos quando o professor quiser.</p>
      </div>
    </section>}

    {trainingLoading?<div className="notice">A carregar biblioteca…</div>:<>
      <div className="grid three exerciseLibraryGrid">
        {list.slice(0,visibleCount).map(exercise=><article className="card exerciseCard realExerciseCard" key={exercise.id}>
          <div className="exerciseMedia"><ExerciseMedia exercise={exercise} compact/></div>
          <div className="pad">
            <div className="exerciseCardBadges">
              <span className="badge yellow">{exercise.group}</span>
              {exercise.category&&<span className="badge gray">{exercise.category}</span>}
              {hasExerciseMedia(exercise)&&<span className="badge green">Vídeo</span>}
              {!exercise.active&&<span className="badge gray">Arquivado</span>}
            </div>
            <h3>{exercise.name}</h3>
            <small>{exercise.equipment||'Sem equipamento definido'}{exercise.difficulty?` · ${exercise.difficulty}`:''}</small>
            <p>{exercise.description||'Exercício disponível para prescrição nos planos de treino.'}</p>
            <div className="exerciseCardActions">
              {hasExerciseMedia(exercise)&&<button className="secondary" onClick={()=>setPreview(exercise)}><Eye size={15}/>Ver</button>}
              {canManage&&<>
                <button className="secondary" onClick={()=>setEditing({...exercise})}><Edit3 size={15}/>Editar</button>
                <button className="secondary" onClick={()=>toggle(exercise)}>{exercise.active?<Archive size={15}/>:<RefreshCw size={15}/>} {exercise.active?'Arquivar':'Reativar'}</button>
              </>}
            </div>
          </div>
        </article>)}
      </div>
      {visibleCount<list.length&&<div className="libraryLoadMore"><button className="secondary" onClick={()=>setVisibleCount(v=>v+PAGE_SIZE)}>Mostrar mais · {Math.min(PAGE_SIZE,list.length-visibleCount)} de {list.length-visibleCount} restantes</button></div>}
      {list.length===0&&!showAutomaticStretching&&<div className="notice">Não existem exercícios para estes filtros.</div>}
    </>}

    {preview&&<div className="overlay" onClick={()=>setPreview(null)}>
      <div className="modal exerciseDemoModal" onClick={event=>event.stopPropagation()}>
        <div className="title"><div><span className="eyebrow">DEMONSTRAÇÃO</span><h2>{preview.name}</h2></div><button className="iconButton" onClick={()=>setPreview(null)}><X/></button></div>
        <div className="exerciseDemoMedia"><ExerciseMedia exercise={preview}/></div>
        <div className="exerciseCardBadges"><span className="badge yellow">{preview.group}</span>{preview.equipment&&<span className="badge gray">{preview.equipment}</span>}</div>
        {preview.description&&<p>{preview.description}</p>}
        {preview.instructions&&<div className="notice">{preview.instructions}</div>}
      </div>
    </div>}

    {autoPreview&&<div className="overlay stretchingLightbox" onClick={()=>setAutoPreview(null)}>
      <div className="stretchingLightboxCard" onClick={event=>event.stopPropagation()}>
        <button className="iconButton stretchingLightboxClose" onClick={()=>setAutoPreview(null)} aria-label="Fechar"><X/></button>
        <div className="stretchingLightboxImage"><img src={autoPreview.image} alt={`Alongamento — ${autoPreview.title}`}/></div>
        <div className="stretchingLightboxCopy">
          <span className="eyebrow">ALONGAMENTO AUTOMÁTICO</span>
          <h3>{autoPreview.title}</h3>
          <b>{autoPreview.subtitle}</b>
          <p>{autoPreview.description}</p>
          <strong>20–30 s · 1–2 séries por lado</strong>
          <small>Este alongamento é selecionado automaticamente pela ULTIMATE FIT APP quando corresponde aos grupos musculares trabalhados.</small>
        </div>
      </div>
    </div>}
  </div>;
}
