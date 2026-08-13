const INLINE_ID = 'uf-training-editor-inline-error';
const TOAST_ID = 'uf-training-editor-error-toast';
const INVALID_CLASS = 'uf-training-field-invalid';

let started = false;
let observer = null;
let toastTimer = null;
let lastMirroredError = '';

function isPlanActionButton(button) {
  const text = String(button?.textContent || '').toLowerCase();
  return text.includes('publicar') || text.includes('guardar rascunho');
}

function actionLabel(button) {
  const text = String(button?.textContent || '').toLowerCase();
  return text.includes('publicar') ? 'publicar o plano' : 'guardar o rascunho';
}

function clearFieldHighlights(editor) {
  editor?.querySelectorAll(`.${INVALID_CLASS}`).forEach(node => node.classList.remove(INVALID_CLASS));
}

function findField(editor, labelStartsWith) {
  const labels = Array.from(editor?.querySelectorAll('label') || []);
  const wanted = labelStartsWith.toLowerCase();
  const label = labels.find(item => {
    const text = String(item.textContent || '').trim().toLowerCase();
    return text.startsWith(wanted);
  });
  return label?.querySelector('input,select,textarea') || null;
}

function validationFor(editor) {
  const studentField = findField(editor, 'aluno');
  const titleField = findField(editor, 'título do plano');

  if (studentField && !String(studentField.value || '').trim()) {
    return { message: 'Seleciona o aluno.', field: studentField };
  }
  if (titleField && !String(titleField.value || '').trim()) {
    return { message: 'Indica o nome do plano.', field: titleField };
  }
  return null;
}

function removeInline() {
  document.getElementById(INLINE_ID)?.remove();
  document.querySelector('.trainingStickyActions')?.classList.remove('uf-training-editor-actions-with-error');
}

function showToast(message, action = 'continuar') {
  document.getElementById(TOAST_ID)?.remove();
  window.clearTimeout(toastTimer);
  const toast = document.createElement('div');
  toast.id = TOAST_ID;
  toast.innerHTML = `<span aria-hidden="true">⚠</span><div><b>Não foi possível ${action}</b><span>${message}</span></div>`;
  document.body.appendChild(toast);
  toastTimer = window.setTimeout(() => toast.remove(), 5200);
}

function showInline(message, action = 'continuar') {
  const editor = document.querySelector('.trainingEditor');
  if (!editor) return;
  const actions = editor.querySelector('.trainingStickyActions');
  if (!actions) return;
  removeInline();
  actions.classList.add('uf-training-editor-actions-with-error');
  const node = document.createElement('div');
  node.id = INLINE_ID;
  node.innerHTML = `<span aria-hidden="true">⚠</span><div><strong>Falta corrigir antes de ${action}</strong><span>${message}</span></div>`;
  actions.prepend(node);
}

function focusInvalidField(field) {
  if (!field) return;
  field.classList.add(INVALID_CLASS);
  window.setTimeout(() => {
    field.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => {
      try { field.focus({ preventScroll: true }); } catch { field.focus(); }
    }, 260);
  }, 30);
}

function presentError(message, action, field = null) {
  const editor = document.querySelector('.trainingEditor');
  clearFieldHighlights(editor);
  showInline(message, action);
  showToast(message, action);
  focusInvalidField(field);
}

function handleActionClick(event) {
  const button = event.target.closest('button');
  if (!button || !isPlanActionButton(button)) return;
  const editor = button.closest('.trainingEditor');
  if (!editor) return;

  clearFieldHighlights(editor);
  removeInline();
  lastMirroredError = '';

  const validation = validationFor(editor);
  if (!validation) return;

  // Intercept invalid submissions before React handles the click. This avoids
  // the confusing state where the button appears to do nothing while the only
  // error message is rendered far above the current viewport.
  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
  presentError(validation.message, actionLabel(button), validation.field);
}

function mirrorReactError() {
  const editor = document.querySelector('.trainingEditor');
  if (!editor) {
    removeInline();
    lastMirroredError = '';
    return;
  }
  const banner = Array.from(editor.children).find(child => child.classList?.contains('errorBanner'));
  const message = String(banner?.textContent || '').trim();
  if (!message || message === lastMirroredError) return;
  lastMirroredError = message;

  let field = null;
  const lower = message.toLowerCase();
  if (lower.includes('aluno')) field = findField(editor, 'aluno');
  else if (lower.includes('nome do plano') || lower.includes('título')) field = findField(editor, 'título do plano');

  presentError(message, 'guardar o plano', field);
}

export function startTrainingEditorErrorEnhancer() {
  if (started) return;
  started = true;
  document.addEventListener('click', handleActionClick, true);
  document.addEventListener('input', event => {
    const editor = event.target.closest?.('.trainingEditor');
    if (!editor) return;
    event.target.classList.remove(INVALID_CLASS);
    if (!validationFor(editor)) removeInline();
  }, true);
  observer = new MutationObserver(() => window.requestAnimationFrame(mirrorReactError));
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
}
