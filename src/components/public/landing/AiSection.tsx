import React, { useState } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import {
  AI_ADMIN_POINTS, AI_STUDENT_POINTS, AI_TUTOR_POINTS, COACH_PROMPTS, COACH_REPLIES, type CoachKey,
} from './landingContent';
import { PointList } from './PointList';

export const AiSection: React.FC<{ onReserve: () => void }> = ({ onReserve }) => {
  const [asked, setAsked] = useState<CoachKey>('weak');
  const prompt = COACH_PROMPTS.find((x) => x.key === asked)!;
  return (
    <section className="mb-16 p-6 md:p-10 rounded-3xl bg-slate-950/70 border border-white/10" aria-labelledby="ai-title">
      <p className="text-[11px] font-black uppercase tracking-[0.15em] text-orange-400">AI built in</p>
      <h2 id="ai-title" className="text-2xl md:text-3xl font-black tracking-tight mt-1">AI that helps every student, tutor and admin.</h2>
      <p className="text-slate-400 text-sm mt-3 max-w-2xl leading-relaxed">
        It learns from your centre&apos;s own assessments and results, so the help is about your students, not just anyone.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8 items-start">
        <div className="rounded-3xl bg-slate-100 text-slate-900 p-5">
          <div className="flex items-center gap-2 mb-3.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider bg-slate-900 text-orange-300 rounded-full px-2 py-0.5">
              <Sparkles className="w-3 h-3" aria-hidden="true" />AI
            </span>
            <b className="text-sm font-extrabold">Student study coach</b>
          </div>
          <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Ask the study coach">
            {COACH_PROMPTS.map((x) => (
              <button
                key={x.key}
                type="button"
                aria-pressed={asked === x.key}
                onClick={() => setAsked(x.key)}
                className={`min-h-[44px] px-3.5 rounded-full border text-[13px] font-bold transition-colors ${
                  asked === x.key ? 'bg-orange-700 border-orange-700 text-white' : 'bg-white border-slate-300 hover:border-orange-500'
                }`}
              >
                {x.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2.5" aria-live="polite">
            <div className="ml-auto max-w-[90%] rounded-2xl bg-orange-700 text-white px-3.5 py-2.5 text-sm leading-relaxed">{prompt.label}</div>
            <div className="max-w-[90%] rounded-2xl bg-white border border-slate-200 px-3.5 py-2.5 text-sm leading-relaxed">{COACH_REPLIES[asked]}</div>
          </div>
          <p className="text-[11px] text-slate-500 mt-3.5">Example conversation.</p>
        </div>
        <div className="grid gap-4">
          {[['For students', AI_STUDENT_POINTS], ['For tutors', AI_TUTOR_POINTS], ['For admins', AI_ADMIN_POINTS]].map(([t, pts]) => (
            <div key={String(t)} className="rounded-2xl bg-slate-900 border border-white/10 p-5">
              <h3 className="font-extrabold text-base mb-3">{String(t)}</h3>
              <PointList points={pts as typeof AI_ADMIN_POINTS} />
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 mt-8">
        <button type="button" onClick={onReserve} className="group px-6 py-3 rounded-xl bg-orange-600 hover:bg-orange-500 font-bold text-sm flex items-center gap-2 transition-colors">
          Reserve your seat <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
        </button>
        <p className="text-xs text-slate-400">AI features are part of the Centre Plus plan.</p>
      </div>
    </section>
  );
};
