import React from 'react';
import { BookOpen, ExternalLink, PlayCircle } from 'lucide-react';

function youtubeEmbed(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) {
      const id = parsed.pathname.split('/').filter(Boolean)[0];
      return id ? `https://www.youtube.com/embed/${id}` : '';
    }
    if (parsed.hostname.includes('youtube.com')) {
      if (parsed.pathname.startsWith('/embed/')) return url;
      const id = parsed.searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}` : '';
    }
  } catch {}
  return '';
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

export default function ExerciseMedia({ exercise, compact = false, controls = true, className = '' }) {
  if (!exercise || !hasExerciseMedia(exercise)) {
    return <div className={`exerciseMediaPlaceholder ${className}`}><BookOpen size={26}/><span>Sem demonstração</span></div>;
  }

  const url = exercise.mediaUrl || exercise.externalMediaUrl || '';
  const storedKind = exercise.mediaKind || '';
  const kind = storedKind && storedKind !== 'external' ? storedKind : externalKind(url);

  if (compact) {
    if (kind === 'image' || kind === 'gif') {
      return <img className={className} src={url} alt={exercise.name} loading="lazy" decoding="async"/>;
    }
    return <div className={`exerciseMediaPlaceholder videoAvailable ${className}`}><PlayCircle size={28}/><span>Vídeo disponível</span></div>;
  }

  if (kind === 'image' || kind === 'gif') {
    return <img className={className} src={url} alt={exercise.name} loading="lazy" decoding="async"/>;
  }
  if (kind === 'video') {
    return <video className={className} src={url} controls={controls} playsInline preload="metadata"/>;
  }
  if (kind === 'youtube') {
    return <iframe className={className} src={youtubeEmbed(url)} title={exercise.name} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen/>;
  }
  if (kind === 'vimeo') {
    return <iframe className={className} src={vimeoEmbed(url)} title={exercise.name} loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen/>;
  }
  return <a className="exerciseExternalMediaLink" href={url} target="_blank" rel="noreferrer"><PlayCircle size={34}/><b>Abrir demonstração</b><small>O vídeo abre numa nova janela.</small><ExternalLink size={16}/></a>;
}
