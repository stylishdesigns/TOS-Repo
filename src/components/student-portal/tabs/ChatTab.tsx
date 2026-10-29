import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  ChevronLeft,
  Flag,
  Info,
  Loader2,
  Lock,
  Megaphone,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldAlert,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { Student } from '../../../types';
import { api } from '../../tos/tosShared';

// ============================================================================
// CH1 student chat (Step 3). The screens are thin: every rule (entitlement,
// membership, the 7-day practice gate, mutes, rate limits) is decided by the
// server routes this tab calls. Nothing here is a security check.
// ============================================================================

interface ChatGroupSummary {
  id: string;
  name: string;
  kind: 'subject' | 'announcements' | 'custom' | 'tos_channel';
  subject: string | null;
  unread: number;
  locked: boolean;
  thresholdPercent: number;
  myPercent: number;
  myAnswers: number;
  minAnswers: number;
  lastMessage: { text: string; at: number; removed: boolean; role: string } | null;
  canPost: boolean;
}

interface ChatOverview {
  ok?: boolean;
  username: string;
  photosAllowed: boolean;
  paused: boolean;
  messageMaxChars: number;
  myPercent: number;
  myAnswers: number;
  minAnswers: number;
  groups: ChatGroupSummary[];
}

interface ChatMessage {
  id: string;
  uid: string;
  username: string;
  role: string;
  text: string;
  photoUrl: string | null;
  at: number;
  removed: boolean;
  mine: boolean;
}

interface MessagesResp {
  ok?: boolean;
  locked?: boolean;
  groupName?: string;
  myPercent?: number;
  thresholdPercent?: number;
  myAnswers?: number;
  minAnswers?: number;
  kind?: string;
  canPost?: boolean;
  messageMaxChars?: number;
  messages?: ChatMessage[];
  unread?: number;
  meta?: { msgCount: number; pruned: number };
  myLastReadCount?: number;
}

function lagosParts(at: number): { y: number; m: number; d: number; hhmm: string } {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(at));
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return {
    y: Number(get('year')),
    m: Number(get('month')),
    d: Number(get('day')),
    hhmm: `${get('hour')}:${get('minute')}`,
  };
}

function fmtTime(at: number): string {
  if (!at) return '';
  const { hhmm } = lagosParts(at);
  return hhmm;
}

function fmtListTime(at: number): string {
  if (!at) return '';
  const now = lagosParts(Date.now());
  const then = lagosParts(at);
  if (now.y === then.y && now.m === then.m && now.d === then.d) return then.hhmm;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${then.d} ${months[then.m - 1] || ''}`;
}

function groupIcon(kind: string, size: string) {
  if (kind === 'announcements') return <Megaphone className={size} />;
  if (kind === 'tos_channel') return <Zap className={size} />;
  if (kind === 'subject') return <BookOpen className={size} />;
  return <Users className={size} />;
}

const RULES_SEEN_KEY = 'tos-chat-rules-seen-v1';

interface ChatTabProps {
  student: Student;
  onGoToProfile?: () => void;
  onGoToPractice?: () => void;
}

export const ChatTab: React.FC<ChatTabProps> = ({ student, onGoToProfile, onGoToPractice }) => {
  const [overview, setOverview] = useState<ChatOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showRules, setShowRules] = useState(() => {
    try {
      return localStorage.getItem(RULES_SEEN_KEY) !== '1';
    } catch {
      return false;
    }
  });
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api('/api/student/chat/overview');
      setOverview(res as ChatOverview);
      setError('');
    } catch (e: any) {
      setError(String(e?.message || 'Chat could not be loaded. Try again.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 45000);
    return () => clearInterval(t);
  }, [load]);

  const refreshOverview = useCallback(() => {
    api('/api/student/chat/overview').then((res) => setOverview(res as ChatOverview)).catch(() => undefined);
  }, []);

  const activeGroup = overview?.groups.find((g) => g.id === activeGroupId) || null;

  if (activeGroupId) {
    return (
      <GroupRoom
        groupId={activeGroupId}
        group={activeGroup}
        onBack={() => {
          setActiveGroupId(null);
          refreshOverview();
        }}
        onGoToPractice={onGoToPractice}
      />
    );
  }

  if (showRules) {
    return (
      <div className="p-4 sm:p-5 max-w-lg mx-auto space-y-4 animate-in fade-in duration-300 pb-20">
        <div className="pt-1">
          <span className="text-[10px] font-extrabold uppercase text-[#C2410C] tracking-wider block">
            {student.name} · Communications
          </span>
          <h2 className="text-xl font-black text-[#0F172A] tracking-tight">Student Chat</h2>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-orange-50 border border-orange-100 text-[#EA580C] flex items-center justify-center">
            <MessageSquare className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-black text-slate-900 tracking-tight">House rules</h3>
          <ul className="space-y-2.5 text-xs text-slate-600 leading-relaxed font-medium">
            <li className="flex gap-2"><span className="text-[#EA580C] font-black">•</span>Be respectful. Everyone here is working towards the same exams.</li>
            <li className="flex gap-2"><span className="text-[#EA580C] font-black">•</span>No sharing answers or exam content while a mock is live.</li>
            <li className="flex gap-2"><span className="text-[#EA580C] font-black">•</span>Some groups open based on your last 7 days of practice. Keep practising to unlock them.</li>
            <li className="flex gap-2"><span className="text-[#EA580C] font-black">•</span>Announcements are read-only. You can react by messaging in your other groups.</li>
            <li className="flex gap-2"><span className="text-[#EA580C] font-black">•</span>You can report any message. Reports go privately to your centre, never to the person you reported.</li>
            <li className="flex gap-2"><span className="text-[#EA580C] font-black">•</span>Your centre can remove messages and mute accounts that break these rules.</li>
          </ul>
          <button
            onClick={() => {
              try {
                localStorage.setItem(RULES_SEEN_KEY, '1');
              } catch { /* private mode: rules simply show again next time */ }
              setShowRules(false);
            }}
            className="w-full py-3 rounded-2xl bg-[#EA580C] text-white text-sm font-black tracking-wide shadow-sm shadow-orange-200 active:scale-[0.99] transition"
          >
            Got it
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-5 max-w-lg mx-auto space-y-4 animate-in fade-in duration-300 pb-20">
      <div className="pt-1 flex items-end justify-between">
        <div>
          <span className="text-[10px] font-extrabold uppercase text-[#C2410C] tracking-wider block">
            {student.name} · Communications
          </span>
          <h2 className="text-xl font-black text-[#0F172A] tracking-tight">Student Chat</h2>
        </div>
        <button
          onClick={load}
          className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 active:scale-95 transition"
          aria-label="Refresh"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </div>

      {error && (
        <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-rose-600">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm font-bold">Chat is unavailable</span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed font-medium">{error}</p>
        </div>
      )}

      {!error && overview && !overview.username && (
        <div className="bg-orange-50 rounded-3xl p-4 border border-orange-100 flex items-center gap-3">
          <Info className="w-5 h-5 text-[#EA580C] shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-bold text-slate-800">Set your username first</p>
            <p className="text-[11px] text-slate-500 font-medium">Your chat name is the one you set for mocks.</p>
          </div>
          {onGoToProfile && (
            <button
              onClick={onGoToProfile}
              className="px-3 py-2 rounded-xl bg-[#EA580C] text-white text-[11px] font-black shrink-0 active:scale-95 transition"
            >
              Go to Profile
            </button>
          )}
        </div>
      )}

      {!error && overview?.paused && (
        <div className="bg-amber-50 rounded-3xl p-4 border border-amber-100 flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
          <p className="text-xs font-bold text-amber-800">Chat is paused for your centre right now.</p>
        </div>
      )}

      {!error && overview && overview.groups.length === 0 && (
        <div className="bg-white rounded-3xl p-8 border border-slate-200/90 shadow-sm text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-orange-50 border border-orange-100 text-[#EA580C] flex items-center justify-center mx-auto">
            <MessageSquare className="w-7 h-7" />
          </div>
          <h3 className="text-base font-black text-slate-900 tracking-tight">No groups yet</h3>
          <p className="text-xs text-slate-500 leading-relaxed font-medium max-w-xs mx-auto">
            When your centre opens chat groups, they will appear here.
          </p>
        </div>
      )}

      {!error && overview && overview.groups.map((g) => (
        <button
          key={g.id}
          onClick={() => setActiveGroupId(g.id)}
          className="w-full text-left bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-sm flex items-center gap-3 active:scale-[0.99] transition"
        >
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${
              g.kind === 'announcements'
                ? 'bg-amber-50 border-amber-100 text-amber-600'
                : g.kind === 'tos_channel'
                  ? 'bg-violet-50 border-violet-100 text-violet-600'
                  : g.locked
                    ? 'bg-slate-50 border-slate-200 text-slate-400'
                    : 'bg-orange-50 border-orange-100 text-[#EA580C]'
            }`}
          >
            {g.locked ? <Lock className="w-5 h-5" /> : groupIcon(g.kind, 'w-5 h-5')}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-black text-slate-900 truncate">{g.name}</p>
              {g.kind === 'announcements' && (
                <span className="text-[9px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full shrink-0">Read only</span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 font-medium truncate">
              {g.locked
                ? `Locked · your score ${g.myPercent}% · needs ${g.thresholdPercent}%`
                : g.lastMessage
                  ? g.lastMessage.removed
                    ? 'Message removed'
                    : g.lastMessage.text || 'Photo'
                  : 'No messages yet'}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-[10px] text-slate-400 font-bold">{g.lastMessage ? fmtListTime(g.lastMessage.at) : ''}</span>
            {g.unread > 0 && (
              <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#EA580C] text-white text-[10px] font-black flex items-center justify-center">
                {g.unread > 99 ? '99+' : g.unread}
              </span>
            )}
          </div>
        </button>
      ))}

      {loading && !overview && !error && (
        <div className="bg-white rounded-3xl p-8 border border-slate-200/90 shadow-sm flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[#EA580C]" />
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Group room (S3/S4/S5/S6/S7): messages, the locked state, reports and info.
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20; // how many messages one page of the chat history holds

interface GroupRoomProps {
  groupId: string;
  group: ChatGroupSummary | null;
  onBack: () => void;
  onGoToPractice?: () => void;
}

const GroupRoom: React.FC<GroupRoomProps> = ({ groupId, group, onBack, onGoToPractice }) => {
  const [resp, setResp] = useState<MessagesResp | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [reportTarget, setReportTarget] = useState<ChatMessage | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [sendingReport, setSendingReport] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [toast, setToast] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2600);
  }, []);

  const mergeMessages = useCallback((page: ChatMessage[]) => {
    setMessages((prev) => {
      if (page.length === 0) return prev;
      const byId = new Map<string, ChatMessage>(prev.map((m): [string, ChatMessage] => [m.id, m]));
      page.forEach((m) => byId.set(m.id, m));
      return Array.from(byId.values()).sort((a, b) => a.at - b.at);
    });
  }, []);

  const markRead = useCallback(async (r: MessagesResp) => {
    const meta = r.meta;
    if (!meta) return;
    const max = Math.max(0, meta.msgCount - meta.pruned);
    if ((r.myLastReadCount || 0) < max) {
      try {
        await api(`/api/student/chat/groups/${groupId}/read`, { method: 'POST', body: { lastReadCount: max } });
      } catch { /* the badge catches up on the next sync */ }
    }
  }, [groupId]);

  const loadLatest = useCallback(async (): Promise<MessagesResp | null> => {
    try {
      const r = (await api(`/api/student/chat/groups/${groupId}/messages?limit=${PAGE_SIZE}`)) as MessagesResp;
      setResp(r);
      if (!r.locked) {
        mergeMessages(r.messages || []);
        setHasOlder((r.messages || []).length >= PAGE_SIZE);
        markRead(r);
      }
      setError('');
      return r;
    } catch (e: any) {
      setError(String(e?.message || 'Messages could not be loaded. Try again.'));
      return null;
    }
  }, [groupId, mergeMessages, markRead]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      await loadLatest();
      if (alive) setLoading(false);
    })();
    const t = setInterval(() => { if (alive) loadLatest(); }, 15000);
    return () => { alive = false; clearInterval(t); };
  }, [loadLatest]);

  const loadOlder = useCallback(async () => {
    if (messages.length === 0 || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const before = messages[0].at;
      const r = (await api(`/api/student/chat/groups/${groupId}/messages?limit=${PAGE_SIZE}&before=${before}`)) as MessagesResp;
      if (!r.locked) {
        mergeMessages(r.messages || []);
        setHasOlder((r.messages || []).length >= PAGE_SIZE);
      }
    } catch (e: any) {
      showToast(String(e?.message || 'Could not load earlier messages.'));
    } finally {
      setLoadingOlder(false);
    }
  }, [groupId, messages, loadingOlder, mergeMessages, showToast]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  useEffect(() => {
    if (!loading && !resp?.locked) scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, resp?.locked]);

  const send = useCallback(async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      await api(`/api/student/chat/groups/${groupId}/messages`, { method: 'POST', body: { text: t } });
      setText('');
      await loadLatest();
      scrollToBottom();
    } catch (e: any) {
      showToast(String(e?.message || 'Your message could not be sent. Try again.'));
    } finally {
      setSending(false);
    }
  }, [groupId, text, sending, loadLatest, scrollToBottom, showToast]);

  const submitReport = useCallback(async () => {
    if (!reportTarget || sendingReport) return;
    setSendingReport(true);
    try {
      await api(`/api/student/chat/groups/${groupId}/report`, {
        method: 'POST',
        body: { messageId: reportTarget.id, reason: reportReason },
      });
      setReportTarget(null);
      setReportReason('');
      showToast('Report sent. Your centre will review it privately.');
    } catch (e: any) {
      showToast(String(e?.message || 'Your report could not be sent. Try again.'));
    } finally {
      setSendingReport(false);
    }
  }, [groupId, reportTarget, reportReason, sendingReport, showToast]);

  if (loading) {
    return (
      <div className="p-4 sm:p-5 max-w-lg mx-auto pb-20 animate-in fade-in duration-300">
        <button onClick={onBack} className="flex items-center gap-1 text-slate-500 text-xs font-bold mb-4">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <div className="bg-white rounded-3xl p-10 border border-slate-200/90 shadow-sm flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[#EA580C]" />
        </div>
      </div>
    );
  }

  const kindLabel = resp?.kind === 'announcements' ? 'Announcements' : resp?.kind === 'tos_channel' ? 'TOS channel' : resp?.kind === 'subject' ? 'Subject group' : 'Group';

  if (resp?.locked) {
    return (
      <div className="p-4 sm:p-5 max-w-lg mx-auto pb-20 animate-in fade-in duration-300">
        <button onClick={onBack} className="flex items-center gap-1 text-slate-500 text-xs font-bold mb-4">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm space-y-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 text-slate-400 flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-black text-slate-900 tracking-tight">{resp.groupName || group?.name || 'Group'} is locked</h3>
          <p className="text-xs text-slate-500 leading-relaxed font-medium max-w-xs mx-auto">
            This group opens at {resp.thresholdPercent}% practice over your last 7 days. Keep the streak going and it unlocks on its own.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-orange-50 border border-orange-100 p-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-[#C2410C]">Your score</p>
              <p className="text-2xl font-black text-[#0F172A]">{resp.myPercent}%</p>
            </div>
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Needed</p>
              <p className="text-2xl font-black text-[#0F172A]">{resp.thresholdPercent}%</p>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 font-medium">
            From {resp.myAnswers || 0} answered questions in the last 7 days{typeof resp.minAnswers === 'number' ? ` (a score counts from ${resp.minAnswers})` : ''}.
          </p>
          {onGoToPractice && (
            <button
              onClick={onGoToPractice}
              className="w-full py-3 rounded-2xl bg-[#EA580C] text-white text-sm font-black tracking-wide shadow-sm shadow-orange-200 active:scale-[0.99] transition"
            >
              Practise to unlock
            </button>
          )}
        </div>
      </div>
    );
  }

  const canPost = resp?.canPost !== false;
  const readOnlyBanner =
    resp?.kind === 'announcements'
      ? 'Only your centre can post in Announcements.'
      : 'Only TOS can post in this group.';

  const roleChip = (m: ChatMessage) =>
    m.role === 'tutor' ? 'Tutor' : m.role === 'centre_admin' ? 'Admin' : m.role === 'tos' ? 'TOS' : '';

  const chipStyle = (m: ChatMessage) =>
    m.role === 'tutor'
      ? 'bg-amber-100 text-amber-700'
      : m.role === 'centre_admin'
        ? 'bg-sky-100 text-sky-700'
        : 'bg-violet-100 text-violet-700';

  const bubble = (m: ChatMessage) => {
    const chip = roleChip(m);
    return (
      <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'} px-1`}>
        <div
          onClick={() => { if (!m.mine && !m.removed) setReportTarget(m); }}
          className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 ${
            m.mine
              ? 'bg-[#EA580C] text-white rounded-br-md'
              : 'bg-white text-slate-800 border border-slate-200/90 rounded-bl-md shadow-sm'
          } ${!m.mine && !m.removed ? 'cursor-pointer active:scale-[0.99] transition' : ''}`}
        >
          {!m.mine && (m.username || chip) && (
            <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
              {m.username && <span className="text-[10px] font-black text-slate-500">{m.username}</span>}
              {chip && (
                <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${chipStyle(m)}`}>
                  {chip}
                </span>
              )}
            </div>
          )}
          {m.removed ? (
            <p className="text-[11px] italic text-slate-400 font-medium">Message removed</p>
          ) : m.text ? (
            <p className={`text-[13px] leading-relaxed font-medium whitespace-pre-wrap break-words ${m.mine ? 'text-white' : 'text-slate-800'}`}>
              {m.text}
            </p>
          ) : m.photoUrl ? (
            <img src={m.photoUrl} alt="Shared photo" className="rounded-xl max-h-60 w-auto" />
          ) : null}
          <p className={`text-[9px] mt-1 text-right font-bold ${m.mine ? 'text-orange-100' : 'text-slate-400'}`}>
            {fmtTime(m.at)}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-lg mx-auto animate-in fade-in duration-300 flex flex-col" style={{ minHeight: 'calc(100vh - 140px)' }}>
      <div className="px-4 sm:px-5 pt-4 pb-2 flex items-center gap-2">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 active:scale-95 transition shrink-0"
          aria-label="Back"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-slate-900 truncate">{resp?.groupName || group?.name}</p>
          <p className="text-[10px] font-black uppercase tracking-wider text-[#C2410C]">{kindLabel}</p>
        </div>
        <button
          onClick={() => setShowInfo(true)}
          className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 active:scale-95 transition shrink-0"
          aria-label="Group info"
        >
          <Info className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div className="mx-4 sm:mx-5 bg-white rounded-2xl p-4 border border-slate-200/90 shadow-sm space-y-2">
          <p className="text-xs text-slate-600 font-medium">{error}</p>
          <button
            onClick={() => { setLoading(true); loadLatest().then(() => setLoading(false)); }}
            className="px-3 py-2 rounded-xl bg-[#EA580C] text-white text-[11px] font-black active:scale-95 transition"
          >
            Try again
          </button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-5 py-2 space-y-2.5">
        {hasOlder && (
          <div className="flex justify-center py-1">
            <button
              onClick={loadOlder}
              disabled={loadingOlder}
              className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-[11px] font-black text-slate-500 active:scale-95 transition disabled:opacity-60"
            >
              {loadingOlder ? 'Loading…' : 'Load earlier messages'}
            </button>
          </div>
        )}
        {messages.length === 0 && !error && (
          <div className="text-center py-10">
            <p className="text-xs text-slate-400 font-medium">No messages yet. Say hello.</p>
          </div>
        )}
        {messages.map(bubble)}
      </div>

      <div className="sticky bottom-[72px] px-4 sm:px-5 pt-2 pb-1 bg-gradient-to-t from-white via-white/95 to-transparent">
        {canPost ? (
          <div className="flex items-end gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Type a message"
              maxLength={typeof resp?.messageMaxChars === 'number' ? resp.messageMaxChars : undefined}
              className="flex-1 px-4 py-3 rounded-2xl bg-white border border-slate-200 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-orange-300"
            />
            <button
              onClick={send}
              disabled={!text.trim() || sending}
              className="w-11 h-11 rounded-2xl bg-[#EA580C] text-white flex items-center justify-center shadow-sm shadow-orange-200 active:scale-95 transition disabled:opacity-50 shrink-0"
              aria-label="Send"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3 text-center">
            <p className="text-[11px] font-bold text-amber-800">{readOnlyBanner}</p>
          </div>
        )}
      </div>

      {reportTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={() => { if (!sendingReport) setReportTarget(null); }}>
          <div className="w-full max-w-lg bg-white rounded-t-3xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-600">
                <Flag className="w-4 h-4" />
                <span className="text-sm font-black">Report message</span>
              </div>
              <button onClick={() => setReportTarget(null)} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="bg-slate-50 rounded-2xl p-3">
              <p className="text-[10px] font-black text-slate-500">{reportTarget.username}</p>
              <p className="text-xs text-slate-700 font-medium line-clamp-3">{reportTarget.text}</p>
            </div>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="What is wrong with this message? (optional)"
              className="w-full px-4 py-3 rounded-2xl bg-white border border-slate-200 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-rose-300 resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setReportTarget(null)}
                className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-600 text-sm font-black active:scale-[0.99] transition"
              >
                Cancel
              </button>
              <button
                onClick={submitReport}
                disabled={sendingReport}
                className="flex-1 py-3 rounded-2xl bg-rose-600 text-white text-sm font-black active:scale-[0.99] transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {sendingReport && <Loader2 className="w-4 h-4 animate-spin" />} Send report
              </button>
            </div>
            <p className="text-[10px] text-slate-400 text-center font-medium">Reports go privately to your centre. The person you report is never told who reported them.</p>
          </div>
        </div>
      )}

      {showInfo && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center" onClick={() => setShowInfo(false)}>
          <div className="w-full max-w-lg bg-white rounded-t-3xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-800">
                <Info className="w-4 h-4 text-[#EA580C]" />
                <span className="text-sm font-black">About this group</span>
              </div>
              <button onClick={() => setShowInfo(false)} className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="bg-slate-50 rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center gap-2">
                {groupIcon(resp?.kind || 'custom', 'w-4 h-4 text-[#EA580C]')}
                <p className="text-sm font-black text-slate-900">{resp?.groupName || group?.name}</p>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">{kindLabel}{group?.subject ? ` · ${group.subject}` : ''}</p>
            </div>
            <div className="space-y-1.5 text-[11px] text-slate-600 font-medium">
              <p>• {resp?.kind === 'announcements' ? 'Only your centre can post here. Everyone can read.' : resp?.kind === 'tos_channel' ? 'Only TOS can post here. Everyone can read.' : 'Everyone in this group can post.'}</p>
              {group && !group.locked && typeof group.thresholdPercent === 'number' && (
                <p>• Opens at {group.thresholdPercent}% practice over your last 7 days. You are at {group.myPercent}%.</p>
              )}
              {group && typeof group.minAnswers === 'number' && group.minAnswers > 0 && (
                <p>• A score starts counting from {group.minAnswers} answered questions in the last 7 days.</p>
              )}
              <p>• Your centre can remove messages and mute accounts that break the house rules.</p>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-28 left-0 right-0 flex justify-center z-50 pointer-events-none">
          <div className="bg-slate-900 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-lg max-w-[85%] text-center">{toast}</div>
        </div>
      )}
    </div>
  );
};
