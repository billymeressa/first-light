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
