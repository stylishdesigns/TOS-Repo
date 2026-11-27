/**
 * Batch 49: the one-page proposal is a BRIEF, not a compression.
 * The user said batch 48's version carried every point of the full proposal
 * and read stuffy. This picks only the important points: what the facility
 * gets, the results engine, pricing and how to start, with generous
 * whitespace. Still one A4 page by the same fit math, still served at the
 * same link with ?short=1, still its own "One-page PDF" console button.
 */
import { readFileSync } from 'fs';

const repo = process.cwd();
const read = (p: string) => readFileSync(`${repo}/${p}`, 'utf-8');

const failures: string[] = [];
const check = (name: string, cond: unknown) => {
  if (cond) console.log(`  ok ${name}`);
  else { console.error(`  FAIL ${name}`); failures.push(name); }
};

const page = read('src/server/proposalPage.ts');
// The compact builder lives in one block; scope the gone-checks to it so the full proposal's own parts do not trip them.
const block = page.slice(page.indexOf('const COMPACT_CSS'), page.indexOf('Registers the public proposal routes'));
const tab = read('src/components/tos/TosProposals.tsx');

// The brief keeps only the important points.
check('brief keeps what-you-get section', page.includes('What Tutorial OS gives your facility'));
check('brief keeps results section', page.includes('Built to produce results'));
check('pricing section removed from the brief (batch 51)', !block.includes('<h2>Pricing</h2>'));
check('brief keeps ready-to-see-it-live CTA', page.includes('Ready to see it live?'));
check('brief keeps admissions', page.includes('Admissions and records:'));
check('brief keeps fee management wording', page.includes('<b>Fee management:</b>'));
check('brief keeps exams', page.includes('timed CBT practice and mock exams for JAMB, WAEC, NECO, IJMB and JUPEB'));
check('brief keeps 100k question bank', page.includes('Over 100,000 practice questions'));
check('brief keeps chat', page.includes('Chat for the whole facility:'));
check('brief keeps AI', page.includes('<b>AI built in:</b>'));
check('brief keeps brand everywhere', page.includes('Your brand everywhere:'));
check('brief keeps Android/iPhone/web', page.includes('Works on Android, iPhone and the web'));
check('brief keeps leaderboard idle-students point', page.includes('the leaderboard keep students competing')); // batch 50 rewrote the results line
check('brief keeps 300+ JAMB result point', page.includes('300 and above in JAMB'));
check('brief keeps NGN 0 / 1,000 / 2,500', page.includes('NGN 0') && page.includes('NGN 1,000') && page.includes('NGN 2,500'));
check('brief says per seat per month, never per student', page.includes('/ seat / month') && !page.includes('per student'));
check('seat wording removed from the brief, kept in the full proposal (batch 51)', !block.includes("A seat is one student's place on the platform") && page.includes('a seat only starts costing'));
check('empty-seat line removed from the brief (batch 51)', !block.includes('an empty seat never costs anything'));
check('brief keeps start-free steps in CTA', page.includes('check your email for the access code and login details'));

// The stuffy parts are gone from the brief.
check('no numbered 01-06 section chips in brief', !/class="cs">\s*<h2><span class="num">0/.test(page) && !block.includes('<span class="num">06</span>'));
check('no paybox in brief', !block.includes('class="cpay"') && !block.includes('How facilities pay for the platform itself'));
check('no plan-coverage checklist cards in brief', !block.includes('class="covers"'));
check('no fee-management duo cards in brief', !block.includes('In the loop, on time'));
check('no parent paragraph in brief', !block.includes('Parents who see progress renew and refer'));
check('no 7/3/1 warnings in brief', !block.includes('7, 3 and 1 days'));
check('no fresh-30-days line in brief', !block.includes('fresh 30 days'));
check('no 5-student cap line in brief', !page.includes('up to 5 students'));
check('no IJMB/JUPEB facility-kinds list in brief', !block.includes('It is built for tutorial and lesson centres'));

// One-page mechanics unchanged.
check('one-page fit math kept', page.includes('canvas.width * pageH / canvas.height'));
check('file still named -1page', page.includes('-1page.pdf'));
check('print fallback kept', page.includes('window.print()'));
check('auto-download on pdf=1 kept', page.includes("get('pdf') === '1'"));

// Everything else untouched: full proposal and console button.
check('full proposal builder untouched', page.includes('export function buildProposalPage(displayName: string, origin: string, slug: string): string'));
check('full page keeps covers cards', page.includes('class="covers"'));
check('console One-page PDF button kept', tab.includes('One-page PDF') && tab.includes('&short=1&pdf=1'));
check('console Download PDF kept', tab.includes("&pdf=1`, '_blank', 'noopener')"));

if (failures.length) { console.error(`batch49: ${failures.length} failed`); process.exit(1); }
console.log('batch49 ok');
