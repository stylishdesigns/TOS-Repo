import React, { useEffect, useState } from 'react';
import { Plus, X, Image as ImageIcon, Film, Music } from 'lucide-react';
import { Student } from '../../../types';
import { api } from '../../tos/tosShared';
import { loadLastGood, saveLastGood } from '../../../lib/lastGood';

// ============================================================================
// Status, piece S1: the read-only Status screen.
//
// Matches the Status prototype: "Updates from your centre", the My status row,
// RECENT UPDATES and VIEWED. Every number here is server data: the screen
// renders what GET /api/student/chat/status/overview returned and invents
// nothing. The instant-open last-good copy opens the screen on old data while
// a fresh sync runs behind it, with no loading screen. Text posting (S2), the
// viewer (S3) and media statuses (S4) are built on top of it.
// ============================================================================

interface StatusEntry {
  uid: string;
  name: string;
  username: string;
  statusId: string;
  kind: string;
  at: number;
  expiresAt: number;
  text: string;
  bg?: string;
  photoUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  durationSeconds?: number;
}

interface StatusReply {
  uid: string;
  name: string;
  username: string;
  text: string;
  at: number;
  replyId?: string;
}

interface ViewerStatus {
  statusId: string;
  kind: string;
  at: number;
  expiresAt: number;
  text: string;
  bg?: string;
  photoUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  durationSeconds?: number;
  views?: number;
  replies?: StatusReply[];
}

interface StatusOverview {
  ok: boolean;
  enabled: boolean;
  settings?: {
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
  me?: {
    name: string;
    username: string;
    latest: {
      statusId: string; kind: string; at: number; expiresAt: number; text: string;
      photoUrl?: string; videoUrl?: string; audioUrl?: string; durationSeconds?: number;
    } | null;
  };
  recent?: StatusEntry[];
  viewed?: StatusEntry[];
}

function initials(name: string): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  const made = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('');
  return made || '?';
}

/** Timestamp labels in the prototype's voice: "12 minutes ago" for fresh
 *  ones, "Today, 8:40 AM" earlier the same day, then "Yesterday" and a short
 *  date. Computed from the status's own stored time, never invented. */
function statusTimeLabel(at: number, now = Date.now()): string {
  if (!Number.isFinite(at) || at <= 0) return '';
  const d = new Date(at);
  const age = now - at;
  if (age < 60 * 60 * 1000) {
    const m = Math.max(1, Math.floor(age / 60000));
    return `${m} minute${m === 1 ? '' : 's'} ago`;
  }
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(new Date(now)) - startOfDay(d)) / 86400000);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (days <= 0) return `Today, ${time}`;
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Escape closes any status overlay, matching the fan menu's Escape behaviour. */
function useEscape(onEscape: () => void) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onEscape]);
}

/** The composer's background palette. This is screen furniture, not data:
 *  the update itself stores whichever colour was picked, and the settings
 *  (not this list) decide every limit. */
const STATUS_BG = [
  '#0F172A', '#7C3AED', '#2563EB', '#059669',
  '#CA8A04', '#DB2777', '#EA580C', '#0F766E',
];

function bgLuminance(hex: string): number {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

const TextComposer: React.FC<{
  settings: NonNullable<StatusOverview['settings']>;
  onClose: () => void;
  onPosted: (status: Record<string, any>) => void;
}> = ({ settings, onClose, onPosted }) => {
  useEscape(onClose);
  const [bg, setBg] = useState(STATUS_BG[0]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const share = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setErr('');
    try {
      const d = await api('/api/student/chat/status', { method: 'POST', body: { kind: 'text', text: text.trim(), bg } });
      if (d && d.ok && d.status) onPosted(d.status);
      else throw new Error(String(d?.error || 'The update could not be shared. Try again.'));
    } catch (e: any) {
      setErr(String(e?.message || 'The update could not be shared. Try again.'));
      setBusy(false);
    }
  };

  const dark = bgLuminance(bg) < 0.5;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: bg }}
      role="dialog"
      aria-modal="true"
      aria-label="Add a text status"
    >
      <div className="flex items-center justify-between p-4">
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-95 transition"
          style={{ color: dark ? '#FFFFFF' : '#0F172A', backgroundColor: dark ? 'rgba(255,255,255,0.15)' : 'rgba(15,23,42,0.08)' }}
          aria-label="Discard update"
        >
          <X className="w-4 h-4" />
        </button>
        <button
          onClick={share}
          disabled={!text.trim() || busy}
          className="px-5 h-9 rounded-xl font-black text-sm active:scale-95 transition disabled:opacity-40"
          style={{ color: dark ? '#0F172A' : '#FFFFFF', backgroundColor: dark ? '#FFFFFF' : 'rgba(255,255,255,0.25)' }}
        >
          {busy ? 'Sharing...' : 'Share'}
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center px-8">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, settings.maxTextChars))}
          placeholder="Type an update"
          rows={4}
          className="w-full bg-transparent text-center text-2xl font-black tracking-tight resize-none outline-none placeholder:opacity-40"
          style={{ color: dark ? '#FFFFFF' : '#0F172A' }}
        />
      </div>
      {err && (
        <p className="px-6 pb-2 text-xs font-bold text-center" style={{ color: dark ? '#FFFFFF' : '#B91C1C' }}>{err}</p>
      )}
      <div className="p-5 pb-8 space-y-3">
        <div className="flex items-center justify-center gap-2.5">
          {STATUS_BG.map((c) => (
            <button
              key={c}
              onClick={() => setBg(c)}
              className={`w-8 h-8 rounded-full transition ${bg === c ? 'ring-2 ring-white ring-offset-2 ring-offset-transparent' : ''}`}
              style={{ backgroundColor: c, outline: bg === c ? `2px solid ${dark ? '#FFFFFF' : '#0F172A'}` : 'none', outlineOffset: '2px' }}
              aria-label={`Background ${c}`}
              aria-pressed={bg === c}
            />
          ))}
        </div>
        <p className="text-center text-[11px] font-bold" style={{ color: dark ? 'rgba(255,255,255,0.7)' : 'rgba(15,23,42,0.5)' }}>
          {text.length}/{settings.maxTextChars}
        </p>
      </div>
    </div>
  );
};

// ============================================================================
// Status, piece S4: photo, video and music updates.
//
// One composer for all three media kinds. The stored settings decide every
// limit and the screen only reads them: a photo is downscaled toward the
// stored photo cap, a video is refused when it runs past the stored seconds
// or megabytes, a music file past the stored megabytes. Sharing uploads the
// file through the server's own upload route and then posts the status, so
// the server sees and checks both steps.
// ============================================================================

const MediaComposer: React.FC<{
  kind: 'photo' | 'video' | 'music';
  file: File;
  settings: NonNullable<StatusOverview['settings']>;
  onClose: () => void;
  onPosted: (status: Record<string, any>) => void;
}> = ({ kind, file, settings, onClose, onPosted }) => {
  useEscape(onClose);
  const [preview, setPreview] = useState('');
  const [ready, setReady] = useState(false);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [fatal, setFatal] = useState('');
  const durationRef = React.useRef(0);

  useEffect(() => {
    if (kind === 'photo') {
      // Same downscale the chat composer uses: long edge 1400px, then a
      // quality loop toward the stored photo cap in KB.
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const max = 1400;
          const scale = Math.min(1, max / Math.max(img.width || 1, img.height || 1));
          const w = Math.max(1, Math.round((img.width || max) * scale));
          const h = Math.max(1, Math.round((img.height || max) * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) { setFatal('That photo could not be read. Try another.'); return; }
          ctx.drawImage(img, 0, 0, w, h);
          const capBytes = Math.max(10, settings.photoMaxKb) * 1024;
          let q = 0.82;
          let out = canvas.toDataURL('image/jpeg', q);
          while (out.length * 0.75 > capBytes && q > 0.35) { q -= 0.15; out = canvas.toDataURL('image/jpeg', q); }
          if (out.length * 0.75 > capBytes) {
            setFatal(`Photos can be up to ${settings.photoMaxKb} KB. Choose a smaller one.`);
            return;
          }
          setPreview(out);
          setReady(true);
        };
        img.onerror = () => setFatal('That photo could not be read. Try another.');
        img.src = String(reader.result || '');
      };
      reader.onerror = () => setFatal('That photo could not be read. Try another.');
      reader.readAsDataURL(file);
      return;
    }
    if (kind === 'video') {
      if (file.size > settings.maxVideoMb * 1024 * 1024) {
        setFatal(`Videos can be up to ${settings.maxVideoMb} MB.`);
        return;
      }
      const url = URL.createObjectURL(file);
      const probe = document.createElement('video');
      probe.preload = 'metadata';
      probe.onloadedmetadata = () => {
        const dur = Math.round(probe.duration || 0);
        if (dur <= 0) { URL.revokeObjectURL(url); setFatal('That video could not be read. Try another.'); return; }
        if (dur > settings.maxVideoSeconds) {
          URL.revokeObjectURL(url);
          setFatal(`Videos can be up to ${settings.maxVideoSeconds} seconds. This one is ${dur}.`);
          return;
        }
        durationRef.current = dur;
        setPreview(url);
        setReady(true);
      };
      probe.onerror = () => { URL.revokeObjectURL(url); setFatal('That video could not be read. Try another.'); };
      probe.src = url;
      return () => {
        URL.revokeObjectURL(url);
      };
    }
    // Music: an audio file on a colour background.
    if (file.size > settings.maxAudioMb * 1024 * 1024) {
      setFatal(`Music files can be up to ${settings.maxAudioMb} MB.`);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    setReady(true);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [kind, file, settings]);

  const share = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setErr('');
    try {
      let dataUrl = '';
      if (kind !== 'photo') {
        dataUrl = await new Promise<string>((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result || ''));
          fr.onerror = () => reject(new Error('That file could not be read. Try another.'));
          fr.readAsDataURL(file);
        });
      }
      const up = await api('/api/student/chat/status/upload', {
        method: 'POST',
        body: {
          kind,
          dataUrl: kind === 'photo' ? preview : dataUrl,
          durationSeconds: kind === 'video' ? durationRef.current : undefined,
        },
      });
      if (!(up && up.ok && up.url)) {
        throw new Error(String(up?.error || 'The upload could not be completed. Try again.'));
      }
      const post = await api('/api/student/chat/status', {
        method: 'POST',
        body: {
          kind,
          url: up.url,
          text: caption.trim() || undefined,
          durationSeconds: kind === 'video' ? durationRef.current : undefined,
          bg: kind === 'music' ? '#7C3AED' : undefined,
        },
      });
      if (post && post.ok && post.status) onPosted(post.status);
      else throw new Error(String(post?.error || 'The update could not be shared. Try again.'));
    } catch (e: any) {
      const msg = String(e?.message || '');
      setErr(
        msg.startsWith('Failed to fetch')
          ? 'The upload did not go through. If the file is large, try a smaller one.'
          : msg || 'The update could not be shared. Try again.'
      );
      setBusy(false);
    }
  };

  const bg = kind === 'music' ? '#7C3AED' : '#0F172A';

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: bg }}
      role="dialog"
      aria-modal="true"
      aria-label={kind === 'photo' ? 'Add a photo status' : kind === 'video' ? 'Add a video status' : 'Add a music status'}
    >
      <div className="flex items-center justify-between p-4">
        <button
          onClick={onClose}
          disabled={busy}
          className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-95 transition disabled:opacity-40"
          style={{ color: '#FFFFFF', backgroundColor: 'rgba(255,255,255,0.15)' }}
          aria-label="Discard update"
        >
          <X className="w-4 h-4" />
        </button>
        <button
          onClick={share}
          disabled={!ready || busy}
          className="px-5 h-9 rounded-xl font-black text-sm active:scale-95 transition disabled:opacity-40"
          style={{ color: '#0F172A', backgroundColor: '#FFFFFF' }}
        >
          {busy ? 'Sharing...' : 'Share'}
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center px-6 min-h-0">
        {fatal ? (
          <div className="text-center space-y-3">
            <p className="text-sm font-bold" style={{ color: '#FFFFFF' }}>{fatal}</p>
            <button
              onClick={onClose}
              className="px-4 h-9 rounded-xl font-black text-sm active:scale-95 transition"
              style={{ color: '#0F172A', backgroundColor: '#FFFFFF' }}
            >
              Back
            </button>
          </div>
        ) : kind === 'photo' && preview ? (
          <img src={preview} alt="Status preview" className="max-h-full max-w-full rounded-2xl object-contain" />
        ) : kind === 'video' && preview ? (
          <video src={preview} controls playsInline className="max-h-full max-w-full rounded-2xl" />
        ) : kind === 'music' ? (
          <div className="w-full max-w-sm rounded-3xl p-6 space-y-4" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>
            <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
              <Music className="w-8 h-8 text-white" />
            </div>
            <p className="text-sm font-black text-white text-center truncate">{file.name}</p>
            {preview && <audio src={preview} controls className="w-full" />}
          </div>
        ) : (
          <p className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.7)' }}>Preparing...</p>
        )}
      </div>
      {err && (
        <p className="px-6 pb-2 text-xs font-bold text-center" style={{ color: '#FCA5A5' }}>{err}</p>
      )}
      <div className="p-5 pb-8">
        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value.slice(0, settings.maxTextChars))}
          placeholder="Add a caption (optional)"
          className="w-full h-11 rounded-full px-4 text-sm font-medium outline-none"
          style={{ color: '#FFFFFF', backgroundColor: 'rgba(255,255,255,0.15)' }}
        />
        <p className="text-center text-[11px] font-bold mt-2" style={{ color: 'rgba(255,255,255,0.6)' }}>
          {caption.length}/{settings.maxTextChars}
        </p>
      </div>
    </div>
  );
};

// ============================================================================
// Status, piece S3: the full-screen status viewer.
//
// One person's statuses, one at a time, with tap-through navigation and the
// stored settings deciding what the viewer may do: replies appear only when
// allowReplies is on, and every view a non-owner makes is marked seen on the
// server. The owner's own viewer instead shows who has seen it and the
// replies, since replying to yourself makes no sense.
// ============================================================================

const StatusViewer: React.FC<{
  person: { uid: string; name: string; username: string };
  mine: boolean;
  settings: NonNullable<StatusOverview['settings']>;
  onClose: () => void;
  onSeenUpdate: (ownerUid: string, statusId: string) => void;
}> = ({ person, mine, settings, onClose, onSeenUpdate }) => {
  useEscape(onClose);
  const [statuses, setStatuses] = useState<ViewerStatus[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [err, setErr] = useState('');
  const [replyText, setReplyText] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyNote, setReplyNote] = useState('');
  const seenFired = React.useRef<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    api(`/api/student/chat/status/user/${encodeURIComponent(person.uid)}`)
      .then((d: any) => {
        if (!alive) return;
        if (d && d.ok) setStatuses(Array.isArray(d.statuses) ? d.statuses : []);
        else setErr(String(d?.error || 'The status could not load. Try again.'));
      })
      .catch(() => {
        if (alive) setErr('The status could not load. Try again.');
      });
    return () => {
      alive = false;
    };
  }, [person.uid]);

  const current: ViewerStatus | null = statuses && idx < statuses.length ? statuses[idx] : null;

  // Marking seen: fire once per status the moment it is on screen. Errors are
  // ignored here on purpose; the next overview refresh settles the row's
  // place, and a missed ping only means the row stays RECENT.
  useEffect(() => {
    if (!current || mine) return;
    if (seenFired.current.has(current.statusId)) return;
    seenFired.current.add(current.statusId);
    onSeenUpdate(person.uid, current.statusId);
    api('/api/student/chat/status/seen', {
      method: 'POST',
      body: { ownerUid: person.uid, statusId: current.statusId },
    }).catch(() => undefined);
  }, [current, mine, person.uid, onSeenUpdate]);

  const sendReply = async () => {
    if (!replyText.trim() || replyBusy || !current) return;
    setReplyBusy(true);
    setErr('');
    try {
      const d = await api('/api/student/chat/status/reply', {
        method: 'POST',
        body: { ownerUid: person.uid, statusId: current.statusId, text: replyText.trim() },
      });
      if (d && d.ok && d.reply) {
        setStatuses((prev) => {
          if (!prev) return prev;
          const next = [...prev];
          next[idx] = { ...next[idx], replies: [d.reply, ...(next[idx].replies || [])] };
          return next;
        });
        setReplyText('');
        setReplyNote('Reply sent');
        window.setTimeout(() => setReplyNote(''), 2500);
      } else {
        throw new Error(String(d?.error || 'The reply could not be sent. Try again.'));
      }
    } catch (e: any) {
      setErr(String(e?.message || 'The reply could not be sent. Try again.'));
    } finally {
      setReplyBusy(false);
    }
  };

  const bg =
    current && (current.kind === 'text' || current.kind === 'music') && /^#[0-9a-fA-F]{6}$/.test(String(current.bg || ''))
      ? String(current.bg)
      : '#0F172A';
  const dark = bgLuminance(bg) < 0.5;
  const total = statuses?.length || 0;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: bg }}
      role="dialog"
      aria-modal="true"
      aria-label={`${person.name || person.username}'s status`}
    >
      {/* Top bar: close, who, when, and the tap-through dots. */}
      <div className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-black shrink-0"
              style={{ color: dark ? '#FFFFFF' : '#0F172A', backgroundColor: dark ? 'rgba(255,255,255,0.2)' : 'rgba(15,23,42,0.08)' }}
            >
              {initials(person.name || person.username)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black truncate" style={{ color: dark ? '#FFFFFF' : '#0F172A' }}>
                {mine ? 'My status' : person.name || (person.username ? `@${person.username}` : 'Student')}
              </p>
              <p className="text-[11px] font-medium truncate" style={{ color: dark ? 'rgba(255,255,255,0.7)' : 'rgba(15,23,42,0.55)' }}>
                {current ? statusTimeLabel(current.at) : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-95 transition shrink-0"
            style={{ color: dark ? '#FFFFFF' : '#0F172A', backgroundColor: dark ? 'rgba(255,255,255,0.15)' : 'rgba(15,23,42,0.08)' }}
            aria-label="Close status"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {total > 1 && (
          <div className="flex items-center justify-center gap-1.5">
            {statuses!.map((st, i) => (
              <span
                key={st.statusId}
                className="h-1 rounded-full transition-all"
                style={{
                  width: i === idx ? 18 : 8,
                  backgroundColor: dark ? 'rgba(255,255,255,0.7)' : 'rgba(15,23,42,0.4)',
                  opacity: i === idx ? 1 : 0.35,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* The update itself, with tap-through when there is more than one. */}
      <div className="flex-1 flex items-center justify-center px-8 relative">
        {current && current.kind === 'text' && (
          <p className="text-center text-2xl font-black tracking-tight" style={{ color: dark ? '#FFFFFF' : '#0F172A' }}>
            {current.text}
          </p>
        )}
        {current && current.kind === 'photo' && current.photoUrl && (
          <img src={current.photoUrl} alt="Status" className="absolute inset-0 w-full h-full object-contain" />
        )}
        {current && current.kind === 'video' && current.videoUrl && (
          <video src={current.videoUrl} controls autoPlay playsInline className="max-h-full max-w-full rounded-2xl" />
        )}
        {current && current.kind === 'music' && current.audioUrl && (
          <div className="w-full max-w-sm rounded-3xl p-6 space-y-4" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>
            <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
              <Music className="w-8 h-8 text-white" />
            </div>
            <audio src={current.audioUrl} controls className="w-full" />
          </div>
        )}
        {total > 1 && (
          <>
            {idx > 0 && (
              <button
                onClick={() => setIdx(idx - 1)}
                className="absolute left-0 top-0 bottom-0 w-1/4"
                aria-label="Previous update"
              />
            )}
            {idx < total - 1 && (
              <button
                onClick={() => setIdx(idx + 1)}
                className="absolute right-0 top-0 bottom-0 w-1/4"
                aria-label="Next update"
              />
            )}
          </>
        )}
        {!current && statuses && statuses.length === 0 && (
          <p className="text-center text-sm font-bold" style={{ color: dark ? '#FFFFFF' : '#0F172A' }}>
            This status is no longer available.
          </p>
        )}
        {!statuses && !err && (
          <p className="text-center text-sm font-bold" style={{ color: dark ? 'rgba(255,255,255,0.7)' : 'rgba(15,23,42,0.5)' }}>
            Loading...
          </p>
        )}
      </div>

      {/* Media updates can carry a caption; it rides above the bottom bar. */}
      {current && current.kind !== 'text' && current.text && (
        <div className="px-6 pb-2">
          <p
            className="mx-auto max-w-md rounded-2xl px-4 py-2 text-sm font-bold text-center"
            style={{ color: '#FFFFFF', backgroundColor: 'rgba(15,23,42,0.55)' }}
          >
            {current.text}
          </p>
        </div>
      )}

      {/* Bottom: the owner sees who has seen it and the replies; everyone
          else sees the reply box when replies are switched on. */}
      {err && (
        <p className="px-6 pb-2 text-xs font-bold text-center" style={{ color: dark ? '#FFFFFF' : '#B91C1C' }}>{err}</p>
      )}
      {mine && current && (
        <div className="px-4 pb-8 space-y-2">
          <p className="text-xs font-bold" style={{ color: dark ? 'rgba(255,255,255,0.85)' : 'rgba(15,23,42,0.7)' }}>
            Seen by {current.views || 0}
          </p>
          {(current.replies || []).length > 0 && (
            <div className="max-h-40 overflow-y-auto space-y-1.5 rounded-2xl p-3"
              style={{ backgroundColor: dark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.06)' }}>
              {current.replies!.map((rp, i) => (
                <div key={rp.replyId || `${rp.uid}-${rp.at}-${i}`} className="text-xs">
                  <span className="font-black" style={{ color: dark ? '#FFFFFF' : '#0F172A' }}>
                    {rp.name || (rp.username ? `@${rp.username}` : 'Student')}
                  </span>
                  <span style={{ color: dark ? 'rgba(255,255,255,0.85)' : 'rgba(15,23,42,0.8)' }}> {rp.text}</span>
                </div>
              ))}
            </div>
          )}
          {(current.replies || []).length === 0 && (
            <p className="text-[11px] font-medium" style={{ color: dark ? 'rgba(255,255,255,0.6)' : 'rgba(15,23,42,0.5)' }}>
              No replies yet.
            </p>
          )}
        </div>
      )}
      {!mine && current && settings.allowReplies && (
        <div className="p-4 pb-8 space-y-2">
          {replyNote && (
            <p className="text-[11px] font-bold text-center" style={{ color: dark ? '#FFFFFF' : '#0F172A' }}>{replyNote}</p>
          )}
          <div className="flex items-center gap-2">
            <input
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendReply();
                }
              }}
              placeholder="Reply to status"
              className="flex-1 h-11 rounded-full px-4 text-sm font-medium outline-none"
              style={{ color: dark ? '#FFFFFF' : '#0F172A', backgroundColor: dark ? 'rgba(255,255,255,0.15)' : 'rgba(15,23,42,0.06)' }}
            />
            <button
              onClick={sendReply}
              disabled={!replyText.trim() || replyBusy}
              className="px-4 h-11 rounded-full font-black text-sm active:scale-95 transition disabled:opacity-40"
              style={{ color: dark ? '#0F172A' : '#FFFFFF', backgroundColor: dark ? '#FFFFFF' : 'rgba(255,255,255,0.25)' }}
            >
              {replyBusy ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const StatusRow: React.FC<{ entry: StatusEntry; dimmed?: boolean; onPress?: () => void }> = ({ entry, dimmed, onPress }) => (
  <button
    onClick={onPress}
    disabled={!onPress}
    className={`bg-white rounded-2xl px-4 py-3 border border-slate-200/90 shadow-sm flex items-center gap-3 w-full text-left ${
      dimmed ? 'opacity-60' : ''
    } ${onPress ? 'active:scale-[0.99] transition' : ''}`}
  >
    <div
      className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-black shrink-0 ${
        dimmed
          ? 'bg-slate-100 text-slate-400 border border-slate-200'
          : 'bg-[#FFF7ED] text-[#C2410C] border-2 border-[#EA580C]'
      }`}
      aria-hidden="true"
    >
      {initials(entry.name || entry.username)}
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-black text-slate-900 truncate">{entry.name || (entry.username ? `@${entry.username}` : 'Student')}</p>
      <p className="text-xs text-slate-500 font-medium truncate">
        {entry.username ? `@${entry.username} · ` : ''}
        {statusTimeLabel(entry.at)}
      </p>
    </div>
  </button>
);

const StatusList: React.FC<{ label: string; items: StatusEntry[]; dimmed?: boolean; onOpen: (e: StatusEntry) => void }> = ({ label, items, dimmed, onOpen }) => (
  <div className="space-y-2">
    <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 px-1">{label}</p>
    <div className="space-y-2">
      {items.map((it) => (
        <StatusRow key={it.statusId} entry={it} dimmed={dimmed} onPress={() => onOpen(it)} />
      ))}
    </div>
  </div>
);

export const StatusScreen: React.FC<{ student: Student }> = ({ student }) => {
  const cacheKey = 'chat:status';
  const [data, setData] = useState<StatusOverview | null>(() => loadLastGood<StatusOverview>(cacheKey));
  const [failed, setFailed] = useState(false);
  const [fanOpen, setFanOpen] = useState(false);
  const photoInputRef = React.useRef<HTMLInputElement>(null);
  const videoInputRef = React.useRef<HTMLInputElement>(null);
  const musicInputRef = React.useRef<HTMLInputElement>(null);
  const prefersReducedMotion = React.useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const [composing, setComposing] = useState(false);
  const [media, setMedia] = useState<{ kind: 'photo' | 'video' | 'music'; file: File } | null>(null);
  const [viewer, setViewer] = useState<{ person: { uid: string; name: string; username: string }; mine: boolean } | null>(null);

  useEscape(() => setFanOpen(false));

  useEffect(() => {
    let alive = true;
    api('/api/student/chat/status/overview')
      .then((d: StatusOverview) => {
        if (!alive) return;
        if (d && d.ok) {
          setData(d);
          saveLastGood(cacheKey, d);
          setFailed(false);
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [cacheKey]);

  const me = data?.me || null;
  const recent = data?.recent || [];
  const viewed = data?.viewed || [];
  const showLists = recent.length > 0 || viewed.length > 0;

  // Any posted update (text, photo, video or music) lands in the My status
  // row right away; the next overview sync reconciles it.
  const applyPosted = (status: Record<string, any>) => {
    setComposing(false);
    setMedia(null);
    setFanOpen(false);
    setData((prev) => {
      if (!prev) return prev;
      const next: StatusOverview = {
        ...prev,
        me: { name: prev.me?.name || student.name, username: prev.me?.username || '', latest: status },
      };
      saveLastGood(cacheKey, next);
      return next;
    });
  };

  // Viewing a status moves its row to VIEWED straight away, and closing the
  // viewer re-syncs once so the counts and lists come back from the server.
  const openViewer = (entry: { uid: string; name: string; username: string }) => setViewer({ person: entry, mine: false });
  const closeViewer = () => {
    setViewer(null);
    api('/api/student/chat/status/overview')
      .then((d: StatusOverview) => {
        if (d && d.ok) {
          setData(d);
          saveLastGood(cacheKey, d);
        }
      })
      .catch(() => undefined);
  };
  const moveToViewed = (ownerUid: string, statusId: string) => {
    setData((prev) => {
      if (!prev) return prev;
      const hit = prev.recent.find((o) => o.uid === ownerUid && o.statusId === statusId);
      if (!hit) return prev;
      const next: StatusOverview = {
        ...prev,
        recent: prev.recent.filter((o) => !(o.uid === ownerUid && o.statusId === statusId)),
        viewed: [hit, ...prev.viewed],
      };
      saveLastGood(cacheKey, next);
      return next;
    });
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Status</h2>
        <p className="text-[11px] text-slate-500 font-medium">Updates from your centre</p>
      </div>

      {data && data.enabled === false && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm text-center space-y-2">
          <h3 className="text-base font-black text-slate-900 tracking-tight">Status is off</h3>
          <p className="text-xs text-slate-500 leading-relaxed font-medium">
            Status updates are not turned on for now.
          </p>
        </div>
      )}

      {data && data.enabled !== false && (
        <>
          {/* My status row. With an update up, tapping opens my own viewer
              with the seen count and replies; without one, it opens the
              Add sheet. */}
          <div
            onClick={() => (me?.latest ? setViewer({ person: { uid: student.uid || '', name: me.name || student.name, username: me.username || '' }, mine: true }) : setFanOpen(true))}
            role="button"
            className="w-full text-left bg-white rounded-3xl p-4 border border-slate-200/90 shadow-sm flex items-center gap-3 active:scale-[0.99] transition cursor-pointer"
          >
            <div className="relative shrink-0">
              <div className="w-12 h-12 rounded-full bg-[#FFF7ED] border-2 border-[#EA580C] flex items-center justify-center text-[#C2410C] text-sm font-black">
                {initials(me?.name || student.name)}
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-900">My status</p>
              <p className="text-xs text-slate-500 font-medium truncate">
                {me?.latest ? statusTimeLabel(me.latest.at) : 'Tap to add a photo or text update'}
              </p>
            </div>
          </div>

          {!showLists && (
            <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm text-center">
              <p className="text-xs text-slate-500 font-medium">No updates from your centre yet.</p>
            </div>
          )}

          {recent.length > 0 && <StatusList label="RECENT UPDATES" items={recent} onOpen={openViewer} />}
          {viewed.length > 0 && <StatusList label="VIEWED" items={viewed} dimmed onOpen={openViewer} />}
        </>
      )}

      {/* Add button, bottom right corner. Tapping it fans out the four
          status kinds from that same corner; each opens its own composer.
          Kinds turned off in TOS settings show dimmed and do nothing. */}
      {data?.settings && data.enabled !== false && (
        <div className="fixed inset-0 z-50 pointer-events-none" aria-hidden={!fanOpen}>
          {fanOpen && (
            <div
              className={`absolute inset-0 bg-slate-950/30 pointer-events-auto ${prefersReducedMotion ? '' : 'animate-in fade-in duration-200'}`}
              onClick={() => setFanOpen(false)}
            />
          )}
          {fanOpen && (
            <div className="absolute bottom-[168px] right-4 flex flex-col items-center gap-3 pointer-events-auto">
              {([
                { key: 'text', label: 'Text', disabled: !data.settings.allowText, render: () => <span className="text-sm font-black leading-none">Aa</span>, onPick: () => { setFanOpen(false); setComposing(true); } },
                { key: 'photo', label: 'Photo', disabled: !data.settings.allowPhoto, render: () => <ImageIcon className="w-5 h-5" />, onPick: () => { setFanOpen(false); photoInputRef.current?.click(); } },
                { key: 'video', label: 'Video', disabled: !data.settings.allowVideo, render: () => <Film className="w-5 h-5" />, onPick: () => { setFanOpen(false); videoInputRef.current?.click(); } },
                { key: 'music', label: 'Music', disabled: !data.settings.allowMusic, render: () => <Music className="w-5 h-5" />, onPick: () => { setFanOpen(false); musicInputRef.current?.click(); } },
              ] as const).map((it, i) => (
                <div key={it.key} className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-white drop-shadow whitespace-nowrap">{it.label}</span>
                  <button
                    type="button"
                    aria-label={`Add ${it.key} status`}
                    disabled={it.disabled}
                    title={it.disabled ? 'Off in TOS settings' : undefined}
                    onClick={it.disabled ? undefined : it.onPick}
                    className={`w-12 h-12 rounded-full bg-white text-slate-800 shadow-lg flex items-center justify-center cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${it.disabled ? 'opacity-40' : 'active:scale-95 transition'} ${prefersReducedMotion ? '' : 'animate-in fade-in zoom-in-95 duration-200'}`}
                    style={prefersReducedMotion ? undefined : { animationDelay: `${i * 40}ms` }}
                  >
                    {it.render()}
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            aria-label={fanOpen ? 'Close add menu' : 'Add a status update'}
            aria-expanded={fanOpen}
            onClick={() => setFanOpen((o) => !o)}
            className={`absolute bottom-24 right-4 w-14 h-14 rounded-full text-white flex items-center justify-center shadow-xl cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-200 pointer-events-auto active:scale-95 transition ${prefersReducedMotion ? '' : 'animate-in fade-in zoom-in-95 duration-200'}`}
            style={{ background: 'linear-gradient(145deg, #EA580C, #9A3412)' }}
          >
            {fanOpen ? <X className="w-7 h-7" /> : <Plus className="w-7 h-7" />}
          </button>
        </div>
      )}

      {/* Hidden pickers the fan buttons open. */}
      {data?.settings && data.enabled !== false && (
        <>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setMedia({ kind: 'photo', file: f }); }}
          />
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setMedia({ kind: 'video', file: f }); }}
          />
          <input
            ref={musicInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setMedia({ kind: 'music', file: f }); }}
          />
        </>
      )}

      {viewer && data?.settings && (
        <StatusViewer
          person={viewer.person}
          mine={viewer.mine}
          settings={data.settings}
          onClose={closeViewer}
          onSeenUpdate={moveToViewed}
        />
      )}

      {composing && data?.settings && (
        <TextComposer settings={data.settings} onClose={() => setComposing(false)} onPosted={applyPosted} />
      )}

      {media && data?.settings && (
        <MediaComposer kind={media.kind} file={media.file} settings={data.settings} onClose={() => setMedia(null)} onPosted={applyPosted} />
      )}

      {!data && failed && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm text-center">
          <p className="text-xs text-slate-500 font-medium">Status could not load. Try again in a moment.</p>
        </div>
      )}
    </div>
  );
};
