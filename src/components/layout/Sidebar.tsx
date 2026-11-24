import React from 'react';
import { useApp, AdminSection } from '../../context/AppContext';
import {
  LayoutDashboard,
  Building2,
  Users,
  UserPlus,
  GraduationCap,
  BookOpen,
  Calendar,
  UserCheck,
  BarChart3,
  Laptop,
  CreditCard,
  Layers,
  Bell,
  Settings,
  ExternalLink,
  Shield,
  Award,
  Sparkles,
  MessageSquare,
  Wallet,
  X,
} from 'lucide-react';

interface SidebarProps {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, setMobileOpen }) => {
  const {
    settings,
    adminSection,
    setAdminSection,
    admissions,
    students,
    tutors,
    branches,
    activeUser,
    setViewMode,
    centreName,
    activeCentre,
  } = useApp();

  const pendingAdmissionsCount = admissions.filter((a) => a.status === 'Pending').length;

  const navGroups: {
    title: string;
    items: {
      id: AdminSection;
      label: string;
      icon: React.ElementType;
      badge?: number | string;
    }[];
  }[] = [
    {
      title: 'MENU',
      items: [
        { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
        { id: 'students', label: 'Students', icon: Users, badge: students.length },
        {
          id: 'subjects',
          label: 'Subjects',
          icon: BookOpen,
        },
        { id: 'tutors', label: 'Tutors', icon: GraduationCap, badge: tutors.length },
      ],
    },
    {
      title: 'ACADEMICS',
      items: [
        { id: 'programmes', label: 'Exam Programs', icon: Layers },
        { id: 'timetable', label: 'Timetable', icon: Calendar },
        { id: 'attendance', label: 'Attendance', icon: UserCheck },
        { id: 'results', label: 'Performance', icon: BarChart3 },
        { id: 'cbt', label: 'Tutors Assessment', icon: Laptop },
      ],
    },
    {
      title: 'FINANCE & ANNOUNCEMENTS',
      items: [
        { id: 'payments', label: 'Fees & Payments', icon: CreditCard },
        { id: 'staff-pay', label: 'Staff Pay', icon: Wallet },
        { id: 'announcements', label: 'Announcements', icon: Bell },
        { id: 'chat', label: 'Chat', icon: MessageSquare },
      ],
    },
    {
      title: 'SETTINGS',
      items: [
        { id: 'staff-roles', label: 'Staff & Roles', icon: Shield },
        { id: 'settings', label: 'Facility Settings', icon: Settings },
      ],
    },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          id="sidebar-mobile-backdrop"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-xs"
        />
      )}

      <aside
        id="app-main-sidebar"
        className={`fixed lg:static top-0 left-0 bottom-0 z-50 w-60 bg-[#070F1E] border-r border-[#15233C] flex flex-col transition-transform duration-300 ease-in-out ${
          mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="px-5 py-5 border-b border-[#15233C] flex items-center justify-between">
          <div
            onClick={() => setAdminSection('dashboard')}
            className="flex items-center space-x-2.5 cursor-pointer group"
          >
            {activeCentre?.logoUrl ? (
              <img src={activeCentre.logoUrl} alt={centreName} className="w-8 h-8 rounded-lg object-cover shadow-md" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center text-white font-extrabold text-sm shadow-md shadow-orange-950/40">
                <GraduationCap className="w-4 h-4 text-white" />
              </div>
            )}
            <div>
              <div className="flex items-baseline space-x-1 leading-none">
                <span className="text-white font-black text-sm tracking-tight truncate max-w-[9.5rem]">{(centreName.split(/\s+/)[0] || 'TUTORIAL').toUpperCase()}</span>
              </div>
              <span className="text-orange-600 font-black text-[10px] tracking-wider leading-none block mt-0.5 uppercase truncate max-w-[9.5rem]">
                {centreName.split(/\s+/).slice(1).join(' ') || 'EDUCATION FACILITY'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewMode('website')}
              title="Open Public Website"
              className="p-1.5 rounded-md text-slate-400 hover:text-white hover:brightness-110 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
            <button
              onClick={() => setMobileOpen(false)}
              title="Close menu"
              aria-label="Close menu"
              className="lg:hidden p-1.5 rounded-md text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Sections */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5 scrollbar-thin scrollbar-thumb-slate-800">
          {navGroups.map((group) => (
            <div key={group.title} className="space-y-1">
              <p className="px-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5">
                {group.title}
              </p>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = adminSection === item.id;

                return (
                  <button
                    key={item.id}
                    id={`nav-item-${item.id}`}
                    onClick={() => {
                      setAdminSection(item.id);
                      setMobileOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-[#132238] border border-slate-700/60 text-white font-semibold shadow-xs'
                        : 'text-slate-400 hover:text-white hover:bg-[#0F1B2E]'
                    }`}
                  >
                    <div className="flex items-center space-x-3 truncate">
                      <Icon
                        className={`w-4 h-4 shrink-0 transition-colors ${
                          isActive ? 'text-orange-600' : 'text-slate-400'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </div>

                    {item.badge !== undefined && (
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                          isActive
                            ? 'bg-orange-600 text-white'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

      </aside>
    </>
  );
};
