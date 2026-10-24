import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen, Plus, RefreshCw, Loader2, Pencil, Trash2, X, AlertTriangle,
  CheckCircle2, Send, Image as ImageIcon, ClipboardPaste, FileText, Copy, Eye,
} from 'lucide-react';
import { api, Json, Card, Field, inputCls, btnPrimary, btnGhost } from './tosShared';
import { parseBankPaste, BANK_FORMAT_GUIDE, ParsedBankQuestion } from '../../utils/questionParsing';
import { SENIOR_SUBJECTS, SUBJECT_NAMES, BANK_YEARS } from '../../data/seniorSubjects';

/**
 * Platform Question Bank (publish pipeline, TOS console).
 *
 * The bank is split into two independent streams with their own version
 * history and published file: PRACTICE (global, browser-cached until the next
 * publish) and MOCK (built after practice ships). Each carries one of two
 * exam pipelines: JAMB or WAEC/NECO. Questions arrive either one at a time
 * through the editor or in bulk through the paste box, which runs the same
 * parsing engine the centres' publisher uses and shows the parsed questions
 * for preview before anything is saved. Publishing writes ONE versioned file
 * per stream to Cloudinary (never overwriting) and only records anything
 * after the staff member reviews the change list and clicks its confirm
 * button.
 */

type Kind = 'practice' | 'mock';
type ExamType = 'jamb' | 'waec_neco';

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
const PIPELINE_LABELS: Record<string, string> = { jamb: 'JAMB', waec_neco: 'WAEC/NECO' };

interface QuestionForm {
  id: string; // '' for a new question
  examType: ExamType; year: string; topic: string;
  subject: string; klass: string; difficulty: string; text: string;
  options: string[]; // exactly four, index 0 = A
  correct: number; // 0-3
  explanation: string; imageLink: string;
}

interface ImportDefaults {
  examType: ExamType; subject: string; year: string; topic: string; difficulty: string;
}

const emptyForm = (): QuestionForm => ({
  id: '', examType: 'jamb', year: '', topic: '', subject: '', klass: '', difficulty: 'easy', text: '',
  options: ['', '', '', ''], correct: 0, explanation: '', imageLink: '',
});

const emptyImports = (): ImportDefaults => ({
  examType: 'jamb', subject: '', year: '', topic: '', difficulty: 'easy',
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
  const [kind, setKind] = useState<Kind>('practice');
  const [data, setData] = useState<Json | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  // Filters
  const [fSubject, setFSubject] = useState('');
  const [fClass, setFClass] = useState('');
  const [fPipeline, setFPipeline] = useState('');
  const [fDifficulty, setFDifficulty] = useState('');
  const [fSearch, setFSearch] = useState('');

  // Editor
  const [editor, setEditor] = useState<QuestionForm | null>(null);
  const [editorError, setEditorError] = useState('');
  const [saving, setSaving] = useState(false);

  // Paste import
  const [pasteText, setPasteText] = useState('');
  const [importDefaults, setImportDefaults] = useState<ImportDefaults>(emptyImports());
  const [parsed, setParsed] = useState<{ questions: ParsedBankQuestion[]; skippedEssay: number; skippedEmpty: number } | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importNotice, setImportNotice] = useState('');

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

  const questions: any[] = useMemo(() => (data?.questions || []).filter((q: any) => (q.kind || 'practice') === kind) as any[], [data, kind]);
  const subjects: string[] = useMemo(() => (data?.subjects || []) as string[], [data]);
  const topics: string[] = useMemo(() => (data?.topics || []) as string[], [data]);
  const klasses: string[] = useMemo(
    () => Array.from(new Set(questions.map((q) => q.klass).filter(Boolean))).sort((a: string, b: string) => a.localeCompare(b)),
    [questions],
  );
  const kindCounts = data?.counts?.[kind] || {};
  const kindMeta = data?.meta?.[kind] || {};

  const filtered = useMemo(() => questions.filter((q) => {
    if (q.status === 'removed') return false;
    if (fSubject && q.subject !== fSubject) return false;
    if (fClass && q.klass !== fClass) return false;
    if (fPipeline && (q.examType || 'jamb') !== fPipeline) return false;
    if (fDifficulty && q.difficulty !== fDifficulty) return false;
    if (fSearch && !q.text.toLowerCase().includes(fSearch.toLowerCase())) return false;
    return true;
  }), [questions, fSubject, fClass, fPipeline, fDifficulty, fSearch]);

  const openEditor = (q: any | null) => {
    setEditorError('');
    if (!q) { setEditor(emptyForm()); return; }
    setEditor({
      id: q.id, examType: (q.examType || 'jamb') as ExamType, year: q.year != null ? String(q.year) : '',
      topic: q.topic || '', subject: q.subject || '', klass: q.klass || '', difficulty: q.difficulty || 'easy',
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
        kind, examType: editor.examType,
        year: editor.year === '' ? null : Number(editor.year),
        topic: editor.topic, subject: editor.subject, klass: editor.klass,
        difficulty: editor.difficulty, text: editor.text,
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

  const runParse = () => {
    setImportNotice('');
    const r = parseBankPaste(pasteText);
    if (r.questions.length === 0) {
      setParsed(null);
      setImportNotice('Nothing parsed. Check that every question is numbered and has A to D options and an "Answer:" line.');
      return;
    }
    setParsed({ questions: r.questions, skippedEssay: r.skippedEssay, skippedEmpty: r.skippedEmpty });
  };

  const runImport = async () => {
    if (!parsed) return;
    setImportNotice('');
    if (!importDefaults.subject) { setImportNotice('Choose a subject for this batch first.'); return; }
    if (!importDefaults.topic) { setImportNotice('Choose a topic for this batch first.'); return; }
    if (kind === 'practice' && !importDefaults.year) { setImportNotice('Practice questions need a year. Pick one above the paste box.'); return; }
    setImporting(true);
    try {
      const r = await api('/api/tos/questionbank/import', {
        method: 'POST',
        body: {
          kind, examType: importDefaults.examType, subject: importDefaults.subject,
          year: importDefaults.year === '' ? null : Number(importDefaults.year),
          topic: importDefaults.topic, difficulty: importDefaults.difficulty,
          questions: parsed.questions,
        },
      });
      setParsed(null);
      setPasteText('');
      setImportNotice(`Imported ${r.imported} question${r.imported === 1 ? '' : 's'}${r.skipped ? `, ${r.skipped} skipped` : ''}. They are drafts until you publish.`);
      await load();
    } catch (e: any) {
      setImportNotice(e.message);
    } finally {
      setImporting(false);
    }
  };

  const openPublish = async () => {
    setPreview(null); setPreviewError(''); setPublishResult(null);
    setPreviewLoading(true);
    try {
      setPreview(await api(`/api/tos/questionbank/publish-preview?kind=${kind}`));
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
      const r = await api('/api/tos/questionbank/publish', { method: 'POST', body: { confirm: 'PUBLISH', kind } });
      setPublishResult(r);
      setPreview(null);
      await load();
    } catch (e: any) {
      setPreviewError(e.message);
    } finally {
      setPublishing(false);
    }
  };

  // Copy guide: mirrors the centres' own guide style, which always opens with
  // the batch setup (subject, topic, count and the rest) taken from the
  // fields above the paste box, then the question format itself.
  const pipelineLabelGuide = importDefaults.examType === 'jamb' ? 'JAMB' : 'WAEC/NECO';
  const dynamicGuide = [
    'SETUP FOR THIS BATCH (filled from the fields above the paste box):',
    `Exam pipeline: ${pipelineLabelGuide}`,
    `Subject: ${importDefaults.subject || '[pick a subject above]'}`,
    `Topic: ${importDefaults.topic || '[pick a topic above]'}`,
    `Year: ${importDefaults.year || (kind === 'practice' ? '[pick a year above]' : '[optional]')}`,
    `Difficulty: ${importDefaults.difficulty.charAt(0).toUpperCase() + importDefaults.difficulty.slice(1)}`,
    'Number of questions: as many as you paste (the preview shows the count)',
    '',
    'Paste only the questions into the box, not these setup lines.',
    '',
    BANK_FORMAT_GUIDE,
  ].join('\n');

  const copyGuide = async () => {
    try { await navigator.clipboard.writeText(dynamicGuide); setImportNotice('Format guide copied with your current setup.'); } catch { /* clipboard unavailable */ }
  };

  if (error) return <p className="text-rose-300 text-sm">{error}</p>;
  if (!data) return <div className="flex items-center gap-2 text-slate-400 text-sm py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;

  // Dropdown options for the editor's subject: the catalogue plus, when the
  // question carries a subject outside it, that subject itself so legacy
  // rows stay editable.
  const subjectOptions = (current: string): string[] => {
    if (current && !SUBJECT_NAMES.includes(current)) return [...SUBJECT_NAMES, current].sort((a, b) => a.localeCompare(b));
    return SUBJECT_NAMES;
  };

  const switchBtn = (k: Kind, label: string) => (
    <button
      onClick={() => setKind(k)}
      className={`px-5 py-2 rounded-xl text-sm font-bold border transition-all ${kind === k ? 'bg-orange-500/15 text-orange-300 border-orange-500/30' : 'text-slate-400 border-white/10 hover:text-white'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      {/* Stream switch */}
      <div className="flex items-center gap-2">
        {switchBtn('practice', 'Practice')}
        {switchBtn('mock', 'Mock')}
        <span className="text-[11px] text-slate-500 ml-1">Each stream publishes and versions separately.</span>
      </div>

      {/* Header actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={openPublish} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-orange-500/50 bg-orange-500/10 hover:bg-orange-500/20 disabled:opacity-50 text-orange-300 font-bold text-sm transition-all">
            <Send className="w-4 h-4" /> Publish changes
          </button>
          <button onClick={load} disabled={busy} className={btnGhost}><RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} /> Refresh</button>
        </div>
        {notice && <p className="text-xs text-rose-300">{notice}</p>}
      </div>

      {/* Paste import (parsing engine) */}
      <Card title="Add questions">
        <p className="text-xs text-slate-400 mb-3">Paste a whole past-paper section. It runs through the same parsing engine the centres use: numbered questions, A to D options, an Answer line and an Explanation line. Check the preview, then import everything as drafts.</p>

        {/* Shared defaults for the batch. Class is intentionally not part of
            the paste flow: questions carry pipeline, subject, year, topic and
            difficulty, and class stayed optional data. */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <Field label="Exam pipeline">
            <select value={importDefaults.examType} onChange={(e) => setImportDefaults({ ...importDefaults, examType: e.target.value as ExamType })} className={inputCls}>
              <option value="jamb">JAMB</option>
              <option value="waec_neco">WAEC/NECO</option>
            </select>
          </Field>
          <Field label="Subject">
            <select value={importDefaults.subject} onChange={(e) => setImportDefaults({ ...importDefaults, subject: e.target.value, topic: '' })} className={inputCls}>
              <option value="">Select subject</option>
              {SUBJECT_NAMES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Topic">
            <select value={importDefaults.topic} onChange={(e) => setImportDefaults({ ...importDefaults, topic: e.target.value })} disabled={!importDefaults.subject} className={`${inputCls} disabled:opacity-50`}>
              <option value="">{importDefaults.subject ? 'Select topic' : 'Pick a subject first'}</option>
              {(SENIOR_SUBJECTS[importDefaults.subject] || []).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label={kind === 'practice' ? 'Year' : 'Year (optional)'}>
            <select value={importDefaults.year} onChange={(e) => setImportDefaults({ ...importDefaults, year: e.target.value })} className={inputCls}>
              <option value="">Select year</option>
              {BANK_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </Field>
          <Field label="Difficulty">
            <select value={importDefaults.difficulty} onChange={(e) => setImportDefaults({ ...importDefaults, difficulty: e.target.value })} className={inputCls}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </Field>
        </div>

        <div className="flex items-center justify-between mb-2">
          <button onClick={() => setShowGuide(!showGuide)} className="text-[11px] font-bold text-orange-300 hover:text-orange-200 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" /> {showGuide ? 'Hide format guide' : 'Show format guide'}
          </button>
          <button onClick={copyGuide} className="text-[11px] text-slate-400 hover:text-orange-300 flex items-center gap-1.5"><Copy className="w-3.5 h-3.5" /> Copy guide</button>
        </div>
        {showGuide && (
          <pre className="bg-slate-950/80 border border-white/10 rounded-xl p-4 text-[11px] text-slate-300 leading-relaxed overflow-x-auto whitespace-pre-wrap mb-3">{dynamicGuide}</pre>
        )}

        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={8}
          placeholder={'1. What is the capital of Nigeria?\nA: Lagos\nB: Abuja\nC: Kano\nD: Ibadan\nAnswer: B\nExplanation: Abuja became the capital of Nigeria in 1991.'}
          className={`${inputCls} font-mono text-xs`}
        />

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button onClick={runParse} disabled={!pasteText.trim()} className={btnGhost}><Eye className="w-4 h-4" /> Parse & preview</button>
          {parsed && (
            <button onClick={runImport} disabled={importing} className={btnPrimary}>
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardPaste className="w-4 h-4" />}
              Import all {parsed.questions.length}
            </button>
          )}
        </div>

        {parsed && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 text-xs font-bold">{parsed.questions.length} parsed</span>
              {parsed.skippedEssay > 0 && (
                <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 text-xs font-bold">{parsed.skippedEssay} essay-style block{parsed.skippedEssay === 1 ? '' : 's'} skipped (objective only for now)</span>
              )}
              {parsed.skippedEmpty > 0 && (
                <span className="px-2.5 py-1 rounded-full bg-slate-700/40 text-slate-400 text-xs font-bold">{parsed.skippedEmpty} unreadable block{parsed.skippedEmpty === 1 ? '' : 's'} skipped</span>
              )}
            </div>
            {parsed.questions.every((q) => !q.correct) && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                <p className="text-rose-200 text-xs">No question has an "Answer:" line. Without a correct answer none of these will import.</p>
              </div>
            )}
            <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
              {parsed.questions.map((q, i) => (
                <div key={i} className="bg-slate-950/50 border border-white/10 rounded-xl p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-white font-semibold">Q{i + 1}. {q.text}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${q.correct ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
                      {q.correct ? `Answer ${q.correct}` : 'No answer'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-2">
                    {q.options.map((o) => (
                      <p key={o.key} className={`text-xs ${o.key === q.correct ? 'text-emerald-300 font-bold' : 'text-slate-400'}`}>{o.key}. {o.text || '(empty)'}</p>
                    ))}
                  </div>
                  {q.explanation && <p className="text-[11px] text-slate-500 mt-1.5">Explanation: {q.explanation}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {importNotice && <p className="text-xs text-slate-300 mt-3">{importNotice}</p>}
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-slate-900/70 border border-white/10 rounded-2xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total questions</p>
          <p className="text-2xl font-black text-white mt-1">{kindCounts.total ?? 0}</p>
          <p className="text-[11px] text-slate-400 mt-1">{kindCounts.drafts || 0} drafts · {kindCounts.published || 0} published</p>
        </div>
        <div className="bg-slate-900/70 border border-white/10 rounded-2xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Subjects</p>
          <p className="text-2xl font-black text-white mt-1">{subjects.length}</p>
          <p className="text-[11px] text-slate-400 mt-1 truncate">{subjects.slice(0, 4).join(', ') || '—'}</p>
        </div>
        <div className="bg-slate-900/70 border border-orange-500/30 rounded-2xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Last published</p>
          <p className="text-2xl font-black text-orange-300 mt-1">{kindMeta.currentVersion ? `v${kindMeta.currentVersion}` : 'Never'}</p>
          <p className="text-[11px] text-slate-400 mt-1">
            {kindMeta.currentPublishedAt ? new Date(kindMeta.currentPublishedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Publish to make questions live'}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select value={fSubject} onChange={(e) => setFSubject(e.target.value)} className={`${inputCls} max-w-44`}>
          <option value="">All subjects</option>
          {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={fPipeline} onChange={(e) => setFPipeline(e.target.value)} className={`${inputCls} max-w-36`}>
          <option value="">All pipelines</option>
          <option value="jamb">JAMB</option>
          <option value="waec_neco">WAEC/NECO</option>
        </select>
        <select value={fClass} onChange={(e) => setFClass(e.target.value)} className={`${inputCls} max-w-40`}>
          <option value="">All classes</option>
          {klasses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={fDifficulty} onChange={(e) => setFDifficulty(e.target.value)} className={`${inputCls} max-w-36`}>
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
            {questions.length === 0 ? 'No questions yet. Paste a batch below or add the first question, then publish to make it live.' : 'No questions match these filters.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-white/5">
                  <th className="pb-2 pr-3">Question</th>
                  <th className="pb-2 pr-3">Subject</th>
                  <th className="pb-2 pr-3">Year</th>
                  <th className="pb-2 pr-3">Pipeline</th>
                  <th className="pb-2 pr-3">Difficulty</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 100).map((q) => (
                  <tr key={q.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="py-2.5 pr-3 max-w-md">
                      <p className="text-white truncate" title={q.text}>{q.text}</p>
                      <p className="text-[10px] text-slate-500 truncate">{q.topic || '\u00a0'}{q.imageLink ? ' · has image' : ''}</p>
                    </td>
                    <td className="py-2.5 pr-3 text-slate-300">{q.subject}</td>
                    <td className="py-2.5 pr-3 text-slate-300">{q.year ?? '—'}</td>
                    <td className="py-2.5 pr-3 text-slate-300">{PIPELINE_LABELS[q.examType] || q.examType}</td>
                    <td className="py-2.5 pr-3">{diffPill(q.difficulty)}</td>
                    <td className="py-2.5 pr-3">{statusPill(q.status)}</td>
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={() => setEditor(null)}>
          <div className="min-h-full flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-white/10 rounded-3xl p-7 max-w-2xl w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-5">
              <h3 className="text-white font-bold text-lg">{editor.id ? 'Edit question' : 'Add question'}</h3>
              <button onClick={() => setEditor(null)} className="text-slate-500 hover:text-slate-300"><X className="w-5 h-5" /></button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Exam pipeline">
                <select value={editor.examType} onChange={(e) => setEditor({ ...editor, examType: e.target.value as ExamType })} className={inputCls}>
                  <option value="jamb">JAMB</option>
                  <option value="waec_neco">WAEC/NECO</option>
                </select>
              </Field>
              <Field label={kind === 'practice' ? 'Year' : 'Year (optional)'}>
                <select value={editor.year} onChange={(e) => setEditor({ ...editor, year: e.target.value })} className={inputCls}>
                  <option value="">Select year</option>
                  {BANK_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </Field>
              <Field label="Difficulty">
                <select value={editor.difficulty} onChange={(e) => setEditor({ ...editor, difficulty: e.target.value })} className={inputCls}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
              <Field label="Subject">
                <select value={editor.subject} onChange={(e) => setEditor({ ...editor, subject: e.target.value, topic: '' })} className={inputCls}>
                  <option value="">Select subject</option>
                  {subjectOptions(editor.subject).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Topic">
                <select value={editor.topic} onChange={(e) => setEditor({ ...editor, topic: e.target.value })} disabled={!editor.subject} className={`${inputCls} disabled:opacity-50`}>
                  <option value="">{editor.subject ? 'Select topic' : 'Pick a subject first'}</option>
                  {(SENIOR_SUBJECTS[editor.subject] || []).map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Class (optional)">
                <input list="qb-klasses" value={editor.klass} onChange={(e) => setEditor({ ...editor, klass: e.target.value })} placeholder="e.g. SS2" className={inputCls} />
                <datalist id="qb-klasses">{klasses.map((s) => <option key={s} value={s} />)}</datalist>
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
              <button onClick={saveQuestion} disabled={saving} className={btnPrimary}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} {editor.id ? 'Save changes' : 'Save question'}</button>
            </div>
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm overflow-y-auto" onClick={() => setPreview(null)}>
          <div className="min-h-full flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-white/10 rounded-3xl p-7 max-w-3xl w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-5">
              <h3 className="text-white font-bold text-lg capitalize">Review before publishing {preview.kind === 'practice' ? 'practice' : 'mock'}</h3>
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
        </div>
      )}

      {/* Publish result */}
      {publishResult && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPublishResult(null)}>
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-7 max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-emerald-400" /></div>
              <div>
                <h3 className="text-white font-bold capitalize">{publishResult.kind === 'practice' ? 'Practice' : 'Mock'} v{publishResult.version} published</h3>
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
