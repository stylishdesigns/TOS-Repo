import React from 'react';
import { Period } from './utils/performance';

interface PeriodControlProps {
  value: Period;
  onChange: (period: Period) => void;
}

export const PeriodControl: React.FC<PeriodControlProps> = ({ value, onChange }) => {
  const options: { id: Period; label: string }[] = [
    { id: 'last8', label: 'Last 8' },
    { id: 'term', label: 'This Term' },
    { id: 'all', label: 'All Time' },
  ];

  return (
    <div
      role="tablist"
      aria-label="Performance time period"
      className="bg-white border border-[#E2E8F0] rounded-[14px] p-1 grid grid-cols-3 gap-1 shadow-2xs"
    >
      {options.map((opt) => {
        const isActive = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(opt.id)}
            className={`h-10 rounded-[10px] text-xs transition-all flex items-center justify-center cursor-pointer min-h-[40px] ${
              isActive
                ? 'bg-[#0F172A] text-white font-extrabold shadow-xs'
                : 'bg-transparent text-[#475569] font-bold hover:text-[#0F172A]'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};
