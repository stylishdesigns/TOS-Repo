import React from 'react';
import { RefreshCw } from 'lucide-react';

// Retry button (Nov 21): a one-tap way to refresh the whole app, sitting
// beside the notifications bell in every portal header (student, tutor,
// admin). Every click reloads the app, so whatever is on screen re-reads
// its data from scratch.
interface RetryButtonProps {
  dark?: boolean;
  className?: string;
}

export const RetryButton: React.FC<RetryButtonProps> = ({ dark, className = '' }) => (
  <button
    onClick={() => window.location.reload()}
    title="Retry: refresh the app"
    aria-label="Retry: refresh the app"
    className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center transition-colors active:scale-95 ${
      dark
        ? 'border border-white/10 bg-white/10 text-white hover:bg-white/20'
        : 'border border-slate-200/80 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 shadow-2xs'
    } ${className}`}
  >
    <RefreshCw className="w-4 h-4" />
  </button>
);
