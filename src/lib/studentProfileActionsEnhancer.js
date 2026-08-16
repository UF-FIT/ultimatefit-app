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

function actionByText(actions, text) {
  return Array.from(actions.querySelectorAll(':scope > button')).find((button) =>
    button.textContent.toLowerCase().includes(text.toLowerCase()),
  );
}

function setActionVisible(button, visible) {
  if (!button) return;
  button.style.setProperty('display', visible ? 'flex' : 'none', 'important');
}

function applyStudentProfileActions() {
  const page = document.querySelector('.studentSelfProfilePage');
  if (!page) return;
  const actions = page.querySelector('.studentSelfHero .selfActions');
  if (!actions) return;

  if (!isMobileStudentLayout()) {
    actions.style.removeProperty('display');
    delete actions.dataset.studentRouteActions;
    Array.from(actions.querySelectorAll(':scope > button')).forEach((button) => button.style.removeProperty('display'));
    closePasswordModal();
    return;
  }

  const isProfile = profileRouteActive();
  const editButton = actionByText(actions, 'Editar perfil');
  const professorButton = actionByText(actions, 'Falar com o professor');
  const exportButton = actionByText(actions, 'Exportar avaliação');
  const passwordButton = ensurePasswordButton(actions);

  actions.style.setProperty('display', 'grid', 'important');
  actions.dataset.studentRouteActions = isProfile ? 'profile' : 'dashboard';

  // PDF export belongs exclusively to the Avaliações section.
  setActionVisible(exportButton, false);

  if (isProfile) {
    setActionVisible(editButton, true);
    setActionVisible(professorButton, false);
    setActionVisible(passwordButton, true);
  } else {
    setActionVisible(editButton, false);
    setActionVisible(professorButton, true);
    setActionVisible(passwordButton, false);
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
