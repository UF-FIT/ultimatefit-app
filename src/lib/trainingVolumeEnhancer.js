import { supabase } from './supabase';
import { fetchWorkoutPlans } from './training';
import '../styles/training-volume-analysis.css';

const ROOT_ID = 'uf-training-volume-analysis';
let lastKey = '';
let busy = false;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}
function normalise(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/&/g,' ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}
const aliases = {
  core:'Abdominais',abdominal:'Abdominais',abdominais:'Abdominais',peito:'Peitoral',peitoral:'Peitoral',posterior:'Isquiotibiais',posteriores:'Isquiotibiais','posterior da coxa':'Isquiotibiais','posteriores da coxa':'Isquiotibiais',isquiotibiais:'Isquiotibiais',panturrilha:'Gémeos',panturrilhas:'Gémeos',gemeo:'Gémeos',gemeos:'Gémeos',gluteo:'Glúteos',gluteos:'Glúteos',ombro:'Ombros',ombros:'Ombros',bicep:'Bíceps',biceps:'Bíceps',tricep:'Tríceps',triceps:'Tríceps',trapezio:'Trapézio',trapezios:'Trapézio',quadriceps:'Quadríceps',costas:'Costas',antebraco:'Antebraço',adutor:'Adutores',adutores:'Adutores',abdutor:'Abdutores',abdutores:'Abdutores',perna:'Pernas',pernas:'Pernas',lombar:'Lombar',funcional:'Funcional'
};
function groupName(value='') {
  const k=normalise(value);
  if(!k || ['cardio','mobilidade','alongamento','alongamentos','stretching','stretching mobility'].includes(k)) return '';
  return aliases[k] || String(value).trim();
}
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

async function resolveStudentId() {
  const params=new URLSearchParams(location.search);
  if(params.get('aluno')) return params.get('aluno');
  if(location.pathname==='/inicio') {
    const {data:{user}}=await supabase.auth.getUser();
    if(!user) return '';
    const {data}=await supabase.from('student_profiles').select('id').eq('profile_id',user.id).maybeSingle();
    return data?.id||'';
  }
  return '';
}
function removeExisting(){document.getElementById(ROOT_ID)?.remove();}
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
    let plan=null,anchor=null,compact=false,key='';
    if(isPlan){
      plan=plans.find(item=>item.id===planId)||null;
      anchor=document.querySelector('.trainingPlanHero');
      compact=false;key=`plan:${planId}:${plan?.updatedAt||''}`;
    } else {
      const studentId=await resolveStudentId();
      if(!studentId){removeExisting();lastKey='';return;}
      plan=chooseActivePlan(plans,studentId);
      anchor=document.querySelector('.profileHub')||document.querySelector('.trainingActivityCalendar')||document.querySelector('.studentSelfHero')||document.querySelector('.studentProfileHero');
      compact=true;key=`student:${studentId}:${plan?.id||'none'}:${plan?.updatedAt||''}`;
    }
    if(!plan||!anchor){removeExisting();lastKey='';return;}
    const existing=document.getElementById(ROOT_ID);
    if(existing&&lastKey===key)return;
    removeExisting(); anchor.insertAdjacentHTML('afterend',render(plan,{compact})); lastKey=key;
    const root=document.getElementById(ROOT_ID); const select=root?.querySelector('[data-volume-scope]');
    if(select) select.addEventListener('change',()=>refreshScope(root,plan,select.value));
  } finally {busy=false;}
}
function schedule(){window.clearTimeout(schedule.t);schedule.t=window.setTimeout(update,160)}
export function startTrainingVolumeEnhancer(){
  if(window.__ufTrainingVolumeEnhancer) return;
  window.__ufTrainingVolumeEnhancer=true;
  const notify=()=>{lastKey='';schedule()};
  for(const method of ['pushState','replaceState']){const original=history[method];history[method]=function(...args){const result=original.apply(this,args);notify();return result;};}
  window.addEventListener('popstate',notify);window.addEventListener('focus',schedule);document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});schedule();
}
