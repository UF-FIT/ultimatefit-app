import { supabase } from './supabase';

const builtInAutomaticStretchingCatalog = [
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
    subtitle: 'Extensão peitoral',
    image: '/stretching/chest.webp',
    description: 'Leva os braços suavemente para trás e abre o peito de forma progressiva, sem compensar excessivamente na lombar.',
  },
  {
    key: 'back',
    title: 'Costas',
    subtitle: 'Alcance à frente',
    image: '/stretching/back.webp',
    description: 'Senta a bacia em direção aos calcanhares e alcança à frente com os braços, alongando costas e dorsais sem forçar.',
  },
  {
    key: 'arms',
    title: 'Braços',
    subtitle: 'Tríceps',
    image: '/stretching/arms.webp',
    description: 'Leva uma mão atrás da cabeça e aproxima suavemente o cotovelo, mantendo o tronco estável e sem forçar o ombro.',
  },
  {
    key: 'core',
    title: 'Core',
    subtitle: 'Gato-vaca',
    image: '/stretching/core.webp',
    description: 'Alterna lentamente entre arredondar e estender a coluna, coordenando o movimento com uma respiração calma.',
  },
  {
    key: 'hip',
    title: 'Anca / quadril',
    subtitle: 'Flexor da anca',
    image: '/stretching/hip.webp',
    description: 'Avança suavemente a bacia mantendo o tronco alto, até sentires tensão confortável na parte anterior da anca.',
  },
  {
    key: 'front-legs',
    title: 'Pernas — frente',
    subtitle: 'Quadríceps em pé',
    image: '/stretching/front-legs.webp',
    description: 'Aproxima o calcanhar do glúteo, mantém os joelhos alinhados e a bacia estável, sem arquear a lombar.',
  },
  {
    key: 'back-legs',
    title: 'Pernas — trás',
    subtitle: 'Isquiotibiais em pé',
    image: '/stretching/back-legs.webp',
    description: 'Apoia o calcanhar numa superfície e inclina o tronco ligeiramente à frente, mantendo a coluna controlada.',
  },
  {
    key: 'calves',
    title: 'Gémeos',
    subtitle: 'Gémeos na parede',
    image: '/stretching/calves.webp',
    description: 'Mantém o calcanhar apoiado e aproxima o corpo da parede até sentires tensão confortável no gémeo.',
  },
];

function publicMediaUrl(path = '') {
  if (!path || !supabase) return '';
  return supabase.storage.from('exercise-media').getPublicUrl(path).data.publicUrl || '';
}

function mergeAutomaticStretchingCatalog(overrides = []) {
  return builtInAutomaticStretchingCatalog.map(fallback => {
    const stored = overrides.find(item => item?.key === fallback.key) || {};
    const mediaPath = stored.mediaPath || '';
    const externalMediaUrl = stored.externalMediaUrl || '';
    const mediaUrl = externalMediaUrl || publicMediaUrl(mediaPath) || stored.image || fallback.image;
    return {
      ...fallback,
      ...stored,
      key: fallback.key,
      title: stored.title || fallback.title,
      subtitle: stored.subtitle || fallback.subtitle,
      description: stored.description || fallback.description,
      image: mediaUrl,
      mediaPath,
      mediaKind: stored.mediaKind || '',
      externalMediaUrl,
      mediaUrl,
    };
  });
}

export const automaticStretchingCatalog = mergeAutomaticStretchingCatalog();

export function applyAutomaticStretchingCatalog(items = []) {
  const merged = mergeAutomaticStretchingCatalog(items);
  automaticStretchingCatalog.splice(0, automaticStretchingCatalog.length, ...merged);
  return automaticStretchingCatalog;
}

async function hydrateAutomaticStretchingCatalog() {
  if (!supabase) return;
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', 'automatic_stretching_catalog')
      .maybeSingle();
    if (error) return;
    if (Array.isArray(data?.setting_value)) applyAutomaticStretchingCatalog(data.setting_value);
  } catch {
    // Built-in catalogue remains available if remote settings cannot be read.
  }
}

hydrateAutomaticStretchingCatalog();

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

  return automaticStretchingCatalog
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
