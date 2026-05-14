// Sentry init EN BAŞTA — VITE_SENTRY_DSN yoksa sessizce skip eder
import { initSentry } from './lib/sentry';
initSentry();

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root bulunamadı');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Service Worker register (production build'de aktif)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => {
        console.warn('SW registration failed:', err);
      });
  });
}
