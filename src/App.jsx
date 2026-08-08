import React,{useEffect,useMemo,useState} from 'react';
import {AppProvider,useApp} from './contexts/AppContext';
import {AuthProvider,useAuth} from './contexts/AuthContext';
import LoginScreen from './components/LoginScreen';
import PasswordSetupScreen from './components/PasswordSetupScreen';
import StudentDirectory,{StudentSelfHome} from './components/StudentDirectory';
import ProfessionalProfile from './components/ProfessionalProfile';
import BrandLogo from './components/BrandLogo';
import ChallengesModule from './components/ChallengesModule';
import AssessmentsModule from './components/AssessmentsModule';
import ParqOnboarding from './components/ParqOnboarding';
import TrainingPlansModule from './components/TrainingPlansModule';
import ExerciseLibraryModule from './components/ExerciseLibraryModule';
import {defaultTrainerPermissions,fetchTeamMembers,invokeTeamAction,trainerPermissionOptions,updateTrainerWhatsApp} from './lib/team';
import {Activity,AlertTriangle,Apple,BarChart3,BookOpen,CheckCircle2,ClipboardList,Dumbbell,FileText,Flag,Home,LogOut,Mail,ExternalLink,MessageSquare,Plus,Power,RefreshCw,Search,Settings,ShieldCheck,SlidersHorizontal,Target,Trash2,User,UserCog,Users,X} from 'lucide-react';
import {LineChart,Line,XAxis,YAxis,Tooltip,ResponsiveContainer,CartesianGrid} from 'recharts';

const adminNav=[['dashboard','Dashboard',Home],['profile','O meu perfil',User],['students','Alunos',Users],['trainers','Professores',UserCog],['assessments','Avaliações',ClipboardList],['plans','Planos de treino',Dumbbell],['nutrition','Nutrição',Apple],['challenges','Desafios',Flag],['exercises','Biblioteca',BookOpen],['messages','Avisos',MessageSquare],['reports','Relatórios PDF',FileText],['settings','Backoffice',Settings]];
const trainerNav=adminNav.filter(x=>!['trainers','settings'].includes(x[0]));
const studentNav=[['dashboard','Início',Home],['plans','Treino',Dumbbell],['nutrition','Nutrição',Apple],['assessments','Avaliações',ClipboardList],['challenges','Desafios',Flag],['messages','Avisos',MessageSquare],['reports','Relatórios',FileText],['profile','Perfil',User]];

const cx=(...a)=>a.filter(Boolean).join(' ');
function Card({children,className=''}){return <div className={cx('card',className)}>{children}</div>}
function Badge({children,tone='gray'}){return <span className={`badge ${tone}`}>{children}</span>}
function Logo(){return <div className="logo"><BrandLogo/></div>}

function Shell(){
 const {currentUser}=useApp();
 const {signOut}=useAuth();
 const [page,setPage]=useState(()=>{
  if(typeof window==='undefined') return 'dashboard';
  const challengeHost=window.location.hostname.toLowerCase().startsWith('desafios.');
  const challengePath=window.location.pathname.toLowerCase().startsWith('/desafios');
  return challengeHost||challengePath?'challenges':'dashboard';
 });
 const [pageContext,setPageContext]=useState({});
 const navigate=(key,context={})=>{setPage(key);setPageContext(context||{})};
 const nav=currentUser.role==='admin'?adminNav:currentUser.role==='professor'?trainerNav:studentNav;
 return <div className="appShell">
  <aside className="sidebar"><Logo/><div className="navList">{nav.map(([key,label,Icon])=><button key={key} className={page===key?'active':''} onClick={()=>navigate(key)}><Icon size={18}/>{label}</button>)}</div></aside>
  <main className="main"><header className="topbar"><div className="mobileLogo"><Logo/></div><div className="env">Supabase ligado · ambiente de desenvolvimento</div><div className="userTools"><button className="profileShortcut" onClick={()=>navigate('profile')} title="Abrir o meu perfil"><div className="userIdentity"><b>{currentUser.name}</b><small>{currentUser.roleLabel}</small></div><div className="avatar">{currentUser.avatarThumbUrl||currentUser.avatarUrl?<img src={currentUser.avatarThumbUrl||currentUser.avatarUrl} alt={currentUser.name}/>:currentUser.name.split(' ').map(x=>x[0]).slice(0,2).join('')}</div></button><button className="logoutButton" onClick={signOut} title="Terminar sessão"><LogOut size={18}/></button></div></header>
  <div className="content"><PageRouter page={page} context={pageContext} onNavigate={navigate}/></div>
  <nav className="bottomNav">{nav.slice(0,5).map(([key,label,Icon])=><button key={key} className={page===key?'active':''} onClick={()=>navigate(key)}><Icon size={20}/><small>{label}</small></button>)}</nav>
  </main>
 </div>
}

function PageRouter({page,context,onNavigate}){
 const map={dashboard:<Dashboard onNavigate={onNavigate}/>,students:<Students onNavigate={onNavigate}/>,trainers:<Trainers/>,assessments:<AssessmentsModule context={context} onNavigate={onNavigate}/>,plans:<TrainingPlansModule context={context} onNavigate={onNavigate}/>,nutrition:<Nutrition context={context}/>,challenges:<ChallengesModule context={context}/>,exercises:<ExerciseLibraryModule/>,messages:<Messages/>,reports:<Reports/>,settings:<SettingsPage/>,profile:<Profile onNavigate={onNavigate}/>};
 return map[page]||<Dashboard onNavigate={onNavigate}/>;
}
function Heading({title,sub,action}){return <div className="heading"><div><h1>{title}</h1>{sub&&<p>{sub}</p>}</div>{action}</div>}
function Kpi({icon:Icon,label,value}){return <Card className="kpi"><div className="iconBox"><Icon/></div><div><small>{label}</small><strong>{value}</strong></div></Card>}

function Dashboard({onNavigate}){
 const {data,currentUser}=useApp();
 const student=data.students.find(s=>s.userId===currentUser.id)||data.students[0];
 if(currentUser.role==='aluno') return <StudentDashboard student={student} onNavigate={onNavigate}/>;
 const visibleStudents=currentUser.role==='admin'?data.students:data.students.filter(s=>s.trainerIds?.includes(currentUser.id));
 return <><Heading title={`Olá, ${currentUser.name.split(' ')[0]}`} sub="Visão geral da plataforma."/>
 <div className="grid four"><Kpi icon={Users} label="Alunos ativos" value={visibleStudents.filter(s=>s.active).length}/><Kpi icon={Dumbbell} label="Planos ativos" value={data.plans.filter(p=>p.status==='published'&&p.active).length}/><Kpi icon={ClipboardList} label="Avaliações" value={data.assessments.length}/><Kpi icon={BookOpen} label="Exercícios" value={data.exercises.length}/></div>
 <div className="grid two section"><Card className="pad"><h2>Alunos recentes</h2>{visibleStudents.length?visibleStudents.slice(0,6).map(s=><div className="listRow" key={s.id}><div className="avatar small">{s.thumbUrl?<img src={s.thumbUrl} alt={s.name}/>:s.name.split(' ').map(x=>x[0]).slice(0,2).join('')}</div><div className="grow"><b>{s.name}</b><small>{s.objective||'Objetivo por definir'}</small></div><Badge tone={s.active?'green':'gray'}>{s.active?'Ativo':'Sem acesso'}</Badge></div>):<div className="notice">Ainda não existem alunos reais. Cria o primeiro registo na secção Alunos.</div>}</Card><Card className="pad"><h2>Estado da plataforma</h2><div className="notice">Módulo real de alunos ligado ao Supabase.</div><div className="notice">Avaliações físicas modulares ligadas ao Supabase.</div><div className="notice">{data.settings.comingSoon?'Página Coming Soon ativa.':'Aplicação pública ativa.'}</div></Card></div></>;
}
function StudentDashboard({student,onNavigate}){const {data,refreshStudents}=useApp();return <StudentSelfHome student={student} assessments={data.assessments.filter(a=>a.studentId===student?.id)} onNavigate={onNavigate} onRefresh={refreshStudents}/>;}

function Students({onNavigate}){return <StudentDirectory onNavigate={onNavigate}/>;}
function Trainers(){
 const {currentUser}=useApp();
 const [members,setMembers]=useState([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [open,setOpen]=useState(false);
 const [editing,setEditing]=useState(null);
 const [confirming,setConfirming]=useState(null);
 const [whatsappEditing,setWhatsappEditing]=useState(null);
 const [submitting,setSubmitting]=useState(false);
 const [newRole,setNewRole]=useState('trainer');
 const [permissions,setPermissions]=useState(defaultTrainerPermissions);

 const isOwner=currentUser.systemRole==='owner';

 async function reload(){
  setLoading(true);setError('');
  try{setMembers(await fetchTeamMembers())}catch(err){setError(err.message||'Não foi possível carregar a equipa. Verifica se a Migração 003 e a Edge Function já foram instaladas.')}
  finally{setLoading(false)}
 }
 useEffect(()=>{reload()},[]);

 function togglePermission(key,setter= setPermissions){setter(list=>list.includes(key)?list.filter(item=>item!==key):[...list,key])}
 function canManage(member){
  if(member.id===currentUser.id||member.role==='owner') return false;
  if(isOwner) return ['admin','trainer'].includes(member.role);
  return currentUser.systemRole==='admin'&&member.role==='trainer';
 }

 async function add(event){
  event.preventDefault();setSubmitting(true);setError('');setNotice('');
  const form=new FormData(event.currentTarget);
  try{
   const result=await invokeTeamAction({
    action:'invite',
    firstName:form.get('firstName'),
    lastName:form.get('lastName'),
    email:form.get('email'),
    role:newRole,
    professionalTitle:form.get('professionalTitle'),
    whatsappPhone:form.get('whatsappPhone'),
    permissions:newRole==='trainer'?permissions:[],
   });
   setNotice(result.message||'Convite enviado.');
   setOpen(false);setNewRole('trainer');setPermissions(defaultTrainerPermissions);
   await reload();
  }catch(err){setError(err.message)}finally{setSubmitting(false)}
 }

 function openPermissions(member){setEditing({...member,draftPermissions:[...member.permissions]})}
 async function savePermissions(){
  setSubmitting(true);setError('');setNotice('');
  try{
   const result=await invokeTeamAction({action:'set_permissions',profileId:editing.id,permissions:editing.draftPermissions});
   setNotice(result.message);setEditing(null);await reload();
  }catch(err){setError(err.message)}finally{setSubmitting(false)}
 }

 async function runAction(){
  if(!confirming)return;
  setSubmitting(true);setError('');setNotice('');
  try{
   const result=await invokeTeamAction({action:confirming.action,profileId:confirming.member.id});
   setNotice(result.message);setConfirming(null);await reload();
  }catch(err){setError(err.message)}finally{setSubmitting(false)}
 }

 const roleName={owner:'Proprietário',admin:'Administrador global',trainer:'Professor'};
 const statusFor=member=>member.invitation?.status==='pending'?'Convite pendente':member.is_active?'Ativa':'Desativada';
 const statusTone=member=>member.invitation?.status==='pending'?'yellow':member.is_active?'green':'gray';

 return <>
  <Heading title="Professores" sub="Contas reais, convites, hierarquia, permissões e estado de acesso." action={<button className="primary" onClick={()=>setOpen(true)}><Plus size={17}/>{isOwner?'Adicionar membro':'Adicionar professor'}</button>}/>
  <Card className="pad teamRules"><ShieldCheck size={30}/><div><h3>Hierarquia protegida</h3><p><b>Proprietário:</b> pode criar e gerir Administradores globais e Professores. <b>Administrador global:</b> pode criar, gerir e eliminar Professores, mas não pode criar outro Administrador nem alterar o Proprietário.</p></div></Card>
  {notice&&<div className="successBanner"><CheckCircle2 size={18}/>{notice}</div>}
  {error&&<div className="errorBanner"><AlertTriangle size={18}/>{error}</div>}
  {loading?<Card className="pad loadingCard"><div className="loader"/><p>A carregar equipa…</p></Card>:<div className="grid three section">{members.map(member=><Card className="pad teamCard" key={member.id}>
   <div className="listRow"><div className="avatar">{member.thumbUrl||member.photoUrl?<img src={member.thumbUrl||member.photoUrl} alt={member.full_name}/>:member.full_name.split(' ').map(x=>x[0]).slice(0,2).join('')}</div><div className="grow"><h3>{member.full_name}</h3><small>{member.email}</small></div><Badge tone={member.role==='owner'||member.role==='admin'?'yellow':'gray'}>{roleName[member.role]}</Badge></div>
   <div className="teamMeta"><Badge tone={statusTone(member)}>{statusFor(member)}</Badge><span>{member.trainerProfile?.professional_title||'Personal Trainer'}</span></div>
   <div className={member.trainerProfile?.whatsapp_phone?'teamWhatsapp':'teamWhatsapp missing'}><MessageSquare size={15}/><span>{member.trainerProfile?.whatsapp_phone||'WhatsApp obrigatório em falta'}</span>{(member.id===currentUser.id||canManage(member))&&<button className="textButton" onClick={()=>setWhatsappEditing(member)}>Editar</button>}</div>
   {member.trainerProfile?.social_url&&<a className="teamSocialLink" href={member.trainerProfile.social_url} target="_blank" rel="noreferrer"><ExternalLink size={15}/>{member.trainerProfile.social_url}</a>}
   {member.role==='owner'&&<div className="protectedNote"><ShieldCheck size={16}/>Conta principal protegida</div>}
   {member.role==='trainer'&&<button className="secondary full" onClick={()=>openPermissions(member)}><SlidersHorizontal size={16}/>Editar permissões</button>}
   {canManage(member)&&<div className="teamActions">
    <button className="secondary" onClick={()=>setConfirming({action:member.is_active?'deactivate':'reactivate',member})}>{member.is_active?<><Power size={16}/>Desativar</>:<><RefreshCw size={16}/>Reativar</>}</button>
    <button className="dangerButton" onClick={()=>setConfirming({action:'delete',member})}><Trash2 size={16}/>Eliminar acesso</button>
   </div>}
  </Card>)}</div>}

  {open&&<Modal title={isOwner?'Adicionar membro da equipa':'Adicionar professor'} close={()=>setOpen(false)}><form onSubmit={add} className="formGrid">
   <Input name="firstName" label="Nome" required/>
   <Input name="lastName" label="Apelido" required/>
   <Input name="email" label="Email" type="email" required/>
   <Select name="role" label="Tipo de acesso" value={newRole} onChange={e=>setNewRole(e.target.value)} options={isOwner?[{value:'trainer',label:'Professor'},{value:'admin',label:'Administrador global'}]:[{value:'trainer',label:'Professor'}]}/>
   <Input name="professionalTitle" label="Função profissional" defaultValue="Personal Trainer"/>
   <Input name="whatsappPhone" label="WhatsApp profissional *" required/>
   <div className="wide inviteExplanation"><Mail size={20}/><div><b>O utilizador receberá um convite por email</b><p>Ao abrir o link, define a sua própria palavra-passe. Tu nunca precisas de conhecer ou enviar a password.</p></div></div>{isOwner?<div className="wide roleCreationNote"><ShieldCheck size={19}/><p>Como Proprietário, podes criar Professores ou Administradores globais. Só o Proprietário pode atribuir acesso de Administrador global.</p></div>:<div className="wide roleCreationNote"><ShieldCheck size={19}/><p>Como Administrador global, podes criar e gerir Professores. A criação de novos Administradores globais está reservada ao Proprietário.</p></div>}
   {newRole==='trainer'&&<PermissionEditor selected={permissions} onToggle={key=>togglePermission(key)} />}
   {newRole==='admin'&&<div className="wide adminAccessNote"><ShieldCheck size={19}/><p>O Administrador global terá os mesmos privilégios operacionais do Manuel: poderá criar, gerir e eliminar Professores. Não poderá criar outro Administrador global nem alterar, desativar ou eliminar o Proprietário.</p></div>}
   <button className="primary full wide" disabled={submitting}>{submitting?'A enviar convite…':'Criar conta e enviar convite'}</button>
  </form></Modal>}

  {editing&&<Modal title={`Permissões · ${editing.full_name}`} close={()=>setEditing(null)}><PermissionEditor selected={editing.draftPermissions} customSetter={fn=>setEditing(item=>({...item,draftPermissions:fn(item.draftPermissions)}))}/><div className="modalActions"><button className="secondary" onClick={()=>setEditing(null)}>Cancelar</button><button className="primary" disabled={submitting} onClick={savePermissions}>Guardar permissões</button></div></Modal>}

  {confirming&&<Modal title={confirming.action==='delete'?'Eliminar acesso':'Alterar estado da conta'} close={()=>setConfirming(null)}><div className="confirmBox"><AlertTriangle size={34}/><h3>{confirming.member.full_name}</h3><p>{confirming.action==='delete'?'Esta ação remove permanentemente o acesso e retira o membro da equipa ativa. Os planos, avaliações e autoria histórica são preservados.':confirming.action==='deactivate'?'A conta deixa imediatamente de conseguir entrar. Pode ser reativada mais tarde.':'A conta volta a poder iniciar sessão.'}</p><div className="modalActions"><button className="secondary" onClick={()=>setConfirming(null)}>Cancelar</button><button className={confirming.action==='delete'?'dangerButton':'primary'} disabled={submitting} onClick={runAction}>{submitting?'A processar…':'Confirmar'}</button></div></div></Modal>}

  {whatsappEditing&&<Modal title={`WhatsApp profissional · ${whatsappEditing.full_name}`} close={()=>setWhatsappEditing(null)}><form className="formGrid" onSubmit={async event=>{event.preventDefault();setSubmitting(true);setError('');try{const form=new FormData(event.currentTarget);await updateTrainerWhatsApp(whatsappEditing.trainerProfile.id,form.get('whatsappPhone'));setNotice('WhatsApp profissional atualizado.');setWhatsappEditing(null);await reload()}catch(err){setError(err.message)}finally{setSubmitting(false)}}}><Input name="whatsappPhone" label="Número com indicativo do país" defaultValue={whatsappEditing.trainerProfile?.whatsapp_phone||'+351'} required/><div className="wide roleCreationNote"><MessageSquare size={18}/><p>Este número será usado pelo botão “Falar com o professor” na área dos alunos atribuídos.</p></div><button className="primary full wide" disabled={submitting}>{submitting?'A guardar…':'Guardar WhatsApp'}</button></form></Modal>}
 </>
}

function PermissionEditor({selected,onToggle,customSetter}){
 const toggle=key=>customSetter?customSetter(list=>list.includes(key)?list.filter(item=>item!==key):[...list,key]):onToggle(key);
 return <div className="permissionEditor wide"><div className="permissionHeader"><div><h3>Permissões do professor</h3><p>Aplicam-se apenas aos alunos atribuídos e nunca dão acesso aos planos privados de outros professores.</p></div><Badge tone="yellow">{selected.length}/{trainerPermissionOptions.length}</Badge></div><div className="permissionGrid">{trainerPermissionOptions.map(item=><label className={selected.includes(item.key)?'permissionOption selected':'permissionOption'} key={item.key}><input type="checkbox" checked={selected.includes(item.key)} onChange={()=>toggle(item.key)}/><div><b>{item.label}</b><small>{item.description}</small></div></label>)}</div></div>
}

function Evolution({compact=false,studentId}){const {data,currentUser}=useApp();const sid=studentId||data.students.find(s=>s.userId===currentUser.id)?.id||data.students[0]?.id;const rows=data.assessments.filter(a=>a.studentId===sid).sort((a,b)=>a.date.localeCompare(b.date));const first=rows[0],last=rows.at(-1);const metrics=[['Peso','weight','kg'],['Massa gorda','fat','%'],['Massa muscular','muscle','kg'],['Cintura','waist','cm']];return <div className={compact?'section':''}>{!compact&&<Heading title="Evolução" sub="Comparação automática entre avaliações."/>}<div className="grid four">{metrics.map(([label,key,unit])=><Card className="metric" key={key}><small>{label}</small><strong>{last?.[key]??'—'} {unit}</strong><span>{first&&last?`${(last[key]-first[key]).toFixed(1)} ${unit} desde o início`:'Sem comparação'}</span></Card>)}</div><Card className="pad section"><h2>Evolução corporal</h2><div className="chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={rows}><CartesianGrid stroke="rgba(255,255,255,.08)" vertical={false}/><XAxis dataKey="date" tick={{fill:'#888'}}/><YAxis tick={{fill:'#888'}}/><Tooltip contentStyle={{background:'#111',border:'1px solid #333'}}/><Line dataKey="weight" stroke="#ffd908" strokeWidth={3}/><Line dataKey="waist" stroke="#aaa" strokeWidth={3}/></LineChart></ResponsiveContainer></div></Card>{!compact&&<Card className="pad section"><h2>Comparação fotográfica</h2><div className="grid two"><div className="photoBox">Avaliação inicial</div><div className="photoBox">Avaliação atual</div></div></Card>}</div>}

function Plans({context={}}){const {data,currentUser}=useApp();const ownStudent=data.students.find(s=>s.userId===currentUser.id);const targetStudent=context.studentId?data.students.find(s=>s.id===context.studentId):ownStudent;const plans=currentUser.role==='aluno'?data.plans.filter(p=>p.studentId===ownStudent?.id):context.studentId?data.plans.filter(p=>p.studentId===context.studentId):data.plans;return <><Heading title={targetStudent&&currentUser.role!=='aluno'?`Planos de treino · ${targetStudent.name}`:'Planos de treino'} sub="Prescrição estruturada com exercícios, séries, repetições e notas." action={currentUser.role!=='aluno'?<button className="primary"><Plus size={17}/>Novo plano</button>:null}/>{plans.map(p=><Card className="pad section" key={p.id}><div className="titleLine"><div><Badge tone="green">{p.status}</Badge><h2>{p.title}</h2><small>{p.weeks} semanas</small></div><Dumbbell size={38}/></div>{p.sessions.map(s=><div className="session" key={s.name}><h3>{s.name}</h3>{s.items.map((it,i)=>{const ex=data.exercises.find(e=>e.id===it.exerciseId);return <div className="exerciseRow" key={i}><div className="media">GIF</div><div className="grow"><b>{ex?.name}</b><small>{ex?.group} · {ex?.equipment}</small><p>{it.sets} séries · {it.reps} repetições · {it.rest}</p></div></div>})}</div>)}</Card>)}</>}
function Nutrition({context={}}){const {data,currentUser}=useApp();const ownStudent=data.students.find(s=>s.userId===currentUser.id);const targetStudent=context.studentId?data.students.find(s=>s.id===context.studentId):ownStudent;const items=currentUser.role==='aluno'?data.nutrition.filter(n=>n.studentId===ownStudent?.id):context.studentId?data.nutrition.filter(n=>n.studentId===context.studentId):data.nutrition;return <><Heading title={targetStudent&&currentUser.role!=='aluno'?`Nutrição · ${targetStudent.name}`:'Nutrição'} sub="Planos alimentares e documentos associados." action={currentUser.role!=='aluno'?<button className="primary"><Plus size={17}/>Adicionar PDF</button>:null}/><div className="grid three section">{items.map(n=><Card className="pad" key={n.id}><Apple className="yellow" size={34}/><h2>{n.title}</h2><p>{n.notes}</p><button className="secondary full">Abrir {n.fileName}</button></Card>)}</div></>}
function Goals(){const {data,currentUser}=useApp();const student=data.students.find(s=>s.userId===currentUser.id);const items=currentUser.role==='aluno'?data.goals.filter(g=>g.studentId===student?.id):data.goals;return <><Heading title="Objetivos" sub="Metas mensuráveis e acompanhamento do progresso."/><div className="grid three section">{items.map(g=><Card className="pad" key={g.id}><Target className="yellow"/><h2>{g.title}</h2><p>Meta: <b>{g.target}</b></p><div className="progress"><span style={{width:`${g.progress}%`}}/></div><small>{g.progress}% concluído · até {g.deadline}</small></Card>)}</div></>}

function Exercises(){const {data}=useApp();const [q,setQ]=useState('');const [group,setGroup]=useState('Todos');const groups=['Todos',...new Set(data.exercises.map(e=>e.group))];const list=data.exercises.filter(e=>(group==='Todos'||e.group===group)&&e.name.toLowerCase().includes(q.toLowerCase()));return <><Heading title="Biblioteca de exercícios" sub={`${data.exercises.length} exercícios iniciais, preparados para GIFs/vídeos próprios.`}/><div className="filters"><div className="search"><Search size={18}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Pesquisar exercício..."/></div><select value={group} onChange={e=>setGroup(e.target.value)}>{groups.map(g=><option key={g}>{g}</option>)}</select></div><div className="grid three">{list.map(e=><Card className="exerciseCard" key={e.id}><div className="exerciseMedia">GIF / VÍDEO</div><div className="pad"><Badge tone="yellow">{e.group}</Badge><h3>{e.name}</h3><small>{e.equipment} · {e.type} · {e.level}</small><p>{e.description}</p></div></Card>)}</div></>}
function Messages(){const {data,currentUser}=useApp();const student=data.students.find(s=>s.userId===currentUser.id);const items=currentUser.role==='aluno'?data.messages.filter(m=>m.studentId===student?.id):data.messages;return <><Heading title="Avisos" sub="Comunicação assíncrona entre professor e aluno."/><div className="section">{items.map(m=><Card className="pad message" key={m.id}><MessageSquare className="yellow"/><div><h3>{m.title}</h3><p>{m.body}</p><small>{m.date}</small></div></Card>)}</div></>}
function Reports(){const {data}=useApp();return <><Heading title="Relatórios PDF" sub="Geração automática a partir das avaliações físicas."/><Card className="pad section"><h2>Relatório de avaliação</h2><p>Seleciona um aluno e duas avaliações para criar um documento com dados, diferenças, gráficos, observações e identidade ULTIMATE FIT.</p><div className="formGrid"><Select label="Aluno" options={data.students.map(s=>s.name)}/><Select label="Avaliação inicial" options={data.assessments.map(a=>a.date)}/><Select label="Avaliação atual" options={data.assessments.map(a=>a.date)}/><button className="primary full"><FileText size={17}/>Gerar relatório demonstrativo</button></div></Card></>}
function SettingsPage(){const {data,setData}=useApp();const s=data.settings;return <><Heading title="Backoffice" sub="Definições globais e controlo da aplicação."/><div className="grid two section"><Card className="pad"><h2>Modo público</h2><div className="setting"><div><b>Página Coming Soon</b><small>Enquanto ativa, o público vê apenas a página de lançamento.</small></div><button className={s.comingSoon?'toggle on':'toggle'} onClick={()=>setData(d=>({...d,settings:{...d.settings,comingSoon:!d.settings.comingSoon}}))}><span/></button></div></Card><Card className="pad"><h2>Permissões previstas</h2><p><b>Proprietário:</b> controlo total e conta protegida.</p><p><b>Administrador:</b> gestão global, exceto a conta do Proprietário.</p><p><b>Professor:</b> alunos atribuídos e permissões concedidas.</p><p><b>Aluno:</b> apenas os próprios dados.</p></Card><Card className="pad"><h2>Convites</h2><p>Fluxo final: criação no backoffice → email para definir password → instruções complementares por WhatsApp.</p></Card><Card className="pad"><h2>PWA</h2><p>Manifesto instalável já incluído. Ícone e experiência mobile serão validados antes do deploy.</p></Card></div></>}
function Profile({onNavigate}){const {currentUser,data,refreshStudents}=useApp();if(currentUser.role==='aluno'){const student=data.students.find(item=>item.userId===currentUser.id);return <StudentSelfHome student={student} assessments={data.assessments.filter(item=>item.studentId===student?.id)} onNavigate={onNavigate} onRefresh={refreshStudents}/>;}return <ProfessionalProfile/>;}

function Modal({title,close,children}){return <div className="overlay"><div className="modal"><div className="title"><h2>{title}</h2><button className="iconButton" onClick={close}><X/></button></div>{children}</div></div>}
function Input({label,...props}){return <label>{label}<input {...props}/></label>}
function Select({label,options=[],...props}){return <label>{label}<select {...props}>{options.map((o,i)=>typeof o==='string'?<option key={i}>{o}</option>:<option key={o.value} value={o.value}>{o.label}</option>)}</select></label>}
function Info({l,v}){return <div className="info"><small>{l}</small><b>{v||'—'}</b></div>}

function AppGate(){
 const {configured,loading,session,profile}=useAuth();
 const path=window.location.pathname.replace(/\/$/,'')||'/';
 if(!configured) return <div className="appState"><Logo/><h1>Configuração em falta</h1><p>As variáveis VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY ainda não estão disponíveis neste deployment.</p></div>;
 if(loading) return <div className="appState"><Logo/><div className="loader"/><p>A preparar a aplicação…</p></div>;
 if(path==='/repor-palavra-passe') return <PasswordSetupScreen mode="recovery"/>;
 if(path==='/definir-palavra-passe') return <PasswordSetupScreen mode="invite"/>;
 if(!session) return <LoginScreen/>;
 if(!profile) return <div className="appState"><Logo/><h1>Perfil indisponível</h1><p>Não foi possível carregar o perfil associado a esta conta.</p></div>;
 if(profile.deleted_at) return <div className="appState"><Logo/><h1>Acesso eliminado</h1><p>Esta conta já não faz parte da equipa ULTIMATE FIT.</p></div>;
 if(!profile.is_active) return <div className="appState"><Logo/><h1>Conta desativada</h1><p>Contacta a administração do ULTIMATE FIT.</p></div>;
 if(profile.role==='student') return <ParqOnboarding profile={profile}><AppProvider><Shell/></AppProvider></ParqOnboarding>;
 return <AppProvider><Shell/></AppProvider>;
}

export default function App(){return <AuthProvider><AppGate/></AuthProvider>}
