import React, { useEffect } from 'react';
import { Clock, MessageSquare, X } from 'lucide-react';

/**
 * The bottom splash staff see when they open chat (tutors from the bottom
 * nav, admins from the sidebar): one chooser with the two things chat
 * offers, Status and Chat. Escape, the dim area and the X close it, the
 * same way the student screens close theirs.
 */
export const ChatSplash: React.FC<{
  onStatus: () => void;
  onChat: () => void;
  onClose: () => void;
}> = ({ onStatus, onChat, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Chat options"
        className="w-full max-w-md bg-white rounded-t-[28px] px-5 pt-5 pb-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-black text-slate-800">What would you like to open?</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat options"
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="grid gap-2">
          <button
            type="button"
            onClick={onStatus}
            className="w-full flex items-center gap-3 p-3 rounded-2xl border border-slate-200 hover:border-[#EA580C] hover:bg-[#FFF7ED] transition text-left"
          >
            <span className="w-10 h-10 rounded-full bg-[#FFF7ED] text-[#C2410C] flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5" />
            </span>
            <span>
              <span className="block text-sm font-bold text-slate-800">Status</span>
              <span className="block text-xs text-slate-500">Updates from your centre, 24 hours at a time</span>
            </span>
          </button>
          <button
            type="button"
            onClick={onChat}
            className="w-full flex items-center gap-3 p-3 rounded-2xl border border-slate-200 hover:border-[#EA580C] hover:bg-[#FFF7ED] transition text-left"
          >
            <span className="w-10 h-10 rounded-full bg-[#FFF7ED] text-[#C2410C] flex items-center justify-center shrink-0">
              <MessageSquare className="w-5 h-5" />
            </span>
            <span>
              <span className="block text-sm font-bold text-slate-800">Chat</span>
              <span className="block text-xs text-slate-500">Messages with everyone in your centre</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
