import React from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { SubjectItem, TONE_STYLES } from './utils/performance';

interface SubjectBreakdownProps {
  subjects: SubjectItem[];
  onSelectSubject: (subject: SubjectItem) => void;
}

export const SubjectBreakdown: React.FC<SubjectBreakdownProps> = ({
  subjects,
  onSelectSubject,
}) => {
  const validSubjects = (subjects || []).filter(
    (s) => s.subject && s.subject.trim().toLowerCase() !== 'total' && s.subject.trim().toLowerCase() !== 'all'
  );

  if (validSubjects.length === 0) return null;

  return (
    <div className="bg-white rounded-[20px] p-4 border border-[#E2E8F0] shadow-2xs space-y-4">
      {/* Header & Legend */}
      <div className="flex items-center justify-between">
        <h3 className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#0F172A]">
          SUBJECT BREAKDOWN
        </h3>

        {/* Legend */}
        <div className="flex items-center space-x-1.5">
          <span className="w-[2px] h-[12px] bg-[#0F172A] inline-block rounded-full" />
          <span className="text-[10px] font-semibold text-[#64748B]">
            Class average
          </span>
        </div>
      </div>

      {/* Subject Rows (16px gap between rows) */}
      <div className="space-y-4">
        {validSubjects.map((item) => {
          const styles = TONE_STYLES[item.tone];
          const hasClassAvg = typeof item.classAverage === 'number' && item.classAverage > 0;
          const delta = item.deltaSincePrevious;
          const isSingleResult = item.attemptsCount <= 1 || delta === null;

          return (
            <button
              key={item.subject}
              type="button"
              onClick={() => onSelectSubject(item)}
              className="w-full text-left p-0 cursor-pointer min-h-[44px] group block focus:outline-hidden"
            >
              {/* Top line of row: Name, Needs Focus, Percent, Grade */}
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center space-x-2 min-w-0">
                  <span className="text-[13px] font-bold text-[#0F172A] group-hover:text-[#C2410C] transition-colors truncate">
                    {item.subject}
                  </span>

                  {item.needsFocus && (
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#FFF1F2] text-[#BE123C] border border-[#F43F5E]/20 inline-flex items-center shrink-0">
                      Needs focus
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <span className="text-[14px] font-extrabold text-[#0F172A] tabular-nums">
                    {item.meanPercent}%
                  </span>
                  <span
                    style={{
                      backgroundColor: styles.bg,
                      color: styles.text,
                      borderColor: styles.border,
                    }}
                    className="text-[10px] font-extrabold rounded-[6px] py-[2px] px-[7px] border leading-tight shadow-2xs"
                  >
                    {item.grade.grade}
                  </span>
                </div>
              </div>

              {/* Progress Bar & Class Tick */}
              <div className="relative w-full h-[8px] bg-[#F1F5F9] rounded-[999px]">
                {/* Score Fill */}
                <div
                  style={{
                    backgroundColor: styles.color,
                    width: `${Math.min(100, Math.max(0, item.meanPercent))}%`,
                  }}
                  className="h-full rounded-[999px] transition-all duration-300"
                />

                {/* Class Average Tick: 2x14, #0F172A, top -3 (omitted when class average is null) */}
                {hasClassAvg && (
                  <div
                    title={`Class average: ${item.classAverage}%`}
                    style={{
                      left: `${Math.min(99, Math.max(1, item.classAverage!))}%`,
                    }}
                    className="absolute -top-[3px] w-[2px] h-[14px] bg-[#0F172A] rounded-full z-10 pointer-events-none"
                  />
                )}
              </div>

              {/* Line under the bar */}
              <div className="text-[11px] text-[#64748B] mt-[6px] flex items-center gap-1.5 flex-wrap leading-tight">
                {isSingleResult ? (
                  <span>First test</span>
                ) : (
                  <span className="inline-flex items-center gap-0.5">
                    {delta! >= 0 ? (
                      <ArrowUp className="w-3 h-3 text-[#047857]" />
                    ) : (
                      <ArrowDown className="w-3 h-3 text-[#BE123C]" />
                    )}
                    <strong
                      style={{ color: delta! >= 0 ? '#047857' : '#BE123C' }}
                      className="font-bold tabular-nums"
                    >
                      {delta! >= 0 ? `${delta}` : `${Math.abs(delta!)}`} pts
                    </strong>
                    <span className="ml-0.5">since last test</span>
                  </span>
                )}

                <span className="text-[#94A3B8]">·</span>

                <span>
                  {hasClassAvg ? `Class ${item.classAverage}%` : 'No class average yet'}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* WAEC Scale Footnote */}
      <div className="pt-3 border-t border-[#F1F5F9]">
        <p className="text-[10.5px] text-[#64748B] leading-relaxed">
          WAEC scale: A1 (≥75) · B2–B3 (65–74) · C4–C6 (50–64) · D7–E8 (40–49) · F9 (&lt;40)
        </p>
      </div>
    </div>
  );
};
