import React from 'react';
import { BookOpen } from 'lucide-react';
import { useApp } from '../../context/AppContext';

// Launch splash (Nov 19): every facility app opens on its own brand color with
// the facility logo and name, then hands straight to the dashboard. It also
// replaces the old blank loading screen, so there is no empty gap before the
// home page.

function readableOn(hex: string): boolean {
  // true when dark text reads better on this background (light accent).
  const m = /^#([0-9a-fA-F]{6})$/.exec(String(hex || ''));
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62;
}

export function LaunchSplash() {
  const { centreName, activeCentre, brandAccent } = useApp() as any;

  const branding = React.useMemo(() => {
    let logo = String(activeCentre?.branding?.logo || activeCentre?.branding?.logoUrl || '');
    let name = String(centreName || activeCentre?.name || '');
    let accent = /^#[0-9a-fA-F]{6}$/.test(String(brandAccent || '')) ? String(brandAccent) : '';
    // Device fallback so the splash paints with the right facility even before
    // Firestore answers (the install flow stores it at signup).
    try {
      const raw = sessionStorage.getItem('tos:signup-result');
      if (raw) {
        const r = JSON.parse(raw);
        logo = logo || String(r.logoUrl || r.logo || '');
        name = name || String(r.name || r.centreName || '');
        accent = accent || (/^#[0-9a-fA-F]{6}$/.test(String(r.accent || '')) ? String(r.accent) : '');
      }
    } catch { /* private mode */ }
    return { logo, name, accent: accent || '#EA580C' };
  }, [centreName, activeCentre, brandAccent]);

  const dark = readableOn(branding.accent);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
      style={{ backgroundColor: branding.accent }}
      role="status"
      aria-label="Loading"
    >
      <div className="w-28 h-28 rounded-3xl bg-white shadow-lg flex items-center justify-center overflow-hidden">
        {branding.logo ? (
          <img src={branding.logo} alt="" className="w-full h-full object-cover rounded-3xl" />
        ) : (
          <BookOpen className="w-12 h-12 text-slate-800" strokeWidth={1.75} />
        )}
      </div>
      {branding.name && (
        <p
          className={`mt-6 text-xl font-black tracking-tight px-6 text-center leading-tight ${dark ? 'text-slate-900' : 'text-white'}`}
          style={dark ? undefined : { textShadow: '0 1px 12px rgba(0,0,0,0.18)' }}
        >
          {branding.name}
        </p>
      )}
      <div className="mt-5 flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`w-1.5 h-1.5 rounded-full ${dark ? 'bg-slate-900/70' : 'bg-white/90'}`}
            style={{ animation: `tosLaunchDot 1.1s ease-in-out ${i * 0.18}s infinite` }}
          />
        ))}
      </div>
      <style>{`@keyframes tosLaunchDot{0%,100%{opacity:.25;transform:scale(.8)}50%{opacity:1;transform:scale(1.1)}}`}</style>
    </div>
  );
}
