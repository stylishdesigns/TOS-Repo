import React from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { OverallStats, TONE_STYLES } from './utils/performance';

interface PerformanceHeroProps {
  stats: OverallStats;
}

export const PerformanceHero: React.FC<PerformanceHeroProps> = ({ stats }) => {
  const {
    meanPercent,
    grade,
    tone,
    changePoints,
    changeWindowSize,
    count,
    bestScore,
    aboveClassAvg,
    chronologicalPercents,
    firstDate,
    lastDate,
  } = stats;

  const isThinData = count <= 1;
  const gradeStyles = TONE_STYLES[tone];

  // Sparkline coordinates for 318x64 SVG
  const svgWidth = 318;
  const svgHeight = 64;
  const padX = 14;
  const padY = 12;
  const innerW = svgWidth - padX * 2;
  const innerH = svgHeight - padY * 2;

  const minVal = chronologicalPercents.length > 0 ? Math.min(...chronologicalPercents) : 0;
  const maxVal = chronologicalPercents.length > 0 ? Math.max(...chronologicalPercents) : 100;
  const range = maxVal - minVal === 0 ? 1 : maxVal - minVal;

  const points = chronologicalPercents.map((v, i) => {
    const x =
      chronologicalPercents.length <= 1
        ? svgWidth / 2
        : padX + (i / (chronologicalPercents.length - 1)) * innerW;
    const y = svgHeight - padY - ((v - minVal) / range) * innerH;
    return { x, y, value: v };
  });

  const polylineCoords = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // SVG Area path for fill under the line
  const areaPath =
    points.length > 1
      ? `M ${points[0].x},${svgHeight - 4} L ${polylineCoords.replace(/ /g, ' L ')} L ${points[points.length - 1].x},${svgHeight - 4} Z`
      : '';

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      }
    } catch {}
    return dateStr;
  };

  const hasBenchmark = aboveClassAvg.totalWithBenchmark > 0;

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 55%, #0B1224 100%)',
        boxShadow: '0 8px 24px rgba(2, 6, 23, 0.18)',
      }}
      className="rounded-[20px] p-5 border border-[#334155] text-white"
    >
      {/* Eyebrow Label */}
      <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#CBD5E1] block mb-1">
        OVERALL AVERAGE
      </span>

      {/* Big Number & Chips */}
      <div className="flex items-center justify-between gap-3">
        {/* Number with Orange % */}
        <div className="flex items-baseline tracking-[-0.03em]">
          <span className="text-[56px] leading-none font-extrabold tabular-nums text-white">
            {meanPercent}
          </span>
          <span className="text-[24px] leading-none font-extrabold text-[#FDBA74] ml-0.5">
            %
          </span>
        </div>

        {/* Right Stacked Chips */}
        <div className="flex flex-col items-end gap-[6px]">
          {/* Grade Chip */}
          <span
            style={{
              backgroundColor: gradeStyles.bg,
              color: gradeStyles.text,
              borderColor: gradeStyles.border,
            }}
            className="text-[11px] font-extrabold rounded-[999px] py-[3px] px-[9px] border inline-flex items-center leading-tight shadow-2xs whitespace-nowrap"
          >
            {grade.badgeText}
          </span>

          {/* Change Chip (hidden when change is null or thin data) */}
          {!isThinData && changePoints !== null && (
            <span
              style={{
                backgroundColor: changePoints >= 0 ? '#ECFDF5' : '#FFF1F2',
                color: changePoints >= 0 ? '#047857' : '#BE123C',
                borderColor: changePoints >= 0 ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)',
              }}
              className="text-[11px] font-bold rounded-full py-[2px] px-[8px] border inline-flex items-center gap-1 leading-tight tabular-nums whitespace-nowrap"
            >
              {changePoints >= 0 ? (
                <ArrowUp className="w-3 h-3 text-[#047857]" />
              ) : (
                <ArrowDown className="w-3 h-3 text-[#BE123C]" />
              )}
              <span>
                {changePoints >= 0 ? `+${changePoints}` : changePoints} pts vs previous {changeWindowSize}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Sparkline or Thin Data Box */}
      <div className="mt-4">
        {isThinData ? (
          <div className="rounded-[14px] p-4 border border-dashed border-white/20 bg-white/[0.06] flex items-center justify-center space-x-2.5">
            <span className="w-2 h-2 rounded-full bg-[#FB923C] shrink-0" />
            <span className="text-xs font-medium text-slate-300">
              Take one more assessment and your trend line will appear here.
            </span>
          </div>
        ) : (
          <div className="space-y-1">
            <svg
              width="100%"
              height="64"
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="overflow-visible"
              aria-label="Overall performance sparkline"
            >
              <defs>
                <linearGradient id="heroAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FB923C" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#FB923C" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Area Gradient Fill */}
              {areaPath && <path d={areaPath} fill="url(#heroAreaGrad)" />}

              {/* Sparkline Line */}
              {points.length > 1 && (
                <polyline
                  fill="none"
                  stroke="#FB923C"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={polylineCoords}
                />
              )}

              {/* Data points */}
              {points.slice(0, -1).map((p, idx) => (
                <circle
                  key={idx}
                  cx={p.x}
                  cy={p.y}
                  r="2.5"
                  fill="#FB923C"
                />
              ))}

              {/* Last point larger: r=5, filled orange with #0F172A ring */}
              {points.length > 0 && (
                <circle
                  cx={points[points.length - 1].x}
                  cy={points[points.length - 1].y}
                  r="5"
                  fill="#FB923C"
                  stroke="#0F172A"
                  strokeWidth="2"
                />
              )}
            </svg>

            {/* Dates under sparkline */}
            <div className="flex items-center justify-between text-[10px] font-semibold text-[#94A3B8] px-1 font-mono">
              <span>{formatDate(firstDate)}</span>
              <span>{formatDate(lastDate)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Stats Row: 3 equal columns */}
      <div
        style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}
        className="grid grid-cols-3 text-center pt-[14px] mt-4"
      >
        <div>
          <span className="text-[18px] leading-tight font-extrabold text-white tabular-nums block">
            {count}
          </span>
          <span className="text-[10px] font-semibold text-[#94A3B8] block mt-0.5">
            Assessments
          </span>
        </div>

        <div>
          <span className="text-[18px] leading-tight font-extrabold text-white tabular-nums block">
            {bestScore}%
          </span>
          <span className="text-[10px] font-semibold text-[#94A3B8] block mt-0.5">
            Best score
          </span>
        </div>

        <div>
          <span className="text-[18px] leading-tight font-extrabold text-white tabular-nums block">
            {hasBenchmark ? `${aboveClassAvg.count} of ${aboveClassAvg.totalWithBenchmark}` : '—'}
          </span>
          <span className="text-[10px] font-semibold text-[#94A3B8] block mt-0.5 truncate">
            Above class avg
          </span>
        </div>
      </div>
    </div>
  );
};
