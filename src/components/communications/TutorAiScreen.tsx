import React from 'react';
import { Sparkles, Send, Lock } from 'lucide-react';

/**
 * Tutor AI for tutors and centre admins, the third stop on the staff chat
 * toggle: a placeholder for the AI teaching assistant that will live inside
 * the app. The screen and shell are here so the real integration slots in
 * without touching the toggle or the layout; nothing sends anywhere yet, so
 * every control stays visibly disabled and the copy says so plainly.
 */
const SUGGESTIONS = [
  'Plan next week\'s lessons',
  'Summarise my class results',
  'Draft a message to parents',
];

const TutorAiScreen: React.FC = () => (
  <div className="space-y-4 p-4 animate-in fade-in duration-300 pb-32">
    <div>
      <span className="text-[10px] font-extrabold uppercase text-violet-600 tracking-wider block">
        Tutorial OS · Assistant
      </span>
      <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
        <Sparkles className="w-6 h-6 text-violet-600" />
        Tutor AI
      </h2>
      <p className="text-[11px] text-slate-500 font-medium">Your teaching assistant, arriving soon</p>
    </div>

    <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-violet-50/70 border-b border-violet-100 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-white border border-violet-100 text-violet-600 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-black text-slate-900 truncate">Tutor AI</p>
          <p className="text-[11px] font-bold text-violet-600">Coming soon</p>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex">
          <div className="max-w-[85%] bg-slate-100 rounded-2xl rounded-bl-md px-4 py-3">
            <p className="text-[13px] text-slate-800 leading-relaxed font-medium">
              Hi! I'm Tutor AI, your teaching assistant. Soon I'll help you plan lessons,
              read your class results at a glance and draft notes home.
            </p>
            <p className="text-[10px] text-slate-400 font-bold mt-1">Just now</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {SUGGESTIONS.map((s) => (
            <span
              key={s}
              className="text-[11px] font-bold text-slate-500 bg-slate-50 border border-slate-200 rounded-full px-3 py-1.5 opacity-60"
            >
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>

    <div className="bg-white rounded-full border border-slate-200 shadow-sm flex items-center gap-2 px-4 py-2.5 opacity-70">
      <Lock className="w-4 h-4 text-slate-400 shrink-0" />
      <input
        type="text"
        disabled
        placeholder="Tutor AI is coming soon"
        aria-label="Message Tutor AI (coming soon)"
        className="flex-1 bg-transparent text-[13px] text-slate-800 placeholder:text-slate-400 font-medium outline-none min-w-0"
      />
      <span className="w-9 h-9 rounded-full bg-slate-200 text-slate-400 flex items-center justify-center shrink-0">
        <Send className="w-4 h-4" />
      </span>
    </div>
    <p className="text-[11px] text-slate-500 font-medium text-center px-6">
      Tutor AI is being prepared and will open for everyone at once.
    </p>
  </div>
);

export default TutorAiScreen;
