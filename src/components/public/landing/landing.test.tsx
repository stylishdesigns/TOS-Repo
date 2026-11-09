import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ALL_POINTS, BRAND_COLOURS, COACH_PROMPTS, COACH_REPLIES, brandDisplayName, brandInitials,
} from './landingContent';
import { PortalShowcase } from './PortalShowcase';
import { AiSection } from './AiSection';
import { PointList } from './PointList';
import { BrandSection } from './BrandSection';

console.log('--- Running landing page tests ---');

// brandInitials / brandDisplayName
assert.equal(brandInitials('Bright Minds Tutorial'), 'BM');
assert.equal(brandInitials('  greenfield   tutorial centre '), 'GT');
assert.equal(brandInitials('Excellence'), 'E');
assert.equal(brandInitials(''), 'YC');
assert.equal(brandInitials('   '), 'YC');
assert.equal(brandDisplayName('  '), 'Your Centre');
assert.equal(brandDisplayName(' Acme '), 'Acme');
console.log('✓ brand helpers');

// The honesty table: the expected status of every point. All are live (confirmed
// by the product owner). To add a future feature, add it as 'soon'; the tag
// mechanism is tested below.
for (const pt of ALL_POINTS) assert.equal(pt.status, 'live', `${pt.id} is ${pt.status}; update this table if that is intended`);
assert.equal(new Set(ALL_POINTS.map((p) => p.id)).size, ALL_POINTS.length, 'duplicate point ids');
for (const pt of ALL_POINTS) assert.ok(!/\s{2,}|\.\.|—/.test(pt.text), `odd text in ${pt.id}`);
console.log(`✓ ${ALL_POINTS.length} points, all live`);

// AI essay marking is internal only and must never be advertised.
assert.ok(!ALL_POINTS.some((p) => /essay/i.test(p.text)), 'essay marking must not appear on the public page');
assert.ok(!Object.values(COACH_REPLIES).some((r) => /essay/i.test(r)));
assert.equal(COACH_PROMPTS.length, 3);
assert.equal(BRAND_COLOURS.length, 4);
console.log('✓ no essay-marking claim');

// Server render smoke tests: the sections render and carry the key content.
const portals = renderToStaticMarkup(<PortalShowcase />);
for (const s of ['One system,', 'Centre admins', 'Tutors', 'Students', 'Fees &amp; Payments', 'Top performers this month', 'Generate report sheet', 'Sample data', 'role="tablist"']) {
  assert.ok(portals.includes(s), `PortalShowcase is missing: ${s}`);
}
assert.ok(!portals.includes('Coming soon'), 'no Coming soon tag when every point is live');
const ai = renderToStaticMarkup(<AiSection onReserve={() => undefined} />);
for (const s of ['Student study coach', 'What am I weak at?', 'What should I study next?', 'Challenge me', 'For students', 'For tutors', 'For admins', 'mole calculations', 'Centre Plus']) {
  assert.ok(ai.includes(s), `AiSection is missing: ${s}`);
}
assert.ok(!ai.includes('Coming soon'), 'no Coming soon tag in the AI section');
const brand = renderToStaticMarkup(<BrandSection />);
for (const s of ['Your name on everything.', 'Bright Minds Tutorial', 'BM', 'Facebook', 'Instagram', 'TikTok', 'Enrol now', 'aria-label="Orange"']) {
  assert.ok(brand.includes(s), `BrandSection is missing: ${s}`);
}
// The tag mechanism still works for a future 'soon' point.
const tagged = renderToStaticMarkup(<PointList points={[{ id: 'x', text: 'A future feature', status: 'soon' }, { id: 'y', text: 'A live feature', status: 'live' }]} />);
assert.equal((tagged.match(/Coming soon/g) || []).length, 1, 'only the soon point is tagged');
console.log('✓ sections render with their key content; the tag mechanism still works');
console.log('--- ALL LANDING TESTS PASSED SUCCESSFULLY ---');
