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
