import type { CSSProperties } from 'react';

// Brand theme layer. Facilities pick their own colour at signup (saved as
// accentColor on the centre); TOS surfaces keep the platform orange. Tailwind
// v4 compiles its orange utilities to var(--color-orange-*) references, so
// overriding those custom properties on a facility wrapper recolours every
// orange utility beneath it at once: the login page, the access-code gate and
// the student, tutor and admin portals all follow the facility's colour.
export function isBrandHex(v?: string | null): boolean {
  return !!v && /^#[0-9a-fA-F]{6}$/.test(String(v).trim());
}

// Phone-browser and installed-app top-bar colour. Chrome paints the strip
// above the page (and the installed app's status bar) from this meta tag.
// The strip above the page sits directly over the facility's dark header
// menu, so it is permanently dark (#020617, the slate-950 header colour) on
// every facility surface: the top of the screen and the menu blend as one.
export function setThemeColor(_accent?: string | null): void {
  try {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) return;
    meta.content = '#020617';
  } catch { /* progressive: the default stays */ }
}

export function brandVars(accent?: string | null): CSSProperties {
  if (!isBrandHex(accent)) return {};
  const a = String(accent).trim();
  const mix = (pct: number, other: string) => `color-mix(in oklab, ${a} ${pct}%, ${other})`;
  const n = parseInt(a.slice(1), 16);
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  const lum = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return {
    '--brand': a,
    '--on-brand': lum > 0.45 ? '#0F172A' : '#FFFFFF',
    '--color-orange-50': mix(9, 'white'),
    '--color-orange-100': mix(18, 'white'),
    '--color-orange-200': mix(30, 'white'),
    '--color-orange-300': mix(48, 'white'),
    '--color-orange-400': mix(74, 'white'),
    '--color-orange-500': a,
    '--color-orange-600': a,
    '--color-orange-700': mix(74, 'black'),
    '--color-orange-800': mix(60, 'black'),
    '--color-orange-900': mix(46, 'black'),
    '--color-orange-950': mix(30, 'black'),
  } as CSSProperties;
}
