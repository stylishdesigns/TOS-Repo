import React from 'react';
import { BookOpen } from 'lucide-react';
import { useApp } from '../../context/AppContext';

// Launch splash (Nov 19): every facility app opens on its own brand color with
// the facility logo and name together, loading dots under the name, then hands
// straight to the dashboard. The resolved branding is remembered on the device,
// so the first paint already shows logo + name together instead of a logo-only
// screen that later changes into a second one.

interface LaunchBranding { centreId?: string; logo: string; name: string; accent: string; }

let memBranding: LaunchBranding | null = null;

function readPersisted(): LaunchBranding | null {
  if (memBranding) return memBranding;
  try {
    const raw = localStorage.getItem('tos:launch-brand');
    if (!raw) return null;
    const r = JSON.parse(raw);
    if (r && r.accent && (r.name || r.logo)) return r as LaunchBranding;
  } catch { /* private mode */ }
  return null;
}

function persist(b: LaunchBranding) {
  memBranding = b;
  try { localStorage.setItem('tos:launch-brand', JSON.stringify(b)); } catch { /* private mode */ }
}

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

  const branding = React.useMemo<LaunchBranding>(() => {
    // Start from what the device already knows (survives app cold starts), so
    // the splash is one steady screen from the first paint.
    const base: LaunchBranding = readPersisted() || { logo: '', name: '', accent: '' };
    const next: LaunchBranding = {
      centreId: String(activeCentre?.id || '') || base.centreId,
      logo: String(activeCentre?.logoUrl || activeCentre?.branding?.logo || activeCentre?.branding?.logoUrl || '') || base.logo,
      name: String(centreName || activeCentre?.name || '') || base.name,
      accent: /^#[0-9a-fA-F]{6}$/.test(String(brandAccent || '')) ? String(brandAccent) : base.accent,
    };
    // Device fallback from the install flow, for a facility seen for the first
    // time on this device.
    if (!next.name && !next.logo) {
      try {
        const raw = sessionStorage.getItem('tos:signup-result');
        if (raw) {
          const r = JSON.parse(raw);
          next.logo = next.logo || String(r.logoUrl || r.logo || '');
          next.name = next.name || String(r.name || r.centreName || '');
          next.accent = next.accent || (/^#[0-9a-fA-F]{6}$/.test(String(r.accent || '')) ? String(r.accent) : '');
        }
      } catch { /* private mode */ }
    }
    if (!next.accent) next.accent = '#EA580C';
    return next;
  }, [centreName, activeCentre, brandAccent]);

  React.useEffect(() => {
    if (branding.name || branding.logo) persist(branding);
  }, [branding]);

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
          className={`mt-6 text-3xl font-black tracking-tight px-6 text-center leading-tight ${dark ? 'text-slate-900' : 'text-white'}`}
          style={dark ? undefined : { textShadow: '0 1px 12px rgba(0,0,0,0.18)' }}
        >
          {branding.name}
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
}
