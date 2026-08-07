import React from 'react';

export default function BrandLogo({ className = '', compact = false, alt = 'ULTIMATE FIT' }) {
  return (
    <span className={`brandLogo ${compact ? 'brandLogoCompact' : ''} ${className}`.trim()}>
      <img src="/brand/ultimatefit-logo.webp" alt={alt} width="720" height="151" decoding="async" />
    </span>
  );
}
