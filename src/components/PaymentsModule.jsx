import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useApp} from '../contexts/AppContext';
import {cents,fetchPayments,fetchPaymentDuos,money,paymentKinds,paymentMethods,paymentRpc,paymentState,stateLabels,today} from '../lib/payments';
import '../styles/payments.css';

const monthLabel=month=>new Date(month+'-01T12:00:00').toLocaleDateString('pt-PT',{month:'long',year:'numeric'});
const dateLabel=value=>value?value.split('-').reverse().join('/'):'—';
function MonthInput({value,onChange}){return <input aria-label="Mês" type="month" required value={value} onChange={e=>onChange(e.target.value)}/>;}

function PaymentDialog({title,onClose,children}){
 const ref=useRef(null);
 useEffect(()=>{const dialog=ref.current;dialog.showModal();return()=>dialog.close();},[]);
 return createPortal(<dialog ref={ref} className="ufPaymentDialog" onCancel={e=>{e.preventDefault();onClose();}} aria-labelledby="payment-dialog-title">
  <header><h2 id="payment-dialog-title">{title}</h2><button type="button" aria-label="Fechar" onClick={onClose}>×</button></header>{children}
 </dialog>,document.body);
}

function PaymentForm({row,students,month,onClose,onSaved}){
 const [form,setForm]=useState(()=>row?{...row,amount:String(row.amount_cents/100)}:{request_id:crypto.randomUUID(),student_id:students[0]?.id||'',kind:'monthly',amount:'',period:month+'-01',due_on:today(),status:'pending',paid_on:today(),method:'mbway',receipt_reference:'',description:''});
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const set=(name,value)=>setForm(previous=>({...previous,[name]:value}));
 async function save(event,cancel=false){
  event?.preventDefault();if(busy)return;
  setBusy(true);setError('');
  try{
   await paymentRpc('payment_save',{p_data:{...form,amount_cents:cents(form.amount),status:cancel?'cancelled':form.status}});
   onSaved(cancel?'Registo anulado.':'Pagamento guardado com sucesso.');
  }catch(err){setError(err.message);}finally{setBusy(false);}
 }
 return <PaymentDialog title={row?'Editar pagamento':'Novo pagamento'} onClose={()=>!busy&&onClose()}><form onSubmit={save}>
  <div className="ufPaymentFields">
   <label>Aluno<select required disabled={!!row} value={form.student_id} onChange={e=>set('student_id',e.target.value)}>{students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
   <label>Tipo<select value={form.kind} onChange={e=>set('kind',e.target.value)}>{Object.entries(paymentKinds).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
   <label>Valor (€)<input required inputMode="decimal" value={form.amount} onChange={e=>set('amount',e.target.value)}/></label>
   <label>Mês a que se refere<MonthInput value={form.period.slice(0,7)} onChange={value=>set('period',value+'-01')}/></label>
   <label>Data limite<input type="date" required value={form.due_on} onChange={e=>set('due_on',e.target.value)}/></label>
   <label className="ufPaymentCheck"><input type="checkbox" checked={form.status==='paid'} onChange={e=>setForm(previous=>({...previous,status:e.target.checked?'paid':'pending',paid_on:previous.paid_on||today(),method:previous.method||'mbway'}))}/> Recebimento confirmado</label>
   {form.status==='paid'&&<><label>Método<select required value={form.method||'mbway'} onChange={e=>set('method',e.target.value)}>{Object.entries(paymentMethods).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>Pago em<input type="date" required max={today()} value={form.paid_on||today()} onChange={e=>set('paid_on',e.target.value)}/></label></>}
   <label>Descrição (opcional)<input maxLength={500} value={form.description} onChange={e=>set('description',e.target.value)}/></label>
   <label>Referência do recibo (opcional)<input maxLength={200} value={form.receipt_reference} onChange={e=>set('receipt_reference',e.target.value)}/></label>
  </div>
  {error&&<p role="alert" className="ufPaymentError">{error}</p>}
  <footer>{row&&<button type="button" disabled={busy} onClick={()=>{if(window.confirm('Anular este registo? Ficará no histórico e deixará de contar nos totais.'))save(null,true);}}>Anular</button>}<button type="button" disabled={busy} onClick={onClose}>Cancelar</button><button className="primary" disabled={busy||!form.student_id}>{busy?'A guardar…':'Guardar'}</button></footer>
 </form></PaymentDialog>;
}

function BillingForm({students,billing,onClose,onSaved}){
 const [studentId,setStudentId]=useState(students[0]?.id||'');
 const [form,setForm]=useState({amount:'',day:'1',starts:today().slice(0,7),enabled:true});
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const existing=billing.find(b=>b.student_id===studentId);setForm(existing?{amount:String(existing.amount_cents/100),day:String(existing.due_day),starts:existing.starts_on.slice(0,7),enabled:existing.enabled}:{amount:'',day:'1',starts:today().slice(0,7),enabled:true});setError('');},[studentId,billing]);
 const set=(name,value)=>setForm(previous=>({...previous,[name]:value}));
 async function save(e){e.preventDefault();if(busy)return;setBusy(true);setError('');try{await paymentRpc('payment_save_billing',{p_student:studentId,p_amount:cents(form.amount),p_day:Number(form.day),p_starts:form.starts+'-01',p_enabled:form.enabled});onSaved('Mensalidade definida. Os pagamentos anteriores mantêm o valor original.');}catch(err){setError(err.message);}finally{setBusy(false);}}
 return <PaymentDialog title="Definir mensalidades" onClose={()=>!busy&&onClose()}><form onSubmit={save}><div className="ufPaymentFields">
 <label>Aluno<select value={studentId} onChange={e=>setStudentId(e.target.value)}>{students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
 <label>Mensalidade (€)<input required inputMode="decimal" value={form.amount} onChange={e=>set('amount',e.target.value)}/></label>
 <label>Dia limite<input required type="number" min="1" max="31" value={form.day} onChange={e=>set('day',e.target.value)}/></label>
 <label>Primeiro mês<MonthInput value={form.starts} onChange={value=>set('starts',value)}/></label>
 <label className="ufPaymentCheck"><input type="checkbox" checked={form.enabled} onChange={e=>set('enabled',e.target.checked)}/> Gerar mensalidades para este aluno</label>
 <p>Nos meses mais curtos, é usado o último dia. Esta definição só se aplica a novos registos.</p></div>
 {error&&<p role="alert" className="ufPaymentError">{error}</p>}<footer><button type="button" disabled={busy} onClick={onClose}>Cancelar</button><button className="primary" disabled={busy||!studentId}>{busy?'A guardar…':'Guardar'}</button></footer></form></PaymentDialog>;
}


function PaymentDuoManager({duos,students,onClose,onSaved}){
 const [editingId,setEditingId]=useState('');
 const [form,setForm]=useState({student_a:students[0]?.id||'',student_b:students[1]?.id||'',payment_mode:'shared',active:true});
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  const item=duos.find(d=>d.id===editingId);
  setForm(item?{student_a:item.member_a_id,student_b:item.member_b_id,payment_mode:item.payment_mode,active:item.active}:{student_a:students[0]?.id||'',student_b:students[1]?.id||'',payment_mode:'shared',active:true});
  setError('');
 },[editingId,duos,students]);
 const set=(name,value)=>setForm(previous=>({...previous,[name]:value}));
 const available=students.filter(s=>!duos.some(d=>d.active&&d.id!==editingId&&(d.member_a_id===s.id||d.member_b_id===s.id)));
 async function save(e){
  e.preventDefault();if(busy)return;
  setBusy(true);setError('');
  try{
   await paymentRpc('payment_save_duo',{p_id:editingId||null,p_student_a:form.student_a,p_student_b:form.student_b,p_mode:form.payment_mode,p_active:form.active});
   onSaved(editingId?'Duo de pagamento atualizado.':'Duo de pagamento criado.');
  }catch(err){setError(err.message);}finally{setBusy(false);}
 }
 const studentName=id=>students.find(s=>s.id===id)?.name||'Aluno';
 const ordered=[...duos].sort((a,b)=>Number(b.active)-Number(a.active)||b.created_at.localeCompare(a.created_at));
 return <PaymentDialog title="Duos de pagamento" onClose={()=>!busy&&onClose()}>
  <p>Associa os alunos apenas para gerir pagamentos. Os valores e o histórico continuam separados por aluno.</p>
  <form onSubmit={save}>
   <div className="ufPaymentFields ufPaymentDuoFields">
    <label>Primeiro aluno<select required value={form.student_a} onChange={e=>set('student_a',e.target.value)}><option value="">Selecionar aluno</option>{available.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <label>Segundo aluno<select required value={form.student_b} onChange={e=>set('student_b',e.target.value)}><option value="">Selecionar aluno</option>{available.filter(s=>s.id!==form.student_a).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <label>Como pagam?<select value={form.payment_mode} onChange={e=>set('payment_mode',e.target.value)}><option value="shared">Em conjunto · um registo confirma os dois</option><option value="individual">Separadamente · confirmar cada aluno</option></select></label>
    <label className="ufPaymentCheck"><input type="checkbox" checked={form.active} onChange={e=>set('active',e.target.checked)}/> Duo ativo</label>
   </div>
   {error&&<p role="alert" className="ufPaymentError">{error}</p>}
   <footer>{editingId&&<button type="button" disabled={busy} onClick={()=>setEditingId('')}>Novo duo</button>}<button type="button" disabled={busy} onClick={onClose}>Fechar</button><button className="primary" disabled={busy||!form.student_a||!form.student_b||form.student_a===form.student_b}>{busy?'A guardar…':'Guardar duo'}</button></footer>
  </form>
  <div className="ufPaymentDuoList"><h3>Duos configurados</h3>{ordered.length?ordered.map(d=><article key={d.id}><div><strong>{studentName(d.member_a_id)} + {studentName(d.member_b_id)}</strong><small>{d.payment_mode==='shared'?'Pagamento em conjunto':'Pagamentos individuais'} · {d.active?'Ativo':'Inativo'}</small></div><button type="button" onClick={()=>setEditingId(d.id)}>Editar</button></article>):<p>Ainda não configuraste duos de pagamento.</p>}</div>
 </PaymentDialog>;
}

function SharedPaymentForm({duo,members,settlement,students,month,onClose,onSaved}){
 const existing=!!settlement;
 const [form,setForm]=useState(()=>({request_id:crypto.randomUUID(),paid_on:members[0]?.paid_on||today(),method:members[0]?.method||'mbway',receipt_reference:members[0]?.receipt_reference||''}));
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const names=members.map(row=>students.find(s=>s.id===row.student_id)?.name||'Aluno');
 const total=members.reduce((sum,row)=>sum+row.amount_cents,0);
 const set=(name,value)=>setForm(previous=>({...previous,[name]:value}));
 async function save(e){
  e.preventDefault();if(busy)return;
  setBusy(true);setError('');
  try{
   await paymentRpc('payment_save_duo_settlement',{p_id:settlement?.id||null,p_request_id:form.request_id,p_duo_id:duo.id,p_period:month+'-01',p_paid_on:form.paid_on,p_method:form.method,p_receipt_reference:form.receipt_reference});
   onSaved(existing?'Pagamento conjunto atualizado.':'Pagamento conjunto registado nos dois alunos.');
  }catch(err){setError(err.message);}finally{setBusy(false);}
 }
 return <PaymentDialog title={existing?'Editar pagamento conjunto':'Registar pagamento conjunto'} onClose={()=>!busy&&onClose()}>
  <p>{names.join(' + ')} · mensalidade de {monthLabel(month)}</p>
  <div className="ufPaymentDuoAmounts">{members.map((row,i)=><div key={row.id}><span>{names[i]}</span><strong>{money(row.amount_cents)}</strong></div>)}<div className="total"><span>Total recebido</span><strong>{money(total)}</strong></div></div>
  <form onSubmit={save}><div className="ufPaymentFields">
   <label>Método<select required value={form.method} onChange={e=>set('method',e.target.value)}>{Object.entries(paymentMethods).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
   <label>Pago em<input type="date" required max={today()} value={form.paid_on} onChange={e=>set('paid_on',e.target.value)}/></label>
   <label>Referência do recibo (opcional)<input maxLength={200} value={form.receipt_reference} onChange={e=>set('receipt_reference',e.target.value)}/></label>
  </div>
  {error&&<p role="alert" className="ufPaymentError">{error}</p>}
  <footer><button type="button" disabled={busy} onClick={onClose}>Cancelar</button><button className="primary" disabled={busy||members.length!==2}>{busy?'A guardar…':existing?'Guardar alterações':'Confirmar pagamento conjunto'}</button></footer>
  </form>
 </PaymentDialog>;
}

function PaymentList({rows,duos,settlements,students,manager,filter,search,month,onEdit,onJoint}){
 const names=new Map(students.map(s=>[s.id,s.name]));
 const activeDuoByStudent=new Map();
 [...duos].filter(d=>d.active).forEach(d=>{activeDuoByStudent.set(d.member_a_id,d);activeDuoByStudent.set(d.member_b_id,d);});
 const settledByPayment=new Map();
 settlements.forEach(s=>{settledByPayment.set(s.payment_a_id,s);settledByPayment.set(s.payment_b_id,s);});
 const orderedRows=[...rows].sort((a,b)=>a.due_on.localeCompare(b.due_on)||a.id.localeCompare(b.id));
 const consumed=new Set(),items=[];
 for(const row of orderedRows){
  if(consumed.has(row.id))continue;
  const settlement=settledByPayment.get(row.id);
  let duo=null,partner=null;
  if(settlement){
   duo=duos.find(d=>d.id===settlement.duo_id)||null;
   const partnerId=settlement.payment_a_id===row.id?settlement.payment_b_id:settlement.payment_a_id;
   partner=rows.find(r=>r.id===partnerId)||null;
  }else if(row.kind==='monthly'){
   duo=activeDuoByStudent.get(row.student_id)||null;
   if(duo?.payment_mode==='shared'){
    const partnerId=duo.member_a_id===row.student_id?duo.member_b_id:duo.member_a_id;
    partner=rows.find(r=>r.student_id===partnerId&&r.kind==='monthly'&&r.period===row.period&&r.status==='pending')||null;
    if(row.status!=='pending')partner=null;
   }
  }
  const shared=!!(duo&&partner&&partner.id!==row.id&&((settlement&&settledByPayment.get(partner.id)?.id===settlement.id)||(duo.payment_mode==='shared'&&row.status==='pending'&&partner.status==='pending')));
  if(shared){
   consumed.add(row.id);consumed.add(partner.id);
   const state=settlement?'paid':(paymentState(row)==='overdue'||paymentState(partner)==='overdue'?'overdue':'pending');
   const members=[row,partner].sort((a,b)=>(names.get(a.student_id)||'').localeCompare(names.get(b.student_id)||'','pt-PT'));
   const text=(names.get(members[0].student_id)||'')+' '+(members[0].description||'')+' '+(names.get(members[1].student_id)||'')+' '+(members[1].description||'');
   if((filter==='all'||state===filter)&&text.toLocaleLowerCase('pt-PT').includes(search.toLocaleLowerCase('pt-PT'))){
    items.push({type:'duo',duo,members,state,settlement:settlement||null,due_on:members.map(m=>m.due_on).sort()[0],id:row.id});
   }
   continue;
  }
  const state=paymentState(row);
  const text=(names.get(row.student_id)||'')+' '+(row.description||'');
  if((filter==='all'||state===filter)&&text.toLocaleLowerCase('pt-PT').includes(search.toLocaleLowerCase('pt-PT'))){
   items.push({type:'single',row,state,due_on:row.due_on,id:row.id,locked:!!settlement});
  }
 }
 items.sort((a,b)=>a.due_on.localeCompare(b.due_on)||a.id.localeCompare(b.id));
 if(!items.length)return <div className="ufPaymentList"><p className="ufPaymentEmpty">Não existem pagamentos para esta seleção.{manager&&' Define uma mensalidade ou adiciona um pagamento.'}</p></div>;
 return <div className="ufPaymentList">{items.map(item=>{
  if(item.type==='duo'){
   const namesInDuo=item.members.map(m=>names.get(m.student_id)||'Aluno');
   const total=item.members.reduce((sum,m)=>sum+m.amount_cents,0);
   return <article className="ufPaymentDuoCard" key={'duo-'+item.id}>
    <div className="ufPaymentRow"><div><h3>{namesInDuo.join(' + ')}</h3><p>{paymentKinds.monthly} · {monthLabel(month)}</p></div><strong>{money(total)}</strong></div>
    <div className="ufPaymentDuoAmounts">{item.members.map((m,i)=><div key={m.id}><span>{namesInDuo[i]}</span><strong>{money(m.amount_cents)}</strong></div>)}</div>
    <div className="ufPaymentRow"><span className={'ufPaymentBadge '+item.state}>{item.settlement?'Pago em conjunto':stateLabels[item.state]}</span>{manager&&<button onClick={()=>onJoint(item)}>{item.settlement?'Editar pagamento conjunto':'Registar pagamento conjunto'}</button>}</div>
   </article>;
  }
  const row=item.row;
  return <article key={row.id}><div className="ufPaymentRow"><div><h3>{manager?(names.get(row.student_id)||'Aluno'):paymentKinds[row.kind]}</h3><p>{manager&&paymentKinds[row.kind]+' · '}{monthLabel(row.period.slice(0,7))}</p>{row.description&&<p>{row.description}</p>}<small>{row.status==='paid'?'Pago em '+dateLabel(row.paid_on)+' · '+paymentMethods[row.method]:'Data limite: '+dateLabel(row.due_on)}</small>{row.receipt_reference&&<small>Recibo: {row.receipt_reference}</small>}</div><strong>{money(row.amount_cents)}</strong></div><div className="ufPaymentRow"><span className={'ufPaymentBadge '+item.state}>{stateLabels[item.state]}</span>{manager&&row.status!=='cancelled'&&!item.locked&&<button onClick={()=>onEdit(row)}>{row.status==='paid'?'Editar':'Registar pagamento'}</button>}</div></article>;
 })}</div>;
}

export default function PaymentsModule(){
 const {data,currentUser}=useApp();
 const [access,setAccess]=useState(null),[records,setRecords]=useState({payments:[],billing:[],duos:[],settlements:[]}),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [month,setMonth]=useState(today().slice(0,7)),[filter,setFilter]=useState('all'),[search,setSearch]=useState(''),[dialog,setDialog]=useState(null),[busy,setBusy]=useState(false);
 const manager=access==='manage';
 const students=useMemo(()=>data.students.filter(s=>manager?s.trainerIds?.includes(currentUser.id)&&!s.deletedAt:s.userId===currentUser.id).sort((a,b)=>a.name.localeCompare(b.name,'pt-PT')),[data.students,currentUser.id,manager]);
 async function reload(){
  setLoading(true);setError('');
  try{
   const mode=await paymentRpc('payment_access');
   const payments=mode==='none'?{payments:[],billing:[]}:await fetchPayments();
   const duoData=mode==='manage'?await fetchPaymentDuos():{duos:[],settlements:[]};
   setAccess(mode);setRecords({...payments,...duoData});
  }catch(err){setError('Não foi possível carregar os pagamentos. '+err.message);}finally{setLoading(false);}
 }
 useEffect(()=>{
  let active=true;setLoading(true);
  paymentRpc('payment_access').then(async mode=>{
   const payments=mode==='none'?{payments:[],billing:[]}:await fetchPayments();
   const duoData=mode==='manage'?await fetchPaymentDuos():{duos:[],settlements:[]};
   if(active){setAccess(mode);setRecords({...payments,...duoData});}
  }).catch(err=>{if(active)setError('Não foi possível carregar os pagamentos. '+err.message);}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[currentUser.id]);
 const rows=records.payments.filter(p=>p.period.slice(0,7)===month);
 const sum=list=>list.reduce((total,p)=>total+p.amount_cents,0);
 const history=Array.from({length:6},(_,i)=>{const d=new Date(month+'-01T12:00:00');d.setMonth(d.getMonth()-5+i);const key=String(d.getFullYear())+'-'+String(d.getMonth()+1).padStart(2,'0');return {key,label:d.toLocaleDateString('pt-PT',{month:'short'}),value:sum(records.payments.filter(p=>p.status==='paid'&&p.paid_on?.slice(0,7)===key))};});
 const max=Math.max(...history.map(h=>h.value),1);
 function saved(message){setDialog(null);setNotice(message);reload();}
 async function generate(){if(busy)return;setBusy(true);setError('');try{const count=await paymentRpc('payment_generate_month',{p_month:month+'-01'});setNotice(count?count+' mensalidade(s) criada(s).':'Nenhuma mensalidade nova. Verifica as definições dos alunos; os registos existentes não são duplicados.');setDialog(null);await reload();}catch(err){setError(err.message);}finally{setBusy(false);}}
 function moveMonth(delta){const d=new Date(month+'-01T12:00:00');d.setMonth(d.getMonth()+delta);setMonth(String(d.getFullYear())+'-'+String(d.getMonth()+1).padStart(2,'0'));}
 if(access==='none')return <section className="ufPayments"><h1>Pagamentos</h1><p>Este módulo ainda não está disponível para esta conta.</p></section>;
 return <section className="ufPayments">
  <div className="ufPaymentHeading"><div><h1>{manager?'Pagamentos':'Os meus pagamentos'}</h1><p>{manager?'Mensalidades e recebimentos dos teus alunos.':'Consulta os registos confirmados pelo teu professor.'}</p></div>{manager&&<button className="primary" onClick={()=>setDialog({type:'payment'})} disabled={loading}>+ Novo pagamento</button>}</div>
  {error&&<div role="alert" className="ufPaymentError">{error}<button onClick={reload}>Tentar novamente</button></div>}
  {notice&&<p className="ufPaymentNotice" role="status">{notice}</p>}
  {loading?<p role="status">A carregar pagamentos…</p>:<>
   {manager&&<div className="ufPaymentActions"><button onClick={()=>setDialog({type:'billing'})}>Definir mensalidades</button><button onClick={()=>setDialog({type:'generate'})}>Gerar mensalidades do mês</button><button onClick={()=>setDialog({type:'duos'})}>Gerir duos de pagamento</button></div>}
   <div className="ufPaymentMonth"><button aria-label="Mês anterior" onClick={()=>moveMonth(-1)}>‹</button><h2>{monthLabel(month)}</h2><button aria-label="Mês seguinte" onClick={()=>moveMonth(1)}>›</button></div>
   <div className="ufPaymentStats"><div><span>{manager?'Recebido neste mês':'Pago neste mês'}</span><strong>{money(sum(records.payments.filter(p=>p.status==='paid'&&p.paid_on.slice(0,7)===month)))}</strong><small>Pela data do pagamento</small></div><div><span>Por pagar · {monthLabel(month)}</span><strong>{money(sum(rows.filter(p=>p.status==='pending')))}</strong><small>Mensalidades e outros registos</small></div><div><span>Em atraso · total</span><strong>{money(sum(records.payments.filter(p=>paymentState(p)==='overdue')))}</strong><small>Todos os meses</small></div>{manager&&<div><span>Mensalidades ativas</span><strong>{records.billing.filter(b=>b.enabled).length}</strong><small>Alunos com valor definido</small></div>}</div>
   <div className="ufPaymentFilters" aria-label="Filtrar pagamentos">{Object.entries({all:'Todos',pending:'Pendentes',overdue:'Em atraso',paid:'Pagos',cancelled:'Anulados'}).map(([key,label])=><button key={key} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{label}</button>)}</div>
   {manager&&<input className="ufPaymentSearch" type="search" placeholder="Pesquisar aluno" aria-label="Pesquisar aluno" value={search} onChange={e=>setSearch(e.target.value)}/>}
   <PaymentList rows={rows} duos={records.duos} settlements={records.settlements} students={students} manager={manager} filter={filter} search={search} month={month} onEdit={row=>setDialog({type:'payment',row})} onJoint={item=>setDialog({type:'joint',duo:item.duo,members:item.members,settlement:item.settlement})}/>
   <div className="ufPaymentHistory"><h2>Recebimentos · últimos 6 meses</h2><div>{history.map(h=><figure key={h.key}><span>{money(h.value)}</span><i style={{height:Math.max(2,h.value/max*80)+'px'}}/><figcaption>{h.label}</figcaption></figure>)}</div></div>
  </>}
  {dialog?.type==='payment'&&<PaymentForm row={dialog.row} students={students} month={month} onClose={()=>setDialog(null)} onSaved={saved}/>}
  {dialog?.type==='billing'&&<BillingForm students={students.filter(s=>s.active)} billing={records.billing} onClose={()=>setDialog(null)} onSaved={saved}/>}
  {dialog?.type==='duos'&&<PaymentDuoManager duos={records.duos} students={students.filter(s=>s.active)} onClose={()=>setDialog(null)} onSaved={saved}/>}
  {dialog?.type==='joint'&&<SharedPaymentForm duo={dialog.duo} members={dialog.members} settlement={dialog.settlement} students={students} month={month} onClose={()=>setDialog(null)} onSaved={saved}/>}
  {dialog?.type==='generate'&&<PaymentDialog title="Gerar mensalidades" onClose={()=>!busy&&setDialog(null)}><p>Criar as mensalidades de {monthLabel(month)} para os alunos ativos com valor definido? Os registos existentes mantêm-se.</p>{error&&<p role="alert">{error}</p>}<footer><button disabled={busy} onClick={()=>setDialog(null)}>Cancelar</button><button className="primary" disabled={busy} onClick={generate}>{busy?'A gerar…':'Gerar'}</button></footer></PaymentDialog>}
 </section>;
}
