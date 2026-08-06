import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

// Main application client. Authentication links are deliberately NOT consumed
// by this client. This prevents an invite/recovery page from accidentally using
// an already-open administrator session in the same browser.
export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'ultimatefit-main-auth',
      },
    })
  : null;

export function createAuthLinkClient() {
  if (!supabaseConfigured) return null;
  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function authLinkError(search, hash) {
  return search.get('error_description')
    || hash.get('error_description')
    || search.get('error')
    || hash.get('error')
    || '';
}

// Supports Supabase's implicit links (#access_token=...) as well as PKCE
// redirects (?code=...) and direct token_hash links.
export async function consumeAuthLink(client) {
  if (!client) throw new Error('Supabase não configurado.');

  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const linkError = authLinkError(search, hash);
  if (linkError) throw new Error(decodeURIComponent(linkError.replace(/\+/g, ' ')));

  const type = search.get('type') || hash.get('type') || '';
  const code = search.get('code');
  const tokenHash = search.get('token_hash') || hash.get('token_hash');
  const accessToken = hash.get('access_token') || search.get('access_token');
  const refreshToken = hash.get('refresh_token') || search.get('refresh_token');

  let result;
  if (code) {
    result = await client.auth.exchangeCodeForSession(code);
  } else if (tokenHash && type) {
    result = await client.auth.verifyOtp({ token_hash: tokenHash, type });
  } else if (accessToken && refreshToken) {
    result = await client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  } else {
    throw new Error('Este endereço não contém um convite ou pedido de recuperação válido.');
  }

  if (result.error || !result.data?.session) {
    throw result.error || new Error('Não foi possível validar este link.');
  }

  return { session: result.data.session, type };
}
