import {supabase} from './supabase';
import {agendaRpc,localDateTime,monday,addDays} from './agenda';
import {fetchPayments,paymentRpc} from './payments';

async function rows(table,owner,order){
 const result=[];
 for(let offset=0;;offset+=500){
  let query=supabase.from(table).select('*').eq('owner_id',owner).order(order);
  if(table==='pt_attendance')query=query.order('student_id');
  const {data,error}=await query.range(offset,offset+499);
  if(error)throw error;
  result.push(...data);
  if(data.length<500)return result;
 }
}
export async function loadTeacherDashboard(owner,day){
 const access=await paymentRpc('payment_access');
 if(access!=='manage')return {enabled:false,sessions:[],attendance:[],packs:[],payments:[]};
 const [sessions,attendance,snapshot,financial]=await Promise.all([
  rows('pt_sessions',owner,'id'),rows('pt_attendance',owner,'session_id'),
  agendaRpc('pt_snapshot',{p_week:monday(day)}),fetchPayments()
 ]);
 return {enabled:true,sessions,attendance,packs:snapshot.packs,payments:financial.payments.filter(p=>p.owner_id===owner)};
}
export const daysBetween=(from,to)=>Math.floor((Date.parse(to+'T12:00:00Z')-Date.parse(String(from).slice(0,10)+'T12:00:00Z'))/86400000);
export function dashboardSummary(model,day){
 const members=new Map();
 for(const row of model.attendance){if(!members.has(row.session_id))members.set(row.session_id,[]);members.get(row.session_id).push(row);}
 const sessions=model.sessions.filter(s=>(members.get(s.id)||[]).some(a=>a.status!=='cancelled')).sort((a,b)=>a.starts_at.localeCompare(b.starts_at));
 const date=s=>localDateTime(s.starts_at).slice(0,10),week=monday(day);
 const months=Array.from({length:6},(_,i)=>{const d=new Date(day.slice(0,7)+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()-5+i);const key=d.toISOString().slice(0,7);return {key,label:d.toLocaleDateString('pt-PT',{month:'short',timeZone:'UTC'}),value:model.payments.filter(p=>p.status==='paid'&&p.paid_on?.slice(0,7)===key).reduce((n,p)=>n+p.amount_cents,0)};});
 return {members,sessions,today:sessions.filter(s=>date(s)===day),week:sessions.filter(s=>date(s)>=week&&date(s)<addDays(week,7)).length,
 upcoming:sessions.filter(s=>date(s)>day&&date(s)<=addDays(day,7)),
 received:months[5].value,outstanding:model.payments.filter(p=>p.status==='pending'&&p.due_on?.slice(0,7)===day.slice(0,7)).reduce((n,p)=>n+p.amount_cents,0),months};
}
export function studentHighlights(students,assessments,model,day){
 const alerts=[],celebrations=[];
 const sessionById=new Map(model.sessions.map(s=>[s.id,s]));
 for(const s of students){
  const published=assessments.filter(a=>a.studentId===s.id&&['published','archived'].includes(a.status)&&a.date<=day).sort((a,b)=>a.date.localeCompare(b.date));
  const latest=published.at(-1);
  if(!['declined','not_applicable'].includes(s.assessmentPreference)){
   const elapsed=latest?daysBetween(latest.date,day):daysBetween(s.startDate,day);
   if(latest&&elapsed>=45)alerts.push({id:'assessment-'+s.id,student:s,tone:'amber',title:s.name+' · '+(elapsed>=90?'avaliação em atraso':elapsed>=60?'avaliação recomendada':'avaliação em breve'),detail:'Última avaliação há '+elapsed+' dias',page:'assessments'});
   else if(!latest&&elapsed>=8)alerts.push({id:'assessment-'+s.id,student:s,tone:'amber',title:s.name+' · sem avaliação inicial',detail:'Preparar avaliação física',page:'assessments'});
  }
  const last=model.attendance.filter(a=>a.student_id===s.id&&a.status==='present').map(a=>sessionById.get(a.session_id)).filter(a=>a&&localDateTime(a.starts_at).slice(0,10)<=day).sort((a,b)=>b.starts_at.localeCompare(a.starts_at))[0];
  const upcoming=model.attendance.some(a=>a.student_id===s.id&&a.status==='booked'&&sessionById.get(a.session_id)?.starts_at>new Date().toISOString());
  if(last&&!upcoming&&daysBetween(localDateTime(last.starts_at).slice(0,10),day)>=14)alerts.push({id:'inactive-'+s.id,student:s,tone:'muted',title:s.name+' · sem treino recente',detail:'Última presença há '+daysBetween(localDateTime(last.starts_at).slice(0,10),day)+' dias',page:'agenda'});
  const birth=s.birth||s.birthDate;
  if(birth&&/^\d{4}-\d{2}-\d{2}$/.test(birth)){
   let year=Number(day.slice(0,4));let birthday=year+birth.slice(4);
   if(birthday<day)birthday=(++year)+birth.slice(4);
   const until=daysBetween(birthday,day)*-1;
   if(until>=0&&until<=14)celebrations.push({id:'birthday-'+s.id,student:s,tone:'amber',title:s.name+' faz '+(year-Number(birth.slice(0,4)))+' anos '+(until===0?'hoje':until===1?'amanhã':'daqui a '+until+' dias'),detail:'Aniversário · '+birthday.split('-').reverse().join('/'),page:'students'});
  }
  if(published.length>=2&&daysBetween(latest.date,day)<=90){
   const first=published[0].modules?.bioimpedance||{},lastBio=latest.modules?.bioimpedance||{};
   for(const [key,unit] of [['weight_kg','kg'],['body_fat_pct','pontos percentuais de gordura corporal']]){
    const a=first[key],b=lastBio[key],delta=Number(a)-Number(b);
    if(a!=null&&b!=null&&Number(a)>0&&Number(b)>0&&delta>=1)celebrations.push({id:key+s.id,student:s,tone:'green',title:s.name+' · menos '+Number(delta.toFixed(1)).toLocaleString('pt-PT')+' '+unit,detail:'Evolução registada entre '+published[0].date.split('-').reverse().join('/')+' e '+latest.date.split('-').reverse().join('/'),page:'assessments'});
   }
  }
 }
 for(const p of model.payments.filter(p=>p.status==='pending'&&p.due_on<day)){
  const student=students.find(s=>s.id===p.student_id);if(student)alerts.unshift({id:p.id,student,tone:'red',title:student.name,amount:p.amount_cents,detail:'Venceu a '+p.due_on.split('-').reverse().join('/'),page:'payments'});
 }
 for(const pack of model.packs){
  const student=students.find(s=>s.id===pack.student_id),remaining=pack.total-pack.used;
  if(student&&remaining>0&&remaining<=2&&!model.payments.some(p=>p.id===pack.payment_id&&p.status==='cancelled'))alerts.push({id:pack.id,student,tone:'amber',title:student.name+' · '+(remaining===1?'resta 1 sessão':'restam '+remaining+' sessões'),detail:pack.title,page:'agenda'});
 }
 return {alerts,celebrations};
}

