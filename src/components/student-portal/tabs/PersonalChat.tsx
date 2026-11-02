import React, { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, UserPlus, X } from 'lucide-react';
import { api } from '../../tos/tosShared';

// The new-chat sheet for personal (one-to-one) chats. Two ways in: pick
// anyone from your centre (students by username, staff by staff name), or
// add a student from another centre by their leaderboard username, which
// sends a friend request. The server enforces every rule; this sheet only
// shows what it returns.

interface DirectoryEntry { uid: string; username?: string; name?: string }
interface FriendsPayload {
  incoming: { id: string; uid: string; username: string; centreName: string }[];
  outgoing: { id: string; uid: string; username: string; centreName: string }[];
  friends: { id: string; uid: string; username: string; centreName: string }[];
}

export const PersonalNewChatSheet: React.FC<{
  onClose: () => void;
  onOpenChat: (chatId: string, name: string) => void;
}> = ({ onClose, onOpenChat }) => {
  const [directory, setDirectory] = useState<{ students: DirectoryEntry[]; staff: DirectoryEntry[] } | null>(null);
  const [friends, setFriends] = useState<FriendsPayload | null>(null);
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const loadFriends = useCallback(async () => {
    try {
      const res = await api('/api/student/chat/friends');
      setFriends(res as FriendsPayload);
    } catch (e: any) {
      setError(String(e?.message || 'Friends could not be loaded.'));
    }
  }, []);

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
    loadFriends();
    return () => { alive = false; };
  }, [loadFriends]);

  const openWith = async (uid: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res: any = await api('/api/student/chat/personal', { method: 'POST', body: JSON.stringify({ uid }) });
      onOpenChat(res.chatId, res.name || 'Chat');
    } catch (e: any) {
      setError(String(e?.message || 'That chat could not be opened.'));
    } finally {
      setBusy(false);
    }
  };

  const sendRequest = async () => {
    if (busy) return;
    const uname = username.trim();
    if (!uname) { setError('Type a username first.'); return; }
    setBusy(true);
    setError('');
    setNote('');
    try {
      const res: any = await api('/api/student/chat/friends/request', { method: 'POST', body: JSON.stringify({ username: uname }) });
      setUsername('');
      setNote(res.status === 'accepted' ? 'You are now friends.' : 'Request sent.');
      await loadFriends();
    } catch (e: any) {
      setError(String(e?.message || 'The request could not be sent.'));
    } finally {
      setBusy(false);
    }
  };

  const respond = async (requestId: string, action: 'accept' | 'decline') => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api('/api/student/chat/friends/respond', { method: 'POST', body: JSON.stringify({ requestId, action }) });
      await loadFriends();
    } catch (e: any) {
      setError(String(e?.message || 'That request could not be answered.'));
    } finally {
      setBusy(false);
    }
  };

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

        <div className="px-5 py-4 space-y-5">
          {error && <p className="text-[11px] font-bold text-rose-600 bg-rose-50 rounded-xl px-3 py-2">{error}</p>}
          {note && <p className="text-[11px] font-bold text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">{note}</p>}

          <div>
            <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Add a student from another centre</p>
            <div className="flex gap-2">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Leaderboard username"
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-900 placeholder:text-slate-400 placeholder:font-medium focus:outline-none focus:border-[#EA580C]"
                aria-label="Username to add"
              />
              <button
                onClick={sendRequest}
                disabled={busy}
                className="px-4 rounded-xl bg-[#EA580C] text-white text-xs font-black shrink-0 disabled:opacity-50 active:scale-95 transition flex items-center gap-1.5"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                <span>Request</span>
              </button>
            </div>
            <p className="text-[10px] text-slate-400 font-medium mt-1.5">You only need a friend request to chat with students outside your centre.</p>
          </div>

          {friends && friends.incoming.length > 0 && (
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Friend requests</p>
              <div className="space-y-2">
                {friends.incoming.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 bg-slate-50 rounded-2xl px-3.5 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-slate-900 truncate">{r.username || 'Student'}</p>
                      <p className="text-[10px] text-slate-500 font-medium truncate">{r.centreName || 'Another centre'}</p>
                    </div>
                    <button onClick={() => respond(r.id, 'accept')} disabled={busy} className="px-3 py-1.5 rounded-lg bg-[#EA580C] text-white text-[10px] font-black flex items-center gap-1 disabled:opacity-50" aria-label={`Accept ${r.username}`}>
                      <Check className="w-3.5 h-3.5" /> Accept
                    </button>
                    <button onClick={() => respond(r.id, 'decline')} disabled={busy} className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-500 text-[10px] font-black disabled:opacity-50" aria-label={`Decline ${r.username}`}>
                      Decline
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {friends && friends.outgoing.length > 0 && (
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Waiting for a reply</p>
              <div className="space-y-2">
                {friends.outgoing.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 bg-slate-50 rounded-2xl px-3.5 py-2.5">
                    <p className="flex-1 text-sm font-black text-slate-900 truncate">{r.username || 'Student'}</p>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Pending</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {friends && friends.friends.length > 0 && (
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Friends</p>
              <div className="space-y-2">
                {friends.friends.map((f) => (
                  <button key={f.id} onClick={() => openWith(f.uid)} disabled={busy} className="w-full text-left bg-white border border-slate-200 rounded-2xl px-3.5 py-2.5 flex items-center gap-3 active:scale-[0.99] transition disabled:opacity-50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-slate-900 truncate">{f.username || 'Student'}</p>
                      <p className="text-[10px] text-slate-500 font-medium truncate">{f.centreName || 'Another centre'}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {directory && (
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Your centre</p>
              {directory.students.length === 0 && directory.staff.length === 0 && (
                <p className="text-[11px] text-slate-400 font-medium">No one to chat with yet.</p>
              )}
              {directory.students.length > 0 && (
                <div className="grid grid-cols-1 gap-2 mb-2">
                  {directory.students.map((s) => (
                    <button key={s.uid} onClick={() => openWith(s.uid)} disabled={busy} className="w-full text-left bg-white border border-slate-200 rounded-2xl px-3.5 py-2.5 active:scale-[0.99] transition disabled:opacity-50">
                      <p className="text-sm font-black text-slate-900 truncate">{s.username}</p>
                      <p className="text-[10px] text-slate-400 font-medium">Student</p>
                    </button>
                  ))}
                </div>
              )}
              {directory.staff.length > 0 && (
                <div className="grid grid-cols-1 gap-2">
                  {directory.staff.map((s) => (
                    <button key={s.uid} onClick={() => openWith(s.uid)} disabled={busy} className="w-full text-left bg-white border border-slate-200 rounded-2xl px-3.5 py-2.5 active:scale-[0.99] transition disabled:opacity-50">
                      <p className="text-sm font-black text-slate-900 truncate">{s.name}</p>
                      <p className="text-[10px] text-slate-400 font-medium">Staff</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {!directory && !error && (
            <div className="flex items-center justify-center py-6 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
