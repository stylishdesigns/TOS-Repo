import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { RecentItem, TONE_STYLES } from './utils/performance';
import { StudentResult } from '../../../../types';

interface RecentListProps {
  items: RecentItem[];
  totalCount: number;
  onSelectResult: (result: StudentResult) => void;
}

export const RecentList: React.FC<RecentListProps> = ({
  items,
  totalCount,
  onSelectResult,
}) => {
  const [showAll, setShowAll] = useState(false);

  if (!items || items.length === 0) return null;

  const displayedItems = showAll ? items : items.slice(0, 5);

  return (
    <div className="space-y-3">
      {/* Heading Row */}
      <div className="flex items-center justify-between px-1">
        <h3 className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#0F172A]">
          RECENT ASSESSMENTS
        </h3>
        <span className="text-[11px] font-bold text-[#64748B] tabular-nums">
          {totalCount} total
        </span>
      </div>

      {/* Rows List */}
      <div className="space-y-[10px]">
        {displayedItems.map((item) => {
          const styles = TONE_STYLES[item.tone];

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectResult(item.rawResult)}
              className="w-full text-left bg-white border border-[#E2E8F0] rounded-[16px] p-[12px] min-h-[68px] flex items-center justify-between gap-[10px] hover:border-slate-300 active:scale-[0.99] transition-all cursor-pointer group shadow-2xs"
            >
              {/* Left: 44x44 tile with initials */}
              <div className="w-[44px] h-[44px] rounded-[12px] bg-[#F1F5F9] flex items-center justify-center shrink-0">
                <span className="text-[12px] font-extrabold text-[#334155] tracking-wider">
                  {item.initials}
                </span>
              </div>

              {/* Middle: Title & Subtitle */}
              <div className="flex-1 min-w-0 pr-1">
                <h4 className="text-[14px] font-extrabold text-[#0F172A] truncate group-hover:text-[#C2410C] transition-colors">
                  {item.title}
                </h4>
                <p className="text-[11px] text-[#64748B] font-medium mt-0.5 truncate">
                  {item.subject} · {item.date}
                </p>
              </div>

              {/* Right: Percent, Grade, vsClass */}
              <div className="flex items-center space-x-2 shrink-0">
                <div className="text-right">
                  <div className="flex items-center justify-end space-x-1.5">
                    <span className="text-[16px] font-extrabold text-[#0F172A] tabular-nums">
                      {item.percent}%
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

                  {item.vsClass !== null && (
                    <span
                      style={{
                        color: item.vsClass >= 0 ? '#047857' : '#BE123C',
                      }}
                      className="text-[10px] font-bold tabular-nums block mt-0.5"
                    >
                      {item.vsClass >= 0 ? `+${item.vsClass}` : item.vsClass} vs class
                    </span>
                  )}
                </div>

                {/* 16px Chevron */}
                <ChevronRight className="w-4 h-4 text-[#94A3B8] group-hover:text-[#0F172A] transition-colors shrink-0" />
              </div>
            </button>
          );
        })}
      </div>

      {/* View All Button */}
      {items.length > 5 && (
        <button
          type="button"
          onClick={() => setShowAll((prev) => !prev)}
          className="w-full h-[48px] rounded-[14px] border border-[#CBD5E1] bg-white hover:bg-slate-50 text-[12px] font-extrabold text-[#0F172A] flex items-center justify-center transition-colors cursor-pointer shadow-2xs active:scale-[0.99]"
        >
          {showAll ? 'Show less' : `View all ${totalCount} assessments`}
        </button>
      )}
    </div>
  );
};
