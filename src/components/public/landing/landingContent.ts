/**
 * Copy and small pure helpers for the Tutorial OS landing page sections.
 *
 * `status` is the honesty switch: 'soon' puts a "Coming soon" tag on a point so
 * the public page never promises more than the product does. Every point is
 * 'live' now (the product owner confirmed all of them are built). To announce a
 * future feature early, add it as 'soon' and the tag appears; landing.test.tsx
 * records the expected statuses, so any change is deliberate and reviewed.
 */
export type Availability = 'live' | 'soon';
export interface Point { id: string; text: string; status: Availability }

const p = (id: string, text: string, status: Availability): Point => ({ id, text, status });

export const ADMIN_POINTS: Point[] = [
  p('admin-admissions', 'Approve admissions and manage students', 'live'),
  p('admin-fees', 'Track fees, confirm payments and issue receipts', 'live'),
  p('admin-timetable', 'Publish the timetable and set up chat groups', 'live'),
  p('admin-ai-insight', 'Let AI spot your strongest students and prepare report sheets', 'live'),
];
export const TUTOR_POINTS: Point[] = [
  p('tutor-classes', 'See your classes and mark attendance', 'live'),
  p('tutor-ai-questions', 'Create assessments, with AI to help write the questions', 'live'),
  p('tutor-follow', 'Follow how your students are doing', 'live'),
  p('tutor-ai-materials', 'Find extra learning materials for a topic', 'live'),
];
export const STUDENT_POINTS: Point[] = [
  p('student-app', 'See classes, results and resources on your phone', 'live'),
  p('student-cbt', 'Practise with CBT tests and join mock exams', 'live'),
  p('student-chat', 'Chat with classmates and tutors in your centre', 'live'),
  p('student-ai-coach', 'Ask the AI study coach what to work on next', 'live'),
];

export const AI_STUDENT_POINTS: Point[] = [
  p('ai-student-weak', 'See where you are weak, and why', 'live'),
  p('ai-student-topics', 'Get topics recommended for you to study next', 'live'),
  p('ai-student-followup', 'Get follow-up after every assessment', 'live'),
  p('ai-student-stretch', 'Get harder challenges when you are doing well', 'live'),
];
export const AI_TUTOR_POINTS: Point[] = [
  p('ai-tutor-questions', 'Set up questions in minutes, with AI to draft them', 'live'),
  p('ai-tutor-review', 'Review how each student and class performed', 'live'),
  p('ai-tutor-followup', 'Follow up with students who are falling behind', 'live'),
  p('ai-tutor-materials', 'Find extra learning materials for a topic', 'live'),
];
export const AI_ADMIN_POINTS: Point[] = [
  p('ai-admin-top', 'Spot the students who are doing better across your classes', 'live'),
  p('ai-admin-performance', 'See performance for the whole centre', 'live'),
  p('ai-admin-sheets', 'Generate the sheets and reports you need', 'live'),
];

export const BRAND_POINTS: Point[] = [
  p('brand-page', 'A branded landing page for your centre, ready when you join', 'live'),
  p('brand-ads', 'Use it to promote your centre and run your ads', 'live'),
  p('brand-social', 'Connect your Facebook, Instagram and TikTok', 'live'),
  p('brand-enrol', 'Enrol new students straight from the page, with nothing extra to pay', 'live'),
  p('brand-identity', 'Your name, logo and colours on the app, the portals and the page', 'live'),
];

export const ALL_POINTS: Point[] = [
  ...ADMIN_POINTS, ...TUTOR_POINTS, ...STUDENT_POINTS,
  ...AI_STUDENT_POINTS, ...AI_TUTOR_POINTS, ...AI_ADMIN_POINTS, ...BRAND_POINTS,
];

export type CoachKey = 'weak' | 'next' | 'challenge';
export const COACH_PROMPTS: { key: CoachKey; label: string }[] = [
  { key: 'weak', label: 'What am I weak at?' },
  { key: 'next', label: 'What should I study next?' },
  { key: 'challenge', label: 'Challenge me' },
];
export const COACH_REPLIES: Record<CoachKey, string> = {
  weak: 'In your last two Chemistry assessments you lost most marks on mole calculations. Your Maths is strong. Want a short practice set on moles?',
  next: 'Revise mole calculations on Friday, then move on to organic chemistry basics. Both will help in your next assessment.',
  challenge: 'You are doing very well in algebra. Here is a harder set: simultaneous equations with one quadratic. Ready?',
};

export const BRAND_COLOURS = [
  { id: 'orange', label: 'Orange', hex: '#C2410C' },
  { id: 'blue', label: 'Blue', hex: '#1D4ED8' },
  { id: 'green', label: 'Green', hex: '#047857' },
  { id: 'purple', label: 'Purple', hex: '#6D28D9' },
] as const;
export const DEFAULT_BRAND_NAME = 'Bright Minds Tutorial';

/** Up to two initials from a centre name; falls back to "YC" (your centre). */
export function brandInitials(name: string): string {
  const initials = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => Array.from(w)[0])
    .join('');
  return (initials || 'YC').toUpperCase();
}

/** The name shown in the preview; blank input falls back to a neutral label. */
export function brandDisplayName(name: string): string {
  return String(name || '').trim() || 'Your Centre';
}
