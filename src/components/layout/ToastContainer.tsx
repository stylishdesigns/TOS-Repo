import React from 'react';
import { useApp } from '../../context/AppContext';
import { brandVars } from '../../lib/brand';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast, brandAccent } = useApp();
  const accent = brandAccent || '#EA580C';

  if (toasts.length === 0) return null;

  return (
    <div
      id="toast-notifications-container"
      className="fixed bottom-5 right-3 left-3 sm:left-auto sm:right-5 z-50 flex flex-col gap-2.5 sm:max-w-sm pointer-events-none"
    style={brandVars(accent)}
    >
      {toasts.map((toast) => {
        return (
          <div
            key={toast.id}
            className="pointer-events-auto relative overflow-hidden rounded-2xl bg-white border border-slate-200/70 shadow-[0_16px_40px_-16px_rgba(15,23,42,0.4)] pl-5 pr-2.5 py-3.5 flex items-start gap-3 animate-in slide-in-from-bottom-4 fade-in duration-300"
          >
            {/* Facility brand accent bar */}
            <span
              aria-hidden="true"
              className="absolute left-0 top-0 bottom-0 w-1.5 bg-orange-600"
            />

            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-orange-100 text-orange-700">
              {toast.type === 'success' && <CheckCircle2 className="w-5 h-5" />}
              {toast.type === 'error' && <AlertCircle className="w-5 h-5" />}
              {toast.type === 'info' && <Info className="w-5 h-5" />}
            </div>

            <div className="flex-1 min-w-0 pt-0.5">
              <p className="text-sm font-bold text-slate-900 leading-tight">{toast.title}</p>
              {toast.description && (
                <p className="text-[13px] text-slate-700 mt-1 leading-normal">{toast.description}</p>
              )}
            </div>

            <button
              onClick={() => removeToast(toast.id)}
              className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1 rounded-lg transition-colors shrink-0"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
