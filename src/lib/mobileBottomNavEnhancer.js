function applyMobileBottomNavSize() {
  if (typeof window === 'undefined' || window.innerWidth > 760) return;

  const nav = document.querySelector('.bottomNav');
  if (!nav) return;

  nav.style.setProperty('min-height', '89px', 'important');
  nav.style.setProperty('height', '89px', 'important');
  nav.style.setProperty('padding', '10px 0 calc(9px + env(safe-area-inset-bottom))', 'important');
  nav.style.setProperty('align-items', 'stretch', 'important');

  nav.querySelectorAll('button').forEach((button) => {
    button.style.setProperty('min-height', '68px', 'important');
    button.style.setProperty('padding', '8px 2px', 'important');
    button.style.setProperty('gap', '5px', 'important');

    const icon = button.querySelector('svg');
    if (icon) {
      icon.style.setProperty('width', '30px', 'important');
      icon.style.setProperty('height', '30px', 'important');
      icon.style.setProperty('stroke-width', '2.2', 'important');
      icon.setAttribute('width', '30');
      icon.setAttribute('height', '30');
    }

    const label = button.querySelector('small');
    if (label) {
      label.style.setProperty('font-size', '11px', 'important');
      label.style.setProperty('line-height', '1.1', 'important');
      label.style.setProperty('font-weight', '500', 'important');
    }
  });

  const content = document.querySelector('.content');
  if (content) content.style.setProperty('padding-bottom', '124px', 'important');

  const footer = document.querySelector('.appCopyrightFooter');
  if (footer) footer.style.setProperty('margin-bottom', '95px', 'important');
}

export function startMobileBottomNavEnhancer() {
  if (typeof window === 'undefined') return;

  const run = () => requestAnimationFrame(applyMobileBottomNavSize);
  run();
  window.addEventListener('resize', run);

  const observer = new MutationObserver(run);
  observer.observe(document.body, { childList: true, subtree: true });
}
