function applyMobileBottomNavSize() {
  if (typeof window === 'undefined' || window.innerWidth > 760) return;

  const nav = document.querySelector('.bottomNav');
  if (!nav) return;

  nav.style.setProperty('min-height', '82px', 'important');
  nav.style.setProperty('height', '82px', 'important');
  nav.style.setProperty('padding', '8px 0 calc(8px + env(safe-area-inset-bottom))', 'important');
  nav.style.setProperty('align-items', 'stretch', 'important');
  nav.style.setProperty('overflow', 'visible', 'important');

  Array.from(nav.children).forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) return;

    button.style.setProperty('min-height', '62px', 'important');
    button.style.setProperty('padding', '6px 2px', 'important');
    button.style.setProperty('gap', '5px', 'important');
    button.style.setProperty('font-size', '11px', 'important');
    button.style.setProperty('line-height', '1.05', 'important');
    button.style.setProperty('font-weight', '500', 'important');

    const icon = button.querySelector('svg');
    if (icon) {
      icon.style.setProperty('width', '28px', 'important');
      icon.style.setProperty('height', '28px', 'important');
      icon.style.setProperty('stroke-width', '2.1', 'important');
      icon.setAttribute('width', '28');
      icon.setAttribute('height', '28');
    }

    const label = button.querySelector('small');
    if (label) {
      label.style.setProperty('font-size', '11px', 'important');
      label.style.setProperty('line-height', '1.05', 'important');
      label.style.setProperty('font-weight', '500', 'important');
    }
  });

  const content = document.querySelector('.content');
  if (content) content.style.setProperty('padding-bottom', '116px', 'important');

  const footer = document.querySelector('.appCopyrightFooter');
  if (footer) footer.style.setProperty('margin-bottom', '88px', 'important');
}

export function startMobileBottomNavEnhancer() {
  if (typeof window === 'undefined') return;

  const run = () => requestAnimationFrame(applyMobileBottomNavSize);
  run();
  window.addEventListener('resize', run);

  const observer = new MutationObserver(run);
  observer.observe(document.body, { childList: true, subtree: true });
}
