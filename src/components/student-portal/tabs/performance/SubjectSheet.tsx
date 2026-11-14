import React, { useEffect } from 'react';
import { X, ChevronRight, TrendingUp, AlertCircle, Award } from 'lucide-react';
import { StudentResult } from '../../../../types';
import { SubjectSummary, getWaecGrade } from './utils/performance';

interface SubjectSheetProps {
  subject: SubjectSummary | null;
  allResults: StudentResult[];
  onClose: () => void;
  onSelectResult: (result: StudentResult) => void;
}

export const SubjectSheet: React.FC<SubjectSheetProps> = ({
  subject,
  allResults,
  onClose,
  onSelectResult,
}) => {
  // Lock body scroll and listen for Escape key
  useEffect(() => {
    if (!subject) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [subject, onClose]);

  if (!subject) return null;

  // Assessments for this subject (only 3 most recent assessments)
  const matchingResults = allResults
    .filter((r) => subject.history.some((h) => h.resultId === r.id))
    .slice(0, 3);

  // Chronological scores for chart
  const historyPoints = subject.history;
  const chartWidth = 320;
  const chartHeight = 150;
  const padX = 24;
  const padY = 20;
  const innerW = chartWidth - padX * 2;
  const innerH = chartHeight - padY * 2;

  const yForPercent = (pct: number) => {
    const clamped = Math.max(0, Math.min(100, pct));
    return chartHeight - padY - (clamped / 100) * innerH;
  };

  const xForIndex = (index: number, total: number) => {
    if (total <= 1) return chartWidth / 2;
    return padX + (index / (total - 1)) * innerW;
  };

  const studentPointsString = historyPoints
    .map((h, i) => `${xForIndex(i, historyPoints.length).toFixed(1)},${yForPercent(h.percent).toFixed(1)}`)
    .join(' ');

  const passMarkY = yForPercent(50);
  const classAvg = subject.classAverage;
  const classAvgY = typeof classAvg === 'number' ? yForPercent(classAvg) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${subject.subject} Performance Overview`}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-3xl sm:rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sheet Drag Indicator & Header */}
        <div className="p-5 pb-3 border-b border-slate-100 flex items-start justify-between shrink-0">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-extrabold uppercase text-[#EA580C] tracking-wider block">
                Subject Deep Dive
              </span>
              {subject.isWeakest && (
                <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                  Needs focus
                </span>
              )}
            </div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight mt-0.5">
              {subject.subject}
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Subject Overview"
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* Summary Hero Stats */}
          <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold block">
                Average Score
              </span>
              <div className="flex items-baseline space-x-2 mt-0.5">
                <span className="text-2xl font-black text-slate-900 tabular-nums">
                  {subject.averagePercent}%
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold border ${subject.gradeInfo.bgColor} ${subject.gradeInfo.textColor} ${subject.gradeInfo.borderColor}`}
                >
                  {subject.gradeInfo.grade}
                </span>
              </div>
            </div>

            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold block">
                Class Average
              </span>
              <span className="text-2xl font-black text-slate-700 tabular-nums mt-0.5 block">
                {typeof subject.classAverage === 'number' ? `${subject.classAverage}%` : 'N/A'}
              </span>
            </div>
          </div>

          {/* SVG Line Chart: Scores vs Class Average vs 50% Pass Mark */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200/80 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800">Trajectory vs Class Average</span>
              <span className="text-[10px] text-slate-400 font-mono">
                {historyPoints.length} {historyPoints.length === 1 ? 'Assessment' : 'Assessments'}
              </span>
            </div>

            <div className="w-full flex justify-center pt-2">
              <svg
                width={chartWidth}
                height={chartHeight}
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                className="overflow-visible max-w-full"
                aria-label={`Chart for ${subject.subject}`}
              >
                {/* 100% Top Reference */}
                <line
                  x1={padX}
                  y1={padY}
                  x2={chartWidth - padX}
                  y2={padY}
                  stroke="#E2E8F0"
                  strokeWidth="1"
                />
                <text x={padX - 4} y={padY + 3} textAnchor="end" className="text-[9px] fill-slate-400 font-mono">
                  100%
                </text>

                {/* 50% Pass-mark Dashed Reference Line */}
                <line
                  x1={padX}
                  y1={passMarkY}
                  x2={chartWidth - padX}
                  y2={passMarkY}
                  stroke="#94A3B8"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />
                <text x={chartWidth - padX} y={passMarkY - 4} textAnchor="end" className="text-[9px] fill-slate-500 font-semibold font-mono">
                  50% Pass Mark
                </text>

                {/* Class Average Line (if available) */}
                {classAvgY !== null && (
                  <>
                    <line
                      x1={padX}
                      y1={classAvgY}
                      x2={chartWidth - padX}
                      y2={classAvgY}
                      stroke="#CBD5E1"
                      strokeWidth="1.5"
                    />
                    <text x={padX} y={classAvgY - 4} textAnchor="start" className="text-[9px] fill-slate-500 font-semibold font-mono">
                      Class: {classAvg}%
                    </text>
                  </>
                )}

                {/* Student Score Line & Nodes */}
                {historyPoints.length > 1 && (
                  <polyline
                    fill="none"
                    stroke="#EA580C"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={studentPointsString}
                  />
                )}

                {/* Data Points */}
                {historyPoints.map((h, i) => {
                  const cx = xForIndex(i, historyPoints.length);
                  const cy = yForPercent(h.percent);
                  return (
                    <g key={i}>
                      <circle cx={cx} cy={cy} r="4.5" fill="#EA580C" stroke="#FFFFFF" strokeWidth="2" />
                      <text
                        x={cx}
                        y={cy - 8}
                        textAnchor="middle"
                        className="text-[9px] font-black fill-slate-900 font-mono"
                      >
                        {h.percent}%
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Assessment Attempts List (Only three recent assessments) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block">
                Recent Assessments ({matchingResults.length})
              </span>
              <span className="text-[10px] text-slate-400 font-semibold">
                Latest 3 attempts
              </span>
            </div>

            <div className="space-y-2">
              {matchingResults.map((result) => {
                const historyItem = subject.history.find((h) => h.resultId === result.id);
                const scorePct = historyItem ? historyItem.percent : (result.averagePercent || 0);
                const grade = getWaecGrade(scorePct);

                return (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => onSelectResult(result)}
                    className="w-full text-left min-h-[44px] p-3 rounded-2xl hover:bg-slate-50 active:bg-slate-100 transition-colors border border-slate-200/80 flex items-center justify-between gap-3 group cursor-pointer"
                  >
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <span className="text-[10px] font-mono text-slate-400 block">{result.date}</span>
                      <h4 className="text-xs font-bold text-slate-900 truncate group-hover:text-[#EA580C] transition-colors">
                        {result.examTitle}
                      </h4>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      <span className="text-xs font-black text-slate-900 tabular-nums">
                        {scorePct}%
                      </span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-extrabold border ${grade.bgColor} ${grade.textColor} ${grade.borderColor}`}
                      >
                        {grade.grade}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
