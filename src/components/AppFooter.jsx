import React from 'react';
import '../styles/footer.css';

export default function AppFooter({ className = '' }) {
  const currentYear = new Date().getFullYear();
  return (
    <footer className={`appFooter ${className}`.trim()}>
      © {currentYear} Ultimate Fit. Todos os direitos reservados.
    </footer>
  );
}
