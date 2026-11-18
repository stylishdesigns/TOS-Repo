import React, { useState, useEffect, useCallback } from 'react';
import { Bell, CalendarDays, BookOpen, ClipboardList, Trophy, Sparkles, X } from 'lucide-react';
import { api } from '../tos/tosShared';

// The student portal's notification bell: unread badge in the header, and a
// tap-open panel listing everything the facility has sent them. Subject-based
// notifications (classes, materials, exams) are filtered server-side to the
// subjects the student actually takes, so a student never sees a class for a
// subject they are not offering.
const TYPE_STYLES: Record<string, { icon: React.ReactNode; chip: string }> = {
  class: { icon: <CalendarDays className="w-4 h-4" />, chip: 'bg-orange-100 text-orange-700' },
  material: { icon: <BookOpen className="w-4 h-4" />, chip: 'bg-orange-100 text-orange-700' },
  mock: { icon: <ClipboardList className="w-4 h-4" />, chip: 'bg-orange-100 text-orange-700' },
  leaderboard: { icon: <Trophy className="w-4 h-4" />, chip: 'bg-amber-100 text-amber-700' },
  welcome: { icon: <Sparkles className="w-4 h-4" />, chip: 'bg-emerald-100 text-emerald-700' },
};

function timeAgo(at: number): string {
  const diff = Date.now() - at;
  if (diff < 60_000) return 'Just now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const out = await api('/api/student/notifications') as any;
      setUnread(Number(out?.unread) || 0);
      if (Array.isArray(out?.items)) setItems(out.items);
    } catch { /* the bell stays quiet when the feed can't load */ }
  }, []);

  // Badge count on portal load, and a one-time welcome note for this student.
  useEffect(() => {
    void refresh();
    if (!sessionStorage.getItem('tos:welcome-asked')) {
      sessionStorage.setItem('tos:welcome-asked', '1');
      void api('/api/student/notifications/welcome', { method: 'POST' }).catch(() => {});
    }
  }, [refresh]);

  const openPanel = async () => {
    setOpen(true);
    setLoading(true);
    await refresh();
    setLoading(false);
    if (unread > 0) {
      setUnread(0);
      void api('/api/student/notifications/read', { method: 'POST' }).catch(() => {});
    }
  };

  return (
    <>
      <button
        onClick={openPanel}
        className="w-9 h-9 rounded-xl bg-white/10 border border-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors relative"
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-orange-600 text-white text-[10px] font-black flex items-center justify-center border-2 border-slate-950">
            {unread > 9 ? '9+' : unread}
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
                <p className="text-[10px] text-white/60 font-semibold uppercase tracking-wider">Classes, materials, exams & results</p>
              </div>
              <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors" aria-label="Close notifications">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {loading && items.length === 0 && (
                <div className="px-4 py-10 text-center text-sm text-slate-400 font-semibold">Loading notifications...</div>
              )}
              {!loading && items.length === 0 && (
                <div className="px-4 py-10 text-center">
                  <Bell className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-sm font-black text-slate-900">You're all caught up</p>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">New classes, materials, exams and leaderboard news will show up here.</p>
                </div>
              )}
              {items.map((n) => {
                const style = TYPE_STYLES[n.type] || TYPE_STYLES.mock;
                return (
                  <div key={n.id} className="px-4 py-3 flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${style.chip}`}>
                      {style.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-black text-slate-900 leading-tight">{n.title}</p>
                        <span className="text-[10px] text-slate-400 font-bold shrink-0">{timeAgo(Number(n.at) || 0)}</span>
                      </div>
                      <p className="text-xs text-slate-600 font-medium mt-0.5 leading-relaxed break-words">{n.body}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
