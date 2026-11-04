import React,{useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {CalendarDays,Users,Wallet,Clock,Plus,Check,X,MessageCircle,Cake,TrendingUp,AlertCircle,ChevronRight} from 'lucide-react';
import {useApp} from '../contexts/AppContext';
import {AttendanceForm,SessionForm} from './AgendaModule';
import {localDateTime,sessionKinds,attendanceLabels} from '../lib/agenda';
import {today,money} from '../lib/payments';
import {loadTeacherDashboard,dashboardSummary,studentHighlights} from '../lib/teacherDashboard';
import '../styles/teacher-dashboard.css';

const empty={enabled:false,sessions:[],attendance:[],packs:[],payments:[]};
function Avatar({student}){return <span className="tdAvatar">{student?.thumbUrl?<img src={student.thumbUrl} alt=""/>:(student?.name||'Aluno').split(' ').map(n=>n[0]).slice(0,2).join('')}</span>;}
function Contact({student}){let phone=(student.phone||'').replace(/\D/g,'');if(phone.length===9)phone='351'+phone;return phone.length>=10?<a className="tdContact" href={'https://wa.me/'+phone} target="_blank" rel="noopener noreferrer" aria-label={'Contactar '+student.name+' por WhatsApp'}><MessageCircle size={19}/></a>:null;}
function Panel({title,sub,action,children}){return <section className="tdPanel"><header><div><h2>{title}</h2>{sub&&<p>{sub}</p>}</div>{action}</header>{children}</section>;}
function Metric({label,value,detail,icon:Icon,onClick}){return <button className="tdMetric" onClick={onClick}><span><Icon size={17}/>{label}</span><strong>{value}</strong><small>{detail}</small></button>;}
export default function TeacherDashboard({onNavigate}){
 const {data,currentUser}=useApp(),navigate=useNavigate();
 const [model,setModel]=useState(empty),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0),[dialog,setDialog]=useState(null),[notice,setNotice]=useState(''),[day,setDay]=useState(today());
 useEffect(()=>{const refresh=()=>{setDay(today());setRevision(n=>n+1);};window.addEventListener('focus',refresh);const timer=setInterval(()=>setDay(today()),60000);return()=>{window.removeEventListener('focus',refresh);clearInterval(timer);};},[]);
 useEffect(()=>{let alive=true;setLoading(true);setError('');loadTeacherDashboard(currentUser.id,day).then(result=>{if(alive)setModel(result);}).catch(err=>{if(alive){setModel(empty);setError(err.message||'Não foi possível carregar o Dashboard.');}}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[currentUser.id,day,revision]);
 const students=data.students.filter(s=>s.trainerIds?.includes(currentUser.id)&&!s.deletedAt);
 const active=students.filter(s=>s.active&&!s.archivedAt&&s.status!=='archived');
 const summary=dashboardSummary(model,day),highlights=studentHighlights(active,data.assessments,model,day);
 const studentById=new Map(students.map(s=>[s.id,s]));
 const next=summary.today.find(s=>new Date(s.starts_at)>new Date());
 const hour=Number(new Intl.DateTimeFormat('en-GB',{hour:'2-digit',hourCycle:'h23',timeZone:'Europe/Lisbon'}).format(new Date()));
 const greeting=hour<12?'Bom dia':hour<19?'Boa tarde':'Boa noite';
 const saved=message=>{setDialog(null);setNotice(message);setRevision(n=>n+1);};
 const open=(page,student)=>page==='students'&&student?navigate('/alunos?aluno='+encodeURIComponent(student.id)):onNavigate(page,student&&page==='assessments'?{studentId:student.id}:{});
 const packs=model.packs.filter(p=>!model.payments.some(pay=>pay.id===p.payment_id&&pay.status==='cancelled'));
 const metric=value=>loading?'…':error?'—':value;
 const unavailable='Disponível na fase de testes';
 return <main className="teacherDashboard">
  <header className="tdGreeting"><div><small>O TEU DIA NA ULTIMATE FIT</small><h1>{greeting}, {(currentUser.name||'Professor').split(' ')[0]}</h1><p>{new Date(day+'T12:00:00Z').toLocaleDateString('pt-PT',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'})}</p></div></header>
  {error&&<div className="tdError" role="alert">{error}<button onClick={()=>setRevision(n=>n+1)}>Tentar novamente</button></div>}
  {notice&&<p className="tdNotice" role="status">{notice}</p>}
  <div className="tdMetrics">
   <Metric icon={CalendarDays} label="Sessões hoje" value={metric(model.enabled?summary.today.length:'—')} detail={model.enabled?(next?'Próxima às '+localDateTime(next.starts_at).slice(11):'Agenda do dia'):unavailable} onClick={()=>open('agenda')}/>
   <Metric icon={Clock} label="Sessões esta semana" value={metric(model.enabled?summary.week:'—')} detail="Marcadas e realizadas" onClick={()=>open('agenda')}/>
   <Metric icon={Wallet} label="Recebido este mês" value={metric(model.enabled?money(summary.received):'—')} detail={model.enabled?money(summary.outstanding)+' por receber este mês':unavailable} onClick={()=>open('payments')}/>
   <Metric icon={Users} label="Alunos ativos" value={active.length} detail="Alunos acompanhados por ti" onClick={()=>open('students')}/>
  </div>
  {loading?<p role="status" className="tdEmpty">A carregar agenda e pagamentos…</p>:!error&&<>
  <Panel title="Hoje" action={model.enabled&&<button onClick={()=>open('agenda')}>Abrir agenda <ChevronRight size={16}/></button>}>
   {!model.enabled?<p className="tdEmpty">A agenda está em testes e ainda não está disponível para esta conta.</p>:!summary.today.length?<div className="tdEmpty">Sem sessões marcadas para hoje.<button onClick={()=>setDialog({type:'session'})}>+ Marcar sessão</button></div>:summary.today.map(session=><article className="tdSession" key={session.id}><div className="tdTime"><strong>{localDateTime(session.starts_at).slice(11)}</strong><small>{sessionKinds[session.kind]}</small></div><div className="tdSessionBody">{(summary.members.get(session.id)||[]).map(row=>{const student=studentById.get(row.student_id);return <div className="tdAttendee" key={row.student_id}><div className="tdPerson"><Avatar student={student}/><b>{student?.name||'Aluno'}</b>{row.status!=='booked'&&<span className={'tdStatus '+row.status}>{attendanceLabels[row.status]}</span>}</div>{new Date(session.starts_at)<=new Date()?<div className="tdAttendance">{row.status==='booked'?<><button onClick={()=>setDialog({type:'attendance',row,initialStatus:'present'})}><Check size={16}/>Presente</button><button onClick={()=>setDialog({type:'attendance',row,initialStatus:'absent'})}><X size={16}/>Faltou</button></>:<button onClick={()=>setDialog({type:'attendance',row})}>Corrigir presença</button>}</div>:row.status==='booked'&&<span className="tdStatus">Marcada</span>}</div>;})}{session.location&&<p className="tdLocation">{session.location}</p>}</div></article>)}
  </Panel>
  <Panel title="Próximos dias" sub="Planeamento dos próximos 7 dias">
   {!summary.upcoming.length?<p className="tdEmpty">{model.enabled?'Sem sessões marcadas nos próximos dias.':'A agenda ainda não está disponível.'}</p>:summary.upcoming.map(s=><button className="tdUpcoming" key={s.id} onClick={()=>open('agenda')}><span><b>{new Date(s.starts_at).toLocaleDateString('pt-PT',{weekday:'short',day:'numeric',timeZone:'Europe/Lisbon'})}</b><small>{localDateTime(s.starts_at).slice(11)}</small></span><span><b>{(summary.members.get(s.id)||[]).filter(a=>a.status!=='cancelled').map(a=>studentById.get(a.student_id)?.name||'Aluno').join(', ')}</b><small>{sessionKinds[s.kind]}</small></span><ChevronRight size={17}/></button>)}
  </Panel>
  <Panel title="Receita" sub="Pagamentos recebidos nos últimos 6 meses" action={model.enabled&&<button onClick={()=>open('payments')}>Ver pagamentos</button>}>
   {model.enabled?<div className="tdChart" role="img" aria-label={summary.months.map(m=>m.label+': '+money(m.value)).join('; ')}>{summary.months.map((m,i)=><div className={'tdBarColumn '+(i===5?'current':'')} key={m.key}><strong>{money(m.value)}</strong><div className="tdBarTrack"><span style={{height:(m.value/Math.max(1,...summary.months.map(x=>x.value))*100)+'%'}}/></div><small>{m.label}</small></div>)}</div>:<p className="tdEmpty">Os pagamentos estão em testes e ainda não estão disponíveis para esta conta.</p>}
  </Panel>
  </>}
  <Panel title="Precisa de ti" sub="Pagamentos, packs e acompanhamento dos teus alunos">
   {highlights.alerts.length?highlights.alerts.map(item=><article className="tdAlert" key={item.id}><span className={'tdSymbol '+item.tone}><AlertCircle size={20}/></span><button className="tdAlertCopy" onClick={()=>open(item.page,item.student)}><b>{item.title}{item.amount!=null?' · '+money(item.amount)+' em atraso':''}</b><small>{item.detail}</small></button><Contact student={item.student}/></article>):<p className="tdEmpty">{loading?'A verificar assuntos pendentes…':error?'Os alertas de agenda e pagamentos não puderam ser atualizados.':'Tudo em dia. Sem assuntos pendentes neste momento.'}</p>}
  </Panel>
  <Panel title="Momentos para celebrar" sub="Aniversários próximos e evolução nas avaliações">
   {highlights.celebrations.length?highlights.celebrations.map(item=><article className="tdAlert" key={item.id}><span className={'tdSymbol '+item.tone}>{item.id.startsWith('birthday')?<Cake size={20}/>:<TrendingUp size={20}/>}</span><button className="tdAlertCopy" onClick={()=>open(item.page,item.student)}><b>{item.title}</b><small>{item.detail}</small></button><Contact student={item.student}/></article>):<p className="tdEmpty">Sem aniversários nos próximos 14 dias ou novas evoluções para apresentar.</p>}
  </Panel>
  {model.enabled&&!loading&&!error&&<button className="tdAdd" aria-label="Marcar nova sessão" onClick={()=>setDialog({type:'session'})}><Plus size={29}/></button>}
  {dialog?.type==='attendance'&&<AttendanceForm row={dialog.row} initialStatus={dialog.initialStatus} name={studentById.get(dialog.row.student_id)?.name||'Presença'} packs={packs} onClose={()=>setDialog(null)} onSaved={saved}/>}
  {dialog?.type==='session'&&<SessionForm attendance={model.attendance} students={active} packs={packs} date={day} onClose={()=>setDialog(null)} onSaved={saved}/>}
 </main>;
}

