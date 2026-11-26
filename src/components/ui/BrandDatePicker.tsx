import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

/**
 * The platform's own calendar date picker, used instead of the browser's date
 * picker: day, month and year are shown in the facility's brand colour with no
 * native controls, so the user always sees what they are picking. The panel is
 * position-aware: it opens downward when there is room below the trigger (a
 * picker near the top of the page) and upward only when the trigger sits near
 * the bottom of the screen, so it never runs off a phone screen either way.
 */

interface BrandDatePickerProps {
  /** The chosen date as YYYY-MM-DD (the same value an <input type=date> holds). */
  value: string;
  onChange: (value: string) => void;
  /** Brand accent, defaulting to the platform orange. */
  accent?: string;
  /** Latest selectable date as YYYY-MM-DD (e.g. 14 years ago for sign-up). */
  maxDate?: string;
  placeholder?: string;
  ariaLabel?: string;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const pad2 = (n: number) => String(n).padStart(2, '0');
const toKey = (y: number, m: number, d: number) => `${y}-${pad2(m + 1)}-${pad2(d)}`;

export const BrandDatePicker: React.FC<BrandDatePickerProps> = ({
  value, onChange, accent = '#EA580C', maxDate, placeholder = 'Select date', ariaLabel = 'Date picker',
}) => {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const parsed = useMemo(() => {
    if (!value) return null;
    const [y, m, d] = value.split('-').map((x) => parseInt(x, 10));
    if (!y || !m || !d) return null;
    return { y, m: m - 1, d };
  }, [value]);
  // The month the panel is looking at, kept separate from the chosen date so
  // browsing months never disturbs a choice.
  const [view, setView] = useState(() => {
    if (parsed) return { y: parsed.y, m: parsed.m };
    const cap = maxDate ? new Date(`${maxDate}T00:00:00`) : new Date();
    return { y: cap.getFullYear(), m: cap.getMonth() };
  });

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

  // Open the panel on the month of the chosen date (or the newest allowed one).
  useEffect(() => {
    if (open) setView(parsed ? { y: parsed.y, m: parsed.m } : (() => {
      const cap = maxDate ? new Date(`${maxDate}T00:00:00`) : new Date();
      return { y: cap.getFullYear(), m: cap.getMonth() };
    })());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const capDate = maxDate ? new Date(`${maxDate}T00:00:00`) : null;
  const dayTooLate = (y: number, m: number, d: number) =>
    !!capDate && new Date(y, m, d) > capDate;

  const shiftMonth = (delta: number) => {
    setView((v) => {
      const next = new Date(v.y, v.m + delta, 1);
      return { y: next.getFullYear(), m: next.getMonth() };
    });
  };
  const shiftYear = (delta: number) => {
    setView((v) => ({ y: v.y + delta, m: v.m }));
  };

  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1);
    const lead = first.getDay(); // Sunday-first offset
    const days = new Date(view.y, view.m + 1, 0).getDate();
    const out: (number | null)[] = [];
    for (let i = 0; i < lead; i++) out.push(null);
    for (let d = 1; d <= days; d++) out.push(d);
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [view]);

  const display = parsed
    ? `${pad2(parsed.d)} ${MONTHS[parsed.m].slice(0, 3)} ${parsed.y}`
    : placeholder;

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => {
          if (!open && boxRef.current) {
            // Position-aware: open downward when there is room below the
            // trigger, upward only when the trigger sits near the screen bottom.
            const rect = boxRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            setDropUp(spaceBelow < 380 && spaceAbove > spaceBelow);
          }
          setOpen((o) => !o);
        }}
        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-left text-sm outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all flex items-center justify-between"
        style={{ color: parsed ? '#0F172A' : '#94A3B8', fontWeight: 600 }}
      >
        <span className="truncate mr-2">{display}</span>
        <Calendar className="w-4 h-4 shrink-0" style={{ color: accent }} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Calendar"
          className={`absolute z-[110] left-0 ${dropUp ? 'bottom-full mb-2 animate-in fade-in slide-in-from-bottom-2' : 'top-full mt-2 animate-in fade-in slide-in-from-top-2'} bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden duration-200`}
          style={{ width: 'max(100%, 272px)', maxWidth: 'calc(100vw - 32px)', padding: 12 }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center">
              <button type="button" aria-label="Previous year" onClick={() => shiftYear(-1)}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 font-black text-xs">
                {'\u00AB'}
              </button>
              <button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100">
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
            <span className="text-sm font-black text-slate-900">
              {MONTHS[view.m]} {view.y}
            </span>
            <div className="flex items-center">
              <button type="button" aria-label="Next month" onClick={() => shiftMonth(1)}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100">
                <ChevronRight className="w-4 h-4" />
              </button>
              <button type="button" aria-label="Next year" onClick={() => shiftYear(1)}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 font-black text-xs">
                {'\u00BB'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map((w, i) => (
              <span key={i} className="h-8 flex items-center justify-center text-[10px] font-black uppercase text-slate-400">{w}</span>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {cells.map((d, i) => {
              if (d === null) return <span key={i} />;
              const selected = !!parsed && parsed.y === view.y && parsed.m === view.m && parsed.d === d;
              const late = dayTooLate(view.y, view.m, d);
              return (
                <button
                  key={i}
                  type="button"
                  disabled={late}
                  onClick={() => { onChange(toKey(view.y, view.m, d)); setOpen(false); }}
                  className="h-10 min-h-[44px] rounded-lg flex items-center justify-center text-sm font-bold transition-all"
                  style={
                    selected
                      ? { background: accent, color: '#fff' }
                      : late
                        ? { color: '#CBD5E1', cursor: 'not-allowed' }
                        : { color: '#0F172A' }
                  }
                >
                  <span className={`w-9 h-9 flex items-center justify-center rounded-full ${!selected && !late ? 'hover:bg-slate-100' : ''}`}>{d}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false); }}
            className="mt-1 w-full text-[11px] font-bold text-slate-400 hover:text-slate-600 py-2"
          >
            Clear date
          </button>
        </div>
      )}
    </div>
  );
};
