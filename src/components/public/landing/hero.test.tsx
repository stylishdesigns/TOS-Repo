import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HeroPreview } from './HeroPreview';
import { COACH_REPLIES } from './landingContent';
import { DRAFT_QUESTIONS, initialHeroState, type HeroState } from './heroState';

console.log('--- Running HeroPreview render tests ---');
const html = (over: Partial<HeroState> = {}) => renderToStaticMarkup(<HeroPreview onReserve={() => undefined} initial={{ ...initialHeroState, ...over }} />);
const has = (h: string, ...xs: string[]) => xs.forEach((x) => assert.ok(h.includes(x), `missing: ${x}`));
const count = (h: string, x: string) => h.split(x).length - 1;

let h = html();
has(h, 'Try it live as', 'Student', 'Tutor', 'Admin', 'Welcome back', 'Chemistry, 10:00 AM', 'Ask the AI study coach', 'Sample data');
assert.equal(count(h, 'role="tab"'), 3);
console.log('✓ default: student home');

has(html({ student: 'classes' }), 'This week', 'Thursday, 2:00 PM');
has(html({ student: 'results' }), 'Weakest topic', 'Mole calculations');
has(html({ student: 'ai', coach: 'challenge' }), 'Ask me anything', 'Challenge me', COACH_REPLIES.challenge.slice(0, 40));
has(html({ student: 'cbt' }), 'Question 1 of 3', 'What is the SI unit of force?', 'Newton', 'Joule', 'Pascal');
h = html({ student: 'cbt', quiz: { index: 0, picked: 1, score: 0, finished: false } });
has(h, 'Not quite. The answer is Newton.', 'Next question');
h = html({ student: 'cbt', quiz: { index: 2, picked: 2, score: 3, finished: false } });
has(h, 'Correct!', 'See my score');
h = html({ student: 'cbt', quiz: { index: 2, picked: null, score: 2, finished: true } });
has(h, 'You scored 2 out of 3', 'Reserve a seat for your centre', 'Try again');
assert.ok(!h.includes('Question 3 of 3'));
console.log('✓ student screens and the quiz');

h = html({ role: 'tutor' });
has(h, 'Take attendance', 'Ada O.', 'Tunde B.', '3 of 4 present', 'Present', 'Absent');
has(html({ role: 'tutor', present: [true, true, true, true] }), '4 of 4 present');
has(html({ role: 'tutor', tutor: 'assess' }), 'Create with AI', 'Draft 3 questions');
has(html({ role: 'tutor', tutor: 'assess', draft: 'busy' }), 'Drafting questions');
h = html({ role: 'tutor', tutor: 'assess', draft: 'done' });
has(h, '3 questions drafted', 'Start over');
assert.equal(count(h, 'Solve x squared minus 5x'), 1);
assert.ok(h.includes(DRAFT_QUESTIONS[1].slice(0, 20)));
has(html({ role: 'tutor', tutor: 'progress' }), 'Class progress', 'Needs help', '6 students are struggling');
console.log('✓ tutor screens');

has(html({ role: 'admin' }), 'Dashboard', 'Top performers this month', 'Generate report sheet', 'Admissions', 'Fees');
h = html({ role: 'admin', admin: 'admissions', approved: [false, true, false] });
has(h, 'Ada Okafor', 'Tunde Bello', 'Chioma Eze');
assert.equal(count(h, '>Approved<'), 1);
assert.equal(count(h, '>Approve<'), 2);
h = html({ role: 'admin', admin: 'fees', confirmed: [true, false] });
has(h, 'Ibrahim Sani', 'Confirmed. Receipt issued.', 'Cash, awaiting check');
assert.equal(count(h, '>Confirmed<'), 1);
assert.equal(count(h, '>Confirm<'), 1);
has(html({ role: 'admin', toast: 'Sample report sheet ready. Your real ones use your own data.' }), 'Sample report sheet ready');
assert.ok(!html().includes('Sample report sheet ready'));
console.log('✓ admin screens, approvals, receipts and the toast');
console.log('--- ALL HERO RENDER TESTS PASSED SUCCESSFULLY ---');
