import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/layout/Sidebar';
import { TopNav } from './components/layout/TopNav';
import { ToastContainer } from './components/layout/ToastContainer';
import { DashboardOverview } from './components/dashboard/DashboardOverview';
import { StudentsList } from './components/students/StudentsList';
import { AdmissionsManager } from './components/admissions/AdmissionsManager';
import { SubjectsManager } from './components/academics/SubjectsManager';
import { ProgrammesManager } from './components/programmes/ProgrammesManager';
import { FinanceManager } from './components/finance/FinanceManager';
import { TutorsManager } from './components/tutors/TutorsManager';
import { PerformanceManager } from './components/academics/PerformanceManager';
import { CBTManager } from './components/academics/CBTManager';
import { TimetableManager } from './components/academics/TimetableManager';
import { AttendanceTracker } from './components/academics/AttendanceTracker';
import { AnnouncementsManager } from './components/communications/AnnouncementsManager';
import { StudentPortal } from './components/student-portal/StudentPortal';
import { TutorPortal } from './components/tutor-portal/TutorPortal';
import { CmsManager } from './components/cms/CmsManager';
import { StaffRolesManager } from './components/staff/StaffRolesManager';
import { SettingsView } from './components/settings/SettingsView';
import { PublicWebsite } from './components/public/PublicWebsite';
import { TutorialOsLanding } from './components/public/TutorialOsLanding';
import { StudentDetailModal } from './components/modals/StudentDetailModal';
import { OfflineIndicator } from './components/pwa/OfflineIndicator';
import { AuthPortal } from './components/auth/AuthPortal';
import { WelcomeScreen } from './components/auth/WelcomeScreen';
import { TosAdminLogin } from './components/auth/TosAdminLogin';
import { EnterAccessCodeScreen } from './components/auth/EnterAccessCodeScreen';
import { JoinCentreScreen } from './components/auth/JoinCentreScreen';

import { PasswordChangeOverlay } from './components/auth/PasswordChangeOverlay';

const MainLayout: React.FC = () => {
  const { 
    viewMode, 
    setViewMode, 
    adminSection, 
    selectedStudent, 
    bgTheme, 
    isAdmin, 
    currentUser, 
    isAuthLoading, 
    activeUser,
    activeCentreId,
    hasCheckedActiveCentre,
    updateAdmin,
    logout 
  } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  // Platform (TOS) staff sign-in lives on its own door: #tos-admin in the URL.
  const [tosLoginRequested, setTosLoginRequested] = useState(() => window.location.hash.toLowerCase().includes('tos-admin'));
  useEffect(() => {
    const onHashChange = () => setTosLoginRequested(window.location.hash.toLowerCase().includes('tos-admin'));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  const [showPortals, setShowPortals] = useState(false);
  const [accessCodeFlow, setAccessCodeFlow] = useState<'enter' | 'join'>('enter');


  // If user is already logged in, don't show welcome screen
  useEffect(() => {
    if (currentUser) {
      setShowWelcome(false);
    }
  }, [currentUser]);

  const handleAdminPasswordSuccess = async () => {
    if (activeUser) {
      await updateAdmin(activeUser.id, {
        status: 'Active',
        hasChangedPassword: true,
        temporaryPassword: null as any
      });
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (e) {
      console.error(e);
    }
  };

  // Global loading state to prevent auth "flashes"
  if (isAuthLoading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-900 text-white">
        <div className="relative w-24 h-24 mb-8">
          <div className="absolute inset-0 border-4 border-orange-500/20 rounded-full" />
          <div className="absolute inset-0 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <div className="absolute inset-4 bg-orange-500/10 rounded-full flex items-center justify-center">
             <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
          </div>
        </div>
        <div className="space-y-2 text-center">
          <h2 className="text-xl font-black tracking-widest uppercase text-orange-500">Excellence</h2>
          <p className="text-xs text-slate-400 font-medium animate-pulse">Synchronizing academic records...</p>
        </div>
      </div>
    );
  }

  // Landing page flow: the Tutorial OS product landing is the first screen,
  // and the existing role picker stays one click away from it.
  if (!currentUser && tosLoginRequested) {
    return <TosAdminLogin onBack={() => {
      history.replaceState(null, '', window.location.pathname + window.location.search);
      setTosLoginRequested(false);
    }} />;
  }

  if (!currentUser && showWelcome) {
    if (!showPortals) {
      return (
        <TutorialOsLanding
          onAdminSignIn={() => {
            setViewMode('portal');
            setShowWelcome(false);
          }}
          onStudentAccess={() => {
            setViewMode('student');
            setShowWelcome(false);
          }}
          onExplorePortals={() => setShowPortals(true)}
        />
      );
    }
    return <WelcomeScreen onSelectRole={(role) => {
      setViewMode(role === 'admin' ? 'portal' : role);
      setShowWelcome(false);
    }} />;
  }

  // Admin Password Change Guard
  if (isAdmin && activeUser && activeUser.status === 'Invited' && !activeUser.hasChangedPassword) {
    return (
      <PasswordChangeOverlay
        userName={activeUser.name}
        userType="Admin"
        userId={activeUser.id}
        onSuccess={handleAdminPasswordSuccess}
        onLogout={handleLogout}
      />
    );
  }

  // Multi-Tenant Access Code Screen Guard (Part A, point 2 & Part B)
  if (currentUser && !activeCentreId && hasCheckedActiveCentre) {
    if (accessCodeFlow === 'join') {
      return (
        <JoinCentreScreen
          userName={currentUser.displayName || currentUser.email}
          onSuccess={() => {}}
          onSignOut={handleLogout}
          onSwitchToEnterCode={() => setAccessCodeFlow('enter')}
        />
      );
    }

    return (
      <EnterAccessCodeScreen
        userEmail={currentUser.email}
        userName={currentUser.displayName || currentUser.email}
        onSuccess={() => {}}
        onSignOut={handleLogout}
        onSwitchToJoin={() => setAccessCodeFlow('join')}
      />
    );
  }


  // Auth Guards for different portals
  if (viewMode === 'student' && !currentUser && !isAdmin) {
    return (
      <AuthPortal 
        portalType="student"
        title="Excellence Tutorial Centre"
        subtitle=""
        onSuccess={() => {}}
        onBack={() => { setShowPortals(false); setShowWelcome(true); }}
      />
    );
  }

  if ((viewMode === 'portal' || viewMode === 'tutor') && !currentUser && !isAdmin) {
    return (
      <AuthPortal 
        portalType={viewMode === 'tutor' ? 'tutor' : 'admin'}
        title="Excellence Tutorial Centre"
        subtitle=""
        onSuccess={() => {}}
        onBack={() => { setShowPortals(false); setShowWelcome(true); }}
      />
    );
  }

  // If user toggles to the Student Portal view
  if (viewMode === 'student') {
    return (
      <>
        <StudentPortal />
        <OfflineIndicator />
        <ToastContainer />
      </>
    );
  }

  // If user toggles to the Tutor Portal view
  if (viewMode === 'tutor') {
    return (
      <>
        <TutorPortal />
        <OfflineIndicator />
        <ToastContainer />
      </>
    );
  }

  // If user toggles to the Public-facing Website view
  if (viewMode === 'website') {
    return (
      <>
        <PublicWebsite />
        <OfflineIndicator />
        <ToastContainer />
      </>
    );
  }

  // Admin Portal Dashboard matching video layout and Geometric Balance theme
  return (
    <div
      id="app-root-layout"
      className={`flex h-screen w-full ${
        bgTheme === 'dark' ? 'bg-[#0B1120]' : 'bg-[#F8FAFC]'
      } text-slate-900 font-sans overflow-hidden transition-colors duration-300`}
    >
      {/* Left Navigation Sidebar (#070F1E) */}
      <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top Header Bar */}
        <TopNav onToggleMobileMenu={() => setMobileOpen(true)} />

        {/* Dynamic Admin Section View */}
        <main
          id="app-main-content"
          className={`flex-1 overflow-y-auto ${
            bgTheme === 'dark' ? 'bg-[#0B1120] dark-bg-mode' : 'bg-[#F8FAFC]'
          } transition-colors duration-300`}
        >
          <div className="pb-12">
            {(adminSection === 'dashboard' || adminSection === 'overview') && <DashboardOverview />}
            {adminSection === 'students' && <StudentsList />}
            {adminSection === 'subjects' && <SubjectsManager />}
            {adminSection === 'admissions' && <AdmissionsManager />}
            {adminSection === 'tutors' && <TutorsManager />}
            {adminSection === 'programmes' && <ProgrammesManager />}
            {adminSection === 'cbt' && <CBTManager />}
            {adminSection === 'timetable' && <TimetableManager />}
            {adminSection === 'attendance' && <AttendanceTracker />}
            {adminSection === 'results' && <PerformanceManager />}
            {adminSection === 'announcements' && <AnnouncementsManager />}
            {adminSection === 'student-portal' && <StudentPortal />}
            {adminSection === 'tutor-portal' && <TutorPortal />}
            {(adminSection === 'finance' || adminSection === 'payments') && <FinanceManager />}
            {(adminSection === 'account' || adminSection === 'staff-roles') && <StaffRolesManager />}
            {adminSection === 'settings' && <SettingsView />}
            {(adminSection === 'cms' || adminSection === 'cms-editor') && <CmsManager />}
          </div>
        </main>
      </div>

      {/* Global Modals & Notifications */}
      {selectedStudent && <StudentDetailModal />}
      <OfflineIndicator />
      <ToastContainer />
    </div>
  );
};

import { FirebaseProvider } from './context/FirebaseContext';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<any, any> {
  public state: any = {
    hasError: false,
    error: null
  };

  static getDerivedStateFromError(error: any): any {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
          <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mb-4">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Something went wrong</h2>
          <p className="text-slate-500 text-sm max-w-md mb-6">
            The application encountered an unexpected error. This has been logged for our engineers.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-all"
          >
            Reload Application
          </button>
          {import.meta.env.DEV && (
            <pre className="mt-8 p-4 bg-slate-100 rounded-lg text-left text-[10px] text-rose-600 overflow-auto max-w-full">
              {this.state.error?.toString()}
            </pre>
          )}
        </div>
      );
    }

    return (this as any).props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <FirebaseProvider>
        <AppProvider>
          <MainLayout />
        </AppProvider>
      </FirebaseProvider>
    </ErrorBoundary>
  );
}
