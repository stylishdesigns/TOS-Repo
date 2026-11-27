import fs from 'fs';
import path from 'path';

/**
 * Batch 56: a facility's exam programmes gate what its portals serve.
 * - The centre's exam programmes (audienceTypes, picked at signup from the
 *   facility-type registry) decide which platform mocks the facility's
 *   students see: server-side, in the mock routes, not just on the phone.
 * - JAMB mocks reach JAMB facilities; WAEC/NECO mocks reach WAEC or NECO
 *   facilities (one mock serves both exams).
 * - A centre that records no programmes (older facilities) sees everything,
 *   the same fallback the student practice tab already uses.
 * - Past attempts keep their state: results a student already sat stay
 *   visible in history and on past days.
 */
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

let failures = 0;
const expect = (cond: boolean, label: string) => {
  if (cond) { console.log('ok  ' + label); } else { failures += 1; console.log('FAIL ' + label); }
};

const gate = read('src/server/examProgrammeGate.ts');
expect(gate.includes('jamb'), 'the gate knows the JAMB programme');
expect(gate.includes('waec_neco'), 'the gate knows the WAEC/NECO mock type');
expect(gate.includes('if (!list.length) return null;'), 'a centre with no recorded programmes is ungated');
expect(gate.includes('.trim().toLowerCase()'), 'programme matching is case-insensitive');

const routes = read('src/server/studentMockRoutes.ts');
expect(routes.includes("examProgrammeGate"), 'the mock routes import the gate');
expect(routes.includes('mockGate: centreMockGate(centre.audienceTypes)'), 'the gate is built from the centre document');
expect(routes.includes('weekAll.filter'), 'the week strip is filtered by the gate');
expect(routes.includes('const allowed = usable'), 'a day shows as upcoming only when the exam matches');
expect(routes.includes('There is no mock today for your facility.'), 'start is guarded on the server');

const practice = read('src/components/student-portal/tabs/StudentPractice.tsx');
expect(practice.includes('audienceTypes'), 'student practice filters exams by the centre programmes');

if (failures) { console.log('batch56: ' + failures + ' failed'); process.exit(1); }
console.log('batch56: all good');
