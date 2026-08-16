import React from 'react';
import { createRoot } from 'react-dom/client';
import ParqStatusCard from '../components/ParqStatusCard';

const ROOT_ID = 'uf-assessment-parq';
let mountedStudentId = '';
let reactRoot = null;
let timer = null;

function currentStudentId() {
  return new URLSearchParams(window.location.search).get('aluno') || '';
}

function isProfessionalAssessmentHome() {
  if (window.location.pathname !== '/avaliacoes') return false;
  const home = document.querySelector('.assessmentStudentHome');
  if (!home) return false;
  const backText = home.querySelector('.assessmentStudentTop .backButton')?.textContent?.trim() || '';
  return backText.includes('Escolher outro aluno');
}

function unmount() {
  if (reactRoot) {
    reactRoot.unmount();
    reactRoot = null;
  }
  document.getElementById(ROOT_ID)?.remove();
  mountedStudentId = '';
}

function update() {
  if (!isProfessionalAssessmentHome()) {
    unmount();
    return;
  }

  const studentId = currentStudentId();
  const metrics = document.querySelector('.assessmentStudentHome > .assessmentMetricCards');
  const evolution = document.querySelector('.assessmentStudentHome > .assessmentEvolution');
  if (!studentId || !metrics || !evolution) return;

  if (mountedStudentId === studentId && document.getElementById(ROOT_ID)) return;
  unmount();

  const host = document.createElement('div');
  host.id = ROOT_ID;
  host.className = 'assessmentParqBlock';
  metrics.insertAdjacentElement('afterend', host);

  const studentName = document.querySelector('.assessmentStudentIdentity h1')?.textContent?.trim() || 'Aluno';
  reactRoot = createRoot(host);
  reactRoot.render(<ParqStatusCard studentId={studentId} studentName={studentName} />);
  mountedStudentId = studentId;
}

function schedule() {
  window.clearTimeout(timer);
  timer = window.setTimeout(update, 80);
}

export function startAssessmentParqEnhancer() {
  if (window.__ufAssessmentParqEnhancer) return;
  window.__ufAssessmentParqEnhancer = true;

  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      schedule();
      return result;
    };
  }

  window.addEventListener('popstate', schedule);
  const observer = new MutationObserver(schedule);
  observer.observe(document.getElementById('root') || document.body, { childList: true, subtree: true });
  schedule();
}
