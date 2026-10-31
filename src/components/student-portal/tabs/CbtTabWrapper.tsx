import React from 'react';
import { Student, StudentResult } from '../../../types';
import { StudentPractice } from './StudentPractice';
import { PracticeAnalytics } from './PracticeAnalytics';
import { StudentMockTab } from './StudentMockTab';

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
  onGoToProfile?: () => void;
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
  onGoToProfile,
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

        <StudentMockTab
          key={mockView}
          initialTab={mockView === 'leaderboard' ? 'board' : 'today'}
          onGoToProfile={onGoToProfile}
          onHideBottomNav={(hide) => {
            // Hold the PWA auto-reload while an exam screen is up.
            try { sessionStorage.setItem('tos:defer-pwa-reload', hide ? '1' : '0'); } catch {}
            onHideBottomNav?.(hide);
          }}
        />
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
          <StudentPractice student={student} />
        ) : (
          <PracticeAnalytics onStartPractice={() => onPracticeViewChange('practice')} />
        )}
      </div>
    </div>
  );
};
