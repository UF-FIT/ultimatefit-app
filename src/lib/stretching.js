const STRETCHES = [
  {
    key: 'neck',
    title: 'Pescoço',
    subtitle: 'Inclinação lateral assistida',
    image: '/stretching/neck.webp',
    description: 'Inclina suavemente a cabeça para o lado, mantendo o ombro oposto relaxado. Sem puxar com força.',
  },
  {
    key: 'shoulders',
    title: 'Ombros',
    subtitle: 'Deltoide cruzado',
    image: '/stretching/shoulders.webp',
    description: 'Leva o braço à frente do peito e aproxima-o suavemente com o outro braço, sem elevar o ombro.',
  },
  {
    key: 'chest',
    title: 'Peitoral',
    subtitle: 'Abertura / extensão peitoral',
    image: '/stretching/chest.webp',
    description: 'Abre o peito de forma progressiva, mantendo a postura controlada e sem compensar excessivamente na lombar.',
  },
  {
    key: 'back',
    title: 'Costas',
    subtitle: 'Alcance à frente · barra · rotação lombar',
    image: '/stretching/back.webp',
    description: 'Escolhe uma variante confortável para alongar dorsais e região lombar, com movimento lento e controlado.',
  },
  {
    key: 'arms',
    title: 'Braços',
    subtitle: 'Tríceps · bíceps / antebraço',
    image: '/stretching/arms.webp',
    description: 'Alongamento suave de tríceps ou bíceps/antebraço conforme o grupo trabalhado, sem bloquear a articulação.',
  },
  {
    key: 'core',
    title: 'Core',
    subtitle: 'Cobra · gato-vaca · posição da criança · oblíquos',
    image: '/stretching/core.webp',
    description: 'Usa uma posição confortável para mobilizar o tronco e alongar a zona abdominal e lateral sem provocar dor.',
  },
  {
    key: 'hip',
    title: 'Anca / quadril',
    subtitle: 'Flexores · adutores · glúteos',
    image: '/stretching/hip.webp',
    description: 'Escolhe a variante mais adequada para flexores da anca, adutores ou glúteos. Mantém a bacia controlada.',
  },
  {
    key: 'front-legs',
    title: 'Pernas — frente',
    subtitle: 'Quadríceps',
    image: '/stretching/front-legs.webp',
    description: 'Alongamento do quadríceps em pé ou deitado, mantendo os joelhos alinhados e sem forçar a lombar.',
  },
  {
    key: 'back-legs',
    title: 'Pernas — trás',
    subtitle: 'Glúteos · isquiotibiais',
    image: '/stretching/back-legs.webp',
    description: 'Alongamento progressivo da cadeia posterior. Mantém o tronco controlado e evita movimentos bruscos.',
  },
  {
    key: 'calves',
    title: 'Gémeos',
    subtitle: 'Gémeos na parede',
    image: '/stretching/calves.webp',
    description: 'Mantém o calcanhar apoiado e aproxima o corpo da parede até sentires tensão confortável no gémeo.',
  },
];

function normalise(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function add(map, key, reason) {
  if (!key) return;
  if (!map.has(key)) map.set(key, new Set());
  if (reason) map.get(key).add(reason);
}

function addFromGroup(map, rawGroup) {
  const group = normalise(rawGroup);
  if (!group || group === 'texto livre') return;

  if (/ombro|deltoid|trapez|cervical/.test(group)) {
    add(map, 'shoulders', rawGroup);
    add(map, 'neck', rawGroup);
  }
  if (/peit|peitoral/.test(group)) add(map, 'chest', rawGroup);
  if (/cost|dorsal|lombar/.test(group)) add(map, 'back', rawGroup);
  if (/bicep|tricep|antebrac|braco/.test(group)) add(map, 'arms', rawGroup);
  if (/abdomin|core|obliqu/.test(group)) add(map, 'core', rawGroup);
  if (/glute|anca|quadril|adutor|abdutor|virilha/.test(group)) add(map, 'hip', rawGroup);
  if (/quadricep|coxa anterior/.test(group)) add(map, 'front-legs', rawGroup);
  if (/isquio|posterior.*coxa|femoral/.test(group)) add(map, 'back-legs', rawGroup);
  if (/gemeo|panturrilha|soleo/.test(group)) add(map, 'calves', rawGroup);

  if (/^perna(s)?$|membros inferiores|lower body/.test(group)) {
    add(map, 'hip', rawGroup);
    add(map, 'front-legs', rawGroup);
    add(map, 'back-legs', rawGroup);
    add(map, 'calves', rawGroup);
  }
  if (/corpo inteiro|full body/.test(group)) {
    ['shoulders','neck','chest','back','arms','core','hip','front-legs','back-legs','calves'].forEach(key => add(map, key, rawGroup));
  }
}

function addCardioNameHints(map, item) {
  const group = normalise(item?.exercise?.group);
  if (!group.includes('cardio')) return;
  const name = normalise(item?.exercise?.name || item?.manualName || '');

  if (/jumping jack/.test(name)) {
    add(map, 'shoulders', 'Cardio');
    add(map, 'neck', 'Cardio');
    add(map, 'hip', 'Cardio');
    add(map, 'calves', 'Cardio');
  } else if (/burpee/.test(name)) {
    add(map, 'shoulders', 'Cardio');
    add(map, 'chest', 'Cardio');
    add(map, 'hip', 'Cardio');
    add(map, 'calves', 'Cardio');
  } else if (/mountain climber|escalador/.test(name)) {
    add(map, 'shoulders', 'Cardio');
    add(map, 'core', 'Cardio');
    add(map, 'hip', 'Cardio');
  } else if (/corrid|passadeira|sprint|salto|corda|step/.test(name)) {
    add(map, 'hip', 'Cardio');
    add(map, 'back-legs', 'Cardio');
    add(map, 'calves', 'Cardio');
  } else if (/bicic|bike|ciclo|remo/.test(name)) {
    add(map, 'hip', 'Cardio');
    add(map, 'front-legs', 'Cardio');
    add(map, 'back-legs', 'Cardio');
  }
}

export function getSessionStretchingRecommendations(session) {
  const selected = new Map();
  const items = (session?.blocks || []).flatMap(block => block?.items || []);

  items.forEach(item => {
    if (item?.exercise?.group) addFromGroup(selected, item.exercise.group);
    addCardioNameHints(selected, item);
  });

  return STRETCHES
    .filter(stretch => selected.has(stretch.key))
    .map(stretch => ({
      ...stretch,
      matchedGroups: Array.from(selected.get(stretch.key) || []),
    }));
}

export const stretchingRules = [
  { label: '20–30 s', detail: 'por alongamento' },
  { label: '1–2 séries', detail: 'por lado' },
  { label: 'Respiração', detail: 'calma e contínua' },
  { label: 'Sem dor', detail: 'tensão confortável' },
];
