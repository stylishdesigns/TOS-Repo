import assert from 'node:assert/strict';
import {
  APPLICANTS, PAYMENTS, QUIZ, heroReducer, initialHeroState, presentCount, quizFeedback, quizScoreText,
  type HeroAction, type HeroState,
} from './heroState';

console.log('--- Running heroState.ts Unit Tests ---');
const run = (actions: HeroAction[], from: HeroState = initialHeroState) => actions.reduce(heroReducer, from);

assert.equal(initialHeroState.role, 'student');
assert.equal(initialHeroState.student, 'home');
assert.equal(presentCount(initialHeroState), 3);

// navigation, and a toast clears when you move
let s = run([{ type: 'admin', screen: 'dashboard' }, { type: 'report' }]);
assert.ok(s.toast.includes('Sample report sheet'));
assert.equal(run([{ type: 'role', role: 'tutor' }], s).toast, '');
assert.equal(run([{ type: 'student', screen: 'cbt' }], s).toast, '');
assert.equal(run([{ type: 'role', role: 'admin' }]).role, 'admin');
assert.equal(run([{ type: 'tutor', screen: 'progress' }]).tutor, 'progress');
assert.equal(run([{ type: 'admin', screen: 'fees' }]).admin, 'fees');
console.log('✓ navigation');

// quiz: all right
s = run([{ type: 'pick', option: 0 }]);
assert.equal(quizFeedback(s), 'Correct!');
s = run([{ type: 'next' }, { type: 'pick', option: 1 }, { type: 'next' }, { type: 'pick', option: 2 }], s);
assert.equal(s.quiz.score, 3);
s = heroReducer(s, { type: 'next' });
assert.equal(s.quiz.finished, true);
assert.equal(quizScoreText(s), 'You scored 3 out of 3');
// quiz: a wrong answer shows the right one, and a second click is ignored
s = run([{ type: 'pick', option: 1 }, { type: 'pick', option: 0 }]);
assert.equal(s.quiz.score, 0);
assert.equal(s.quiz.picked, 1);
assert.equal(quizFeedback(s), 'Not quite. The answer is Newton.');
// cannot move on before answering; cannot answer after finishing; bad options ignored
assert.equal(run([{ type: 'next' }]).quiz.index, 0);
assert.equal(run([{ type: 'pick', option: 9 }]).quiz.picked, null);
assert.equal(run([{ type: 'pick', option: -1 }]).quiz.picked, null);
const done = run([{ type: 'pick', option: 0 }, { type: 'next' }, { type: 'pick', option: 1 }, { type: 'next' }, { type: 'pick', option: 2 }, { type: 'next' }]);
assert.equal(done.quiz.finished, true);
assert.equal(heroReducer(done, { type: 'pick', option: 0 }), done);
assert.equal(heroReducer(done, { type: 'next' }), done);
const again = heroReducer(done, { type: 'retry' });
assert.deepEqual(again.quiz, { index: 0, picked: null, score: 0, finished: false });
assert.equal(QUIZ.length, 3);
console.log('✓ quiz');

assert.equal(run([{ type: 'coach', key: 'challenge' }]).coach, 'challenge');

// attendance toggles and counts
s = run([{ type: 'present', index: 2 }]);
assert.equal(presentCount(s), 4);
s = heroReducer(s, { type: 'present', index: 0 });
assert.equal(presentCount(s), 3);
assert.equal(heroReducer(initialHeroState, { type: 'present', index: 99 }), initialHeroState);
assert.equal(heroReducer(initialHeroState, { type: 'present', index: -1 }), initialHeroState);
console.log('✓ attendance');

// AI question drafting: idle -> busy -> done -> idle, and no jumping ahead
assert.equal(heroReducer(initialHeroState, { type: 'draftFinish' }).draft, 'idle');
s = heroReducer(initialHeroState, { type: 'draftStart' });
assert.equal(s.draft, 'busy');
assert.equal(heroReducer(s, { type: 'draftStart' }), s);
s = heroReducer(s, { type: 'draftFinish' });
assert.equal(s.draft, 'done');
assert.equal(heroReducer(s, { type: 'draftStart' }), s);
assert.equal(heroReducer(s, { type: 'draftReset' }).draft, 'idle');
console.log('✓ question drafting');

// admissions and fees: one-way, idempotent, bounds-safe, independent of each other
s = run([{ type: 'approve', index: 1 }, { type: 'approve', index: 1 }]);
assert.deepEqual(s.approved, [false, true, false]);
assert.equal(s.approved.length, APPLICANTS.length);
s = run([{ type: 'confirm', index: 0 }, { type: 'confirm', index: 0 }], s);
assert.deepEqual(s.confirmed, [true, false]);
assert.equal(s.confirmed.length, PAYMENTS.length);
assert.deepEqual(s.approved, [false, true, false]);
assert.equal(heroReducer(initialHeroState, { type: 'approve', index: 7 }), initialHeroState);
assert.equal(heroReducer(initialHeroState, { type: 'confirm', index: -3 }), initialHeroState);
console.log('✓ admissions and fees');

// the reducer never mutates its input
const frozen = Object.freeze({ ...initialHeroState, present: Object.freeze([...initialHeroState.present]) as unknown as boolean[] });
heroReducer(frozen, { type: 'present', index: 0 });
assert.equal(presentCount(initialHeroState), 3);
console.log('--- ALL HERO STATE TESTS PASSED SUCCESSFULLY ---');
