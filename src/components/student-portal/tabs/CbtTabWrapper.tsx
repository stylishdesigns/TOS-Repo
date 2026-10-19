import React from 'react';
import { Student, StudentResult } from '../../../types';
import { CbtTab } from './CbtTab';
import { Trophy, BookOpen, TrendingUp, Sparkles } from 'lucide-react';

interface CbtTabWrapperProps {
  student: Student;
  subPage: 'mock' | 'practice';
  onSubPageChange: (subPage: 'mock' | 'practice') => void;
  mockView: 'mock' | 'leaderboard';
  onMockViewChange: (view: 'mock' | 'leaderboard') => void;
  practiceView: 'practice' | 'analytics';
  onPracticeViewChange: (view: 'practice' | 'analytics') => void;
  onHideBottomNav?: (hide: boolean) => void;
  cbtSubjectFilter?: string | null;
  cbtReviewTarget?: {
    result: StudentResult;
    source: 'performance_assessment';
  } | null;
  onExitReview?: () => void;
}

export const CbtTabWrapper: React.FC<CbtTabWrapperProps> = ({
  student,
  subPage,
  onSubPageChange,
  mockView,
  onMockViewChange,
  practiceView,
  onPracticeViewChange,
  onHideBottomNav,
  cbtSubjectFilter,
  cbtReviewTarget,
  onExitReview,
}) => {
  if (subPage === 'mock') {
    return (
      <div className="space-y-3">
        {/* Top Segmented Control: Mock | Leaderboard */}
        <div className="px-4 pt-3 max-w-lg mx-auto">
          <div className="bg-white rounded-[14px] p-1 border border-[#E2E8F0] shadow-2xs grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => onMockViewChange('mock')}
              className={`h-10 rounded-[10px] text-xs font-extrabold transition-all flex items-center justify-center cursor-pointer ${
                mockView === 'mock'
                  ? 'bg-[#0F172A] text-white shadow-xs'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              Mock
            </button>
            <button
              type="button"
              onClick={() => onMockViewChange('leaderboard')}
              className={`h-10 rounded-[10px] text-xs font-extrabold transition-all flex items-center justify-center cursor-pointer ${
                mockView === 'leaderboard'
                  ? 'bg-[#0F172A] text-white shadow-xs'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              Leaderboard
            </button>
          </div>
        </div>

        {mockView === 'mock' ? (
          <CbtTab
            student={student}
            lockedFrequency="Mock"
            hideFrequencyToggle={true}
            onHideBottomNav={(hide) => {
              // Tell the PWA updater to hold its auto-reload while an exam screen is up.
              try { sessionStorage.setItem('tos:defer-pwa-reload', hide ? '1' : '0'); } catch {}
              onHideBottomNav?.(hide);
            }}
            initialSubjectFilter={cbtSubjectFilter}
            directReviewResult={cbtReviewTarget?.result}
            directReviewExamId={cbtReviewTarget?.result?.examId}
            onExitReview={onExitReview}
          />
        ) : (
          <div className="p-4 sm:p-5 max-w-lg mx-auto space-y-4 animate-in fade-in duration-300 pb-20">
            <div className="bg-white rounded-3xl p-8 border border-slate-200/90 shadow-sm text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-orange-50 border border-orange-100 text-[#EA580C] flex items-center justify-center mx-auto shadow-sm">
                <Trophy className="w-8 h-8" />
              </div>

              <div className="space-y-1.5 max-w-xs mx-auto">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-100/60 text-[#C2410C] text-[10px] font-extrabold uppercase tracking-wider mb-1">
                  <Sparkles className="w-3 h-3" />
                  <span>Rankings</span>
                </div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight">
                  Leaderboard
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  Leaderboard coming soon. Your mock scores will be ranked against students across every Tutorial OS centre.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Practice sub-page with Practice | Analytics toggle
  return (
    <div className="space-y-3">
      {/* Top Segmented Control: Practice | Analytics */}
      <div className="px-4 pt-3 max-w-lg mx-auto">
        <div className="bg-white rounded-[14px] p-1 border border-[#E2E8F0] shadow-2xs grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => onPracticeViewChange('practice')}
            className={`h-10 rounded-[10px] text-xs font-extrabold transition-all flex items-center justify-center cursor-pointer ${
              practiceView === 'practice'
                ? 'bg-[#0F172A] text-white shadow-xs'
                : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            Practice
          </button>
          <button
            type="button"
            onClick={() => onPracticeViewChange('analytics')}
            className={`h-10 rounded-[10px] text-xs font-extrabold transition-all flex items-center justify-center cursor-pointer ${
              practiceView === 'analytics'
                ? 'bg-[#0F172A] text-white shadow-xs'
                : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            Analytics
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-5 max-w-lg mx-auto space-y-4 animate-in fade-in duration-300 pb-20">
        {practiceView === 'practice' ? (
          <div className="bg-white rounded-3xl p-8 border border-slate-200/90 shadow-sm text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-orange-50 border border-orange-100 text-[#EA580C] flex items-center justify-center mx-auto shadow-sm">
              <BookOpen className="w-8 h-8" />
            </div>

            <div className="space-y-1.5 max-w-xs mx-auto">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-100/60 text-[#C2410C] text-[10px] font-extrabold uppercase tracking-wider mb-1">
                <Sparkles className="w-3 h-3" />
                <span>Question Bank</span>
              </div>
              <h3 className="text-lg font-black text-slate-900 tracking-tight">
                CBT Practice
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed font-medium">
                Practice is coming soon. Untimed CBT practice from the Tutorial OS question bank.
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-3xl p-8 border border-slate-200/90 shadow-sm text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-orange-50 border border-orange-100 text-[#EA580C] flex items-center justify-center mx-auto shadow-sm">
              <TrendingUp className="w-8 h-8" />
            </div>

            <div className="space-y-1.5 max-w-xs mx-auto">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-100/60 text-[#C2410C] text-[10px] font-extrabold uppercase tracking-wider mb-1">
                <Sparkles className="w-3 h-3" />
                <span>Progress Insights</span>
              </div>
              <h3 className="text-lg font-black text-slate-900 tracking-tight">
                Practice Analytics
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed font-medium">
                Your practice progress will appear here.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
