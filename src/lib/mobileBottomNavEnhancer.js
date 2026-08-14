function applyMobileBottomNavSize() {
  if (typeof window === 'undefined' || window.innerWidth > 760) return;

  const nav = document.querySelector('.bottomNav');
  if (!nav) return;

  nav.style.setProperty('min-height', '140px', 'important');
  nav.style.setProperty('height', '140px', 'important');
  nav.style.setProperty('padding', '16px 0 calc(14px + env(safe-area-inset-bottom))', 'important');
  nav.style.setProperty('align-items', 'stretch', 'important');

  nav.querySelectorAll('button').forEach((button) => {
    button.style.setProperty('min-height', '106px', 'important');
    button.style.setProperty('padding', '12px 2px', 'important');
    button.style.setProperty('gap', '8px', 'important');

    const icon = button.querySelector('svg');
    if (icon) {
      icon.style.setProperty('width', '46px', 'important');
      icon.style.setProperty('height', '46px', 'important');
      icon.style.setProperty('stroke-width', '2.2', 'important');
      icon.setAttribute('width', '46');
      icon.setAttribute('height', '46');
    }

    const label = button.querySelector('small');
    if (label) {
      label.style.setProperty('font-size', '17px', 'important');
      label.style.setProperty('line-height', '1.1', 'important');
      label.style.setProperty('font-weight', '500', 'important');
    }
  });

  const content = document.querySelector('.content');
  if (content) content.style.setProperty('padding-bottom', '195px', 'important');

  const footer = document.querySelector('.appCopyrightFooter');
  if (footer) footer.style.setProperty('margin-bottom', '150px', 'important');
}

export function startMobileBottomNavEnhancer() {
  if (typeof window === 'undefined') return;

  const run = () => requestAnimationFrame(applyMobileBottomNavSize);
  run();
  window.addEventListener('resize', run);

  const observer = new MutationObserver(run);
  observer.observe(document.body, { childList: true, subtree: true });
}
