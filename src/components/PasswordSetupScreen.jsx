import React, { useState } from 'react';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function PasswordSetupScreen({ mode = 'recovery' }) {
  const { session, updatePassword, acceptInvitation, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const isInvite = mode === 'invite';

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('A palavra-passe deve ter, pelo menos, 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('As duas palavras-passe não coincidem.');
      return;
    }

    setSubmitting(true);
    const { error: updateError } = await updatePassword(password);
    if (updateError) {
      setError('O link pode ter expirado ou já ter sido utilizado. Solicita um novo acesso.');
      setSubmitting(false);
      return;
    }

    if (isInvite) await acceptInvitation();
    setSuccess(true);
    setSubmitting(false);
  }

  async function goToLogin() {
    await signOut();
    window.history.replaceState({}, '', '/');
    window.location.reload();
  }

  if (!session) {
    return (
      <main className="passwordPage">
        <section className="passwordCard">
          <div className="loginMark">UF</div>
          <small>LINK INVÁLIDO OU EXPIRADO</small>
          <h1>Não foi possível validar o acesso</h1>
          <p>Volta ao login e solicita uma nova recuperação de palavra-passe. Se recebeste um convite, pede à administração um novo envio.</p>
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
        <p>{isInvite
          ? 'Esta será a palavra-passe utilizada para entrar na ULTIMATE FIT APP.'
          : 'A nova palavra-passe substitui imediatamente a anterior.'}</p>

        {!success ? (
          <>
            <label className="loginField">
              <span>Nova palavra-passe</span>
              <div><LockKeyhole size={18} /><input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
            </label>
            <label className="loginField">
              <span>Confirmar palavra-passe</span>
              <div><LockKeyhole size={18} /><input type="password" autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required /></div>
            </label>
            {error && <div className="loginError">{error}</div>}
            <button className="primary loginButton" disabled={submitting}>
              {submitting ? 'A guardar…' : 'Guardar palavra-passe'} <ArrowRight size={18} />
            </button>
          </>
        ) : (
          <>
            <div className="loginSuccess">Palavra-passe definida com sucesso. Já podes entrar na aplicação.</div>
            <button type="button" className="primary full" onClick={goToLogin}>Ir para o login</button>
          </>
        )}
      </form>
    </main>
  );
}
