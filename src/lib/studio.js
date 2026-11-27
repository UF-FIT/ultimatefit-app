import {supabase} from './supabase';
const monthPattern=/^\d{4}-\d{2}$/;
const periodDate=month=>{if(!monthPattern.test(month))throw new Error('Mês inválido.');return month+'-01';};
const nextMonth=month=>{const d=new Date(month+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);return d.toISOString().slice(0,10);};
const firstOfYear=year=>String(year)+'-01-01';
const nextYear=year=>String(Number(year)+1)+'-01-01';
const sum=rows=>(rows||[]).reduce((total,row)=>total+(Number(row.amount_cents)||0),0);
const normalizedExpensePayer=value=>value==='unknown'?null:(value||'studio');

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
async function loadProfitSettings(owner,month){
 const start=periodDate(month);
 const {data,error}=await supabase.from('studio_profit_settings').select('*').eq('owner_id',owner).lte('valid_from',start).order('valid_from',{ascending:false}).limit(1).maybeSingle();
 if(error)throw new Error(error.message||'Não foi possível carregar a divisão do resultado.');
 return data||{owner_id:owner,valid_from:start,partner_a_name:'Rui Marques',partner_b_name:'Manuel Gonzalves',partner_a_percent:50};
}
async function loadWithdrawals(owner,from,to){
 return readAll(()=>supabase.from('studio_owner_withdrawals').select('*').eq('owner_id',owner).gte('withdrawn_on',from).lt('withdrawn_on',to).order('withdrawn_on',{ascending:false}));
}
async function paidTotals(owner,month){
 const start=periodDate(month),end=nextMonth(month);
 const [pilates,paidIncome,paidExpenses,pendingCharges,pendingIncome,pendingExpenses]=await Promise.all([
  readAll(()=>supabase.from('studio_group_charges').select('amount_cents,paid_on').eq('owner_id',owner).eq('status','paid').gte('paid_on',start).lt('paid_on',end)),
  readAll(()=>supabase.from('studio_financial_records').select('amount_cents,paid_on').eq('owner_id',owner).eq('direction','income').eq('status','paid').gte('paid_on',start).lt('paid_on',end)),
  readAll(()=>supabase.from('studio_financial_records').select('amount_cents,period').eq('owner_id',owner).eq('direction','expense').eq('status','paid').eq('period',start)),
  readAll(()=>supabase.from('studio_group_charges').select('amount_cents,due_on').eq('owner_id',owner).eq('status','pending').eq('period',start)),
  readAll(()=>supabase.from('studio_financial_records').select('amount_cents,due_on').eq('owner_id',owner).eq('direction','income').eq('status','pending').eq('period',start)),
  readAll(()=>supabase.from('studio_financial_records').select('amount_cents,due_on').eq('owner_id',owner).eq('direction','expense').eq('status','pending').eq('period',start)),
 ]);
 return {
  pilatesReceived:sum(pilates),
  otherIncomeReceived:sum(paidIncome),
  expensesPaid:sum(paidExpenses),
  pendingIncome:sum(pendingCharges)+sum(pendingIncome),
  pendingExpenses:sum(pendingExpenses),
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
 const [members,charges,records,recurringItems,summary,personalRows,profitSettings,withdrawals]=await Promise.all([
  readAll(()=>supabase.from('studio_group_members').select('*').eq('owner_id',owner).order('first_name').order('last_name')),
  readAll(()=>supabase.from('studio_group_charges').select('*').eq('owner_id',owner).eq('period',period).order('due_on')),
  readAll(()=>supabase.from('studio_financial_records').select('*').eq('owner_id',owner).eq('period',period).order('due_on')),
  readAll(()=>supabase.from('studio_recurring_items').select('*').eq('owner_id',owner).order('active',{ascending:false}).order('description')),
  paidTotals(owner,month),personalTrainingTotals(period,nextMonth(month)),loadProfitSettings(owner,month),loadWithdrawals(owner,period,nextMonth(month)),
 ]);
 const personalReceived=sum(personalRows);
 return {members,charges,records,recurringItems,summary,personalReceived,profitSettings,withdrawals};
}
export async function loadStudioYearSummary(profileId,year){
 const current=new Date();
 const lastMonth=Number(year)===current.getFullYear()?current.getMonth()+1:(Number(year)<current.getFullYear()?12:0);
 for(let month=1;month<=lastMonth;month++){
  await generateMonth(String(year)+'-'+String(month).padStart(2,'0'));
 }
 const start=firstOfYear(year),end=nextYear(year);
 const owner=await studioWorkspaceId();
 const [charges,paidIncomeRecords,expenseRecords,personalRows,settings,withdrawals]=await Promise.all([
  readAll(()=>supabase.from('studio_group_charges').select('amount_cents,paid_on,status').eq('owner_id',owner).eq('status','paid').gte('paid_on',start).lt('paid_on',end)),
  readAll(()=>supabase.from('studio_financial_records').select('amount_cents,paid_on').eq('owner_id',owner).eq('direction','income').eq('status','paid').gte('paid_on',start).lt('paid_on',end)),
  readAll(()=>supabase.from('studio_financial_records').select('amount_cents,period,status').eq('owner_id',owner).eq('direction','expense').in('status',['paid','pending']).gte('period',start).lt('period',end)),
  personalTrainingTotals(start,end),
  readAll(()=>supabase.from('studio_profit_settings').select('*').eq('owner_id',owner).lt('valid_from',end).order('valid_from')),
  readAll(()=>supabase.from('studio_owner_withdrawals').select('*').eq('owner_id',owner).gte('withdrawn_on',start).lt('withdrawn_on',end)),
 ]);
 const personalByMonth=new Map(personalRows.map(row=>[String(row.month).slice(0,7),Number(row.amount_cents)||0]));
 const monthSettings=key=>{
  const matches=settings.filter(item=>String(item.valid_from).slice(0,7)<=key);
  return matches.length?matches[matches.length-1]:{partner_a_name:'Sócio 1',partner_b_name:'Sócio 2',partner_a_percent:50};
 };
 const months=Array.from({length:12},(_,index)=>{
  const key=String(year)+'-'+String(index+1).padStart(2,'0');
  const inMonth=row=>row.paid_on?.slice(0,7)===key;
  const inPeriod=row=>row.period?.slice(0,7)===key;
  const pt=personalByMonth.get(key)||0;
  const pilates=sum(charges.filter(inMonth));
  const other=sum(paidIncomeRecords.filter(inMonth));
  const expensesPaid=sum(expenseRecords.filter(row=>row.status==='paid'&&inPeriod(row)));
  const pendingExpenses=sum(expenseRecords.filter(row=>row.status==='pending'&&inPeriod(row)));
  const expenses=expensesPaid+pendingExpenses;
  const studioResult=pilates+other-expenses;
  const setting=monthSettings(key);
  const partnerAShare=Math.round(studioResult*Number(setting.partner_a_percent||0)/100);
  const partnerBShare=studioResult-partnerAShare;
  const monthWithdrawals=withdrawals.filter(row=>row.withdrawn_on?.slice(0,7)===key);
  const partnerAWithdrawn=sum(monthWithdrawals.filter(row=>row.partner_key==='partner_a'));
  const partnerBWithdrawn=sum(monthWithdrawals.filter(row=>row.partner_key==='partner_b'));
  return {key,label:new Date(Number(year),index,1).toLocaleDateString('pt-PT',{month:'short'}),personal:pt,pilates,otherIncome:other,expensesPaid,pendingExpenses,expenses,studioResult,partnerAName:setting.partner_a_name,partnerBName:setting.partner_b_name,partnerAPercent:Number(setting.partner_a_percent||0),partnerBPercent:100-Number(setting.partner_a_percent||0),partnerAShare,partnerBShare,partnerAWithdrawn,partnerBWithdrawn,partnerARemaining:partnerAShare-partnerAWithdrawn,partnerBRemaining:partnerBShare-partnerBWithdrawn};
 });
 const totals=months.reduce((result,row)=>({
  personal:result.personal+row.personal,pilates:result.pilates+row.pilates,otherIncome:result.otherIncome+row.otherIncome,expensesPaid:result.expensesPaid+row.expensesPaid,pendingExpenses:result.pendingExpenses+row.pendingExpenses,expenses:result.expenses+row.expenses,
  studioResult:result.studioResult+row.studioResult,partnerAShare:result.partnerAShare+row.partnerAShare,partnerBShare:result.partnerBShare+row.partnerBShare,
  partnerAWithdrawn:result.partnerAWithdrawn+row.partnerAWithdrawn,partnerBWithdrawn:result.partnerBWithdrawn+row.partnerBWithdrawn,
  partnerARemaining:result.partnerARemaining+row.partnerARemaining,partnerBRemaining:result.partnerBRemaining+row.partnerBRemaining,
 }),{personal:0,pilates:0,otherIncome:0,expensesPaid:0,pendingExpenses:0,expenses:0,studioResult:0,partnerAShare:0,partnerBShare:0,partnerAWithdrawn:0,partnerBWithdrawn:0,partnerARemaining:0,partnerBRemaining:0});
 return {year:Number(year),months,totals,profitSettings:monthSettings(String(year)+'-'+String(lastMonth||1).padStart(2,'0'))};
}
export async function saveStudioProfitSettings(_profileId,row){
 const owner=await studioWorkspaceId();
 const valid_from=periodDate(row.valid_from.slice(0,7));
 return run(supabase.from('studio_profit_settings').upsert({
  owner_id:owner,valid_from,partner_a_name:row.partner_a_name.trim(),partner_b_name:row.partner_b_name.trim(),
  partner_a_percent:Number(row.partner_a_percent),updated_at:new Date().toISOString(),
 },{onConflict:'owner_id,valid_from'}).select('*').single());
}
export async function saveStudioWithdrawal(_profileId,row){
 const owner=await studioWorkspaceId();
 const values={
  partner_key:row.partner_key,amount_cents:row.amount_cents,withdrawn_on:row.withdrawn_on,
  description:(row.description||'').trim(),updated_at:new Date().toISOString(),
 };
 if(row.id)return run(supabase.from('studio_owner_withdrawals').update(values).eq('owner_id',owner).eq('id',row.id).select('*').single());
 return run(supabase.from('studio_owner_withdrawals').insert({...values,owner_id:owner,request_id:row.request_id}).select('*').single());
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
  method:row.status==='paid'?(row.method||'other'):null,
  expense_paid_by:row.direction==='expense'?normalizedExpensePayer(row.expense_paid_by):'studio',updated_at:new Date().toISOString(),
 };
 if(row.id)return run(supabase.from('studio_financial_records').update(values).eq('owner_id',owner).eq('id',row.id).select('*').single());
 return run(supabase.from('studio_financial_records').insert({...values,owner_id:owner,request_id:row.request_id}).select('*').single());
}
export async function saveStudioRecurringItem(_profileId,row){
 const owner=await studioWorkspaceId();
 const values={
  direction:row.direction,category:row.category,description:row.description.trim(),amount_cents:row.amount_cents,
  due_day:row.due_day,starts_on:row.starts_on,active:row.active,ends_on:row.active?null:row.ends_on,
  expense_paid_by:row.direction==='expense'?(row.expense_paid_by||'studio'):'studio',updated_at:new Date().toISOString(),
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
