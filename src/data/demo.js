export const demoTrainers = [
  { id:'u-rui', role:'admin', full_name:'Rui Marques', email:'geral@ultimatefit.pt', phone:'', status:'ativo' },
  { id:'u-manuel', role:'professor', full_name:'Manuel Gonzalez', email:'manuel@ultimatefit.pt', phone:'', status:'ativo' },
  { id:'u-diana', role:'professor', full_name:'Diana Santos', email:'diana@ultimatefit.pt', phone:'', status:'ativo' },
]

export const demoStudents = [
  { id:'s-ana', full_name:'Ana Marinho', email:'ana@email.com', phone:'910000000', nif:'123456789', birth_date:'1990-05-12', sex:'Feminino', trainer_id:'u-rui', status:'ativo' },
  { id:'s-joao', full_name:'João Silva', email:'joao@email.com', phone:'919000000', nif:'234567891', birth_date:'1987-09-20', sex:'Masculino', trainer_id:'u-manuel', status:'ativo' },
  { id:'s-gabriela', full_name:'Gabriela Cruz', email:'gabriela@email.com', phone:'912000000', nif:'345678912', birth_date:'1995-01-04', sex:'Feminino', trainer_id:'u-diana', status:'ativo' },
]

export const demoAssessments = [
  { month:'Jan', weight:78.4, bodyFat:24, waist:92, muscle:57.2, visceralFat:9 },
  { month:'Fev', weight:77.1, bodyFat:22.5, waist:89, muscle:58.1, visceralFat:8 },
  { month:'Mar', weight:75.8, bodyFat:20.8, waist:87, muscle:58.9, visceralFat:8 },
  { month:'Abr', weight:74.6, bodyFat:19.6, waist:84, muscle:59.5, visceralFat:7 },
  { month:'Mai', weight:72.4, bodyFat:18.7, waist:82, muscle:60.1, visceralFat:7 },
]

export const demoPlans = [
  { id:'p1', name:'Hipertrofia — Fase 1', student:'Ana Marinho', trainer:'Rui Marques', frequency:'3x/semana', status:'Ativo' },
  { id:'p2', name:'Perda de gordura — Circuito', student:'João Silva', trainer:'Manuel Gonzalez', frequency:'2x/semana', status:'Rascunho' },
]

export const demoNutritionPlans = [
  { id:'n1', title:'Plano nutricional — Maio', student:'Ana Marinho', trainer:'Rui Marques', status:'Ativo' },
  { id:'n2', title:'Guia alimentar base', student:'João Silva', trainer:'Manuel Gonzalez', status:'Rascunho' },
]
