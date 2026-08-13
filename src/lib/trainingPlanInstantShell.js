let scheduled = false;

function isPlanDetail() {
  const params = new URLSearchParams(window.location.search);
  return Boolean(params.get('plano')) && /\/(treino|planos-de-treino|planos)(\/|$)/.test(window.location.pathname);
}

function ensureStyles() {
  if (document.getElementById('uf-plan-instant-shell-style')) return;
  const style = document.createElement('style');
  style.id = 'uf-plan-instant-shell-style';
  style.textContent = `
    .trainingViewer:not(.ufAllPlanSectionsReady)>#uf-training-volume-analysis,
    .trainingViewer:not(.ufAllPlanSectionsReady)>#uf-load-analytics,
    .trainingViewer:not(.ufAllPlanSectionsReady)>.trainingSessionsView{visibility:visible!important;opacity:1!important}
    #uf-training-volume-analysis.ufCollapsed>:not(.trainingVolumeHeader),
    #uf-load-analytics.ufCollapsed>:not(.ufah){display:none!important}
    #uf-training-volume-analysis.ufCollapsed,
    #uf-load-analytics.ufCollapsed{padding:0!important;overflow:hidden!important}
    #uf-training-volume-analysis.ufCollapsed .trainingVolumeHeader,
    #uf-load-analytics.ufCollapsed .ufah{margin:0!important;padding:16px 18px!important;min-height:58px!important;align-items:center!important}
    #uf-training-volume-analysis.ufCollapsed .trainingVolumeHeader p,
    #uf-load-analytics.ufCollapsed .ufah p{display:none!important}
    .trainingSessionView.ufCollapsed>:not(.trainingSessionTitle){display:none!important}
    .trainingSessionView.ufCollapsed{padding:0!important;overflow:hidden!important}
    .trainingSessionView.ufCollapsed .trainingSessionTitle{margin:0!important;padding:16px 18px!important;min-height:76px!important;align-items:center!important}
    .trainingSessionView.ufCollapsed .trainingSessionTitle p{display:none!important}
    .ufAccordionChevron{position:absolute;right:14px;top:50%;transform:translateY(-50%);width:30px;height:30px;border:1px solid #2a2a2e;border-radius:8px;background:#0b0b0d;color:#fff;display:grid;place-items:center;font-size:22px;line-height:1;pointer-events:none}
    .ufAccordionHeader{position:relative!important;padding-right:48px!important}
    .ufSessionTags{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}
    .ufSessionTags span{padding:3px 7px;border-radius:999px;background:rgba(255,217,8,.08);border:1px solid rgba(255,217,8,.18);color:#bdb673;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.025em}
  `;
  document.head.appendChild(style);
}

function addChevron(header) {
  if (!header || header.querySelector('.ufAccordionChevron')) return;
  header.classList.add('ufAccordionHeader');
  header.setAttribute('aria-expanded', 'false');
  const chevron = document.createElement('span');
  chevron.className = 'ufAccordionChevron';
  chevron.textContent = '›';
  header.appendChild(chevron);
}

function buildShell(id, headerClass, eyebrow, title, volume = false) {
  const section = document.createElement('section');
  section.id = id;
  section.className = `${volume ? 'trainingVolumeAnalysis ' : ''}card ufCollapsed`;
  section.dataset.ufInstantShell = '1';

  const header = document.createElement('div');
  header.className = headerClass;
  const copy = document.createElement('div');
  const label = document.createElement('span');
  label.className = 'eyebrow';
  label.textContent = eyebrow;
  const heading = document.createElement('h2');
  heading.textContent = title;
  copy.append(label, heading);
  header.appendChild(copy);

  if (volume) {
    const icon = document.createElement('div');
    icon.className = 'trainingVolumeHeaderIcon';
    icon.textContent = '▥';
    header.appendChild(icon);
  } else {
    const unit = document.createElement('b');
    unit.textContent = 'KG';
    header.appendChild(unit);
  }

  section.appendChild(header);
  addChevron(header);
  return section;
}

function ensureAnalysisShells(viewer) {
  const hero = viewer.querySelector(':scope > .trainingPlanHero');
  if (!hero) return;

  let planned = viewer.querySelector(':scope > #uf-training-volume-analysis');
  if (!planned) {
    planned = buildShell('uf-training-volume-analysis', 'trainingVolumeHeader', 'ANÁLISE DO PLANO', 'Volume planeado', true);
    hero.insertAdjacentElement('afterend', planned);
  } else if (!planned.classList.contains('ufCollapsed') && !planned.querySelector('.trainingVolumeHeader[aria-expanded="true"]')) {
    planned.classList.add('ufCollapsed');
  }
  addChevron(planned.querySelector(':scope > .trainingVolumeHeader'));

  let realised = viewer.querySelector(':scope > #uf-load-analytics');
  if (!realised) {
    realised = buildShell('uf-load-analytics', 'ufah', 'EVOLUÇÃO DE CARGA', 'Volume realizado', false);
    planned.insertAdjacentElement('afterend', realised);
  } else if (!realised.classList.contains('ufCollapsed') && !realised.querySelector('.ufah[aria-expanded="true"]')) {
    realised.classList.add('ufCollapsed');
  }
  addChevron(realised.querySelector(':scope > .ufah'));
}

function sessionGroups(session) {
  const values = [...session.querySelectorAll('.trainingExerciseCopy small')]
    .map(node => node.textContent?.split('·')[0]?.trim())
    .filter(value => value && !/texto livre/i.test(value));
  return [...new Set(values)].slice(0, 6);
}

function ensureSessions(viewer) {
  const sessions = [...viewer.querySelectorAll('.trainingSessionView')];
  sessions.forEach(session => {
    const header = session.querySelector(':scope > .trainingSessionTitle');
    if (!header) return;
    if (!header.getAttribute('aria-expanded')) session.classList.add('ufCollapsed');
    addChevron(header);
    const left = header.querySelector(':scope > div');
    if (left && !left.querySelector('.ufSessionTags')) {
      const groups = sessionGroups(session);
      if (groups.length) {
        const tags = document.createElement('div');
        tags.className = 'ufSessionTags';
        groups.forEach(group => {
          const tag = document.createElement('span');
          tag.textContent = group;
          tags.appendChild(tag);
        });
        left.appendChild(tags);
      }
    }
  });
}

function sync() {
  scheduled = false;
  if (!isPlanDetail()) return;
  ensureStyles();
  const viewer = document.querySelector('.trainingViewer');
  if (!viewer) return;
  ensureAnalysisShells(viewer);
  ensureSessions(viewer);
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(sync);
}

export function startTrainingPlanInstantShell() {
  if (window.__ufTrainingPlanInstantShell) return;
  window.__ufTrainingPlanInstantShell = true;
  ensureStyles();
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  window.addEventListener('focus', schedule);
  schedule();
}
