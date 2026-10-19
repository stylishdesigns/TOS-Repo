import assert from 'node:assert/strict';
import {
  resultPercent,
  gradeFor,
  toneFor,
  overall,
  bySubject,
  timeUsage,
  recent,
} from './performance';
import { StudentResult, CBTExam } from '../../../../../types';

console.log('--- Running performance.ts Unit Tests ---');

const makeMockResult = (partial: Partial<StudentResult>): StudentResult => ({
  id: 'res-default',
  studentId: 'stu-default',
  studentName: 'Test Student',
  programmeName: 'Pre-Exam Track',
  examTitle: 'Default Test',
  date: '2026-10-10',
  totalScore: 50,
  averagePercent: 50,
  scores: [],
  rank: 1,
  remark: 'Good',
  ...partial,
});

const makeMockExam = (partial: Partial<CBTExam>): CBTExam => ({
  id: 'ex-default',
  title: 'Default Exam',
  department: 'All',
  subjects: ['General'],
  durationMinutes: 45,
  questionCount: 20,
  questions: [],
  status: 'Live',
  frequency: 'Mock',
  targetExam: 'UTME',
  attemptsCount: 10,
  averageScore: 60,
  mode: 'MCQ',
  ...partial,
});

// 1. resultPercent tests
{
  const r1 = makeMockResult({
    averagePercent: 78.5,
  });
  assert.equal(resultPercent(r1), 78.5, 'resultPercent should prioritize averagePercent');

  const r2 = makeMockResult({
    averagePercent: undefined,
    scores: [
      { subject: 'Chemistry', score: 24, maxScore: 30 },
      { subject: 'Theory', score: 6, maxScore: 10 },
    ],
  });
  // (24 + 6) / (30 + 10) = 30 / 40 = 75%
  assert.equal(resultPercent(r2), 75, 'resultPercent calculates sum(got) / sum(max) * 100 without hardcoding 400');
  console.log('✓ resultPercent passed');
}

// 2. gradeFor tests
{
  assert.equal(gradeFor(85).grade, 'A1');
  assert.equal(gradeFor(85).label, 'Excellent');
  assert.equal(gradeFor(72).grade, 'B2');
  assert.equal(gradeFor(67).grade, 'B3');
  assert.equal(gradeFor(61).grade, 'C4');
  assert.equal(gradeFor(56).grade, 'C5');
  assert.equal(gradeFor(52).grade, 'C6');
  assert.equal(gradeFor(46).grade, 'D7');
  assert.equal(gradeFor(42).grade, 'E8');
  assert.equal(gradeFor(38).grade, 'F9');
  assert.equal(gradeFor(38).label, 'Fail');
  console.log('✓ gradeFor passed');
}

// 3. toneFor tests
{
  assert.equal(toneFor(75), 'emerald');
  assert.equal(toneFor(70), 'emerald');
  assert.equal(toneFor(69), 'orange');
  assert.equal(toneFor(50), 'orange');
  assert.equal(toneFor(49.9), 'rose');
  assert.equal(toneFor(10), 'rose');
  console.log('✓ toneFor passed');
}

// 4. overall tests
{
  const mockExam = makeMockExam({
    id: 'ex-1',
    title: 'Maths Exam',
    department: 'Science',
    subjects: ['Mathematics'],
    durationMinutes: 45,
    questionCount: 40,
    averageScore: 65,
  });
  const examsMap = new Map<string, CBTExam>([[mockExam.id, mockExam]]);

  const results: StudentResult[] = [
    makeMockResult({ id: '1', examId: 'ex-1', date: '2026-10-12', totalScore: 80, averagePercent: 80 }),
    makeMockResult({ id: '2', examId: 'ex-1', date: '2026-10-10', totalScore: 70, averagePercent: 70 }),
    makeMockResult({ id: '3', examId: 'ex-1', date: '2026-10-08', totalScore: 60, averagePercent: 60 }),
  ];

  const stats = overall(results, 'last8', examsMap);
  assert.equal(stats.count, 3);
  assert.equal(stats.meanPercent, 70); // (80 + 70 + 60)/3 = 70
  assert.equal(stats.bestScore, 80);
  assert.equal(stats.aboveClassAvg.count, 2); // 80 and 70 are >= 65
  assert.equal(stats.aboveClassAvg.totalWithBenchmark, 3);
  assert.equal(stats.changePoints, null, 'No previous window of same size should return null changePoints');
  console.log('✓ overall passed');
}

// 5. bySubject tests
{
  const examMap = new Map<string, CBTExam>([
    ['ex-m', makeMockExam({ id: 'ex-m', title: 'Maths', department: 'Science', subjects: ['Mathematics'], averageScore: 65 })],
    ['ex-p', makeMockExam({ id: 'ex-p', title: 'Physics', department: 'Science', subjects: ['Physics'], averageScore: 55 })],
  ]);

  const results: StudentResult[] = [
    makeMockResult({ id: '1', examId: 'ex-m', examTitle: 'Maths 2', date: '2026-10-12', totalScore: 75, averagePercent: 75 }),
    makeMockResult({ id: '2', examId: 'ex-m', examTitle: 'Maths 1', date: '2026-10-10', totalScore: 65, averagePercent: 65 }),
    makeMockResult({ id: '3', examId: 'ex-p', examTitle: 'Physics 2', date: '2026-10-11', totalScore: 50, averagePercent: 50 }),
    makeMockResult({ id: '4', examId: 'ex-p', examTitle: 'Physics 1', date: '2026-10-09', totalScore: 40, averagePercent: 40 }),
  ];

  const subjects = bySubject(results, examMap);
  assert.equal(subjects.length, 2);

  const math = subjects.find(s => s.subject === 'Mathematics')!;
  assert.equal(math.meanPercent, 70); // (75+65)/2
  assert.equal(math.deltaSincePrevious, 10); // 75 - 65
  assert.equal(math.classAverage, 65);
  assert.equal(math.needsFocus, false);

  const physics = subjects.find(s => s.subject === 'Physics')!;
  assert.equal(physics.meanPercent, 45); // (50+40)/2
  assert.equal(physics.deltaSincePrevious, 10); // 50 - 40
  assert.equal(physics.classAverage, 55);
  assert.equal(physics.needsFocus, true, 'Physics is lowest, has 2 attempts, and is below 60%');
  console.log('✓ bySubject passed');
}

// 6. timeUsage tests
{
  const examMap = new Map<string, CBTExam>([
    ['ex-1', makeMockExam({ id: 'ex-1', title: 'Exam 1', durationMinutes: 50 })],
  ]);

  const results: StudentResult[] = [
    // 50 mins = 3000 seconds. Took 2280 seconds = 76% time used.
    makeMockResult({ id: '1', examId: 'ex-1', examTitle: 'Exam 1', date: '2026-10-12', totalScore: 80, timeTakenSeconds: 2280 }),
  ];

  const usage = timeUsage(results, examMap);
  assert.notEqual(usage, null);
  assert.equal(usage!.percentUsed, 76);
  assert.equal(usage!.typicalDurationMinutes, 50);
  assert.equal(usage!.spareMinutes, 12); // (1 - 0.76) * 50 = 12 mins spare
  assert.ok(usage!.sentence.includes('12 minutes to spare on a 50-minute test'));
  console.log('✓ timeUsage passed');
}

// 7. recent tests
{
  const examMap = new Map<string, CBTExam>([
    ['ex-1', makeMockExam({ id: 'ex-1', title: 'Maths Exam', department: 'Science', subjects: ['Mathematics'], averageScore: 60 })],
  ]);

  const results: StudentResult[] = [
    makeMockResult({ id: '1', examId: 'ex-1', examTitle: 'Maths Exam Final', date: '2026-10-12', totalScore: 78, averagePercent: 78 }),
  ];

  const rec = recent(results, examMap, 5);
  assert.equal(rec.length, 1);
  assert.equal(rec[0].initials, 'MA');
  assert.equal(rec[0].percent, 78);
  assert.equal(rec[0].vsClass, 18); // 78 - 60 = +18
  assert.equal(rec[0].tone, 'emerald');
  console.log('✓ recent passed');
}

console.log('--- ALL UNIT TESTS PASSED SUCCESSFULLY ---');
