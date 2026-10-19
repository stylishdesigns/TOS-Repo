export interface TenantSettings {
  centreId?: string;
  centreName: string;
  tagline: string;
  logoText: string;
  primaryColor: string; // hex
  secondaryColor: string;
  address: string;
  state: string;
  phone: string;
  email: string;
  whatsapp: string;
  whatsappNumber?: string;
  accentColor?: string;
  currencySymbol: string;
  academicSession: string;
  activeBranchId: string;
  websiteDomain: string;
  maintenanceMode: boolean;
  allowPublicAdmissions: boolean;
  smsNotifications: boolean;
  emailNotifications: boolean;
  heroTitle?: string;
  heroSubtitle?: string;
  heroCtaText?: string;
  heroImageUrl?: string;
  announcementTicker?: string;
  statsSuccessRate?: string;
  statsTotalStudents?: string;
  statsTutors?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
  cashPaymentGuide?: string;
  academicSessions?: string[];
}

export interface Branch {
  id: string;
  centreId?: string;
  name: string;
  state: string;
  address: string;
  phone: string;
  coordinator: string;
  studentCount: number;
  code?: string;
  city?: string;
  email?: string;
  directorName?: string;
  capacity?: number;
}

export interface CMSContent {
  centreId?: string;
  hero: {
    badge: string;
    headline: string;
    subheadline: string;
    primaryCtaText: string;
    secondaryCtaText: string;
    bannerImage: string;
    statsHighlight: { label: string; value: string }[];
  };
  about: {
    title: string;
    description: string;
    highlights: string[];
    mission: string;
    vision: string;
  };
  faqs: { id: string; question: string; answer: string; category: string }[];
  testimonials: {
    id: string;
    studentName: string;
    programme: string;
    achievement: string;
    quote: string;
    score: string;
    avatar: string;
  }[];
  gallery: { id: string; title: string; category: string; imageUrl: string }[];
}

export interface Student {
  id: string;
  centreId?: string;
  uid?: string;
  name: string;
  avatar: string;
  phone: string;
  email: string;
  gender: 'Male' | 'Female';
  dob: string;
  parentName: string;
  parentWhatsApp: string;
  parentEmail: string;
  address: string;
  programmeId: string;
  programmeName: string;
  branchId: string;
  branchName: string;
  subjects: string[];
  notes?: string;
  registrationDate: string;
  status: 'Active' | 'Idle' | 'Suspended' | 'Completed';
  attendancePercent: number;
  totalFee: number;
  paidAmount: number;
  outstandingBalance: number;
  paymentStatus?: 'Pending' | 'Partial' | 'Paid';
  department?: 'Science' | 'Commercial' | 'Arts';
  totalAttendanceCount?: number;
}

export interface AdmissionApplication {
  id: string;
  centreId?: string;
  applicantName: string;
  email: string;
  phone: string;
  gender: 'Male' | 'Female';
  programmeId: string;
  programmeName: string;
  branchId: string;
  parentName: string;
  parentWhatsApp: string;
  subjects: string[];
  status: 'Pending' | 'Approved' | 'Rejected';
  appliedDate: string;
  notes?: string;
}

export interface Tutor {
  id: string;
  centreId?: string;
  name: string;
  avatar: string;
  bio: string;
  phone: string;
  email: string;
  subjects: string[];
  departments?: ('Science' | 'Commercial' | 'Arts')[];
  examTypes?: string[];
  qualifications?: string;
  classesAssigned?: string[];
  status: 'Active' | 'Suspended' | 'Invited';
  rating: number;
  ratePerHour?: number;
  totalClassesTaught?: number;
  programmeIds?: string[];
  temporaryPassword?: string;
  hasChangedPassword?: boolean;
}

export interface Classroom {
  id: string;
  centreId?: string;
  name: string;
  code: string;
  capacity: number;
  building: string;
  features?: string[];
  isAvailable?: boolean;
}

export interface Programme {
  id: string;
  centreId?: string;
  name: string;
  code: string;
  description: string;
  subjects: string[];
  fee: number;
  duration: string;
  startDate: string;
  endDate: string;
  maxStudents: number;
  enrolledStudents: number;
  status: 'Active' | 'Upcoming' | 'Archived';
  category: 'JAMB' | 'WAEC' | 'NECO' | 'A-Levels' | 'SAT / International';
}

export interface TimetableSlot {
  id: string;
  centreId?: string;
  date: string; // ISO date string (YYYY-MM-DD)
  day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  time: string; // e.g. "09:00 - 11:00"
  startTime?: string; // "09:00"
  endTime?: string;   // "11:00"
  subject: string;
  topic?: string; // Optional
  tutorName: string;
  tutorId?: string;
  programmeId: string;
  programmeName?: string;
  room?: string; // Optional
  roomId?: string;
  status: 'pending_tutor_consent' | 'active' | 'reschedule_requested' | 'postponed' | 'cancelled';
  changeRequestType?: 'reschedule' | 'postponement' | 'cancellation';
  changeRequestReason?: string;
  postponedNote?: string;
  cancellationReason?: string;
}

export interface StudyMaterial {
  id: string;
  centreId?: string;
  title: string;
  subject: string;
  topic?: string;
  tutorName: string;
  tutorId?: string;
  programmeId?: string;
  fileType: 'PDF' | 'DOCX' | 'SLIDES' | 'NOTES';
  fileSize?: string;
  pages?: number;
  uploadedAt: string;
  description?: string;
  contentSummary?: string;
  downloadUrl?: string;
}

export interface ClassRating {
  id?: string;
  centreId?: string;
  slotId: string;
  tutorId?: string;
  tutorName?: string;
  studentId: string;
  stars: number;
  createdAt: string;
  updatedAt?: string;
}

export interface TutorRatingStats {
  averageRating: number;
  totalRatings: number;
  totalClassesRated: number;
  distribution: {
    5: { count: number; percent: number };
    4: { count: number; percent: number };
    3: { count: number; percent: number };
    2: { count: number; percent: number };
    1: { count: number; percent: number };
  };
  changeVsLastMonth: string;
}

export interface ClassRatingStats {
  averageRating: number;
  totalRatings: number;
  hasEnoughRatings: boolean;
}

export interface AttendanceSettings {
  centreId?: string;
  resumptionTime: string; // e.g. "08:00 AM"
  closingTime: string;    // e.g. "03:30 PM"
  lateArrivalTime: string; // e.g. "08:30 AM"
}

export interface AttendanceLog {
  id: string;
  centreId?: string;
  studentId: string;
  date: string;
  clockInAt: string;
  clockOutAt?: string;
  status: 'Present' | 'Late' | 'Absent' | 'No clock out';
}

export interface EssaySubPart {
  key: string; // e.g. "b-i"
  label: string; // e.g. "i"
  text: string;
  question?: string;
  answer: string;
  points?: string[];
}

export interface EssayPart {
  key: string; // e.g. "a"
  label: string; // e.g. "a"
  text: string;
  question?: string;
  answer: string;
  points?: string[];
  subParts: EssaySubPart[];
}

export interface StudentResult {
  id: string;
  centreId?: string;
  studentId: string;
  examId?: string;
  studentName: string;
  programmeName: string;
  examTitle: string;
  subjects?: string[];
  date: string;
  scores: { subject: string; score: number; maxScore: number }[];
  totalScore: number;
  averagePercent: number;
  rank: number;
  remark: string;
  userAnswers?: Record<number, number>;
  essayAnswers?: Record<number, string>;
  essayPartAnswers?: Record<number, Record<string, string>>;
  essayScores?: Record<number, { 
    got: number; 
    max: number; 
    leaves: Record<string, { quality: number; status: 'full' | 'partial' | 'missed' }> 
  }>;
  essayTotalMarks?: number;
  gradingMethod?: 'auto';
  timeTakenSeconds?: number;
  subjectScores?: Record<string, { got: number; total: number }>;
}

export type MockExamResult = StudentResult;

export interface CBTQuestion {
  id: string;
  centreId?: string;
  subject: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface PaymentRecord {
  id: string;
  centreId?: string;
  receiptNumber: string;
  studentId: string;
  studentName: string;
  programmeName: string;
  amountPaid: number;
  totalFee: number;
  balance: number;
  status: 'Paid' | 'Partial' | 'Pending';
  method: 'Card' | 'Bank Transfer' | 'Cash';
  date: string;
  evidenceUrl?: string;
  evidenceName?: string;
  note?: string;
  submittedBy?: 'Student' | 'Admin';
}

export interface Announcement {
  id: string;
  centreId?: string;
  title: string;
  content: string;
  target: 'All' | 'Students' | 'Website Public' | 'Parents';
  date: string;
  priority: 'Normal' | 'Urgent';
}

export interface AdminUser {
  id: string;
  centreId?: string;
  name: string;
  email: string;
  phone: string;
  role: 'Super Admin' | 'Center Admin' | 'Admin Secretary' | 'Finance Admin' | 'Tutor';
  status: 'Active' | 'Invited' | 'Suspended';
  department: string;
  jobTitle: string;
  temporaryPassword?: string;
  hasChangedPassword?: boolean;
}

export interface ActivityLog {
  id: string;
  centreId?: string;
  title: string;
  subtitle: string;
  category: 'Schools' | 'Students' | 'Finance' | 'CMS' | 'Admissions';
  timeAgo: string;
  type: 'success' | 'pending' | 'danger' | 'info';
}

export interface QuizQuestion {
  id?: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  type?: 'MCQ' | 'Essay';
  parts?: EssayPart[];
  stemAnswer?: string;
  stemPoints?: string[];
}

export interface CBTExam {
  id: string;
  centreId?: string;
  title: string;
  subjects: string[];
  topic?: string;
  questionCount: number;
  durationMinutes: number;
  targetExam: string;
  attemptsCount: number;
  averageScore: number;
  status: 'Live' | 'Scheduled' | 'Draft';
  questions: QuizQuestion[];
  frequency: 'General' | 'Mock';
  isClasswork?: boolean;
  isAssignment?: boolean;
  department: string;
  mode: 'MCQ' | 'Essay' | 'Both';
  startTime?: string;
  endTime?: string;
  createdAt?: string;
  tutorId?: string;
  tutorName?: string;
  scorePerQuestion?: number;
  essayMarksPerQuestion?: number;
  essayTotalMarks?: number;
}

export interface SubjectEntry {
  id: string;
  centreId?: string;
  name: string;
  department: 'General' | 'Science' | 'Commercial' | 'Arts';
  description: string;
}

// ---------------------------------------------------------------------------
// MULTI-TENANT DATA MODELS (Step 1)
// ---------------------------------------------------------------------------

export type CentreStatus = 'trial' | 'active' | 'overdue' | 'suspended' | 'closed';

export interface CentreBranding {
  logo?: string;
  colours?: {
    primary?: string;
    secondary?: string;
    accent?: string;
  };
  primaryColor?: string;
  secondaryColor?: string;
  [key: string]: any;
}

export interface Centre {
  id: string;
  name: string;
  status: CentreStatus;
  ownerUid: string;
  branding?: CentreBranding;
  audienceTypes: string[];
  autoApproveStudents: boolean;
  createdAt: string;
  accessCode?: string;
}

export interface CentreBilling {
  centreId: string;
  /** Transactional counter of active student seats (maintained by the server). */
  activeStudentCount?: number;
  planId: 'centre_standard' | 'centre_plus' | string;
  seatCap: number;
  billedSeatsMinimum: number;
  trialStartsAt?: string | null;
  trialEndsAt?: string | null;
  skippedTrial: boolean;
  discountPct: number;
  paidThrough?: string | null;
  notes?: string;
}

export interface AccessCodeRecord {
  centreId: string;
}

export type MembershipRole = 'owner' | 'admin' | 'secretary' | 'finance' | 'tutor' | 'student';
export type MembershipStatus = 'pending' | 'active' | 'disabled';

export interface CentreMembership {
  id?: string; // `${uid}__${centreId}`
  uid: string;
  centreId: string;
  role: MembershipRole;
  status: MembershipStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformPlan {
  id: string; // 'centre_standard' | 'centre_plus'
  name: string;
  price: number;
  priceType: 'flat' | 'per_seat';
  seatCap: number;
  trialSeatCap: number;
  trialDays: number;
  studentChat: boolean;
  whatsappNotifications: boolean;
  aiEssayMarking: boolean;
  aiQuestionGen: boolean;
  aiPerformanceAnalysis: boolean;
}

export interface PlatformConfigGlobal {
  trialDays: number; // 30
  skipTrialDiscountPct: number; // e.g. 10
  trialGraceDays: number; // e.g. 7
  seatSwapLimitPerStudent?: number; // default 2
  seatSwapWindowDays?: number; // default 30
  aiRouteRateLimitPerHour?: number; // per-user hourly cap on the AI routes
}

export interface AuditLogEntry {
  id: string;
  actorUid: string;
  centreId?: string;
  action: string;
  before?: any;
  after?: any;
  at: string;
}

export interface CentreEntitlements {
  chat: boolean;
  whatsappParentNotifications: boolean;
  aiQuestionGeneration: boolean;
  aiPerformanceAnalysis: boolean;
}

export interface CentreSeatsSummary {
  used: number;
  cap: number;
  isTrial: boolean;
  trialDaysLeft?: number;
  trialEndsAt?: string | null;
  studentAccess?: Record<string, {
    status: MembershipStatus;
    lastToggledAt?: string;
    reactivationsIn30d?: number;
  }>;
}

export interface CentreUserRole {
  centreId: string;
  role: MembershipRole;
  centreName: string;
  logo?: string;
}
