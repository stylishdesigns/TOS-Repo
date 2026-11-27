import fs from 'fs';
import path from 'path';

/**
 * Batch 57: the commercial cleanup.
 *  1. The facility admin's upgrade panel shows the confirmed seat prices
 *     (Standard ₦1,000, Premium ₦2,500 per seat per month): a one-time price
 *     stamp on the plan catalogue rides the seats read.
 *  2. The welcome and login-details emails list the login email, temporary
 *     password and access code as check rows, and the registered ZeptoMail
 *     template is retired: every send carries the internal template.
 *  3. No 14-day free trial anywhere: facilities upgrade whenever they want
 *     more seats.
 *  4. Terms & Conditions and Privacy Policy exist (popup on the facility
 *     details page plus real /terms and /privacy pages), and the video
 *     classes card carries its own terms for admins.
 */

const repo = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
let failed = 0;
const ok = (name: string, cond: boolean) => {
  if (!cond) { failed += 1; console.error('FAIL', name); } else console.log('ok  ', name);
};

(async () => {
// --- 1. Seat prices.
const seat = repo('src/server/seatUpgrades.ts');
ok('price stamp exists', /ensurePlansV4Prices/.test(seat));
ok('standard is ₦1,000', /centre_standard: 1000/.test(seat));
ok('premium is ₦2,500', /centre_plus: 2500/.test(seat));
ok('free stays ₦0', /centre_free: 0/.test(seat));
ok('stamp rides the seats read', /try \{ await ensurePlansV4Prices\(\); \} catch/.test(repo('src/server/tenantService.ts')));

// --- 2 + 3. Email templates.
const wt = repo('src/server/welcomeTemplate.ts');
const wtHtml = repo('welcome-email-template.html');
const { renderWelcomeTemplate } = await import('../../server/welcomeTemplate');
const rendered = renderWelcomeTemplate({
  fullName: 'Ada Obi', centreName: 'Excellence Tutorial Centre',
  accessCode: '727187', loginEmail: 'ada@example.com',
  tempPassword: 'TempPass1!', signInUrl: 'https://example.com/c/x',
});
ok('welcome lists email first', rendered.html.indexOf('Login email') < rendered.html.indexOf('Temporary password'));
ok('welcome lists password second', rendered.html.indexOf('Temporary password') < rendered.html.indexOf('Access code'));
ok('welcome carries check rows', (rendered.html.match(/&#10003;/g) || []).length === 3);
ok('welcome fills the credentials', rendered.html.includes('ada@example.com') && rendered.html.includes('TempPass1!') && rendered.html.includes('727187'));
ok('welcome text has check lines', rendered.text.includes('\u2713 Login email: ada@example.com') && rendered.text.includes('\u2713 Temporary password: TempPass1!') && rendered.text.includes('\u2713 Access code: 727187'));
ok('no trial copy in the template', !/14.day|14 day|FREE TRIAL|free trial/i.test(wt) && !/14.day|14 day|FREE TRIAL|free trial/i.test(wtHtml));
ok('html file and embedded template agree', wtHtml.includes('FOR YOUR FACILITY') && wt.includes('FOR YOUR FACILITY') && wtHtml.includes('Login email') && wt.includes('Login email'));
ok('subject unchanged', rendered.subject === 'Your Tutorial OS facility is ready');

const em = repo('src/server/email.ts');
ok('registered zepto template retired', !em.includes('ZEPTOMAIL_TEMPLATE_KEY'));
ok('check row helper exists', em.includes('const CHECK = (label: string, value: string)'));
const { buildWelcomeEmail, buildStaffInviteEmail, buildAccessCodeChangedEmail } = await import('../../server/email');
const welcome = buildWelcomeEmail({ to: 'a@b.c', centreName: 'Excellence', loginEmail: 'a@b.c', tempPassword: 'pw', accessCode: '123456', appUrl: 'https://x' });
ok('resend email lists the three in order', welcome.html.indexOf('Login email') < welcome.html.indexOf('Temporary password') && welcome.html.indexOf('Temporary password') < welcome.html.indexOf('Access code'));
ok('resend email has check rows', (welcome.html.match(/&#10003;/g) || []).length === 3);
const staff = buildStaffInviteEmail({ to: 'a@b.c', fullName: 'Ada', centreName: 'Excellence', role: 'tutor', loginEmail: 'a@b.c', tempPassword: 'pw', accessCode: '123456', appUrl: 'https://x' });
ok('staff invite has check rows', (staff.html.match(/&#10003;/g) || []).length === 3);
const acc = buildAccessCodeChangedEmail({ to: 'a@b.c', centreName: 'Excellence', accessCode: '999999', appUrl: 'https://x' });
ok('access-code email uses a check row', acc.html.includes('New access code') && acc.html.includes('&#10003;'));
ok('no trial copy in email.ts', !/14.day|14 day|free trial/i.test(em));

// --- 4. Terms, privacy and the popup.
const legal = repo('src/components/public/legal/TermsPrivacy.tsx');
ok('terms + privacy sections exist', legal.includes('export const TERMS_SECTIONS') && legal.includes('export const PRIVACY_SECTIONS'));
ok('video terms exist', legal.includes('export const VIDEO_TERMS_SECTIONS') && legal.includes('export const VideoTermsModal'));
ok('seat wording right in terms', /pays for seats/.test(legal) && !/pays for (a )?student/.test(legal));
ok('terms quote the confirmed prices', legal.includes('\u20A61,000') && legal.includes('\u20A62,500'));
ok('terms + privacy have no trial promise', !/(14.day|14 day|free trial)/i.test(legal.replace('no trial period to run out and nothing to cancel', '')));
ok('signup popup wired', /setLegalKind\('privacy'\)/.test(repo('src/components/public/landing/SignupFlow.tsx')) && /setLegalKind\('terms'\)/.test(repo('src/components/public/landing/SignupFlow.tsx')) && repo('src/components/public/landing/SignupFlow.tsx').includes("from '../legal/TermsPrivacy'"));
const main = repo('src/main.tsx');
ok('terms + privacy are real routes', main.includes('/^\\/terms\\/?$/.test') && main.includes('/^\\/privacy\\/?$/.test') && /'terms', 'privacy'/.test(main));

// --- 5. The video-classes card carries the terms.
const rm = repo('src/components/academics/ResourcesManager.tsx');
ok('video card has the terms button', rm.includes('View terms') && rm.includes('VideoTermsModal'));

if (failed) { console.error(`batch 57: ${failed} failing check(s)`); process.exit(1); }
console.log('batch 57: all checks pass');
})();
