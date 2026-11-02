import React from 'react';
import { Clock, MessageSquare } from 'lucide-react';

/**
 * The Status/Chat toggle at the top of the staff chat section (tutors from
 * the bottom nav, admins from the sidebar). Status comes first and is the
 * screen the section opens on; Chat is the next stop.
 */
export const ChatModeToggle: React.FC<{
  mode: 'status' | 'chat';
  onChange: (m: 'status' | 'chat') => void;
}> = ({ mode, onChange }) => {
  const items = [
    { key: 'status' as const, label: 'Status', icon: <Clock className="w-4 h-4" /> },
    { key: 'chat' as const, label: 'Chat', icon: <MessageSquare className="w-4 h-4" /> },
  ];
  return (
    <div
      role="tablist"
      aria-label="Status or chat"
      className="inline-flex items-center gap-1 rounded-full bg-slate-100 p-1"
    >
      {items.map((it) => {
        const active = mode === it.key;
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.key)}
            className={`flex items-center gap-1.5 px-4 h-9 rounded-full text-xs font-black transition cursor-pointer ${
              active
                ? 'bg-[#EA580C] text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
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
