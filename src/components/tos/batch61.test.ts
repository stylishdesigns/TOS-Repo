/**
 * Batch 61: per-exam question banks and the registry-driven exam picker.
 *  1. Exam registry: questionType on every exam doc, POST/PATCH validation,
 *     no name changes (keys would break).
 *  2. Question bank: exam filter on list/tree/import; theory-only exams
 *     refuse objective imports and single-question saves.
 *  3. Mocks: subjects follow the exam's paper shape; a theory-only exam
 *     refuses mock creation; paper picks are exam-scoped; settings shape
 *     follows single-paper exams.
 *  4. Student practice: the student's exam keyword filters questions
 *     (examMatchesStudent), legacy WAEC/NECO tags answer for WAEC/NECO.
 *  5. UI: the exam picker is the first screen in Question Bank and Mocks;
 *     a mock cannot be set up until an exam is picked.
 */
import fs from 'fs';
let fails = 0;
function check(cond: boolean, msg: string) { if (!cond) { fails++; console.log('FAIL', msg); } else { console.log('ok', msg); } }

// --- Registry (extendedRoutes.ts) ---
const ext = fs.readFileSync('src/server/extendedRoutes.ts', 'utf8');
check(ext.includes("if (!['mcq', 'theory', 'both'].includes(qType))"), 'question types locked to mcq/theory/both on POST and PATCH');
check(ext.includes("questionType: id === 'exam-jamb' ? 'mcq' : 'both'"), 'read backfills questionType (JAMB mcq, others both)');
check(ext.includes("questionType: qType }"), 'exam creation carries questionType');
check(ext.includes("app.patch('/api/tos/exam-types/:id'"), 'PATCH /api/tos/exam-types/:id exists');
check(ext.includes("const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')"), 'registry names slugify (keys stay clean)');

// --- Question bank library: exam filter + candidates ---
const lib = fs.readFileSync('src/server/questionBankLibrary.ts', 'utf8');
check(lib.includes('export function examCandidateKeys'), 'examCandidateKeys normalises names to keys');
check(lib.includes("key === 'waec_neco') return ['waec', 'neco', 'waec_neco']"), 'legacy WAEC/NECO tag answers for WAEC and NECO');
check(lib.includes('export function examMatches(docExam: unknown, wantedKeys: string[])'), 'examMatches filters questions by exam candidates');
check(lib.includes('examKeys && !examMatches(d.examType, examKeys)'), 'the list query filters by the requested exam');
check(lib.includes('examPick ? examCandidateKeys(examPick)'), 'the tree reads the exam scope');

// --- Question bank routes: registry lookups + theory refusals ---
const qbr = fs.readFileSync('src/server/questionBankRoutes.ts', 'utf8');
check(qbr.includes('async function registryExam'), 'exam values resolve against the registry');
check((qbr.match(/is set to theory questions only\. Switch it to MCQ or Both in Question types/g) || []).length === 2, 'theory-only exams refuse single saves and imports, both named');

// --- Mocks: registry parsing, subject rules, exam-scoped picks ---
const mr = fs.readFileSync('src/server/mockRoutes.ts', 'utf8');
check(mr.includes('async function parseExamType'), 'parseExamType resolves the exam against the registry');
check(mr.includes('function isSinglePaperExam'), 'single-paper exams recognised (settings shape)');
check(mr.includes("'waec', 'neco', 'waec_neco'"), 'WAEC/NECO legacy alias lives in one place');
check(mr.includes('This exam runs one paper on one date: exactly one subject per mock.'), 'single-paper exams take exactly one subject');
check(mr.includes('takes theory questions only. The theory pipeline is still being built, so its mock paper cannot be built yet'), 'theory-only exams refuse mock creation');
check(mr.includes("examCandidateKeysOf(String(d.examType || 'jamb')).some((k) => examKeys.includes(k))"), 'pickPicked rejects questions from a different exam\u2019s bank');
check(mr.includes(".where('examType', 'in', examKeys.slice(0, 10))"), 'pickRandom draws only from this exam\u2019s bank');
check(mr.includes('examQuestionType: exam.questionType'), 'the mock doc records the exam\u2019s question type');
check(mr.includes("mock.examQuestionType === 'theory'"), 'readiness names the theory-only empty bank');
check(mr.includes('const singlePaper = isSinglePaperExam'), 'settings shape follows single-paper exams, not the hardcoded pair');

// --- Student practice filter ---
const prac = fs.readFileSync('src/components/student-portal/tabs/classes/utils/practice.ts', 'utf8');
check(prac.includes('export function examMatchesStudent'), 'examMatchesStudent exported for the practice UI');
check(prac.includes('if (!examMatchesStudent(data.examType, examType)) return;'), 'getQuestions drops other exams\u2019 questions');
check(prac.includes('getTopics(subject: string, examType: string'), 'topic counts are exam-scoped too');
const ps = fs.readFileSync('src/components/student-portal/tabs/classes/PracticeSection.tsx', 'utf8');
check(ps.includes('student.examToRegister || student.programmeName'), 'the student\u2019s exam keyword drives the filter');

// --- UI: picker first in both tabs ---
const qb = fs.readFileSync('src/components/tos/TosQuestionBank.tsx', 'utf8');
check(qb.includes('mr-1">Exam</span>'), 'exam picker row present in Question Bank');
check(qb.includes('Question types'), 'Question types editor reachable');
check(qb.includes('/api/tos/exam-types'), 'Question Bank reads the registry');
check(qb.includes('takes theory questions only'), 'theory-only exams warn at import');
check(qb.includes('All exams'), 'an All exams escape hatch exists');
const mb = fs.readFileSync('src/components/tos/TosMocks.tsx', 'utf8');
check(mb.includes('useExamRegistry'), 'Mocks reads the registry');
check(mb.includes('Choose an exam first: every mock is built for one exam.'), 'create is gated on a picked exam');
check(mb.includes('disabled={!examPick}'), 'the New mock button is disabled until an exam is picked');
check(mb.includes("emptyForm(examPick || 'jamb')"), 'the create form opens on the picked exam');
check(mb.includes('qTypeLabelOf(e.questionType)'), 'exam chips carry the question-type sublabel');

if (fails) { console.log('batch61: ' + fails + ' failures'); process.exit(1); }
console.log('batch61: all checks pass');
