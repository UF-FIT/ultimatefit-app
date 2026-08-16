const INITIAL_GUARD_STYLE_ID = 'uf-initial-data-guard-style';
const INITIAL_GUARD_ID = 'uf-initial-data-guard';

let activeRelevantRequests = 0;
let seenRelevantRequest = false;
let shellDetected = false;
let revealed = false;
let quietTimer = null;
let fallbackTimer = null;

function isRelevantRequest(input) {
  try {
    const url = typeof input === 'string' ? input : input?.url || '';
    return /supabase|\/rest\/v1\/|\/storage\/v1\/|\/auth\/v1\//i.test(url);
  } catch {
    return false;
  }
}

function ensureStyle() {
  if (document.getElementById(INITIAL_GUARD_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = INITIAL_GUARD_STYLE_ID;
  style.textContent = `
    html:not(.uf-initial-data-ready) .appShell { visibility: hidden !important; }
    #${INITIAL_GUARD_ID} {
      position: fixed;
      inset: 0;
      z-index: 2147483646;
      display: none;
      place-items: center;
      background: radial-gradient(circle at 28% 12%, rgba(255,217,8,.10), transparent 28%), #050505;
      color: #fff;
      font-family: Montserrat, system-ui, sans-serif;
    }
    #${INITIAL_GUARD_ID}.show { display: grid; }
    #${INITIAL_GUARD_ID} .ufInitialGuardInner { display:grid; justify-items:center; gap:18px; padding:30px; text-align:center; }
    #${INITIAL_GUARD_ID} img { width:min(260px,64vw); height:auto; display:block; }
    #${INITIAL_GUARD_ID} .ufInitialSpinner { width:34px; height:34px; border:3px solid rgba(255,255,255,.15); border-top-color:#ffd908; border-radius:50%; animation:ufInitialSpin .8s linear infinite; }
    #${INITIAL_GUARD_ID} p { margin:0; color:#9b9ba3; font-size:14px; }
    @keyframes ufInitialSpin { to { transform:rotate(360deg); } }
  `;
  document.head.appendChild(style);
}

function ensureOverlay() {
  let overlay = document.getElementById(INITIAL_GUARD_ID);
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = INITIAL_GUARD_ID;
  overlay.setAttribute('aria-live', 'polite');
  overlay.innerHTML = `
    <div class="ufInitialGuardInner">
      <img src="/brand/ultimatefit-logo.webp" alt="ULTIMATE FIT" width="720" height="151">
      <div class="ufInitialSpinner" aria-hidden="true"></div>
      <p>A preparar a aplicação…</p>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function reveal() {
  if (revealed) return;
  revealed = true;
  clearTimeout(quietTimer);
  clearTimeout(fallbackTimer);
  document.documentElement.classList.add('uf-initial-data-ready');
  const overlay = document.getElementById(INITIAL_GUARD_ID);
  if (overlay) overlay.classList.remove('show');
}

function maybeReveal() {
  if (!shellDetected || revealed) return;
  if (!seenRelevantRequest || activeRelevantRequests > 0) return;
  clearTimeout(quietTimer);
  quietTimer = window.setTimeout(reveal, 180);
}

export function startInitialDataPaintGuard() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  ensureStyle();

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const relevant = isRelevantRequest(args[0]);
    if (relevant && !revealed) {
      seenRelevantRequest = true;
      activeRelevantRequests += 1;
      clearTimeout(quietTimer);
    }
    try {
      return await originalFetch(...args);
    } finally {
      if (relevant && !revealed) {
        activeRelevantRequests = Math.max(0, activeRelevantRequests - 1);
        maybeReveal();
      }
    }
  };

  const detectShell = () => {
    if (shellDetected || revealed) return;
    const shell = document.querySelector('.appShell');
    if (!shell) return;
    shellDetected = true;
    ensureOverlay().classList.add('show');

    // If requests are already running, wait for them. Otherwise give React
    // effects a moment to start the initial Supabase fetches.
    window.setTimeout(maybeReveal, 80);
    fallbackTimer = window.setTimeout(reveal, 6000);
  };

  const observer = new MutationObserver(detectShell);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  detectShell();
}
