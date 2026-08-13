import { supabase } from './supabase';
import { fetchWorkoutPlans } from './training';

const STYLE_ID = 'uf-exercise-completion-style';
let timer = null;
let busy = false;

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function repsFromPrescription(value = '') {
  const match = String(value || '').match(/\d+/);
  return Math.max(1, Number(match?.[0] || 1));
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @media(min-width:901px){
      .trainingExerciseView{display:flex;align-items:center;gap:14px!important;flex-wrap:nowrap!important}
      .trainingExerciseView .trainingExerciseCopy{flex:1;min-width:0}
      .trainingExerciseView .ufInlineLoad{margin-left:auto!important;width:auto!important;grid-column:auto!important;grid-template-columns:repeat(3,104px)!important;flex:0 0 auto}
    }
    .ufInlineLoadCell.current{border-color:rgba(255,216,0,.75)!important;background:rgba(255,216,0,.08)!important}
    .ufInlineLoadCell.current input{height:34px!important;border:1px solid rgba(255,216,0,.75)!important;border-radius:6px!important;background:#17150b!important;padding:0 8px!important;cursor:text!important}
    .ufInlineLoadCell.current input::placeholder{color:#cbbb62!important;font-size:10px!important}
    .ufInlineLoadCell.current input:focus{outline:none!important;border-color:#ffda00!important;box-shadow:0 0 0 3px rgba(255,216,0,.13)!important}
    .ufInlineLoadCell.current:has(input:not(:disabled))::after{content:'EDITAR';font-size:7px;font-weight:900;letter-spacing:.06em;color:#d7c55d;margin-top:2px}
    .ufExerciseDoneButton{width:100%;height:34px;margin:5px 0 10px;border:1px solid rgba(255,216,0,.30);border-radius:7px;background:rgba(255,216,0,.08);color:#ffda00;font:inherit;font-size:11px;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px}
    .ufExerciseDoneButton:hover{background:rgba(255,216,0,.15);border-color:rgba(255,216,0,.55)}
    .ufExerciseDoneButton.done{background:rgba(27,123,69,.16);border-color:rgba(71,210,129,.38);color:#59da92;cursor:default}
    .ufExerciseDoneButton.error{background:rgba(140,26,26,.15);border-color:rgba(255,86,86,.55);color:#ff8c8c}
    .ufInlineLoadCell.current.done{border-color:rgba(71,210,129,.42)!important;background:rgba(27,123,69,.12)!important}
    @media(max-width:900px){.ufExerciseDoneButton{margin-top:6px}}
  `;
  document.head.appendChild(style);
}

async function currentStudentId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return '';
  const { data } = await supabase.from('student_profiles').select('id').eq('profile_id', user.id).maybeSingle();
  return data?.id || '';
}

async function fetchTodayRows(studentId) {
  const { data } = await supabase
    .from('workout_exercise_loads')
    .select('workout_item_id,weight_kg')
    .eq('student_id', studentId)
    .eq('completed_on', todayIso());
  return data || [];
}

function planEntries(plan) {
  return (plan.sessions || []).flatMap(session =>
    (session.blocks || []).flatMap(block =>
      (block.items || []).map(item => ({ item, session }))
    )
  );
}

function parseSuggested(item) {
  const match = String(item?.loadText || '').replace(',', '.').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function markVisualDone(row, button, value) {
  const input = row.querySelector('[data-today-load]');
  if (input) {
    if (value != null && value !== '') input.value = value;
    input.disabled = true;
  }
  const current = row.querySelector('.ufInlineLoadCell.current');
  current?.classList.add('done');
  const label = current?.querySelector('small');
  if (label) label.textContent = 'Feito hoje';
  button.className = 'ufExerciseDoneButton done';
  button.textContent = '✓ Exercício concluído';
  button.disabled = true;
}

async function saveExercise({ row, button, entry, plan, studentId }) {
  const input = row.querySelector('[data-today-load]');
  const raw = String(input?.value || '').trim();
  const weight = raw ? Number(raw.replace(',', '.')) : null;
  const suggested = parseSuggested(entry.item);

  if (suggested != null && (!Number.isFinite(weight) || weight <= 0)) {
    button.classList.add('error');
    button.textContent = 'Introduz primeiro o peso realizado';
    input?.focus();
    setTimeout(() => {
      button.classList.remove('error');
      button.textContent = '✓ Marcar como feito';
    }, 2400);
    return;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  button.disabled = true;
  button.textContent = 'A guardar…';

  const { error } = await supabase.from('workout_exercise_loads').insert({
    student_id: studentId,
    completion_id: null,
    plan_id: plan.id,
    session_id: entry.session.id,
    workout_item_id: entry.item.id,
    exercise_id: entry.item.exercise?.id || null,
    exercise_name: entry.item.exercise?.name || entry.item.manualName || 'Exercício',
    muscle_group: entry.item.exercise?.group || 'Outro',
    weight_kg: Number.isFinite(weight) && weight > 0 ? weight : null,
    sets_completed: Math.max(1, Number(entry.item.sets) || 1),
    reps_completed: repsFromPrescription(entry.item.reps),
    completed_on: todayIso(),
    source: 'student',
    created_by: user.id,
  });

  if (error) {
    button.disabled = false;
    button.classList.add('error');
    button.textContent = error.code === '23505' ? 'Este exercício já foi registado hoje' : 'Não foi possível guardar';
    setTimeout(() => {
      button.classList.remove('error');
      button.textContent = '✓ Marcar como feito';
    }, 2600);
    return;
  }

  markVisualDone(row, button, weight);
}

async function update() {
  if (busy) return;
  busy = true;
  try {
    ensureStyle();
    const planId = new URLSearchParams(location.search).get('plano') || '';
    const viewer = document.querySelector('.trainingViewer');
    if (!planId || !viewer) return;

    const plans = await fetchWorkoutPlans();
    const plan = plans.find(item => item.id === planId);
    if (!plan) return;

    const studentId = await currentStudentId();
    const editable = Boolean(studentId && studentId === plan.studentId);
    if (!editable) return;

    const todayRows = await fetchTodayRows(studentId);
    const todayMap = new Map(todayRows.map(row => [row.workout_item_id, row]));
    const entries = planEntries(plan);
    const rows = [...viewer.querySelectorAll('.trainingExerciseView')];

    rows.forEach((row, index) => {
      const entry = entries[index];
      if (!entry?.item?.id) return;

      let button = row.nextElementSibling?.classList?.contains('ufExerciseDoneButton') ? row.nextElementSibling : null;
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'ufExerciseDoneButton';
        row.insertAdjacentElement('afterend', button);
      }

      const recorded = todayMap.get(entry.item.id);
      if (recorded) {
        markVisualDone(row, button, recorded.weight_kg);
        return;
      }

      button.disabled = false;
      button.className = 'ufExerciseDoneButton';
      button.textContent = '✓ Marcar como feito';
      if (button.dataset.bound === '1') return;
      button.dataset.bound = '1';
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        saveExercise({ row, button, entry, plan, studentId });
      });
    });
  } finally {
    busy = false;
  }
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(update, 180);
}

export function startTrainingExerciseCompletionEnhancer() {
  if (window.__ufExerciseCompletionEnhancer) return;
  window.__ufExerciseCompletionEnhancer = true;
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  window.addEventListener('focus', schedule);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  schedule();
}
