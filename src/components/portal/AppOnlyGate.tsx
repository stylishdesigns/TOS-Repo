import React, { useEffect, useState } from 'react';
import { readLaunchBranding } from '../student-portal/LaunchSplash';

/**
 * App-only gate. When the platform's app-only setting is ON, the student
 * and tutor portals open only inside the installed app (standalone display
 * mode): in any browser, phone or desktop, this screen replaces the portal
 * with an install call-to-action. The admin portal is the one exception the
 * facility asked for: it also opens in a desktop browser (a wide screen with
 * a real pointer), never on a phone or tablet. The TOS console, the TOS
 * landing and facility landing pages are never gated.
 */
// True when this page is running inside the installed app rather than a
// browser tab: the installed app is the only place app-only portals open.
export const isStandaloneDisplay = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

// Desktop, for the admin portal's web exemption: a wide screen driven by a
// fine pointer (mouse or trackpad). Phones and tablets never match, so the
// app-only rule still keeps them on the installed app.
export const isDesktopBrowser = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia('(min-width: 1024px)').matches &&
  window.matchMedia('(pointer: fine)').matches;

// Reads the app-only switch fresh on every page load: no session storage, so
// a refresh catches an on/off toggle right away. The tiny in-memory cache
// only dedupes the checks one page load makes (the gate, the access-code
// gate, the install page) so they share a single request.
let appOnlyCache: { at: number; v: boolean } | null = null;
const APP_ONLY_CACHE_MS = 10 * 1000;
export async function isAppOnlyOn(): Promise<boolean> {
  if (appOnlyCache && Date.now() - appOnlyCache.at < APP_ONLY_CACHE_MS) return appOnlyCache.v;
  try {
    const d = await fetch('/api/public/platform-settings').then((r) => r.json()) as { appOnlyPortals?: boolean };
    const on = !!d.appOnlyPortals;
    appOnlyCache = { at: Date.now(), v: on };
    return on;
  } catch {
    return false;
  }
}

// The last known answer is remembered on the device, so an ordinary reload
// opens the portal on the first paint instead of holding on a loading screen
// while the setting is re-checked (that hold read as a broken/cached page).
function readStoredAppOnly(): boolean | null {
  try {
    const v = localStorage.getItem('tos:app-only');
    if (v === 'open') return false;
    if (v === 'blocked') return true;
  } catch { /* private mode */ }
  return null;
}

// First-ever visits (nothing remembered yet) hold on the same facility-branded
// launch splash the portals open with, so the wait never looks like an error.
const GateSplash: React.FC = () => {
  const b = readLaunchBranding();
  const accent = b?.accent || '#EA580C';
  const hasBrand = !!(b && (b.name || b.logo));
  const dark = (() => {
    const m = /^#([0-9a-fA-F]{6})$/.exec(accent);
    if (!m) return false;
    const n = parseInt(m[1], 16);
    return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.62;
  })();
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
      style={{ backgroundColor: accent }}
      role="status"
      aria-label="Loading"
    >
      <div className="w-28 h-28 rounded-3xl bg-white shadow-lg flex items-center justify-center overflow-hidden">
        {b?.logo ? (
          <img src={b.logo} alt="" className="w-full h-full object-cover rounded-3xl" />
        ) : (
          <span className={`text-4xl font-black ${dark ? 'text-slate-900' : 'text-white'}`}>TO</span>
        )}
      </div>
      {hasBrand && b?.name && (
        <p className={`mt-6 text-3xl font-black tracking-tight px-6 text-center leading-tight ${dark ? 'text-slate-900' : 'text-white'}`}>
          {b.name}
        </p>
      )}
      <div className="mt-6 flex items-center gap-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`w-2.5 h-2.5 rounded-full ${dark ? 'bg-slate-900' : 'bg-white'}`}
            style={{ animation: `tosLaunchDot 1.05s cubic-bezier(.45,0,.55,1) ${i * 0.16}s infinite` }}
          />
        ))}
      </div>
      <style>{`@keyframes tosLaunchDot{0%,100%{transform:translateY(0) scale(.85);opacity:.35}40%{transform:translateY(-7px) scale(1.15);opacity:1}}`}</style>
    </div>
  );
};

export const AppOnlyGate: React.FC<{ children: React.ReactNode; desktopOk?: boolean }> = ({ children, desktopOk = false }) => {
  // appOnlyOn === null means the setting is still being checked (loading).
  // The device's remembered answer opens the first paint; the live check
  // follows and corrects it if the toggle changed since.
  const [appOnlyOn, setAppOnlyOn] = useState<boolean | null>(() => {
    if (typeof window !== 'undefined' && isStandaloneDisplay()) return false;
    return readStoredAppOnly();
  });
  const [desktop, setDesktop] = useState(() => isDesktopBrowser());

  useEffect(() => {
    let alive = true;
    if (isStandaloneDisplay()) {
      setAppOnlyOn(false);
      return;
    }
    isAppOnlyOn().then((on) => {
      if (!alive) return;
      setAppOnlyOn(on);
      try { localStorage.setItem('tos:app-only', on ? 'blocked' : 'open'); } catch { /* private mode */ }
    });
    return () => { alive = false; };
  }, []);

  // The desktop exemption follows the window live: shrink a desktop browser
  // window narrow (or detach it to a tablet-sized split) and it counts as
  // mobile again, growing back reopens the portal without a reload.
  useEffect(() => {
    if (!desktopOk) return;
    const update = () => setDesktop(isDesktopBrowser());
    window.addEventListener('resize', update);
    const m = window.matchMedia('(pointer: fine)');
    m.addEventListener?.('change', update);
    return () => {
      window.removeEventListener('resize', update);
      m.removeEventListener?.('change', update);
    };
  }, [desktopOk]);

  const blocked = !!appOnlyOn && !(desktopOk && desktop);
  if (!blocked) return <>{children}</>;
  if (appOnlyOn === null) {
    return <GateSplash />;
  }
  return (
    <div className="min-h-screen bg-[#0F172A] grid place-items-center px-6 text-center">
      <div className="max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-orange-600 text-white font-black text-2xl grid place-items-center mx-auto shadow-lg">TO</div>
        <h1 className="mt-6 text-white text-2xl font-bold tracking-tight">Open this portal in the app</h1>
        <p className="mt-3 text-slate-300 text-sm leading-relaxed">
          For safety, the admin, tutor and student portals open only inside the Tutorial OS app. Install it below, then sign in there.
        </p>
        <a
          href="/app"
          className="mt-7 inline-flex items-center justify-center px-6 min-h-[52px] rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-sm transition-colors"
        >
          Get the app
        </a>
        <p className="mt-4 text-slate-500 text-xs">Free seats included. Upgrade any time for more.</p>
      </div>
    </div>
  );
};
