function applyMobileStudentDashboardEnhancements() {
  if (typeof window === 'undefined' || window.innerWidth > 760) return;

  document.querySelectorAll('.studentSelfProfilePage .selfActions button').forEach((button) => {
    const label = (button.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (label.includes('exportar avaliação')) {
      button.style.setProperty('display', 'none', 'important');
      button.setAttribute('aria-hidden', 'true');
      button.setAttribute('tabindex', '-1');
    }
  });
}

export function startMobileStudentDashboardEnhancer() {
  if (typeof window === 'undefined') return;

  const run = () => requestAnimationFrame(applyMobileStudentDashboardEnhancements);
  run();
  window.addEventListener('resize', run);

  const observer = new MutationObserver(run);
  observer.observe(document.body, { childList: true, subtree: true });
}
