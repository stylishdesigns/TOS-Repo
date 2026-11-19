import React, { useState, useEffect, useCallback } from 'react';
import { Bell, CalendarDays, BookOpen, ClipboardList, Trophy, Sparkles, Clock, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { api } from '../tos/tosShared';
import { pushStatus } from './push';

// The student portal's notification bell (rebuilt Nov 19): unread badge in
// the header, and a tap-open panel listing everything the facility has sent
// them, each item tagged by type, with real per-item read state and filter
// chips. Subject-based notifications (classes, materials, mocks) are filtered
// server-side to the subjects the student actually takes.

// Planner reminders: a reminder a member set on their academic schedule
// planner surfaces in this bell on the day it is due, and every reminder the
// sender actually pushes is also filed into this history as a `rem-<id>`
// notification, so a swiped-away push is never lost. Everything is computed
// in the browser from data the portal already loads (the member's own
// document carries plannerReminders), so no extra database reads: read state
// lives in localStorage on this device.
function parseTimeToMinutes(t: string): number | null {
  const raw = (t || '').trim().toLowerCase();
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3];
  if (Number.isNaN(h) || Number.isNaN(min) || min > 59) return null;
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return h * 60 + min;
}

function localToday(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function dayLabel(dateStr: string): string {
  const parts = dateStr.split('-').map((v) => parseInt(v, 10));
  if (parts.length !== 3 || parts.some(Number.isNaN)) return dateStr;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const SEEN_KEY = 'tos:planner-seen-reminders';
const READ_KEY = 'tos:notification-read';

function loadSeen(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((v) => typeof v === 'string') : [];
  } catch { return []; }
}

function saveSeen(ids: string[]) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-300))); } catch { /* private mode */ }
}

function loadRead(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(READ_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((v) => typeof v === 'string') : [];
  } catch { return []; }
}

function saveRead(ids: string[]) {
  try { localStorage.setItem(READ_KEY, JSON.stringify(ids.slice(-500))); } catch { /* private mode */ }
}

const TYPE_STYLES: Record<string, { icon: React.ReactNode; chip: string; label: string }> = {
  class: { icon: <CalendarDays className="w-4 h-4" />, chip: 'bg-orange-100 text-orange-700', label: 'Class' },
  material: { icon: <BookOpen className="w-4 h-4" />, chip: 'bg-orange-100 text-orange-700', label: 'Material' },
  mock: { icon: <ClipboardList className="w-4 h-4" />, chip: 'bg-orange-100 text-orange-700', label: 'Mock' },
  leaderboard: { icon: <Trophy className="w-4 h-4" />, chip: 'bg-amber-100 text-amber-700', label: 'Leaderboard' },
  welcome: { icon: <Sparkles className="w-4 h-4" />, chip: 'bg-emerald-100 text-emerald-700', label: 'Welcome' },
  reminder: { icon: <Clock className="w-4 h-4" />, chip: 'bg-amber-100 text-amber-700', label: 'Reminder' },
};

const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'reminder', label: 'Reminders' },
  { key: 'class', label: 'Classes' },
  { key: 'material', label: 'Materials' },
  { key: 'mock', label: 'Mocks' },
];

function timeAgo(at: number): string {
  const diff = Date.now() - at;
  if (diff < 60_000) return 'Just now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(diff / 86_400_000);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [seenTick, setSeenTick] = useState(0);
  const [readTick, setReadTick] = useState(0);
  const [filter, setFilter] = useState('all');
  const [push, setPush] = useState(() => pushStatus());
  const { plannerReminders, addToast } = useApp() as any;

  const readRef = React.useRef<Set<string>>(new Set(loadRead()));
  if (readRef.current.size === 0 && loadRead().length > 0) readRef.current = new Set(loadRead());

  // A reminder the sender already delivered exists in the history as
  // rem-<reminderId>; the planner row then stands down so it never shows
  // twice (once as upcoming, once as delivered).
  const deliveredIds = React.useMemo(() => {
    const s = new Set<string>();
    for (const n of items) {
      const id = String(n?.id || '');
      if (id.startsWith('rem-')) s.add(id.slice(4));
    }
    return s;
  }, [items]);

  const dueReminders = React.useMemo(() => {
    const today = localToday();
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const seen = new Set(loadSeen());
    return (Array.isArray(plannerReminders) ? plannerReminders : [])
      .filter((r: any) => {
        const date = String(r?.date || '');
        if (!date || !r?.title) return false;
        if (date < today) return true;
        if (date > today) return false;
        const t = parseTimeToMinutes(String(r?.time || ''));
        return t === null ? true : t <= nowMin;
      })
      .filter((r: any) => !seen.has(String(r.id)) && !deliveredIds.has(String(r.id)));
  }, [plannerReminders, seenTick, deliveredIds]);

  // Upcoming reminders stay visible in the bell until they come due, so a
  // reminder the student just set is never a silent surprise.
  const upcomingReminders = React.useMemo(() => {
    const today = localToday();
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    return (Array.isArray(plannerReminders) ? plannerReminders : [])
      .filter((r: any) => {
        const date = String(r?.date || '');
        if (!date || !r?.title) return false;
        if (deliveredIds.has(String(r.id))) return false;
        if (date < today) return false;
        if (date > today) return true;
        const t = parseTimeToMinutes(String(r?.time || ''));
        return t !== null && t > nowMin;
      })
      .sort((a: any, b: any) =>
        String(a.date).localeCompare(String(b.date)) ||
        String(a.time || '').localeCompare(String(b.time || '')));
  }, [plannerReminders, deliveredIds]);

  const toastRef = React.useRef<Set<string>>(new Set());

  // While the app is open, a reminder that comes due gets a toast so it does
  // not wait silently for the next bell check. No timer: this re-checks only
  // when the reminders change or the user returns to the app.
  React.useEffect(() => {
    const announce = () => {
      const latest = dueReminders[dueReminders.length - 1] as any;
      if (!latest || toastRef.current.has(String(latest.id))) return;
      toastRef.current.add(String(latest.id));
      const when = String(latest.date) === localToday()
        ? `today at ${latest.time || 'the set time'}`
        : `for ${dayLabel(String(latest.date))} at ${latest.time || 'the set time'}`;
      addToast({
        type: 'info',
        title: 'Planner reminder',
        description: `${String(latest.title)} ${when}. It is waiting in your notifications.`,
      });
    };
    announce();
    const onVis = () => { if (document.visibilityState === 'visible') announce(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [dueReminders, addToast]);

  const refresh = useCallback(async () => {
    try {
      const out = await api('/api/student/notifications') as any;
      if (Array.isArray(out?.items)) setItems(out.items);
    } catch { /* the bell stays quiet when the feed can't load */ }
  }, []);

  const markAllRead = useCallback(() => {
    const next = new Set(readRef.current);
    let added = false;
    for (const n of items) {
      if (!next.has(String(n.id))) { next.add(String(n.id)); added = true; }
    }
    if (added) { readRef.current = next; saveRead([...next]); setReadTick((t) => t + 1); }
  }, [items]);

  // Badge count on portal load, and a one-time welcome note for this student.
  useEffect(() => {
    void refresh();
    if (!sessionStorage.getItem('tos:welcome-asked')) {
      sessionStorage.setItem('tos:welcome-asked', '1');
      void api('/api/student/notifications/welcome', { method: 'POST' }).catch(() => {});
    }
  }, [refresh]);

  const unreadCount = React.useMemo(
    () => items.filter((n) => !readRef.current.has(String(n.id))).length,
    [items, readTick],
  );

  const openPanel = async () => {
    setOpen(true);
    setLoading(true);
    setPush(pushStatus());
    await refresh();
    setLoading(false);
    if (dueReminders.length > 0) {
      saveSeen([...loadSeen(), ...dueReminders.map((r: any) => String(r.id))]);
      setSeenTick((t) => t + 1);
    }
    markAllRead();
    void api('/api/student/notifications/read', { method: 'POST' }).catch(() => {});
  };

  const visibleReminders = React.useMemo(() => {
    const rows = [...dueReminders.map((r: any) => ({ ...r, isDue: true })), ...upcomingReminders.map((r: any) => ({ ...r, isDue: false }))];
    if (filter === 'all' || filter === 'reminder') return rows;
    return [];
  }, [dueReminders, upcomingReminders, filter]);

  const visibleItems = React.useMemo(() => {
    if (filter === 'all') return items;
    if (filter === 'reminder') return [];
    return items.filter((n) => String(n.type) === filter);
  }, [items, filter]);

  return (
    <>
      <button
        onClick={openPanel}
        className="w-9 h-9 rounded-xl bg-white/10 border border-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors relative"
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount + dueReminders.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-orange-600 text-white text-[10px] font-black flex items-center justify-center border-2 border-slate-950">
            {unreadCount + dueReminders.length > 9 ? '9+' : unreadCount + dueReminders.length}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[70]" role="dialog" aria-label="Notifications">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute top-0 inset-x-0 sm:inset-x-auto sm:right-4 sm:top-16 sm:w-[400px] max-h-[80vh] bg-white rounded-b-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            <div className="bg-slate-950 text-white px-4 py-3.5 flex items-center justify-between shrink-0">
              <div>
                <p className="text-sm font-black">Notifications</p>
                <p className="text-[10px] text-white/60 font-semibold uppercase tracking-wider">Classes, materials, exams & reminders</p>
              </div>
              <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors" aria-label="Close notifications">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="shrink-0 border-b border-slate-100 px-3 py-2 flex items-center gap-1.5 overflow-x-auto">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-black whitespace-nowrap transition-colors ${filter === f.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {loading && items.length === 0 && visibleReminders.length === 0 && (
                <div className="px-4 py-10 text-center text-sm text-slate-400 font-semibold">Loading notifications...</div>
              )}
              {!loading && items.length === 0 && visibleReminders.length === 0 && (
                <div className="px-4 py-10 text-center">
                  <Bell className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-sm font-black text-slate-900">You're all caught up</p>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">New classes, materials, exams, reminders and leaderboard news will show up here.</p>
                </div>
              )}
              {visibleReminders.map((r: any) => {
                const today = String(r.date) === localToday();
                return (
                  <div key={r.id} className={`px-4 py-3 flex items-start gap-3 ${r.isDue ? 'bg-amber-50/60' : ''}`}>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${r.isDue ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                      <Clock className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-black text-slate-900 leading-tight">{String(r.title)}</p>
                        <span className={`text-[10px] font-bold shrink-0 ${r.isDue ? 'text-amber-600' : 'text-slate-400'}`}>{r.isDue ? 'Reminder' : 'Upcoming'}</span>
                      </div>
                      <p className="text-xs text-slate-600 font-medium mt-0.5 leading-relaxed break-words">
                        {r.isDue
                          ? (today
                            ? `Your planner reminder for today${r.time ? ` at ${r.time}` : ''}.`
                            : `Your planner reminder was set for ${dayLabel(String(r.date))}${r.time ? ` at ${r.time}` : ''}.`)
                          : `Scheduled for ${dayLabel(String(r.date))}${r.time ? ` at ${r.time}` : ''}.`}
                      </p>
                    </div>
                  </div>
                );
              })}
              {visibleItems.map((n) => {
                const style = TYPE_STYLES[n.type] || TYPE_STYLES.mock;
                const isUnread = !readRef.current.has(String(n.id));
                return (
                  <div key={n.id} className={`px-4 py-3 flex items-start gap-3 ${isUnread ? 'bg-orange-50/40' : ''}`}>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${style.chip}`}>
                      {style.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-orange-600 shrink-0" aria-label="Unread" />}
                          <p className="text-[13px] font-black text-slate-900 leading-tight">{n.title}</p>
                        </div>
                        <span className="text-[10px] text-slate-400 font-bold shrink-0">{timeAgo(Number(n.at) || 0)}</span>
                      </div>
                      <p className="text-xs text-slate-600 font-medium mt-0.5 leading-relaxed break-words">{n.body}</p>
                      <span className={`inline-block mt-1.5 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${style.chip}`}>{style.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="shrink-0 border-t border-slate-100 px-4 py-2.5 flex items-start gap-2.5 bg-white">
              <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${push.on ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <div className="min-w-0">
                <p className="text-[11px] font-black text-slate-700 leading-tight">{push.label}</p>
                <p className="text-[10px] text-slate-500 font-medium leading-snug">{push.detail}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
