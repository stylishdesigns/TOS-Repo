import React from 'react';
import { Student, StudentResult } from '../../../types';
import { TimetableTab } from './TimetableTab';
import { CbtTab } from './CbtTab';
import { PerformanceTab } from './PerformanceTab';

interface ClassesTabWrapperProps {
  student: Student;
  subPage: 'timetable' | 'assessment';
  onSubPageChange: (subPage: 'timetable' | 'assessment') => void;
  assessmentView: 'assessments' | 'performance';
  onAssessmentViewChange: (view: 'assessments' | 'performance') => void;
  onHideBottomNav?: (hide: boolean) => void;
  cbtSubjectFilter?: string | null;
  cbtReviewTarget?: {
    result: StudentResult;
    source: 'performance_assessment';
  } | null;
  returnToAssessmentResult?: StudentResult | null;
  onReviewAnswers?: (result: StudentResult) => void;
  onExitReview?: () => void;
  onNavigateTab?: (tab: string, filterSubject?: string) => void;
}

export const ClassesTabWrapper: React.FC<ClassesTabWrapperProps> = ({
  student,
  subPage,
  onSubPageChange,
  assessmentView,
  onAssessmentViewChange,
  onHideBottomNav,
  cbtSubjectFilter,
  cbtReviewTarget,
  returnToAssessmentResult,
  onReviewAnswers,
  onExitReview,
  onNavigateTab,
}) => {
  if (subPage === 'timetable') {
    return <TimetableTab student={student} />;
  }

  const renderToggle = () => (
    <div className="bg-white rounded-[14px] p-1 border border-[#E2E8F0] shadow-2xs grid grid-cols-2 gap-1">
      <button
        type="button"
        onClick={() => onAssessmentViewChange('assessments')}
        className={`h-10 rounded-[10px] text-xs font-extrabold transition-all flex items-center justify-center cursor-pointer ${
          assessmentView === 'assessments'
            ? 'bg-[#0F172A] text-white shadow-xs'
            : 'text-[#64748B] hover:text-[#0F172A]'
        }`}
      >
        Assessments
      </button>
      <button
        type="button"
        onClick={() => onAssessmentViewChange('performance')}
        className={`h-10 rounded-[10px] text-xs font-extrabold transition-all flex items-center justify-center cursor-pointer ${
          assessmentView === 'performance'
            ? 'bg-[#0F172A] text-white shadow-xs'
            : 'text-[#64748B] hover:text-[#0F172A]'
        }`}
      >
        Performance
      </button>
    </div>
  );

  if (assessmentView === 'assessments') {
    return (
      <CbtTab
        student={student}
        lockedFrequency="General"
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
        renderUnderHeader={() => renderToggle()}
      />
    );
  }

  // Performance view: header on top, toggle below it, then performance content
  return (
    <div className="space-y-4 max-w-lg mx-auto pb-20 animate-in fade-in duration-300">
      <div className="px-4 pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black tracking-tight text-[#0F172A]">
            Academic Performance
          </h2>
        </div>
        {renderToggle()}
      </div>

      <PerformanceTab
        student={student}
        initialSelectedResult={returnToAssessmentResult}
        onNavigateTab={onNavigateTab}
        onReviewAnswers={onReviewAnswers}
      />
    </div>
  );
};
