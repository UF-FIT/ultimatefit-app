import React, { useState } from 'react';
import { ArrowRight, LockKeyhole, Mail } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function LoginScreen() {
  const { signIn, authError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setLocalError('');
    setSubmitting(true);

    const { error } = await signIn(email.trim(), password);
    if (error) setLocalError('Email ou palavra-passe incorretos.');

    setSubmitting(false);
  }

  return (
    <main className="loginPage">
      <section className="loginIntro">
        <div className="loginBrand"><span>UF</span> ULTIMATE <b>FIT</b></div>
        <div className="loginCopy">
          <small>ULTIMATE FIT APP</small>
          <h1>BE STRONG.<br />BE ULTIMATE.</h1>
          <p>A plataforma do estúdio para avaliações, evolução, treino, nutrição, objetivos e desafios.</p>
        </div>
        <div className="loginStatus">AMBIENTE PRIVADO DE DESENVOLVIMENTO</div>
      </section>

      <section className="loginPanel">
        <form className="loginCard" onSubmit={handleSubmit}>
          <div className="loginMark">UF</div>
          <div>
            <small>ACESSO PRIVADO</small>
            <h2>Entrar na aplicação</h2>
            <p>Utiliza a conta criada no ULTIMATE FIT.</p>
          </div>

          <label className="loginField">
            <span>Email</span>
            <div><Mail size={18} /><input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
          </label>

          <label className="loginField">
            <span>Palavra-passe</span>
            <div><LockKeyhole size={18} /><input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
          </label>

          {(localError || authError) && <div className="loginError">{localError || authError}</div>}

          <button className="primary loginButton" disabled={submitting}>
            {submitting ? 'A entrar…' : 'Entrar'} <ArrowRight size={18} />
          </button>
          <p className="loginHelp">O acesso de alunos e professores será ativado através de convite.</p>
        </form>
      </section>
    </main>
  );
}
