import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import AppErrorBoundary from './components/AppErrorBoundary';
import InstallAppPage from './components/InstallAppPage';
import './styles/app.css';
import './styles/student-directory-cards-v2.css';
import './styles/dashboard-attention.css';
import './styles/training-editor-error-feedback.css';
import './styles/training-prescription-cardio.css';
import './styles/dashboard-mobile-kpis.css';
import './styles/mobile-bottom-nav-125.css';
import './styles/mobile-overflow-navigation.css';
import './styles/mobile-login-ios-zoom.css';
import './styles/mobile-student-dashboard-actions.css';
import './styles/student-mobile-dashboard-compact.css';
import './styles/mobile-student-calendar-stats.css';
import './styles/student-profile-actions.css';
import './styles/mobile-student-assessments.css';
import './styles/install-app.css';
import './styles/login-remember-access.css';
import './styles/login-background.css';
import './styles/professional-student-profile-mobile.css';
import './styles/action-buttons-system.css';
import './styles/training-plans-mobile-redesign.css';
import './styles/training-plan-detail-mobile.css';
import './styles/training-plan-detail-symbol-cleanup.css';
import './styles/nutrition-v2-base.css';
import './styles/nutrition-mobile-redesign.css';
import './styles/student-access-resend.css';
import './styles/student-avatar-picker-v2.css';
import './styles/assessment-student-avatar-consistency.css';
import './styles/email-communications.css';
import './styles/backoffice-email-communications.css';
import './lib/studentDirectoryCardEnhancer';
import { startDashboardAttentionEnhancer } from './lib/dashboardAttentionEnhancer';
import { startTrainingVolumeEnhancer } from './lib/trainingVolumeEnhancer';
import { startTrainingEditorErrorEnhancer } from './lib/trainingEditorErrorEnhancer';
import { startTrainingLoadInlineEnhancer } from './lib/trainingLoadInlineEnhancer';
import { startTrainingPrescriptionEnhancer } from './lib/trainingPrescriptionEnhancer';
import { startMobileBottomNavEnhancer } from './lib/mobileBottomNavEnhancer';
import { startMobileNavigationLayoutEnhancer } from './lib/mobileNavigationLayoutEnhancer';
import { startMobileStudentDashboardEnhancer } from './lib/mobileStudentDashboardEnhancer';
import { startMobileStudentAssessmentEnhancer } from './lib/mobileStudentAssessmentEnhancer';
import { startStudentProfilePageCleaner } from './lib/studentProfilePageCleaner';
import { startStudentProfileActionsEnhancer } from './lib/studentProfileActionsEnhancer';
import { startChallengeHeroCopyEnhancer } from './lib/challengeHeroCopyEnhancer';
import { startMobileWhatsAppNavigationEnhancer } from './lib/mobileWhatsAppNavigationEnhancer';
import { startAssessmentParqEnhancer } from './lib/assessmentParqEnhancer';
import { startProfessionalStudentProfileMobileEnhancer } from './lib/professionalStudentProfileMobileEnhancer';
import { startTrainingPlansMobileRedesignEnhancer } from './lib/trainingPlansMobileRedesignEnhancer';
import { startTrainingPlanDetailMobileEnhancer } from './lib/trainingPlanDetailMobileEnhancer';
import { startStudentAccessResendEnhancer } from './lib/studentAccessResendEnhancer';
import { startStudentAvatarPickerEnhancer } from './lib/studentAvatarPickerEnhancer';
import { startBackofficeEmailCommunicationsEnhancer } from './lib/backofficeEmailCommunicationsEnhancer';

const hostname = window.location.hostname.toLowerCase();
const canonicalAppOrigin = 'https://app.ultimatefit.pt';
const publicInstallPath = window.location.pathname.replace(/\/+$/,'').toLowerCase() === '/instalar';

function removeBootSplash() {
  const splash = document.getElementById('uf-boot-splash');
  if (splash) splash.remove();
  try { sessionStorage.removeItem('uf-startup-recovery-attempt'); } catch {}
  window.__UF_APP_READY__ = true;
}

function rootHasReadyView() {
  const root = document.getElementById('root');
  const view = root?.firstElementChild;
  if (!view) return false;
  if (view.classList.contains('appState') && view.querySelector('.loader')) return false;
  return true;
}

function finishBootWhenReady() {
  if (rootHasReadyView()) {
    removeBootSplash();
    return;
  }
  const root = document.getElementById('root');
  if (!root) return;
  const observer = new MutationObserver(() => {
    if (!rootHasReadyView()) return;
    observer.disconnect();
    removeBootSplash();
  });
  observer.observe(root, { childList: true, subtree: true });
}

function canonicalEntryPath(host, pathname) {
  const cleanPath = pathname && pathname !== '/' ? pathname : '';
  if (host === 'desafios.ultimatefit.pt') {
    if (!cleanPath || cleanPath === '/desafios') return '/desafios';
    return cleanPath.startsWith('/desafios') ? cleanPath : `/desafios${cleanPath}`;
  }
  if (host === 'atividades.ultimatefit.pt') {
    if (!cleanPath || cleanPath === '/atividades') return '/atividades';
    return cleanPath.startsWith('/atividades') ? cleanPath : `/atividades${cleanPath}`;
  }
  return null;
}

const entryPath = canonicalEntryPath(hostname, window.location.pathname);

if (entryPath) {
  const target = `${canonicalAppOrigin}${entryPath}${window.location.search}${window.location.hash}`;
  window.location.replace(target);
} else if (publicInstallPath) {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <AppErrorBoundary>
        <InstallAppPage />
      </AppErrorBoundary>
    </React.StrictMode>
  );
  finishBootWhenReady();
} else {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <AppErrorBoundary>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AppErrorBoundary>
    </React.StrictMode>
  );
  finishBootWhenReady();
  startDashboardAttentionEnhancer();
  startTrainingVolumeEnhancer();
  startTrainingEditorErrorEnhancer();
  startTrainingLoadInlineEnhancer();
  startTrainingPrescriptionEnhancer();
  startMobileBottomNavEnhancer();
  startMobileNavigationLayoutEnhancer();
  startMobileStudentDashboardEnhancer();
  startMobileStudentAssessmentEnhancer();
  startStudentProfilePageCleaner();
  startStudentProfileActionsEnhancer();
  startChallengeHeroCopyEnhancer();
  startMobileWhatsAppNavigationEnhancer();
  startAssessmentParqEnhancer();
  startProfessionalStudentProfileMobileEnhancer();
  startTrainingPlansMobileRedesignEnhancer();
  startTrainingPlanDetailMobileEnhancer();
  startStudentAccessResendEnhancer();
  startStudentAvatarPickerEnhancer();
  startBackofficeEmailCommunicationsEnhancer();
}
