import { StudentResult, CBTExam } from '../../../../../types';

export type Period = 'last8' | 'term' | 'all';
export type Tone = 'emerald' | 'orange' | 'rose';

export interface GradeBand {
  grade: string;
  min: number;
  max: number;
  label: string;
}

export const WAEC_GRADE_BANDS: GradeBand[] = [
  { grade: 'A1', min: 75, max: 100, label: 'Excellent' },
  { grade: 'B2', min: 70, max: 74.99, label: 'Very good' },
  { grade: 'B3', min: 65, max: 69.99, label: 'Good' },
  { grade: 'C4', min: 60, max: 64.99, label: 'Credit' },
  { grade: 'C5', min: 55, max: 59.99, label: 'Credit' },
  { grade: 'C6', min: 50, max: 54.99, label: 'Credit' },
  { grade: 'D7', min: 45, max: 49.99, label: 'Pass' },
  { grade: 'E8', min: 40, max: 44.99, label: 'Pass' },
  { grade: 'F9', min: 0, max: 39.99, label: 'Fail' },
];

export const TONE_STYLES: Record<Tone, {
  color: string;
  bg: string;
  text: string;
  border: string;
}> = {
  emerald: {
    color: '#10B981',
    bg: '#ECFDF5',
    text: '#047857',
    border: 'rgba(16, 185, 129, 0.25)',
  },
  orange: {
    color: '#FB923C',
    bg: '#FFF7ED',
    text: '#C2410C',
    border: 'rgba(194, 65, 12, 0.25)',
  },
  rose: {
    color: '#F43F5E',
    bg: '#FFF1F2',
    text: '#BE123C',
    border: 'rgba(244, 63, 94, 0.25)',
  },
};

/**
 * 1. resultPercent(r)
 * Uses r.averagePercent if present and valid number;
 * otherwise sum(scores.got) / sum(scores.total) * 100.
 * Never divides by a hardcoded 400.
 */
export function resultPercent(r: StudentResult): number {
  if (
    typeof r.averagePercent === 'number' &&
    !isNaN(r.averagePercent) &&
    r.averagePercent > 0
  ) {
    return Number(r.averagePercent.toFixed(1));
  }

  if (r.scores && Array.isArray(r.scores) && r.scores.length > 0) {
    const got = r.scores.reduce((acc, s) => acc + (Number(s.score) || 0), 0);
    const total = r.scores.reduce((acc, s) => acc + (Number(s.maxScore) || 0), 0);
    if (total > 0) {
      return Number(((got / total) * 100).toFixed(1));
    }
  }

  if (typeof r.totalScore === 'number' && typeof (r as any).maxScore === 'number') {
    const max = Number((r as any).maxScore);
    if (max > 0) {
      return Number(((r.totalScore / max) * 100).toFixed(1));
    }
  }

  return typeof r.totalScore === 'number' ? Math.min(100, Math.max(0, r.totalScore)) : 0;
}

export const calculateResultPercent = resultPercent;

/**
 * 2. gradeFor(percent)
 * Maps percent into WAEC Grade and Label.
 */
export function gradeFor(percent: number): { grade: string; label: string; badgeText: string } {
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
  const band = WAEC_GRADE_BANDS.find((b) => clamped >= b.min) || WAEC_GRADE_BANDS[WAEC_GRADE_BANDS.length - 1];
  return {
    grade: band.grade,
    label: band.label,
    badgeText: `${band.grade} ${band.label}`,
  };
}

/**
 * 3. toneFor(percent)
 * 70 and above = emerald, 50-69 = orange, below 50 = rose.
 */
export function toneFor(percent: number): Tone {
  const val = Number(percent) || 0;
  if (val >= 70) return 'emerald';
  if (val >= 50) return 'orange';
  return 'rose';
}

/**
 * Legacy support for components expecting getWaecGrade
 */
export function getWaecGrade(percent: number) {
  const g = gradeFor(percent);
  const tone = toneFor(percent);
  const styles = TONE_STYLES[tone];
  return {
    ...g,
    status: tone,
    color: styles.color,
    bgColor: tone === 'emerald' ? 'bg-emerald-50' : tone === 'orange' ? 'bg-orange-50' : 'bg-rose-50',
    borderColor: tone === 'emerald' ? 'border-emerald-200' : tone === 'orange' ? 'border-orange-200' : 'border-rose-200',
    textColor: tone === 'emerald' ? 'text-emerald-700' : tone === 'orange' ? 'text-[#EA580C]' : 'text-rose-700',
  };
}

/**
 * Helper to filter results by selected period
 */
export function filterResultsByPeriod(results: StudentResult[], period: Period): StudentResult[] {
  if (!results || results.length === 0) return [];
  if (period === 'last8') {
    return results.slice(0, 8);
  }
  if (period === 'term') {
    // Current academic term: last 90 days from latest result or now
    const anchor = results[0]?.date ? new Date(results[0].date).getTime() : Date.now();
    const termCutoff = anchor - 90 * 24 * 60 * 60 * 1000;
    const inTerm = results.filter((r) => new Date(r.date).getTime() >= termCutoff);
    return inTerm.length > 0 ? inTerm : results.slice(0, 8);
  }
  return results;
}

export interface OverallStats {
  meanPercent: number;
  grade: { grade: string; label: string; badgeText: string };
  tone: Tone;
  changePoints: number | null;
  changeWindowSize: number;
  count: number;
  bestScore: number;
  aboveClassAvg: {
    count: number;
    totalWithBenchmark: number;
  };
  chronologicalPercents: number[];
  firstDate: string | null;
  lastDate: string | null;
}

/**
 * 4. overall(results, period, examsMap)
 * Calculates the mean percent, change vs prior window, count, best score, and above class avg.
 */
export function overall(
  allResults: StudentResult[],
  period: Period,
  examsMap: Map<string, CBTExam>
): OverallStats {
  const currentWindow = filterResultsByPeriod(allResults, period);

  if (currentWindow.length === 0) {
    return {
      meanPercent: 0,
      grade: gradeFor(0),
      tone: toneFor(0),
      changePoints: null,
      changeWindowSize: 0,
      count: 0,
      bestScore: 0,
      aboveClassAvg: { count: 0, totalWithBenchmark: 0 },
      chronologicalPercents: [],
      firstDate: null,
      lastDate: null,
    };
  }

  const windowScores = currentWindow.map((r) => resultPercent(r));
  const sum = windowScores.reduce((acc, v) => acc + v, 0);
  const meanPercent = Math.round(sum / windowScores.length);
  const bestScore = Math.round(Math.max(...windowScores));

  // Previous window of the same size
  const windowSize = currentWindow.length;
  let changePoints: number | null = null;
  if (allResults.length >= windowSize * 2) {
    const prevWindow = allResults.slice(windowSize, windowSize * 2);
    const prevScores = prevWindow.map((r) => resultPercent(r));
    const prevMean = prevScores.reduce((acc, v) => acc + v, 0) / prevScores.length;
    changePoints = Number(((sum / windowScores.length) - prevMean).toFixed(1));
  }

  // Above class average benchmark count
  let aboveCount = 0;
  let totalWithBenchmark = 0;
  currentWindow.forEach((r) => {
    const exam = r.examId ? examsMap.get(r.examId) : undefined;
    if (typeof exam?.averageScore === 'number' && exam.averageScore > 0) {
      totalWithBenchmark++;
      if (resultPercent(r) >= exam.averageScore) {
        aboveCount++;
      }
    }
  });

  // Chronological scores (oldest to newest) for sparkline
  const chronologicalResults = [...currentWindow].reverse();
  const chronologicalPercents = chronologicalResults.map((r) => Math.round(resultPercent(r)));
  const firstDate = chronologicalResults[0]?.date || null;
  const lastDate = chronologicalResults[chronologicalResults.length - 1]?.date || null;

  return {
    meanPercent,
    grade: gradeFor(meanPercent),
    tone: toneFor(meanPercent),
    changePoints,
    changeWindowSize: windowSize,
    count: currentWindow.length,
    bestScore,
    aboveClassAvg: {
      count: aboveCount,
      totalWithBenchmark,
    },
    chronologicalPercents,
    firstDate,
    lastDate,
  };
}

export function getResultPrimarySubject(
  result: StudentResult,
  examsMap?: Map<string, CBTExam>
): string {
  const isExcluded = (name: string) => {
    const n = name.trim().toLowerCase();
    return n === 'total' || n === 'all' || n === 'mcq' || n === 'essay' || n === 'overall';
  };

  const directSub = (result as any).subject;
  if (typeof directSub === 'string' && directSub.trim().length > 0 && !isExcluded(directSub)) {
    return directSub.trim();
  }

  if (result.scores && Array.isArray(result.scores)) {
    const nonGeneric = result.scores.find(
      (s) => s.subject && !isExcluded(s.subject)
    );
    if (nonGeneric && nonGeneric.subject && !isExcluded(nonGeneric.subject)) {
      return nonGeneric.subject.trim();
    }
  }

  const exam = result.examId && examsMap ? examsMap.get(result.examId) : undefined;
  if (exam?.subjects && exam.subjects.length > 0) {
    const validExamSubject = exam.subjects.find((s) => !isExcluded(s));
    if (validExamSubject) return validExamSubject;
  }

  const title = result.examTitle || '';
  const knownSubjects = [
    'Mathematics',
    'English Language',
    'English',
    'Physics',
    'Chemistry',
    'Biology',
    'Economics',
    'Government',
    'Literature in English',
    'Literature',
    'Civic Education',
    'Accounting',
    'Commerce',
    'Agricultural Science',
    'Geography',
    'Further Mathematics',
    'CRS',
    'IRS',
    'History',
  ];
  for (const s of knownSubjects) {
    if (new RegExp(`\\b${s}\\b`, 'i').test(title)) {
      return s;
    }
  }

  if (exam?.department && exam.department !== 'All' && !isExcluded(exam.department)) {
    return exam.department;
  }

  return 'General Studies';
}

export interface SubjectItem {
  subject: string;
  meanPercent: number;
  averagePercent: number;
  grade: { grade: string; label: string; badgeText: string };
  gradeInfo: any;
  tone: Tone;
  classAverage: number | null;
  deltaSincePrevious: number | null;
  needsFocus: boolean;
  isWeakest: boolean;
  attemptsCount: number;
  history: { resultId: string; date: string; percent: number }[];
}

/**
 * 5. bySubject(results, examsMap)
 * Group by each result's subject.
 * For each subject return: mean percent, grade, tone, class average, deltaSincePrevious, needsFocus.
 * needsFocus is true ONLY for the single lowest subject, with at least 2 results, below 60%.
 */
export function bySubject(
  results: StudentResult[],
  examsMap: Map<string, CBTExam>
): SubjectItem[] {
  if (!results || results.length === 0) return [];

  const groups = new Map<string, StudentResult[]>();

  results.forEach((r) => {
    const sub = getResultPrimarySubject(r, examsMap);
    if (!sub || sub.trim().toLowerCase() === 'total' || sub.trim().toLowerCase() === 'all') {
      return;
    }
    const list = groups.get(sub) || [];
    list.push(r);
    groups.set(sub, list);
  });

  const subjectItems: SubjectItem[] = [];

  groups.forEach((subjResults, sub) => {
    if (sub.trim().toLowerCase() === 'total' || sub.trim().toLowerCase() === 'all') return;
    // Newest first in subjResults
    const percents = subjResults.map((r) => resultPercent(r));
    const mean = Math.round(percents.reduce((a, b) => a + b, 0) / percents.length);

    // Delta since previous attempt (newest percent minus the one before, whole points)
    let deltaSincePrevious: number | null = null;
    if (percents.length >= 2) {
      deltaSincePrevious = Math.round(percents[0] - percents[1]);
    }

    // Class average: mean of that subject's exams' averageScore
    const benchmarkExams = subjResults
      .map((r) => (r.examId ? examsMap.get(r.examId) : undefined))
      .filter((e): e is CBTExam => typeof e?.averageScore === 'number' && (e.averageScore ?? 0) > 0);

    const classAverage = benchmarkExams.length > 0
      ? Math.round(benchmarkExams.reduce((acc, e) => acc + (e.averageScore || 0), 0) / benchmarkExams.length)
      : null;

    // Chronological history for deep-dive
    const history = [...subjResults].reverse().map((r) => ({
      resultId: r.id,
      date: r.date,
      percent: Math.round(resultPercent(r)),
    }));

    subjectItems.push({
      subject: sub,
      meanPercent: mean,
      averagePercent: mean,
      grade: gradeFor(mean),
      gradeInfo: getWaecGrade(mean),
      tone: toneFor(mean),
      classAverage,
      deltaSincePrevious,
      needsFocus: false, // resolved below
      isWeakest: false,
      attemptsCount: subjResults.length,
      history,
    });
  });

  // Filter out any unwanted subject names
  const validItems = subjectItems.filter(
    (s) => s.subject.trim().toLowerCase() !== 'total' && s.subject.trim().toLowerCase() !== 'all'
  );

  // Sort descending by mean percent
  validItems.sort((a, b) => b.meanPercent - a.meanPercent);

  // needsFocus: true only for the single lowest subject, with at least 2 results, below 60%
  const eligibleNeedsFocus = validItems.filter((s) => s.attemptsCount >= 2 && s.meanPercent < 60);
  if (eligibleNeedsFocus.length > 0) {
    const lowest = eligibleNeedsFocus.reduce((prev, curr) =>
      curr.meanPercent < prev.meanPercent ? curr : prev
    );
    lowest.needsFocus = true;
    lowest.isWeakest = true;
  }

  return validItems;
}

export interface TimeUsageStats {
  meanRatio: number;
  percentUsed: number;
  typicalDurationMinutes: number;
  spareMinutes: number;
  sentence: string;
}

/**
 * 6. timeUsage(results, examsMap)
 * Mean of timeTakenSeconds / exam's allotted seconds, ignoring missing.
 * Returns null if nothing qualifies.
 */
export function timeUsage(
  results: StudentResult[],
  examsMap: Map<string, CBTExam>
): TimeUsageStats | null {
  if (!results || results.length === 0) return null;

  let totalRatios = 0;
  let totalDurations = 0;
  let validCount = 0;

  results.forEach((r) => {
    const exam = r.examId ? examsMap.get(r.examId) : undefined;
    const durationMinutes = exam?.durationMinutes;

    if (
      typeof r.timeTakenSeconds === 'number' &&
      r.timeTakenSeconds > 0 &&
      typeof durationMinutes === 'number' &&
      durationMinutes > 0
    ) {
      const allottedSeconds = durationMinutes * 60;
      const ratio = r.timeTakenSeconds / allottedSeconds;
      totalRatios += ratio;
      totalDurations += durationMinutes;
      validCount++;
    }
  });

  if (validCount === 0) return null;

  const meanRatio = totalRatios / validCount;
  const percentUsed = Math.round(meanRatio * 100);
  const typicalDurationMinutes = Math.round(totalDurations / validCount) || 45;
  const spareMinutes = Math.max(0, Math.round((1 - meanRatio) * typicalDurationMinutes));

  const sentence =
    percentUsed < 85
      ? `You usually finish with about ${spareMinutes} minutes to spare on a ${typicalDurationMinutes}-minute test. Use that time to re-check your answers.`
      : `You use almost all of your time. Practise pacing so you can finish and re-check.`;

  return {
    meanRatio,
    percentUsed,
    typicalDurationMinutes,
    spareMinutes,
    sentence,
  };
}

export interface RecentItem {
  id: string;
  initials: string;
  title: string;
  subject: string;
  date: string;
  percent: number;
  grade: { grade: string; label: string; badgeText: string };
  tone: Tone;
  vsClass: number | null;
  rawResult: StudentResult;
}

/**
 * 7. recent(results, examsMap, n)
 * Returns the newest n results with subject initials (first two letters, uppercase),
 * exam title, date, percent, grade, tone and vsClass.
 */
export function recent(
  results: StudentResult[],
  examsMap: Map<string, CBTExam>,
  n: number = 5
): RecentItem[] {
  if (!results || results.length === 0) return [];

  const topN = results.slice(0, n);

  return topN.map((r) => {
    const sub = getResultPrimarySubject(r, examsMap);
    const initials = (sub.trim().slice(0, 2) || 'EX').toUpperCase();
    const pct = Math.round(resultPercent(r));
    const exam = r.examId ? examsMap.get(r.examId) : undefined;

    let vsClass: number | null = null;
    if (typeof exam?.averageScore === 'number' && exam.averageScore > 0) {
      vsClass = Math.round(pct - exam.averageScore);
    }

    // Format date: e.g. "12 Oct" or keep r.date if short
    let dateStr = r.date;
    try {
      const d = new Date(r.date);
      if (!isNaN(d.getTime())) {
        dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      }
    } catch {}

    return {
      id: r.id,
      initials,
      title: r.examTitle,
      subject: sub,
      date: dateStr,
      percent: pct,
      grade: gradeFor(pct),
      tone: toneFor(pct),
      vsClass,
      rawResult: r,
    };
  });
}

/**
 * Helpers for backward compatibility with SubjectSheet and AssessmentSheet
 */
export interface SubjectSummary {
  subject: string;
  averagePercent: number;
  attemptsCount: number;
  classAverage?: number;
  isWeakest?: boolean;
  gradeInfo: any;
  history: { resultId: string; percent: number }[];
}

export function getSubjectBreakdown(
  results: StudentResult[],
  exams: CBTExam[]
): SubjectSummary[] {
  const examsMap = new Map<string, CBTExam>(exams.map((e) => [e.id, e]));
  const subjects = bySubject(results, examsMap);
  return subjects.map((s) => ({
    subject: s.subject,
    averagePercent: s.meanPercent,
    attemptsCount: s.attemptsCount,
    classAverage: s.classAverage ?? undefined,
    isWeakest: s.needsFocus,
    gradeInfo: getWaecGrade(s.meanPercent),
    history: s.history.map((h) => ({ resultId: h.resultId, percent: h.percent })),
  }));
}

export interface FocusCardData {
  weakestSubject: string;
  averagePercent: number;
  missedPointsCount: number;
}

export function getFocusCardData(
  results: StudentResult[],
  subjectSummaries: SubjectSummary[]
): FocusCardData | null {
  if (!subjectSummaries.length) return null;
  const weakest = subjectSummaries.find((s) => s.isWeakest) || subjectSummaries[subjectSummaries.length - 1];
  return {
    weakestSubject: weakest.subject,
    averagePercent: weakest.averagePercent,
    missedPointsCount: 0,
  };
}

export function calculateTimeUsedRatio(
  timeTakenSeconds?: number,
  durationMinutes: number = 45
) {
  const allocatedSeconds = Math.max(1, durationMinutes * 60);
  const timeTaken = typeof timeTakenSeconds === 'number' && timeTakenSeconds > 0
    ? timeTakenSeconds
    : allocatedSeconds * 0.65;

  const pct = Math.min(100, Math.max(0, Math.round((timeTaken / allocatedSeconds) * 100)));
  const mins = Math.floor(timeTaken / 60);
  const secs = Math.round(timeTaken % 60);
  const displayTime = `${mins}m ${secs.toString().padStart(2, '0')}s`;

  return {
    percent: pct,
    displayTime,
    allocatedDisplay: `${durationMinutes} mins`,
  };
}

export function calculateExamRank(
  result: StudentResult,
  cohortResults: StudentResult[]
) {
  if (!cohortResults || cohortResults.length < 3) {
    return { rank: null, total: cohortResults?.length || 0, displayString: null };
  }
  const myScore = resultPercent(result);
  const allScores = cohortResults.map((r) => resultPercent(r)).sort((a, b) => b - a);
  const rank = allScores.findIndex((s) => s <= myScore) + 1 || 1;
  return {
    rank,
    total: cohortResults.length,
    displayString: `Rank ${rank} of ${cohortResults.length}`,
  };
}

export function generateSparklinePoints(
  values: number[],
  width: number,
  height: number,
  padding: number = 4
) {
  if (!values || values.length === 0) return { points: '', min: 0, max: 0 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min === 0 ? 1 : max - min;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  const coords = values.map((v, i) => {
    const x = values.length === 1 ? width / 2 : padding + (i / (values.length - 1)) * innerW;
    const y = height - padding - ((v - min) / range) * innerH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return { points: coords.join(' '), min, max };
}

export function calculateOverallPercent(results: StudentResult[], windowSize: number = 8): number {
  if (!results || results.length === 0) return 0;
  const win = results.slice(0, windowSize);
  const sum = win.reduce((acc, r) => acc + resultPercent(r), 0);
  return Math.round(sum / win.length);
}

export function calculatePercentChange(results: StudentResult[], windowSize: number = 8): number | null {
  if (!results || results.length < windowSize * 2) return null;
  const cur = results.slice(0, windowSize);
  const prev = results.slice(windowSize, windowSize * 2);
  const curMean = cur.reduce((a, r) => a + resultPercent(r), 0) / cur.length;
  const prevMean = prev.reduce((a, r) => a + resultPercent(r), 0) / prev.length;
  return Number((curMean - prevMean).toFixed(1));
}
