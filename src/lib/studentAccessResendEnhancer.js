import { buildStudentAccessMessage, fetchStudents, invokeStudentAction, whatsappUrl } from './students';

const MODAL_ID = 'uf-student-access-modal';
let scheduled = false;

function formatSentAt(value) {
  if (!value) return 'Ainda não reenviado';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function closeModal() {
  document.getElementById(MODAL_ID)?.remove();
  document.documentElement.classList.remove('uf-access-modal-open');
}

function openWhatsApp(student) {
  const url = whatsappUrl(student.phone, buildStudentAccessMessage(student));
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}

function renderModal(student) {
  closeModal();
  const pending = student.invitation?.status === 'pending';
  const overlay = document.createElement('div');
  overlay.id = MODAL_ID;
  overlay.className = 'ufStudentAccessOverlay';
  overlay.innerHTML = `
    <section class="ufStudentAccessModal" role="dialog" aria-modal="true" aria-labelledby="uf-access-title">
      <div class="ufStudentAccessHead">
        <div>
          <span>ACESSO À APP</span>
          <h2 id="uf-access-title">${student.name || 'Aluno'}</h2>
          <p>${student.email || ''}</p>
        </div>
        <button type="button" class="ufStudentAccessClose" aria-label="Fechar">×</button>
      </div>
      <div class="ufStudentAccessStatus ${pending ? 'pending' : 'ready'}">
        <b>${pending ? 'Acesso ainda por concluir' : 'Conta criada'}</b>
        <span>${pending ? 'Se o link inicial expirou, envia um novo email sem apagar nem recriar o aluno.' : 'Podes reenviar um email para definir ou recuperar a palavra-passe sempre que necessário.'}</span>
      </div>
      <div class="ufStudentAccessInfo">
        <div><small>EMAIL DE ACESSO</small><strong>${student.email || '—'}</strong></div>
        <div><small>ÚLTIMO ENVIO</small><strong data-uf-last-sent>${formatSentAt(student.invitation?.last_sent_at)}</strong></div>
      </div>
      <div class="ufStudentAccessActions">
        <button type="button" class="primary" data-uf-resend-access>Reenviar email de acesso</button>
        <button type="button" class="secondary" data-uf-whatsapp-access ${student.phone ? '' : 'disabled'}>Enviar instruções por WhatsApp</button>
      </div>
      <div class="ufStudentAccessFeedback" data-uf-access-feedback></div>
      <p class="ufStudentAccessNote">O novo email contém um link novo. O link antigo pode continuar expirado e deixa de ser necessário.</p>
    </section>`;
  document.body.appendChild(overlay);
  document.documentElement.classList.add('uf-access-modal-open');

  const close = () => closeModal();
  overlay.querySelector('.ufStudentAccessClose')?.addEventListener('click', close);
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });

  overlay.querySelector('[data-uf-whatsapp-access]')?.addEventListener('click', () => openWhatsApp(student));
  overlay.querySelector('[data-uf-resend-access]')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    const feedback = overlay.querySelector('[data-uf-access-feedback]');
    button.disabled = true;
    button.textContent = 'A enviar…';
    feedback.textContent = '';
    feedback.className = 'ufStudentAccessFeedback';
    try {
      const result = await invokeStudentAction({ action: 'resend_access', studentId: student.id });
      feedback.textContent = result?.message || `Novo email enviado para ${student.email}.`;
      feedback.classList.add('success');
      const sent = overlay.querySelector('[data-uf-last-sent]');
      if (sent) sent.textContent = formatSentAt(new Date().toISOString());
      button.textContent = 'Email reenviado';
      window.setTimeout(() => {
        if (document.body.contains(button)) {
          button.disabled = false;
          button.textContent = 'Reenviar email de acesso';
        }
      }, 3500);
    } catch (error) {
      feedback.textContent = error?.message || 'Não foi possível reenviar o email de acesso.';
      feedback.classList.add('error');
      button.disabled = false;
      button.textContent = 'Reenviar email de acesso';
    }
  });
}

async function resolveCurrentStudent() {
  const params = new URLSearchParams(location.search);
  const id = params.get('aluno') || params.get('studentId') || '';
  const students = await fetchStudents();
  if (id) {
    const byId = students.find(student => student.id === id || student.profileId === id);
    if (byId) return byId;
  }
  const visibleName = document.querySelector('.studentProfileHero h1')?.textContent?.trim();
  if (visibleName) return students.find(student => student.name === visibleName) || null;
  return null;
}

function bindSendAppButton() {
  const buttons = [...document.querySelectorAll('.studentProfilePage .profileQuickActions button')];
  const button = buttons.find(item => /enviar\s+app/i.test(item.textContent || ''));
  if (!button || button.dataset.ufAccessBound === '1') return;
  button.dataset.ufAccessBound = '1';
  button.addEventListener('click', async event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    button.disabled = true;
    try {
      const student = await resolveCurrentStudent();
      if (!student) throw new Error('Não foi possível identificar o aluno.');
      renderModal(student);
    } catch (error) {
      window.alert(error?.message || 'Não foi possível abrir a gestão de acesso.');
    } finally {
      button.disabled = false;
    }
  }, true);
}

function tidyLegacyAccessButton() {
  const buttons = [...document.querySelectorAll('.profileAccessPanel .accessButtons button')];
  const button = buttons.find(item => /novo\s+link/i.test(item.textContent || ''));
  const span = button?.querySelector('span');
  if (span) span.textContent = 'Reenviar email';
  else if (button && /novo\s+link/i.test(button.textContent || '')) {
    const textNode = [...button.childNodes].find(node => node.nodeType === Node.TEXT_NODE && /novo\s+link/i.test(node.textContent || ''));
    if (textNode) textNode.textContent = 'Reenviar email';
  }
}

function enhance() {
  scheduled = false;
  bindSendAppButton();
  tidyLegacyAccessButton();
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(enhance);
}

export function startStudentAccessResendEnhancer() {
  if (window.__ufStudentAccessResendEnhancer) return;
  window.__ufStudentAccessResendEnhancer = true;
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  window.addEventListener('focus', schedule);
  schedule();
}
