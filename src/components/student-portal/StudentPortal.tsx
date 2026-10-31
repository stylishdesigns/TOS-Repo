import { loadLastGood, loadLastGoodFlag, saveLastGoodFlag } from '../../lib/lastGood';
import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { useFirebase } from '../../context/FirebaseContext';
import { db } from '../../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { StudentLogin } from './StudentLogin';
import { StudentOnboarding } from './StudentOnboarding';
import { HomeTab } from './tabs/HomeTab';
import { ClassesTabWrapper } from './tabs/ClassesTabWrapper';
import { ChatTab } from './tabs/ChatTab';
import { CbtTabWrapper } from './tabs/CbtTabWrapper';
import { MoreTab } from './tabs/MoreTab';
import { ActionSheetModal, ActionSheetItem } from './tabs/ActionSheetModal';
import { StudentResult } from '../../types';
import { PWAInstallButton } from '../pwa/PWAInstallButton';
import regeneratedStudentAvatar from '../../assets/images/regenerated_image_1789369642757.jpg';
import {
  Home,
  Calendar,
  Laptop,
  Menu,
  ShieldCheck,
  MessageSquare,
  FileText,
  Sparkles,
} from 'lucide-react';

import { orbBadgeLabel, totalUnread } from './tabs/chatNav';

// Phase 1 chat orb icon: bubble with a plus and a small sparkle (design spec).
const ChatOrbIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 32 32"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth={2.2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 14.5C5 9.8 9.4 6 14.8 6h2.4C22.6 6 27 9.8 27 14.5S22.6 23 17.2 23h-2.6L9 27v-4.6C6.6 21 5 18 5 14.5z" />
    <path d="M16 11.5v6M13 14.5h6" />
    <path d="M27 1.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" fill="currentColor" stroke="none" />
  </svg>
);

export type TabType = 'home' | 'classes' | 'chat' | 'cbt' | 'results' | 'more';

export const StudentPortal: React.FC = () => {
  const { students, settings, isAdmin, attendanceSettings, attendanceLogs, entitlements, centreName } = useApp();

  const { user, loading: authLoading } = useFirebase();
  const [profileLoading, setProfileLoading] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const [, setOnboardingComplete] = useState(false);
  const [portalMode, setPortalMode] = useState<'student' | 'parent'>('student');
  const [desktopViewMode] = useState<'mobile_frame' | 'expanded'>('mobile_frame');
  const [hideBottomNav, setHideBottomNav] = useState(false);
  // Orb badge: seeded from the chat overview's last good copy (no new reads);
  // ChatTab reports each fresh total through onUnreadTotal after its loads.
  const [orbUnread, setOrbUnread] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let unsubscribe: () => void;

    const checkProfile = () => {
      if (user) {
        // A saved "profile exists" flag for this account lets the portal open
        // straight away on later visits; the live snapshot still confirms or
        // corrects it behind the scenes.
        if (loadLastGoodFlag(`hasProfile:${user.uid}`)) {
          setHasProfile(true);
          setProfileLoading(false);
        }
        const docRef = doc(db, 'students', user.uid);
        unsubscribe = onSnapshot(
          docRef,
          (docSnap) => {
            saveLastGoodFlag(`hasProfile:${user.uid}`, docSnap.exists());
            setHasProfile(docSnap.exists());
            setProfileLoading(false);
          },
          (error) => {
            console.error('Profile check error:', error);
            setProfileLoading(false);
          }
        );
      } else {
        setProfileLoading(false);
      }
    };

    if (!authLoading) {
      checkProfile();
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user, authLoading]);

  // Session-remembered sub-pages
  const [classesSubPage, setClassesSubPage] = useState<'timetable' | 'assessment'>(() => {
    try {
      const saved = sessionStorage.getItem('EXCELLENCE_student_classes_subpage');
      return saved === 'assessment' ? 'assessment' : 'timetable';
    } catch {
      return 'timetable';
    }
  });

  const [assessmentView, setAssessmentView] = useState<'assessments' | 'performance'>('assessments');

  const [cbtSubPage, setCbtSubPage] = useState<'mock' | 'practice'>(() => {
    try {
      const saved = sessionStorage.getItem('EXCELLENCE_student_cbt_subpage');
      return saved === 'practice' ? 'practice' : 'mock';
    } catch {
      return 'mock';
    }
  });

  const [mockView, setMockView] = useState<'mock' | 'leaderboard'>('mock');
  const [practiceView, setPracticeView] = useState<'practice' | 'analytics'>('practice');

  // Sheet opening state (tapping nav item opens sheet)
  const [isClassesSheetOpen, setIsClassesSheetOpen] = useState(false);
  const [isCbtSheetOpen, setIsCbtSheetOpen] = useState(false);

  // Parse initial tab & subpage from hash
  const parseInitialHash = (): TabType => {
    try {
      const hash = window.location.hash.toLowerCase();
      if (hash.startsWith('#student/')) {
        const path = hash.replace('#student/', '');
        const segments = path.split('/').filter(Boolean);
        const primary = segments[0];
        const sub = segments[1];

        if (primary === 'results' || primary === 'performance') {
          setClassesSubPage('assessment');
          setAssessmentView('performance');
          try {
            sessionStorage.setItem('EXCELLENCE_student_classes_subpage', 'assessment');
          } catch {}
          return 'classes';
        }

        if (primary === 'classes') {
          if (sub === 'assessment') {
            setClassesSubPage('assessment');
            try {
              sessionStorage.setItem('EXCELLENCE_student_classes_subpage', 'assessment');
            } catch {}
            if (segments[2] === 'performance') {
              setAssessmentView('performance');
            }
          } else if (sub === 'timetable') {
            setClassesSubPage('timetable');
            try {
              sessionStorage.setItem('EXCELLENCE_student_classes_subpage', 'timetable');
            } catch {}
          }
          return 'classes';
        }

        if (primary === 'cbt') {
          if (sub === 'practice') {
            setCbtSubPage('practice');
            try {
              sessionStorage.setItem('EXCELLENCE_student_cbt_subpage', 'practice');
            } catch {}
          } else if (sub === 'mock') {
            setCbtSubPage('mock');
            try {
              sessionStorage.setItem('EXCELLENCE_student_cbt_subpage', 'mock');
            } catch {}
          }
          return 'cbt';
        }

        if (primary === 'chat') return 'chat';
        if (primary === 'home') return 'home';
        if (primary === 'more') return 'more';
      }
    } catch {}
    return 'home';
  };

  const [activeTab, setActiveTabState] = useState<TabType>(parseInitialHash);
  const [cbtSubjectFilter, setCbtSubjectFilter] = useState<string | undefined>(undefined);
  const [cbtReviewTarget, setCbtReviewTarget] = useState<{
    result: StudentResult;
    source: 'performance_assessment';
  } | null>(null);
  const [returnToAssessmentResult, setReturnToAssessmentResult] = useState<StudentResult | null>(null);

  const setActiveTab = (tab: TabType) => {
    if (tab === 'results') {
      setActiveTabState('classes');
      setClassesSubPage('assessment');
      setAssessmentView('performance');
      try {
        sessionStorage.setItem('EXCELLENCE_student_classes_subpage', 'assessment');
        localStorage.setItem('EXCELLENCE_TUTORIAL_DATA_V1_studentTab', 'classes');
        window.location.hash = 'student/classes';
      } catch (e) {
        console.error(e);
      }
      return;
    }

    setActiveTabState(tab);
    try {
      localStorage.setItem('EXCELLENCE_TUTORIAL_DATA_V1_studentTab', tab);
      window.location.hash = `student/${tab}`;
    } catch (e) {
      console.error(e);
    }
  };

  // Sync tab with URL hash on mount and hash changes
  useEffect(() => {
    const handleHash = () => {
      const currentHash = window.location.hash.toLowerCase();
      if (currentHash.startsWith('#student/')) {
        const path = currentHash.replace('#student/', '');
        const segments = path.split('/').filter(Boolean);
        const primary = segments[0];
        const sub = segments[1];

        if (primary === 'results' || primary === 'performance') {
          setActiveTabState('classes');
          setClassesSubPage('assessment');
          setAssessmentView('performance');
          try {
            sessionStorage.setItem('EXCELLENCE_student_classes_subpage', 'assessment');
          } catch {}
          return;
        }

        if (primary === 'classes') {
          setActiveTabState('classes');
          if (sub === 'assessment') {
            setClassesSubPage('assessment');
            if (segments[2] === 'performance') {
              setAssessmentView('performance');
            }
          } else if (sub === 'timetable') {
            setClassesSubPage('timetable');
          } else {
            // No sub-segment: remember session's choice or default timetable
            const saved = sessionStorage.getItem('EXCELLENCE_student_classes_subpage');
            if (saved === 'assessment' || saved === 'timetable') {
              setClassesSubPage(saved);
            } else {
              setClassesSubPage('timetable');
            }
          }
          return;
        }

        if (primary === 'cbt') {
          setActiveTabState('cbt');
          if (sub === 'practice') {
            setCbtSubPage('practice');
          } else if (sub === 'mock') {
            setCbtSubPage('mock');
          } else {
            const saved = sessionStorage.getItem('EXCELLENCE_student_cbt_subpage');
            if (saved === 'practice' || saved === 'mock') {
              setCbtSubPage(saved);
            } else {
              setCbtSubPage('mock');
            }
          }
          return;
        }

        if (['home', 'chat', 'more'].includes(primary)) {
          setActiveTabState(primary as TabType);
        }
      } else if (currentHash === '#student' || !currentHash) {
        window.location.hash = `student/${activeTab}`;
      }
    };

    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, [activeTab]);

  // Bottom navigation handlers: Classes and CBT open bottom sheet
  const handleNavClassesClick = () => {
    if (hideBottomNav) return;
    setIsClassesSheetOpen(true);
  };

  const handleNavCbtClick = () => {
    if (hideBottomNav) return;
    setIsCbtSheetOpen(true);
  };

  // Classes Sheet Items (2 big rows)
  const classesSheetItems: ActionSheetItem[] = [
    {
      id: 'timetable',
      title: 'Timetable',
      subtitle: 'Your classes for the week',
      badge: 'Schedule',
      icon: <Calendar className="w-5 h-5 text-[#C2410C]" />,
      iconBg: 'bg-orange-50 border border-orange-100',
      onClick: () => {
        setClassesSubPage('timetable');
        try {
          sessionStorage.setItem('EXCELLENCE_student_classes_subpage', 'timetable');
        } catch {}
        setActiveTab('classes');
      },
    },
    {
      id: 'assessment',
      title: 'Assessment',
      subtitle: 'Tests set by your tutors & performance',
      badge: 'Tests & Scores',
      icon: <FileText className="w-5 h-5 text-[#C2410C]" />,
      iconBg: 'bg-orange-50 border border-orange-100',
      onClick: () => {
        setClassesSubPage('assessment');
        setAssessmentView('assessments');
        try {
          sessionStorage.setItem('EXCELLENCE_student_classes_subpage', 'assessment');
        } catch {}
        setActiveTab('classes');
      },
    },
  ];

  // CBT Sheet Items (2 big rows)
  const cbtSheetItems: ActionSheetItem[] = [
    {
      id: 'practice',
      title: 'CBT Practice',
      subtitle: 'Untimed practice, no pressure',
      badge: 'Self-Paced',
      icon: <Sparkles className="w-5 h-5 text-[#C2410C]" />,
      iconBg: 'bg-orange-50 border border-orange-100',
      onClick: () => {
        setCbtSubPage('practice');
        try {
          sessionStorage.setItem('EXCELLENCE_student_cbt_subpage', 'practice');
        } catch {}
        setActiveTab('cbt');
      },
    },
    {
      id: 'mock',
      title: 'CBT Mock',
      subtitle: 'Timed mock exams under real conditions',
      badge: 'Timed Exam',
      icon: <Laptop className="w-5 h-5 text-[#C2410C]" />,
      iconBg: 'bg-orange-50 border border-orange-100',
      onClick: () => {
        setCbtSubPage('mock');
        try {
          sessionStorage.setItem('EXCELLENCE_student_cbt_subpage', 'mock');
        } catch {}
        setActiveTab('cbt');
      },
    },
  ];

  if (!isAdmin && (authLoading || profileLoading)) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin && !user) {
    return <StudentLogin onSuccess={() => {}} />;
  }

  if (!isAdmin && !hasProfile) {
    return <StudentOnboarding onComplete={() => setOnboardingComplete(true)} />;
  }

  const MALE_NIGERIAN_AVATAR =
    regeneratedStudentAvatar ||
    'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=500&q=80';
  const FEMALE_NIGERIAN_AVATAR =
    'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=500&q=80';

  const rawStudent = user
    ? students.find((s) => s.uid === user.uid || s.email === user.email) || students[0]
    : students[0];
  const activeStudent = rawStudent
    ? {
        ...rawStudent,
        avatar:
          rawStudent.avatar &&
          !rawStudent.avatar.includes('photo-1534528741775') &&
          !rawStudent.avatar.includes('photo-1517841905240')
            ? rawStudent.avatar
            : rawStudent.gender === 'Female'
            ? FEMALE_NIGERIAN_AVATAR
            : MALE_NIGERIAN_AVATAR,
      }
    : {
        id: 'stu-1',
        regNumber: 'EXC-2026-00421',
        name: 'John Ade',
        avatar: MALE_NIGERIAN_AVATAR,
        programmeName: 'JAMB / UTME 2027 Intensive',
        attendancePercent: 92,
        totalFee: 50000,
        paidAmount: 50000,
        outstandingBalance: 0,
      };

  // Late detection logic for header animation
  const parseTime = (timeStr: string) => {
    if (!timeStr) return 0;
    const [time, modifier] = timeStr.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const todayLog = attendanceLogs.find(
    (l) => l.studentId === activeStudent.id && l.date === todayStr
  );
  // Seed the orb badge from this student's last good chat overview.
  useEffect(() => {
    if (!activeStudent) return;
    const cached = loadLastGood<{ groups?: { unread?: number; locked?: boolean }[] }>(
      `chat:overview:${activeStudent.id}`,
    );
    if (cached?.groups) setOrbUnread(totalUnread(cached.groups));
  }, [activeStudent?.id]);

  const orbBadgeText = orbBadgeLabel(orbUnread);

  const lateMinutesThreshold = parseTime(attendanceSettings.lateArrivalTime || '08:30 AM');
  const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
  const isRunningLate = !todayLog?.clockInAt && currentMinutes > lateMinutesThreshold;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between selection:bg-orange-500 selection:text-white">
      {/* 1. Top Desktop Control Bar */}
      <header className="bg-slate-950 text-white px-4 py-3 z-40 sticky top-0 overflow-hidden shadow-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 relative">
          {/* Brand / Tutorial App Name */}
          <div className="flex items-center space-x-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse shrink-0 shadow-sm shadow-orange-500" />
            <span className="font-black text-sm uppercase tracking-[0.2em]">
              {centreName}
            </span>
          </div>

          {/* Late Notification Animation */}
          {isRunningLate && (
            <div
              onClick={() => setActiveTab('home')}
              className="absolute left-1/2 -translate-x-1/2 top-full bg-rose-600 px-4 py-2 rounded-b-2xl shadow-xl border border-white/10 animate-in slide-in-from-top-full duration-700 cursor-pointer flex items-center space-x-2 group active:scale-95"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
              <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap">
                You are Running Late! Clock In Now
              </span>
            </div>
          )}

          {/* PWA Icon Button beside banner */}
          <div className="flex items-center">
            <PWAInstallButton
              variant="icon"
              className="!bg-white/10 !border-white/10 hover:!bg-white/20"
            />
          </div>
        </div>
      </header>

      {/* 2. Main Body: Phone Shell Container */}
      <main className="flex-1 flex items-center justify-center p-0 sm:py-6 sm:px-4">
        <div
          className={`w-full transition-all duration-300 ${
            desktopViewMode === 'mobile_frame'
              ? 'max-w-md mx-auto sm:rounded-[36px] sm:shadow-2xl sm:border-[6px] sm:border-slate-800'
              : 'max-w-4xl mx-auto sm:rounded-3xl sm:border sm:border-slate-800'
          } bg-slate-50 min-h-screen sm:min-h-[844px] flex flex-col relative overflow-hidden`}
        >
          {/* Parent Mode Indicator Notification if active */}
          {portalMode === 'parent' && (
            <div className="bg-blue-600 text-white px-4 py-2 text-xs font-bold flex items-center justify-between shrink-0 shadow-xs">
              <div className="flex items-center space-x-1.5">
                <ShieldCheck className="w-4 h-4" />
                <span>Parent Oversight Mode: Monitoring {activeStudent.name}</span>
              </div>
              <button
                onClick={() => setPortalMode('student')}
                className="underline text-[11px] opacity-90 hover:opacity-100 cursor-pointer"
              >
                Switch to Student
              </button>
            </div>
          )}

          {/* Scrollable Tab Content Container */}
          <div className="flex-1 overflow-y-auto pb-24 relative">
            {activeTab === 'home' && (
              <HomeTab
                student={activeStudent}
                onNavigateTab={(tab) => {
                  if (tab === 'profile' || tab === 'more') {
                    setActiveTab('more');
                  } else if (tab === 'results' || tab === 'performance') {
                    setClassesSubPage('assessment');
                    setAssessmentView('performance');
                    try {
                      sessionStorage.setItem('EXCELLENCE_student_classes_subpage', 'assessment');
                    } catch {}
                    setActiveTab('classes');
                  } else if (tab === 'cbt') {
                    setCbtSubPage('mock');
                    setMockView('mock');
                    try {
                      sessionStorage.setItem('EXCELLENCE_student_cbt_subpage', 'mock');
                    } catch {}
                    setActiveTab('cbt');
                  } else {
                    setActiveTab(tab as TabType);
                  }
                }}
              />
            )}

            {activeTab === 'classes' && (
              <ClassesTabWrapper
                student={activeStudent}
                subPage={classesSubPage}
                onSubPageChange={(sp) => {
                  setClassesSubPage(sp);
                  try {
                    sessionStorage.setItem('EXCELLENCE_student_classes_subpage', sp);
                  } catch {}
                }}
                assessmentView={assessmentView}
                onAssessmentViewChange={setAssessmentView}
                onHideBottomNav={setHideBottomNav}
                cbtSubjectFilter={cbtSubjectFilter}
                cbtReviewTarget={cbtReviewTarget}
                returnToAssessmentResult={returnToAssessmentResult}
                onReviewAnswers={(res) => {
                  setCbtReviewTarget({ result: res, source: 'performance_assessment' });
                  setReturnToAssessmentResult(res);
                  setAssessmentView('assessments');
                }}
                onExitReview={() => {
                  if (cbtReviewTarget?.source === 'performance_assessment') {
                    setCbtReviewTarget(null);
                    setAssessmentView('performance');
                  }
                }}
                onNavigateTab={(tab, filterSubject) => {
                  if (filterSubject) {
                    setCbtSubjectFilter(filterSubject);
                  }
                  if (tab === 'cbt') {
                    setCbtSubPage('mock');
                    setActiveTab('cbt');
                  } else {
                    setActiveTab(tab as TabType);
                  }
                }}
              />
            )}

            {activeTab === 'chat' && (
              <ChatTab
                student={activeStudent}
                onGoToProfile={() => setActiveTab('more')}
                onGoToPractice={() => setActiveTab('cbt')}
                onHideBottomNav={setHideBottomNav}
                onUnreadTotal={setOrbUnread}
              />
            )}

            {activeTab === 'cbt' && (
              <CbtTabWrapper
                student={activeStudent}
                onGoToProfile={() => setActiveTab('more')}
                subPage={cbtSubPage}
                onSubPageChange={(sp) => {
                  setCbtSubPage(sp);
                  try {
                    sessionStorage.setItem('EXCELLENCE_student_cbt_subpage', sp);
                  } catch {}
                }}
                mockView={mockView}
                onMockViewChange={setMockView}
                practiceView={practiceView}
                onPracticeViewChange={setPracticeView}
                onHideBottomNav={setHideBottomNav}
                cbtSubjectFilter={cbtSubjectFilter}
                cbtReviewTarget={cbtReviewTarget}
                onExitReview={() => {
                  setCbtReviewTarget(null);
                }}
              />
            )}

            {activeTab === 'results' && (
              /* Fallback redirect rendering in case activeTab ever equals 'results' */
              <ClassesTabWrapper
                student={activeStudent}
                subPage="assessment"
                onSubPageChange={(sp) => {
                  setClassesSubPage(sp);
                  try {
                    sessionStorage.setItem('EXCELLENCE_student_classes_subpage', sp);
                  } catch {}
                }}
                assessmentView="performance"
                onAssessmentViewChange={setAssessmentView}
                onHideBottomNav={setHideBottomNav}
                cbtSubjectFilter={cbtSubjectFilter}
                cbtReviewTarget={cbtReviewTarget}
                returnToAssessmentResult={returnToAssessmentResult}
                onReviewAnswers={(res) => {
                  setCbtReviewTarget({ result: res, source: 'performance_assessment' });
                  setReturnToAssessmentResult(res);
                  setAssessmentView('assessments');
                }}
                onExitReview={() => {
                  setCbtReviewTarget(null);
                  setAssessmentView('performance');
                }}
                onNavigateTab={(tab, filterSubject) => {
                  if (filterSubject) setCbtSubjectFilter(filterSubject);
                  setActiveTab(tab as TabType);
                }}
              />
            )}

            {activeTab === 'more' && <MoreTab student={activeStudent} />}
          </div>

          {/* 3. Persistent Mobile Bottom Navigation Bar (5 Items: Home · Classes · Chat · CBT · More) */}
          {!hideBottomNav && (
            <nav
              aria-label="Student Mobile Navigation"
              className="fixed bottom-0 left-0 right-0 sm:absolute z-40 bg-slate-950/95 backdrop-blur-md border-t border-slate-800 py-1.5 px-2 shadow-2xl"
            >
              <div className="max-w-md mx-auto grid grid-cols-5 gap-1 items-center">
                {/* 1: Home */}
                <button
                  type="button"
                  onClick={() => setActiveTab('home')}
                  className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-2xl transition-all cursor-pointer ${
                    activeTab === 'home'
                      ? 'text-orange-400 font-black'
                      : 'text-slate-400 hover:text-slate-200 font-semibold'
                  }`}
                >
                  <div
                    className={`p-1 rounded-xl transition-all ${
                      activeTab === 'home' ? 'bg-orange-500/20 text-orange-400' : ''
                    }`}
                  >
                    <Home className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] mt-0.5 tracking-tight">Home</span>
                </button>

                {/* 2: Classes (opens bottom sheet) */}
                <button
                  type="button"
                  onClick={handleNavClassesClick}
                  className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-2xl transition-all cursor-pointer ${
                    activeTab === 'classes'
                      ? 'text-orange-400 font-black'
                      : 'text-slate-400 hover:text-slate-200 font-semibold'
                  }`}
                >
                  <div
                    className={`p-1 rounded-xl transition-all ${
                      activeTab === 'classes' ? 'bg-orange-500/20 text-orange-400' : ''
                    }`}
                  >
                    <Calendar className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] mt-0.5 tracking-tight">Classes</span>
                </button>

                                {/* 3: Chat orb (rendered only if entitled, Phase 1 A). The orb
                    floats above this slot, centred on the bar's top edge;
                    the empty cell keeps the 5-column rhythm. */}
                {entitlements?.chat && <div aria-hidden="true" />}


                {/* 4: CBT (opens bottom sheet) */}
                <button
                  type="button"
                  onClick={handleNavCbtClick}
                  className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-2xl transition-all cursor-pointer ${
                    activeTab === 'cbt'
                      ? 'text-orange-400 font-black'
                      : 'text-slate-400 hover:text-slate-200 font-semibold'
                  }`}
                >
                  <div
                    className={`p-1 rounded-xl transition-all ${
                      activeTab === 'cbt' ? 'bg-orange-500/20 text-orange-400' : ''
                    }`}
                  >
                    <Laptop className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] mt-0.5 tracking-tight">CBT</span>
                </button>

                {/* 5: More */}
                <button
                  type="button"
                  onClick={() => setActiveTab('more')}
                  className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-2xl transition-all cursor-pointer ${
                    activeTab === 'more'
                      ? 'text-orange-400 font-black'
                      : 'text-slate-400 hover:text-slate-200 font-semibold'
                  }`}
                >
                  <div
                    className={`p-1 rounded-xl transition-all ${
                      activeTab === 'more' ? 'bg-orange-500/20 text-orange-400' : ''
                    }`}
                  >
                    <Menu className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] mt-0.5 tracking-tight">More</span>
                </button>
              </div>
              {entitlements?.chat && (
                <button
                  type="button"
                  onClick={() => setActiveTab('chat')}
                  aria-label={`Open chat menu, ${orbUnread} unread`}
                  className="absolute left-1/2 top-0 z-50 -translate-x-1/2 -translate-y-1/2 rounded-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/70"
                  style={{
                    width: 62,
                    height: 62,
                    background: 'linear-gradient(145deg, #EA580C, #9A3412)',
                    border: '4px solid #020617',
                    boxShadow: '0 0 0 5px rgba(234,88,12,.22), 0 10px 24px rgba(234,88,12,.5), inset 0 2px 0 rgba(255,255,255,.35)',
                  }}
                >
                  <ChatOrbIcon className="w-8 h-8" />
                  {orbBadgeText && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[22px] h-[22px] px-1 rounded-full bg-white text-[#EA580C] text-[11px] font-black flex items-center justify-center border border-orange-200 shadow-sm">
                      {orbBadgeText}
                    </span>
                  )}
                </button>
              )}
            </nav>
          )}

          {/* Classes Bottom Sheet */}
          <ActionSheetModal
            isOpen={isClassesSheetOpen && !hideBottomNav}
            onClose={() => setIsClassesSheetOpen(false)}
            title="Classes"
            description="Choose a classes section"
            items={classesSheetItems}
          />

          {/* CBT Bottom Sheet */}
          <ActionSheetModal
            isOpen={isCbtSheetOpen && !hideBottomNav}
            onClose={() => setIsCbtSheetOpen(false)}
            title="CBT"
            description="Choose a testing mode"
            items={cbtSheetItems}
          />
        </div>
      </main>
    </div>
  );
};
