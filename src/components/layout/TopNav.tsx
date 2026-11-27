import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { PWAInstallButton } from '../pwa/PWAInstallButton';
import { useScrollLock } from '../../hooks/useScrollLock';
import { RetryButton } from '../common/RetryButton';
import {
  Search,
  Bell,
  Menu,
  ExternalLink,
  ChevronDown,
  User,
  Globe,
  LogOut,
  ShieldCheck,
  Clock,
  Sparkles,
  CheckCircle2,
  Sun,
  Moon,
  Shield,
  Wallet,
  MessageCircle,
} from 'lucide-react';
import { api } from '../tos/tosShared';
import { computeNextPayDate, payDueStatus, overdueDays } from '../../lib/staffPay';
import { formatDateLong } from '../../lib/paymentDates';

interface TopNavProps {
  onToggleMobileMenu: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({ onToggleMobileMenu }) => {
  const {
    settings,
    adminSection,
    setAdminSection,
    globalSearch,
    setGlobalSearch,
    admissions,
    payments,
    admins,
    activeCentreId,
    activeUser,
    viewMode,
    setViewMode,
    activeCentre,
    addToast,
    bgTheme,
    toggleBgTheme,
    logout,
  } = useApp();

  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  useScrollLock(showLogoutConfirm);

  const notifRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const pendingAdmissions = admissions.filter((a) => a.status === 'Pending');

  // ---------------------------------------------------------------------------
  // The bell is a notifications inbox, NOT an activity feed. The facility
  // activity log (with who did what and the exact time) lives on the dashboard
  // timeline card. The bell itself carries the things an admin must act on:
  //   1. a new request from the public landing page (pending admission)
  //   2. a new payment a student submitted and is waiting to be confirmed
  //   3. a staff salary due date (today or overdue)
  //   4. new messages in the chat channels this admin belongs to
  // ---------------------------------------------------------------------------

  type BellNotification = {
    id: string;
    kind: 'admission' | 'payment' | 'salary' | 'channel';
    title: string;
    detail: string;
    when: string;
    section: string;
  };

  // Channel names + latest message come from the same chat bootstrap the chat
  // screen uses, refreshed quietly while the admin works.
  interface ChannelLastMessage { text: string; at: number; removed: boolean; role: string }
  interface ChannelGroup { id: string; name: string; kind: string; lastMessage?: ChannelLastMessage | null }
  const [channelGroups, setChannelGroups] = useState<ChannelGroup[]>([]);

  const isAdminPortal = viewMode === 'portal' && !!activeCentreId;
  useEffect(() => {
    if (!isAdminPortal || !activeCentreId) return;
    let alive = true;
    const pull = async () => {
      try {
        const res = await api(`/api/centre/chat/bootstrap?centreId=${encodeURIComponent(activeCentreId)}`);
        if (alive && res?.groups) setChannelGroups(res.groups as ChannelGroup[]);
      } catch { /* the bell stays quiet when chat is unreachable */ }
    };
    pull();
    const t = setInterval(pull, 90000);
    return () => { alive = false; clearInterval(t); };
  }, [isAdminPortal, activeCentreId]);

  // Channels are read-only until the admin opens them or taps Mark all read.
  const channelSeenKey = activeUser ? `tos:bell:channelSeen:${activeUser.id || activeUser.email}` : '';
  const [channelSeenAt, setChannelSeenAt] = useState<number>(() => {
    try { return Number(localStorage.getItem(channelSeenKey) || 0); } catch { return 0; }
  });
  const markChannelsRead = () => {
    const now = Date.now();
    try { if (channelSeenKey) localStorage.setItem(channelSeenKey, String(now)); } catch { /* ignore */ }
    setChannelSeenAt(now);
  };

  const notifications: BellNotification[] = React.useMemo(() => {
    const list: BellNotification[] = [];

    // 1. New requests from the landing page
    pendingAdmissions.forEach((a) => list.push({
      id: `adm-${a.id}`,
      kind: 'admission',
      title: `New request from the landing page: ${a.applicantName}`,
      detail: `Applied for ${a.programmeName}. Review and approve.`,
      when: 'Pending review',
      section: 'admissions',
    }));

    // 2. New payments students submitted (awaiting confirmation)
    payments
      .filter((p) => p.status === 'Pending')
      .forEach((p) => list.push({
        id: `pay-${p.id}`,
        kind: 'payment',
        title: `New payment from ${p.studentName}`,
        detail: `${p.method} • ${p.amountPaid.toLocaleString()} claimed for ${p.programmeName}. Confirm or decline.`,
        when: p.date,
        section: 'payments',
      }));

    // 3. Staff salary due dates (today or overdue)
    admins.forEach((adm) => {
      if (!adm.payFrequency) return;
      const nextISO = computeNextPayDate(adm.payFrequency, adm.payDay, adm.lastPaidAt);
      const st = payDueStatus(nextISO);
      if (st === 'none') return;
      list.push({
        id: `sal-${adm.id}`,
        kind: 'salary',
        title: `Staff salary due: ${adm.name}`,
        detail: st === 'overdue'
          ? `Was due ${formatDateLong(nextISO)} (${overdueDays(nextISO)} day${overdueDays(nextISO) === 1 ? '' : 's'} overdue).`
          : `Due today, ${formatDateLong(nextISO)}.`,
        when: st === 'overdue' ? 'Overdue' : 'Due today',
        section: 'staff-pay',
      });
    });

    // 4. New messages in the channels this admin belongs to
    channelGroups
      .filter((g) => g.kind === 'tos_channel'
        && g.lastMessage
        && !g.lastMessage.removed
        && g.lastMessage.at > channelSeenAt
        && g.lastMessage.at > Date.now() - 7 * 86400000)
      .forEach((g) => list.push({
        id: `chn-${g.id}-${g.lastMessage!.at}`,
        kind: 'channel',
        title: `New message in ${g.name}`,
        detail: g.lastMessage!.text.length > 90 ? `${g.lastMessage!.text.slice(0, 90)}…` : g.lastMessage!.text,
        when: new Date(g.lastMessage!.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        section: 'chat',
      }));

    return list;
  }, [pendingAdmissions, payments, admins, channelGroups, channelSeenAt]);

  const handleLogout = async () => {
    setShowLogoutConfirm(false);
    setShowUserMenu(false);
    try {
      await logout();
      addToast({
        type: 'success',
        title: 'Logged Out',
        description: 'You have been successfully signed out.',
      });
    } catch (e) {
      addToast({
        type: 'error',
        title: 'Logout Failed',
        description: 'An error occurred while signing out.',
      });
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header
      id="app-top-nav"
      className="h-16 bg-white border-b border-slate-100 px-4 md:px-8 flex items-center justify-between sticky top-0 z-30 shadow-2xs"
    >
      {/* Left: Mobile Menu Toggle & Global Search Bar */}
      <div className="flex items-center space-x-3 flex-1 max-w-xl">
        <button
          id="mobile-menu-toggle-btn"
          onClick={onToggleMobileMenu}
          className="lg:hidden p-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 active:scale-95 transition-all"
          aria-label="Toggle Navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Global Search (as in video 00:00: "Q Search schools, students...") */}
        <div className="relative flex items-center bg-[#F8FAFC] border border-slate-200/80 rounded-xl px-3.5 py-1.5 w-full max-w-md focus-within:bg-white focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/10 transition-all">
          <Search className="w-4 h-4 text-slate-400 mr-2.5 shrink-0" />
          <input
            id="global-search-input"
            type="text"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            placeholder="Search students, programmes..."
            className="bg-transparent text-xs outline-none w-full text-slate-800 placeholder:text-slate-400"
          />
          {globalSearch && (
            <button
              onClick={() => setGlobalSearch('')}
              className="text-[10px] font-bold text-slate-400 hover:text-slate-700 ml-1"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center space-x-3 md:space-x-4 shrink-0 ml-4">
        {/* PWA Install Button */}
        <PWAInstallButton
          variant="compact"
          className="hidden lg:flex"
          centreName={activeCentre?.name || undefined}
          guideUrl={activeCentre ? `${window.location.origin}/${String(activeCentre.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '')}` : undefined}
        />

        {/* Switcher Button: Public Website */}
        <button
          id="switch-to-website-btn"
          onClick={() => setViewMode(viewMode === 'portal' ? 'website' : 'portal')}
          className="hidden sm:flex items-center space-x-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-2xs"
        >
          <Globe className="w-3.5 h-3.5 text-orange-600" />
          <span>{viewMode === 'portal' ? 'Public Website' : 'Return to Admin'}</span>
          <ExternalLink className="w-3 h-3 text-slate-400" />
        </button>

        {/* Retry: one tap refreshes the whole app */}
        <RetryButton />

        {/* Notifications Bell (00:00, 02:15) */}
        <div className="relative" ref={notifRef}>
          <button
            id="notifications-bell-btn"
            onClick={() => setShowNotifications(!showNotifications)}
            className="w-9 h-9 rounded-xl border border-slate-200/80 bg-white flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors relative shadow-2xs"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4 text-slate-600" />
            {notifications.length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-orange-600 rounded-full ring-2 ring-white text-white text-[9px] font-black flex items-center justify-center">
                {notifications.length > 9 ? '9+' : notifications.length}
              </span>
            )}
          </button>

          {showNotifications && (
            <div
              id="notifications-dropdown"
              className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-slate-200/80 py-3 z-50 animate-in fade-in zoom-in-95 duration-150"
            >
              <div className="px-4 pb-2.5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <h2 className="text-xs font-bold text-slate-900">Notifications</h2>
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-orange-50 text-orange-600 rounded-md">
                    {notifications.length} New
                  </span>
                </div>
                <button
                  onClick={markChannelsRead}
                  className="text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-orange-600"
                >
                  Mark all read
                </button>
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                {notifications.length === 0 && (
                  <div className="p-6 text-center">
                    <CheckCircle2 className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                    <p className="text-xs font-bold text-slate-700">You're all caught up</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">New requests, payments, salary dates and channel messages will land here.</p>
                  </div>
                )}
                {notifications.map((n) => {
                  const Icon = n.kind === 'admission' ? User
                    : n.kind === 'payment' ? Wallet
                    : n.kind === 'salary' ? Clock
                    : MessageCircle;
                  const tone = n.kind === 'admission' ? 'bg-orange-100 text-orange-600'
                    : n.kind === 'payment' ? 'bg-emerald-100 text-emerald-600'
                    : n.kind === 'salary' ? 'bg-rose-100 text-rose-600'
                    : 'bg-indigo-100 text-indigo-600';
                  return (
                    <div
                      key={n.id}
                      onClick={() => {
                        setAdminSection(n.section as any);
                        setShowNotifications(false);
                      }}
                      className="p-3 hover:bg-orange-50/40 cursor-pointer transition-colors flex items-start space-x-3"
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold mt-0.5 ${tone}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-900 leading-snug">{n.title}</p>
                        <p className="text-[11px] text-slate-500 leading-snug">{n.detail}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5 font-semibold">{n.when}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          )}
        </div>

        {/* User Profile Avatar Dropdown (matches video 00:00, 02:10: PA circle in peach) */}
        {/* User Profile Avatar Dropdown (matches video 00:00, 02:10: PA circle in peach) */}
        <div className="relative" ref={userMenuRef}>
          <button
            id="user-profile-menu-btn"
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center space-x-2 p-1 pl-1.5 pr-2 rounded-full border border-slate-200/80 hover:border-slate-300 bg-white transition-all shadow-2xs cursor-pointer"
          >
            <div className="w-7 h-7 rounded-full bg-orange-200 text-orange-700 flex items-center justify-center font-bold text-xs">
              {activeUser?.name ? activeUser.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() : 'PA'}
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {showUserMenu && (
            <div
              id="user-profile-dropdown"
              className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200/80 py-2 z-50 animate-in fade-in zoom-in-95 duration-150"
            >
              <div className="px-4 py-3 border-b border-slate-100">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-lg bg-orange-200 text-orange-700 flex items-center justify-center font-bold text-sm">
                    {activeUser?.name ? activeUser.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() : 'PA'}
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-sm font-bold text-slate-900 truncate">
                      {activeUser?.name || 'Platform Admin'}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{activeUser?.email}</p>
                  </div>
                </div>
                <div className="mt-2.5">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700">
                    <ShieldCheck className="w-3 h-3 mr-1 text-purple-600" />
                    {activeUser?.role || 'Super Admin'}
                  </span>
                </div>
              </div>

              {/* Appearance: App Background (Light / Dark). Batch 58: the
                  control sits on the left of the row under its own caption,
                  lining up with the rest of the menu instead of hugging the
                  right edge. */}
              <div
                id="bg-theme-toggle-container"
                className="px-4 py-3 border-b border-slate-100 bg-slate-50/70"
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Appearance</p>
                <div className="flex items-center gap-3">

                  <div className="flex items-center rounded-xl bg-white border border-slate-200 p-0.5 shadow-sm shrink-0">
                    {([
                      { key: 'light', label: 'Light', Icon: Sun },
                      { key: 'dark', label: 'Dark', Icon: Moon },
                    ] as const).map(({ key, label, Icon }) => {
                      const active = bgTheme === key;
                      return (
                        <button
                          key={key}
                          id={`profile-theme-${key}`}
                          type="button"
                          aria-pressed={active}
                          aria-label={`App background ${label} mode`}
                          onClick={() => {
                            if (bgTheme === key) return;
                            toggleBgTheme();
                            addToast({
                              type: 'info',
                              title: key === 'dark' ? 'Dark Background Activated' : 'Light Background Activated',
                            });
                          }}
                          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-[10px] text-[11px] font-bold transition-all duration-200 ${
                            active
                              ? 'bg-[var(--brand,#0F172A)] text-[var(--on-brand,#fff)] shadow-sm'
                              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="py-1">
                <button
                  onClick={() => {
                    setAdminSection('profile');
                    setShowUserMenu(false);
                  }}
                  className="w-full px-4 py-2 text-xs font-semibold text-orange-600 hover:bg-orange-50 flex items-center space-x-2.5"
                >
                  <User className="w-4 h-4 text-orange-600" />
                  <span>Go to Profile</span>
                </button>
              </div>

              <div className="pt-1 border-t border-slate-100">
                <button
                  onClick={() => setShowLogoutConfirm(true)}
                  className="w-full px-4 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 flex items-center space-x-2.5"
                >
                  <LogOut className="w-4 h-4 text-rose-500" />
                  <span>Log Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <LogOut className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Sign Out?</h3>
              <p className="text-sm text-slate-500 mb-8 leading-relaxed">
                Are you sure you want to log out? You will need your credentials to sign back in.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="py-3 px-4 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLogout}
                  className="py-3 px-4 rounded-xl bg-[var(--brand,#0f172a)] text-[var(--on-brand,#fff)] font-bold text-sm hover:bg-black shadow-lg shadow-black/10 transition-all active:scale-95"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
