import { supabase } from './supabase';
import { fetchWorkoutPlans } from './training';

const STYLE_ID='uf-inline-load-style';
let timer=null;
let busy=false;
let activeKey='';

function todayIso(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function parseNumber(value=''){const m=String(value).replace(',','.').match(/\d+(?:\.\d+)?/);return m?Number(m[0]):null;}
function repsFromPrescription(value=''){const m=String(value||'').match(/\d+/);return Math.max(1,Number(m?.[0]||1));}
function fmtKg(value){return value==null||value===''?'—':`${new Intl.NumberFormat('pt-PT',{maximumFractionDigits:1}).format(Number(value))} kg`;}

function ensureStyle(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');style.id=STYLE_ID;style.textContent=`
  .ufInlineLoad{margin-left:auto;display:grid;grid-template-columns:repeat(3,minmax(92px,112px));gap:8px;align-items:stretch;position:relative;z-index:3}
  .ufInlineLoadCell{min-height:50px;padding:7px 9px;border:1px solid #29292d;border-radius:8px;background:#0a0a0c;display:grid;gap:3px;align-content:center;text-align:left}
  .ufInlineLoadCell small{font-size:8px;line-height:1;color:#73737a;font-weight:800;letter-spacing:.045em;text-transform:uppercase}.ufInlineLoadCell b{font-size:13px;line-height:1.2;color:#fff}.ufInlineLoadCell.previous{border-color:rgba(90,155,255,.35);background:rgba(40,90,180,.08)}.ufInlineLoadCell.current{border-color:rgba(255,90,90,.38);background:rgba(160,35,35,.08)}
  .ufInlineLoadCell input{width:100%;height:27px;min-width:0;border:0;border-bottom:1px solid rgba(255,255,255,.18);border-radius:0;background:transparent;padding:0 2px;color:#fff;font-size:14px;font-weight:800;outline:none}.ufInlineLoadCell input:focus{border-bottom-color:var(--y)}.ufInlineLoadCell .unit{font-size:10px;color:#8b8b91;margin-left:3px}
  .trainingExerciseView{gap:12px}.trainingExerciseView>.trainingExerciseCopy{min-width:0;flex:1}
  .ufInlineLoadHint{display:none}
  @media(max-width:900px){.ufInlineLoad{grid-template-columns:repeat(3,minmax(78px,1fr));width:100%;margin:10px 0 0;grid-column:1/-1}.trainingExerciseView{flex-wrap:wrap}.ufInlineLoadCell{min-height:46px}}
  @media(max-width:560px){.ufInlineLoad{gap:5px}.ufInlineLoadCell{padding:6px}.ufInlineLoadCell small{font-size:7px}.ufInlineLoadCell b,.ufInlineLoadCell input{font-size:12px}}
  `;document.head.appendChild(style);
}

async function currentStudentId(){const {data:{user}}=await supabase.auth.getUser();if(!user)return '';const {data}=await supabase.from('student_profiles').select('id').eq('profile_id',user.id).maybeSingle();return data?.id||'';}
async function fetchLoads(studentId){const {data,error}=await supabase.from('workout_exercise_loads').select('workout_item_id,exercise_id,weight_kg,completed_on,created_at').eq('student_id',studentId).order('completed_on',{ascending:false}).order('created_at',{ascending:false});if(error){console.warn('Histórico de carga indisponível',error);return [];}return data||[];}
function previousFor(loads,exerciseId){const today=todayIso();return loads.find(r=>r.exercise_id===exerciseId&&r.completed_on<today)||null;}
function todayFor(loads,itemId){return loads.find(r=>r.workout_item_id===itemId&&r.completed_on===todayIso())||null;}
function planItems(plan){return (plan.sessions||[]).flatMap(session=>(session.blocks||[]).flatMap(block=>(block.items||[]).map(item=>({item,session}))));}

function stopInteractive(event){event.stopPropagation();}
function mountRow(node,item,loads,editable){
  if(!node||!item?.exercise?.id)return;
  node.querySelector('.ufInlineLoad')?.remove();
  const previous=previousFor(loads,item.exercise.id);const current=todayFor(loads,item.id);const suggested=parseNumber(item.loadText);
  const wrap=document.createElement('div');wrap.className='ufInlineLoad';wrap.dataset.itemId=item.id;wrap.dataset.exerciseId=item.exercise.id;wrap.dataset.sets=String(Math.max(1,Number(item.sets)||1));wrap.dataset.reps=String(repsFromPrescription(item.reps));
  wrap.innerHTML=`<div class="ufInlineLoadCell suggested"><small>Sugerido</small><b>${fmtKg(suggested)}</b></div><div class="ufInlineLoadCell previous"><small>Último</small><b>${fmtKg(previous?.weight_kg)}</b></div><label class="ufInlineLoadCell current"><small>Hoje</small>${editable?`<span><input data-today-load type="number" inputmode="decimal" min="0" step="0.5" value="${current?.weight_kg??''}" placeholder="—"><span class="unit">kg</span></span>`:`<b>—</b>`}</label>`;
  ['click','pointerdown','mousedown','mouseup','keydown'].forEach(type=>wrap.addEventListener(type,stopInteractive));
  node.appendChild(wrap);
}

function renameEditorLoadField(){document.querySelectorAll('.trainingEditor .trainingPrescriptionGrid label').forEach(label=>{const text=(label.childNodes[0]?.nodeValue||'').trim();if(text==='Carga'){label.childNodes[0].nodeValue='Peso sugerido (kg)';const input=label.querySelector('input');if(input)input.placeholder='Ex.: 20';}});}

async function saveSession(plan,session,container,button){
  const fields=[...container.querySelectorAll('.ufInlineLoad[data-item-id]')];
  const loads=fields.map(root=>({workoutItemId:root.dataset.itemId,weightKg:Number(root.querySelector('[data-today-load]')?.value||0),setsCompleted:Number(root.dataset.sets||1),repsCompleted:Number(root.dataset.reps||1)})).filter(x=>x.weightKg>0);
  const oldText=button.textContent;button.disabled=true;button.textContent='A guardar…';
  const {error}=await supabase.rpc('record_workout_session_with_loads',{target_student_id:plan.studentId,target_plan_id:plan.id,target_session_id:session.id||null,target_completed_on:todayIso(),requested_source:'student',target_notes:null,target_loads:loads});
  if(error){button.disabled=false;button.textContent=oldText;window.alert(error.message||'Não foi possível registar o treino.');return;}
  button.textContent='Treino registado';window.setTimeout(()=>window.location.reload(),500);
}

function bindComplete(plan){
  const sessions=[...document.querySelectorAll('.trainingSessionView')];
  (plan.sessions||[]).forEach((session,index)=>{const container=sessions[index];const button=container?.querySelector('.completeWorkoutButton');if(!button||button.dataset.ufLoadsBound||button.disabled)return;button.dataset.ufLoadsBound='1';button.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();saveSession(plan,session,container,button);},true);});
}

async function update(){
  if(busy)return;busy=true;
  try{
    ensureStyle();renameEditorLoadField();
    const planId=new URLSearchParams(location.search).get('plano')||'';
    if(!planId||!document.querySelector('.trainingViewer')){activeKey='';document.querySelectorAll('.ufInlineLoad').forEach(n=>n.remove());return;}
    const plans=await fetchWorkoutPlans();const plan=plans.find(p=>p.id===planId);if(!plan)return;
    const studentId=await currentStudentId();const editable=Boolean(studentId&&studentId===plan.studentId);
    const loads=studentId?await fetchLoads(plan.studentId):[];
    const rows=[...document.querySelectorAll('.trainingExerciseView')];const items=planItems(plan).map(x=>x.item);
    const key=`${plan.id}:${plan.updatedAt||''}:${loads[0]?.created_at||''}:${editable}`;
    if(activeKey!==key||rows.some(row=>!row.querySelector('.ufInlineLoad'))){rows.forEach((row,index)=>mountRow(row,items[index],loads,editable));activeKey=key;}
    if(editable)bindComplete(plan);
  }finally{busy=false;}
}
function schedule(){clearTimeout(timer);timer=setTimeout(update,180);}
export function startTrainingLoadInlineEnhancer(){if(window.__ufInlineLoads)return;window.__ufInlineLoads=true;new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('popstate',schedule);window.addEventListener('focus',schedule);document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});schedule();}
