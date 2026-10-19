import React, { useEffect } from 'react';
import { X, Clock, BookOpen, AlertCircle, Award, ChevronLeft } from 'lucide-react';
import { StudentResult, CBTExam } from '../../../../types';
import {
  calculateResultPercent,
  getWaecGrade,
  getResultPrimarySubject,
  calculateExamRank,
  calculateTimeUsedRatio,
} from './utils/performance';

interface AssessmentSheetProps {
  result: StudentResult | null;
  allResultsForExam: StudentResult[];
  exam?: CBTExam;
  parentSubject?: string;
  onClose: () => void;
  onReviewAnswers?: (result: StudentResult) => void;
}

export const AssessmentSheet: React.FC<AssessmentSheetProps> = ({
  result,
  allResultsForExam,
  exam,
  parentSubject,
  onClose,
  onReviewAnswers,
}) => {
  useEffect(() => {
    if (!result) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      // If a parent subject sheet is active behind it, keep overflow locked
      if (!parentSubject) {
        document.body.style.overflow = originalOverflow;
      }
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [result, onClose, parentSubject]);

  if (!result) return null;

  const percent = calculateResultPercent(result);
  const grade = getWaecGrade(percent);
  const subject = getResultPrimarySubject(result);

  // Class average difference
  const classAvg = exam?.averageScore;
  const hasClassAvg = typeof classAvg === 'number' && classAvg > 0;
  const avgDiff = hasClassAvg ? Number((percent - classAvg).toFixed(1)) : null;

  // Cohort rank (only display when n >= 3)
  const rankInfo = calculateExamRank(result, allResultsForExam);

  // Total got / total possible
  const totalGot = result.scores?.reduce((sum, s) => sum + (Number(s.score) || 0), 0) ?? result.totalScore;
  const totalPossible = result.scores?.reduce((sum, s) => sum + (Number(s.maxScore) || 0), 0) ?? ((result as any).maxScore || 100);

  // Section scores: MCQ & Essay
  const mcqScore = result.scores?.find((s) => s.subject === 'MCQ');
  const essayScore = result.scores?.find((s) => s.subject === 'Essay');

  // Time used
  const timeInfo = calculateTimeUsedRatio(result.timeTakenSeconds, exam?.durationMinutes || 45);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${result.examTitle} Assessment Details`}
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-3xl sm:rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 pb-3 border-b border-slate-100 flex items-start justify-between shrink-0 gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 font-mono">
                {subject}
              </span>
              <span className="text-[10px] font-mono text-slate-400">{result.date}</span>
            </div>
            <h3 className="text-base font-black text-slate-900 tracking-tight mt-1 line-clamp-1">
              {result.examTitle}
            </h3>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {parentSubject && (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer active:scale-95"
                title={`Back to ${parentSubject}`}
              >
                <ChevronLeft className="w-3.5 h-3.5 text-slate-500" />
                <span>Back</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Assessment Details"
              className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Sheet Body (Clean view for both MCQ & Essay without rubric block) */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          {/* Score Card Banner */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold block">
                Composite Score
              </span>
              <div className="flex items-baseline space-x-2 mt-0.5">
                <span className="text-3xl font-black text-slate-900 tabular-nums">
                  {percent}%
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${grade.bgColor} ${grade.textColor} ${grade.borderColor}`}
                >
                  {grade.badgeText}
                </span>
              </div>

              {avgDiff !== null && (
                <span
                  className={`text-[10px] font-bold tabular-nums mt-0.5 block ${
                    avgDiff >= 0 ? 'text-emerald-700' : 'text-rose-600'
                  }`}
                >
                  {avgDiff >= 0 ? `+${avgDiff} pts` : `${avgDiff} pts`} vs class average ({classAvg}%)
                </span>
              )}
            </div>

            {/* Chips: Rank & Got/Total Marks */}
            <div className="text-right space-y-1.5">
              {rankInfo.displayString && (
                <span className="inline-block px-2.5 py-1 rounded-xl bg-orange-100/70 text-[#EA580C] font-extrabold text-[11px] font-mono border border-orange-200/80">
                  {rankInfo.displayString}
                </span>
              )}
              <span className="block text-xs font-bold text-slate-600 tabular-nums font-mono">
                {totalGot} / {totalPossible} marks
              </span>
            </div>
          </div>

          {/* Sectional Performance Bars: MCQ, Essay, Time Used */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 space-y-3">
            <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block">
              Sectional Breakdown & Timing
            </span>

            {/* MCQ Bar */}
            {mcqScore && mcqScore.maxScore > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-800">Multiple Choice (MCQ)</span>
                  <span className="font-mono font-bold text-slate-700 tabular-nums">
                    {mcqScore.score} / {mcqScore.maxScore} (
                    {Math.round((mcqScore.score / mcqScore.maxScore) * 100)}%)
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${Math.min(100, Math.round((mcqScore.score / mcqScore.maxScore) * 100))}%` }}
                  />
                </div>
              </div>
            )}

            {/* Essay Bar */}
            {essayScore && essayScore.maxScore > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-800">Theory / Essay Section</span>
                  <span className="font-mono font-bold text-slate-700 tabular-nums">
                    {essayScore.score} / {essayScore.maxScore} (
                    {Math.round((essayScore.score / essayScore.maxScore) * 100)}%)
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#EA580C] rounded-full"
                    style={{ width: `${Math.min(100, Math.round((essayScore.score / essayScore.maxScore) * 100))}%` }}
                  />
                </div>
              </div>
            )}

            {/* Time Used Bar */}
            <div className="space-y-1 pt-1 border-t border-slate-100">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-800 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  Time Utilised
                </span>
                <span className="font-mono font-bold text-slate-700 tabular-nums">
                  {timeInfo.displayTime} ({timeInfo.percent}%)
                </span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${timeInfo.percent > 90 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${timeInfo.percent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Action Button: "Review my answers" linking directly to assessment review page */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                onReviewAnswers?.(result);
              }}
              className="w-full min-h-[44px] px-4 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 active:scale-98 text-white font-extrabold text-xs shadow-xs transition-all inline-flex items-center justify-center space-x-2 cursor-pointer"
            >
              <BookOpen className="w-4 h-4 text-orange-400" />
              <span>Review My Answers</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
