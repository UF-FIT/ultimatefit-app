import { supabase } from './supabase';
import { fetchWorkoutPlans } from './training';

const ID='uf-load-analytics';
let mode='muscle',offset=0,busy=false,timer;
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kg=v=>new Intl.NumberFormat('pt-PT',{maximumFractionDigits:0}).format(Math.round(Number(v)||0));
const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const dt=v=>{const [y,m,d]=String(v||'').split('-').map(Number);return new Date(y,m-1,d,12)};
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const aliases={gluteo:'Glúteos',gluteos:'Glúteos',posterior:'Isquiotibiais',posteriores:'Isquiotibiais',isquiotibiais:'Isquiotibiais',quadriceps:'Quadríceps',adutor:'Adutores',adutores:'Adutores',abdutor:'Abdutores',abdutores:'Abdutores',panturrilha:'Gémeos',panturrilhas:'Gémeos',gemeo:'Gémeos',gemeos:'Gémeos',ombro:'Ombros',ombros:'Ombros',peito:'Peito',peitoral:'Peito',tricep:'Tríceps',triceps:'Tríceps',bicep:'Bíceps',biceps:'Bíceps',costas:'Costas',dorsal:'Costas',dorsais:'Costas',antebraco:'Antebraço',lombar:'Lombar',abdominais:'Abdominais',core:'Abdominais'};
const group=v=>aliases[norm(v)]||String(v||'Outro');

function month(){
  const n=new Date(),a=new Date(n.getFullYear(),n.getMonth()+offset,1,12),b=new Date(a.getFullYear(),a.getMonth()+1,1,12);
  return{a,b,ai:iso(a),bi:iso(b),label:new Intl.DateTimeFormat('pt-PT',{month:'long',year:'numeric'}).format(a).replace(/^./,c=>c.toUpperCase())};
}
function weeks(w){
  let c=new Date(w.a),d=c.getDay();
  c.setDate(c.getDate()-(d===0?6:d-1));
  const out=[];
  while(c<w.b){const z=new Date(c);z.setDate(z.getDate()+6);out.push({a:new Date(c),b:z,label:`Sem. ${out.length+1}`});c=new Date(c);c.setDate(c.getDate()+7)}
  return out;
}
function wix(v,ws){const d=dt(v);return ws.findIndex(w=>d>=w.a&&d<=new Date(w.b.getFullYear(),w.b.getMonth(),w.b.getDate(),23,59,59))}
async function target(){
  const p=new URLSearchParams(location.search);
  if(p.get('aluno'))return p.get('aluno');
  if(location.pathname==='/inicio'){
    const {data:{user}}=await supabase.auth.getUser();if(!user)return'';
    const {data}=await supabase.from('student_profiles').select('id').eq('profile_id',user.id).maybeSingle();
    return data?.id||'';
  }
  if(p.get('plano')){try{return (await fetchWorkoutPlans()).find(x=>x.id===p.get('plano'))?.studentId||''}catch{return''}}
  return'';
}
async function fetchRows(id){
  const {data,error}=await supabase.from('workout_exercise_loads').select('exercise_name,muscle_group,weight_kg,volume_kg,completed_on').eq('student_id',id).order('completed_on');
  return error?[]:(data||[]);
}
function aggregate(data,ws,w){
  const m=new Map();
  data.filter(x=>x.completed_on>=w.ai&&x.completed_on<w.bi).forEach(x=>{
    const k=mode==='exercise'?(x.exercise_name||'Exercício'):group(x.muscle_group);
    if(!m.has(k))m.set(k,{name:k,v:Array(ws.length).fill(0),last:null,count:0});
    const r=m.get(k),i=wix(x.completed_on,ws);
    if(i>=0)r.v[i]+=Number(x.volume_kg||0);
    if(x.weight_kg!=null)r.last=Number(x.weight_kg);
    r.count++;
  });
  return[...m.values()].map(r=>({...r,total:r.v.reduce((a,b)=>a+b,0)})).sort((a,b)=>b.total-a.total);
}
function signature(data,id){
  return JSON.stringify({path:location.pathname,search:location.search,id,mode,offset,rows:data.map(x=>[x.exercise_name,x.muscle_group,x.weight_kg,x.volume_kg,x.completed_on])});
}
function syncPlanReady(){
  const viewer=document.querySelector('.trainingViewer');
  if(!viewer)return;
  const volumeHeader=document.querySelector('#uf-training-volume-analysis > .trainingVolumeHeader[aria-expanded]');
  const loadHeader=document.querySelector('#uf-load-analytics > .ufah[aria-expanded]');
  const sessions=[...viewer.querySelectorAll('.trainingSessionView')];
  const sessionsReady=sessions.length>0&&sessions.every(session=>session.querySelector(':scope > .trainingSessionTitle[aria-expanded]'));
  if(volumeHeader&&loadHeader&&sessionsReady)viewer.classList.add('ufAllPlanSectionsReady');
}
function css(){
  if(document.getElementById(ID+'s'))return;
  const s=document.createElement('style');s.id=ID+'s';s.textContent=`#${ID}{margin:18px 0;padding:18px}.ufah{display:flex;justify-content:space-between;gap:12px}.ufah h2{margin:3px 0}.ufah p{margin:0;color:#888;font-size:12px}.ufac{display:flex;justify-content:space-between;gap:10px;margin:14px 0;flex-wrap:wrap}.ufat{display:flex;border:1px solid #29292d;border-radius:8px;overflow:hidden}.ufat button{border:0;padding:10px 22px;background:#101012;color:#888;font-weight:800}.ufat .active{background:rgba(255,217,8,.12);color:var(--y)}.ufam{display:flex;align-items:center;gap:8px}.ufam button{width:34px;height:34px;border:1px solid #29292d;border-radius:7px;background:#0b0b0d;color:#fff}.ufas{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.ufas div{padding:10px;border:1px solid #242428;border-radius:8px;background:#0a0a0c}.ufas small,.ufas b{display:block}.ufas small{font-size:8px;color:#777}.ufas b{font-size:17px;margin-top:3px}.ufag{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:8px;height:130px;margin:14px 0;padding:10px;border:1px solid #242428;border-radius:9px}.ufab{display:grid;grid-template-rows:18px 78px 18px;text-align:center;font-size:9px;color:#888}.ufab i{align-self:end;justify-self:center;width:55%;min-height:3px;background:linear-gradient(#fff1a0,var(--y));border-radius:5px 5px 0 0}.ufab b{color:#ddd;font-size:9px}.ufaw{overflow:auto;border:1px solid #242428;border-radius:9px}.ufatable{width:100%;border-collapse:collapse;min-width:680px}.ufatable th,.ufatable td{padding:10px;border-bottom:1px solid #202024;text-align:right}.ufatable th:first-child,.ufatable td:first-child{text-align:left}.ufatable th{font-size:8px;color:#777}.ufatable td{font-size:11px}.ufatotal{color:var(--y);font-weight:900}.ufan{margin-top:10px;padding:9px;border-left:2px solid var(--y);background:rgba(255,217,8,.04);color:#888;font-size:10px}@media(max-width:700px){#${ID}{padding:14px}.ufac{display:grid}.ufat{width:100%}.ufat button{flex:1}.ufas{grid-template-columns:1fr 1fr}.ufas div:last-child{grid-column:1/-1}.ufag{overflow:auto;grid-template-columns:repeat(var(--n),72px)}}`;
  document.head.appendChild(s);
}
function render(data){
  const w=month(),ws=weeks(w),m=data.filter(x=>x.completed_on>=w.ai&&x.completed_on<w.bi),weekly=ws.map((_,i)=>m.reduce((a,x)=>wix(x.completed_on,ws)===i?a+Number(x.volume_kg||0):a,0)),max=Math.max(1,...weekly),rows=aggregate(data,ws,w),total=weekly.reduce((a,b)=>a+b,0),days=new Set(m.map(x=>x.completed_on)).size,weighted=m.filter(x=>Number(x.weight_kg)>0).length;
  return`<section id="${ID}" class="card"><div class="ufah"><div><span class="eyebrow">EVOLUÇÃO DE CARGA</span><h2>Volume realizado</h2><p>Comparação semanal dos kg movimentados nos exercícios concluídos.</p></div><b>KG</b></div><div class="ufac"><div class="ufat"><button data-m="muscle" class="${mode==='muscle'?'active':''}">Por músculo</button><button data-m="exercise" class="${mode==='exercise'?'active':''}">Por exercício</button></div><div class="ufam"><button data-prev>‹</button><b>${e(w.label)}</b><button data-next ${offset>=0?'disabled':''}>›</button></div></div><div class="ufas"><div><small>VOLUME NO MÊS</small><b>${kg(total)} kg</b></div><div><small>EXERCÍCIOS COM CARGA</small><b>${weighted}</b></div><div><small>DIAS COM REGISTO</small><b>${days}</b></div></div>${m.length?`<div class="ufag" style="--n:${ws.length}">${ws.map((x,i)=>`<div class="ufab"><b>${kg(weekly[i])} kg</b><i style="height:${weekly[i]?Math.max(5,weekly[i]/max*100):0}%"></i><span>${x.label}</span></div>`).join('')}</div><div class="ufaw"><table class="ufatable"><thead><tr><th>${mode==='muscle'?'Grupo muscular':'Exercício'}</th>${ws.map(x=>`<th>${x.label}</th>`).join('')}<th>Total</th></tr></thead><tbody>${rows.map(x=>`<tr><td><b>${e(x.name)}</b>${mode==='exercise'&&x.last!=null?`<small> · última carga ${x.last} kg</small>`:''}</td>${x.v.map(v=>`<td>${kg(v)} kg</td>`).join('')}<td class="ufatotal">${kg(x.total)} kg</td></tr>`).join('')}</tbody></table></div>`:`<div class="ufan">Ainda não existem registos neste mês.</div>`}<div class="ufan"><b>Cálculo:</b> carga externa × séries × repetições. “Sem carga” fica registado, mas soma 0 kg.</div></section>`;
}
function anchor(){return document.getElementById('uf-training-volume-analysis')||document.querySelector('.trainingActivityCalendar')||document.querySelector('.profileHub')||document.querySelector('.trainingPlanHero')}
function bind(){
  const r=document.getElementById(ID);if(!r)return;
  r.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{if(mode===b.dataset.m)return;mode=b.dataset.m;update(true)});
  r.querySelector('[data-prev]')?.addEventListener('click',()=>{offset--;update(true)});
  r.querySelector('[data-next]')?.addEventListener('click',()=>{if(offset<0){offset++;update(true)}});
}
async function update(force=false){
  if(busy)return;busy=true;
  try{
    css();
    const id=await target(),a=anchor();
    if(!id||!a){document.getElementById(ID)?.remove();return}
    const data=await fetchRows(id),sig=signature(data,id),existing=document.getElementById(ID);
    if(!force&&existing?.dataset.ufSignature===sig){syncPlanReady();return;}
    existing?.remove();
    a.insertAdjacentHTML('afterend',render(data));
    const root=document.getElementById(ID);if(root)root.dataset.ufSignature=sig;
    bind();
    window.setTimeout(syncPlanReady,120);
  }finally{busy=false}
}
function schedule(){clearTimeout(timer);timer=setTimeout(()=>update(false),350)}
export function startTrainingLoadAnalytics(){
  if(window.__ufLoadAnalytics)return;
  window.__ufLoadAnalytics=true;
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('focus',schedule);
  window.addEventListener('popstate',()=>update(true));
  window.addEventListener('uf:exercise-load-saved',()=>update(true));
  schedule();
}
