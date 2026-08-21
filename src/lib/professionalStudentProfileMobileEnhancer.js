const MOBILE_QUERY='(max-width: 760px)';

function relabelPlanGoal(root=document){
  root.querySelectorAll('.trainingPlanInfo label').forEach(label=>{
    const text=(label.childNodes?.[0]?.textContent||'').trim();
    if(text==='Objetivo do plano') label.childNodes[0].textContent='Foco do acompanhamento';
  });
}

function reflowProfessionalProfile(page){
  const hero=page?.querySelector('.studentProfileHero.profileHeroV2');
  const identity=hero?.querySelector('.profileIdentity');
  const chips=identity?.querySelector('.profileChips') || hero?.querySelector(':scope > .profileChips');
  const actions=hero?.querySelector('.profileQuickActions');
  if(!hero || !chips || !actions) return;
  if(chips.parentElement!==hero) hero.insertBefore(chips,actions);
  chips.classList.add('uf-profile-meta-strip');
}

function enhance(){
  if(!window.matchMedia(MOBILE_QUERY).matches) return;
  document.querySelectorAll('.studentProfilePage').forEach(reflowProfessionalProfile);
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
