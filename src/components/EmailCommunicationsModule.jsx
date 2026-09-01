import React,{useEffect,useMemo,useRef,useState} from 'react';
import {AlertTriangle,Bold,CheckCircle2,ChevronRight,Eye,Image as ImageIcon,Italic,Link as LinkIcon,List,ListOrdered,Mail,Monitor,MousePointerClick,Plus,Search,Send,Smartphone,Trash2,Underline,Upload,Users,X} from 'lucide-react';
import {useApp} from '../contexts/AppContext';
import {
  extractEmails,fetchEmailCampaignDetails,fetchEmailCampaigns,fetchImportedEmailContacts,
  importEmailContacts,invokeEmailCampaign,isValidEmail,normalizeEmail,saveEmailCampaign,setEmailMarketingEnabled,
} from '../lib/emailCommunications';

const SENDER_NAME='Ultimate Fit';
const SENDER_EMAIL='geral@ultimatefit.pt';
const REPLY_TO='geral@ultimatefit.pt';

function Modal({title,onClose,children,className=''}){return <div className="emailCommsOverlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose?.()}}><div className={`emailCommsModal ${className}`} role="dialog" aria-modal="true" aria-label={title}><div className="emailCommsModalHead"><h2>{title}</h2><button type="button" className="iconButton" onClick={onClose} aria-label="Fechar"><X/></button></div>{children}</div></div>}
function Notice({type='success',children}){return <div className={type==='error'?'errorBanner':'successBanner'}>{type==='error'?<AlertTriangle size={17}/>:<CheckCircle2 size={17}/>}<span>{children}</span></div>}

function RichEditor({value,onChange}){
 const ref=useRef(null);
 useEffect(()=>{if(ref.current&&ref.current.innerHTML!==value)ref.current.innerHTML=value||''},[value]);
 const command=(name,arg=null)=>{ref.current?.focus();document.execCommand(name,false,arg);onChange(ref.current?.innerHTML||'')};
 const addLink=()=>{const url=window.prompt('Endereço do link (https://...)');if(url)command('createLink',url)};
 const addImage=()=>{const url=window.prompt('URL pública da imagem (https://...)');if(url&&/^https:\/\//i.test(url))command('insertImage',url)};
 const addButton=()=>{const text=window.prompt('Texto do botão','Saber mais');if(!text)return;const url=window.prompt('Link do botão (https://...)');if(!url||!/^https:\/\//i.test(url))return;ref.current?.focus();document.execCommand('insertHTML',false,`<p style="text-align:center;margin:24px 0"><a href="${url.replace(/"/g,'')}" style="display:inline-block;background:#ffd908;color:#090909;text-decoration:none;font-weight:800;padding:13px 22px;border-radius:10px">${text.replace(/[<>]/g,'')}</a></p>`);onChange(ref.current?.innerHTML||'')};
 return <div className="emailRichEditor"><div className="emailRichToolbar">
  <button type="button" onClick={()=>command('bold')} title="Negrito"><Bold size={17}/></button><button type="button" onClick={()=>command('italic')} title="Itálico"><Italic size={17}/></button><button type="button" onClick={()=>command('underline')} title="Sublinhado"><Underline size={17}/></button>
  <button type="button" onClick={()=>command('formatBlock','h2')} title="Título">H2</button><button type="button" onClick={()=>command('formatBlock','p')} title="Parágrafo">P</button>
  <button type="button" onClick={()=>command('insertUnorderedList')} title="Lista"><List size={17}/></button><button type="button" onClick={()=>command('insertOrderedList')} title="Lista numerada"><ListOrdered size={17}/></button>
  <button type="button" onClick={()=>command('justifyLeft')} title="Alinhar à esquerda">≡</button><button type="button" onClick={()=>command('justifyCenter')} title="Centrar">≣</button>
  <button type="button" onClick={addLink} title="Adicionar link"><LinkIcon size={17}/></button><button type="button" onClick={addImage} title="Adicionar imagem"><ImageIcon size={17}/></button><button type="button" onClick={addButton} title="Adicionar botão"><MousePointerClick size={17}/></button>
 </div><div ref={ref} className="emailRichSurface" contentEditable suppressContentEditableWarning onInput={()=>onChange(ref.current?.innerHTML||'')} data-placeholder="Escreve aqui a mensagem que os teus clientes vão receber..."/></div>
}

function EmailPreview({subject,preheader,html,mobile}){return <div className={mobile?'emailPreviewFrame mobile':'emailPreviewFrame'}><div className="emailPreviewInbox"><div className="emailPreviewMeta"><b>{SENDER_NAME}</b><span>&lt;{SENDER_EMAIL}&gt;</span></div><h3>{subject||'Assunto do email'}</h3>{preheader&&<p className="emailPreviewPreheader">{preheader}</p>}<div className="emailPreviewMessage"><img src="/brand/ultimatefit-logo.webp" alt="ULTIMATE FIT"/><div className="emailPreviewBody" dangerouslySetInnerHTML={{__html:html||'<p>O conteúdo do email aparecerá aqui.</p>'}}/><footer><b>ULTIMATE FIT</b><br/>{SENDER_EMAIL}<br/><u>Cancelar subscrição</u></footer></div></div></div>}

export default function EmailCommunicationsModule(){
 const {data,currentUser}=useApp();
 const [tab,setTab]=useState('compose');
 const [campaigns,setCampaigns]=useState([]),[contacts,setContacts]=useState([]),[loading,setLoading]=useState(true);
 const [message,setMessage]=useState(''),[error,setError]=useState('');
 const [subject,setSubject]=useState(''),[preheader,setPreheader]=useState(''),[html,setHtml]=useState('');
 const [audienceType,setAudienceType]=useState('active_students'),[selectedStudents,setSelectedStudents]=useState([]),[campaignId,setCampaignId]=useState(null);
 const [studentPicker,setStudentPicker]=useState(false),[studentSearch,setStudentSearch]=useState('');
 const [preview,setPreview]=useState(false),[previewMobile,setPreviewMobile]=useState(false);
 const [testModal,setTestModal]=useState(false),[testEmail,setTestEmail]=useState(currentUser.email||'');
 const [confirmSend,setConfirmSend]=useState(false),[sending,setSending]=useState(false);
 const [importModal,setImportModal]=useState(false),[importPreview,setImportPreview]=useState(null),[importing,setImporting]=useState(false);
 const [details,setDetails]=useState(null),[detailsLoading,setDetailsLoading]=useState(false);

 const reload=async()=>{setLoading(true);try{const [campaignRows,contactRows]=await Promise.all([fetchEmailCampaigns(),fetchImportedEmailContacts()]);setCampaigns(campaignRows);setContacts(contactRows)}catch(err){setError(err.message||'Não foi possível carregar as comunicações.')}finally{setLoading(false)}};
 useEffect(()=>{reload()},[]);

 const validStudents=useMemo(()=>data.students.filter(s=>isValidEmail(s.email)),[data.students]);
 const activeStudents=useMemo(()=>validStudents.filter(s=>s.active),[validStudents]);
 const selectedStudentRows=useMemo(()=>validStudents.filter(s=>selectedStudents.includes(s.id)),[validStudents,selectedStudents]);
 const enabledContacts=useMemo(()=>contacts.filter(c=>c.preference?.enabled!==false&&isValidEmail(c.email)),[contacts]);
 const recipientCount=audienceType==='all_students'?new Set(validStudents.map(s=>normalizeEmail(s.email))).size:audienceType==='active_students'?new Set(activeStudents.map(s=>normalizeEmail(s.email))).size:audienceType==='selected_students'?new Set(selectedStudentRows.map(s=>normalizeEmail(s.email))).size:new Set(enabledContacts.map(c=>normalizeEmail(c.email))).size;

 const audienceIds=audienceType==='selected_students'?selectedStudents:audienceType==='imported_contacts'?[]:[];
 const campaignPayload=()=>({subject,preheader,htmlContent:html,textContent:'',senderName:SENDER_NAME,senderEmail:SENDER_EMAIL,replyTo:REPLY_TO,audienceType,audienceIds});
 const clearNotices=()=>{setMessage('');setError('')};

 async function ensureDraft(){const saved=await saveEmailCampaign(campaignPayload(),campaignId);setCampaignId(saved.id);return saved;}
 async function sendTest(){clearNotices();setSending(true);try{const saved=await ensureDraft();const result=await invokeEmailCampaign({campaignId:saved.id,action:'test',testEmail});setMessage(result.message||'Email de teste enviado.');setTestModal(false)}catch(err){setError(err.message)}finally{setSending(false)}}
 async function sendCampaign(){clearNotices();setSending(true);try{const saved=await ensureDraft();const result=await invokeEmailCampaign({campaignId:saved.id,action:'send'});setMessage(result.message||'Campanha processada.');setConfirmSend(false);await reload()}catch(err){setError(err.message)}finally{setSending(false)}}

 async function openDetails(id){setDetailsLoading(true);try{setDetails(await fetchEmailCampaignDetails(id))}catch(err){setError(err.message)}finally{setDetailsLoading(false)}}

 async function readImportFile(file){if(!file)return;clearNotices();const raw=await file.text();const tokens=raw.split(/[\s,;]+/).map(v=>v.trim()).filter(Boolean);const found=extractEmails(raw);const valid=found.filter(isValidEmail);const unique=[...new Set(valid.map(normalizeEmail))];const duplicates=Math.max(0,valid.length-unique.length);const invalid=tokens.filter(token=>token.includes('@')&&!isValidEmail(token)).length;const existingSet=new Set(contacts.map(c=>normalizeEmail(c.email)));const existing=unique.filter(email=>existingSet.has(email)).length;const importable=unique.filter(email=>!existingSet.has(email));setImportPreview({fileName:file.name,found:found.length,valid:unique.length,duplicates,invalid,existing,emails:importable,totalUnique:unique.length})}
 async function performImport(){if(!importPreview?.emails?.length){setImportModal(false);return}setImporting(true);clearNotices();try{const result=await importEmailContacts(importPreview.emails);setMessage(`${result.imported} contacto(s) importado(s).`);setImportModal(false);setImportPreview(null);await reload()}catch(err){setError(err.message)}finally{setImporting(false)}}

 const filteredStudents=validStudents.filter(student=>{const q=studentSearch.toLowerCase();return !q||student.name.toLowerCase().includes(q)||student.email.toLowerCase().includes(q)||(student.primaryTrainer?.name||'').toLowerCase().includes(q)});
 if(!['owner','admin'].includes(currentUser.systemRole)) return <Notice type="error">Não tens permissão para aceder a esta área.</Notice>;

 return <div className="emailCommsModule">
  <div className="emailCommsSubtabs"><button className={tab==='compose'?'active':''} onClick={()=>setTab('compose')}><Plus size={16}/>Nova campanha</button><button className={tab==='history'?'active':''} onClick={()=>setTab('history')}><Mail size={16}/>Histórico</button><button className={tab==='contacts'?'active':''} onClick={()=>setTab('contacts')}><Users size={16}/>Contactos</button></div>
  {message&&<Notice>{message}</Notice>}{error&&<Notice type="error">{error}</Notice>}

  {tab==='compose'&&<div className="emailComposeGrid">
   <section className="card pad emailCommsCard"><div className="emailSectionTitle"><span>DESTINATÁRIOS</span><strong>{recipientCount} destinatário(s)</strong></div>
    <div className="emailAudienceOptions">
     {[['all_students','Todos os alunos'],['active_students','Todos os alunos ativos'],['selected_students','Selecionar alunos manualmente'],['imported_contacts','Contactos importados']].map(([value,label])=><label className={audienceType===value?'selected':''} key={value}><input type="radio" name="audience" checked={audienceType===value} onChange={()=>setAudienceType(value)}/><div><b>{label}</b><small>{value==='selected_students'?`${selectedStudents.length} selecionado(s)`:value==='imported_contacts'?`${enabledContacts.length} contacto(s) disponível(eis)`:''}</small></div></label>)}
    </div>{audienceType==='selected_students'&&<button type="button" className="secondary" onClick={()=>setStudentPicker(true)}><Users size={16}/>Escolher alunos</button>}
   </section>

   <section className="card pad emailCommsCard"><div className="emailSectionTitle"><span>REMETENTE</span></div><div className="emailSenderGrid"><div><small>Remetente</small><b>{SENDER_NAME} &lt;{SENDER_EMAIL}&gt;</b></div><div><small>Responder para</small><b>{REPLY_TO}</b></div></div></section>

   <section className="card pad emailCommsCard emailComposerCard"><label>Assunto *<input value={subject} onChange={e=>setSubject(e.target.value)} maxLength="180" placeholder="Ex.: Nova modalidade no Ultimate Fit"/></label><label>Pré-cabeçalho <input value={preheader} onChange={e=>setPreheader(e.target.value)} maxLength="300" placeholder="Ex.: Vem experimentar gratuitamente a nossa nova aula."/></label><label>Conteúdo *</label><RichEditor value={html} onChange={setHtml}/><div className="emailPersonalisationHint"><b>Personalização disponível:</b> <code>{'{{nome}}'}</code> e <code>{'{{primeiro_nome}}'}</code></div></section>

   <section className="emailCampaignActions"><button type="button" className="secondary" disabled={sending} onClick={()=>setTestModal(true)}>Enviar email de teste</button><button type="button" className="secondary" onClick={()=>setPreview(true)}><Eye size={16}/>Pré-visualizar</button><button type="button" className="primary" disabled={sending||recipientCount===0||!subject.trim()||!html.trim()} onClick={()=>setConfirmSend(true)}><Send size={16}/>{sending?'A enviar…':`Enviar para ${recipientCount} destinatário(s)`}</button></section>
  </div>}

  {tab==='history'&&<section className="card pad emailCommsCard"><div className="emailListHead"><div><span>HISTÓRICO</span><h2>Campanhas</h2></div></div>{loading?<div className="loadingCard"><div className="loader"/>A carregar…</div>:campaigns.length?<div className="emailCampaignTable"><div className="emailCampaignRow header"><span>Campanha</span><span>Data</span><span>Destinatários</span><span>Entregues</span><span>Abertos</span><span>Cliques</span><span>Estado</span></div>{campaigns.map(c=><button type="button" className="emailCampaignRow" key={c.id} onClick={()=>openDetails(c.id)}><span><b>{c.subject}</b></span><span>{new Date(c.sent_at||c.created_at).toLocaleDateString('pt-PT')}</span><span>{c.recipients_count||0}</span><span>{c.delivered_count??'—'}</span><span>{c.opened_count??'—'}</span><span>{c.clicked_count??'—'}</span><span><em className={`emailStatus ${c.status}`}>{c.status==='sent'?'Enviado':c.status==='sending'?'A enviar':c.status==='failed'?'Com falhas':'Rascunho'}</em><ChevronRight size={16}/></span></button>)}</div>:<div className="emailEmpty">Ainda não existem campanhas.</div>}</section>}

  {tab==='contacts'&&<section className="card pad emailCommsCard"><div className="emailListHead"><div><span>CONTACTOS</span><h2>Lista importada</h2><p>Contactos externos permanecem separados dos alunos.</p></div><button type="button" className="primary" onClick={()=>setImportModal(true)}><Upload size={16}/>Importar contactos</button></div>{loading?<div className="loadingCard"><div className="loader"/>A carregar…</div>:contacts.length?<div className="emailContactsList">{contacts.map(contact=><div className="emailContactRow" key={contact.id}><div><b>{contact.name||contact.email}</b>{contact.name&&<small>{contact.email}</small>}</div><label className="emailConsentToggle"><input type="checkbox" checked={contact.preference?.enabled!==false} onChange={async e=>{try{await setEmailMarketingEnabled(contact.email,e.target.checked);await reload()}catch(err){setError(err.message)}}}/><span>{contact.preference?.enabled===false?'Sem marketing':'Marketing ativo'}</span></label></div>)}</div>:<div className="emailEmpty">Ainda não existem contactos importados.</div>}</section>}

  {studentPicker&&<Modal title="Selecionar alunos" onClose={()=>setStudentPicker(false)} className="emailStudentPicker"><div className="emailSearch"><Search size={18}/><input value={studentSearch} onChange={e=>setStudentSearch(e.target.value)} placeholder="Pesquisar nome, email ou professor..."/></div><div className="emailStudentList">{filteredStudents.map(student=><label key={student.id} className={selectedStudents.includes(student.id)?'selected':''}><input type="checkbox" checked={selectedStudents.includes(student.id)} onChange={()=>setSelectedStudents(list=>list.includes(student.id)?list.filter(id=>id!==student.id):[...list,student.id])}/><div><b>{student.name}</b><small>{student.email} · {student.primaryTrainer?.name||'Sem professor'} · {student.active?'Ativo':student.status}</small></div></label>)}</div><div className="emailModalActions"><button className="secondary" onClick={()=>setSelectedStudents([])}>Limpar</button><button className="primary" onClick={()=>{setAudienceType('selected_students');setStudentPicker(false)}}>Usar {selectedStudents.length} aluno(s)</button></div></Modal>}

  {preview&&<Modal title="Pré-visualização" onClose={()=>setPreview(false)} className="emailPreviewModal"><div className="emailPreviewSwitch"><button className={!previewMobile?'active':''} onClick={()=>setPreviewMobile(false)}><Monitor size={16}/>Desktop</button><button className={previewMobile?'active':''} onClick={()=>setPreviewMobile(true)}><Smartphone size={16}/>Mobile</button></div><EmailPreview subject={subject} preheader={preheader} html={html} mobile={previewMobile}/></Modal>}

  {testModal&&<Modal title="Enviar email de teste" onClose={()=>setTestModal(false)}><div className="emailTestBody"><p>Será enviada exatamente a versão atual da campanha para este endereço.</p><label>Email<input type="email" value={testEmail} onChange={e=>setTestEmail(e.target.value)}/></label><div className="emailModalActions"><button className="secondary" onClick={()=>setTestModal(false)}>Cancelar</button><button className="primary" disabled={sending||!isValidEmail(testEmail)||!subject.trim()||!html.trim()} onClick={sendTest}>{sending?'A enviar…':'Enviar teste'}</button></div></div></Modal>}

  {confirmSend&&<Modal title="Confirmar envio" onClose={()=>!sending&&setConfirmSend(false)}><div className="emailConfirmBody"><AlertTriangle size={34}/><p>Está prestes a enviar:</p><h3>“{subject}”</h3><p>para <b>{recipientCount} destinatário(s)</b>.</p><small>Os destinatários recebem mensagens individuais. Não é utilizado CC nem BCC.</small><div className="emailModalActions"><button className="secondary" disabled={sending} onClick={()=>setConfirmSend(false)}>Cancelar</button><button className="primary" disabled={sending} onClick={sendCampaign}>{sending?'A enviar…':'Enviar campanha'}</button></div></div></Modal>}

  {importModal&&<Modal title="Importar contactos" onClose={()=>!importing&&setImportModal(false)}><div className="emailImportBody"><label className="emailFileDrop"><Upload size={28}/><b>Selecionar TXT ou CSV</b><small>Os emails podem estar em linhas, separados por vírgulas ou ponto e vírgula.</small><input type="file" accept=".txt,.csv,text/plain,text/csv" onChange={e=>readImportFile(e.target.files?.[0])}/></label>{importPreview&&<div className="emailImportSummary"><div><strong>{importPreview.found}</strong><span>emails encontrados</span></div><div><strong>{importPreview.valid}</strong><span>válidos únicos</span></div><div><strong>{importPreview.duplicates}</strong><span>duplicados</span></div><div><strong>{importPreview.invalid}</strong><span>inválidos</span></div><div><strong>{importPreview.existing}</strong><span>já existentes</span></div></div>}<div className="emailModalActions"><button className="secondary" disabled={importing} onClick={()=>setImportModal(false)}>Cancelar</button><button className="primary" disabled={importing||!importPreview?.emails?.length} onClick={performImport}>{importing?'A importar…':`Importar ${importPreview?.emails?.length||0} contactos`}</button></div></div></Modal>}

  {(details||detailsLoading)&&<Modal title="Detalhes da campanha" onClose={()=>setDetails(null)} className="emailDetailsModal">{detailsLoading&&!details?<div className="loadingCard"><div className="loader"/>A carregar…</div>:details&&<div className="emailCampaignDetails"><h2>{details.campaign.subject}</h2><div className="emailDetailsStats"><div><small>Enviado por</small><b>{details.campaign.creator?.full_name||details.campaign.creator?.email||'Administração'}</b></div><div><small>Data/hora</small><b>{new Date(details.campaign.sent_at||details.campaign.created_at).toLocaleString('pt-PT')}</b></div><div><small>Destinatários</small><b>{details.campaign.recipients_count}</b></div><div><small>Enviados</small><b>{details.campaign.sent_count}</b></div><div><small>Falharam</small><b>{details.campaign.failed_count}</b></div><div><small>Entregues</small><b>{details.campaign.delivered_count??'—'}</b></div><div><small>Aberturas</small><b>{details.campaign.opened_count??'—'}</b></div><div><small>Cliques</small><b>{details.campaign.clicked_count??'—'}</b></div></div>{details.campaign.last_error&&<Notice type="error">{details.campaign.last_error}</Notice>}<div className="emailRecipientErrors">{details.recipients.filter(r=>r.error).map(r=><div key={r.id}><b>{r.email}</b><span>{r.error}</span></div>)}</div></div>}</Modal>}
 </div>
}
