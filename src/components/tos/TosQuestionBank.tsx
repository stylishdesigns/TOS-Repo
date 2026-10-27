import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, X, AlertTriangle,
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

const PIPELINE_LABELS: Record<string, string> = { jamb: 'JAMB', waec_neco: 'WAEC/NECO' };

interface ImportDefaults {
  examType: ExamType; subject: string; year: string; topic: string; difficulty: string;
}

const emptyImports = (): ImportDefaults => ({
  examType: 'jamb', subject: '', year: '', topic: '', difficulty: 'easy',
});

// Stream choice is remembered on this device and shared with the Library
// screen, so both halves of Question Bank follow the same stream.
const QB_STREAM_KEY = 'TOS_qb_stream';

export const QuestionBankTab: React.FC<{ refreshKey: number; view?: 'edit' | 'publish'; kind?: Kind; onKindChange?: (k: Kind) => void }> = ({ refreshKey, view = 'edit', kind: kindProp, onKindChange }) => {
  // U1: the stream is chosen once in the shared Question Bank header; the
  // prop wins when the shell passes it, and the remembered local state only
  // serves the rare case where no shell is above this screen.
  const [kindState, setKindState] = useState<Kind>(() => {
    try { return localStorage.getItem(QB_STREAM_KEY) === 'mock' ? 'mock' : 'practice'; } catch { return 'practice'; }
  });
  const kind = kindProp ?? kindState;
  const setKind = (k: Kind) => {
    setKindState(k);
    try { localStorage.setItem(QB_STREAM_KEY, k); } catch { /* storage unavailable */ }
    onKindChange?.(k);
  };
  const [data, setData] = useState<Json | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Paste import
  const [pasteText, setPasteText] = useState('');
  const [importDefaults, setImportDefaults] = useState<ImportDefaults>(emptyImports());
  const [parsed, setParsed] = useState<{ questions: ParsedBankQuestion[]; skippedEssay: number; skippedEmpty: number } | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importNotice, setImportNotice] = useState('');
  const [dupAsk, setDupAsk] = useState<Json | null>(null); // L5: server found duplicates, waiting on skip/anyway

  // Publish review
  const [preview, setPreview] = useState<Json | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<Json | null>(null);

  // Library setup (Prompt L2): one-time backfill + recount for the new paged
  // library. TOS-only routes; nothing writes until you confirm a preview.
  const [setupTree, setSetupTree] = useState<Json | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupMsg, setSetupMsg] = useState('');
  const [setupPreview, setSetupPreview] = useState<Json | null>(null);
  const [setupStage, setSetupStage] = useState<'backfill' | 'recount' | null>(null);


  const applyList = (r: Json, mode: 'replace' | 'more') => {
    const rows = ((r.items || []) as any[]).map((it) => ({ ...it, text: it.textPreview }));
    setData((prev: Json | null) => {
      const prevRows: any[] = mode === 'more' ? (prev?.questions || []) : [];
      const merged = [...prevRows, ...rows];
      return {
        questions: merged,
        subjects: Array.from(new Set(merged.map((q: any) => q.subject).filter(Boolean))).sort((a: string, b: string) => a.localeCompare(b)),
        topics: Array.from(new Set(merged.map((q: any) => q.topic).filter(Boolean))).sort((a: string, b: string) => a.localeCompare(b)),
        counts: { [r.kind]: { total: Number(r.tabs?.total) || 0, drafts: Number(r.tabs?.draft) || 0, published: Number(r.tabs?.published) || 0, removed: Number(r.tabs?.removed) || 0, changed: Number(r.tabs?.changed) || 0 } },
        meta: { [r.kind]: r.meta || {} },
      };
    });
  };

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await api(`/api/tos/questionbank/list?kind=${kind}&status=all&sort=updated&limit=100`);
      applyList(r, 'replace');
    } catch (e: any) {
      setError(e.message);
    }
  }, [kind]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const loadTree = useCallback(async () => {
    try { setSetupTree(await api(`/api/tos/questionbank/tree?kind=${kind}`)); } catch { setSetupTree(null); }
  }, [kind]);
  useEffect(() => { loadTree(); }, [loadTree, refreshKey]);

  const setupNeeded = Boolean(setupTree && setupTree.setupNeeded);

  const openSetupPreview = async (stage: 'backfill' | 'recount') => {
    setSetupBusy(true); setSetupMsg('');
    try {
      const route = stage === 'backfill' ? 'backfill-preview' : 'recount-preview';
      setSetupPreview(await api(`/api/tos/questionbank/${route}?kind=${kind}`));
      setSetupStage(stage);
    } catch (e: any) { setSetupMsg(e.message); }
    setSetupBusy(false);
  };

  const runBackfill = async () => {
    setSetupBusy(true); setSetupMsg('');
    try {
      let cursor: string | null = null;
      let updated = 0;
      let rounds = 0;
      for (;;) {
        const r: Json = await api('/api/tos/questionbank/backfill', {
          method: 'POST',
          body: { confirm: 'BACKFILL', kind, cursor, maxDocs: 400 },
        });
        updated += Number(r.updated) || 0;
        rounds += 1;
        setSetupMsg(`Backfill running: ${updated} questions keyed so far...`);
        if (r.done || rounds > 500) break;
        cursor = r.nextCursor || null;
      }
      setSetupPreview(null); setSetupStage(null);
      setSetupMsg(`Backfill done: ${updated} questions now carry search keys. Next step: Recount.`);
      await loadTree();
    } catch (e: any) { setSetupMsg(e.message); }
    setSetupBusy(false);
  };

  const runRecount = async () => {
    setSetupBusy(true); setSetupMsg('');
    try {
      const r: Json = await api('/api/tos/questionbank/recount', { method: 'POST', body: { confirm: 'RECOUNT', kind } });
      setSetupPreview(null); setSetupStage(null);
      setSetupMsg(`Recount done: ${r.total} live questions counted across ${r.subjects} subjects.`);
      await loadTree();
      await load();
    } catch (e: any) { setSetupMsg(e.message); }
    setSetupBusy(false);
  };

  const kindCounts = data?.counts?.[kind] || {};
  const kindMeta = data?.meta?.[kind] || {};

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

  const doImport = async (body: Json) => {
    setImporting(true);
    try {
      const r = await api('/api/tos/questionbank/import', { method: 'POST', body });
      if (r.needsDecision) { setDupAsk({ body, info: r }); return; }
      setDupAsk(null);
      setParsed(null);
      setPasteText('');
      setImportNotice(
        r.imported === 0 && r.note
          ? r.note
          : `Imported ${r.imported} question${r.imported === 1 ? '' : 's'}${r.duplicateSkipped ? `, ${r.duplicateSkipped} duplicate${r.duplicateSkipped === 1 ? '' : 's'} skipped` : ''}${r.skipped ? `, ${r.skipped} skipped` : ''}. They are drafts until you publish.`
      );
      await load();
    } catch (e: any) {
      setImportNotice(e.message);
    } finally {
      setImporting(false);
    }
  };

  const runImport = async () => {
    if (!parsed) return;
    setImportNotice('');
    if (!importDefaults.subject) { setImportNotice('Choose a subject in Step 1 first.'); return; }
    if (!importDefaults.topic) { setImportNotice('Choose a topic in Step 1 first.'); return; }
    if (kind === 'practice' && !importDefaults.year) { setImportNotice('Practice questions need a year. Pick one in Step 1.'); return; }
    await doImport({
      kind, examType: importDefaults.examType, subject: importDefaults.subject,
      // Mock questions carry no year and no difficulty; the server enforces it.
      year: kind === 'mock' ? null : (importDefaults.year === '' ? null : Number(importDefaults.year)),
      topic: importDefaults.topic, difficulty: kind === 'mock' ? null : importDefaults.difficulty,
      questions: parsed.questions,
    });
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
    'SETUP FOR THIS BATCH (filled from Step 1):',
    `Exam pipeline: ${pipelineLabelGuide}`,
    `Subject: ${importDefaults.subject || '[pick a subject in Step 1]'}`,
    `Topic: ${importDefaults.topic || '[pick a topic in Step 1]'}`,
    ...(kind === 'mock' ? [] : [
      `Year: ${importDefaults.year || '[pick a year in Step 1]'}`,
      `Difficulty: ${importDefaults.difficulty.charAt(0).toUpperCase() + importDefaults.difficulty.slice(1)}`,
    ]),
    'Number of questions: as many as you paste (Step 3 shows the count)',
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

  return (
    <div className="space-y-5">
      {view === 'publish' && (
        <>
          {/* U5: the Publish tab tidied into one status card: what is live now,
              what is waiting, and the publish button, with a proper empty state
              for a stream that has no questions yet. Same handler (openPublish)
              and the same counters the Import tab already loaded; no new reads. */}
          <Card title="Publish">
            {Number(kindCounts.total) > 0 ? (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white">
                      {kindMeta.currentVersion
                        ? `Live now: v${kindMeta.currentVersion}${kindMeta.currentPublishedAt ? `, published ${new Date(kindMeta.currentPublishedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}`
                        : 'Nothing published yet in this stream.'}
                    </p>
                    <p className="text-sm text-slate-400 mt-0.5">
                      {Number(kindCounts.changed) > 0
                        ? `${kindCounts.changed} change${Number(kindCounts.changed) === 1 ? '' : 's'} waiting to go live.`
                        : kindMeta.currentVersion
                          ? 'Everything in this stream is already live.'
                          : 'Publish to make your questions live for students.'}
                    </p>
                  </div>
                  <button onClick={openPublish} className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-orange-500/50 bg-orange-500/10 hover:bg-orange-500/20 disabled:opacity-50 text-orange-300 font-bold text-sm transition-all shrink-0">
                    <Send className="w-4 h-4" /> Publish changes
                  </button>
                </div>
                <p className="text-sm text-slate-500">Publishing writes one versioned file to Cloudinary and marks every change live. You preview the change list first; nothing writes until you confirm.</p>
              </>
            ) : (
              <div className="text-center py-10">
                <div className="w-12 h-12 rounded-2xl bg-slate-800/60 border border-white/10 flex items-center justify-center mx-auto mb-3">
                  <Send className="w-5 h-5 text-slate-500" />
                </div>
                <p className="text-sm font-bold text-white">Nothing to publish yet</p>
                <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">This stream has no questions. Open Import &amp; edit, paste your first batch, then come back here to publish it.</p>
              </div>
            )}
            {notice && <p className="text-sm text-rose-300 mt-2">{notice}</p>}
          </Card>
        </>
      )}
      {view === 'edit' && (
        <>
      {/* U1: the stream toggle and Refresh live in the shared Question Bank
          header now, so this tab starts straight at its content. */}
      {notice && <p className="text-xs text-rose-300">{notice}</p>}

      {/* U4: import presented as four numbered steps. The handlers are the same
    ones this screen always had (runParse, runImport, dupAsk); only the
    presentation is new, so the whole flow reads top to bottom on a phone. */}
      <Card title="Import questions">
        <p className="text-sm text-slate-400 mb-4">Four steps, top to bottom: choose where the batch goes, paste the questions, check what was parsed, then import. Everything arrives as a draft; publishing makes it live.</p>

        {/* Step 1: where the batch goes */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-start gap-3 mb-3">
            <span className="w-8 h-8 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-300 text-sm font-black flex items-center justify-center shrink-0">1</span>
            <div>
              <p className="text-sm font-bold text-white">Where these questions go</p>
              <p className="text-xs text-slate-400 mt-0.5">One choice for the whole batch: every question pasted below arrives with this subject, topic, year and pipeline.</p>
            </div>
          </div>

          {/* Shared defaults for the batch. Class is intentionally not part of
              the paste flow: questions carry pipeline, subject, year, topic and
              difficulty, and class stayed optional data. */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
            {kind !== 'mock' && (
              <>
                <Field label="Year">
                  <select value={importDefaults.year} onChange={(e) => setImportDefaults({ ...importDefaults, year: e.target.value })} className={inputCls}>
                    <option value="">Select year</option>
                    {BANK_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </Field>
                <Field label="Difficulty">
                  <select value={importDefaults.difficulty} onChange={(e) => setImportDefaults({ ...importDefaults, difficulty: e.target.value })} className={inputCls}>
                    <option value="easy">Easy</option>
                    <option value="hard">Hard</option>
                  </select>
                </Field>
              </>
            )}
          </div>
        </div>

        {/* Step 2: paste */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 mt-3">
          <div className="flex items-start gap-3 mb-3">
            <span className="w-8 h-8 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-300 text-sm font-black flex items-center justify-center shrink-0">2</span>
            <div>
              <p className="text-sm font-bold text-white">Paste the questions</p>
              <p className="text-xs text-slate-400 mt-0.5">Paste only the questions into the box, not the setup lines. Numbered questions, A to D options, an Answer line, an Explanation line.</p>
            </div>
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
        </div>

        {/* Step 3: preview */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 mt-3">
          <div className="flex items-start gap-3 mb-3">
            <span className="w-8 h-8 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-300 text-sm font-black flex items-center justify-center shrink-0">3</span>
            <div>
              <p className="text-sm font-bold text-white">Check the preview</p>
              <p className="text-xs text-slate-400 mt-0.5">The parsing engine reads the paste and shows every question it found. Fix anything the preview flags before importing.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={runParse} disabled={!pasteText.trim()} className={btnGhost}><Eye className="w-4 h-4" /> Parse & preview</button>
            {parsed && (
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 text-xs font-bold">{parsed.questions.length} parsed</span>
            )}
            {parsed && parsed.skippedEssay > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 text-xs font-bold">{parsed.skippedEssay} essay-style block{parsed.skippedEssay === 1 ? '' : 's'} skipped (objective only for now)</span>
            )}
            {parsed && parsed.skippedEmpty > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-slate-700/40 text-slate-400 text-xs font-bold">{parsed.skippedEmpty} unreadable block{parsed.skippedEmpty === 1 ? '' : 's'} skipped</span>
            )}
          </div>

          {parsed && parsed.questions.every((q) => !q.correct) && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 flex items-start gap-2 mt-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
              <p className="text-rose-200 text-xs">No question has an "Answer:" line. Without a correct answer none of these will import.</p>
            </div>
          )}

          {parsed && (
            <div className="max-h-80 overflow-y-auto space-y-2 pr-1 mt-3">
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
          )}

          {!parsed && <p className="text-xs text-slate-500 mt-2">Nothing parsed yet. Paste in Step 2, then run the preview.</p>}
        </div>

        {/* Step 4: import */}
        <div className="rounded-2xl border border-orange-500/25 bg-white/[0.02] p-4 mt-3">
          <div className="flex items-start gap-3 mb-3">
            <span className="w-8 h-8 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-300 text-sm font-black flex items-center justify-center shrink-0">4</span>
            <div>
              <p className="text-sm font-bold text-white">Import as drafts</p>
              <p className="text-xs text-slate-400 mt-0.5">The whole batch goes in with the Step 1 choices. Drafts are not live for students; the Publish tab makes them live.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={runImport} disabled={importing || !parsed} className={btnPrimary}>
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardPaste className="w-4 h-4" />}
              {parsed ? `Import all ${parsed.questions.length}` : 'Import'}
            </button>
            {!parsed && <p className="text-xs text-slate-500">Run the preview in Step 3 first.</p>}
          </div>

          {importNotice && (
            <p className="text-xs font-bold text-amber-300 mt-2">{importNotice}</p>
          )}
          {dupAsk && (
            <div className="rounded-2xl border border-amber-500/50 bg-amber-500/10 p-3.5 mt-2 space-y-2">
              <p className="text-sm font-bold text-amber-200">{dupAsk.info.duplicateCount} of {dupAsk.info.total} questions in this paste already exist in the bank</p>
              <p className="text-xs text-amber-200/80">{dupAsk.info.note}</p>
              {(dupAsk.info.samples || []).length > 0 && (
                <ul className="text-xs text-slate-400 space-y-1">
                  {(dupAsk.info.samples as string[]).map((t, i) => <li key={i} className="truncate">- {t}</li>)}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                <button className={btnPrimary} disabled={importing} onClick={() => doImport({ ...dupAsk.body, duplicates: 'skip' })}>
                  {importing ? 'Importing...' : 'Skip duplicates, import the rest'}
                </button>
                <button className={btnGhost} disabled={importing} onClick={() => doImport({ ...dupAsk.body, duplicates: 'import' })}>Import all anyway</button>
                <button className={btnGhost} disabled={importing} onClick={() => setDupAsk(null)}>Never mind</button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Summary cards */}
      {setupNeeded && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200 space-y-3">
          <p className="font-bold text-amber-100">Set up needed</p>
          <p className="text-amber-200/90">
            The new library needs a one-time setup for this stream before search and counts work:
            Backfill adds search keys to existing questions, then Recount builds the counts.
            Nothing is written until you confirm each step after its preview. Existing questions
            only become searchable on the new screen once the backfill finishes.
          </p>
          <div className="flex flex-wrap gap-2">
            <button className={btnPrimary} disabled={setupBusy} onClick={() => openSetupPreview('backfill')}>Preview backfill</button>
            <button className={btnGhost} disabled={setupBusy} onClick={() => openSetupPreview('recount')}>Preview recount</button>
          </div>
          {setupStage === 'backfill' && setupPreview && (
            <div className="rounded-xl border border-amber-500/30 bg-slate-950/60 p-3 text-amber-100 space-y-2">
              <p>Backfill will update <b>{setupPreview.needing}</b> of {setupPreview.total} questions with search keys ({setupPreview.writeOps} writes). Duplicate groups found by the new fingerprint: <b>{setupPreview.dupGroups}</b>.</p>
              <p className="text-xs text-amber-200/80">{setupPreview.note}</p>
              <div className="flex gap-2">
                <button className={btnPrimary} disabled={setupBusy} onClick={runBackfill}>Confirm backfill</button>
                <button className={btnGhost} disabled={setupBusy} onClick={() => { setSetupPreview(null); setSetupStage(null); }}>Cancel</button>
              </div>
            </div>
          )}
          {setupStage === 'recount' && setupPreview && (
            <div className="rounded-xl border border-amber-500/30 bg-slate-950/60 p-3 text-amber-100 space-y-2">
              <p>Recount will write {setupPreview.writeOps} counter documents for {setupPreview.computed?.total} live questions across {setupPreview.computed?.subjects?.length} subjects.</p>
              {Array.isArray(setupPreview.diffs) && setupPreview.diffs.length > 0 && (
                <p className="text-xs text-amber-200/80">Differences found: {setupPreview.diffs.join('; ')}</p>
              )}
              <p className="text-xs text-amber-200/80">{setupPreview.note}</p>
              <div className="flex gap-2">
                <button className={btnPrimary} disabled={setupBusy} onClick={runRecount}>Confirm recount</button>
                <button className={btnGhost} disabled={setupBusy} onClick={() => { setSetupPreview(null); setSetupStage(null); }}>Cancel</button>
              </div>
            </div>
          )}
          {setupMsg && <p className="font-semibold text-amber-100">{setupMsg}</p>}
        </div>
      )}
        </>
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
            <div className="bg-slate-900 border border-white/10 rounded-3xl p-5 sm:p-7 max-w-3xl w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
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
                {preview.counterBased && (
                  <p className="text-[11px] text-slate-500 mb-2">This preview read the counters and ran three small count queries (about {preview.readsReport?.approxTotalReads ?? 35} reads) instead of scanning the bank, so it costs the same at any size.</p>
                )}
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

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-6">
              <button onClick={() => setPreview(null)} className={`${btnGhost} w-full sm:w-auto`}>Cancel</button>
              <button onClick={runPublish} disabled={publishing} className={`${btnPrimary} w-full sm:w-auto`}>{publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Publish v{preview.nextVersion}</button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* Publish result */}
      {publishResult && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPublishResult(null)}>
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-5 sm:p-7 max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-emerald-400" /></div>
              <div>
                <h3 className="text-white font-bold capitalize">{publishResult.kind === 'practice' ? 'Practice' : 'Mock'} v{publishResult.version} published</h3>
                <p className="text-slate-400 text-xs">{publishResult.counts.live} questions live</p>
              </div>
            </div>
            <div className="text-xs text-slate-300 space-y-1 bg-slate-950/60 border border-white/10 rounded-xl p-4">
              <p>Added {publishResult.counts.added} · Edited {publishResult.counts.edited} · Removed {publishResult.counts.removed}</p>
              {publishResult.reads && (
                <p>Paged read: {publishResult.reads.docsRead} questions in {publishResult.reads.pages} pages · {(Number(publishResult.elapsedMs) / 1000).toFixed(1)}s</p>
              )}
              <p className="break-all text-slate-500">{publishResult.fileUrl || 'No public file (mock papers stay private)'}</p>
            </div>
            <button onClick={() => setPublishResult(null)} className={`${btnPrimary} w-full mt-5`}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
};
