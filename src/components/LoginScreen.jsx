import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, LockKeyhole, Mail } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import BrandLogo from './BrandLogo';
import AppFooter from './AppFooter';

export default function LoginScreen() {
  const { signIn, authError, requestPasswordReset } = useAuth();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleLogin(event) {
    event.preventDefault();
    setLocalError('');
    setSuccess('');
    setSubmitting(true);

    const { error } = await signIn(email.trim(), password);
    if (error) setLocalError('Email ou palavra-passe incorretos.');

    setSubmitting(false);
  }

  async function handleRecovery(event) {
    event.preventDefault();
    setLocalError('');
    setSuccess('');
    setSubmitting(true);

    const { error } = await requestPasswordReset(email.trim());
    if (error) {
      setLocalError('Não foi possível enviar o email agora. Confirma o endereço e tenta novamente.');
    } else {
      setSuccess('Caso exista uma conta associada a este email, receberás as instruções para redefinir a palavra-passe.');
    }

    setSubmitting(false);
  }

  return (
    <main className="loginPage">
      <section className="loginIntro">
        <div className="loginBrand"><BrandLogo/></div>
        <div className="loginCopy">
          <small>APP PRIVADA</small>
          <h1>BE STRONG.<br />BE ULTIMATE.</h1>
          <p>A plataforma do estúdio para avaliações, evolução, treino, nutrição, objetivos e desafios.</p>
        </div>
        <div className="loginIntroBottom">
          <div className="loginStatus">AMBIENTE PRIVADO DE DESENVOLVIMENTO</div>
          <AppFooter className="loginFooter"/>
        </div>
      </section>

      <section className="loginPanel">
        {mode === 'login' ? (
          <form className="loginCard" onSubmit={handleLogin}>
            <div className="loginMarkImage"><BrandLogo compact/></div>
            <div>
              <small>ACESSO PRIVADO</small>
              <h2>Entrar na aplicação</h2>
              <p>Utiliza a conta criada pelo estúdio.</p>
            </div>

            <label className="loginField">
              <span>Email</span>
              <div><Mail size={18} /><input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
            </label>

            <label className="loginField">
              <span>Palavra-passe</span>
              <div><LockKeyhole size={18} /><input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
            </label>

            <button type="button" className="textButton forgotButton" onClick={() => { setMode('recovery'); setLocalError(''); }}>
              Esqueci-me da palavra-passe
            </button>

            {(localError || authError) && <div className="loginError">{localError || authError}</div>}

            <button className="primary loginButton" disabled={submitting}>
              {submitting ? 'A entrar…' : 'Entrar'} <ArrowRight size={18} />
            </button>
            <p className="loginHelp">O acesso de alunos e professores é ativado através de convite.</p>
          </form>
        ) : (
          <form className="loginCard" onSubmit={handleRecovery}>
            <button type="button" className="backButton" onClick={() => { setMode('login'); setLocalError(''); setSuccess(''); }}>
              <ArrowLeft size={17} /> Voltar ao login
            </button>
            <div className="loginMarkImage"><BrandLogo compact/></div>
            <div>
              <small>RECUPERAÇÃO DE ACESSO</small>
              <h2>Repor palavra-passe</h2>
              <p>Indica o email associado à tua conta.</p>
            </div>

            <label className="loginField">
              <span>Email</span>
              <div><Mail size={18} /><input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
            </label>

            {localError && <div className="loginError">{localError}</div>}
            {success && <div className="loginSuccess">{success}</div>}

            <button className="primary loginButton" disabled={submitting || Boolean(success)}>
              {submitting ? 'A enviar…' : 'Enviar instruções'} <ArrowRight size={18} />
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
