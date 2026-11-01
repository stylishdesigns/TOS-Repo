import React, { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Student } from '../../../types';
import { api } from '../../tos/tosShared';
import { loadLastGood, saveLastGood } from '../../../lib/lastGood';

// ============================================================================
// Status, piece S1: the read-only Status screen.
//
// Matches the Status prototype: "Updates from your centre", the My status row,
// RECENT UPDATES and VIEWED. Every number here is server data: the screen
// renders what GET /api/student/chat/status/overview returned and invents
// nothing. The instant-open last-good copy opens the screen on old data while
// a fresh sync runs behind it, with no loading screen. Text posting (S2) is
// wired here; the viewer (S3) and media statuses (S4) arrive in their own
// pieces, so own-status viewing taps stay on the add path for now.
// ============================================================================

interface StatusEntry {
  uid: string;
  name: string;
  username: string;
  statusId: string;
  kind: string;
  at: number;
  expiresAt: number;
  text: string;
}

interface StatusOverview {
  ok: boolean;
  enabled: boolean;
  settings?: {
    allowText: boolean;
    allowPhoto: boolean;
    allowVideo: boolean;
    allowMusic: boolean;
    allowReplies: boolean;
    lastsHours: number;
    statusesPerDay: number;
    maxTextChars: number;
    maxVideoSeconds: number;
  };
  me?: {
    name: string;
    username: string;
    latest: { statusId: string; kind: string; at: number; expiresAt: number; text: string } | null;
  };
  recent?: StatusEntry[];
  viewed?: StatusEntry[];
}

function initials(name: string): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  const made = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('');
  return made || '?';
}

/** Timestamp labels in the prototype's voice: "12 minutes ago" for fresh
 *  ones, "Today, 8:40 AM" earlier the same day, then "Yesterday" and a short
 *  date. Computed from the status's own stored time, never invented. */
function statusTimeLabel(at: number, now = Date.now()): string {
  if (!Number.isFinite(at) || at <= 0) return '';
  const d = new Date(at);
  const age = now - at;
  if (age < 60 * 60 * 1000) {
    const m = Math.max(1, Math.floor(age / 60000));
    return `${m} minute${m === 1 ? '' : 's'} ago`;
  }
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(new Date(now)) - startOfDay(d)) / 86400000);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (days <= 0) return `Today, ${time}`;
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Escape closes any status overlay, matching the fan menu's Escape behaviour. */
function useEscape(onEscape: () => void) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onEscape]);
}

/** The composer's background palette. This is screen furniture, not data:
 *  the update itself stores whichever colour was picked, and the settings
 *  (not this list) decide every limit. */
const STATUS_BG = [
  '#0F172A', '#7C3AED', '#2563EB', '#059669',
  '#CA8A04', '#DB2777', '#EA580C', '#0F766E',
];

function bgLuminance(hex: string): number {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

const AddStatusSheet: React.FC<{
  settings: NonNullable<StatusOverview['settings']>;
  onClose: () => void;
  onText: () => void;
}> = ({ settings, onClose, onText }) => {
  useEscape(onClose);
  return (
  <div
    className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50"
    role="dialog"
    aria-modal="true"
    aria-label="Add status"
    onClick={onClose}
  >
    <div
      className="w-full max-w-lg bg-white rounded-t-3xl p-5 pb-8 shadow-2xl animate-in slide-in-from-bottom duration-200"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-black text-slate-900 tracking-tight">Add status</h3>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 active:scale-95 transition"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="text-xs text-slate-500 font-medium">Choose what to share</p>
      <div className="mt-4 space-y-2">
        {settings.allowText && (
          <button
            onClick={onText}
            className="w-full text-left rounded-2xl px-4 py-3 border border-slate-200 bg-white active:scale-[0.99] transition flex items-center gap-3"
          >
            <span className="w-10 h-10 rounded-xl bg-[#FFF7ED] text-[#C2410C] flex items-center justify-center font-black">Aa</span>
            <span className="min-w-0">
              <span className="block text-sm font-black text-slate-900">Text</span>
              <span className="block text-xs text-slate-500 font-medium">Type an update on a colour background</span>
            </span>
          </button>
        )}
        {[
          { label: 'Photo', note: 'From your gallery or camera' },
          { label: 'Video', note: `Up to ${settings.maxVideoSeconds} sec, set by Tutorial OS` },
          { label: 'Music', note: 'Share a track with your status' },
        ].map((row) => (
          <div
            key={row.label}
            className="rounded-2xl px-4 py-3 border border-slate-200 bg-slate-50 flex items-center gap-3 opacity-60"
            aria-disabled="true"
          >
            <span className="w-10 h-10 rounded-xl bg-slate-200 text-slate-500 flex items-center justify-center font-black">
              {row.label[0]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black text-slate-700">{row.label}</span>
              <span className="block text-xs text-slate-500 font-medium">{row.note}</span>
            </span>
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 bg-white border border-slate-200 rounded-full px-2 py-1">soon</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[11px] text-slate-400 font-medium text-center">
        Your status disappears after {settings.lastsHours} hours. Limits are set by Tutorial OS.
      </p>
    </div>
  </div>
  );
};

const TextComposer: React.FC<{
  settings: NonNullable<StatusOverview['settings']>;
  onClose: () => void;
  onPosted: (status: { statusId: string; kind: string; at: number; expiresAt: number; text: string }) => void;
}> = ({ settings, onClose, onPosted }) => {
  useEscape(onClose);
  const [bg, setBg] = useState(STATUS_BG[0]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const share = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setErr('');
    try {
      const d = await api('/api/student/chat/status', { method: 'POST', body: { kind: 'text', text: text.trim(), bg } });
      if (d && d.ok && d.status) onPosted(d.status);
      else throw new Error(String(d?.error || 'The update could not be shared. Try again.'));
    } catch (e: any) {
      setErr(String(e?.message || 'The update could not be shared. Try again.'));
      setBusy(false);
    }
  };

  const dark = bgLuminance(bg) < 0.5;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: bg }}
      role="dialog"
      aria-modal="true"
      aria-label="Add a text status"
    >
      <div className="flex items-center justify-between p-4">
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-95 transition"
          style={{ color: dark ? '#FFFFFF' : '#0F172A', backgroundColor: dark ? 'rgba(255,255,255,0.15)' : 'rgba(15,23,42,0.08)' }}
          aria-label="Discard update"
        >
          <X className="w-4 h-4" />
        </button>
        <button
          onClick={share}
          disabled={!text.trim() || busy}
          className="px-5 h-9 rounded-xl font-black text-sm active:scale-95 transition disabled:opacity-40"
          style={{ color: dark ? '#0F172A' : '#FFFFFF', backgroundColor: dark ? '#FFFFFF' : 'rgba(255,255,255,0.25)' }}
        >
          {busy ? 'Sharing...' : 'Share'}
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center px-8">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, settings.maxTextChars))}
          placeholder="Type an update"
          rows={4}
          className="w-full bg-transparent text-center text-2xl font-black tracking-tight resize-none outline-none placeholder:opacity-40"
          style={{ color: dark ? '#FFFFFF' : '#0F172A' }}
        />
      </div>
      {err && (
        <p className="px-6 pb-2 text-xs font-bold text-center" style={{ color: dark ? '#FFFFFF' : '#B91C1C' }}>{err}</p>
      )}
      <div className="p-5 pb-8 space-y-3">
        <div className="flex items-center justify-center gap-2.5">
          {STATUS_BG.map((c) => (
            <button
              key={c}
              onClick={() => setBg(c)}
              className={`w-8 h-8 rounded-full transition ${bg === c ? 'ring-2 ring-white ring-offset-2 ring-offset-transparent' : ''}`}
              style={{ backgroundColor: c, outline: bg === c ? `2px solid ${dark ? '#FFFFFF' : '#0F172A'}` : 'none', outlineOffset: '2px' }}
              aria-label={`Background ${c}`}
              aria-pressed={bg === c}
            />
          ))}
        </div>
        <p className="text-center text-[11px] font-bold" style={{ color: dark ? 'rgba(255,255,255,0.7)' : 'rgba(15,23,42,0.5)' }}>
          {text.length}/{settings.maxTextChars}
        </p>
      </div>
    </div>
  );
};

const StatusRow: React.FC<{ entry: StatusEntry; dimmed?: boolean }> = ({ entry, dimmed }) => (
  <div
    className={`bg-white rounded-2xl px-4 py-3 border border-slate-200/90 shadow-sm flex items-center gap-3 ${
      dimmed ? 'opacity-60' : ''
    }`}
  >
    <div
      className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-black shrink-0 ${
        dimmed
          ? 'bg-slate-100 text-slate-400 border border-slate-200'
          : 'bg-[#FFF7ED] text-[#C2410C] border-2 border-[#EA580C]'
      }`}
      aria-hidden="true"
    >
      {initials(entry.name || entry.username)}
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-black text-slate-900 truncate">{entry.name || (entry.username ? `@${entry.username}` : 'Student')}</p>
      <p className="text-xs text-slate-500 font-medium truncate">
        {entry.username ? `@${entry.username} · ` : ''}
        {statusTimeLabel(entry.at)}
      </p>
    </div>
  </div>
);

const StatusList: React.FC<{ label: string; items: StatusEntry[]; dimmed?: boolean }> = ({ label, items, dimmed }) => (
  <div className="space-y-2">
    <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 px-1">{label}</p>
    <div className="space-y-2">
      {items.map((it) => (
        <StatusRow key={it.statusId} entry={it} dimmed={dimmed} />
      ))}
    </div>
  </div>
);

export const StatusScreen: React.FC<{ student: Student }> = ({ student }) => {
  const cacheKey = 'chat:status';
  const [data, setData] = useState<StatusOverview | null>(() => loadLastGood<StatusOverview>(cacheKey));
  const [failed, setFailed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    let alive = true;
    api('/api/student/chat/status/overview')
      .then((d: StatusOverview) => {
        if (!alive) return;
        if (d && d.ok) {
          setData(d);
          saveLastGood(cacheKey, d);
          setFailed(false);
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [cacheKey]);

  const me = data?.me || null;
  const recent = data?.recent || [];
  const viewed = data?.viewed || [];
  const showLists = recent.length > 0 || viewed.length > 0;

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Status</h2>
        <p className="text-[11px] text-slate-500 font-medium">Updates from your centre</p>
      </div>

      {data && data.enabled === false && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm text-center space-y-2">
          <h3 className="text-base font-black text-slate-900 tracking-tight">Status is off</h3>
          <p className="text-xs text-slate-500 leading-relaxed font-medium">
            Status updates are not turned on for now.
          </p>
        </div>
      )}

      {data && data.enabled !== false && (
        <>
          {/* My status row. Tapping it opens the Add sheet (piece S2); the
              own-status viewer is the next piece, so a posted status shows
              its age here and viewing taps stay on the add path for now. */}
          <button
            onClick={() => setSheetOpen(true)}
            className="w-full text-left bg-white rounded-3xl p-4 border border-slate-200/90 shadow-sm flex items-center gap-3 active:scale-[0.99] transition"
          >
            <div className="relative shrink-0">
              <div className="w-12 h-12 rounded-full bg-[#FFF7ED] border-2 border-[#EA580C] flex items-center justify-center text-[#C2410C] text-sm font-black">
                {initials(me?.name || student.name)}
              </div>
              {!me?.latest && (
                <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#EA580C] text-white flex items-center justify-center border-2 border-white">
                  <Plus className="w-3 h-3" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-900">My status</p>
              <p className="text-xs text-slate-500 font-medium truncate">
                {me?.latest ? statusTimeLabel(me.latest.at) : 'Tap to add a photo or text update'}
              </p>
            </div>
          </button>

          {!showLists && (
            <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm text-center">
              <p className="text-xs text-slate-500 font-medium">No updates from your centre yet.</p>
            </div>
          )}

          {recent.length > 0 && <StatusList label="RECENT UPDATES" items={recent} />}
          {viewed.length > 0 && <StatusList label="VIEWED" items={viewed} dimmed />}
        </>
      )}

      {sheetOpen && data?.settings && (
        <AddStatusSheet
          settings={data.settings}
          onClose={() => setSheetOpen(false)}
          onText={() => {
            setSheetOpen(false);
            setComposing(true);
          }}
        />
      )}

      {composing && data?.settings && (
        <TextComposer
          settings={data.settings}
          onClose={() => setComposing(false)}
          onPosted={(status) => {
            setComposing(false);
            setSheetOpen(false);
            setData((prev) => {
              if (!prev) return prev;
              const next: StatusOverview = { ...prev, me: { name: prev.me?.name || student.name, username: prev.me?.username || '', latest: status } };
              saveLastGood(cacheKey, next);
              return next;
            });
          }}
        />
      )}

      {!data && failed && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm text-center">
          <p className="text-xs text-slate-500 font-medium">Status could not load. Try again in a moment.</p>
        </div>
      )}
    </div>
  );
};
