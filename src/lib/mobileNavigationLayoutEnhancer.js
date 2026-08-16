// Mobile navigation enhancer for compact responsive navigation.
function normalizeLabel(text = '') {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function getSidebarButtons() {
  return Array.from(document.querySelectorAll('.sidebar .navList button'));
}

function cloneNavButton(sourceButton, className = 'mobilePrimaryNavButton') {
  const clone = sourceButton.cloneNode(true);
  clone.removeAttribute('style');
  clone.classList.add(className);
  clone.addEventListener('click', () => sourceButton.click());
  return clone;
}

function createMenuButton(onToggle) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mobilePrimaryNavButton mobileMoreMenuButton';
  button.setAttribute('aria-label', 'Abrir menu');
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML = `
    <span class="mobileMoreMenuIcon" aria-hidden="true">
      <span></span><span></span><span></span>
    </span>
    <small>Menu</small>
  `;
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    onToggle(button);
  });
  return button;
}

function createOverflowPanel(sourceButtons, closePanel) {
  const panel = document.createElement('div');
  panel.className = 'mobileNavOverflowPanel';
  panel.setAttribute('role', 'menu');

  sourceButtons.forEach((sourceButton) => {
    const item = cloneNavButton(sourceButton, 'mobileNavOverflowItem');
    item.setAttribute('role', 'menuitem');
    item.addEventListener('click', closePanel, { once: true });
    panel.appendChild(item);
  });

  return panel;
}

function syncActiveState(bottomNav, sourceButtons) {
  const activeLabel = normalizeLabel(sourceButtons.find((button) => button.classList.contains('active'))?.textContent || '');
  bottomNav.querySelectorAll(':scope > .mobilePrimaryNavButton').forEach((button) => {
    if (button.classList.contains('mobileMoreMenuButton')) return;
    button.classList.toggle('active', normalizeLabel(button.textContent) === activeLabel);
  });

  const panel = document.querySelector('.mobileNavOverflowPanel');
  if (panel) {
    panel.querySelectorAll('.mobileNavOverflowItem').forEach((button) => {
      button.classList.toggle('active', normalizeLabel(button.textContent) === activeLabel);
    });
  }
}

function rebuildMobileNavigation() {
  if (typeof window === 'undefined' || window.innerWidth > 760) return;

  const bottomNav = document.querySelector('.bottomNav');
  const mobileLogo = document.querySelector('.mobileLogo');
  const sourceButtons = getSidebarButtons();
  if (!bottomNav || !mobileLogo || !sourceButtons.length) return;

  const dashboardButton = sourceButtons.find((button) => ['dashboard', 'início'].includes(normalizeLabel(button.textContent)));
  const profileButton = sourceButtons.find((button) => ['o meu perfil', 'perfil'].includes(normalizeLabel(button.textContent)));

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

  const available = sourceButtons.filter((button) => {
    const label = normalizeLabel(button.textContent);
    return !['dashboard', 'início', 'o meu perfil', 'perfil'].includes(label);
  });

  const labels = available.map((button) => normalizeLabel(button.textContent));
  const isProfessional = labels.includes('alunos');

  const profileShortcut = document.querySelector('.profileShortcut');
  if (profileShortcut && profileButton) {
    profileShortcut.setAttribute('aria-label', 'Abrir o meu perfil');
    profileShortcut.style.setProperty('cursor', 'pointer');

    if (!profileShortcut.dataset.mobileProfileShortcutBound) {
      profileShortcut.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        profileButton.click();
      });
      profileShortcut.dataset.mobileProfileShortcutBound = 'true';
    }
  }

  if (!isProfessional) {
    document.querySelector('.mobileNavOverflowPanel')?.remove();
    const studentPrimaryOrder = ['treino', 'avaliações', 'nutrição', 'desafios', 'atividades'];
    const studentSources = studentPrimaryOrder
      .map((label) => available.find((button) => normalizeLabel(button.textContent) === label))
      .filter(Boolean);

    available.forEach((button) => {
      if (studentSources.length >= 5) return;
      if (!studentSources.includes(button)) studentSources.push(button);
    });

    const layoutKey = `student::${studentSources.map((button) => normalizeLabel(button.textContent)).join('|')}`;
    if (bottomNav.dataset.mobileNavLayout !== layoutKey) {
      const fragment = document.createDocumentFragment();
      studentSources.slice(0, 5).forEach((sourceButton) => fragment.appendChild(cloneNavButton(sourceButton)));
      bottomNav.replaceChildren(fragment);
      bottomNav.dataset.mobileNavLayout = layoutKey;
    }
    syncActiveState(bottomNav, sourceButtons);
    return;
  }

  const preferredPrimary = ['alunos', 'avaliações', 'planos de treino', 'nutrição'];
  const primarySources = preferredPrimary
    .map((label) => available.find((button) => normalizeLabel(button.textContent) === label))
    .filter(Boolean)
    .slice(0, 4);

  available.forEach((button) => {
    if (primarySources.length >= 4) return;
    if (!primarySources.includes(button)) primarySources.push(button);
  });

  const overflowSources = available.filter((button) => !primarySources.includes(button));
  const layoutKey = `${primarySources.map((button) => normalizeLabel(button.textContent)).join('|')}::${overflowSources.map((button) => normalizeLabel(button.textContent)).join('|')}`;

  if (bottomNav.dataset.mobileNavLayout === layoutKey) {
    syncActiveState(bottomNav, sourceButtons);
    return;
  }

  document.querySelector('.mobileNavOverflowPanel')?.remove();

  let panel = null;
  const closePanel = () => {
    if (!panel) return;
    panel.classList.remove('open');
    const menuButton = bottomNav.querySelector('.mobileMoreMenuButton');
    if (menuButton) menuButton.setAttribute('aria-expanded', 'false');
  };

  const togglePanel = (menuButton) => {
    if (!panel) return;
    const willOpen = !panel.classList.contains('open');
    panel.classList.toggle('open', willOpen);
    menuButton.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  };

  const fragment = document.createDocumentFragment();
  primarySources.slice(0, 2).forEach((sourceButton) => fragment.appendChild(cloneNavButton(sourceButton)));
  fragment.appendChild(createMenuButton(togglePanel));
  primarySources.slice(2, 4).forEach((sourceButton) => fragment.appendChild(cloneNavButton(sourceButton)));
  bottomNav.replaceChildren(fragment);
  bottomNav.dataset.mobileNavLayout = layoutKey;

  panel = createOverflowPanel(overflowSources, closePanel);
  document.body.appendChild(panel);

  if (!document.documentElement.dataset.mobileNavOutsideCloseBound) {
    document.addEventListener('click', (event) => {
      const openPanel = document.querySelector('.mobileNavOverflowPanel.open');
      if (!openPanel) return;
      if (openPanel.contains(event.target) || event.target.closest('.mobileMoreMenuButton')) return;
      openPanel.classList.remove('open');
      document.querySelector('.mobileMoreMenuButton')?.setAttribute('aria-expanded', 'false');
    });
    document.documentElement.dataset.mobileNavOutsideCloseBound = 'true';
  }

  syncActiveState(bottomNav, sourceButtons);
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
