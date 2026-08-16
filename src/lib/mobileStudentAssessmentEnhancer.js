import { supabase } from './supabase';
import { fetchAssessments, assessmentMetrics } from './assessments';
import { fetchStudents } from './students';

const CACHE_MS = 15000;
let cache = { at: 0, students: [], assessments: [] };
let loadingPromise = null;

function isMobile() {
  return typeof window !== 'undefined' && window.innerWidth <= 760;
}

function formatValue(value, unit = '') {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
  return `${value}${unit ? ` ${unit}` : ''}`;
}

async function loadData() {
  const now = Date.now();
  if (cache.students.length && now - cache.at < CACHE_MS) return cache;
  if (loadingPromise) return loadingPromise;

  loadingPromise = Promise.all([fetchStudents(), fetchAssessments()])
    .then(([students, assessments]) => {
      cache = { at: Date.now(), students: students || [], assessments: assessments || [] };
      return cache;
    })
    .finally(() => { loadingPromise = null; });

  return loadingPromise;
}

function metricCard(label, current, previous, unit = '') {
  const card = document.createElement('div');
  card.className = 'assessmentEnhancedMetricCard';
  card.innerHTML = `<small>${label}</small><b>${formatValue(current, unit)}</b><span class="assessmentPreviousValue">Anterior: ${formatValue(previous, unit)}</span>`;
  return card;
}

function resizeStudentPhoto(home) {
  const identity = home.querySelector('.assessmentStudentIdentity');
  const avatar = identity?.querySelector('.assessmentStudentAvatar');
  const copy = identity?.querySelector(':scope > div:last-child');
  if (!identity || !avatar || !copy) return;

  const height = Math.max(92, Math.round(copy.getBoundingClientRect().height));
  avatar.style.setProperty('--assessment-mobile-avatar-size', `${height}px`);
}

function renderMetricCards(home, student, published) {
  const grid = home.querySelector('.assessmentMetricCards');
  if (!grid) return;

  const latest = published.at(-1) || null;
  const previous = published.length > 1 ? published.at(-2) : null;
  const signature = `${student?.id || ''}|${student?.sex || ''}|${latest?.id || 'none'}|${previous?.id || 'none'}`;
  if (grid.dataset.mobileAssessmentSignature === signature && grid.querySelector('.assessmentPreviousValue')) return;

  const latestMetrics = assessmentMetrics(latest);
  const previousMetrics = assessmentMetrics(previous);
  const latestPer = latest?.modules?.perimetry || {};
  const previousPer = previous?.modules?.perimetry || {};

  const dateCard = document.createElement('div');
  dateCard.className = 'assessmentEnhancedMetricCard assessmentDateMetricCard';
  const dateLabel = latest?.date ? new Intl.DateTimeFormat('pt-PT').format(new Date(`${latest.date}T12:00:00`)) : '—';
  dateCard.innerHTML = `<small>Última avaliação</small><b>${dateLabel}</b>`;

  const cards = [
    dateCard,
    metricCard('Peso', latestMetrics.weight, previousMetrics.weight, 'kg'),
    metricCard('Massa gorda', latestMetrics.fat, previousMetrics.fat, '%'),
    metricCard('Massa muscular', latestMetrics.muscle, previousMetrics.muscle, 'kg'),
  ];

  const sex = String(student?.sex || '').toLowerCase();
  const female = sex === 'female' || sex === 'feminino' || sex === 'f';
  const male = sex === 'male' || sex === 'masculino' || sex === 'm';

  if (female) {
    cards.push(metricCard('Cintura', latestMetrics.waist, previousMetrics.waist, 'cm'));
    cards.push(metricCard('Abdominal', latestPer.abdominal_cm, previousPer.abdominal_cm, 'cm'));
  } else if (male) {
    cards.push(metricCard('Peitoral', latestPer.chest_cm, previousPer.chest_cm, 'cm'));
    cards.push(metricCard('Abdominal', latestPer.abdominal_cm, previousPer.abdominal_cm, 'cm'));
  }

  grid.replaceChildren(...cards);
  grid.dataset.mobileAssessmentEnhanced = 'true';
  grid.dataset.mobileAssessmentSignature = signature;
}

async function enhance() {
  if (!isMobile()) return;
  const home = document.querySelector('.assessmentStudentHome');
  if (!home) return;

  resizeStudentPhoto(home);

  try {
    const [{ data: authData }, data] = await Promise.all([
      supabase.auth.getUser(),
      loadData(),
    ]);
    const userId = authData?.user?.id;
    if (!userId) return;

    const student = data.students.find(item => item.userId === userId || item.profileId === userId);
    if (!student) return;

    const published = data.assessments
      .filter(item => item.studentId === student.id && item.status === 'published')
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));

    renderMetricCards(home, student, published);
    requestAnimationFrame(() => resizeStudentPhoto(home));
  } catch (error) {
    console.warn('Mobile assessment enhancer:', error);
  }
}

function scrollAssessmentDetailToTop() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });
  });
}

export function startMobileStudentAssessmentEnhancer() {
  if (typeof window === 'undefined') return;

  let queued = false;
  const run = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      enhance();
    });
  };

  run();
  window.addEventListener('resize', run);
  window.addEventListener('popstate', run);

  document.addEventListener('click', event => {
    if (!isMobile()) return;
    const button = event.target.closest('.assessmentStudentHome .assessmentHistoryActions button');
    if (!button) return;
    const label = (button.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (label === 'ver') scrollAssessmentDetailToTop();
  }, true);

  const observer = new MutationObserver(run);
  observer.observe(document.body, { childList: true, subtree: true });
}
