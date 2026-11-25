import fs from 'fs';
import path from 'path';

/**
 * Batch 40: logo picks + saved/tracked proposals + sidebar default.
 * - Third logo pick (TOS monogram) is the favicon + brand mark everywhere.
 * - First logo pick (cap over book) is the TOS boot-splash animation.
 * - Mobile console sidebar starts collapsed.
 * - Proposals are saved, listed, and opens are tracked + emailed.
 */
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

let failures = 0;
const expect = (cond: boolean, label: string) => {
  if (cond) { console.log('ok  ' + label); } else { failures += 1; console.log('FAIL ' + label); }
};

// Logo assets exist and are wired in.
for (const f of ['favicon-32.png', 'tos-brand-icon.png', 'tos-splash-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'apple-touch-icon.png', 'favicon.ico', 'og-proposal.jpg']) {
  expect(fs.existsSync(path.join(process.cwd(), 'public', f)), `public/${f} exists`);
}
const index = read('index.html');
expect(index.includes('/favicon-32.png') && index.includes('/pwa-192x192.png'), 'index.html uses the new favicon PNGs');
expect(index.includes("/tos-splash-icon.png"), 'boot splash uses the cap-over-book icon');
expect(index.includes('boot-pop'), 'boot splash icon has a pulse animation');
expect(read('src/components/student-portal/LaunchSplash.tsx').includes('/tos-splash-icon.png'), 'LaunchSplash fallback uses the new icon');
expect(read('src/server/proposalPage.ts').includes('/tos-brand-icon.png'), 'proposal page brand mark uses the monogram');

// Sidebar: collapsed by default.
expect(read('src/components/tos/TosPortal.tsx').includes("localStorage.getItem(TOS_NAV_KEY) === '1'"), 'mobile sidebar defaults collapsed');

// Proposals: saved, listed, tracked, notified.
const routes = read('src/server/proposalRoutes.ts');
expect(routes.includes("app.post('/api/tos/proposals'") && routes.includes("app.get('/api/tos/proposals'") && routes.includes("app.delete('/api/tos/proposals/:slug'"), 'proposal save/list/delete routes registered');
const ext = read('src/server/extendedRoutes.ts');
expect(ext.includes("registerProposalApiRoutes(app)"), 'extended routes wire the proposal API');
const page = read('src/server/proposalPage.ts');
expect(page.includes("adminDb.collection('proposalShares')"), 'proposal page records opens in proposalShares');
expect(page.includes('sendEmail'), 'first open sends the owner an email');
expect(page.includes('60 * 60 * 1000'), 'open notifications throttle same-hour reopens only');
expect(/whatsapp\|facebookexternalhit/i.test(page), 'social-media crawlers are not counted as opens');
const tab = read('src/components/tos/TosProposals.tsx');
expect(tab.includes("api('/api/tos/proposals'"), 'console saves and lists proposals');
expect(tab.includes('Not opened'), 'console shows open status per proposal');
expect(!tab.includes('How the link behaves'), 'the how-the-link-behaves explainer is removed');
expect(read('src/components/tos/proposal.test.ts').includes('NO floating toolbar'), 'batch 38 checks still in place');

if (failures) { console.log(`--- ${failures} BATCH-40 TEST(S) FAILED ---`); process.exit(1); }
console.log('--- ALL BATCH-40 TESTS PASSED ---');
