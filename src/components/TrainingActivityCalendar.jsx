import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Dumbbell, Flame, Trophy } from 'lucide-react';

const weekdayLabels=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];

function isoLocal(date){
  const y=date.getFullYear();
  const m=String(date.getMonth()+1).padStart(2,'0');
  const d=String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}
function startOfWeek(date){
  const result=new Date(date.getFullYear(),date.getMonth(),date.getDate());
  const day=(result.getDay()+6)%7;
  result.setDate(result.getDate()-day);
  return result;
}
function endOfWeek(date){const result=startOfWeek(date);result.setDate(result.getDate()+6);return result;}
function emojiForWeekly(count){
  return ['😴','👍','🙂','💪','🔥','🚀','🏆','👑'][Math.max(0,Math.min(7,count))];
}
function monthLabel(date){return new Intl.DateTimeFormat('pt-PT',{month:'long',year:'numeric'}).format(date).replace(/^./,c=>c.toUpperCase());}

export default function TrainingActivityCalendar({ completions = [], compact = false }){
  const now=new Date();
  const [month,setMonth]=useState(new Date(now.getFullYear(),now.getMonth(),1));
  const days=useMemo(()=>new Set(completions.map(item=>item.completedOn).filter(Boolean)),[completions]);
  const todayIso=isoLocal(now);

  const weekStart=startOfWeek(now);
  const weekEnd=endOfWeek(now);
  const weeklyCount=Array.from(days).filter(value=>value>=isoLocal(weekStart)&&value<=isoLocal(weekEnd)).length;
  const monthPrefix=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-`;
  const monthlyCount=Array.from(days).filter(value=>value.startsWith(monthPrefix)).length;
  const globalCount=days.size;

  const first=new Date(month.getFullYear(),month.getMonth(),1);
  const last=new Date(month.getFullYear(),month.getMonth()+1,0);
  const leading=(first.getDay()+6)%7;
  const cells=[];
  for(let i=0;i<leading;i++) cells.push({empty:true,key:`pre-${i}`});
  for(let d=1;d<=last.getDate();d++){
    const date=new Date(month.getFullYear(),month.getMonth(),d);
    const iso=isoLocal(date);
    cells.push({key:iso,day:d,iso,completed:days.has(iso),today:iso===todayIso});
  }
  while(cells.length%7) cells.push({empty:true,key:`post-${cells.length}`});

  function move(delta){setMonth(current=>new Date(current.getFullYear(),current.getMonth()+delta,1));}

  return <section className={`card trainingActivityCalendar ${compact?'compact':''}`}>
    <div className="trainingCalendarHeader">
      <div><span className="eyebrow">CONSISTÊNCIA</span><h2>Calendário de treinos</h2><p>Os dias assinalados correspondem a treinos concluídos ou registados pelo teu professor.</p></div>
      <CalendarDays/>
    </div>
    <div className="trainingActivityStats">
      <div className="weekly"><small>Treinos feitos esta semana</small><strong>{weeklyCount}/7 <span>{emojiForWeekly(weeklyCount)}</span></strong></div>
      <div><small>Este mês</small><strong>{monthlyCount}</strong><Dumbbell/></div>
      <div><small>Total</small><strong>{globalCount}</strong><Trophy/></div>
    </div>
    <div className="trainingCalendarMonthBar"><button type="button" onClick={()=>move(-1)} aria-label="Mês anterior"><ChevronLeft/></button><b>{monthLabel(month)}</b><button type="button" onClick={()=>move(1)} aria-label="Mês seguinte"><ChevronRight/></button></div>
    <div className="trainingCalendarGrid weekdayRow">{weekdayLabels.map(label=><span key={label}>{label}</span>)}</div>
    <div className="trainingCalendarGrid daysGrid">{cells.map(cell=>cell.empty?<span className="calendarEmpty" key={cell.key}/>:<span className={`calendarDay ${cell.completed?'completed':''} ${cell.today?'today':''}`} key={cell.key}><b>{cell.day}</b>{cell.completed&&<i title="Treino concluído"><Flame size={12}/></i>}</span>)}</div>
  </section>;
}
