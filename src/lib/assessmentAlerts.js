const DAY_MS=24*60*60*1000;

function localDate(value){
 if(!value) return null;
 const raw=String(value);
 const date=new Date(raw.includes('T')?raw:`${raw}T12:00:00`);
 return Number.isNaN(date.getTime())?null:date;
}

function daysSince(value,now=new Date()){
 const date=localDate(value);
 if(!date) return null;
 const start=new Date(date.getFullYear(),date.getMonth(),date.getDate(),12);
 const end=new Date(now.getFullYear(),now.getMonth(),now.getDate(),12);
 return Math.max(0,Math.floor((end-start)/DAY_MS));
}

function latestCompletedAssessment(studentId,assessments=[]){
 return assessments
  .filter(item=>item.studentId===studentId&&item.date&&item.status!=='draft')
  .sort((a,b)=>String(a.date).localeCompare(String(b.date)))
  .at(-1)||null;
}

export const assessmentAlertMeta={
 initial:{label:'Sem avaliação inicial',shortLabel:'Sem avaliação inicial',tone:'red',rank:3},
 overdue:{label:'Avaliação em atraso',shortLabel:'Em atraso',tone:'red',rank:4},
 recommended:{label:'Avaliação recomendada',shortLabel:'Recomendada',tone:'orange',rank:2},
 soon:{label:'Avaliação em breve',shortLabel:'Em breve',tone:'yellow',rank:1},
};

export function buildAssessmentAlerts(students=[],assessments=[],now=new Date()){
 const alerts=[];
 for(const student of students||[]){
  if(!student?.active||student.status==='archived'||student.status==='inactive'||student.deletedAt) continue;
  const last=latestCompletedAssessment(student.id,assessments);
  if(!last){
   const createdReference=student.invitation?.invited_at||student.startDate||student.createdAt||null;
   const ageDays=daysSince(createdReference,now);
   if(ageDays!==null&&ageDays>=8){
    alerts.push({student,type:'initial',days:ageDays,lastAssessment:null,meta:assessmentAlertMeta.initial,detail:`Sem avaliação inicial · aluno registado há ${ageDays} dias`});
   }
   continue;
  }
  const elapsed=daysSince(last.date,now);
  if(elapsed===null||elapsed<45) continue;
  let type='soon';
  if(elapsed>=90) type='overdue';
  else if(elapsed>=60) type='recommended';
  const meta=assessmentAlertMeta[type];
  alerts.push({student,type,days:elapsed,lastAssessment:last,meta,detail:`Última avaliação há ${elapsed} dias`});
 }
 return alerts.sort((a,b)=>b.meta.rank-a.meta.rank||b.days-a.days||a.student.name.localeCompare(b.student.name));
}

export function assessmentAlertSummary(alerts=[]){
 const count=type=>alerts.filter(item=>item.type===type).length;
 return {total:alerts.length,initial:count('initial'),overdue:count('overdue'),recommended:count('recommended'),soon:count('soon')};
}

export function birthdaysInCurrentMonth(students=[],now=new Date()){
 const month=now.getMonth();
 const year=now.getFullYear();
 return (students||[])
  .filter(student=>student?.active&&!student.deletedAt&&student.status!=='archived'&&student.birth)
  .map(student=>{
   const birth=localDate(student.birth);
   if(!birth||birth.getMonth()!==month) return null;
   const day=birth.getDate();
   const turningAge=year-birth.getFullYear();
   const birthdayThisYear=new Date(year,month,day,12);
   return {student,day,turningAge,isToday:day===now.getDate(),hasPassed:birthdayThisYear<new Date(year,month,now.getDate(),12)};
  })
  .filter(Boolean)
  .sort((a,b)=>a.day-b.day||a.student.name.localeCompare(b.student.name));
}

export function currentMonthName(now=new Date()){
 return new Intl.DateTimeFormat('pt-PT',{month:'long'}).format(now);
}
