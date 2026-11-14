import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  Send,
  ImagePlus,
  X,
  TriangleAlert,
  ArrowLeft,
  PanelLeft,
  MessageSquarePlus,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { api } from '../tos/tosShared';

// ============================================================================
// Tutor AI chat (T1/T2): the conversation surface shared by the student, tutor
// and centre-admin portals. The server does all the work (see
// src/server/tutorAiRoutes.ts); this screen only sends, renders and keeps
// state honest with the server's stored conversations.
//
// Theming: the screen follows the visitor's Appearance setting (bgTheme in
// AppContext), light by default, exactly like the chat and status screens.
// Staff portals render it without a mode prop, which keeps the original dark
// look until their portals grow their own appearance settings.
//
// T2: the header's panel button opens a collapsible sidebar listing every
// chat the member has had with the AI (server-side conversations), with a
// New chat action. The AI's answers are rendered as clean formatted text:
// headings, bold, italics, code and lists render as real formatting, never
// as raw markdown characters.
//
// Entry points:
// - Students: the Tutor AI wing in the chat fan (StudentPortal). Opening it
//   hides the bottom nav like a native chat thread; the header's back button
//   is the way back to the fan.
// - Tutors and centre admins: the Tutor AI stop on the staff chat toggle
//   (TutorPortal / AdminChatEntry), rendered embedded in the portal content.
// ============================================================================

interface TitoMessage {
  role: 'user' | 'ai';
  text: string;
  img?: string | null;
  at: number;
}

interface Attachment {
  full: string;
  thumb: string;
}

interface Convo {
  id: string;
  title: string;
  updatedAt: number;
}

// Same downscale approach as the chat composer: long edge 1400px, JPEG,
// quality stepped down until it fits the send budget. A small thumbnail is
// produced alongside for the bubble and the stored history.
async function compressImage(file: File): Promise<Attachment | null> {
  try {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await img.decode();
    URL.revokeObjectURL(url);
    const render = (maxEdge: number, quality: number, minQuality: number, byteCap: number): string | null => {
      const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, w, h);
      let q = quality;
      let data = canvas.toDataURL('image/jpeg', q);
      while (data.length * 0.75 > byteCap && q > minQuality) {
        q -= 0.08;
        data = canvas.toDataURL('image/jpeg', q);
      }
      return data;
    };
    const full = render(1400, 0.82, 0.4, 900 * 1024);
    const thumb = render(420, 0.6, 0.4, 190 * 1024);
    if (!full || !thumb) return null;
    return { full, thumb };
  } catch {
    return null;
  }
}

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

const dayKey = (ms: number) => new Date(ms).toDateString();

const dayLabel = (ms: number) => {
  const today = new Date();
  const d = new Date(ms);
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

// Renders the AI's answers as real formatting. The model writes simple
// markdown; this turns headings, bold, italics, inline code and lists into
// styled React nodes, so the student never sees a hash, asterisk or star.
// Typewriter chunks: markdown-quoted spans (bold, italics, code) stay whole,
// so nothing half-bold ever flashes while the answer draws in.
function tokenizeForTyping(text: string): string[] {
  return text.match(/\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\s+|[^\s*`]+/g) || [text];
}

function renderRichText(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let k = 0;

  const inline = (s: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      if (m.index > last) parts.push(s.slice(last, m.index));
      if (m[1] !== undefined) parts.push(<strong key={k++} className="font-black">{m[1]}</strong>);
      else if (m[2] !== undefined) parts.push(<em key={k++} className="italic">{m[2]}</em>);
      else if (m[3] !== undefined) parts.push(<code key={k++} className="font-mono text-[11px] px-1 py-0.5 rounded bg-black/10">{m[3]}</code>);
      last = m.index + m[0].length;
    }
    if (last < s.length) parts.push(s.slice(last));
    return parts;
  };

  const flushList = () => {
    if (!list) return;
    const items = list.items.map((item, i) => {
      const li = inline(item);
      return list!.ordered ? (
        <li key={i} className="pl-1">{li}</li>
      ) : (
        <li key={i} className="pl-1 relative">
          <span className="absolute -left-3 top-0">•</span>
          {li}
        </li>
      );
    });
    out.push(
      list.ordered ? (
        <ol key={`l${k++}`} className="list-decimal ml-5 space-y-1 my-1">{items}</ol>
      ) : (
        <ul key={`l${k++}`} className="ml-5 space-y-1 my-1">{items}</ul>
      )
    );
    list = null;
  };

  text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .forEach((line, i) => {
      const heading = /^#{1,6}\s+(.*)$/.exec(line.trim());
      const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
      const numbered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
      if (heading) {
        flushList();
        out.push(
          <p key={`h${i}`} className="text-[16px] font-black mt-2 first:mt-0">
            {inline(heading[1])}
          </p>
        );
      } else if (bullet) {
        if (!list || list.ordered) {
          flushList();
          list = { ordered: false, items: [] };
        }
        list.items.push(bullet[1]);
      } else if (numbered) {
        if (!list || !list.ordered) {
          flushList();
          list = { ordered: true, items: [] };
        }
        list.items.push(`${numbered[1]}. ${numbered[2]}`);
      } else if (!line.trim()) {
        flushList();
      } else {
        flushList();
        out.push(
          <p key={`p${i}`} className="mb-1 last:mb-0">
            {inline(line)}
          </p>
        );
      }
    });
  flushList();
  return out;
}

// The one palette difference between the light and dark looks. Orange stays
// the accent in both; only the neutrals swap.
const PALETTES = {
  light: {
    shell: 'bg-white text-slate-900',
    embedded: 'border-slate-200',
    header: 'bg-white/95 border-slate-200',
    headerTitle: 'text-slate-900',
    headerSub: 'text-slate-500',
    backBtn: 'text-slate-500 hover:text-orange-600 hover:bg-orange-50',
    ghostBtn: 'text-slate-500 hover:text-orange-600 hover:bg-orange-50',
    aiBubble: 'bg-slate-100 text-slate-800',
    aiTime: 'text-slate-400',
    imgBorder: 'border-slate-200',
    dayChip: 'text-slate-500 bg-slate-100',
    banner: 'bg-rose-50 border-rose-200',
    bannerText: 'text-rose-700',
    bannerIcon: 'text-rose-500',
    bannerDismiss: 'text-rose-500 hover:text-rose-600',
    chip: 'text-slate-600 bg-slate-100 border-slate-200 hover:text-orange-600 hover:border-orange-500/40',
    composer: 'bg-white/95 border-slate-200',
    attachBtn: 'text-slate-500 hover:text-orange-600 hover:bg-orange-50',
    input: 'bg-slate-100 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-orange-500/50',
    sendOff: 'bg-slate-200 text-slate-400',
    overlay: 'bg-slate-900/50 backdrop-blur-sm',
    overlayPanel: 'bg-white border-slate-200',
    cancelBtn: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
    drawer: 'bg-white border-slate-200',
    drawerText: 'text-slate-900',
    drawerSub: 'text-slate-400',
    drawerItem: 'hover:bg-slate-100 text-slate-800',
    drawerItemActive: 'bg-orange-50 text-orange-700',
    drawerNew: 'text-orange-600 hover:bg-orange-50',
    captionInput: 'bg-slate-100 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-orange-500/50',
  },
  dark: {
    shell: 'bg-slate-950 text-white',
    embedded: 'border-slate-800',
    header: 'bg-slate-950/95 border-slate-800',
    headerTitle: 'text-white',
    headerSub: 'text-slate-400',
    backBtn: 'text-slate-400 hover:text-orange-400 hover:bg-orange-500/10',
    ghostBtn: 'text-slate-400 hover:text-orange-400 hover:bg-orange-500/10',
    aiBubble: 'bg-slate-800/90 text-slate-100',
    aiTime: 'text-slate-500',
    imgBorder: 'border-slate-700/60',
    dayChip: 'text-slate-500 bg-slate-800/60',
    banner: 'bg-rose-500/10 border-rose-500/30',
    bannerText: 'text-rose-200',
    bannerIcon: 'text-rose-400',
    bannerDismiss: 'text-rose-400 hover:text-rose-300',
    chip: 'text-slate-300 bg-slate-800/80 border-slate-700 hover:text-orange-300 hover:border-orange-500/40',
    composer: 'bg-slate-950/95 border-slate-800',
    attachBtn: 'text-slate-400 hover:text-orange-400 hover:bg-orange-500/10',
    input: 'bg-slate-800/70 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-orange-500/50',
    sendOff: 'bg-slate-800 text-slate-500',
    overlay: 'bg-slate-950/85 backdrop-blur-sm',
    overlayPanel: 'bg-slate-900 border-slate-700',
    cancelBtn: 'bg-slate-800 text-slate-300 hover:bg-slate-700',
    drawer: 'bg-slate-900 border-slate-800',
    drawerText: 'text-white',
    drawerSub: 'text-slate-500',
    drawerItem: 'hover:bg-slate-800 text-slate-200',
    drawerItemActive: 'bg-orange-500/15 text-orange-300',
    drawerNew: 'text-orange-400 hover:bg-orange-500/10',
    captionInput: 'bg-slate-800/70 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-orange-500/50',
  },
} as const;

interface Props {
  onClose?: () => void;
  embedded?: boolean;
  centreId?: string | null;
  bottomInset?: number;
  mode?: 'light' | 'dark';
  onBack?: () => void;
}

const TutorAiChat: React.FC<Props> = ({
  embedded = false,
  centreId: centreIdProp,
  bottomInset = 0,
  mode = 'dark',
  onBack,
}) => {
  const { activeCentreId, activeCentre } = useApp();
  const th = PALETTES[mode];
  const centreId = centreIdProp ?? activeCentreId ?? '';
  const [msgs, setMsgs] = useState<TitoMessage[]>([]);
  const [pending, setPending] = useState<TitoMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [caption, setCaption] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Attachment | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [convos, setConvos] = useState<Convo[]>([]);
  const [convosLoaded, setConvosLoaded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [chipTurn, setChipTurn] = useState(0);
  const [typing, setTyping] = useState<{ tokens: string[]; shown: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadConversations = useCallback(async () => {
    try {
      const q = centreId ? `?centreId=${encodeURIComponent(centreId)}` : '';
      const res: any = await api(`/api/tutor-ai/conversations${q}`);
      setConvos(Array.isArray(res?.conversations) ? res.conversations : []);
    } catch {
      // The sidebar is a nicety; an empty list is fine if it will not load.
    } finally {
      setConvosLoaded(true);
    }
  }, [centreId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const q = centreId ? `?centreId=${encodeURIComponent(centreId)}` : '';
        const res: any = await api(`/api/tutor-ai/history${q}`);
        if (!cancelled) {
          setMsgs(Array.isArray(res?.messages) ? res.messages : []);
          setActiveId(res?.conversationId || null);
        }
      } catch {
        // History is a nicety: a fresh screen is fine if it will not load.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [centreId]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, pending, busy, typing]);

  // Fast typewriter reveal for fresh AI answers: the reply arrives from the
  // server in one piece, then draws in chunk by chunk. Chunks are cut so
  // markdown markers (bold, italics, code) never split mid-marker, and the
  // pace is capped so even a long answer finishes in a few seconds.
  useEffect(() => {
    if (!typing) return;
    const t = setTimeout(() => {
      setTyping((cur) => {
        if (!cur) return null;
        const step = Math.max(2, Math.ceil(cur.tokens.length / 110));
        const next = cur.shown + step;
        return next >= cur.tokens.length ? null : { ...cur, shown: next };
      });
    }, 22);
    return () => clearTimeout(t);
  }, [typing]);

  const send = useCallback(async (rawText: string, img?: Attachment | null) => {
    const text = rawText.trim();
    if ((!text && !img) || busy) return;
    setError('');
    setPending({ role: 'user', text: text || '(photo)', img: img?.thumb || null, at: Date.now() });
    setBusy(true);
    setInput('');
    try {
      const res: any = await api('/api/tutor-ai/chat', {
        method: 'POST',
        body: {
          ...(centreId ? { centreId } : {}),
          ...(activeId ? { conversationId: activeId } : {}),
          text,
          ...(img ? { image: img.full, imageThumb: img.thumb } : {}),
        },
      });
      setMsgs(Array.isArray(res?.messages) ? res.messages : []);
      if (res?.conversationId) setActiveId(res.conversationId);
      const freshAi = (Array.isArray(res?.messages) ? (res.messages as TitoMessage[]) : [])
        .filter((m) => m.role === 'ai')
        .pop();
      if (freshAi?.text) setTyping({ tokens: tokenizeForTyping(freshAi.text), shown: 0 });
      loadConversations();
      setChipTurn((t) => t + 1);
    } catch (e: any) {
      setError(e?.message || 'Tutor AI could not answer just now. Please try again.');
    } finally {
      setPending(null);
      setBusy(false);
    }
  }, [busy, centreId, activeId, loadConversations]);

  // A brand-new chat: nothing is stored until the first message is sent.
  const startNewChat = useCallback(() => {
    setDrawerOpen(false);
    setTyping(null);
    setMsgs([]);
    setActiveId(null);
    setError('');
    setChipTurn((t) => t + 1);
    inputRef.current?.focus();
  }, []);

  const openConversation = useCallback(
    async (id: string) => {
      if (busy) return;
      setDrawerOpen(false);
      setTyping(null);
      try {
        const q = `${centreId ? `centreId=${encodeURIComponent(centreId)}&` : ''}conversationId=${encodeURIComponent(id)}`;
        const res: any = await api(`/api/tutor-ai/history?${q}`);
        setMsgs(Array.isArray(res?.messages) ? res.messages : []);
        setActiveId(id);
        setError('');
        setChipTurn((t) => t + 1);
      } catch {
        setError('That chat could not be opened. Please try again.');
      }
    },
    [busy, centreId]
  );

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const att = await compressImage(file);
    if (!att) {
      setError('That photo could not be attached. Please try another one.');
      return;
    }
    setPreview(att);
  };

  const renderBubble = (m: TitoMessage, optimistic = false, key?: React.Key, typewriter?: string | null) => (
    <div key={key} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      {m.role === 'ai' && (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center shrink-0 mt-1 mr-2 shadow">
          <Sparkles className="w-3.5 h-3.5 text-white" />
        </div>
      )}
      <div
        className={`max-w-[85%] px-4 py-2.5 ${
          m.role === 'user'
            ? 'bg-gradient-to-br from-orange-500 to-orange-700 text-white rounded-2xl rounded-br-md'
            : `${th.aiBubble} rounded-2xl rounded-tl-md`
        }`}
      >
        {m.img && (
          <img
            src={m.img}
            alt="Attached work"
            className={`rounded-lg max-w-[180px] w-auto mb-1.5 border ${th.imgBorder}`}
          />
        )}
        {m.role === 'ai' ? (
          <div className="text-[15px] leading-relaxed">{renderRichText(typewriter ?? m.text)}</div>
        ) : (
          <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words font-medium text-white">{m.text}</p>
        )}
        <p className={`text-[11px] mt-1 font-bold ${m.role === 'user' ? 'text-orange-200/80' : th.aiTime}`}>
          {clock(m.at)}
        </p>
      </div>
    </div>
  );

  const rendered: React.ReactNode[] = [];
  let lastDay = '';
  const all: { m: TitoMessage; optimistic?: boolean }[] = [
    ...msgs.map((m) => ({ m })),
    ...(pending ? [{ m: pending, optimistic: true }] : []),
  ];
  all.forEach(({ m, optimistic }, i) => {
    const dk = dayKey(m.at);
    if (dk !== lastDay) {
      lastDay = dk;
      rendered.push(
        <div key={`d${i}`} className="flex items-center justify-center py-1">
          <span className={`text-[10px] font-black uppercase tracking-widest rounded-full px-3 py-1 ${th.dayChip}`}>
            {dayLabel(m.at)}
          </span>
        </div>
      );
    }
    const typingText =
      typing && msgs.length > 0 && msgs[msgs.length - 1].role === 'ai' && i === all.length - 1
        ? typing.tokens.slice(0, typing.shown).join('')
        : null;
    rendered.push(renderBubble(m, optimistic, `m${i}`, typingText));
  });

  // One suggestion at a time, driven by the last thing the AI said, so the
  // chip follows the conversation instead of sitting there forever.
  const chip = (() => {
    const lastAi = [...msgs].reverse().find((m) => m.role === 'ai');
    if (!lastAi) {
      const starters = [
        { label: 'Explain a topic', fill: 'Explain ' },
        { label: 'Give me practice questions', fill: 'Give me practice questions on ' },
        { label: 'Give me study tips', fill: 'Give me study tips for ' },
        { label: 'Check my work', fill: 'Check my work: ' },
      ];
      return starters[chipTurn % starters.length];
    }
    const heading = /^#{1,6}\s+(.{3,48})$/m.exec(lastAi.text);
    const bold = /\*\*([^*]{3,48})\*\*/.exec(lastAi.text);
    let topic = ((heading ? heading[1] : '') || (bold ? bold[1] : '')).replace(/[:.,!?]+$/, '').trim();
    if (!topic) {
      const first = lastAi.text.replace(/[#*`>]/g, '').split('\n').find((l) => l.trim().length > 8) || 'that';
      topic = first.trim().split(/\s+/).slice(0, 5).join(' ');
    }
    const variants = [
      { label: `Tell me more about ${topic}`, fill: `Tell me more about ${topic}` },
      { label: 'Give me an example', fill: `Give me a simple example of ${topic}` },
      { label: `Quiz me on ${topic}`, fill: `Give me 5 practice questions on ${topic}` },
      { label: 'Explain it more simply', fill: `Explain ${topic} again in the simplest way possible` },
    ];
    return variants[chipTurn % variants.length];
  })();

  const shell = embedded
    ? `h-[75vh] max-h-[760px] min-h-[480px] rounded-2xl border ${th.embedded} overflow-hidden`
    : 'h-full';

  return (
    <div className={`flex flex-col relative overflow-hidden ${th.shell} ${shell}`}>
      {/* Chat history sidebar (collapsible) */}
      {drawerOpen && (
        <div className="absolute inset-0 z-40 flex" role="dialog" aria-label="Chat history">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <div
            className={`relative w-72 max-w-[80%] h-full border-r flex flex-col animate-in slide-in-from-left duration-200 ${th.drawer}`}
          >
            <div className={`shrink-0 px-4 pt-4 pb-3 flex items-center justify-between border-b ${th.drawer}`}>
              <p className={`text-sm font-black ${th.drawerText}`}>Your chats</p>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close chat history"
                className={`p-1.5 rounded-full transition-all cursor-pointer ${th.ghostBtn}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="shrink-0 px-3 pt-3">
              <button
                type="button"
                onClick={startNewChat}
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-[13px] font-bold transition-all cursor-pointer ${th.drawerNew}`}
              >
                <MessageSquarePlus className="w-4 h-4" />
                New chat
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
              {convosLoaded && convos.length === 0 && (
                <p className={`text-[12px] font-medium px-3 py-4 leading-snug ${th.drawerSub}`}>
                  Your chats will appear here once you start talking to Tutor AI.
                </p>
              )}
              {convos.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openConversation(c.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-all cursor-pointer ${
                    c.id === activeId ? th.drawerItemActive : th.drawerItem
                  }`}
                >
                  <p className="text-[13px] font-bold truncate">{c.title || 'New chat'}</p>
                  <p className={`text-[10px] font-semibold mt-0.5 ${th.drawerSub}`}>{dayLabel(c.updatedAt)}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Pinned header */}
      <div className={`shrink-0 backdrop-blur-md border-b px-4 py-3 flex items-center gap-3 ${th.header}`}>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className={`-ml-1 p-2 rounded-full transition-all cursor-pointer ${th.backBtn}`}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center shrink-0 shadow">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-[17px] font-black ${th.headerTitle}`}>Tutor AI</p>
          <p className={`text-[13px] font-semibold truncate ${th.headerSub}`}>
            {activeCentre?.name || 'Your study assistant'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!convosLoaded) loadConversations();
            setDrawerOpen((v) => !v);
          }}
          aria-label="Chat history"
          className={`p-2 rounded-full transition-all cursor-pointer ${th.ghostBtn}`}
        >
          <PanelLeft className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {all.length === 0 && loaded && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center shrink-0 mt-1 mr-2 shadow">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl rounded-tl-md ${th.aiBubble}`}>
              <p className="text-[15px] leading-relaxed font-medium">
                Hi! I'm Tutor AI, your study assistant. Ask me anything about your schoolwork, or send a
                photo of a question or your work and I'll help you with it.
              </p>
              <p className={`text-[10px] font-bold mt-1 ${th.aiTime}`}>Just now</p>
            </div>
          </div>
        )}
        {rendered}
        {busy && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center shrink-0 mt-1 mr-2 shadow">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <div className={`px-4 py-3 rounded-2xl rounded-tl-md flex items-center gap-1.5 ${th.aiBubble}`}>
              {[0, 150, 300].map((d) => (
                <span
                  key={d}
                  className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-bounce"
                  style={{ animationDelay: `${d}ms` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className={`shrink-0 mx-4 mb-2 flex items-start gap-2 border rounded-2xl px-3 py-2 ${th.banner}`}>
          <TriangleAlert className={`w-4 h-4 shrink-0 mt-0.5 ${th.bannerIcon}`} />
          <p className={`text-[12px] font-medium flex-1 leading-snug ${th.bannerText}`}>{error}</p>
          <button type="button" onClick={() => setError('')} aria-label="Dismiss" className={`cursor-pointer ${th.bannerDismiss}`}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* One dynamic suggestion above the composer. It only sits there while
          nothing is being asked: hidden the moment the composer has text and
          while the AI is answering or typing out its reply, then it slides
          back in with a small pop once the response lands. */}
      {!(busy || pending || typing || input.trim().length > 0) && (
        <div className="shrink-0 flex px-4 pb-2">
          <button
            key={chip.label}
            type="button"
            onClick={() => {
              setInput(chip.fill);
              inputRef.current?.focus();
            }}
            className={`animate-chip-in shrink-0 max-w-full truncate text-[12px] font-bold border rounded-full px-3 py-1.5 transition-all cursor-pointer ${th.chip}`}
          >
            {chip.label.length > 44 ? `${chip.label.slice(0, 41)}…` : chip.label}
          </button>
        </div>
      )}

      {/* Pinned composer */}
      <div className={`shrink-0 backdrop-blur-md border-t px-3 pt-2 ${th.composer}`} style={bottomInset ? { paddingBottom: bottomInset } : { paddingBottom: 10 }}>
        <div className="flex items-end gap-2">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onPickFile} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Attach a photo"
            className={`p-2.5 rounded-full transition-all cursor-pointer ${th.attachBtn}`}
          >
            <ImagePlus className="w-5 h-5" />
          </button>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Ask Tutor AI anything…"
            aria-label="Message Tutor AI"
            className={`flex-1 border rounded-full px-4 py-3 text-[15px] font-medium outline-none min-w-0 ${th.input}`}
          />
          <button
            type="button"
            onClick={() => send(input)}
            aria-label="Send"
            className={`p-2.5 rounded-full transition-all cursor-pointer ${
              input.trim()
                ? 'bg-gradient-to-br from-orange-500 to-orange-700 text-white shadow-lg shadow-orange-900/40'
                : th.sendOff
            }`}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Photo preview sheet: shows the photo without its filename, with a
          field for a question to send along with the photo. */}
      {preview && (
        <div className={`absolute inset-0 z-50 flex items-center justify-center p-5 ${th.overlay}`}>
          <div className={`border rounded-3xl p-4 max-w-sm w-full ${th.overlayPanel}`}>
            <img src={preview.thumb || preview.full} alt="Photo to send" className="rounded-2xl max-h-[40vh] w-auto mx-auto mb-3" />
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const att = preview;
                  const text = caption.trim() || input.trim();
                  setPreview(null);
                  setCaption('');
                  send(text, att);
                }
              }}
              placeholder="Add a question about this photo (optional)"
              aria-label="Question about the photo"
              className={`w-full border rounded-full px-4 py-3 text-[15px] font-medium outline-none mb-3 ${th.captionInput}`}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setPreview(null);
                  setCaption('');
                }}
                className={`flex-1 py-3 rounded-full text-[14px] font-black transition-all cursor-pointer ${th.cancelBtn}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const att = preview;
                  const text = caption.trim() || input.trim();
                  setPreview(null);
                  setCaption('');
                  send(text, att);
                }}
                className="flex-1 py-3 rounded-full bg-gradient-to-br from-orange-500 to-orange-700 text-white text-[14px] font-black hover:brightness-110 transition-all cursor-pointer"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TutorAiChat;
