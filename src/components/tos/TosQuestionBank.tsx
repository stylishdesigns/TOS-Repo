import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen, Plus, RefreshCw, Loader2, Pencil, Trash2, X, AlertTriangle,
  CheckCircle2, Send, Image as ImageIcon,
} from 'lucide-react';
import { api, Json, Card, Field, inputCls, btnPrimary, btnGhost } from './tosShared';

/**
 * Platform Question Bank (publish pipeline, TOS console).
 * Library, add/edit editor and the publish review screen, per the approved
 * design mockups. All data comes from /api/tos/questionbank; every mutation
 * is server-validated and the publish only runs after the staff member
 * reviews the change list in the review modal and clicks its confirm button.
 */

const DIFF_LABELS: Record<string, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const DIFF_STYLES: Record<string, string> = {
  easy: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  medium: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  hard: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};
const STATUS_LABELS: Record<string, string> = { draft: 'Draft', published: 'Published', removed: 'Removed' };
const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-700/40 text-slate-300 border-slate-600/40',
  published: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  removed: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};

interface QuestionForm {
  id: string; // '' for a new question
  subject: string; klass: string; difficulty: string; text: string;
  options: string[]; // exactly four, index 0 = A
  correct: number; // 0-3
  explanation: string; imageLink: string;
}

const emptyForm = (): QuestionForm => ({
  id: '', subject: '', klass: '', difficulty: 'easy', text: '',
  options: ['', '', '', ''], correct: 0, explanation: '', imageLink: '',
});

const diffPill = (d: string) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold ${DIFF_STYLES[d] || 'bg-slate-700/40 text-slate-300 border-slate-600/40'}`}>
    {DIFF_LABELS[d] || d}
  </span>
);
const statusPill = (s: string) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold ${STATUS_STYLES[s] || 'bg-slate-700/40 text-slate-300 border-slate-600/40'}`}>
    {STATUS_LABELS[s] || s}
  </span>
);

export const QuestionBankTab: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const [data, setData] = useState<Json | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  // Filters
  const [fSubject, setFSubject] = useState('');
  const [fClass, setFClass] = useState('');
  const [fDifficulty, setFDifficulty] = useState('');
  const [fSearch, setFSearch] = useState('');

  // Editor
  const [editor, setEditor] = useState<QuestionForm | null>(null);
  const [editorError, setEditorError] = useState('');
  const [saving, setSaving] = useState(false);

  // Publish review
  const [preview, setPreview] = useState<Json | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<Json | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const d = await api('/api/tos/questionbank');
      setData(d);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const questions: any[] = useMemo(() => (data?.questions || []) as any[], [data]);
  const subjects: string[] = useMemo(() => (data?.subjects || []) as string[], [data]);
  const klasses: string[] = useMemo(
    () => Array.from(new Set(questions.map((q) => q.klass).filter(Boolean))).sort((a: string, b: string) => a.localeCompare(b)),
    [questions],
  );

  const filtered = useMemo(() => questions.filter((q) => {
    if (q.status === 'removed') return false;
    if (fSubject && q.subject !== fSubject) return false;
    if (fClass && q.klass !== fClass) return false;
    if (fDifficulty && q.difficulty !== fDifficulty) return false;
    if (fSearch && !q.text.toLowerCase().includes(fSearch.toLowerCase())) return false;
    return true;
  }), [questions, fSubject, fClass, fDifficulty, fSearch]);

  const counts = data?.counts || {};

  const openEditor = (q: any | null) => {
    setEditorError('');
    if (!q) { setEditor(emptyForm()); return; }
    setEditor({
      id: q.id, subject: q.subject || '', klass: q.klass || '', difficulty: q.difficulty || 'easy',
      text: q.text || '', options: (q.options || []).map((o: any) => o.text || ''), correct: (q.options || []).findIndex((o: any) => o.key === q.correct),
      explanation: q.explanation || '', imageLink: q.imageLink || '',
    });
  };

  const saveQuestion = async () => {
    if (!editor) return;
    setEditorError('');
    setSaving(true);
    try {
      const body = {
        subject: editor.subject, klass: editor.klass, difficulty: editor.difficulty, text: editor.text,
        options: editor.options.map((t, i) => ({ key: 'ABCD'[i], text: t })),
        correct: 'ABCD'[editor.correct], explanation: editor.explanation, imageLink: editor.imageLink,
      };
      if (editor.id) {
        await api(`/api/tos/questionbank/questions/${editor.id}`, { method: 'POST', body });
      } else {
        await api('/api/tos/questionbank/questions', { method: 'POST', body });
      }
      setEditor(null);
      await load();
    } catch (e: any) {
      setEditorError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const removeQuestion = async (q: any) => {
    setNotice('');
    setBusy(true);
    try {
      await api(`/api/tos/questionbank/questions/${q.id}`, { method: 'DELETE' });
      await load();
    } catch (e: any) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  };

  const openPublish = async () => {
    setPreview(null); setPreviewError(''); setPublishResult(null);
    setPreviewLoading(true);
    try {
      setPreview(await api('/api/tos/questionbank/publish-preview'));
    } catch (e: any) {
      setPreviewError(e.message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const runPublish = async () => {
    if (!preview) return;
    setPublishing(true);
    setPreviewError('');
    try {
      const r = await api('/api/tos/questionbank/publish', { method: 'POST', body: { confirm: 'PUBLISH' } });
      setPublishResult(r);
      setPreview(null);
      await load();
    } catch (e: any) {
      setPreviewError(e.message);
    } finally {
      setPublishing(false);
    }
  };

  if (error) return <p className="text-rose-300 text-sm">{error}</p>;
  if (!data) return <div className="flex items-center gap-2 text-slate-400 text-sm py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;

  return (
    <div className="space-y-5">
      {/* Header actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => openEditor(null)} className={btnPrimary}><Plus className="w-4 h-4" /> Add question</button>
          <button onClick={openPublish} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-orange-500/50 bg-orange-500/10 hover:bg-orange-500/20 disabled:opacity-50 text-orange-300 font-bold text-sm transition-all">
            <Send className="w-4 h-4" /> Publish changes
          </button>
          <button onClick={load} disabled={busy} className={btnGhost}><RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} /> Refresh</button>
        </div>
        {notice && <p className="text-xs text-rose-300">{notice}</p>}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-slate-900/70 border border-white/10 rounded-2xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total questions</p>
          <p className="text-2xl font-black text-white mt-1">{counts.total ?? 0}</p>
          <p className="text-[11px] text-slate-400 mt-1">{counts.drafts || 0} drafts · {counts.published || 0} published</p>
        </div>
        <div className="bg-slate-900/70 border border-white/10 rounded-2xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Subjects</p>
          <p className="text-2xl font-black text-white mt-1">{subjects.length}</p>
          <p className="text-[11px] text-slate-400 mt-1 truncate">{subjects.slice(0, 4).join(', ') || '—'}</p>
        </div>
        <div className="bg-slate-900/70 border border-orange-500/30 rounded-2xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Last published</p>
          <p className="text-2xl font-black text-orange-300 mt-1">{data.meta?.currentVersion ? `v${data.meta.currentVersion}` : 'Never'}</p>
          <p className="text-[11px] text-slate-400 mt-1">
            {data.meta?.currentPublishedAt ? new Date(data.meta.currentPublishedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Publish to make questions live'}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select value={fSubject} onChange={(e) => setFSubject(e.target.value)} className={`${inputCls} max-w-44`}>
          <option value="">All subjects</option>
          {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={fClass} onChange={(e) => setFClass(e.target.value)} className={`${inputCls} max-w-44`}>
          <option value="">All classes</option>
          {klasses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={fDifficulty} onChange={(e) => setFDifficulty(e.target.value)} className={`${inputCls} max-w-40`}>
          <option value="">All difficulties</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
        <input value={fSearch} onChange={(e) => setFSearch(e.target.value)} placeholder="Search question text" className={`${inputCls} max-w-64`} />
      </div>

      {/* Library table */}
      <Card title="Question library">
        {filtered.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-sm">
            <BookOpen className="w-8 h-8 mx-auto mb-3 text-slate-600" />
            {questions.length === 0 ? 'No questions yet. Add the first question, then publish to make it live.' : 'No questions match these filters.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-white/5">
                  <th className="pb-2 pr-3">Question</th>
                  <th className="pb-2 pr-3">Subject</th>
                  <th className="pb-2 pr-3">Class</th>
                  <th className="pb-2 pr-3">Difficulty</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2 pr-3">Updated</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 100).map((q) => (
                  <tr key={q.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="py-2.5 pr-3 max-w-md">
                      <p className="text-white truncate" title={q.text}>{q.text}</p>
                      {q.imageLink && <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5"><ImageIcon className="w-3 h-3" /> has image</p>}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-300">{q.subject}</td>
                    <td className="py-2.5 pr-3 text-slate-300">{q.klass}</td>
                    <td className="py-2.5 pr-3">{diffPill(q.difficulty)}</td>
                    <td className="py-2.5 pr-3">{statusPill(q.status)}</td>
                    <td className="py-2.5 pr-3 text-slate-400 text-xs">{q.updatedAt ? new Date(q.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—'}</td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => openEditor(q)} className="p-1.5 rounded-lg text-slate-400 hover:text-orange-300 hover:bg-white/5" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => removeQuestion(q)} disabled={busy} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-white/5" title="Remove"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > 100 && <p className="text-[11px] text-slate-500 mt-2">Showing the first 100 of {filtered.length} matches. Use the filters to narrow.</p>}
          </div>
        )}
      </Card>

      {/* Add / edit question modal */}
      {editor && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" onClick={() => setEditor(null)}>
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-7 max-w-2xl w-full shadow-2xl my-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-5">
              <h3 className="text-white font-bold text-lg">{editor.id ? 'Edit question' : 'Add question'}</h3>
              <button onClick={() => setEditor(null)} className="text-slate-500 hover:text-slate-300"><X className="w-5 h-5" /></button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Subject">
                <input list="qb-subjects" value={editor.subject} onChange={(e) => setEditor({ ...editor, subject: e.target.value })} placeholder="e.g. Mathematics" className={inputCls} />
                <datalist id="qb-subjects">{subjects.map((s) => <option key={s} value={s} />)}</datalist>
              </Field>
              <Field label="Class">
                <input list="qb-klasses" value={editor.klass} onChange={(e) => setEditor({ ...editor, klass: e.target.value })} placeholder="e.g. SS2" className={inputCls} />
                <datalist id="qb-klasses">{klasses.map((s) => <option key={s} value={s} />)}</datalist>
              </Field>
            </div>

            <div className="mt-3">
              <Field label="Difficulty">
                <div className="flex items-center gap-4">
                  {['easy', 'medium', 'hard'].map((d, i) => (
                    <label key={d} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                      <input type="radio" name="qb-difficulty" checked={editor.difficulty === d} onChange={() => setEditor({ ...editor, difficulty: d })} className="accent-orange-500" />
                      {DIFF_LABELS[d]}
                    </label>
                  ))}
                </div>
              </Field>
            </div>

            <div className="mt-3">
              <Field label="Question text">
                <textarea value={editor.text} onChange={(e) => setEditor({ ...editor, text: e.target.value })} rows={3} placeholder="Type the question" className={inputCls} />
                <p className="text-[11px] text-slate-500 mt-1">LaTeX supported: wrap formulas in $...$</p>
              </Field>
            </div>

            <div className="mt-3">
              <Field label="Answer options">
                <div className="space-y-2">
                  {editor.options.map((t, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-slate-800 text-slate-300 text-xs font-black flex items-center justify-center shrink-0">{'ABCD'[i]}</span>
                      <input value={t} onChange={(e) => { const o = [...editor.options]; o[i] = e.target.value; setEditor({ ...editor, options: o }); }} placeholder={`Option ${'ABCD'[i]}`} className={inputCls} />
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-400 shrink-0 cursor-pointer">
                        <input type="radio" name="qb-correct" checked={editor.correct === i} onChange={() => setEditor({ ...editor, correct: i })} className="accent-orange-500" />
                        Correct
                      </label>
                    </div>
                  ))}
                </div>
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <Field label="Explanation (optional)">
                <textarea value={editor.explanation} onChange={(e) => setEditor({ ...editor, explanation: e.target.value })} rows={2} placeholder="Shown to students after answering" className={inputCls} />
              </Field>
              <Field label="Image link (optional)">
                <input value={editor.imageLink} onChange={(e) => setEditor({ ...editor, imageLink: e.target.value })} placeholder="https://res.cloudinary.com/..." className={inputCls} />
                <p className="text-[11px] text-slate-500 mt-1">Upload the image in Cloudinary and paste its https link here.</p>
              </Field>
            </div>

            {editorError && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 mt-4 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                <p className="text-rose-200 text-xs">{editorError}</p>
              </div>
            )}

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setEditor(null)} className={btnGhost}>Cancel</button>
              <button onClick={saveQuestion} disabled={saving} className={btnPrimary}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} {editor.id ? 'Save changes' : 'Add question'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Publish review modal */}
      {previewLoading && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="flex items-center gap-2 text-slate-300 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Building the publish preview…</div>
        </div>
      )}
      {preview && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" onClick={() => setPreview(null)}>
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-7 max-w-3xl w-full shadow-2xl my-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-5">
              <h3 className="text-white font-bold text-lg">Review before publishing</h3>
              <button onClick={() => setPreview(null)} className="text-slate-500 hover:text-slate-300"><X className="w-5 h-5" /></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-950/50 border border-white/10 rounded-2xl p-4">
                <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-3">Changes since last publish</h4>
                <div className="flex flex-wrap gap-2 mb-3">
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 text-xs font-bold">Added {preview.added}</span>
                  <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 text-xs font-bold">Edited {preview.edited}</span>
                  <span className="px-2.5 py-1 rounded-full bg-rose-500/15 text-rose-300 text-xs font-bold">Removed {preview.removed}</span>
                </div>
                <div className="max-h-52 overflow-y-auto space-y-1.5">
                  {(preview.changes || []).slice(0, 50).map((c: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px] font-bold shrink-0">{c.subject}</span>
                      <span className="px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-300 text-[10px] font-bold shrink-0">{c.action}:</span>
                      <span className="text-slate-300 truncate">{c.title}</span>
                    </div>
                  ))}
                  {(preview.changes || []).length > 50 && <p className="text-[11px] text-slate-500 pt-1">+ {(preview.changes || []).length - 50} more changes.</p>}
                  {(preview.changes || []).length === 0 && <p className="text-slate-500 text-xs">Nothing has changed since the last publish.</p>}
                </div>
              </div>

              <div className="bg-slate-950/50 border border-white/10 rounded-2xl p-4">
                <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-3">Publish summary</h4>
                <div className="space-y-2 text-sm">
                  <p className="text-white font-bold text-lg">New version v{preview.nextVersion}</p>
                  <p className="text-slate-300"><span className="text-slate-500">Subjects:</span> {(preview.subjects || []).join(', ') || '—'}</p>
                  <p className="text-slate-300"><span className="text-slate-500">Questions in the live file:</span> {preview.liveCount}</p>
                  <p className="text-slate-300"><span className="text-slate-500">File:</span> {preview.fileName}</p>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mt-4 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-amber-200 text-xs leading-relaxed">
                    This writes a new versioned file to Cloudinary and marks the changes published. Versioned files are never overwritten: every publish gets its own filename, so old versions stay intact.
                  </p>
                </div>
              </div>
            </div>

            {previewError && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 mt-4 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                <p className="text-rose-200 text-xs">{previewError}</p>
              </div>
            )}

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setPreview(null)} className={btnGhost}>Cancel</button>
              <button onClick={runPublish} disabled={publishing} className={btnPrimary}>{publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Publish v{preview.nextVersion}</button>
            </div>
          </div>
        </div>
      )}

      {/* Publish result */}
      {publishResult && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPublishResult(null)}>
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-7 max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-emerald-400" /></div>
              <div>
                <h3 className="text-white font-bold">Version v{publishResult.version} published</h3>
                <p className="text-slate-400 text-xs">{publishResult.counts.live} questions live</p>
              </div>
            </div>
            <div className="text-xs text-slate-300 space-y-1 bg-slate-950/60 border border-white/10 rounded-xl p-4">
              <p>Added {publishResult.counts.added} · Edited {publishResult.counts.edited} · Removed {publishResult.counts.removed}</p>
              <p className="break-all text-slate-500">{publishResult.fileUrl}</p>
            </div>
            <button onClick={() => setPublishResult(null)} className={`${btnPrimary} w-full mt-5`}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
};
