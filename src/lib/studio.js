import {supabase} from './supabase';
const monthPattern=/^\d{4}-\d{2}$/;
const periodDate=month=>{if(!monthPattern.test(month))throw new Error('Mês inválido.');return month+'-01';};
const nextMonth=month=>{const d=new Date(month+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);return d.toISOString().slice(0,10);};
const firstOfYear=year=>String(year)+'-01-01';
const nextYear=year=>String(Number(year)+1)+'-01-01';
const sum=rows=>(rows||[]).reduce((total,row)=>total+(Number(row.amount_cents)||0),0);

async function readAll(makeQuery){
 const result=[];
 for(let offset=0;;offset+=500){
  const {data,error}=await makeQuery().range(offset,offset+499);
  if(error)throw error;
  result.push(...(data||[]));
  if(!data||data.length<500)return result;
 }
}
async function run(query){
 const {data,error}=await query;
 if(error)throw new Error(error.message||'Não foi possível guardar os dados do estúdio.');
 return data;
}
async function generateMonth(month){
 return run(supabase.rpc('studio_generate_month',{p_month:periodDate(month)}));
}
async function studioWorkspaceId(){
 return run(supabase.rpc('studio_workspace_id'));
}
async function personalTrainingTotals(from,to){
 const rows=await run(supabase.rpc('studio_personal_training_summary',{p_from:from,p_to:to}));
 return rows||[];
}
async function paidTotals(owner,month){
 const start=periodDate(month),end=nextMonth(month);
 const [pilates,finance,pendingCharges,pendingFinance]=await Promise.all([
  readAll(()=>supabase.from('studio_group_charges').select('amount_cents,paid_on').eq('owner_id',owner).eq('status','paid').gte('paid_on',start).lt('paid_on',end)),
  readAll(()=>supabase.from('studio_financial_records').select('amount_cents,paid_on,direction').eq('owner_id',owner).eq('status','paid').gte('paid_on',start).lt('paid_on',end)),
  readAll(()=>supabase.from('studio_group_charges').select('amount_cents,due_on').eq('owner_id',owner).eq('status','pending').eq('period',start)),
  readAll(()=>supabase.from('studio_financial_records').select('amount_cents,due_on,direction').eq('owner_id',owner).eq('status','pending').eq('period',start)),
 ]);
 return {
  pilatesReceived:sum(pilates),
  otherIncomeReceived:sum(finance.filter(row=>row.direction==='income')),
  expensesPaid:sum(finance.filter(row=>row.direction==='expense')),
  pendingIncome:sum(pendingCharges)+sum(pendingFinance.filter(row=>row.direction==='income')),
  pendingExpenses:sum(pendingFinance.filter(row=>row.direction==='expense')),
 };
}
export async function loadStudioDashboardSummary(_profileId,month){
 await generateMonth(month);
 const [owner,personalRows]=await Promise.all([studioWorkspaceId(),personalTrainingTotals(periodDate(month),nextMonth(month))]);
 return {...await paidTotals(owner,month),personalReceived:sum(personalRows)};
}
export async function loadStudioMonth(profileId,month){
 const period=periodDate(month);
 await generateMonth(month);
 const owner=await studioWorkspaceId();
 const [members,charges,records,recurringItems,summary,personalRows]=await Promise.all([
  readAll(()=>supabase.from('studio_group_members').select('*').eq('owner_id',owner).order('first_name').order('last_name')),
  readAll(()=>supabase.from('studio_group_charges').select('*').eq('owner_id',owner).eq('period',period).order('due_on')),
  readAll(()=>supabase.from('studio_financial_records').select('*').eq('owner_id',owner).eq('period',period).order('due_on')),
  readAll(()=>supabase.from('studio_recurring_items').select('*').eq('owner_id',owner).order('active',{ascending:false}).order('description')),
  paidTotals(owner,month),personalTrainingTotals(period,nextMonth(month)),
 ]);
 const personalReceived=sum(personalRows);
 return {members,charges,records,recurringItems,summary,personalReceived};
}
export async function loadStudioYearSummary(profileId,year){
 const current=new Date();
 const lastMonth=Number(year)===current.getFullYear()?current.getMonth()+1:(Number(year)<current.getFullYear()?12:0);
 for(let month=1;month<=lastMonth;month++){
  await generateMonth(String(year)+'-'+String(month).padStart(2,'0'));
 }
 const start=firstOfYear(year),end=nextYear(year);
 const owner=await studioWorkspaceId();
 const [charges,records,personalRows]=await Promise.all([
  readAll(()=>supabase.from('studio_group_charges').select('amount_cents,paid_on,status').eq('owner_id',owner).eq('status','paid').gte('paid_on',start).lt('paid_on',end)),
  readAll(()=>supabase.from('studio_financial_records').select('amount_cents,paid_on,direction,status').eq('owner_id',owner).eq('status','paid').gte('paid_on',start).lt('paid_on',end)),
  personalTrainingTotals(start,end),
 ]);
 const personalByMonth=new Map(personalRows.map(row=>[String(row.month).slice(0,7),Number(row.amount_cents)||0]));
 const months=Array.from({length:12},(_,index)=>{
  const key=String(year)+'-'+String(index+1).padStart(2,'0');
  const inMonth=row=>row.paid_on?.slice(0,7)===key;
  const pt=personalByMonth.get(key)||0;
  const pilates=sum(charges.filter(inMonth));
  const other=sum(records.filter(row=>row.direction==='income'&&inMonth(row)));
  const expenses=sum(records.filter(row=>row.direction==='expense'&&inMonth(row)));
  return {key,label:new Date(Number(year),index,1).toLocaleDateString('pt-PT',{month:'short'}),personal:pt,pilates,otherIncome:other,expenses,studioResult:pilates+other-expenses,total:pt+pilates+other-expenses};
 });
 return {year:Number(year),months,totals:months.reduce((result,row)=>({personal:result.personal+row.personal,pilates:result.pilates+row.pilates,otherIncome:result.otherIncome+row.otherIncome,expenses:result.expenses+row.expenses,studioResult:result.studioResult+row.studioResult,total:result.total+row.total}),{personal:0,pilates:0,otherIncome:0,expenses:0,studioResult:0,total:0})};
}
export async function saveStudioMember(_profileId,row){
 const owner=await studioWorkspaceId();
 const values={
  first_name:row.first_name.trim(),last_name:row.last_name.trim(),whatsapp_phone:row.whatsapp_phone.trim(),
  monthly_fee_cents:row.monthly_fee_cents,due_day:row.due_day,starts_on:row.starts_on,
  active:row.active,ends_on:row.active?null:row.ends_on,
 };
 if(row.id)return run(supabase.from('studio_group_members').update({...values,updated_at:new Date().toISOString()}).eq('owner_id',owner).eq('id',row.id).select('*').single());
 return run(supabase.from('studio_group_members').insert({...values,owner_id:owner,request_id:row.request_id}).select('*').single());
}
export async function setStudioChargePaid(_profileId,id,paid){
 const owner=await studioWorkspaceId();
 return run(supabase.from('studio_group_charges').update({
  status:paid?'paid':'pending',paid_on:paid?rowToday():null,method:null,updated_at:new Date().toISOString(),
 }).eq('owner_id',owner).eq('id',id).select('*').single());
}
export async function saveStudioFinancialRecord(_profileId,row){
 const owner=await studioWorkspaceId();
 const values={
  direction:row.direction,category:row.category,description:row.description.trim(),amount_cents:row.amount_cents,
  period:row.period,due_on:row.due_on,status:row.status,paid_on:row.status==='paid'?row.paid_on:null,
  method:row.status==='paid'?(row.method||'other'):null,updated_at:new Date().toISOString(),
 };
 if(row.id)return run(supabase.from('studio_financial_records').update(values).eq('owner_id',owner).eq('id',row.id).select('*').single());
 return run(supabase.from('studio_financial_records').insert({...values,owner_id:owner,request_id:row.request_id}).select('*').single());
}
export async function saveStudioRecurringItem(_profileId,row){
 const owner=await studioWorkspaceId();
 const values={
  direction:row.direction,category:row.category,description:row.description.trim(),amount_cents:row.amount_cents,
  due_day:row.due_day,starts_on:row.starts_on,active:row.active,ends_on:row.active?null:row.ends_on,
  updated_at:new Date().toISOString(),
 };
 if(row.id)return run(supabase.from('studio_recurring_items').update(values).eq('owner_id',owner).eq('id',row.id).select('*').single());
 return run(supabase.from('studio_recurring_items').insert({...values,owner_id:owner,request_id:row.request_id}).select('*').single());
}
export async function setStudioRecurringActive(_profileId,id,active){
 const owner=await studioWorkspaceId();
 const values={active,ends_on:active?null:rowToday(),updated_at:new Date().toISOString()};
 if(active)values.starts_on=rowToday();
 return run(supabase.from('studio_recurring_items').update(values).eq('owner_id',owner).eq('id',id).select('*').single());
}
export async function setStudioFinancialRecordPaid(_profileId,id,paid){
 const owner=await studioWorkspaceId();
 return run(supabase.from('studio_financial_records').update({
  status:paid?'paid':'pending',paid_on:paid?rowToday():null,method:null,updated_at:new Date().toISOString(),
 }).eq('owner_id',owner).eq('id',id).select('*').single());
}
function rowToday(){
 return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
