import React, { useEffect, useState } from 'react';
import { Plus, X, Image as ImageIcon, Film, Music, Volume2, VolumeX } from 'lucide-react';
import { Student } from '../../../types';
import { api } from '../../tos/tosShared';
import { loadLastGood, saveLastGood } from '../../../lib/lastGood';
import { useApp } from '../../../context/AppContext';
import { getAuth } from 'firebase/auth';
import { createPortal } from 'react-dom';

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
  centreId?: string;
  // How many live updates this person has up in the feed (more than one
  // when they posted several today); shown on the row as a small count.
  count?: number;
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
    // Direct-upload details served with the overview so the composer can
    // start uploading the moment Share is tapped (no extra round trip).
    upload?: { cloud: string; preset: string; folder: string };
  };
  me?: {
    name: string;
    username: string;
    avatar?: string;
    latest: {
      statusId: string; kind: string; at: number; expiresAt: number; text: string;
      photoUrl?: string; videoUrl?: string; audioUrl?: string; durationSeconds?: number;
      centreId?: string;
      // The author's tracking numbers for their own latest update.
      views?: number; replyCount?: number;
    } | null;
  };
  recent?: StatusEntry[];
  viewed?: StatusEntry[];
  // The caller's own live updates, one entry each, with their own permanent
  // seen and reply counts straight from the server.
  mine?: MineEntry[];
}

interface MineEntry {
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
  centreId?: string;
  views?: number;
  replyCount?: number;
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

/** While a full-screen status overlay is open the page behind it must not
 *  scroll: the overlay locks the body, so a drag on the overlay never moves
 *  the list underneath. */
function useLockBodyScroll() {
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
}

/** Renders its children at the top of the document, outside every scroll and
 *  stacking context of the app shell, so a status overlay always covers the
 *  whole screen, bottom nav included. */
export const Overlay: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  createPortal(<>{children}</>, document.body);

/** The composer's background palette. This is screen furniture, not data:
 *  the update itself stores whichever colour was picked, and the settings
 *  (not this list) decide every limit. */
const STATUS_BG = [
  '#0F172A', '#7C3AED', '#2563EB', '#059669',
  '#CA8A04', '#DB2777', '#EA580C', '#0F766E',
];

/** The short word for an update's kind on the My status rows. Text rows
 *  show a snippet of the words instead. */
function statusKindWord(kind: string): string {
  if (kind === 'photo') return 'Photo';
  if (kind === 'video') return 'Video';
  if (kind === 'music') return 'Music';
  return 'Text';
}

function bgLuminance(hex: string): number {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export const TextComposer: React.FC<{
  call: (path: string, opts?: any) => Promise<any>;
  settings: NonNullable<StatusOverview['settings']>;
  onClose: () => void;
  onPosted: (status: Record<string, any>) => void;
}> = ({ call, settings, onClose, onPosted }) => {
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
      const d = await call('', { method: 'POST', body: { kind: 'text', text: text.trim(), bg } });
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

/** Direct browser-to-hosting upload for one media file: the server hands the
 *  composer the unsigned preset details after checking the stored caps, the
 *  file goes straight to the host with a progress percentage, and only the
 *  hosted URL comes back to ride the status POST. Large videos never travel
 *  through the app's own server as base64. */
function uploadToCloudinary(
  cloud: string,
  endpoint: string,
  preset: string,
  folder: string,
  blob: Blob,
  onProgress: (pct: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('upload_preset', preset);
    form.append('folder', folder);
    form.append('file', blob);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloud}/${endpoint}/upload`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => {
      let data: any = null;
      try { data = JSON.parse(xhr.responseText || '{}'); } catch { data = null; }
      if (xhr.status >= 200 && xhr.status < 300 && data && typeof data.secure_url === 'string' && data.secure_url) {
        onProgress(100);
        resolve(String(data.secure_url));
      } else {
        const msg = String(data?.error?.message || '');
        reject(new Error(
          msg
            ? `The upload was refused: ${msg}`
            : 'The upload could not be completed. Try again.'
        ));
      }
    };
    xhr.onerror = () => reject(new Error('The upload did not go through. Check your connection and try again.'));
    xhr.send(form);
  });
}

export const MediaComposer: React.FC<{
  kind: 'photo' | 'video' | 'music';
  file: File;
  call: (path: string, opts?: any) => Promise<any>;
  settings: NonNullable<StatusOverview['settings']>;
  onClose: () => void;
  onPosted: (status: Record<string, any>) => void;
}> = ({ kind, file, call, settings, onClose, onPosted }) => {
  useEscape(onClose);
  const [preview, setPreview] = useState('');
  const [ready, setReady] = useState(false);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [fatal, setFatal] = useState('');
  const [progress, setProgress] = useState(0);
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
    setProgress(0);
    try {
      // The file that actually posts: photos as the downscaled copy, video and
      // music exactly as picked.
      const blob: Blob = kind === 'photo' ? await (await fetch(preview)).blob() : file;
      // Upload config comes with the overview, so the upload starts the
      // moment Share is tapped; the server-side route stays as the fallback
      // and re-checks the same stored limits when the overview had none.
      let cfg: any = settings.upload && settings.upload.cloud && settings.upload.preset
        ? { ok: true, ...settings.upload, endpoint: kind === 'photo' ? 'image' : 'video' }
        : null;
      if (!cfg) {
        cfg = await call('/upload-config', {
          method: 'POST',
          body: {
            kind,
            sizeBytes: blob.size,
            durationSeconds: kind === 'video' ? durationRef.current : undefined,
          },
        });
      }
      if (!(cfg && cfg.ok && cfg.cloud && cfg.preset)) {
        throw new Error(String(cfg?.error || 'The upload could not be started. Try again.'));
      }
      const url = await uploadToCloudinary(
        String(cfg.cloud),
        String(cfg.endpoint || (kind === 'photo' ? 'image' : 'video')),
        String(cfg.preset),
        String(cfg.folder || 'tos/status'),
        blob,
        setProgress,
      );
      const post = await call('', {
        method: 'POST',
        body: {
          kind,
          url,
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
          {busy ? (progress > 0 && progress < 100 ? `Uploading ${progress}%...` : 'Sharing...') : 'Share'}
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
        <p className="text-center text-[11px] font-bold mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>
          {kind === 'photo'
            ? `Photos can be up to ${settings.photoMaxKb} KB`
            : kind === 'video'
              ? `Videos can be up to ${settings.maxVideoSeconds} seconds and ${settings.maxVideoMb} MB`
              : `Music files can be up to ${settings.maxAudioMb} MB`}
        </p>
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

export const StatusViewer: React.FC<{
  person: { uid: string; name: string; username: string; avatar?: string; centreId?: string };
  mine: boolean;
  call: (path: string, opts?: any) => Promise<any>;
  settings: NonNullable<StatusOverview['settings']>;
  onClose: () => void;
  onSeenUpdate: (ownerUid: string, statusId: string) => void;
  // When the owner opens one specific update of theirs from the My status
  // list, the viewer starts on that update instead of the first one.
  startStatusId?: string;
}> = ({ person, mine, call, settings, onClose, onSeenUpdate, startStatusId }) => {
  useEscape(onClose);
  useLockBodyScroll();
  const [statuses, setStatuses] = useState<ViewerStatus[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [err, setErr] = useState('');
  const [replyText, setReplyText] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyNote, setReplyNote] = useState('');
  const seenFired = React.useRef<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    call(`/user/${encodeURIComponent(person.uid)}${person.centreId ? `?centreId=${encodeURIComponent(person.centreId)}` : ''}`)
      .then((d: any) => {
        if (!alive) return;
        if (d && d.ok) {
          const list = Array.isArray(d.statuses) ? d.statuses : [];
          setStatuses(list);
          if (startStatusId) {
            const at = list.findIndex((x: ViewerStatus) => x.statusId === startStatusId);
            if (at >= 0) setIdx(at);
          }
        } else setErr(String(d?.error || 'The status could not load. Try again.'));
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
    call(`/seen${person.centreId ? `?centreId=${encodeURIComponent(person.centreId)}` : ''}`, {
      method: 'POST',
      body: { ownerUid: person.uid, statusId: current.statusId },
    }).catch(() => undefined);
  }, [current, mine, person.uid, onSeenUpdate]);

  const sendReply = async () => {
    if (!replyText.trim() || replyBusy || !current) return;
    setReplyBusy(true);
    setErr('');
    try {
      const d = await call(`/reply${person.centreId ? `?centreId=${encodeURIComponent(person.centreId)}` : ''}`, {
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
        replyInputRef.current?.blur();
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

  // WhatsApp-style playback: the thin line at the top fills by itself and the
  // viewer moves to the next update when it fills; touching and holding the
  // update pauses it until the finger lifts. Video and music run on their own
  // clock instead and move on when the media ends. The end of the last update
  // closes the viewer, the way a status viewer closes itself.
  const [tick, setTick] = useState(0);
  const pausedRef = React.useRef(false);
  const replyInputRef = React.useRef<HTMLInputElement>(null);
  // Video updates play with their sound on. If the phone's autoplay rule
  // refuses sound before a tap, the update falls back to silent and the
  // sound button in the corner brings the sound back with one tap.
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [vidMuted, setVidMuted] = useState(false);
  React.useEffect(() => {
    setVidMuted(false);
  }, [current?.statusId]);
  const playVideo = () => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = vidMuted;
    const p = el.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        setVidMuted(true);
        const el2 = videoRef.current;
        if (el2) {
          el2.muted = true;
          el2.play().catch(() => undefined);
        }
      });
    }
  };
  const toggleVideoSound = () => {
    const next = !vidMuted;
    setVidMuted(next);
    const el = videoRef.current;
    if (el) {
      el.muted = next;
      el.play().catch(() => undefined);
    }
  };
  // Swiping up on the update is the reply gesture for every status: it
  // opens (focuses) the reply box, the same move a reel uses.
  const swipeStartY = React.useRef(0);
  const swipeFired = React.useRef(false);
  const replyTouchOpen = () => {
    if (mine || !settings.allowReplies) return;
    replyInputRef.current?.focus();
  };
  const advance = (n: number) => {
    if (idx + n >= total) onClose();
    else {
      setIdx(idx + n);
      setTick(0);
      pausedRef.current = false;
    }
  };
  // Video and music carry their own clock: every playback tick moves the
  // white line by how far the media actually is, instead of the line
  // standing still while the media plays.
  const mediaTime = (e: React.SyntheticEvent<HTMLMediaElement>) => {
    const el = e.currentTarget;
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
    setTick(Math.min(1000, Math.round((el.currentTime / el.duration) * 1000)));
  };
  const displayMs = (st: ViewerStatus | null): number => {
    if (!st) return 5000;
    if (st.kind === 'text') return Math.min(9000, Math.max(4000, 2200 + (st.text || '').length * 45));
    if (st.kind === 'photo') return 5000;
    return 0;
  };
  React.useEffect(() => {
    const cur = statuses && idx < statuses.length ? statuses[idx] : null;
    if (!cur) return;
    const ms = displayMs(cur);
    if (ms <= 0) return; // video and music advance when the media ends
    setTick(0);
    let acc = 0;
    let last = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now();
      if (!pausedRef.current) acc += now - last;
      last = now;
      setTick(Math.min(1000, Math.round((acc / ms) * 1000)));
      if (acc >= ms) {
        window.clearInterval(id);
        advance(1);
      }
    }, 100);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statuses, idx]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col select-none"
      style={{ backgroundColor: bg, userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
      role="dialog"
      aria-modal="true"
      aria-label={`${person.name || person.username}'s status`}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Top bar: close, who, when, and the tap-through dots. */}
      <div className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            {person.avatar ? (
              <img src={person.avatar} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
            ) : (
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-black shrink-0"
                style={{ color: dark ? '#FFFFFF' : '#0F172A', backgroundColor: dark ? 'rgba(255,255,255,0.2)' : 'rgba(15,23,42,0.08)' }}
              >
                {initials(person.name || person.username)}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-black truncate" style={{ color: dark ? '#FFFFFF' : '#0F172A' }}>
                {mine ? 'My status' : person.name || (person.username ? `@${person.username}` : 'Student')}
              </p>
              <p className="text-[11px] font-medium truncate" style={{ color: dark ? 'rgba(255,255,255,0.7)' : 'rgba(15,23,42,0.55)' }}>
                {current ? statusTimeLabel(current.at) : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {current?.kind === 'video' && (
              <button
                onClick={toggleVideoSound}
                className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-95 transition shrink-0"
                style={{ color: dark ? '#FFFFFF' : '#0F172A', backgroundColor: dark ? 'rgba(255,255,255,0.15)' : 'rgba(15,23,42,0.08)' }}
                aria-label={vidMuted ? 'Turn the sound on' : 'Turn the sound off'}
              >
                {vidMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            )}
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-95 transition shrink-0"
              style={{ color: dark ? '#FFFFFF' : '#0F172A', backgroundColor: dark ? 'rgba(255,255,255,0.15)' : 'rgba(15,23,42,0.08)' }}
              aria-label="Close status"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        {total > 0 && (
          <div className="flex items-center gap-1">
            {statuses!.map((st, i) => (
              <div
                key={st.statusId}
                className="h-1 flex-1 rounded-full overflow-hidden"
                style={{ backgroundColor: dark ? 'rgba(255,255,255,0.25)' : 'rgba(15,23,42,0.15)' }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: i < idx ? '100%' : i === idx ? `${Math.min(100, (tick / 1000) * 100)}%` : '0%',
                    backgroundColor: dark ? '#FFFFFF' : '#0F172A',
                    transition: 'width 100ms linear',
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* The update itself, with tap-through when there is more than one.
          Holding a finger on it pauses the progress line until it lifts. */}
      <div
        className="flex-1 flex items-center justify-center px-8 relative"
        onPointerDown={() => {
          pausedRef.current = true;
          if (current?.kind === 'video' && videoRef.current) videoRef.current.pause();
        }}
        onPointerUp={() => {
          pausedRef.current = false;
          if (current?.kind === 'video') playVideo();
        }}
        onPointerLeave={() => {
          pausedRef.current = false;
          if (current?.kind === 'video') playVideo();
        }}
        onPointerCancel={() => {
          pausedRef.current = false;
          if (current?.kind === 'video') playVideo();
        }}
        onTouchStart={(e) => {
          swipeStartY.current = e.touches[0]?.clientY || 0;
          swipeFired.current = false;
        }}
        onTouchMove={(e) => {
          if (swipeFired.current) return;
          const y = e.touches[0]?.clientY || 0;
          if (swipeStartY.current - y > 60) {
            swipeFired.current = true;
            replyTouchOpen();
          }
        }}
        onTouchEnd={() => { swipeFired.current = false; }}
        onTouchCancel={() => { swipeFired.current = false; }}
      >
        {current && current.kind === 'text' && (
          <p className="text-center text-2xl font-black tracking-tight" style={{ color: dark ? '#FFFFFF' : '#0F172A' }}>
            {current.text}
          </p>
        )}
        {current && current.kind === 'photo' && current.photoUrl && (
          <img src={current.photoUrl} alt="Status" draggable={false} className="absolute inset-0 w-full h-full object-contain pointer-events-none" />
        )}
        {current && current.kind === 'video' && current.videoUrl && (
          <video
            key={current.statusId}
            ref={videoRef}
            src={current.videoUrl}
            autoPlay
            playsInline
            muted={vidMuted}
            className="absolute inset-0 w-full h-full object-cover"
            onLoadedMetadata={playVideo}
            onTimeUpdate={mediaTime}
            onEnded={() => advance(1)}
          />
        )}
        {current && current.kind === 'music' && current.audioUrl && (
          <div className="w-full max-w-sm rounded-3xl p-6 space-y-4" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>
            <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
              <Music className="w-8 h-8 text-white" />
            </div>
            <audio src={current.audioUrl} controls className="w-full" onEnded={() => advance(1)} />
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
          <div className="text-center space-y-2">
            <p className="text-sm font-bold" style={{ color: dark ? '#FFFFFF' : '#0F172A' }}>
              {mine ? 'You have no status up right now.' : 'This status is no longer available.'}
            </p>
            {mine && (
              <p className="text-xs font-medium" style={{ color: dark ? 'rgba(255,255,255,0.7)' : 'rgba(15,23,42,0.55)' }}>
                The orange + button below adds one.
              </p>
            )}
          </div>
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
              ref={replyInputRef}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onFocus={() => { pausedRef.current = true; }}
              onBlur={() => { pausedRef.current = false; }}
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

// A helper shared by the bubbles: how the ring splits spent vs remaining.
const RING_C = 2 * Math.PI * 30;

const statusLeftLabel = (ms: number): string => {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return '<1m';
  if (m < 90) return `${m}m`;
  const h = Math.floor(m / 60);
  return h >= 24 ? '1d+' : `${h}h`;
};

const StatusBubble: React.FC<{ entry: StatusEntry; dimmed?: boolean; now: number; onPress: () => void }> = ({ entry, dimmed, now, onPress }) => {
  const life = Math.max(1, entry.expiresAt - entry.at);
  const remain = Math.max(0, entry.expiresAt - now);
  if (remain <= 0) return null; // the 24h window ran out: gone at once.
  const f = Math.max(0, Math.min(1, remain / life));
  const ring = dimmed ? '#CBD5E1' : '#EA580C';
  const inside = entry.photoUrl
    ? <img src={entry.photoUrl} alt="" className="w-full h-full object-cover rounded-full" />
    : entry.videoUrl
      ? <Film className="w-5 h-5" />
      : entry.audioUrl
        ? <Music className="w-5 h-5" />
        : <span className="text-[11px] font-black leading-none">Aa</span>;
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={`Status, ${statusLeftLabel(remain)} left`}
      className="shrink-0 flex flex-col items-center gap-1 cursor-pointer active:scale-95 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 rounded-full"
    >
      <span className={`relative block w-14 h-14 ${dimmed ? 'opacity-70' : ''}`}>
        <svg viewBox="0 0 64 64" className="w-14 h-14" aria-hidden="true">
          <circle cx="32" cy="32" r="30" fill="none" stroke="#F1F5F9" strokeWidth="3.5" />
          <circle
            cx="32" cy="32" r="30" fill="none" stroke={ring} strokeWidth="3.5"
            strokeLinecap="round" strokeDasharray={RING_C}
            strokeDashoffset={RING_C * (1 - f)}
            transform="rotate(-90 32 32)"
          />
        </svg>
        <span className="absolute inset-[5px] rounded-full overflow-hidden bg-[#FFF7ED] text-[#C2410C] border border-[#EA580C]/30 flex items-center justify-center">
          {inside}
        </span>
      </span>
      <span className="text-[9px] font-black text-slate-500 leading-none">{statusLeftLabel(remain)}</span>
    </button>
  );
};

// One component per poster: their updates sit side by side as circles inside
// the same card, the cards run horizontally, and more than fits scrolls
// sideways so nothing is ever stacked vertically.
const StatusRail: React.FC<{ label: string; items: StatusEntry[]; dimmed?: boolean; onOpen: (e: StatusEntry) => void }> = ({ label, items, dimmed, onOpen }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const live = items.filter((it) => it.expiresAt > now);
  if (!live.length) return null;
  const groups: { key: string; name: string; username: string; centreId?: string; statuses: StatusEntry[] }[] = [];
  const byKey = new Map<string, { key: string; name: string; username: string; centreId?: string; statuses: StatusEntry[] }>();
  for (const it of live) {
    const k = `${it.centreId || ''}:${it.uid}`;
    let g = byKey.get(k);
    if (!g) {
      g = { key: k, name: it.name || (it.username ? `@${it.username}` : 'Student'), username: it.username, centreId: it.centreId, statuses: [] };
      byKey.set(k, g);
      groups.push(g);
    }
    g.statuses.push(it);
  }
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 px-1">{label}</p>
      <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
        {groups.map((g) => (
          <div
            key={g.key}
            className={`shrink-0 bg-white rounded-2xl border border-slate-200/90 shadow-sm p-3 ${dimmed ? 'opacity-75' : ''}`}
          >
            <div className="flex items-center gap-2 max-w-[168px]">
              <div
                className={`w-7 h-7 rounded-full text-[10px] font-black flex items-center justify-center shrink-0 ${dimmed ? 'bg-slate-100 text-slate-400 border border-slate-200' : 'bg-[#FFF7ED] text-[#C2410C] border border-[#EA580C]/40'}`}
                aria-hidden="true"
              >
                {initials(g.name)}
              </div>
              <p className="text-[11px] font-black text-slate-900 truncate">{g.name}</p>
            </div>
            <div className="flex gap-2 mt-2.5">
              {g.statuses.map((st) => (
                <StatusBubble key={st.statusId} entry={st} dimmed={dimmed} now={now} onPress={() => onOpen(st)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const StatusScreenCore: React.FC<{ call: (path: string, opts?: any) => Promise<any>; uid: string; cacheKey?: string; fallbackName?: string }> =
({ call, uid, cacheKey = 'chat:status', fallbackName = '' }) => {
  const [data, setData] = useState<StatusOverview | null>(() => loadLastGood<StatusOverview>(cacheKey));
  const [failed, setFailed] = useState(false);
  const [fanOpen, setFanOpen] = useState(false);
  const photoInputRef = React.useRef<HTMLInputElement>(null);
  const videoInputRef = React.useRef<HTMLInputElement>(null);
  const prefersReducedMotion = React.useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const [composing, setComposing] = useState(false);
  const [media, setMedia] = useState<{ kind: 'photo' | 'video' | 'music'; file: File } | null>(null);
  const [viewer, setViewer] = useState<{ person: { uid: string; name: string; username: string; avatar?: string; centreId?: string }; mine: boolean; startStatusId?: string } | null>(null);

  useEscape(() => setFanOpen(false));

  useEffect(() => {
    let alive = true;
    call('/overview')
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
  // My status lists every update I have up, one row each, so each stays
  // individually viewable with its own permanent seen and reply counts.
  // Until the first sync lands, the latest update stands in alone.
  const mineRows: MineEntry[] =
    data?.mine && data.mine.length ? data.mine : me?.latest ? [me.latest] : [];

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
        me: { name: prev.me?.name || fallbackName, username: prev.me?.username || '', latest: status },
      };
      saveLastGood(cacheKey, next);
      return next;
    });
  };

  // Viewing a status moves its row to VIEWED straight away, and closing the
  // viewer re-syncs once so the counts and lists come back from the server.
  const openViewer = (entry: StatusEntry) => setViewer({
    person: { uid: entry.uid, name: entry.name, username: entry.username, centreId: entry.centreId },
    mine: false,
    startStatusId: entry.statusId,
  });
  const closeViewer = () => {
    setViewer(null);
    call('/overview')
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
          {/* My status: one row per update I have up, each opening that exact
              update with its own seen and reply counts. Posting happens
              through the orange + button in the corner, never here. */}
          {mineRows.length === 0 ? (
            <div className="w-full bg-white rounded-3xl p-4 border border-slate-200/90 shadow-sm flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#FFF7ED] border-2 border-[#EA580C] flex items-center justify-center text-[#C2410C] text-sm font-black shrink-0">
                {initials(me?.name || fallbackName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-slate-900">My status</p>
                <p className="text-xs text-slate-500 font-medium truncate">No status up right now</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {mineRows.map((m) => (
                <div
                  key={m.statusId}
                  onClick={() => setViewer({ person: { uid, name: me?.name || fallbackName, username: me?.username || '', avatar: me?.avatar, centreId: m.centreId }, mine: true, startStatusId: m.statusId })}
                  role="button"
                  className="w-full text-left bg-white rounded-3xl p-4 border border-slate-200/90 shadow-sm flex items-center gap-3 active:scale-[0.99] transition cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-full bg-[#FFF7ED] border-2 border-[#EA580C] flex items-center justify-center text-[#C2410C] shrink-0">
                    {m.kind === 'photo' ? <ImageIcon className="w-5 h-5" />
                      : m.kind === 'video' ? <Film className="w-5 h-5" />
                      : m.kind === 'music' ? <Music className="w-5 h-5" />
                      : <span className="text-sm font-black">Aa</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-slate-900 truncate">
                      {m.kind === 'text' && m.text ? m.text : 'My status'}
                    </p>
                    <p className="text-xs text-slate-500 font-medium truncate">
                      {statusKindWord(m.kind)} · {statusTimeLabel(m.at)} · {statusLeftLabel(m.expiresAt - Date.now())} left
                      {typeof m.views === 'number' ? ` · ${m.views} seen · ${m.replyCount || 0} replies` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!showLists && (
            <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm text-center">
              <p className="text-xs text-slate-500 font-medium">No updates from your centre yet.</p>
            </div>
          )}

          {recent.length > 0 && <StatusRail label="RECENT UPDATES" items={recent} onOpen={openViewer} />}
          {viewed.length > 0 && <StatusRail label="VIEWED" items={viewed} dimmed onOpen={openViewer} />}
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
        </>
      )}

      {viewer && data?.settings && (
        <Overlay>
          <StatusViewer
            person={viewer.person}
            mine={viewer.mine}
            startStatusId={viewer.startStatusId}
            call={call}
            settings={data.settings}
            onClose={closeViewer}
            onSeenUpdate={moveToViewed}
          />
        </Overlay>
      )}

      {composing && data?.settings && (
        <Overlay>
          <TextComposer call={call} settings={data.settings} onClose={() => setComposing(false)} onPosted={applyPosted} />
        </Overlay>
      )}

      {media && data?.settings && (
        <Overlay>
          <MediaComposer kind={media.kind} file={media.file} call={call} settings={data.settings} onClose={() => setMedia(null)} onPosted={applyPosted} />
        </Overlay>
      )}

      {!data && failed && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm text-center">
          <p className="text-xs text-slate-500 font-medium">Status could not load. Try again in a moment.</p>
        </div>
      )}
    </div>
  );
};

// Student entry point: the student's own endpoints.
export const StatusScreen: React.FC<{ student: Student }> = ({ student }) => {
  const call = React.useCallback(
    (path: string, opts?: any) => api('/api/student/chat/status' + path, opts),
    [],
  );
  return <StatusScreenCore call={call} uid={student.uid || ''} fallbackName={student.name} />;
};

// Staff entry point (ST1): admins and tutors use the same screen against
// their centre's status endpoints; centreId comes from the shared app
// context, the same way ChatManager finds it.
export const StaffStatusScreen: React.FC = () => {
  const { activeCentreId } = useApp();
  const myUid = getAuth().currentUser?.uid || '';
  const call = React.useCallback(
    (path: string, opts?: any) => {
      // A path that already names its centre (the status viewer does) keeps
      // it; a bare path gets this centre. Duplicating the query would garble
      // the value and fail the server's membership check.
      const centreQ = path.includes('centreId=')
        ? ''
        : `${path.includes('?') ? '&' : '?'}centreId=${encodeURIComponent(String(activeCentreId || ''))}`;
      return api('/api/centre/chat/status' + path + centreQ, opts);
    },
    [activeCentreId],
  );
  return <StatusScreenCore call={call} uid={myUid} cacheKey="chat:staff-status" />;
};
