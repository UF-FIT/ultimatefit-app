import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const lib = readFileSync(new URL('../src/lib/studentWorkoutRuns.js', import.meta.url), 'utf8');
const module = await import(`data:text/javascript,${encodeURIComponent(lib.replace("import { supabase } from './supabase';", 'const supabase = null;'))}`);
const runner = readFileSync(new URL('../src/components/StudentTrainingExperience.jsx', import.meta.url), 'utf8');
function activity(extra = {}) {
  return { status: 'active', restSeconds: 45, sets: [{ index: 1, reps: 12, weightKg: 20, completed: true, completedAt: '2026-10-20T10:00:00Z' }], ...extra };
}
function flow(activities) {
  const state = { activities, currentIndex: 0, rest: {} };
  const context = { activities, state, summary: false, Date, patchState: fn => fn(state), setSummaryOpen: value => { context.summary = value; }, window: { setTimeout: fn => fn() } };
  vm.createContext(context);
  // Execute the actual event handlers without rendering or touching production data.
  vm.runInContext(runner.slice(runner.indexOf('  function requestComplete('), runner.indexOf('  function skipActivity(')), context);
  return context;
}
test('guided mode completes directly, retains series values and starts rest/next activity', () => {
  const first = activity();
  const originalSets = structuredClone(first.sets);
  const ctx = flow([first, activity({ status: 'pending' })]);
  ctx.requestComplete(0, false);
  assert.equal(first.status, 'completed');
  assert.deepEqual(first.sets, originalSets);
  assert.equal(ctx.state.currentIndex, 1);
  assert.equal(ctx.state.activities[1].status, 'active');
  assert.equal(ctx.state.rest.active, true);
  assert.equal(ctx.summary, false);
  assert.ok(!('rpe' in first));
});
test('guided mode cannot bypass incomplete sets', () => {
  const first = activity({ sets: [{ completed: false, reps: 8, weightKg: 10 }] });
  const ctx = flow([first]);
  ctx.requestComplete(0, false);
  assert.equal(first.status, 'active');
  assert.equal(ctx.summary, false);
});
test('simplified mode completes all sets and opens summary on last activity', () => {
  const first = activity({ sets: [{ completed: false, reps: 8, weightKg: 10, durationSeconds: 30 }] });
  const ctx = flow([first]);
  ctx.requestComplete(0, true);
  assert.equal(first.status, 'completed');
  assert.equal(first.sets[0].completed, true);
  assert.equal(first.sets[0].durationSeconds, 30);
  assert.equal(first.sets[0].weightKg, 10);
  assert.equal(first.sets[0].reps, 8);
  assert.equal(ctx.state.rest.active, false);
  assert.equal(ctx.summary, true);
});
test('manual/cardio/timed activities complete without an effort prompt', () => {
  for (const type of ['manual', 'cardio', 'timed']) {
    const item = activity({ type, sets: type === 'manual' ? [] : activity().sets });
    const ctx = flow([item]);
    ctx.requestComplete(0, false);
    assert.equal(item.status, 'completed');
    assert.equal(ctx.summary, true);
  }
});
test('resuming an older run removes only retired effort fields from activities', () => {
  const old = module.normaliseRunState({ activities: [activity({ rpe: 8, prescribedRpe: 7, notes: 'Keep', durationSeconds: 30 })] });
  const expected = structuredClone(old);
  old.activities[0].rpe = 8;
  old.activities[0].prescribedRpe = 7;
  assert.deepEqual(module.normaliseRunState(old), expected);
  assert.equal(old.activities[0].rpe, 8); // no mutation
});
test('summary preserves completion, duration, sets and volume without RPE', () => {
  assert.deepEqual(module.workoutRunSummary({ activities: [activity({ status: 'completed', rpe: 9 }), activity({ status: 'skipped' })] }, 123), {
    durationSeconds: 123, totalActivities: 2, completedActivities: 1, skippedActivities: 1, pendingActivities: 0, completedSets: 1, completionPercent: 50, volumeKg: 240,
  });
});
test('new runs do not carry prescribed or reported RPE', () => {
  const state = module.buildWorkoutRunState({ id: 'plan' }, { id: 'session', blocks: [{ items: [{ id: 'item', rpe: 8, sets: 2, reps: '12', loadText: '20 kg', exercise: { id: 'exercise', name: 'Squat' } }] }] });
  assert.equal(state.activities[0].sets.length, 2);
  assert.equal(state.activities[0].sets[0].weightKg, 20);
  assert.ok(!('rpe' in state.activities[0]));
  assert.ok(!('prescribedRpe' in state.activities[0]));
});
