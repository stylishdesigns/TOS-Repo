import React, { useEffect, useState } from 'react';

/**
 * App-only gate. When the platform's app-only setting is ON, the three
 * portals open only inside the installed app (standalone display mode): in
 * any browser, phone or desktop, this screen replaces the portal with an
 * install call-to-action. The TOS console, the TOS landing and facility
 * landing pages are never gated.
 */
export const AppOnlyGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<'loading' | 'open' | 'blocked'>('loading');

  useEffect(() => {
    let alive = true;
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) {
      setState('open');
      return;
    }
    try {
      const cached = JSON.parse(sessionStorage.getItem('tos:app-only-cache') || 'null') as { v: boolean; at: number } | null;
      if (cached && Date.now() - cached.at < 5 * 60 * 1000) {
        setState(cached.v ? 'blocked' : 'open');
        return;
      }
    } catch { /* ignore */ }
    fetch('/api/public/platform-settings')
      .then((r) => r.json())
      .then((d: { appOnlyPortals?: boolean }) => {
        if (!alive) return;
        const on = !!d.appOnlyPortals;
        try {
          sessionStorage.setItem('tos:app-only-cache', JSON.stringify({ v: on, at: Date.now() }));
        } catch { /* ignore */ }
        setState(on ? 'blocked' : 'open');
      })
      .catch(() => { if (alive) setState('open'); });
    return () => { alive = false; };
  }, []);

  if (state === 'open') return <>{children}</>;
  if (state === 'loading') {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50">
        <div className="w-8 h-8 rounded-full border-2 border-orange-400 border-t-transparent animate-spin" />
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-[#0F172A] grid place-items-center px-6 text-center">
      <div className="max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-[#EA580C] text-white font-black text-2xl grid place-items-center mx-auto shadow-lg">TO</div>
        <h1 className="mt-6 text-white text-2xl font-bold tracking-tight">Open this portal in the app</h1>
        <p className="mt-3 text-slate-300 text-sm leading-relaxed">
          For safety, the admin, tutor and student portals open only inside the Tutorial OS app. Install it below, then sign in there.
        </p>
        <a
          href="/app"
          className="mt-7 inline-flex items-center justify-center px-6 min-h-[52px] rounded-xl bg-[#EA580C] hover:bg-[#C2410C] text-white font-bold text-sm transition-colors"
        >
          Get the app
        </a>
        <p className="mt-4 text-slate-500 text-xs">Free during your 14-day trial.</p>
      </div>
    </div>
  );
};
