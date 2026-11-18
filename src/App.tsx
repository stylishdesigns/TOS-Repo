import React, { useRef,  useState, useEffect, Component, ErrorInfo, ReactNode, lazy, Suspense } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/layout/Sidebar';
import { AppOnlyGate } from './components/portal/AppOnlyGate';
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
import { AppWelcomePage } from './components/auth/AppWelcomePage';
import { StudentSignupFlow } from './components/auth/StudentSignupFlow';
import { EmailVerificationGate } from './components/auth/EmailVerificationGate';
import { brandVars, setThemeColor } from './lib/brand';
import { JoinCentreScreen } from './components/auth/JoinCentreScreen';

import { PasswordChangeOverlay } from './components/auth/PasswordChangeOverlay';
import { getAuth } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { AlertCircle, MessageCircle, ShieldCheck } from 'lucide-react';

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
    resumeCentreSession,
    fetchMyCentreIds,
    addToast,
    updateAdmin,
    logout,
    brandAccent
  } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  // '#landing' forces the public Tutorial OS landing page for this visit,
  // signed in or not: the app install page's "Back to landing page" uses it,
  // so the button always reaches the landing instead of an open session
  // pulling the visitor into the portals. It clears when the hash moves on.
  const readLandingRequested = () => window.location.hash.toLowerCase() === '#landing';
  const [forceLanding, setForceLanding] = useState(readLandingRequested);
  // Platform (TOS) staff sign-in lives on its own door: #tos-admin in the URL.
  // #centre is the matching door back into the tenant (centre) app.
  const [tosLoginRequested, setTosLoginRequested] = useState(() => /^#tos(-admin)?$/.test(window.location.hash.toLowerCase()));
  const [centreAppRequested, setCentreAppRequested] = useState(() => /^#centre(-admin)?$/.test(window.location.hash.toLowerCase()));
  useEffect(() => {
    const onHashChange = () => {
      setTosLoginRequested(/^#tos(-admin)?$/.test(window.location.hash.toLowerCase()));
      setCentreAppRequested(/^#centre(-admin)?$/.test(window.location.hash.toLowerCase()));
      if (window.location.hash.toLowerCase() === '#access') setCentreGateRequested(true);
      setForceLanding(readLandingRequested());
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
  const [pendingCentre, setPendingCentre] = useState<{ code: string; centreName: string; centreId?: string; accent?: string } | null>(null);
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
  // The login page's email/password live here so they survive every screen
  // swap on the way to a verdict (verification, the no-account popup, the
  // centre loading screen). They clear once the account is inside a centre.
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [appWelcomeCentre, setAppWelcomeCentre] = useState<{ centreId: string; centreName: string; accent: string; logoUrl: string; welcomeImageUrl: string } | null>(null);
  const [appWelcomeMode, setAppWelcomeMode] = useState<'welcome' | 'login' | 'signup' | null>(null);

  // The facility app's own home screen. In the installed app (its own address
  // carries ?centre=), a signed-out user goes through the access-code gate
  // first; Continue then shows the welcome screen. A signed-in user skips the
  // gate and lands straight in their portal.
  const [isAppContext] = useState(() => {
    try { return !!new URLSearchParams(window.location.search).get('centre'); } catch { return false; }
  });

  // The installed app is bound to ONE facility. Its manifest start_url opens
  // with ?centre=<facility>, and on a phone every facility app shares the
  // same address, so the browser keeps ONE login session for all of them.
  // Without this binding, a student logged in through one facility's app was
  // signed in inside every other facility's app too. The binding resolves
  // the facility from that address and: opens the app straight on its own
  // welcome screen (no access-code gate), makes automatic centre entry
  // always enter THIS facility, and signs out an account that does not
  // belong to it. undefined while the lookup runs, null when the visit
  // carries no ?centre= (a plain browser visit keeps today's behaviour).
  const [appFacility, setAppFacility] = useState<{ centreId: string; centreName: string; accent: string; logoUrl: string } | null | undefined>(undefined);
  useEffect(() => {
    if (!isAppContext) { setAppFacility(null); return; }
    let alive = true;
    let slug = '';
    try { slug = new URLSearchParams(window.location.search).get('centre') || ''; } catch { slug = ''; }
    fetch(`/api/public/centre-by-slug?centre=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d: any) => {
        if (!alive) return;
        if (d && d.centreId) {
          const facility = { centreId: String(d.centreId), centreName: String(d.centreName || ''), accent: String(d.accent || ''), logoUrl: String(d.logoUrl || '') };
          // The gate state is prepared in the same update as the facility
          // itself, so the access-code gate is the very first screen that
          // paints: the TOS landing never flashes through the gap in between.
          setShowWelcome(false);
          setCentreGateRequested(true);
          setAppWelcomeCentre({ centreId: facility.centreId, centreName: facility.centreName, accent: facility.accent, logoUrl: facility.logoUrl, welcomeImageUrl: '' });
          setAppFacility(facility);
        } else {
          setAppFacility(null);
        }
      })
      .catch(() => { if (alive) setAppFacility(null); });
    return () => { alive = false; };
  }, [isAppContext]);
  // A bound app keeps the access-code gate as the first screen for a
  // signed-out visitor: the gate is locked to the app's own facility, the
  // code confirms the centre, and the welcome screen follows. A signed-in
  // account never sees the gate: automatic entry opens the dashboard.
  useEffect(() => {
    if (!appFacility) return;
    setShowWelcome(false);
    setCentreGateRequested(true);
    setAppWelcomeCentre({ centreId: appFacility.centreId, centreName: appFacility.centreName, accent: appFacility.accent, logoUrl: appFacility.logoUrl, welcomeImageUrl: '' });
    // The phone's top strip (browser chrome and the installed app's bar)
    // follows the facility's colour, never platform orange.
    setThemeColor(appFacility.accent);
  }, [appFacility]);

  // Email verification gate: a student account created with email + password
  // holds emailVerified=false until the emailed code is confirmed. The
  // account is signed back out at creation, and even when a session exists
  // (an old device, a login on another one before confirming), this gate
  // blocks every portal until the code verifies. Tutors, admins and owners
  // have no student record, so the gate never applies to them.
  const [verifyPending, setVerifyPending] = useState<{ uid: string; email: string } | null>(null);
  const verifyCheckedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentUser) { verifyCheckedRef.current = null; return; }
    if (verifyCheckedRef.current === currentUser.uid) return;
    verifyCheckedRef.current = currentUser.uid;
    let alive = true;
    getDoc(doc(db, 'students', currentUser.uid))
      .then((snap) => {
        if (alive && snap.exists() && (snap.data() as any)?.emailVerified === false) {
          setVerifyPending({ uid: currentUser.uid, email: currentUser.email || '' });
        }
      })
      .catch(() => { /* The check could not run: never lock a portal on a failed read. */ });
    return () => { alive = false; };
  }, [currentUser]);
  useEffect(() => {
    if (activeCentreId) {
      setLoginEmail('');
      setLoginPassword('');
    }
  }, [activeCentreId]);

  const centreEntryKeyRef = useRef<string | null>(null);
  // The facility whose saved tenant this load already tried to restore, so a
  // failed restore falls through to normal entry instead of looping.
  const centreResumeTriedRef = useRef<string | null>(null);
  // What the last failed centre entry said, so the user sees the real reason
  // (a lockout, an inactive membership, a server hiccup) instead of being
  // dropped on an access-code screen that asks for the centre all over again.
  const [centreEntryError, setCentreEntryError] = useState<string | null>(null);
  const [centreEntryCount, setCentreEntryCount] = useState<number | null>(null);
  const [centreEntryRetry, setCentreEntryRetry] = useState(0);
  const [centreEntryWhatsapp, setCentreEntryWhatsapp] = useState<string | null>(null);
  useEffect(() => {
    if (!currentUser || !hasCheckedActiveCentre) return;
    // During the student sign-up flow the account is signed in mid-flow while
    // the flow still owns the screen: automatic centre entry must wait, or it
    // would confirm belonging and play the loading splash, which unmounts the
    // flow and wipes everything the student typed. Entry runs the moment the
    // flow hands the screen back.
    if (appWelcomeCentre && appWelcomeMode === 'signup') return;
    // In the installed facility app, entry waits until the app's own facility
    // is resolved from its start address (?centre=): the binding decides
    // which centre this app belongs to, so nothing may enter before it lands.
    if (isAppContext && appFacility === undefined) return;
    // While the email-verification gate is up it owns the screen.
    if (verifyPending) return;
    if (activeCentreId) {
      if (appFacility && activeCentreId !== appFacility.centreId) {
        // A restored session points at a DIFFERENT facility than the one this
        // installed app belongs to: fall through and re-enter the app's own
        // facility below, so two facility apps on one phone can never show
        // each other's data.
      } else {
        setCentreEntryBusy(false);
        setCentreEntryFailed(false);
        return;
      }
    }
    // A permanent session: the facility app keeps the tenant it last entered
    // on this device (per facility), so reopening or refreshing the app
    // restores the dashboard without asking for anything again. The restored
    // tenant is always re-validated with the server before it is trusted; a
    // failed restore falls through to normal automatic entry.
    if (appFacility && !activeCentreId && centreResumeTriedRef.current !== appFacility.centreId) {
      centreResumeTriedRef.current = appFacility.centreId;
      let savedTenant = '';
      try { savedTenant = localStorage.getItem(`tos_tenant:${appFacility.centreId}`) || ''; } catch { savedTenant = ''; }
      if (savedTenant === appFacility.centreId) {
        resumeCentreSession(appFacility.centreId)
          .catch(() => { /* the saved tenant is stale: normal entry takes over below */ })
          .finally(() => setCentreEntryRetry((n) => n + 1));
        return;
      }
    }
    const key = `${appFacility ? `app:${appFacility.centreId}` : pendingCentre ? `code:${pendingCentre.code}|${pendingCentre.centreId || ''}` : 'auto'}#${centreEntryRetry}`;
    if (centreEntryKeyRef.current === key) return;
    centreEntryKeyRef.current = key;
    setCentreEntryFailed(false);
    setCentreEntryError(null);
    setCentreEntryWhatsapp(null);
    setCentreEntryBusy(true);
    const work = appFacility
      ? enterCentreByCode('', appFacility.centreId)
      : pendingCentre
        ? enterCentreByCode(pendingCentre.code, pendingCentre.centreId)
        : enterSoleCentre();
    work
      .then((r: any) => {
        const ok = !!(r && (r.success || r.entered));
        if (!ok) {
          setCentreEntryCount(pendingCentre || appFacility ? null : (r && typeof r.count === 'number' ? r.count : null));
          setCentreEntryWhatsapp(r?.whatsapp || null);
          setCentreEntryFailed(true);
          return;
        }
        // Belonging is confirmed: the dashboard opens straight away. No
        // decorative loading screen after entry; spinners belong only to the
        // login itself and to real background work.
      })
      .catch(async (err: any) => {
        // A failed automatic entry is never silent: the server's reason (a
        // temporary lockout, a membership mismatch) shows as a message, so the
        // join screen never appears without an explanation.
        //
        // Strict facility login: when the signed-in account does not belong
        // to the centre chosen before login, or to the facility this
        // installed app is bound to, sign the user back out and say so on the
        // login page, with the student sign-up route. Only students
        // self-register; centre staff are provisioned by each centre's super
        // admin, so there is no staff sign-up.
        // The "no account" message shows only when the server itself confirms
        // the signed-in account holds no active membership in that facility.
        // Other failures (too many attempts, centre suspended or the
        // membership not active yet, a server error) keep the session and show
        // the server's own reason in the toast below, never "no account".
        const boundId = pendingCentre?.centreId || appFacility?.centreId || null;
        if (boundId && err?.status === 400) {
          try {
            const myIds = await fetchMyCentreIds();
            if (!myIds.includes(boundId)) {
              centreEntryKeyRef.current = null;
              await logout();
              setShowWelcome(false);
              setLoginCentreError(
                `No account can be found with these login details for ${pendingCentre?.centreName || appFacility?.centreName}. If you are a student, sign up below.`
              );
              return;
            }
          } catch {
            /* The membership check could not run: keep the generic path. */
          }
        }
        setCentreEntryError(err?.message || 'Your facility could not be opened automatically.');
        setCentreEntryWhatsapp(err?.whatsapp || null);
        setCentreEntryFailed(true);
        addToast({
          type: 'error',
          title: 'Facility entry failed',
          description: err?.message || 'Your facility could not be opened automatically.',
        });
      })
      .finally(() => setCentreEntryBusy(false));
  }, [currentUser, hasCheckedActiveCentre, activeCentreId, pendingCentre, centreEntryRetry, appWelcomeCentre, appWelcomeMode, appFacility, verifyPending, enterCentreByCode, enterSoleCentre, resumeCentreSession]);

  // The centre code gate appears only after a login button on the landing
  // page is clicked; the platform-staff door (#tos-admin) never shows it.
  const [centreGateRequested, setCentreGateRequested] = useState(() => window.location.hash.toLowerCase() === '#access');



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
      // On a weak connection this check can fail on its first tries (the
      // token refresh and the server round trip both need the network), which
      // used to drop a still-signed-in platform admin onto the public pages
      // and look exactly like being logged out. Try a few times before
      // giving up, and when it still fails, say so honestly (the screen
      // below) instead of pretending the session is gone.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const r = await u.getIdTokenResult();
          if (r.claims?.tos === true) { settle(r.claims); return; }
          // No `tos` claim in the current token. The server is the only thing
          // that can mint it (first verified sign-in from TOS_BOOTSTRAP_EMAILS,
          // or a grant written by scripts/grant-tos.ts), so ask it and read
          // the answer back from a freshly forced token; the claim is never
          // decoded or inferred client-side. Every sign-in runs this sync, so a
          // platform staff member can never end up on the centre access-code
          // screen (Prompt E) no matter which door they arrive through.
          const token = await u.getIdToken(true);
          const res = await fetch('/api/session/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          });
          if (!res.ok) throw new Error('sync failed');
          const fresh = await u.getIdTokenResult(true);
          settle(fresh.claims);
          return;
        } catch (e) {
          if (attempt < 2) {
            await new Promise((r2) => setTimeout(r2, 1200));
            if (cancelled) return;
            continue;
          }
          if (!cancelled) { setTosDoorError(true); settle(null); }
        }
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
    // Inside the installed app a signed-out account meets the facility's
    // access-code gate again, never the login page or the landing.
    if (isAppContext) setAppWelcomeMode(null);
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

  // A signed-in account whose platform check could not finish (a weak
  // connection) is still signed in: say that plainly here instead of showing
  // the public pages, which read as having been logged out.
  if (currentUser && !isTosAdmin && tosDoorError && !centreAppRequested && !activeCentreId && !pendingCentre && !centreEntryBusy) {
    return (
      <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center text-center p-6">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-5">
          <AlertCircle className="w-7 h-7 text-amber-400" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">You are still signed in</h1>
        <p className="text-slate-400 text-sm mb-6 max-w-sm">
          The connection is too weak to verify your account right now, so your page cannot open yet. Your sign-in was not lost. Tap retry, or try again in a moment.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => { setTosDoorError(false); setTosClaimsSettled(false); setTosDoorAttempt((a) => a + 1); }}
            className="px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-sm font-bold transition-colors"
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
          Facility access codes are for facility accounts, not platform staff. To look around a facility,
          sign out and sign in with that facility&apos;s own admin, tutor or student account.
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

  // Retry the automatic centre entry without asking for the access code
  // again: the centre was already chosen before login (or belongs to the
  // account), so a retry never means re-entering the code.
  const retryCentreEntry = () => {
    centreEntryKeyRef.current = null;
    setCentreEntryFailed(false);
    setCentreEntryError(null);
    setCentreEntryWhatsapp(null);
    setCentreEntryBusy(false);
    setCentreEntryRetry((n) => n + 1);
  };

  // "Enter another access code": leave the current centre selection and show
  // the access-code gate again, without going back to the landing page.
  const handleEnterAnotherCode = () => {
    setLoginCentreError(null);
    setPendingCentre(null);
    setShowPortals(false);
    setShowWelcome(false);
    setCentreGateRequested(true);
  };

  // The installed app's access-code gate, bound to the app's own facility.
  // A signed-out visitor enters this facility's access code first; the code
  // confirms the centre, then the facility's welcome screen opens, and
  // sign-in follows from there. A signed-in account skips the gate entirely.
  if (!currentUser && !tosLoginRequested && !pendingCentre && isAppContext && appFacility && appWelcomeCentre && appWelcomeMode === null) {
    return (
      <CentreCodeGate
        lockedCentre={{ centreId: appFacility.centreId, centreName: appFacility.centreName, accent: appFacility.accent, logoUrl: appFacility.logoUrl }}
        onProceed={(code, centreName, centreId, accent, logoUrl) => {
          setShowWelcome(false);
          setPendingCentre({ code, centreName, centreId, accent });
          setAppWelcomeCentre({ centreId: centreId || appFacility.centreId, centreName, accent: accent || '', logoUrl: logoUrl || appFacility.logoUrl, welcomeImageUrl: '' });
          setAppWelcomeMode('welcome');
        }}
        onBack={() => { setShowPortals(false); setShowWelcome(true); setCentreGateRequested(false); }}
      />
    );
  }

  // The facility app's home screen: welcome first, then login or sign-up.
  if (!currentUser && !tosLoginRequested && centreGateRequested && appWelcomeCentre && appWelcomeMode === 'welcome') {
    const enterFromWelcome = (mode: 'login' | 'signup') => {
      setPendingCentre({ code: '', centreName: appWelcomeCentre.centreName, centreId: appWelcomeCentre.centreId, accent: appWelcomeCentre.accent });
      setAppWelcomeMode(mode);
    };
    return (
      <AppWelcomePage
        centreName={appWelcomeCentre.centreName}
        accent={appWelcomeCentre.accent}
        welcomeImageUrl={appWelcomeCentre.welcomeImageUrl}
        onGetStarted={() => enterFromWelcome('signup')}
        onLogin={() => enterFromWelcome('login')}
      />
    );
  }

  // While the installed app resolves its own facility from its start
  // address, show a plain loading screen: never the landing page or an
  // access-code prompt for the wrong facility.
  if (isAppContext && appFacility === undefined) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-900 text-white">
        <div className="relative w-20 h-20 mb-6">
          <div className="absolute inset-0 border-4 border-orange-500/20 rounded-full" />
          <div className="absolute inset-0 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-xs text-slate-400 font-medium animate-pulse">Loading...</p>
      </div>
    );
  }

  // The centre code gate shows after a login button on the landing page is
  // clicked (the platform-staff door above is exempt). It only selects and
  // names the centre; the centre's login page follows it.
  if (!currentUser && !tosLoginRequested && !pendingCentre && centreGateRequested && appFacility === null) {
    return (
      <CentreCodeGate
        onProceed={(code, centreName, centreId, accent, logoUrl) => {
          // A code picked from a door that skipped the landing (the installed
          // app boots on #access) must still land on the login page, not the
          // landing: clear the welcome flag the gate ran past.
          setShowWelcome(false);
          setPendingCentre({ code, centreName, centreId, accent });
          // In the facility app the gate's Continue opens the app's own
          // welcome screen; login happens from there, never straight away.
          if (isAppContext) {
            setAppWelcomeCentre({ centreId: centreId || '', centreName, accent: accent || '', logoUrl: logoUrl || '', welcomeImageUrl: '' });
            setAppWelcomeMode('welcome');
          }
        }}
        onBack={() => { setShowPortals(false); setShowWelcome(true); setCentreGateRequested(false); }}
      />
    );
  }

  // Belt over braces: a bound facility app never paints the public TOS
  // landing, not for a single frame. If the gate state is somehow not ready
  // yet, hold on the plain loading screen instead.
  if (isAppContext && appFacility && !currentUser && !appWelcomeCentre) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-900 text-white">
        <div className="relative w-20 h-20 mb-6">
          <div className="absolute inset-0 border-4 border-orange-500/20 rounded-full" />
          <div className="absolute inset-0 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-xs text-slate-400 font-medium animate-pulse">Loading...</p>
      </div>
    );
  }

  if (showWelcome && (forceLanding || !currentUser)) {
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

  // Email verification gate: no portal screen for an unconfirmed student
  // account, on a fresh login or a restored session alike.
  if (currentUser && verifyPending) {
    return (
      <EmailVerificationGate
        uid={verifyPending.uid}
        email={verifyPending.email}
        centreName={pendingCentre?.centreName || centreName || undefined}
        accent={appWelcomeCentre?.accent || pendingCentre?.accent || ''}
        onVerified={() => { setVerifyPending(null); setCentreEntryRetry((n) => n + 1); }}
        onSignOut={handleLogout}
      />
    );
  }

  // Multi-Tenant Access Code Screen Guard (Part A, point 2 & Part B). With
  // centre resolution in flight this is a branded loading screen, never a
  // code prompt: the dashboard must be reachable without re-entering a code.
  // When a centre was chosen before login, the confirmation itself happens ON
  // the login page: the login page stays up (inputs kept, the button shows a
  // verifying state) until the account is confirmed to belong; only then does
  // the centre's own loading screen play.
  // The student registration flow owns the whole app screen once Get Started
  // is picked: it continues through the email-code and congratulations steps
  // even after the account exists (the student is signed in from then on), so
  // it sits above every signed-in screen.
  if (appWelcomeCentre && appWelcomeMode === 'signup') {
    return (
      <StudentSignupFlow
        centreName={appWelcomeCentre.centreName}
        centreId={appWelcomeCentre.centreId}
        accent={appWelcomeCentre.accent}
        logoUrl={appWelcomeCentre.logoUrl}
        onGoToDashboard={() => setAppWelcomeMode(null)}
        onBack={() => setAppWelcomeMode('welcome')}
        onSwitchToLogin={() => setAppWelcomeMode('login')}
      />
    );
  }

  if (currentUser && !activeCentreId && !isTosAdmin) {
    if (centreEntryBusy || !centreEntryFailed) {
      if (pendingCentre) {
        return (
          <AuthPortal
            portalType="student"
            title={pendingCentre.centreName}
            accent={pendingCentre.accent}
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
    // A signed-in user whose centre entry failed sees the real reason with a
    // retry, never the access-code screen: the centre was chosen before login
    // (or belongs to this account), so the code is not asked again. When the
    // account's access was switched off, the screen says who can switch it
    // back on and offers the centre's WhatsApp line with a pre-filled message.
    if (pendingCentre || (centreEntryCount !== null && centreEntryCount > 0)) {
      const accessBlocked = !!centreEntryError && /cannot access/i.test(centreEntryError);
      const waDigits = accessBlocked && centreEntryWhatsapp ? centreEntryWhatsapp.replace(/\D/g, '') : '';
      const waHref = waDigits
        ? `https://wa.me/${waDigits}?text=${encodeURIComponent(`Hello, I am a student of ${pendingCentre?.centreName || centreName}. I cannot access the portal at the moment. Please help me regain access. Thank you.`)}`
        : '';
      return (
        <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-900 text-white px-6 text-center">
          <div className={accessBlocked
            ? "w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-5"
            : "w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-5"}>
            <AlertCircle className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-black tracking-widest uppercase text-orange-500 mb-3">{pendingCentre?.centreName || centreName}</h2>
          <p className="text-sm text-slate-300 font-medium max-w-sm mb-2">
            {accessBlocked
              ? 'Your access to this facility has been switched off. Please contact your facility admin to have it switched back on.'
              : centreEntryError || 'Your facility could not be opened automatically.'}
          </p>
          {accessBlocked && (
            <p className="text-xs text-slate-500 max-w-sm mb-6">Once the admin restores your access, tap Try again or sign in again.</p>
          )}
          {waHref ? (
            <a
              href={waHref}
              target="_blank"
              rel="noreferrer"
              className="mb-3 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              Contact the admin on WhatsApp
            </a>
          ) : null}
          <div className="flex items-center gap-3">
            <button onClick={retryCentreEntry} className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold transition-colors">
              Try again
            </button>
            {!accessBlocked && (
              <button onClick={handleLogout} className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold transition-colors">
                Sign out
              </button>
            )}
          </div>
        </div>
      );
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


  // The facility app's login and student sign-up, reached from the app's own
  // welcome screen. Back returns to the welcome screen, never the TOS landing.
  if (!currentUser && appWelcomeCentre && appWelcomeMode === 'login') {
    return (
      <AuthPortal
        portalType="student"
        title={appWelcomeCentre.centreName}
        accent={appWelcomeCentre.accent}
        logoUrl={appWelcomeCentre.logoUrl}
        entryMode={appWelcomeMode}
        subtitle=""
        onSuccess={() => {}}
        onBack={() => setAppWelcomeMode('welcome')}
        centreId={appWelcomeCentre.centreId}
        email={loginEmail}
        onEmailChange={setLoginEmail}
        password={loginPassword}
        onPasswordChange={setLoginPassword}
      />
    );
  }

  // Auth Guards for different portals
  if (viewMode === 'student' && !currentUser && !isAdmin) {
    return (
      <AuthPortal 
        portalType="student"
        title={pendingCentre?.centreName || centreName}
        accent={pendingCentre?.accent}
        subtitle=""
        onSuccess={() => {}}
        onBack={() => { if (appWelcomeCentre) { setAppWelcomeMode('welcome'); } else { setShowPortals(false); setShowWelcome(true); setCentreGateRequested(false); } }}
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
        portalType="student"
        title={pendingCentre?.centreName || centreName}
        accent={pendingCentre?.accent}
        subtitle=""
        onSuccess={() => {}}
        onBack={() => { if (appWelcomeCentre) { setAppWelcomeMode('welcome'); } else { setShowPortals(false); setShowWelcome(true); setCentreGateRequested(false); } }}
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
      <AppOnlyGate>
        <div style={brandVars(brandAccent)}><Suspense fallback={<PortalFallback />}><StudentPortal /></Suspense></div>
        <OfflineIndicator />
        <ToastContainer />
      </AppOnlyGate>
    );
  }

  // If user toggles to the Tutor Portal view
  if (viewMode === 'tutor') {
    return (
      <AppOnlyGate>
        <div style={brandVars(brandAccent)}><Suspense fallback={<PortalFallback />}><TutorPortal /></Suspense></div>
        <OfflineIndicator />
        <ToastContainer />
      </AppOnlyGate>
    );
  }

  // If user toggles to the Public-facing Website view. A facility admin sees
  // their OWN landing page, always live from the server, so every template
  // change is visible the moment it is saved. Platform (TOS) staff without a
  // facility selected keep the generic Tutorial OS site.
  if (viewMode === 'website') {
    if (activeCentreId) {
      return (
        <>
          <Suspense fallback={null}><PublicLandingPageLazy centreId={activeCentreId} /></Suspense>
          <button
            onClick={() => setViewMode('portal')}
            style={{ position: 'fixed', top: 14, left: 14, zIndex: 60, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 999, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#334155', font: '700 13px Inter, sans-serif', cursor: 'pointer', boxShadow: '0 4px 14px rgba(15,23,42,.14)' }}
          >
            &larr; Back to admin
          </button>
          <OfflineIndicator />
          <ToastContainer />
        </>
      );
    }
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
    <AppOnlyGate>
    <div style={brandVars(brandAccent)}>
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
            {adminSection === 'chat' && <AdminChatEntry />}
            {adminSection === 'website' && <WebsiteLanding />}
            {adminSection === 'student-portal' && <StudentPortal />}
            {adminSection === 'tutor-portal' && <TutorPortal />}
            {(adminSection === 'finance' || adminSection === 'payments') && <FinanceManager />}
            {(adminSection === 'account' || adminSection === 'staff-roles') && <StaffRolesManager />}
            {adminSection === 'settings' && <SettingsView mode="facility" />}
            {adminSection === 'profile' && <SettingsView mode="profile" />}
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
    </div>
    </AppOnlyGate>
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
const AdminChatEntry = lazy(() => import('./components/communications/AdminChatEntry').then((m) => ({ default: m.AdminChatEntry })));
const WebsiteLanding = lazy(() => import('./components/dashboard/WebsiteLanding').then((m) => ({ default: m.WebsiteLanding })));
const StudentPortal = lazy(() => import('./components/student-portal/StudentPortal').then((m) => ({ default: m.StudentPortal })));
const TutorPortal = lazy(() => import('./components/tutor-portal/TutorPortal').then((m) => ({ default: m.TutorPortal })));
const CmsManager = lazy(() => import('./components/cms/CmsManager').then((m) => ({ default: m.CmsManager })));
const StaffRolesManager = lazy(() => import('./components/staff/StaffRolesManager').then((m) => ({ default: m.StaffRolesManager })));
const SettingsView = lazy(() => import('./components/settings/SettingsView').then((m) => ({ default: m.SettingsView })));
const StudentDetailModal = lazy(() => import('./components/modals/StudentDetailModal').then((m) => ({ default: m.StudentDetailModal })));
const TosPortal = lazy(() => import('./components/tos/TosPortal').then((m) => ({ default: m.TosPortal })));
const PublicLandingPageLazy = lazy(() => import('./components/landing/PublicLandingPage').then((m) => ({ default: m.PublicLandingPage })));

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

class ErrorBoundary extends Component<any, any> {
  public state: any = { hasError: false, error: null };
  // The component stack from the last crash, read on the error screen.
  crashInfo: any = null;

  static getDerivedStateFromError(error: any): any {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
    this.crashInfo = errorInfo;
  }

  // A crash page that hides the real error helped nobody: this shows the
  // message on screen and copies the full details (time, page, stack) so a
  // crash on a phone can be pasted into the chat and diagnosed.
  render() {
    if (this.state.hasError) {
      const err: any = this.state.error;
      const message = err?.message || String(err || 'Unknown error');
      const parts = [
        `Time: ${new Date().toLocaleString()}`,
        `Page: ${typeof window !== 'undefined' ? window.location.href : ''}`,
        `Error: ${err?.toString() || 'Unknown error'}`,
        err?.stack ? `Stack:\n${err.stack}` : '',
        this.crashInfo?.componentStack ? `Component stack:\n${this.crashInfo.componentStack}` : ''
      ].filter(Boolean);
      const details = parts.join('\n\n');
      const copyDetails = () => {
        const btn = document.getElementById('crashCopyBtn') as HTMLButtonElement | null;
        const done = () => { if (btn) btn.textContent = 'Copied'; };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(details).then(done).catch(() => copyFallback(details, done));
        } else {
          copyFallback(details, done);
        }
      };
      return (
        <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
          <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mb-4">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Something went wrong</h2>
          <p className="text-slate-500 text-sm max-w-md mb-3">
            The application hit an unexpected error and stopped. The details below say exactly what broke. Copy them and send them over.
          </p>
          <pre className="mb-5 w-full max-w-md max-h-40 overflow-auto rounded-xl bg-slate-100 p-3 text-left text-[11px] text-rose-700 whitespace-pre-wrap break-words">
            {message}
          </pre>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-all"
            >
              Reload Application
            </button>
            <button
              id="crashCopyBtn"
              onClick={copyDetails}
              className="px-6 py-2 bg-white text-slate-800 border border-slate-300 rounded-xl font-bold text-sm hover:bg-slate-100 transition-all"
            >
              Copy details
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}


function copyFallback(text: string, done: () => void) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  } catch {
    // best effort: the message itself is still on screen
  }
  done();
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
