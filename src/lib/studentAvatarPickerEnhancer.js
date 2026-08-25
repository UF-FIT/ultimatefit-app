const DEFAULT_AVATAR_SVG = `
<svg viewBox="0 0 160 160" aria-hidden="true">
  <circle cx="80" cy="53" r="31" fill="currentColor"/>
  <path d="M34 132c0-30 20-49 46-49s46 19 46 49c0 4-3 7-7 7H41c-4 0-7-3-7-7Z" fill="currentColor"/>
</svg>`;

const EDIT_BADGE_SVG = `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M12 20h9"/>
  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/>
</svg>`;

function currentStudentAvatar() {
  const selectors = [
    '.studentProfileHero .studentPhoto.large img',
    '.studentProfileHero .studentPhoto img',
    '.studentProfilePage .studentPhoto.large img',
    '.studentProfilePage .studentPhoto img',
  ];
  for (const selector of selectors) {
    const image = document.querySelector(selector);
    if (image?.src) return image.src;
  }
  return '';
}

function setPreview(preview, src) {
  preview.innerHTML = '';
  if (src) {
    const image = document.createElement('img');
    image.src = src;
    image.alt = 'Fotografia do aluno';
    preview.appendChild(image);
  } else {
    const placeholder = document.createElement('span');
    placeholder.className = 'studentAvatarDefaultIcon';
    placeholder.innerHTML = DEFAULT_AVATAR_SVG;
    preview.appendChild(placeholder);
  }

  const badge = document.createElement('span');
  badge.className = 'studentAvatarEditBadge';
  badge.innerHTML = EDIT_BADGE_SVG;
  preview.appendChild(badge);
}

function enhancePicker(picker) {
  if (!picker || picker.dataset.avatarPickerV2 === 'true') return;
  const input = picker.querySelector('input[type="file"]');
  if (!input) return;

  picker.dataset.avatarPickerV2 = 'true';
  picker.classList.add('studentAvatarPickerV2');

  const preview = document.createElement('button');
  preview.type = 'button';
  preview.className = 'studentAvatarPreviewButton';
  preview.setAttribute('aria-label', 'Alterar fotografia');
  setPreview(preview, currentStudentAvatar());
  picker.prepend(preview);

  preview.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    input.click();
  });

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPreview(preview, String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

function enhanceAll() {
  document.querySelectorAll('.studentForm .photoPicker').forEach(enhancePicker);
}

export function startStudentAvatarPickerEnhancer() {
  if (typeof document === 'undefined') return;
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      enhanceAll();
    });
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  schedule();
}
