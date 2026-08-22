const MOBILE_QUERY='(max-width: 760px)';
let detailsOverlay=null;
let bypassOriginalEdit=false;

function relabelPlanGoal(root=document){
  root.querySelectorAll('.trainingPlanInfo label').forEach(label=>{
    const text=(label.childNodes?.[0]?.textContent||'').trim();
    if(text==='Objetivo do plano') label.childNodes[0].textContent='Foco do acompanhamento';
  });
}

function closeDetailsModal(){
  detailsOverlay?.remove();
  detailsOverlay=null;
  document.body.classList.remove('uf-student-details-open');
}

function openDetailsModal(page,editButton){
  closeDetailsModal();
  const source=page.querySelector('.profileInfoPanel');
  if(!source) return;

  const overlay=document.createElement('div');
  overlay.className='uf-student-details-overlay';
  overlay.setAttribute('role','presentation');
  overlay.innerHTML=`
    <section class="uf-student-details-modal" role="dialog" aria-modal="true" aria-labelledby="uf-student-details-title">
      <header class="uf-student-details-modal-head">
        <div><span>PERFIL</span><h2 id="uf-student-details-title">Dados do aluno</h2></div>
        <button type="button" class="uf-student-details-close" aria-label="Fechar">×</button>
      </header>
      <div class="uf-student-details-modal-body"></div>
      <footer class="uf-student-details-modal-actions">
        <button type="button" class="uf-student-details-edit">Editar perfil</button>
      </footer>
    </section>`;

  const cloned=source.cloneNode(true);
  cloned.classList.add('uf-student-details-clone');
  cloned.querySelector('.panelTitle')?.remove();
  overlay.querySelector('.uf-student-details-modal-body')?.appendChild(cloned);

  const close=()=>closeDetailsModal();
  overlay.querySelector('.uf-student-details-close')?.addEventListener('click',close);
  overlay.addEventListener('click',event=>{if(event.target===overlay) close();});
  overlay.querySelector('.uf-student-details-edit')?.addEventListener('click',()=>{
    close();
    bypassOriginalEdit=true;
    editButton.click();
    bypassOriginalEdit=false;
  });

  document.body.appendChild(overlay);
  document.body.classList.add('uf-student-details-open');
  detailsOverlay=overlay;
}

function prepareDetailsAction(page,hero,actions){
  const editButton=actions.querySelector('button:first-child');
  const label=editButton?.querySelector('span');
  if(!editButton||!label) return;
  label.textContent='Dados do aluno';
  if(editButton.dataset.ufDetailsAction==='true') return;
  editButton.dataset.ufDetailsAction='true';
  editButton.addEventListener('click',event=>{
    if(bypassOriginalEdit) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openDetailsModal(page,editButton);
  },true);
}

function reflowProfessionalProfile(page){
  const hero=page?.querySelector('.studentProfileHero.profileHeroV2');
  const identity=hero?.querySelector('.profileIdentity');
  const chips=identity?.querySelector('.profileChips') || hero?.querySelector(':scope > .profileChips');
  const actions=hero?.querySelector('.profileQuickActions');
  if(!hero || !actions) return;
  if(chips&&chips.parentElement!==hero) hero.insertBefore(chips,actions);
  chips?.classList.add('uf-profile-meta-strip');
  prepareDetailsAction(page,hero,actions);
}

function enhance(){
  if(!window.matchMedia(MOBILE_QUERY).matches){closeDetailsModal();return;}
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
  window.addEventListener('popstate',closeDetailsModal);
}
