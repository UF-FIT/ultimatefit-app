import React,{useEffect,useMemo,useRef,useState} from 'react';
import {AlertCircle,Check,ChevronLeft,ChevronRight,Edit3,MessageCircle,Pause,Play,Plus,Repeat,Users,Wallet,X} from 'lucide-react';
import {useApp} from '../contexts/AppContext';
import {cents,money,today} from '../lib/payments';
import {loadStudioMonth,loadStudioYearSummary,saveStudioMember,saveStudioFinancialRecord,saveStudioRecurringItem,setStudioChargePaid,setStudioFinancialRecordPaid,setStudioRecurringActive} from '../lib/studio';
import '../styles/studio-management.css';

const incomeCategories=[['trainer_rent','Mensalidade de professor'],['other_income','Outro rendimento']];
const expenseCategories=[['rent','Renda'],['electricity','Eletricidade'],['water','Água'],['advertising','Publicidade e redes sociais'],['salary','Ordenado de professor'],['internet','Internet e telefone'],['cleaning','Limpeza'],['insurance','Seguro'],['accounting','Contabilidade'],['maintenance','Manutenção e equipamento'],['fees','Comissões bancárias'],['software','Software e serviços'],['other_expense','Outra despesa']];
const categoryName=key=>[...incomeCategories,...expenseCategories].find(item=>item[0]===key)?.[1]||key||'Outro';
const monthLabel=value=>new Date(value+'-01T12:00:00').toLocaleDateString('pt-PT',{month:'long',year:'numeric'});
const yearList=()=>{const current=new Date().getFullYear();return Array.from({length:7},(_,i)=>current-5+i);};
const localMonth=()=>today().slice(0,7);
const memberName=member=>[member.first_name,member.last_name].filter(Boolean).join(' ');
const phoneForWhatsApp=value=>{let phone=String(value||'').replace(/\D/g,'');if(phone.startsWith('00'))phone=phone.slice(2);if(phone.length===9)phone='351'+phone;return phone.length>=10&&phone.length<=15?phone:'';};
const euroInput=value=>(Number(value||0)/100).toFixed(2).replace('.',',');

function Card({children,className=''}){return <section className={'studioCard '+className}>{children}</section>;}
function Status({status,direction}){const paid=status==='paid',cancelled=status==='cancelled';return <span className={'studioStatus '+(paid?'paid':cancelled?'cancelled':'pending')}>{paid?'Pago':cancelled?'Anulado':direction==='income'?'Por receber':'Por pagar'}</span>;}
function Notice({type='info',children}){return <div className={'studioNotice '+type}>{type==='error'?<AlertCircle size={17}/>:<Check size={17}/>}<span>{children}</span></div>;}

export default function StudioManagement(){
 const {currentUser}=useApp();
 const [month,setMonth]=useState(localMonth());
 const [year,setYear]=useState(new Date().getFullYear());
 const [view,setView]=useState('month');
 const [payload,setPayload]=useState(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [dialog,setDialog]=useState(null);
 const [revision,setRevision]=useState(0);
 const [busyId,setBusyId]=useState('');
 const owner=currentUser.id;
 const members=payload?.members||[];
 const charges=payload?.charges||[];
 const records=payload?.records||[];
 const recurringItems=payload?.recurringItems||[];
 const chargeByMember=useMemo(()=>new Map(charges.map(row=>[row.member_id,row])),[charges]);

 async function reload(){
  setLoading(true);setError('');
  try{
   const next=view==='month'?await loadStudioMonth(owner,month):await loadStudioYearSummary(owner,year);
   setPayload(next);
  }catch(err){setPayload(null);setError(err.message||'Não foi possível carregar a gestão do estúdio.');}
  finally{setLoading(false);}
 }
 useEffect(()=>{if(currentUser.systemRole==='owner')reload();else setLoading(false);},[owner,currentUser.systemRole,view,month,year,revision]);
 function saved(message){setDialog(null);setNotice(message);setRevision(n=>n+1);}
 function shiftMonth(delta){const date=new Date(month+'-01T12:00:00');date.setMonth(date.getMonth()+delta);setMonth(date.toISOString().slice(0,7));}
 async function setChargePaid(row,paid){
  setBusyId(row.id);setError('');
  try{await setStudioChargePaid(owner,row.id,paid);setNotice(paid?'Mensalidade do Pilates marcada como paga.':'Estado do pagamento atualizado.');setRevision(n=>n+1);}
  catch(err){setError(err.message||'Não foi possível atualizar este pagamento.');}
  finally{setBusyId('');}
 }
 async function setRecordPaid(row,paid){
  setBusyId(row.id);setError('');
  try{await setStudioFinancialRecordPaid(owner,row.id,paid);setNotice(paid?'Registo marcado como pago/recebido.':'Estado do registo atualizado.');setRevision(n=>n+1);}
  catch(err){setError(err.message||'Não foi possível atualizar este registo.');}
  finally{setBusyId('');}
 }
 async function toggleRecurring(row){
  setBusyId(row.id);setError('');
  try{await setStudioRecurringActive(owner,row.id,!row.active);setNotice(row.active?'Registo mensal pausado.':'Registo mensal reativado.');setRevision(n=>n+1);}
  catch(err){setError(err.message||'Não foi possível atualizar o registo mensal.');}
  finally{setBusyId('');}
 }
 if(currentUser.systemRole!=='owner')return <main className="studioManagement"><h1>Gestão do Estúdio</h1><Notice type="error">Esta secção está disponível apenas para o proprietário.</Notice></main>;
 const summary=view==='month'?payload?.summary:null;
 const studioResult=(summary?.pilatesReceived||0)+(summary?.otherIncomeReceived||0)-(summary?.expensesPaid||0);

 return <main className="studioManagement">
  <header className="studioHeading">
   <div><small>ULTIMATE FIT · GESTÃO</small><h1>Gestão do Estúdio</h1><p>Receitas e despesas do Pilates e da utilização do estúdio, separadas do treino pessoal.</p></div>
   <div className="studioHeadingActions"><button type="button" onClick={()=>setDialog({type:'member'})}><Plus size={17}/> Novo aluno de grupo</button><button className="primary" type="button" onClick={()=>setDialog({type:'finance'})}><Plus size={17}/> Novo rendimento/despesa</button></div>
  </header>
  <div className="studioPrivacy"><Users size={18}/><span>Os alunos de Pilates ficam numa lista independente. Não são associados aos alunos de treino pessoal da Diana, do Manuel ou de outros professores.</span></div>
  {notice&&<Notice>{notice}</Notice>}
  {error&&<Notice type="error">{error} <button type="button" onClick={()=>setRevision(n=>n+1)}>Tentar novamente</button></Notice>}
  <div className="studioToolbar">
   <div className="studioViewSwitch" role="group" aria-label="Período de análise"><button className={view==='month'?'active':''} onClick={()=>setView('month')}>Mês</button><button className={view==='year'?'active':''} onClick={()=>setView('year')}>Ano</button></div>
   {view==='month'?<div className="studioPeriod"><button aria-label="Mês anterior" onClick={()=>shiftMonth(-1)}><ChevronLeft size={18}/></button><input aria-label="Mês" type="month" value={month} onChange={event=>setMonth(event.target.value)}/><button aria-label="Mês seguinte" onClick={()=>shiftMonth(1)}><ChevronRight size={18}/></button></div>:<label className="studioYearSelect">Ano<select value={year} onChange={event=>setYear(Number(event.target.value))}>{yearList().map(value=><option key={value} value={value}>{value}</option>)}</select></label>}
   {view==='month'&&<span className="studioPeriodLabel">{monthLabel(month)}</span>}
  </div>
  {loading?<div className="studioLoading"><span className="studioSpinner"/><p>A carregar valores e inscrições…</p></div>:view==='month'?<>
   <div className="studioMetrics">
    <div><small>Pilates recebido</small><strong>{money(summary?.pilatesReceived||0)}</strong><span>Mensalidades pagas neste mês</span></div>
    <div><small>Outros rendimentos</small><strong>{money(summary?.otherIncomeReceived||0)}</strong><span>Inclui mensalidades dos professores</span></div>
    <div><small>Despesas pagas</small><strong>{money(summary?.expensesPaid||0)}</strong><span>Renda, ordenados, contas, publicidade…</span></div>
    <div className="result"><small>Resultado do estúdio</small><strong>{money(studioResult)}</strong><span>Receitas menos despesas · antes de impostos</span></div>
   </div>
   <div className="studioMetrics studioSecondaryMetrics">
    <div><small>PT recebido por ti</small><strong>{money(payload?.personalReceived||0)}</strong><span>Calculado separadamente a partir dos teus pagamentos pessoais</span></div>
    <div className="result"><small>Total recebido + resultado do estúdio</small><strong>{money((payload?.personalReceived||0)+studioResult)}</strong><span>Treino pessoal + resultado operacional do estúdio</span></div>
    <div><small>Por receber</small><strong>{money(summary?.pendingIncome||0)}</strong><span>Mensalidades e outros rendimentos pendentes neste mês</span></div>
    <div><small>Despesas pendentes</small><strong>{money(summary?.pendingExpenses||0)}</strong><span>Contas e outros custos ainda por pagar</span></div>
   </div>
   <div className="studioColumns">
    <Card>
     <header className="studioCardHeader"><div><h2>Alunos de Pilates</h2><p>Inscrições e mensalidades de {monthLabel(month)}.</p></div><button type="button" onClick={()=>setDialog({type:'member'})}><Plus size={17}/> Adicionar aluno</button></header>
     {!members.length?<div className="studioEmpty">Ainda não há alunos de grupo. Adiciona apenas o primeiro e o último nome, valor e, se quiseres enviar lembretes, o WhatsApp.</div>:<div className="studioMemberList">{members.map(member=>{
      const charge=chargeByMember.get(member.id);
      const phone=phoneForWhatsApp(member.whatsapp_phone);
      const statusText=charge?(charge.status==='paid'?'Pago':charge.status==='cancelled'?'Anulado':'Pendente'):member.active?'Sem cobrança neste mês':'Inscrição inativa';
      const whatsappMessage='Olá '+member.first_name+', tudo bem? Ainda não tenho registado o pagamento da mensalidade de Pilates referente a '+monthLabel(month)+' ('+money(charge?.amount_cents||member.monthly_fee_cents)+'). Quando puderes, envia-me o comprovativo. Obrigado!';
      return <article className="studioMemberRow" key={member.id}>
       <div className="studioMemberMain"><span className="studioMemberAvatar">{(member.first_name[0]||'')+(member.last_name[0]||'')}</span><div><strong>{memberName(member)}</strong><small>{money(charge?.amount_cents||member.monthly_fee_cents)} / mês · vence dia {member.due_day}</small></div></div>
       <div className="studioMemberStatus"><span className={'studioTextStatus '+(charge?.status==='paid'?'paid':member.active?'pending':'muted')}>{statusText}</span>{charge?.status==='paid'&&charge.paid_on&&<small>Pago em {new Date(charge.paid_on+'T12:00:00').toLocaleDateString('pt-PT')}</small>}</div>
       <div className="studioRowActions"><button type="button" className="studioIconButton" aria-label={'Editar '+memberName(member)} onClick={()=>setDialog({type:'member',member})}><Edit3 size={16}/></button>{member.active&&charge&&charge.status!=='cancelled'&&<button type="button" disabled={busyId===charge.id} className={charge.status==='paid'?'studioSmallButton secondary':'studioSmallButton primary'} onClick={()=>setChargePaid(charge,charge.status!=='paid')}>{charge.status==='paid'?<><X size={15}/> Desfazer</>:<><Check size={15}/> Marcar pago</>}</button>}{member.active&&charge?.status==='pending'&&phone&&<a className="studioWhatsapp" href={'https://wa.me/'+phone+'?text='+encodeURIComponent(whatsappMessage)} target="_blank" rel="noopener noreferrer" aria-label={'Abrir WhatsApp para '+memberName(member)}><MessageCircle size={17}/> Pedir pagamento</a>}</div>
       {!phone&&member.active&&<small className="studioMemberHint">Sem WhatsApp registado · <button type="button" onClick={()=>setDialog({type:'member',member})}>Adicionar número</button></small>}
      </article>;
     })}</div>}
     <footer className="studioCardFooter"><span>{members.filter(member=>member.active).length} inscrições ativas</span><button type="button" onClick={()=>setDialog({type:'member'})}>+ Adicionar aluno de Pilates</button></footer>
    </Card>
    <Card>
     <header className="studioCardHeader"><div><h2>Movimentos do estúdio</h2><p>Rendimentos adicionais e despesas de {monthLabel(month)}.</p></div><button type="button" onClick={()=>setDialog({type:'finance'})}><Plus size={17}/> Adicionar</button></header>
     {!records.length?<div className="studioEmpty">Sem movimentos registados neste mês. Podes adicionar uma despesa pontual ou criar um registo mensal recorrente. Exemplo: “Mensalidade da Diana” · 250 €.</div>:<div className="studioRecordList">{records.map(record=><article className="studioRecordRow" key={record.id}>
      <div className={'studioRecordIcon '+record.direction}>{record.direction==='income'?<Wallet size={18}/>:<Repeat size={18}/>}</div>
      <div className="studioRecordDetails"><strong>{record.description}</strong><small>{categoryName(record.category)} · vence {new Date(record.due_on+'T12:00:00').toLocaleDateString('pt-PT')}{record.recurring_item_id?' · mensal':''}</small></div>
      <div className="studioRecordAmount"><strong>{money(record.amount_cents)}</strong><Status status={record.status} direction={record.direction}/></div>
      <div className="studioRowActions"><button className="studioIconButton" type="button" aria-label={'Editar '+record.description} onClick={()=>setDialog({type:'finance',record})}><Edit3 size={16}/></button>{record.status!=='cancelled'&&<button type="button" disabled={busyId===record.id} className="studioSmallButton secondary" onClick={()=>setRecordPaid(record,record.status!=='paid')}>{record.status==='paid'?<><X size={15}/> Desfazer</>:<><Check size={15}/> Marcar pago</>}</button>}</div>
     </article>)}</div>}
     <footer className="studioCardFooter"><button type="button" onClick={()=>setDialog({type:'finance',recurring:true})}><Repeat size={16}/> Adicionar rendimento/despesa mensal</button></footer>
    </Card>
   </div>
   <Card className="studioRecurringCard"><header className="studioCardHeader"><div><h2>Registos mensais automáticos</h2><p>As próximas mensalidades e despesas são geradas uma vez por mês, sem duplicações. Alterações futuras não reescrevem o histórico.</p></div><button type="button" onClick={()=>setDialog({type:'finance',recurring:true})}><Plus size={17}/> Criar registo mensal</button></header>
    {!recurringItems.length?<p className="studioEmpty">Ainda não configuraste receitas ou despesas recorrentes.</p>:<div className="studioRecurringList">{recurringItems.map(item=><article key={item.id}><div className={'studioRecurringIcon '+item.direction}><Repeat size={17}/></div><div className="studioRecordDetails"><strong>{item.description}</strong><small>{categoryName(item.category)} · {money(item.amount_cents)} / mês · desde {new Date(item.starts_on+'T12:00:00').toLocaleDateString('pt-PT')}</small></div><span className={'studioTextStatus '+(item.active?'paid':'muted')}>{item.active?'Ativo':'Pausado'}</span><div className="studioRowActions"><button className="studioIconButton" type="button" aria-label={'Editar regra '+item.description} onClick={()=>setDialog({type:'finance',template:item})}><Edit3 size={16}/></button><button type="button" disabled={busyId===item.id} className="studioSmallButton secondary" onClick={()=>toggleRecurring(item)}>{item.active?<><Pause size={14}/> Pausar</>:<><Play size={14}/> Reativar</>}</button></div></article>)}</div>}
   </Card>
  </>:<YearView payload={payload} year={year}/>}
  {dialog?.type==='member'&&<MemberDialog member={dialog.member} month={month} onClose={()=>setDialog(null)} onSave={async values=>{await saveStudioMember(owner,values);saved(dialog.member?'Inscrição atualizada.':'Aluno de Pilates adicionado.');}}/>}
  {dialog?.type==='finance'&&<FinanceDialog month={month} record={dialog.record} template={dialog.template} recurring={dialog.recurring} onClose={()=>setDialog(null)} onSave={async values=>{if(values.isRecurring)await saveStudioRecurringItem(owner,values);else await saveStudioFinancialRecord(owner,values);saved(values.isRecurring?(dialog.template?'Regra mensal atualizada.':'Registo mensal criado.'):(dialog.record?'Movimento atualizado.':'Movimento adicionado.'));}}/>}
 </main>;
}

function YearView({payload,year}){
 const rows=payload?.months||[];
 const totals=payload?.totals||{personal:0,pilates:0,otherIncome:0,expenses:0,studioResult:0,total:0};
 return <>
  <div className="studioMetrics">
   <div><small>Treino pessoal</small><strong>{money(totals.personal)}</strong><span>Pagamentos recebidos no ano</span></div>
   <div><small>Pilates</small><strong>{money(totals.pilates)}</strong><span>Mensalidades recebidas</span></div>
   <div><small>Outros rendimentos</small><strong>{money(totals.otherIncome)}</strong><span>Inclui valores pagos pelos professores</span></div>
   <div><small>Despesas do estúdio</small><strong>{money(totals.expenses)}</strong><span>Despesas pagas no ano</span></div>
  </div>
  <Card className="studioYearCard"><header className="studioCardHeader"><div><h2>Resumo de {year}</h2><p>Valores registados por data de recebimento/pagamento. O resultado é apresentado antes de impostos.</p></div></header>
   <div className="studioYearResult"><span>Resultado do estúdio</span><strong>{money(totals.studioResult)}</strong><span>Total incluindo treino pessoal</span><strong>{money(totals.total)}</strong></div>
   <div className="studioYearTableWrap"><table className="studioYearTable"><thead><tr><th>Mês</th><th>Treino pessoal</th><th>Pilates</th><th>Outros</th><th>Despesas</th><th>Resultado estúdio</th></tr></thead><tbody>{rows.map(row=><tr key={row.key}><th>{row.label}</th><td>{money(row.personal)}</td><td>{money(row.pilates)}</td><td>{money(row.otherIncome)}</td><td>{money(row.expenses)}</td><td>{money(row.studioResult)}</td></tr>)}</tbody><tfoot><tr><th>Total</th><td>{money(totals.personal)}</td><td>{money(totals.pilates)}</td><td>{money(totals.otherIncome)}</td><td>{money(totals.expenses)}</td><td>{money(totals.studioResult)}</td></tr></tfoot></table></div>
  </Card>
 </>;
}

function MemberDialog({member,onClose,onSave}){
 const [form,setForm]=useState(()=>member?{...member,monthly_fee:euroInput(member.monthly_fee_cents),starts_on:member.starts_on,active:member.active}:{first_name:'',last_name:'',whatsapp_phone:'',monthly_fee:'',due_day:'8',starts_on:today(),active:true,ends_on:null});
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const submitLock=useRef(false),requestId=useRef(crypto.randomUUID());
 const update=(key,value)=>setForm(previous=>({...previous,[key]:value}));
 async function submit(event){
  event.preventDefault();if(submitLock.current)return;submitLock.current=true;setBusy(true);setError('');
  try{
   await onSave({id:member?.id,request_id:requestId.current,first_name:form.first_name,last_name:form.last_name,whatsapp_phone:form.whatsapp_phone,monthly_fee_cents:cents(form.monthly_fee),due_day:Number(form.due_day),starts_on:form.starts_on,active:!!form.active,ends_on:form.active?null:(form.ends_on||today())});
  }catch(err){setError(err.message||'Não foi possível guardar a inscrição.');}finally{submitLock.current=false;setBusy(false);}
 }
 return <Modal title={member?'Editar inscrição de Pilates':'Adicionar aluno de Pilates'} onClose={onClose}>
  <p className="studioModalIntro">Registo independente da lista de alunos de treino pessoal. O valor definido aplica-se a novas mensalidades.</p>
  <form onSubmit={submit}>
   <div className="studioFormGrid"><label>Primeiro nome<input autoComplete="given-name" maxLength={60} required value={form.first_name} onChange={event=>update('first_name',event.target.value)}/></label><label>Último nome<input autoComplete="family-name" maxLength={60} required value={form.last_name} onChange={event=>update('last_name',event.target.value)}/></label><label>Mensalidade (€)<input inputMode="decimal" required placeholder="Ex.: 60,00" value={form.monthly_fee} onChange={event=>update('monthly_fee',event.target.value)}/></label><label>Dia limite da mensalidade<input type="number" min="1" max="31" required value={form.due_day} onChange={event=>update('due_day',event.target.value)}/></label><label className="studioWide">WhatsApp (opcional)<input type="tel" autoComplete="tel" maxLength={40} placeholder="Ex.: 912 345 678" value={form.whatsapp_phone} onChange={event=>update('whatsapp_phone',event.target.value)}/></label><label>Início da inscrição<input type="date" required value={form.starts_on} onChange={event=>update('starts_on',event.target.value)}/></label><label className="studioCheckField"><input type="checkbox" checked={!!form.active} onChange={event=>{update('active',event.target.checked);if(event.target.checked&&member&&!member.active){update('starts_on',today());update('ends_on',null);}}}/> Inscrição ativa</label></div>
   <p className="studioFormHint">As mensalidades já criadas mantêm o valor original. Se marcares como inativa, o histórico fica guardado.</p>
   {error&&<p className="studioFieldError" role="alert">{error}</p>}
   <footer><button type="button" className="secondary" disabled={busy} onClick={onClose}>Cancelar</button><button type="submit" className="primary" disabled={busy}>{busy?'A guardar…':'Guardar inscrição'}</button></footer>
  </form>
 </Modal>;
}

function FinanceDialog({month,record,template,recurring,onClose,onSave}){
 const isTemplate=!!template;
 const isRecurring=isTemplate||!!recurring;
 const initial=template||record;
 const [form,setForm]=useState(()=>initial?{
  id:initial.id,direction:initial.direction,category:initial.category,description:initial.description,
  amount:euroInput(initial.amount_cents),due_day:initial.due_day||Number(initial.due_on?.slice(8,10)||8),
  starts_on:initial.starts_on||month+'-01',period:initial.period?.slice(0,7)||month,due_on:initial.due_on||today(),
  status:initial.status||'pending',paid_on:initial.paid_on||today(),active:initial.active??true,
 }:{direction:'expense',category:'rent',description:'',amount:'',due_day:'8',starts_on:month+'-01',period:month,due_on:today(),status:'pending',paid_on:today(),active:true});
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const submitLock=useRef(false),requestId=useRef(crypto.randomUUID());
 const update=(key,value)=>setForm(previous=>({...previous,[key]:value}));
 const categories=form.direction==='income'?incomeCategories:expenseCategories;
 async function submit(event){
  event.preventDefault();if(submitLock.current)return;submitLock.current=true;setBusy(true);setError('');
  try{
   const amount_cents=cents(form.amount);
   if(isRecurring){
    await onSave({id:template?.id,request_id:requestId.current,isRecurring:true,direction:form.direction,category:form.category,description:form.description,amount_cents,due_day:Number(form.due_day),starts_on:form.starts_on,active:form.active,ends_on:form.active?null:today()});
   }else{
    await onSave({id:record?.id,request_id:requestId.current,isRecurring:false,direction:form.direction,category:form.category,description:form.description,amount_cents,period:form.period+'-01',due_on:form.due_on,status:form.status,paid_on:form.status==='paid'?form.paid_on:null,method:'other'});
   }
  }catch(err){setError(err.message||'Não foi possível guardar o movimento.');}finally{submitLock.current=false;setBusy(false);}
 }
 return <Modal title={isTemplate?'Editar registo mensal':record?'Editar movimento':isRecurring?'Novo registo mensal':'Novo rendimento ou despesa'} onClose={onClose}>
  <p className="studioModalIntro">{isRecurring?'Este valor será gerado uma vez por mês. Os registos já existentes mantêm o histórico.':'Regista um rendimento adicional ou uma despesa do estúdio. Os valores entram nos totais quando marcados como pagos/recebidos.'}</p>
  <form onSubmit={submit}>
   <div className="studioFormGrid"><label>Tipo<select value={form.direction} onChange={event=>{update('direction',event.target.value);update('category',event.target.value==='income'?'trainer_rent':'rent');}}><option value="income">Rendimento</option><option value="expense">Despesa</option></select></label><label>Categoria<select required value={form.category} onChange={event=>update('category',event.target.value)}>{categories.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label className="studioWide">Descrição<input required maxLength={160} placeholder={form.direction==='income'?'Ex.: Mensalidade da Diana':'Ex.: Ordenado professor de Pilates'} value={form.description} onChange={event=>update('description',event.target.value)}/></label><label>Valor (€)<input inputMode="decimal" required placeholder="Ex.: 250,00" value={form.amount} onChange={event=>update('amount',event.target.value)}/></label>
    {isRecurring?<><label>Dia limite<input type="number" min="1" max="31" required value={form.due_day} onChange={event=>update('due_day',event.target.value)}/></label><label>Começa em<input type="date" required value={form.starts_on} onChange={event=>update('starts_on',event.target.value)}/></label><label className="studioCheckField"><input type="checkbox" checked={!!form.active} onChange={event=>update('active',event.target.checked)}/> Ativo</label></>:<><label>Mês de referência<input type="month" required value={form.period} onChange={event=>update('period',event.target.value)}/></label><label>Data limite<input type="date" required value={form.due_on} onChange={event=>update('due_on',event.target.value)}/></label><label>Estado<select value={form.status} onChange={event=>update('status',event.target.value)}><option value="pending">{form.direction==='income'?'Por receber':'Por pagar'}</option><option value="paid">{form.direction==='income'?'Já recebido':'Já pago'}</option><option value="cancelled">Anulado</option></select></label>{form.status==='paid'&&<label>Data de pagamento<input type="date" max={today()} required value={form.paid_on} onChange={event=>update('paid_on',event.target.value)}/></label>}</>}
   </div>
   {error&&<p className="studioFieldError" role="alert">{error}</p>}
   <footer><button type="button" className="secondary" disabled={busy} onClick={onClose}>Cancelar</button><button type="submit" className="primary" disabled={busy}>{busy?'A guardar…':'Guardar'}</button></footer>
  </form>
 </Modal>;
}

function Modal({title,onClose,children}){
 useEffect(()=>{const handler=event=>{if(event.key==='Escape')onClose();};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[onClose]);
 return <div className="studioModalBackdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><section className="studioModal" role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button type="button" className="studioIconButton" aria-label="Fechar" onClick={onClose}><X size={20}/></button></header>{children}</section></div>;
}
