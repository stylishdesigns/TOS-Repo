import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {registerSW} from 'virtual:pwa-register';
import { installServerApiFetch } from './utils/serverApi';

// Register PWA service worker with auto-update
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // Automatically update the service worker and reload the page
    updateSW(true);
  },
  onOfflineReady() {
    console.log('App ready to work offline');
  },
});

// Attach the Firebase ID token to same-origin /api requests (Prompt A step 10).
installServerApiFetch();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
