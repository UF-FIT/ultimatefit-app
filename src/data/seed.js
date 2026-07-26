export const seedUsers = [
  { id:'u-admin', role:'admin', name:'Rui Marques', email:'geral@ultimatefit.pt', active:true },
  { id:'u-manuel', role:'professor', name:'Manuel Gonzalez', email:'manuel@ultimatefit.pt', active:true },
  { id:'u-diana', role:'professor', name:'Diana Santos', email:'diana@ultimatefit.pt', active:true },
  { id:'u-ana', role:'aluno', name:'Ana Marinho', email:'ana@email.com', active:true },
];

export const seedStudents = [
  { id:'s-ana', userId:'u-ana', name:'Ana Marinho', nif:'123456789', birth:'1990-05-12', sex:'Feminino', phone:'910000000', email:'ana@email.com', photo:'', trainerIds:['u-admin'], active:true, objective:'Perda de massa gorda e aumento de força' },
  { id:'s-joao', name:'João Silva', nif:'234567891', birth:'1987-09-20', sex:'Masculino', phone:'919000000', email:'joao@email.com', photo:'', trainerIds:['u-manuel'], active:true, objective:'Hipertrofia' },
  { id:'s-gabriela', name:'Gabriela Cruz', nif:'345678912', birth:'1995-01-04', sex:'Feminino', phone:'912000000', email:'gabriela@email.com', photo:'', trainerIds:['u-diana'], active:true, objective:'Mobilidade e força geral' },
];

export const seedAssessments = [
  { id:'a1', studentId:'s-ana', date:'2026-01-12', weight:78.4, height:1.68, fat:24, muscle:57.2, visceral:9, waist:92, abdomen:96, hip:104, armR:31, armL:30.5, thighR:58, thighL:57.5, notes:'Avaliação inicial. Sono irregular e desconforto lombar ocasional.' },
  { id:'a2', studentId:'s-ana', date:'2026-05-12', weight:72.4, height:1.68, fat:18.7, muscle:60.1, visceral:7, waist:82, abdomen:86, hip:98, armR:32.5, armL:32, thighR:56, thighL:55.8, notes:'Boa adesão ao treino e melhoria clara de composição corporal.' },
];

export const seedExercises = [
  ['Agachamento Goblet','Pernas','Halter/Kettlebell','Força','Intermédio'],
  ['Agachamento Livre','Pernas','Barra','Força','Intermédio'],
  ['Agachamento Frontal','Pernas','Barra','Força','Avançado'],
  ['Leg Press','Pernas','Máquina','Hipertrofia','Iniciante'],
  ['Extensão de Pernas','Quadríceps','Máquina','Hipertrofia','Iniciante'],
  ['Curl Femoral','Posteriores','Máquina','Hipertrofia','Iniciante'],
  ['Peso Morto Romeno','Posteriores','Barra/Halteres','Força','Intermédio'],
  ['Hip Thrust','Glúteos','Barra','Hipertrofia','Intermédio'],
  ['Afundo Caminhado','Pernas','Halteres','Funcional','Intermédio'],
  ['Elevação de Gémeos','Gémeos','Máquina/Halteres','Hipertrofia','Iniciante'],
  ['Supino Plano','Peito','Barra','Força','Intermédio'],
  ['Supino Inclinado com Halteres','Peito','Halteres','Hipertrofia','Intermédio'],
  ['Crucifixo na Polia','Peito','Polia','Hipertrofia','Intermédio'],
  ['Flexões','Peito','Peso corporal','Funcional','Iniciante'],
  ['Remada Baixa','Costas','Polia','Hipertrofia','Iniciante'],
  ['Remada Curvada','Costas','Barra','Força','Intermédio'],
  ['Puxada Frontal','Costas','Polia','Hipertrofia','Iniciante'],
  ['Elevações na Barra','Costas','Peso corporal','Força','Avançado'],
  ['Desenvolvimento Militar','Ombros','Barra/Halteres','Força','Intermédio'],
  ['Elevação Lateral','Ombros','Halteres','Hipertrofia','Iniciante'],
  ['Face Pull','Ombros','Polia','Prevenção','Iniciante'],
  ['Curl Bíceps','Bíceps','Halteres','Hipertrofia','Iniciante'],
  ['Curl Martelo','Bíceps','Halteres','Hipertrofia','Iniciante'],
  ['Extensão de Tríceps na Polia','Tríceps','Polia','Hipertrofia','Iniciante'],
  ['Fundos em Paralelas','Tríceps','Peso corporal','Força','Avançado'],
  ['Prancha','Core','Peso corporal','Estabilidade','Iniciante'],
  ['Dead Bug','Core','Peso corporal','Estabilidade','Iniciante'],
  ['Pallof Press','Core','Polia/Banda','Estabilidade','Intermédio'],
  ['Russian Twist','Core','Peso corporal/Halter','Funcional','Intermédio'],
  ['Burpee','Corpo inteiro','Peso corporal','Condicionamento','Intermédio'],
  ['Kettlebell Swing','Corpo inteiro','Kettlebell','Funcional','Intermédio'],
  ['Thruster','Corpo inteiro','Barra/Halteres','Cross Training','Avançado'],
  ['Wall Ball','Corpo inteiro','Bola medicinal','Cross Training','Intermédio'],
  ['Box Jump','Pernas','Caixa','Pliometria','Intermédio'],
  ['Farmer Walk','Corpo inteiro','Halteres/Kettlebell','Funcional','Iniciante'],
  ['Sled Push','Corpo inteiro','Sled','Condicionamento','Intermédio'],
  ['Bike Erg','Cardio','Bicicleta','Cardio','Iniciante'],
  ['Remo Ergómetro','Cardio','Remo','Cardio','Iniciante'],
  ['Corrida em Passadeira','Cardio','Passadeira','Cardio','Iniciante'],
  ['Mobilidade de Tornozelo','Mobilidade','Peso corporal','Mobilidade','Iniciante'],
  ['Rotação Torácica','Mobilidade','Peso corporal','Mobilidade','Iniciante'],
  ['90/90 da Anca','Mobilidade','Peso corporal','Mobilidade','Iniciante'],
  ['Alongamento Flexores da Anca','Alongamentos','Peso corporal','Alongamento','Iniciante'],
  ['Alongamento Peitoral na Parede','Alongamentos','Parede','Alongamento','Iniciante'],
  ['Child’s Pose','Alongamentos','Peso corporal','Alongamento','Iniciante']
].map((e,i)=>({id:`ex-${i+1}`,name:e[0],group:e[1],equipment:e[2],type:e[3],level:e[4],description:'Executar com controlo, amplitude adequada e técnica definida pelo professor.',media:''}));

export const seedPlans = [
  { id:'p1', studentId:'s-ana', trainerId:'u-admin', title:'Plano Base — Fase 1', status:'Ativo', startDate:'2026-05-01', weeks:6, sessions:[
    { name:'Treino A — Inferiores', items:[{exerciseId:'ex-1',sets:3,reps:'12',rest:'60s',notes:'Carga moderada'},{exerciseId:'ex-7',sets:3,reps:'10',rest:'75s',notes:'Controlo excêntrico'},{exerciseId:'ex-8',sets:4,reps:'12',rest:'75s',notes:''}]},
    { name:'Treino B — Superiores', items:[{exerciseId:'ex-12',sets:3,reps:'10',rest:'60s',notes:''},{exerciseId:'ex-15',sets:4,reps:'10',rest:'75s',notes:''},{exerciseId:'ex-20',sets:3,reps:'15',rest:'45s',notes:''}]}
  ]}
];

export const seedNutrition = [{id:'n1',studentId:'s-ana',title:'Plano alimentar — Maio',fileName:'plano_ana_maio.pdf',notes:'Documento disponibilizado pelo profissional responsável.',active:true}];
export const seedGoals = [{id:'g1',studentId:'s-ana',title:'Reduzir perímetro da cintura',target:'-5 cm',deadline:'2026-08-31',progress:65}];
export const seedChallenges = [{id:'c1',title:'52 Treinos em 90 Dias',description:'Criar consistência e compromisso com o treino.',active:true}];
export const seedMessages = [{id:'m1',studentId:'s-ana',trainerId:'u-admin',title:'Plano atualizado',body:'O teu plano foi revisto. Confirma as notas dos exercícios antes do próximo treino.',date:'2026-07-25'}];
