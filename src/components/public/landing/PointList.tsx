import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { Point } from './landingContent';

/** "Coming soon" marker so unbuilt features are never presented as live. */
export const SoonTag: React.FC = () => (
  <span className="ml-2 inline-block align-middle text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-300 border border-orange-500/30">
    Coming soon
  </span>
);

export const PointList: React.FC<{ points: Point[]; className?: string }> = ({ points, className = '' }) => (
  <ul className={`space-y-2.5 ${className}`}>
    {points.map((pt) => (
      <li key={pt.id} className="flex items-start gap-2.5 text-sm text-slate-200 leading-snug">
        <CheckCircle2 className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          {pt.text}
          {pt.status === 'soon' && <SoonTag />}
        </span>
      </li>
    ))}
  </ul>
);
