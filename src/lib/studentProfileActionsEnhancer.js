import { supabase } from './supabase';

function profileRouteActive() {
  return window.location.pathname.toLowerCase().replace(/\/+$/, '') === '/perfil';
}

function isMobileStudentLayout() {
  return window.matchMedia('(max-width: 760px)').matches;
}

function closePasswordModal() {
  document.querySelector('.studentPasswordOverlay')?.remove();
}

function openPasswordModal() {
  closePasswordModal();

  const overlay = document.createElement('div');
  overlay.className = 'overlay studentPasswordOverlay';
  overlay.innerHTML = `
    <div class="modal studentPasswordModal" role="dialog" aria-modal="true" aria-labelledby="student-password-title">
      <div class="title">
        <div>
          <span class="eyebrow">SEGURANÇA</span>
          <h2 id="student-password-title">Alterar palavra-passe</h2>
        </div>
        <button type="button" class="iconButton studentPasswordClose" aria-label="Fechar">×</button>
      </div>
      <form class="studentPasswordForm">
        <label>Palavra-passe atual
          <input name="currentPassword" type="password" autocomplete="current-password" required minlength="6" />
        </label>
        <label>Nova palavra-passe
          <input name="newPassword" type="password" autocomplete="new-password" required minlength="8" />
        </label>
        <label>Confirmar nova palavra-passe
          <input name="confirmPassword" type="password" autocomplete="new-password" required minlength="8" />
        </label>
        <div class="studentPasswordMessage" aria-live="polite"></div>
        <div class="modalActions">
          <button type="button" class="secondary studentPasswordCancel">Cancelar</button>
          <button type="submit" class="primary">Guardar nova palavra-passe</button>
        </div>
      </form>
    </div>`;

  const form = overlay.querySelector('.studentPasswordForm');
  const message = overlay.querySelector('.studentPasswordMessage');
  const submit = form.querySelector('button[type="submit"]');

  overlay.querySelector('.studentPasswordClose').addEventListener('click', closePasswordModal);
  overlay.querySelector('.studentPasswordCancel').addEventListener('click', closePasswordModal);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) closePasswordModal(); });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.textContent = '';
    message.className = 'studentPasswordMessage';

    const values = new FormData(form);
    const currentPassword = String(values.get('currentPassword') || '');
    const newPassword = String(values.get('newPassword') || '');
    const confirmPassword = String(values.get('confirmPassword') || '');

    if (newPassword.length < 8) {
      message.textContent = 'A nova palavra-passe deve ter pelo menos 8 caracteres.';
      message.classList.add('error');
      return;
    }
    if (newPassword !== confirmPassword) {
      message.textContent = 'A confirmação não coincide com a nova palavra-passe.';
      message.classList.add('error');
      return;
    }
    if (newPassword === currentPassword) {
      message.textContent = 'Escolhe uma nova palavra-passe diferente da atual.';
      message.classList.add('error');
      return;
    }
    if (!supabase) {
      message.textContent = 'Não foi possível ligar ao serviço de autenticação.';
      message.classList.add('error');
      return;
    }

    submit.disabled = true;
    submit.textContent = 'A guardar…';
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user?.email) throw new Error('Não foi possível validar a conta atual.');

      const verification = await supabase.auth.signInWithPassword({
        email: userData.user.email,
        password: currentPassword,
      });
      if (verification.error) throw new Error('A palavra-passe atual está incorreta.');

      const update = await supabase.auth.updateUser({ password: newPassword });
      if (update.error) throw update.error;

      try { await supabase.auth.signOut({ scope: 'others' }); } catch {}
      form.reset();
      message.textContent = 'Palavra-passe alterada com sucesso.';
      message.classList.add('success');
      window.setTimeout(closePasswordModal, 1200);
    } catch (error) {
      message.textContent = error?.message || 'Não foi possível alterar a palavra-passe.';
      message.classList.add('error');
    } finally {
      submit.disabled = false;
      submit.textContent = 'Guardar nova palavra-passe';
    }
  });

  document.body.appendChild(overlay);
}

function ensurePasswordButton(actions) {
  let button = actions.querySelector('[data-student-password-action="true"]');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.dataset.studentPasswordAction = 'true';
    button.innerHTML = '<span class="studentPasswordIcon" aria-hidden="true">⌁</span><span>Alterar palavra-passe</span>';
    button.addEventListener('click', openPasswordModal);
    actions.appendChild(button);
  }
  return button;
}

function actionByText(root, text) {
  return Array.from(root.querySelectorAll('button')).find((button) =>
    button.textContent.toLowerCase().includes(text.toLowerCase()),
  );
}

function setActionVisible(button, visible) {
  if (!button) return;
  button.style.setProperty('display', visible ? 'flex' : 'none', 'important');
}

function restoreProfessorButton(actions, button) {
  if (!button) return;
  if (button.parentElement !== actions) actions.insertBefore(button, actions.querySelector('[data-student-password-action="true"]'));
  button.classList.remove('studentDashboardProfessorAction');
  ['position','top','right','left','bottom','width','min-height','padding','border-radius','z-index','font-size'].forEach((name) => button.style.removeProperty(name));
}

function placeProfessorButtonOnDashboard(hero, button) {
  if (!button) return;
  if (button.parentElement !== hero) hero.appendChild(button);
  button.classList.add('studentDashboardProfessorAction');
  hero.style.setProperty('position', 'relative', 'important');
  button.style.setProperty('display', 'inline-flex', 'important');
  button.style.setProperty('position', 'absolute', 'important');
  button.style.setProperty('top', '28px', 'important');
  button.style.setProperty('right', '28px', 'important');
  button.style.setProperty('left', 'auto', 'important');
  button.style.setProperty('bottom', 'auto', 'important');
  button.style.setProperty('width', '180px', 'important');
  button.style.setProperty('min-height', '46px', 'important');
  button.style.setProperty('padding', '8px 12px', 'important');
  button.style.setProperty('border-radius', '10px', 'important');
  button.style.setProperty('z-index', '3', 'important');
  button.style.setProperty('font-size', '13px', 'important');
}

function forceProfileButtonsSideBySide(actions, editButton, passwordButton) {
  actions.style.setProperty('display', 'grid', 'important');
  actions.style.setProperty('grid-template-columns', 'minmax(0, 1fr) minmax(0, 1fr)', 'important');
  actions.style.setProperty('gap', '8px', 'important');
  actions.style.setProperty('width', '100%', 'important');

  [editButton, passwordButton].forEach((button) => {
    if (!button) return;
    button.style.setProperty('display', 'flex', 'important');
    button.style.setProperty('grid-column', 'auto', 'important');
    button.style.setProperty('width', '100%', 'important');
    button.style.setProperty('min-width', '0', 'important');
    button.style.setProperty('min-height', '52px', 'important');
    button.style.setProperty('padding', '8px 10px', 'important');
    button.style.setProperty('font-size', '12px', 'important');
    button.style.setProperty('line-height', '1.15', 'important');
  });
}

function applyStudentProfileActions() {
  const page = document.querySelector('.studentSelfProfilePage');
  if (!page) return;
  const hero = page.querySelector('.studentSelfHero');
  const actions = hero?.querySelector('.selfActions');
  if (!hero || !actions) return;

  const professorButton = actionByText(hero, 'Falar com o professor');

  if (!isMobileStudentLayout()) {
    restoreProfessorButton(actions, professorButton);
    actions.style.removeProperty('display');
    actions.style.removeProperty('grid-template-columns');
    actions.style.removeProperty('gap');
    actions.style.removeProperty('width');
    delete actions.dataset.studentRouteActions;
    Array.from(actions.querySelectorAll(':scope > button')).forEach((button) => {
      ['display','grid-column','width','min-width','min-height','padding','font-size','line-height'].forEach((name) => button.style.removeProperty(name));
    });
    closePasswordModal();
    return;
  }

  const isProfile = profileRouteActive();
  const editButton = actionByText(hero, 'Editar perfil');
  const exportButton = actionByText(hero, 'Exportar avaliação');
  const passwordButton = ensurePasswordButton(actions);

  actions.dataset.studentRouteActions = isProfile ? 'profile' : 'dashboard';
  setActionVisible(exportButton, false);

  if (isProfile) {
    restoreProfessorButton(actions, professorButton);
    setActionVisible(professorButton, false);
    forceProfileButtonsSideBySide(actions, editButton, passwordButton);
  } else {
    setActionVisible(editButton, false);
    setActionVisible(passwordButton, false);
    actions.style.setProperty('display', 'none', 'important');
    placeProfessorButtonOnDashboard(hero, professorButton);
    closePasswordModal();
  }
}

export function startStudentProfileActionsEnhancer() {
  if (typeof window === 'undefined') return;
  let queued = false;
  const run = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      applyStudentProfileActions();
    });
  };

  run();
  window.addEventListener('popstate', run);
  window.addEventListener('resize', run);
  const observer = new MutationObserver(run);
  observer.observe(document.body, { childList: true, subtree: true });
}
