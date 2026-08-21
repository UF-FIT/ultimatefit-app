const cardioBoundInputs = new WeakSet();

function setReactInputValue(input, value) {
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function isCardioItem(editor) {
  const meta = editor.querySelector('.selectedExerciseCard');
  if (!meta) return false;

  const groupMeta = meta.querySelector('small')?.textContent || '';
  if (/\bcardio\b/i.test(groupMeta)) return true;

  return /\bcardio\b/i.test(meta.textContent || '');
}

function labelByText(editor, text) {
  return [...editor.querySelectorAll('.trainingPrescriptionGrid > label')]
    .find(label => (label.childNodes[0]?.textContent || '').trim() === text);
}

function prepareCardioItem(editor) {
  const durationLabel = labelByText(editor, 'Duração (seg)') || labelByText(editor, 'Duração (min)');
  const durationInput = durationLabel?.querySelector('input');
  if (!durationLabel || !durationInput) return;

  durationLabel.childNodes[0].textContent = 'Duração (min)';
  durationLabel.classList.add('cardioDurationField');

  if (!durationInput.dataset.cardioMinutes) {
    durationInput.dataset.cardioMinutes = 'true';
    const seconds = Number(durationInput.value);
    if (Number.isFinite(seconds) && seconds > 0) durationInput.value = String(seconds / 60);

    if (!cardioBoundInputs.has(durationInput)) {
      cardioBoundInputs.add(durationInput);
      durationInput.addEventListener('input', event => {
        if (event.__ufCardioConverted) return;
        const minutes = Number(event.target.value);
        if (!Number.isFinite(minutes)) return;
        const secondsValue = minutes === 0 ? '' : String(Math.round(minutes * 60));
        const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        descriptor?.set?.call(event.target, secondsValue);
        event.__ufCardioConverted = true;
        setTimeout(() => {
          if (!event.target.isConnected || event.target.dataset.cardioMinutes !== 'true') return;
          const storedSeconds = Number(event.target.value);
          if (Number.isFinite(storedSeconds) && storedSeconds > 0) event.target.value = String(storedSeconds / 60);
        }, 0);
      }, true);
    }
  }

  if (!editor.dataset.cardioCleaned) {
    ['Séries', 'Repetições', 'Descanso (seg)', 'Tempo', 'Carga'].forEach(name => {
      const input = labelByText(editor, name)?.querySelector('input');
      if (input?.value) setReactInputValue(input, '');
    });
    editor.dataset.cardioCleaned = 'true';
  }

  ['Séries', 'Repetições', 'Descanso (seg)', 'Tempo', 'Carga'].forEach(name => {
    labelByText(editor, name)?.classList.add('ufCardioHiddenField');
  });
}

function restoreStrengthItem(editor) {
  const durationLabel = labelByText(editor, 'Duração (min)');
  const durationInput = durationLabel?.querySelector('input');
  if (durationLabel && durationInput?.dataset.cardioMinutes) {
    const minutes = Number(durationInput.value);
    if (Number.isFinite(minutes) && minutes > 0) durationInput.value = String(Math.round(minutes * 60));
    durationLabel.childNodes[0].textContent = 'Duração (seg)';
    durationLabel.classList.remove('cardioDurationField');
    delete durationInput.dataset.cardioMinutes;
  }
  editor.querySelectorAll('.ufCardioHiddenField').forEach(label => label.classList.remove('ufCardioHiddenField'));
  delete editor.dataset.cardioCleaned;
}

function enhanceTrainingPrescription() {
  document.querySelectorAll('.trainingItemEditor').forEach(editor => {
    const rpe = labelByText(editor, 'RPE');
    if (rpe) rpe.remove();
    if (isCardioItem(editor)) prepareCardioItem(editor);
    else restoreStrengthItem(editor);
  });
}

let observer;
export function startTrainingPrescriptionEnhancer() {
  enhanceTrainingPrescription();
  observer?.disconnect();
  observer = new MutationObserver(enhanceTrainingPrescription);
  observer.observe(document.body, { childList: true, subtree: true });
}
