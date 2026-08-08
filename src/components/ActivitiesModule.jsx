import React,{useEffect,useMemo,useState} from 'react';
import {CalendarDays,CheckCircle2,Clipboard,Euro,MapPin,Plus,QrCode,Users,X,Edit3,Power,WalletCards,Trash2} from 'lucide-react';
import QRCode from 'qrcode';
import {useApp} from '../contexts/AppContext';
import CommunityImageField from './CommunityImageField';
import {optimiseCommunityPoster} from '../lib/image';
import {cancelActivity,deleteActivity,registerActivity,removeCommunityImage,saveActivity,setActivityPayment,toggleActivity,uploadCommunityImage} from '../lib/community';

function Modal({title,onClose,children,wide=false}){return <div className="overlay"><div className={`modal ${wide?'modalWide':''}`}><div className="title"><h2>{title}</h2><button className="iconButton" onClick={onClose}><X/></button></div>{children}</div></div>}
const euro=cents=>new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format((cents||0)/100);
const dateLabel=value=>value?new Intl.DateTimeFormat('pt-PT',{dateStyle:'long'}).format(new Date(`${value}T12:00:00`)):'—';
function localParts(value){if(!value)return {date:'',time:''};const d=new Date(value);if(Number.isNaN(d.getTime()))return {date:'',time:''};const pad=n=>String(n).padStart(2,'0');return {date:`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,time:`${pad(d.getHours())}:${pad(d.getMinutes())}`};}
function dateTimeIso(date,time,defaultTime='23:59'){if(!date)return null;const d=new Date(`${date}T${time||defaultTime}:00`);return Number.isNaN(d.getTime())?null:d.toISOString();}

function ActivityForm({activity,onClose,onSaved}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [image,setImage]=useState({file:null,zoom:1,positionX:.5,positionY:.5,removeExisting:false});
 const deadline=localParts(activity?.registrationDeadline);
 async function submit(e){
  e.preventDefault();setBusy(true);setError('');const f=new FormData(e.currentTarget);let uploaded=null;
  try{
   let posterUrl=activity?.posterUrl||'',posterPath=activity?.posterPath||'';
   if(image.file){
    const blob=await optimiseCommunityPoster(image.file,image);
    uploaded=await uploadCommunityImage('activities',blob);
    posterUrl=uploaded.url;posterPath=uploaded.path;
   }else if(image.removeExisting){posterUrl='';posterPath='';}
   const saved=await saveActivity({id:activity?.id,title:f.get('title'),description:f.get('description'),eventDate:f.get('eventDate'),startTime:f.get('startTime'),location:f.get('location'),feeEuros:f.get('feeEuros'),capacity:f.get('capacity'),posterUrl,posterPath,registrationDeadline:dateTimeIso(f.get('registrationDeadlineDate'),f.get('registrationDeadlineTime')),registrationOpen:f.get('registrationOpen')==='on',active:true});
   if(activity?.posterPath&&activity.posterPath!==saved.posterPath) await removeCommunityImage(activity.posterPath).catch(()=>{});
   await onSaved();onClose();
  }catch(err){if(uploaded?.path)await removeCommunityImage(uploaded.path).catch(()=>{});setError(err.message||'Não foi possível guardar a atividade.')}finally{setBusy(false)}
 }
 return <Modal title={activity?'Editar atividade':'Nova atividade'} onClose={onClose} wide><form onSubmit={submit} className="formGrid activityForm">
  <label className="wide">Nome *<input name="title" defaultValue={activity?.title||''} required placeholder="Ex.: Jantar de Natal ULTIMATE FIT"/></label>
  <label>Data *<input name="eventDate" type="date" defaultValue={activity?.eventDate||''} required/></label><label>Hora<input name="startTime" type="time" defaultValue={activity?.startTime?.slice?.(0,5)||''}/></label>
  <label className="wide">Local<input name="location" defaultValue={activity?.location||''} placeholder="Ex.: Restaurante / partida no estúdio"/></label>
  <label>Preço (€)<input name="feeEuros" type="number" min="0" step="0.01" defaultValue={activity?activity.feeCents/100:0}/></label><label>Lotação<input name="capacity" type="number" min="1" defaultValue={activity?.capacity||''} placeholder="Sem limite"/></label>
  <div className="wide dateTimePair"><label>Prazo de inscrição · data<input name="registrationDeadlineDate" type="date" defaultValue={deadline.date}/></label><label>Hora<input name="registrationDeadlineTime" type="time" defaultValue={deadline.time||'23:59'}/></label></div>
  <CommunityImageField label="Imagem/cartaz da atividade" existingUrl={activity?.posterUrl||''} value={image} onChange={setImage}/>
  <label className="wide">Descrição<textarea name="description" rows="5" defaultValue={activity?.description||''} placeholder="Informações, percurso, o que levar, condições…"/></label>
  <label className="checkLine wide"><input name="registrationOpen" type="checkbox" defaultChecked={activity?.registrationOpen!==false}/> Inscrições abertas</label>
  {error&&<div className="errorBanner wide">{error}</div>}<div className="modalActions wide"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={busy}>{busy?'A otimizar e guardar…':'Guardar atividade'}</button></div>
 </form></Modal>
}

function QrModal({activity,onClose}){
 const [src,setSrc]=useState('');
 const link=`${window.location.origin}/atividades/${activity.slug}`;
 useEffect(()=>{QRCode.toDataURL(link,{width:420,margin:2,errorCorrectionLevel:'M',color:{dark:'#050505',light:'#ffffff'}}).then(setSrc)},[link]);
 return <Modal title="QR CODE DA ATIVIDADE" onClose={onClose}><div className="activityQr"><p>Coloca este QR Code nas TVs do estúdio. O aluno abre diretamente a atividade e pode inscrever-se.</p>{src&&<img src={src} alt={`QR Code ${activity.title}`}/>}<b>{activity.title}</b><small>{link}</small><button className="primary" onClick={()=>navigator.clipboard?.writeText(link)}><Clipboard size={16}/>Copiar link</button><a className="secondary" href={src} download={`QR-${activity.slug}.png`}>Guardar QR Code</a></div></Modal>
}

function RegistrationsModal({activity,registrations,students,onClose,onRefresh}){
 const rows=registrations.filter(r=>r.activityId===activity.id&&r.status==='registered');
 return <Modal title={`Inscritos · ${activity.title}`} onClose={onClose} wide><div className="activityRegistrations"><div className="activityRegSummary"><b>{rows.length}{activity.capacity?`/${activity.capacity}`:''} inscrito(s)</b><span>{activity.feeCents?`${rows.filter(r=>r.paymentStatus==='paid').length} pago(s)`:'Atividade gratuita'}</span></div>{rows.length?rows.map(r=>{const s=students.find(x=>x.id===r.studentId);return <div className="activityRegRow" key={r.id}><div className="grow"><b>{s?.name||'Aluno'}</b><small>{s?.phone||s?.email||''}</small></div>{activity.feeCents>0?<button className={r.paymentStatus==='paid'?'paidPill':'pendingPill'} onClick={async()=>{await setActivityPayment(r,activity,r.paymentStatus!=='paid');await onRefresh()}}><WalletCards size={15}/>{r.paymentStatus==='paid'?'Pago':'Marcar pago'}</button>:<span className="freePill">Gratuito</span>}</div>}):<div className="emptyState">Ainda não existem inscrições.</div>}</div></Modal>
}

export default function ActivitiesModule({context={}}){
 const {data,currentUser,refreshCommunity}=useApp();
 const isStudent=currentUser.role==='aluno',isAdmin=currentUser.role==='admin';
 const ownStudent=data.students.find(s=>s.userId===currentUser.id);
 const [editing,setEditing]=useState(null),[showForm,setShowForm]=useState(false),[qr,setQr]=useState(null),[regs,setRegs]=useState(null),[message,setMessage]=useState(''),[error,setError]=useState('');
 const activities=useMemo(()=>[...data.activities].sort((a,b)=>a.eventDate.localeCompare(b.eventDate)),[data.activities]);
 const highlighted=context.slug?activities.find(a=>a.slug===context.slug):null;
 useEffect(()=>{if(highlighted) setTimeout(()=>document.getElementById(`activity-${highlighted.id}`)?.scrollIntoView({behavior:'smooth',block:'center'}),100)},[highlighted?.id]);
 async function act(fn,ok){setMessage('');setError('');try{await fn();setMessage(ok);await refreshCommunity()}catch(e){setError(e.message)}}
 return <div className="activitiesPage"><div className="heading"><div><h1>Atividades</h1><p>Caminhadas, provas, convívios e eventos ULTIMATE FIT. Inscreve-te diretamente pela app.</p></div>{isAdmin&&<button className="primary" onClick={()=>{setEditing(null);setShowForm(true)}}><Plus size={17}/>Nova atividade</button>}</div>{message&&<div className="successBanner"><CheckCircle2 size={18}/>{message}</div>}{error&&<div className="errorBanner">{error}</div>}<div className="activitiesGrid">{activities.filter(a=>a.active||isAdmin).map(a=>{const registrations=data.activityRegistrations.filter(r=>r.activityId===a.id&&r.status==='registered');const own=registrations.find(r=>r.studentId===ownStudent?.id);const full=a.capacity&&registrations.length>=a.capacity;return <article id={`activity-${a.id}`} className={`card activityCard ${highlighted?.id===a.id?'highlighted':''}`} key={a.id}>{a.posterUrl?<img className="activityPoster" src={a.posterUrl} alt={a.title}/>:<div className="activityPosterPlaceholder"><CalendarDays/><span>ULTIMATE FIT</span></div>}<div className="activityCardBody"><div className="activityDate"><CalendarDays size={17}/><b>{dateLabel(a.eventDate)}{a.startTime?` · ${a.startTime.slice(0,5)}`:''}</b></div><h2>{a.title}</h2>{a.location&&<p className="activityMeta"><MapPin size={16}/>{a.location}</p>}<p>{a.description||'Mais informações em breve.'}</p><div className="activityFacts"><span><Euro size={15}/>{a.feeCents?euro(a.feeCents):'Gratuita'}</span><span><Users size={15}/>{registrations.length}{a.capacity?`/${a.capacity}`:''} inscrito(s)</span></div>{isStudent&&<div className="activityStudentAction">{own?<><button className="secondary" onClick={()=>act(()=>cancelActivity(a.id),'Inscrição cancelada.')}>Cancelar inscrição</button>{a.feeCents>0&&<span className={own.paymentStatus==='paid'?'paidPill':'pendingPill'}>{own.paymentStatus==='paid'?'Pagamento registado':'Pagamento pendente'}</span>}</>:<button className="primary" disabled={!a.registrationOpen||full} onClick={()=>act(()=>registerActivity(a.id),'Inscrição registada!')}>{full?'Lotação esgotada':a.registrationOpen?'Inscrever-me':'Inscrições encerradas'}</button>}</div>}{isAdmin&&<div className="activityAdminActions"><button className="secondary" onClick={()=>{setEditing(a);setShowForm(true)}}><Edit3 size={15}/>Editar</button><button className="secondary" onClick={()=>setRegs(a)}><Users size={15}/>Inscritos</button><button className="secondary" onClick={()=>setQr(a)}><QrCode size={15}/>QR Code</button><button className="secondary" onClick={()=>act(()=>toggleActivity(a.id,!a.active),a.active?'Atividade arquivada.':'Atividade reativada.')}><Power size={15}/>{a.active?'Arquivar':'Reativar'}</button><button className="iconDanger" title="Eliminar atividade" onClick={()=>window.confirm('Eliminar definitivamente esta atividade, as inscrições e o cartaz associado?')&&act(()=>deleteActivity(a),'Atividade e imagem eliminadas.')}><Trash2 size={16}/></button></div>}</div></article>})}</div>{showForm&&<ActivityForm activity={editing} onClose={()=>setShowForm(false)} onSaved={refreshCommunity}/>} {qr&&<QrModal activity={qr} onClose={()=>setQr(null)}/>} {regs&&<RegistrationsModal activity={regs} registrations={data.activityRegistrations} students={data.students} onClose={()=>setRegs(null)} onRefresh={refreshCommunity}/>}</div>
}
