import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAuth } from 'firebase/auth';
import {
  Search, Play, X, MonitorPlay, RefreshCw, GraduationCap, BookOpen, WifiOff,
  ChevronUp, ChevronDown, RotateCcw, Maximize, Minimize,
} from 'lucide-react';
import type { VideoResource } from '../../../../types';
import { SubjectDropdown } from './SubjectDropdown';

/**
 * Video classes (batch 42): the student side of the platform video library.
 * The TOS console adds the YouTube lesson videos once; every facility's
 * students find them here and watch them in a big pop-up player right in the
 * portal, never sent out to YouTube. Batch 42 changes: the list renders from
 * a local cache the moment the toggle is opened (no slow reload every time),
 * tapping a video opens a pop-up player instead of expanding inline, a small
 * arrow under the thumbnail reveals the topic and description, the YouTube
 * buttons that lead out of the app sit under a see-through shield (the
 * timeline, double-tap skip and fullscreen still work), subtitles default
 * on, and the server only sends videos tagged with the exams on the
 * student's own programme.
 */

export const parseVideoId = (raw: string): string | null => {
  const url = String(raw || '').trim();
  if (!url) return null;
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  const idOk = (v: string) => /^[A-Za-z0-9_-]{11}$/.test(v);
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0];
    return idOk(id) ? id : null;
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const v = u.searchParams.get('v');
    if (v && idOk(v)) return v;
    const m = u.pathname.match(/\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})(?:[/?#]|$)/);
    if (m) return m[1];
  }
  return null;
};

const thumbUrl = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

/** Player URL: captions on by default (cc_load_policy=1), suggestions
 *  limited to the same channel (rel=0), the JS API enabled so the end screen
 *  can be covered when the lesson finishes, playsinline for phones. */
const playerUrl = (id: string) =>
  `https://www.youtube-nocookie.com/embed/${id}?rel=0&autoplay=1&playsinline=1&cc_load_policy=1&cc_lang_pref=en&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`;

// Module-level cache: opening the Video classes toggle renders the last list
// instantly while a quiet refresh runs underneath, instead of a skeleton
// every single time.
/** One cached page: the videos the server sent for one subject at one
 *  page number, plus whether a next page exists. Pagination is decided on
 *  the server (batch 45); the browser only shows the page it was given. */
interface VideoCache { page: number; subject: string; videos: VideoResource[]; hidden: number; hasMore: boolean; }
let cache: VideoCache | null = null;
const PAGE_SIZE = 10;

/** The shield over the YouTube player (batch 43 geometry, from the user's
 *  own phone screenshot): TWO plain see-through bands, not pinpoint boxes.
 *  The top band runs from the top edge of the player down to just above the
 *  middle, so the title, channel row, volume, CC and settings buttons on the
 *  phone player sit under it and stop responding. The bottom band runs from
 *  the bottom edge up to just below the timeline row, so the copy-link
 *  button, the suggested-video card and the YouTube logo sit under it and
 *  stop responding, while the band never touches the timeline itself. The
 *  uncovered middle strip keeps play/pause, the timeline, double-tap 10
 *  second skip and the fullscreen button fully live. */
const ShieldPatches: React.FC<{ ended: boolean; onReplay: () => void; onToggleFullscreen?: () => void; isFullscreen?: boolean }> = ({ ended, onReplay, onToggleFullscreen, isFullscreen }) => (
  <>
    <span aria-hidden className="absolute left-0 top-0 w-full" style={{ height: '46%', pointerEvents: 'auto' }} />
    <span aria-hidden className="absolute left-0 bottom-0 w-full" style={{ height: '25%', pointerEvents: 'auto' }} />
    {onToggleFullscreen && (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleFullscreen(); }}
        aria-label={isFullscreen ? 'Exit full screen' : 'Open full screen'}
        className="absolute grid place-items-center rounded-lg bg-black/45 text-white/85 hover:text-white transition-colors"
        style={{ right: '1.5%', bottom: '25.8%', width: '12%', height: '11.5%', pointerEvents: 'auto', minWidth: 34, minHeight: 34 }}
      >
        {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
      </button>
    )}
    {ended && (
      <div
        className="absolute inset-0 z-10 grid place-items-center"
        style={{ pointerEvents: 'auto', background: 'rgba(2, 6, 23, 0.72)' }}
      >
        <button
          type="button"
          onClick={onReplay}
          className="inline-flex items-center gap-2 h-11 px-5 rounded-2xl bg-white text-[#0F172A] text-xs font-extrabold shadow-xl"
        >
          <RotateCcw className="w-4 h-4" /> Watch again
        </button>
      </div>
    )}
  </>
);

/** The pop-up player: a big centred player over a dark backdrop, with the
 *  shield on top. Watches YouTube's own state messages so the end screen
 *  (the suggested videos that lead out of the app) gets covered the moment
 *  a lesson finishes. */
const VideoPlayerModal: React.FC<{ video: VideoResource; dark: boolean; onClose: () => void }> = ({ video, dark, onClose }) => {
  const [ended, setEnded] = useState(false);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [isFs, setIsFs] = useState(false);

  // Full screen (batch 45): YouTube's own button pulls ONLY the video out of
  // the page, which leaves the shield behind. So that button is covered and
  // this one opens full screen on the whole player box (video + shield
  // together), keeping the overlay working in full view. Where the browser
  // cannot fullscreen a plain box (older iPhones), the YouTube button stays
  // uncovered as a fallback.
  const fullscreenSupported = typeof document !== 'undefined' && document.fullscreenEnabled !== false;
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      wrapRef.current?.requestFullscreen?.().catch(() => {});
    }
  };
  useEffect(() => {
    const onFs = () => setIsFs(document.fullscreenElement === wrapRef.current);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      try {
        const data: any = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data;
        const state = typeof data?.info?.playerState === 'number'
          ? data.info.playerState
          : (data?.event === 'onStateChange' && typeof data?.info === 'number' ? data.info : undefined);
        if (state === 0) setEnded(true);
        else if (state === 1 || state === 2 || state === 3) setEnded(false);
      } catch { /* messages that are not YouTube's are ignored */ }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const replay = () => {
    setEnded(false);
    const win = frameRef.current?.contentWindow;
    if (win) {
      win.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [0, true] }), '*');
      win.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.fullscreenElement) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const subTone = dark ? 'text-slate-400' : 'text-white/70';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-3" onClick={onClose}>
      <div className="w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-1 pb-2">
          <div className="min-w-0">
            <h4 className="text-xs font-extrabold text-white truncate">{video.topic}</h4>
            <p className={`text-[11px] truncate ${subTone}`}>
              {video.subject}{(video.examTypes || []).length ? ` · ${(video.examTypes || []).join(' · ')}` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 w-9 h-9 rounded-xl grid place-items-center text-white/70 hover:text-white hover:bg-white/10"
            aria-label="Close the video"
          >
            <X className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
          </button>
        </div>
        <div ref={wrapRef} className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-2xl">
          <iframe
            ref={frameRef}
            key={video.videoId}
            src={playerUrl(video.videoId)}
            title={video.topic}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
          <ShieldPatches ended={ended} onReplay={replay} onToggleFullscreen={fullscreenSupported ? toggleFullscreen : undefined} isFullscreen={isFs} />
        </div>
        {video.description && (
          <p className={`px-1 pt-2 text-[11px] leading-relaxed ${subTone}`}>{video.description}</p>
        )}
      </div>
    </div>
  );
};

interface VideoClassesSectionProps {
  dark: boolean;
  /** Batch 43: the subject filter is one dropdown shared with Study
   *  materials. When the parent passes subject/onSubjectChange the two views
   *  stay in lockstep: a pick in either is the pick in both. */
  subject?: string;
  onSubjectChange?: (next: string) => void;
  /** The subjects the student is registered for; falls back to the subjects
   *  present on the videos when the parent supplies none. */
  registeredSubjects?: string[];
}

export const VideoClassesSection: React.FC<VideoClassesSectionProps> = ({ dark, subject, onSubjectChange, registeredSubjects }) => {
  const [query, setQuery] = useState('');
  const [internalSubject, setInternalSubject] = useState('All');
  const subjectFilter = subject !== undefined ? subject : internalSubject;
  const seed = cache && cache.subject === subjectFilter ? cache : null;
  const [videos, setVideos] = useState<VideoResource[]>(seed?.videos || []);
  const [hiddenCount, setHiddenCount] = useState<number>(seed?.hidden || 0);
  const [page, setPage] = useState<number>(seed?.page || 1);
  const [hasMore, setHasMore] = useState<boolean>(!!seed?.hasMore);
  const [loading, setLoading] = useState(!seed);
  const [paging, setPaging] = useState(false);
  const [err, setErr] = useState('');
  const setSubjectFilter = (next: string) =>
    onSubjectChange ? onSubjectChange(next) : setInternalSubject(next);
  const [watching, setWatching] = useState<VideoResource | null>(null);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const fetchPage = useCallback(async (nextPage: number, nextSubject: string, mode: 'full' | 'silent' | 'page') => {
    const user = getAuth().currentUser;
    if (!user) {
      if (mode !== 'silent') setErr('You are signed out. Sign in again to continue.');
      if (mode === 'full') setLoading(false);
      if (mode === 'page') setPaging(false);
      return;
    }
    if (mode === 'full') { setLoading(true); setErr(''); }
    if (mode === 'page') { setPaging(true); setErr(''); }
    try {
      const token = await user.getIdToken();
      const qs = new URLSearchParams({ page: String(nextPage), limit: String(PAGE_SIZE) });
      if (nextSubject && nextSubject !== 'All') qs.set('subject', nextSubject);
      const res = await fetch(`/api/student/video-resources?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Could not load the video classes. Pull down to retry.');
      const data: any = await res.json().catch(() => null);
      const list = Array.isArray(data?.videos) ? data.videos : [];
      const hasMoreNext = !!data?.hasMore;
      cache = { page: nextPage, subject: nextSubject, videos: list, hidden: Number(data?.hidden || 0), hasMore: hasMoreNext };
      setVideos(list);
      setHiddenCount(cache.hidden);
      setPage(nextPage);
      setHasMore(hasMoreNext);
      setErr('');
    } catch (e: any) {
      if (mode !== 'silent') setErr(e?.message || 'Could not load the video classes. Pull down to retry.');
    } finally {
      if (mode === 'full') setLoading(false);
      if (mode === 'page') setPaging(false);
    }
  }, []);

  // First open: render the cached page instantly when it matches the current
  // subject, otherwise fetch. Any subject change re-queries from page 1.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      if (cache && cache.subject === subjectFilter) void fetchPage(cache.page, subjectFilter, 'silent');
      else void fetchPage(1, subjectFilter, 'full');
      return;
    }
    void fetchPage(1, subjectFilter, cache && cache.subject === subjectFilter ? 'silent' : 'full');
  }, [subjectFilter, fetchPage]);

  const gotoPage = (next: number) => {
    if (next < 1 || paging) return;
    void fetchPage(next, subjectFilter, 'page');
  };

  const subjects = useMemo(
    () => Array.from(new Set<string>(videos.map((v) => v.subject).filter(Boolean))).sort((a: string, b: string) => a.localeCompare(b)),
    [videos],
  );

  // Dropdown options: the student's registered subjects when the parent
  // supplies them, otherwise the subjects on the videos themselves.
  const dropdownSubjects = useMemo(
    () => (registeredSubjects && registeredSubjects.length ? registeredSubjects : subjects),
    [registeredSubjects, subjects],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return videos.filter((v) => {
      if (subjectFilter !== 'All' && v.subject !== subjectFilter) return false;
      if (!q) return true;
      return `${v.topic || ''} ${v.subject} ${(v.examTypes || []).join(' ')} ${v.description || ''}`.toLowerCase().includes(q);
    });
  }, [videos, query, subjectFilter]);

  const toggleDetails = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const cardBg = dark ? 'bg-slate-800/70 border-slate-700' : 'bg-white border-[#E2E8F0]';
  const textMain = dark ? 'text-white' : 'text-[#0F172A]';
  const textSub = dark ? 'text-slate-400' : 'text-[#64748B]';

  // Branded skeleton: straight blocks in the facility colour family, never a
  // circular spinner. Only shown the very first time; afterwards the cached
  // list renders instantly.
  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`rounded-[20px] border p-3 ${cardBg} animate-pulse`}>
            <div className="aspect-video w-full rounded-[14px]" style={{ background: 'var(--brand-soft, rgba(100,116,139,0.15))' }} />
            <div className="mt-3 space-y-2">
              <div className="h-3 w-3/4 rounded" style={{ background: 'var(--brand-soft, rgba(100,116,139,0.15))' }} />
              <div className="h-2.5 w-1/3 rounded" style={{ background: 'var(--brand-soft, rgba(100,116,139,0.15))' }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Subject dropdown (batch 43): the shared, app-branded filter that
          Study materials and Video classes keep in lockstep. */}
      <SubjectDropdown dark={dark} subjects={dropdownSubjects} value={subjectFilter} onChange={setSubjectFilter} />
      <div className="relative">
        <Search className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ${textSub}`} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search video classes"
          className={`w-full h-11 pl-10 pr-3 rounded-[14px] text-xs font-semibold outline-none border transition-all ${
            dark
              ? 'bg-slate-800/80 border-slate-700 text-white placeholder:text-slate-500 focus:border-slate-500'
              : 'bg-white border-[#E2E8F0] text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[var(--brand,#0F172A)]'
          }`}
          aria-label="Search video classes"
        />
      </div>

      {err && (
        <div className={`rounded-[20px] border px-4 py-4 text-center ${cardBg}`}>
          <WifiOff className={`w-5 h-5 mx-auto mb-2 ${textSub}`} />
          <p className={`text-xs font-bold ${textMain}`}>{err}</p>
          <button
            onClick={() => fetchPage(page, subjectFilter, 'page')}
            className="mt-3 inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-[var(--brand,#0F172A)] text-[var(--on-brand,#fff)] text-xs font-extrabold"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Try again
          </button>
        </div>
      )}

      {/* Empty state: either nothing added yet, or everything on file is for
          a different exam than the one on this student's programme. */}
      {!err && videos.length === 0 && (
        <div className={`rounded-[20px] border px-4 py-10 text-center ${cardBg}`}>
          <div className="w-12 h-12 mx-auto rounded-2xl grid place-items-center mb-3" style={{ background: 'var(--brand-soft, rgba(100,116,139,0.12))' }}>
            <MonitorPlay className="w-6 h-6" style={{ color: 'var(--brand,#0F172A)' }} />
          </div>
          <h4 className={`text-xs font-extrabold ${textMain}`}>No video classes yet</h4>
          <p className={`text-[11px] mt-1 max-w-[260px] mx-auto ${textSub}`}>
            Your learning resources will show video lessons here as soon as they are added. Check back soon.
          </p>
        </div>
      )}
      {!err && videos.length === 0 && hiddenCount > 0 && (
        <p className={`text-[11px] text-center ${textSub}`}>
          {hiddenCount} video{hiddenCount === 1 ? '' : 's'} exist{hiddenCount === 1 ? 's' : ''} for other exams.
        </p>
      )}

      {/* Video list: tap the thumbnail to open the big pop-up player; tap the
          small arrow under it to see the topic and description. */}
      {!err && shown.length > 0 && (
        <div className="space-y-3">
          {shown.map((v) => {
            const id = v.videoId || parseVideoId(v.youtubeUrl) || '';
            const open = openIds.has(v.id);
            return (
              <div key={v.id} className={`rounded-[20px] border p-3 ${cardBg}`}>
                <button
                  type="button"
                  onClick={() => setWatching(v)}
                  className="relative block w-full aspect-video rounded-[14px] overflow-hidden bg-slate-900"
                  title="Watch this video"
                >
                  <img
                    src={thumbUrl(id)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                  <span className="absolute inset-0 grid place-items-center">
                    <span
                      className="w-11 h-11 rounded-full grid place-items-center shadow-lg"
                      style={{ background: 'var(--brand,#0F172A)' }}
                    >
                      <Play className="w-4.5 h-4.5 text-[var(--on-brand,#fff)] fill-[var(--on-brand,#fff)] ml-0.5" style={{ width: 18, height: 18 }} />
                    </span>
                  </span>
                  <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 h-6 px-2 rounded-full bg-black/70 text-[10px] font-bold text-white">
                    <BookOpen className="w-3 h-3" /> {v.subject}
                  </span>
                </button>
                {/* The topic and the exam badges always show; the small
                    arrow sits UNDER them (batch 45) so it reads as "there is
                    more here", and it opens only the description below. */}
                <div className="px-1 pt-1">
                  <h4 className={`text-xs font-extrabold leading-snug ${textMain}`}>{v.topic}</h4>
                  {(v.examTypes || []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {(v.examTypes || []).map((t) => (
                        <span key={t} className="inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-extrabold" style={{ background: 'var(--brand-soft, rgba(100,116,139,0.12))', color: 'var(--brand,#0F172A)' }}>
                          <GraduationCap className="w-3 h-3" /> {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => toggleDetails(v.id)}
                  className={`w-full flex items-center justify-center gap-1 py-1.5 ${textSub}`}
                  aria-label={open ? 'Hide the video description' : 'Show the video description'}
                  aria-expanded={open}
                >
                  {open
                    ? <ChevronDown className="w-4 h-4" />
                    : <ChevronUp className="w-4 h-4" />}
                </button>
                {open && v.description && (
                  <p className={`px-1 pb-1 text-[11px] leading-relaxed ${textSub}`}>{v.description}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pager (batch 45): the server sends one page at a time and decides
          whether a next page exists; the buttons only ask for it. */}
      {!err && videos.length > 0 && (hasMore || page > 1) && (
        <div className="flex items-center justify-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => gotoPage(page - 1)}
            disabled={page <= 1 || paging}
            className={`h-9 px-3.5 rounded-xl border text-[11px] font-extrabold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${cardBg} ${textMain}`}
          >
            Previous
          </button>
          <span className={`text-[11px] font-extrabold px-1 ${textSub}`}>{paging ? 'Loading' : `Page ${page}`}</span>
          <button
            type="button"
            onClick={() => gotoPage(page + 1)}
            disabled={!hasMore || paging}
            className={`h-9 px-3.5 rounded-xl border text-[11px] font-extrabold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${cardBg} ${textMain}`}
          >
            Next page
          </button>
        </div>
      )}

      {!err && videos.length > 0 && shown.length === 0 && (
        <div className={`rounded-[20px] border px-4 py-8 text-center ${cardBg}`}>
          <p className={`text-xs font-extrabold ${textMain}`}>No video classes match</p>
          <p className={`text-[11px] mt-1 ${textSub}`}>Try another subject or clear the search.</p>
        </div>
      )}

      {watching && (
        <VideoPlayerModal video={watching} dark={dark} onClose={() => setWatching(null)} />
      )}
    </div>
  );
};

export default VideoClassesSection;
