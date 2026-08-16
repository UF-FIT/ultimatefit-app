export function startMobileWhatsAppNavigationEnhancer() {
  if (typeof window === 'undefined') return;

  const isMobile = window.matchMedia?.('(max-width: 900px)')?.matches
    || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
  if (!isMobile || window.__ultimateFitWhatsAppOpenPatched) return;

  const originalOpen = window.open.bind(window);

  window.open = function patchedOpen(url, target, features) {
    const destination = typeof url === 'string' ? url : String(url || '');
    const isWhatsApp = /^https:\/\/(?:wa\.me|api\.whatsapp\.com)\//i.test(destination);

    if (isWhatsApp) {
      window.location.assign(destination);
      return window;
    }

    return originalOpen(url, target, features);
  };

  window.__ultimateFitWhatsAppOpenPatched = true;
}
