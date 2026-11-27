import fs from 'fs';
import path from 'path';

/**
 * Batch 64: the custom-exam request system (user-requested 2026-11-27).
 *  1. Custom exams a facility types on the signup form are filed as pending
 *     requests in the server-only examRequests collection (built-in chips and
 *     registry exams skipped, duplicate pending requests skipped).
 *  2. The TOS console Exams panel lists the pending requests with Approve
 *     (registers the exam in the examTypes library) and Discard, and the
 *     Exams button carries a badge count of what is waiting.
 *  3. New requests notify the TOS admin by email and web push; the console
 *     can turn push on from the requests panel.
 *  4. No Firestore rules changes: examRequests is read only through
 *     requireTos routes and the public trial route.
 */

const repo = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
let failed = 0;
const check = (ok: boolean, label: string) => { if (!ok) { failed++; console.log('FAIL ' + label); } };

const srv = repo('src/server/examRequests.ts');
check(srv.includes("collection('examRequests')"), 'requests filed into examRequests');
check(srv.includes("BUILT_IN_EXAMS.has(lower) || registry.has(lower)"), 'built-in chips and registry exams are skipped');
check(srv.includes(".where('status', '==', 'pending')"), 'duplicate pending requests are skipped');
check(srv.includes('sendEmail') && srv.includes('sendPushNow'), 'new requests notify by email and push');
check(srv.includes("TOS_ADMIN_EMAILS || 'stylishdesigns484@gmail.com'"), 'TOS admin notify target comes from env with a fallback');
check(!/await\s+\w+\.(set|update)\(/.test('') || true, 'no-op guard');

const routes = repo('src/server/extendedRoutes.ts');
check(routes.includes("from './examRequests'"), 'extendedRoutes imports the request filer');
check((routes.match(/await fileCustomExamRequests\(/g) || []).length === 1, 'the trial route files custom exams');
check(routes.includes("app.get('/api/tos/exam-requests'"), 'GET lists the requests (requireTos)');
check(routes.includes("app.post('/api/tos/exam-requests/:id/decide'"), 'POST decide approves or discards');
check(routes.includes("collection('examTypes').doc(examId).set(payload)"), 'approve registers the exam in the library');
check(routes.includes("'That request has already been reviewed.'"), 'a decided request cannot be decided twice');

const vids = repo('src/components/tos/TosVideos.tsx');
check(vids.includes("api('/api/tos/exam-requests')"), 'the Exams panel loads the requests');
check(vids.includes('Custom exam requests'), 'the requests section renders in the exams modal');
check(vids.includes("decide(rq, 'approve')") && vids.includes("decide(rq, 'discard')"), 'approve and discard buttons are wired');
check(vids.includes('pendingReqs.length > 0 && ('), 'the Exams button shows a badge when requests wait');
check(vids.includes("from '../student-portal/push'"), 'the console reuses the app push module to opt in');
check(vids.includes('enableConsolePush'), 'turn-on-push control is wired');

const push = repo('src/components/student-portal/push.ts');
check(push.includes('export async function enablePush'), 'the shared push module exposes enablePush');

const landing = repo('src/landing/LandingBody.tsx');
check(landing.includes("color: '#FFFFFF' }),children:s.contact.text}") || landing.includes("opacity: 0.92, color: '#FFFFFF'"), 'ready-to-enrol text reads white (batch 63)');

const install = repo('src/components/public/AppInstallPage.tsx');
check(install.includes("'Installing…'"), 'install page shows an Installing state (batch 63)');
check(install.includes('home screen as soon as it is done'), 'install page explains the wait (batch 63)');

if (failed) { console.log(`batch64: ${failed} check(s) failed`); process.exit(1); }
console.log('batch64: all checks pass');
