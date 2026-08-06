import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, supabaseConfigured } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);

  async function loadProfile(user) {
    if (!user || !supabase) {
      setProfile(null);
      return null;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id,email,full_name,phone,avatar_path,role,is_active,deleted_at')
      .eq('id', user.id)
      .single();

    if (error) {
      setProfile(null);
      setAuthError('A conta existe, mas não foi possível carregar o perfil da aplicação.');
      return null;
    }

    setAuthError('');
    setProfile(data);
    return data;
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

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
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

  async function requestPasswordReset(email) {
    if (!supabase) return { error: new Error('Supabase não configurado.') };
    const redirectTo = `${window.location.origin}/repor-palavra-passe`;
    return supabase.auth.resetPasswordForEmail(email, { redirectTo });
  }

  async function updatePassword(password) {
    if (!supabase) return { error: new Error('Supabase não configurado.') };
    return supabase.auth.updateUser({ password });
  }

  async function acceptInvitation() {
    if (!supabase) return;
    await Promise.all([
      supabase.rpc('accept_own_team_invitation'),
      supabase.rpc('accept_own_student_invitation'),
    ]);
  }

  async function refreshProfile() {
    return loadProfile(session?.user ?? null);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setProfile(null);
    setRecoveryMode(false);
  }

  const value = useMemo(
    () => ({
      session,
      profile,
      loading,
      authError,
      recoveryMode,
      signIn,
      signOut,
      requestPasswordReset,
      updatePassword,
      acceptInvitation,
      refreshProfile,
      configured: supabaseConfigured,
    }),
    [session, profile, loading, authError, recoveryMode],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
