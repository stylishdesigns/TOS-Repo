import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

/**
 * The learning-resources subject dropdown (batch 43): a custom, app-branded
 * dropdown that replaces the filter chips on both Study materials and Video
 * classes. Not a browser select: it renders the facility's own card style.
 * One list, one value, shared by both views: picking a subject here is the
 * same as picking it there, and it starts on All. The options are the
 * subjects the student is registered for (their timetable), so the list is
 * theirs, not a list of everything on the platform.
 */

interface SubjectDropdownProps {
  dark: boolean;
  /** The subjects the student is registered for, without the All entry. */
  subjects: string[];
  /** Current selection: 'All' or one of subjects. */
  value: string;
  onChange: (next: string) => void;
}

export const SubjectDropdown: React.FC<SubjectDropdownProps> = ({ dark, subjects, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close when a tap lands outside the dropdown (phones tap away, they
  // rarely press Escape).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [open]);

  const options = ['All', ...subjects];
  const cardBg = dark ? 'bg-slate-800/90 border-slate-700' : 'bg-white border-[#E2E8F0]';
  const panelBg = dark ? 'bg-slate-800 border-slate-700' : 'bg-white border-[#E2E8F0]';
  const textMain = dark ? 'text-white' : 'text-[#0F172A]';
  const textSub = dark ? 'text-slate-400' : 'text-[#64748B]';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-full h-11 px-3.5 rounded-[14px] border flex items-center justify-between gap-2 transition-all ${cardBg} ${
          dark ? 'shadow-none' : 'shadow-2xs'
        }`}
      >
        <span className={`text-xs font-extrabold truncate ${textMain}`}>
          {value === 'All' ? 'All subjects' : value}
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${textSub} ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Choose a subject"
          className={`absolute left-0 right-0 top-[calc(100%+6px)] z-30 rounded-[14px] border overflow-hidden shadow-xl ${panelBg}`}
        >
          <div className="max-h-60 overflow-y-auto py-1">
            {options.map((s) => {
              const active = value === s || (s === 'All' && value === 'All');
              return (
                <button
                  key={s}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(s);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3.5 h-10 text-left text-xs font-bold transition-colors ${
                    active
                      ? 'text-[var(--brand,#0F172A)] bg-[var(--brand-soft,rgba(100,116,139,0.10))]'
                      : `${textMain} ${dark ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`
                  }`}
                >
                  <span className="truncate">{s === 'All' ? 'All subjects' : s}</span>
                  {active && <Check className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--brand,#0F172A)' }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default SubjectDropdown;
