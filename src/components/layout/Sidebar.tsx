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
  Globe,
  Bell,
  Settings,
  ChevronRight,
  ExternalLink,
  Shield,
  Award,
  Sparkles,
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
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
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
        { id: 'cbt', label: 'CBT Practice', icon: Laptop },
      ],
    },
    {
      title: 'FINANCE & ANNOUNCEMENTS',
      items: [
        { id: 'payments', label: 'Fees & Payments', icon: CreditCard },
        { id: 'announcements', label: 'Announcements', icon: Bell },
      ],
    },
    {
      title: 'PORTALS',
      items: [
        { id: 'student-portal', label: 'Student Portal', icon: Laptop },
        { id: 'tutor-portal', label: 'Tutor Portal', icon: GraduationCap },
      ],
    },
    {
      title: 'SETTINGS',
      items: [
        { id: 'staff-roles', label: 'Staff & Roles', icon: Shield },
        { id: 'settings', label: 'System Settings', icon: Settings },
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
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="px-5 py-5 border-b border-[#15233C] flex items-center justify-between">
          <div
            onClick={() => setAdminSection('dashboard')}
            className="flex items-center space-x-2.5 cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-lg bg-[#EA580C] flex items-center justify-center text-white font-extrabold text-sm shadow-md shadow-orange-950/40">
              <GraduationCap className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-baseline space-x-1 leading-none">
                <span className="text-white font-black text-sm tracking-tight">EXCELLENCE</span>
              </div>
              <span className="text-[#EA580C] font-black text-[10px] tracking-wider leading-none block mt-0.5 uppercase">
                TUTORIAL CENTRE
              </span>
            </div>
          </div>

          <button
            onClick={() => setViewMode('website')}
            title="Open Public Website"
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
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
                          isActive ? 'text-[#EA580C]' : 'text-slate-400'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </div>

                    {item.badge !== undefined && (
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                          isActive
                            ? 'bg-[#EA580C] text-white'
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

        {/* User Card at bottom */}
        <div className="p-3 border-t border-[#15233C]">
          <div
            id="sidebar-user-card"
            onClick={() => setAdminSection('account')}
            className="flex items-center justify-between p-2 rounded-xl bg-[#0F1B2E]/60 hover:bg-[#0F1B2E] border border-transparent hover:border-slate-800 cursor-pointer transition-all group"
          >
            <div className="flex items-center space-x-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-lg bg-[#EA580C] flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm">
                {(activeUser?.name || 'EX').slice(0, 2).toUpperCase()}
              </div>
              <div className="text-left overflow-hidden">
                <p className="text-white font-bold text-xs truncate group-hover:text-[#EA580C] transition-colors">
                  {activeUser?.name || 'Administrator'}
                </p>
                <p className="text-slate-400 text-[10px] truncate">{activeUser?.role || 'Staff Member'}</p>
              </div>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-white transition-colors shrink-0" />
          </div>
        </div>
      </aside>
    </>
  );
};
