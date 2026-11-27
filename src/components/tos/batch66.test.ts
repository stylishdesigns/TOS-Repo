/**
 * Batch 66: every facility page opens, and the app loader is never TOS.
 * (1) The lead-tier landing lock is gone at the user's direction: every
 * tier's facility page and app resolve through the public lookup, paid or
 * not. (2) The facility app's pre-resolution loader falls back to plain
 * white with no branding: on a device that has not met the facility yet
 * nothing is remembered, and a facility app must never load on the
 * Tutorial OS wordmark. When the device remembers the facility, its own
 * splash paints as before.
 */
import { readFileSync } from 'fs';

let failed = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'ok' : 'FAIL'}  ${name}`); if (!ok) failed++; };
const server = readFileSync('src/server/extendedRoutes.ts', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const splash = readFileSync('src/components/student-portal/LaunchSplash.tsx', 'utf8');

const start = server.indexOf("app.get('/api/public/centre-by-slug'");
const next = server.indexOf("\n  app.get(", start + 1);
const handler = server.slice(start, next > start ? next : undefined);

check('the binding lookup has no tier gate and no locked reply',
  !handler.includes('locked: true') && !handler.includes('centreBilling'));
check('the binding lookup still answers the real payload',
  handler.includes('centreId: doc.id') && handler.includes('accessCodeRequired'));
check('no facility stays locked on the public lookup path',
  !server.includes('locked: true') && !server.includes('not available right now'));
check('the app binding lookup sends no app flag',
  app.includes('centre-by-slug?centre=${encodeURIComponent(slug)}`') && !app.includes('&app=1'));
check('the facility app waits on an unbranded loader',
  app.includes('<LaunchSplash plain />') && splash.includes('if (plain && !branding.accent)'));
const plainStart = splash.indexOf('if (plain && !branding.accent)');
const tosStart = splash.indexOf('// TOS mode:');
const plainBlock = splash.slice(plainStart, tosStart > plainStart ? tosStart : undefined);
check('the unbranded loader carries no Tutorial OS wordmark',
  plainBlock.length > 200 && !plainBlock.includes('Tutorial') && !plainBlock.includes('tos-brand-icon'));
check('the remembered facility splash still paints on repeat launches',
  splash.includes("localStorage.getItem('tos:launch-brand')") && splash.includes('backgroundColor: branding.accent'));
check('the landing fallback stays in the app as a safety net',
  app.includes('This facility page is not available</h1>'));

if (failed) { console.error(`batch66: ${failed} check(s) failed`); process.exit(1); }
console.log('batch66: all checks pass');
