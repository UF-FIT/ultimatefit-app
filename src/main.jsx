import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { exercises, exerciseGroups, equipmentList } from './data/exercises.js'
import { demoAssessments, demoNutritionPlans, demoPlans, demoStudents, demoTrainers } from './data/demo.js'
import { isSupabaseConfigured, supabase } from './lib/supabase.js'
import './styles.css'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}

const NAV = [
  ['dashboard', '🏠', 'Dashboard'],
  ['students', '👥', 'Alunos'],
  ['trainers', '🧑‍🏫', 'Professores'],
  ['assessments', '📋', 'Avaliações'],
  ['reports', '📄', 'Relatórios'],
  ['training', '🏋️', 'Planos de Treino'],
  ['nutrition', '🥗', 'Nutrição'],
  ['exercises', '📚', 'Exercícios'],
  ['settings', '⚙️', 'Definições'],
]

function defaultLaunchDate() {
  const stored = localStorage.getItem('uf_launch_date')
  if (stored) return stored
  const d = new Date()
  d.setDate(d.getDate() + 30)
  const iso = d.toISOString()
  localStorage.setItem('uf_launch_date', iso)
  return iso
}

function toDateInputValue(iso) {
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function App() {
  const [session, setSession] = useState(null)
  const [showLogin, setShowLogin] = useState(false)
  const [role, setRole] = useState('admin')
  const [page, setPage] = useState('dashboard')
  const [comingSoonEnabled, setComingSoonEnabled] = useState(() => JSON.parse(localStorage.getItem('uf_public_settings') || 'null')?.comingSoonEnabled ?? true)
  const [launchDate, setLaunchDate] = useState(defaultLaunchDate)
  const [trainers, setTrainers] = useState(() => JSON.parse(localStorage.getItem('uf_trainers') || 'null') || demoTrainers)
  const [students, setStudents] = useState(() => JSON.parse(localStorage.getItem('uf_students') || 'null') || demoStudents)
  const [plans, setPlans] = useState(() => JSON.parse(localStorage.getItem('uf_training_plans') || 'null') || demoPlans)
  const [nutritionPlans, setNutritionPlans] = useState(() => JSON.parse(localStorage.getItem('uf_nutrition_plans') || 'null') || demoNutritionPlans)

  function persistTrainers(next) { setTrainers(next); localStorage.setItem('uf_trainers', JSON.stringify(next)) }
  function persistStudents(next) { setStudents(next); localStorage.setItem('uf_students', JSON.stringify(next)) }
  function persistPlans(next) { setPlans(next); localStorage.setItem('uf_training_plans', JSON.stringify(next)) }
  function persistNutrition(next) { setNutritionPlans(next); localStorage.setItem('uf_nutrition_plans', JSON.stringify(next)) }
  function saveComingSoon(next) { setComingSoonEnabled(next); localStorage.setItem('uf_public_settings', JSON.stringify({ comingSoonEnabled: next, launchDate })) }
  function saveLaunchDate(next) { setLaunchDate(next); localStorage.setItem('uf_launch_date', next); localStorage.setItem('uf_public_settings', JSON.stringify({ comingSoonEnabled, launchDate: next })) }

  if (!session && comingSoonEnabled && !showLogin) return <ComingSoonPage launchDate={launchDate} onLogin={() => setShowLogin(true)} />
  if (!session) return <Login onBack={comingSoonEnabled ? () => setShowLogin(false) : null} onLogin={(nextRole) => { setRole(nextRole); setSession({ name: nextRole === 'aluno' ? 'Ana Marinho' : nextRole === 'professor' ? 'Manuel Gonzalez' : 'Rui Marques' }); setPage(nextRole === 'aluno' ? 'student-home' : 'dashboard') }} />

  const isStudent = role === 'aluno'
  const isTrainer = role === 'professor'

  return (
    <div className="appShell">
      {!isStudent && <aside className="sidebar"><Logo /><nav className="navList">{NAV.map(([key, icon, label]) => <button key={key} className={page === key ? 'active' : ''} onClick={() => setPage(key)}>{icon}<span>{label}</span></button>)}</nav></aside>}
      <main className="main">
        <header className="topbar">
          <span className="appUrl">app.ultimatefit.pt</span>
          <div className="mobileOnly"><Logo /></div>
          <div className="topActions">
            <select value={role} onChange={e => { setRole(e.target.value); setPage(e.target.value === 'aluno' ? 'student-home' : 'dashboard') }}>
              <option value="admin">Admin</option>
              <option value="professor">Professor</option>
              <option value="aluno">Aluno</option>
            </select>
            <Badge type="yellow">{role === 'admin' ? 'Admin' : role === 'professor' ? 'Professor' : 'Aluno'}</Badge>
            <div className="avatar">{initials(session.name)}</div>
            <button className="ghost" onClick={() => setSession(null)}>Sair</button>
          </div>
        </header>
        <section className="content">
          {isStudent && <StudentHome />}
          {!isStudent && page === 'dashboard' && <Dashboard trainers={trainers} students={students} plans={plans} nutritionPlans={nutritionPlans} isTrainer={isTrainer} />}
          {!isStudent && page === 'students' && <StudentsPage students={students} setStudents={persistStudents} trainers={trainers} />}
          {!isStudent && page === 'trainers' && <TrainersPage trainers={trainers} setTrainers={persistTrainers} />}
          {!isStudent && page === 'assessments' && <AssessmentsPage />}
          {!isStudent && page === 'reports' && <ReportsPage />}
          {!isStudent && page === 'training' && <TrainingPage plans={plans} setPlans={persistPlans} students={students} trainers={trainers} />}
          {!isStudent && page === 'nutrition' && <NutritionPage nutritionPlans={nutritionPlans} setNutritionPlans={persistNutrition} students={students} trainers={trainers} />}
          {!isStudent && page === 'exercises' && <ExercisesPage />}
          {!isStudent && page === 'settings' && <SettingsPage comingSoonEnabled={comingSoonEnabled} onComingSoonChange={saveComingSoon} launchDate={launchDate} onLaunchDateChange={saveLaunchDate} />}
        </section>
        {isStudent && <BottomNav />}
        {!isStudent && <MobileNav page={page} setPage={setPage} />}
      </main>
    </div>
  )
}

function ComingSoonPage({ launchDate, onLogin }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  const remaining = Math.max(0, new Date(launchDate).getTime() - now)
  const days = Math.floor(remaining / 86400000)
  const hours = Math.floor((remaining % 86400000) / 3600000)
  const minutes = Math.floor((remaining % 3600000) / 60000)
  const seconds = Math.floor((remaining % 60000) / 1000)
  return <div className="comingSoonScreen">
    <div className="comingHeader"><Logo /><button className="ghost" onClick={onLogin}>Login</button></div>
    <section className="comingHero">
      <Badge type="yellow">app.ultimatefit.pt</Badge>
      <h1>COMING SOON</h1>
      <h2>ULTIMATE FIT APP</h2>
      <p>A nova área privada dos alunos ULTIMATE FIT está a ser preparada. Em breve vais poder consultar planos de treino, nutrição, avaliações físicas, evolução e relatórios num só lugar.</p>
      <div className="countdownGrid"><div><strong>{days}</strong><span>Dias</span></div><div><strong>{hours}</strong><span>Horas</span></div><div><strong>{minutes}</strong><span>Min</span></div><div><strong>{seconds}</strong><span>Seg</span></div></div>
      <div className="comingActions"><button className="primary" onClick={onLogin}>Entrar na área privada</button><small>Durante a construção, só utilizadores autorizados conseguem entrar.</small></div>
    </section>
    <section className="comingFeatures">
      <div><span>🏋️</span><strong>Planos de treino</strong><p>Prescrição personalizada com exercícios, séries, repetições e notas técnicas.</p></div>
      <div><span>🥗</span><strong>Nutrição</strong><p>Planos alimentares em PDF ou notas nutricionais associadas a cada aluno.</p></div>
      <div><span>📈</span><strong>Avaliações e relatórios</strong><p>Bioimpedância, antropometria, evolução e relatórios automáticos.</p></div>
    </section>
  </div>
}

function Login({ onLogin, onBack }) {
  const [selectedRole, setSelectedRole] = useState('admin')
  const [email, setEmail] = useState('geral@ultimatefit.pt')
  const [password, setPassword] = useState('')
  async function submit(e) {
    e.preventDefault()
    if (isSupabaseConfigured && email && password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return alert(error.message)
    }
    onLogin(selectedRole)
  }
  return <div className="loginScreen"><form className="loginCard" onSubmit={submit}>
    <Logo />
    <h1>Área ULTIMATE FIT</h1>
    <p>Login geral para Admin, Professores e Alunos. Em produção, este acesso fica ligado ao Supabase Auth.</p>
    <label>Tipo de acesso<select value={selectedRole} onChange={e => setSelectedRole(e.target.value)}><option value="admin">Admin</option><option value="professor">Professor</option><option value="aluno">Aluno</option></select></label>
    <label>Email<input value={email} onChange={e => setEmail(e.target.value)} /></label>
    <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Modo demo: podes deixar vazio" /></label>
    <button className="primary">Entrar</button>
    {onBack && <button type="button" className="ghost fullWidth" onClick={onBack}>Voltar ao Coming Soon</button>}
    <small>{isSupabaseConfigured ? 'Supabase configurado.' : 'Modo demo/local ativo. Configura o .env para login real.'}</small>
  </form></div>
}

function Dashboard({ trainers, students, plans, nutritionPlans, isTrainer }) {
  return <>
    <Header title={isTrainer ? 'Painel do Professor' : 'Dashboard'} subtitle={isTrainer ? 'Acesso aos teus alunos, prescrições, avaliações e relatórios.' : 'Gestão central da app ULTIMATE FIT: equipa, alunos, treino, nutrição e evolução.'} />
    <div className="kpiGrid">
      <Kpi icon="👥" label={isTrainer ? 'Os meus alunos' : 'Alunos ativos'} value={isTrainer ? 18 : students.length} />
      <Kpi icon="🧑‍🏫" label="Professores" value={trainers.length} />
      <Kpi icon="🏋️" label="Planos ativos" value={plans.filter(p => p.status === 'Ativo').length} />
      <Kpi icon="🥗" label="Nutrição" value={nutritionPlans.length} />
    </div>
    <div className="split">
      <Card title="🧑‍🏫 Equipa técnica" action={<Badge type="yellow">{trainers.length} contas</Badge>}><div className="stack">{trainers.map(t => <PersonRow key={t.id} person={t} />)}</div></Card>
      <Card title="👥 Alunos recentes" action={<Badge type="green">Ativos</Badge>}><div className="stack">{students.map(s => <PersonRow key={s.id} person={{ ...s, role: 'aluno' }} />)}</div></Card>
    </div>
    <EvolutionPreview />
  </>
}

function TrainersPage({ trainers, setTrainers }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  function add() { if (!name || !email) return alert('Indica nome e email.'); setTrainers([...trainers, { id: crypto.randomUUID(), role: 'professor', full_name: name, email, status: 'ativo' }]); setName(''); setEmail('') }
  function remove(id) { setTrainers(trainers.filter(t => t.id !== id)) }
  return <><Header title="Professores" subtitle="Cria contas de professores para prescrever planos, enviar nutrição, registar avaliações e gerar relatórios." />
    <div className="split slim"><Card title="+ Adicionar professor"><div className="formGrid single"><label>Nome<input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do professor" /></label><label>Email<input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@ultimatefit.pt" /></label><button className="primary" onClick={add}>Criar professor</button></div><InviteNote type="professor" email={email} /></Card>
    <Card title="Equipa atual"><div className="stack">{trainers.map(t => <PersonRow key={t.id} person={t} actions={t.role !== 'admin' && <button className="danger" onClick={() => remove(t.id)}>Remover</button>} />)}</div></Card></div></>
}

function StudentsPage({ students, setStudents, trainers }) {
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', nif: '', birth_date: '', sex: 'Feminino', trainer_id: trainers[0]?.id })
  function update(k, v) { setForm({ ...form, [k]: v }) }
  function add() { if (!form.full_name || !form.email) return alert('Nome e email são obrigatórios.'); setStudents([...students, { ...form, id: crypto.randomUUID(), status: 'ativo' }]); setForm({ full_name: '', email: '', phone: '', nif: '', birth_date: '', sex: 'Feminino', trainer_id: trainers[0]?.id }) }
  return <><Header title="Alunos" subtitle="Registo do aluno com perfil, NIF, contacto, professor, avaliações, planos e nutrição." />
    <Card title="+ Novo aluno" action={<Badge type="yellow">Email + WhatsApp</Badge>}><div className="formGrid"><label>Nome<input value={form.full_name} onChange={e => update('full_name', e.target.value)} /></label><label>Email<input value={form.email} onChange={e => update('email', e.target.value)} /></label><label>Telemóvel<input value={form.phone} onChange={e => update('phone', e.target.value)} /></label><label>NIF<input value={form.nif} onChange={e => update('nif', e.target.value)} /></label><label>Data nascimento<input type="date" value={form.birth_date} onChange={e => update('birth_date', e.target.value)} /></label><label>Sexo<select value={form.sex} onChange={e => update('sex', e.target.value)}><option>Feminino</option><option>Masculino</option><option>Outro</option></select></label><label>Professor<select value={form.trainer_id} onChange={e => update('trainer_id', e.target.value)}>{trainers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select></label><button className="primary" onClick={add}>Criar aluno</button></div><InviteNote type="aluno" email={form.email} phone={form.phone} /></Card>
    <div className="cardsGrid">{students.map(s => <div className="studentCard" key={s.id}><PersonRow person={{ ...s, role: 'aluno' }} /><div className="infoGrid"><Info label="NIF" value={s.nif} /><Info label="Sexo" value={s.sex} /><Info label="Telemóvel" value={s.phone} /><Info label="Professor" value={trainers.find(t => t.id === s.trainer_id)?.full_name || '-'} /></div></div>)}</div>
  </>
}

function AssessmentsPage() {
  return <><Header title="Avaliações Físicas" subtitle="Bioimpedância, antropometria, anamnese, fotos e geração automática de relatório." /><div className="split"><Card title="Nova avaliação"><div className="formGrid">{['Peso','Altura','Massa gorda %','Massa gorda kg','Massa muscular kg','Água corporal %','Gordura visceral','Metabolismo basal','Idade metabólica','Cintura','Abdómen','Anca','Peito','Braço D','Braço E','Coxa D','Coxa E','Gémeo D','Gémeo E'].map(f => <label key={f}>{f}<input placeholder="Inserir valor" /></label>)}<label className="wide">Breve anamnese<textarea placeholder="Objetivo, lesões, dores, medicação, sono, stress, rotina, observações..." /></label></div><button className="primary">Guardar e gerar relatório</button></Card><Card title="Fotos de evolução"><div className="photoGrid"><div>Frente</div><div>Lado</div><div>Costas</div></div></Card></div><EvolutionPreview /></>
}

function ReportsPage() {
  return <><Header title="Relatórios" subtitle="Pré-visualização do relatório automático criado a partir das avaliações físicas." /><Card title="Relatório de Avaliação Física — Ana Marinho" action={<button className="primary">Exportar PDF</button>}><div className="report"><h2>Resumo</h2><p>Entre a avaliação inicial e a avaliação atual, a aluna reduziu peso, massa gorda e perímetro de cintura, mantendo uma evolução positiva da massa muscular. A análise deve ser feita em conjunto com rotina, sono, treino, alimentação e contexto individual.</p><div className="metricGrid"><Metric label="Peso" initial="78.4 kg" current="72.4 kg" diff="-6.0 kg" /><Metric label="Massa gorda" initial="24%" current="18.7%" diff="-5.3%" /><Metric label="Cintura" initial="92 cm" current="82 cm" diff="-10 cm" /><Metric label="Massa muscular" initial="57.2 kg" current="60.1 kg" diff="+2.9 kg" /></div><h2>Notas do treinador</h2><p>Continuar progressão de força, manter consistência semanal e reforçar hidratação/recuperação.</p></div></Card></>
}

function TrainingPage({ plans, setPlans, students, trainers }) {
  const [selected, setSelected] = useState([])
  const [group, setGroup] = useState('Todos')
  const [equipment, setEquipment] = useState('Todos')
  const [query, setQuery] = useState('')
  const filtered = exercises.filter(ex => (group === 'Todos' || ex.group === group) && (equipment === 'Todos' || ex.equipment === equipment) && (`${ex.name} ${ex.group} ${ex.type}`.toLowerCase().includes(query.toLowerCase())))
  function addExercise(ex) { if (!selected.find(s => s.id === ex.id)) setSelected([...selected, { ...ex, sets: '3', reps: '12', rest: '60s' }]) }
  function addPlan() { setPlans([...plans, { id: crypto.randomUUID(), name: 'Novo plano de treino', student: students[0]?.full_name || 'Aluno', trainer: trainers[0]?.full_name || 'Professor', frequency: '3x/semana', status: 'Rascunho' }]) }
  return <><Header title="Planos de Treino" subtitle="Criação de planos com biblioteca grande de exercícios dividida por grupos musculares, equipamento e tipo." /><div className="split trainingSplit"><Card title="Biblioteca de exercícios" action={<Badge type="yellow">{filtered.length} exercícios</Badge>}><div className="filters"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Pesquisar exercício..." /><select value={group} onChange={e => setGroup(e.target.value)}><option>Todos</option>{exerciseGroups.map(g => <option key={g}>{g}</option>)}</select><select value={equipment} onChange={e => setEquipment(e.target.value)}><option>Todos</option>{equipmentList.map(e => <option key={e}>{e}</option>)}</select></div><div className="exerciseList">{filtered.map(ex => <button key={ex.id} className={`exerciseItem ${selected.find(s => s.id === ex.id) ? 'picked' : ''}`} onClick={() => addExercise(ex)}><strong>{ex.name}</strong><span>{ex.group} · {ex.type} · {ex.equipment}</span><small>{ex.cues}</small></button>)}</div></Card><Card title="Plano em criação" action={<button className="primary" onClick={addPlan}>Guardar plano</button>}><div className="formGrid single"><label>Aluno<select>{students.map(s => <option key={s.id}>{s.full_name}</option>)}</select></label><label>Nome do plano<input placeholder="Ex: Hipertrofia — Fase 1" /></label><label>Frequência<input placeholder="Ex: 3x/semana" /></label></div><div className="selectedList">{selected.length === 0 ? <p>Escolhe exercícios na biblioteca para construir o plano.</p> : selected.map((ex, idx) => <div className="selectedExercise" key={ex.id}><strong>{idx + 1}. {ex.name}</strong><span>{ex.group}</span><input defaultValue={ex.sets} /><input defaultValue={ex.reps} /><input defaultValue={ex.rest} /></div>)}</div></Card></div><Card title="Planos existentes"><div className="cardsGrid compact">{plans.map(p => <div className="studentCard" key={p.id}><h3>{p.name}</h3><p>{p.student} · {p.trainer}</p><Badge type={p.status === 'Ativo' ? 'green' : 'yellow'}>{p.status}</Badge></div>)}</div></Card></>
}

function NutritionPage({ nutritionPlans, setNutritionPlans, students, trainers }) {
  function addNutritionPlan() { setNutritionPlans([...nutritionPlans, { id: crypto.randomUUID(), title: 'Novo plano nutricional', student: students[0]?.full_name || 'Aluno', trainer: trainers[0]?.full_name || 'Professor', status: 'Rascunho' }]) }
  return <><Header title="Nutrição" subtitle="Envio de planos alimentares em PDF, notas nutricionais e documentos associados ao aluno." /><div className="split"><Card title="Novo plano nutricional" action={<button className="primary" onClick={addNutritionPlan}>Guardar</button>}><div className="formGrid single"><label>Aluno<select>{students.map(s => <option key={s.id}>{s.full_name}</option>)}</select></label><label>Título<input placeholder="Ex: Plano alimentar — Julho" /></label><label>Upload PDF<input type="file" /></label><label>Notas<textarea placeholder="Notas internas, orientações, restrições, observações..." /></label></div></Card><Card title="Planos nutricionais"><div className="stack">{nutritionPlans.map(p => <div key={p.id} className="personRow"><div className="miniAvatar">🥗</div><div><strong>{p.title}</strong><small>{p.student} · {p.trainer}</small></div><Badge type={p.status === 'Ativo' ? 'green' : 'yellow'}>{p.status}</Badge></div>)}</div></Card></div></>
}

function ExercisesPage() {
  const counts = exerciseGroups.map(g => ({ group: g, total: exercises.filter(e => e.group === g).length }))
  return <><Header title="Biblioteca de Exercícios" subtitle="Base inicial de exercícios para musculação, funcional, Cross Training, mobilidade, alongamentos e cardio." /><div className="cardsGrid compact">{counts.map(c => <div className="studentCard" key={c.group}><h3>{c.group}</h3><p>{c.total} exercícios disponíveis</p><Badge type="yellow">Grupo muscular</Badge></div>)}</div><Card title="Lista completa"><div className="exerciseList wideList">{exercises.map(ex => <div className="exerciseItem" key={ex.id}><strong>{ex.name}</strong><span>{ex.group} · {ex.type} · {ex.equipment}</span><small>{ex.cues}</small></div>)}</div></Card></>
}

function SettingsPage({ comingSoonEnabled, onComingSoonChange, launchDate, onLaunchDateChange }) {
  return <><Header title="Definições" subtitle="Gestão da página pública, permissões, PWA e configurações gerais da app." /><Card title="Página Coming Soon"><div className="settingsGrid"><label className="toggleLine"><input type="checkbox" checked={comingSoonEnabled} onChange={e => onComingSoonChange(e.target.checked)} /> Mostrar Coming Soon ao público</label><label>Data prevista de lançamento<input type="datetime-local" value={toDateInputValue(launchDate)} onChange={e => onLaunchDateChange(new Date(e.target.value).toISOString())} /></label></div><p className="settingsHint">Enquanto estiver ativo, app.ultimatefit.pt mostra a página Coming Soon. O botão Login dá acesso à área privada em construção. Quando a app estiver concluída, desligas esta opção.</p></Card><Card title="PWA / Atalho no telemóvel"><p>A app já inclui manifest e service worker para poder ser adicionada ao ecrã inicial do telemóvel. Em iPhone, normalmente o aluno terá de usar Safari → Partilhar → Adicionar ao ecrã principal.</p></Card></>
}

function StudentHome() {
  return <div className="studentHome"><div className="studentHero"><div><h1>Olá, Ana 👋</h1><p>Área do Aluno</p></div><div className="avatar big">AM</div></div><Card><div className="next"><div className="icon black">🏋️</div><div><strong>Plano ativo</strong><span>Hipertrofia — Fase 1</span></div></div></Card><div className="studentTiles"><div>🏋️<strong>Plano de Treino</strong></div><div>🥗<strong>Nutrição</strong></div><div>📋<strong>Avaliações</strong></div><div>📈<strong>Evolução</strong></div></div><Card title="Exercício de hoje"><div className="exercisePreview"><div className="gifBox">GIF</div><div><Badge type="yellow">Treino A</Badge><h3>Agachamento Goblet</h3><p>3 séries · 12 repetições · 60s descanso</p></div></div></Card><EvolutionPreview compact /></div>
}

function EvolutionPreview({ compact = false }) {
  return <Card title="📈 Evolução — exemplo automático" action={!compact && <Badge type="green">Relatório pronto</Badge>}><div className="metricGrid"><Metric label="Peso" initial="78.4 kg" current="72.4 kg" diff="-6.0 kg" /><Metric label="Massa gorda" initial="24.0%" current="18.7%" diff="-5.3%" /><Metric label="Cintura" initial="92 cm" current="82 cm" diff="-10 cm" /><Metric label="Massa muscular" initial="57.2 kg" current="60.1 kg" diff="+2.9 kg" /></div>{!compact && <div className="chartBox"><ResponsiveContainer width="100%" height={260}><LineChart data={demoAssessments}><CartesianGrid stroke="rgba(255,255,255,.07)" /><XAxis dataKey="month" stroke="#777" /><YAxis stroke="#777" /><Tooltip contentStyle={{ background: '#09090b', border: '1px solid rgba(255,255,255,.12)', color: '#fff' }} /><Line dataKey="weight" stroke="#ffd908" strokeWidth={3} /><Line dataKey="bodyFat" stroke="#a1a1aa" strokeWidth={3} /></LineChart></ResponsiveContainer></div>}</Card>
}

function Header({ title, subtitle }) { return <div className="sectionHead"><h1>{title}</h1><p>{subtitle}</p></div> }
function Logo() { return <div className="logo"><div className="logoMark">UF</div><strong>ULTIMATE <span>FIT</span></strong></div> }
function Card({ title, action, children }) { return <div className="card">{title && <div className="cardHead"><h2>{title}</h2>{action}</div>}{children}</div> }
function Kpi({ icon, label, value }) { return <div className="card kpi"><div className="icon">{icon}</div><div><small>{label}</small><strong>{value}</strong></div></div> }
function Badge({ children, type = '' }) { return <span className={`pill ${type}`}>{children}</span> }
function initials(name = '') { return name.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase() }
function PersonRow({ person, actions }) { return <div className="personRow"><div className="miniAvatar">{initials(person.full_name)}</div><div><strong>{person.full_name}</strong><small>{person.email}</small></div><Badge type={person.role === 'admin' ? 'yellow' : person.role === 'aluno' ? 'green' : 'gray'}>{person.role}</Badge>{actions}</div> }
function Metric({ label, initial, current, diff }) { return <div className="metric"><small>{label}</small><div className="metricVals"><span>Inicial <b>{initial}</b></span><span>Atual <b>{current}</b></span></div><strong className="positive">{diff}</strong></div> }
function Info({ label, value }) { return <div className="info"><small>{label}</small><b>{value || '-'}</b></div> }

function InviteNote({ type, email, phone }) {
  const msg = type === 'aluno'
    ? 'Olá! Foi criada a tua área ULTIMATE FIT. Vais receber um email para criares a tua password. Depois entra em https://app.ultimatefit.pt para veres os teus planos de treino, nutrição, avaliações e relatórios.'
    : 'Olá! Foi criada a tua conta de Professor ULTIMATE FIT. Vais receber um email para criares a tua password e acederes à área de gestão.'
  return <div className="inviteBox"><strong>Fluxo de convite:</strong><p>1. A app envia email para criar password. 2. Tu envias WhatsApp com as instruções. 3. O utilizador entra em app.ultimatefit.pt.</p><textarea readOnly value={msg} /><div className="rowActions"><button className="ghost" onClick={() => navigator.clipboard?.writeText(msg)}>Copiar mensagem WhatsApp</button>{email && <small>Email: {email}</small>}{phone && <small>WhatsApp: {phone}</small>}</div></div>
}
function MobileNav({ page, setPage }) { return <nav className="mobileNav">{NAV.slice(0, 6).map(([key, icon, label]) => <button key={key} className={page === key ? 'active' : ''} onClick={() => setPage(key)}>{icon}<span>{label}</span></button>)}</nav> }
function BottomNav() { return <nav className="bottomNav"><button>🏠<span>Início</span></button><button>🏋️<span>Treino</span></button><button>🥗<span>Nutrição</span></button><button>📋<span>Avaliações</span></button><button>👤<span>Perfil</span></button></nav> }

createRoot(document.getElementById('root')).render(<App />)
