import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { useFirebase } from '../../context/FirebaseContext';
import { HomeTab } from './tabs/HomeTab';
import { ScheduleTab } from './tabs/ScheduleTab';
import { RollCallTab } from './tabs/RollCallTab';
import { AssessmentTab } from './tabs/AssessmentTab';
import { MoreTab } from './tabs/MoreTab';
import { ChatManager } from '../communications/ChatManager';
import { PWAInstallButton } from '../pwa/PWAInstallButton';
import {
  Home,
  Calendar,
  UserCheck,
  Award,
  Menu,
  Smartphone,
  Maximize2,
  Bell,
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
  const { tutors, settings, setViewMode, isAdmin, activeTutor: contextTutor, updateTutor, logout } = useApp();
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
    } catch {}
    return 'home';
  };

  const [activeTab, setActiveTabState] = useState<TabType>(parseInitialTutorTab);
  const [desktopViewMode, setDesktopViewMode] = useState<'mobile_frame' | 'expanded'>('mobile_frame');

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
    setActiveTabState(tab);
    try {
      localStorage.setItem('EXCELLENCE_TUTORIAL_DATA_V1_tutorTab', tab);
      window.location.hash = `tutor/${tab}`;
    } catch (e) {
      console.error(e);
    }
  };

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
    <div className="min-h-screen bg-slate-900/95 flex flex-col justify-between selection:bg-orange-500 selection:text-white">
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
      <header className="bg-slate-950/80 backdrop-blur-md border-b border-slate-800 text-white px-4 py-2.5 z-40 sticky top-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#EA580C] animate-pulse shrink-0" />
            <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">
              Tutor Portal
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <PWAInstallButton variant="pill" />
            
            <button
               className="w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 flex items-center justify-center border border-slate-700 transition-all relative"
               aria-label="Notifications"
            >
               <Bell className="w-4 h-4" />
               <span className="absolute top-2 right-2 w-2 h-2 bg-[#EA580C] rounded-full ring-2 ring-slate-900 animate-pulse" />
            </button>

            <button
              onClick={() =>
                setDesktopViewMode(desktopViewMode === 'mobile_frame' ? 'expanded' : 'mobile_frame')
              }
              className="hidden lg:flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-all"
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

            <button 
              onClick={async () => {
                if (isAdmin) {
                  setViewMode('portal');
                } else {
                  setShowLogoutConfirm(true);
                }
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-rose-500/20 hover:text-rose-400 text-slate-400 border border-slate-700 transition-all flex items-center space-x-2"
              title={isAdmin ? "Switch to Admin" : "Logout"}
            >
              {isAdmin ? (
                <>
                  <Shield className="w-4 h-4" />
                  <span className="text-[10px] font-bold uppercase tracking-widest hidden sm:inline">Switch to Admin</span>
                </>
              ) : (
                <LogOut className="w-4 h-4" />
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
            {activeTab === 'home' && <HomeTab tutor={activeTutor} onNavigateTab={setActiveTab} />}
            {activeTab === 'classes' && <ScheduleTab tutor={activeTutor} />}
            {activeTab === 'assessment' && <AssessmentTab tutor={activeTutor} />}
            {activeTab === 'chat' && <ChatManager />}
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

          {/* 3. Bottom Navigation (Mobile App Style) */}
          <nav className="fixed bottom-0 left-0 right-0 sm:absolute z-40 bg-[#EA580C] border-t border-orange-600/30 py-2 px-3 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] rounded-t-[24px]">
            <div className="max-w-md mx-auto grid grid-cols-5 gap-1 items-center">
              {/* Home */}
              <button
                onClick={() => setActiveTab('home')}
                className={`flex flex-col items-center justify-center py-1 transition-all ${
                  activeTab === 'home' ? 'text-white scale-110' : 'text-orange-100/70'
                }`}
              >
                <Home className={`w-5 h-5 ${activeTab === 'home' ? 'fill-white/10' : ''}`} />
                <span className="text-[10px] mt-1 font-bold">Home</span>
                {activeTab === 'home' && <div className="w-1 h-1 bg-white rounded-full mt-0.5" />}
              </button>

              {/* Classes */}
              <button
                onClick={() => setActiveTab('classes')}
                className={`flex flex-col items-center justify-center py-1 transition-all ${
                  activeTab === 'classes' ? 'text-white scale-110' : 'text-orange-100/70'
                }`}
              >
                <Calendar className={`w-5 h-5 ${activeTab === 'classes' ? 'fill-white/10' : ''}`} />
                <span className="text-[10px] mt-1 font-bold">Classes</span>
                {activeTab === 'classes' && <div className="w-1 h-1 bg-white rounded-full mt-0.5" />}
              </button>

              {/* Assessment */}
              <button
                onClick={() => setActiveTab('assessment')}
                className={`flex flex-col items-center justify-center py-1 transition-all ${
                  activeTab === 'assessment' ? 'text-white scale-110' : 'text-orange-100/70'
                }`}
              >
                <Laptop className={`w-5 h-5 ${activeTab === 'assessment' ? 'fill-white/10' : ''}`} />
                <span className="text-[10px] mt-1 font-bold">Assessment</span>
                {activeTab === 'assessment' && <div className="w-1 h-1 bg-white rounded-full mt-0.5" />}
              </button>

              {/* Chat */}
              <button
                onClick={() => setActiveTab('chat')}
                className={`flex flex-col items-center justify-center py-1 transition-all ${
                  activeTab === 'chat' ? 'text-white scale-110' : 'text-orange-100/70'
                }`}
              >
                <MessageSquare className={`w-5 h-5 ${activeTab === 'chat' ? 'fill-white/10' : ''}`} />
                <span className="text-[10px] mt-1 font-bold">Chat</span>
                {activeTab === 'chat' && <div className="w-1 h-1 bg-white rounded-full mt-0.5" />}
              </button>

              {/* More */}
              <button
                onClick={() => setActiveTab('more')}
                className={`flex flex-col items-center justify-center py-1 transition-all ${
                  activeTab === 'more' ? 'text-white scale-110' : 'text-orange-100/70'
                }`}
              >
                <Menu className={`w-5 h-5 ${activeTab === 'more' ? 'fill-white/10' : ''}`} />
                <span className="text-[10px] mt-1 font-bold">More</span>
                {activeTab === 'more' && <div className="w-1 h-1 bg-white rounded-full mt-0.5" />}
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
                  className="py-4 rounded-2xl bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest hover:bg-black shadow-lg shadow-black/10 transition-all active:scale-95"
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
