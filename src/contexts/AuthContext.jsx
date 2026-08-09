import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, supabaseConfigured } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const profileRef = useRef(null);

  async function loadProfile(user) {
    if (!user || !supabase) {
      profileRef.current = null;
      setProfile(null);
      return null;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id,email,full_name,first_name,last_name,phone,avatar_path,avatar_thumb_path,role,is_active,deleted_at')
      .eq('id', user.id)
      .single();

    if (error) {
      profileRef.current = null;
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
    profileRef.current = hydrated;
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
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);

      // A token refresh or a repeated SIGNED_IN event for the same account must
      // not tear down the whole application. Supabase can emit these events
      // when the tab regains focus, even though the user never left the app.
      const sameUser = Boolean(nextSession?.user?.id && profileRef.current?.id === nextSession.user.id);
      if (event === 'TOKEN_REFRESHED' || (event === 'SIGNED_IN' && sameUser)) return;

      if (event === 'USER_UPDATED' && sameUser) {
        window.setTimeout(() => loadProfile(nextSession?.user ?? null), 0);
        return;
      }

      if (event === 'SIGNED_OUT' || !nextSession) {
        profileRef.current = null;
        setProfile(null);
        setLoading(false);
        return;
      }

      // Real account transitions remain blocking until the matching profile is ready.
      setLoading(true);
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
    profileRef.current = null;
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
