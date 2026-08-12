import { fetchStudents, studentStatusLabels } from './students';

let cache = [];
let lastFetch = 0;
let timer = null;
let running = false;

function formatDate(value) {
  if (!value) return '—';
  try { return new Intl.DateTimeFormat('pt-PT').format(new Date(`${value}T12:00:00`)); }
  catch { return '—'; }
}

async function getStudents() {
  const now = Date.now();
  if (cache.length && now - lastFetch < 2000) return cache;
  cache = await fetchStudents();
  lastFetch = now;
  return cache;
}

function statusClass(student) {
  if (student.status === 'archived') return 'archived';
  return student.active ? 'active' : 'inactive';
}

function enhanceCard(card, students) {
  const identity = card.querySelector('.studentCardIdentity');
  const name = identity?.querySelector('h3')?.textContent?.trim();
  if (!identity || !name) return;
  const student = students.find(item => item.name === name);
  if (!student) return;

  let meta = identity.querySelector('.studentDirectoryCardMeta');
  if (!meta) {
    meta = document.createElement('div');
    meta.className = 'studentDirectoryCardMeta';
    identity.appendChild(meta);
  }

  const statusLabel = studentStatusLabels[student.status] || (student.active ? 'Ativo' : 'Inativo');
  meta.innerHTML = `
    <div><span>Data de nascimento</span><b>${formatDate(student.birth)}</b></div>
    <div><span>Idade</span><b>${student.age ?? '—'} anos</b></div>
    <div><span>Estado</span><b class="studentDirectoryStatus ${statusClass(student)}">${statusLabel}</b></div>
    <div><span>N.º aluno</span><b>${student.studentCode || '—'}</b></div>
  `;
}

async function enhance() {
  if (running || !window.location.pathname.toLowerCase().startsWith('/alunos')) return;
  const cards = [...document.querySelectorAll('.studentDirectoryCard')];
  if (!cards.length) return;
  running = true;
  try {
    const students = await getStudents();
    cards.forEach(card => enhanceCard(card, students));
  } catch {
    // A listagem React continua funcional mesmo que este enriquecimento visual falhe.
  } finally {
    running = false;
  }
}

function scheduleEnhance() {
  window.clearTimeout(timer);
  timer = window.setTimeout(enhance, 120);
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
