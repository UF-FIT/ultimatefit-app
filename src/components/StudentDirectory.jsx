import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, Apple, Archive, ArrowLeft, CalendarDays, Camera,
  Check, CheckCircle2, ChevronRight, Dumbbell, Edit3, ExternalLink, FileText,
  Mail, MessageCircle, MoreVertical, Plus, Power, RefreshCw, Search, Send,
  Target, Trash2, UserRound, Users, X, Flag,
} from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '../contexts/AppContext';
import ParqStatusCard from './ParqStatusCard';
import TrainingActivityCalendar from './TrainingActivityCalendar';
import {
  buildStudentAccessMessage, fetchAvailableTrainers, invokeStudentAction,
  sexOptions, studentStatusLabels, trackingTypeOptions, uploadStudentAvatar,
  whatsappUrl,
} from '../lib/students';
import { fetchChallenges } from '../lib/challenges';
import { recordWorkoutCompletion } from '../lib/training';
import { downloadAssessmentPdf } from '../lib/assessmentPdf';

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
      <Field label="Telemóvel / WhatsApp"><input name="phone" defaultValue={student?.phone || ''} inputMode="tel" placeholder="Ex.: 912 345 678" /></Field>
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
  const rows = assessments
    .filter(item => item.status === 'published')
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-5);
  return <section className="profileChart card">
    <div className="profileChartHeader"><div><span className="eyebrow">EVOLUÇÃO</span><h3>Últimas 5 avaliações</h3><p>Peso e cintura em leitura rápida. A área de Avaliação Física permite comparar as restantes métricas.</p></div><Activity size={24}/></div>
    {rows.length ? <><div className="profileChartLegend"><span><i className="weightDot"/>Peso</span><span><i className="waistDot"/>Cintura</span></div><ResponsiveContainer width="100%" height={230}><LineChart data={rows}><XAxis dataKey="date" tick={{ fill: '#777', fontSize: 11 }} /><YAxis tick={{ fill: '#777', fontSize: 11 }} /><Tooltip contentStyle={{ background: '#111', border: '1px solid #333' }} /><Line type="monotone" dataKey="weight" name="Peso" stroke="#ffd908" strokeWidth={3} connectNulls /><Line type="monotone" dataKey="waist" name="Cintura" stroke="#aaa" strokeWidth={2} connectNulls /></LineChart></ResponsiveContainer></> : <div className="emptyChart"><Activity size={30}/><b>Sem avaliações publicadas</b><span>A evolução aparecerá aqui após as primeiras avaliações.</span></div>}
  </section>;
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
  return <section className="card pad studentGoalPanel"><div className="panelTitle"><div><span className="eyebrow">OBJETIVOS</span><h2>Foco do acompanhamento</h2><p>As metas ficam integradas no perfil do aluno.</p></div><Target size={25}/></div>
    {editing ? <div className="goalEditor"><textarea value={value} onChange={event => setValue(event.target.value)} rows="4" placeholder="Ex.: melhorar mobilidade, reduzir perímetro da cintura, ganhar força…"/><div className="modalActions"><button className="secondary" onClick={() => { setEditing(false); setValue(student.mainGoal || ''); }}>Cancelar</button><button className="primary" onClick={save} disabled={busy}>{busy ? 'A guardar…' : 'Guardar objetivo'}</button></div></div>
      : <div className="goalSummary"><strong>{student.mainGoal || 'Objetivo ainda não definido.'}</strong>{editable && <button className="secondary" onClick={() => setEditing(true)}><Edit3 size={16}/>{student.mainGoal ? 'Editar objetivo' : 'Definir objetivo'}</button>}</div>}
    {message && <small className="challengeInlineMessage">{message}</small>}
  </section>;
}

function useStudentChallengeSummary(studentId) {
  const [summary, setSummary] = useState({ loading: true, active: 0, total: 0 });
  useEffect(() => {
    let alive = true;
    if (!studentId) { setSummary({ loading: false, active: 0, total: 0 }); return () => {}; }
    fetchChallenges().then(rows => {
      if (!alive) return;
      const assigned = (rows || []).filter(challenge => (challenge.challenge_participants || []).some(item => item.student_id === studentId && item.status === 'active'));
      setSummary({ loading: false, active: assigned.filter(item => item.status === 'active').length, total: assigned.length });
    }).catch(() => { if (alive) setSummary({ loading: false, active: 0, total: 0 }); });
    return () => { alive = false; };
  }, [studentId]);
  return summary;
}

function AssignedTrainerProfile({ trainer, studentName }) {
  if (!trainer) return <section className="card pad trainerProfileCard empty"><UserRound size={27}/><div><span className="eyebrow">PROFESSOR PRINCIPAL</span><h2>Por definir</h2><p>O estúdio ainda não definiu o professor principal deste aluno.</p></div></section>;
  const contactUrl = whatsappUrl(trainer.whatsappPhone, `Olá ${trainer.name}, sou ${studentName}.`);
  const initials = trainer.name?.split(' ').map(item => item[0]).slice(0, 2).join('') || 'PT';
  return <section className="card pad trainerProfileCard">
    <div className="assignedTrainerPhoto">{trainer.thumbUrl || trainer.photoUrl ? <img src={trainer.thumbUrl || trainer.photoUrl} alt={trainer.name}/> : <span>{initials}</span>}</div>
    <div className="assignedTrainerInfo"><span className="eyebrow">PROFESSOR PRINCIPAL</span><h2>{trainer.name}</h2><p>{trainer.professionalTitle || 'Personal Trainer'}</p></div>
    <div className="assignedTrainerActions"><button className="primary" onClick={() => contactUrl && window.open(contactUrl, '_blank', 'noopener,noreferrer')} disabled={!contactUrl}><MessageCircle size={17}/>WhatsApp</button>{trainer.socialUrl && <a className="secondary" href={trainer.socialUrl} target="_blank" rel="noreferrer"><ExternalLink size={17}/>Rede social</a>}</div>
  </section>;
}

function StudentDetailsPanel({ student, self = false }) {
  return <section className="card pad studentDetails profileInfoPanel"><div className="panelTitle"><div><span className="eyebrow">PERFIL</span><h2>Dados do aluno</h2><p>{self ? 'Os teus dados pessoais e de acompanhamento.' : 'Informação essencial para o acompanhamento.'}</p></div><UserRound size={24}/></div><div className="detailsGrid profileDetailsGrid">
    <div><small>Email</small><b>{student.email || '—'}</b></div><div><small>Telemóvel</small><b>{student.phone || '—'}</b></div>
    <div><small>Nascimento</small><b>{formatDate(student.birth)}</b></div><div><small>Idade</small><b>{student.age ?? '—'} anos</b></div>
    <div><small>Tipo de acompanhamento</small><b>{trackingLabels[student.trackingType] || '—'}</b></div><div><small>Data de início</small><b>{formatDate(student.startDate)}</b></div>
    {student.occupation && <div><small>Profissão</small><b>{student.occupation}</b></div>}{student.city && <div><small>Localidade</small><b>{student.city}</b></div>}
    {student.emergencyContactPhone && <div className="wideDetail"><small>Contacto de emergência</small><b>{student.emergencyContactName ? `${student.emergencyContactName} · ` : ''}{student.emergencyContactPhone}</b></div>}
  </div></section>;
}

function ProfileModuleHub({ student, assessments = [], onNavigate, studentView = false }) {
  const { data } = useApp();
  const challengeSummary = useStudentChallengeSummary(student.id);
  const published = assessments.filter(item => item.status === 'published').sort((a,b) => String(b.date).localeCompare(String(a.date)));
  const latest = published[0];
  const plans = data.plans.filter(item => item.studentId === student.id);
  const foods = data.nutrition.filter(item => item.studentId === student.id);
  const activePlan = plans.find(item => item.status === 'published' && item.active) || plans.find(item => item.status === 'published') || plans[0];
  const currentFood = foods[0];
  const modules = [
    { key:'assessments', icon:Activity, title:'Avaliação física', caption: latest ? `Última: ${formatDate(latest.date)} · ${published.length} publicada(s)` : 'Ainda sem avaliações publicadas', context:{studentId:student.id}, status: latest ? 'Atualizada' : 'Por iniciar' },
    { key:'plans', icon:Dumbbell, title:'Plano de treino', caption: activePlan ? activePlan.title : 'Sem plano ativo', context:{studentId:student.id}, status: activePlan ? 'Disponível' : 'A preparar' },
    { key:'nutrition', icon:Apple, title:'Plano alimentar', caption: currentFood ? currentFood.title : 'Sem plano publicado', context:{studentId:student.id}, status: currentFood ? 'Disponível' : 'A preparar' },
    { key:'challenges', icon:Flag, title:'Desafios', caption: challengeSummary.loading ? 'A verificar desafios…' : challengeSummary.active ? `${challengeSummary.active} desafio(s) ativo(s)` : 'Sem desafios ativos', context:{studentId:student.id}, status: challengeSummary.active ? 'Em curso' : 'Disponível' },
  ];
  return <section className="profileHub"><div className="profileHubHeader"><div><span className="eyebrow">ÁREA DO ALUNO</span><h2>{studentView ? 'O meu acompanhamento' : 'Acompanhamento'}</h2><p>Todos os módulos deste aluno num único perfil.</p></div></div><div className="profileHubGrid">{modules.map(({key,icon:Icon,title,caption,context,status}) => <button key={key} className="profileHubCard" onClick={() => onNavigate?.(key, context)}><div className="profileHubIcon"><Icon/></div><div className="profileHubCopy"><div><b>{title}</b><span>{status}</span></div><p>{caption}</p></div><ChevronRight/></button>)}</div></section>;
}

function AssessmentSnapshot({ assessments = [], onOpen }) {
  const published = assessments.filter(item => item.status === 'published').sort((a,b) => String(b.date).localeCompare(String(a.date)));
  const latest = published[0];
  if (!latest) return <section className="card pad assessmentSnapshot empty"><div className="panelTitle"><div><span className="eyebrow">AVALIAÇÃO FÍSICA</span><h2>Sem avaliação publicada</h2><p>Quando existir uma avaliação, os indicadores principais aparecem aqui.</p></div><Activity size={24}/></div><button className="secondary" onClick={onOpen}>Abrir Avaliação Física</button></section>;
  return <section className="card pad assessmentSnapshot"><div className="panelTitle"><div><span className="eyebrow">ÚLTIMA AVALIAÇÃO · {formatDate(latest.date)}</span><h2>Resumo físico</h2><p>Leitura rápida da avaliação mais recente.</p></div><Activity size={24}/></div><div className="snapshotMetrics"><div><small>Peso</small><b>{latest.weight ?? '—'}{latest.weight != null ? ' kg' : ''}</b></div><div><small>Massa gorda</small><b>{latest.fat ?? '—'}{latest.fat != null ? ' %' : ''}</b></div><div><small>Massa muscular</small><b>{latest.muscle ?? '—'}{latest.muscle != null ? ' kg' : ''}</b></div><div><small>Cintura</small><b>{latest.waist ?? '—'}{latest.waist != null ? ' cm' : ''}</b></div></div><button className="secondary" onClick={onOpen}>Ver histórico e evolução <ChevronRight size={16}/></button></section>;
}

function StudentProfile({ student, currentUser, trainers, assessments, onBack, onEdit, onRefresh, onNavigate }) {
  const { data, refreshTraining } = useApp();
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showTrainingLog, setShowTrainingLog] = useState(false);
  const [trainingDate, setTrainingDate] = useState(()=>new Date().toISOString().slice(0,10));
  const [trainingNotes, setTrainingNotes] = useState('');
  const studentCompletions=(data.workoutCompletions||[]).filter(item=>item.studentId===student.id);
  const isAdmin = currentUser.role === 'admin';
  const canDelete = isAdmin && !student.deletedAt;
  const isRemoved = Boolean(student.deletedAt);
  const canWhatsappStudent = Boolean(student.phone);

  async function action(type) {
    const label = type === 'delete' ? 'eliminar o acesso' : type === 'archive' ? 'arquivar o aluno' : type === 'deactivate' ? 'desativar o aluno' : 'reativar o aluno';
    if (!window.confirm(`Confirmas que pretendes ${label}?`)) return;
    setBusy(type);setError('');setMessage('');
    try { const result = await invokeStudentAction({ action: type, studentId: student.id }); setMessage(result.message); await onRefresh(); if (type === 'delete') onBack(); }
    catch (err) { setError(err.message); }
    finally { setBusy(''); }
  }
  function openWhatsApp(url) { if (url) window.open(url, '_blank', 'noopener,noreferrer'); }

  return <div className="studentProfilePage">
    <button className="backButton profileBack" onClick={onBack}><ArrowLeft size={18}/>Voltar aos alunos</button>
    {message && <div className="successBanner"><CheckCircle2 size={18}/>{message}</div>}{error && <div className="errorBanner"><AlertTriangle size={18}/>{error}</div>}
    <section className="studentProfileHero profileHeroV2"><StudentPhoto student={student} large/><div className="profileIdentity"><span className="eyebrow">{student.studentCode}</span><h1>{student.name}</h1><p>{student.age ?? '—'} anos · {formatDate(student.birth)}</p><div className="profileChips"><span>{trackingLabels[student.trackingType] || 'Acompanhamento por definir'}</span><span>{studentStatusLabels[student.deletedAt ? 'removed' : student.status] || student.status}</span><span>Professor: {student.primaryTrainer?.name || 'Por definir'}</span></div></div><div className="profileQuickActions"><button onClick={onEdit}><Edit3 size={19}/><span>Editar perfil</span></button><button onClick={() => openWhatsApp(whatsappUrl(student.phone, buildStudentAccessMessage(student)))} disabled={!canWhatsappStudent}><Send size={19}/><span>Enviar app</span></button><button onClick={() => onNavigate?.('assessments',{studentId:student.id})}><Activity size={19}/><span>Avaliação física</span></button><button onClick={()=>setShowTrainingLog(true)}><CheckCircle2 size={19}/><span>Registar treino</span></button><button onClick={() => openWhatsApp(whatsappUrl(student.phone))} disabled={!canWhatsappStudent}><MessageCircle size={19}/><span>WhatsApp</span></button></div></section>

    <ProfileModuleHub student={student} assessments={assessments} onNavigate={onNavigate}/>
    <TrainingActivityCalendar completions={studentCompletions}/>
    <div className="grid two profileOverviewGrid"><AssessmentSnapshot assessments={assessments} onOpen={() => onNavigate?.('assessments',{studentId:student.id})}/><AssignedTrainerProfile trainer={student.primaryTrainer} studentName={student.name}/></div>
    <div className="grid two profileOverviewGrid"><StudentGoalPanel student={student} editable={currentUser.role !== 'aluno'} onRefresh={onRefresh}/><StudentDetailsPanel student={student}/></div>
    <ParqStatusCard studentId={student.id} studentName={student.name}/>
    <ProfileSummaryChart assessments={assessments}/>

    <section className="card pad accessPanel profileAccessPanel"><div className="panelTitle"><div><span className="eyebrow">GESTÃO</span><h2>Acesso à aplicação</h2><p>Convite, estado e ciclo de vida da conta.</p></div><Power size={24}/></div><div className="accessStatus"><div><small>ESTADO</small><strong>{studentStatusLabels[student.deletedAt ? 'removed' : student.status] || student.status}</strong><span>{student.invitation?.status === 'pending' ? 'Convite pendente' : student.active ? 'Acesso disponível' : 'Sem acesso'}</span></div><div className="accessButtons">{isRemoved ? <span className="removedNotice">Registo removido com histórico preservado.</span> : <><button className="secondary" onClick={async()=>{setBusy('resend');try{const r=await invokeStudentAction({action:'resend_access',studentId:student.id});setMessage(r.message)}catch(e){setError(e.message)}finally{setBusy('')}}} disabled={busy==='resend'}><Mail size={16}/>Novo link</button>{student.active ? <button className="secondary" onClick={()=>action('deactivate')} disabled={busy}><Power size={16}/>Desativar</button> : <button className="primary" onClick={()=>action('reactivate')} disabled={busy}><RefreshCw size={16}/>Reativar</button>}<button className="secondary" onClick={()=>action('archive')} disabled={busy}><Archive size={16}/>Arquivar</button>{canDelete && <button className="dangerButton" onClick={()=>action('delete')} disabled={busy}><Trash2 size={16}/>Eliminar acesso</button>}</>}</div></div></section>
    {showTrainingLog&&<Modal title={`Registar treino · ${student.name}`} close={()=>setShowTrainingLog(false)}><form className="manualTrainingForm" onSubmit={async event=>{event.preventDefault();setBusy('training');setError('');try{await recordWorkoutCompletion({studentId:student.id,completedOn:trainingDate,source:'trainer',notes:trainingNotes});await refreshTraining();setMessage(`Treino de ${formatDate(trainingDate)} registado com sucesso.`);setTrainingNotes('');setShowTrainingLog(false)}catch(err){setError(err.message||'Não foi possível registar o treino.')}finally{setBusy('')}}}><label>Data do treino<input type="date" max={new Date().toISOString().slice(0,10)} value={trainingDate} onChange={event=>setTrainingDate(event.target.value)} required/></label><label>Nota opcional<textarea value={trainingNotes} onChange={event=>setTrainingNotes(event.target.value)} placeholder="Ex.: treino presencial de Personal Training"/></label><div className="modalActions"><button type="button" className="secondary" onClick={()=>setShowTrainingLog(false)}>Cancelar</button><button type="submit" className="primary" disabled={busy==='training'}><CheckCircle2 size={16}/>Registar treino</button></div></form></Modal>}
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
  const { currentUser, data } = useApp();
  const [editing, setEditing] = useState(false);
  const [trainers, setTrainers] = useState([]);
  const [notice, setNotice] = useState('');
  useEffect(()=>{fetchAvailableTrainers().then(setTrainers).catch(()=>{})},[]);
  if (!student) return <div className="emptyState card pad"><UserRound size={36}/><h2>Perfil do aluno indisponível</h2><p>Contacta a administração para concluir a associação da conta.</p></div>;
  const professorUrl = whatsappUrl(student.primaryTrainer?.whatsappPhone, `Olá ${student.primaryTrainer?.name || 'Professor'}, sou ${student.name}.`);
  const latestAssessment=[...assessments].filter(item=>item.status==='published').sort((a,b)=>a.date.localeCompare(b.date)).at(-1);
  function exportLatestAssessment(){if(!latestAssessment){setNotice('Ainda não existe uma avaliação publicada para exportar.');return;}try{downloadAssessmentPdf(student,latestAssessment);setNotice('PDF da avaliação exportado com sucesso.');}catch(err){setNotice(err.message||'Não foi possível exportar o PDF.')}}
  return <div className="studentSelfProfilePage">
    {notice&&<div className="successBanner"><CheckCircle2 size={18}/>{notice}</div>}
    <section className="studentSelfHero profileHeroV2"><StudentPhoto student={student} large/><div><span className="eyebrow">A MINHA ÁREA</span><h1>{student.name}</h1><p>{student.age ?? '—'} anos · {trackingLabels[student.trackingType] || 'Acompanhamento ULTIMATE FIT'}</p><div className="profileChips"><span>Professor: {student.primaryTrainer?.name || 'Por definir'}</span><span>{studentStatusLabels[student.status] || student.status}</span></div></div><div className="selfActions"><button onClick={()=>setEditing(true)}><Edit3/><span>Editar perfil</span></button><button onClick={exportLatestAssessment} disabled={!latestAssessment}><FileText/><span>Exportar avaliação em PDF</span></button><button onClick={()=>professorUrl&&window.open(professorUrl,'_blank','noopener,noreferrer')} disabled={!professorUrl}><MessageCircle/><span>Falar com o professor</span></button></div></section>
    <TrainingActivityCalendar completions={(data.workoutCompletions||[]).filter(item=>item.studentId===student.id)}/>
    <ProfileModuleHub student={student} assessments={assessments} onNavigate={onNavigate} studentView/>
    <AssignedTrainerProfile trainer={student.primaryTrainer} studentName={student.name}/>
    <div className="grid two profileOverviewGrid"><AssessmentSnapshot assessments={assessments} onOpen={() => onNavigate?.('assessments',{studentId:student.id})}/><StudentGoalPanel student={student} editable={false} onRefresh={onRefresh}/></div>
    <ParqStatusCard studentId={student.id} studentName={student.name}/>
    <ProfileSummaryChart assessments={assessments}/>
    <StudentDetailsPanel student={student} self/>
    {editing&&<Modal title="Editar o meu perfil" close={()=>setEditing(false)} wide><StudentForm student={student} trainers={trainers} currentUser={currentUser} onCancel={()=>setEditing(false)} onSaved={async message=>{setEditing(false);setNotice(message);await onRefresh?.()}}/></Modal>}
  </div>;
}
