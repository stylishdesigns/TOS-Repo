import React from 'react';
import { Target, ArrowRight } from 'lucide-react';
import { FocusCardData } from './utils/performance';

interface FocusCardProps {
  data: FocusCardData | null;
  onPractiseSubject: (subject: string) => void;
}

export const FocusCard: React.FC<FocusCardProps> = ({ data, onPractiseSubject }) => {
  if (!data) return null;

  return (
    <div className="bg-white rounded-[20px] p-4 border border-[#E2E8F0] shadow-2xs space-y-3.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-[32px] h-[32px] rounded-xl bg-orange-50 text-[#EA580C] flex items-center justify-center shrink-0 border border-orange-100">
            <Target className="w-4 h-4 text-[#EA580C]" />
          </div>
          <h3 className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#0F172A]">
            FOCUS AREA
          </h3>
        </div>

        <span className="text-[10px] font-black text-rose-700 bg-rose-50 border border-rose-200/80 px-2.5 py-1 rounded-full">
          {data.averagePercent}% Average
        </span>
      </div>

      {/* Target Subject Details */}
      <div className="space-y-1">
        <div className="text-[13px] font-bold text-[#0F172A] flex items-center gap-1.5">
          <span>Priority Subject:</span>
          <span className="text-[#EA580C] font-black underline decoration-orange-300 underline-offset-2">
            {data.weakestSubject}
          </span>
        </div>
        <p className="text-[12px] text-[#64748B] leading-relaxed">
          {data.weakestSubject} is currently your lowest-scoring subject. Practicing targeted questions and reviewing past CBT attempts will elevate your composite score and overall grade.
        </p>
      </div>

      {/* Action Button */}
      <div>
        <button
          type="button"
          onClick={() => onPractiseSubject(data.weakestSubject)}
          className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-[#EA580C] hover:bg-[#C2410C] active:scale-[0.99] text-white font-extrabold text-[12px] uppercase tracking-wider shadow-sm transition-all inline-flex items-center justify-center space-x-2 cursor-pointer"
        >
          <span>Practise {data.weakestSubject} CBT</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
