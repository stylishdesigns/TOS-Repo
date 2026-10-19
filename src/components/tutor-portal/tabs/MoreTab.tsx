import React, { useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { Tutor } from '../../../types';
import { 
  BookOpen, 
  Users, 
  LogOut, 
  ChevronRight, 
  Plus, 
  FileText,
  ShieldCheck,
  Smartphone,
  Settings,
  X,
  Building2,
  Check
} from 'lucide-react';

interface MoreTabProps {
  tutor: Tutor;
  onExit: () => void;
}

export const MoreTab: React.FC<MoreTabProps> = ({ tutor, onExit }) => {
  const { students, addToast, activeCentreId, userCentres, switchCentre } = useApp();
  const [showTopicModal, setShowTopicModal] = useState(false);


  const menuItems = [
    { id: 'profile', icon: ShieldCheck, label: 'Faculty Credentials', color: 'text-blue-500', bg: 'bg-blue-50' },
    { id: 'students', icon: Users, label: `Enrolled Students (${students.length})`, color: 'text-orange-500', bg: 'bg-orange-50' },
    { id: 'proposals', icon: BookOpen, label: 'Subject Topic Proposals', color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { id: 'materials', icon: FileText, label: 'Upload Study Materials', color: 'text-purple-500', bg: 'bg-purple-50' },
    { id: 'settings', icon: Settings, label: 'App Settings & Sync', color: 'text-slate-500', bg: 'bg-slate-50' },
  ];

  const handlePropose = (e: React.FormEvent) => {
    e.preventDefault();
    setShowTopicModal(false);
    addToast({
      type: 'success',
      title: 'Topic Proposal Sent',
      description: 'Your proposed topic has been sent to the Directorate for review.',
    });
  };

  return (
    <div className="p-5 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-32">
      {/* 1. Header Profile */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs flex flex-col items-center text-center space-y-3">
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-slate-100 border-4 border-white shadow-md flex items-center justify-center text-2xl font-black text-slate-400">
            {tutor.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
          </div>
          <div className="absolute bottom-0 right-0 w-6 h-6 bg-emerald-500 border-2 border-white rounded-full shadow-sm flex items-center justify-center">
            <ShieldCheck className="w-3 h-3 text-white" />
          </div>
        </div>
        <div>
          <h2 className="text-lg font-black text-slate-900 tracking-tight">{tutor.name}</h2>
          <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">{tutor.role || 'Senior Tutor'} • {tutor.department}</p>
        </div>
      </div>

      {/* My Centres Switcher (Part A, point 6) */}
      {userCentres.length > 0 && (
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-800 tracking-tight flex items-center gap-2">
              <Building2 className="w-4 h-4 text-orange-500" />
              <span>My Centres</span>
            </span>
            <span className="text-[10px] text-slate-400 font-bold uppercase">
              {userCentres.length} Assigned
            </span>
          </div>

          <div className="space-y-2">
            {userCentres.map((centre) => {
              const isActive = centre.centreId === activeCentreId;
              return (
                <button
                  key={centre.centreId}
                  onClick={() => !isActive && switchCentre(centre.centreId)}
                  className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition-all ${
                    isActive
                      ? 'border-orange-500/50 bg-orange-50/50 text-slate-900 cursor-default'
                      : 'border-slate-100 hover:border-slate-300 hover:bg-slate-50 text-slate-600 cursor-pointer active:scale-[0.98]'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                      isActive ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {centre.centreName.charAt(0)}
                    </div>
                    <div>
                      <p className="text-xs font-black text-slate-900">{centre.centreName}</p>
                      <p className="text-[10px] text-slate-400 capitalize">{centre.role}</p>
                    </div>
                  </div>
                  {isActive ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      Active
                    </span>
                  ) : (
                    <span className="text-[10px] text-orange-600 font-bold hover:underline">
                      Switch
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Menu Sections */}
      <div className="space-y-2">

        {menuItems.map((item) => (
          <button 
            key={item.id}
            onClick={() => item.id === 'proposals' && setShowTopicModal(true)}
            className="w-full bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between group active:scale-[0.98] transition-all"
          >
            <div className="flex items-center space-x-3">
              <div className={`p-2 rounded-xl ${item.bg} ${item.color}`}>
                <item.icon className="w-5 h-5" />
              </div>
              <span className="text-xs font-black text-slate-700 tracking-tight">{item.label}</span>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-600 transition-all" />
          </button>
        ))}
      </div>

      {/* 3. Dangerous Actions */}
      <div className="pt-2">
        <button 
          onClick={onExit}
          className="w-full p-4 rounded-2xl border border-rose-100 bg-rose-50 flex items-center justify-between group active:scale-[0.98] transition-all"
        >
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-rose-500 text-white">
              <LogOut className="w-5 h-5" />
            </div>
            <span className="text-xs font-black text-rose-700 tracking-tight">Logout & Exit Portal</span>
          </div>
          <ChevronRight className="w-4 h-4 text-rose-300 group-hover:text-rose-500 transition-all" />
        </button>
      </div>

      {/* 4. Footer Info */}
      <div className="text-center space-y-1 py-4">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center justify-center space-x-1">
          <Smartphone className="w-3 h-3" />
          <span>Portal Version 4.2.0 (Mobile Ready)</span>
        </p>
        <p className="text-[9px] text-slate-300 font-medium">© Excellence Tutorial Centre • 2026</p>
      </div>

      {/* Propose Topic Modal */}
      {showTopicModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-[32px] max-w-sm w-full p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-black text-slate-900 tracking-tight">Propose New Topic</h3>
              <button onClick={() => setShowTopicModal(false)} className="p-1 rounded-full hover:bg-slate-100 transition-all">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            
            <form onSubmit={handlePropose} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">Topic Title</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Organic Chemistry: Alkanes"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs focus:outline-none focus:border-orange-500 transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-1">Learning Objectives</label>
                <textarea 
                  rows={3}
                  required
                  placeholder="What should students master?"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-xs focus:outline-none focus:border-orange-500 transition-all resize-none"
                />
              </div>

              <button 
                type="submit"
                className="w-full bg-[#EA580C] text-white py-4 rounded-2xl font-black text-sm shadow-xl shadow-orange-100 active:scale-[0.98] transition-all mt-2"
              >
                Send for Review
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
