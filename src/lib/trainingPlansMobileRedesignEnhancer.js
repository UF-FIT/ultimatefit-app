const MOBILE_QUERY='(max-width: 760px)';
let observer=null;
let queued=false;
let activeStatus='all';

function isPlansList(){
  return Boolean(document.querySelector('.trainingPlansPage')) && !document.querySelector('.trainingEditor,.trainingViewer');
}

function statusOfCard(card){
  const text=(card.querySelector('.badge')?.textContent||'').trim().toLowerCase();
  if(text.includes('rascunho')) return 'draft';
  if(text.includes('arquivado')) return 'archived';
  if(text.includes('publicado')||text.includes('ativo')) return 'active';
  return 'other';
}

function applyStatusFilter(page){
  page.querySelectorAll('.trainingPlanCard').forEach(card=>{
    const status=statusOfCard(card);
    const visible=activeStatus==='all'||status===activeStatus;
    card.style.setProperty('display',visible?'flex':'none','important');
  });
  page.querySelectorAll('.uf-plan-status-tab').forEach(tab=>{
    const selected=tab.dataset.status===activeStatus;
    tab.classList.toggle('active',selected);
    tab.setAttribute('aria-pressed',String(selected));
  });
}

function normalizeCard(card){
  const badge=card.querySelector('.badge');
  if(badge){
    const text=badge.textContent.trim().toLowerCase();
    if(text.includes('publicado')&&text.includes('ativo')) badge.textContent='Ativo';
    else if(text==='publicado') badge.textContent='Publicado';
  }
  const status=statusOfCard(card);
  card.dataset.planStatus=status;
}

function ensureStatusTabs(page){
  let tabs=page.querySelector('.uf-plan-status-tabs');
  if(tabs) return tabs;
  const filters=page.querySelector('.trainingFilters');
  if(!filters) return null;
  tabs=document.createElement('div');
  tabs.className='uf-plan-status-tabs';
  tabs.setAttribute('role','group');
  tabs.setAttribute('aria-label','Filtrar planos por estado');
  tabs.innerHTML=`
    <button type="button" class="uf-plan-status-tab active" data-status="all" aria-pressed="true">
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg><span>Todos</span>
    </button>
    <button type="button" class="uf-plan-status-tab" data-status="draft" aria-pressed="false">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/></svg><span>Rascunhos</span>
    </button>
    <button type="button" class="uf-plan-status-tab" data-status="active" aria-pressed="false">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg><span>Ativos</span>
    </button>`;
  tabs.addEventListener('click',event=>{
    const button=event.target.closest('.uf-plan-status-tab');
    if(!button) return;
    activeStatus=button.dataset.status||'all';
    applyStatusFilter(page);
  });
  filters.insertAdjacentElement('afterend',tabs);
  return tabs;
}

function ensureFilterIcon(page){
  const search=page.querySelector('.trainingFilters .search');
  if(!search||search.querySelector('.uf-plan-filter-icon')) return;
  const icon=document.createElement('span');
  icon.className='uf-plan-filter-icon';
  icon.setAttribute('aria-hidden','true');
  icon.innerHTML='<svg viewBox="0 0 24 24"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h8M16 18h4"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="14" cy="18" r="2"/></svg>';
  search.appendChild(icon);
}

function enhance(){
  queued=false;
  if(!window.matchMedia(MOBILE_QUERY).matches||!isPlansList()) return;
  const page=document.querySelector('.trainingPlansPage');
  if(!page) return;
  page.classList.add('uf-training-plans-redesign');
  ensureFilterIcon(page);
  ensureStatusTabs(page);
  page.querySelectorAll('.trainingPlanCard').forEach(normalizeCard);
  applyStatusFilter(page);
}

function schedule(){
  if(queued) return;
  queued=true;
  requestAnimationFrame(enhance);
}

export function startTrainingPlansMobileRedesignEnhancer(){
  if(observer||typeof window==='undefined') return;
  schedule();
  observer=new MutationObserver(schedule);
  observer.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('popstate',schedule);
  window.addEventListener('resize',schedule);
}
