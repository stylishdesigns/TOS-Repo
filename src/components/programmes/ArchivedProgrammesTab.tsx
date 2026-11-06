import React from 'react';
import { Archive } from 'lucide-react';

/**
 * Archived exam programs. Nothing here is hardcoded: until a centre
 * archives a program there is simply nothing to show.
 */
export const ArchivedProgrammesTab: React.FC = () => (
  <div className="bg-white p-12 rounded-xl border border-slate-200/90 text-center space-y-3 animate-in fade-in duration-200">
    <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
      <Archive className="w-6 h-6" />
    </div>
    <h3 className="font-bold text-slate-800 text-base">No Archived Exam Programs Yet</h3>
    <p className="text-xs text-slate-500 max-w-md mx-auto">
      When an exam program closes, it is archived here with its real numbers: candidates enrolled, session and archive date.
    </p>
  </div>
);
