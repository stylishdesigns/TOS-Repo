import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { useFirebase } from '../../context/FirebaseContext';
import { HomeTab } from './tabs/HomeTab';
import { ScheduleTab } from './tabs/ScheduleTab';
import { RollCallTab } from './tabs/RollCallTab';
import { AssessmentTab } from './tabs/AssessmentTab';
import { MoreTab } from './tabs/MoreTab';
import { ChatManager } from '../communications/ChatManager';
import { StaffStatusScreen } from '../student-portal/tabs/StatusTab';
import { ChatModeToggle, ChatMode } from '../communications/ChatSplash';
import TutorAiChat from '../tutor-ai/TutorAiChat';
import { PWAInstallButton } from '../pwa/PWAInstallButton';
import { NotificationsBell } from '../student-portal/NotificationsBell';
import { RetryButton } from '../common/RetryButton';
import {
  Home,
  Calendar,
  UserCheck,
  Award,
  Menu,
  Smartphone,
  Maximize2,
  LogOut,
  GraduationCap,
  Shield,
  Eye,
  EyeOff,
  Laptop,
  MessageSquare
} from 'lucide-react';

import { PasswordChangeOverlay } from '../auth/PasswordChangeOverlay';
import { useScrollLock } from '../../hooks/useScrollLock';

type TabType = 'home' | 'classes' | 'assessment' | 'chat' | 'more';

export const TutorPortal: React.FC = () => {
  const { tutors, settings, setViewMode, isAdmin, activeTutor: contextTutor, updateTutor, logout, bgTheme, activeCentre } = useApp();
  const centreName = activeCentre?.name || (settings as any)?.centreName || 'Tutor Portal';
  const { updatePassword } = useFirebase();

  const parseInitialTutorTab = (): TabType => {
    try {
      const hash = window.location.hash.toLowerCase();
      if (hash.startsWith('#tutor/')) {
        const tab = hash.replace('#tutor/', '') as TabType;
        if (['home', 'classes', 'assessment', 'more'].includes(tab)) {
          return tab;
        }
      }
    } catch { /* hash unavailable */ }
    // Refresh persistence: no usable hash, so reopen the saved tab.
    try {
      const saved = localStorage.getItem('EXCELLENCE_TUTORIAL_DATA_V1_tutorTab');
      if (['home', 'classes', 'assessment', 'more'].includes(saved || '')) return saved as TabType;
    } catch { /* storage unavailable */ }
    return 'home';
  };

  const [activeTab, setActiveTabState] = useState<TabType>(parseInitialTutorTab);
  const [chatThreadOpen, setChatThreadOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  // Which thing chat opens: the splash chooser first, then Status or Chat.
  const [chatMode, setChatMode] = useState<ChatMode>('status');
  const [desktopViewMode, setDesktopViewMode] = useState<'mobile_frame' | 'expanded'>('mobile_frame');

  // Sheets that render straight into the document body (the material viewer)
  // sit outside this component, so the dark remap has to travel on body too.
  useEffect(() => {
    if (bgTheme === 'dark') document.body.classList.add('tos-student-dark');
    else document.body.classList.remove('tos-student-dark');
    return () => document.body.classList.remove('tos-student-dark');
  }, [bgTheme]);

  const activeTutor = contextTutor || {
    id: 'loading',
    name: 'Loading Tutor Profile...',
    avatar: '',
    bio: '',
    phone: '',
    email: '',
    subjects: [],
    status: 'Active', // Default to Active so we don't show the overlay during loading
    rating: 0,
    hasChangedPassword: true
  };

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  useScrollLock(showLogoutConfirm);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (e) {
      console.error(e);
    }
  };

  const handlePasswordSuccess = async () => {
    await updateTutor(activeTutor.id, {
      status: 'Active',
      hasChangedPassword: true,
      temporaryPassword: null as any
    });
  };

  const setActiveTab = (tab: TabType) => {
    if (tab === 'chat') setChatMode('choose');
    setActiveTabState(tab);
    try {
      localStorage.setItem('EXCELLENCE_TUTORIAL_DATA_V1_tutorTab', tab);
      window.location.hash = `tutor/${tab}`;
    } catch (e) {
      console.error(e);
    }
  };

  // Shortcut targets handed over from the tutor homepage ('materials' opens
  // Classes on the Study Materials view, 'performance' opens Assessment on the
  // Performance view). Read once when the target tab mounts, then cleared.
  const homeFocusRef = useRef<string | null>(null);
  const navigateFromHome = (tab: string, focus?: string) => {
    homeFocusRef.current = focus || null;
    setActiveTab(tab as TabType);
  };

  useEffect(() => {
    homeFocusRef.current = null;
  });

  useEffect(() => {
    const hash = window.location.hash.toLowerCase();
    if (hash.startsWith('#tutor/')) {
      const tab = hash.replace('#tutor/', '') as TabType;
      if (['home', 'classes', 'assessment', 'more'].includes(tab)) {
        setActiveTabState(tab);
      }
    } else if (hash === '#tutor' || !hash) {
      window.location.hash = `tutor/${activeTab}`;
    }

    const handleHash = () => {
      const currentHash = window.location.hash.toLowerCase();
      if (currentHash.startsWith('#tutor/')) {
        const tab = currentHash.replace('#tutor/', '') as TabType;
        if (['home', 'classes', 'assessment', 'more'].includes(tab)) {
          setActiveTabState(tab);
          try {
            localStorage.setItem('EXCELLENCE_TUTORIAL_DATA_V1_tutorTab', tab);
          } catch {}
        }
      }
    };

    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, [activeTab]);

  return (
    <div className={`min-h-screen bg-slate-900/95 flex flex-col justify-between selection:bg-orange-500 selection:text-white ${bgTheme === 'dark' ? 'tos-student-dark' : ''}`}>
      {/* Password Change Overlay for Invited Tutors */}
      {activeTutor.status === 'Invited' && !activeTutor.hasChangedPassword && !isAdmin && (
        <PasswordChangeOverlay
          userName={activeTutor.name}
          userType="Tutor"
          userId={activeTutor.id}
          onSuccess={handlePasswordSuccess}
          onLogout={handleLogout}
        />
      )}

      {/* 1. Top Desktop Control Bar */}
      <header className="bg-slate-950 text-white px-4 py-3 z-40 sticky top-0 overflow-hidden shadow-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 relative">
          {/* Facility name, dead centre of the header menu, always shown in full */}
          <div className="flex-1 min-w-0 text-center">
            <span className="block w-full break-words leading-tight font-black text-sm uppercase tracking-[0.2em] pointer-events-none">
              {centreName}
            </span>
          </div>

          {/* Right side: notifications + install */}
          <div className="flex items-center gap-2">
            <NotificationsBell feed="tutor" onOpenChange={setBellOpen} />

            <RetryButton dark />

            <PWAInstallButton
              variant="icon"
              className="!bg-white/10 !border-white/10 hover:!bg-white/20"
            />

            <button
              onClick={() =>
                setDesktopViewMode(desktopViewMode === 'mobile_frame' ? 'expanded' : 'mobile_frame')
              }
              className="hidden lg:flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:brightness-110 text-slate-300 text-xs font-semibold border border-slate-700 transition-all"
            >
              {desktopViewMode === 'mobile_frame' ? (
                <>
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Wide View</span>
                </>
              ) : (
                <>
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Mobile Frame</span>
                </>
              )}
            </button>

          </div>
        </div>
      </header>

      {/* 2. Main Body: Shell Container */}
      <main className="flex-1 flex items-center justify-center p-0 sm:py-6 sm:px-4">
        <div
          className={`w-full transition-all duration-500 cubic-bezier(0.4, 0, 0.2, 1) ${
            desktopViewMode === 'mobile_frame'
              ? 'max-w-md mx-auto sm:rounded-[36px] sm:shadow-[0_0_60px_rgba(0,0,0,0.5)] sm:border-[8px] sm:border-slate-800'
              : 'max-w-4xl mx-auto sm:rounded-3xl sm:border sm:border-slate-800'
          } bg-slate-50 min-h-screen sm:min-h-[844px] flex flex-col relative overflow-hidden`}
        >
          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto pb-24 relative scroll-smooth">
            {activeTab === 'home' && <HomeTab tutor={activeTutor} onNavigateTab={navigateFromHome} />}
            {activeTab === 'classes' && <ScheduleTab tutor={activeTutor} initialSection={homeFocusRef.current} />}
            {activeTab === 'assessment' && <AssessmentTab tutor={activeTutor} initialView={homeFocusRef.current} />}
            {activeTab === 'chat' && (
              <>
                <div className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur px-4 py-3 -mt-1">
                  <ChatModeToggle mode={chatMode === 'choose' ? 'status' : chatMode} onChange={(m) => setChatMode(m)} />
                </div>
                {chatMode !== 'chat' && chatMode !== 'tito' && <StaffStatusScreen />}
                {chatMode === 'chat' && <ChatManager onThreadOpenChange={setChatThreadOpen} />}
              </>
            )}
            {activeTab === 'more' && (
              <MoreTab 
                tutor={activeTutor} 
                onExit={async () => {
                  if (isAdmin) {
                    setViewMode('portal');
                  } else {
                    setShowLogoutConfirm(true);
                  }
                }} 
              />
            )}
          </div>

          {/* Tutor AI: full screen over the frame like the student portal,
              composer pinned to the bottom; the header back button returns to
              the chat toggle. The bottom nav is already hidden in this mode.
              z-50 puts it above the sticky portal header (z-40): at z-30 the
              header covered the AI's own back button and trapped the portal. */}
          {activeTab === 'chat' && chatMode === 'tito' && (
            <div className="fixed inset-0 z-50 bg-white">
              <TutorAiChat mode="light" onBack={() => setChatMode('chat')} />
            </div>
          )}

          {/* 3. Bottom Navigation (Mobile App Style) */}
          <nav className={`${chatThreadOpen || chatMode === 'tito' || bellOpen ? 'hidden' : ''} fixed bottom-0 left-0 right-0 sm:absolute z-40 bg-slate-950 border-t border-slate-800 py-2 px-3 shadow-[0_-4px_20px_rgba(0,0,0,0.25)] rounded-t-[24px]`}>
            <div className="max-w-md mx-auto grid grid-cols-5 gap-1 items-center">
              {/* Home */}
              <button
                onClick={() => setActiveTab('home')}
                className={`flex flex-col items-center justify-center py-1 transition-all ${
                  activeTab === 'home' ? 'text-[var(--brand,#EA580C)] scale-110' : 'text-slate-500'
                }`}
              >
                <Home className={`w-5 h-5 ${activeTab === 'home' ? 'fill-white/10' : ''}`} />
                <span className="text-[10px] mt-1 font-bold">Home</span>
                <div className="w-1 h-1 rounded-full mt-0.5" />
              </button>

              {/* Classes */}
              <button
                onClick={() => setActiveTab('classes')}
                className={`flex flex-col items-center justify-center py-1 transition-all ${
                  activeTab === 'classes' ? 'text-[var(--brand,#EA580C)] scale-110' : 'text-slate-500'
                }`}
              >
                <Calendar className={`w-5 h-5 ${activeTab === 'classes' ? 'fill-white/10' : ''}`} />
                <span className="text-[10px] mt-1 font-bold">Classes</span>
                <div className="w-1 h-1 rounded-full mt-0.5" />
              </button>

              {/* Chat */}
              <button
                onClick={() => setActiveTab('chat')}
                className={`flex flex-col items-center justify-center py-1 transition-all ${
                  activeTab === 'chat' ? 'text-[var(--brand,#EA580C)] scale-110' : 'text-slate-500'
                }`}
              >
                <MessageSquare className={`w-5 h-5 ${activeTab === 'chat' ? 'fill-white/10' : ''}`} />
                <span className="text-[10px] mt-1 font-bold">Chat</span>
                <div className="w-1 h-1 rounded-full mt-0.5" />
              </button>

              {/* Assessment */}
              <button
                onClick={() => setActiveTab('assessment')}
                className={`flex flex-col items-center justify-center py-1 transition-all ${
                  activeTab === 'assessment' ? 'text-[var(--brand,#EA580C)] scale-110' : 'text-slate-500'
                }`}
              >
                <Laptop className={`w-5 h-5 ${activeTab === 'assessment' ? 'fill-white/10' : ''}`} />
                <span className="text-[10px] mt-1 font-bold">Assessment</span>
                <div className="w-1 h-1 rounded-full mt-0.5" />
              </button>

              {/* More */}
              <button
                onClick={() => setActiveTab('more')}
                className={`flex flex-col items-center justify-center py-1 transition-all ${
                  activeTab === 'more' ? 'text-[var(--brand,#EA580C)] scale-110' : 'text-slate-500'
                }`}
              >
                <Menu className={`w-5 h-5 ${activeTab === 'more' ? 'fill-white/10' : ''}`} />
                <span className="text-[10px] mt-1 font-bold">More</span>
                <div className="w-1 h-1 rounded-full mt-0.5" />
              </button>
            </div>
          </nav>
        </div>
      </main>
      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <LogOut className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black text-slate-900 mb-2">Sign Out?</h3>
              <p className="text-sm text-slate-500 mb-8 leading-relaxed font-medium">
                Are you sure you want to log out? You will need your credentials to sign back in.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="py-4 rounded-2xl border border-slate-200 text-slate-600 font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLogout}
                  className="py-4 rounded-2xl bg-[var(--brand,#0f172a)] text-[var(--on-brand,#fff)] font-black text-[10px] uppercase tracking-widest hover:bg-black shadow-lg shadow-black/10 transition-all active:scale-95"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
