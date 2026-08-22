import React, { useMemo, useState } from 'react';
import {
  AlertTriangle, Apple, CalendarPlus, CheckCircle2, ChevronDown, ClipboardList, ExternalLink,
  FileCheck2, FileText, History, Info, Plus, ShieldCheck, Trash2, Upload, UserRound, X
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import {
  deleteNutritionDocument, refreshNutritionDocumentUrl, requestNutritionConsultation,
  updateNutritionConsultationRequestStatus, uploadNutritionDocument
} from '../lib/nutrition';

const fmtDate = value => value ? new Intl.DateTimeFormat('pt-PT', { dateStyle:'medium' }).format(new Date(value)) : '—';
const sizeLabel = bytes => !bytes ? '' : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const requestStatusLabel = { requested:'Pedido recebido', contacted:'Aluno contactado', scheduled:'Consulta agendada', completed:'Concluído', cancelled:'Cancelado' };

function Modal({ title, eyebrow, close, children, className='' }) {
  return <div className="overlay nutritionOverlay" onClick={close}>
    <div className={`modal nutritionModal ${className}`} onClick={event=>event.stopPropagation()}>
      <div className="title nutritionModalTitle"><div>{eyebrow&&<span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div><button className="iconButton" onClick={close} aria-label="Fechar"><X/></button></div>
      {children}
    </div>
  </div>;
}

function GuideRow({ icon:Icon, title, open, onClick, children }) {
  return <div className={`nutritionGuideRow ${open?'open':''}`}>
    <button type="button" onClick={onClick}><Icon/><span>{title}</span><ChevronDown className="nutritionGuideChevron"/></button>
    {open&&<div className="nutritionGuideContent">{children}</div>}
  </div>;
}

export default function NutritionModule({ context = {} }) {
  const { data, currentUser, refreshNutrition, nutritionLoading, nutritionError } = useApp();
  const ownStudent = data.students.find(item => item.userId === currentUser.id);
  const [selectedStudentId, setSelectedStudentId] = useState(context.studentId || ownStudent?.id || '');
  const [showUpload, setShowUpload] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showConsultationRequest, setShowConsultationRequest] = useState(false);
  const [openGuide, setOpenGuide] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const isStudent = currentUser.role === 'aluno';
  const resolvedStudentId = isStudent ? ownStudent?.id : (context.studentId || selectedStudentId);
  const targetStudent = data.students.find(item => item.id === resolvedStudentId);

  const visibleItems = useMemo(() => {
    const sid = isStudent ? ownStudent?.id : (context.studentId || selectedStudentId);
    return sid ? data.nutrition.filter(item => item.studentId === sid) : data.nutrition;
  }, [data.nutrition, isStudent, ownStudent?.id, context.studentId, selectedStudentId]);

  const currentItems = useMemo(() => visibleItems.filter(item => item.isCurrent !== false), [visibleItems]);
  const historicalItems = useMemo(() => visibleItems.filter(item => item.isCurrent === false), [visibleItems]);
  const currentItem = resolvedStudentId ? currentItems[0] || null : null;
  const ownRequest = isStudent ? (data.nutritionConsultationRequests || []).find(item => item.studentId === ownStudent?.id && !['completed','cancelled'].includes(item.status)) : null;
  const visibleRequests = useMemo(() => {
    if (isStudent) return [];
    const sid = context.studentId || selectedStudentId;
    return (data.nutritionConsultationRequests || []).filter(item => !sid || item.studentId === sid);
  }, [data.nutritionConsultationRequests, isStudent, context.studentId, selectedStudentId]);

  async function upload(event) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    try {
      if (isStudent) throw new Error('Apenas a equipa ULTIMATE FIT pode adicionar planos alimentares.');
      const form = new FormData(event.currentTarget);
      const studentId = context.studentId || form.get('studentId') || selectedStudentId;
      await uploadNutritionDocument({ studentId, title:form.get('title'), notes:form.get('notes'), file:form.get('file') });
      await refreshNutrition(); setShowUpload(false); setNotice(currentItem ? 'Plano alimentar substituído. A versão anterior ficou guardada no histórico.' : 'Plano alimentar guardado na app.');
      if (!selectedStudentId && studentId) setSelectedStudentId(studentId);
    } catch (err) { setError(err.message || 'Não foi possível carregar o PDF.'); }
    finally { setSaving(false); }
  }

  async function requestConsultation(event) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    try {
      const form = new FormData(event.currentTarget);
      await requestNutritionConsultation({ studentId: ownStudent?.id, message: form.get('message') });
      await refreshNutrition(); setShowConsultationRequest(false);
      setNotice('Pedido enviado. A equipa ULTIMATE FIT entrará em contacto contigo para combinar a consulta.');
    } catch (err) { setError(err.message || 'Não foi possível enviar o pedido.'); }
    finally { setSaving(false); }
  }

  async function changeRequestStatus(request, status) {
    try {
      await updateNutritionConsultationRequestStatus({ id:request.id, status });
      await refreshNutrition(); setNotice('Estado do pedido atualizado.'); setError('');
    } catch (err) { setError(err.message || 'Não foi possível atualizar o pedido.'); }
  }

  async function openDocument(item) {
    if (!item) return;
    let url = item.url;
    if (!url) url = await refreshNutritionDocumentUrl(item);
    if (!url) { setError('Não foi possível abrir este PDF.'); return; }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function remove(item) {
    if (!window.confirm(`Eliminar definitivamente “${item.title}”? O PDF também será removido do armazenamento.`)) return;
    try { await deleteNutritionDocument(item); await refreshNutrition(); setNotice('Documento eliminado.'); setError(''); }
    catch (err) { setError(err.message || 'Não foi possível eliminar o documento.'); }
  }

  const canUpload = !isStudent && Boolean(context.studentId ? targetStudent : true);
  const studentOptions = data.students.filter(student=>!student.deletedAt);
  const historyForModal = resolvedStudentId ? visibleItems : data.nutrition;

  return <div className="nutritionPage nutritionPageV2">
    <div className="nutritionHeroV2">
      <div className="nutritionHeroIcon"><Apple/></div>
      <div><h1>{targetStudent && !isStudent ? `Nutrição · ${targetStudent.name}` : 'Nutrição'}</h1><p>Planos alimentares e documentos num único local.</p></div>
    </div>

    {canUpload&&<button className="nutritionPrimaryAction" onClick={()=>setShowUpload(true)}><Plus/>{currentItem?'Substituir plano alimentar':'Adicionar plano alimentar'}</button>}

    <section className="nutritionIntegratedCard card">
      <div className="nutritionIntegratedLead"><div className="nutritionIntegratedDoc"><FileCheck2/><CheckCircle2/></div><div><h2>Acompanhamento integrado</h2></div></div>
      <div className="nutritionIntegratedFeatures">
        <div><FileText/><span>PDF mais<br/>recente</span></div>
        <div><UserRound/><span>Partilha<br/>com o PT</span></div>
        <div><ShieldCheck/><span>Não substitui<br/>nutricionista</span></div>
      </div>
    </section>

    <section className="nutritionGuides card">
      <span className="nutritionSectionLabel">ORIENTAÇÕES</span>
      <div className="nutritionGuideList">
        <GuideRow icon={Info} title="Como funciona" open={openGuide==='how'} onClick={()=>setOpenGuide(openGuide==='how'?null:'how')}>
          Guarda aqui o plano alimentar mais recente. Quando existir uma nova versão, podes substituí-la sem perder os documentos anteriores.
        </GuideRow>
        <GuideRow icon={ClipboardList} title="O que está incluído" open={openGuide==='included'} onClick={()=>setOpenGuide(openGuide==='included'?null:'included')}>
          Consulta do PDF atual, histórico de versões, data de atualização e acesso pelos profissionais autorizados que acompanham o aluno.
        </GuideRow>
        <GuideRow icon={ShieldCheck} title="Notas importantes" open={openGuide==='notes'} onClick={()=>setOpenGuide(openGuide==='notes'?null:'notes')}>
          Esta área centraliza documentação nutricional e facilita o acompanhamento integrado. Não substitui avaliação, diagnóstico ou prescrição por nutricionista.
        </GuideRow>
      </div>
    </section>

    {!isStudent&&!context.studentId&&<section className="nutritionStudentFilterV2 card">
      <span className="nutritionSectionLabel">ALUNO</span>
      <label><UserRound/><select value={selectedStudentId} onChange={event=>setSelectedStudentId(event.target.value)}><option value="">Todos os alunos visíveis</option>{studentOptions.map(student=><option value={student.id} key={student.id}>{student.name}</option>)}</select></label>
    </section>}

    {notice&&<div className="successBanner"><CheckCircle2 size={18}/>{notice}</div>}
    {(error||nutritionError)&&<div className="errorBanner"><AlertTriangle size={18}/>{error||nutritionError}</div>}
    {nutritionLoading&&!data.nutrition.length?<div className="card pad loadingCard"><div className="loader"/><p>A carregar documentos…</p></div>:null}

    {!isStudent&&visibleRequests.length>0&&<section className="card pad section nutritionRequestsV2">
      <span className="eyebrow">PEDIDOS DE CONSULTA</span><h2>Consultas de nutrição</h2>
      <div className="nutritionDocs section">{visibleRequests.map(request=>{const student=data.students.find(item=>item.id===request.studentId);return <article className="nutritionDocCard card" key={request.id}><div className="nutritionDocBadge"><CalendarPlus size={29}/></div><div className="nutritionDocBody"><h2>{student?.name||'Aluno'}</h2><p>{request.message||'Sem observações adicionais.'}</p><div className="nutritionDocMeta"><span>{fmtDate(request.createdAt)}</span><span>{requestStatusLabel[request.status]||request.status}</span></div></div><div className="nutritionDocActions"><select value={request.status} onChange={event=>changeRequestStatus(request,event.target.value)}><option value="requested">Pedido recebido</option><option value="contacted">Aluno contactado</option><option value="scheduled">Consulta agendada</option><option value="completed">Concluído</option><option value="cancelled">Cancelado</option></select></div></article>})}</div>
    </section>}

    <section className={`nutritionCurrentArea card ${currentItem?'hasPlan':'empty'}`}>
      {resolvedStudentId&&currentItem ? <>
        <div className="nutritionCurrentTop"><div className="nutritionCurrentIcon"><FileCheck2/></div><div className="nutritionCurrentCopy"><span className="nutritionSectionLabel">PLANO ATUAL</span><h2>{currentItem.title}</h2>{targetStudent&&<p>{targetStudent.name}</p>}<div className="nutritionCurrentMeta"><span>Atualizado {fmtDate(currentItem.createdAt)}</span><span>{currentItem.uploadedByName}</span>{currentItem.fileSizeBytes?<span>{sizeLabel(currentItem.fileSizeBytes)}</span>:null}</div>{currentItem.notes&&<small>{currentItem.notes}</small>}</div></div>
        <div className="nutritionCurrentActions"><button onClick={()=>setShowHistory(true)}><History/>Ver histórico</button>{canUpload&&<button className="highlight" onClick={()=>setShowUpload(true)}><Upload/>Substituir PDF</button>}<button onClick={()=>openDocument(currentItem)}><FileText/>Abrir documento</button></div>
      </> : !resolvedStudentId&&currentItems.length ? <>
        <div className="nutritionCurrentMultiHead"><span className="nutritionSectionLabel">PLANOS ATUAIS</span><h2>{currentItems.length} plano{currentItems.length===1?'':'s'} alimentar{currentItems.length===1?'':'es'}</h2></div>
        <div className="nutritionCurrentList">{currentItems.map(item=>{const student=data.students.find(s=>s.id===item.studentId);return <button key={item.id} onClick={()=>setSelectedStudentId(item.studentId)}><FileCheck2/><span><b>{student?.name||'Aluno'}</b><small>{item.title}</small></span><ChevronDown/></button>})}</div>
        <div className="nutritionCurrentActions"><button onClick={()=>setShowHistory(true)}><History/>Ver histórico</button>{canUpload&&<button className="highlight" onClick={()=>setShowUpload(true)}><Upload/>Adicionar PDF</button>}</div>
      </> : <>
        <div className="nutritionEmptyIllustration"><div><Apple/><Plus/></div></div><h2>Ainda não existe um plano alimentar</h2><p>Adiciona o PDF mais recente para manter o aluno e a equipa que o acompanha atualizados.</p>
        <div className="nutritionCurrentActions"><button disabled={!historicalItems.length} onClick={()=>setShowHistory(true)}><History/>Ver histórico</button>{canUpload?<button className="highlight" onClick={()=>setShowUpload(true)}><Upload/>Adicionar PDF</button>:!ownRequest&&<button className="highlight" onClick={()=>setShowConsultationRequest(true)}><CalendarPlus/>Pedir consulta</button>}<button disabled><FileText/>Abrir documento</button></div>
      </>}
    </section>

    {showHistory&&<Modal title="Histórico de planos" eyebrow="NUTRIÇÃO" close={()=>setShowHistory(false)} className="nutritionHistoryModal">
      <p className="nutritionHistoryIntro">{targetStudent?.name||(!resolvedStudentId?'Todos os alunos visíveis':'Planos alimentares')}</p>
      <div className="nutritionHistoryList">{historyForModal.length ? historyForModal.map(item=>{const student=data.students.find(s=>s.id===item.studentId);return <article className="nutritionHistoryItem" key={item.id}><div className={`nutritionHistoryDot ${item.isCurrent!==false?'current':''}`}/><div><div className="nutritionHistoryTitle"><b>{item.title}</b>{item.isCurrent!==false&&<span>ATUAL</span>}</div>{!resolvedStudentId&&<small>{student?.name||'Aluno'}</small>}<p>{fmtDate(item.createdAt)} · {item.uploadedByName}{item.fileSizeBytes?` · ${sizeLabel(item.fileSizeBytes)}`:''}</p></div><div className="nutritionHistoryActions"><button className="secondary" onClick={()=>openDocument(item)}><ExternalLink/>Abrir</button>{!isStudent&&<button className="iconDanger" onClick={()=>remove(item)} title="Eliminar definitivamente"><Trash2/></button>}</div></article>}) : <div className="nutritionHistoryEmpty"><History/><b>Sem versões anteriores</b><span>Quando substituíres um plano, a versão anterior ficará guardada aqui.</span></div>}</div>
    </Modal>}

    {showConsultationRequest&&isStudent&&<Modal title="Pedir consulta de nutrição" eyebrow="NUTRIÇÃO" close={()=>setShowConsultationRequest(false)}><form className="formGrid" onSubmit={requestConsultation}><div className="wide"><p>Envia o pedido à equipa ULTIMATE FIT. Entraremos em contacto contigo para combinar os próximos passos.</p></div><label className="wide">Observações <span style={{opacity:.6}}>(opcional)</span><textarea name="message" rows="4" maxLength="800" placeholder="Ex.: Prefiro consultas ao final do dia…"/></label><div className="modalActions wide"><button type="button" className="secondary" onClick={()=>setShowConsultationRequest(false)}>Cancelar</button><button className="primary" disabled={saving}>{saving?'A enviar…':'Enviar pedido'}</button></div></form></Modal>}

    {showUpload&&!isStudent&&<Modal title={currentItem?'Substituir plano alimentar':'Adicionar plano alimentar'} eyebrow="NUTRIÇÃO" close={()=>setShowUpload(false)}><form className="formGrid" onSubmit={upload}>{!context.studentId&&<label className="wide">Aluno<select name="studentId" required defaultValue={selectedStudentId}><option value="">Selecionar aluno</option>{studentOptions.map(student=><option value={student.id} key={student.id}>{student.name}</option>)}</select></label>}<label className="wide">Título<input name="title" required defaultValue={currentItem?`Plano alimentar · ${new Intl.DateTimeFormat('pt-PT',{month:'long',year:'numeric'}).format(new Date())}`:''} placeholder="Ex.: Plano alimentar · Setembro 2026"/></label><label className="wide">PDF<input name="file" type="file" accept="application/pdf,.pdf" required/></label><label className="wide">Notas<textarea name="notes" rows="3" placeholder="Ex.: Plano elaborado pela nutricionista / orientações principais…"/></label><div className="wide nutritionUploadNote"><Upload size={18}/><p>Apenas PDF, até 8 MB. O novo documento passa a ser o plano atual; a versão anterior permanece no histórico.</p></div><div className="modalActions wide"><button type="button" className="secondary" onClick={()=>setShowUpload(false)}>Cancelar</button><button className="primary" disabled={saving}>{saving?'A carregar…':currentItem?'Substituir PDF':'Guardar PDF'}</button></div></form></Modal>}
  </div>;
}
