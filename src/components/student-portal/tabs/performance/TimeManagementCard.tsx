import React from 'react';
import { Clock } from 'lucide-react';
import { TimeUsageStats } from './utils/performance';

interface TimeManagementCardProps {
  stats: TimeUsageStats | null;
}

export const TimeManagementCard: React.FC<TimeManagementCardProps> = ({ stats }) => {
  // Do not render this card at all if timeUsage is null
  if (!stats) return null;

  const { percentUsed, sentence } = stats;

  return (
    <div className="bg-white rounded-[20px] p-4 border border-[#E2E8F0] shadow-2xs space-y-3.5">
      {/* Header with 32x32 rounded square */}
      <div className="flex items-center space-x-2.5">
        <div className="w-[32px] h-[32px] rounded-xl bg-[#F1F5F9] text-[#0F172A] flex items-center justify-center shrink-0">
          <Clock className="w-4 h-4 text-[#0F172A]" />
        </div>
        <h3 className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#0F172A]">
          TIME MANAGEMENT
        </h3>
      </div>

      {/* Percent Line */}
      <div className="flex items-baseline space-x-2">
        <span className="text-[28px] font-extrabold text-[#0F172A] tabular-nums leading-none">
          {percentUsed}%
        </span>
        <span className="text-[12px] text-[#64748B] font-medium leading-none">
          of allotted time used on average
        </span>
      </div>

      {/* Progress Bar: height 8, track #F1F5F9, fill #0F172A */}
      <div className="w-full h-[8px] bg-[#F1F5F9] rounded-full overflow-hidden">
        <div
          style={{ width: `${Math.min(100, Math.max(0, percentUsed))}%` }}
          className="h-full bg-[#0F172A] rounded-full transition-all duration-500"
        />
      </div>

      {/* Dynamic Advice Sentence */}
      <p className="text-[12px] text-[#475569] leading-relaxed">
        {sentence}
      </p>
    </div>
  );
};
