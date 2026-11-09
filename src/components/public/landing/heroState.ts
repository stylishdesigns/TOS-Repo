/**
 * State machine behind the interactive hero preview ("Try it live").
 * Pure and framework-free so every click path is unit-tested. Front end only:
 * nothing here talks to a server, and all names and figures are sample data.
 */
import type { CoachKey } from './landingContent';

export type Role = 'student' | 'tutor' | 'admin';
export type StudentScreen = 'home' | 'classes' | 'ai' | 'cbt' | 'results';
export type TutorScreen = 'classes' | 'assess' | 'progress';
export type AdminScreen = 'dashboard' | 'admissions' | 'fees';
export type DraftState = 'idle' | 'busy' | 'done';

export interface QuizQuestion { q: string; options: string[]; answer: number }
export const QUIZ: QuizQuestion[] = [
  { q: 'What is the SI unit of force?', options: ['Newton', 'Joule', 'Pascal'], answer: 0 },
  { q: 'Solve 2x + 6 = 14. What is x?', options: ['3', '4', '5'], answer: 1 },
  { q: 'Which gas do plants take in for photosynthesis?', options: ['Oxygen', 'Nitrogen', 'Carbon dioxide'], answer: 2 },
];

export const CLASSMATES = ['Ada O.', 'Tunde B.', 'Chioma E.', 'Ibrahim S.'];
export const APPLICANTS = [
  { name: 'Ada Okafor', programme: 'JAMB class' },
  { name: 'Tunde Bello', programme: 'WAEC class' },
  { name: 'Chioma Eze', programme: 'JAMB class' },
];
export const PAYMENTS = [
  { name: 'Ibrahim Sani', note: 'Bank transfer, awaiting check' },
  { name: 'Ngozi Okafor', note: 'Cash, awaiting check' },
];
export const DRAFT_QUESTIONS = [
  '1. Solve x squared minus 5x plus 6 equals 0.',
  '2. Find the roots of 2x squared plus 3x minus 2 equals 0.',
  '3. A rectangle has area 24 and length x plus 2 more than its width x. Find x.',
];

export interface QuizState { index: number; picked: number | null; score: number; finished: boolean }
export interface HeroState {
  role: Role;
  student: StudentScreen;
  tutor: TutorScreen;
  admin: AdminScreen;
  quiz: QuizState;
  coach: CoachKey;
  present: boolean[];
  draft: DraftState;
  approved: boolean[];
  confirmed: boolean[];
  toast: string;
}

export const initialQuiz: QuizState = { index: 0, picked: null, score: 0, finished: false };
export const initialHeroState: HeroState = {
  role: 'student',
  student: 'home',
  tutor: 'classes',
  admin: 'dashboard',
  quiz: initialQuiz,
  coach: 'weak',
  present: [true, true, false, true],
  draft: 'idle',
  approved: APPLICANTS.map(() => false),
  confirmed: PAYMENTS.map(() => false),
  toast: '',
};

export type HeroAction =
  | { type: 'role'; role: Role }
  | { type: 'student'; screen: StudentScreen }
  | { type: 'tutor'; screen: TutorScreen }
  | { type: 'admin'; screen: AdminScreen }
  | { type: 'pick'; option: number }
  | { type: 'next' }
  | { type: 'retry' }
  | { type: 'coach'; key: CoachKey }
  | { type: 'present'; index: number }
  | { type: 'draftStart' }
  | { type: 'draftFinish' }
  | { type: 'draftReset' }
  | { type: 'approve'; index: number }
  | { type: 'confirm'; index: number }
  | { type: 'report' };

const flip = (list: boolean[], i: number, toggle: boolean) =>
  i < 0 || i >= list.length ? list : list.map((v, j) => (j === i ? (toggle ? !v : true) : v));

export function heroReducer(s: HeroState, a: HeroAction): HeroState {
  switch (a.type) {
    case 'role': return { ...s, role: a.role, toast: '' };
    case 'student': return { ...s, student: a.screen, toast: '' };
    case 'tutor': return { ...s, tutor: a.screen, toast: '' };
    case 'admin': return { ...s, admin: a.screen, toast: '' };
    case 'pick': {
      const q = QUIZ[s.quiz.index];
      if (!q || s.quiz.finished || s.quiz.picked !== null || a.option < 0 || a.option >= q.options.length) return s;
      return { ...s, quiz: { ...s.quiz, picked: a.option, score: s.quiz.score + (a.option === q.answer ? 1 : 0) } };
    }
    case 'next': {
      if (s.quiz.finished || s.quiz.picked === null) return s;
      if (s.quiz.index >= QUIZ.length - 1) return { ...s, quiz: { ...s.quiz, picked: null, finished: true } };
      return { ...s, quiz: { ...s.quiz, index: s.quiz.index + 1, picked: null } };
    }
    case 'retry': return { ...s, quiz: initialQuiz };
    case 'coach': return { ...s, coach: a.key };
    case 'present': { const next = flip(s.present, a.index, true); return next === s.present ? s : { ...s, present: next }; }
    case 'draftStart': return s.draft === 'idle' ? { ...s, draft: 'busy' } : s;
    case 'draftFinish': return s.draft === 'busy' ? { ...s, draft: 'done' } : s;
    case 'draftReset': return { ...s, draft: 'idle' };
    case 'approve': { const next = flip(s.approved, a.index, false); return next === s.approved ? s : { ...s, approved: next }; }
    case 'confirm': { const next = flip(s.confirmed, a.index, false); return next === s.confirmed ? s : { ...s, confirmed: next }; }
    case 'report': return { ...s, toast: 'Sample report sheet ready. Your real ones use your own data.' };
    default: return s;
  }
}

export const presentCount = (s: HeroState) => s.present.filter(Boolean).length;
export const quizScoreText = (s: HeroState) => `You scored ${s.quiz.score} out of ${QUIZ.length}`;
export const quizFeedback = (s: HeroState): string => {
  const q = QUIZ[s.quiz.index];
  if (!q || s.quiz.picked === null) return '';
  return s.quiz.picked === q.answer ? 'Correct!' : `Not quite. The answer is ${q.options[q.answer]}.`;
};
