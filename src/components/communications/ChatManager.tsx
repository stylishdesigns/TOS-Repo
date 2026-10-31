import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  ChevronLeft,
  Flag,
  Info,
  Loader2,
  Lock,
  Megaphone,
  MessageSquare,
  Plus,
  Send,
  ShieldAlert,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { api } from '../tos/tosShared';
import { copyText, EmojiText, isEmojiOnly, makeLongPress, MessageActionSheet, ReactionChips } from './chatActions';
import { loadLastGood, saveLastGood } from '../../lib/lastGood';

// ============================================================================
// CH1 centre admin chat screens (Step 4). Groups, settings and the reports
// inbox. Every rule stays on the server: this screen only collects choices and
// calls the /api/centre/chat routes, which re-check membership and role.
// ============================================================================

interface ChatAccess {
  mode: 'centre_default' | 'custom' | 'none';
  thresholdPercent: number | null;
}

interface ChatGroup {
  id: string;
  name: string;
  kind: 'announcements' | 'custom' | 'tos_channel';
  subject: string | null;
  access: ChatAccess;
  createdAt: string;
}

interface ChatSettings {
  defaultThresholdPercent: number;
  minAnswers: number;
  autoSubjectGroups: boolean;
  photosAllowed: boolean;
  tutorsCanRemove: boolean;
  paused: boolean;
  muteDayOptions: number[];
  updatedAt?: string | null;
}

interface ChatReport {
  id: string;
  groupId: string;
  messageId: string;
  offenderUid: string;
  offenderUsername: string;
  offenderRole: string;
  messageExcerpt: string;
  reporterUid: string;
  reporterUsername: string;
  reason: string;
  status: 'pending' | 'resolved' | 'escalated';
  createdAt: string;
  resolution?: string;
  resolvedAt?: string;
}

interface Bootstrap {
  ok?: boolean;
  role: 'owner' | 'admin' | 'tutor';
  settings: ChatSettings;
  platform: {
    mockPracticeChannelName: string;
    mockPracticeThresholdPercent: number;
    defaultGroupSubjects: string[];
    photoMaxKb: number;
    retentionDays: number;
    messageMaxChars: number;
    postRateLimitPerHour: number;
    autoPosts: Record<string, boolean>;
  };
  groups: ChatGroup[];
  reports: ChatReport[];
}

function accessLabel(g: ChatGroup): string {
  if (g.access.mode === 'none') return 'Open to everyone';
  if (g.access.mode === 'custom') return `Opens at ${g.access.thresholdPercent ?? 0}% practice`;
  return 'Centre default';
}

function kindLabel(kind: string): string {
  if (kind === 'announcements') return 'Announcements';
  if (kind === 'tos_channel') return 'TOS channel';
  return 'Custom group';
}

function fmtDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short' }).format(new Date(iso));
  } catch {
    return '';
  }
}

function fmtDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-NG', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="w-full flex items-center justify-between gap-3 py-2.5"
    >
      <span className="text-xs font-bold text-slate-700 text-left">{label}</span>
      <span
        className={`w-10 h-6 rounded-full p-0.5 transition ${on ? 'bg-[#EA580C]' : 'bg-slate-300'}`}
      >
        <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : ''}`} />
      </span>
    </button>
  );
}

// The last bootstrap kept in memory per centre so the chat screen renders
// straight away while a fresh sync runs behind it.
const bootstrapCache = new Map<string, Bootstrap>();

export const ChatManager: React.FC<{ onThreadOpenChange?: (open: boolean) => void }> = ({ onThreadOpenChange }) => {
  const { activeCentreId, addToast } = useApp();
  const cachedBoot: Bootstrap | null = activeCentreId
    ? (bootstrapCache.has(activeCentreId) ? bootstrapCache.get(activeCentreId) || null : loadLastGood<Bootstrap>(`chat:bootstrap:${activeCentreId}`))
    : null;
  const [data, setData] = useState<Bootstrap | null>(cachedBoot);
  const [loading, setLoading] = useState(() => !cachedBoot);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'groups' | 'settings' | 'reports'>('groups');

  const isAdmin = !!data && data.role !== 'tutor';

  const load = useCallback(async () => {
    if (!activeCentreId || activeCentreId === 'none') {
      setError('No centre is selected.');
      setLoading(false);
      return;
    }
    try {
      const res = await api(`/api/centre/chat/bootstrap?centreId=${encodeURIComponent(activeCentreId)}`);
      bootstrapCache.set(activeCentreId, res as Bootstrap);
      saveLastGood(`chat:bootstrap:${activeCentreId}`, res);
      setData(res as Bootstrap);
      setError('');
    } catch (e: any) {
      setError(String(e?.message || 'Chat settings could not be loaded. Try again.'));
    } finally {
      setLoading(false);
    }
  }, [activeCentreId]);

  useEffect(() => {
    load();
  }, [load]);

  const pendingReports = data?.reports.filter((r) => r.status === 'pending').length || 0;

  const tabs: { id: 'groups' | 'settings' | 'reports'; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: 'groups', label: 'Groups', icon: Users },
    // Settings stay owner/admin only; the server enforces it too.
    ...(isAdmin ? [{ id: 'settings' as const, label: 'Settings', icon: Info }] : []),
    // Reports are centre-admin work; the server enforces that too.
    ...(isAdmin ? [{ id: 'reports' as const, label: 'Reports', icon: Flag, badge: pendingReports }] : []),
  ];

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-[#EA580C]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 p-6 max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm text-center space-y-3">
          <ShieldAlert className="w-8 h-8 text-rose-500 mx-auto" />
          <p className="text-sm font-bold text-slate-800">Chat could not be loaded</p>
          <p className="text-xs text-slate-500 font-medium">{error}</p>
          <button onClick={load} className="px-4 py-2 rounded-xl bg-[#EA580C] text-white text-xs font-black active:scale-95 transition">
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5 pb-10">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Chat</h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">Your centre’s group conversations.</p>
        </div>

        <div className="flex gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition ${
                tab === t.id ? 'bg-[#EA580C] text-white shadow-sm shadow-orange-200' : 'bg-white text-slate-500 border border-slate-200'
              }`}
            >
              <t.icon className="w-3.5 h-3.5" /> {t.label}
              {!!t.badge && (
                <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black flex items-center justify-center ${tab === t.id ? 'bg-white text-[#EA580C]' : 'bg-rose-500 text-white'}`}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === 'groups' && data && <GroupsSection data={data} isAdmin={isAdmin} reload={load} addToast={addToast} centreId={activeCentreId || ''} onThreadOpenChange={onThreadOpenChange} />}
        {tab === 'settings' && data && <SettingsSection data={data} isAdmin={isAdmin} reload={load} addToast={addToast} centreId={activeCentreId || ''} />}
        {tab === 'reports' && data && <ReportsSection data={data} isAdmin={isAdmin} reload={load} addToast={addToast} centreId={activeCentreId || ''} />}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// GROUPS
// ---------------------------------------------------------------------------

interface SectionProps {
  data: Bootstrap;
  isAdmin: boolean;
  onThreadOpenChange?: (open: boolean) => void;
  reload: () => Promise<void>;
  addToast: (msg: string, kind?: string) => void;
  centreId: string;
}

const GroupsSection: React.FC<SectionProps> = ({ data, isAdmin, reload, addToast, centreId, onThreadOpenChange }) => {
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'custom' | 'announcements'>('custom');
  const [subject, setSubject] = useState('');
  const [accessMode, setAccessMode] = useState<'centre_default' | 'custom' | 'none'>('centre_default');
  const [threshold, setThreshold] = useState('70');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const openGroup = openId ? data.groups.find((g) => g.id === openId) || null : null;
  const [editName, setEditName] = useState('');
  const [editMode, setEditMode] = useState<'centre_default' | 'custom' | 'none'>('centre_default');
  const [editThreshold, setEditThreshold] = useState('70');

  // While a conversation is open the portal's bottom nav steps aside so the chat
  // reads like a normal messaging screen.
  useEffect(() => {
    onThreadOpenChange?.(!!openId);
    return () => onThreadOpenChange?.(false);
  }, [openId, onThreadOpenChange]);

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await api('/api/centre/chat/groups', {
        method: 'POST',
        body: {
          centreId,
          name: name.trim(),
          kind,
          subject: kind === 'custom' ? subject.trim() : '',
          access: {
            mode: accessMode,
            thresholdPercent: accessMode === 'custom' ? Number(threshold) || 0 : null,
          },
        },
      });
      setName(''); setSubject(''); setCreating(false);
      addToast('Group created');
      await reload();
    } catch (e: any) {
      addToast(String(e?.message || 'The group could not be created.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (g: ChatGroup) => {
    if (!editName.trim() || busy) return;
    setBusy(true);
    try {
      await api(`/api/centre/chat/groups/${g.id}`, {
        method: 'PUT',
        body: {
          centreId,
          name: editName.trim(),
          access: {
            mode: editMode,
            thresholdPercent: editMode === 'custom' ? Number(editThreshold) || 0 : null,
          },
        },
      });
      setEditingId(null);
      addToast('Group updated');
      await reload();
    } catch (e: any) {
      addToast(String(e?.message || 'The group could not be updated.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (g: ChatGroup) => {
    setEditingId(g.id);
    setEditName(g.name);
    setEditMode(g.access.mode);
    setEditThreshold(String(g.access.thresholdPercent ?? 70));
  };

  return (
    <div className="space-y-4">
      {openGroup ? (
        <ThreadPanel
          group={openGroup}
          centreId={centreId}
          messageMaxChars={data.platform.messageMaxChars}
          photosAllowed={data.settings.photosAllowed}
          addToast={addToast}
          onBack={() => setOpenId(null)}
        />
      ) : (
      <>
      <div className="bg-violet-50 rounded-2xl p-4 border border-violet-100 flex items-start gap-3">
        <Lock className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" />
        <p className="text-[11px] text-violet-900 font-medium leading-relaxed">
          The <span className="font-black">{data.platform.mockPracticeChannelName}</span> channel is managed by TOS and appears in every centre's student chat automatically. It opens at {data.platform.mockPracticeThresholdPercent}% practice.
        </p>
      </div>

      {isAdmin && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <button
            onClick={() => setCreating(!creating)}
            className="w-full px-4 py-3 flex items-center justify-between text-sm font-black text-slate-800"
          >
            <span className="flex items-center gap-2"><Plus className="w-4 h-4 text-[#EA580C]" /> Create a group</span>
            <span className="text-slate-400 text-lg leading-none">{creating ? '−' : '+'}</span>
          </button>
          {creating && (
            <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-4">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                placeholder="Group name, e.g. Physics JAMB 2027"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-orange-300"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as 'custom' | 'announcements')}
                  className="px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-700 focus:outline-none"
                >
                  <option value="custom">Custom group</option>
                  <option value="announcements">Announcements</option>
                </select>
                {kind === 'custom' ? (
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    maxLength={60}
                    placeholder="Subject (optional)"
                    className="px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none"
                  />
                ) : (
                  <div className="px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-100 text-[11px] font-bold text-amber-800 flex items-center">
                    Read-only for students
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={accessMode}
                  onChange={(e) => setAccessMode(e.target.value as 'centre_default' | 'custom' | 'none')}
                  className="px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-700 focus:outline-none"
                >
                  <option value="centre_default">Centre default access</option>
                  <option value="custom">Custom threshold</option>
                  <option value="none">Open to everyone</option>
                </select>
                {accessMode === 'custom' ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200">
                    <input
                      type="number" min={0} max={100} value={threshold}
                      onChange={(e) => setThreshold(e.target.value)}
                      className="w-16 bg-transparent text-sm font-black text-slate-800 focus:outline-none"
                    />
                    <span className="text-xs font-bold text-slate-500">% practice needed</span>
                  </div>
                ) : (
                  <div className="px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-bold text-slate-500 flex items-center">
                    {accessMode === 'centre_default'
                      ? `Uses the centre default (${data.settings.defaultThresholdPercent}%)`
                      : 'Every student can read and post'}
                  </div>
                )}
              </div>
              <button
                onClick={create}
                disabled={!name.trim() || busy}
                className="px-5 py-2.5 rounded-xl bg-[#EA580C] text-white text-xs font-black active:scale-95 transition disabled:opacity-50 flex items-center gap-2"
              >
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Create group
              </button>
            </div>
          )}
        </div>
      )}

      {data.groups.length === 0 && (
        <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center space-y-1.5">
          <Users className="w-7 h-7 text-slate-300 mx-auto" />
          <p className="text-sm font-black text-slate-800">No groups yet</p>
          <p className="text-xs text-slate-500 font-medium">
            {isAdmin ? 'Create your first group above.' : 'Your centre admins have not created any groups yet.'}
          </p>
        </div>
      )}

      {data.groups.map((g) => (
        <div
          key={g.id}
          onClick={() => { if (editingId !== g.id) setOpenId(g.id); }}
          className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-2 cursor-pointer active:scale-[0.995] transition"
        >
          {editingId === g.id ? (
            <div className="space-y-3">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={80}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-800 focus:outline-none focus:border-orange-300"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={editMode}
                  onChange={(e) => setEditMode(e.target.value as 'centre_default' | 'custom' | 'none')}
                  className="px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-700 focus:outline-none"
                >
                  <option value="centre_default">Centre default access</option>
                  <option value="custom">Custom threshold</option>
                  <option value="none">Open to everyone</option>
                </select>
                {editMode === 'custom' && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200">
                    <input
                      type="number" min={0} max={100} value={editThreshold}
                      onChange={(e) => setEditThreshold(e.target.value)}
                      className="w-16 bg-transparent text-sm font-black text-slate-800 focus:outline-none"
                    />
                    <span className="text-xs font-bold text-slate-500">% practice</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditingId(null)} className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-black">
                  Cancel
                </button>
                <button
                  onClick={() => saveEdit(g)}
                  disabled={busy}
                  className="flex-1 py-2.5 rounded-xl bg-[#EA580C] text-white text-xs font-black flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                g.kind === 'announcements' ? 'bg-amber-50 border-amber-100 text-amber-600' : 'bg-orange-50 border-orange-100 text-[#EA580C]'
              }`}>
                {g.kind === 'announcements' ? <Megaphone className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-black text-slate-900">{g.name}</p>
                  <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">{kindLabel(g.kind)}</span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  {g.subject ? `Subject: ${g.subject} · ` : ''}{accessLabel(g)}
                </p>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">Created {fmtDate(g.createdAt)}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {isAdmin && (
                  <button
                    onClick={(e) => { e.stopPropagation(); startEdit(g); }}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-black active:scale-95 transition"
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
      </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// SETTINGS
// ---------------------------------------------------------------------------

const SettingsSection: React.FC<SectionProps> = ({ data, isAdmin, reload, addToast, centreId }) => {
  const [s, setS] = useState<ChatSettings>(data.settings);
  const [busy, setBusy] = useState(false);
  const [threshold, setThreshold] = useState(String(data.settings.defaultThresholdPercent));

  useEffect(() => {
    setS(data.settings);
    setThreshold(String(data.settings.defaultThresholdPercent));
  }, [data.settings]);

  if (!isAdmin) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-slate-200 text-center">
        <p className="text-xs text-slate-500 font-medium">Only centre admins can change chat settings.</p>
      </div>
    );
  }

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const next: ChatSettings = {
        ...s,
        defaultThresholdPercent: Math.max(0, Math.min(100, Number(threshold) || 0)),
      };
      const res = await api('/api/centre/chat/settings', {
        method: 'PUT',
        body: { centreId, settings: next },
      });
      setS((res as { settings: ChatSettings }).settings);
      addToast('Chat settings saved');
      await reload();
    } catch (e: any) {
      addToast(String(e?.message || 'The settings could not be saved.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const setDay = (day: number, on: boolean) => {
    const set = new Set<number>(s.muteDayOptions);
    if (on) set.add(day); else set.delete(day);
    setS({ ...s, muteDayOptions: Array.from(set as Set<number>).sort((a, b) => a - b) });
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
        <p className="text-xs font-black text-slate-800 uppercase tracking-wider">Access defaults</p>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200">
          <input
            type="number" min={0} max={100} value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className="w-16 bg-transparent text-sm font-black text-slate-800 focus:outline-none"
          />
          <span className="text-xs font-bold text-slate-500">% practice over 7 days for new groups on centre default</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-bold text-slate-700">Minimum answers before a score counts</span>
          <select
            value={s.minAnswers}
            onChange={(e) => setS({ ...s, minAnswers: Number(e.target.value) })}
            className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-700 focus:outline-none"
          >
            {[10, 20, 30].map((n) => <option key={n} value={n}>{n} answers</option>)}
          </select>
        </div>
        <Toggle on={s.autoSubjectGroups} onChange={(v) => setS({ ...s, autoSubjectGroups: v })} label="Create a group for each subject automatically" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-1">
        <p className="text-xs font-black text-slate-800 uppercase tracking-wider mb-1">Safety</p>
        <Toggle on={s.photosAllowed} onChange={(v) => setS({ ...s, photosAllowed: v })} label="Students can share photos" />
        <Toggle on={s.tutorsCanRemove} onChange={(v) => setS({ ...s, tutorsCanRemove: v })} label="Tutors can remove reported messages" />
        <Toggle on={s.paused} onChange={(v) => setS({ ...s, paused: v })} label="Pause chat for the whole centre" />
        <div className="pt-2">
          <p className="text-xs font-bold text-slate-700 mb-1.5">Mute lengths tutors can offer</p>
          <div className="flex gap-2">
            {[1, 3, 7].map((d) => (
              <button
                key={d}
                onClick={() => setDay(d, !s.muteDayOptions.includes(d))}
                className={`px-3 py-2 rounded-xl text-xs font-black border transition ${
                  s.muteDayOptions.includes(d)
                    ? 'bg-[#EA580C] text-white border-[#EA580C]'
                    : 'bg-white text-slate-500 border-slate-200'
                }`}
              >
                {d} day{d > 1 ? 's' : ''}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-1.5">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Set by TOS for every centre</p>
        <p className="text-[11px] text-slate-500 font-medium">Photos up to {data.platform.photoMaxKb} KB · messages up to {data.platform.messageMaxChars} characters · messages kept {data.platform.retentionDays} days · up to {data.platform.postRateLimitPerHour} messages per hour.</p>
      </div>

      <button
        onClick={save}
        disabled={busy}
        className="w-full py-3 rounded-2xl bg-[#EA580C] text-white text-sm font-black shadow-sm shadow-orange-200 active:scale-[0.99] transition disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save settings
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// REPORTS INBOX
// ---------------------------------------------------------------------------

const resolutionLabel: Record<string, string> = {
  message_removed: 'Message removed',
  muted: 'Student muted',
  dismissed: 'Dismissed',
};

const ReportsSection: React.FC<SectionProps> = ({ data, isAdmin, reload, addToast, centreId }) => {
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  const reports = filter === 'pending' ? data.reports.filter((r) => r.status === 'pending') : data.reports;
  const groupName = (id: string) => data.groups.find((g) => g.id === id)?.name;

  const act = async (report: ChatReport, action: string, days?: number) => {
    if (busyId) return;
    setBusyId(report.id);
    try {
      await api(`/api/centre/chat/reports/${report.id}/action`, {
        method: 'POST',
        body: { centreId, action, ...(action === 'mute' ? { days } : {}) },
      });
      addToast(action === 'remove' ? 'Message removed' : action === 'mute' ? 'Student muted' : action === 'dismiss' ? 'Report dismissed' : 'Report escalated to TOS');
      await reload();
    } catch (e: any) {
      addToast(String(e?.message || 'The action could not be completed.'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setFilter('pending')}
          className={`px-3.5 py-2 rounded-xl text-xs font-black transition ${filter === 'pending' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}
        >
          Pending
        </button>
        <button
          onClick={() => setFilter('all')}
          className={`px-3.5 py-2 rounded-xl text-xs font-black transition ${filter === 'all' ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}
        >
          All
        </button>
      </div>

      {reports.length === 0 && (
        <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center space-y-1.5">
          <Flag className="w-7 h-7 text-slate-300 mx-auto" />
          <p className="text-sm font-black text-slate-800">{filter === 'pending' ? 'Nothing to review' : 'No reports yet'}</p>
          <p className="text-xs text-slate-500 font-medium">
            {filter === 'pending' ? 'All reported messages have been handled.' : 'Reports from your students will appear here.'}
          </p>
        </div>
      )}

      {reports.map((r) => (
        <div key={r.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
              r.status === 'pending' ? 'bg-rose-100 text-rose-700' : r.status === 'escalated' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500'
            }`}>
              {r.status === 'pending' ? 'Needs review' : r.status === 'escalated' ? 'With TOS' : resolutionLabel[r.resolution || ''] || 'Resolved'}
            </span>
            <span className="text-[10px] text-slate-400 font-bold">{fmtDateTime(r.createdAt)}</span>
          </div>
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-[10px] font-black text-slate-500">{r.offenderUsername}{r.offenderRole && r.offenderRole !== 'student' ? ` · ${r.offenderRole}` : ''}</p>
            <p className="text-xs text-slate-700 font-medium mt-0.5">{r.messageExcerpt}</p>
          </div>
          <p className="text-[11px] text-slate-500 font-medium"><span className="font-black text-slate-700">Reason:</span> {r.reason}</p>
          <p className="text-[10px] text-slate-400 font-medium">
            Reported by {r.reporterUsername || 'a student'}{groupName(r.groupId) ? ` · in ${groupName(r.groupId)}` : ''}
          </p>

          {r.status === 'pending' && (
            <div className="flex flex-wrap gap-2 pt-1">
              {(isAdmin || data.settings.tutorsCanRemove) && (
                <button
                  onClick={() => act(r, 'remove')}
                  disabled={!!busyId}
                  className="px-3 py-2 rounded-xl bg-rose-600 text-white text-[11px] font-black active:scale-95 transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {busyId === r.id && <Loader2 className="w-3 h-3 animate-spin" />} Remove message
                </button>
              )}
              {isAdmin && data.settings.muteDayOptions.map((d) => (
                <button
                  key={d}
                  onClick={() => act(r, 'mute', d)}
                  disabled={!!busyId}
                  className="px-3 py-2 rounded-xl bg-amber-500 text-white text-[11px] font-black active:scale-95 transition disabled:opacity-50"
                >
                  Mute {d}d
                </button>
              ))}
              {isAdmin && (
                <>
                  <button
                    onClick={() => act(r, 'dismiss')}
                    disabled={!!busyId}
                    className="px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-[11px] font-black active:scale-95 transition disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={() => act(r, 'escalate')}
                    disabled={!!busyId}
                    className="px-3 py-2 rounded-xl bg-violet-600 text-white text-[11px] font-black active:scale-95 transition disabled:opacity-50"
                  >
                    Escalate to TOS
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// THREAD (Step 7): staff read and post in a group. Same rules as students;
// the server re-checks membership, pause, length and the rate limit.
// ---------------------------------------------------------------------------

interface ThreadMsg {
  id: string;
  uid: string;
  username: string;
  role: string;
  text: string;
  photoUrl: string | null;
  at: number;
  removed: boolean;
  mine: boolean;
  forwardedFrom?: string | null;
  replyTo?: { id: string; username: string; excerpt: string } | null;
  reactions?: Record<string, string> | null;
}

function roleChip(role: string): string {
  if (role === 'admin') return 'Admin';
  if (role === 'tutor') return 'Tutor';
  if (role === 'tos') return 'TOS';
  return 'Student';
}

function roleChipClass(role: string): string {
  if (role === 'tos') return 'bg-violet-100 text-violet-700';
  if (role === 'admin') return 'bg-orange-100 text-[#EA580C]';
  if (role === 'tutor') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-500';
}

// The last thread shown for each group, kept in memory so reopening a chat puts
// the conversation on screen straight away while a fresh sync runs behind it.
const threadCache = new Map<string, ThreadMsg[]>();

const ThreadPanel: React.FC<{
  group: ChatGroup;
  centreId: string;
  messageMaxChars: number;
  photosAllowed: boolean;
  addToast: (msg: string, kind?: string) => void;
  onBack: () => void;
}> = ({ group, centreId, messageMaxChars, photosAllowed, addToast, onBack }) => {
  const [messages, setMessages] = useState<ThreadMsg[] | null>(() => threadCache.get(group.id) || null);
  const [text, setText] = useState('');
  const [attachPreview, setAttachPreview] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState('');
  const [actionMsg, setActionMsg] = useState<ThreadMsg | null>(null);
  const [replyTo, setReplyTo] = useState<ThreadMsg | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api(`/api/centre/chat/groups/${group.id}/messages?centreId=${encodeURIComponent(centreId)}`);
      const d = res as { messages?: ThreadMsg[] };
      setMessages(d.messages || []);
      threadCache.set(group.id, d.messages || []);
      setLoadErr('');
    } catch (e: any) {
      setLoadErr(String(e?.message || 'The chat could not be loaded.'));
    }
  }, [group.id, centreId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  // Newest message sits at the bottom of the conversation, like any chat app.
  const shown = [...(messages || [])].sort((a, b) => a.at - b.at);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = async () => {
    if (busy) return;
    const value = text.trim();
    if (!value && !attachPreview) return;
    setBusy(true);
    try {
      let photoUrl: string | undefined;
      if (attachPreview) {
        const res = await api(`/api/centre/chat/photo?centreId=${encodeURIComponent(centreId)}`, { method: 'POST', body: { dataUrl: attachPreview } });
        photoUrl = String(res?.url || '');
        if (!photoUrl) throw new Error('The photo could not be uploaded.');
      }
      await api(`/api/centre/chat/groups/${group.id}/messages?centreId=${encodeURIComponent(centreId)}`, {
        method: 'POST',
        body: { text: value, photoUrl, replyTo: replyTo ? replyTo.id : undefined },
      });
      setText('');
      setAttachPreview('');
      setReplyTo(null);
      await load();
    } catch (e: any) {
      addToast(String(e?.message || 'The message could not be sent.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const onPhotoPicked = (file: File | null | undefined) => {
    if (!file) return;
    if (!/^image\//.test(file.type || '')) { addToast('Only photos can be attached here.'); return; }
    if (file.size > 12 * 1024 * 1024) { addToast('That photo is too large. Choose a smaller one.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1400;
        const scale = Math.min(1, max / Math.max(img.width || 1, img.height || 1));
        const w = Math.max(1, Math.round((img.width || max) * scale));
        const h = Math.max(1, Math.round((img.height || max) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { addToast('That photo could not be read. Try another.'); return; }
        ctx.drawImage(img, 0, 0, w, h);
        let out = canvas.toDataURL('image/jpeg', 0.82);
        let q = 0.82;
        while (out.length * 0.75 > 900 * 1024 && q > 0.35) { q -= 0.15; out = canvas.toDataURL('image/jpeg', q); }
        setAttachPreview(out);
      };
      img.onerror = () => addToast('That photo could not be read. Try another.');
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  };

  const myUid = (messages || []).find((m) => m.mine)?.uid || '';

  const applyReaction = (msgId: string, uid: string, emoji: string | null) => {
    setMessages((prev) => (prev || []).map((m) => {
      if (m.id !== msgId) return m;
      const r: Record<string, string> = {};
      Object.entries(m.reactions || {}).forEach(([k, v]) => { if (typeof v === 'string' && v) r[k] = v; });
      if (emoji && r[uid] !== emoji) r[uid] = emoji;
      else delete r[uid];
      return { ...m, reactions: Object.keys(r).length ? r : null };
    }));
  };

  const doReact = async (m: ThreadMsg, emoji: string) => {
    const mineNow = (m.reactions || {})[myUid];
    applyReaction(m.id, myUid, mineNow === emoji ? null : emoji);
    try {
      await api(`/api/centre/chat/groups/${group.id}/messages/${m.id}/react?centreId=${encodeURIComponent(centreId)}`, { method: 'POST', body: { emoji } });
    } catch (e: any) {
      addToast(String(e?.message || 'Could not react. Try again.'), 'error');
      load();
    }
  };

  const doDelete = async (m: ThreadMsg) => {
    setBusy(true);
    try {
      await api(`/api/centre/chat/groups/${group.id}/messages/${m.id}/remove?centreId=${encodeURIComponent(centreId)}`, { method: 'POST', body: {} });
      setMessages((prev) => (prev || []).map((x) => (x.id === m.id ? { ...x, removed: true } : x)));
      if (messages) threadCache.set(group.id, messages.map((x) => (x.id === m.id ? { ...x, removed: true } : x)));
      addToast('Message removed', 'success');
    } catch (e: any) {
      addToast(String(e?.message || 'Could not remove the message. Try again.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const doCopy = async (m: ThreadMsg) => {
    const ok = await copyText(m.text || '');
    addToast(ok ? 'Copied' : 'Could not copy on this device', ok ? 'success' : 'error');
  };

  // Same shell as the student room: a fixed screen with the header and the
  // composer both pinned, and only the messages scroll between them.
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#FFF3E7]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="px-3 sm:px-5 py-2.5 flex items-center gap-2 bg-[#EA580C] shadow-sm shrink-0">
        <button onClick={onBack} className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center text-white active:scale-95 transition shrink-0" aria-label="Back to groups">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-white truncate">{group.name}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-orange-100">{kindLabel(group.kind)}</p>
        </div>
      </div>

      {loadErr && (
        <div className="px-4 py-3 bg-rose-50 border-b border-rose-100">
          <p className="text-[11px] font-bold text-rose-700">{loadErr}</p>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {messages === null && (
          <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[#EA580C]" /></div>
        )}
        {messages !== null && messages.length === 0 && (
          <p className="text-center text-xs text-slate-400 font-medium py-8">No messages yet. Send the first one.</p>
        )}
        {shown.map((m) => {
          const press = makeLongPress(() => { if (!m.removed) setActionMsg(m); });
          const emojiOnly = !m.removed && !!m.text && isEmojiOnly(m.text);
          return (
          <div key={m.id} className={`flex flex-col ${m.mine ? 'items-end' : 'items-start'}`}>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[10px] font-black text-slate-500">{m.mine ? 'You' : m.username}</span>
              <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${roleChipClass(m.role)}`}>{roleChip(m.role)}</span>
              <span className="text-[9px] text-slate-400">{m.at ? fmtDateTime(new Date(m.at).toISOString()) : ''}</span>
            </div>
            {m.forwardedFrom && (
              <p className={`text-[9px] font-bold italic ${m.mine ? 'text-orange-100' : 'text-slate-400'}`}>Forwarded from {m.forwardedFrom}</p>
            )}
            {!m.removed && m.photoUrl && (
              <img src={m.photoUrl} alt="Shared photo" className="rounded-xl max-h-60 w-auto" />
            )}
            <div
              {...press}
              className={`max-w-[85%] select-none px-3.5 py-2 rounded-2xl text-xs leading-relaxed cursor-pointer ${m.mine && !emojiOnly ? 'bg-[#EA580C] text-white' : 'bg-white text-slate-800 border border-slate-200'}`}
            >
              {m.replyTo && (
                <div className={`mb-1 rounded-lg border-l-2 px-2 py-1 ${m.mine ? 'border-orange-200 bg-white/10' : 'border-orange-300 bg-orange-50/70'}`}>
                  <p className={`text-[10px] font-black ${m.mine ? 'text-orange-100' : 'text-[#C2410C]'}`}>{m.replyTo.username}</p>
                  <p className={`text-[10px] truncate ${m.mine ? 'text-orange-100/80' : 'text-slate-500'}`}>{m.replyTo.excerpt}</p>
                </div>
              )}
              {m.removed ? <span className="italic opacity-70">Message removed</span> : emojiOnly ? <span className="block text-2xl leading-snug whitespace-pre-wrap">{m.text}</span> : <EmojiText text={m.text} mine={m.mine && !emojiOnly} className="whitespace-pre-wrap break-words" />}
            </div>
            {!m.removed && (
              <ReactionChips reactions={m.reactions} mineUid={myUid} onToggle={(emoji) => doReact(m, emoji)} />
            )}
          </div>
          );
        })}
      </div>

      <div className="relative shrink-0 bg-white border-t border-slate-200 p-3 flex items-end gap-2">
        {attachPreview && (
          <div className="absolute bottom-full left-3 right-3 mb-1 flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-2 py-1.5">
            <img src={attachPreview} alt="Photo to send" className="w-10 h-10 rounded-lg object-cover" />
            <p className="text-[11px] font-bold text-slate-600 flex-1">Photo ready to send</p>
            <button onClick={() => setAttachPreview('')} className="rounded-full p-1 text-slate-400 hover:bg-slate-100" aria-label="Remove photo">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {replyTo && !attachPreview && (
          <div className="absolute bottom-full left-3 right-3 mb-1 flex items-start gap-2 rounded-xl bg-orange-50 border border-orange-100 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black text-[#C2410C]">Replying to {replyTo.username}</p>
              <p className="text-[11px] text-slate-500 truncate">{replyTo.removed ? 'Message removed' : (replyTo.text || 'Photo')}</p>
            </div>
            <button onClick={() => setReplyTo(null)} className="rounded-full p-1 text-slate-400 hover:bg-orange-100" aria-label="Cancel reply">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {photosAllowed && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { onPhotoPicked(e.target.files && e.target.files[0]); e.target.value = ''; }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="w-11 h-11 rounded-2xl bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center active:scale-95 transition shrink-0"
              aria-label="Attach a photo"
            >
              <Plus className="w-5 h-5" />
            </button>
          </>
        )}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={messageMaxChars}
          rows={2}
          placeholder="Write a message…"
          className="flex-1 resize-none px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:border-orange-300"
        />
        <button
          onClick={send}
          disabled={busy || !text.trim()}
          className="px-4 py-2.5 rounded-xl bg-[#EA580C] text-white text-xs font-black active:scale-95 transition disabled:opacity-50 flex items-center gap-1.5"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send
        </button>
      </div>

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
