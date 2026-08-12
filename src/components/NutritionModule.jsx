import React, { useMemo, useState } from 'react';
import { AlertTriangle, Apple, CalendarPlus, CheckCircle2, ExternalLink, FileText, Plus, Trash2, Upload, X } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { deleteNutritionDocument, refreshNutritionDocumentUrl, requestNutritionConsultation, updateNutritionConsultationRequestStatus, uploadNutritionDocument } from '../lib/nutrition';

const fmtDate = value => value ? new Intl.DateTimeFormat('pt-PT', { dateStyle:'medium' }).format(new Date(value)) : '—';
const sizeLabel = bytes => !bytes ? '' : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const requestStatusLabel = { requested:'Pedido recebido', contacted:'Aluno contactado', scheduled:'Consulta agendada', completed:'Concluído', cancelled:'Cancelado' };

function Heading({ title, sub, action }) { return <div className="heading"><div><h1>{title}</h1>{sub&&<p>{sub}</p>}</div>{action}</div>; }
function Modal({ title, close, children }) { return <div className="overlay"><div className="modal nutritionModal"><div className="title"><h2>{title}</h2><button className="iconButton" onClick={close}><X/></button></div>{children}</div></div>; }

export default function NutritionModule({ context = {} }) {
  const { data, currentUser, refreshNutrition, nutritionLoading, nutritionError, staffStudentScope, setStaffStudentScope, allStudentsCount, assignedStudentsCount } = useApp();
  const ownStudent = data.students.find(item => item.userId === currentUser.id);
  const [selectedStudentId, setSelectedStudentId] = useState(context.studentId || ownStudent?.id || '');
  const [showUpload, setShowUpload] = useState(false);
  const [showConsultationRequest, setShowConsultationRequest] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const isStudent = currentUser.role === 'aluno';
  const targetStudent = data.students.find(item => item.id === (context.studentId || selectedStudentId || ownStudent?.id));
  const visibleItems = useMemo(() => {
    const sid = isStudent ? ownStudent?.id : (context.studentId || selectedStudentId);
    return sid ? data.nutrition.filter(item => item.studentId === sid) : data.nutrition;
  }, [data.nutrition, isStudent, ownStudent?.id, context.studentId, selectedStudentId]);
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
      await refreshNutrition(); setShowUpload(false); setNotice('Plano alimentar guardado na app.');
      if (!selectedStudentId && studentId) setSelectedStudentId(studentId);
    } catch (err) { setError(err.message || 'Não foi possível carregar o PDF.'); }
    finally { setSaving(false); }
  }

  async function requestConsultation(event) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    try {
      const form = new FormData(event.currentTarget);
      await requestNutritionConsultation({ studentId: ownStudent?.id, message: form.get('message') });
      await refreshNutrition();
      setShowConsultationRequest(false);
      setNotice('Pedido enviado. A equipa ULTIMATE FIT entrará em contacto contigo para combinar a consulta.');
    } catch (err) { setError(err.message || 'Não foi possível enviar o pedido.'); }
    finally { setSaving(false); }
  }

  async function changeRequestStatus(request, status) {
    try {
      await updateNutritionConsultationRequestStatus({ id:request.id, status });
      await refreshNutrition();
      setNotice('Estado do pedido atualizado.'); setError('');
    } catch (err) { setError(err.message || 'Não foi possível atualizar o pedido.'); }
  }

  async function openDocument(item) {
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
  return <div className="nutritionPage">
    <Heading
      title={targetStudent && !isStudent ? `Nutrição · ${targetStudent.name}` : 'Nutrição'}
      sub="Planos alimentares e documentos nutricionais num único local."
      action={canUpload ? <button className="primary" onClick={()=>setShowUpload(true)}><Plus size={17}/>Adicionar plano alimentar</button> : null}
    />

    {currentUser.role === 'admin' && !context.studentId && <div className="nutritionStudentFilter card pad">
      <label>Âmbito de alunos
        <select value={staffStudentScope} onChange={event=>{setSelectedStudentId('');setStaffStudentScope(event.target.value)}}>
          <option value="assigned">Os meus alunos ({assignedStudentsCount})</option>
          <option value="all">Todos os alunos do estúdio ({allStudentsCount})</option>
        </select>
      </label>
      <small style={{display:'block',marginTop:8,opacity:.7}}>Esta opção aplica-se à área de gestão: alunos, avaliações, planos e pedidos de nutrição apresentados na app.</small>
    </div>}

    <section className="nutritionHabitCard card pad">
      <div className="nutritionHabitIcon"><Apple size={28}/></div>
      <div><span className="eyebrow">ACOMPANHAMENTO INTEGRADO</span><h2>Mantém o teu plano alimentar atualizado</h2>
        <p>O plano alimentar é uma parte importante do acompanhamento. Tê-lo aqui permite que o teu Personal Trainer conheça as orientações nutricionais que estás a seguir e enquadre melhor o treino, a recuperação e os teus objetivos.</p>
        {isStudent
          ? <p><b>Se já tens um plano elaborado fora da ULTIMATE FIT, envia o PDF ao teu Personal Trainer.</b> Se ainda não tens acompanhamento nutricional, podes pedir uma consulta através da ULTIMATE FIT.</p>
          : <p><b>Se o plano foi elaborado fora da ULTIMATE FIT, adiciona aqui o PDF mais recente.</b> O objetivo é facilitar a comunicação entre profissionais — não substituir o acompanhamento do nutricionista.</p>}
      </div>
    </section>

    {!isStudent && !context.studentId && <div className="nutritionStudentFilter card pad"><label>Aluno<select value={selectedStudentId} onChange={event=>setSelectedStudentId(event.target.value)}><option value="">Todos os alunos visíveis</option>{data.students.map(student=><option value={student.id} key={student.id}>{student.name}</option>)}</select></label></div>}
    {notice && <div className="successBanner"><CheckCircle2 size={18}/>{notice}</div>}
    {(error || nutritionError) && <div className="errorBanner"><AlertTriangle size={18}/>{error || nutritionError}</div>}
    {nutritionLoading && !data.nutrition.length ? <div className="card pad loadingCard"><div className="loader"/><p>A carregar documentos…</p></div> : null}

    {!isStudent && visibleRequests.length > 0 && <section className="card pad section">
      <span className="eyebrow">PEDIDOS DE CONSULTA</span>
      <h2>Consultas de nutrição</h2>
      <div className="nutritionDocs section">
        {visibleRequests.map(request => {
          const student = data.students.find(item => item.id === request.studentId);
          return <article className="nutritionDocCard card" key={request.id}>
            <div className="nutritionDocBadge"><CalendarPlus size={29}/></div>
            <div className="nutritionDocBody"><h2>{student?.name || 'Aluno'}</h2><p>{request.message || 'Sem observações adicionais.'}</p><div className="nutritionDocMeta"><span>{fmtDate(request.createdAt)}</span><span>{requestStatusLabel[request.status] || request.status}</span></div></div>
            <div className="nutritionDocActions"><select value={request.status} onChange={event=>changeRequestStatus(request,event.target.value)}><option value="requested">Pedido recebido</option><option value="contacted">Aluno contactado</option><option value="scheduled">Consulta agendada</option><option value="completed">Concluído</option><option value="cancelled">Cancelado</option></select></div>
          </article>;
        })}
      </div>
    </section>}

    <div className="nutritionDocs section">
      {visibleItems.length ? visibleItems.map((item, index) => {
        const student = data.students.find(s => s.id === item.studentId);
        return <article className="nutritionDocCard card" key={item.id}>
          <div className="nutritionDocBadge"><FileText size={29}/><span>PDF</span></div>
          <div className="nutritionDocBody"><div className="nutritionDocTitle"><div>{index===0 && (selectedStudentId || isStudent || context.studentId) && <span className="badge yellow">Mais recente</span>}<h2>{item.title}</h2></div></div>
            {!isStudent && !context.studentId && <p className="nutritionStudentName">{student?.name || 'Aluno'}</p>}
            {item.notes && <p>{item.notes}</p>}
            <div className="nutritionDocMeta"><span>{fmtDate(item.createdAt)}</span><span>{item.uploadedByName}</span>{item.fileSizeBytes ? <span>{sizeLabel(item.fileSizeBytes)}</span> : null}</div>
          </div>
          <div className="nutritionDocActions"><button className="secondary" onClick={()=>openDocument(item)}><ExternalLink size={16}/>Abrir PDF</button>{!isStudent&&<button className="iconDanger" title="Eliminar documento" onClick={()=>remove(item)}><Trash2 size={17}/></button>}</div>
        </article>;
      }) : <div className="card pad nutritionEmpty"><Apple size={34}/><h2>Ainda não existe um plano alimentar</h2>{isStudent ? <>{ownRequest ? <><p>Já recebemos o teu pedido de consulta de nutrição.</p><span className="badge yellow">{requestStatusLabel[ownRequest.status] || 'Pedido recebido'}</span></> : <><p>Podes pedir uma consulta com nutricionista através da ULTIMATE FIT.</p><button className="primary" onClick={()=>setShowConsultationRequest(true)}><CalendarPlus size={17}/>Pedir consulta de nutrição</button></>}</> : <p>Adiciona o PDF mais recente para o manter acessível ao aluno e à equipa que o acompanha.</p>}</div>}
    </div>

    {showConsultationRequest && isStudent && <Modal title="Pedir consulta de nutrição" close={()=>setShowConsultationRequest(false)}><form className="formGrid" onSubmit={requestConsultation}>
      <div className="wide"><p>Envia o pedido à equipa ULTIMATE FIT. Entraremos em contacto contigo para perceber a tua disponibilidade e combinar os próximos passos.</p></div>
      <label className="wide">Observações <span style={{opacity:.6}}>(opcional)</span><textarea name="message" rows="4" maxLength="800" placeholder="Ex.: Prefiro consultas ao final do dia / tenho disponibilidade à terça e quinta…"/></label>
      <div className="modalActions wide"><button type="button" className="secondary" onClick={()=>setShowConsultationRequest(false)}>Cancelar</button><button className="primary" disabled={saving}>{saving?'A enviar…':'Enviar pedido'}</button></div>
    </form></Modal>}

    {showUpload && !isStudent && <Modal title="Adicionar plano alimentar" close={()=>setShowUpload(false)}><form className="formGrid" onSubmit={upload}>
      {!context.studentId && <label className="wide">Aluno<select name="studentId" required defaultValue={selectedStudentId}><option value="">Selecionar aluno</option>{data.students.map(student=><option value={student.id} key={student.id}>{student.name}</option>)}</select></label>}
      <label className="wide">Título<input name="title" required placeholder="Ex.: Plano alimentar · Setembro 2026"/></label>
      <label className="wide">PDF<input name="file" type="file" accept="application/pdf,.pdf" required/></label>
      <label className="wide">Notas<textarea name="notes" rows="3" placeholder="Ex.: Plano elaborado pela nutricionista / orientações principais…"/></label>
      <div className="wide nutritionUploadNote"><Upload size={18}/><p>Apenas PDF, até 8 MB. O documento fica privado e acessível apenas ao próprio aluno e aos profissionais autorizados.</p></div>
      <div className="modalActions wide"><button type="button" className="secondary" onClick={()=>setShowUpload(false)}>Cancelar</button><button className="primary" disabled={saving}>{saving?'A carregar…':'Guardar PDF'}</button></div>
    </form></Modal>}
  </div>;
}
