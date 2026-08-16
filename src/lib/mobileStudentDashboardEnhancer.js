function topLevelBlockFor(node, page) {
  if (!node || !page) return null;
  let current = node;
  while (current && current.parentElement && current.parentElement !== page) {
    current = current.parentElement;
  }
  return current?.parentElement === page ? current : null;
}

function findBlockByHeading(page, wantedText) {
  const wanted = wantedText.toLowerCase();
  const heading = Array.from(page.querySelectorAll('h1, h2, h3, h4')).find((element) =>
    (element.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase().includes(wanted),
  );
  return topLevelBlockFor(heading, page);
}

function findBlockByText(page, wantedText) {
  const wanted = wantedText.toLowerCase();
  const element = Array.from(page.querySelectorAll('span, p, div, strong')).find((candidate) => {
    const text = (candidate.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    return text === wanted || text.startsWith(wanted);
  });
  return topLevelBlockFor(element, page);
}

function isStudentDashboardRoute() {
  const path = window.location.pathname.toLowerCase().replace(/\/+$/, '') || '/';
  return path !== '/perfil';
}

function hideDashboardBlock(page, headingText) {
  const block = findBlockByHeading(page, headingText);
  if (!block) return;
  block.style.setProperty('display', 'none', 'important');
  block.setAttribute('aria-hidden', 'true');
}

function nextVisibleSibling(element) {
  let current = element?.nextElementSibling || null;
  while (current) {
    const style = window.getComputedStyle(current);
    if (style.display !== 'none' && style.visibility !== 'hidden' && current.getBoundingClientRect().height > 0) {
      return current;
    }
    current = current.nextElementSibling;
  }
  return null;
}

function balanceProfessorBlockSpacing(page) {
  const professorBlock = findBlockByText(page, 'professor principal');
  if (!professorBlock) return;

  const nextBlock = nextVisibleSibling(professorBlock);
  if (!nextBlock) return;

  const professorRect = professorBlock.getBoundingClientRect();
  const nextRect = nextBlock.getBoundingClientRect();
  const gapAfter = Math.max(0, Math.round(nextRect.top - professorRect.bottom));

  if (gapAfter > 0 && gapAfter < 120) {
    professorBlock.style.setProperty('margin-top', `${gapAfter}px`, 'important');
  }
}

function fixObjectivesBlockSpacing(page) {
  const summaryBlock = findBlockByHeading(page, 'resumo físico');
  const objectivesBlock = findBlockByHeading(page, 'foco do acompanhamento');
  if (!summaryBlock || !objectivesBlock) return;

  const targetGap = 24;

  // Clear any previous inline correction first so geometry is measured from the
  // actual layout rather than from a stale compensation applied on a prior run.
  objectivesBlock.style.removeProperty('margin-top');

  const summaryRect = summaryBlock.getBoundingClientRect();
  const objectivesRect = objectivesBlock.getBoundingClientRect();
  const actualGap = Math.round(objectivesRect.top - summaryRect.bottom);

  if (!Number.isFinite(actualGap)) return;

  // The parent layout already contributes spacing between sections. Apply only
  // the difference needed to make the visible gap exactly 24px. This can be a
  // negative margin when the structural gap is larger than desired.
  const correction = targetGap - actualGap;
  objectivesBlock.style.setProperty('margin-top', `${correction}px`, 'important');
}

function applyMobileStudentDashboardEnhancements() {
  if (typeof window === 'undefined' || window.innerWidth > 760) return;

  const page = document.querySelector('.studentSelfProfilePage');
  if (!page) return;

  document.querySelectorAll('.studentSelfProfilePage .selfActions button').forEach((button) => {
    const label = (button.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (label.includes('exportar avaliação')) {
      button.style.setProperty('display', 'none', 'important');
      button.setAttribute('aria-hidden', 'true');
      button.setAttribute('tabindex', '-1');
    }
  });

  if (!isStudentDashboardRoute()) return;

  hideDashboardBlock(page, 'PAR-Q');
  hideDashboardBlock(page, 'Últimas 5 avaliações');
  hideDashboardBlock(page, 'Dados do aluno');
  hideDashboardBlock(page, 'Volume planeado');
  hideDashboardBlock(page, 'Volume realizado');

  const accompaniment = findBlockByHeading(page, 'o meu acompanhamento');
  const calendar = findBlockByHeading(page, 'calendário de treinos');
  const hero = page.querySelector('.studentSelfHero');

  if (accompaniment && calendar && hero && accompaniment !== calendar) {
    if (hero.nextElementSibling !== accompaniment) {
      hero.insertAdjacentElement('afterend', accompaniment);
    }
    if (accompaniment.nextElementSibling !== calendar) {
      accompaniment.insertAdjacentElement('afterend', calendar);
    }
  }

  balanceProfessorBlockSpacing(page);
  fixObjectivesBlockSpacing(page);
}

export function startMobileStudentDashboardEnhancer() {
  if (typeof window === 'undefined') return;

  let queued = false;
  const run = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      applyMobileStudentDashboardEnhancements();
    });
  };

  run();
  window.addEventListener('resize', run);
  window.addEventListener('popstate', run);

  const observer = new MutationObserver(run);
  observer.observe(document.body, { childList: true, subtree: true });
}
