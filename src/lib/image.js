const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('Não foi possível converter a imagem.')),
      'image/webp',
      quality,
    );
  });
}

async function loadImageSource(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      return createImageBitmap(file);
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
      element.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function renderSquare(source, size, quality) {
  const sourceWidth = source.width || source.naturalWidth;
  const sourceHeight = source.height || source.naturalHeight;
  const side = Math.min(sourceWidth, sourceHeight);
  const sx = Math.max(0, (sourceWidth - side) / 2);
  const sy = Math.max(0, (sourceHeight - side) / 2);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { alpha: false });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.fillStyle = '#111';
  context.fillRect(0, 0, size, size);
  context.drawImage(source, sx, sy, side, side, 0, 0, size, size);
  return canvasToBlob(canvas, quality);
}

export async function optimiseStudentAvatar(file) {
  if (!file) return null;
  if (!file.type.startsWith('image/')) throw new Error('Seleciona um ficheiro de imagem.');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('A fotografia original não pode ultrapassar 15 MB.');

  const source = await loadImageSource(file);
  try {
    const [profile, thumb] = await Promise.all([
      renderSquare(source, 512, 0.82),
      renderSquare(source, 128, 0.78),
    ]);
    return { profile, thumb };
  } finally {
    if (typeof source.close === 'function') source.close();
  }
}


async function renderContained(source, maxWidth, maxHeight, quality) {
  const sourceWidth = source.width || source.naturalWidth;
  const sourceHeight = source.height || source.naturalHeight;
  const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.fillStyle = '#111';
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, sourceWidth, sourceHeight, 0, 0, width, height);
  return canvasToBlob(canvas, quality);
}

export async function optimiseAssessmentPhoto(file) {
  if (!file) return null;
  if (!file.type.startsWith('image/')) throw new Error('Seleciona um ficheiro de imagem.');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('A fotografia original não pode ultrapassar 15 MB.');

  const source = await loadImageSource(file);
  try {
    const [image, thumb] = await Promise.all([
      renderContained(source, 1600, 1800, 0.8),
      renderContained(source, 420, 520, 0.72),
    ]);
    return { image, thumb };
  } finally {
    if (typeof source.close === 'function') source.close();
  }
}

export async function optimiseExerciseImage(file) {
  if (!file) return null;
  if (!file.type.startsWith('image/')) throw new Error('Seleciona um ficheiro de imagem.');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('A imagem original não pode ultrapassar 15 MB.');

  const source = await loadImageSource(file);
  try {
    return await renderContained(source, 1200, 1200, 0.78);
  } finally {
    if (typeof source.close === 'function') source.close();
  }
}

async function renderCommunityPoster(source, width, height, quality, zoom = 1, positionX = 0.5, positionY = 0.5) {
  const sourceWidth = source.width || source.naturalWidth;
  const sourceHeight = source.height || source.naturalHeight;
  const baseScale = Math.max(width / sourceWidth, height / sourceHeight);
  const scale = baseScale * Math.max(1, Math.min(2, Number(zoom) || 1));
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const overflowX = Math.max(0, drawWidth - width);
  const overflowY = Math.max(0, drawHeight - height);
  const x = -overflowX * Math.max(0, Math.min(1, Number(positionX) || 0));
  const y = -overflowY * Math.max(0, Math.min(1, Number(positionY) || 0));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.fillStyle = '#080808';
  context.fillRect(0, 0, width, height);
  context.drawImage(source, x, y, drawWidth, drawHeight);
  return canvasToBlob(canvas, quality);
}

export async function optimiseCommunityPoster(file, options = {}) {
  if (!file) return null;
  if (!file.type.startsWith('image/')) throw new Error('Seleciona um ficheiro de imagem.');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('A imagem original não pode ultrapassar 15 MB.');

  const source = await loadImageSource(file);
  const zoom = options.zoom ?? 1;
  const positionX = options.positionX ?? 0.5;
  const positionY = options.positionY ?? 0.5;
  try {
    // Formato 4:5: funciona bem como cartaz no telemóvel e mantém boa leitura no desktop.
    // O objetivo é ficar normalmente abaixo de ~450 KB sem sacrificar texto de cartazes.
    for (const quality of [0.78, 0.7, 0.62, 0.54]) {
      const blob = await renderCommunityPoster(source, 1080, 1350, quality, zoom, positionX, positionY);
      if (blob.size <= 450 * 1024 || quality === 0.54) return blob;
    }
    throw new Error('Não foi possível otimizar a imagem.');
  } finally {
    if (typeof source.close === 'function') source.close();
  }
}
