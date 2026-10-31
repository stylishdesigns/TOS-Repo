import React, { useRef, useState } from 'react';
import { Copy, Forward, Reply, Star, Trash2, X } from 'lucide-react';

// ============================================================================
// Shared message actions for CH1 chat (Step 8b). Long-press any message to get
// the action sheet: five quick reactions, a "+" for the full picker, and the
// reply / star / delete / copy / forward row. Everything below is presentation
// only: every action calls a server route, so all the rules (who may react,
// who may delete, what gets saved) are decided by the server, never here.
// ============================================================================

export const BASIC_EMOJIS = ['👍', '❤️', '😂', '😮', '😢'];

export const MORE_EMOJIS = [
  '🔥', '👏', '🙌', '😍', '🤣', '😊', '🙏', '💯',
  '🤔', '😭', '😅', '😎', '🤝', '💪', '🎉', '🥳',
  '🙃', '🤗', '😏', '😴', '🤩', '🙈', '🫡', '👀',
];

/** Long-press (touch) or press-and-hold (mouse) detector. Cancels when the
 *  finger moves, so scrolling a thread never opens the sheet. */
export function useLongPress(onLongPress: () => void, ms = 450) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  const begin = (x: number, y: number) => {
    fired.current = false;
    start.current = { x, y };
    clear();
    timer.current = setTimeout(() => {
      fired.current = true;
      onLongPress();
    }, ms);
  };
  const moved = (x: number, y: number) => {
    if (!start.current) return;
    if (Math.abs(x - start.current.x) > 10 || Math.abs(y - start.current.y) > 10) {
      clear();
      start.current = null;
    }
  };
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (t) begin(t.clientX, t.clientY);
    },
    onTouchMove: (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (t) moved(t.clientX, t.clientY);
    },
    onTouchEnd: clear,
    onTouchCancel: clear,
    onMouseDown: (e: React.MouseEvent) => begin(e.clientX, e.clientY),
    onMouseUp: clear,
    onMouseLeave: clear,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      if (!fired.current) onLongPress();
    },
    style: { WebkitTouchCallout: 'none' as const } as React.CSSProperties,
  };
}

/** Same detector as useLongPress, but as plain closures so it can be built
 *  inline for each bubble in a list render. */
export function makeLongPress(onLongPress: () => void, ms = 450) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let start: { x: number; y: number } | null = null;
  let fired = false;
  const clear = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const begin = (x: number, y: number) => {
    fired = false;
    start = { x, y };
    clear();
    timer = setTimeout(() => {
      fired = true;
      onLongPress();
    }, ms);
  };
  const moved = (x: number, y: number) => {
    if (!start) return;
    if (Math.abs(x - start.x) > 10 || Math.abs(y - start.y) > 10) {
      clear();
      start = null;
    }
  };
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (t) begin(t.clientX, t.clientY);
    },
    onTouchMove: (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (t) moved(t.clientX, t.clientY);
    },
    onTouchEnd: clear,
    onTouchCancel: clear,
    onMouseDown: (e: React.MouseEvent) => begin(e.clientX, e.clientY),
    onMouseUp: clear,
    onMouseLeave: clear,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      if (!fired) onLongPress();
    },
    style: { WebkitTouchCallout: 'none' as const } as React.CSSProperties,
  };
}

/** The little reaction chips under a bubble. Tapping a chip the viewer already
 *  added takes their own reaction back off. */
export function ReactionChips({
  reactions,
  mineUid,
  onToggle,
}: {
  reactions: Record<string, string> | null | undefined;
  mineUid?: string;
  onToggle?: (emoji: string) => void;
}) {
  if (!reactions) return null;
  const groups: { emoji: string; count: number; mine: boolean }[] = [];
  Object.entries(reactions).forEach(([uid, emoji]) => {
    const g = groups.find((x) => x.emoji === emoji);
    if (g) {
      g.count += 1;
      if (uid === mineUid) g.mine = true;
    } else {
      groups.push({ emoji, count: 1, mine: uid === mineUid });
    }
  });
  if (!groups.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {groups.map((g) => (
        <button
          key={g.emoji}
          type="button"
          onClick={onToggle ? () => onToggle(g.emoji) : undefined}
          className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs transition ${
            g.mine ? 'bg-orange-500/90 text-white ring-1 ring-orange-600' : 'bg-white text-slate-700 ring-1 ring-slate-200'
          }`}
        >
          <span>{g.emoji}</span>
          {g.count > 1 && <span className="text-[10px] font-semibold">{g.count}</span>}
        </button>
      ))}
    </div>
  );
}

export interface ActionableMessage {
  text?: string;
  photoUrl?: string | null;
  username?: string;
  removed?: boolean;
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the textarea path */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Copy helper used by the sheet's copy button. Returns whether it worked. */
export async function copyText(text: string): Promise<boolean> {
  return writeClipboard(text);
}

export function MessageActionSheet({
  message,
  onClose,
  onReact,
  onReply,
  onStar,
  onDelete,
  onCopy,
  onForward,
  starred,
  busy,
}: {
  message: ActionableMessage;
  onClose: () => void;
  onReact?: (emoji: string) => void;
  onReply?: () => void;
  onStar?: () => void;
  onDelete?: () => void;
  onCopy?: () => void;
  onForward?: () => void;
  starred?: boolean;
  busy?: boolean;
}) {
  const [showMore, setShowMore] = useState(false);
  const quote = message.text
    ? message.text.length > 120
      ? `${message.text.slice(0, 120)}…`
      : message.text
    : message.photoUrl
      ? 'Photo'
      : 'Message';
  const pick = (emoji: string) => {
    onReact?.(emoji);
    onClose();
  };
  const acts: { icon: React.ReactNode; label: string; run: () => void }[] = [];
  if (onReply) acts.push({ icon: <Reply className="h-5 w-5" />, label: 'Reply', run: onReply });
  if (onStar) acts.push({ icon: <Star className={`h-5 w-5 ${starred ? 'fill-amber-400 text-amber-500' : ''}`} />, label: starred ? 'Unstar' : 'Star', run: onStar });
  if (onDelete) acts.push({ icon: <Trash2 className="h-5 w-5" />, label: 'Delete', run: onDelete });
  if (onCopy) acts.push({ icon: <Copy className="h-5 w-5" />, label: 'Copy', run: onCopy });
  if (onForward) acts.push({ icon: <Forward className="h-5 w-5" />, label: 'Forward', run: onForward });
  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full rounded-t-2xl bg-white p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-slate-100 p-2">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold text-orange-600">{message.username || 'Message'}</div>
            <div className="truncate text-xs text-slate-600">{message.removed ? 'Message removed' : quote}</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-200">
            <X className="h-4 w-4" />
          </button>
        </div>

        {showMore ? (
          <div className="grid grid-cols-8 gap-1 py-1">
            {MORE_EMOJIS.map((e) => (
              <button
                key={`${e}-${MORE_EMOJIS.indexOf(e)}`}
                type="button"
                disabled={busy}
                onClick={() => pick(e)}
                className="rounded-lg py-1.5 text-xl hover:bg-slate-100 active:scale-125"
              >
                {e}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowMore(false)}
              className="col-span-8 rounded-lg py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100"
            >
              Back to quick reactions
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-1 py-1">
              {BASIC_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  disabled={busy}
                  onClick={() => pick(e)}
                  className="rounded-full py-1.5 text-2xl transition hover:bg-slate-100 active:scale-125"
                >
                  {e}
                </button>
              ))}
              <button
                type="button"
                disabled={busy}
                onClick={() => setShowMore(true)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
                aria-label="More reactions"
              >
                <span className="text-lg leading-none">+</span>
              </button>
            </div>
            <div className="mt-2 flex items-center justify-around border-t border-slate-100 pt-3">
              {acts.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    a.run();
                    onClose();
                  }}
                  className="flex flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-slate-700 hover:bg-slate-100"
                >
                  {a.icon}
                  <span className="text-[10px] font-medium">{a.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Emoji presentation (Step 8c). On coloured (own) bubbles an emoji sits on a
// small white chip instead of the bubble colour, and a message made of only
// emojis reads like WhatsApp: a white pill with the emojis large.
// ---------------------------------------------------------------------------

const EMOJI_RUN = /(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)/gu;

export function isEmojiOnly(text: string): boolean {
  const t = (text || '').trim();
  if (!t) return false;
  return t.replace(EMOJI_RUN, '').replace(/\s+/g, '').length === 0;
}

export function EmojiText({ text, mine, className }: { text: string; mine?: boolean; className?: string }) {
  if (!mine) return <span className={className}>{text}</span>;
  const parts = text.split(EMOJI_RUN);
  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          return (
            <span key={i} className="mx-px inline-block rounded-md bg-white px-1 leading-[1.3]">
              {part}
            </span>
          );
        }
        return part ? <React.Fragment key={i}>{part}</React.Fragment> : null;
      })}
    </span>
  );
}
