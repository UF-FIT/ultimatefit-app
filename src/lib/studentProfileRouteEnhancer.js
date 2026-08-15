function syncStudentProfileRouteClass() {
  if (typeof window === 'undefined') return;
  const path = (window.location.pathname || '/').toLowerCase().replace(/\/+$/, '') || '/';
  document.documentElement.classList.toggle('student-profile-clean', path === '/perfil');
}

export function startStudentProfileRouteEnhancer() {
  if (typeof window === 'undefined') return;

  syncStudentProfileRouteClass();
  window.addEventListener('popstate', syncStudentProfileRouteClass);

  const observer = new MutationObserver(syncStudentProfileRouteClass);
  observer.observe(document.body, { childList: true, subtree: true });
}
