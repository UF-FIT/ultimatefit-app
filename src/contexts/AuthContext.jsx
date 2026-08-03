import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, supabaseConfigured } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  async function loadProfile(user) {
    if (!user || !supabase) {
      setProfile(null);
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id,email,full_name,phone,avatar_path,role,is_active')
      .eq('id', user.id)
      .single();

    if (error) {
      setProfile(null);
      setAuthError('A conta existe, mas não foi possível carregar o perfil da aplicação.');
      return;
    }

    setAuthError('');
    setProfile(data);
  }

  useEffect(() => {
    if (!supabaseConfigured || !supabase) {
      setLoading(false);
      return undefined;
    }

    let active = true;

    supabase.auth.getSession().then(async ({ data: { session: currentSession } }) => {
      if (!active) return;
      setSession(currentSession);
      await loadProfile(currentSession?.user ?? null);
      if (active) setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      window.setTimeout(async () => {
        await loadProfile(nextSession?.user ?? null);
        setLoading(false);
      }, 0);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function signIn(email, password) {
    if (!supabase) return { error: new Error('Supabase não configurado.') };
    setAuthError('');
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) setAuthError(result.error.message);
    return result;
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setProfile(null);
  }

  const value = useMemo(
    () => ({
      session,
      profile,
      loading,
      authError,
      signIn,
      signOut,
      configured: supabaseConfigured,
    }),
    [session, profile, loading, authError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
