import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, Eye, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { fetchParqStatusForStudent, formatParqDate, renderDeclaration } from '../lib/parq';

export default function ParqStatusCard({ studentId, studentName, compact = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  async function load() {
    if (!studentId) return;
    setLoading(true);setError('');
    try { setData(await fetchParqStatusForStudent(studentId)); }
    catch (loadError) { setError(loadError?.message || 'Não foi possível consultar o PAR-Q.'); }
    finally { setLoading(false); }
  }

  useEffect(()=>{load()},[studentId]);

  const submitted = Boolean(data?.submitted);
  const questions = Array.isArray(data?.questions) ? data.questions : [];
  const answers = data?.answers || {};
  const positiveCount = Number(data?.positive_answer_count || 0);

  return <>
    <section className={`card pad parqStatusCard ${compact?'compact':''}`}><div className="panelTitle"><div><h2>PAR-Q</h2><p>Questionário inicial e declaração de responsabilidade.</p></div><ShieldCheck size={25}/></div>
      {loading ? <div className="parqStatusLine"><div className="loader small"/><span>A verificar…</span></div>
        : error ? <div className="parqStatusError"><AlertTriangle size={18}/><span>{error}</span><button className="textButton" onClick={load}><RefreshCw size={15}/>Tentar novamente</button></div>
        : submitted ? <div className="parqStatusBody"><div className={data.has_positive_answers?'parqStatusBadge warning':'parqStatusBadge ok'}>{data.has_positive_answers?<AlertTriangle size={18}/>:<CheckCircle2 size={18}/>}<div><b>{data.has_positive_answers?`${positiveCount} resposta(s) “Sim”`:'Concluído sem respostas “Sim”'}</b><span>Aceite em {formatParqDate(data.accepted_at)} · {data.version_code}</span></div></div><button className="secondary" onClick={()=>setOpen(true)}><Eye size={16}/>Consultar PAR-Q</button></div>
        : <div className="parqStatusBody"><div className="parqStatusBadge pending"><ClipboardCheck size={18}/><div><b>Pendente</b><span>O aluno terá de concluir o PAR-Q no primeiro acesso.</span></div></div></div>}
    </section>

    {open && data && <div className="overlay parqReviewOverlay"><div className="modal modalWide parqReviewModal"><div className="title"><div><span className="eyebrow">{data.version_code}</span><h2>PAR-Q · {studentName}</h2></div><button className="iconButton" onClick={()=>setOpen(false)}><X/></button></div><div className={data.has_positive_answers?'parqReviewSummary warning':'parqReviewSummary ok'}>{data.has_positive_answers?<AlertTriangle/>:<CheckCircle2/>}<div><b>{data.has_positive_answers?`${positiveCount} resposta(s) positiva(s) para revisão`:'Sem respostas “Sim”'}</b><span>Aceite em {formatParqDate(data.accepted_at)}</span></div></div><div className="parqReviewQuestions">{questions.map((question,index)=><div className="parqReviewQuestion" key={question.id}><span>{index+1}</span><p>{question.text}</p><b className={answers[question.id]?'yes':'no'}>{answers[question.id]?'SIM':'NÃO'}</b></div>)}</div><div className="parqReviewDeclaration"><h3>Declaração aceite</h3>{renderDeclaration(data.declaration_text,studentName).split('\n').map((line,index)=>line?<p key={index}>{line}</p>:<br key={index}/>)}</div><div className="modalActions"><button className="primary" onClick={()=>setOpen(false)}>Fechar</button></div></div></div>}
  </>;
}
