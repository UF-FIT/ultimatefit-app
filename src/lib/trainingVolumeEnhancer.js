import { supabase } from './supabase';
import { fetchWorkoutPlans } from './training';
import '../styles/training-volume-analysis.css';

const ROOT_ID = 'uf-training-volume-analysis';
const LOAD_HISTORY_ID = 'uf-training-load-history';
const RECORDER_CLASS = 'uf-training-load-recorder';
let lastKey = '';
let busy = false;
let historyMonthOffset = 0;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}
function normalise(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/&/g,' ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}
const aliases = {
  core:'Abdominais',abdominal:'Abdominais',abdominais:'Abdominais',peito:'Peitoral',peitoral:'Peitoral',posterior:'Isquiotibiais',posteriores:'Isquiotibiais','posterior da coxa':'Isquiotibiais','posteriores da coxa':'Isquiotibiais',isquiotibiais:'Isquiotibiais',panturrilha:'Gémeos',panturrilhas:'Gémeos',gemeo:'Gémeos',gemeos:'Gémeos',gluteo:'Glúteos',gluteos:'Glúteos',ombro:'Ombros',ombros:'Ombros',bicep:'Bíceps',biceps:'Bíceps',tricep:'Tríceps',triceps:'Tríceps',trapezio:'Trapézio',trapezios:'Trapézio',quadriceps:'Quadríceps',costas:'Costas',dorsal:'Costas',dorsais:'Costas',antebraco:'Antebraço',adutor:'Adutores',adutores:'Adutores',abdutor:'Abdutores',abdutores:'Abdutores',perna:'Pernas',pernas:'Pernas',lombar:'Lombar',funcional:'Funcional'
};
function groupName(value='') {
  const k=normalise(value);
  if(!k || ['cardio','mobilidade','alongamento','alongamentos','stretching','stretching mobility'].includes(k)) return '';
  return aliases[k] || String(value).trim();
}
function todayIso(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function formatDate(value){if(!value)return '—';try{return new Intl.DateTimeFormat('pt-PT').format(new Date(`${value}T12:00:00`));}catch{return value;}}
function formatKg(value){return new Intl.NumberFormat('pt-PT',{maximumFractionDigits:0}).format(Number(value)||0);}
function defaultReps(value){const match=String(value||'').match(/\d+/);return Math.max(1,Number(match?.[0]||1));}
function calculate(plan, sessionIndex='all') {
  const totals=new Map(); let exerciseCount=0;
  const sessions=(plan?.sessions||[]).filter((_,index)=>sessionIndex==='all'||String(index)===String(sessionIndex));
  for(const session of sessions) for(const block of (session.blocks||[])) for(const item of (block.items||[])) {
    const group=groupName(item.exercise?.group||'');
    const sets=Number(item.sets);
    if(!group || !Number.isFinite(sets) || sets<=0 || !item.exercise) continue;
    totals.set(group,(totals.get(group)||0)+sets); exerciseCount+=1;
  }
  const rows=[...totals.entries()].map(([group,sets])=>({group,sets})).sort((a,b)=>b.sets-a.sets||a.group.localeCompare(b.group,'pt'));
  return {rows,totalSets:rows.reduce((sum,row)=>sum+row.sets,0),groups:rows.length,exerciseCount};
}
async function allVisiblePlans() {
  try { return await fetchWorkoutPlans(); }
  catch (error) { console.warn('Volume de treino indisponível:', error); return []; }
}
async function resolveCurrentStudentId() {
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) return '';
  const {data}=await supabase.from('student_profiles').select('id').eq('profile_id',user.id).maybeSingle();
  return data?.id||'';
}
async function resolveStudentId() {
  const params=new URLSearchParams(location.search);
  if(params.get('aluno')) return params.get('aluno');
  if(location.pathname==='/inicio') return resolveCurrentStudentId();
  return '';
}
async function fetchLoads(studentId){
  if(!studentId) return [];
  const {data,error}=await supabase.from('workout_exercise_loads').select('id,student_id,completion_id,plan_id,session_id,workout_item_id,exercise_id,exercise_name,muscle_group,weight_kg,sets_completed,reps_completed,volume_kg,completed_on,source,created_at,updated_at').eq('student_id',studentId).order('completed_on',{ascending:false}).order('created_at',{ascending:false});
  if(error){
    if(['42P01','PGRST205'].includes(error.code)) return [];
    console.warn('Histórico de cargas indisponível:',error);return [];
  }
  return data||[];
}
function removeExisting(){document.getElementById(ROOT_ID)?.remove();document.getElementById(LOAD_HISTORY_ID)?.remove();document.querySelectorAll(`.${RECORDER_CLASS}`).forEach(node=>node.remove());document.querySelectorAll('.trainingCompleteArea[data-uf-hidden-loads]').forEach(node=>{node.style.display='';delete node.dataset.ufHiddenLoads;});}
function render(plan,{compact=false}={}) {
  const analysis=calculate(plan);
  const max=Math.max(1,...analysis.rows.map(row=>row.sets));
  const rows=compact?analysis.rows.slice(0,7):analysis.rows;
  const sessions=plan.sessions||[];
  return `<section id="${ROOT_ID}" class="trainingVolumeAnalysis card ${compact?'compact':'full'}" data-plan-id="${escapeHtml(plan.id)}">
    <div class="trainingVolumeHeader"><div><span class="eyebrow">ANÁLISE DO PLANO</span><h2>Volume planeado</h2><p>Distribuição das séries diretas${compact?` do plano “${escapeHtml(plan.title)}”`:' pelos grupos musculares principais'}.</p></div><div class="trainingVolumeHeaderIcon">▥</div></div>
    ${!compact&&sessions.length>1?`<div class="trainingVolumeScope"><label>Âmbito<select data-volume-scope><option value="all">Plano completo</option>${sessions.map((s,i)=>`<option value="${i}">${escapeHtml(s.title||`Treino ${i+1}`)}</option>`).join('')}</select></label></div>`:''}
    <div class="trainingVolumeStats"><div><small>SÉRIES DIRETAS</small><b data-volume-total>${analysis.totalSets}</b></div><div><small>GRUPOS</small><b data-volume-groups>${analysis.groups}</b></div>${!compact?`<div><small>EXERCÍCIOS CONTABILIZADOS</small><b data-volume-exercises>${analysis.exerciseCount}</b></div>`:''}</div>
    <div class="trainingVolumeRows" data-volume-rows>${rows.length?rows.map(row=>`<div class="trainingVolumeRow"><b>${escapeHtml(row.group)}</b><div class="trainingVolumeBar"><span style="width:${Math.max(7,row.sets/max*100)}%"></span></div><strong>${row.sets}</strong></div>`).join(''):`<div class="trainingVolumeEmpty"><b>Sem volume muscular calculável</b><span>O plano ainda não tem exercícios da biblioteca com séries prescritas.</span></div>`}</div>
    ${!compact?`<div class="trainingVolumeMethod"><b>Como é calculado?</b><span>Somam-se as séries prescritas de cada exercício ao respetivo grupo muscular principal. Exercícios em texto livre, cardio e alongamentos automáticos não entram neste indicador.</span></div>`:''}
    ${compact&&analysis.rows.length>7?`<small class="trainingVolumeMore">+ ${analysis.rows.length-7} grupo(s) no plano completo</small>`:''}
  </section>`;
}
function refreshScope(root,plan,value){
  const a=calculate(plan,value), max=Math.max(1,...a.rows.map(r=>r.sets));
  root.querySelector('[data-volume-total]').textContent=a.totalSets;
  root.querySelector('[data-volume-groups]').textContent=a.groups;
  const ex=root.querySelector('[data-volume-exercises]'); if(ex) ex.textContent=a.exerciseCount;
  root.querySelector('[data-volume-rows]').innerHTML=a.rows.length?a.rows.map(r=>`<div class="trainingVolumeRow"><b>${escapeHtml(r.group)}</b><div class="trainingVolumeBar"><span style="width:${Math.max(7,r.sets/max*100)}%"></span></div><strong>${r.sets}</strong></div>`).join(''):`<div class="trainingVolumeEmpty"><b>Sem volume muscular calculável</b><span>O plano ainda não tem exercícios da biblioteca com séries prescritas.</span></div>`;
}
function chooseActivePlan(plans,studentId){
  const candidates=plans.filter(plan=>plan.studentId===studentId&&plan.status==='published');
  return candidates.find(plan=>plan.active)||candidates.sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))[0]||null;
}
function latestPreviousLoad(loads,exerciseId){
  const today=todayIso();
  return loads.find(row=>row.exercise_id===exerciseId&&row.completed_on<today)||null;
}
function todayLoad(loads,itemId){return loads.find(row=>row.workout_item_id===itemId&&row.completed_on===todayIso())||null;}
function sessionItems(session){return (session.blocks||[]).flatMap(block=>(block.items||[])).filter(item=>item.id&&item.exercise?.id);}
function recorderHtml(session,loads,editable){
  const items=sessionItems(session);
  if(!items.length) return '';
  const rows=items.map(item=>{
    const previous=latestPreviousLoad(loads,item.exercise.id);
    const current=todayLoad(loads,item.id);
    const weight=current?.weight_kg??'';
    const sets=current?.sets_completed??Math.max(1,Number(item.sets)||1);
    const reps=current?.reps_completed??defaultReps(item.reps);
    return `<div class="trainingLoadRecorderRow" data-load-item="${escapeHtml(item.id)}" data-exercise-id="${escapeHtml(item.exercise.id)}">
      <div class="trainingLoadExercise"><b>${escapeHtml(item.exercise.name)}</b><small>${escapeHtml(groupName(item.exercise.group)||item.exercise.group||'')}</small><span class="trainingLoadPrevious">${previous?`Último treino: <strong>${Number(previous.weight_kg)} kg</strong> · ${previous.sets_completed}×${previous.reps_completed} · ${formatDate(previous.completed_on)}`:'Ainda sem registo anterior'}</span></div>
      ${editable?`<label>Peso usado (kg)<input data-load-weight type="number" inputmode="decimal" min="0" step="0.5" value="${escapeHtml(weight)}" placeholder="Ex.: 40"></label><label>Séries feitas<input data-load-sets type="number" min="1" max="100" value="${sets}"></label><label>Reps feitas<input data-load-reps type="number" min="1" max="1000" value="${reps}"></label>`:`<div class="trainingLoadReadOnly"><small>ÚLTIMO REGISTO</small><b>${previous?`${Number(previous.weight_kg)} kg`:'—'}</b></div>`}
    </div>`;
  }).join('');
  const hasToday=items.some(item=>todayLoad(loads,item.id));
  return `<section class="${RECORDER_CLASS} card" data-session-id="${escapeHtml(session.id||'')}"><div class="trainingLoadRecorderHead"><div><span class="eyebrow">PROGRESSÃO DE CARGA</span><h3>${editable?'Regista as cargas deste treino':'Últimas cargas registadas'}</h3><p>${editable?'Usa o último treino como referência. Podes deixar em branco exercícios sem carga externa.':'Histórico recente do aluno para cada exercício deste treino.'}</p></div><span class="trainingLoadKgBadge">KG</span></div><div class="trainingLoadRecorderRows">${rows}</div>${editable?`<div class="trainingLoadActions"><span data-load-status></span><button type="button" class="primary" data-save-loads>${hasToday?'Atualizar cargas de hoje':'Guardar cargas e concluir treino'}</button></div>`:''}</section>`;
}
async function saveSessionLoads(root,plan,session){
  const button=root.querySelector('[data-save-loads]');const status=root.querySelector('[data-load-status]');
  const rows=[...root.querySelectorAll('[data-load-item]')];
  const loads=rows.map(row=>({workoutItemId:row.dataset.loadItem,weightKg:Number(row.querySelector('[data-load-weight]')?.value||0),setsCompleted:Number(row.querySelector('[data-load-sets]')?.value||1),repsCompleted:Number(row.querySelector('[data-load-reps]')?.value||1)})).filter(item=>item.weightKg>0);
  button.disabled=true;status.textContent='A guardar…';
  const {error}=await supabase.rpc('record_workout_session_with_loads',{target_student_id:plan.studentId,target_plan_id:plan.id,target_session_id:session.id||null,target_completed_on:todayIso(),requested_source:'student',target_notes:null,target_loads:loads});
  if(error){status.textContent=error.code==='PGRST202'||error.code==='42883'?'É necessário aplicar a atualização da base de dados.':(error.message||'Não foi possível guardar.');button.disabled=false;return;}
  status.textContent=loads.length?`Treino concluído · ${loads.length} carga(s) guardada(s).`:'Treino concluído.';button.textContent='Cargas guardadas';
  window.setTimeout(()=>{lastKey='';schedule();},650);
}
function mountRecorders(plan,loads,editable){
  const sessionNodes=[...document.querySelectorAll('.trainingSessionView')];
  (plan.sessions||[]).forEach((session,index)=>{
    const host=sessionNodes[index];if(!host)return;
    const blocks=host.querySelector('.trainingBlocksView');if(!blocks)return;
    blocks.insertAdjacentHTML('afterend',recorderHtml(session,loads,editable));
    const recorder=blocks.nextElementSibling;
    if(editable){
      const complete=host.querySelector('.trainingCompleteArea');if(complete){complete.style.display='none';complete.dataset.ufHiddenLoads='true';}
      recorder?.querySelector('[data-save-loads]')?.addEventListener('click',()=>saveSessionLoads(recorder,plan,session));
    }
  });
}
const lowerGroups=[['Glúteos','Glúteos'],['Isquiotibiais','Isquiotibiais'],['Quadríceps','Quadríceps'],['Adutores','Adutores'],['Abdutores','Abdutores'],['Gémeos','Gémeos']];
const upperGroups=[['Ombros','Ombros'],['Peitoral','Peito'],['Tríceps','Tríceps'],['Bíceps','Bíceps'],['Costas','Dorsal']];
function monthWindow(offset){const now=new Date();const start=new Date(now.getFullYear(),now.getMonth()+offset,1);const end=new Date(start.getFullYear(),start.getMonth()+1,1);const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;return {start,end,startIso:iso(start),endIso:iso(end),label:new Intl.DateTimeFormat('pt-PT',{month:'long',year:'numeric'}).format(start).replace(/^./,c=>c.toUpperCase())};}
function groupVolumes(loads,window){const totals=new Map();for(const row of loads){if(row.completed_on<window.startIso||row.completed_on>=window.endIso)continue;const group=groupName(row.muscle_group||'');if(!group)continue;totals.set(group,(totals.get(group)||0)+Number(row.volume_kg||0));}return totals;}
function categoryHtml(title,groups,totals,max){const subtotal=groups.reduce((sum,[key])=>sum+(totals.get(key)||0),0);return `<div class="trainingLoadCategory"><div class="trainingLoadCategoryHead"><h3>${title}</h3><strong>${formatKg(subtotal)} kg</strong></div>${groups.map(([key,label])=>{const value=totals.get(key)||0;return `<div class="trainingLoadHistoryRow"><b>${label}</b><div class="trainingLoadHistoryBar"><span style="width:${value?Math.max(5,value/max*100):0}%"></span></div><strong>${formatKg(value)} kg</strong></div>`;}).join('')}</div>`;}
function renderLoadHistory(loads){const window=monthWindow(historyMonthOffset);const totals=groupVolumes(loads,window);const requestedKeys=new Set([...lowerGroups,...upperGroups].map(([key])=>key));const total=[...totals.entries()].filter(([key])=>requestedKeys.has(key)).reduce((sum,[,v])=>sum+v,0);const max=Math.max(1,...[...totals.values()]);return `<section id="${LOAD_HISTORY_ID}" class="trainingLoadHistory card"><div class="trainingLoadHistoryHead"><div><span class="eyebrow">HISTÓRICO DE CARGA</span><h2>Volume levantado por mês</h2><p>Soma da carga externa registada: peso × séries realizadas × repetições realizadas.</p></div><div class="trainingLoadMonthlyTotal"><small>TOTAL DO MÊS</small><b>${formatKg(total)} kg</b></div></div><div class="trainingLoadMonthNav"><button type="button" data-load-month-prev>‹</button><b>${window.label}</b><button type="button" data-load-month-next ${historyMonthOffset>=0?'disabled':''}>›</button></div><div class="trainingLoadGroups">${categoryHtml('Membros inferiores',lowerGroups,totals,max)}${categoryHtml('Membros superiores',upperGroups,totals,max)}</div>${total===0?'<div class="trainingLoadHistoryEmpty">Ainda não existem cargas registadas neste mês.</div>':''}</section>`;}
function mountLoadHistory(anchor,loads){document.getElementById(LOAD_HISTORY_ID)?.remove();anchor.insertAdjacentHTML('afterend',renderLoadHistory(loads));const root=document.getElementById(LOAD_HISTORY_ID);root?.querySelector('[data-load-month-prev]')?.addEventListener('click',()=>{historyMonthOffset-=1;mountLoadHistory(anchor,loads);});root?.querySelector('[data-load-month-next]')?.addEventListener('click',()=>{if(historyMonthOffset<0){historyMonthOffset+=1;mountLoadHistory(anchor,loads);}});}
async function update() {
  if(busy) return;
  const params=new URLSearchParams(location.search);
  const planId=params.get('plano')||'';
  const isPlan=/\/(treino|planos-de-treino|planos)(\/|$)/.test(location.pathname)&&Boolean(planId);
  const isStudentArea=location.pathname==='/inicio'||location.pathname==='/alunos';
  if(!isPlan&&!isStudentArea){removeExisting();lastKey='';return;}
  busy=true;
  try {
    const plans=await allVisiblePlans();
    let plan=null,anchor=null,compact=false,key='',studentId='';
    if(isPlan){plan=plans.find(item=>item.id===planId)||null;studentId=plan?.studentId||'';anchor=document.querySelector('.trainingPlanHero');compact=false;key=`plan:${planId}:${plan?.updatedAt||''}`;}
    else {studentId=await resolveStudentId();if(!studentId){removeExisting();lastKey='';return;}plan=chooseActivePlan(plans,studentId);anchor=document.querySelector('.profileHub')||document.querySelector('.trainingActivityCalendar')||document.querySelector('.studentSelfHero')||document.querySelector('.studentProfileHero');compact=true;key=`student:${studentId}:${plan?.id||'none'}:${plan?.updatedAt||''}`;}
    if(!studentId||!anchor){removeExisting();lastKey='';return;}
    const loads=await fetchLoads(studentId);
    const existing=document.getElementById(ROOT_ID);
    if(plan&&(!existing||lastKey!==key)){removeExisting();anchor.insertAdjacentHTML('afterend',render(plan,{compact}));const root=document.getElementById(ROOT_ID);const select=root?.querySelector('[data-volume-scope]');if(select)select.addEventListener('change',()=>refreshScope(root,plan,select.value));}
    if(isPlan&&plan){const currentStudent=await resolveCurrentStudentId();mountRecorders(plan,loads,currentStudent===studentId);}
    if(isStudentArea){const volumeAnchor=document.getElementById(ROOT_ID)||anchor;mountLoadHistory(volumeAnchor,loads);}
    lastKey=key;
  } finally {busy=false;}
}
function schedule(){window.clearTimeout(schedule.t);schedule.t=window.setTimeout(update,180)}
export function startTrainingVolumeEnhancer(){
  if(window.__ufTrainingVolumeEnhancer) return;
  window.__ufTrainingVolumeEnhancer=true;
  const notify=()=>{lastKey='';historyMonthOffset=0;schedule()};
  for(const method of ['pushState','replaceState']){const original=history[method];history[method]=function(...args){const result=original.apply(this,args);notify();return result;};}
  window.addEventListener('popstate',notify);window.addEventListener('focus',schedule);document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});schedule();
}
