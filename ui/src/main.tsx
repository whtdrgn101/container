import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { configureTransport } from '@game-hub/ui-kit';
import App from './App';
import './index.css';

// Track D / D2b: the game-facing REST helpers live in `@game-hub/ui-kit`, which is published and must not
// depend on Vite's `import.meta.env`. So the **host** injects where its API lives, once, before anything
// renders: in dev the Vite server proxies `/api` → the backend (stripping the prefix); in a production
// build the backend serves the UI itself, so the API is at the same origin's root.
configureTransport({ baseUrl: import.meta.env.PROD ? '' : '/api' });

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
