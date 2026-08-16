const MOBILE_QUERY='(max-width: 760px)';

function isProfessionalStudentProfile(page){
  if(!page) return false;
  const back=page.querySelector('.profileBack');
  return Boolean(back && /voltar aos alunos/i.test(back.textContent||''));
}

function ensureToolsButton(page){
  if(!isProfessionalStudentProfile(page)) return;
  const hero=page.querySelector('.studentProfileHero.profileHeroV2');
  if(!hero || hero.querySelector('.uf-profile-more-button')) return;
  const button=document.createElement('button');
  button.type='button';
  button.className='uf-profile-more-button';
  button.setAttribute('aria-label','Mostrar dados e gestão do aluno');
  button.setAttribute('aria-expanded','false');
  button.textContent='⋯';
  button.addEventListener('click',()=>{
    const open=!page.classList.contains('uf-mobile-tools-open');
    page.classList.toggle('uf-mobile-tools-open',open);
    button.classList.toggle('is-open',open);
    button.setAttribute('aria-expanded',String(open));
    button.setAttribute('aria-label',open?'Ocultar dados e gestão do aluno':'Mostrar dados e gestão do aluno');
    if(open){
      requestAnimationFrame(()=>page.querySelector('.profileInfoPanel')?.scrollIntoView({behavior:'smooth',block:'start'}));
    }
  });
  hero.appendChild(button);
}

function relabelPlanGoal(root=document){
  root.querySelectorAll('.trainingPlanInfo label').forEach(label=>{
    const text=(label.childNodes?.[0]?.textContent||'').trim();
    if(text==='Objetivo do plano') label.childNodes[0].textContent='Foco do acompanhamento';
  });
}

function enhance(){
  if(!window.matchMedia(MOBILE_QUERY).matches) return;
  document.querySelectorAll('.studentProfilePage').forEach(ensureToolsButton);
  relabelPlanGoal();
}

let observer;
export function startProfessionalStudentProfileMobileEnhancer(){
  if(observer) return;
  enhance();
  observer=new MutationObserver(()=>enhance());
  observer.observe(document.body,{childList:true,subtree:true});
  window.matchMedia(MOBILE_QUERY).addEventListener?.('change',enhance);
}
