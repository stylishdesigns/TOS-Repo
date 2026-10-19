import React from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { useScrollLock } from '../../hooks/useScrollLock';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'danger'
}) => {
  useScrollLock(isOpen);

  if (!isOpen) return null;

  const typeStyles = {
    danger: {
      icon: <AlertTriangle className="w-8 h-8 text-rose-500" />,
      bg: 'bg-rose-50',
      button: 'bg-rose-600 hover:bg-rose-700 shadow-rose-100',
    },
    warning: {
      icon: <AlertTriangle className="w-8 h-8 text-amber-500" />,
      bg: 'bg-amber-50',
      button: 'bg-amber-500 hover:bg-amber-600 shadow-amber-100',
    },
    info: {
      icon: <AlertTriangle className="w-8 h-8 text-blue-500" />,
      bg: 'bg-blue-50',
      button: 'bg-blue-600 hover:bg-blue-700 shadow-blue-100',
    }
  };

  const style = typeStyles[type];

  return (
    <div className="fixed inset-0 bg-black/60 z-[200] overflow-y-auto p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="min-h-full flex items-center justify-center py-8">
        <div className="bg-white rounded-[32px] max-w-sm w-full p-8 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-300 text-center relative">
          <div className={`w-16 h-16 ${style.bg} rounded-full flex items-center justify-center mx-auto mb-6`}>
            {style.icon}
          </div>
          
          <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-2">
            {title}
          </h3>
          
          <p className="text-sm font-bold text-slate-500 leading-relaxed mb-8">
            {message}
          </p>
          
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={onClose}
              className="py-3.5 px-4 bg-slate-50 text-slate-500 font-black text-[11px] uppercase tracking-widest rounded-2xl hover:bg-slate-100 transition-all active:scale-95"
            >
              {cancelText}
            </button>
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={`py-3.5 px-4 text-white font-black text-[11px] uppercase tracking-widest rounded-2xl transition-all shadow-lg active:scale-95 ${style.button}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
