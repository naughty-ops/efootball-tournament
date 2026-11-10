'use client';

import { useEffect } from 'react';

export default function PWAInstaller() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    // In local development, unregister lingering service workers to avoid HMR & port conflicts
    if (process.env.NODE_ENV !== 'production' || window.location.hostname === 'localhost') {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
        }
      });
      return;
    }

    const registerSW = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          reg.update().catch(() => {});
        })
        .catch((err) => {
          console.warn('PWA Service Worker registration skipped/failed:', err);
        });
    };

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      registerSW();
    } else {
      window.addEventListener('load', registerSW);
      return () => window.removeEventListener('load', registerSW);
    }
  }, []);

  return null;
}
