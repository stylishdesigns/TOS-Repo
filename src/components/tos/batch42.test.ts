import fs from 'fs';
import path from 'path';

/**
 * Batch 42: video classes in the proposal + the logo rebuilt per the user's screenshot.
 * - Proposal gains a Video classes card: optional, every facility decides, no platform named.
 * - The brand mark is redrawn as TOS with a mortarboard perched on the O (the user's design).
 * - The TOS boot splash (index.html + LaunchSplash fallback) becomes the wordmark:
 *   "Tutorial" + the new mark + "OS", with the mark pulsing like the old icon did.
 */
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

let failures = 0;
const expect = (cond: boolean, label: string) => {
  if (cond) { console.log('ok  ' + label); } else { failures += 1; console.log('FAIL ' + label); }
};

// New logo assets exist.
for (const f of ['tos-brand-icon.png', 'pwa-512x512.png', 'pwa-192x192.png', 'pwa-maskable-512x512.png', 'apple-touch-icon.png', 'favicon-32.png', 'favicon.ico', 'icon.svg', 'og-proposal.jpg']) {
  expect(fs.existsSync(path.join(process.cwd(), 'public', f)), `public/${f} exists`);
}
const svg = read('public/icon.svg');
expect(svg.includes('>TOS<') && svg.includes('polygon') && svg.includes('rx="115"'), 'icon.svg is the TOS mark with the cap on the O');

// Proposal: video classes added, optional, and YouTube is never named.
const page = read('src/server/proposalPage.ts');
expect(page.includes('<h4>Video classes</h4>'), 'proposal has a Video classes card');
expect(page.includes('It is optional: every facility decides whether to offer it'), 'video classes marked optional per facility');
expect(!/youtube/i.test(page), 'the proposal never mentions YouTube');
expect(page.indexOf('<h4>Exam preparation</h4>') < page.indexOf('<h4>Video classes</h4>') && page.indexOf('<h4>Video classes</h4>') < page.indexOf('<h4>Question bank</h4>'), 'video card sits between the Exam preparation and Question bank cards');
expect(page.includes('/tos-brand-icon.png'), 'proposal brand mark is the new tile');

// Boot splash: wordmark in index.html (static markup + .tos branch) and the fallback component.
const index = read('index.html');
expect(index.includes('class="wm"'), 'index.html has the wordmark row');
expect(index.includes('<span class="word">Tutorial</span>') && index.includes('<span class="word">OS</span>'), 'wordmark reads Tutorial [logo] OS');
expect(index.includes('boot-splash.tos') && index.includes("el.classList.add('tos')"), 'the TOS branch shows the wordmark and hides the facility card');
expect(index.includes('boot-pop 1.6s ease-in-out infinite'), 'the wordmark mark keeps the pulse animation');
expect(!index.includes("/tos-splash-icon.png'"), 'index.html no longer points the TOS splash at the old icon');
const splash = read('src/components/student-portal/LaunchSplash.tsx');
expect(splash.includes('/tos-brand-icon.png') && splash.includes('>Tutorial</span>') && splash.includes('>OS</span>'), 'LaunchSplash TOS fallback is the wordmark');
expect(splash.includes('@keyframes boot-pop'), 'LaunchSplash defines the boot-pop animation');
expect(splash.includes('tosLaunchDot'), 'the loading dots are kept');

if (failures) { console.log(`--- ${failures} BATCH-42 TEST(S) FAILED ---`); process.exit(1); }
console.log('--- ALL BATCH-42 TESTS PASSED ---');
