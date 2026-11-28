import React,{useEffect,useMemo,useRef,useState} from 'react';
import {AlertCircle,Check,ChevronLeft,ChevronRight,Edit3,MessageCircle,Pause,Play,Plus,Repeat,Users,Wallet,X} from 'lucide-react';
import {useApp} from '../contexts/AppContext';
import {cents,money,today} from '../lib/payments';
import {loadStudioMonth,loadStudioHistory,loadStudioYearSummary,saveStudioMember,saveStudioFinancialRecord,saveStudioRecurringItem,saveStudioProfitSettings,saveStudioWithdrawal,setStudioChargePaid,setStudioFinancialRecordPaid,setStudioRecurringActive} from '../lib/studio';
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
const sumCents=rows=>(rows||[]).reduce((total,row)=>total+(Number(row.amount_cents)||0),0);
const normalizeName=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const expensePayerLabel=(record,settings)=>record.expense_paid_by==='partner_a'?settings.partner_a_name:record.expense_paid_by==='partner_b'?settings.partner_b_name:record.expense_paid_by==='shared'?'Ambos os sócios':record.expense_paid_by==='studio'?'Conta do estúdio':'Não indicado';

function Card({children,className=''}){return <section className={'studioCard '+className}>{children}</section>;}
function Status({status,direction}){const paid=status==='paid',cancelled=status==='cancelled';return <span className={'studioStatus '+(paid?'paid':cancelled?'cancelled':'pending')}>{paid?'Pago':cancelled?'Anulado':direction==='income'?'Por receber':'Por pagar'}</span>;}
function Notice({type='info',children}){return <div className={'studioNotice '+type}>{type==='error'?<AlertCircle size={17}/>:<Check size={17}/>}<span>{children}</span></div>;}

export default function StudioManagement(){
 const {currentUser}=useApp();
 const [month,setMonth]=useState(localMonth());
 const [year,setYear]=useState(new Date().getFullYear());
 const [view,setView]=useState('month');
 const [tab,setTab]=useState('overview');
 const [trendRange,setTrendRange]=useState(6);
 const [payload,setPayload]=useState(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [dialog,setDialog]=useState(null);
 const [revision,setRevision]=useState(0);
 const [busyId,setBusyId]=useState('');
 const profileId=currentUser.id;
 const canManageStudio=currentUser.role==='admin'||currentUser.systemRole==='owner';
 const isReadOnlyPreview=typeof window!=='undefined'&&window.location.hostname.toLowerCase().endsWith('.vercel.app');
 const members=payload?.members||[];
 const charges=payload?.charges||[];
 const records=payload?.records||[];
 const recurringItems=payload?.recurringItems||[];
 const chargeByMember=useMemo(()=>new Map(charges.map(row=>[row.member_id,row])),[charges]);

 async function reload(){
  setLoading(true);setError('');
  try{
   if(view==='month'){
    const next=await loadStudioMonth(profileId,month);
    next.history=await loadStudioHistory(profileId,month,12);
    setPayload(next);
   }else setPayload(await loadStudioYearSummary(profileId,year));
  }catch(err){setPayload(null);setError(err.message||'Não foi possível carregar a gestão do estúdio.');}
  finally{setLoading(false);}
 }
 useEffect(()=>{if(canManageStudio)reload();else setLoading(false);},[profileId,canManageStudio,view,month,year,revision]);
 function saved(message){setDialog(null);setNotice(message);setRevision(n=>n+1);}
 function shiftMonth(delta){const date=new Date(month+'-01T12:00:00');date.setMonth(date.getMonth()+delta);setMonth(date.toISOString().slice(0,7));}
 async function setChargePaid(row,paid){
  setBusyId(row.id);setError('');
  try{await setStudioChargePaid(profileId,row.id,paid);setNotice(paid?'Mensalidade do Pilates marcada como paga.':'Estado do pagamento atualizado.');setRevision(n=>n+1);}
  catch(err){setError(err.message||'Não foi possível atualizar este pagamento.');}
  finally{setBusyId('');}
 }
 async function setRecordPaid(row,paid){
  setBusyId(row.id);setError('');
  try{await setStudioFinancialRecordPaid(profileId,row.id,paid);setNotice(paid?'Registo marcado como pago/recebido.':'Estado do registo atualizado.');setRevision(n=>n+1);}
  catch(err){setError(err.message||'Não foi possível atualizar este registo.');}
  finally{setBusyId('');}
 }
 async function toggleRecurring(row){
  setBusyId(row.id);setError('');
  try{await setStudioRecurringActive(profileId,row.id,!row.active);setNotice(row.active?'Registo mensal pausado.':'Registo mensal reativado.');setRevision(n=>n+1);}
  catch(err){setError(err.message||'Não foi possível atualizar o registo mensal.');}
  finally{setBusyId('');}
 }
 if(!canManageStudio)return <main className="studioManagement"><h1>Gestão do Estúdio</h1><Notice type="error">Esta secção está disponível apenas para administradores do estúdio.</Notice></main>;

 const isOwner=currentUser.systemRole==='owner';
 const annual=payload?.totals||{};
 const summary=view==='month'?payload?.summary:{
  pilatesReceived:annual.pilates||0,otherIncomeReceived:annual.otherIncome||0,
  expensesPaid:annual.expensesPaid||0,pendingExpenses:annual.pendingExpenses||0,
  pendingIncome:annual.pendingIncome||0,
 };
 const studioResult=view==='month'
  ?(summary?.pilatesReceived||0)+(summary?.otherIncomeReceived||0)-(summary?.expensesPaid||0)-(summary?.pendingExpenses||0)
  :(annual.studioResult||0);
 const profitSettings=payload?.profitSettings||{partner_a_name:'Rui Marques',partner_b_name:'Manuel Gonzalves',partner_a_percent:50};
 const partnerAPercent=Number(profitSettings.partner_a_percent??50);
 const partnerBPercent=100-partnerAPercent;
 const monthlyWithdrawals=payload?.withdrawals||[];
 const partnerAWithdrawn=view==='month'?sumCents(monthlyWithdrawals.filter(row=>row.partner_key==='partner_a')):(annual.partnerAWithdrawn||0);
 const partnerBWithdrawn=view==='month'?sumCents(monthlyWithdrawals.filter(row=>row.partner_key==='partner_b')):(annual.partnerBWithdrawn||0);
 const partnerAShare=view==='month'?Math.round(studioResult*partnerAPercent/100):(annual.partnerAShare||0);
 const partnerBShare=view==='month'?studioResult-partnerAShare:(annual.partnerBShare||0);
 const currentName=normalizeName(currentUser.name);
 const currentPartner=currentName===normalizeName(profitSettings.partner_a_name)?'partner_a':currentName===normalizeName(profitSettings.partner_b_name)?'partner_b':null;
 const ownStudioShare=currentPartner==='partner_a'?partnerAShare:currentPartner==='partner_b'?partnerBShare:null;
 const ownStudioWithdrawal=currentPartner==='partner_a'?partnerAWithdrawn:currentPartner==='partner_b'?partnerBWithdrawn:null;
 const personalReceived=view==='month'?(payload?.personalReceived||0):(annual.personal||0);
 const personalForDisplay=isOwner?personalReceived:personalReceived+(ownStudioWithdrawal||0);
 const personalLabel=isOwner?'Treino pessoal · total global':'Total recebido por mim';
 const personalDetailLabel=isOwner?'Recebimentos de treino pessoal agregados':'Treino pessoal recebido por ti';
 const withdrawalDetail=isOwner?partnerAWithdrawn+partnerBWithdrawn:(ownStudioWithdrawal||0);
 const history=view==='month'?(payload?.history||[]):(payload?.months||[]);
 const pendingIncomeCount=view==='month'
  ?charges.filter(row=>row.status==='pending').length+records.filter(row=>row.direction==='income'&&row.status==='pending').length
  :(annual.pendingIncomeCount||0);
 const pendingExpenseCount=view==='month'
  ?records.filter(row=>row.direction==='expense'&&row.status==='pending').length
  :(annual.pendingExpensesCount||0);
 const selectedMonthLabel=monthLabel(month);
 const tabLabels=[['overview','Visão Geral'],['members','Alunos'],['movements','Movimentos'],['partners','Sócios'],['reports','Relatórios']];

 return <main className="studioManagement">
  <header className="studioHeading studioExecutiveHeading">
   <div><small>ULTIMATE FIT / FINANCE</small><h1>{tabLabels.find(item=>item[0]===tab)?.[1]||'Visão Geral'}</h1><p>Controlo financeiro do estúdio, separado do treino pessoal.</p></div>
   {view==='month'&&<div className="studioHeadingActions">
    <button type="button" onClick={()=>setDialog({type:'member'})}><Plus size={16}/> Aluno</button>
    <button className="primary" type="button" onClick={()=>setDialog({type:'finance'})}><Plus size={16}/> Novo registo</button>
    <button type="button" onClick={()=>setDialog({type:'withdrawal'})}><Plus size={16}/> Levantamento</button>
   </div>}
  </header>
  <nav className="studioTabs" role="tablist" aria-label="Secções da Gestão do Estúdio">
   {tabLabels.map(([key,label])=><button key={key} type="button" role="tab" aria-selected={tab===key} className={tab===key?'active':''} onClick={()=>setTab(key)}>{label}</button>)}
  </nav>
  <div className="studioToolbar">
   <div className="studioViewSwitch" role="group" aria-label="Período de análise">
    <button type="button" className={view==='month'?'active':''} onClick={()=>setView('month')}>Mês</button>
    <button type="button" className={view==='year'?'active':''} onClick={()=>setView('year')}>Ano</button>
   </div>
   {view==='month'?<div className="studioPeriod"><button type="button" aria-label="Mês anterior" onClick={()=>shiftMonth(-1)}><ChevronLeft size={18}/></button><input aria-label="Mês" type="month" value={month} onChange={event=>setMonth(event.target.value)}/><button type="button" aria-label="Mês seguinte" onClick={()=>shiftMonth(1)}><ChevronRight size={18}/></button></div>:<label className="studioYearSelect">Ano<select value={year} onChange={event=>setYear(Number(event.target.value))}>{yearList().map(value=><option key={value} value={value}>{value}</option>)}</select></label>}
   <span className="studioPeriodLabel">{view==='month'?selectedMonthLabel:String(year)}</span>
  </div>
  {isReadOnlyPreview&&<div className="studioPreviewNotice">Pré-visualização em modo de consulta: os registos não podem ser alterados.</div>}
  <div className="studioPrivacy"><Users size={18}/><span>Os alunos de Pilates ficam numa lista independente. Os valores de treino pessoal respeitam o perfil: cada administrador vê apenas os seus recebimentos; a conta proprietária vê um total global agregado.</span></div>
  {notice&&<Notice>{notice}</Notice>}
  {error&&<Notice type="error">{error} <button type="button" onClick={()=>setRevision(n=>n+1)}>Tentar novamente</button></Notice>}
  {loading?<div className="studioLoading"><span className="studioSpinner"/><p>A carregar valores e inscrições…</p></div>:<>
   {tab==='overview'&&<StudioOverview
    view={view} month={month} year={year} currentUser={currentUser} isOwner={isOwner}
    personalTotal={personalForDisplay} personalLabel={personalLabel} personalDetailLabel={personalDetailLabel}
    personalReceived={personalReceived} withdrawalDetail={withdrawalDetail} currentPartner={currentPartner}
    summary={summary} studioResult={studioResult} partnerSettings={profitSettings}
    partnerAShare={partnerAShare} partnerBShare={partnerBShare}
    partnerAWithdrawn={partnerAWithdrawn} partnerBWithdrawn={partnerBWithdrawn}
    ownStudioShare={ownStudioShare} ownStudioWithdrawal={ownStudioWithdrawal}
    pendingIncomeCount={pendingIncomeCount} pendingExpenseCount={pendingExpenseCount}
    records={records} charges={charges} members={members} history={history}
    trendRange={trendRange} setTrendRange={setTrendRange}
    onOpenTab={setTab}
   />}
   {tab==='members'&&view==='month'&&<StudioMembersPanel
    month={month} members={members} chargeByMember={chargeByMember} busyId={busyId}
    onEdit={member=>setDialog({type:'member',member})}
    onAdd={()=>setDialog({type:'member'})} onSetPaid={setChargePaid}
   />}
   {tab==='movements'&&view==='month'&&<StudioMovementsPanel
    month={month} records={records} recurringItems={recurringItems} profitSettings={profitSettings} busyId={busyId}
    onEditRecord={record=>setDialog({type:'finance',record})}
    onAddRecord={()=>setDialog({type:'finance'})}
    onAddRecurring={()=>setDialog({type:'finance',recurring:true})}
    onEditRecurring={template=>setDialog({type:'finance',template})}
    onSetPaid={setRecordPaid} onToggleRecurring={toggleRecurring}
   />}
   {tab==='partners'&&view==='month'&&<StudioPartnersPanel
    month={month} summary={summary} result={studioResult} settings={profitSettings}
    partnerAPercent={partnerAPercent} partnerBPercent={partnerBPercent}
    partnerAShare={partnerAShare} partnerBShare={partnerBShare}
    partnerAWithdrawn={partnerAWithdrawn} partnerBWithdrawn={partnerBWithdrawn}
    monthlyWithdrawals={monthlyWithdrawals} onEditSettings={()=>setDialog({type:'profitSettings'})}
    onAddWithdrawal={()=>setDialog({type:'withdrawal'})}
    onEditWithdrawal={withdrawal=>setDialog({type:'withdrawal',withdrawal})}
   />}
   {tab==='reports'&&<StudioReportsPanel
    currentUser={currentUser} view={view} month={month} year={year} payload={payload} summary={summary}
    history={history} trendRange={trendRange} setTrendRange={setTrendRange} records={records}
   />}
   {view==='year'&&tab!=='overview'&&tab!=='reports'&&<Card className="studioPeriodRequired">
    <h2>Consulta mensal necessária</h2>
    <p>A gestão de alunos, movimentos e sócios é apresentada por mês. A visão anual continua disponível em Visão Geral e Relatórios.</p>
    <button type="button" onClick={()=>setView('month')}>Abrir o mês selecionado</button>
   </Card>}
  </>}
  {dialog?.type==='member'&&<MemberDialog member={dialog.member} month={month} onClose={()=>setDialog(null)} onSave={async values=>{await saveStudioMember(profileId,values);saved(dialog.member?'Inscrição atualizada.':'Aluno de Pilates adicionado.');}}/>}
  {dialog?.type==='finance'&&<FinanceDialog month={month} profitSettings={profitSettings} record={dialog.record} template={dialog.template} recurring={dialog.recurring} onClose={()=>setDialog(null)} onSave={async values=>{if(values.isRecurring)await saveStudioRecurringItem(profileId,values);else await saveStudioFinancialRecord(profileId,values);saved(values.isRecurring?(dialog.template?'Regra mensal atualizada.':'Registo mensal criado.'):(dialog.record?'Movimento atualizado.':'Movimento adicionado.'));}}/>}
  {dialog?.type==='profitSettings'&&<ProfitSettingsDialog settings={profitSettings} month={month} onClose={()=>setDialog(null)} onSave={async values=>{await saveStudioProfitSettings(profileId,values);saved('Divisão do resultado atualizada.');}}/>}
  {dialog?.type==='withdrawal'&&<WithdrawalDialog settings={profitSettings} month={month} withdrawal={dialog.withdrawal} onClose={()=>setDialog(null)} onSave={async values=>{await saveStudioWithdrawal(profileId,values);saved(dialog.withdrawal?'Levantamento atualizado.':'Levantamento registado.');}}/>}
 </main>;
}

function StudioOverview({view,month,year,isOwner,personalTotal,personalLabel,personalDetailLabel,personalReceived,withdrawalDetail,summary,studioResult,partnerSettings,partnerAShare,partnerBShare,partnerAWithdrawn,partnerBWithdrawn,pendingIncomeCount,pendingExpenseCount,records,charges,members,history,trendRange,setTrendRange,onOpenTab}){
 const pilates=summary?.pilatesReceived||0;
 const otherIncome=summary?.otherIncomeReceived||0;
 const received=pilates+otherIncome;
 const expensesPaid=summary?.expensesPaid||0;
 const pendingExpenses=summary?.pendingExpenses||0;
 const expenses=expensesPaid+pendingExpenses;
 const pendingIncome=summary?.pendingIncome||0;
 const resultClass=studioResult>0?'positive':studioResult<0?'negative':'neutral';
 const resultLabel=studioResult>0?'Lucro operacional':studioResult<0?'Prejuízo operacional':'Equilíbrio';
 const pilatesShare=received?Math.round(pilates/received*100):0;
 const memberById=new Map(members.map(row=>[row.id,row]));
 const recent=[
  ...records.filter(row=>row.status!=='cancelled').map(row=>({id:'record-'+row.id,label:row.description,date:row.paid_on||row.due_on,amount:Number(row.amount_cents)||0,direction:row.direction,status:row.status,source:categoryName(row.category)})),
  ...charges.filter(row=>row.status!=='cancelled').map(row=>{const member=memberById.get(row.member_id);return {id:'charge-'+row.id,label:'Mensalidade · '+(member?memberName(member):'Aluno de Pilates'),date:row.paid_on||row.due_on,amount:Number(row.amount_cents)||0,direction:'income',status:row.status,source:'Pilates'};})
 ].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,6);

 return <div className="studioOverview">
  <section className="studioPersonalHero">
   <div className="studioHeroHeading"><div><small>RENDIMENTO PESSOAL</small><h2>{personalLabel}</h2></div><span aria-hidden="true" className="studioHeroWallet"><Wallet size={20}/></span></div>
   <strong className="studioPersonalAmount">{money(personalTotal)}</strong>
   <p>{isOwner?'Treino pessoal recebido no estúdio, apresentado apenas como total agregado.':personalDetailLabel}</p>
   <div className="studioPersonalBreakdown">
    <div><span>{personalDetailLabel}</span><strong>{money(personalReceived)}</strong></div>
    <div><span>{isOwner?'Levantamentos do estúdio · total':'Levantamentos feitos a ti'}</span><strong>{money(withdrawalDetail)}</strong></div>
   </div>
   <small className="studioHeroFootnote">{isOwner?'Os valores de treino pessoal não são detalhados por aluno.':'A quota do lucro só entra no teu rendimento quando é efetivamente levantada.'}</small>
  </section>

  <section className="studioAccountSection">
   <div className="studioSectionTitle"><div><small>CONTAS DO ESTÚDIO</small><h2>Situação financeira</h2></div><span>{view==='month'?monthLabel(month):year}</span></div>
   <div className="studioAccountMetrics">
    <article className="revenue"><small>Receitas recebidas</small><strong>{money(received)}</strong><span>Pilates {money(pilates)} · Outras {money(otherIncome)}</span></article>
    <article className="expenses"><small>Despesas totais</small><strong>{money(expenses)}</strong><span>Pagas {money(expensesPaid)} · Pendentes {money(pendingExpenses)}</span></article>
    <article className={'result '+resultClass}><small>Resultado antes de impostos</small><strong>{money(studioResult)}</strong><span>{resultLabel} · despesas pendentes incluídas</span></article>
   </div>
  </section>

  <div className="studioOverviewCharts">
   <Card className="studioCompositionCard">
    <header className="studioCardHeader"><div><h2>Origem das receitas</h2><p>Recebimentos efetivos no período</p></div></header>
    <div className="studioCompositionBody">
     <div className="studioDonut" role="img" aria-label={'Receitas: Pilates '+money(pilates)+' e outros rendimentos '+money(otherIncome)} style={{'--studio-donut-share':pilatesShare+'%'}}>
      <div><strong>{money(received)}</strong><span>Total recebido</span></div>
     </div>
     <div className="studioCompositionLegend"><div><span><i className="pilatesDot"/> Pilates</span><strong>{money(pilates)}</strong></div><div><span><i className="otherDot"/> Outras receitas</span><strong>{money(otherIncome)}</strong></div></div>
    </div>
   </Card>
   <Card className="studioBalanceCard">
    <header className="studioCardHeader"><div><h2>Receitas vs despesas</h2><p>Comparação dos valores do período</p></div></header>
    <FinanceComparison received={received} expenses={expenses} result={studioResult}/>
   </Card>
  </div>

  <Card className="studioPartnerOverview">
   <header className="studioCardHeader"><div><h2>Divisão entre sócios</h2><p>Resultado do estúdio distribuído segundo as percentagens definidas</p></div><span className="studioSplitBadge">{Number(partnerSettings.partner_a_percent??50)} / {100-Number(partnerSettings.partner_a_percent??50)}</span></header>
   <div className="studioShareGrid">
    {[{name:partnerSettings.partner_a_name||'Sócio 1',percent:Number(partnerSettings.partner_a_percent??50),share:partnerAShare,withdrawn:partnerAWithdrawn},{name:partnerSettings.partner_b_name||'Sócio 2',percent:100-Number(partnerSettings.partner_a_percent??50),share:partnerBShare,withdrawn:partnerBWithdrawn}].map((partner,index)=><article key={index} className={partner.share<0?'loss':''}>
     <span>{partner.name} · {partner.percent}%</span><strong>{money(partner.share)}</strong>
     <small>{partner.share<0?'Quota do prejuízo':partner.share>0?'Quota do resultado':'Equilíbrio'}</small>
     <small>Levantado: {money(partner.withdrawn)}</small>
    </article>)}
   </div>
   <p className="studioShareNote">O resultado não é somado ao rendimento pessoal até o valor ser efetivamente levantado.</p>
  </Card>

  <div className="studioOverviewLower">
   <Card className="studioAlertsCard">
    <header className="studioCardHeader"><div><h2>Alertas e pendências</h2><p>Valores em aberto no período</p></div></header>
    <div className="studioAlertsList">
     <div className={pendingIncome?'pending':''}><span className="studioAlertMark">{pendingIncome?'!':'✓'}</span><span>{pendingIncome?pendingIncomeCount+' cobrança(s) por receber':'Sem pagamentos pendentes'}</span><strong>{money(pendingIncome)}</strong></div>
     <div className={pendingExpenses?'pending':''}><span className="studioAlertMark">{pendingExpenses?'!':'✓'}</span><span>{pendingExpenses?pendingExpenseCount+' despesa(s) por pagar':'Sem despesas pendentes'}</span><strong>{money(pendingExpenses)}</strong></div>
    </div>
   </Card>
   <Card className="studioRecentCard">
    <header className="studioCardHeader"><div><h2>Movimentos recentes</h2><p>{view==='month'?selectedMonthLabelText(month):'Movimentos deste ano'}</p></div><button type="button" onClick={()=>view==='month'&&onOpenTab('movements')}>Ver movimentos</button></header>
    {view==='month'&&!recent.length?<div className="studioEmpty">Ainda não há movimentos neste período.</div>:view==='year'?<div className="studioEmpty">Abre Relatórios para consultar os movimentos mensais deste ano.</div>:<div className="studioRecentList">{recent.map(row=><article key={row.id}><span className={'studioRecentIcon '+row.direction}>{row.direction==='income'?'+':'−'}</span><div><strong>{row.label}</strong><small>{row.source} · {row.date?new Date(row.date+'T12:00:00').toLocaleDateString('pt-PT'):'Data não indicada'}</small></div><div><strong className={row.direction==='income'?'income':'expense'}>{row.direction==='income'?'+':'−'}{money(row.amount)}</strong><small>{row.status==='paid'?'Pago':row.status==='pending'?row.direction==='income'?'Por receber':'Por pagar':'Anulado'}</small></div></article>)}</div>}
   </Card>
  </div>

  <FinanceTrend months={history} range={trendRange} onRangeChange={setTrendRange}/>
 </div>;
}

function selectedMonthLabelText(month){return monthLabel(month);}
function FinanceComparison({received,expenses,result}){
 const max=Math.max(received,expenses,1);
 const difference=Math.abs(result);
 return <div className="studioComparison">
  <div><span>Receitas</span><strong>{money(received)}</strong><div className="studioComparisonTrack"><i className="income" style={{width:(received/max*100)+'%'}}/></div></div>
  <div><span>Despesas <small>(pagas + pendentes)</small></span><strong>{money(expenses)}</strong><div className="studioComparisonTrack"><i className="expense" style={{width:(expenses/max*100)+'%'}}/></div></div>
  <p className={result<0?'negative':result>0?'positive':'neutral'}>{result<0?'Faltaram '+money(difference)+' para atingir o equilíbrio.':result>0?'Saldo operacional positivo de '+money(difference)+'.':'Receitas e despesas estão em equilíbrio.'}</p>
 </div>;
}

function FinanceTrend({months,range,onRangeChange}){
 const selected=(months||[]).slice(-range);
 const values=selected.flatMap(row=>[Number(row.pilates||0)+Number(row.otherIncome||0),Number(row.expenses||0),Number(row.studioResult||0)]);
 const max=Math.max(0,...values);
 const min=Math.min(0,...values);
 const span=Math.max(max-min,1);
 const width=760,height=250,padLeft=42,padRight=12,padTop=16,padBottom=34;
 const plotWidth=width-padLeft-padRight,plotHeight=height-padTop-padBottom;
 const y=value=>padTop+(max-value)/span*plotHeight;
 const baseline=y(0);
 const step=selected.length?plotWidth/selected.length:plotWidth;
 const barWidth=Math.min(15,Math.max(5,step*.22));
 const points=selected.map((row,index)=>({x:padLeft+step*index+step/2,y:y(Number(row.studioResult||0)),row}));
 const path=points.map((point,index)=>(index?'L':'M')+point.x+' '+point.y).join(' ');
 return <Card className="studioTrendCard">
  <header className="studioCardHeader"><div><h2>Evolução financeira</h2><p>Receitas, despesas e resultado por mês</p></div><div className="studioTrendRanges" role="group" aria-label="Intervalo do gráfico">{[3,6,12].map(value=><button key={value} type="button" className={range===value?'active':''} aria-pressed={range===value} onClick={()=>onRangeChange(value)}>{value}M</button>)}</div></header>
  {!selected.length||!selected.some(row=>Number(row.pilates||0)||Number(row.otherIncome||0)||Number(row.expenses||0))?<div className="studioEmpty">Ainda não há histórico suficiente para apresentar um gráfico.</div>:<>
   <div className="studioTrendLegend"><span><i className="income"/>Receitas</span><span><i className="expense"/>Despesas</span><span><i className="result"/>Resultado</span></div>
   <div className="studioTrendViewport"><svg viewBox={'0 0 '+width+' '+height} role="img" aria-label="Gráfico da evolução financeira">
    {[0,.33,.66,1].map((fraction,index)=>{const value=max-span*fraction;const lineY=y(value);return <g key={index}><line x1={padLeft} x2={width-padRight} y1={lineY} y2={lineY} className="studioChartGrid"/><text x={padLeft-7} y={lineY+4} textAnchor="end" className="studioChartTick">{Math.round(value/100)}</text></g>;})}
    <line x1={padLeft} x2={width-padRight} y1={baseline} y2={baseline} className="studioChartZero"/>
    {selected.map((row,index)=>{const receipts=(Number(row.pilates||0)+Number(row.otherIncome||0));const expense=Number(row.expenses||0);const x=padLeft+step*index+step/2;return <g key={row.key}><rect x={x-barWidth-2} y={Math.min(baseline,y(receipts))} width={barWidth} height={Math.max(1,Math.abs(baseline-y(receipts)))} rx="3" className="studioChartIncome"><title>{row.label}: receitas {money(receipts)}</title></rect><rect x={x+2} y={Math.min(baseline,y(expense))} width={barWidth} height={Math.max(1,Math.abs(baseline-y(expense)))} rx="3" className="studioChartExpense"><title>{row.label}: despesas {money(expense)}</title></rect><text x={x} y={height-8} textAnchor="middle" className="studioChartMonth">{row.label}</text></g>;})}
    <path d={path} className="studioChartResult"/>
    {points.map((point,index)=><circle key={index} cx={point.x} cy={point.y} r="3.5" className="studioChartResultDot"><title>{point.row.label}: resultado {money(point.row.studioResult||0)}</title></circle>)}
   </svg></div>
  </>}
 </Card>;
}

function StudioMembersPanel({month,members,chargeByMember,busyId,onEdit,onAdd,onSetPaid}){
 return <Card className="studioFullPanel">
  <header className="studioCardHeader"><div><h2>Alunos de Pilates</h2><p>Inscrições e mensalidades de {monthLabel(month)}. Registos independentes dos alunos de treino pessoal.</p></div><button type="button" onClick={onAdd}><Plus size={16}/> Adicionar aluno</button></header>
  {!members.length?<div className="studioEmpty">Ainda não há alunos de grupo. Adiciona apenas o primeiro e o último nome, valor e, se quiseres enviar lembretes, o WhatsApp.</div>:<div className="studioMemberList">{members.map(member=>{
   const charge=chargeByMember.get(member.id);
   const phone=phoneForWhatsApp(member.whatsapp_phone);
   const statusText=charge?(charge.status==='paid'?'Pago':charge.status==='cancelled'?'Anulado':'Pendente'):member.active?'Sem cobrança neste mês':'Inscrição inativa';
   const whatsappMessage='Olá '+member.first_name+', tudo bem? Ainda não tenho registado o pagamento da mensalidade de Pilates referente a '+monthLabel(month)+' ('+money(charge?.amount_cents||member.monthly_fee_cents)+'). Quando puderes, envia-me o comprovativo. Obrigado!';
   return <article className="studioMemberRow" key={member.id}>
    <div className="studioMemberMain"><span className="studioMemberAvatar">{(member.first_name[0]||'')+(member.last_name[0]||'')}</span><div><strong>{memberName(member)}</strong><small>{money(charge?.amount_cents||member.monthly_fee_cents)} / mês · vence dia {member.due_day}</small></div></div>
    <div className="studioMemberStatus"><span className={'studioTextStatus '+(charge?.status==='paid'?'paid':member.active?'pending':'muted')}>{statusText}</span>{charge?.status==='paid'&&charge.paid_on&&<small>Pago em {new Date(charge.paid_on+'T12:00:00').toLocaleDateString('pt-PT')}</small>}</div>
    <div className="studioRowActions"><button type="button" className="studioIconButton" aria-label={'Editar '+memberName(member)} onClick={()=>onEdit(member)}><Edit3 size={16}/></button>{member.active&&charge&&charge.status!=='cancelled'&&<button type="button" disabled={busyId===charge.id} className={charge.status==='paid'?'studioSmallButton secondary':'studioSmallButton primary'} onClick={()=>onSetPaid(charge,charge.status!=='paid')}>{charge.status==='paid'?<><X size={15}/> Desfazer</>:<><Check size={15}/> Marcar pago</>}</button>}{member.active&&charge?.status==='pending'&&phone&&<a className="studioWhatsapp" href={'https://wa.me/'+phone+'?text='+encodeURIComponent(whatsappMessage)} target="_blank" rel="noopener noreferrer" aria-label={'Abrir WhatsApp para '+memberName(member)}><MessageCircle size={17}/> Pedir pagamento</a>}</div>
    {!phone&&member.active&&<small className="studioMemberHint">Sem WhatsApp registado · <button type="button" onClick={()=>onEdit(member)}>Adicionar número</button></small>}
   </article>;
  })}</div>}
  <footer className="studioCardFooter"><span>{members.filter(member=>member.active).length} inscrições ativas</span><button type="button" onClick={onAdd}>+ Adicionar aluno de Pilates</button></footer>
 </Card>;
}

function StudioMovementsPanel({month,records,recurringItems,profitSettings,busyId,onEditRecord,onAddRecord,onAddRecurring,onEditRecurring,onSetPaid,onToggleRecurring}){
 return <>
  <Card className="studioFullPanel">
   <header className="studioCardHeader"><div><h2>Movimentos do estúdio</h2><p>Rendimentos adicionais e despesas de {monthLabel(month)}.</p></div><button type="button" onClick={onAddRecord}><Plus size={16}/> Adicionar movimento</button></header>
   {!records.length?<div className="studioEmpty">Sem movimentos registados neste mês. Podes adicionar um rendimento, despesa ou regra mensal recorrente.</div>:<div className="studioRecordList">{records.map(record=><article className="studioRecordRow" key={record.id}>
    <div className={'studioRecordIcon '+record.direction}>{record.direction==='income'?<Wallet size={18}/>:<Repeat size={18}/>}</div>
    <div className="studioRecordDetails"><strong>{record.description}</strong><small>{categoryName(record.category)} · vence {new Date(record.due_on+'T12:00:00').toLocaleDateString('pt-PT')}{record.recurring_item_id?' · mensal':''}{record.direction==='expense'?' · '+(record.status==='paid'?'Pago por: ':'Previsto por: ')+expensePayerLabel(record,profitSettings):''}</small></div>
    <div className="studioRecordAmount"><strong>{money(record.amount_cents)}</strong><Status status={record.status} direction={record.direction}/></div>
    <div className="studioRowActions"><button className="studioIconButton" type="button" aria-label={'Editar '+record.description} onClick={()=>onEditRecord(record)}><Edit3 size={16}/></button>{record.status!=='cancelled'&&<button type="button" disabled={busyId===record.id} className="studioSmallButton secondary" onClick={()=>onSetPaid(record,record.status!=='paid')}>{record.status==='paid'?<><X size={15}/> Desfazer</>:<><Check size={15}/> Marcar pago</>}</button>}</div>
   </article>)}</div>}
   <footer className="studioCardFooter"><button type="button" onClick={onAddRecurring}><Repeat size={15}/> Adicionar rendimento/despesa mensal</button></footer>
  </Card>
  <Card className="studioRecurringCard"><header className="studioCardHeader"><div><h2>Registos mensais automáticos</h2><p>Gerados uma vez por mês, sem duplicações. Alterações futuras preservam o histórico.</p></div><button type="button" onClick={onAddRecurring}><Plus size={16}/> Criar registo mensal</button></header>
   {!recurringItems.length?<p className="studioEmpty">Ainda não configuraste receitas ou despesas recorrentes.</p>:<div className="studioRecurringList">{recurringItems.map(item=><article key={item.id}><div className={'studioRecurringIcon '+item.direction}><Repeat size={17}/></div><div className="studioRecordDetails"><strong>{item.description}</strong><small>{categoryName(item.category)} · {money(item.amount_cents)} / mês · desde {new Date(item.starts_on+'T12:00:00').toLocaleDateString('pt-PT')}</small></div><span className={'studioTextStatus '+(item.active?'paid':'muted')}>{item.active?'Ativo':'Pausado'}</span><div className="studioRowActions"><button className="studioIconButton" type="button" aria-label={'Editar regra '+item.description} onClick={()=>onEditRecurring(item)}><Edit3 size={15}/></button><button type="button" disabled={busyId===item.id} className="studioSmallButton secondary" onClick={()=>onToggleRecurring(item)}>{item.active?<><Pause size={14}/> Pausar</>:<><Play size={14}/> Reativar</>}</button></div></article>)}</div>}
  </Card>
 </>;
}

function StudioPartnersPanel({month,summary,result,settings,partnerAPercent,partnerBPercent,partnerAShare,partnerBShare,partnerAWithdrawn,partnerBWithdrawn,monthlyWithdrawals,onEditSettings,onAddWithdrawal,onEditWithdrawal}){
 return <Card className="studioProfitCard studioFullPanel">
  <header className="studioCardHeader"><div><h2>Resultado e divisão entre sócios</h2><p>As quotas de {monthLabel(month)} seguem as percentagens ativas nesse período.</p></div><div className="studioProfitActions"><button type="button" onClick={onEditSettings}><Edit3 size={15}/> Definir divisão</button><button type="button" onClick={onAddWithdrawal}><Plus size={15}/> Registar levantamento</button></div></header>
  <div className="studioFlow">
   <div><small>Recebido no Pilates</small><strong>{money(summary?.pilatesReceived||0)}</strong></div><span aria-hidden="true">+</span>
   <div><small>Outros rendimentos</small><strong>{money(summary?.otherIncomeReceived||0)}</strong></div><span aria-hidden="true">−</span>
   <div><small>Despesas pagas + pendentes</small><strong>{money((summary?.expensesPaid||0)+(summary?.pendingExpenses||0))}</strong></div><span aria-hidden="true">=</span>
   <div className="studioFlowResult"><small>Resultado antes de impostos</small><strong>{money(result)}</strong></div>
  </div>
  <div className="studioPartnerShares">
   {[{name:settings.partner_a_name,percent:partnerAPercent,share:partnerAShare,withdrawn:partnerAWithdrawn},{name:settings.partner_b_name,percent:partnerBPercent,share:partnerBShare,withdrawn:partnerBWithdrawn}].map((partner,index)=><article key={index} className={partner.share<0?'loss':''}><small>{partner.name} · {partner.percent}%</small><strong>{money(partner.share)}</strong><span>{partner.share<0?'Quota do prejuízo':partner.share>0?'Quota do resultado':'Equilíbrio'} · Levantado: {money(partner.withdrawn)}</span></article>)}
  </div>
  <div className="studioWithdrawals">
   <h3>Levantamentos registados em {monthLabel(month)}</h3>
   {!monthlyWithdrawals.length?<p>Ainda não há levantamentos registados neste mês.</p>:monthlyWithdrawals.map(row=><article key={row.id}><div><strong>{row.partner_key==='partner_a'?settings.partner_a_name:settings.partner_b_name}</strong><small>{new Date(row.withdrawn_on+'T12:00:00').toLocaleDateString('pt-PT')}{row.description?' · '+row.description:''}</small></div><strong>{money(row.amount_cents)}</strong><button type="button" className="studioIconButton" aria-label={'Editar levantamento de '+money(row.amount_cents)} onClick={()=>onEditWithdrawal(row)}><Edit3 size={15}/></button></article>)}
  </div>
  <div className="studioProfitNote">Levantamentos não contam como despesa. Uma despesa marcada como paga por ambos continua a ser contabilizada apenas uma vez.</div>
 </Card>;
}

function StudioReportsPanel({currentUser,view,month,year,payload,summary,history,trendRange,setTrendRange,records}){
 if(view==='year')return <><FinanceTrend months={history} range={trendRange} onRangeChange={setTrendRange}/><YearView payload={payload} year={year} currentUser={currentUser}/></>;
 const expenses=new Map();
 records.filter(row=>row.direction==='expense'&&row.status!=='cancelled').forEach(row=>{const key=row.category||'other_expense';const entry=expenses.get(key)||{category:key,total:0,paid:0,pending:0};const amount=Number(row.amount_cents)||0;entry.total+=amount;if(row.status==='paid')entry.paid+=amount;else entry.pending+=amount;expenses.set(key,entry);});
 const expenseRows=[...expenses.values()].sort((a,b)=>b.total-a.total);
 return <>
  <FinanceTrend months={history} range={trendRange} onRangeChange={setTrendRange}/>
  <Card className="studioReportBreakdown">
   <header className="studioCardHeader"><div><h2>Relatório de {monthLabel(month)}</h2><p>Receitas pelo dia em que foram recebidas; despesas pelo mês de referência.</p></div></header>
   <div className="studioReportColumns">
    <section><h3>Receitas recebidas</h3><div className="studioReportLine"><span>Pilates</span><strong>{money(summary?.pilatesReceived||0)}</strong></div><div className="studioReportLine"><span>Outros rendimentos</span><strong>{money(summary?.otherIncomeReceived||0)}</strong></div><div className="studioReportTotal"><span>Total recebido</span><strong>{money((summary?.pilatesReceived||0)+(summary?.otherIncomeReceived||0))}</strong></div></section>
    <section><h3>Despesas por categoria</h3>{!expenseRows.length?<p className="studioEmpty">Sem despesas registadas no período.</p>:expenseRows.map(row=><div className="studioReportLine" key={row.category}><span>{categoryName(row.category)}<small>Pagas {money(row.paid)} · Pendentes {money(row.pending)}</small></span><strong>{money(row.total)}</strong></div>)}<div className="studioReportTotal"><span>Total de despesas</span><strong>{money((summary?.expensesPaid||0)+(summary?.pendingExpenses||0))}</strong></div></section>
   </div>
  </Card>
 </>;
}
function YearView({payload,year,currentUser}){
 const rows=payload?.months||[];
 const totals=payload?.totals||{};
 const settings=payload?.profitSettings||{partner_a_name:'Rui Marques',partner_b_name:'Manuel Gonzalves',partner_a_percent:50};
 const personalLabel=currentUser.systemRole==='owner'?'Treino pessoal · total global':'Treino pessoal recebido por ti';
 const resultClass=Number(totals.studioResult||0)>0?'positive':Number(totals.studioResult||0)<0?'negative':'neutral';
 return <Card className="studioYearCard studioFullPanel">
  <header className="studioCardHeader"><div><h2>Resumo financeiro de {year}</h2><p>Receitas pela data de recebimento; despesas pelo mês de referência. Resultado antes de impostos, com despesas pendentes incluídas.</p></div></header>
  <div className="studioYearHighlights">
   <article><small>{personalLabel}</small><strong>{money(totals.personal||0)}</strong><span>Separado das contas do estúdio</span></article>
   <article className="revenue"><small>Receitas recebidas</small><strong>{money((totals.pilates||0)+(totals.otherIncome||0))}</strong><span>Pilates {money(totals.pilates||0)} · Outros {money(totals.otherIncome||0)}</span></article>
   <article className="expenses"><small>Despesas totais</small><strong>{money(totals.expenses||0)}</strong><span>Pagas {money(totals.expensesPaid||0)} · Pendentes {money(totals.pendingExpenses||0)}</span></article>
   <article className={'result '+resultClass}><small>Resultado antes de impostos</small><strong>{money(totals.studioResult||0)}</strong><span>{Number(totals.studioResult||0)<0?'Prejuízo':Number(totals.studioResult||0)>0?'Lucro':'Equilíbrio'}</span></article>
  </div>
  <div className="studioYearShares">
   <article><span>{settings.partner_a_name} · {Number(settings.partner_a_percent??50)}%</span><strong>{money(totals.partnerAShare||0)}</strong><small>{Number(totals.partnerAShare||0)<0?'Quota do prejuízo':'Quota do resultado'} · levantado {money(totals.partnerAWithdrawn||0)}</small></article>
   <article><span>{settings.partner_b_name} · {100-Number(settings.partner_a_percent??50)}%</span><strong>{money(totals.partnerBShare||0)}</strong><small>{Number(totals.partnerBShare||0)<0?'Quota do prejuízo':'Quota do resultado'} · levantado {money(totals.partnerBWithdrawn||0)}</small></article>
  </div>
  <div className="studioYearTableWrap"><table className="studioYearTable"><thead><tr><th>Mês</th><th>{currentUser.systemRole==='owner'?'Treino pessoal · global':'Treino pessoal'}</th><th>Pilates</th><th>Outras receitas</th><th>Por receber</th><th>Despesas pagas</th><th>Por pagar</th><th>Despesas totais</th><th>Resultado</th><th>Quota A</th><th>Quota B</th><th>Levantamentos A/B</th></tr></thead><tbody>{rows.map(row=><tr key={row.key}><th>{row.label}</th><td>{money(row.personal)}</td><td>{money(row.pilates)}</td><td>{money(row.otherIncome)}</td><td>{money(row.pendingIncome||0)}</td><td>{money(row.expensesPaid)}</td><td>{money(row.pendingExpenses)}</td><td>{money(row.expenses)}</td><td className={Number(row.studioResult)<0?'negative':Number(row.studioResult)>0?'positive':''}>{money(row.studioResult)}</td><td>{money(row.partnerAShare)}</td><td>{money(row.partnerBShare)}</td><td>{money(row.partnerAWithdrawn)} / {money(row.partnerBWithdrawn)}</td></tr>)}</tbody><tfoot><tr><th>Total</th><td>{money(totals.personal||0)}</td><td>{money(totals.pilates||0)}</td><td>{money(totals.otherIncome||0)}</td><td>{money(totals.pendingIncome||0)}</td><td>{money(totals.expensesPaid||0)}</td><td>{money(totals.pendingExpenses||0)}</td><td>{money(totals.expenses||0)}</td><td className={resultClass}>{money(totals.studioResult||0)}</td><td>{money(totals.partnerAShare||0)}</td><td>{money(totals.partnerBShare||0)}</td><td>{money(totals.partnerAWithdrawn||0)} / {money(totals.partnerBWithdrawn||0)}</td></tr></tfoot></table></div>
  <p className="studioYearNote">Os valores pessoais respeitam o perfil de acesso: cada administrador vê apenas os seus recebimentos; a conta proprietária vê um total global agregado, sem detalhe por aluno.</p>
 </Card>;
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

function ProfitSettingsDialog({settings,month,onClose,onSave}){
 const [form,setForm]=useState(()=>({partner_a_name:settings.partner_a_name||'Rui Marques',partner_b_name:settings.partner_b_name||'Manuel Gonzalves',partner_a_percent:String(settings.partner_a_percent??50)}));
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const submitLock=useRef(false);
 const update=(key,value)=>setForm(previous=>({...previous,[key]:value}));
 async function submit(event){
  event.preventDefault();if(submitLock.current)return;submitLock.current=true;setBusy(true);setError('');
  try{await onSave({...form,valid_from:month+'-01',partner_a_percent:Number(form.partner_a_percent)});}
  catch(err){setError(err.message||'Não foi possível guardar a divisão.');}finally{submitLock.current=false;setBusy(false);}
 }
 return <Modal title="Divisão do resultado do estúdio" onClose={onClose}>
  <p className="studioModalIntro">Define os nomes e a percentagem de cada sócio. A alteração aplica-se a partir de {monthLabel(month)}; os meses anteriores e os meses com divisão própria mantêm o respetivo histórico.</p>
  <form onSubmit={submit}><div className="studioFormGrid">
   <label>Primeiro sócio<input required maxLength={100} value={form.partner_a_name} onChange={event=>update('partner_a_name',event.target.value)}/></label>
   <label>Segundo sócio<input required maxLength={100} value={form.partner_b_name} onChange={event=>update('partner_b_name',event.target.value)}/></label>
   <label>Percentagem de {form.partner_a_name||'primeiro sócio'}<input type="number" min="0" max="100" step="1" required value={form.partner_a_percent} onChange={event=>update('partner_a_percent',event.target.value)}/></label>
   <label>Percentagem de {form.partner_b_name||'segundo sócio'}<input type="number" readOnly value={100-(Number(form.partner_a_percent)||0)} aria-label="Percentagem automática do segundo sócio"/></label>
  </div>
  <p className="studioFormHint">As duas percentagens somam sempre 100%. A quota calculada é antes de impostos e antes de levantamentos.</p>
  {error&&<p className="studioFieldError" role="alert">{error}</p>}
  <footer><button type="button" disabled={busy} onClick={onClose}>Cancelar</button><button type="submit" className="primary" disabled={busy}>{busy?'A guardar…':'Guardar divisão'}</button></footer></form>
 </Modal>;
}

function WithdrawalDialog({settings,month,withdrawal,onClose,onSave}){
 const defaultDate=month===today().slice(0,7)?today():month+'-01';
 const [form,setForm]=useState(()=>withdrawal?{...withdrawal,amount:euroInput(withdrawal.amount_cents)}:{partner_key:'partner_a',amount:'',withdrawn_on:defaultDate,description:''});
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const submitLock=useRef(false),requestId=useRef(crypto.randomUUID());
 const update=(key,value)=>setForm(previous=>({...previous,[key]:value}));
 async function submit(event){
  event.preventDefault();if(submitLock.current)return;submitLock.current=true;setBusy(true);setError('');
  try{await onSave({id:withdrawal?.id,request_id:requestId.current,partner_key:form.partner_key,amount_cents:cents(form.amount),withdrawn_on:form.withdrawn_on,description:form.description});}
  catch(err){setError(err.message||'Não foi possível registar o levantamento.');}finally{submitLock.current=false;setBusy(false);}
 }
 return <Modal title={withdrawal?'Editar levantamento':'Registar levantamento'} onClose={onClose}>
  <p className="studioModalIntro">Regista o dinheiro efetivamente retirado do estúdio. Este movimento não reduz o resultado contabilístico; atualiza o total levantado e o valor ainda por levantar.</p>
  <form onSubmit={submit}><div className="studioFormGrid">
   <label>Quem levantou<select value={form.partner_key} onChange={event=>update('partner_key',event.target.value)}><option value="partner_a">{settings.partner_a_name}</option><option value="partner_b">{settings.partner_b_name}</option></select></label>
   <label>Valor (€)<input inputMode="decimal" required placeholder="Ex.: 117,50" value={form.amount} onChange={event=>update('amount',event.target.value)}/></label>
   <label>Data do levantamento<input type="date" required max={today()} value={form.withdrawn_on} onChange={event=>update('withdrawn_on',event.target.value)}/></label>
   <label>Descrição (opcional)<input maxLength={160} placeholder="Ex.: transferência para conta pessoal" value={form.description||''} onChange={event=>update('description',event.target.value)}/></label>
  </div>
  {error&&<p className="studioFieldError" role="alert">{error}</p>}
  <footer><button type="button" disabled={busy} onClick={onClose}>Cancelar</button><button type="submit" className="primary" disabled={busy}>{busy?'A guardar…':'Guardar levantamento'}</button></footer></form>
 </Modal>;
}

function FinanceDialog({month,profitSettings,record,template,recurring,onClose,onSave}){
 const isTemplate=!!template;
 const isRecurring=isTemplate||!!recurring;
 const initial=template||record;
 const [form,setForm]=useState(()=>initial?{
  id:initial.id,direction:initial.direction,category:initial.category,description:initial.description,
  amount:euroInput(initial.amount_cents),due_day:initial.due_day||Number(initial.due_on?.slice(8,10)||8),
  starts_on:initial.starts_on||month+'-01',period:initial.period?.slice(0,7)||month,due_on:initial.due_on||today(),
  status:initial.status||'pending',paid_on:initial.paid_on||today(),active:initial.active??true,expense_paid_by:initial.expense_paid_by??'unknown',
 }:{direction:'expense',category:'rent',description:'',amount:'',due_day:'8',starts_on:month+'-01',period:month,due_on:today(),status:'pending',paid_on:today(),active:true,expense_paid_by:'studio'});
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const submitLock=useRef(false),requestId=useRef(crypto.randomUUID());
 const update=(key,value)=>setForm(previous=>({...previous,[key]:value}));
 const categories=form.direction==='income'?incomeCategories:expenseCategories;
 async function submit(event){
  event.preventDefault();if(submitLock.current)return;submitLock.current=true;setBusy(true);setError('');
  try{
   const amount_cents=cents(form.amount);
   if(isRecurring){
    await onSave({id:template?.id,request_id:requestId.current,isRecurring:true,direction:form.direction,category:form.category,description:form.description,amount_cents,due_day:Number(form.due_day),starts_on:form.starts_on,active:form.active,ends_on:form.active?null:today(),expense_paid_by:form.direction==='expense'?form.expense_paid_by:'studio'});
   }else{
    await onSave({id:record?.id,request_id:requestId.current,isRecurring:false,direction:form.direction,category:form.category,description:form.description,amount_cents,period:form.period+'-01',due_on:form.due_on,status:form.status,paid_on:form.status==='paid'?form.paid_on:null,method:'other',expense_paid_by:form.direction==='expense'?form.expense_paid_by:'studio'});
   }
  }catch(err){setError(err.message||'Não foi possível guardar o movimento.');}finally{submitLock.current=false;setBusy(false);}
 }
 return <Modal title={isTemplate?'Editar registo mensal':record?'Editar movimento':isRecurring?'Novo registo mensal':'Novo rendimento ou despesa'} onClose={onClose}>
  <p className="studioModalIntro">{isRecurring?'Este valor será gerado uma vez por mês. Os registos já existentes mantêm o histórico.':'Regista um rendimento adicional ou uma despesa do estúdio. Os valores entram nos totais quando marcados como pagos/recebidos.'}</p>
  <form onSubmit={submit}>
   <div className="studioFormGrid"><label>Tipo<select value={form.direction} onChange={event=>{const direction=event.target.value;update('direction',direction);update('category',direction==='income'?'trainer_rent':'rent');if(direction==='income')update('expense_paid_by','studio');}}><option value="income">Rendimento</option><option value="expense">Despesa</option></select></label><label>Categoria<select required value={form.category} onChange={event=>update('category',event.target.value)}>{categories.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label className="studioWide">Descrição<input required maxLength={160} placeholder={form.direction==='income'?'Ex.: Mensalidade da Diana':'Ex.: Ordenado professor de Pilates'} value={form.description} onChange={event=>update('description',event.target.value)}/></label><label>Valor (€)<input inputMode="decimal" required placeholder="Ex.: 250,00" value={form.amount} onChange={event=>update('amount',event.target.value)}/></label>{form.direction==='expense'&&<label>Quem paga/financia<select value={form.expense_paid_by} onChange={event=>update('expense_paid_by',event.target.value)}><option value="unknown">Ainda não indicado</option><option value="studio">Conta do estúdio</option><option value="partner_a">{profitSettings.partner_a_name} paga</option><option value="partner_b">{profitSettings.partner_b_name} paga</option><option value="shared">Ambos os sócios, segundo a divisão</option></select></label>}
    {isRecurring?<><label>Dia limite<input type="number" min="1" max="31" required value={form.due_day} onChange={event=>update('due_day',event.target.value)}/></label><label>Começa em<input type="date" required value={form.starts_on} onChange={event=>update('starts_on',event.target.value)}/></label><label className="studioCheckField"><input type="checkbox" checked={!!form.active} onChange={event=>{update('active',event.target.checked);if(event.target.checked&&template&&!template.active){update('starts_on',today());update('ends_on',null);}}}/> Ativo</label></>:<><label>Mês de referência<input type="month" required value={form.period} onChange={event=>update('period',event.target.value)}/></label><label>Data limite<input type="date" required value={form.due_on} onChange={event=>update('due_on',event.target.value)}/></label><label>Estado<select value={form.status} onChange={event=>update('status',event.target.value)}><option value="pending">{form.direction==='income'?'Por receber':'Por pagar'}</option><option value="paid">{form.direction==='income'?'Já recebido':'Já pago'}</option><option value="cancelled">Anulado</option></select></label>{form.status==='paid'&&<label>Data de pagamento<input type="date" max={today()} required value={form.paid_on} onChange={event=>update('paid_on',event.target.value)}/></label>}</>}
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
