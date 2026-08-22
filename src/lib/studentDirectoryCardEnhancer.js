import { fetchStudents, studentStatusLabels } from './students';

let cache = [];
let lastFetch = 0;
let running = false;
let queued = false;

async function getStudents() {
  const now = Date.now();
  if (cache.length && now - lastFetch < 5000) return cache;
  cache = await fetchStudents();
  lastFetch = now;
  return cache;
}

function statusClass(student) {
  if (student.status === 'archived') return 'archived';
  return student.active ? 'active' : 'inactive';
}

function pageContent() {
  return document.querySelector('.content');
}

function setPreparing(preparing) {
  const content = pageContent();
  if (!content) return;
  content.classList.toggle('student-directory-preparing', preparing);
}

function ensureFilterToggle() {
  const filters = document.querySelector('.studentFilters');
  const search = filters?.querySelector('.search');
  if (!filters || !search || search.querySelector('.studentFilterToggle')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'studentFilterToggle';
  button.setAttribute('aria-label', 'Mostrar filtros');
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h8M16 18h4"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="14" cy="18" r="2"/></svg>';
  button.addEventListener('click', () => {
    const open = filters.classList.toggle('filtersOpen');
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Ocultar filtros' : 'Mostrar filtros');
  });
  search.appendChild(button);
}

function enhanceCard(card, students) {
  const identity = card.querySelector('.studentCardIdentity');
  const name = identity?.querySelector('h3')?.textContent?.trim();
  if (!identity || !name) return false;
  const student = students.find(item => item.name === name);
  if (!student) return false;

  let compact = identity.querySelector('.studentDirectoryCompactStatus');
  if (!compact) {
    compact = document.createElement('div');
    compact.className = 'studentDirectoryCompactStatus';
    identity.insertBefore(compact, identity.querySelector('h3'));
  }
  const statusLabel = studentStatusLabels[student.status] || (student.active ? 'Ativo' : 'Inativo');
  compact.innerHTML = `<i class="${statusClass(student)}"></i><span>${statusLabel}</span>`;

  const meta = identity.querySelector('.studentDirectoryCardMeta');
  if (meta) meta.remove();

  if (!card.dataset.mobileCardReady) {
    card.dataset.mobileCardReady = 'true';
    card.tabIndex = 0;
    card.setAttribute('role', 'link');
    const openProfile = event => {
      if (event.target.closest('input, label, button, a, select')) return;
      card.querySelector(':scope > .secondary.full')?.click();
    };
    card.addEventListener('click', openProfile);
    card.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      card.querySelector(':scope > .secondary.full')?.click();
    });
  }
  return true;
}

async function enhance() {
  queued = false;
  const onStudentsPage = window.location.pathname.toLowerCase().startsWith('/alunos');
  if (!onStudentsPage) {
    setPreparing(false);
    return;
  }
  if (running) return;

  const filters = document.querySelector('.studentFilters');
  const cards = [...document.querySelectorAll('.studentDirectoryCard')];
  if (!filters || !cards.length) return;

  setPreparing(true);
  ensureFilterToggle();
  running = true;
  try {
    const students = await getStudents();
    const allReady = cards.every(card => enhanceCard(card, students));
    if (allReady && document.querySelector('.studentFilterToggle')) setPreparing(false);
  } catch {
    setPreparing(false);
  } finally {
    running = false;
  }
}

function scheduleEnhance() {
  if (queued) return;
  queued = true;
  Promise.resolve().then(enhance);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const observer = new MutationObserver(scheduleEnhance);
  const start = () => {
    observer.observe(document.documentElement, { childList: true, subtree: true });
    scheduleEnhance();
    window.addEventListener('popstate', scheduleEnhance);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
