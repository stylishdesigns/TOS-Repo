import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Flag,
  Film,
  Info,
  Loader2,
  Megaphone,
  MessageSquare,
  Play,
  Pause,
  Plus,
  Send,
  ShieldAlert,
  User,
  UserPlus,
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
  kind: 'announcements' | 'custom' | 'tos_channel' | 'personal';
  audience?: 'students' | 'tutors' | 'centre_admins';
  peerUid?: string;
  peerUsername?: string;
  peerName?: string;
  peerAvatar?: string;
  subject: string | null;
  access: ChatAccess;
  createdAt: string;
  lastMessage?: { text: string; at: number; removed: boolean; role: string; fileKind?: string | null } | null;
}

interface ChatSettings {
  defaultThresholdPercent: number;
  minAnswers: number;
  autoSubjectGroups: boolean;
  photosAllowed: boolean;
  tutorsCanRemove: boolean;
  paused: boolean;
  muteDayOptions: number[];
  studentsCanChatStudents: boolean;
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
    postRateLimitPerDay: number;
    autoPosts: Record<string, boolean>;
  };
  groups: ChatGroup[];
  personalChats?: ChatGroup[];
  reports: ChatReport[];
}

function accessLabel(g: ChatGroup): string {
  if (g.kind === 'personal') return 'Private one-to-one chat';
  if (g.access.mode === 'none') return 'Open to everyone';
  if (g.access.mode === 'custom') return `Opens at ${g.access.thresholdPercent ?? 0}% practice`;
  return 'Centre default';
}

function kindLabel(kind: string): string {
  if (kind === 'personal') return 'Personal';
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

        {tabs.length > 1 && (
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
        )}

        {tab === 'groups' && data && <GroupsSection data={data} setData={setData} isAdmin={isAdmin} reload={load} addToast={addToast} centreId={activeCentreId || ''} onThreadOpenChange={onThreadOpenChange} />}
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
  setData?: React.Dispatch<React.SetStateAction<Bootstrap | null>>;
  onThreadOpenChange?: (open: boolean) => void;
  reload: () => Promise<void>;
  addToast: (msg: string, kind?: string) => void;
  centreId: string;
}

const GroupsSection: React.FC<SectionProps> = ({ data, isAdmin, reload, addToast, centreId, onThreadOpenChange, setData }) => {
  const [listImage, setListImage] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'custom' | 'announcements'>('custom');
  const [subject, setSubject] = useState('');
  const [accessMode, setAccessMode] = useState<'centre_default' | 'custom' | 'none'>('centre_default');
  const [threshold, setThreshold] = useState('70');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [staffFilter, setStaffFilter] = useState<'personal' | 'groups' | 'channels'>('personal');
  // One-to-one chats live in the same groups list the server returns; the
  // Personal tab shows exactly those, so a chat opened from a student lands
  // under Personal and stays there.
  const personalChats = (data.groups || []).filter((g) => g.kind === 'personal');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const openGroup = openId ? (data.groups.find((g) => g.id === openId) || data.personalChats?.find((g) => g.id === openId)) || null : null;
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
          forwardOptions={[
            ...data.groups.filter((g) => g.id !== openGroup.id && g.kind !== 'tos_channel'),
            ...personalChats,
          ].map((g) => ({ id: g.id, name: g.name, kind: g.kind }))}
          addToast={addToast}
          onBack={() => setOpenId(null)}
        />
      ) : (
      <>
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

      {!openGroup && (
        <div className="flex gap-2" aria-label="Chats filter">
          <button
            type="button"
            aria-pressed={staffFilter === 'personal'}
            onClick={() => setStaffFilter('personal')}
            className={`px-4 py-2 rounded-full text-xs font-black shadow-sm transition ${staffFilter === 'personal' ? 'bg-[#EA580C] text-white' : 'bg-white border border-slate-200 text-slate-500'}`}
          >
            Personal
          </button>
          <button
            type="button"
            aria-pressed={staffFilter === 'groups'}
            onClick={() => setStaffFilter('groups')}
            className={`px-4 py-2 rounded-full text-xs font-black shadow-sm transition ${staffFilter === 'groups' ? 'bg-[#EA580C] text-white' : 'bg-white border border-slate-200 text-slate-500'}`}
          >
            Groups
          </button>
          <button
            type="button"
            aria-pressed={staffFilter === 'channels'}
            onClick={() => setStaffFilter('channels')}
            className={`px-4 py-2 rounded-full text-xs font-black shadow-sm transition ${staffFilter === 'channels' ? 'bg-[#EA580C] text-white' : 'bg-white border border-slate-200 text-slate-500'}`}
          >
            Channels
          </button>
        </div>
      )}

      {staffFilter === 'personal' && !openGroup && (
        <button
          onClick={() => setPickerOpen(true)}
          className="fixed bottom-24 right-4 z-30 w-14 h-14 rounded-full text-white flex items-center justify-center shadow-xl active:scale-95 transition"
          style={{ background: 'linear-gradient(145deg, #EA580C, #9A3412)' }}
          aria-label="Start a new chat"
        >
          <UserPlus className="w-6 h-6" />
        </button>
      )}

      {staffFilter === 'personal' && !openGroup && personalChats.length === 0 && (
        <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center space-y-1.5">
          <User className="w-7 h-7 text-slate-300 mx-auto" />
          <p className="text-sm font-black text-slate-800">No personal chats yet</p>
          <p className="text-xs text-slate-500 font-medium">Tap New chat to message someone in your centre.</p>
        </div>
      )}

      {staffFilter === 'channels' && data.groups.filter((g) => g.kind === 'tos_channel').length === 0 && (
        <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center space-y-1.5">
          <Megaphone className="w-7 h-7 text-slate-300 mx-auto" />
          <p className="text-sm font-black text-slate-800">No channels for you yet</p>
          <p className="text-xs text-slate-500 font-medium">Channels are posted by TOS. Yours will appear here.</p>
        </div>
      )}

      {staffFilter === 'groups' && data.groups.filter((g) => g.kind !== 'personal' && g.kind !== 'tos_channel').length === 0 && (
        <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center space-y-1.5">
          <Users className="w-7 h-7 text-slate-300 mx-auto" />
          <p className="text-sm font-black text-slate-800">No groups yet</p>
          <p className="text-xs text-slate-500 font-medium">
            {isAdmin ? 'Create your first group above.' : 'Your centre admins have not created any groups yet.'}
          </p>
        </div>
      )}

      {(staffFilter === 'channels'
        ? data.groups.filter((g) => g.kind === 'tos_channel')
        : staffFilter === 'groups'
        ? data.groups.filter((g) => g.kind !== 'personal' && g.kind !== 'tos_channel')
        : personalChats
      ).map((g) => (
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
              {g.kind === 'personal' ? (
                <span
                  onClick={(e) => { if (g.peerAvatar) { e.stopPropagation(); setListImage(g.peerAvatar); } }}
                  className={`w-10 h-10 rounded-full bg-orange-50 border border-orange-100 text-[#EA580C] flex items-center justify-center text-xs font-black overflow-hidden shrink-0 ${g.peerAvatar ? 'cursor-pointer' : ''}`}
                >
                  {g.peerAvatar ? <img src={g.peerAvatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : (initialsOf(g.name) || <User className="w-5 h-5" />)}
                </span>
              ) : (
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                  g.kind === 'announcements' ? 'bg-amber-50 border-amber-100 text-amber-600' : 'bg-orange-50 border-orange-100 text-[#EA580C]'
                }`}>
                  {g.kind === 'announcements' ? <Megaphone className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
                </div>
              )}
              <div className="flex-1 min-w-0">
                {g.kind === 'personal' ? (
                <>
                  <p className="text-sm font-black text-slate-900 truncate">{g.name}</p>
                  {g.lastMessage && <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">{lastLineFor(g)}</p>}
                </>
              ) : (
                  <>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-black text-slate-900">{g.name}</p>
                      <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">{kindLabel(g.kind)}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                      {g.subject ? `Subject: ${g.subject} · ` : ''}{accessLabel(g)}
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium mt-0.5">Created {fmtDate(g.createdAt)}</p>
                    {g.lastMessage && <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">{lastLineFor(g)}</p>}
                  </>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {g.lastMessage && <span className="text-[10px] text-slate-400 font-bold">{fmtListTime(g.lastMessage.at)}</span>}
                {isAdmin && g.kind !== 'personal' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); startEdit(g); }}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-black active:scale-95 transition"
                  >
                    Edit
                  </button>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
            </div>
          )}
        </div>
      ))}
      </>
      )}
      {listImage && (
        <div className="fixed inset-0 z-[60] bg-black flex items-center justify-center">
          <button onClick={() => setListImage('')} className="absolute top-3 left-3 z-10 w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center text-white active:scale-95 transition" aria-label="Back">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <img src={listImage} alt="Profile photo" className="max-h-full max-w-full object-contain" />
        </div>
      )}

      {pickerOpen && (
        <StaffNewChatSheet
          centreId={centreId}
          onClose={() => setPickerOpen(false)}
          onOpenChat={async (chatId, name) => {
            setPickerOpen(false);
            // Straight into the room: the chat opens on the spot with an
            // optimistic entry while the fresh list loads behind it.
            if (setData) {
              setData((cur) => {
                if (!cur || cur.groups.some((g) => g.id === chatId)) return cur;
                return {
                  ...cur,
                  groups: [...cur.groups, {
                    id: chatId, name, kind: 'personal' as const, subject: null,
                    access: { mode: 'none' as const, thresholdPercent: null },
                    createdAt: '', peerUid: '', peerName: name, peerAvatar: '',
                  }],
                };
              });
            }
            setOpenId(chatId);
            addToast(`Chat with ${name} opened`);
            await reload();
          }}
        />
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
        <Toggle on={s.studentsCanChatStudents !== false} onChange={(v) => setS({ ...s, studentsCanChatStudents: v })} label="Students can chat each other privately" />
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
        <p className="text-[11px] text-slate-500 font-medium">Photos up to {data.platform.photoMaxKb} KB · messages up to {data.platform.messageMaxChars} characters · messages kept {data.platform.retentionDays} days · up to {data.platform.postRateLimitPerDay} posts per day.</p>
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
  fileUrl?: string | null;
  fileName?: string | null;
  fileKind?: string | null;
  fileSize?: number | null;
  at: number;
  removed: boolean;
  mine: boolean;
  forwardedFrom?: string | null;
  replyTo?: { id: string; username: string; excerpt: string } | null;
  reactions?: Record<string, string> | null;
  pending?: boolean;
  localUrl?: string;
  progress?: number;
  status?: 'sent' | 'delivered' | 'seen';
}

/** What a chat attachment is, from its file type: image, video or document. */
function initialsOf(name: string): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return parts.slice(0, 2).map((w) => (w[0] || '').toUpperCase()).join('');
}

function kindOf(file: File): string {
  const t = (file as any).type || '';
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('audio/')) return 'audio';
  return 'file';
}

// The one line a chat list row shows under the name: the message itself, or
// what the media is when the last message carried none.
function lastLineFor(g: { lastMessage?: { text: string; removed: boolean; fileKind?: string | null } | null }): string {
  const lm = g.lastMessage;
  if (!lm) return '';
  if (lm.removed) return 'Message removed';
  return lm.text || (lm.fileKind === 'video' ? 'Video' : lm.fileKind ? 'File' : 'Photo');
}

function fmtListTime(at: number): string {
  if (!at) return '';
  const d = new Date(at);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const days = Math.floor((now.getTime() - at) / 86400000);
  if (days > 0 && days < 7) return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

const fmtVvTime = (n: number): string => {
  if (!Number.isFinite(n) || n <= 0) return '0:00';
  const sec = Math.floor(n % 60);
  const min = Math.floor(n / 60);
  return `${min}:${String(sec).padStart(2, '0')}`;
};

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
  forwardOptions?: { id: string; name: string; kind: string }[];
  addToast: (msg: string, kind?: string) => void;
  onBack: () => void;
}> = ({ group, centreId, messageMaxChars, photosAllowed, forwardOptions, addToast, onBack }) => {
  const [messages, setMessages] = useState<ThreadMsg[] | null>(() => threadCache.get(group.id) || null);
  const [text, setText] = useState('');
  const [attachPreview, setAttachPreview] = useState('');
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [attachModal, setAttachModal] = useState<{ kind: 'image' | 'video' | 'file'; url: string; file: File | null; dataUrl?: string } | null>(null);
  const [attachProgress, setAttachProgress] = useState(0);
  const [attachSheet, setAttachSheet] = useState(false);
  const [videoViewerUrl, setVideoViewerUrl] = useState('');
  const [videoPaused, setVideoPaused] = useState(false);
  const [vvAt, setVvAt] = useState(0);
  const [vvDur, setVvDur] = useState(0);
  const [infoOpen, setInfoOpen] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [canLoadEarlier, setCanLoadEarlier] = useState(true);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLInputElement | null>(null);
  const viewerVideoRef = useRef<HTMLVideoElement | null>(null);
  const docRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const uploadCfgRef = useRef<{ cloud: string; preset: string; folder: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState('');
  const [actionMsg, setActionMsg] = useState<ThreadMsg | null>(null);
  const [replyTo, setReplyTo] = useState<ThreadMsg | null>(null);
  const [flagTarget, setFlagTarget] = useState<ThreadMsg | null>(null);
  const [flagReason, setFlagReason] = useState('');
  const [sendingFlag, setSendingFlag] = useState(false);
  // Day separators, the full-screen photo viewer, the delete confirmation and
  // forwarding all work the same way they do in the student chat.
  const [imageViewerUrl, setImageViewerUrl] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<ThreadMsg | null>(null);
  const [forwardTarget, setForwardTarget] = useState<ThreadMsg | null>(null);
  const [forwarding, setForwarding] = useState(false);

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

  // Older pages load behind the current view with the same before-cursor the
  // student room uses, so nothing in a long centre group is out of reach.
  const loadEarlier = async () => {
    const list = messages || [];
    if (loadingOlder || list.length === 0 || !canLoadEarlier) return;
    const oldest = Math.min(...list.map((m) => m.at || 0));
    if (!oldest) { setCanLoadEarlier(false); return; }
    setLoadingOlder(true);
    try {
      const res = await api(`/api/centre/chat/groups/${group.id}/messages?centreId=${encodeURIComponent(centreId)}&before=${oldest}&limit=50`);
      const older: ThreadMsg[] = (res as any)?.messages || [];
      const known = new Set(list.map((m) => m.id));
      const fresh = older.filter((m) => !known.has(m.id));
      if (older.length < 50) setCanLoadEarlier(false);
      if (fresh.length > 0) {
        const next = [...[...fresh].sort((a, b) => a.at - b.at), ...list];
        setMessages(next);
        threadCache.set(group.id, next);
      }
    } catch { /* the current view stays; the button can be pressed again */ }
    finally { setLoadingOlder(false); }
  };

  // Newest message sits at the bottom of the conversation, like any chat app.
  const shown = [...(messages || [])].sort((a, b) => a.at - b.at);

  const dayKey = (at: number): string => {
    const d = new Date(at);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };
  const daySeparatorLabel = (at: number, prevAt: number | null): string | null => {
    if (prevAt != null && dayKey(at) === dayKey(prevAt)) return null;
    const d = new Date(at);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const that = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diffDays = Math.round((today - that) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };
  // Messages grouped per day so each date separator sticks inside its own day
  // block instead of the whole scroll area.
  const dayGroups = (list: ThreadMsg[]): Array<{ key: string; label: string | null; msgs: ThreadMsg[] }> => {
    const groups: Array<{ key: string; label: string | null; msgs: ThreadMsg[] }> = [];
    list.forEach((m, i) => {
      const label = daySeparatorLabel(m.at, i > 0 ? list[i - 1].at : null);
      if (label) groups.push({ key: label + '-' + i, label, msgs: [] });
      if (groups.length) groups[groups.length - 1].msgs.push(m);
      else groups.push({ key: 'open', label: null, msgs: [m] });
    });
    return groups;
  };
  const followRef = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const stick = () => {
      followRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 90;
    };
    el.addEventListener('scroll', stick, { passive: true });
    return () => el.removeEventListener('scroll', stick);
  }, []);
  useEffect(() => {
    if (!followRef.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // The upload config comes from the centre's own chat settings, cached for
  // the session so every attachment after the first starts instantly.
  const uploadStaffFile = async (file: File, onProgress: (pct: number) => void): Promise<string> => {
    let cfg = uploadCfgRef.current;
    if (!cfg) {
      const res = await api(`/api/centre/chat/upload-config?centreId=${encodeURIComponent(centreId)}`);
      cfg = { cloud: String(res?.cloud || ''), preset: String(res?.preset || ''), folder: String(res?.folder || 'tos/chat') };
      if (!cfg.cloud || !cfg.preset) throw new Error('File sharing is not configured yet.');
      uploadCfgRef.current = cfg;
    }
    const kind = kindOf(file);
    const resource = kind === 'image' ? 'image' : kind === 'video' ? 'video' : 'raw';
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', cfg.preset);
    fd.append('folder', cfg.folder);
    return await new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${cfg!.cloud}/${resource}/upload`);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && data.secure_url) resolve(String(data.secure_url));
          else reject(new Error(String(data?.error?.message || 'The file could not be uploaded.')));
        } catch { reject(new Error('The file could not be uploaded.')); }
      };
      xhr.onerror = () => reject(new Error('The file could not be uploaded. Check your connection.'));
      xhr.send(fd);
    });
  };

  const send = async (override?: { preview?: string; file?: File | null }) => {
    if (busy) return;
    const value = text.trim();
    const preview = override ? override.preview ?? '' : attachPreview;
    const file = override ? override.file ?? null : attachFile;
    const rt = replyTo;
    if (!value && !preview && !file) return;
    setBusy(true);
    // The message shows in the room straight away, media included, with the
    // upload percentage on the media itself instead of a loading screen.
    const penId = `pending-${Date.now()}`;
    const kind = file ? kindOf(file) : null;
    const localUrl = file && (kind === 'image' || kind === 'video') ? URL.createObjectURL(file) : preview || undefined;
    const pen: ThreadMsg = {
      id: penId,
      uid: '',
      username: '',
      role: '',
      text: value,
      photoUrl: preview || null,
      fileUrl: file ? 'pending' : null,
      fileName: file ? file.name : null,
      fileKind: kind,
      fileSize: file ? file.size : null,
      at: Date.now(),
      removed: false,
      mine: true,
      pending: true,
      progress: 0,
      localUrl,
    };
    setMessages((prev) => [...(prev || []), pen]);
    setText('');
    setAttachPreview('');
    setAttachFile(null);
    setAttachProgress(0);
    setReplyTo(null);
    try {
      let photoUrl: string | undefined;
      let fileUrl: string | undefined;
      if (preview) {
        const res = await api(`/api/centre/chat/photo?centreId=${encodeURIComponent(centreId)}`, { method: 'POST', body: { dataUrl: preview } });
        photoUrl = String(res?.url || '');
        if (!photoUrl) throw new Error('The photo could not be uploaded.');
      } else if (file) {
        fileUrl = await uploadStaffFile(file, (pct) => {
          setMessages((prev) => (prev || []).map((x) => (x.id === penId && x.pending ? { ...x, progress: pct } : x)));
          setAttachProgress(pct);
        });
      }
      const res = await api(`/api/centre/chat/groups/${group.id}/messages?centreId=${encodeURIComponent(centreId)}`, {
        method: 'POST',
        body: {
          text: value,
          photoUrl,
          fileUrl,
          fileName: file ? file.name : undefined,
          fileSize: file ? file.size : undefined,
          fileKind: file ? kindOf(file) : undefined,
          replyTo: rt ? rt.id : undefined,
        },
      });
      const saved = (res as any)?.message as ThreadMsg | undefined;
      if (saved) {
        setMessages((prev) => {
          const next = (prev || []).map((x) => (x.id === penId ? saved : x));
          threadCache.set(group.id, next);
          return next;
        });
      } else {
        await load();
      }
    } catch (e: any) {
      setMessages((prev) => (prev || []).filter((x) => x.id !== penId));
      addToast(String(e?.message || 'The message could not be sent.'), 'error');
    } finally {
      setAttachProgress(0);
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
        setAttachModal({ kind: 'image', url: out, file: null, dataUrl: out });
      };
      img.onerror = () => addToast('That photo could not be read. Try another.');
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  };

  const onFilePicked = (file: File | null | undefined) => {
    if (!file) return;
    if (kindOf(file) === 'image') { onPhotoPicked(file); return; }
    if (file.size > 200 * 1024 * 1024) { addToast('That file is too large. Choose a smaller one.'); return; }
    const k = kindOf(file);
    const url = k === 'video' ? URL.createObjectURL(file) : '';
    setAttachModal({ kind: k === 'video' ? 'video' : 'file', url, file });
  };

  const closeAttachModal = () => {
    setAttachModal((cur) => {
      if (cur && cur.url.startsWith('blob:')) URL.revokeObjectURL(cur.url);
      return null;
    });
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

  const doForward = async (toId: string) => {
    if (!forwardTarget || forwarding) return;
    setForwarding(true);
    try {
      await api('/api/centre/chat/forward', {
        method: 'POST',
        body: { centreId, fromGroupId: group.id, toGroupId: toId, msgId: forwardTarget.id },
      });
      addToast('Forwarded', 'success');
      setForwardTarget(null);
    } catch (e: any) {
      addToast(String(e?.message || 'The message could not be forwarded. Try again.'), 'error');
    } finally {
      setForwarding(false);
    }
  };

  // Same shell as the student room: a fixed screen with the header and the
  // composer both pinned, and only the messages scroll between them.
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#FFF3E7]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="px-3 sm:px-5 py-2.5 flex items-center gap-2 bg-[#EA580C] shadow-sm shrink-0">
        <button onClick={onBack} className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center text-white active:scale-95 transition shrink-0" aria-label="Back to groups">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-2.5">
          {group.kind === 'personal' && (
            <span className="w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center text-[11px] font-black overflow-hidden shrink-0">
              {group.peerAvatar ? <img src={group.peerAvatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : (initialsOf(group.name) || <User className="w-5 h-5" />)}
            </span>
          )}
          <p className="text-sm font-black text-white truncate">{group.name}</p>
        </div>
        <button
          onClick={() => setInfoOpen(true)}
          className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center text-white active:scale-95 transition shrink-0"
          aria-label="Group info"
        >
          <Info className="w-4 h-4" />
        </button>
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
        {messages !== null && canLoadEarlier && messages.length >= 20 && (
          <div className="flex justify-center py-1">
            <button
              onClick={loadEarlier}
              disabled={loadingOlder}
              className="px-4 py-1.5 rounded-full bg-white border border-slate-200 text-[11px] font-bold text-slate-500 active:scale-95 transition disabled:opacity-60"
            >
              {loadingOlder ? 'Loading…' : 'Load earlier messages'}
            </button>
          </div>
        )}
        {/* Each day gets its own wrapper so its sticky separator releases
            when the next day scrolls up, exactly like the student chat. */}
        {dayGroups(shown).map((g) => (
          <div key={g.key} className="space-y-2.5">
            {g.label && (
              <div className="sticky top-0 z-20 flex justify-center py-1">
                <span className="bg-slate-900/85 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow">
                  {g.label}
                </span>
              </div>
            )}
            {g.msgs.map((m) => {
          const press = makeLongPress(() => { if (!m.removed) setActionMsg(m); });
          const emojiOnly = !m.removed && !!m.text && isEmojiOnly(m.text);
          const mediaUrl = m.localUrl || m.photoUrl || m.fileUrl || null;
          const mediaKind = m.fileKind || (m.photoUrl ? 'image' : null);
          const uploading = !!m.pending && (m.progress ?? 0) < 100;
          return (
          <div key={m.id} className={`flex flex-col ${m.mine ? 'items-end' : 'items-start'} px-1`}>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[10px] font-black text-slate-500">{m.mine ? 'You' : m.username}</span>
              {!m.mine && m.role && m.role !== 'student' && (
                <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${roleChipClass(m.role)}`}>{roleChip(m.role)}</span>
              )}
              <span className="text-[9px] text-slate-400">{m.at ? fmtDateTime(new Date(m.at).toISOString()) : ''}</span>
            </div>
            {m.forwardedFrom && (
              <p className={`text-[9px] font-bold italic ${m.mine ? 'text-orange-100' : 'text-slate-400'}`}>Forwarded from {m.forwardedFrom}</p>
            )}
            {!m.removed && mediaUrl && mediaKind === 'image' && (
              <span
                {...press}
                className="relative block rounded-xl overflow-hidden w-44 h-64 bg-slate-100 cursor-pointer"
                onClick={() => { if (!m.pending) setImageViewerUrl(mediaUrl as string); }}
              >
                <img src={mediaUrl as string} alt="Shared photo" className={`w-full h-full object-cover block ${m.pending ? 'opacity-70' : ''}`} />
                {uploading && (
                  <span className="absolute inset-0 bg-black/45 flex items-center justify-center text-white text-xs font-black">{m.progress ?? 0}%</span>
                )}
              </span>
            )}
            {!m.removed && mediaUrl && mediaKind === 'video' && (
              <span className="relative block">
                <button
                  {...press}
                  onClick={() => { if (!m.pending) { setVvAt(0); setVvDur(0); setVideoViewerUrl(mediaUrl as string); } }}
                  className="relative rounded-xl overflow-hidden w-44 h-64 bg-slate-900 flex items-center justify-center"
                  aria-label="Play video"
                >
                  <video src={mediaUrl as string} preload="metadata" muted playsInline tabIndex={-1} aria-hidden="true" className="absolute inset-0 w-full h-full object-cover" />
                  <span className="relative w-12 h-12 rounded-full bg-black/40 border border-white/50 flex items-center justify-center">
                    <Play className="w-5 h-5 text-white ml-0.5" fill="currentColor" />
                  </span>
                  <span className="absolute bottom-1.5 right-2 text-[9px] font-bold text-white/90 bg-black/50 rounded px-1">Video</span>
                </button>
                {uploading && (
                  <span className="absolute inset-0 rounded-xl bg-black/45 flex items-center justify-center text-white text-xs font-black pointer-events-none">{m.progress ?? 0}%</span>
                )}
              </span>
            )}
            {!m.removed && mediaUrl && mediaKind !== 'image' && mediaKind !== 'video' && (
              <span
                {...press}
                className="relative block"
              >
                <a
                  href={mediaUrl as string}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => { if (m.pending) e.preventDefault(); }}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 max-w-[250px] border ${m.mine ? 'bg-white/10 border-white/20' : 'bg-white border-slate-200 shadow-sm'}`}
                >
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-black uppercase ${m.mine ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'}`}>{(m.fileName || 'file').split('.').pop()?.slice(0, 4)}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[12px] font-bold truncate ${m.mine ? 'text-white' : 'text-slate-800'}`}>{m.fileName || 'File'}</span>
                    <span className={`block text-[10px] font-medium ${m.mine ? 'text-white/70' : 'text-slate-400'}`}>{uploading ? `Uploading ${m.progress ?? 0}%` : 'Tap to open'}</span>
                  </span>
                  <FileText className={`w-4 h-4 shrink-0 ${m.mine ? 'text-white/80' : 'text-slate-400'}`} />
                </a>
              </span>
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
              {m.removed ? <span className="italic opacity-70">Message removed</span> : emojiOnly ? <span className="block text-3xl leading-snug whitespace-pre-wrap break-words">{m.text}</span> : <EmojiText text={m.text} mine={m.mine && !emojiOnly} className="whitespace-pre-wrap break-words" />}
              {m.mine && (
                m.pending ? (
                  <span className="flex items-center justify-end mt-0.5">
                    <Loader2 className="w-3 h-3 animate-spin opacity-70" />
                  </span>
                ) : (
                  <span className={`flex items-center justify-end mt-0.5 ${m.status === 'seen' ? 'text-amber-300' : 'text-orange-100/70'}`}>
                    {m.status === 'sent' ? <Check className="w-3.5 h-3.5" /> : <CheckCheck className="w-3.5 h-3.5" />}
                  </span>
                )
              )}
            </div>
            {!m.removed && (
              <ReactionChips reactions={m.reactions} mineUid={myUid} onToggle={(emoji) => doReact(m, emoji)} />
            )}
          </div>
          );
        })}
          </div>
        ))}
      </div>

      <div className={`relative shrink-0 bg-white border-t border-slate-200 p-3 items-end gap-2 ${group.kind === 'tos_channel' ? 'hidden' : 'flex'}`}>
        {replyTo && (
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
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { setAttachSheet(false); onPhotoPicked(e.target.files && e.target.files[0]); e.target.value = ''; }}
        />
        <input
          ref={videoRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => { setAttachSheet(false); onFilePicked(e.target.files && e.target.files[0]); e.target.value = ''; }}
        />
        <input
          ref={docRef}
          type="file"
          className="hidden"
          onChange={(e) => { setAttachSheet(false); onFilePicked(e.target.files && e.target.files[0]); e.target.value = ''; }}
        />
        <button
          onClick={() => setAttachSheet(true)}
          className="w-11 h-11 rounded-2xl bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center active:scale-95 transition shrink-0"
          aria-label="Attach a photo, video or document"
        >
          <Plus className="w-5 h-5" />
        </button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={messageMaxChars}
          rows={2}
          placeholder="Write a message…"
          className="flex-1 resize-none px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:border-orange-300"
        />
        <button
          onClick={() => send()}
          className="px-4 py-2.5 rounded-xl bg-[#EA580C] text-white text-xs font-black active:scale-95 transition flex items-center gap-1.5"
        >
          <Send className="w-3.5 h-3.5" /> Send
        </button>
      </div>

      {attachModal && (
        <div className="fixed inset-0 z-[55] bg-black/85 flex flex-col" role="dialog" aria-label="Attachment preview">
          <div className="flex justify-end p-3">
            <button onClick={closeAttachModal} className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center active:scale-95 transition" aria-label="Cancel">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center px-4">
            {attachModal.kind === 'image' && (
              <img src={attachModal.url} alt="Attachment preview" className="max-h-[70vh] max-w-full rounded-2xl object-contain" />
            )}
            {attachModal.kind === 'video' && (
              <video src={attachModal.url} controls autoPlay playsInline className="max-h-[70vh] max-w-full rounded-2xl" />
            )}
            {attachModal.kind === 'file' && (
              <div className="w-28 h-28 rounded-3xl bg-white/10 flex flex-col items-center justify-center gap-2 text-white">
                <FileText className="w-9 h-9" />
                <span className="text-[11px] font-bold">Ready to send</span>
              </div>
            )}
          </div>
          <div className="p-4 flex justify-end gap-3">
            <button onClick={closeAttachModal} className="px-5 py-3 rounded-2xl bg-white/10 text-white text-xs font-black active:scale-95 transition">Cancel</button>
            <button
              onClick={() => {
                const cur = attachModal;
                if (cur.url.startsWith('blob:')) URL.revokeObjectURL(cur.url);
                setAttachModal(null);
                send({ preview: cur.dataUrl, file: cur.file });
              }}
              className="px-5 py-3 rounded-2xl bg-[#EA580C] text-white text-xs font-black flex items-center gap-2 active:scale-95 transition"
            >
              <Send className="w-4 h-4" /> Send
            </button>
          </div>
        </div>
      )}

      {attachSheet && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={() => setAttachSheet(false)}>
          <div className="bg-white rounded-t-3xl w-full max-w-md p-4 space-y-2 animate-in slide-in-from-bottom duration-300" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-1 pb-1">
              <p className="text-sm font-black text-slate-900">Attach</p>
              <button onClick={() => setAttachSheet(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            {photosAllowed && (
              <button onClick={() => fileRef.current?.click()} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-left active:scale-[0.99] transition">
                <span className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 text-[#EA580C] flex items-center justify-center"><Info className="w-4 h-4" /></span>
                <span>
                  <span className="block text-sm font-black text-slate-900">Photo</span>
                  <span className="block text-[11px] text-slate-500 font-medium">Take or choose a photo</span>
                </span>
              </button>
            )}
            <button onClick={() => videoRef.current?.click()} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-left active:scale-[0.99] transition">
              <span className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-100 text-violet-600 flex items-center justify-center"><Film className="w-4 h-4" /></span>
              <span>
                <span className="block text-sm font-black text-slate-900">Video</span>
                <span className="block text-[11px] text-slate-500 font-medium">Up to 60 seconds</span>
              </span>
            </button>
            <button onClick={() => docRef.current?.click()} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-left active:scale-[0.99] transition">
              <span className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center"><FileText className="w-4 h-4" /></span>
              <span>
                <span className="block text-sm font-black text-slate-900">Document</span>
                <span className="block text-[11px] text-slate-500 font-medium">PDF, slides, anything else</span>
              </span>
            </button>
          </div>
        </div>
      )}

      {infoOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={() => setInfoOpen(false)}>
          <div className="bg-white rounded-t-3xl w-full max-w-md p-5 space-y-3 animate-in slide-in-from-bottom duration-300" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-black text-slate-900">{group.kind === 'personal' ? 'Contact info' : 'Group info'}</p>
              <button onClick={() => setInfoOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-2">
              {group.kind === 'personal' ? (
                <>
                  <div className="flex items-center gap-3">
                    <span className="w-12 h-12 rounded-full bg-orange-50 border border-orange-100 text-[#EA580C] flex items-center justify-center text-sm font-black overflow-hidden shrink-0">
                      {group.peerAvatar ? <img src={group.peerAvatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : (initialsOf(group.name) || <User className="w-5 h-5" />)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-900 truncate">{group.name}</p>
                      <p className="text-[11px] text-slate-500 font-medium">
                        {group.peerRole === 'tutor' ? 'Tutor' : group.peerRole === 'admin' ? 'Centre admin' : group.peerRole === 'student' ? 'Student' : ''}
                        {group.peerUsername ? ` · @${group.peerUsername}` : ''}
                      </p>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium">Only the two of you can read this conversation.</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-black text-slate-900 break-words">{group.name}</p>
                  <p className="text-[11px] text-slate-500 font-medium">{kindLabel(group.kind)}{group.subject ? ` · Subject: ${group.subject}` : ''}</p>
                  <p className="text-[11px] text-slate-500 font-medium">{accessLabel(group)}</p>
                  <p className="text-[11px] text-slate-400 font-medium">
                    {group.kind === 'tos_channel'
                      ? 'This channel is posted by TOS. You can read and react, but only TOS posts.'
                      : group.kind === 'announcements'
                      ? 'Only your centre can post in Announcements. Everyone can read.'
                      : 'Everyone in this chat can post.'}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {videoViewerUrl && (
        <div className="fixed inset-0 z-[60] bg-black flex flex-col">
          <button onClick={() => { setVideoViewerUrl(''); setVvAt(0); setVvDur(0); }} className="absolute top-3 left-3 z-10 w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center text-white active:scale-95 transition" aria-label="Back">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 w-full flex items-center justify-center cursor-pointer relative" onClick={() => { const v = viewerVideoRef.current; if (v) { if (v.paused) { v.play().catch(() => {}); } else { v.pause(); } } }} aria-label={videoPaused ? 'Play video' : 'Pause video'}>
            <video
              ref={viewerVideoRef}
              src={videoViewerUrl}
              controls={false}
              playsInline
              autoPlay
              onCanPlay={() => { const v = viewerVideoRef.current; if (v && v.paused) v.play().catch(() => undefined); }}
              onPlay={() => setVideoPaused(false)}
              onPause={() => setVideoPaused(true)}
              onTimeUpdate={(e) => setVvAt(e.currentTarget.currentTime || 0)}
              onLoadedMetadata={(e) => setVvDur(e.currentTarget.duration || 0)}
              onEnded={() => setVideoPaused(true)}
              className="max-h-full max-w-full object-contain"
            />
            {videoPaused && (
              <span className="absolute w-16 h-16 rounded-full bg-black/40 border border-white/50 flex items-center justify-center pointer-events-none">
                <Play className="w-7 h-7 text-white ml-1" fill="currentColor" />
              </span>
            )}
          </div>
          <div className="w-full px-4 pb-5 pt-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <span className="text-[10px] font-bold text-white/80 tabular-nums">{fmtVvTime(vvAt)}</span>
            <input
              type="range"
              min={0}
              max={Math.max(vvDur, 0.1)}
              step={0.1}
              value={Math.min(vvAt, vvDur || 0)}
              onChange={(e) => {
                const t = Number(e.target.value);
                setVvAt(t);
                if (viewerVideoRef.current) viewerVideoRef.current.currentTime = t;
              }}
              className="flex-1 h-1 accent-[#EA580C]"
              aria-label="Video timeline"
            />
            <span className="text-[10px] font-bold text-white/80 tabular-nums">{fmtVvTime(vvDur)}</span>
          </div>
        </div>
      )}

      {actionMsg && (
        <MessageActionSheet
          message={actionMsg}
          onClose={() => setActionMsg(null)}
          onReact={(emoji) => doReact(actionMsg, emoji)}
          onReply={() => setReplyTo(actionMsg)}
          onDelete={() => setConfirmDelete(actionMsg)}
          onForward={forwardOptions && forwardOptions.length > 0 ? () => setForwardTarget(actionMsg) : undefined}
          onCopy={actionMsg.text ? () => doCopy(actionMsg) : undefined}
          onReport={!actionMsg.removed && !actionMsg.mine ? () => setFlagTarget(actionMsg) : undefined}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[60] bg-slate-950/50 flex items-center justify-center p-6" onClick={() => setConfirmDelete(null)}>
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-black text-slate-900 text-center">Delete this message?</p>
            <p className="text-xs text-slate-500 text-center font-medium">It will be removed for everyone in this chat.</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setConfirmDelete(null)} className="py-3 rounded-2xl bg-slate-100 text-slate-600 text-sm font-black active:scale-[0.98] transition">Cancel</button>
              <button
                onClick={() => { const m = confirmDelete; setConfirmDelete(null); if (m) doDelete(m); }}
                className="py-3 rounded-2xl bg-rose-600 text-white text-sm font-black active:scale-[0.98] transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {forwardTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex flex-col justify-end" onClick={() => { if (!forwarding) setForwardTarget(null); }}>
          <div className="bg-white rounded-t-3xl max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white rounded-t-3xl border-b border-slate-100 px-5 pt-4 pb-3 flex items-center justify-between">
              <h2 className="text-base font-black text-slate-900">Forward to</h2>
              <button onClick={() => setForwardTarget(null)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-2">
              {(forwardOptions || []).filter((o) => o.id !== group.id).map((o) => (
                <button
                  key={o.id}
                  onClick={() => doForward(o.id)}
                  disabled={forwarding}
                  className="w-full flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-3.5 py-2.5 active:scale-[0.99] transition disabled:opacity-50 text-left"
                >
                  <span className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 text-[#EA580C] flex items-center justify-center shrink-0">
                    {o.kind === 'personal' ? <User className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-black text-slate-900 truncate">{o.name}</span>
                    <span className="block text-[10px] text-slate-400 font-medium">{o.kind === 'personal' ? 'Personal chat' : kindLabel(o.kind)}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {imageViewerUrl && (
        <div className="fixed inset-0 z-[70] bg-black/95 flex items-center justify-center">
          <button onClick={() => setImageViewerUrl('')} className="absolute top-4 left-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white" aria-label="Close photo">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <img src={imageViewerUrl} alt="Photo" className="max-w-full max-h-full object-contain" />
        </div>
      )}

      {flagTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={() => { if (!sendingFlag) setFlagTarget(null); }}>
          <div className="w-full max-w-lg bg-white rounded-t-3xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-600">
                <Flag className="w-4 h-4" />
                <span className="text-sm font-black">Flag message</span>
              </div>
              <button onClick={() => setFlagTarget(null)} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="bg-slate-50 rounded-2xl p-3">
              <p className="text-[10px] font-black text-slate-500">{flagTarget.username}</p>
              <p className="text-xs text-slate-700 font-medium line-clamp-3">{flagTarget.text}</p>
            </div>
            <textarea
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Why are you flagging this message? (optional)"
              className="w-full px-4 py-3 rounded-2xl bg-white border border-slate-200 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-rose-300 resize-none"
            />
            <div className="flex gap-2">
              <button onClick={() => setFlagTarget(null)} className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-600 text-sm font-black active:scale-[0.99] transition">Cancel</button>
              <button
                onClick={async () => {
                  if (sendingFlag) return;
                  setSendingFlag(true);
                  try {
                    await api(`/api/centre/chat/groups/${group.id}/report?centreId=${encodeURIComponent(centreId)}`, {
                      method: 'POST',
                      body: { messageId: flagTarget.id, reason: flagReason },
                    });
                    setFlagTarget(null);
                    setFlagReason('');
                    addToast('Flagged. It is now in your Reports list.');
                  } catch (e: any) {
                    addToast(String(e?.message || 'The flag could not be sent. Try again.'));
                  } finally {
                    setSendingFlag(false);
                  }
                }}
                disabled={sendingFlag}
                className="flex-1 py-3 rounded-2xl bg-rose-600 text-white text-sm font-black active:scale-[0.99] transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {sendingFlag && <Loader2 className="w-4 h-4 animate-spin" />} Send flag
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Staff new-chat sheet: one centre, no friend requests. Everyone inside the
// centre is directly chattable; the server rejects anyone outside it.
// ============================================================================

interface StaffDirectoryEntry { uid: string; username?: string; name?: string; avatar?: string }

const StaffNewChatSheet: React.FC<{
  centreId: string;
  onClose: () => void;
  onOpenChat: (chatId: string, name: string) => Promise<void> | void;
}> = ({ centreId, onClose, onOpenChat }) => {
  const [directory, setDirectory] = useState<{ students: StaffDirectoryEntry[]; staff: StaffDirectoryEntry[] } | null>(null);
  const [busyUid, setBusyUid] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const initials = (name: string): string =>
    name.trim().split(/\s+/).slice(0, 2).map((w) => (w[0] || '').toUpperCase()).join('');
  const matches = (label: string): boolean => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return label.toLowerCase().includes(q);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api(`/api/centre/chat/directory?centreId=${encodeURIComponent(centreId)}`);
        if (alive) setDirectory(res as any);
      } catch (e: any) {
        if (alive) setError(String(e?.message || 'Your centre members could not be loaded.'));
      }
    })();
    return () => { alive = false; };
  }, [centreId]);

  const openWith = async (uid: string) => {
    if (busyUid) return;
    setBusyUid(uid);
    setError('');
    try {
      const res: any = await api('/api/centre/chat/personal', {
        method: 'POST',
        body: { centreId, uid },
      });
      await onOpenChat(res.chatId, res.name || 'Chat');
    } catch (e: any) {
      setError(String(e?.message || 'That chat could not be opened.'));
    } finally {
      setBusyUid('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-label="New chat">
      <button className="absolute inset-0 bg-slate-950/40" onClick={onClose} aria-label="Close new chat" />
      <div className="relative bg-white rounded-t-3xl max-h-[80vh] overflow-y-auto animate-in slide-in-from-bottom duration-300">
        <div className="sticky top-0 bg-white rounded-t-3xl border-b border-slate-100 px-5 pt-4 pb-3 flex items-center justify-between">
          <h2 className="text-base font-black text-slate-900">New chat</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-5">
          {error && <p className="text-[11px] font-bold text-rose-600 bg-rose-50 rounded-xl px-3 py-2">{error}</p>}
          {directory && (
            <>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or username"
                className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-orange-300"
              />
              {directory.students.length === 0 && directory.staff.length === 0 && (
                <p className="text-[11px] text-slate-400 font-medium">No one to chat with yet.</p>
              )}
              {directory.students.filter((s) => matches(`${s.name || ''} ${s.username || ''}`)).length > 0 && (
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Students</p>
                  <div className="space-y-2">
                    {directory.students.filter((s) => matches(`${s.name || ''} ${s.username || ''}`)).map((s) => (
                      <div key={s.uid} className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-3.5 py-2.5">
                        <span className="w-10 h-10 rounded-full bg-orange-50 border border-orange-100 text-[#EA580C] flex items-center justify-center text-xs font-black shrink-0 overflow-hidden">
                          {s.avatar
                            ? <img src={s.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            : (initials(s.name || s.username || '') || <User className="w-5 h-5" />)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-black text-slate-900 truncate">{s.name || s.username}</span>
                          <span className="block text-[10px] text-slate-400 font-medium">Student · {s.username}</span>
                        </span>
                        <button
                          onClick={() => openWith(s.uid)}
                          disabled={busyUid === s.uid}
                          className="shrink-0 px-3.5 py-2 rounded-xl bg-[#EA580C] text-white text-[11px] font-black flex items-center gap-1.5 active:scale-95 transition disabled:opacity-50"
                          aria-label={`Chat with ${s.name || s.username}`}
                        >
                          {busyUid === s.uid && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Chat
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {directory.staff.filter((st) => matches(st.name || '')).length > 0 && (
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Staff</p>
                  <div className="space-y-2">
                    {directory.staff.filter((st) => matches(st.name || '')).map((st) => (
                      <div key={st.uid} className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-3.5 py-2.5">
                        <span className="w-10 h-10 rounded-full bg-violet-50 border border-violet-100 text-violet-600 flex items-center justify-center text-xs font-black shrink-0 overflow-hidden">
                          {st.avatar
                            ? <img src={st.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            : (initials(st.name || '') || <User className="w-5 h-5" />)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-black text-slate-900 truncate">{st.name}</span>
                          <span className="block text-[10px] text-slate-400 font-medium">{st.role === 'admin' ? 'Centre admin' : 'Tutor'}</span>
                        </span>
                        <button
                          onClick={() => openWith(st.uid)}
                          disabled={busyUid === st.uid}
                          className="shrink-0 px-3.5 py-2 rounded-xl bg-[#EA580C] text-white text-[11px] font-black flex items-center gap-1.5 active:scale-95 transition disabled:opacity-50"
                          aria-label={`Chat with ${st.name}`}
                        >
                          {busyUid === st.uid && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Chat
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
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
