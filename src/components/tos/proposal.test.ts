import fs from 'fs';
import path from 'path';

/**
 * Batch 38: partnership-proposal generator checks.
 * The proposal link must render per-facility Open Graph tags for social
 * previews, carry Copy link / Download PDF actions, and sit in the console.
 */
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

let failures = 0;
const expect = (cond: boolean, label: string) => {
  if (cond) { console.log('ok  ' + label); } else { failures += 1; console.log('FAIL ' + label); }
};

// The proposal page: per-facility OG tags for WhatsApp/Facebook previews.
const page = read('src/server/proposalPage.ts');
expect(page.includes("app.get('/proposal/:slug'"), 'proposal page registers the /proposal/:slug route');
expect(page.includes("app.get('/api/public/proposal/:slug'"), 'proposal page registers the unauthenticated /api/public route');
expect(page.includes('og:title') && page.includes('og:image') && page.includes('og:description'), 'proposal page carries OG meta tags');
expect(page.includes('twitter:card') && page.includes('summary_large_image'), 'proposal page carries the Twitter large-card tag');
expect(page.includes("content=\"${esc(origin)}/og-proposal.jpg\""), 'OG image points at the branded banner');
expect(page.includes('Prepared for'), 'proposal addresses the facility by name');
expect(!page.includes('class="toolbar"') && !page.includes('tb-copy'), 'proposal page has NO floating toolbar for visitors (console holds the actions)');
expect(page.includes('esm.sh/jspdf') && page.includes('html2canvas'), 'PDF builds client-side from the page design');
expect(page.includes('NGN 1,000') && page.includes('NGN 2,500') && page.includes('/ seat / month'), 'proposal prices read NGN 1,000 and NGN 2,500 per seat');
expect(page.includes('Over 100,000 practice questions'), 'question bank count is quoted');
expect(page.includes('IJMB and JUPEB') && page.includes('custom exams'), 'bridge programmes and custom exams are named');
expect(page.includes('Results are what fill your classes'), 'results section is present');
expect(page.includes('300 and above in JAMB') && page.includes('A1 to B3'), 'results copy quotes the score story');

// Routes wired + redirect before the SPA fallback.
const ext = read('src/server/extendedRoutes.ts');
expect(ext.includes("registerProposalRoutes(app)"), 'extended routes register the proposal routes');
const toml = read('netlify.toml');
expect(toml.includes('from = "/proposal/*"') && toml.includes('public/proposal/:splat'), 'netlify redirects /proposal/* into the function before the SPA fallback');

// Console tab.
const portal = read('src/components/tos/TosPortal.tsx');
expect(portal.includes("id: 'proposals', label: 'Proposals'"), 'console has a Proposals tab');
expect(portal.includes('<ProposalsTab />'), 'console renders the Proposals tab');
const tab = read('src/components/tos/TosProposals.tsx');
expect(tab.includes('slugifyFacility') && tab.includes('proposalLinkFor'), 'console builds the per-facility link');
expect(tab.includes('Copy link') && tab.includes('Download PDF') && tab.includes('Open preview'), 'console exposes copy, preview and PDF actions');
expect(fs.existsSync(path.join(process.cwd(), 'public/og-proposal.jpg')), 'the OG banner image exists in public/');

if (failures) { console.log(`--- ${failures} PROPOSAL TEST(S) FAILED ---`); process.exit(1); }
console.log('--- ALL PROPOSAL TESTS PASSED ---');
