import React from 'react';
import {ArrowLeft,BellRing,BirthdayCake,ChevronRight,ClipboardList,Users} from 'lucide-react';
import {assessmentAlertSummary,currentMonthName} from '../lib/assessmentAlerts';

function StudentAvatar({student}){
 const initials=student?.name?.split(' ').map(x=>x[0]).slice(0,2).join('')||'AL';
 return <div className="attentionAvatar">{student?.thumbUrl||student?.photoUrl?<img src={student.thumbUrl||student.photoUrl} alt={student.name}/>:initials}</div>;
}

function SummaryRow({tone,label,count}){
 if(!count) return null;
 return <div className={`attentionSummaryRow ${tone}`}><span className="attentionDot"/><b>{count}</b><span>{label}</span></div>;
}

export function BackofficeStudentScopeCard({enabled,onChange,assignedCount,allCount}){
 return <div className="card pad backofficeStudentScopeCard">
  <div className="backofficeStudentScopeCopy">
   <span className="eyebrow">VISUALIZAÇÃO DE ALUNOS</span>
   <h2>Ver todos os alunos do estúdio</h2>
   <p>{enabled?`Ativo · as áreas de gestão mostram os ${allCount} alunos registados no estúdio.`:`Desativado · as áreas de gestão mostram apenas os ${assignedCount} alunos atribuídos a ti.`}</p>
   <small>Esta definição afeta Alunos, Avaliações, Planos, Nutrição e os alertas do Dashboard. Não altera quem pode criar ou editar dados de cada aluno.</small>
  </div>
  <button type="button" className={enabled?'toggle on':'toggle'} onClick={()=>onChange(enabled?'assigned':'all')} aria-pressed={enabled} title={enabled?'Mostrar apenas os meus alunos':'Mostrar todos os alunos do estúdio'}><span/></button>
 </div>;
}

export function DashboardAttentionWidgets({alerts,birthdays,onOpenAlerts}){
 const summary=assessmentAlertSummary(alerts);
 const month=currentMonthName();
 return <div className="dashboardAttentionGrid">
  <section className={`card pad assessmentAttentionCard ${summary.total?'hasAlerts':'allClear'}`}>
   <div className="attentionCardHead"><div><span className="eyebrow">ACOMPANHAMENTO</span><h2>Avaliações pendentes <strong>— {summary.total}</strong></h2></div><div className="attentionHeadIcon"><BellRing/></div></div>
   {summary.total?<div className="attentionSummaryList">
    <SummaryRow tone="red" count={summary.initial} label="Sem avaliação inicial"/>
    <SummaryRow tone="red" count={summary.overdue} label="Avaliação em atraso (+90 dias)"/>
    <SummaryRow tone="orange" count={summary.recommended} label="Avaliações recomendadas (+60 dias)"/>
    <SummaryRow tone="yellow" count={summary.soon} label="Avaliação em breve (+45 dias)"/>
   </div>:<div className="attentionEmpty">Nenhum aluno necessita de avaliação neste momento.</div>}
   <button className="attentionOpenButton" onClick={onOpenAlerts} disabled={!summary.total}>Ver avaliações pendentes <ChevronRight size={17}/></button>
  </section>

  <section className="card pad birthdayCard">
   <div className="attentionCardHead"><div><span className="eyebrow">ANIVERSÁRIOS</span><h2>{month.charAt(0).toUpperCase()+month.slice(1)}</h2></div><div className="attentionHeadIcon"><BirthdayCake/></div></div>
   {birthdays.length?<div className="birthdayList">{birthdays.map(item=><div className={`birthdayRow ${item.isToday?'today':''}`} key={item.student.id}><StudentAvatar student={item.student}/><div className="grow"><b>{item.student.name}</b><span>{item.isToday?'🎉 Faz anos hoje':`${String(item.day).padStart(2,'0')} · faz ${item.turningAge} anos`}</span></div>{item.isToday&&<span className="birthdayToday">HOJE</span>}</div>)}</div>:<div className="attentionEmpty">Nenhum aluno faz anos este mês.</div>}
  </section>
 </div>;
}

export function AssessmentAlertsPage({alerts,scopeLabel,onBack,onOpenStudent}){
 const summary=assessmentAlertSummary(alerts);
 return <div className="assessmentAlertsPage">
  <button className="backButton" onClick={onBack}><ArrowLeft size={18}/>Voltar ao Dashboard</button>
  <div className="heading"><div><span className="eyebrow">ACOMPANHAMENTO</span><h1>Avaliações pendentes</h1><p>{scopeLabel} · alunos ativos ordenados por urgência.</p></div><div className="pendingTotalBadge"><ClipboardList/><b>{summary.total}</b><span>pendentes</span></div></div>
  <div className="pendingSummaryCards">
   <div className="pendingMini red"><small>Sem avaliação inicial</small><b>{summary.initial}</b></div>
   <div className="pendingMini red"><small>Em atraso · +90 dias</small><b>{summary.overdue}</b></div>
   <div className="pendingMini orange"><small>Recomendadas · +60 dias</small><b>{summary.recommended}</b></div>
   <div className="pendingMini yellow"><small>Em breve · +45 dias</small><b>{summary.soon}</b></div>
  </div>
  {alerts.length?<div className="pendingAssessmentList">{alerts.map(item=><button key={item.student.id} className={`pendingAssessmentRow ${item.meta.tone}`} onClick={()=>onOpenStudent(item.student.id)}>
   <StudentAvatar student={item.student}/>
   <div className="grow"><div className="pendingStudentTitle"><b>{item.student.name}</b><span className={`pendingStatus ${item.meta.tone}`}>{item.meta.label}</span></div><p>{item.detail}</p><small>{item.student.primaryTrainer?.name?`Professor: ${item.student.primaryTrainer.name}`:'Professor por definir'}</small></div>
   <ChevronRight/>
  </button>)}</div>:<div className="card pad pendingAllClear"><BellRing/><h2>Tudo em dia</h2><p>Não existem avaliações pendentes neste âmbito de alunos.</p></div>}
 </div>;
}
