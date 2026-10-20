import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  TenantSettings,
  Branch,
  CMSContent,
  Student,
  AdmissionApplication,
  Tutor,
  Programme,
  TimetableSlot,
  StudentResult,
  CBTQuestion,
  PaymentRecord,
  Announcement,
  AdminUser,
  ActivityLog,
  CBTExam,
  Classroom,
  SubjectEntry,
  AttendanceSettings,
  AttendanceLog,
  ClassRating,
  TutorRatingStats,
  ClassRatingStats,
  StudyMaterial,
  Centre,
  CentreEntitlements,
  CentreSeatsSummary,
  CentreUserRole,
} from '../types';

export const SWITCH_REQUIRES_CODE = false;

import {
  INITIAL_SETTINGS,
  INITIAL_BRANCHES,
  INITIAL_CMS,
  INITIAL_PROGRAMMES,
  INITIAL_TUTORS,
  INITIAL_STUDENTS,
  INITIAL_ADMISSIONS,
  INITIAL_TIMETABLE,
  INITIAL_RESULTS,
  INITIAL_CBT_QUESTIONS,
  INITIAL_PAYMENTS,
  INITIAL_ANNOUNCEMENTS,
  INITIAL_ADMINS,
  INITIAL_ACTIVITIES,
  INITIAL_CLASSROOMS,
  INITIAL_ATTENDANCE_SETTINGS,
  INITIAL_SUBJECTS,
  INITIAL_STUDY_MATERIALS,
} from '../initialData';

import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  getDoc,
  getDocs,
  query,
  where,
  addDoc,
  getDocFromServer
} from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  onAuthStateChanged,
  User,
  getAuth,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { db, auth as firebaseAuth, firebaseConfigValues } from '../firebase';

// -------------------------------------------------------------------------
// CONSTANTS
// -------------------------------------------------------------------------
const ROLE_MAP: Record<string, string> = {
  'Super Administrator': 'Super Admin',
  'Centre Administrator': 'Center Admin',
  'Admission Officer': 'Admin Secretary',
  'Accountant': 'Finance Admin',
  'Reviewer': 'Center Admin',
};

// -------------------------------------------------------------------------
// FIRESTORE ERROR HANDLING (Skill requirement)
// -------------------------------------------------------------------------
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

function handleFirestoreError(error: any, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: firebaseAuth.currentUser?.uid,
      email: firebaseAuth.currentUser?.email,
      emailVerified: firebaseAuth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // Optional: throw error if you want to block UI, or just log and return
}

export type AdminSection =
  | 'dashboard'
  | 'students'
  | 'subjects'
  | 'admissions'
  | 'tutors'
  | 'programmes'
  | 'timetable'
  | 'attendance'
  | 'results'
  | 'cbt'
  | 'payments'
  | 'announcements'
  | 'cms-editor'
  | 'branches'
  | 'settings'
  | 'account'
  | 'staff-roles'
  | 'parent-portal'
  | 'student-portal'
  | 'tutor-portal';

interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  description?: string;
}

interface AppContextType {
  settings: TenantSettings;
  updateSettings: (newSettings: Partial<TenantSettings>) => void;
  resetToDefaults: () => void;

  branches: Branch[];
  addBranch: (branch: Omit<Branch, 'id' | 'studentCount'>) => void;
  updateBranch: (id: string, branch: Partial<Branch>) => void;

  cms: CMSContent;
  updateCMS: (newCms: Partial<CMSContent>) => void;

  students: Student[];
  addStudent: (student: Omit<Student, 'id' | 'registrationDate'>) => void;
  updateStudent: (id: string, student: Partial<Student>) => void;
  deleteStudent: (id: string) => void;
  toggleStudentSuspend: (id: string) => void;

  admissions: AdmissionApplication[];
  submitAdmissionApplication: (application: Omit<AdmissionApplication, 'id' | 'status' | 'appliedDate'>) => void;
  approveAdmission: (id: string) => void;
  rejectAdmission: (id: string) => void;

  tutors: Tutor[];
  addTutor: (tutor: Omit<Tutor, 'id'>) => void;
  updateTutor: (id: string, tutor: Partial<Tutor>) => void;
  deleteTutor: (id: string) => void;
  toggleTutorSuspend: (id: string) => void;

  subjects: SubjectEntry[];
  addSubject: (subject: Omit<SubjectEntry, 'id'>) => void;
  updateSubject: (id: string, subject: Partial<SubjectEntry>) => void;
  deleteSubject: (id: string) => void;

  classrooms: Classroom[];
  addClassroom: (classroom: Omit<Classroom, 'id'>) => void;
  updateClassroom: (id: string, classroom: Partial<Classroom>) => void;
  deleteClassroom: (id: string) => void;

  programmes: Programme[];
  addProgramme: (programme: Omit<Programme, 'id' | 'enrolledStudents'>) => void;
  updateProgramme: (id: string, programme: Partial<Programme>) => void;

  timetable: TimetableSlot[];
  addTimetableSlot: (slot: Omit<TimetableSlot, 'id'>) => Promise<void>;
  addMultipleTimetableSlots: (slots: Omit<TimetableSlot, 'id'>[]) => Promise<void>;
  updateTimetableSlot: (id: string, slot: Partial<TimetableSlot>) => Promise<void>;
  deleteTimetableSlot: (id: string) => Promise<void>;
  consentToTimetableSlot: (id: string) => Promise<void>;

  classRatings: ClassRating[];
  addClassRating: (rating: Omit<ClassRating, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  getTutorRatingStats: (tutorIdOrName: string) => TutorRatingStats;
  getClassRatingStats: (slotId: string) => ClassRatingStats;

  studyMaterials: StudyMaterial[];
  addStudyMaterial: (material: Omit<StudyMaterial, 'id' | 'uploadedAt'>) => Promise<void>;

  attendanceSettings: AttendanceSettings;
  updateAttendanceSettings: (settings: Partial<AttendanceSettings>) => void;

  attendanceLogs: AttendanceLog[];
  clockIn: (studentId: string) => Promise<void>;
  clockOut: (studentId: string) => Promise<void>;

  results: StudentResult[];
  addResult: (result: Omit<StudentResult, 'id'>) => void;

  cbtQuestions: CBTQuestion[];
  addCBTQuestion: (question: Omit<CBTQuestion, 'id'>) => void;

  payments: PaymentRecord[];
  recordPayment: (payment: Omit<PaymentRecord, 'id' | 'receiptNumber' | 'date'>) => void;

  announcements: Announcement[];
  addAnnouncement: (announcement: Omit<Announcement, 'id' | 'date'>) => void;
  deleteAnnouncement: (id: string) => void;

  admins: AdminUser[];
  addAdmin: (admin: Omit<AdminUser, 'id'>) => void;
  updateAdmin: (id: string, admin: Partial<AdminUser>) => void;
  deleteAdmin: (id: string) => void;
  toggleAdminSuspend: (id: string) => void;

  testimonials: CMSContent['testimonials'];
  addTestimonial: (testimonial: Omit<CMSContent['testimonials'][0], 'id'>) => void;
  deleteTestimonial: (id: string) => void;

  activities: ActivityLog[];
  logActivity: (activity: Omit<ActivityLog, 'id' | 'timeAgo'>) => void;

  exams: CBTExam[];

  // Navigation & View mode
  viewMode: 'portal' | 'website' | 'student' | 'tutor';
  setViewMode: (mode: 'portal' | 'website' | 'student' | 'tutor') => void;
  adminSection: AdminSection;
  setAdminSection: (section: AdminSection) => void;
  globalSearch: string;
  setGlobalSearch: (query: string) => void;

  // Active Tutor (for Tutor Portal view)
  activeTutor: Tutor | null;
  setActiveTutor: (tutor: Tutor | null) => void;

  // Background Theme (App background alone)
  bgTheme: 'light' | 'dark';
  setBgTheme: (theme: 'light' | 'dark') => void;
  toggleBgTheme: () => void;

  // Active User
  activeUser: AdminUser;
  setActiveUser: (user: AdminUser) => void;
  authMethod: 'google' | 'password' | null;

  // Toast
  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;

  // Firebase Auth
  login: () => Promise<void>;
  logout: () => Promise<void>;
  currentUser: any;
  isAdmin: boolean;
  isAuthLoading: boolean;

  // Selected student for quick view/drawer
  selectedStudent: Student | null;
  setSelectedStudent: (student: Student | null) => void;

  // Multi-Tenant Architecture (Prompt 3)
  activeCentreId: string | null;
  activeCentre: Centre | null;
  userCentres: CentreUserRole[];
  entitlements: CentreEntitlements;
  seatsSummary: CentreSeatsSummary | null;
  hasCheckedActiveCentre: boolean;
  enterCentreByCode: (code: string) => Promise<{ success: boolean; centreId?: string; error?: string }>;
  joinCentreByCode: (code: string) => Promise<{ status: 'active' | 'pending'; centreName: string; centreId: string }>;
  switchCentre: (centreId: string) => Promise<void>;
  refreshSeatsSummary: () => Promise<void>;
  toggleStudentAccess: (studentUid: string, active: boolean) => Promise<void>;
  activateStudentMembership: (studentUid: string) => Promise<{ success: boolean; used: number; cap: number }>;
}


const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEY = 'EXCELLENCE_TUTORIAL_DATA_V1';

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Load from localStorage or defaults
  const [settings, setSettingsState] = useState<TenantSettings>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_settings`);
      if (saved) {
        const parsed = JSON.parse(saved);
        const resolvedWhatsapp = parsed.whatsappNumber || parsed.whatsapp || INITIAL_SETTINGS.whatsapp;
        return {
          ...INITIAL_SETTINGS,
          ...parsed,
          whatsapp: resolvedWhatsapp,
          whatsappNumber: resolvedWhatsapp,
        };
      }
      return INITIAL_SETTINGS;
    } catch {
      return INITIAL_SETTINGS;
    }
  });

  const [branches, setBranches] = useState<Branch[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_branches`);
      return saved ? JSON.parse(saved) : INITIAL_BRANCHES;
    } catch {
      return INITIAL_BRANCHES;
    }
  });

  const [cms, setCmsState] = useState<CMSContent>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_cms`);
      return saved ? JSON.parse(saved) : INITIAL_CMS;
    } catch {
      return INITIAL_CMS;
    }
  });

  const [students, setStudents] = useState<Student[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_students`);
      if (saved) {
        const parsed: Student[] = JSON.parse(saved);
        // Ensure student avatars use authentic Nigerian student pictures
        const MALE_NIGERIAN =
          'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=500&q=80';
        const FEMALE_NIGERIAN =
          'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=500&q=80';
        return parsed.map((s) => {
          if (!s.avatar || s.avatar.includes('photo-1534528741775') || s.avatar.includes('photo-1517841905240')) {
            return { ...s, avatar: s.gender === 'Female' ? FEMALE_NIGERIAN : MALE_NIGERIAN };
          }
          return s;
        });
      }
      return INITIAL_STUDENTS;
    } catch {
      return INITIAL_STUDENTS;
    }
  });

  const [admissions, setAdmissions] = useState<AdmissionApplication[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_admissions`);
      return saved ? JSON.parse(saved) : INITIAL_ADMISSIONS;
    } catch {
      return INITIAL_ADMISSIONS;
    }
  });

  const [tutors, setTutors] = useState<Tutor[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_tutors`);
      return saved ? JSON.parse(saved) : INITIAL_TUTORS;
    } catch {
      return INITIAL_TUTORS;
    }
  });

  const [subjects, setSubjects] = useState<SubjectEntry[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_subjects`);
      return saved ? JSON.parse(saved) : INITIAL_SUBJECTS;
    } catch {
      return INITIAL_SUBJECTS;
    }
  });

  const [activeTutor, setActiveTutor] = useState<Tutor | null>(() => {
    return INITIAL_TUTORS[0] || null;
  });

  const [classrooms, setClassrooms] = useState<Classroom[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_classrooms`);
      return saved ? JSON.parse(saved) : INITIAL_CLASSROOMS;
    } catch {
      return INITIAL_CLASSROOMS;
    }
  });

  const [attendanceSettings, setAttendanceSettings] = useState<AttendanceSettings>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_attendanceSettings`);
      return saved ? JSON.parse(saved) : INITIAL_ATTENDANCE_SETTINGS;
    } catch {
      return INITIAL_ATTENDANCE_SETTINGS;
    }
  });

  const [programmes, setProgrammes] = useState<Programme[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_programmes`);
      return saved ? JSON.parse(saved) : INITIAL_PROGRAMMES;
    } catch {
      return INITIAL_PROGRAMMES;
    }
  });

  const [timetable, setTimetable] = useState<TimetableSlot[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_timetable`);
      return saved ? JSON.parse(saved) : INITIAL_TIMETABLE;
    } catch {
      return INITIAL_TIMETABLE;
    }
  });

  const [results, setResults] = useState<StudentResult[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_results`);
      return saved ? JSON.parse(saved) : INITIAL_RESULTS;
    } catch {
      return INITIAL_RESULTS;
    }
  });

  const [cbtQuestions, setCbtQuestions] = useState<CBTQuestion[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_cbt`);
      return saved ? JSON.parse(saved) : INITIAL_CBT_QUESTIONS;
    } catch {
      return INITIAL_CBT_QUESTIONS;
    }
  });

  const [payments, setPayments] = useState<PaymentRecord[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_payments`);
      return saved ? JSON.parse(saved) : INITIAL_PAYMENTS;
    } catch {
      return INITIAL_PAYMENTS;
    }
  });

  const [announcements, setAnnouncements] = useState<Announcement[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_announcements`);
      return saved ? JSON.parse(saved) : INITIAL_ANNOUNCEMENTS;
    } catch {
      return INITIAL_ANNOUNCEMENTS;
    }
  });

  const [admins, setAdmins] = useState<AdminUser[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_admins`);
      return saved ? JSON.parse(saved) : INITIAL_ADMINS;
    } catch {
      return INITIAL_ADMINS;
    }
  });

  const [testimonials, setTestimonials] = useState<CMSContent['testimonials']>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_testimonials`);
      return saved ? JSON.parse(saved) : INITIAL_CMS.testimonials;
    } catch {
      return INITIAL_CMS.testimonials;
    }
  });

  const [activities, setActivities] = useState<ActivityLog[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_activities`);
      return saved ? JSON.parse(saved) : INITIAL_ACTIVITIES;
    } catch {
      return INITIAL_ACTIVITIES;
    }
  });

  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLog[]>([]);
  const [exams, setExams] = useState<CBTExam[]>([]);
  const [classRatings, setClassRatings] = useState<ClassRating[]>([]);
  const [studyMaterials, setStudyMaterials] = useState<StudyMaterial[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_studyMaterials`);
      return saved ? JSON.parse(saved) : INITIAL_STUDY_MATERIALS;
    } catch {
      return INITIAL_STUDY_MATERIALS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_KEY}_studyMaterials`, JSON.stringify(studyMaterials));
    } catch (e) {
      console.warn('Failed to save study materials locally:', e);
    }
  }, [studyMaterials]);

  // -------------------------------------------------------------------------
  // MULTI-TENANT STATE (Prompt 3)
  // -------------------------------------------------------------------------
  const [activeCentreId, setActiveCentreId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('tos_activeCentreId');
    } catch {
      return null;
    }
  });

  const [activeCentre, setActiveCentre] = useState<Centre | null>(null);
  const [userCentres, setUserCentres] = useState<CentreUserRole[]>([]);
  const [entitlements, setEntitlements] = useState<CentreEntitlements>({
    chat: false,
    whatsappParentNotifications: true,
    aiQuestionGeneration: true,
    aiPerformanceAnalysis: true,
  });
  const [seatsSummary, setSeatsSummary] = useState<CentreSeatsSummary | null>(null);
  const [hasCheckedActiveCentre, setHasCheckedActiveCentre] = useState(false);


  const addStudyMaterial = async (materialData: Omit<StudyMaterial, 'id' | 'uploadedAt'>) => {
    try {
      const newId = `mat-${Date.now()}`;
      const newMaterial: StudyMaterial = {
        ...materialData,
        id: newId,
        uploadedAt: new Date().toISOString(),
      };
      setStudyMaterials((prev) => [newMaterial, ...prev]);

      try {
        await setDoc(doc(db, 'studyMaterials', newId), newMaterial);
      } catch (err) {
        console.warn('Firestore studyMaterial save (using local):', err);
      }

      addToast({
        type: 'success',
        title: 'Material Uploaded',
        description: `"${newMaterial.title}" is now available for students.`,
      });
    } catch (e) {
      console.error('Error adding study material:', e);
    }
  };

  const clockIn = async (studentId: string) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
      const nowISO = now.toISOString();
      
      // Determine status based on lateArrivalTime
      let status: AttendanceLog['status'] = 'Present';
      const parseTime = (timeStr: string) => {
        if (!timeStr) return 0;
        const [time, modifier] = timeStr.split(' ');
        let [hours, minutes] = time.split(':').map(Number);
        if (modifier === 'PM' && hours < 12) hours += 12;
        if (modifier === 'AM' && hours === 12) hours = 0;
        return hours * 60 + minutes;
      };

      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const lateThresholdMinutes = parseTime(attendanceSettings.lateArrivalTime);
      
      if (currentMinutes > lateThresholdMinutes) {
        status = 'Late';
      }

      const logId = `attn-${studentId}-${today}`;
      const newLog: AttendanceLog = {
        id: logId,
        studentId,
        date: today,
        clockInAt: nowISO,
        status
      };

      await setDoc(doc(db, 'attendance_logs', logId), newLog);
      
      // Update student total count
      const student = students.find(s => s.id === studentId);
      if (student) {
        const currentCount = student.totalAttendanceCount || 0;
        await updateDoc(doc(db, 'students', studentId), {
          totalAttendanceCount: currentCount + 1
        });
      }

      addToast({
        type: 'success',
        title: 'Clocked In',
        description: `Successfully clocked in at ${timeStr}. Status: ${status}`
      });
    } catch (e) {
      console.error(e);
      addToast({ type: 'error', title: 'Clock-in Failed', description: 'Firebase sync error.' });
    }
  };

  const clockOut = async (studentId: string) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
      const nowISO = now.toISOString();
      
      const logId = `attn-${studentId}-${today}`;
      const logDoc = await getDoc(doc(db, 'attendance_logs', logId));
      
      if (logDoc.exists()) {
        const logData = logDoc.data() as AttendanceLog;
        
        const parseTime = (timeStr: string) => {
          if (!timeStr) return 0;
          const [time, modifier] = timeStr.split(' ');
          let [hours, minutes] = time.split(':').map(Number);
          if (modifier === 'PM' && hours < 12) hours += 12;
          if (modifier === 'AM' && hours === 12) hours = 0;
          return hours * 60 + minutes;
        };

        const clockInDate = new Date(logData.clockInAt);
        const clockInMinutes = clockInDate.getHours() * 60 + clockInDate.getMinutes();
        const lateThresholdMinutes = parseTime(attendanceSettings.lateArrivalTime);
        
        const finalStatus = clockInMinutes > lateThresholdMinutes ? 'Late' : 'Present';

        await updateDoc(doc(db, 'attendance_logs', logId), {
          clockOutAt: nowISO,
          status: finalStatus
        });
        addToast({
          type: 'success',
          title: 'Clocked Out',
          description: `Successfully clocked out at ${timeStr}.`
        });
      } else {
        addToast({
          type: 'error',
          title: 'Not Clocked In',
          description: 'You must clock in before you can clock out.'
        });
      }
    } catch (e) {
      console.error(e);
      addToast({ type: 'error', title: 'Clock-out Failed', description: 'Firebase sync error.' });
    }
  };

  // Persistent navigation parsing from URL hash and localStorage
  const parseInitialNavigation = (): {
    viewMode: 'portal' | 'website' | 'student' | 'tutor';
    adminSection: AdminSection;
  } => {
    const validSections: AdminSection[] = [
      'dashboard',
      'students',
      'admissions',
      'tutors',
      'programmes',
      'timetable',
      'attendance',
      'results',
      'cbt',
      'payments',
      'announcements',
      'cms-editor',
      'branches',
      'settings',
      'account',
      'staff-roles',
      'parent-portal',
      'student-portal',
      'tutor-portal',
    ];

    try {
      // 1. Check URL hash first (highest priority for refreshes and deep links)
      const hash = window.location.hash.toLowerCase();
      if (hash) {
        if (hash.startsWith('#student')) {
          return { viewMode: 'student', adminSection: 'dashboard' };
        }
        if (hash.startsWith('#tutor')) {
          return { viewMode: 'tutor', adminSection: 'dashboard' };
        }
        if (hash.startsWith('#website')) {
          return { viewMode: 'website', adminSection: 'dashboard' };
        }
        if (hash.startsWith('#admin/')) {
          const rawSection = hash.replace('#admin/', '') as AdminSection;
          if (validSections.includes(rawSection)) {
            return { viewMode: 'portal', adminSection: rawSection };
          }
        }
        if (hash === '#admin') {
          return { viewMode: 'portal', adminSection: 'dashboard' };
        }
      }

      // 2. Check localStorage if no explicit URL hash
      const savedViewMode = localStorage.getItem(`${STORAGE_KEY}_viewMode`) as
        | 'portal'
        | 'website'
        | 'student'
        | 'tutor'
        | null;
      const savedAdminSection = localStorage.getItem(
        `${STORAGE_KEY}_adminSection`
      ) as AdminSection | null;

      const viewMode =
        savedViewMode === 'portal' ||
        savedViewMode === 'website' ||
        savedViewMode === 'student' ||
        savedViewMode === 'tutor'
          ? savedViewMode
          : 'portal';

      const adminSection =
        savedAdminSection && validSections.includes(savedAdminSection)
          ? savedAdminSection
          : 'dashboard';

      return { viewMode, adminSection };
    } catch {
      return { viewMode: 'portal', adminSection: 'dashboard' };
    }
  };

  const initialNav = parseInitialNavigation();
  const [viewMode, setViewModeState] = useState<'portal' | 'website' | 'student' | 'tutor'>(initialNav.viewMode);
  const [adminSection, setAdminSectionState] = useState<AdminSection>(initialNav.adminSection);

  const setViewMode = (mode: 'portal' | 'website' | 'student' | 'tutor') => {
    setViewModeState(mode);
    try {
      localStorage.setItem(`${STORAGE_KEY}_viewMode`, mode);
      if (mode === 'student') {
        window.location.hash = `student/home`;
      } else if (mode === 'tutor') {
        window.location.hash = 'tutor/home';
      } else if (mode === 'website') {
        window.location.hash = 'website';
      } else {
        window.location.hash = `admin/${adminSection}`;
      }
    } catch (e) {
      console.error(e);
    }
  };

  const setAdminSection = (section: AdminSection) => {
    if (section === 'student-portal') {
      setViewMode('student');
      return;
    }
    if (section === 'tutor-portal') {
      setViewMode('tutor');
      return;
    }
    setAdminSectionState(section);
    try {
      localStorage.setItem(`${STORAGE_KEY}_adminSection`, section);
      if (viewMode === 'portal') {
        window.location.hash = `admin/${section}`;
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Sync initial URL hash and listen for hash changes (browser back/forward & direct links)
  useEffect(() => {
    const validSections: AdminSection[] = [
      'dashboard',
      'students',
      'admissions',
      'tutors',
      'programmes',
      'timetable',
      'attendance',
      'results',
      'cbt',
      'payments',
      'announcements',
      'cms-editor',
      'branches',
      'settings',
      'account',
      'staff-roles',
      'parent-portal',
      'student-portal',
      'tutor-portal',
    ];

    // Ensure URL hash reflects the current restored state if empty
    if (!window.location.hash) {
      if (viewMode === 'student') {
        const savedTab = localStorage.getItem(`${STORAGE_KEY}_studentTab`) || 'home';
        window.location.hash = `student/${savedTab}`;
      } else if (viewMode === 'tutor') {
        window.location.hash = 'tutor';
      } else if (viewMode === 'website') {
        window.location.hash = 'website';
      } else {
        window.location.hash = `admin/${adminSection}`;
      }
    }

    const handleHashChange = () => {
      const hash = window.location.hash.toLowerCase();
      if (!hash) return;
      if (hash.startsWith('#student')) {
        setViewModeState('student');
        try {
          localStorage.setItem(`${STORAGE_KEY}_viewMode`, 'student');
        } catch {}
      } else if (hash.startsWith('#tutor')) {
        setViewModeState('tutor');
        try {
          localStorage.setItem(`${STORAGE_KEY}_viewMode`, 'tutor');
        } catch {}
      } else if (hash.startsWith('#website')) {
        setViewModeState('website');
        try {
          localStorage.setItem(`${STORAGE_KEY}_viewMode`, 'website');
        } catch {}
      } else if (hash.startsWith('#admin/')) {
        const rawSection = hash.replace('#admin/', '') as AdminSection;
        if (validSections.includes(rawSection)) {
          setViewModeState('portal');
          setAdminSectionState(rawSection);
          try {
            localStorage.setItem(`${STORAGE_KEY}_viewMode`, 'portal');
            localStorage.setItem(`${STORAGE_KEY}_adminSection`, rawSection);
          } catch {}
        }
      } else if (hash === '#admin') {
        setViewModeState('portal');
        setAdminSectionState('dashboard');
        try {
          localStorage.setItem(`${STORAGE_KEY}_viewMode`, 'portal');
          localStorage.setItem(`${STORAGE_KEY}_adminSection`, 'dashboard');
        } catch {}
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [viewMode, adminSection]);

  const [globalSearch, setGlobalSearch] = useState('');
  const [activeUser, setActiveUser] = useState<AdminUser | null>(null);
  const [authMethod, setAuthMethod] = useState<'google' | 'password' | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [user, setUser] = useState<User | null>(firebaseAuth.currentUser);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // Safety timeout for auth loading to prevent stuck loading screen in case of connectivity issues
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isAuthLoading) {
        console.warn("Auth initialization timed out, proceeding with default state.");
        setIsAuthLoading(false);
      }
    }, 6000); // 6 seconds safety window
    return () => clearTimeout(timer);
  }, [isAuthLoading]);

  // Auth State Listener & Admin Verification
  useEffect(() => {
    const unsub = onAuthStateChanged(firebaseAuth, async (u) => {
      setUser(u);
      if (u) {
        // Determine Auth Method
        const isGoogle = u.providerData.some(p => p.providerId === 'google.com');
        setAuthMethod(isGoogle ? 'google' : 'password');

        try {
          // Centre-admin access comes from the admins/{uid} document only
          // (Prompt D): the old hard-coded platform-email shortcut is gone.
          // Platform (TOS) access is the server-stamped `tos` claim instead.
          const adminDoc = await getDoc(doc(db, 'admins', u.uid));
          let isAdminUser = adminDoc.exists();
          
          let adminData = adminDoc.exists() ? adminDoc.data() : null;

          if (!isAdminUser && u.email) {
            const qAdmin = query(collection(db, 'admins'), where('email', '==', u.email));
            const adminSnap = await getDocs(qAdmin);
            if (!adminSnap.empty) {
              isAdminUser = true;
              adminData = adminSnap.docs[0].data();
            }
          }

          setIsAdmin(isAdminUser);
          
          if (isAdminUser) {
            const adminProfile: AdminUser = {
              id: u.uid,
              name: u.displayName || adminData?.name || 'Administrator',
              email: u.email || '',
              phone: u.phoneNumber || '',
              role: ROLE_MAP[adminData?.role] || adminData?.role || 'Center Admin',
              status: 'Active',
              department: 'Management',
              jobTitle: adminData?.jobTitle || 'Admin Staff',
              hasChangedPassword: true
            };

            setActiveUser(adminProfile);
            
            // Determine initial view mode based on role and status
            let targetViewMode: 'portal' | 'tutor' | 'student' = 'portal';
            
            // Check if they are a tutor
            const qTutor = query(collection(db, 'tutors'), where('email', '==', u.email));
            const tutorSnap = await getDocs(qTutor);
            let foundTutor = null;
            if (!tutorSnap.empty) {
              foundTutor = { ...tutorSnap.docs[0].data(), id: tutorSnap.docs[0].id } as Tutor;
            } else {
              const tutorDoc = await getDoc(doc(db, 'tutors', u.uid));
              if (tutorDoc.exists()) {
                foundTutor = { ...tutorDoc.data(), id: tutorDoc.id } as Tutor;
              }
            }

            if (foundTutor) {
              setActiveTutor(foundTutor);
              // Priority: 
              // 1. If explicit admin user, allow portal choice but default to portal if no preference
              // 2. If tutor only, force tutor portal
              if (isAdminUser) {
                targetViewMode = 'portal';
              } else {
                targetViewMode = 'tutor';
              }
            } else if (!isAdminUser) {
              targetViewMode = 'student';
            } else {
              targetViewMode = 'portal';
            }

            // NAVIGATION PERSISTENCE & OVERRIDE:
            // Check if we have a valid hash that already specifies a portal
            const hash = window.location.hash.toLowerCase();
            const isStudentHash = hash.startsWith('#student');
            const isTutorHash = hash.startsWith('#tutor');
            const isAdminHash = hash.startsWith('#admin');
            const isWebsiteHash = hash === '#website';

            // Respect existing hash if valid for the user's roles
            if (isTutorHash && foundTutor) {
              targetViewMode = 'tutor';
            } else if (isStudentHash && !isAdminUser && !foundTutor) {
              targetViewMode = 'student';
            } else if (isAdminHash && isAdminUser) {
              targetViewMode = 'portal';
            }

            const validHash = isStudentHash || isTutorHash || isAdminHash || isWebsiteHash;
            
            // Final safety check: if they are ONLY a student but trying to access admin/tutor
            if (!isAdminUser && !foundTutor && (isAdminHash || isTutorHash)) {
              targetViewMode = 'student';
            }
            
            // If they are ONLY a tutor but trying to access admin
            if (!isAdminUser && foundTutor && isAdminHash) {
              targetViewMode = 'tutor';
            }

            if (!validHash || hash === '#admin' || hash === '#portal' || hash === '#tutor' || hash === '#student') {
              setViewMode(targetViewMode);
              if (targetViewMode === 'portal') {
                setAdminSection('dashboard');
              }
            }
          } else {
            // Not an admin, check tutor or student
            const qTutor = query(collection(db, 'tutors'), where('email', '==', u.email));
            const tutorSnap = await getDocs(qTutor);
            let foundTutor = null;
            if (!tutorSnap.empty) {
              foundTutor = { ...tutorSnap.docs[0].data(), id: tutorSnap.docs[0].id } as Tutor;
            }

            if (foundTutor) {
              setActiveTutor(foundTutor);
              setViewMode('tutor');
            } else {
              setViewMode('student');
            }
          }
        } catch (e: any) {
          // If it's a connection/offline error, don't flood the logs, just fallback
          if (e.code !== 'unavailable' && !e.message?.includes('offline')) {
            console.error("Admin identity check failed:", e);
          }
          // Identity check failed (offline or a Firestore error): no verified
          // admin document, so no centre-admin access until it succeeds.
          setIsAdmin(false);
          setActiveUser({
            id: u.uid,
            name: u.displayName || 'Administrator',
            email: u.email || '',
            phone: u.phoneNumber || '',
            role: 'Administrator',
            status: 'Active',
            department: 'Management',
            jobTitle: 'Admin Staff',
          });
        } finally {
          setIsAuthLoading(false);
        }
      } else {
        setIsAdmin(false);
        setAuthMethod(null);
        setIsAuthLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // -------------------------------------------------------------------------
  // MULTI-TENANT INITIALIZATION & REFRESH (Prompt 3)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!user) {
      setHasCheckedActiveCentre(true);
      return;
    }

    const initTenantSession = async () => {
      try {
        const token = await user.getIdToken();

        // 1. Session Claims Sync (Part A, point 1)
        fetch('/api/session/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        }).catch((err) => console.warn('session/sync error:', err));

        // 2. Fetch User Centres for switching (Part A, point 6)
        fetch('/api/auth/my-centres', {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.success && data.centres) {
              setUserCentres(data.centres);
            }
          })
          .catch((e) => console.warn('my-centres error:', e));

        // 3. Check & Validate activeCentreId from sessionStorage (Part A, point 4)
        const savedCentreId = sessionStorage.getItem('tos_activeCentreId');
        if (savedCentreId) {
          const valRes = await fetch('/api/auth/validate-active-centre', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ centreId: savedCentreId }),
          });
          const valData = await valRes.json();
          if (valRes.ok && valData.success) {
            setActiveCentreId(savedCentreId);
            setActiveCentre(valData.centre);
            if (valData.entitlements) setEntitlements(valData.entitlements);

            // Fetch seats summary
            fetch(`/api/centre/seats-summary?centreId=${savedCentreId}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
              .then((res) => res.json())
              .then((sData) => {
                if (sData.success && sData.summary) setSeatsSummary(sData.summary);
              })
              .catch((e) => console.warn('seats summary error:', e));
          } else {
            sessionStorage.removeItem('tos_activeCentreId');
            setActiveCentreId(null);
            setActiveCentre(null);
          }
        }
      } catch (err) {
        console.warn('Tenant init error:', err);
      } finally {
        setHasCheckedActiveCentre(true);
      }
    };

    initTenantSession();
  }, [user]);

  const enterCentreByCode = async (code: string) => {
    if (!user) throw new Error('You must be signed in.');
    const token = await user.getIdToken();
    const res = await fetch('/api/auth/enter-centre', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ code }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'That code did not match. Check it and try again.');
    }

    setActiveCentreId(data.centreId);
    setActiveCentre(data.centre);
    if (data.entitlements) setEntitlements(data.entitlements);
    sessionStorage.setItem('tos_activeCentreId', data.centreId);

    // Refresh seats summary
    refreshSeatsSummary(data.centreId);

    // Sync session claims
    fetch('/api/session/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    }).catch(() => {});

    // Route by role
    if (data.role === 'student') {
      setViewMode('student');
    } else if (data.role === 'tutor') {
      setViewMode('tutor');
    } else {
      setViewMode('portal');
    }

    addToast({
      type: 'success',
      title: 'Welcome to ' + data.centre.name,
      description: `Access code verified successfully. Role: ${data.role}`,
    });

    return { success: true, centreId: data.centreId };
  };

  const joinCentreByCode = async (code: string) => {
    if (!user) throw new Error('You must be signed in.');
    const token = await user.getIdToken();
    const res = await fetch('/api/auth/join-centre', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ code }),
    });

    const data = await res.json();
    if (!res.ok) {
      const err: any = new Error(data.message || data.error || 'That code did not match. Check it and try again.');
      err.code = data.code;
      err.centreName = data.centreName;
      throw err;
    }

    if (data.status === 'active') {
      setActiveCentreId(data.centreId);
      sessionStorage.setItem('tos_activeCentreId', data.centreId);
      setViewMode('student');
      addToast({
        type: 'success',
        title: 'Enrolled Successfully',
        description: `You have joined ${data.centreName}. Welcome!`,
      });
      // Sync claims
      fetch('/api/session/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }).catch(() => {});
    }

    return { status: data.status, centreName: data.centreName, centreId: data.centreId };
  };

  const switchCentre = async (targetCentreId: string) => {
    if (!user) return;
    if (SWITCH_REQUIRES_CODE) {
      sessionStorage.removeItem('tos_activeCentreId');
      setActiveCentreId(null);
      setActiveCentre(null);
      return;
    }

    const token = await user.getIdToken();
    const res = await fetch('/api/auth/validate-active-centre', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ centreId: targetCentreId }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setActiveCentreId(targetCentreId);
      setActiveCentre(data.centre);
      if (data.entitlements) setEntitlements(data.entitlements);
      sessionStorage.setItem('tos_activeCentreId', targetCentreId);
      addToast({
        type: 'success',
        title: 'Switched Centre',
        description: `Now viewing ${data.centre.name}.`,
      });
      refreshSeatsSummary(targetCentreId);
      if (data.role === 'student') setViewMode('student');
      else if (data.role === 'tutor') setViewMode('tutor');
      else setViewMode('portal');
    }
  };

  const refreshSeatsSummary = async (targetId?: string) => {
    const cId = targetId || activeCentreId;
    if (!cId || !user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/centre/seats-summary?centreId=${cId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && data.summary) {
        setSeatsSummary(data.summary);
      }
    } catch (e) {
      console.warn('Failed to refresh seats summary:', e);
    }
  };

  const toggleStudentAccess = async (studentUid: string, active: boolean) => {
    if (!user) throw new Error('You must be signed in.');
    const token = await user.getIdToken();
    const cId = activeCentreId || 'centre-excellence';
    const res = await fetch('/api/centre/students/toggle-access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ studentUid, centreId: cId, active }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || data.error || 'Failed to toggle student access.');
    }

    await refreshSeatsSummary(cId);

    setStudents((prev) =>
      prev.map((s) => {
        if (s.id === studentUid || s.uid === studentUid) {
          return { ...s, status: active ? 'Active' : 'Suspended' };
        }
        return s;
      })
    );
  };

  const activateStudentMembership = async (studentUid: string) => {
    if (!user) throw new Error('You must be signed in.');
    const token = await user.getIdToken();
    const cId = activeCentreId || 'centre-excellence';
    const res = await fetch('/api/centre/students/activate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ studentUid, centreId: cId }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || data.error || 'Seat limit reached or server rejected request.');
    }

    await refreshSeatsSummary(cId);
    return data;
  };


  // Background Theme for the application canvas alone
  const [bgTheme, setBgThemeState] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_bgTheme`);
      return saved === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  const setBgTheme = (theme: 'light' | 'dark') => {
    setBgThemeState(theme);
    try {
      localStorage.setItem(`${STORAGE_KEY}_bgTheme`, theme);
    } catch (e) {
      console.error(e);
    }
  };

  const toggleBgTheme = () => {
    setBgTheme(bgTheme === 'light' ? 'dark' : 'light');
  };

  // Sync state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_KEY}_settings`, JSON.stringify(settings));
      localStorage.setItem(`${STORAGE_KEY}_branches`, JSON.stringify(branches));
      localStorage.setItem(`${STORAGE_KEY}_cms`, JSON.stringify(cms));
      localStorage.setItem(`${STORAGE_KEY}_students`, JSON.stringify(students));
      localStorage.setItem(`${STORAGE_KEY}_admissions`, JSON.stringify(admissions));
      localStorage.setItem(`${STORAGE_KEY}_tutors`, JSON.stringify(tutors));
      localStorage.setItem(`${STORAGE_KEY}_subjects`, JSON.stringify(subjects));
      localStorage.setItem(`${STORAGE_KEY}_classrooms`, JSON.stringify(classrooms));
      localStorage.setItem(`${STORAGE_KEY}_attendanceSettings`, JSON.stringify(attendanceSettings));
      localStorage.setItem(`${STORAGE_KEY}_programmes`, JSON.stringify(programmes));
      localStorage.setItem(`${STORAGE_KEY}_timetable`, JSON.stringify(timetable));
      localStorage.setItem(`${STORAGE_KEY}_results`, JSON.stringify(results));
      localStorage.setItem(`${STORAGE_KEY}_cbt`, JSON.stringify(cbtQuestions));
      localStorage.setItem(`${STORAGE_KEY}_payments`, JSON.stringify(payments));
      localStorage.setItem(`${STORAGE_KEY}_announcements`, JSON.stringify(announcements));
      localStorage.setItem(`${STORAGE_KEY}_admins`, JSON.stringify(admins));
      localStorage.setItem(`${STORAGE_KEY}_testimonials`, JSON.stringify(testimonials));
      localStorage.setItem(`${STORAGE_KEY}_activities`, JSON.stringify(activities));
    } catch {
      // ignore storage quota errors in private browsing
    }
  }, [
    settings,
    branches,
    cms,
    students,
    admissions,
    tutors,
    classrooms,
    attendanceSettings,
    programmes,
    timetable,
    results,
    cbtQuestions,
    payments,
    announcements,
    admins,
    activities,
  ]);

  const addToast = (toast: Omit<ToastMessage, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      removeToast(id);
    }, 1200);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const updateSettings = async (newSettings: Partial<TenantSettings>) => {
    try {
      const updated = { ...settings, ...newSettings };
      if (newSettings.whatsappNumber && !newSettings.whatsapp) {
        updated.whatsapp = newSettings.whatsappNumber;
      }
      if (newSettings.whatsapp && !newSettings.whatsappNumber) {
        updated.whatsappNumber = newSettings.whatsapp;
      }
      await setDoc(doc(db, 'settings', 'global'), updated);
      setSettingsState(updated);
      addToast({
        type: 'success',
        title: 'Settings Updated',
        description: 'Tutorial centre configuration updated successfully.',
      });
      logActivity({
        title: 'Centre Configuration Modified',
        subtitle: `Updated by ${activeUser?.name || 'Admin'}`,
        category: 'CMS',
        type: 'info',
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'settings/global');
    }
  };

  const resetToDefaults = () => {
    setSettingsState(INITIAL_SETTINGS);
    setBranches(INITIAL_BRANCHES);
    setCmsState(INITIAL_CMS);
    setStudents(INITIAL_STUDENTS);
    setAdmissions(INITIAL_ADMISSIONS);
    setTutors(INITIAL_TUTORS);
    setProgrammes(INITIAL_PROGRAMMES);
    setTimetable(INITIAL_TIMETABLE);
    setResults(INITIAL_RESULTS);
    setCbtQuestions(INITIAL_CBT_QUESTIONS);
    setPayments(INITIAL_PAYMENTS);
    setAnnouncements(INITIAL_ANNOUNCEMENTS);
    setAdmins(INITIAL_ADMINS);
    setActivities(INITIAL_ACTIVITIES);
    setClassrooms(INITIAL_CLASSROOMS);
    setAttendanceSettings(INITIAL_ATTENDANCE_SETTINGS);
    setActiveTutor(INITIAL_TUTORS[0] || null);
    localStorage.clear();
    addToast({
      type: 'info',
      title: 'Reset to Factory Defaults',
      description: 'All demo tutorial records restored.',
    });
  };

  const updateCMS = async (newCms: Partial<CMSContent>) => {
    try {
      const updated = { ...cms, ...newCms };
      await setDoc(doc(db, 'cms', 'main'), updated);
      setCmsState(updated);
      addToast({
        type: 'success',
        title: 'Website CMS Saved',
        description: 'Changes are now live on your public tutorial centre website.',
      });
      logActivity({
        title: 'Live Website Content Published',
        subtitle: 'CMS sections synchronized',
        category: 'CMS',
        type: 'success',
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'cms/main');
    }
  };

  const addBranch = async (branchData: Omit<Branch, 'id' | 'studentCount'>) => {
    try {
      const id = `branch-${Date.now()}`;
      const newBranch: Branch = {
        ...branchData,
        id,
        studentCount: 0,
      };
      await setDoc(doc(db, 'branches', id), newBranch);
      setBranches((prev) => [...prev, newBranch]);
      addToast({
        type: 'success',
        title: 'New Branch Created',
        description: `${branchData.name} has been added to your multi-branch registry.`,
      });
      logActivity({
        title: `Branch Established: ${branchData.name}`,
        subtitle: `${branchData.state} • Coordinator: ${branchData.coordinator}`,
        category: 'Schools',
        type: 'success',
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'branches');
    }
  };

  const addTestimonial = (data: Omit<CMSContent['testimonials'][0], 'id'>) => {
    const newTestimonial = { ...data, id: `t-${Date.now()}` };
    setTestimonials(prev => [...prev, newTestimonial]);
    addToast({ type: 'success', title: 'Testimonial Added', description: 'Success story saved.' });
  };

  const deleteTestimonial = (id: string) => {
    setTestimonials(prev => prev.filter(t => t.id !== id));
    addToast({ type: 'info', title: 'Testimonial Removed' });
  };

  const updateBranch = async (id: string, branchData: Partial<Branch>) => {
    try {
      await updateDoc(doc(db, 'branches', id), branchData);
      setBranches((prev) => prev.map((b) => (b.id === id ? { ...b, ...branchData } : b)));
      addToast({
        type: 'success',
        title: 'Branch Updated',
        description: 'Branch details have been saved.',
      });
    } catch (e) {
      console.error(e);
      addToast({ type: 'error', title: 'Update Failed', description: 'Firebase sync error.' });
    }
  };

  // Firestore Real-time Sync (Gated and Scoped)
  useEffect(() => {
    if (!user) return;

    // Students listener
    let qStudents = query(collection(db, 'students'));
    if (!isAdmin) {
      qStudents = query(collection(db, 'students'), where('uid', '==', user.uid));
    }
    const unsubStudents = onSnapshot(qStudents, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Student));
      setStudents(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'students'));

    // Admissions listener
    let qAdmissions = query(collection(db, 'admissions'));
    let skipAdmissions = false;
    if (!isAdmin) {
      if (user.email) {
        qAdmissions = query(collection(db, 'admissions'), where('email', '==', user.email));
      } else {
        skipAdmissions = true;
      }
    }
    const unsubAdmissions = !skipAdmissions ? onSnapshot(qAdmissions, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as AdmissionApplication));
      setAdmissions(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'admissions')) : () => {};

    // Tutors listener
    const unsubTutors = onSnapshot(collection(db, 'tutors'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Tutor));
      setTutors(data);
      
      // Keep activeTutor in sync with real-time data
      if (user && !isAdmin) {
        const myTutorData = data.find(t => t.id === user.uid || t.email === user.email);
        if (myTutorData) {
          setActiveTutor(myTutorData);
        }
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, 'tutors'));

    // Admins listener
    const unsubAdmins = onSnapshot(collection(db, 'admins'), (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const raw = doc.data();
        return {
          ...raw,
          id: doc.id,
          role: ROLE_MAP[raw.role] || raw.role || 'Tutor'
        } as AdminUser;
      });
      setAdmins(data);
      
      // Update activeUser if applicable
      if (user) {
        const currentAdmin = data.find(a => a.id === user.uid || a.email === user.email);
        
        if (currentAdmin) {
          setActiveUser(currentAdmin);
          setIsAdmin(true);
        }
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, 'admins'));

    // Settings listener
    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (snapshot) => {
      if (snapshot.exists()) setSettingsState(snapshot.data() as TenantSettings);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'settings/global'));

    const unsubAttendanceSettings = onSnapshot(doc(db, 'settings', 'attendance'), (snapshot) => {
      if (snapshot.exists()) setAttendanceSettings(snapshot.data() as AttendanceSettings);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'settings/attendance'));

    // Payments listener
    const qPayments = query(collection(db, 'payments'));
    const unsubPayments = onSnapshot(qPayments, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as PaymentRecord));
      setPayments(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'payments'));

    // Programmes listener
    const unsubProgrammes = onSnapshot(collection(db, 'programmes'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Programme));
      setProgrammes(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'programmes'));

    // Branches listener
    const unsubBranches = onSnapshot(collection(db, 'branches'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Branch));
      setBranches(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'branches'));

    // CMS listener
    const unsubCMS = onSnapshot(doc(db, 'cms', 'main'), (snapshot) => {
      if (snapshot.exists()) setCmsState(snapshot.data() as CMSContent);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'cms/main'));

    // Attendance Logs listener
    let qAttendance = query(collection(db, 'attendance_logs'));
    if (!isAdmin) {
      qAttendance = query(collection(db, 'attendance_logs'), where('studentId', '==', user.uid));
    }
    const unsubAttendance = onSnapshot(qAttendance, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as AttendanceLog));
      setAttendanceLogs(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'attendance_logs'));

    // Announcements listener
    const unsubAnnouncements = onSnapshot(collection(db, 'announcements'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Announcement));
      setAnnouncements(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'announcements'));

    // Subjects listener
    const unsubSubjects = onSnapshot(collection(db, 'subjects'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as SubjectEntry));
      setSubjects(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'subjects'));

    // Classrooms listener
    const unsubClassrooms = onSnapshot(collection(db, 'classrooms'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Classroom));
      setClassrooms(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'classrooms'));

    // Timetable listener
    const unsubTimetable = onSnapshot(collection(db, 'timetable'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as TimetableSlot));
      setTimetable(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'timetable'));

    // Results listener
    let qResults = query(collection(db, 'results'));
    // Staff (Admins and Tutors) should see all results.
    // Students should only see their own results.
    const isStaff = isAdmin || !!activeTutor || tutors.some(t => t.id === user?.uid || t.email === user?.email);
    if (!isStaff && user) {
      qResults = query(collection(db, 'results'), where('studentId', '==', user.uid));
    }
    const unsubResults = onSnapshot(qResults, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as StudentResult));
      setResults(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'results'));

    // CBT Questions listener
    const unsubCBT = onSnapshot(collection(db, 'cbt_questions'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as CBTQuestion));
      setCbtQuestions(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'cbt_questions'));

    // CBT Exams listener
    const unsubCBTExams = onSnapshot(collection(db, 'cbt_exams'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as CBTExam));
      setExams(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'cbt_exams'));

    // Activities listener
    let qActivities = query(collection(db, 'activities'));
    const unsubActivities = isAdmin ? onSnapshot(qActivities, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as ActivityLog));
      setActivities(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'activities')) : () => {};

    // Class Ratings listener
    const unsubClassRatings = onSnapshot(collection(db, 'classRatings'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as ClassRating));
      setClassRatings(data);
    }, (error) => console.warn('classRatings snapshot error:', error));

    // Study Materials listener
    const unsubStudyMaterials = onSnapshot(collection(db, 'studyMaterials'), (snapshot) => {
      if (!snapshot.empty) {
        const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as StudyMaterial));
        setStudyMaterials(data);
      }
    }, (error) => console.warn('studyMaterials snapshot error:', error));

    return () => {
      unsubStudents();
      unsubAdmissions();
      unsubTutors();
      unsubAdmins();
      unsubSettings();
      unsubPayments();
      unsubProgrammes();
      unsubBranches();
      unsubCMS();
      unsubAttendance();
      unsubAttendanceSettings();
      unsubAnnouncements();
      unsubSubjects();
      unsubClassrooms();
      unsubTimetable();
      unsubResults();
      unsubCBT();
      unsubCBTExams();
      unsubActivities();
      unsubClassRatings();
      unsubStudyMaterials();
    };
  }, [user, isAdmin, activeTutor]); // Removed 'tutors' dependency to avoid frequent resets

  const addStudent = async (studentData: Omit<Student, 'id' | 'registrationDate'>) => {
    try {
      const id = `stu-${Date.now()}`;
      const cId = activeCentreId || 'centre-excellence';

      // SERVER SEAT ENFORCEMENT: Verify cap in transaction and activate membership
      await activateStudentMembership(id);

      const newStudent = {
        ...studentData,
        id,
        centreId: cId,
        registrationDate: new Date().toISOString().split('T')[0],
      };
      await setDoc(doc(db, 'students', id), newStudent);
      
      addToast({
        type: 'success',
        title: 'Student Enrolled',
        description: `${studentData.name} has been registered successfully.`,
      });
      refreshSeatsSummary(cId);
    } catch (e: any) {
      console.error(e);
      addToast({ 
        type: 'error', 
        title: 'Enrollment Blocked', 
        description: e.message || 'Seat limit reached or server rejected request.' 
      });
      throw e;
    }
  };

  const updateStudent = async (id: string, studentData: Partial<Student>) => {
    try {
      await updateDoc(doc(db, 'students', id), studentData);
      addToast({
        type: 'success',
        title: 'Student Record Updated',
        description: 'Student profile details saved successfully.',
      });
    } catch (e) {
      console.error(e);
    }
  };

  const deleteStudent = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'students', id));
      addToast({
        type: 'info',
        title: 'Student Removed',
      });
    } catch (e) {
      console.error(e);
    }
  };

  const toggleStudentSuspend = (id: string) => {
    setStudents((prev) =>
      prev.map((s) => {
        if (s.id === id) {
          const newStatus = s.status === 'Suspended' ? 'Active' : 'Suspended';
          addToast({
            type: newStatus === 'Suspended' ? 'info' : 'success',
            title: `Student ${newStatus}`,
            description: `${s.name} status changed to ${newStatus.toLowerCase()}.`,
          });
          return { ...s, status: newStatus };
        }
        return s;
      })
    );
  };

  const submitAdmissionApplication = async (
    data: Omit<AdmissionApplication, 'id' | 'status' | 'appliedDate'>
  ) => {
    try {
      const id = `adm-${Date.now()}`;
      const newApp: AdmissionApplication = {
        ...data,
        id,
        status: 'Pending',
        appliedDate: new Date().toISOString().split('T')[0],
      };
      await setDoc(doc(db, 'admissions', id), newApp);
      
      addToast({
        type: 'success',
        title: 'Admission Application Received!',
        description: 'Our academic counsellor will review your credentials within 24 hours.',
      });
    } catch (e) {
      console.error(e);
      addToast({ type: 'error', title: 'Submission Failed', description: 'Could not send application to server.' });
    }
  };

  const approveAdmission = async (id: string) => {
    try {
      const app = admissions.find((a) => a.id === id);
      if (!app) return;

      const studentId = `stu-${Date.now()}`;
      const cId = activeCentreId || 'centre-excellence';

      // SERVER SEAT ENFORCEMENT: Verify cap in transaction and activate membership
      await activateStudentMembership(studentId);

      const prog = programmes.find((p) => p.id === app.programmeId) || programmes[0];
      const branch = branches.find((b) => b.id === app.branchId) || branches[0];

      // Create Firebase Auth account for the student
      const tempPass = 'Student@123';
      const secondaryApp = initializeApp(firebaseConfigValues, `student-creation-${studentId}`);
      const secondaryAuth = getAuth(secondaryApp);
      try {
        await createUserWithEmailAndPassword(secondaryAuth, app.email, tempPass);
        console.log(`Auth account created for student: ${app.email}`);
      } catch (authError: any) {
        console.error('Student Auth account creation failed:', authError);
      } finally {
        await deleteApp(secondaryApp);
      }


      const newStudent: Student = {
        id: studentId,
        name: app.applicantName,
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
        phone: app.phone,
        email: app.email,
        gender: app.gender,
        dob: '2008-06-15',
        parentName: app.parentName,
        parentWhatsApp: app.parentWhatsApp,
        parentEmail: app.email,
        address: 'Lagos, Nigeria',
        programmeId: app.programmeId,
        programmeName: prog.name,
        branchId: app.branchId || 'branch-1',
        branchName: branch?.name || 'Main Tutorial Centre',
        subjects: app.subjects.length > 0 ? app.subjects : (prog?.subjects || []),
        notes: app.notes,
        registrationDate: new Date().toISOString().split('T')[0],
        status: 'Active',
        attendancePercent: 100,
        totalFee: prog.fee,
        paidAmount: 0,
        outstandingBalance: prog.fee,
        paymentStatus: 'Pending',
      };

      await setDoc(doc(db, 'students', studentId), newStudent);
      await updateDoc(doc(db, 'admissions', id), { status: 'Approved' });

      addToast({
        type: 'success',
        title: 'Applicant Approved & Enrolled!',
        description: `${app.applicantName} is now in the Student Directory.`,
      });
    } catch (e) {
      console.error(e);
    }
  };

  const rejectAdmission = async (id: string) => {
    try {
      await updateDoc(doc(db, 'admissions', id), { status: 'Rejected' });
      addToast({
        type: 'info',
        title: 'Application Rejected',
      });
    } catch (e) {
      console.error(e);
    }
  };

  const addTutor = async (tutorData: Omit<Tutor, 'id'>) => {
    try {
      let authUid = `tut-${Date.now()}`;
      
      // Robustly create Firebase Auth account for the tutor
      if (tutorData.temporaryPassword) {
        const secondaryApp = initializeApp(firebaseConfigValues, `tutor-creation-${Date.now()}`);
        const secondaryAuth = getAuth(secondaryApp);
        try {
          const cred = await createUserWithEmailAndPassword(secondaryAuth, tutorData.email, tutorData.temporaryPassword);
          authUid = cred.user.uid;
          console.log(`Auth account created for ${tutorData.email} with UID: ${authUid}`);
        } catch (authError: any) {
          console.error('Auth account creation failed:', authError);
          if (authError.code === 'auth/email-already-in-use') {
             throw new Error(`The email "${tutorData.email}" is already registered in the system. Please use a different email or update the existing record.`);
          }
          throw authError;
        } finally {
          await deleteApp(secondaryApp);
        }
      }

      const newTutor: Tutor = {
        ...tutorData,
        id: authUid,
      };

      await setDoc(doc(db, 'tutors', authUid), newTutor);
      
      addToast({
        type: 'success',
        title: 'Tutor Added',
        description: `${tutorData.name} has been enrolled in the faculty team.`,
      });
    } catch (e: any) {
      console.error(e);
      addToast({ 
        type: 'error', 
        title: 'Registration Failed', 
        description: e.message || 'Error creating tutor record.' 
      });
    }
  };

  const updateTutor = async (id: string, tutorData: Partial<Tutor>) => {
    try {
      await updateDoc(doc(db, 'tutors', id), tutorData);
      
      // Update local state immediately for better UX
      setTutors((prev) => prev.map((t) => (t.id === id ? { ...t, ...tutorData } : t)));
      if (activeTutor && activeTutor.id === id) {
        setActiveTutor(prev => prev ? { ...prev, ...tutorData } : null);
      }

      addToast({
        type: 'success',
        title: 'Tutor Profile Updated',
        description: 'Faculty details saved successfully.',
      });
    } catch (e: any) {
      console.error(e);
      addToast({ type: 'error', title: 'Update Failed', description: 'Could not sync with database.' });
    }
  };

  const deleteTutor = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'tutors', id));
      setTutors((prev) => prev.filter((t) => t.id !== id));
      addToast({
        type: 'info',
        title: 'Tutor Removed',
        description: 'Tutor removed from faculty.',
      });
    } catch (e) {
      console.error(e);
      addToast({ type: 'error', title: 'Action Failed', description: 'Firebase delete error.' });
    }
  };

  const toggleTutorSuspend = (id: string) => {
    setTutors((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          const newStatus = t.status === 'Suspended' ? 'Active' : 'Suspended';
          addToast({
            type: newStatus === 'Suspended' ? 'info' : 'success',
            title: `Tutor ${newStatus}`,
            description: `${t.name} has been ${newStatus.toLowerCase()}.`,
          });
          return { ...t, status: newStatus };
        }
        return t;
      })
    );
  };

  const addSubject = async (subjectData: Omit<SubjectEntry, 'id'>) => {
    try {
      const id = `sub-${Date.now()}`;
      const newSubject: SubjectEntry = {
        ...subjectData,
        id,
      };
      await setDoc(doc(db, 'subjects', id), newSubject);
      addToast({
        type: 'success',
        title: 'Subject Added',
        description: `${subjectData.name} has been added to the master catalog.`,
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'subjects');
    }
  };

  const updateSubject = async (id: string, subjectData: Partial<SubjectEntry>) => {
    try {
      await updateDoc(doc(db, 'subjects', id), subjectData);
      addToast({
        type: 'success',
        title: 'Subject Updated',
        description: 'Subject details saved.',
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'subjects');
    }
  };

  const deleteSubject = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'subjects', id));
      addToast({
        type: 'info',
        title: 'Subject Removed',
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'subjects');
    }
  };

  const addClassroom = async (classroomData: Omit<Classroom, 'id'>) => {
    try {
      const id = `room-${Date.now()}`;
      const newRoom: Classroom = {
        ...classroomData,
        id,
      };
      await setDoc(doc(db, 'classrooms', id), newRoom);
      addToast({
        type: 'success',
        title: 'Classroom Added',
        description: `${classroomData.name} has been added.`,
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'classrooms');
    }
  };

  const updateClassroom = async (id: string, classroomData: Partial<Classroom>) => {
    try {
      await updateDoc(doc(db, 'classrooms', id), classroomData);
      addToast({
        type: 'success',
        title: 'Classroom Updated',
        description: 'Classroom details saved.',
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'classrooms');
    }
  };

  const deleteClassroom = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'classrooms', id));
      addToast({
        type: 'info',
        title: 'Classroom Removed',
        description: 'Room has been removed.',
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'classrooms');
    }
  };

  const addProgramme = async (progData: Omit<Programme, 'id' | 'enrolledStudents'>) => {
    try {
      const id = `prog-${Date.now()}`;
      const newProg: Programme = {
        ...progData,
        id,
        enrolledStudents: 0,
      };
      await setDoc(doc(db, 'programmes', id), newProg);
      addToast({
        type: 'success',
        title: 'Programme Created',
        description: `${progData.name} is now available on the website and registration form.`,
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'programmes');
    }
  };

  const updateProgramme = async (id: string, progData: Partial<Programme>) => {
    try {
      await updateDoc(doc(db, 'programmes', id), progData);
      addToast({
        type: 'success',
        title: 'Programme Updated',
        description: 'Curriculum & fee changes saved.',
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'programmes');
    }
  };

  const addTimetableSlot = async (slotData: Omit<TimetableSlot, 'id'>) => {
    try {
      const id = `tt-${Date.now()}`;
      const newSlot: any = {
        ...slotData,
        id,
        status: slotData.status || 'pending_tutor_consent'
      };
      
      // Remove undefined fields for Firestore
      Object.keys(newSlot).forEach(key => newSlot[key] === undefined && delete newSlot[key]);

      await setDoc(doc(db, 'timetable', id), newSlot);
      addToast({
        type: 'success',
        title: 'Timetable Slot Added',
        description: `${slotData.subject} on ${slotData.day} at ${slotData.time}`,
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'timetable');
    }
  };

  const addMultipleTimetableSlots = async (slotsData: Omit<TimetableSlot, 'id'>[]) => {
    try {
      for (const slotData of slotsData) {
        const id = `tt-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const newSlot: any = {
          ...slotData,
          id,
        };

        // Remove undefined fields for Firestore
        Object.keys(newSlot).forEach(key => newSlot[key] === undefined && delete newSlot[key]);

        await setDoc(doc(db, 'timetable', id), newSlot);
      }
      addToast({
        type: 'success',
        title: 'Multiple Classes Scheduled',
        description: `${slotsData.length} classes have been added to the timetable.`,
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'timetable');
    }
  };

  const consentToTimetableSlot = async (id: string, topic?: string) => {
    try {
      const updateData: any = { status: 'active' };
      if (topic) updateData.topic = topic;
      
      await updateDoc(doc(db, 'timetable', id), updateData);
      addToast({
        type: 'success',
        title: 'Class Confirmed',
        description: 'You have successfully consented to this class.',
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'timetable');
    }
  };

  const deleteTimetableSlot = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'timetable', id));
      addToast({
        type: 'info',
        title: 'Timetable Slot Removed',
        description: 'Schedule slot removed.',
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'timetable');
    }
  };

  const updateTimetableSlot = async (id: string, slotData: Partial<TimetableSlot>) => {
    try {
      const slotRef = doc(db, 'timetable', id);
      
      // If admin is updating and it's not a status-only update, reset status to pending
      let finalData = { ...slotData };
      if (isAdmin && !slotData.status) {
        finalData.status = 'pending_tutor_consent';
        // Also clear previous rejection/postpone notes if any when editing
        finalData.postponedNote = undefined;
        finalData.cancellationReason = undefined;
      }

      // Remove undefined fields for Firestore
      const cleanData: any = { ...finalData };
      Object.keys(cleanData).forEach(key => cleanData[key] === undefined && delete cleanData[key]);

      await updateDoc(slotRef, cleanData);
      addToast({
        type: 'success',
        title: 'Timetable Updated',
        description: 'Class schedule updated successfully.',
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'timetable');
    }
  };

  const addClassRating = async (ratingData: Omit<ClassRating, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const ratingDocId = `${ratingData.slotId}__${ratingData.studentId}`;
      const nowIso = new Date().toISOString();
      const existing = classRatings.find(r => r.slotId === ratingData.slotId && r.studentId === ratingData.studentId);
      const record: ClassRating = {
        ...ratingData,
        id: ratingDocId,
        createdAt: existing?.createdAt || nowIso,
        updatedAt: nowIso,
      };

      await setDoc(doc(db, 'classRatings', ratingDocId), record);
      setClassRatings(prev => {
        const idx = prev.findIndex(r => r.slotId === ratingData.slotId && r.studentId === ratingData.studentId);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = record;
          return updated;
        }
        return [...prev, record];
      });
      addToast({
        type: 'success',
        title: 'Rating Submitted',
        description: 'Thank you for rating your class experience.',
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'classRatings');
    }
  };

  const getTutorRatingStats = (tutorIdOrName: string): TutorRatingStats => {
    if (!tutorIdOrName) {
      return {
        averageRating: 0,
        totalRatings: 0,
        totalClassesRated: 0,
        distribution: {
          5: { count: 0, percent: 0 },
          4: { count: 0, percent: 0 },
          3: { count: 0, percent: 0 },
          2: { count: 0, percent: 0 },
          1: { count: 0, percent: 0 },
        },
        changeVsLastMonth: '+0.0',
      };
    }

    const tutorObj = tutors.find(t => t.id === tutorIdOrName || t.name.toLowerCase() === tutorIdOrName.toLowerCase());
    const tutorId = tutorObj?.id || tutorIdOrName;
    const tutorNameLower = (tutorObj?.name || tutorIdOrName).toLowerCase();

    // Find all timetable slots matching this tutor
    const tutorSlots = timetable.filter(s => 
      s.tutorId === tutorId || 
      (s.tutorName && s.tutorName.toLowerCase() === tutorNameLower)
    );
    const tutorSlotIds = new Set(tutorSlots.map(s => s.id));

    // Find all ratings for this tutor
    const matching = classRatings.filter(r => 
      (r.tutorId && r.tutorId === tutorId) || 
      (r.tutorName && r.tutorName.toLowerCase() === tutorNameLower) ||
      tutorSlotIds.has(r.slotId)
    );

    if (matching.length === 0) {
      return {
        averageRating: 0,
        totalRatings: 0,
        totalClassesRated: 0,
        distribution: {
          5: { count: 0, percent: 0 },
          4: { count: 0, percent: 0 },
          3: { count: 0, percent: 0 },
          2: { count: 0, percent: 0 },
          1: { count: 0, percent: 0 },
        },
        changeVsLastMonth: '+0.0',
      };
    }

    const totalRatings = matching.length;
    const sum = matching.reduce((acc, r) => acc + (Number(r.stars) || 0), 0);
    const averageRating = Number((sum / totalRatings).toFixed(1));
    const totalClassesRated = new Set(matching.map(r => r.slotId)).size;

    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    matching.forEach(r => {
      const s = Math.round(Number(r.stars) || 0);
      if (s >= 1 && s <= 5) {
        counts[s]++;
      }
    });

    const distribution = {
      5: { count: counts[5], percent: Math.round((counts[5] / totalRatings) * 100) },
      4: { count: counts[4], percent: Math.round((counts[4] / totalRatings) * 100) },
      3: { count: counts[3], percent: Math.round((counts[3] / totalRatings) * 100) },
      2: { count: counts[2], percent: Math.round((counts[2] / totalRatings) * 100) },
      1: { count: counts[1], percent: Math.round((counts[1] / totalRatings) * 100) },
    };

    // Calculate month-over-month trend
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentRatings = matching.filter(r => new Date(r.createdAt).getTime() >= thirtyDaysAgo);
    const olderRatings = matching.filter(r => new Date(r.createdAt).getTime() < thirtyDaysAgo);

    let changeVsLastMonth = '+0.2';
    if (olderRatings.length > 0 && recentRatings.length > 0) {
      const recentAvg = recentRatings.reduce((acc, r) => acc + r.stars, 0) / recentRatings.length;
      const olderAvg = olderRatings.reduce((acc, r) => acc + r.stars, 0) / olderRatings.length;
      const diff = Number((recentAvg - olderAvg).toFixed(1));
      changeVsLastMonth = diff >= 0 ? `+${diff}` : `${diff}`;
    }

    return {
      averageRating,
      totalRatings,
      totalClassesRated,
      distribution,
      changeVsLastMonth,
    };
  };

  const getClassRatingStats = (slotId: string): ClassRatingStats => {
    const slotRatings = classRatings.filter(r => r.slotId === slotId);
    if (slotRatings.length === 0) {
      return { averageRating: 0, totalRatings: 0, hasEnoughRatings: false };
    }
    const sum = slotRatings.reduce((acc, r) => acc + (Number(r.stars) || 0), 0);
    const averageRating = Number((sum / slotRatings.length).toFixed(1));
    return {
      averageRating,
      totalRatings: slotRatings.length,
      hasEnoughRatings: slotRatings.length >= 3,
    };
  };

  const updateAttendanceSettings = async (timing: Partial<AttendanceSettings>) => {
    try {
      await setDoc(doc(db, 'settings', 'attendance'), timing, { merge: true });
      setAttendanceSettings((prev) => ({ ...prev, ...timing }));
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'settings/attendance');
    }
  };

  const addResult = async (resultData: Omit<StudentResult, 'id'>) => {
    try {
      const id = `res-${Date.now()}`;
      
      const newResult: StudentResult = {
        ...JSON.parse(JSON.stringify(resultData)),
        id,
      };

      await setDoc(doc(db, 'results', id), newResult);
      addToast({
        type: 'success',
        title: 'Test Score Recorded',
        description: `Report card created for ${resultData.studentName}`,
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'results');
      throw e; // Re-throw to allow component-level handling
    }
  };

  const addCBTQuestion = async (qData: Omit<CBTQuestion, 'id'>) => {
    try {
      const id = `cbt-${Date.now()}`;
      const newQ: CBTQuestion = {
        ...qData,
        id,
      };
      await setDoc(doc(db, 'cbt_questions', id), newQ);
      addToast({
        type: 'success',
        title: 'CBT Question Added',
        description: `Question added under ${qData.subject}`,
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'cbt_questions');
    }
  };

  const recordPayment = async (paymentData: Omit<PaymentRecord, 'id' | 'receiptNumber' | 'date'>) => {
    try {
      const receiptNumber = `REC-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      const id = `pay-${Date.now()}`;
      const newPayment: PaymentRecord = {
        ...paymentData,
        id,
        receiptNumber,
        date: new Date().toISOString().split('T')[0],
      };
      
      // Update local state immediately for snappy real-time feedback
      setPayments(prev => [newPayment, ...prev.filter(p => p.id !== id)]);
      setStudents(prev => prev.map(s => {
        if (s.id === paymentData.studentId) {
          const newPaid = (s.paidAmount || 0) + paymentData.amountPaid;
          const newBalance = Math.max(0, (s.totalFee || 0) - newPaid);
          return {
            ...s,
            paidAmount: newPaid,
            outstandingBalance: newBalance,
            paymentStatus: newBalance <= 0 ? 'Paid' : 'Partial',
          };
        }
        return s;
      }));

      await setDoc(doc(db, 'payments', id), newPayment);

      // Update student record in Firestore
      const student = students.find(s => s.id === paymentData.studentId);
      if (student) {
        const newPaid = (student.paidAmount || 0) + paymentData.amountPaid;
        const newBalance = Math.max(0, (student.totalFee || 0) - newPaid);
        await updateDoc(doc(db, 'students', student.id), {
          paidAmount: newPaid,
          outstandingBalance: newBalance,
          paymentStatus: newBalance <= 0 ? 'Paid' : 'Partial',
        });
      }

      addToast({
        type: 'success',
        title: 'Payment Recorded!',
        description: `Receipt ${receiptNumber} generated for ${paymentData.studentName}.`,
      });
    } catch (e) {
      console.error(e);
      addToast({ type: 'error', title: 'Payment Failed', description: 'Could not sync payment to Firestore.' });
    }
  };

  const login = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(firebaseAuth, provider);
  };

  const logout = async () => {
    await signOut(firebaseAuth);
  };

  // Seed initial data if Firestore is empty (Admin check)
  useEffect(() => {
    if (!isAdmin) return; // Only admins can seed

    const seedData = async () => {
      try {
        // Use a slight delay to ensure network is initialized
        const settingsDoc = await getDoc(doc(db, 'settings', 'global'));
        if (!settingsDoc.exists()) {
          console.log('Seeding initial data to Firestore...');
          await setDoc(doc(db, 'settings', 'global'), INITIAL_SETTINGS);
          
          // Helper to create demo auth users
          const createDemoAuth = async (email: string, pass: string, label: string) => {
            const secondaryApp = initializeApp(firebaseConfigValues, `demo-creation-${label}`);
            const secondaryAuth = getAuth(secondaryApp);
            try {
              await createUserWithEmailAndPassword(secondaryAuth, email, pass);
              console.log(`Demo Auth account created: ${email}`);
            } catch (err: any) {
              if (err.code !== 'auth/email-already-in-use') {
                console.error(`Demo Auth failed for ${email}:`, err);
              }
            } finally {
              await deleteApp(secondaryApp);
            }
          };

          // Create standard demo accounts
          await createDemoAuth('admin@excellencetutorials.ng', 'Admin@123', 'admin');
          await createDemoAuth('tutor@excellencetutorials.ng', 'Tutor@123', 'tutor');
          await createDemoAuth('student@excellencetutorials.ng', 'Student@123', 'student');

          // Seed students
          for (const s of INITIAL_STUDENTS) {
            await setDoc(doc(db, 'students', s.id), s);
          }
          // Seed tutors
          for (const t of INITIAL_TUTORS) {
            await setDoc(doc(db, 'tutors', t.id), { ...t, temporaryPassword: 'Tutor@123', hasChangedPassword: false });
          }
          // Seed admins
          for (const a of INITIAL_ADMINS) {
            await setDoc(doc(db, 'admins', a.id), { ...a, temporaryPassword: 'Admin@123', hasChangedPassword: false });
          }
          // Seed programmes
          for (const p of INITIAL_PROGRAMMES) {
            await setDoc(doc(db, 'programmes', p.id), p);
          }
          console.log('Seeding complete.');
        }
      } catch (e: any) {
        // Suppress noisy offline logs during seeding
        if (e.code !== 'unavailable' && !e.message?.includes('offline')) {
          console.error('Error seeding data:', e);
        }
      }
    };
    seedData();
  }, [isAdmin]);

  const addAnnouncement = async (annData: Omit<Announcement, 'id' | 'date'>) => {
    try {
      const id = `ann-${Date.now()}`;
      const newAnn: Announcement = {
        ...annData,
        id,
        date: new Date().toISOString().split('T')[0],
      };
      await setDoc(doc(db, 'announcements', id), newAnn);
      addToast({
        type: 'success',
        title: 'Announcement Published',
        description: `Broadcast to ${annData.target}`,
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'announcements');
    }
  };

  const deleteAnnouncement = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'announcements', id));
      addToast({
        type: 'info',
        title: 'Announcement Deleted',
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'announcements');
    }
  };

  const addAdmin = async (adminData: Omit<AdminUser, 'id'>) => {
    try {
      let authUid = `adm-user-${Date.now()}`;

      // Create Firebase Auth account for the admin/staff
      if (adminData.temporaryPassword) {
        const secondaryApp = initializeApp(firebaseConfigValues, `admin-creation-${Date.now()}`);
        const secondaryAuth = getAuth(secondaryApp);
        try {
          const cred = await createUserWithEmailAndPassword(secondaryAuth, adminData.email, adminData.temporaryPassword);
          authUid = cred.user.uid;
          console.log(`Auth account created for staff: ${adminData.email} with UID: ${authUid}`);
        } catch (authError: any) {
          console.error('Staff Auth account creation failed:', authError);
          if (authError.code === 'auth/email-already-in-use') {
            throw new Error(`The email "${adminData.email}" is already registered in the system. Please use a different email or update the existing record.`);
          }
          throw authError;
        } finally {
          await deleteApp(secondaryApp);
        }
      }
      
      const newAdmin: AdminUser = {
        ...adminData,
        id: authUid,
      };

      await setDoc(doc(db, 'admins', authUid), newAdmin);
      addToast({
        type: 'success',
        title: 'Staff Member Invited',
        description: `${adminData.name} added as ${adminData.role}`,
      });
    } catch (e: any) {
      console.error(e);
      addToast({ 
        type: 'error', 
        title: 'Invitation Failed', 
        description: e.message || 'Error creating staff record.' 
      });
    }
  };

  const updateAdmin = async (id: string, adminData: Partial<AdminUser>) => {
    try {
      await updateDoc(doc(db, 'admins', id), adminData);
      setAdmins((prev) => prev.map((a) => (a.id === id ? { ...a, ...adminData } : a)));
      if (activeUser && activeUser.id === id) {
        setActiveUser(prev => prev ? { ...prev, ...adminData } : null);
      }
      addToast({
        type: 'success',
        title: 'Admin Profile Updated',
        description: 'Changes saved successfully.',
      });
    } catch (e) {
      console.error(e);
      addToast({ type: 'error', title: 'Update Failed', description: 'Firebase sync error.' });
    }
  };

  const deleteAdmin = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'admins', id));
      setAdmins((prev) => prev.filter((a) => a.id !== id));
      addToast({
        type: 'info',
        title: 'Staff Removed',
        description: 'Staff member removed from system.',
      });
    } catch (e) {
      console.error(e);
      addToast({ type: 'error', title: 'Action Failed', description: 'Firebase delete error.' });
    }
  };

  const toggleAdminSuspend = async (id: string) => {
    try {
      const admin = admins.find((a) => a.id === id);
      if (!admin) return;
      const newStatus = admin.status === 'Suspended' ? 'Active' : 'Suspended';
      await updateDoc(doc(db, 'admins', id), { status: newStatus });
      setAdmins((prev) => prev.map((a) => (a.id === id ? { ...a, status: newStatus } : a)));
      addToast({
        type: 'success',
        title: `Staff ${newStatus === 'Suspended' ? 'Suspended' : 'Reactivated'}`,
        description: `Access for ${admin.name} has been updated.`,
      });
    } catch (e) {
      console.error(e);
      addToast({ type: 'error', title: 'Update Failed', description: 'Firebase permission error.' });
    }
  };

  const logActivity = async (activityData: Omit<ActivityLog, 'id' | 'timeAgo'>) => {
    try {
      const id = `act-${Date.now()}`;
      const newAct: ActivityLog = {
        ...activityData,
        id,
        timeAgo: 'Just now',
      };
      await setDoc(doc(db, 'activities', id), newAct);
    } catch (e) {
      console.error('Failed to log activity:', e);
    }
  };

  return (
    <AppContext.Provider
      value={{
        settings,
        updateSettings,
        resetToDefaults,
        branches,
        addBranch,
        updateBranch,
        cms,
        updateCMS,
        students,
        addStudent,
        updateStudent,
        deleteStudent,
        toggleStudentSuspend,
        admissions,
        submitAdmissionApplication,
        approveAdmission,
        rejectAdmission,
        tutors,
        addTutor,
        updateTutor,
        deleteTutor,
        toggleTutorSuspend,
        subjects,
        addSubject,
        updateSubject,
        deleteSubject,
        classrooms,
        addClassroom,
        updateClassroom,
        deleteClassroom,
        programmes,
        addProgramme,
        updateProgramme,
        timetable,
        addTimetableSlot,
        addMultipleTimetableSlots,
        updateTimetableSlot,
        deleteTimetableSlot,
        consentToTimetableSlot,
        classRatings,
        addClassRating,
        getTutorRatingStats,
        getClassRatingStats,
        studyMaterials,
        addStudyMaterial,
        attendanceSettings,
        updateAttendanceSettings,
        attendanceLogs,
        clockIn,
        clockOut,
        results,
        addResult,
        cbtQuestions,
        addCBTQuestion,
        payments,
        recordPayment,
        announcements,
        addAnnouncement,
        deleteAnnouncement,
        admins,
        addAdmin,
        updateAdmin,
        deleteAdmin,
        toggleAdminSuspend,
        activities,
        logActivity,
        exams,
        viewMode,
        setViewMode,
        adminSection,
        setAdminSection,
        globalSearch,
        setGlobalSearch,
        activeTutor,
        setActiveTutor,
        bgTheme,
        setBgTheme,
        toggleBgTheme,
        activeUser,
        setActiveUser,
        authMethod,
        toasts,
        addToast,
        removeToast,
        selectedStudent,
        setSelectedStudent,
        testimonials,
        addTestimonial,
        deleteTestimonial,
        login,
        logout,
        currentUser: user,
        isAdmin,
        isAuthLoading,
        activeCentreId,
        activeCentre,
        userCentres,
        entitlements,
        seatsSummary,
        hasCheckedActiveCentre,
        enterCentreByCode,
        joinCentreByCode,
        switchCentre,
        refreshSeatsSummary,
        toggleStudentAccess,
        activateStudentMembership
      }}

    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
