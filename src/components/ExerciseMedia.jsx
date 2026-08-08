import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Dumbbell, ExternalLink, PlayCircle } from 'lucide-react';

const vimeoThumbCache = new Map();

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

function vimeoVideoUrl(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('vimeo.com')) return '';
    if (parsed.hostname.startsWith('player.') && parsed.pathname.includes('/external/')) return '';
    const parts = parsed.pathname.split('/').filter(Boolean);
    const id = parts.find(part => /^\d+$/.test(part));
    if (!id) return '';
    const idIndex = parts.indexOf(id);
    const pathHash = parts[idIndex + 1] && !/^\d+$/.test(parts[idIndex + 1]) ? parts[idIndex + 1] : '';
    const queryHash = parsed.searchParams.get('h') || '';
    const hash = pathHash || queryHash;
    return `https://vimeo.com/${id}${hash ? `/${hash}` : ''}`;
  } catch {}
  return '';
}

function vimeoEmbed(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('vimeo.com')) return '';
    if (parsed.hostname.startsWith('player.') && !parsed.pathname.includes('/external/')) return url;
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
  if (value.includes('.m3u8')) return 'hls';
  return 'link';
}

export function hasExerciseMedia(exercise) {
  return Boolean(exercise?.mediaUrl || exercise?.externalMediaUrl || exercise?.mediaPath);
}

function BrandMark() {
  return <span className="exerciseBrandMark"><img src="/uf-icon.svg" alt=""/><b>ULTIMATE FIT</b></span>;
}

function MuscleFigure({ group = '' }) {
  const key = group.toLowerCase();
  const active = (name) => key.includes(name) ? 'active' : '';
  return <svg className="exerciseMuscleFigure" viewBox="0 0 120 160" aria-hidden="true">
    <circle cx="60" cy="20" r="12" className="body"/>
    <path d="M43 38 Q60 30 77 38 L84 79 Q78 94 72 108 L69 148 H55 L52 108 Q45 95 36 79 Z" className="body"/>
    <path d="M44 42 L28 80 L18 76 L34 38 Z" className={`muscle ${active('bíceps')||active('biceps')||active('tríceps')||active('triceps')||active('antebraço')}`}/>
    <path d="M76 42 L92 80 L102 76 L86 38 Z" className={`muscle ${active('bíceps')||active('biceps')||active('tríceps')||active('triceps')||active('antebraço')}`}/>
    <path d="M46 41 Q60 35 74 41 L72 60 Q60 66 48 60 Z" className={`muscle ${active('peitoral')||active('peito')}`}/>
    <path d="M45 61 Q60 57 75 61 L73 86 Q60 91 47 86 Z" className={`muscle ${active('abdom')||active('core')}`}/>
    <path d="M40 39 Q60 27 80 39 L77 50 Q60 44 43 50 Z" className={`muscle ${active('ombro')||active('trapézio')||active('trapezio')||active('costas')}`}/>
    <path d="M46 84 Q60 91 74 84 L80 102 Q60 111 40 102 Z" className={`muscle ${active('glúteo')||active('gluteo')||active('lombar')}`}/>
    <path d="M41 101 L55 105 L53 148 H39 Z" className={`muscle ${active('perna')||active('quadrí')||active('quadri')||active('isquio')||active('adutor')||active('abdutor')||active('gémeos')||active('gemeos')}`}/>
    <path d="M79 101 L65 105 L67 148 H81 Z" className={`muscle ${active('perna')||active('quadrí')||active('quadri')||active('isquio')||active('adutor')||active('abdutor')||active('gémeos')||active('gemeos')}`}/>
  </svg>;
}

function VisualFallback({ exercise, className = '', manual = false }) {
  return <div className={`exerciseVisualFallback ${className}`}>
    <div className="exerciseVisualFallbackInner">
      {manual ? <BookOpen size={28}/> : <MuscleFigure group={exercise?.group || ''}/>} 
      <small>{manual ? 'TEXTO LIVRE' : (exercise?.group || 'ULTIMATE FIT')}</small>
      <strong>{exercise?.name || 'Exercício'}</strong>
      {!manual && <span>Ilustração neutra da zona alvo</span>}
    </div>
    <BrandMark/>
  </div>;
}

function Branded({ children, className = '' }) {
  return <div className={`exerciseMediaBranded ${className}`}>{children}<BrandMark/></div>;
}

async function getVimeoThumbnail(url) {
  const canonical = vimeoVideoUrl(url);
  if (!canonical) return '';
  if (vimeoThumbCache.has(canonical)) return vimeoThumbCache.get(canonical);
  const promise = fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(canonical)}`)
    .then(response => response.ok ? response.json() : null)
    .then(json => json?.thumbnail_url || '')
    .catch(() => '');
  vimeoThumbCache.set(canonical, promise);
  return promise;
}

function VimeoCompact({ url, exercise, className = '' }) {
  const [thumb, setThumb] = useState('');
  useEffect(() => {
    let alive = true;
    getVimeoThumbnail(url).then(value => { if (alive) setThumb(value || ''); });
    return () => { alive = false; };
  }, [url]);
  if (!thumb) return <VisualFallback exercise={exercise} className={className}/>;
  return <Branded className={className}><img src={thumb} alt={exercise.name} loading="lazy" decoding="async"/></Branded>;
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
    if (kind === 'vimeo') return <VimeoCompact url={url} exercise={exercise} className={className}/>;
    if (kind === 'image' || kind === 'gif') {
      return <Branded className={className}><img src={url} alt={exercise.name} loading="lazy" decoding="async"/></Branded>;
    }
    if (kind === 'video') {
      const thumbSrc = url.includes('#') ? url : `${url}#t=0.15`;
      return <Branded className={className}><video src={thumbSrc} muted playsInline preload="metadata" aria-label={`Miniatura de ${exercise.name}`}/></Branded>;
    }
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
