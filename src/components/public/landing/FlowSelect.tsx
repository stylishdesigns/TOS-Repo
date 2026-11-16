import React, { useEffect, useRef, useState } from 'react';

export interface FlowOption {
  value: string;
  label: string;
}

/**
 * FlowSelect (2026-11-16): the signup flow's own dropdown. Same look as the
 * platform's inputs instead of the browser's native select UI: a styled
 * trigger that opens a floating list of options. Closes on an outside tap,
 * Escape, or a pick; arrow keys walk the options.
 */
export const FlowSelect: React.FC<{
  id?: string;
  value: string;
  options: FlowOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  ariaLabel?: string;
}> = ({ id, value, options, onChange, disabled, invalid, ariaLabel }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (ev: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(ev.target as Node)) setOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((p) => !p)}
        onKeyDown={(ev) => {
          if (!open && (ev.key === 'ArrowDown' || ev.key === 'Enter' || ev.key === ' ')) {
            ev.preventDefault();
            setOpen(true);
            return;
          }
          if (!open) return;
          const i = options.findIndex((o) => o.value === value);
          if (ev.key === 'ArrowDown') {
            ev.preventDefault();
            pick(options[Math.min(i + 1, options.length - 1)].value);
          } else if (ev.key === 'ArrowUp') {
            ev.preventDefault();
            pick(options[Math.max(i - 1, 0)].value);
          }
        }}
        style={{
          width: '100%',
          minHeight: '48px',
          borderRadius: '12px',
          border: invalid ? '1px solid #DC2626' : '1px solid #CBD5E1',
          padding: '10px 40px 10px 14px',
          font: '500 15px Inter, sans-serif',
          color: current ? '#0F172A' : '#94A3B8',
          background: disabled ? '#F1F5F9' : '#fff',
          textAlign: 'left',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          opacity: disabled ? 0.8 : 1,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {current ? current.label : 'Choose one'}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          aria-hidden="true"
          style={{ position: 'absolute', right: 14, flex: 'none', color: '#64748B', transition: 'transform .18s ease', transform: open ? 'rotate(180deg)' : 'none' }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 'calc(100% + 6px)',
            background: '#fff',
            border: '1px solid #E2E8F0',
            borderRadius: '14px',
            boxShadow: '0 18px 44px rgba(15,23,42,.16)',
            padding: '6px',
            zIndex: 30,
            maxHeight: '264px',
            overflowY: 'auto',
          }}
        >
          {options.map((o) => {
            const on = o.value === value;
            return (
              <button
                key={o.value || '(empty)'}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => pick(o.value)}
                style={{
                  display: 'flex',
                  width: '100%',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  minHeight: '44px',
                  padding: '9px 12px',
                  borderRadius: '10px',
                  border: 'none',
                  background: on ? '#FFF7ED' : 'transparent',
                  font: '500 15px Inter, sans-serif',
                  color: on ? '#9A3412' : '#0F172A',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span>{o.label}</span>
                {on && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#EA580C', flex: 'none' }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
