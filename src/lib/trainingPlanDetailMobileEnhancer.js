const MOBILE_QUERY='(max-width: 760px)';

function parseDateRange(viewer){
  const text=Array.from(viewer.querySelectorAll('.trainingHeroMeta span')).map(el=>el.textContent||'').join(' ');
  const matches=[...text.matchAll(/(\d{4}-\d{2}-\d{2})/g)].map(match=>match[1]);
  return {start:matches[0]||'',end:matches[1]||''};
}

function dateProgress(start,end){
  if(!start||!end) return {percent:null,days:null,label:'Sem data de fim'};
  const today=new Date(); today.setHours(0,0,0,0);
  const s=new Date(`${start}T00:00:00`);
  const e=new Date(`${end}T00:00:00`);
  const total=Math.max(1,e-s);
  const remaining=Math.max(0,e-today);
  const percent=Math.max(0,Math.min(100,Math.round((remaining/total)*100)));
  const days=Math.max(0,Math.ceil(remaining/86400000));
  return {percent,days,label:days===0?'Termina hoje':`${days} dia${days===1?'':'s'} restantes`};
}

function sessionInfo(session,index){
  const title=session.querySelector('.trainingSessionTitle h2')?.textContent?.trim()||`Treino ${String.fromCharCode(65+index)}`;
  const exercises=[...session.querySelectorAll('.trainingExerciseView')];
  const groups=[];
  let sets=0;
  let seconds=0;
  exercises.forEach(exercise=>{
    const small=exercise.querySelector('.trainingExerciseCopy small')?.textContent?.trim()||'';
    const group=small.split('·')[0]?.trim();
    if(group&&!/texto livre/i.test(group)&&!groups.includes(group)) groups.push(group);
    const prescription=exercise.querySelector('.prescriptionLine')?.textContent||'';
    const parts=prescription.split('·').map(part=>part.trim());
    const setMatch=prescription.match(/(\d+(?:[.,]\d+)?)\s*séries/i);
    const repMatch=prescription.match(/(\d+(?:[.,]\d+)?)\s*reps/i);
    const durationPart=parts.find(part=>!/^descanso/i.test(part)&&/^\d+\s*(?:min|s)$/i.test(part));
    const durationMin=durationPart?.match(/(\d+)\s*min/i);
    const durationSec=durationPart?.match(/(\d+)\s*s$/i);
    const restMin=prescription.match(/descanso\s+(\d+)\s*min/i);
    const restSec=prescription.match(/descanso\s+(\d+)\s*s/i);
    const itemSets=setMatch?Number(setMatch[1].replace(',','.')):0;
    sets+=Number.isFinite(itemSets)?itemSets:0;
    if(durationMin) seconds+=Number(durationMin[1])*60;
    else if(durationSec) seconds+=Number(durationSec[1]);
    else if(itemSets){
      const reps=repMatch?Number(repMatch[1].replace(',','.')):10;
      seconds+=itemSets*Math.max(25,Math.min(60,reps*3.5));
      const rest=(restMin?Number(restMin[1])*60:restSec?Number(restSec[1]):45);
      seconds+=Math.max(0,itemSets-1)*rest;
    } else seconds+=45;
  });
  seconds+=Math.max(0,exercises.length-1)*20;
  const minutes=exercises.length?Math.max(5,Math.round(seconds/300)*5):0;
  return {title,exercises:exercises.length,groups:groups.slice(0,2),sets,minutes};
}

function makeSparkline(values){
  const max=Math.max(1,...values);
  const points=values.map((value,index)=>{
    const x=values.length===1?50:(index/(values.length-1))*100;
    const y=34-(value/max)*28;
    return `${x},${y}`;
  }).join(' ');
  return `<svg class="uf-plan-sparkline" viewBox="0 0 100 38" aria-hidden="true"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function sessionIcon(){
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9v6M9 7v10M15 7v10M18 9v6M9 12h6M3.5 10v4M20.5 10v4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
}

function formatPlanStatus(hero){
  const badge=hero.querySelector('.badge');
  if(!badge) return;
  const text=(badge.textContent||'').trim().toLowerCase();
  if(text.includes('publicado')&&text.includes('ativo')) badge.textContent='Ativo';
}

function enhanceViewer(viewer){
  if(viewer.dataset.ufDetailEnhanced==='true') return;
  viewer.dataset.ufDetailEnhanced='true';
  const hero=viewer.querySelector('.trainingPlanHero');
  const sessionsWrap=viewer.querySelector('.trainingSessionsView');
  const sessions=sessionsWrap?[...sessionsWrap.querySelectorAll(':scope > .trainingSessionView')]:[];
  if(!hero||!sessionsWrap||!sessions.length) return;

  formatPlanStatus(hero);
  const deleteButton=[...hero.querySelectorAll('.trainingHeroActions button')].find(btn=>/eliminar/i.test(btn.textContent||''));
  if(deleteButton){
    const textNodes=[...deleteButton.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE);
    textNodes.forEach(node=>{if(/eliminar/i.test(node.textContent||'')) node.textContent='Eliminar';});
  }

  const infos=sessions.map(sessionInfo);
  const totalSets=infos.reduce((sum,item)=>sum+item.sets,0);
  const totalExercises=infos.reduce((sum,item)=>sum+item.exercises,0);
  const range=parseDateRange(viewer);
  const progress=dateProgress(range.start,range.end);

  const summary=document.createElement('section');
  summary.className='uf-plan-overview-metrics';
  summary.innerHTML=`
    <article class="uf-plan-metric-card volume">
      <span>VOLUME PLANEADO</span>
      <strong>${totalSets || '—'}${totalSets?'<small> séries</small>':''}</strong>
      <em>${totalExercises} exercício${totalExercises===1?'':'s'} no plano</em>
      ${makeSparkline(infos.map(item=>item.sets||1))}
    </article>
    <article class="uf-plan-metric-card deadline">
      <span>TEMPO RESTANTE</span>
      <div class="uf-plan-deadline-copy"><strong>${progress.percent==null?'—':`${progress.percent}%`}</strong><em>${progress.label}</em></div>
      <div class="uf-plan-progress-ring" style="--progress:${progress.percent??0}" aria-label="${progress.percent==null?'Prazo sem data':`${progress.percent}% do tempo do plano ainda por decorrer`}"><b>${progress.percent==null?'—':`${progress.percent}%`}</b></div>
    </article>`;

  const list=document.createElement('section');
  list.className='uf-plan-session-overview';
  list.innerHTML='<span class="uf-plan-section-label">TREINOS DO PLANO</span><div class="uf-plan-session-rows"></div>';
  const rows=list.querySelector('.uf-plan-session-rows');
  infos.forEach((info,index)=>{
    const button=document.createElement('button');
    button.type='button';
    button.className='uf-plan-session-row';
    const tags=(info.groups.length?info.groups:['Treino']).map(group=>`<span>${group}</span>`).join('');
    button.innerHTML=`<div class="uf-plan-session-icon">${sessionIcon()}</div><div class="uf-plan-session-main"><b>${info.title}</b><div class="uf-plan-session-tags">${tags}</div></div><div class="uf-plan-session-meta"><span>${info.exercises} exercício${info.exercises===1?'':'s'}</span>${info.minutes?`<i>•</i><span>◷ ${info.minutes} min</span>`:''}</div><span class="uf-plan-session-chevron">›</span>`;
    button.addEventListener('click',()=>openSession(index));
    rows.appendChild(button);
  });

  const back=document.createElement('button');
  back.type='button';
  back.className='uf-plan-session-back';
  back.innerHTML='← Voltar ao resumo do plano';
  back.hidden=true;
  back.addEventListener('click',closeSession);

  sessionsWrap.before(summary,list,back);
  sessionsWrap.classList.add('uf-plan-sessions-collapsed');
  sessions.forEach(session=>session.classList.add('uf-plan-session-hidden'));

  function openSession(index){
    summary.hidden=true;
    list.hidden=true;
    back.hidden=false;
    sessionsWrap.classList.remove('uf-plan-sessions-collapsed');
    sessions.forEach((session,i)=>session.classList.toggle('uf-plan-session-hidden',i!==index));
    requestAnimationFrame(()=>back.scrollIntoView({behavior:'smooth',block:'start'}));
  }
  function closeSession(){
    summary.hidden=false;
    list.hidden=false;
    back.hidden=true;
    sessionsWrap.classList.add('uf-plan-sessions-collapsed');
    sessions.forEach(session=>session.classList.add('uf-plan-session-hidden'));
    requestAnimationFrame(()=>hero.scrollIntoView({behavior:'smooth',block:'start'}));
  }
}

let observer=null;
let scheduled=false;
function run(){
  scheduled=false;
  if(!window.matchMedia(MOBILE_QUERY).matches) return;
  document.querySelectorAll('.trainingViewer').forEach(enhanceViewer);
}
function schedule(){
  if(scheduled) return;
  scheduled=true;
  requestAnimationFrame(run);
}

export function startTrainingPlanDetailMobileEnhancer(){
  if(observer) return;
  run();
  observer=new MutationObserver(schedule);
  observer.observe(document.body,{childList:true,subtree:true});
  window.matchMedia(MOBILE_QUERY).addEventListener?.('change',schedule);
}
