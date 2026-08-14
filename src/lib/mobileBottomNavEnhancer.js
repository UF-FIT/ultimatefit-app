function applyMobileBottomNavSize() {
  if (typeof window === 'undefined' || window.innerWidth > 760) return;

  const nav = document.querySelector('.bottomNav');
  if (!nav) return;

  nav.style.setProperty('min-height', '100px', 'important');
  nav.style.setProperty('height', '100px', 'important');
  nav.style.setProperty('padding', '10px 0', 'important');
  nav.style.setProperty('align-items', 'stretch', 'important');

  nav.querySelectorAll('button').forEach((button) => {
    button.style.setProperty('min-height', '80px', 'important');
    button.style.setProperty('padding', '10px 2px', 'important');
    button.style.setProperty('gap', '6px', 'important');

    const icon = button.querySelector('svg');
    if (icon) {
      icon.style.setProperty('width', '36px', 'important');
      icon.style.setProperty('height', '36px', 'important');
      icon.setAttribute('width', '36');
      icon.setAttribute('height', '36');
    }

    const label = button.querySelector('small');
    if (label) {
      label.style.setProperty('font-size', '14px', 'important');
      label.style.setProperty('line-height', '1.15', 'important');
    }
  });

  const content = document.querySelector('.content');
  if (content) content.style.setProperty('padding-bottom', '145px', 'important');
}

export function startMobileBottomNavEnhancer() {
  if (typeof window === 'undefined') return;

  const run = () => requestAnimationFrame(applyMobileBottomNavSize);
  run();
  window.addEventListener('resize', run);

  const observer = new MutationObserver(run);
  observer.observe(document.body, { childList: true, subtree: true });
}
