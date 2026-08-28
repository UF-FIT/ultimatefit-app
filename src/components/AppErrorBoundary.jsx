import React from 'react';

function freshReload() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('_uf_recover', String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ULTIMATE FIT] Falha de interface recuperável', error, info);
    try {
      localStorage.setItem('uf-last-client-error', JSON.stringify({
        at: new Date().toISOString(),
        message: error?.message || String(error || 'Erro desconhecido'),
        path: window.location.pathname,
      }));
    } catch {
      // O ecrã de recuperação deve funcionar mesmo sem storage disponível.
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{
        minHeight: '100dvh',
        background: '#050505',
        color: '#fff',
        display: 'grid',
        placeItems: 'center',
        padding: '28px',
        boxSizing: 'border-box',
        fontFamily: 'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        textAlign: 'center',
      }}>
        <div style={{ width: 'min(430px, 100%)' }}>
          <img
            src="/brand/ultimatefit-logo.webp"
            alt="ULTIMATE FIT"
            style={{ width: 'min(250px, 66vw)', height: 'auto', marginBottom: '28px' }}
          />
          <h1 style={{ fontSize: '24px', margin: '0 0 10px' }}>Não foi possível abrir esta área</h1>
          <p style={{ color: '#9b9ba3', lineHeight: 1.55, margin: '0 0 24px' }}>
            A aplicação encontrou um erro inesperado. Podes voltar a carregar sem perder os teus dados guardados no servidor.
          </p>
          <button
            type="button"
            onClick={freshReload}
            style={{
              width: '100%',
              minHeight: '54px',
              border: 0,
              borderRadius: '15px',
              background: '#ffd908',
              color: '#080808',
              fontSize: '17px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }
}
