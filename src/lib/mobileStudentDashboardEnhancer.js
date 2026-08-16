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

function normalizeResponsibleTrainerCard(page) {
  const trainerCard = page.querySelector('.trainerProfileCard');
  if (!trainerCard) return;

  const eyebrow = trainerCard.querySelector('.eyebrow');
  if (eyebrow && /professor\s+principal/i.test(eyebrow.textContent || '')) {
    eyebrow.textContent = 'PROFESSOR RESPONSÁVEL';
  }

  trainerCard.querySelectorAll('p').forEach((paragraph) => {
    if (/professor\s+principal/i.test(paragraph.textContent || '')) {
      paragraph.textContent = (paragraph.textContent || '').replace(/professor\s+principal/gi, 'professor responsável');
    }
  });
}

function createSpacer(name) {
  const spacer = document.createElement('div');
  spacer.setAttribute(`data-${name}-spacer`, 'true');
  spacer.setAttribute('aria-hidden', 'true');
  spacer.style.height = '18px';
  spacer.style.minHeight = '18px';
  spacer.style.width = '100%';
  spacer.style.pointerEvents = 'none';
  return spacer;
}

function ensureDashboardCardOrder(page) {
  if (!isStudentDashboardRoute()) return;

  const calendar = page.querySelector('.trainingActivityCalendar');
  const goalCard = page.querySelector('.studentGoalPanel');
  const trainerCard = page.querySelector('.trainerProfileCard');
  const summaryCard = page.querySelector('.assessmentSnapshot');
  if (!calendar || !goalCard || !trainerCard) return;

  // Remove the previous calendar→trainer spacer introduced by the older order.
  page.querySelectorAll('[data-calendar-trainer-spacer="true"]').forEach((node) => node.remove());

  let calendarGoalSpacer = page.querySelector('[data-calendar-goal-spacer="true"]');
  if (!calendarGoalSpacer) calendarGoalSpacer = createSpacer('calendar-goal');

  let goalTrainerSpacer = page.querySelector('[data-goal-trainer-spacer="true"]');
  if (!goalTrainerSpacer) goalTrainerSpacer = createSpacer('goal-trainer');

  // Make these cards independent top-level dashboard sections on mobile.
  goalCard.style.setProperty('margin', '0', 'important');
  trainerCard.style.setProperty('margin', '0', 'important');

  if (calendar.nextElementSibling !== calendarGoalSpacer) {
    calendar.insertAdjacentElement('afterend', calendarGoalSpacer);
  }
  if (calendarGoalSpacer.nextElementSibling !== goalCard) {
    calendarGoalSpacer.insertAdjacentElement('afterend', goalCard);
  }
  if (goalCard.nextElementSibling !== goalTrainerSpacer) {
    goalCard.insertAdjacentElement('afterend', goalTrainerSpacer);
  }
  if (goalTrainerSpacer.nextElementSibling !== trainerCard) {
    goalTrainerSpacer.insertAdjacentElement('afterend', trainerCard);
  }

  // Keep the physical summary immediately after the responsible trainer card,
  // while preserving its existing parent grid when possible.
  const summaryWrapper = summaryCard ? topLevelBlockFor(summaryCard, page) : null;
  if (summaryWrapper && summaryWrapper !== trainerCard && trainerCard.nextElementSibling !== summaryWrapper) {
    trainerCard.insertAdjacentElement('afterend', summaryWrapper);
  }
}

function applyMobileStudentDashboardEnhancements() {
  if (typeof window === 'undefined' || window.innerWidth > 760) return;

  const page = document.querySelector('.studentSelfProfilePage');
  if (!page) return;

  normalizeResponsibleTrainerCard(page);

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

  ensureDashboardCardOrder(page);
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
