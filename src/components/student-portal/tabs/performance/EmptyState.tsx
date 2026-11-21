import React from 'react';
import { TrendingUp, BookOpen, Sparkles } from 'lucide-react';

export const EmptyState: React.FC = () => {
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Dashed Ghost Container */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border-2 border-dashed border-slate-200/90 text-center space-y-5 shadow-2xs">
        {/* Ghost Bar Chart Illustration */}
        <div className="flex items-end justify-center space-x-2.5 h-20 pt-2 opacity-65">
          {[35, 52, 40, 68, 55, 82, 70].map((h, i) => (
            <div
              key={i}
              className="w-4 bg-slate-200 rounded-t-lg transition-all"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>

        <div className="space-y-1.5 max-w-xs mx-auto">
          <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
            No assessment results yet
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            When your facility records assessments for you, your performance overview, subject mastery and class comparison will appear here.
          </p>
        </div>
      </div>

      {/* "What you will see here" preview card */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-2xs space-y-3.5">
        <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block">
          What you will see here
        </span>

        <div className="space-y-3">
          <div className="flex items-start space-x-3 text-xs">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5 border border-emerald-100">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900">Score Trajectory &amp; WAEC Grade</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Your assessment scores over time, classified into official WAEC bands (A1 through F9).
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3 text-xs">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5 border border-blue-100">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900">Subject-by-Subject Mastery</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Your scores against the class average marker and the 50% pass benchmark.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3 text-xs">
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 mt-0.5 border border-purple-100">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900">Focus &amp; Revision Guidance</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Where marks were lost across assessments and the subjects to prioritise next.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
