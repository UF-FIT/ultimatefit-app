import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { consumeAuthLink, createAuthLinkClient, supabase } from '../lib/supabase';

export default function PasswordSetupScreen({ mode = 'recovery' }) {
  const clientRef = useRef(null);
  const [linkUser, setLinkUser] = useState(null);
  const [linkType, setLinkType] = useState('');
  const [validating, setValidating] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const isInvite = mode === 'invite';

  useEffect(() => {
    let active = true;
    const client = createAuthLinkClient();
    clientRef.current = client;

    async function validateLink() {
      try {
        const { session, type } = await consumeAuthLink(client);
        const user = session.user;

        if (isInvite && type && type !== 'invite') {
          throw new Error('Este link não é um convite de ativação.');
        }
        if (!isInvite && type && type !== 'recovery') {
          throw new Error('Este link não é um pedido de recuperação de palavra-passe.');
        }

        const { data: profile, error: profileError } = await client
          .from('profiles')
          .select('id,email,full_name,role,is_active,deleted_at')
          .eq('id', user.id)
          .single();

        if (profileError || !profile) {
          throw new Error('Não foi possível validar o perfil associado a este link.');
        }
        if (profile.deleted_at || !profile.is_active) {
          throw new Error('Esta conta não está ativa.');
        }
        if (isInvite && profile.role === 'owner') {
          throw new Error('Este convite não pode ser utilizado na conta do Proprietário.');
        }

        if (isInvite) {
          const [studentInvite, teamInvite] = await Promise.all([
            client
              .from('student_invitations')
              .select('id,status')
              .eq('auth_user_id', user.id)
              .eq('status', 'pending')
              .limit(1),
            client
              .from('team_invitations')
              .select('id,status')
              .eq('auth_user_id', user.id)
              .eq('status', 'pending')
              .limit(1),
          ]);

          if (studentInvite.error && studentInvite.error.code !== '42P01') throw studentInvite.error;
          if (teamInvite.error && teamInvite.error.code !== '42P01') throw teamInvite.error;
          const hasPendingInvite = Boolean(studentInvite.data?.length || teamInvite.data?.length);
          if (!hasPendingInvite) {
            throw new Error('Este convite já foi utilizado, foi cancelado ou ficou incompleto. Solicita um novo convite.');
          }
        }

        if (!active) return;
        setLinkUser({
          id: user.id,
          email: user.email || profile.email,
          name: profile.full_name || user.email,
          role: profile.role,
        });
        setLinkType(type);
        window.history.replaceState({}, '', window.location.pathname);
      } catch (validationError) {
        if (!active) return;
        setError(validationError?.message || 'Não foi possível validar este link.');
      } finally {
        if (active) setValidating(false);
      }
    }

    validateLink();
    return () => {
      active = false;
    };
  }, [isInvite]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (!linkUser || !clientRef.current) {
      setError('O link não está validado.');
      return;
    }
    if (password.length < 8) {
      setError('A palavra-passe deve ter, pelo menos, 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('As duas palavras-passe não coincidem.');
      return;
    }

    setSubmitting(true);
    const client = clientRef.current;
    const { error: updateError } = await client.auth.updateUser({ password });
    if (updateError) {
      setError('O link pode ter expirado ou já ter sido utilizado. Solicita um novo acesso.');
      setSubmitting(false);
      return;
    }

    await Promise.allSettled([
      client.rpc('accept_own_team_invitation'),
      client.rpc('accept_own_student_invitation'),
    ]);

    await client.auth.signOut().catch(() => {});
    // If the link was opened in a browser where an administrator was already
    // signed in, end that local session too. This never changes that account's
    // password; it only returns the browser to a clean login screen.
    await supabase?.auth.signOut({ scope: 'local' }).catch(() => {});

    setSuccess(true);
    setSubmitting(false);
  }

  function goToLogin() {
    window.history.replaceState({}, '', '/');
    window.location.assign('/');
  }

  if (validating) {
    return (
      <main className="passwordPage">
        <section className="passwordCard">
          <div className="loginMark">UF</div>
          <small>A VALIDAR LINK</small>
          <h1>A preparar o acesso</h1>
          <div className="loader" />
        </section>
      </main>
    );
  }

  if (!linkUser) {
    return (
      <main className="passwordPage">
        <section className="passwordCard">
          <div className="loginMark">UF</div>
          <small>LINK INVÁLIDO OU EXPIRADO</small>
          <h1>Não foi possível validar o acesso</h1>
          <p>{error || 'Solicita um novo convite ou uma nova recuperação de palavra-passe.'}</p>
          <button className="primary full" onClick={goToLogin}>Voltar ao login</button>
        </section>
      </main>
    );
  }

  return (
    <main className="passwordPage">
      <form className="passwordCard" onSubmit={handleSubmit}>
        <div className="loginMark">UF</div>
        <small>{isInvite ? 'ATIVAR CONTA' : 'RECUPERAR ACESSO'}</small>
        <h1>{isInvite ? 'Define a tua palavra-passe' : 'Cria uma nova palavra-passe'}</h1>
        <p>
          Conta: <strong>{linkUser.email}</strong>
          {linkType ? ` · ${linkType === 'invite' ? 'convite' : 'recuperação'}` : ''}
        </p>

        {!success ? (
          <>
            <label className="loginField">
              <span>Nova palavra-passe</span>
              <div><LockKeyhole size={18} /><input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} required /></div>
            </label>
            <label className="loginField">
              <span>Confirmar palavra-passe</span>
              <div><LockKeyhole size={18} /><input type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required /></div>
            </label>
            {error && <div className="loginError">{error}</div>}
            <button className="primary loginButton" disabled={submitting}>
              {submitting ? 'A guardar…' : 'Guardar palavra-passe'} <ArrowRight size={18} />
            </button>
          </>
        ) : (
          <>
            <div className="loginSuccess">Palavra-passe definida com sucesso para {linkUser.email}.</div>
            <button type="button" className="primary full" onClick={goToLogin}>Ir para o login</button>
          </>
        )}
      </form>
    </main>
  );
}
