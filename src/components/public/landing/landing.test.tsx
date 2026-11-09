import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TutorialOsLanding } from '../TutorialOsLanding';

console.log('--- Running landing page tests ---');
const html = renderToStaticMarkup(
  <TutorialOsLanding
    onAdminSignIn={() => undefined}
    onStudentAccess={() => undefined}
    onExplorePortals={() => undefined}
  />,
);
const has = (...xs: string[]) => xs.forEach((x) => assert.ok(html.includes(x), `missing: ${x}`));

// Structure and copy follow the design artboard (Main.dc.html).
has(
  'Run your whole tutorial centre from one place.',
  'Try it live as',
  'What you get',
  'One system, three portals.',
  'AI built in',
  'Your name on everything.',
  'Live in three steps.',
  'Simple pricing, in naira.',
  'Free for 14 days',
  'Questions, answered.',
  'Ready to run your centre on one system?',
  '\u20A63,000',
  '\u20A65,000',
);
console.log('✓ artboard sections and copy');

// The interactive hero preview, portals tabs, AI section, brand picker, estimator.
has('Chemistry, 10:00 AM', 'Dashboard', 'Top performers this month', 'Bright Minds Tutorial', 'Estimate your monthly cost');
console.log('✓ interactive previews render');

// The real login entries kept from the previous landing page.
has('Student sign in', 'Student &amp; tutor portals', 'Sign in instead');
assert.ok(html.split('Sign in').length >= 3, 'Sign in must appear in the header and footer');
console.log('✓ login entries retained');

// The trial form fields from the artboard.
has(
  'Full name', 'Centre name', 'Email', 'Phone', 'State', 'City',
  'How many students do you teach?', 'Request my free trial',
);
console.log('✓ trial form fields');

// AI essay-marking must never appear on the public page.
const dir = 'src/components/public';
const scan = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = join(d, e.name);
    return e.isDirectory() ? scan(p) : e.name === 'landing.test.tsx' ? [] : /\.(tsx?|css)$/.test(e.name) ? [readFileSync(p, 'utf8')] : [];
  });
for (const src of scan(dir)) assert.ok(!/essay/i.test(src), 'essay marking must never appear on the public page');
console.log('✓ no essay-marking wording anywhere in the public components');
console.log('All landing tests passed.');
