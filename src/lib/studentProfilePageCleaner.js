function applyStudentProfilePageLayout() {
  if (typeof window === 'undefined') return;

  const isProfileRoute = window.location.pathname.toLowerCase().replace(/\/+$/, '') === '/perfil';
  const page = document.querySelector('.studentSelfProfilePage');
  if (!page) return;

  const removableSelectors = [
    ':scope > .trainingActivityCalendar',
    ':scope > .profileHub',
    ':scope > .profileOverviewGrid',
    ':scope > .profileChart',
    ':scope > .trainerProfileCard',
  ];

  removableSelectors.forEach((selector) => {
    page.querySelectorAll(selector).forEach((element) => {
      if (isProfileRoute) {
        element.style.setProperty('display', 'none', 'important');
        element.dataset.hiddenOnStudentProfile = 'true';
      } else if (element.dataset.hiddenOnStudentProfile === 'true') {
        element.style.removeProperty('display');
        delete element.dataset.hiddenOnStudentProfile;
      }
    });
  });

  const hero = page.querySelector(':scope > .studentSelfHero');
  const details = page.querySelector(':scope > .studentDetails');
  const parq = page.querySelector(':scope > .parqStatusCard');

  if (isProfileRoute) {
    page.style.setProperty('display', 'flex');
    page.style.setProperty('flex-direction', 'column');

    if (hero) hero.style.setProperty('order', '1');
    if (details) {
      details.style.setProperty('order', '2');
      details.style.setProperty('margin-top', '18px');
    }
    if (parq) {
      parq.style.setProperty('order', '3');
      parq.style.setProperty('margin-top', '18px');
    }
  } else {
    page.style.removeProperty('display');
    page.style.removeProperty('flex-direction');

    [hero, details, parq].forEach((element) => {
      if (!element) return;
      element.style.removeProperty('order');
      element.style.removeProperty('margin-top');
    });
  }
}

export function startStudentProfilePageCleaner() {
  if (typeof window === 'undefined') return;

  const run = () => requestAnimationFrame(applyStudentProfilePageLayout);
  run();
  window.addEventListener('popstate', run);

  const observer = new MutationObserver(run);
  observer.observe(document.body, { childList: true, subtree: true });
}
