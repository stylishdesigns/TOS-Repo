import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, Send, Plus, ImagePlus, X, TriangleAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { api } from '../tos/tosShared';

// ============================================================================
// Tutor AI chat (T1): the conversation surface shared by the student, tutor
// and centre-admin portals. Dark slate with the TOS orange accent, matching
// the approved mockup. The server does all the work (see
// src/server/tutorAiRoutes.ts); this screen only sends, renders and keeps
// state honest with the server's stored conversation.
//
// Entry points:
// - Students: the Tutor AI wing in the chat fan (StudentPortal). The chat orb
//   is the way back to the fan, so there is no back button here, exactly like
//   the Status and Chats sub-tab pages.
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

const CHIPS: { label: string; fill: string }[] = [
  { label: 'Explain a topic', fill: 'Explain ' },
  { label: 'Practice questions', fill: 'Give me practice questions on ' },
  { label: 'Study tips', fill: 'Give me study tips for ' },
  { label: 'Check my work', fill: 'Check my work: ' },
];

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

interface Props {
  onClose?: () => void;
  embedded?: boolean;
  centreId?: string | null;
  bottomInset?: number;
}

const TutorAiChat: React.FC<Props> = ({ embedded = false, centreId: centreIdProp, bottomInset = 0 }) => {
  const { activeCentreId, activeCentre } = useApp();
  const centreId = centreIdProp ?? activeCentreId ?? '';
  const [msgs, setMsgs] = useState<TitoMessage[]>([]);
  const [pending, setPending] = useState<TitoMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Attachment | null>(null);
  const [loaded, setLoaded] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const q = centreId ? `?centreId=${encodeURIComponent(centreId)}` : '';
        const res: any = await api(`/api/tutor-ai/history${q}`);
        if (!cancelled) setMsgs(Array.isArray(res?.messages) ? res.messages : []);
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
  }, [msgs, pending, busy]);

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
          text,
          ...(img ? { image: img.full, imageThumb: img.thumb } : {}),
        },
      });
      setMsgs(Array.isArray(res?.messages) ? res.messages : []);
    } catch (e: any) {
      setError(e?.message || 'Tutor AI could not answer just now. Please try again.');
    } finally {
      setPending(null);
      setBusy(false);
    }
  }, [busy, centreId]);

  const startNewChat = useCallback(async () => {
    try {
      const q = centreId ? `?centreId=${encodeURIComponent(centreId)}` : '';
      await api('/api/tutor-ai/clear', { method: 'POST', body: centreId ? { centreId } : {} });
    } catch {
      // Clearing is best-effort; the local view resets regardless.
    }
    setMsgs([]);
    setError('');
    inputRef.current?.focus();
  }, [centreId]);

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

  const renderBubble = (m: TitoMessage, optimistic = false, key?: React.Key) => (
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
            : 'bg-slate-800/90 text-slate-100 rounded-2xl rounded-tl-md'
        }`}
      >
        {m.img && (
          <img
            src={m.img}
            alt="Attached work"
            className="rounded-lg max-w-[180px] w-auto mb-1.5 border border-slate-700/60"
          />
        )}
        <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words font-medium">{m.text}</p>
        <p className={`text-[10px] mt-1 font-bold ${m.role === 'user' ? 'text-orange-200/80' : 'text-slate-500'}`}>
          {optimistic ? 'sending…' : clock(m.at)}
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
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-800/60 rounded-full px-3 py-1">
            {dayLabel(m.at)}
          </span>
        </div>
      );
    }
    rendered.push(renderBubble(m, optimistic, `m${i}`));
  });

  const shell = embedded
    ? 'h-[75vh] max-h-[760px] min-h-[480px] rounded-2xl border border-slate-800 overflow-hidden shadow-inner'
    : 'h-full';

  return (
    <div className={`flex flex-col bg-slate-950 text-white relative ${shell}`}>
      {/* Pinned header */}
      <div className="shrink-0 bg-slate-950/95 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center shrink-0 shadow">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-white flex items-center gap-2">
            Tutor AI
            <span className="text-[9px] font-black uppercase tracking-widest text-orange-300 bg-orange-500/15 border border-orange-500/30 rounded-full px-2 py-0.5">
              Beta
            </span>
          </p>
          <p className="text-[11px] font-semibold text-slate-400 truncate">
            {activeCentre?.name || 'Your study assistant'}
          </p>
        </div>
        <button
          type="button"
          onClick={startNewChat}
          aria-label="Start a new chat"
          className="p-2 rounded-full text-slate-400 hover:text-orange-400 hover:bg-orange-500/10 transition-all cursor-pointer"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {all.length === 0 && loaded && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center shrink-0 mt-1 mr-2 shadow">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="max-w-[85%] px-4 py-2.5 bg-slate-800/90 text-slate-100 rounded-2xl rounded-tl-md">
              <p className="text-[13px] leading-relaxed font-medium">
                Hi! I'm Tutor AI, your study assistant. Ask me anything about your schoolwork, or send a
                photo of a question or your work and I'll help you with it.
              </p>
              <p className="text-[10px] text-slate-500 font-bold mt-1">Just now</p>
            </div>
          </div>
        )}
        {rendered}
        {busy && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center shrink-0 mt-1 mr-2 shadow">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="px-4 py-3 bg-slate-800/90 rounded-2xl rounded-tl-md flex items-center gap-1.5">
              {[0, 150, 300].map((d) => (
                <span
                  key={d}
                  className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce"
                  style={{ animationDelay: `${d}ms` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="shrink-0 mx-4 mb-2 flex items-start gap-2 bg-rose-500/10 border border-rose-500/30 rounded-2xl px-3 py-2">
          <TriangleAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <p className="text-[12px] text-rose-200 font-medium flex-1 leading-snug">{error}</p>
          <button type="button" onClick={() => setError('')} aria-label="Dismiss" className="text-rose-400 hover:text-rose-300 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Quick chips */}
      <div className="shrink-0 flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CHIPS.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => {
              setInput(c.fill);
              inputRef.current?.focus();
            }}
            className="shrink-0 text-[11px] font-bold text-slate-300 bg-slate-800/80 border border-slate-700 rounded-full px-3 py-1.5 hover:text-orange-300 hover:border-orange-500/40 transition-all cursor-pointer"
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Pinned composer */}
      <div className="shrink-0 bg-slate-950/95 backdrop-blur-md border-t border-slate-800 px-3 pt-2" style={bottomInset ? { paddingBottom: bottomInset } : { paddingBottom: 10 }}>
        <div className="flex items-end gap-2">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onPickFile} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Attach a photo"
            className="p-2.5 rounded-full text-slate-400 hover:text-orange-400 hover:bg-orange-500/10 transition-all cursor-pointer"
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
            className="flex-1 bg-slate-800/70 border border-slate-700 rounded-full px-4 py-2.5 text-[13px] text-slate-100 placeholder:text-slate-500 font-medium outline-none focus:border-orange-500/50 min-w-0"
          />
          <button
            type="button"
            onClick={() => send(input)}
            aria-label="Send"
            className={`p-2.5 rounded-full transition-all cursor-pointer ${
              input.trim()
                ? 'bg-gradient-to-br from-orange-500 to-orange-700 text-white shadow-lg shadow-orange-900/40'
                : 'bg-slate-800 text-slate-500'
            }`}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Photo preview sheet: shows the photo without its filename */}
      {preview && (
        <div className="absolute inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-5">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-4 max-w-sm w-full">
            <img src={preview.thumb || preview.full} alt="Photo to send" className="rounded-2xl max-h-[50vh] w-auto mx-auto mb-4" />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="flex-1 py-2.5 rounded-full bg-slate-800 text-slate-300 text-[13px] font-black hover:bg-slate-700 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const att = preview;
                  setPreview(null);
                  send(input, att);
                }}
                className="flex-1 py-2.5 rounded-full bg-gradient-to-br from-orange-500 to-orange-700 text-white text-[13px] font-black hover:brightness-110 transition-all cursor-pointer"
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
