import React from 'react';
import { BookOpen, Dumbbell, ExternalLink, PlayCircle } from 'lucide-react';

function youtubeId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) return parsed.pathname.split('/').filter(Boolean)[0] || '';
    if (parsed.hostname.includes('youtube.com')) {
      if (parsed.pathname.startsWith('/embed/')) return parsed.pathname.split('/').filter(Boolean)[1] || '';
      return parsed.searchParams.get('v') || '';
    }
  } catch {}
  return '';
}

function youtubeEmbed(url) {
  const id = youtubeId(url);
  return id ? `https://www.youtube.com/embed/${id}` : '';
}

function youtubeThumbnail(url) {
  const id = youtubeId(url);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '';
}

function vimeoEmbed(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('vimeo.com')) return '';
    if (parsed.hostname.startsWith('player.')) return url;
    const parts = parsed.pathname.split('/').filter(Boolean);
    const id = parts.find(part => /^\d+$/.test(part));
    if (!id) return '';
    const hash = parts.length > 1 && parts[parts.length - 1] !== id ? parts[parts.length - 1] : '';
    return `https://player.vimeo.com/video/${id}${hash ? `?h=${hash}` : ''}`;
  } catch {}
  return '';
}

function externalKind(url = '') {
  const value = url.toLowerCase();
  if (!value) return 'none';
  if (youtubeEmbed(url)) return 'youtube';
  if (value.includes('player.vimeo.com/external/') && value.includes('.mp4')) return 'video';
  if (vimeoEmbed(url)) return 'vimeo';
  if (/\.(mp4|webm)(\?|$)/i.test(url)) return 'video';
  if (/\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url)) return 'image';
  if (value.includes('.m3u8')) return 'link';
  return 'link';
}

export function hasExerciseMedia(exercise) {
  return Boolean(exercise?.mediaUrl || exercise?.externalMediaUrl || exercise?.mediaPath);
}

function BrandMark() {
  return <span className="exerciseBrandMark"><img src="/uf-icon.svg" alt=""/><b>ULTIMATE FIT</b></span>;
}

function VisualFallback({ exercise, className = '', manual = false }) {
  return <div className={`exerciseVisualFallback ${className}`}>
    <div className="exerciseVisualFallbackInner">
      {manual ? <BookOpen size={28}/> : <Dumbbell size={30}/>} 
      <small>{manual ? 'TEXTO LIVRE' : (exercise?.group || 'ULTIMATE FIT')}</small>
      <strong>{exercise?.name || 'Exercício'}</strong>
      {!manual && <span>Imagem neutra · sem técnica ilustrada</span>}
    </div>
    <BrandMark/>
  </div>;
}

function Branded({ children, className = '' }) {
  return <div className={`exerciseMediaBranded ${className}`}>{children}<BrandMark/></div>;
}

export default function ExerciseMedia({ exercise, compact = false, controls = true, className = '', manual = false }) {
  if (!exercise || manual || !hasExerciseMedia(exercise)) {
    return <VisualFallback exercise={exercise} className={className} manual={manual}/>;
  }

  const url = exercise.mediaUrl || exercise.externalMediaUrl || '';
  const storedKind = exercise.mediaKind || '';
  const kind = storedKind && storedKind !== 'external' ? storedKind : externalKind(url);

  if (compact) {
    if (kind === 'youtube') {
      const thumb = youtubeThumbnail(url);
      if (thumb) return <Branded className={className}><img src={thumb} alt={exercise.name} loading="lazy" decoding="async"/></Branded>;
    }
    if (kind === 'image' || kind === 'gif') {
      return <Branded className={className}><img src={url} alt={exercise.name} loading="lazy" decoding="async"/></Branded>;
    }
    if (kind === 'video') {
      const thumbSrc = url.includes('#') ? url : `${url}#t=0.15`;
      return <Branded className={className}><video src={thumbSrc} muted playsInline preload="metadata" aria-label={`Miniatura de ${exercise.name}`}/></Branded>;
    }
    // Vimeo/HLS/link: não inventamos uma posição corporal. Mantemos um cartão visual neutro,
    // enquanto a demonstração original continua disponível ao abrir o exercício.
    return <VisualFallback exercise={exercise} className={className}/>;
  }

  if (kind === 'image' || kind === 'gif') {
    return <Branded className={className}><img src={url} alt={exercise.name} loading="lazy" decoding="async"/></Branded>;
  }
  if (kind === 'video') {
    return <Branded className={className}><video src={url} controls={controls} playsInline preload="metadata"/></Branded>;
  }
  if (kind === 'youtube') {
    return <Branded className={className}><iframe src={youtubeEmbed(url)} title={exercise.name} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen/></Branded>;
  }
  if (kind === 'vimeo') {
    return <Branded className={className}><iframe src={vimeoEmbed(url)} title={exercise.name} loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen/></Branded>;
  }
  return <Branded className={className}><a className="exerciseExternalMediaLink" href={url} target="_blank" rel="noreferrer"><PlayCircle size={34}/><b>Abrir demonstração</b><small>O vídeo abre numa nova janela.</small><ExternalLink size={16}/></a></Branded>;
}
