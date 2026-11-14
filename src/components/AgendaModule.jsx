import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useApp} from '../contexts/AppContext';
import {cents,fetchPayments,money,paymentRpc,today} from '../lib/payments';
import {addDays,agendaRpc,attendanceLabels,localDateTime,monday,sessionKinds,shortDate} from '../lib/agenda';
import '../styles/payments.css';
import '../styles/agenda.css';

function Dialog({title,onClose,children}){const ref=useRef(null);useEffect(()=>{const el=ref.current;el.showModal();return()=>el.close();},[]);return createPortal(<dialog ref={ref} className="ufPaymentDialog ufAgendaDialog" aria-labelledby="agenda-dialog-title" onCancel={e=>{e.preventDefault();onClose();}}><header><h2 id="agenda-dialog-title">{title}</h2><button aria-label="Fechar" type="button" onClick={onClose}>×</button></header>{children}</dialog>,document.body);}
function FormDialog({title,onClose,onSave,children,button='Guardar'}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e){e.preventDefault();if(busy)return;setBusy(true);setError('');try{await onSave();}catch(err){setError(err.message);}finally{setBusy(false);}}
 return <Dialog title={title} onClose={()=>!busy&&onClose()}><form onSubmit={submit}><div className="ufPaymentFields">{children}</div>{error&&<p role="alert" className="ufPaymentError">{error}</p>}<footer><button type="button" disabled={busy} onClick={onClose}>Cancelar</button><button className="primary" disabled={busy}>{busy?'A guardar…':button}</button></footer></form></Dialog>;
}
function PackSelect({packs,studentId,value,onChange}){return <select aria-label="Pack associado" value={value||''} onChange={e=>onChange(e.target.value)}><option value="">Sem pack · mensalidade / sessão avulsa</option>{packs.filter(p=>p.student_id===studentId).map(p=><option key={p.id} value={p.id}>{p.title} · {p.total-p.used} de {p.total} disponíveis</option>)}</select>;}
export function SessionForm({session,attendance,students,packs,date,onClose,onSaved}){
 const [form,setForm]=useState(()=>session?{...session,starts_local:localDateTime(session.starts_at),participants:attendance.filter(a=>a.session_id===session.id).map(a=>({student_id:a.student_id,pack_id:a.pack_id||''}))}:{request_id:crypto.randomUUID(),kind:'individual',starts_local:date+'T09:00',duration:60,location:'',participants:[]});
 const [query,setQuery]=useState('');const set=(key,value)=>setForm(f=>({...f,[key]:value}));
 function toggle(id){setForm(f=>{const available=packs.filter(p=>p.student_id===id&&p.total>p.used);const packId=f.kind!=='assessment'&&available.length===1?available[0].id:'';return {...f,participants:f.participants.some(p=>p.student_id===id)?f.participants.filter(p=>p.student_id!==id):[...(f.kind==='group'?f.participants:[]),{student_id:id,pack_id:packId}]};});}
 async function save(){if(!form.participants.length)throw Error('Seleciona pelo menos um aluno.');await agendaRpc('pt_save_session',{p_data:form});onSaved('Sessão guardada.');}
 return <FormDialog title={session?'Editar sessão':'Nova sessão'} onClose={onClose} onSave={save} button="Guardar sessão">
  <label>Tipo<select aria-label="Tipo de sessão" value={form.kind} onChange={e=>setForm(f=>({...f,kind:e.target.value,participants:e.target.value==='group'?f.participants:f.participants.slice(0,1)}))}>{Object.entries(sessionKinds).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
  <div className="ufAgendaTwo"><label>Data<input type="date" required value={form.starts_local.slice(0,10)} onChange={e=>set('starts_local',e.target.value+'T'+form.starts_local.slice(11))}/></label><label>Hora<input type="time" required value={form.starts_local.slice(11)} onChange={e=>set('starts_local',form.starts_local.slice(0,10)+'T'+e.target.value)}/></label></div>
  <label>Duração (minutos)<input type="number" required min="5" max="480" value={form.duration} onChange={e=>set('duration',Number(e.target.value))}/></label>
  <label>Local ou ligação (opcional)<input maxLength={200} value={form.location} onChange={e=>set('location',e.target.value)}/></label>
  <label>Pesquisar aluno<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Nome do aluno"/></label>
  <div className="ufAgendaStudents">{students.filter(s=>s.name.toLocaleLowerCase('pt-PT').includes(query.toLocaleLowerCase('pt-PT'))).map(s=><label key={s.id} className="ufPaymentCheck"><input type="checkbox" checked={form.participants.some(p=>p.student_id===s.id)} onChange={()=>toggle(s.id)}/>{s.name}</label>)}</div>
  {form.participants.map(p=><label key={p.student_id}>{students.find(s=>s.id===p.student_id)?.name} · pack<PackSelect packs={packs} studentId={p.student_id} value={p.pack_id} onChange={value=>set('participants',form.participants.map(a=>a.student_id===p.student_id?{...a,pack_id:value}:a))}/></label>)}
  <p>Marcar uma sessão não desconta do pack. Horários em Portugal.</p>
 </FormDialog>;
}
export function AttendanceForm({row,name,packs,onClose,onSaved,initialStatus}){
 const [status,setStatus]=useState(initialStatus||row.status),[pack,setPack]=useState(row.pack_id||''),[decision,setDecision]=useState(!initialStatus&&['absent','cancelled'].includes(row.status)?String(row.deduct):'');
 async function save(){if(['absent','cancelled'].includes(status)&&!decision)throw Error('Escolhe se descontas ou não do pack.');await agendaRpc('pt_mark_attendance',{p_session:row.session_id,p_student:row.student_id,p_status:status,p_deduct:decision===''?null:decision==='true',p_pack:pack||null,p_version:row.version});onSaved('Presença e saldo do pack atualizados.');}
 return <FormDialog title={name} onClose={onClose} onSave={save}><label>Presença<select aria-label="Estado da presença" value={status} onChange={e=>{setStatus(e.target.value);setDecision('');}}>{Object.entries(attendanceLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
 <label>Pack<PackSelect packs={packs} studentId={row.student_id} value={pack} onChange={setPack}/></label>
 {['absent','cancelled'].includes(status)&&<label>Descontar esta sessão?<select required aria-label="Decisão de desconto" value={decision} onChange={e=>setDecision(e.target.value)}><option value="">Selecionar</option><option value="false">Não descontar</option><option value="true">Descontar do pack</option></select></label>}
 <p>{status==='present'?(pack?'Será descontada uma sessão do pack selecionado.':'Esta presença será registada sem desconto de pack.'):status==='booked'?'Qualquer desconto desta sessão será devolvido ao pack.':'Só será descontada uma sessão se escolheres essa opção.'}</p>
 </FormDialog>;
}
function PackForm({students,packs,payments,template,onClose,onSaved}){
 const [form,setForm]=useState({request_id:crypto.randomUUID(),student_id:template?.student_id||students[0]?.id||'',title:template?.title||'Pack de 10 sessões',total:template?.total||10,payment_id:'',amount:template?String((payments.find(p=>p.id===template.payment_id)?.amount_cents||0)/100):'',due_on:today()});
 const set=(key,value)=>setForm(f=>({...f,[key]:value}));
 const available=payments.filter(p=>p.student_id===form.student_id&&p.kind==='package'&&p.status!=='cancelled'&&!packs.some(pack=>pack.payment_id===p.id));
 async function save(){await agendaRpc('pt_create_pack',{p_data:{...form,amount_cents:form.payment_id?null:cents(form.amount)}});onSaved('Pack criado. O recebimento é confirmado na secção Pagamentos.');}
 return <FormDialog title={template?'Renovar pack':'Novo pack'} onClose={onClose} onSave={save}><label>Aluno<select aria-label="Aluno do pack" required value={form.student_id} onChange={e=>setForm(f=>({...f,student_id:e.target.value,payment_id:''}))}>{students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
 <label>Nome do pack<input required maxLength={120} value={form.title} onChange={e=>set('title',e.target.value)}/></label><label>Número de sessões<input required type="number" min="1" max="1000" value={form.total} onChange={e=>set('total',Number(e.target.value))}/></label>
 <label>Pagamento<select aria-label="Pagamento do pack" value={form.payment_id} onChange={e=>set('payment_id',e.target.value)}><option value="">Criar novo pagamento pendente</option>{available.map(p=><option key={p.id} value={p.id}>{p.description||'Pack registado'} · {money(p.amount_cents)} · {p.status==='paid'?'Pago':'Pendente'}</option>)}</select></label>
 {!form.payment_id&&<><label>Valor (€)<input required inputMode="decimal" value={form.amount} onChange={e=>set('amount',e.target.value)}/></label><label>Data limite<input required type="date" value={form.due_on} onChange={e=>set('due_on',e.target.value)}/></label></>}
 <p>Um novo pack tem o seu próprio saldo. A renovação mantém o histórico do anterior.</p></FormDialog>;
}

export default function AgendaModule(){
 const {data,currentUser}=useApp();
 const [day,setDay]=useState(today());
 const [view,setView]=useState(()=>typeof window!=='undefined'&&window.matchMedia('(max-width: 760px)').matches?'day':'week');
 const [access,setAccess]=useState(null),[snapshot,setSnapshot]=useState({sessions:[],attendance:[],packs:[]}),[payments,setPayments]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[dialog,setDialog]=useState(null),[tab,setTab]=useState('agenda'),[revision,setRevision]=useState(0);
 const week=monday(day),manager=access==='manage';
 const weekDays=Array.from({length:7},(_,i)=>addDays(week,i));
 const todayValue=today();
 const shortDays=['seg.','ter.','qua.','qui.','sex.','sáb.','dom.'];
 const fullDays=['segunda','terça','quarta','quinta','sexta','sábado','domingo'];
 const students=data.students.filter(s=>manager?s.trainerIds?.includes(currentUser.id)&&!s.deletedAt:s.userId===currentUser.id).sort((a,b)=>a.name.localeCompare(b.name,'pt-PT'));
 useEffect(()=>{let active=true;setLoading(true);setError('');(async()=>{try{const mode=await paymentRpc('student_module_access',{p_module:'agenda'});if(!active)return;setAccess(mode);if(mode==='none')return;const [result,financial]=await Promise.all([agendaRpc('pt_snapshot',{p_week:week}),fetchPayments()]);if(active){setSnapshot(result);setPayments(financial.payments);}}catch(err){if(active)setError(err.message);}finally{if(active)setLoading(false);}})();return()=>{active=false;};},[week,currentUser.id,revision]);
 const saved=message=>{setDialog(null);setNotice(message);setRevision(n=>n+1);};
 const weekEvents=snapshot.sessions.map(session=>{
  const local=localDateTime(session.starts_at);
  const startMinutes=Number(local.slice(11,13))*60+Number(local.slice(14,16));
  return {...session,local,sessionDate:local.slice(0,10),startMinutes,endMinutes:startMinutes+Number(session.duration),members:snapshot.attendance.filter(a=>a.session_id===session.id)};
 }).sort((a,b)=>a.startMinutes-b.startMinutes);
 const daySessions=weekEvents.filter(s=>s.sessionDate===day);
 const firstHour=weekEvents.length?Math.floor(Math.min(...weekEvents.map(s=>s.startMinutes))/60):7;
 const lastHour=weekEvents.length?Math.ceil(Math.max(...weekEvents.map(s=>s.endMinutes))/60):22;
 const startHour=Math.max(0,Math.min(7,firstHour));
 const endHour=Math.min(24,Math.max(22,lastHour));
 const hourCount=Math.max(1,endHour-startHour);
 const hourHeight=44;
 const hours=Array.from({length:hourCount},(_,i)=>startHour+i);
 const packOptions=snapshot.packs.filter(p=>payments.find(pay=>pay.id===p.payment_id)?.status!=='cancelled');
 const eventNames=session=>session.members.map(a=>students.find(st=>st.id===a.student_id)?.name||'Aluno').join(' + ');
 const eventKind=session=>session.kind==='group'&&session.members.length===2?'Treino duo':sessionKinds[session.kind];
 if(access==='none')return <section className="ufPayments"><h1>Agenda</h1><p>Esta funcionalidade ainda não está disponível para esta conta.</p></section>;
 return <section className="ufPayments ufAgenda">
  <div className="ufPaymentHeading"><div><h1>{manager?'Agenda':'A minha agenda'}</h1><p>Sessões PT e saldo dos packs.</p></div>{manager&&<button className="primary" disabled={loading} onClick={()=>setDialog({type:'session'})}>+ Nova sessão</button>}</div>
  <div className="ufPaymentFilters"><button aria-pressed={tab==='agenda'} onClick={()=>setTab('agenda')}>Agenda</button><button aria-pressed={tab==='packs'} onClick={()=>setTab('packs')}>Packs de sessões</button></div>
  {notice&&<p role="status" className="ufPaymentNotice">{notice}</p>}{error&&<div role="alert" className="ufPaymentError">{error}<button onClick={()=>setRevision(n=>n+1)}>Tentar novamente</button></div>}
  {loading?<p role="status">A carregar agenda…</p>:!error&&<>
   {tab==='agenda'?<>
    <div className="ufAgendaToolbar">
     <div className="ufAgendaDateNav"><button aria-label="Anterior" onClick={()=>setDay(addDays(day,view==='week'?-7:-1))}>‹</button><button onClick={()=>setDay(todayValue)}>Hoje</button><button aria-label="Seguinte" onClick={()=>setDay(addDays(day,view==='week'?7:1))}>›</button><span className="ufAgendaRange">{view==='week'?new Date(week+'T12:00:00Z').toLocaleDateString('pt-PT',{day:'numeric',month:'long',timeZone:'UTC'})+' – '+new Date(addDays(week,6)+'T12:00:00Z').toLocaleDateString('pt-PT',{day:'numeric',month:'long',timeZone:'UTC'}):new Date(day+'T12:00:00Z').toLocaleDateString('pt-PT',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'})}</span></div>
     <div className="ufAgendaToolbarActions"><div className="ufAgendaViewSwitch" role="group" aria-label="Vista da agenda"><button aria-pressed={view==='week'} onClick={()=>setView('week')}>Semana</button><button aria-pressed={view==='day'} onClick={()=>setView('day')}>Dia</button></div>{manager&&<button onClick={()=>setDialog({type:'copy'})}>Copiar semana</button>}</div>
    </div>
    {view==='week'?<div className="ufAgendaCalendar" aria-label="Agenda semanal">
     <div className="ufAgendaWeekHeader"><span className="ufAgendaWeekCorner" aria-hidden="true"/>{weekDays.map((date,i)=><button type="button" key={date} className={'ufAgendaWeekDay'+(date===day?' isSelected':'')+(date===todayValue?' isToday':'')} aria-label={fullDays[i]+' '+shortDate(date)} onClick={()=>{setDay(date);setView('day');}}><small>{fullDays[i]}</small><strong>{Number(date.slice(8,10))}</strong></button>)}</div>
     <div className="ufAgendaTimeline" style={{'--agenda-hour-height':hourHeight+'px','--agenda-hour-count':hourCount}}>
      <div className="ufAgendaTimeLabels" aria-hidden="true">{hours.map((hour,i)=><span key={hour} style={{top:(i*hourHeight)+'px'}}>{String(hour).padStart(2,'0')}:00</span>)}</div>
      {weekDays.map(date=><div key={date} className={'ufAgendaTimelineDay'+(date===day?' isSelected':'')+(date===todayValue?' isToday':'')} style={{height:(hourCount*hourHeight)+'px'}} role="group" aria-label={shortDate(date)}>
       {hours.map((hour,i)=><span key={hour} className="ufAgendaHourRule" style={{top:(i*hourHeight)+'px'}} aria-hidden="true"/>)}
       {weekEvents.filter(session=>session.sessionDate===date).map(session=>{const top=((session.startMinutes-startHour*60)/60)*hourHeight;const height=Math.max(20,(session.duration/60)*hourHeight);const names=eventNames(session);return <button key={session.id} type="button" className={'ufAgendaEvent'+(session.kind==='group'?' isGroup':'')+(session.kind==='online'?' isOnline':'')} style={{top:top+'px',height:height+'px'}} aria-label={localDateTime(session.starts_at).slice(11)+' · '+names+' · '+eventKind(session)} title={localDateTime(session.starts_at).slice(11)+' · '+names+' · '+eventKind(session)} onClick={()=>{setDay(date);setView('day');}}><strong><time>{localDateTime(session.starts_at).slice(11)}</time> {names}</strong>{height>=38&&<small>{eventKind(session)}</small>}</button>;})}
      </div>)}
     </div>
    </div>:<>
     <div className="ufAgendaDays">{weekDays.map((date,i)=>{const has=weekEvents.some(s=>s.sessionDate===date);return <button key={date} aria-pressed={day===date} aria-label={fullDays[i]+' '+shortDate(date)} onClick={()=>setDay(date)}><small>{shortDays[i]}</small><strong>{Number(date.slice(8,10))}</strong><span aria-hidden="true">{has?'•':' '}</span></button>;})}</div>
     <h2 className="ufAgendaDayTitle">{new Date(day+'T12:00:00Z').toLocaleDateString('pt-PT',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'})}{day===todayValue?' · Hoje':''}</h2>
     <div className="ufAgendaSessions">{daySessions.length?daySessions.map(s=>{const members=s.members;return <article key={s.id}><header><div><strong>{s.local.slice(11)} — {localDateTime(new Date(new Date(s.starts_at).getTime()+s.duration*60000)).slice(11)}</strong><p>{eventKind(s)} · {s.duration} min</p>{s.location&&<small>{s.location}</small>}</div>{manager&&<button disabled={members.some(a=>a.status!=='booked')} title="Para editar, as presenças têm de estar Por registar" onClick={()=>setDialog({type:'session',session:s})}>Editar</button>}</header>{members.map(a=>{const pack=snapshot.packs.find(p=>p.id===a.pack_id);return <div key={a.student_id} className="ufAgendaPerson"><div><b>{students.find(st=>st.id===a.student_id)?.name||'Aluno'}</b><small>{attendanceLabels[a.status]}{pack?(' · '+(a.deduct?'1 sessão descontada':'Sem desconto')+' · '+pack.title):' · Sem pack'}</small></div>{manager&&<button onClick={()=>setDialog({type:'attendance',row:a})}>{a.status==='booked'?'Registar presença':'Corrigir'}</button>}</div>;})}</article>;}):<p className="ufPaymentEmpty">Sem sessões neste dia.</p>}</div>
    </>}
   </>:<>
    <div className="ufPaymentHeading"><h2>Packs de sessões</h2>{manager&&<button className="primary" onClick={()=>setDialog({type:'pack'})}>+ Novo pack</button>}</div>
    <div className="ufAgendaPacks">{snapshot.packs.length?snapshot.packs.map(p=>{const payment=payments.find(pay=>pay.id===p.payment_id);return <article key={p.id}><h3>{p.title}</h3>{manager&&<p>{students.find(s=>s.id===p.student_id)?.name||'Aluno'}</p>}<strong>{p.total-p.used}<small> de {p.total} sessões disponíveis</small></strong><progress max={p.total} value={p.used} aria-label="Sessões utilizadas"/><p>{p.used} utilizadas{payment&&<> · {payment.status==='paid'?'Pago':payment.status==='cancelled'?'Pagamento anulado':'Pagamento pendente'}</>}</p>{manager&&<button onClick={()=>setDialog({type:'pack',template:p})}>Renovar pack</button>}</article>;}):<p>Ainda não existem packs.{manager?' Cria um pack ou associa um pagamento de pack já registado.':''}</p>}</div>
   </>}
  </>}
  {dialog?.type==='session'&&<SessionForm session={dialog.session} attendance={snapshot.attendance} students={students} packs={packOptions} date={day} onClose={()=>setDialog(null)} onSaved={saved}/>}
  {dialog?.type==='attendance'&&<AttendanceForm row={dialog.row} name={students.find(s=>s.id===dialog.row.student_id)?.name||'Presença'} packs={snapshot.packs} onClose={()=>setDialog(null)} onSaved={saved}/>}
  {dialog?.type==='pack'&&<PackForm students={students} packs={snapshot.packs} payments={payments} template={dialog.template} onClose={()=>setDialog(null)} onSaved={saved}/>}
  {dialog?.type==='copy'&&<CopyWeek week={week} count={snapshot.sessions.length} onClose={()=>setDialog(null)} onSaved={saved}/>}
 </section>;
}
function CopyWeek({week,count,onClose,onSaved}){const [target,setTarget]=useState(addDays(week,7));return <FormDialog title="Copiar planeamento semanal" onClose={onClose} button="Copiar semana" onSave={async()=>{const n=await agendaRpc('pt_copy_week',{p_source:week,p_target:monday(target)});onSaved(n?`${n} sessão(ões) copiada(s), sem presenças nem descontos.`:'Nenhuma sessão nova: a semana está vazia, cancelada ou já foi copiada.');}}><p>Origem: {shortDate(week)} — {shortDate(addDays(week,6))} · {count} sessão(ões).</p><label>Uma data da semana de destino<input type="date" required value={target} onChange={e=>setTarget(e.target.value)}/></label>{target&&<p>Destino: {shortDate(monday(target))} — {shortDate(addDays(monday(target),6))}.</p>}<p>Mantém os dias, horários e participantes. Sessões canceladas são excluídas. Se existir um conflito de horário, a cópia é interrompida sem alterar a agenda.</p></FormDialog>;}
