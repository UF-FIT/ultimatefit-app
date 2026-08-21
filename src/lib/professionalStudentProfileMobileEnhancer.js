const MOBILE_QUERY='(max-width: 760px)';

function relabelPlanGoal(root=document){
  root.querySelectorAll('.trainingPlanInfo label').forEach(label=>{
    const text=(label.childNodes?.[0]?.textContent||'').trim();
    if(text==='Objetivo do plano') label.childNodes[0].textContent='Foco do acompanhamento';
  });
}

function enhance(){
  if(!window.matchMedia(MOBILE_QUERY).matches) return;
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
