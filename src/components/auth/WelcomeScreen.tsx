import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { 
  GraduationCap, 
  Users, 
  ShieldCheck, 
  ArrowRight,
  Sparkles
} from 'lucide-react';

export const WelcomeScreen: React.FC<{ onSelectRole: (role: 'student' | 'tutor' | 'admin') => void }> = ({ onSelectRole }) => {
  const [showSplash, setShowSplash] = useState(true);
  const { settings, centreName } = useApp();

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  if (showSplash) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-900 overflow-hidden relative">
        {/* Abstract background elements */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px] animate-pulse delay-700" />
        
        <div className="relative flex flex-col items-center animate-in fade-in zoom-in duration-1000">
          <div className="w-24 h-24 mb-8 relative">
            <div className="absolute inset-0 bg-orange-500 rounded-3xl rotate-6 animate-pulse" />
            <div className="absolute inset-0 bg-slate-800 rounded-3xl flex items-center justify-center border border-white/10">
              <GraduationCap className="w-12 h-12 text-orange-500" />
            </div>
          </div>
          
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-black tracking-[0.3em] uppercase text-white">
              {centreName}
            </h1>
            <div className="flex items-center justify-center space-x-2">
              <div className="h-[1px] w-8 bg-orange-500/50" />
              <p className="text-[10px] text-orange-500 font-black uppercase tracking-[0.5em]">Tutorial Centre</p>
              <div className="h-[1px] w-8 bg-orange-500/50" />
            </div>
          </div>
        </div>

        <div className="absolute bottom-12 left-0 right-0 flex justify-center">
          <div className="flex space-x-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-bounce [animation-delay:-0.3s]" />
            <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-bounce [animation-delay:-0.15s]" />
            <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-bounce" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-slate-900 flex items-center justify-center p-4 md:p-8 selection:bg-orange-500 selection:text-white relative overflow-hidden">
      {/* Dynamic Background */}
      <div className="absolute top-0 left-0 w-full h-full">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-orange-500/5 rounded-full blur-[150px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-blue-500/5 rounded-full blur-[150px]" />
      </div>

      <div className="w-full max-w-4xl relative z-10">
        <div className="text-center mb-12 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 mb-6">
            <Sparkles className="w-3 h-3 text-orange-500" />
            <span className="text-[10px] font-black uppercase tracking-widest text-orange-500">Academic Excellence Awaits</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-4 leading-tight">
            Select Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600">Access Portal</span>
          </h2>
          <p className="text-slate-400 max-w-lg mx-auto text-sm font-medium">
            Welcome to {centreName}. Please choose the appropriate portal to continue to your dashboard.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Student Card */}
          <button 
            onClick={() => onSelectRole('student')}
            className="group relative p-8 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-orange-500/50 rounded-[2.5rem] text-left transition-all duration-500 hover:translate-y-[-8px] animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100"
          >
            <div className="w-14 h-14 bg-orange-500 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-orange-500/20 group-hover:scale-110 transition-transform duration-500">
              <GraduationCap className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Student</h3>
            <p className="text-slate-400 text-xs font-medium leading-relaxed mb-6">
              Access your courses, results, CBT practice, and academic performance tracking.
            </p>
            <div className="flex items-center text-orange-500 text-[10px] font-black uppercase tracking-widest group-hover:translate-x-2 transition-transform">
              <span>Enter Portal</span>
              <ArrowRight className="w-3 h-3 ml-2" />
            </div>
          </button>

          {/* Tutor Card */}
          <button 
            onClick={() => onSelectRole('tutor')}
            className="group relative p-8 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-blue-500/50 rounded-[2.5rem] text-left transition-all duration-500 hover:translate-y-[-8px] animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200"
          >
            <div className="w-14 h-14 bg-blue-500 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-blue-500/20 group-hover:scale-110 transition-transform duration-500">
              <Users className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Tutor</h3>
            <p className="text-slate-400 text-xs font-medium leading-relaxed mb-6">
              Manage classes, attendance, upload results, and communicate with students.
            </p>
            <div className="flex items-center text-blue-400 text-[10px] font-black uppercase tracking-widest group-hover:translate-x-2 transition-transform">
              <span>Staff Login</span>
              <ArrowRight className="w-3 h-3 ml-2" />
            </div>
          </button>

          {/* Admin Card */}
          <button 
            onClick={() => onSelectRole('admin')}
            className="group relative p-8 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-slate-500/50 rounded-[2.5rem] text-left transition-all duration-500 hover:translate-y-[-8px] animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300"
          >
            <div className="w-14 h-14 bg-slate-700 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-slate-700/20 group-hover:scale-110 transition-transform duration-500">
              <ShieldCheck className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Management</h3>
            <p className="text-slate-400 text-xs font-medium leading-relaxed mb-6">
              Full administrative access to finance, staff roles, settings, and centre operations.
            </p>
            <div className="flex items-center text-slate-300 text-[10px] font-black uppercase tracking-widest group-hover:translate-x-2 transition-transform">
              <span>Admin Access</span>
              <ArrowRight className="w-3 h-3 ml-2" />
            </div>
          </button>
        </div>

        <div className="mt-12 text-center animate-in fade-in duration-1000 delay-500">
          <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">
            © {new Date().getFullYear()} {centreName} • All Rights Reserved
          </p>
        </div>
      </div>
    </div>
  );
};
