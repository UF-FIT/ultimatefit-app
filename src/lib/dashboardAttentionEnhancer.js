import { supabase } from './supabase';
import { fetchStudents } from './students';
import { fetchAssessments } from './assessments';

const DAY_MS=86400000;
let running=false;
let lastKey='';
let observer=null;

function dateOnly(value){
 if(!value)return null;
 const raw=String(value);
 const date=new Date(raw.includes('T')?raw:`${raw}T12:00:00`);
 return Number.isNaN(date.getTime())?null:date;
}
function daysSince(value){
 const d=dateOnly(value);if(!d)return null;
 const now=new Date();
 const a=new Date(d.getFullYear(),d.getMonth(),d.getDate(),12);
 const b=new Date(now.getFullYear(),now.getMonth(),now.getDate(),12);
 return Math.max(0,Math.floor((b-a)/DAY_MS));
}
function escapeHtml(value=''){return String(value).replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));}
function scopeKey(id){return `ultimatefit-student-scope:${id}`;}
function currentScope(profile){
 if(!['owner','admin'].includes(profile.role))return 'assigned';
 try{return localStorage.getItem(scopeKey(profile.id))==='all'?'all':'assigned';}catch{return 'assigned';}
}
function currentPath(){return window.location.pathname.replace(/\/$/,'')||'/';}
function isDashboardPath(path=currentPath()){return path==='/'||path==='/dashboard';}
function maskDashboard(){
 if(!isDashboardPath())return;
 document.querySelector('.content')?.classList.add('uf-dashboard-assembling');
}
function revealDashboard(){document.querySelector('.content')?.classList.remove('uf-dashboard-assembling');}
async function currentProfile(){
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return null;
 const {data,error}=await supabase.from('profiles').select('id,role,full_name').eq('id',user.id).maybeSingle();
 if(error)return null;
 return data;
}
function isActiveStudent(s){return Boolean(s&&s.active&&s.status==='active'&&!s.deletedAt&&!s.archivedAt);}
async function loadAttentionData(profile){
 const [students,assessments,createdResult]=await Promise.all([
  fetchStudents(),
  fetchAssessments(),
  supabase.from('student_profiles').select('id,created_at').is('deleted_at',null),
 ]);
 const createdById=new Map((createdResult.data||[]).map(row=>[row.id,row.created_at]));
 const active=(students||[]).filter(isActiveStudent);
 const assigned=active.filter(s=>(s.trainerIds||[]).includes(profile.id));
 const scope=currentScope(profile);
 const visible=['owner','admin'].includes(profile.role)&&scope==='all'?active:assigned;
 const visibleIds=new Set(visible.map(s=>s.id));
 const relevantAssessments=(assessments||[]).filter(a=>visibleIds.has(a.studentId)&&['published','archived'].includes(a.status));
 const now=new Date();
 const alerts=[];
 for(const student of visible){
  const rows=relevantAssessments.filter(a=>a.studentId===student.id).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  const latest=rows[0];
  if(!latest){
   const created=createdById.get(student.id)||student.startDate;
   const age=daysSince(created);
   if(age!=null&&age>=8)alerts.push({student,type:'initial',tone:'red',label:'Sem avaliação inicial',days:age,detail:`Sem avaliação inicial · aluno criado há ${age} dias`});
   continue;
  }
  const days=daysSince(latest.date);
  if(days==null||days<45)continue;
  if(days>=90)alerts.push({student,type:'overdue',tone:'red',label:'Avaliação em atraso',days,detail:`Última avaliação há ${days} dias`});
  else if(days>=60)alerts.push({student,type:'recommended',tone:'orange',label:'Avaliação recomendada',days,detail:`Última avaliação há ${days} dias`});
  else alerts.push({student,type:'soon',tone:'yellow',label:'Avaliação em breve',days,detail:`Última avaliação há ${days} dias`});
 }
 const priority={initial:4,overdue:3,recommended:2,soon:1};
 alerts.sort((a,b)=>(priority[b.type]-priority[a.type])||(b.days-a.days)||a.student.name.localeCompare(b.student.name));
 const birthdays=visible.filter(s=>s.birth&&dateOnly(s.birth)?.getMonth()===now.getMonth()).map(student=>{
  const d=dateOnly(student.birth);return {student,day:d.getDate(),turningAge:now.getFullYear()-d.getFullYear(),today:d.getDate()===now.getDate()};
 }).sort((a,b)=>a.day-b.day||a.student.name.localeCompare(b.student.name));
 return {alerts,birthdays,scope,assignedCount:assigned.length,allCount:active.length,visibleCount:visible.length};
}
function summary(alerts){return {initial:alerts.filter(x=>x.type==='initial').length,overdue:alerts.filter(x=>x.type==='overdue').length,recommended:alerts.filter(x=>x.type==='recommended').length,soon:alerts.filter(x=>x.type==='soon').length,total:alerts.length};}
function avatar(student){const initials=(student.name||'AL').split(' ').map(x=>x[0]).slice(0,2).join('');return student.thumbUrl||student.photoUrl?`<img src="${escapeHtml(student.thumbUrl||student.photoUrl)}" alt="">`:escapeHtml(initials);}
function dashboardHtml(data){
 const s=summary(data.alerts);const month=new Intl.DateTimeFormat('pt-PT',{month:'long'}).format(new Date());
 const line=(tone,count,label)=>count?`<div class="uf-attention-summary ${tone}"><i></i><b>${count}</b><span>${label}</span></div>`:'';
 const birthdayRows=data.birthdays.length?data.birthdays.map(x=>`<div class="uf-birthday-row ${x.today?'today':''}"><div class="uf-attention-avatar">${avatar(x.student)}</div><div><b>${escapeHtml(x.student.name)}</b><span>${x.today?'🎉 Faz anos hoje':`${String(x.day).padStart(2,'0')} · faz ${x.turningAge} anos`}</span></div>${x.today?'<em>HOJE</em>':''}</div>`).join(''):'<div class="uf-attention-empty">Nenhum aluno faz anos este mês.</div>';
 return `<div class="uf-dashboard-attention-grid">
  <section class="uf-attention-card ${s.total?'has-alerts':'all-clear'}"><div class="uf-attention-head"><div><small>ACOMPANHAMENTO</small><h2>AVALIAÇÕES PENDENTES — ${s.total}</h2></div><span>!</span></div>${s.total?`<div class="uf-attention-summaries">${line('red',s.initial,'Sem avaliação inicial')}${line('red',s.overdue,'Avaliação em atraso (+90 dias)')}${line('orange',s.recommended,'Avaliações recomendadas (+60 dias)')}${line('yellow',s.soon,'Avaliação em breve (+45 dias)')}</div>`:'<div class="uf-attention-empty">Nenhum aluno necessita de avaliação neste momento.</div>'}<button ${s.total?'':'disabled'} data-uf-open-pending>Ver avaliações pendentes <span>›</span></button></section>
  <section class="uf-attention-card"><div class="uf-attention-head"><div><small>ANIVERSÁRIOS</small><h2>${escapeHtml(month.charAt(0).toUpperCase()+month.slice(1))}</h2></div><span>🎂</span></div><div class="uf-birthday-list">${birthdayRows}</div></section>
 </div>`;
}
function pendingHtml(data){
 const s=summary(data.alerts);const scopeText=data.scope==='all'?`Todos os alunos do estúdio (${data.visibleCount})`:`Os meus alunos (${data.visibleCount})`;
 const cards=[['red','Sem avaliação inicial',s.initial],['red','Em atraso · +90 dias',s.overdue],['orange','Recomendadas · +60 dias',s.recommended],['yellow','Em breve · +45 dias',s.soon]].map(([tone,label,count])=>`<div class="uf-pending-mini ${tone}"><span>${label}</span><b>${count}</b></div>`).join('');
 const rows=data.alerts.length?data.alerts.map(x=>`<button class="uf-pending-row ${x.tone}" data-student-id="${escapeHtml(x.student.id)}"><div class="uf-attention-avatar">${avatar(x.student)}</div><div class="uf-pending-copy"><div><b>${escapeHtml(x.student.name)}</b><em>${escapeHtml(x.label)}</em></div><p>${escapeHtml(x.detail)}</p><small>${x.student.primaryTrainer?.name?`Professor: ${escapeHtml(x.student.primaryTrainer.name)}`:'Professor por definir'}</small></div><span>›</span></button>`).join(''):'<div class="uf-pending-clear"><h2>Tudo em dia</h2><p>Não existem avaliações pendentes neste âmbito de alunos.</p></div>';
 return `<div class="uf-pending-page"><button class="uf-back-dashboard" data-uf-back-dashboard>← Voltar ao Dashboard</button><div class="uf-pending-heading"><div><small>ACOMPANHAMENTO</small><h1>Avaliações pendentes</h1><p>${escapeHtml(scopeText)} · alunos ativos ordenados por urgência.</p></div><div class="uf-pending-total"><b>${s.total}</b><span>pendentes</span></div></div><div class="uf-pending-minis">${cards}</div><div class="uf-pending-list">${rows}</div></div>`;
}
function backofficeScopeHtml(data){return `<section class="uf-backoffice-scope"><div><small>VISUALIZAÇÃO DE ALUNOS</small><h2>Ver todos os alunos do estúdio</h2><p>${data.scope==='all'?`Ativo · as áreas de gestão mostram todos os ${data.allCount} alunos ativos do estúdio.`:`Desativado · as áreas de gestão mostram apenas os ${data.assignedCount} alunos atribuídos a ti.`}</p><em>Afeta Alunos, Avaliações, Planos, Nutrição e alertas. Não altera permissões de criação/edição.</em></div><button class="uf-scope-toggle ${data.scope==='all'?'on':''}" data-uf-toggle-scope aria-label="Alternar âmbito"><i></i></button></section>`;}
function hideLegacyDashboardScope(){document.querySelectorAll('[data-dashboard-student-scope]').forEach(el=>{el.style.display='none';});}
async function renderDashboard(profile){
 const content=document.querySelector('.content');if(!content)return;
 maskDashboard();
 hideLegacyDashboardScope();
 let root=document.getElementById('uf-dashboard-attention-root');
 if(!root){root=document.createElement('div');root.id='uf-dashboard-attention-root';const kpis=content.querySelector('.grid.four');(kpis||content.querySelector('.heading'))?.insertAdjacentElement('afterend',root);}
 if(!root){revealDashboard();return;}
 try{
  const data=await loadAttentionData(profile);root.innerHTML=dashboardHtml(data);root.querySelector('[data-uf-open-pending]')?.addEventListener('click',()=>{history.pushState({},'', '/avaliacoes/pendentes');window.dispatchEvent(new PopStateEvent('popstate'));});
 }finally{requestAnimationFrame(revealDashboard);}
}
async function renderPending(profile){
 const content=document.querySelector('.content');if(!content)return;
 content.classList.add('uf-pending-mode');
 let root=document.getElementById('uf-assessment-pending-root');if(!root){root=document.createElement('div');root.id='uf-assessment-pending-root';content.appendChild(root);}
 const data=await loadAttentionData(profile);root.innerHTML=pendingHtml(data);
 root.querySelector('[data-uf-back-dashboard]')?.addEventListener('click',()=>{history.pushState({},'', '/dashboard');window.dispatchEvent(new PopStateEvent('popstate'));});
 root.querySelectorAll('[data-student-id]').forEach(btn=>btn.addEventListener('click',()=>{history.pushState({},'',`/avaliacoes/aluno/${encodeURIComponent(btn.dataset.studentId)}`);window.dispatchEvent(new PopStateEvent('popstate'));}));
}
async function renderBackoffice(profile){
 if(!['owner','admin'].includes(profile.role))return;
 const content=document.querySelector('.content');if(!content)return;
 hideLegacyDashboardScope();
 let root=document.getElementById('uf-backoffice-scope-root');
 if(!root){root=document.createElement('div');root.id='uf-backoffice-scope-root';const tabs=content.querySelector('.backofficeTabs');tabs?.insertAdjacentElement('afterend',root);}
 if(!root)return;
 const data=await loadAttentionData(profile);root.innerHTML=backofficeScopeHtml(data);
 root.querySelector('[data-uf-toggle-scope]')?.addEventListener('click',()=>{const next=data.scope==='all'?'assigned':'all';try{localStorage.setItem(scopeKey(profile.id),next);}catch{}window.location.reload();});
}
function cleanModes(path){const content=document.querySelector('.content');if(content&&!path.startsWith('/avaliacoes/pendentes'))content.classList.remove('uf-pending-mode');if(!isDashboardPath(path))revealDashboard();if(!path.startsWith('/dashboard')&&path!=='/')document.getElementById('uf-dashboard-attention-root')?.remove();if(!path.startsWith('/avaliacoes/pendentes'))document.getElementById('uf-assessment-pending-root')?.remove();if(!path.startsWith('/backoffice'))document.getElementById('uf-backoffice-scope-root')?.remove();}
async function run(){
 if(running)return;running=true;
 const path=currentPath();
 if(isDashboardPath(path))maskDashboard();
 try{
  cleanModes(path);hideLegacyDashboardScope();
  const profile=await currentProfile();if(!profile||profile.role==='student'){revealDashboard();return;}
  const key=`${path}:${profile.id}`;if(key===lastKey&&document.querySelector(path.startsWith('/avaliacoes/pendentes')?'#uf-assessment-pending-root':path.startsWith('/backoffice')?'#uf-backoffice-scope-root':'#uf-dashboard-attention-root')){revealDashboard();return;}lastKey=key;
  if(isDashboardPath(path))await renderDashboard(profile);
  else if(path.startsWith('/avaliacoes/pendentes'))await renderPending(profile);
  else if(path.startsWith('/backoffice'))await renderBackoffice(profile);
 }catch(error){console.warn('Dashboard attention enhancer:',error);revealDashboard();}finally{running=false;}
}
export function startDashboardAttentionEnhancer(){
 if(observer)return;
 observer=new MutationObserver(()=>{
  maskDashboard();
  clearTimeout(startDashboardAttentionEnhancer.timer);
  startDashboardAttentionEnhancer.timer=setTimeout(run,0);
 });
 observer.observe(document.documentElement,{childList:true,subtree:true});
 window.addEventListener('popstate',()=>{lastKey='';maskDashboard();setTimeout(run,0)});
 window.addEventListener('focus',()=>{lastKey='';maskDashboard();run()});
 maskDashboard();
 run();
}
startDashboardAttentionEnhancer.timer=null;
