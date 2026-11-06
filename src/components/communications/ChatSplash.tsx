import React from 'react';
import { Clock, MessageSquare, Sparkles } from 'lucide-react';

export type ChatMode = 'status' | 'chat' | 'tito';

/**
 * The Status / Chat / Tutor AI toggle at the top of the staff chat section
 * (tutors from the bottom nav, admins from the sidebar). Status comes first
 * and is the screen the section opens on. The toggle fills the top of the
 * screen and the active pill slides between the three stops.
 */
export const ChatModeToggle: React.FC<{
  mode: ChatMode;
  onChange: (m: ChatMode) => void;
}> = ({ mode, onChange }) => {
  const items: { key: ChatMode; label: string; icon: React.ReactNode }[] = [
    { key: 'status', label: 'Status', icon: <Clock className="w-4 h-4" /> },
    { key: 'chat', label: 'Chat', icon: <MessageSquare className="w-4 h-4" /> },
    { key: 'tito', label: 'Tutor AI', icon: <Sparkles className="w-4 h-4" /> },
  ];
  const idx = Math.max(0, items.findIndex((it) => it.key === mode));
  return (
    <div
      role="tablist"
      aria-label="Status, chat or Tutor AI"
      className="relative w-full rounded-2xl bg-slate-200/70 p-1 flex"
    >
      <div
        aria-hidden="true"
        className="absolute top-1 bottom-1 left-1 rounded-xl bg-[#EA580C] shadow-sm transition-transform duration-300 ease-out"
        style={{ width: 'calc((100% - 0.5rem) / 3)', transform: `translateX(${idx * 100}%)` }}
      />
      {items.map((it) => {
        const active = mode === it.key;
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.key)}
            className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl text-xs font-black transition-colors duration-200 cursor-pointer ${
              active ? 'text-white' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {it.icon}
            {it.label}
          </button>
        );
      })}
    </div>
  );
};
