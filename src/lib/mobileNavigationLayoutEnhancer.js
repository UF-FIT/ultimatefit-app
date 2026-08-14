function normalizeLabel(text = '') {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function getSidebarButtons() {
  return Array.from(document.querySelectorAll('.sidebar .navList button'));
}

function syncActiveState(bottomNav, sourceButtons) {
  const activeLabel = normalizeLabel(sourceButtons.find((button) => button.classList.contains('active'))?.textContent || '');
  bottomNav.querySelectorAll('button').forEach((button) => {
    button.classList.toggle('active', normalizeLabel(button.textContent) === activeLabel);
  });
}

function rebuildMobileNavigation() {
  if (typeof window === 'undefined' || window.innerWidth > 760) return;

  const bottomNav = document.querySelector('.bottomNav');
  const mobileLogo = document.querySelector('.mobileLogo');
  const sourceButtons = getSidebarButtons();
  if (!bottomNav || !mobileLogo || !sourceButtons.length) return;

  const dashboardButton = sourceButtons.find((button) => normalizeLabel(button.textContent) === 'dashboard');
  const profileButton = sourceButtons.find((button) => normalizeLabel(button.textContent) === 'o meu perfil');

  mobileLogo.style.setProperty('cursor', 'pointer');
  mobileLogo.setAttribute('role', 'button');
  mobileLogo.setAttribute('tabindex', '0');
  mobileLogo.setAttribute('aria-label', 'Abrir Dashboard');

  if (!mobileLogo.dataset.mobileDashboardShortcutBound) {
    const goDashboard = () => dashboardButton?.click();
    mobileLogo.addEventListener('click', goDashboard);
    mobileLogo.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        goDashboard();
      }
    });
    mobileLogo.dataset.mobileDashboardShortcutBound = 'true';
  }

  const desiredSourceButtons = sourceButtons
    .filter((button) => !['dashboard', 'o meu perfil'].includes(normalizeLabel(button.textContent)))
    .slice(0, 5);

  const desiredLabels = desiredSourceButtons.map((button) => normalizeLabel(button.textContent)).join('|');
  if (bottomNav.dataset.mobileNavLayout === desiredLabels) {
    syncActiveState(bottomNav, sourceButtons);
    return;
  }

  const fragment = document.createDocumentFragment();
  desiredSourceButtons.forEach((sourceButton) => {
    const clone = sourceButton.cloneNode(true);
    clone.removeAttribute('style');
    clone.addEventListener('click', () => sourceButton.click());
    fragment.appendChild(clone);
  });

  bottomNav.replaceChildren(fragment);
  bottomNav.dataset.mobileNavLayout = desiredLabels;
  syncActiveState(bottomNav, sourceButtons);

  // The profile shortcut already wraps the user photo in the real React UI.
  // Keep it explicit for mobile accessibility without changing desktop behaviour.
  const profileShortcut = document.querySelector('.profileShortcut');
  if (profileShortcut && profileButton) profileShortcut.setAttribute('aria-label', 'Abrir o meu perfil');
}

export function startMobileNavigationLayoutEnhancer() {
  if (typeof window === 'undefined') return;

  const run = () => requestAnimationFrame(rebuildMobileNavigation);
  run();
  window.addEventListener('resize', run);
  window.addEventListener('popstate', run);

  const observer = new MutationObserver(run);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
}
