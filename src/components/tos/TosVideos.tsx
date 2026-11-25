import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MonitorPlay, Plus, RefreshCw, Search, Play, Pencil, Trash2, X,
  CheckCircle2, Film, GraduationCap, BookOpen,
} from 'lucide-react';
import { api, fmtDate, inputCls } from './tosShared';
import type { VideoResource } from '../../types';

/**
 * Video Resources (batch 41): the TOS console where platform staff add the
 * YouTube lesson videos every facility's students watch under Learning
 * Resources > Video classes. One video = one YouTube link the admin adds
 * once; it previews right here in the console and plays right here too, so
 * nothing has to be checked on YouTube first. Data lives in the server-only
 * videoResources collection; students read it through the student route.
 */

// The launch subjects first, then the common WAEC/JAMB ones. A fixed list
// keeps the library tidy; "Other" catches the rest.
const SUBJECTS = [
  'Mathematics', 'English Language', 'Chemistry', 'Physics', 'Biology',
  'Further Mathematics', 'Economics', 'Government', 'Literature-in-English',
  'Agricultural Science', 'Civic Education', 'Computer Studies', 'Commerce',
  'Accounting', 'Other',
];

/** Pulls the 11-character video id out of any normal YouTube URL shape.
 *  Mirrors the server's parser, so what the admin types is judged the same
 *  way the server will judge it. */
export function parseYoutubeId(raw: string): string | null {
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
}

export const thumbUrl = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
export const embedUrl = (id: string, autoplay = false) =>
  `https://www.youtube-nocookie.com/embed/${id}?rel=0${autoplay ? '&autoplay=1' : ''}`;

const emptyForm = { title: '', subject: 'Mathematics', topic: '', link: '', description: '' };

export const TosVideos: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const [videos, setVideos] = useState<VideoResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [query, setQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('All');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<VideoResource | null>(null);
  const [watching, setWatching] = useState<VideoResource | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setErr('');
    api('/api/tos/video-resources')
      .then((d: any) => setVideos(Array.isArray(d?.videos) ? d.videos : []))
      .catch((e: any) => setErr(e?.message || 'Loading the video list failed.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load, refreshKey]);

  const subjects = useMemo(() => {
    const list = Array.from(new Set<string>(videos.map((v) => v.subject).filter(Boolean)));
    return list.sort((a, b) => a.localeCompare(b));
  }, [videos]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return videos.filter((v) => {
      if (subjectFilter !== 'All' && v.subject !== subjectFilter) return false;
      if (!q) return true;
      return `${v.title} ${v.topic || ''} ${v.subject}`.toLowerCase().includes(q);
    });
  }, [videos, query, subjectFilter]);

  const parsedLink = parseYoutubeId(form.link);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormErr('');
    setFormOpen(true);
  };

  const openEdit = (v: VideoResource) => {
    setEditing(v);
    setForm({ title: v.title, subject: v.subject, topic: v.topic || '', link: v.youtubeUrl, description: v.description || '' });
    setFormErr('');
    setFormOpen(true);
  };

  const save = async () => {
    setFormErr('');
    if (!form.title.trim() || !form.subject) { setFormErr('Give the video a title and a subject.'); return; }
    if (!parsedLink) { setFormErr('Paste a YouTube video link, like https://www.youtube.com/watch?v=...'); return; }
    setBusy(true);
    try {
      if (editing) {
        const d: any = await api(`/api/tos/video-resources/${editing.id}`, { method: 'PATCH', body: form });
        if (d?.video) {
          setVideos((list) => list.map((v) => (v.id === editing.id ? { ...v, ...form, ...d.video } : v)));
        } else {
          setVideos((list) => list.map((v) => (v.id === editing.id ? { ...v, ...form, youtubeUrl: `https://www.youtube.com/watch?v=${parseYoutubeId(form.link) || v.videoId}` } : v)));
        }
      } else {
        const d: any = await api('/api/tos/video-resources', { method: 'POST', body: form });
        if (d?.video) setVideos((list) => [d.video, ...list]);
      }
      setFormOpen(false);
      setEditing(null);
      setForm(emptyForm);
    } catch (e: any) {
      setFormErr(e?.message || 'Saving the video failed.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (v: VideoResource) => {
    setFormErr('');
    setBusy(true);
    try {
      await api(`/api/tos/video-resources/${v.id}`, { method: 'DELETE' });
      setVideos((list) => list.filter((x) => x.id !== v.id));
      setConfirmId('');
      if (watching?.id === v.id) setWatching(null);
    } catch (e: any) {
      setFormErr(e?.message || 'Deleting the video failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Toolbar: refresh on the left like every tab, add on the right. */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-white/10 bg-white/5 text-sm font-semibold text-slate-200 hover:bg-white/10 transition-colors disabled:opacity-50"
          title="Reload the video list"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-orange-500 text-sm font-extrabold text-white hover:bg-orange-400 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> Add video
        </button>
        <p className="text-xs text-slate-500 ml-auto">
          {loading ? 'Loading…' : `${videos.length} video${videos.length === 1 ? '' : 's'} · ${subjects.length || 0} subject${subjects.length === 1 ? '' : 's'}`}
        </p>
      </div>

      {err && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-100 flex items-center justify-between gap-3">
          <span>{err}</span>
          <button onClick={load} className="underline underline-offset-2 hover:text-white">Retry</button>
        </div>
      )}

      {/* Filters: subject chips + search */}
      {!loading && !err && videos.length > 0 && (
        <div className="space-y-3">
          <div className="flex gap-1.5 flex-wrap">
            {['All', ...subjects].map((s) => (
              <button
                key={s}
                onClick={() => setSubjectFilter(s)}
                className={`h-8 px-3.5 rounded-full text-xs font-bold transition-colors border ${
                  subjectFilter === s
                    ? 'bg-orange-500/15 text-orange-300 border-orange-500/40'
                    : 'text-slate-400 border-white/10 bg-white/5 hover:text-white hover:bg-white/10'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="relative max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title or topic"
              className={`${inputCls} pl-9`}
              aria-label="Search videos"
            />
          </div>
        </div>
      )}

      {/* Loading: quiet skeleton cards, never a spinner */}
      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
              <div className="aspect-video bg-white/5" />
              <div className="p-4 space-y-2.5">
                <div className="h-3.5 w-3/4 rounded bg-white/5" />
                <div className="h-3 w-1/3 rounded bg-white/5" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !err && videos.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-orange-500/15 border border-orange-500/30 grid place-items-center mb-4">
            <MonitorPlay className="w-6 h-6 text-orange-400" />
          </div>
          <h3 className="text-sm font-bold text-white mb-1">No videos yet</h3>
          <p className="text-xs text-slate-400 mb-5 max-w-sm mx-auto">
            Add your first YouTube lesson. Students will find it under Learning Resources &gt; Video classes on their portal, organised by subject.
          </p>
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-orange-500 text-sm font-extrabold text-white hover:bg-orange-400 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add the first video
          </button>
        </div>
      )}

      {/* Video grid */}
      {!loading && shown.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((v) => (
            <div key={v.id} className="group rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden flex flex-col hover:border-white/20 transition-colors">
              <button
                onClick={() => setWatching(v)}
                className="relative block w-full aspect-video bg-slate-900"
                title="Watch this video here"
              >
                <img
                  src={thumbUrl(v.videoId)}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
                <span className="absolute inset-0 grid place-items-center">
                  <span className="w-12 h-12 rounded-full bg-black/60 border border-white/20 grid place-items-center group-hover:bg-orange-500 group-hover:border-orange-400 transition-colors">
                    <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                  </span>
                </span>
                <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 h-6 px-2 rounded-full bg-black/70 text-[10px] font-bold text-orange-200">
                  <BookOpen className="w-3 h-3" /> {v.subject}
                </span>
              </button>
              <div className="p-4 flex-1 flex flex-col gap-2">
                <h3 className="text-sm font-bold text-white leading-snug line-clamp-2">{v.title}</h3>
                <p className="text-[11px] text-slate-500 truncate">
                  {v.topic ? `${v.topic} · ` : ''}Added {fmtDate(v.addedAt)}
                </p>
                <div className="mt-auto flex items-center gap-2 pt-2">
                  <button
                    onClick={() => setWatching(v)}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-orange-500/15 border border-orange-500/30 text-xs font-bold text-orange-300 hover:bg-orange-500/25 transition-colors"
                  >
                    <Play className="w-3.5 h-3.5" /> Watch
                  </button>
                  <button
                    onClick={() => openEdit(v)}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-xs font-semibold text-slate-300 hover:bg-white/10 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                  {confirmId === v.id ? (
                    <span className="ml-auto inline-flex items-center gap-1.5">
                      <button
                        onClick={() => remove(v)}
                        disabled={busy}
                        className="h-8 px-3 rounded-lg bg-rose-600 text-xs font-bold text-white hover:bg-rose-500 transition-colors disabled:opacity-50"
                      >
                        Delete for good
                      </button>
                      <button
                        onClick={() => setConfirmId('')}
                        className="h-8 px-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white"
                      >
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmId(v.id)}
                      title="Delete this video"
                      className="ml-auto inline-flex items-center justify-center w-8 h-8 rounded-lg border border-white/10 bg-white/5 text-slate-500 hover:text-rose-300 hover:border-rose-500/40 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !err && videos.length > 0 && shown.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center">
          <p className="text-sm font-bold text-white">No videos match</p>
          <p className="text-xs text-slate-400 mt-1">Try another subject or clear the search.</p>
        </div>
      )}

      {formErr && !formOpen && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-100 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" /> {formErr}
        </div>
      )}

      {/* Watch modal: the video plays here in the console, never sent out to YouTube */}
      {watching && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setWatching(null)}>
          <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/5">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white truncate">{watching.title}</h3>
                <p className="text-[11px] text-slate-500 truncate">
                  {watching.subject}{watching.topic ? ` · ${watching.topic}` : ''}
                </p>
              </div>
              <button onClick={() => setWatching(null)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 shrink-0" aria-label="Close player">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="aspect-video bg-black">
              <iframe
                key={watching.videoId}
                src={embedUrl(watching.videoId, true)}
                title={watching.title}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
            {watching.description && (
              <p className="px-4 py-3 text-xs text-slate-400 leading-relaxed">{watching.description}</p>
            )}
          </div>
        </div>
      )}

      {/* Add / edit modal with a live preview that plays the link in place */}
      {formOpen && (
        <div className="fixed inset-0 z-[70] flex items-start md:items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto" onClick={() => !busy && setFormOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden my-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/5">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Film className="w-4 h-4 text-orange-400" />
                {editing ? 'Edit video' : 'Add a video'}
              </h3>
              <button onClick={() => !busy && setFormOpen(false)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5" aria-label="Close form">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1.5">YouTube link</label>
                <input
                  value={form.link}
                  onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className={inputCls}
                  autoComplete="off"
                  spellCheck={false}
                />
                {form.link.trim() && !parsedLink && (
                  <p className="mt-1.5 text-[11px] text-amber-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Not a single YouTube video link yet. watch?v= links, youtu.be links and Shorts all work; playlist links do not.
                  </p>
                )}
              </div>

              {parsedLink && (
                <div>
                  <p className="text-[11px] font-bold text-slate-400 mb-1.5">Preview: this is exactly what students will see</p>
                  <div className="rounded-xl overflow-hidden border border-white/10 aspect-video bg-black">
                    <iframe
                      key={parsedLink}
                      src={embedUrl(parsedLink)}
                      title="Video preview"
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1.5">Title</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Solving quadratic equations (WAEC/JAMB)"
                  className={inputCls}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1.5">Subject</label>
                  <div className="relative">
                    <GraduationCap className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                    <select
                      value={form.subject}
                      onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                      className={`${inputCls} pl-9`}
                    >
                      {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1.5">Topic (optional)</label>
                  <input
                    value={form.topic}
                    onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
                    placeholder="e.g. Quadratic equations"
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1.5">Short description (optional)</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="One line students read before they press play"
                  className={`${inputCls} min-h-[72px] resize-none`}
                />
              </div>

              {formErr && (
                <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-100">{formErr}</div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={() => setFormOpen(false)}
                  disabled={busy}
                  className="h-10 px-4 rounded-xl border border-white/10 bg-white/5 text-sm font-semibold text-slate-300 hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={busy || !parsedLink || !form.title.trim()}
                  className="h-10 px-5 rounded-xl bg-orange-500 text-sm font-extrabold text-white hover:bg-orange-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {busy ? 'Saving…' : editing ? 'Save changes' : 'Add video'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TosVideos;
