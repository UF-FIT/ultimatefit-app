import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, ClipboardCheck, RefreshCw, ShieldCheck } from 'lucide-react';
import BrandLogo from './BrandLogo';
import { currentStudentHasRequiredParq, fetchActiveParqVersion, renderDeclaration, submitOwnParq } from '../lib/parq';

export default function ParqOnboarding({ profile, children }) {
  const [status, setStatus] = useState('loading');
  const [version, setVersion] = useState(null);
  const [answers, setAnswers] = useState({});
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [completedNow, setCompletedNow] = useState(false);

  async function load() {
    setStatus('loading');
    setError('');
    try {
      const done = await currentStudentHasRequiredParq();
      if (done) {
        setStatus('complete');
        return;
      }
      const currentVersion = await fetchActiveParqVersion();
      setVersion(currentVersion);
      setStatus('required');
    } catch (loadError) {
      setError(loadError?.message || 'Não foi possível carregar o PAR-Q.');
      setStatus('error');
    }
  }

  useEffect(() => { load(); }, [profile?.id]);

  const questions = Array.isArray(version?.questions) ? version.questions : [];
  const allAnswered = questions.length === 7 && questions.every(question => typeof answers[question.id] === 'boolean');
  const positiveCount = useMemo(() => Object.values(answers).filter(Boolean).length, [answers]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!allAnswered) {
      setError('Responde Sim ou Não a todas as perguntas.');
      return;
    }
    if (!accepted) {
      setError('É necessário confirmar que leste e aceitas a declaração de responsabilidade.');
      return;
    }
    setSubmitting(true);
    try {
      await submitOwnParq(version.id, answers);
      setCompletedNow(true);
      setStatus('complete');
    } catch (submitError) {
      setError(submitError?.message || 'Não foi possível guardar o PAR-Q.');
    } finally {
      setSubmitting(false);
    }
  }

  if (status === 'complete' && !completedNow) return children;

  if (status === 'loading') {
    return <main className="parqGate"><section className="parqGateCard compact"><BrandLogo/><div className="loader"/><h1>A preparar o teu acesso</h1><p>A confirmar o questionário inicial.</p></section></main>;
  }

  if (status === 'error') {
    return <main className="parqGate"><section className="parqGateCard compact"><BrandLogo/><AlertTriangle className="parqBigIcon"/><h1>Não foi possível carregar o PAR-Q</h1><p>{error}</p><button className="primary" onClick={load}><RefreshCw size={17}/>Tentar novamente</button></section></main>;
  }

  if (completedNow) {
    return <main className="parqGate"><section className="parqGateCard compact"><BrandLogo/><CheckCircle2 className="parqBigIcon success"/><span className="eyebrow">PAR-Q CONCLUÍDO</span><h1>Obrigado, {profile?.first_name || profile?.full_name?.split(' ')[0] || 'Aluno'}.</h1><p>O teu questionário e a declaração de responsabilidade ficaram guardados no teu perfil.</p>{positiveCount > 0 && <div className="parqPositiveNotice"><AlertTriangle size={19}/><div><b>{positiveCount} resposta(s) assinalada(s) como “Sim”</b><span>O teu professor poderá consultar estas respostas antes da prescrição do exercício.</span></div></div>}<button className="primary full" onClick={()=>setCompletedNow(false)}>Entrar na aplicação</button></section></main>;
  }

  const declaration = renderDeclaration(version?.declaration_text, profile?.full_name || profile?.email);

  return <main className="parqGate"><form className="parqGateCard" onSubmit={submit}>
    <header className="parqHeader"><BrandLogo/><div><span className="eyebrow">PRIMEIRO ACESSO · OBRIGATÓRIO</span><h1>{version?.title || 'PAR-Q'}</h1><p>{version?.intro_text}</p></div></header>

    <section className="parqQuestions"><div className="parqSectionTitle"><ClipboardCheck size={22}/><div><h2>Questionário</h2><p>Seleciona uma resposta em cada questão.</p></div></div>{questions.map((question,index)=><article className="parqQuestion" key={question.id}><div className="parqQuestionText"><span>{index+1}</span><b>{question.text}</b></div><div className="parqAnswerButtons"><button type="button" className={answers[question.id]===true?'selected yes':''} onClick={()=>setAnswers(current=>({...current,[question.id]:true}))}>SIM</button><button type="button" className={answers[question.id]===false?'selected no':''} onClick={()=>setAnswers(current=>({...current,[question.id]:false}))}>NÃO</button></div></article>)}</section>

    {positiveCount > 0 && <div className="parqPositiveNotice"><AlertTriangle size={19}/><div><b>Existem {positiveCount} resposta(s) “Sim”.</b><span>Estas respostas ficam sinalizadas para consulta pelo professor. O questionário não constitui um diagnóstico.</span></div></div>}

    <section className="parqDeclaration"><div className="parqSectionTitle"><ShieldCheck size={22}/><div><h2>Declaração de responsabilidade</h2><p>O registo fica associado à tua conta, data, hora e versão deste documento.</p></div></div><div className="parqDeclarationText">{declaration.split('\n').map((line,index)=>line?<p key={index}>{line}</p>:<br key={index}/>)}</div><label className={accepted?'parqAcceptance checked':'parqAcceptance'}><input type="checkbox" checked={accepted} onChange={event=>setAccepted(event.target.checked)}/><span className="parqCheck"><Check size={16}/></span><div><b>Li, compreendi e aceito.</b><small>Confirmo eletronicamente as respostas acima e a declaração de responsabilidade.</small></div></label></section>

    {error && <div className="errorBanner wide"><AlertTriangle size={18}/>{error}</div>}
    <footer className="parqFooter"><div><small>Versão</small><b>{version?.version_code || '—'}</b></div><button className="primary" disabled={submitting||!allAnswered||!accepted}>{submitting?'A guardar…':'Concluir e entrar na app'}</button></footer>
  </form></main>;
}
