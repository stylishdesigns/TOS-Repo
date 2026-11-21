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

  // The toggle carries the facility colour: the whole bar is painted with the
  // centre's accent, the active side is a white button with dark text, and the
  // resting side sits straight on the colour. Arbitrary hexes for the knob keep
  // it white in dark mode too (the dark remap only touches the named utilities).
  const renderToggle = () => (
    <div className="bg-[var(--brand,#0F172A)] rounded-[14px] p-1 grid grid-cols-2 gap-1">
      <button
        type="button"
        onClick={() => onAssessmentViewChange('assessments')}
        className={`h-10 rounded-[10px] text-xs font-extrabold transition-all flex items-center justify-center cursor-pointer ${
          assessmentView === 'assessments'
            ? 'bg-[#ffffff] text-[#1F2937] shadow-xs'
            : 'text-[var(--on-brand,#fff)]'
        }`}
      >
        Assessments
      </button>
      <button
        type="button"
        onClick={() => onAssessmentViewChange('performance')}
        className={`h-10 rounded-[10px] text-xs font-extrabold transition-all flex items-center justify-center cursor-pointer ${
          assessmentView === 'performance'
            ? 'bg-[#ffffff] text-[#1F2937] shadow-xs'
            : 'text-[var(--on-brand,#fff)]'
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
    <div className="space-y-4 max-w-lg mx-auto animate-in fade-in duration-300">
      <div className="px-4 pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black tracking-tight text-[#0F172A]">
            Assessment Performance
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
