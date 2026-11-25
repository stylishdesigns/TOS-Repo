import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getAuth } from 'firebase/auth';
import {
  Search, Play, X, MonitorPlay, RefreshCw, GraduationCap, BookOpen, WifiOff,
} from 'lucide-react';
import type { VideoResource } from '../../../../types';

/**
 * Video classes (batch 41): the student side of the platform video library.
 * The TOS console adds the YouTube lesson videos once; every facility's
 * students find them here, arranged by subject, and watch them right in the
 * portal, never sent out to YouTube. Reading goes through the student server
 * route, so no Firestore rules release is needed for it to work.
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
const embedUrl = (id: string, autoplay: boolean) =>
  `https://www.youtube-nocookie.com/embed/${id}?rel=0${autoplay ? '&autoplay=1' : ''}`;

interface VideoClassesSectionProps {
  dark: boolean;
}

export const VideoClassesSection: React.FC<VideoClassesSectionProps> = ({ dark }) => {
  const [videos, setVideos] = useState<VideoResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [query, setQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('All');
  const [watching, setWatching] = useState<VideoResource | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error('You are signed out. Sign in again to continue.');
      const token = await user.getIdToken();
      const res = await fetch('/api/student/video-resources', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Could not load the video classes. Pull down to retry.');
      const data: any = await res.json().catch(() => null);
      setVideos(Array.isArray(data?.videos) ? data.videos : []);
    } catch (e: any) {
      setErr(e?.message || 'Could not load the video classes. Pull down to retry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const subjects = useMemo(
    () => Array.from(new Set<string>(videos.map((v) => v.subject).filter(Boolean))).sort((a: string, b: string) => a.localeCompare(b)),
    [videos],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return videos.filter((v) => {
      if (subjectFilter !== 'All' && v.subject !== subjectFilter) return false;
      if (!q) return true;
      return `${v.title} ${v.topic || ''} ${v.subject}`.toLowerCase().includes(q);
    });
  }, [videos, query, subjectFilter]);

  const cardBg = dark ? 'bg-slate-800/70 border-slate-700' : 'bg-white border-[#E2E8F0]';
  const textMain = dark ? 'text-white' : 'text-[#0F172A]';
  const textSub = dark ? 'text-slate-400' : 'text-[#64748B]';
  const chipIdle = dark ? 'text-slate-300 border-slate-600 bg-slate-800/60' : 'text-[#64748B] border-[#E2E8F0] bg-white';

  // Branded skeleton: straight blocks in the facility colour family, never a
  // circular spinner.
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
      {/* Player on top when a video is picked; the list stays underneath */}
      {watching && (
        <div className={`rounded-[20px] border overflow-hidden ${cardBg}`}>
          <div className="aspect-video w-full bg-black">
            <iframe
              key={watching.videoId}
              src={embedUrl(watching.videoId, true)}
              title={watching.title}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
          <div className="p-3.5 flex items-start gap-2.5">
            <div className="flex-1 min-w-0">
              <h4 className={`text-xs font-extrabold leading-snug ${textMain}`}>{watching.title}</h4>
              <p className={`text-[11px] mt-0.5 ${textSub}`}>
                {watching.subject}{watching.topic ? ` · ${watching.topic}` : ''}
              </p>
              {watching.description && (
                <p className={`text-[11px] mt-1.5 leading-relaxed ${textSub}`}>{watching.description}</p>
              )}
            </div>
            <button
              onClick={() => setWatching(null)}
              className={`shrink-0 w-8 h-8 rounded-xl grid place-items-center ${dark ? 'text-slate-400 hover:text-white hover:bg-white/5' : 'text-[#64748B] hover:bg-[#F1F5F9]'}`}
              aria-label="Close the video"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Subject chips + search */}
      <div className="flex gap-1.5 flex-wrap">
        {['All', ...subjects].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSubjectFilter(s)}
            className={`h-8 px-3.5 rounded-full text-[11px] font-extrabold transition-all border ${
              subjectFilter === s
                ? 'bg-[var(--brand,#0F172A)] text-[var(--on-brand,#fff)] border-transparent shadow-xs'
                : chipIdle
            }`}
          >
            {s}
          </button>
        ))}
      </div>
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
            onClick={load}
            className="mt-3 inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-[var(--brand,#0F172A)] text-[var(--on-brand,#fff)] text-xs font-extrabold"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Try again
          </button>
        </div>
      )}

      {/* Empty state: nothing added yet by the platform */}
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

      {/* Video list */}
      {!err && shown.length > 0 && (
        <div className="space-y-3">
          {shown.map((v) => {
            const id = v.videoId || parseVideoId(v.youtubeUrl) || '';
            const active = watching?.id === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => { if (!active) setWatching(v); }}
                className={`w-full rounded-[20px] border p-3 text-left transition-all ${cardBg} ${active ? 'ring-2 ring-[var(--brand,#0F172A)] ring-offset-0' : 'hover:border-[var(--brand,#0F172A)]/40'}`}
              >
                <div className="relative aspect-video w-full rounded-[14px] overflow-hidden bg-slate-900">
                  <img
                    src={thumbUrl(id)}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                  <span
                    className="absolute inset-0 grid place-items-center"
                  >
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
                </div>
                <div className="mt-3 flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <h4 className={`text-xs font-extrabold leading-snug ${textMain} line-clamp-2`}>{v.title}</h4>
                    {v.topic && (
                      <p className={`text-[11px] mt-0.5 flex items-center gap-1 ${textSub} truncate`}>
                        <GraduationCap className="w-3 h-3 shrink-0" /> {v.topic}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {!err && videos.length > 0 && shown.length === 0 && (
        <div className={`rounded-[20px] border px-4 py-8 text-center ${cardBg}`}>
          <p className={`text-xs font-extrabold ${textMain}`}>No video classes match</p>
          <p className={`text-[11px] mt-1 ${textSub}`}>Try another subject or clear the search.</p>
        </div>
      )}
    </div>
  );
};

export default VideoClassesSection;
