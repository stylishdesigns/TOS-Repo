import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, MessageCircle, User, X } from 'lucide-react';
import { api } from '../../tos/tosShared';

// The new-chat sheet for personal (one-to-one) chats. It lists everyone under
// the student's own centre: students, tutors and admins, each with a real
// name and a Chat button. The server enforces every rule; this sheet only
// shows what it returns.

interface StudentEntry { uid: string; name: string; username?: string; avatar?: string }
interface StaffEntry { uid: string; name: string; role?: string; avatar?: string }

export const PersonalNewChatSheet: React.FC<{
  onClose: () => void;
  onOpenChat: (chatId: string, name: string) => void;
}> = ({ onClose, onOpenChat }) => {
  const [directory, setDirectory] = useState<{ students: StudentEntry[]; staff: StaffEntry[] } | null>(null);
  const [busyUid, setBusyUid] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api('/api/student/chat/directory');
        if (alive) setDirectory(res as any);
      } catch (e: any) {
        if (alive) setError(String(e?.message || 'Your centre members could not be loaded.'));
      }
    })();
    return () => { alive = false; };
  }, []);

  const openWith = async (uid: string) => {
    if (busyUid) return;
    setBusyUid(uid);
    setError('');
    try {
      const res: any = await api('/api/student/chat/personal', { method: 'POST', body: { uid } });
      onOpenChat(res.chatId, res.name || 'Chat');
    } catch (e: any) {
      setError(String(e?.message || 'That chat could not be opened.'));
    } finally {
      setBusyUid('');
    }
  };

  const empty = !!directory && directory.students.length === 0 && directory.staff.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-label="New chat">
      <button className="absolute inset-0 bg-slate-950/40" onClick={onClose} aria-label="Close new chat" />
      <div className="relative bg-white rounded-t-3xl max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-300">
        <div className="sticky top-0 bg-white rounded-t-3xl border-b border-slate-100 px-5 pt-4 pb-3 flex items-center justify-between">
          <h2 className="text-base font-black text-slate-900">New chat</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-2">
          {error && <p className="text-[11px] font-bold text-rose-600 bg-rose-50 rounded-xl px-3 py-2">{error}</p>}

          {!directory && !error && (
            <div className="flex items-center justify-center py-6 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}

          {directory && (
            <>
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1">Everyone in your centre</p>
              {empty && (
                <p className="text-xs text-slate-400 font-medium py-6 text-center">
                  Nobody else is in your centre yet. When students, tutors or admins join, they appear here.
                </p>
              )}
              {directory.students.map((s) => (
                <div key={s.uid} className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-3.5 py-2.5">
                  <span className="w-10 h-10 rounded-full bg-orange-50 border border-orange-100 text-[#EA580C] flex items-center justify-center text-xs font-black shrink-0 overflow-hidden">
                    {s.avatar
                      ? <img src={s.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      : ((s.name || '').trim().split(/\s+/).slice(0, 2).map((w) => (w[0] || '').toUpperCase()).join('') || <User className="w-5 h-5" />)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-slate-900 truncate">{s.name}</p>
                    <p className="text-[10px] text-slate-400 font-medium">Student</p>
                  </div>
                  <button
                    onClick={() => openWith(s.uid)}
                    disabled={busyUid === s.uid}
                    className="shrink-0 px-3.5 py-2 rounded-xl bg-[#EA580C] text-white text-[11px] font-black flex items-center gap-1.5 active:scale-95 transition disabled:opacity-50"
                    aria-label={`Chat with ${s.name}`}
                  >
                    {busyUid === s.uid ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />} Chat
                  </button>
                </div>
              ))}
              {directory.staff.map((s) => (
                <div key={s.uid} className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-3.5 py-2.5">
                  <span className="w-10 h-10 rounded-full bg-violet-50 border border-violet-100 text-violet-600 flex items-center justify-center text-xs font-black shrink-0 overflow-hidden">
                    {s.avatar
                      ? <img src={s.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      : ((s.name || '').trim().split(/\s+/).slice(0, 2).map((w) => (w[0] || '').toUpperCase()).join('') || <User className="w-5 h-5" />)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-slate-900 truncate">
                      {s.name}
                      {s.role === 'admin' && (
                        <span className="ml-1.5 align-middle text-[9px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full">Admin</span>
                      )}
                      {s.role === 'tutor' && (
                        <span className="ml-1.5 align-middle text-[9px] font-black uppercase tracking-wider text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded-full">Tutor</span>
                      )}
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium">{s.role === 'admin' ? 'Admin' : 'Tutor'}</p>
                  </div>
                  <button
                    onClick={() => openWith(s.uid)}
                    disabled={busyUid === s.uid}
                    className="shrink-0 px-3.5 py-2 rounded-xl bg-[#EA580C] text-white text-[11px] font-black flex items-center gap-1.5 active:scale-95 transition disabled:opacity-50"
                    aria-label={`Chat with ${s.name}`}
                  >
                    {busyUid === s.uid ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />} Chat
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
