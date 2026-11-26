import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, ChevronDown } from 'lucide-react';

/**
 * The platform's own time picker, used instead of the browser's time picker:
 * a trigger that reads like the other form fields and an in-app panel of
 * quarter-hour choices (6:00 AM to 10:00 PM) in the facility's brand colour,
 * so the user always sees what they are picking on every device.
 */

interface BrandTimePickerProps {
  /** The chosen time as HH:MM 24h (the same value an <input type=time> holds). */
  value: string;
  onChange: (value: string) => void;
  /** Brand accent, defaulting to the platform orange. */
  accent?: string;
  placeholder?: string;
  ariaLabel?: string;
}

const labelFor = (h: number, m: number) => {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
};

const keyFor = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

export const BrandTimePicker: React.FC<BrandTimePickerProps> = ({
  value, onChange, accent = '#EA580C', placeholder = 'Select time', ariaLabel = 'Time picker',
}) => {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const parsed = useMemo(() => {
    if (!value) return null;
    const [h, m] = value.split(':').map((x) => parseInt(x, 10));
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return { h, m };
  }, [value]);

  // Quarter-hour steps from 6:00 AM to 10:00 PM.
  const options = useMemo(() => {
    const list: { key: string; label: string; h: number; m: number }[] = [];
    for (let h = 6; h <= 22; h++) {
      for (const m of [0, 15, 30, 45]) {
        if (h === 22 && m > 0) continue;
        list.push({ key: keyFor(h, m), label: labelFor(h, m), h, m });
      }
    }
    return list;
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  // Open toward the room: downward when there is space below, upward near the
  // bottom of the screen, so the panel never runs off the view.
  const toggle = () => {
    if (open) { setOpen(false); return; }
    const box = boxRef.current?.getBoundingClientRect();
    if (box) setDropUp(window.innerHeight - box.bottom < 340);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    // Keep the chosen time in view when the panel opens.
    const t = setTimeout(() => {
      const chosen = listRef.current?.querySelector('[data-chosen="true"]');
      chosen?.scrollIntoView({ block: 'center' });
    }, 30);
    return () => clearTimeout(t);
  }, [open]);

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={toggle}
        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-bold outline-none focus:bg-white focus:border-orange-500 cursor-pointer flex items-center justify-between text-left"
      >
        <span className={`flex items-center space-x-2 ${parsed ? '' : 'text-slate-400'}`}>
          <Clock className="w-4 h-4 text-slate-400" />
          <span>{parsed ? labelFor(parsed.h, parsed.m) : placeholder}</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className={`absolute left-0 right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}
        >
          <div ref={listRef} className="max-h-64 overflow-y-auto py-1">
            {options.map((o) => {
              const chosen = parsed && parsed.h === o.h && parsed.m === o.m;
              return (
                <button
                  key={o.key}
                  type="button"
                  data-chosen={chosen ? 'true' : 'false'}
                  onClick={() => { onChange(o.key); setOpen(false); }}
                  className={`w-full text-left px-4 py-2 text-xs font-bold flex items-center justify-between border-b border-slate-50 last:border-0 ${
                    chosen ? 'text-white' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                  style={chosen ? { backgroundColor: accent } : undefined}
                >
                  <span>{o.label}</span>
                  {chosen && <span className="text-[10px] font-black uppercase tracking-widest">Selected</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
