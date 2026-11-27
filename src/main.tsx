import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { PublicLandingPage } from './components/landing/PublicLandingPage';
import { AppInstallPage } from './components/public/AppInstallPage';
import { SignupStartPage, SignupConfirmPage, SignupAppPage } from './components/public/landing/SignupFlow';
import { LegalPage } from './components/public/legal/TermsPrivacy';
import { PreviewOnboarding } from './components/public/PreviewOnboarding';
import './index.css';
import {registerSW} from 'virtual:pwa-register';
import { installServerApiFetch } from './utils/serverApi';
import './components/public/landing/design.css';


// Register PWA service worker with auto-update
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // Never interrupt a student mid-exam: defer the reload until the exam ends.
    if (sessionStorage.getItem('tos:defer-pwa-reload') === '1') {
      console.log('App update deferred: exam in progress');
      return;
    }
    updateSW(true);
  },
  onOfflineReady() {
    console.log('App ready to work offline');
  },
});

// Attach the Firebase ID token to same-origin /api requests (Prompt A step 10).
installServerApiFetch();

// Keep the saved sign-in for good: mark the app's storage as persistent, so
// the browser treats it as important data and never clears it on its own
// (browsers otherwise evict site storage when the phone runs low on space,
// which reads to the user as being signed out for no reason). Closing,
// swiping the app away, refreshing or restarting the phone never clears
// this storage; only the user's own sign-out or wiping the app's data does.
try {
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => { /* not granted: the saved sign-in still holds */ });
  }
} catch { /* older browsers: the saved sign-in still holds */ }

// Owner-branded app install: when this device is tied to a facility (a
// welcome-email link ?centre=..., or a signup in progress on this device),
// point the PWA manifest at that facility's own manifest, so the install
// popup shows the facility's name and logo and the installed app opens on
// the access-code page.
try {
  let centre = new URLSearchParams(window.location.search).get('centre') || '';
  if (!centre) {
    // The access code the user entered on the install page is the deliberate
    // choice for this device and outranks any earlier signup left in this tab:
    // without this priority, an owner who signed up facility A and then looked
    // up facility B by code got A's branding on B's install popup.
    const appRaw = sessionStorage.getItem('tos:app-centre');
    if (appRaw) {
      centre = String((JSON.parse(appRaw) as { slug?: string }).slug || '');
    }
  }
  if (!centre) {
    const raw = sessionStorage.getItem('tos:signup-result');
    if (raw) {
      const domain = String((JSON.parse(raw) as { domain?: string }).domain || '');
      centre = domain.includes('/')
        ? domain.split('/').pop() || ''
        : domain.split('.')[0];
    }
  }
  const link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
  if (centre && link) link.href = `/api/public/pwa-manifest?centre=${encodeURIComponent(centre)}`;
} catch { /* branding fallback: the default manifest stays. */ }

// When a new build deploys, the hashed asset files this open tab remembers
// may already be gone, and the next lazily loaded screen fails with
// "Failed to fetch dynamically imported module". Instead of leaving the user
// on a broken screen, reload once to pick up the new build.
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault();
  try {
    if (sessionStorage.getItem('tos:chunk-reload') === '1') return;
    sessionStorage.setItem('tos:chunk-reload', '1');
  } catch {
    // Storage unavailable: still reload once.
  }
  window.location.reload();
});
try {
  window.addEventListener('load', () => sessionStorage.removeItem('tos:chunk-reload'));
} catch {
  // Ignore: the guard above is a nice-to-have.
}

// Public centre landing pages (piece 1): /c/{centreId} renders the centre's
// public website for anonymous visitors, outside the app shell entirely.
const landingMatch = window.location.pathname.match(/^\/c\/([A-Za-z0-9_-]{3,160})\/?$/);

// Dedicated install page for the welcome email's "Download the app" button.
const appInstallMatch = window.location.pathname.match(/^\/app\/?$/);

// Trial signup flow as separate pages (no popup): facility details, then the
// congratulations/plan review, then the app install page.
const startMatch = window.location.pathname.match(/^\/start\/?$/);
const confirmMatch = window.location.pathname.match(/^\/start\/confirm\/?$/);
const appFlowMatch = window.location.pathname.match(/^\/start\/app\/?$/);
const previewOnboardingMatch = /^\/preview\/?$/.test(window.location.pathname);
const termsMatch = /^\/terms\/?$/.test(window.location.pathname);
const privacyMatch = /^\/privacy\/?$/.test(window.location.pathname);

// A facility's plain address: tutorialos.com/<facility-name>, the whole name
// with every space and symbol removed and never shortened. Reserved
// single-segment paths (the app install page, the signup flow) never match.
const RESERVED_ROOT = ['app', 'start', 'api', 'tos', 'login', 'admin', 'support', 'preview', 'terms', 'privacy'];

const rootLandingMatch = (() => {
  const m = window.location.pathname.match(/^\/([A-Za-z0-9][A-Za-z0-9_-]{2,159})\/?$/);
  if (!m) return null;
  return RESERVED_ROOT.includes(m[1].toLowerCase()) ? null : m;
})();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {landingMatch ? (
    <PublicLandingPage centreId={landingMatch[1]} />
  ) : appInstallMatch ? (
    <AppInstallPage />
  ) : startMatch ? (
    <SignupStartPage />
  ) : confirmMatch ? (
    <SignupConfirmPage />
  ) : appFlowMatch ? (
    <SignupAppPage />
  ) : termsMatch ? (
    <LegalPage kind="terms" />
  ) : privacyMatch ? (
    <LegalPage kind="privacy" />
  ) : previewOnboardingMatch ? (
    <PreviewOnboarding />
  ) : rootLandingMatch ? (
    <PublicLandingPage centreId={rootLandingMatch[1]} />
  ) : (
    <App />
  )}
  </StrictMode>,
);
