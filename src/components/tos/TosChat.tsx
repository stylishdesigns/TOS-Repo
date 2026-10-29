import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw, Send, Ban, Check, Plus, Megaphone, Settings2, ShieldAlert, Users } from 'lucide-react';
import { api, Json } from './tosShared';

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
  postRateLimitPerHour: number;
  autoPosts: { mockOpen: boolean; resultsOut: boolean; practicePublished: boolean };
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

const ChannelTab: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const [state, setState] = useState<ChannelState | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const r: Json = await api('/api/tos/chat/channel');
      if (r && r.ok) setState(r as unknown as ChannelState);
    } catch (e: any) {
      setError(e?.message || 'Could not load the channel.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [state?.messages.length]);

  const createChannel = async () => {
    setBusy(true);
    setError('');
    try {
      const r: Json = await api('/api/tos/chat/channel/create', { method: 'POST' });
      if (r && r.ok) { await load(); onChanged(); }
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
      const r: Json = await api('/api/tos/chat/channel/messages', { method: 'POST', body: JSON.stringify({ text }) });
      if (r && r.ok) { setDraft(''); await load(); }
      else setError((r && (r as any).error) || 'Could not post.');
    } catch (e: any) {
      setError(e?.message || 'Could not post.');
    } finally { setPosting(false); }
  };

  if (loading) {
    return <div className="py-14 flex items-center justify-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  }

  if (!state || !state.channel) {
    return (
      <Card>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-500/15 flex items-center justify-center shrink-0"><Megaphone className="w-4.5 h-4.5 text-orange-300" /></div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-100">The platform channel is not created yet</p>
            <p className="text-xs text-slate-400 mt-1">The channel reaches every centre's students and admins. Students see it read-only, and only TOS and centre admins can post in it. Create it once here.</p>
            <button onClick={createChannel} disabled={busy} className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create the channel
            </button>
            {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-bold text-slate-100">{state.channel.name}</p>
            <p className="text-xs text-slate-400">Platform channel, visible to every centre. Students read only.</p>
          </div>
          <button onClick={load} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-slate-300 border border-white/10 hover:border-white/25"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
        </div>
      </Card>
      <Card>
        <div ref={listRef} className="max-h-[420px] overflow-y-auto space-y-2.5 pr-1">
          {state.messages.length === 0 && <p className="text-xs text-slate-500 py-6 text-center">No messages yet.</p>}
          {state.messages.map((m) => {
            const removed = removedOf(m);
            return (
              <div key={m.id} className={`rounded-xl px-3 py-2 border ${removed ? 'border-red-400/20 bg-red-500/5' : m.role === 'tos' ? 'border-orange-400/25 bg-orange-500/10' : 'border-white/10 bg-slate-950/40'}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-100">{m.username || 'Member'}</span>
                  {m.role === 'tos' && <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300">TOS</span>}
                  <span className="text-[10px] text-slate-500">{fmtWhen(m.at)}</span>
                </div>
                {removed
                  ? <p className="text-xs text-red-300/80 italic mt-1">Removed by {removed.byRole === 'tos' ? 'TOS' : 'the centre'}.</p>
                  : <p className="text-xs text-slate-200 mt-1 whitespace-pre-wrap break-words">{m.text}</p>}
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-end gap-2">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} placeholder="Write to every centre..." className={inputCls + ' resize-none'} />
          <button onClick={post} disabled={posting || !draft.trim()} className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40">
            {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Post
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
      </Card>
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

  const save = async () => {
    if (!s || confirmText.trim() !== 'APPLY') return;
    setBusy(true);
    setError('');
    setDone(false);
    try {
      const r: Json = await api('/api/tos/chat/settings', { method: 'PUT', body: JSON.stringify({ confirm: 'APPLY', settings: s }) });
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
            <Label>Posts per member per hour</Label>
            <input type="number" min={1} max={1000} value={s.postRateLimitPerHour} onChange={(e) => set('postRateLimitPerHour', Number(e.target.value))} className={inputCls} />
          </div>
        </div>
        <p className="text-[11px] text-slate-500 mt-3">Ranges: messages 100 to 8000 characters, photos 10 to 10240 KB, retention 1 to 365 days, rate 1 to 1000 posts an hour, threshold 0 to 100%. Values outside are clamped on save.</p>
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
      const r: Json = await api(`/api/tos/chat/reports/${report.id}/action`, { method: 'POST', body: JSON.stringify({ action }) });
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

// ------------------------------------------------------------------ Shell

export type TosChatProps = { refreshKey?: number };

export const TosChat: React.FC<TosChatProps> = ({ refreshKey }) => {
  const [tab, setTab] = useState<'channel' | 'settings' | 'escalations'>('channel');
  const [refreshTick, setRefreshTick] = useState(0);

  const tabs: Array<{ id: typeof tab; label: string; icon: React.ElementType }> = [
    { id: 'channel', label: 'Channel', icon: Megaphone },
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
      {tab === 'settings' && <SettingsTab onSaved={() => setRefreshTick((k) => k + 1)} />}
      {tab === 'escalations' && <EscalationsTab onChanged={() => setRefreshTick((k) => k + 1)} />}
      {refreshTick < 0 && null}
      <p className="text-[11px] text-slate-500 flex items-center gap-1.5"><Users className="w-3 h-3" /> Escalations counts towards the platform's report totals on the Overview screen.</p>
    </div>
  );
};
