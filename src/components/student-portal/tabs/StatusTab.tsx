import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
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
// a fresh sync runs behind it, with no loading screen. Posting (S2), the
// viewer (S3) and media statuses (S4) arrive in their own pieces, so for now
// the rows are display-only and nothing here writes to the server.
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
          {/* My status row. Posting is piece S2, so this row is display-only
              for now: it shows my latest status's age, or the prototype's
              add prompt when I have none. */}
          <div className="bg-white rounded-3xl p-4 border border-slate-200/90 shadow-sm flex items-center gap-3">
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
          </div>

          {!showLists && (
            <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm text-center">
              <p className="text-xs text-slate-500 font-medium">No updates from your centre yet.</p>
            </div>
          )}

          {recent.length > 0 && <StatusList label="RECENT UPDATES" items={recent} />}
          {viewed.length > 0 && <StatusList label="VIEWED" items={viewed} dimmed />}
        </>
      )}

      {!data && failed && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm text-center">
          <p className="text-xs text-slate-500 font-medium">Status could not load. Try again in a moment.</p>
        </div>
      )}
    </div>
  );
};
