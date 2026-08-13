const INLINE_ID = 'uf-training-editor-inline-error';
const TOAST_ID = 'uf-training-editor-error-toast';
const INVALID_CLASS = 'uf-training-field-invalid';

let observer = null;
let lastError = '';
let lastAction = 'continuar';
let started = false;

function buttonAction(button) {
  const text = String(button?.textContent || '').toLowerCase();
  if (text.includes('publicar')) return 'publicar o plano';
  if (text.includes('ras