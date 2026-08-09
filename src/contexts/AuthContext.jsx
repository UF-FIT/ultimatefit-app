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
      .select('id,email,full_name,first_name,last_name,phone,avatar_path,avatar_thumb_path,role,is_active,deleted_at')
      .eq('id', user.id)
      .single();

    if (error) {
      setProfile(null);
      setAuthError('A conta existe, mas não foi possível carregar o perfil da aplicação.');
      return null;
    }

    let avatarUrl = '';
    let avatarThumbUrl = '';
    const bucket = data.role === 'student' ? 'student-avatars' : 'professional-avatars';
    if (data.avatar_path) {
      const [{ data: avatarData }, { data: thumbData }] = await Promise.all([
        supabase.storage.from(bucket).createSignedUrl(data.avatar_path, 3600),
        supabase.storage.from(bucket).createSignedUrl(data.avatar_thumb_path || data.avatar_path, 3600),
      ]);
      avatarUrl = avatarData?.signedUrl || '';
      avatarThumbUrl = thumbData?.signedUrl || avatarUrl;
    }

    const hydrated = { ...data, avatar_url: avatarUrl, avatar_thumb_url: avatarThumbUrl };
    setAuthError('');
    setProfile(hydrated);
    return hydrated;
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
      // Auth events can expose the new session a few milliseconds before
      // the profile query finishes. Mark the whole auth/profile transition
      // as loading so the UI never renders a false missing-profile state.
      setLoading(true);
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
    // Keep the gate in a neutral loading state while Supabase creates the
    // session and the matching application profile is hydrated. Without
    // this, AppGate can briefly see `session` before `profile` and flash
    // the "Perfil indisponível" error even though the profile exists.
    setLoading(true);
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) {
      setAuthError(result.error.message);
      setLoading(false);
    }
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

  async function changeOwnPassword(currentPassword, newPassword) {
    if (!supabase) return { error: new Error('Supabase não configurado.') };
    if (!profile?.email) return { error: new Error('Email da conta indisponível.') };
    const verification = await supabase.auth.signInWithPassword({
      email: profile.email,
      password: currentPassword,
    });
    if (verification.error) return verification;
    const result = await supabase.auth.updateUser({ password: newPassword });
    if (!result.error) {
      try { await supabase.auth.signOut({ scope: 'others' }); } catch { /* Best effort. */ }
    }
    return result;
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
      changeOwnPassword,
      acceptInvitation,
      refreshProfile,
      configured: supabaseConfigured,
    }),
    [session, profile, loading, authError, recoveryMode],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
