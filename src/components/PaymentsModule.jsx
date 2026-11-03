import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useApp} from '../contexts/AppContext';
import {cents,fetchPayments,money,paymentKinds,paymentMethods,paymentRpc,paymentState,stateLabels,today} from '../lib/payments';
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

export default function PaymentsModule(){
 const {data,currentUser}=useApp();
 const [access,setAccess]=useState(null),[records,setRecords]=useState({payments:[],billing:[]}),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [month,setMonth]=useState(today().slice(0,7)),[filter,setFilter]=useState('all'),[search,setSearch]=useState(''),[dialog,setDialog]=useState(null),[busy,setBusy]=useState(false);
 const manager=access==='manage';
 const students=useMemo(()=>data.students.filter(s=>manager?s.trainerIds?.includes(currentUser.id)&&!s.deletedAt:s.userId===currentUser.id).sort((a,b)=>a.name.localeCompare(b.name,'pt-PT')),[data.students,currentUser.id,manager]);
 async function reload(){setLoading(true);setError('');try{const mode=await paymentRpc('payment_access');setAccess(mode);if(mode!=='none')setRecords(await fetchPayments());}catch(err){setError('Não foi possível carregar os pagamentos. '+err.message);}finally{setLoading(false);}}
 useEffect(()=>{let active=true;setLoading(true);paymentRpc('payment_access').then(async mode=>{const rows=mode==='none'?{payments:[],billing:[]}:await fetchPayments();if(active){setAccess(mode);setRecords(rows);}}).catch(err=>{if(active)setError('Não foi possível carregar os pagamentos. '+err.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[currentUser.id]);
 const rows=records.payments.filter(p=>p.period.slice(0,7)===month);
 const sum=list=>list.reduce((total,p)=>total+p.amount_cents,0);
 const visible=rows.filter(p=>(filter==='all'||paymentState(p)===filter)&&`${students.find(s=>s.id===p.student_id)?.name||''} ${p.description}`.toLocaleLowerCase('pt-PT').includes(search.toLocaleLowerCase('pt-PT'))).sort((a,b)=>a.due_on.localeCompare(b.due_on)||a.id.localeCompare(b.id));
 const history=Array.from({length:6},(_,i)=>{const d=new Date(month+'-01T12:00:00');d.setMonth(d.getMonth()-5+i);const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;return {key,label:d.toLocaleDateString('pt-PT',{month:'short'}),value:sum(records.payments.filter(p=>p.status==='paid'&&p.paid_on?.slice(0,7)===key))};});
 const max=Math.max(...history.map(h=>h.value),1);
 function saved(message){setDialog(null);setNotice(message);reload();}
 async function generate(){if(busy)return;setBusy(true);setError('');try{const count=await paymentRpc('payment_generate_month',{p_month:month+'-01'});setNotice(count?`${count} mensalidade(s) criada(s).`:'Nenhuma mensalidade nova. Verifica as definições dos alunos; os registos existentes não são duplicados.');setDialog(null);await reload();}catch(err){setError(err.message);}finally{setBusy(false);}}
 function moveMonth(delta){const d=new Date(month+'-01T12:00:00');d.setMonth(d.getMonth()+delta);setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);}
 if(access==='none')return <section className="ufPayments"><h1>Pagamentos</h1><p>Este módulo ainda não está disponível para esta conta.</p></section>;
 return <section className="ufPayments">
  <div className="ufPaymentHeading"><div><h1>{manager?'Pagamentos':'Os meus pagamentos'}</h1><p>{manager?'Mensalidades e recebimentos dos teus alunos.':'Consulta os registos confirmados pelo teu professor.'}</p></div>{manager&&<button className="primary" onClick={()=>setDialog({type:'payment'})} disabled={loading}>+ Novo pagamento</button>}</div>
  {error&&<div role="alert" className="ufPaymentError">{error}<button onClick={reload}>Tentar novamente</button></div>}
  {notice&&<p className="ufPaymentNotice" role="status">{notice}</p>}
  {loading?<p role="status">A carregar pagamentos…</p>:<>
   {manager&&<div className="ufPaymentActions"><button onClick={()=>setDialog({type:'billing'})}>Definir mensalidades</button><button onClick={()=>setDialog({type:'generate'})}>Gerar mensalidades do mês</button></div>}
   <div className="ufPaymentMonth"><button aria-label="Mês anterior" onClick={()=>moveMonth(-1)}>‹</button><h2>{monthLabel(month)}</h2><button aria-label="Mês seguinte" onClick={()=>moveMonth(1)}>›</button></div>
   <div className="ufPaymentStats"><div><span>{manager?'Recebido neste mês':'Pago neste mês'}</span><strong>{money(sum(records.payments.filter(p=>p.status==='paid'&&p.paid_on.slice(0,7)===month)))}</strong><small>Pela data do pagamento</small></div><div><span>Por pagar · {monthLabel(month)}</span><strong>{money(sum(rows.filter(p=>p.status==='pending')))}</strong><small>Mensalidades e outros registos</small></div><div><span>Em atraso · total</span><strong>{money(sum(records.payments.filter(p=>paymentState(p)==='overdue')))}</strong><small>Todos os meses</small></div>{manager&&<div><span>Mensalidades ativas</span><strong>{records.billing.filter(b=>b.enabled).length}</strong><small>Alunos com valor definido</small></div>}</div>
   <div className="ufPaymentFilters" aria-label="Filtrar pagamentos">{Object.entries({all:'Todos',pending:'Pendentes',overdue:'Em atraso',paid:'Pagos',cancelled:'Anulados'}).map(([key,label])=><button key={key} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{label}</button>)}</div>
   {manager&&<input className="ufPaymentSearch" type="search" placeholder="Pesquisar aluno" aria-label="Pesquisar aluno" value={search} onChange={e=>setSearch(e.target.value)}/>}
   <div className="ufPaymentList">{visible.length?visible.map(row=>{const student=students.find(s=>s.id===row.student_id),state=paymentState(row);return <article key={row.id}><div className="ufPaymentRow"><div><h3>{manager?(student?.name||'Aluno'):paymentKinds[row.kind]}</h3><p>{manager&&`${paymentKinds[row.kind]} · `}{monthLabel(row.period.slice(0,7))}</p>{row.description&&<p>{row.description}</p>}<small>{row.status==='paid'?`Pago em ${dateLabel(row.paid_on)} · ${paymentMethods[row.method]}`:`Data limite: ${dateLabel(row.due_on)}`}</small>{row.receipt_reference&&<small>Recibo: {row.receipt_reference}</small>}</div><strong>{money(row.amount_cents)}</strong></div><div className="ufPaymentRow"><span className={'ufPaymentBadge '+state}>{stateLabels[state]}</span>{manager&&row.status!=='cancelled'&&<button onClick={()=>setDialog({type:'payment',row})}>{row.status==='paid'?'Editar':'Registar pagamento'}</button>}</div></article>}):<p className="ufPaymentEmpty">Não existem pagamentos para esta seleção.{manager&&' Define uma mensalidade ou adiciona um pagamento.'}</p>}</div>
   <div className="ufPaymentHistory"><h2>Recebimentos · últimos 6 meses</h2><div>{history.map(h=><figure key={h.key}><span>{money(h.value)}</span><i style={{height:`${Math.max(2,h.value/max*80)}px`}}/><figcaption>{h.label}</figcaption></figure>)}</div></div>
  </>}
  {dialog?.type==='payment'&&<PaymentForm row={dialog.row} students={students} month={month} onClose={()=>setDialog(null)} onSaved={saved}/>}
  {dialog?.type==='billing'&&<BillingForm students={students.filter(s=>s.active)} billing={records.billing} onClose={()=>setDialog(null)} onSaved={saved}/>}
  {dialog?.type==='generate'&&<PaymentDialog title="Gerar mensalidades" onClose={()=>!busy&&setDialog(null)}><p>Criar as mensalidades de {monthLabel(month)} para os alunos ativos com valor definido? Os registos existentes mantêm-se.</p>{error&&<p role="alert">{error}</p>}<footer><button disabled={busy} onClick={()=>setDialog(null)}>Cancelar</button><button className="primary" disabled={busy} onClick={generate}>{busy?'A gerar…':'Gerar'}</button></footer></PaymentDialog>}
 </section>;
}
