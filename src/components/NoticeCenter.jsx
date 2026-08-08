import React,{useState} from 'react';
import {Bell,CheckCircle2,Edit3,Plus,Power,Trash2,X} from 'lucide-react';
import {useApp} from '../contexts/AppContext';
import CommunityImageField from './CommunityImageField';
import {optimiseCommunityPoster} from '../lib/image';
import {deleteNotice,removeCommunityImage,saveNotice,toggleNotice,uploadCommunityImage} from '../lib/community';

function Modal({title,onClose,children}){return <div className="overlay"><div className="modal"><div className="title"><h2>{title}</h2><button className="iconButton" onClick={onClose}><X/></button></div>{children}</div></div>}
function localParts(value){if(!value)return {date:'',time:''};const d=new Date(value);if(Number.isNaN(d.getTime()))return {date:'',time:''};const pad=n=>String(n).padStart(2,'0');return {date:`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,time:`${pad(d.getHours())}:${pad(d.getMinutes())}`};}
function dateTimeIso(date,time,defaultTime='00:00'){if(!date)return null;const d=new Date(`${date}T${time||defaultTime}:00`);return Number.isNaN(d.getTime())?null:d.toISOString();}

export function StudentNoticePopup(){
 const {data,currentUser}=useApp(); const [dismissed,setDismissed]=useState([]);
 const notices=data.notices.filter(n=>n.active&&n.showPopup&&(n.targetAudience==='students'||n.targetAudience==='all'));
 const notice=currentUser.role==='aluno'?notices.find(n=>!dismissed.includes(n.id)):null;
 if(!notice)return null;
 function close(){setDismissed(current=>[...current,notice.id])}
 if(notice.imageUrl)return <div className="noticePopupOverlay noticePopupOverlayImage"><div className="noticeImagePopup"><img src={notice.imageUrl} alt={notice.title}/><button className="noticeImagePopupClose" onClick={close} aria-label="Fechar aviso"><X/></button></div></div>;
 return <div className="noticePopupOverlay"><div className="noticePopup"><button className="noticePopupClose" onClick={close}><X/></button><div className="noticePopupIcon"><Bell/></div><span className="eyebrow">AVISO ULTIMATE FIT</span><h2>{notice.title}</h2><p>{notice.body}</p><button className="primary" onClick={close}>Fechar</button></div></div>
}

export function StudentNoticeBoard(){
 const {data}=useApp();const notices=data.notices.filter(n=>n.active&&n.showDashboard&&(n.targetAudience==='students'||n.targetAudience==='all'));if(!notices.length)return null;
 return <section className="card pad studentNoticeBoard"><div className="panelTitle"><div><span className="eyebrow">AVISOS</span><h2>ULTIMATE FIT</h2></div><Bell/></div>{notices.map(n=><article key={n.id} className={n.imageUrl?'studentNoticeWithImage':''}>{n.imageUrl&&<img src={n.imageUrl} alt={n.title}/>}<div><b>{n.title}</b><p>{n.body}</p></div></article>)}</section>
}

function NoticeForm({notice,onClose,onSaved}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [image,setImage]=useState({file:null,zoom:1,positionX:.5,positionY:.5,removeExisting:false});
 const start=localParts(notice?.activeFrom),end=localParts(notice?.activeUntil);
 async function submit(e){
  e.preventDefault();const f=new FormData(e.currentTarget);setBusy(true);setError('');let uploaded=null;
  try{
   let imageUrl=notice?.imageUrl||'',imagePath=notice?.imagePath||'';
   if(image.file){const blob=await optimiseCommunityPoster(image.file,image);uploaded=await uploadCommunityImage('notices',blob);imageUrl=uploaded.url;imagePath=uploaded.path;}
   else if(image.removeExisting){imageUrl='';imagePath='';}
   const saved=await saveNotice({id:notice?.id,title:f.get('title'),body:f.get('body'),targetAudience:f.get('targetAudience'),showPopup:f.get('showPopup')==='on',showDashboard:f.get('showDashboard')==='on',activeFrom:dateTimeIso(f.get('activeFromDate'),f.get('activeFromTime'))||new Date().toISOString(),activeUntil:dateTimeIso(f.get('activeUntilDate'),f.get('activeUntilTime'),'23:59'),imageUrl,imagePath,active:true});
   if(notice?.imagePath&&notice.imagePath!==saved.imagePath)await removeCommunityImage(notice.imagePath).catch(()=>{});
   await onSaved();onClose();
  }catch(err){if(uploaded?.path)await removeCommunityImage(uploaded.path).catch(()=>{});setError(err.message||'Não foi possível guardar o aviso.')}finally{setBusy(false)}
 }
 return <Modal title={notice?'Editar aviso':'Novo aviso'} onClose={onClose}><form onSubmit={submit} className="formGrid noticeForm">
  <label className="wide">Título *<input name="title" defaultValue={notice?.title||''} required placeholder="Ex.: Jantar de Natal ULTIMATE FIT"/></label>
  <label className="wide">Mensagem *<textarea name="body" rows="6" defaultValue={notice?.body||''} required placeholder="Esta mensagem permanece no dashboard. Se adicionares uma imagem, o pop-up mostrará apenas o cartaz."/></label>
  <label>Destinatários<select name="targetAudience" defaultValue={notice?.targetAudience||'students'}><option value="students">Alunos</option><option value="team">Equipa</option><option value="all">Todos</option></select></label><div/>
  <div className="wide dateTimePair"><label>Início · data<input name="activeFromDate" type="date" defaultValue={start.date}/></label><label>Hora<input name="activeFromTime" type="time" defaultValue={start.time}/></label></div>
  <div className="wide dateTimePair"><label>Fim (opcional) · data<input name="activeUntilDate" type="date" defaultValue={end.date}/></label><label>Hora<input name="activeUntilTime" type="time" defaultValue={end.time||'23:59'}/></label></div>
  <CommunityImageField label="Imagem/cartaz do aviso (opcional)" existingUrl={notice?.imageUrl||''} value={image} onChange={setImage}/>
  <div className="wide noticeImageRule"><b>Com imagem:</b> o pop-up mostra apenas o cartaz e o botão X. O título e a mensagem continuam disponíveis no dashboard.</div>
  <label className="checkLine"><input name="showPopup" type="checkbox" defaultChecked={notice?.showPopup!==false}/> Mostrar como pop-up ao entrar</label><label className="checkLine"><input name="showDashboard" type="checkbox" defaultChecked={notice?.showDashboard!==false}/> Manter no dashboard</label>
  {error&&<div className="errorBanner wide">{error}</div>}<div className="modalActions wide"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={busy}>{busy?'A otimizar e guardar…':'Guardar aviso'}</button></div>
 </form></Modal>
}

export function NoticeManager(){
 const {data,refreshCommunity}=useApp();const [form,setForm]=useState(null),[open,setOpen]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 async function run(fn,msg){setError('');try{await fn();setMessage(msg);await refreshCommunity()}catch(e){setError(e.message||'Não foi possível concluir a ação.')}}
 return <div className="noticeManager"><div className="backofficeSectionHeader"><div><h2>Avisos e pop-ups</h2><p>Cria comunicações que podem aparecer ao aluno quando entra na app e permanecer no dashboard.</p></div><button className="primary" onClick={()=>{setForm(null);setOpen(true)}}><Plus size={16}/>Novo aviso</button></div>{message&&<div className="successBanner"><CheckCircle2 size={17}/>{message}</div>}{error&&<div className="errorBanner">{error}</div>}<div className="noticeAdminList">{data.notices.map(n=><article className="card pad" key={n.id}>{n.imageUrl&&<img className="noticeAdminThumb" src={n.imageUrl} alt=""/>}<div className="grow"><div className="titleLine"><b>{n.title}</b><span className={n.active?'badge green':'badge gray'}>{n.active?'Ativo':'Inativo'}</span></div><p>{n.body}</p><small>{n.showPopup?'Pop-up · ':''}{n.showDashboard?'Dashboard · ':''}{n.targetAudience==='students'?'Alunos':n.targetAudience==='team'?'Equipa':'Todos'}</small></div><div className="noticeAdminActions"><button className="secondary" onClick={()=>{setForm(n);setOpen(true)}}><Edit3 size={15}/>Editar</button><button className="secondary" onClick={()=>run(()=>toggleNotice(n.id,!n.active),n.active?'Aviso desativado.':'Aviso ativado.')}><Power size={15}/>{n.active?'Desativar':'Ativar'}</button><button className="iconDanger" onClick={()=>window.confirm('Eliminar este aviso e a imagem associada?')&&run(()=>deleteNotice(n),'Aviso e imagem eliminados.')}><Trash2 size={16}/></button></div></article>)}</div>{open&&<NoticeForm notice={form} onClose={()=>setOpen(false)} onSaved={refreshCommunity}/>}</div>
}
