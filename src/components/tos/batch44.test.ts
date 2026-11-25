/**
 * Batch 44: the proposal intro addressed to owner/admins ("software system",
 * fees = management), plan feature lists in the seat-payment modal, the
 * facility admin Resources section with the TOS video-classes switch, and
 * the access-code on/off switch.
 */
import * as fs from 'fs';
import * as path from 'path';

// tsx runs from the repo root; resolve paths from there.
const repo = process.cwd();

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(cond ? `ok   ${name}` : `FAIL ${name}`);
  if (!cond) failures += 1;
};
const read = (p: string) => fs.readFileSync(path.join(repo, p), 'utf-8');

const proposal = read('src/server/proposalPage.ts');
const seats = read('src/components/students/SeatsManagementPanel.tsx');
const sidebar = read('src/components/layout/Sidebar.tsx');
const appCtx = read('src/context/AppContext.tsx');
const app = read('src/App.tsx');
const resources = read('src/components/academics/ResourcesManager.tsx');
const server = read('src/server/extendedRoutes.ts');
const accessCode = read('src/components/settings/AccessCodeSettings.tsx');

// 1. Proposal intro
check('proposal: no "handled" in the fees heading', !proposal.includes('Money and parents, handled'));
check('proposal: fees heading uses management', proposal.includes('Fee management for students and parents'));
check('proposal: hero says software system', proposal.includes('Run your whole learning facility on one software system.'));
check('proposal: intro says software system', proposal.includes('Tutorial OS is one software system'));
check('proposal: addressed to owner and admins', proposal.includes('To the owner and admins of ${name}'));
check('proposal: footer says software system', proposal.includes('One software system for learning facilities of every kind'));

// 2. Seat payment modal plan features
check('seats: feature map keyed by plan id', seats.includes('centre_standard:') && seats.includes('centre_premium:'));
check('seats: feature list rendered in plan cards', seats.includes('PLAN_FEATURES[p.id]'));
check('seats: AI analysis line present', seats.includes('AI question generation and performance analysis'));

// 3. Admin resources section
check('appctx: resources section type', appCtx.includes("  | 'resources'"));
check('sidebar: Resources nav item', sidebar.includes("{ id: 'resources', label: 'Resources', icon: FolderOpen }"));
check('app: resources section rendered', app.includes("adminSection === 'resources' && <ResourcesManager />"));
check('app: resources lazy import', app.includes("import('./components/academics/ResourcesManager')"));
check('resources: TOS video classes switch calls the centre route', resources.includes('/api/centre/video-classes'));
check('resources: reuses the tutor materials uploader', resources.includes('TutorMaterialsSection'));

// 4. Access-code switch
check('server: access-code require route', server.includes('/api/centre/access-code/require'));
check('server: centre-by-slug carries the flag', server.includes('accessCodeRequired: data.accessCodeRequired !== false'));
check('app: app skips the gate when the code is off', app.includes('facility.accessCodeRequired === false'));
check('settings: toggle saves through the route', accessCode.includes('/api/centre/access-code/require'));

// 5. Video-classes enforcement
check('server: video-classes routes exist', (server.match(/app\.(get|post)\('\/api\/centre\/video-classes'/g) || []).length >= 2);
check('server: student video fetch honours the switch', server.includes('videoClassesOff'));
check('server: student fetch gate returns an empty library when off', server.includes('const videos = videoClassesOff ? [] : all.filter((v) => {'));

if (failures > 0) {
  console.error(`batch 44: ${failures} failing`);
  process.exit(1);
}
console.log('batch 44: all checks pass');
