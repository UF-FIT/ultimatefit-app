import {supabase} from './supabase';

export const paymentKinds={monthly:'Mensalidade',package:'Pacote de sessões',session:'Sessão avulsa',assessment:'Avaliação',other:'Outro'};
export const paymentMethods={mbway:'MB WAY',cash:'Dinheiro',transfer:'Transferência'};
export const money=value=>new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format((value||0)/100);
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const paymentState=(row,date=today())=>row.status==='pending'&&row.due_on<date?'overdue':row.status;
export const stateLabels={pending:'Pendente',paid:'Pago',overdue:'Em atraso',cancelled:'Anulado'};
export function cents(value){
 const normalized=String(value).trim().replace(',','.');
 if(!/^\d+(\.\d{1,2})?$/.test(normalized))throw new Error('Introduz um valor válido, com até duas casas decimais.');
 const result=Math.round(Number(normalized)*100);
 if(result<1||result>100000000)throw new Error('O valor deve ser superior a zero e até 1 000 000 €.');
 return result;
}
export async function paymentRpc(name,args){
 const {data,error}=await supabase.rpc(name,args);
 if(error)throw new Error(error.code==='23505'?'Já existe uma mensalidade para este aluno neste mês.':error.message||'Não foi possível guardar. Tenta novamente.');
 return data;
}
async function allRows(table){
 const rows=[];
 for(let from=0;;from+=500){
  const {data,error}=await supabase.from(table).select('*').order(table==='student_payments'?'id':'student_id').range(from,from+499);
  if(error)throw error;
  rows.push(...data);
  if(data.length<500)return rows;
 }
}
export async function fetchPayments(){
 const [payments,billing]=await Promise.all([allRows('student_payments'),allRows('student_billing')]);
 return {payments,billing};
}

export async function fetchPaymentDuos(){
 const [duos,settlements]=await Promise.all([
  supabase.from('payment_duos').select('*').order('created_at'),
  supabase.from('payment_duo_settlements').select('*').order('created_at')
 ]);
 if(duos.error)throw duos.error;
 if(settlements.error)throw settlements.error;
 return {duos:duos.data||[],settlements:settlements.data||[]};
}
