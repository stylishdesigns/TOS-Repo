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
  'Run your whole education facility from one place.',
  'Try it live as',
  'What you get',
  'One system, three portals.',
  'AI built in',
  'Your name on everything.',
  'Live in three steps.',
  'Simple pricing, in naira.',
  'Free for 14 days',
  'Questions, answered.',
  'Ready to run your facility on one system?',
  '\u20A62,000',
  '\u20A63,500',
);
assert.ok(html.includes('Check your email'), 'automated flow step 2');
assert.ok(html.includes('Set up and invite'), 'automated flow step 3');
assert.ok(!html.includes('Our team reviews your request'), 'no manual setup copy');
console.log('✓ artboard sections and copy');

// The interactive hero preview, portals tabs, AI section, brand picker, estimator.
has('Chemistry, 10:00 AM', 'Dashboard', 'Top performers this month', 'Bright Minds Tutorial');
assert.ok(!html.includes('Estimate your monthly cost'), 'cost estimator must be gone');
console.log('✓ interactive previews render');

// No sign-in or sign-up buttons anywhere on the landing page.
has('Student &amp; tutor portals');
assert.ok(!html.includes('Sign in'), 'no Sign in button may appear');
assert.ok(!html.includes('Student sign in'), 'no Student sign in button may appear');
assert.ok(!html.includes('Sign in instead'), 'no Sign in instead link may appear');
console.log('✓ no sign-in or sign-up buttons');

// The trial form fields: the landing form keeps the owner's details only
// (facility details moved to the /start page) and a Login button opens the
// centre access-code gate. No discount request and no city anywhere.
has('Full name', 'Email', 'Phone', 'State', 'Start my free trial', 'Login');
assert.ok(!html.includes('Request a 20% discount'), 'discount request checkbox must stay removed');
assert.ok(!html.includes('City'), 'city must stay off the forms');
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
