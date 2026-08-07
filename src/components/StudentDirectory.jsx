import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, Apple, Archive, ArrowLeft, CalendarDays, Camera,
  Check, CheckCircle2, ChevronRight, Dumbbell, Edit3, ExternalLink, FileText,
  Mail, MessageCircle, MoreVertical, Plus, Power, RefreshCw, Search, Send,
  Target, Trash2, UserRound, Users, X,
} from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '../contexts/AppContext';
import {
  buildStudentAccessMessage, fetchAvailableTrainers, invokeStudentAction,
  sexOptions, studentStatusLabels, trackingTypeOptions, uploadStudentAvatar,
  whatsappUrl,
} from '../lib/students';

const trackingLabels = Object.fromEntries(trackingTypeOptions.map(item => [item.value, item.label]));

function Modal({ title, close, children, wide = false }) {
  return <div className="overlay"><div className={`modal ${wide ? 'modalWide' : ''}`}><div className="title"><h2>{title}</h2><button className="iconButton" onClick={close}><X /></button></div>{children}</div></div>;
}

function Field({ label, className = '', children }) {
  return <label className={className}>{label}{children}</label>;
}

function StudentPhoto({ student, large = false }) {
  const initials = student.name?.split(' ').map(item => item[0]).slice(0, 2).join('') || 'AL';
  return <div className={`studentPhoto ${large ? 'large' : ''}`}>{student.thumbUrl || student.photoUrl
    ? <img src={large ? (student.photoUrl || student.thumbUrl) : (student.thumbUrl || student.photoUrl)} alt={student.name} />
    : <span>{initials}</span>}</div>;
}

function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-PT').format(new Date(`${value}T12:00:00`));
}

function StudentForm({ student, trainers, currentUser, onCancel, onSaved }) {
  const editing = Boolean(student);
  const currentTrainer = trainers.find(item => item.profileId === currentUser.id);
  const initialTrainerIds = student?.trainerProfileIds?.length
    ? student.trainerProfileIds
    : currentTrainer ? [currentTrainer.trainerProfileId] : [];
  const [selectedTrainers, setSelectedTrainers] = useState(initialTrainerIds);
  const [primaryTrainerId, setPrimaryTrainerId] = useState(student?.primaryTrainer?.trainerProfileId || initialTrainerIds[0] || '');
  const [photo, setPhoto] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const canAssign = currentUser.role === 'admin';
  const isStudentSelf = currentUser.role === 'aluno';

  function toggleTrainer(id) {
    setSelectedTrainers(list => {
      const next = list.includes(id) ? list.filter(item => item !== id) : [...list, id];
      if (!next.includes(primaryTrainerId)) setPrimaryTrainerId(next[0] || '');
      return next;
    });
  }

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const nif = String(form.get('nif') || '').replace(/\D/g, '');
    if (nif && nif.length !== 9) {
      setError('O NIF, quando preenchido, deve ter exatamente 9 algarismos.');
      setSubmitting(false);
      return;
    }
    try {
      if (!editing) {
        const result = await invokeStudentAction({
          action: 'invite',
          firstName: form.get('firstName'),
          lastName: form.get('lastName'),
          email: form.get('email'),
          phone: form.get('phone'),
          birthDate: form.get('birthDate'),
          sex: form.get('sex'),
          nif,
          occupation: form.get('occupation'),
          address: form.get('address'),
          postalCode: form.get('postalCode'),
          city: form.get('city'),
          emergencyContactName: form.get('emergencyContactName'),
          emergencyContactPhone: form.get('emergencyContactPhone'),
          startDate: form.get('startDate'),
          trackingType: form.get('trackingType'),
          notes: form.get('notes'),
          trainerIds: selectedTrainers,
          primaryTrainerId,
        });
        let photoWarning = '';
        if (photo && result.student?.id) {
          try { await uploadStudentAvatar(result.student.id, photo); }
          catch (uploadError) { photoWarning = ` A conta foi criada, mas a fotografia não foi carregada: ${uploadError.message}`; }
        }
        await onSaved(`${result.message}${photoWarning}`);
      } else {
        await invokeStudentAction({
          action: 'update_profile',
          studentId: student.id,
          firstName: form.get('firstName'),
          lastName: form.get('lastName'),
          phone: form.get('phone'),
          birthDate: form.get('birthDate'),
          sex: form.get('sex'),
          nif,
          occupation: form.get('occupation'),
          address: form.get('address'),
          postalCode: form.get('postalCode'),
          city: form.get('city'),
          emergencyContactName: form.get('emergencyContactName'),
          emergencyContactPhone: form.get('emergencyContactPhone'),
          startDate: form.get('startDate'),
          trackingType: form.get('trackingType'),
          notes: form.get('notes'),
        });
        if (canAssign) {
          await invokeStudentAction({ action: 'assign_trainers', studentId: student.id, trainerIds: selectedTrainers, primaryTrainerId });
        }
        if (photo) await uploadStudentAvatar(student.id, photo);
        await onSaved('Perfil do aluno atualizado.');
      }
    } catch (err) {
      setError(err.message || 'Não foi possível guardar o aluno.');
    } finally {
      setSubmitting(false);
    }
  }

  return <form className="studentForm" onSubmit={submit}>
    {error && <div className="errorBanner wide"><AlertTriangle size={18} />{error}</div>}
    <section className="formSection wide"><h3><UserRound size={18} />Dados pessoais</h3><div className="formGrid">
      <Field label="Fotografia" className="wide"><div className="photoPicker"><Camera size={20}/><input type="file" accept="image/*" onChange={event => setPhoto(event.target.files?.[0] || null)} /><span>{photo?.name || 'JPG, PNG ou WebP — será otimizado automaticamente.'}</span></div></Field>
      <Field label="Nome *"><input name="firstName" defaultValue={student?.firstName || student?.name?.split(' ')[0] || ''} required /></Field>
      <Field label="Apelido *"><input name="lastName" defaultValue={student?.lastName || student?.name?.split(' ').slice(1).join(' ') || ''} required /></Field>
      <Field label="Email *" className="wide"><input name="email" type="email" defaultValue={student?.email || ''} required readOnly={editing} /></Field>
      {!isStudentSelf && <><Field label="Data de nascimento *"><input name="birthDate" type="date" defaultValue={student?.birth || ''} required /></Field>
      <Field label="Género"><select name="sex" defaultValue={student?.sex || ''}><option value="">Selecionar</option>{sexOptions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
      <Field label="NIF"><input name="nif" defaultValue={student?.nif || ''} inputMode="numeric" pattern="[0-9]{9}" maxLength="9" placeholder="9 algarismos" /></Field></>}
      <Field label="Profissão"><input name="occupation" defaultValue={student?.occupation || ''} /></Field>
    </div></section>

    <section className="formSection wide"><h3><MessageCircle size={18} />Contactos</h3><div className="formGrid">
      <Field label="Telemóvel / WhatsApp"><input name="phone" defaultValue={student?.phone || ''} inputMode="tel" /></Field>
      <Field label="Morada"><input name="address" defaultValue={student?.address || ''} /></Field>
      <Field label="Código postal"><input name="postalCode" defaultValue={student?.postalCode || ''} /></Field>
      <Field label="Localidade"><input name="city" defaultValue={student?.city || ''} /></Field>
      <Field label="Contacto de emergência"><input name="emergencyContactPhone" defaultValue={student?.emergencyContactPhone || ''} inputMode="tel" placeholder="Telefone" /></Field>
      <Field label="Nome do contacto de emergência"><input name="emergencyContactName" defaultValue={student?.emergencyContactName || ''} placeholder="Nome da pessoa" /></Field>
    </div></section>

    {!isStudentSelf && <section className="formSection wide"><h3><Dumbbell size={18} />Acompanhamento</h3><div className="formGrid">
      <Field label="Tipo de acompanhamento *"><select name="trackingType" defaultValue={student?.trackingType || ''} required><option value="">Selecionar</option>{trackingTypeOptions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
      <Field label="Data de início"><input name="startDate" type="date" defaultValue={student?.startDate || new Date().toISOString().slice(0, 10)} /></Field>
      <Field label="Observações internas" className="wide"><textarea name="notes" defaultValue={student?.notes || ''} rows="4" /></Field>
    </div>

    {canAssign ? <div className="trainerAssignment"><div className="assignmentHeader"><div><b>Professores responsáveis *</b><small>O aluno nunca pode alterar esta atribuição. Define um professor principal para o contacto por WhatsApp.</small></div></div><div className="trainerChoiceGrid">{trainers.map(trainer => <label key={trainer.trainerProfileId} className={selectedTrainers.includes(trainer.trainerProfileId) ? 'trainerChoice selected' : 'trainerChoice'}><input type="checkbox" checked={selectedTrainers.includes(trainer.trainerProfileId)} onChange={() => toggleTrainer(trainer.trainerProfileId)} /><div><b>{trainer.name}</b><small>{trainer.whatsappPhone ? `WhatsApp: ${trainer.whatsappPhone}` : 'WhatsApp em falta — não pode ser professor principal'}</small></div></label>)}</div><Field label="Professor principal"><select value={primaryTrainerId} onChange={event => setPrimaryTrainerId(event.target.value)} required><option value="">Selecionar</option>{trainers.filter(item => selectedTrainers.includes(item.trainerProfileId)).map(item => <option key={item.trainerProfileId} value={item.trainerProfileId} disabled={!item.whatsappPhone}>{item.name}{!item.whatsappPhone ? ' — WhatsApp em falta' : ''}</option>)}</select></Field></div>
      : <div className="roleCreationNote"><Check size={18}/><p>O aluno ficará automaticamente atribuído ao professor que está a criar o registo. O WhatsApp profissional tem de estar preenchido.</p></div>}
    </section>}

    <div className="modalActions wide"><button type="button" className="secondary" onClick={onCancel}>Cancelar</button><button className="primary" disabled={submitting}>{submitting ? 'A guardar…' : editing ? 'Guardar alterações' : 'Criar aluno e enviar convite'}</button></div>
  </form>;
}

function ProfileSummaryChart({ assessments = [] }) {
  const rows = assessments.slice(-4);
  return <div className="profileChart"><div className="profileChartHeader"><div><h3>Evolução · últimas 4 avaliações</h3><p>Peso, massa gorda, massa muscular e cintura. A evolução passa a fazer parte da avaliação física do aluno.</p></div></div>{rows.length ? <ResponsiveContainer width="100%" height={230}><LineChart data={rows}><XAxis dataKey="date" tick={{ fill: '#777', fontSize: 11 }} /><YAxis tick={{ fill: '#777', fontSize: 11 }} /><Tooltip contentStyle={{ background: '#111', border: '1px solid #333' }} /><Line type="monotone" dataKey="weight" stroke="#ffd908" strokeWidth={3} connectNulls /><Line type="monotone" dataKey="waist" stroke="#aaa" strokeWidth={2} connectNulls /></LineChart></ResponsiveContainer> : <div className="emptyChart"><Activity size={30}/><b>Sem avaliações publicadas</b><span>A evolução aparecerá aqui após as primeiras avaliações.</span></div>}</div>;
}

function StudentGoalPanel({ student, editable = false, onRefresh }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(student.mainGoal || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => setValue(student.mainGoal || ''), [student.mainGoal]);
  async function save() {
    setBusy(true); setMessage('');
    try {
      const result = await invokeStudentAction({ action: 'update_goal', studentId: student.id, mainGoal: value });
      setMessage(result.message || 'Objetivo atualizado.'); setEditing(false); await onRefresh?.();
    } catch (err) { setMessage(err.message || 'Não foi possível guardar o objetivo.'); }
    finally { setBusy(false); }
  }
  return <section className="card pad studentGoalPanel"><div className="panelTitle"><div><h2>Objetivos</h2><p>As metas do aluno ficam integradas no próprio perfil.</p></div><Target size={25}/></div>
    {editing ? <div className="goalEditor"><textarea value={value} onChange={event => setValue(event.target.value)} rows="4" placeholder="Ex.: melhorar mobilidade, reduzir perímetro da cintura, ganhar força…"/><div className="modalActions"><button className="secondary" onClick={() => { setEditing(false); setValue(student.mainGoal || ''); }}>Cancelar</button><button className="primary" onClick={save} disabled={busy}>{busy ? 'A guardar…' : 'Guardar objetivo'}</button></div></div>
      : <div className="goalSummary"><strong>{student.mainGoal || 'Objetivo ainda não definido.'}</strong>{editable && <button className="secondary" onClick={() => setEditing(true)}><Edit3 size={16}/>{student.mainGoal ? 'Editar objetivo' : 'Definir objetivo'}</button>}</div>}
    {message && <small className="challengeInlineMessage">{message}</small>}
  </section>;
}

function StudentProfile({ student, currentUser, trainers, assessments, onBack, onEdit, onRefresh, onNavigate }) {
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const isAdmin = currentUser.role === 'admin';
  const canDelete = isAdmin && !student.deletedAt;
  const isRemoved = Boolean(student.deletedAt);
  const canWhatsappStudent = Boolean(student.phone);

  async function action(type) {
    const label = type === 'delete' ? 'eliminar o acesso' : type === 'archive' ? 'arquivar o aluno' : type === 'deactivate' ? 'desativar o aluno' : 'reativar o aluno';
    if (!window.confirm(`Confirmas que pretendes ${label}?`)) return;
    setBusy(type);setError('');setMessage('');
    try {
      const result = await invokeStudentAction({ action: type, studentId: student.id });
      setMessage(result.message);
      await onRefresh();
      if (type === 'delete') onBack();
    } catch (err) { setError(err.message); }
    finally { setBusy(''); }
  }

  function openWhatsApp(url) {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return <div className="studentProfilePage">
    <button className="backButton profileBack" onClick={onBack}><ArrowLeft size={18}/>Voltar aos alunos</button>
    {message && <div className="successBanner"><CheckCircle2 size={18}/>{message}</div>}
    {error && <div className="errorBanner"><AlertTriangle size={18}/>{error}</div>}
    <section className="studentProfileHero">
      <StudentPhoto student={student} large />
      <div className="profileIdentity"><span className="eyebrow">{student.studentCode}</span><h1>{student.name}</h1><p>{student.age ?? '—'} anos · nascimento {formatDate(student.birth)}</p><div className="profileChips"><span>{trackingLabels[student.trackingType] || 'Acompanhamento por definir'}</span><span>{studentStatusLabels[student.deletedAt ? 'removed' : student.status] || student.status}</span><span>Professor principal: {student.primaryTrainer?.name || 'Por definir'}</span></div></div>
      <div className="profileQuickActions">
        <button onClick={onEdit}><Edit3 size={19}/><span>Editar perfil</span></button>
        <button onClick={() => openWhatsApp(whatsappUrl(student.phone, buildStudentAccessMessage(student)))} disabled={!canWhatsappStudent}><Send size={19}/><span>Enviar app</span></button>
        <button onClick={() => onNavigate?.('assessments')}><Activity size={19}/><span>Avaliação física</span></button>
        <button onClick={() => openWhatsApp(whatsappUrl(student.phone))} disabled={!canWhatsappStudent}><MessageCircle size={19}/><span>WhatsApp</span></button>
      </div>
    </section>

    <div className="grid two profileGrid">
      <section className="card pad accessPanel"><div className="panelTitle"><div><h2>Acesso</h2><p>Convite, estado e ciclo de vida da conta.</p></div><Power size={24}/></div><div className="accessStatus"><div><small>ESTADO</small><strong>{studentStatusLabels[student.deletedAt ? 'removed' : student.status] || student.status}</strong><span>{student.invitation?.status === 'pending' ? 'Convite pendente' : student.active ? 'Acesso disponível' : 'Sem acesso'}</span></div><div className="accessButtons">{isRemoved ? <span className="removedNotice">Registo removido com histórico preservado.</span> : <><button className="secondary" onClick={async()=>{setBusy('resend');try{const r=await invokeStudentAction({action:'resend_access',studentId:student.id});setMessage(r.message)}catch(e){setError(e.message)}finally{setBusy('')}}} disabled={busy==='resend'}><Mail size={16}/>Novo link</button>{student.active ? <button className="secondary" onClick={()=>action('deactivate')} disabled={busy}><Power size={16}/>Desativar</button> : <button className="primary" onClick={()=>action('reactivate')} disabled={busy}><RefreshCw size={16}/>Reativar</button>}<button className="secondary" onClick={()=>action('archive')} disabled={busy}><Archive size={16}/>Arquivar</button>{canDelete && <button className="dangerButton" onClick={()=>action('delete')} disabled={busy}><Trash2 size={16}/>Eliminar acesso</button>}</>}</div></div></section>
      <section className="card pad studentDetails"><div className="panelTitle"><div><h2>Ficha do aluno</h2><p>Dados essenciais do acompanhamento.</p></div><UserRound size={24}/></div><div className="detailsGrid"><div><small>Tipo</small><b>{trackingLabels[student.trackingType] || '—'}</b></div><div><small>Professor principal</small><b>{student.primaryTrainer?.name || '—'}</b></div><div><small>Início</small><b>{formatDate(student.startDate)}</b></div><div><small>Email</small><b>{student.email}</b></div><div><small>Telemóvel</small><b>{student.phone || '—'}</b></div></div></section>
    </div>

    <StudentGoalPanel student={student} editable={currentUser.role !== 'aluno'} onRefresh={onRefresh}/>
    <section className="profileModules"><button onClick={()=>onNavigate?.('assessments')}><Activity/><div><b>Avaliação física</b><span>Histórico, métricas, evolução e fotografias</span></div><ChevronRight/></button><button onClick={()=>onNavigate?.('plans')}><Dumbbell/><div><b>Plano de treino</b><span>Planos ativos e histórico</span></div><ChevronRight/></button><button onClick={()=>onNavigate?.('nutrition')}><Apple/><div><b>Plano alimentar</b><span>Documentos e notas</span></div><ChevronRight/></button></section>
    <ProfileSummaryChart assessments={assessments} />
  </div>;
}

export default function StudentDirectory({ onNavigate }) {
  const { data, currentUser, refreshStudents, studentsLoading, studentsError } = useApp();
  const [trainers, setTrainers] = useState([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [tracking, setTracking] = useState('all');
  const [trainer, setTrainer] = useState('all');
  const [selected, setSelected] = useState(new Set());
  const [activeStudentId, setActiveStudentId] = useState('');
  const [formStudent, setFormStudent] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const activeStudent = data.students.find(item => item.id === activeStudentId);

  useEffect(() => { fetchAvailableTrainers().then(setTrainers).catch(err => setError(err.message)); }, []);

  const list = useMemo(() => data.students.filter(student => {
    const query = q.trim().toLowerCase();
    const matchesQuery = !query || student.name.toLowerCase().includes(query) || student.studentCode.toLowerCase().includes(query);
    const lifecycleStatus = student.deletedAt ? 'removed' : student.status;
    const matchesStatus = status === 'all' ? !student.deletedAt : lifecycleStatus === status;
    const matchesTracking = tracking === 'all' || student.trackingType === tracking;
    const matchesTrainer = trainer === 'all' || student.trainerProfileIds.includes(trainer);
    return matchesQuery && matchesStatus && matchesTracking && matchesTrainer;
  }), [data.students, q, status, tracking, trainer]);

  function toggleSelected(id) {
    setSelected(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  async function bulkAction(action) {
    if (!selected.size) return;
    if (!window.confirm(`Aplicar esta ação a ${selected.size} aluno(s)?`)) return;
    setError('');setNotice('');
    try {
      for (const studentId of selected) await invokeStudentAction({ action, studentId });
      setSelected(new Set());
      await refreshStudents();
      setNotice('Ação concluída nos alunos selecionados.');
    } catch (err) { setError(err.message); }
  }

  async function saved(message) {
    setShowForm(false);setFormStudent(null);setNotice(message);setError('');
    await refreshStudents();
  }

  if (showForm) return <div className="studentFormPage">
    <div className="heading"><div><button className="backButton" onClick={()=>{setShowForm(false);setFormStudent(null)}}><ArrowLeft size={18}/>Voltar aos alunos</button><h1>{formStudent ? `Editar · ${formStudent.name}` : 'Novo aluno'}</h1><p>{formStudent ? 'Atualiza os dados do aluno e a respetiva atribuição.' : 'Cria o registo real e envia o convite de acesso.'}</p></div></div>
    <div className="card pad studentFormPageCard"><StudentForm student={formStudent} trainers={trainers} currentUser={currentUser} onCancel={()=>{setShowForm(false);setFormStudent(null)}} onSaved={saved}/></div>
  </div>;

  if (activeStudent) return <StudentProfile student={activeStudent} currentUser={currentUser} trainers={trainers} assessments={data.assessments.filter(item => item.studentId === activeStudent.id)} onBack={()=>setActiveStudentId('')} onEdit={()=>{setFormStudent(activeStudent);setShowForm(true)}} onRefresh={refreshStudents} onNavigate={onNavigate}/>;

  return <>
    <div className="heading"><div><h1>Alunos</h1><p>Contas reais, atribuição pelo estúdio e gestão segura do acompanhamento.</p></div><button className="primary" onClick={()=>{setFormStudent(null);setShowForm(true)}}><Plus size={17}/>Novo aluno</button></div>
    {notice && <div className="successBanner"><CheckCircle2 size={18}/>{notice}</div>}
    {(error || studentsError) && <div className="errorBanner"><AlertTriangle size={18}/>{error || studentsError}</div>}
    <div className="studentFilters"><div className="search"><Search size={18}/><input value={q} onChange={event=>setQ(event.target.value)} placeholder="Pesquisar nome ou número de aluno…"/></div><select value={status} onChange={event=>setStatus(event.target.value)}><option value="all">Todos os estados</option>{Object.entries(studentStatusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><select value={tracking} onChange={event=>setTracking(event.target.value)}><option value="all">Todos os acompanhamentos</option>{trackingTypeOptions.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select><select value={trainer} onChange={event=>setTrainer(event.target.value)}><option value="all">Todos os professores</option>{trainers.map(item=><option key={item.trainerProfileId} value={item.trainerProfileId}>{item.name}</option>)}</select></div>
    {selected.size > 0 && <div className="bulkToolbar"><b>{selected.size} selecionado(s)</b><button className="secondary" onClick={()=>bulkAction('deactivate')}><Power size={15}/>Desativar</button><button className="secondary" onClick={()=>bulkAction('reactivate')}><RefreshCw size={15}/>Reativar</button><button className="secondary" onClick={()=>bulkAction('archive')}><Archive size={15}/>Arquivar</button>{currentUser.role==='admin'&&<button className="dangerButton" onClick={()=>bulkAction('delete')}><Trash2 size={15}/>Eliminar acesso</button>}<button className="textButton" onClick={()=>setSelected(new Set())}>Limpar seleção</button></div>}
    {studentsLoading ? <div className="card pad loadingCard"><div className="loader"/><p>A carregar alunos…</p></div> : list.length ? <div className="studentDirectoryGrid">{list.map(student=><article className="studentDirectoryCard" key={student.id}><label className="studentSelect"><input type="checkbox" checked={selected.has(student.id)} onChange={()=>toggleSelected(student.id)}/><span/></label><StudentPhoto student={student}/><div className="studentCardIdentity"><h3>{student.name}</h3><p>{student.age ?? '—'} anos</p><small><CalendarDays size={14}/> {formatDate(student.birth)}</small></div><button className="secondary full" onClick={()=>setActiveStudentId(student.id)}>Entrar no perfil <ChevronRight size={16}/></button></article>)}</div> : <div className="emptyState card pad"><Users size={36}/><h2>Sem alunos</h2><p>Cria o primeiro registo real. O aluno receberá um email para definir a palavra-passe.</p><button className="primary" onClick={()=>setShowForm(true)}><Plus size={17}/>Novo aluno</button></div>}
  </>;
}

export function StudentSelfHome({ student, assessments = [], onNavigate, onRefresh }) {
  const { currentUser } = useApp();
  const [editing, setEditing] = useState(false);
  const [trainers, setTrainers] = useState([]);
  const [notice, setNotice] = useState('');
  useEffect(()=>{fetchAvailableTrainers().then(setTrainers).catch(()=>{})},[]);
  if (!student) return <div className="emptyState card pad"><UserRound size={36}/><h2>Perfil do aluno indisponível</h2><p>Contacta a administração para concluir a associação da conta.</p></div>;
  const professorUrl = whatsappUrl(student.primaryTrainer?.whatsappPhone, `Olá ${student.primaryTrainer?.name || 'Professor'}, sou ${student.name}.`);
  return <>
    {notice&&<div className="successBanner"><CheckCircle2 size={18}/>{notice}</div>}
    <section className="studentSelfHero"><StudentPhoto student={student} large/><div><span className="eyebrow">A MINHA ÁREA</span><h1>{student.name}</h1><p>{student.age ?? '—'} anos · Professor: {student.primaryTrainer?.name || 'Por definir'}</p></div><div className="selfActions"><button onClick={()=>setEditing(true)}><Edit3/><span>Editar perfil</span></button><button onClick={()=>professorUrl&&window.open(professorUrl,'_blank','noopener,noreferrer')} disabled={!professorUrl}><MessageCircle/><span>Falar com o professor</span></button></div></section>
    {student.primaryTrainer && <section className="assignedTrainerCard card"><div className="assignedTrainerPhoto">{student.primaryTrainer.thumbUrl||student.primaryTrainer.photoUrl?<img src={student.primaryTrainer.thumbUrl||student.primaryTrainer.photoUrl} alt={student.primaryTrainer.name}/>:<span>{student.primaryTrainer.name.split(' ').map(item=>item[0]).slice(0,2).join('')}</span>}</div><div className="assignedTrainerInfo"><span className="eyebrow">PROFESSOR PRINCIPAL</span><h2>{student.primaryTrainer.name}</h2><p>{student.primaryTrainer.professionalTitle || 'Personal Trainer'}</p></div><div className="assignedTrainerActions"><button className="primary" onClick={()=>professorUrl&&window.open(professorUrl,'_blank','noopener,noreferrer')} disabled={!professorUrl}><MessageCircle size={17}/>WhatsApp</button>{student.primaryTrainer.socialUrl&&<a className="secondary" href={student.primaryTrainer.socialUrl} target="_blank" rel="noreferrer"><ExternalLink size={17}/>Rede social</a>}</div></section>}
    <StudentGoalPanel student={student} editable={false} onRefresh={onRefresh}/>
    <section className="profileModules studentModules"><button onClick={()=>onNavigate?.('assessments')}><Activity/><div><b>Avaliação física</b><span>Últimas avaliações, evolução e gráfico comparativo</span></div><ChevronRight/></button><button onClick={()=>onNavigate?.('plans')}><Dumbbell/><div><b>Plano de treino</b><span>Consultar o plano atual</span></div><ChevronRight/></button><button onClick={()=>onNavigate?.('nutrition')}><Apple/><div><b>Plano alimentar</b><span>Consultar documentos publicados</span></div><ChevronRight/></button></section>
    <ProfileSummaryChart assessments={assessments.slice(-5)} />
    {editing&&<Modal title="Editar o meu perfil" close={()=>setEditing(false)} wide><StudentForm student={student} trainers={trainers} currentUser={currentUser} onCancel={()=>setEditing(false)} onSaved={async message=>{setEditing(false);setNotice(message);await onRefresh?.()}}/></Modal>}
  </>;
}
