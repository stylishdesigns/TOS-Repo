import React, { useCallback, useEffect, useRef, useState } from 'react';
import { loadLastGood, saveLastGood } from '../../lib/lastGood';
import { Loader2, RefreshCw, Send, Ban, Check, Plus, Megaphone, Settings2, ShieldAlert, Users, X, Camera } from 'lucide-react';
import { copyText, makeLongPress, MessageActionSheet, ReactionChips } from '../communications/chatActions';
import { api, Json } from './tosShared';
import { TextComposer, MediaComposer, StatusViewer, Overlay } from '../student-portal/tabs/StatusTab';
import { getAuth } from 'firebase/auth';

// TOS chat screens (CH1 Step 5): the platform channel, the platform chat
// settings (saved with the type-to-confirm APPLY step), and the escalation
// inbox. Everything here talks to the chat server routes; nothing is written
// straight to the databases from these screens.

type TosChatSettings = {
  defaultGroupSubjects: string[];
  mockPracticeChannelName: string;
  mockPracticeThresholdPercent: number;
  photoMaxKb: number;
  retentionDays: number;
  messageMaxChars: number;
  postRateLimitPerDay: number;
  autoPosts: { mockOpen: boolean; resultsOut: boolean; practicePublished: boolean };
  status?: {
    enabled: boolean;
    allowText: boolean;
    allowPhoto: boolean;
    allowVideo: boolean;
    allowMusic: boolean;
    allowReplies: boolean;
    adminsCanRemove: boolean;
    lastsHours: number;
    maxVideoSeconds: number;
    maxVideoMb: number;
    maxAudioMb: number;
    statusesPerDay: number;
    maxTextChars: number;
  };
  updatedAt?: string | null;
};

type ChannelMessage = {
  id: string;
  uid: string;
  username: string;
  role: string;
  text: string;
  at: number;
  removed: any;
  forwardedFrom?: string | null;
  replyTo?: { id: string; username: string; excerpt: string } | null;
  reactions?: Record<string, string> | null;
  mine?: boolean;
};

type ChannelState = {
  channel: { id: string; name: string; createdAt: string } | null;
  messages: ChannelMessage[];
  meta?: { lastReadAt?: Record<string, number>; msgCount?: number; pruned?: number };
};

type EscalatedReport = {
  id: string;
  groupId: string;
  messageId: string;
  centreId: string;
  centreName: string;
  reporterUsername: string;
  offenderUsername: string;
  messageExcerpt: string;
  reason: string;
  status: string;
  createdAt: string;
};

const TIME_FMT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

const fmtWhen = (at: number): string => {
  if (!at) return '';
  return TIME_FMT.format(new Date(at));
};

const removedOf = (m: any): { byRole: string; at: number } | null => {
  const r = m && (m as any).removed;
  if (!r) return null;
  return { byRole: String(r.byRole || ''), at: Number(r.at) || 0 };
};

const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5">{children}</div>
);

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{children}</p>
);

const inputCls = 'w-full bg-slate-950/60 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-orange-400/60 focus:outline-none';

// ---------------------------------------------------------------- Channel

// The last channel state, kept in memory so reopening the channel puts the
// conversation on screen straight away while a fresh sync runs behind it.
let lastChannelState: ChannelState | null = null;

const ChannelTab: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const [state, setState] = useState<ChannelState | null>(() => lastChannelState || loadLastGood<ChannelState>('tos:chat:state'));
  const [loading, setLoading] = useState(() => !(lastChannelState || loadLastGood<ChannelState>('tos:chat:state')));
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState<ChannelMessage | null>(null);
  const [replyTo, setReplyTo] = useState<ChannelMessage | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [channels, setChannels] = useState<{ id: string; name: string; commentsEnabled?: boolean; audience?: string }[]>([]);
  const [createAudience, setCreateAudience] = useState<string>('students');
  const [editAudience, setEditAudience] = useState<string>('students');
  const [newName, setNewName] = useState('');
  const [createComments, setCreateComments] = useState(false);
  const [editName, setEditName] = useState('');
  const [editComments, setEditComments] = useState(false);
  const [savingChannel, setSavingChannel] = useState(false);

  const loadChannel = useCallback(async (channelId?: string) => {
    try {
      const r: Json = channelId
        ? await api(`/api/tos/chat/channel?channelId=${encodeURIComponent(channelId)}`)
        : await api('/api/tos/chat/channel');
      if (r && r.ok) {
        lastChannelState = r as unknown as ChannelState;
        saveLastGood('tos:chat:state', lastChannelState);
        setState(r as unknown as ChannelState);
      }
    } catch (e: any) {
      setError(e?.message || 'Could not load the channel.');
    } finally {
      setLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const list: Json = await api('/api/tos/chat/channel/list');
      const chans = list && (list as any).ok ? ((list as any).channels as { id: string; name: string; commentsEnabled?: boolean; audience?: string }[]) : [];
      setChannels(chans);
      const cachedId = lastChannelState?.channel?.id;
      const wanted = (cachedId && chans.some((c) => c.id === cachedId)) ? cachedId : (chans[0]?.id || '');
      if (wanted) await loadChannel(wanted);
      else { lastChannelState = null; saveLastGood('tos:chat:state', null); setState({ channel: null, messages: [] }); }
    } catch (e: any) {
      setError(e?.message || 'Could not load the channels.');
    } finally {
      setLoading(false);
    }
  }, [loadChannel]);

  const selectChannel = async (channelId: string) => {
    await loadChannel(channelId);
  };

  // Keep the edit form in step with whichever channel is open.
  useEffect(() => {
    const ch = (state?.channel as any) || null;
    setEditName(ch ? String(ch.name || '') : '');
    setEditComments(ch ? ch.commentsEnabled === true : false);
    setEditAudience(ch && ch.audience === 'tutors' ? 'tutors' : ch && ch.audience === 'centre_admins' ? 'centre_admins' : 'students');
  }, [state?.channel?.id, (state?.channel as any)?.commentsEnabled]);

  const saveChannel = async () => {
    const id = state?.channel?.id;
    if (!id || savingChannel) return;
    const name = editName.trim();
    if (!name) { setError('Name the channel first.'); return; }
    setSavingChannel(true);
    setError('');
    try {
      const r: Json = await api('/api/tos/chat/channel/update', { method: 'POST', body: { channelId: id, name, commentsEnabled: editComments, audience: editAudience } });
      if (r && r.ok) { await load(); onChanged(); }
      else setError((r && (r as any).error) || 'Could not save the channel.');
    } catch (e: any) {
      setError(e?.message || 'Could not save the channel.');
    } finally { setSavingChannel(false); }
  };

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [state?.messages.length]);

  const audienceOptions = (
    <>
      <option value="students">Students</option>
      <option value="tutors">Tutors</option>
      <option value="centre_admins">Centre admins</option>
    </>
  );

  const createChannel = async () => {
    setBusy(true);
    setError('');
    try {
      const name = newName.trim();
      if (!name) { setError('Type a channel name first.'); return; }
      const r: Json = await api('/api/tos/chat/channel/create', { method: 'POST', body: { name, commentsEnabled: createComments, audience: createAudience } });
      if (r && r.ok) { setNewName(''); setCreateComments(false); await load(); onChanged(); }
      else setError((r && (r as any).error) || 'Could not create the channel.');
    } catch (e: any) {
      setError(e?.message || 'Could not create the channel.');
    } finally { setBusy(false); }
  };

  const post = async () => {
    const text = draft.trim();
    if (!text) return;
    setPosting(true);
    setError('');
    try {
      const r: Json = await api('/api/tos/chat/channel/messages', { method: 'POST', body: { text, channelId: state?.channel?.id, replyTo: replyTo ? replyTo.id : undefined } });
      if (r && r.ok) { setDraft(''); setReplyTo(null); await load(); }
      else setError((r && (r as any).error) || 'Could not post.');
    } catch (e: any) {
      setError(e?.message || 'Could not post.');
    } finally { setPosting(false); }
  };

  const myUid = (state?.messages || []).find((m) => m.mine)?.uid || '';

  const applyReaction = (msgId: string, uid: string, emoji: string | null) => {
    setState((prev) => {
      if (!prev) return prev;
      const msgs = (prev.messages || []).map((m) => {
        if (m.id !== msgId) return m;
        const r: Record<string, string> = {};
        Object.entries(m.reactions || {}).forEach(([k, v]) => { if (typeof v === 'string' && v) r[k] = v; });
        if (emoji && r[uid] !== emoji) r[uid] = emoji;
        else delete r[uid];
        return { ...m, reactions: Object.keys(r).length ? r : null };
      });
      return { ...prev, messages: msgs };
    });
  };

  const doReact = async (m: ChannelMessage, emoji: string) => {
    const mineNow = (m.reactions || {})[myUid];
    applyReaction(m.id, myUid, mineNow === emoji ? null : emoji);
    try {
      await api(`/api/tos/chat/channel/messages/${m.id}/react`, { method: 'POST', body: { emoji } });
    } catch (e: any) {
      setError(e?.message || 'Could not react.');
      load();
    }
  };

  const doDelete = async (m: ChannelMessage) => {
    setError('');
    try {
      await api(`/api/tos/chat/channel/messages/${m.id}/remove`, { method: 'POST', body: {} });
      await load();
    } catch (e: any) {
      setError(e?.message || 'Could not remove the message.');
    }
  };

  const doCopy = async (m: ChannelMessage) => {
    const ok = await copyText(m.text || '');
    if (!ok) setError('Could not copy on this device.');
  };

  if (loading && !state) {
    return <div className="py-14 flex items-center justify-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  }

  if (!state || !state.channel) {
    return (
      <Card>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-500/15 flex items-center justify-center shrink-0"><Megaphone className="w-4.5 h-4.5 text-orange-300" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-100">No channels yet</p>
            <p className="text-xs text-slate-400 mt-1">Each channel reaches one audience: students, tutors or centre admins. Only TOS posts; that audience reads. Create as many as you need.</p>
            <div className="mt-3 flex gap-2">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Channel name, e.g. Mock and Practice" className="flex-1 min-w-0 bg-slate-950/60 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-orange-400/60 focus:outline-none" />
              <button onClick={createChannel} disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 shrink-0">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create
              </button>
            </div>
            {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm font-bold text-slate-100">{state.channel.name}</p>
            <button onClick={load} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-slate-300 border border-white/10 hover:border-white/25"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
          </div>
          <p className="text-xs text-slate-400">Each channel reaches one audience (students, tutors or centre admins). Only TOS posts.</p>
          {channels.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {channels.map((c) => (
                <button
                  key={c.id}
                  onClick={() => selectChannel(c.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border ${state.channel && state.channel.id === c.id ? 'bg-orange-500 text-white border-orange-500' : 'text-slate-300 border-white/10 hover:border-white/25'}`}
                >
                  {c.name}
                  <span className={`ml-1.5 text-[9px] font-black uppercase tracking-wider ${state.channel && state.channel.id === c.id ? 'text-orange-100' : 'text-slate-500'}`}>
                    {c.audience === 'tutors' ? 'Tutors' : c.audience === 'centre_admins' ? 'Admins' : 'Students'}
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New channel name" className="flex-1 min-w-0 bg-slate-950/60 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-orange-400/60 focus:outline-none" />
            <select value={createAudience} onChange={(e) => setCreateAudience(e.target.value)} className="shrink-0 bg-slate-950/60 border border-white/10 rounded-xl px-2 py-2 text-xs text-slate-100 focus:outline-none" aria-label="Who this channel reaches">
              {audienceOptions}
            </select>
            <button onClick={createChannel} disabled={busy || !newName.trim()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-orange-500 text-white disabled:opacity-50 shrink-0">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add channel
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-300 font-medium cursor-pointer select-none w-fit">
            <input type="checkbox" checked={createComments} onChange={(e) => setCreateComments(e.target.checked)} className="accent-orange-500 w-4 h-4" />
            New channel: allow comments on posts
          </label>

          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3 space-y-2">
            <p className="text-xs font-bold text-slate-200">Edit this channel</p>
            <div className="flex gap-2">
              <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Channel name" className="flex-1 min-w-0 bg-slate-950/60 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-orange-400/60 focus:outline-none" />
              <select value={editAudience} onChange={(e) => setEditAudience(e.target.value)} className="shrink-0 bg-slate-950/60 border border-white/10 rounded-xl px-2 py-2 text-xs text-slate-100 focus:outline-none" aria-label="Who this channel reaches">
                {audienceOptions}
              </select>
              <button onClick={saveChannel} disabled={savingChannel} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-orange-500 text-white disabled:opacity-50 shrink-0">
                {savingChannel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Save
              </button>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-300 font-medium cursor-pointer select-none w-fit">
              <input type="checkbox" checked={editComments} onChange={(e) => setEditComments(e.target.checked)} className="accent-orange-500 w-4 h-4" />
              Selected channel: allow comments on posts
            </label>
          </div>
          {error && <p className="text-xs text-red-300">{error}</p>}
        </div>
      </Card>
      <Card>
        <div ref={listRef} className="h-[calc(100dvh-330px)] min-h-[320px] overflow-y-auto space-y-2.5 pr-1">
          {state.messages.length === 0 && <p className="text-xs text-slate-500 py-6 text-center">No messages yet.</p>}
          {state.messages.slice().sort((a, b) => a.at - b.at).map((m) => {
            const removed = removedOf(m);
            const press = makeLongPress(() => { if (!removed) setActionMsg(m); });
            return (
              <div key={m.id} className={`rounded-xl px-3 py-2 border ${removed ? 'border-red-400/20 bg-red-500/5' : m.role === 'tos' ? 'border-orange-400/25 bg-orange-500/10' : 'border-white/10 bg-slate-950/40'}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-100">{m.username || 'Member'}</span>
                  {m.role === 'tos' && <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300">TOS</span>}
                  <span className="text-[10px] text-slate-500">{fmtWhen(m.at)}</span>
                </div>
                {m.forwardedFrom && <p className="text-[10px] font-bold italic text-slate-500 mt-1">Forwarded from {m.forwardedFrom}</p>}
                {removed
                  ? <p className="text-xs text-red-300/80 italic mt-1">Removed by {removed.byRole === 'tos' ? 'TOS' : 'the centre'}.</p>
                  : (
                    <div {...press} className="cursor-pointer select-none">
                      {m.replyTo && (
                        <div className="mt-1 mb-1 rounded-lg border-l-2 border-orange-400/50 bg-white/5 px-2 py-1">
                          <p className="text-[10px] font-black text-orange-300">{m.replyTo.username}</p>
                          <p className="text-[10px] truncate text-slate-400">{m.replyTo.excerpt}</p>
                        </div>
                      )}
                      <p className="text-xs text-slate-200 mt-1 whitespace-pre-wrap break-words">{m.text}</p>
                    </div>
                  )}
                {!removed && (
                  <ReactionChips reactions={m.reactions} mineUid={myUid} onToggle={(emoji) => doReact(m, emoji)} />
                )}
              </div>
            );
          })}
        </div>
        {replyTo && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-orange-400/30 bg-orange-500/10 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black text-orange-300">Replying to {replyTo.username}</p>
              <p className="text-[11px] text-slate-400 truncate">{replyTo.text || 'Message'}</p>
            </div>
            <button onClick={() => setReplyTo(null)} className="rounded-full p-1 text-slate-400 hover:bg-white/10" aria-label="Cancel reply">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <div className="mt-3 flex items-end gap-2">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} placeholder="Write to every centre..." className={inputCls + ' resize-none'} />
          <button onClick={post} disabled={posting || !draft.trim()} className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40">
            {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Post
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
      </Card>

      {actionMsg && (
        <MessageActionSheet
          message={actionMsg}
          onClose={() => setActionMsg(null)}
          onReact={(emoji) => doReact(actionMsg, emoji)}
          onReply={() => setReplyTo(actionMsg)}
          onDelete={() => doDelete(actionMsg)}
          onCopy={actionMsg.text ? () => doCopy(actionMsg) : undefined}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------- Settings

const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string; hint: string }> = ({ on, onChange, label, hint }) => (
  <button onClick={() => onChange(!on)} className="w-full flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/40 px-3.5 py-3 text-left hover:border-white/25 transition-colors">
    <span>
      <span className="block text-xs font-bold text-slate-100">{label}</span>
      <span className="block text-[11px] text-slate-400 mt-0.5">{hint}</span>
    </span>
    <span className={`shrink-0 w-10 h-6 rounded-full relative transition-colors ${on ? 'bg-orange-500' : 'bg-white/15'}`}>
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </span>
  </button>
);

const SettingsTab: React.FC<{ onSaved: () => void }> = ({ onSaved }) => {
  const [s, setS] = useState<TosChatSettings | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    try {
      const r: Json = await api('/api/tos/chat/settings');
      if (r && r.ok) setS((r as any).settings as TosChatSettings);
    } catch (e: any) {
      setError(e?.message || 'Could not load the chat settings.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (key: keyof TosChatSettings, value: any) => {
    setDone(false);
    setS((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  // Nested setter for the status limits block in the settings screen.
  const setSt = (key: string, value: any) => {
    setS((prev) => prev ? { ...prev, status: { ...(prev.status || {}), [key]: value } as TosChatSettings['status'] } : prev);
  };

  const save = async () => {
    if (!s || confirmText.trim() !== 'APPLY') return;
    setBusy(true);
    setError('');
    setDone(false);
    try {
      const r: Json = await api('/api/tos/chat/settings', { method: 'PUT', body: { confirm: 'APPLY', settings: s } });
      if (r && r.ok) {
        setS((r as any).settings as TosChatSettings);
        setConfirmText('');
        setDone(true);
        onSaved();
      } else {
        setError((r && (r as any).error) || 'Could not save.');
      }
    } catch (e: any) {
      setError(e?.message || 'Could not save.');
    } finally { setBusy(false); }
  };

  if (!s) {
    return error
      ? <Card><p className="text-xs text-red-300">{error}</p></Card>
      : <div className="py-14 flex items-center justify-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  }

  const changed = true; // Settings are guarded by the APPLY confirmation, not a dirty check.

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm font-bold text-slate-100 mb-1">Platform chat limits</p>
        <p className="text-xs text-slate-400 mb-4">These apply to every centre. Centre settings sit inside these limits; they can be stricter, never wider.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Channel name</Label>
            <input value={s.mockPracticeChannelName} onChange={(e) => set('mockPracticeChannelName', e.target.value)} className={inputCls} />
          </div>
          <div>
            <Label>Channel access threshold (%)</Label>
            <input type="number" min={0} max={100} value={s.mockPracticeThresholdPercent} onChange={(e) => set('mockPracticeThresholdPercent', Number(e.target.value))} className={inputCls} />
          </div>
          <div>
            <Label>Message length cap (characters)</Label>
            <input type="number" min={100} max={8000} value={s.messageMaxChars} onChange={(e) => set('messageMaxChars', Number(e.target.value))} className={inputCls} />
          </div>
          <div>
            <Label>Photo size cap (KB)</Label>
            <input type="number" min={10} max={10240} value={s.photoMaxKb} onChange={(e) => set('photoMaxKb', Number(e.target.value))} className={inputCls} />
          </div>
          <div>
            <Label>Message retention (days)</Label>
            <input type="number" min={1} max={365} value={s.retentionDays} onChange={(e) => set('retentionDays', Number(e.target.value))} className={inputCls} />
          </div>
          <div>
            <Label>Posts per member per day</Label>
            <input type="number" min={1} max={1000} value={s.postRateLimitPerDay} onChange={(e) => set('postRateLimitPerDay', Number(e.target.value))} className={inputCls} />
          </div>
        </div>
        <p className="text-[11px] text-slate-500 mt-3">Ranges: messages 100 to 8000 characters, photos 10 to 10240 KB, retention 1 to 365 days, 1 to 1000 posts a day, threshold 0 to 100%. Values outside are clamped on save.</p>
      </Card>

      <Card>
        <h3 className="text-sm font-black text-white mb-4">Status limits</h3>
        <p className="text-[11px] text-slate-400 mb-4">The same limits the student and staff status screens enforce, all stored here and checked on the server.</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Updates stay up (hours)</Label>
            <input type="number" min={1} max={720} value={s.status?.lastsHours ?? 24} onChange={(e) => setSt('lastsHours', Number(e.target.value))} className={inputCls} />
          </div>
          <div>
            <Label>Updates per member per day</Label>
            <input type="number" min={1} max={20} value={s.status?.statusesPerDay ?? 5} onChange={(e) => setSt('statusesPerDay', Number(e.target.value))} className={inputCls} />
          </div>
          <div>
            <Label>Video length cap (seconds)</Label>
            <input type="number" min={5} max={600} value={s.status?.maxVideoSeconds ?? 60} onChange={(e) => setSt('maxVideoSeconds', Number(e.target.value))} className={inputCls} />
          </div>
          <div>
            <Label>Video size cap (MB)</Label>
            <input type="number" min={1} max={500} value={s.status?.maxVideoMb ?? 50} onChange={(e) => setSt('maxVideoMb', Number(e.target.value))} className={inputCls} />
          </div>
          <div>
            <Label>Music size cap (MB)</Label>
            <input type="number" min={1} max={50} value={s.status?.maxAudioMb ?? 10} onChange={(e) => setSt('maxAudioMb', Number(e.target.value))} className={inputCls} />
          </div>
          <div>
            <Label>Text update length (chars)</Label>
            <input type="number" min={20} max={1000} value={s.status?.maxTextChars ?? 280} onChange={(e) => setSt('maxTextChars', Number(e.target.value))} className={inputCls} />
          </div>
        </div>
        <p className="text-[11px] text-slate-500 mt-3">What members may post: tap to turn on or off.</p>
        <div className="flex flex-wrap gap-2 mt-2">
          {([
            ['allowText', 'Text'],
            ['allowPhoto', 'Photos'],
            ['allowVideo', 'Videos'],
            ['allowMusic', 'Music'],
            ['allowReplies', 'Replies'],
          ] as const).map(([key, label]) => {
            const on = s.status ? s.status[key] !== false : true;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() => setSt(key, !on)}
                className={`px-4 py-2 rounded-full text-xs font-black transition ${on ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <Label>Auto subject groups</Label>
        <input value={(s.defaultGroupSubjects || []).join(', ')} onChange={(e) => set('defaultGroupSubjects', e.target.value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 25))} placeholder="e.g. Biology, Chemistry, Use Of English" className={inputCls} />
        <p className="text-[11px] text-slate-500 mt-1.5">Comma-separated. When a centre turns auto subject groups on, groups are built from these subjects. Up to 25.</p>
      </Card>

      <Card>
        <p className="text-sm font-bold text-slate-100 mb-1">Automatic TOS posts</p>
        <p className="text-xs text-slate-400 mb-3">These post into the channel on their own. Turning one off silences that announcement; it never blocks the work itself.</p>
        <div className="space-y-2">
          <Toggle on={s.autoPosts.mockOpen} onChange={(v) => set('autoPosts', { ...s.autoPosts, mockOpen: v })} label="Mock opened" hint="Posted when a mock's window opens." />
          <Toggle on={s.autoPosts.resultsOut} onChange={(v) => set('autoPosts', { ...s.autoPosts, resultsOut: v })} label="Results are out" hint="Posted when a mock's results are released." />
          <Toggle on={s.autoPosts.practicePublished} onChange={(v) => set('autoPosts', { ...s.autoPosts, practicePublished: v })} label="New practice questions published" hint="Posted when new practice questions go live." />
        </div>
      </Card>

      <Card>
        <p className="text-sm font-bold text-slate-100 mb-1">Save changes</p>
        <p className="text-xs text-slate-400 mb-3">Type APPLY to confirm. Settings apply to what happens next; nothing is rewritten in old messages.</p>
        <div className="flex items-end gap-2 flex-wrap">
          <div className="w-40">
            <Label>Confirmation</Label>
            <input value={confirmText} onChange={(e) => { setConfirmText(e.target.value); setDone(false); }} placeholder="APPLY" className={inputCls} />
          </div>
          <button onClick={save} disabled={busy || confirmText.trim() !== 'APPLY' || !changed} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Apply settings
          </button>
          {done && <span className="text-xs font-bold text-emerald-300 pb-2.5">Saved.</span>}
        </div>
        {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
        {s.updatedAt && <p className="mt-3 text-[11px] text-slate-500">Last saved {TIME_FMT.format(new Date(s.updatedAt))} Lagos time.</p>}
      </Card>
    </div>
  );
};

// ------------------------------------------------------------ Escalations

const EscalationsTab: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const [reports, setReports] = useState<EscalatedReport[] | null>(null);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const r: Json = await api('/api/tos/chat/reports');
      if (r && r.ok) setReports(((r as any).reports || []) as EscalatedReport[]);
      else setError((r && (r as any).error) || 'Could not load escalated reports.');
    } catch (e: any) {
      setError(e?.message || 'Could not load escalated reports.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (report: EscalatedReport, action: 'remove' | 'dismiss') => {
    setBusyId(report.id);
    setError('');
    try {
      const r: Json = await api(`/api/tos/chat/reports/${report.id}/action`, { method: 'POST', body: { action } });
      if (r && r.ok) { await load(); onChanged(); }
      else setError((r && (r as any).error) || 'Could not act on that report.');
    } catch (e: any) {
      setError(e?.message || 'Could not act on that report.');
    } finally { setBusyId(''); }
  };

  if (reports === null) {
    return error
      ? <Card><p className="text-xs text-red-300">{error}</p></Card>
      : <div className="py-14 flex items-center justify-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-bold text-slate-100">Escalated to TOS</p>
            <p className="text-xs text-slate-400">Reports centre admins chose to escalate. You see the reported message, the reason, and the centre's name. Nothing else.</p>
          </div>
          <button onClick={load} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-slate-300 border border-white/10 hover:border-white/25"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
        </div>
      </Card>
      {reports.length === 0 && (
        <Card><p className="text-xs text-slate-500 py-6 text-center">Nothing escalated right now.</p></Card>
      )}
      {reports.map((rep) => (
        <Card key={rep.id}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-100">{rep.centreName || 'Unknown centre'}</span>
                <span className="text-[10px] text-slate-500">{fmtWhen(Number(new Date(rep.createdAt).getTime() || 0))}</span>
              </div>
              <p className="text-xs text-slate-200 mt-2 whitespace-pre-wrap break-words">{rep.messageExcerpt || '(message text unavailable)'}</p>
              <div className="mt-2 flex flex-col gap-1 text-[11px] text-slate-400">
                <span><span className="text-slate-500 font-bold">Reported member:</span> {rep.offenderUsername || '(no username)'}</span>
                <span><span className="text-slate-500 font-bold">Reported by:</span> {rep.reporterUsername || '(no username)'}</span>
                <span><span className="text-slate-500 font-bold">Reason:</span> {rep.reason || '(no reason given)'}</span>
              </div>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <button onClick={() => act(rep, 'remove')} disabled={busyId === rep.id} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-red-200 border border-red-400/30 hover:bg-red-500/10 disabled:opacity-40">
                {busyId === rep.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />} Remove the message
              </button>
              <button onClick={() => act(rep, 'dismiss')} disabled={busyId === rep.id} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-slate-300 border border-white/10 hover:border-white/25 disabled:opacity-40">
                <Check className="w-3.5 h-3.5" /> Dismiss
              </button>
            </div>
          </div>
        </Card>
      ))}
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
};

// ------------------------------------------------------------- Status tab

// The platform's own status feed. Same settings and limits as the centres'
// status engine, stored under the reserved centre id '__tos__'; every
// student's status overview merges this feed in.
type TosStatusSettings = {
  allowText: boolean;
  allowPhoto: boolean;
  allowVideo: boolean;
  allowMusic: boolean;
  allowReplies: boolean;
  lastsHours: number;
  statusesPerDay: number;
  maxTextChars: number;
  maxVideoSeconds: number;
  maxVideoMb: number;
  maxAudioMb: number;
  photoMaxKb: number;
};

type TosStatusOverview = {
  ok: boolean;
  enabled: boolean;
  settings?: TosStatusSettings;
  me?: {
    name: string;
    username: string;
    avatar?: string;
    latest: {
      statusId: string; kind: string; at: number; expiresAt: number; text: string;
      bg?: string; photoUrl?: string; videoUrl?: string; audioUrl?: string; durationSeconds?: number;
    } | null;
  };
};


// The TOS status preview as a circle, the same look students see in their
// status rail, so the card reads as a status and not a text note.
const TosStatusCircle: React.FC<{ latest: { statusId: string; kind: string; at: number; expiresAt: number; text: string } }> = ({ latest }) => {
  const life = Math.max(1, latest.expiresAt - latest.at);
  const remain = Math.max(0, latest.expiresAt - Date.now());
  const f = Math.max(0, Math.min(1, remain / life));
  const RING = 2 * Math.PI * 30;
  return (
    <span className="relative block w-14 h-14 shrink-0">
      <svg viewBox="0 0 64 64" className="w-14 h-14" aria-hidden="true">
        <circle cx="32" cy="32" r="30" fill="none" stroke="#334155" strokeWidth="3.5" />
        <circle cx="32" cy="32" r="30" fill="none" stroke="#EA580C" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={RING} strokeDashoffset={RING * (1 - f)} transform="rotate(-90 32 32)" />
      </svg>
      <span className="absolute inset-[5px] rounded-full overflow-hidden bg-orange-500/15 border border-orange-500/40 flex items-center justify-center text-[10px] font-black text-orange-200">
        {latest.kind === 'text' ? 'Aa' : latest.kind === 'photo' ? 'Pic' : 'Vid'}
      </span>
    </span>
  );
};

const TosStatusTab: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const [data, setData] = useState<TosStatusOverview | null>(() => loadLastGood<TosStatusOverview>('tos:status:overview'));
  const [err, setErr] = useState('');
  const [composingText, setComposingText] = useState(false);
  const [viewing, setViewing] = useState(false);
  const myUid = getAuth().currentUser?.uid || '';
  const [media, setMedia] = useState<{ kind: 'photo' | 'video' | 'music'; file: File } | null>(null);
  const [note, setNote] = useState('');
  const photoRef = React.useRef<HTMLInputElement>(null);
  const videoRef = React.useRef<HTMLInputElement>(null);

  const call = React.useCallback((path: string, opts?: any) => api('/api/tos/chat/status' + path, opts), []);

  React.useEffect(() => {
    let alive = true;
    call('/overview')
      .then((d: any) => {
        if (!alive) return;
        if (d && d.ok) { setData(d); saveLastGood('tos:status:overview', d); setErr(''); }
        else setErr(String(d?.error || 'The status overview could not load.'));
      })
      .catch(() => { if (alive) setErr('The status overview could not load.'); });
    return () => { alive = false; };
  }, [call]);

  const flash = (text: string) => { setNote(text); window.setTimeout(() => setNote(''), 2500); };

  const applyPosted = (status: Record<string, any>) => {
    setComposingText(false);
    setMedia(null);
    setData((prev) => (prev ? { ...prev, me: { name: 'TOS', username: '', ...(prev.me || {}), latest: status } } : prev));
    saveLastGood('tos:status:overview', { ...(data || {}), me: { name: 'TOS', username: '', latest: status } } as TosStatusOverview);
    onChanged();
  };

  const removeLatest = async () => {
    const latest = data?.me?.latest;
    if (!latest) return;
    try {
      await call('/delete', { method: 'POST', body: { statusId: latest.statusId } });
      setData((prev) => (prev ? { ...prev, me: { name: 'TOS', username: '', ...(prev.me || {}), latest: null } } : prev));
      flash('Status removed');
      onChanged();
    } catch (e: any) {
      setErr(String(e?.message || 'The status could not be removed. Try again.'));
    }
  };

  const latest = data?.me?.latest || null;
  const settings = data?.settings || null;
  const kinds: Array<{ key: 'text' | 'photo' | 'video'; label: string; allowed: boolean; pick: () => void }> = [
    { key: 'text', label: 'Text', allowed: !!settings?.allowText, pick: () => setComposingText(true) },
    { key: 'photo', label: 'Photo', allowed: !!settings?.allowPhoto, pick: () => photoRef.current?.click() },
    { key: 'video', label: 'Video', allowed: !!settings?.allowVideo, pick: () => videoRef.current?.click() },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 space-y-2">
        <p className="text-sm font-black text-orange-300">TOS status</p>
        {latest ? (
          <div
            className="space-y-1 cursor-pointer"
            role="button"
            tabIndex={0}
            aria-label="Preview my status"
            onClick={() => { if (myUid) setViewing(true); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && myUid) setViewing(true); }}
          >
            <div className="flex items-center gap-3">
              <TosStatusCircle latest={latest} />
              <div className="min-w-0">
                <p className="text-xs text-slate-300 truncate">
                  {latest.kind === 'text' ? (latest.text || '') : latest.kind} · posted {fmtWhen(latest.at)}
                </p>
                <p className="text-[11px] text-slate-500">Live in every student's status feed until it expires. Tap to view it the way students see it.</p>
              </div>
            </div>
            <button type="button" onClick={removeLatest} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-red-500/40 text-red-300 hover:bg-red-500/10 transition-colors cursor-pointer">
              <Ban className="w-3.5 h-3.5" /> Remove
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-400">Nothing is up right now. Post one below; students see it in their status feed.</p>
        )}
        {note && <p className="text-[11px] text-emerald-300 font-bold">{note}</p>}
        {err && <p className="text-[11px] text-red-300 font-bold">{err}</p>}
      </div>

      {settings && (
        <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 space-y-3">
          <p className="text-sm font-black text-orange-300">Post a status</p>
          <div className="flex gap-2 flex-wrap">
            {kinds.map((k) => (
              <button
                key={k.key}
                type="button"
                disabled={!k.allowed}
                onClick={k.allowed ? k.pick : undefined}
                title={k.allowed ? undefined : 'Off in status settings'}
                className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${k.allowed ? 'border-orange-500/40 text-orange-300 hover:bg-orange-500/10 cursor-pointer' : 'border-white/10 text-slate-600 cursor-not-allowed'}`}
              >
                {k.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500">Limits come from the platform status settings: {settings.lastsHours}h life, {settings.statusesPerDay}/day, text {settings.maxTextChars} chars, video {settings.maxVideoSeconds}s / {settings.maxVideoMb} MB, audio {settings.maxAudioMb} MB, photos {settings.photoMaxKb} KB.</p>
        </div>
      )}

      <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setMedia({ kind: 'photo', file: f }); }} />
      <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setMedia({ kind: 'video', file: f }); }} />

      {composingText && settings && (
        <Overlay>
          <TextComposer call={call} settings={settings} onClose={() => setComposingText(false)} onPosted={applyPosted} />
        </Overlay>
      )}
      {media && settings && (
        <Overlay>
          <MediaComposer kind={media.kind} file={media.file} call={call} settings={settings} onClose={() => setMedia(null)} onPosted={applyPosted} />
        </Overlay>
      )}
      {viewing && settings && myUid && (
        <Overlay>
          <StatusViewer
            person={{ uid: myUid, name: 'TOS', username: '' }}
            mine={true}
            seed={latest ? [{
              statusId: latest.statusId,
              kind: latest.kind,
              at: latest.at,
              expiresAt: latest.expiresAt,
              text: latest.text,
              bg: latest.bg,
              photoUrl: latest.photoUrl,
              videoUrl: latest.videoUrl,
              audioUrl: latest.audioUrl,
              durationSeconds: latest.durationSeconds,
            }] : undefined}
            call={call}
            settings={settings}
            onClose={() => setViewing(false)}
            onSeenUpdate={() => undefined}
          />
        </Overlay>
      )}
    </div>
  );
};


// ------------------------------------------------------------------ Shell

export type TosChatProps = { refreshKey?: number };

export const TosChat: React.FC<TosChatProps> = ({ refreshKey }) => {
  const [tab, setTab] = useState<'channel' | 'settings' | 'escalations' | 'status'>('channel');
  const [refreshTick, setRefreshTick] = useState(0);

  const tabs: Array<{ id: typeof tab; label: string; icon: React.ElementType }> = [
    { id: 'channel', label: 'Channel', icon: Megaphone },
    { id: 'status', label: 'Status', icon: Camera },
    { id: 'settings', label: 'Settings', icon: Settings2 },
    { id: 'escalations', label: 'Escalations', icon: ShieldAlert },
  ];

  // A change anywhere refreshes the counters elsewhere on the platform.
  useEffect(() => { setRefreshTick((k) => k + 1); }, [refreshKey]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition-colors ${tab === t.id ? 'bg-orange-500/15 text-orange-300 border-orange-500/40' : 'text-slate-300 border-white/10 hover:border-white/25 bg-slate-950/40'}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>
      {tab === 'channel' && <ChannelTab onChanged={() => setRefreshTick((k) => k + 1)} />}
      {tab === 'status' && <TosStatusTab onChanged={() => setRefreshTick((k) => k + 1)} />}
      {tab === 'settings' && <SettingsTab onSaved={() => setRefreshTick((k) => k + 1)} />}
      {tab === 'escalations' && <EscalationsTab onChanged={() => setRefreshTick((k) => k + 1)} />}
      {refreshTick < 0 && null}
      <p className="text-[11px] text-slate-500 flex items-center gap-1.5"><Users className="w-3 h-3" /> Escalations counts towards the platform's report totals on the Overview screen.</p>
    </div>
  );
};
