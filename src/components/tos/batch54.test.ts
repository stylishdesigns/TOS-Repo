import fs from 'fs';
import path from 'path';

/**
 * Batch 54: the facility type registry.
 * - TOS console gains a System tab, Facility types: add, edit and delete the
 *   kinds of education facility TOS serves, each with the exam programmes it
 *   prepares students for (Firestore facilityTypes, server-only, lazily
 *   seeded with the six launch kinds).
 * - The signup flow's Type-of-facility dropdown reads the registry live
 *   through /api/public/facility-types and falls back to the built-in list
 *   when the registry is unreachable; picking a kind pre-selects its exams,
 *   registry kinds first, built-in mapping as fallback.
 */
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

let failures = 0;
const expect = (cond: boolean, label: string) => {
  if (cond) { console.log('ok  ' + label); } else { failures += 1; console.log('FAIL ' + label); }
};

// --- Server routes -------------------------------------------------------
const srv = read('src/server/extendedRoutes.ts');
expect(srv.includes("collection('facilityTypes')"), 'server stores facility types in the facilityTypes collection');
expect(srv.includes("'/api/public/facility-types'"), 'a public read serves the registry to the signup form');
expect(srv.includes("'/api/tos/facility-types'"), 'a TOS-staff read lists the registry');
expect(srv.includes("app.post('/api/tos/facility-types'"), 'a TOS-staff route adds a kind');
expect(srv.includes("app.patch('/api/tos/facility-types/:id'"), 'a TOS-staff route edits a kind');
expect(srv.includes("app.delete('/api/tos/facility-types/:id'"), 'a TOS-staff route removes a kind');
expect(srv.includes("name: 'Tutorial centre', exams: ['JAMB', 'WAEC', 'NECO']"), 'seed: Tutorial centre with its exams');
expect(srv.includes("name: 'A-level centre', exams: ['IJMB', 'JUPEB']"), 'seed: A-level centre with its exams');
expect(srv.includes("name: 'Professional exam centre', exams: []"), 'seed: Professional exam centre with no exams');
expect(srv.includes('FACILITY_TYPE_SEEDS'), 'the seed lives in one place');
expect(/ftypes-\$\{ip/.test(srv) || srv.includes('ftypes-'), 'the public read is rate limited');
expect(srv.includes("'ftype-' + slug") || srv.includes("'ftype-' + slug.slice"), 'kind ids are deterministic slugs so edits cannot duplicate');
expect(srv.includes('sanitizeFacilityExams'), 'exam programmes are sanitized (uppercase, deduped, capped)');

// --- Console tab ---------------------------------------------------------
const portal = read('src/components/tos/TosPortal.tsx');
expect(portal.includes("{ id: 'ftypes', label: 'Facility types', mlabel: 'Types', icon: Shapes, group: 'System' }"), 'the Facility types tab sits in the System group');
expect(portal.includes("<TosFacilityTypes refreshKey={refreshKey} />"), 'the tab renders the registry component');
expect(portal.includes("The signup form reads this list live"), 'the tab description says the signup form reads the list live');

const tab = read('src/components/tos/TosFacilityTypes.tsx');
expect(tab.includes("'/api/tos/facility-types'"), 'the tab lists kinds from the server route');
expect(tab.includes("'POST'") || tab.includes("method: 'POST'"), 'the tab adds a kind');
expect(tab.includes("method: 'PATCH'"), 'the tab edits a kind');
expect(tab.includes("method: 'DELETE'"), 'the tab removes a kind');
expect(tab.includes('Refresh'), 'the tab has a visible Refresh button');
expect(!tab.includes('setInterval'), 'the tab never auto-refreshes');
expect(tab.includes('Add facility kind'), 'the tab has an add form');
expect(tab.includes('Exam programmes'), 'the add form asks for the exam programmes');

// --- Signup flow reads the registry -------------------------------------
const sf = read('src/components/public/landing/SignupFlow.tsx');
expect(sf.includes("fetch('/api/public/facility-types')"), 'the signup form reads the registry live');
expect(sf.includes('typeOptions'), 'the dropdown options come from the live list');
expect(sf.includes('FACILITY_TYPES'), 'the built-in launch list stays as the fallback');
expect(sf.includes('registry unreachable: the built-in list stays'), 'a failed registry read keeps the form working');
expect(sf.includes('typeExamMap.current[type]'), 'picking a kind applies the exams the registry attached');
expect(sf.includes("const FIXED_EXAMS = ['JAMB', 'WAEC', 'NECO', 'POST-UTME']"), 'registry exams matching the fixed set pre-select the fixed chips');
expect(sf.includes("custom: customList.length > 0"), 'registry exams outside the fixed set land as custom chips');

if (failures) { console.log(`--- ${failures} BATCH-54 TEST(S) FAILED ---`); process.exit(1); }
console.log('--- ALL BATCH-54 TESTS PASSED ---');
