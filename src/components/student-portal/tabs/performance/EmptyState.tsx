import React from 'react';
import { ArrowRight, TrendingUp, BookOpen, Sparkles } from 'lucide-react';

interface EmptyStateProps {
  onGoToCbt: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onGoToCbt }) => {
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
            No results yet
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Take mock examinations or CBT tests to see your performance trajectory, subject mastery, and official slips.
          </p>
        </div>

        <div>
          <button
            type="button"
            onClick={onGoToCbt}
            className="w-full min-h-[44px] px-5 py-3 rounded-2xl bg-[#EA580C] hover:bg-[#C2410C] text-white font-bold text-xs shadow-sm hover:shadow transition-all inline-flex items-center justify-center space-x-2 cursor-pointer active:scale-98"
          >
            <span>Go to CBT</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* "What you will see here" preview card */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-2xs space-y-3.5">
        <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block">
          What you will see here
        </span>

        <div className="space-y-3">
          <div className="flex items-start space-x-3 text-xs">
            <div className="w-8 h-8 rounded-xl bg-orange-50 text-[#EA580C] flex items-center justify-center shrink-0 mt-0.5 border border-orange-100">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900">Score Trajectory & WAEC Grade</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Instant classification into official WAEC bands (A1 through F9) with progress sparklines.
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
                Comparison of your scores against the class average marker and 50% pass benchmark.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3 text-xs">
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 mt-0.5 border border-purple-100">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900">Targeted Essay Revision & Focus</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Detailed breakdowns of missed essay marks and 1-tap practice drills in your weakest subjects.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
