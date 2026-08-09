import React, { useMemo, useState } from 'react';
import { AlertTriangle, Apple, CheckCircle2, ExternalLink, FileText, Plus, Trash2, Upload, X } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { deleteNutritionDocument, refreshNutritionDocumentUrl, uploadNutritionDocument } from '../lib/nutrition';

const fmtDate = value => value ? new Intl.DateTimeFormat('pt-PT', { dateStyle:'medium' }).format(new Date(value)) : '—';
const sizeLabel = bytes => !bytes ? '' : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function Heading({ title, sub, action }) { return <div className="heading"><div><h1>{title}</h1>{sub&&<p>{sub}</p>}</div>{action}</div>; }
function Modal({ title, close, children }) { return <div className="overlay"><div className="modal nutritionModal"><div className="title"><h2>{title}</h2><button className="iconButton" onClick={close}><X/></button></div>{children}</div></div>; }

export default function NutritionModule({ context = {} }) {
  const { data, currentUser, refreshNutrition, nutritionLoading, nutritionError } = useApp();
  const ownStudent = data.students.find(item => item.userId === currentUser.id);
  const [selectedStudentId, setSelectedStudentId] = useState(context.studentId || ownStudent?.id || '');
  const [showUpload, setShowUpload] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const isStudent = currentUser.role === 'aluno';
  const targetStudent = data.students.find(item => item.id === (context.studentId || selectedStudentId || ownStudent?.id));
  const visibleItems = useMemo(() => {
    const sid = isStudent ? ownStudent?.id : (context.studentId || selectedStudentId);
    return sid ? data.nutrition.filter(item => item.studentId === sid) : data.nutrition;
  }, [data.nutrition, isStudent, ownStudent?.id, context.studentId, selectedStudentId]);

  async function upload(event) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    try {
      const form = new FormData(event.currentTarget);
      const studentId = isStudent ? ownStudent?.id : (context.studentId || form.get('studentId') || selectedStudentId);
      await uploadNutritionDocument({ studentId, title:form.get('title'), notes:form.get('notes'), file:form.get('file') });
      await refreshNutrition(); setShowUpload(false); setNotice('Plano alimentar guardado na app.');
      if (!selectedStudentId && studentId) setSelectedStudentId(studentId);
    } catch (err) { setError(err.message || 'Não foi possível carregar o PDF.'); }
    finally { setSaving(false); }
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

  const canUpload = Boolean(isStudent ? ownStudent : (context.studentId ? targetStudent : true));
  return <div className="nutritionPage">
    <Heading
      title={targetStudent && !isStudent ? `Nutrição · ${targetStudent.name}` : 'Nutrição'}
      sub="Planos alimentares e documentos nutricionais num único local."
      action={canUpload ? <button className="primary" onClick={()=>setShowUpload(true)}><Plus size={17}/>Adicionar plano alimentar</button> : null}
    />

    <section className="nutritionHabitCard card pad">
      <div className="nutritionHabitIcon"><Apple size={28}/></div>
      <div><span className="eyebrow">ACOMPANHAMENTO INTEGRADO</span><h2>Mantém o teu plano alimentar atualizado</h2>
        <p>O plano alimentar é uma parte importante do acompanhamento. Tê-lo aqui permite que o teu Personal Trainer conheça as orientações nutricionais que estás a seguir e enquadre melhor o treino, a recuperação e os teus objetivos.</p>
        <p><b>Se o plano foi elaborado fora da ULTIMATE FIT, adiciona aqui o PDF mais recente.</b> O objetivo é facilitar a comunicação entre profissionais — não substituir o acompanhamento do nutricionista.</p>
      </div>
    </section>

    {!isStudent && !context.studentId && <div className="nutritionStudentFilter card pad"><label>Aluno<select value={selectedStudentId} onChange={event=>setSelectedStudentId(event.target.value)}><option value="">Todos os alunos</option>{data.students.map(student=><option value={student.id} key={student.id}>{student.name}</option>)}</select></label></div>}
    {notice && <div className="successBanner"><CheckCircle2 size={18}/>{notice}</div>}
    {(error || nutritionError) && <div className="errorBanner"><AlertTriangle size={18}/>{error || nutritionError}</div>}
    {nutritionLoading && !data.nutrition.length ? <div className="card pad loadingCard"><div className="loader"/><p>A carregar documentos…</p></div> : null}

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
      }) : <div className="card pad nutritionEmpty"><Apple size={34}/><h2>Ainda não existe um plano alimentar</h2><p>Adiciona o PDF mais recente para o manter acessível ao aluno e à equipa que o acompanha.</p></div>}
    </div>

    {showUpload && <Modal title="Adicionar plano alimentar" close={()=>setShowUpload(false)}><form className="formGrid" onSubmit={upload}>
      {!isStudent && !context.studentId && <label className="wide">Aluno<select name="studentId" required defaultValue={selectedStudentId}><option value="">Selecionar aluno</option>{data.students.map(student=><option value={student.id} key={student.id}>{student.name}</option>)}</select></label>}
      <label className="wide">Título<input name="title" required placeholder="Ex.: Plano alimentar · Setembro 2026"/></label>
      <label className="wide">PDF<input name="file" type="file" accept="application/pdf,.pdf" required/></label>
      <label className="wide">Notas<textarea name="notes" rows="3" placeholder="Ex.: Plano elaborado pela nutricionista / orientações principais…"/></label>
      <div className="wide nutritionUploadNote"><Upload size={18}/><p>Apenas PDF, até 8 MB. O documento fica privado e acessível apenas ao próprio aluno e aos profissionais autorizados.</p></div>
      <div className="modalActions wide"><button type="button" className="secondary" onClick={()=>setShowUpload(false)}>Cancelar</button><button className="primary" disabled={saving}>{saving?'A carregar…':'Guardar PDF'}</button></div>
    </form></Modal>}
  </div>;
}
