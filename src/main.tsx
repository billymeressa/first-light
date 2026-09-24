import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

/**
 * Deliberately not wrapped in StrictMode. Its double-invoked effects would
 * start two AudioContexts and speak every line twice in development, which
 * makes the one thing this app has to get right — the pacing — impossible to
 * judge while building it.
 */
createRoot(document.getElementById('root')!).render(<App />);

// Offline support (see public/sw.js). Registered after load so it never
// competes with the first paint, and skipped in dev where it would serve
// stale modules straight past Vite's HMR.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // An unavailable service worker costs offline support, nothing else.
    });
  });
}
