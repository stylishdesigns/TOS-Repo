import React, { useRef,  useState, useEffect, Component, ErrorInfo, ReactNode, lazy, Suspense } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/layout/Sidebar';
import { TopNav } from './components/layout/TopNav';
import { ToastContainer } from './components/layout/ToastContainer';
import { PublicWebsite } from './components/public/PublicWebsite';
import { TutorialOsLanding } from './components/public/TutorialOsLanding';
import { OfflineIndicator } from './components/pwa/OfflineIndicator';
import { AuthPortal } from './components/auth/AuthPortal';
import { WelcomeScreen } from './components/auth/WelcomeScreen';
import { TosAdminLogin } from './components/auth/TosAdminLogin';
import { FirstLoginPasswordChange } from './components/auth/FirstLoginPasswordChange';
import { EnterAccessCodeScreen } from './components/auth/EnterAccessCodeScreen';
import { CentreCodeGate } from './components/auth/CentreCodeGate';
import { JoinCentreScreen } from './components/auth/JoinCentreScreen';

import { PasswordChangeOverlay } from './components/auth/PasswordChangeOverlay';
import { getAuth } from 'firebase/auth';
import { AlertCircle, ShieldCheck } from 'lucide-react';

// The #tos door shows nothing to anyone who is not platform staff.
const TosNotFound: React.FC = () => (
  <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center text-center p-6">
    <p className="text-6xl font-black text-slate-800 mb-3">404</p>
    <p className="text-slate-400 text-sm">There is nothing here.</p>
  </div>
);

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
    centreName,
    activeCentre,
    hasCheckedActiveCentre,
    enterCentreByCode,
    enterSoleCentre,
    fetchMyCentreIds,
    addToast,
    updateAdmin,
    logout 
  } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  // Platform (TOS) staff sign-in lives on its own door: #tos-admin in the URL.
  // #centre is the matching door back into the tenant (centre) app.
  const [tosLoginRequested, setTosLoginRequested] = useState(() => /^#tos(-admin)?$/.test(window.location.hash.toLowerCase()));
  const [centreAppRequested, setCentreAppRequested] = useState(() => /^#centre(-admin)?$/.test(window.location.hash.toLowerCase()));
  useEffect(() => {
    const onHashChange = () => {
      setTosLoginRequested(/^#tos(-admin)?$/.test(window.location.hash.toLowerCase()));
      setCentreAppRequested(/^#centre(-admin)?$/.test(window.location.hash.toLowerCase()));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  const [showPortals, setShowPortals] = useState(false);
  const [accessCodeFlow, setAccessCodeFlow] = useState<'enter' | 'join'>('join');
  // Centre code gate (pre-login): the access code is a centre selector, not a
  // secret. The first screen asks for the code, shows the centre's name, and
  // the selected centre's login page follows; after sign-in the app enters
  // that centre automatically.
  const [pendingCentre, setPendingCentre] = useState<{ code: string; centreName: string; centreId?: string } | null>(null);
  const [loginCentreError, setLoginCentreError] = useState<string | null>(null);
  // Post-login centre resolution is silent: no code screen sits between the
  // login page and the dashboard. The centre chosen before login is entered
  // automatically; a user with no chosen centre who belongs to exactly one
  // centre enters it the same way. Only a user with no centre sees the join
  // screen, and only while nothing can be resolved.
  const [centreEntryBusy, setCentreEntryBusy] = useState(false);
  // The join/enter screens render only after a resolution attempt has
  // demonstrably failed. Until then the resolving screen holds, so no code
  // prompt can flash or stand between the login page and the dashboard.
  const [centreEntryFailed, setCentreEntryFailed] = useState(false);
  // Whitelabel splash: after the account is confirmed to belong to the chosen
  // centre, the centre's own loading screen plays briefly before the
  // dashboard opens.
  const [centreSplash, setCentreSplash] = useState(false);
  // The login page's email/password live here so they survive every screen
  // swap on the way to a verdict (verification, the no-account popup, the
  // centre loading screen). They clear once the account is inside a centre.
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  useEffect(() => {
    if (activeCentreId) {
      setLoginEmail('');
      setLoginPassword('');
    }
  }, [activeCentreId]);
  const centreEntryKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentUser || !hasCheckedActiveCentre) return;
    if (activeCentreId) {
      setCentreEntryBusy(false);
      setCentreEntryFailed(false);
      return;
    }
    const key = pendingCentre ? `code:${pendingCentre.code}` : 'auto';
    if (centreEntryKeyRef.current === key) return;
    centreEntryKeyRef.current = key;
    setCentreEntryFailed(false);
    setCentreEntryBusy(true);
    const work = pendingCentre ? enterCentreByCode(pendingCentre.code) : enterSoleCentre();
    work
      .then((r: any) => {
        const ok = pendingCentre ? !!(r && r.success) : !!(r && r.entered);
        if (!ok) {
          setCentreEntryFailed(true);
          return;
        }
        // Belonging is confirmed: play the centre's own loading screen
        // briefly before the dashboard opens.
        setCentreSplash(true);
        window.setTimeout(() => setCentreSplash(false), 1200);
      })
      .catch(async (err: any) => {
        // A failed automatic entry is never silent: the server's reason (a
        // temporary lockout, a membership mismatch) shows as a message, so the
        // join screen never appears without an explanation.
        //
        // Strict centre login: when the signed-in account does not belong to
        // the centre chosen before login, sign the user back out and say so on
        // the login page, with the student sign-up route. Only students
        // self-register; centre staff are provisioned by each centre's super
        // admin, so there is no staff sign-up.
        // The "no account" message shows only when the server itself confirms
        // the signed-in account holds no active membership in the chosen
        // centre. Other failures (too many attempts, centre suspended or the
        // membership not active yet, a server error) keep the session and show
        // the server's own reason in the toast below, never "no account".
        if (pendingCentre?.centreId && (!err?.status || err.status === 400)) {
          try {
            const myIds = await fetchMyCentreIds();
            if (!myIds.includes(pendingCentre.centreId)) {
              centreEntryKeyRef.current = null;
              await logout();
              setShowWelcome(false);
              setLoginCentreError(
                `No account can be found with these login details for ${pendingCentre.centreName}. If you are a student, sign up below.`
              );
              return;
            }
          } catch {
            /* The membership check could not run: keep the generic path. */
          }
        }
        setCentreEntryFailed(true);
        addToast({
          type: 'error',
          title: 'Centre entry failed',
          description: err?.message || 'Your centre could not be opened automatically.',
        });
      })
      .finally(() => setCentreEntryBusy(false));
  }, [currentUser, hasCheckedActiveCentre, activeCentreId, pendingCentre, enterCentreByCode, enterSoleCentre]);

  // The centre code gate appears only after a login button on the landing
  // page is clicked; the platform-staff door (#tos-admin) never shows it.
  const [centreGateRequested, setCentreGateRequested] = useState(false);

  // Platform (TOS) admins are exempt from the centre access-code gate below.
  // TOS access is the server-stamped `tos` custom claim, verified in a fresh
  // token. There is no client-side email shortcut (Prompt D): /api/session/sync
  // is the only thing that can mint the claim, and the server enforces it on
  // every route.
  const [hasTosClaim, setHasTosClaim] = useState(false);
  // Resolves after the token's claims are read (and, when the `tos` claim is
  // not in the token yet, after one server round-trip that may mint it), so a
  // claim-only staff account never flashes the tenant dashboard first.
  const [tosClaimsSettled, setTosClaimsSettled] = useState(false);
  // TOS door state: set when /api/session/sync could not verify platform
  // access; the door then shows a clear retry error instead of a bare
  // not-found.
  const [tosDoorError, setTosDoorError] = useState(false);
  const [tosDoorAttempt, setTosDoorAttempt] = useState(0);
  // First-login guard (Prompt C Part C): a provisioned owner must set their
  // own password before the app opens. Read from the token claims, enforced
  // again on the server when the flag is cleared.
  const [mustChangePassword, setMustChangePassword] = useState<boolean | null>(null);
  useEffect(() => {
    const u = getAuth().currentUser;
    if (!u) {
      setHasTosClaim(false);
      setMustChangePassword(null);
      setTosClaimsSettled(true);
      return;
    }
    let cancelled = false;
    const settle = (claims: any) => {
      if (cancelled) return;
      setHasTosClaim(claims?.tos === true);
      setMustChangePassword(claims?.mustChangePassword === true);
      setTosClaimsSettled(true);
    };
    (async () => {
      try {
        const r = await u.getIdTokenResult();
        if (r.claims?.tos === true) { settle(r.claims); return; }
        // No `tos` claim in the current token. The server is the only thing
        // that can mint it (first verified sign-in from TOS_BOOTSTRAP_EMAILS,
        // or a grant written by scripts/grant-tos.ts), so ask it once and read
        // the answer back from a freshly forced token; the claim is never
        // decoded or inferred client-side. Every sign-in runs this sync, so a
        // platform staff member can never end up on the centre access-code
        // screen (Prompt E) no matter which door they arrive through.
        const token = await u.getIdToken(true);
        const res = await fetch('/api/session/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          if (!cancelled) setTosDoorError(true);
          settle(null);
          return;
        }
        const fresh = await u.getIdTokenResult(true);
        settle(fresh.claims);
      } catch (e) {
        if (!cancelled) { setTosDoorError(true); settle(null); }
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser?.uid, centreAppRequested, tosDoorAttempt]);
  // The verified `tos` claim is the whole client-side test (Prompt D).
  const isTosAdmin = hasTosClaim;


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
    setPendingCentre(null);
    centreEntryKeyRef.current = null;
    setCentreEntryBusy(false);
    setCentreEntryFailed(false);
    setCentreGateRequested(false);
    setLoginCentreError(null);
    setShowWelcome(true);
    setShowPortals(false);
    try {
      await logout();
    } catch (e) {
      console.error(e);
    }
  };

  // Global loading state to prevent auth "flashes". Signed-in users also hold
  // one beat while token claims are read, so a `tos`-claim staff account never
  // flashes the tenant dashboard before the console opens.
  const claimsPending = !!currentUser && !tosClaimsSettled;
  if (isAuthLoading || claimsPending) {
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
          <h2 className="text-xl font-black tracking-widest uppercase text-orange-500">{activeCentre?.name || ''}</h2>
          <p className="text-xs text-slate-400 font-medium animate-pulse">Synchronizing academic records...</p>
        </div>
      </div>
    );
  }

  // Forced first-password change for provisioned owners (Prompt C Part C).
  if (currentUser && mustChangePassword === true) {
    return <FirstLoginPasswordChange onDone={() => setMustChangePassword(false)} />;
  }

  // Signed-in platform staff open the TOS console by default, TOS door or
  // not; #centre in the URL is the way back into the tenant (centre) app.
  // The #tos door still signs visitors in and shows non-staff a not-found.
  if (currentUser && isTosAdmin && !centreAppRequested) return <Suspense fallback={<ScreenFallback />}><TosPortal /></Suspense>;

  // Platform staff never see the centre access-code screen (Prompt E). When a
  // staff member opens a centre door without an active centre membership,
  // explain the way to test a centre instead of showing code entry.
  if (currentUser && isTosAdmin && !activeCentreId) {
    return (
      <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center text-center p-6">
        <div className="w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center mb-5">
          <ShieldCheck className="w-7 h-7 text-orange-400" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">You are signed in as platform staff</h1>
        <p className="text-slate-400 text-sm mb-6 max-w-sm">
          Centre access codes are for centre accounts, not platform staff. To look around a centre,
          sign out and sign in with that centre&apos;s own admin, tutor or student account.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => { window.location.hash = ''; }}
            className="px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-sm font-bold transition-colors"
          >
            Open the platform console
          </button>
          <button
            onClick={handleLogout}
            className="px-4 py-2.5 rounded-xl border border-white/10 hover:border-white/20 text-slate-300 text-sm font-semibold transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // Landing page flow: the Tutorial OS product landing is the first screen,
  // and the existing role picker stays one click away from it.
  if (tosLoginRequested) {
    // Signed-out visitors get the staff sign-in; a signed-in non-staff sees a
    // plain not-found, and one whose platform verification failed sees why.
    if (currentUser && !isTosAdmin) {
      if (tosDoorError) {
        return (
          <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center text-center p-6">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mb-5">
              <AlertCircle className="w-7 h-7 text-rose-400" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Could not verify your platform access</h1>
            <p className="text-slate-400 text-sm mb-6 max-w-sm">Try again. If it keeps failing, the platform backend may be starting or misconfigured.</p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setTosDoorError(false); setTosClaimsSettled(false); setTosDoorAttempt((a) => a + 1); }}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-colors"
              >
                Try again
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2.5 rounded-xl border border-white/10 hover:border-white/20 text-slate-300 text-sm font-semibold transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        );
      }
      return <TosNotFound />;
    }
    return <TosAdminLogin onBack={() => {
      history.replaceState(null, '', window.location.pathname + window.location.search);
      setTosLoginRequested(false);
    }} />;
  }

  // "Enter another access code": leave the current centre selection and show
  // the access-code gate again, without going back to the landing page.
  const handleEnterAnotherCode = () => {
    setLoginCentreError(null);
    setPendingCentre(null);
    setShowPortals(false);
    setShowWelcome(false);
    setCentreGateRequested(true);
  };

  // The centre code gate shows after a login button on the landing page is
  // clicked (the platform-staff door above is exempt). It only selects and
  // names the centre; the centre's login page follows it.
  if (!currentUser && !tosLoginRequested && !pendingCentre && centreGateRequested) {
    return (
      <CentreCodeGate
        onProceed={(code, centreName, centreId) => setPendingCentre({ code, centreName, centreId })}
        onBack={() => { setShowPortals(false); setShowWelcome(true); setCentreGateRequested(false); }}
      />
    );
  }

  if (!currentUser && showWelcome) {
    if (!showPortals) {
      return (
        <TutorialOsLanding
          onAdminSignIn={() => {
            setViewMode('portal');
            setShowWelcome(false);
            setCentreGateRequested(true);
          }}
          onStudentAccess={() => {
            setViewMode('student');
            setShowWelcome(false);
            setCentreGateRequested(true);
          }}
          onExplorePortals={() => setShowPortals(true)}
        />
      );
    }
    return <WelcomeScreen onSelectRole={(role) => {
      setViewMode(role === 'admin' ? 'portal' : role);
      setShowWelcome(false);
      setCentreGateRequested(true);
    }} />;
  }

  // The whitelabel loading screen: the centre's own name on the orange spin.
  // Shown after belonging is confirmed (centreSplash) and while an automatic
  // centre entry runs for a restored session.
  const centreSpinnerScreen = (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-900 text-white">
      <div className="relative w-24 h-24 mb-8">
        <div className="absolute inset-0 border-4 border-orange-500/20 rounded-full" />
        <div className="absolute inset-0 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        <div className="absolute inset-4 bg-orange-500/10 rounded-full flex items-center justify-center">
           <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
        </div>
      </div>
      <div className="space-y-2 text-center">
        <h2 className="text-xl font-black tracking-widest uppercase text-orange-500">{pendingCentre?.centreName || centreName}</h2>
        <p className="text-xs text-slate-400 font-medium animate-pulse">Taking you to your dashboard...</p>
      </div>
    </div>
  );

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

  // Whitelabel splash: belonging was confirmed, the centre's own loading
  // screen plays before the dashboard opens.
  if (currentUser && activeCentreId && centreSplash && !isTosAdmin) {
    return centreSpinnerScreen;
  }

  // Multi-Tenant Access Code Screen Guard (Part A, point 2 & Part B). With
  // centre resolution in flight this is a branded loading screen, never a
  // code prompt: the dashboard must be reachable without re-entering a code.
  // When a centre was chosen before login, the confirmation itself happens ON
  // the login page: the login page stays up (inputs kept, the button shows a
  // verifying state) until the account is confirmed to belong; only then does
  // the centre's own loading screen play.
  if (currentUser && !activeCentreId && !isTosAdmin) {
    if (centreEntryBusy || !centreEntryFailed) {
      if (pendingCentre) {
        return (
          <AuthPortal
            portalType={viewMode === 'student' ? 'student' : viewMode === 'tutor' ? 'tutor' : 'admin'}
            title={pendingCentre.centreName}
            subtitle=""
            onSuccess={() => {}}
            verifying
            email={loginEmail}
            onEmailChange={setLoginEmail}
            password={loginPassword}
            onPasswordChange={setLoginPassword}
          />
        );
      }
      return centreSpinnerScreen;
    }
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
        title={pendingCentre?.centreName || centreName}
        subtitle=""
        onSuccess={() => {}}
        onBack={() => { setShowPortals(false); setShowWelcome(true); setCentreGateRequested(false); }}
        notice={loginCentreError || undefined}
        onNoticeSignUp={() => { setLoginCentreError(null); setViewMode('student'); }}
        onNoticeCancel={() => setLoginCentreError(null)}
        noticeModal
        onChangeAccessCode={handleEnterAnotherCode}
        email={loginEmail}
        onEmailChange={setLoginEmail}
        password={loginPassword}
        onPasswordChange={setLoginPassword}
      />
    );
  }

  if ((viewMode === 'portal' || viewMode === 'tutor') && !currentUser && !isAdmin) {
    return (
      <AuthPortal 
        portalType={viewMode === 'tutor' ? 'tutor' : 'admin'}
        title={pendingCentre?.centreName || centreName}
        subtitle=""
        onSuccess={() => {}}
        onBack={() => { setShowPortals(false); setShowWelcome(true); setCentreGateRequested(false); }}
        notice={loginCentreError || undefined}
        onNoticeSignUp={() => { setLoginCentreError(null); setViewMode('student'); }}
        onNoticeCancel={() => setLoginCentreError(null)}
        noticeModal
        onChangeAccessCode={handleEnterAnotherCode}
        email={loginEmail}
        onEmailChange={setLoginEmail}
        password={loginPassword}
        onPasswordChange={setLoginPassword}
      />
    );
  }

  // If user toggles to the Student Portal view
  if (viewMode === 'student') {
    return (
      <>
        <Suspense fallback={<PortalFallback />}><StudentPortal /></Suspense>
        <OfflineIndicator />
        <ToastContainer />
      </>
    );
  }

  // If user toggles to the Tutor Portal view
  if (viewMode === 'tutor') {
    return (
      <>
        <Suspense fallback={<PortalFallback />}><TutorPortal /></Suspense>
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
            <Suspense fallback={<PageFallback />}>
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
            {adminSection === 'chat' && <ChatManager />}
            {adminSection === 'student-portal' && <StudentPortal />}
            {adminSection === 'tutor-portal' && <TutorPortal />}
            {(adminSection === 'finance' || adminSection === 'payments') && <FinanceManager />}
            {(adminSection === 'account' || adminSection === 'staff-roles') && <StaffRolesManager />}
            {adminSection === 'settings' && <SettingsView />}
            {(adminSection === 'cms' || adminSection === 'cms-editor') && <CmsManager />}
            </Suspense>
          </div>
        </main>
      </div>

      {/* Global Modals & Notifications */}
      {selectedStudent && <Suspense fallback={null}><StudentDetailModal /></Suspense>}
      <OfflineIndicator />
      <ToastContainer />
    </div>
  );
};

import { FirebaseProvider } from './context/FirebaseContext';

// Code splitting: each page and portal downloads only when it is first
// opened, so the first screen no longer waits for the whole app. The
// sign-in, access-code, password and landing screens stay bundled (eager)
// so the first door a visitor knocks on always opens instantly.
const DashboardOverview = lazy(() => import('./components/dashboard/DashboardOverview').then((m) => ({ default: m.DashboardOverview })));
const StudentsList = lazy(() => import('./components/students/StudentsList').then((m) => ({ default: m.StudentsList })));
const AdmissionsManager = lazy(() => import('./components/admissions/AdmissionsManager').then((m) => ({ default: m.AdmissionsManager })));
const SubjectsManager = lazy(() => import('./components/academics/SubjectsManager').then((m) => ({ default: m.SubjectsManager })));
const ProgrammesManager = lazy(() => import('./components/programmes/ProgrammesManager').then((m) => ({ default: m.ProgrammesManager })));
const FinanceManager = lazy(() => import('./components/finance/FinanceManager').then((m) => ({ default: m.FinanceManager })));
const TutorsManager = lazy(() => import('./components/tutors/TutorsManager').then((m) => ({ default: m.TutorsManager })));
const PerformanceManager = lazy(() => import('./components/academics/PerformanceManager').then((m) => ({ default: m.PerformanceManager })));
const CBTManager = lazy(() => import('./components/academics/CBTManager').then((m) => ({ default: m.CBTManager })));
const TimetableManager = lazy(() => import('./components/academics/TimetableManager').then((m) => ({ default: m.TimetableManager })));
const AttendanceTracker = lazy(() => import('./components/academics/AttendanceTracker').then((m) => ({ default: m.AttendanceTracker })));
const AnnouncementsManager = lazy(() => import('./components/communications/AnnouncementsManager').then((m) => ({ default: m.AnnouncementsManager })));
const ChatManager = lazy(() => import('./components/communications/ChatManager').then((m) => ({ default: m.ChatManager })));
const StudentPortal = lazy(() => import('./components/student-portal/StudentPortal').then((m) => ({ default: m.StudentPortal })));
const TutorPortal = lazy(() => import('./components/tutor-portal/TutorPortal').then((m) => ({ default: m.TutorPortal })));
const CmsManager = lazy(() => import('./components/cms/CmsManager').then((m) => ({ default: m.CmsManager })));
const StaffRolesManager = lazy(() => import('./components/staff/StaffRolesManager').then((m) => ({ default: m.StaffRolesManager })));
const SettingsView = lazy(() => import('./components/settings/SettingsView').then((m) => ({ default: m.SettingsView })));
const StudentDetailModal = lazy(() => import('./components/modals/StudentDetailModal').then((m) => ({ default: m.StudentDetailModal })));
const TosPortal = lazy(() => import('./components/tos/TosPortal').then((m) => ({ default: m.TosPortal })));

const PageFallback = () => (
  <div className="p-6 space-y-4 animate-pulse" aria-busy="true" aria-label="Loading page">
    <div className="h-8 w-48 rounded-xl bg-slate-200/70" />
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="h-24 rounded-2xl bg-slate-200/70" /><div className="h-24 rounded-2xl bg-slate-200/70" />
      <div className="h-24 rounded-2xl bg-slate-200/70" /><div className="h-24 rounded-2xl bg-slate-200/70" />
    </div>
    <div className="h-64 rounded-2xl bg-slate-200/70" />
  </div>
);
const ScreenFallback = () => (
  <div className="h-screen w-full bg-slate-900" aria-busy="true" />
);
const PortalFallback = () => (
  <div className="h-screen w-full bg-[#FFF3E7]" aria-busy="true" />
);

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
