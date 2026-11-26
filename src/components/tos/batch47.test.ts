/**
 * Batch 47: the proposal intro's second paragraph reworded per the user.
 * The old "runs in the browser ... nothing to install" sentence becomes the
 * point the user asked for: no difficulty of a separate download for Android
 * and iPhone users, the same app works on both phones, and it is even
 * accessible on the web.
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

check('no old browser/nothing-to-install sentence', !page.includes('with nothing to install'));
check('no separate download difficulty stated', page.includes('downloading a separate app for Android and iPhone users'));
check('same app works on both phones', page.includes('the same app works on both phones'));
check('accessible on the web kept', page.includes('it is even accessible on the web from any phone or laptop'));
check('facility-kinds sentence untouched', page.includes('It is built for tutorial and lesson centres'));

if (failures.length) { console.error(`batch47: ${failures.length} failed`); process.exit(1); }
console.log('batch47 ok');
