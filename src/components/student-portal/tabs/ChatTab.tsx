import React from 'react';
import { MessageSquare, Sparkles } from 'lucide-react';
import { Student } from '../../../types';

interface ChatTabProps {
  student: Student;
}

export const ChatTab: React.FC<ChatTabProps> = ({ student }) => {
  return (
    <div className="p-4 sm:p-5 max-w-lg mx-auto space-y-4 animate-in fade-in duration-300 pb-20">
      {/* Header Banner */}
      <div className="pt-1">
        <span className="text-[10px] font-extrabold uppercase text-[#C2410C] tracking-wider block">
          {student.name} · Communications
        </span>
        <h2 className="text-xl font-black text-[#0F172A] tracking-tight">
          Student Chat
        </h2>
      </div>

      {/* Empty State Placeholder Card */}
      <div className="bg-white rounded-3xl p-8 border border-slate-200/90 shadow-sm text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-orange-50 border border-orange-100 text-[#EA580C] flex items-center justify-center mx-auto shadow-sm">
          <MessageSquare className="w-8 h-8" />
        </div>

        <div className="space-y-1.5 max-w-xs mx-auto">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-100/60 text-[#C2410C] text-[10px] font-extrabold uppercase tracking-wider mb-1">
            <Sparkles className="w-3 h-3" />
            <span>Coming Soon</span>
          </div>
          <h3 className="text-lg font-black text-slate-900 tracking-tight">
            Chat is coming soon
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed font-medium">
            Direct communication with your course tutors, class announcements, and study cohort messaging will be available here soon.
          </p>
        </div>
      </div>
    </div>
  );
};
