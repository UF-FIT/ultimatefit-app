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
}

export function startStudentProfilePageCleaner() {
  if (typeof window === 'undefined') return;

  const run = () => requestAnimationFrame(applyStudentProfilePageLayout);
  run();
  window.addEventListener('popstate', run);

  const observer = new MutationObserver(run);
  observer.observe(document.body, { childList: true, subtree: true });
}
