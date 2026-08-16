import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/app.css';
import './styles/student-directory-cards-v2.css';
import './styles/dashboard-attention.css';
import './styles/training-editor-error-feedback.css';
import './styles/dashboard-mobile-kpis.css';
import './styles/mobile-bottom-nav-125.css';
import './styles/mobile-overflow-navigation.css';
import './styles/mobile-login-ios-zoom.css';
import './styles/mobile-student-dashboard-actions.css';
import './styles/student-mobile-dashboard-compact.css';
import './styles/mobile-student-calendar-stats.css';
import './styles/student-profile-actions.css';
import './styles/mobile-student-assessments.css';
import './lib/studentDirectoryCardEnhancer';
import { startDashboardAttentionEnhancer } from './lib/dashboardAttentionEnhancer';
import { startTrainingVolumeEnhancer } from './lib/trainingVolumeEnhancer';
import { startTrainingEditorErrorEnhancer } from './lib/trainingEditorErrorEnhancer';
import { startTrainingLoadInlineEnhancer } from './lib/trainingLoadInlineEnhancer';
import { startMobileBottomNavEnhancer } from './lib/mobileBottomNavEnhancer';
import { startMobileNavigationLayoutEnhancer } from './lib/mobileNavigationLayoutEnhancer';
import { startMobileStudentDashboardEnhancer } from './lib/mobileStudentDashboardEnhancer';
import { startMobileStudentAssessmentEnhancer } from './lib/mobileStudentAssessmentEnhancer';
import { startStudentProfilePageCleaner } from './lib/studentProfilePageCleaner';
import { startStudentProfileActionsEnhancer } from './lib/studentProfileActionsEnhancer';

const hostname = window.location.hostname.toLowerCase();
const canonicalAppOrigin = 'https://app.ultimatefit.pt';

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
  // Keep one canonical browser origin for authentication. The short branded
  // subdomains are entry links only, so a session already open on
  // app.ultimatefit.pt is immediately reused after this redirect.
  const target = `${canonicalAppOrigin}${entryPath}${window.location.search}${window.location.hash}`;
  window.location.replace(target);
} else {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );
  startDashboardAttentionEnhancer();
  startTrainingVolumeEnhancer();
  startTrainingEditorErrorEnhancer();
  startTrainingLoadInlineEnhancer();
  startMobileBottomNavEnhancer();
  startMobileNavigationLayoutEnhancer();
  startMobileStudentDashboardEnhancer();
  startMobileStudentAssessmentEnhancer();
  startStudentProfilePageCleaner();
  startStudentProfileActionsEnhancer();
}
