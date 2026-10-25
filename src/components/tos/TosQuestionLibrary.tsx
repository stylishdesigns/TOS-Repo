import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Search, X, ChevronRight, Check, Pencil, Trash2, FolderTree, RefreshCw } from 'lucide-react';
import { api, Json, Card, inputCls, btnPrimary, btnGhost, fmtDate } from './tosShared';
import { BANK_YEARS } from '../../data/seniorSubjects';

/**
 * New question bank library (Prompt L, piece L3).
 *
 * Built on the paged L2 backend: 50 rows per page, one read per page, tree
 * counts from the counter documents, search across the whole stream with a
 * 400 ms debounce, and a quick-edit panel. No screen here reads the whole
 * collection; the old full-scan Authoring screen stays untouched.
 *
 * Status tabs mirror the counters. The tree scope is one branch at a time
 * (subject, topic or year) and search runs across the whole stream, so
 * typing a search clears the tree scope exactly as the server requires.
 */

const STATUS_TABS: { id: string; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Drafts' },
  { id: 'published', label: 'Published' },
  { id: 'changed', label: 'Changed' },
  { id: 'removed', label: 'Removed' },
];

const DIFF_LABELS: Record<string, string> = { easy: 'Easy', hard: 'Hard' };

type Scope = { type: 'subject' | 'topic' | 'year'; key: string; label: string } | null;

export const QuestionLibraryTab: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const [kind, setKind] = useState<'practice' | 'mock'>('practice');
  const [tree, setTree] = useState<Json | null>(null);
  const [tab, setTab] = useState('all');
  const [scope, setScope] = useState<Scope>(null);
  const [difficulty, setDifficulty] = useState('');
  const [sort, setSort] = useState('updated');
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');

  const [items, setItems] = useState<any[]>([]);
  const [tabs, setTabs] = useState<Json>({});
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);

  const [openSubjects, setOpenSubjects] = useState<Set<string>>(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [editor, setEditor] = useState<Json | null>(null);
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorError, setEditorError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Bulk actions (L4): select, bulk remove, empty removed, manage topics.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMsg, setBulkMsg] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulkRemove, setConfirmBulkRemove] = useState(false);
  const [emptyPreview, setEmptyPreview] = useState<Json | null>(null);
  const [emptyTyped, setEmptyTyped] = useState('');
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [topicSubject, setTopicSubject] = useState('');
  const [topicFrom, setTopicFrom] = useState('');
  const [topicMode, setTopicMode] = useState<'rename' | 'merge'>('rename');
  const [topicNewName, setTopicNewName] = useState('');
  const [topicInto, setTopicInto] = useState('');
  const [topicPreview, setTopicPreview] = useState<Json | null>(null);
  const [topicMsg, setTopicMsg] = useState('');

  // Imports register (L5)
  const [imports, setImports] = useState<Json[] | null>(null);
  const [importsCursor, setImportsCursor] = useState<string | null>(null);
  const [importsHasMore, setImportsHasMore] = useState(false);
  const [importsLoading, setImportsLoading] = useState(false);
  const [importsMsg, setImportsMsg] = useState('');
  const [batchFilter, setBatchFilter] = useState<string | null>(null);
  const [undoPreview, setUndoPreview] = useState<Json | null>(null);

  // Debounced search: 400 ms after the last keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 400);
    return () => clearTimeout(t);
  }, [q]);

  // Search covers the whole stream, so it and the tree scope never mix.
  useEffect(() => {
    if (qDebounced.length >= 2 && scope) setScope(null);
  }, [qDebounced]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadTree = useCallback(async () => {
    try { setTree(await api(`/api/tos/questionbank/tree?kind=${kind}`)); } catch { setTree(null); }
  }, [kind]);

  const loadList = useCallback(async (mode: 'replace' | 'more') => {
    if (tab === 'imports') return;
    if (mode === 'replace') setLoading(true); else setLoadingMore(true);
    if (mode === 'replace') setListError('');
    try {
      const p = new URLSearchParams({ kind, status: tab, sort, limit: '50' });
      if (batchFilter) p.set('batchId', batchFilter);
      else if (scope) p.set(scope.type === 'subject' ? 'subject' : scope.type === 'topic' ? 'topic' : 'year', scope.key);
      if (difficulty) p.set('difficulty', difficulty);
      if (qDebounced.length >= 2) p.set('q', qDebounced);
      if (mode === 'more' && nextCursor) p.set('cursor', nextCursor);
      const r = await api(`/api/tos/questionbank/list?${p.toString()}`);
      setItems((prev) => (mode === 'more' ? [...prev, ...(r.items || [])] : r.items || []));
      setTabs(r.tabs || {});
      setHasMore(Boolean(r.hasMore));
      setNextCursor(r.nextCursor || null);
      setTree((prev) => (prev ? { ...prev, setupNeeded: r.setupNeeded } : prev));
    } catch (e: any) {
      setListError(e.message || 'Failed to load questions.');
    }
    setLoading(false);
    setLoadingMore(false);
  }, [kind, tab, scope, difficulty, qDebounced, sort, nextCursor, batchFilter]);

  useEffect(() => { loadTree(); }, [loadTree, refreshKey]);
  useEffect(() => { loadList('replace'); }, [loadList, refreshKey]); // loadList changes with filters

  const openEditor = async (id: string) => {
    setEditorLoading(true); setEditorError(''); setConfirmRemove(false);
    try { setEditor(await api(`/api/tos/questionbank/item/${id}`)); }
    catch (e: any) { setEditorError(e.message); }
    setEditorLoading(false);
  };

  const saveEditor = async () => {
    if (!editor?.item) return;
    setSaving(true); setEditorError('');
    try {
      const it = editor.item;
      await api(`/api/tos/questionbank/questions/${it.id}`, {
        method: 'POST',
        body: {
          kind: it.kind, examType: it.examType, subject: it.subject, klass: it.klass,
          topic: it.topic, year: it.year || '', difficulty: it.difficulty,
          text: it.text, options: (it.options || []).map((o: any) => ({ key: o.key, text: o.text })),
          correct: it.correct, explanation: it.explanation, imageLink: it.imageLink || '',
        },
      });
      setEditor(null);
      loadList('replace');
      loadTree();
    } catch (e: any) { setEditorError(e.message || 'Failed to save.'); }
    setSaving(false);
  };

  const removeQuestion = async () => {
    if (!editor?.item) return;
    setSaving(true); setEditorError('');
    try {
      await api(`/api/tos/questionbank/questions/${editor.item.id}`, { method: 'DELETE' });
      setEditor(null);
      loadList('replace');
      loadTree();
    } catch (e: any) { setEditorError(e.message || 'Failed to remove.'); }
    setSaving(false);
  };

  // ---- Bulk actions -------------------------------------------------------

  const bulkStats = useMemo(() => {
    const stats = { drafts: 0, published: 0, other: 0 };
    items.forEach((it) => {
      if (!selected.has(it.id)) return;
      if (it.status === 'draft') stats.drafts += 1;
      else if (it.status === 'published') stats.published += 1;
      else stats.other += 1;
    });
    return stats;
  }, [items, selected]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const runBulkRemove = async () => {
    setBulkBusy(true); setBulkMsg('');
    try {
      const r: Json = await api('/api/tos/questionbank/bulk-remove', {
        method: 'POST',
        body: { confirm: 'BULK-REMOVE', kind, ids: Array.from(selected) },
      });
      setBulkMsg(`Removed ${r.softRemoved} published and deleted ${r.hardDeleted} drafts.${r.skipped ? ` Skipped ${r.skipped}.` : ''}`);
      setConfirmBulkRemove(false);
      setSelected(new Set());
      setSelectMode(false);
      loadList('replace');
      loadTree();
    } catch (e: any) { setBulkMsg(e.message); }
    setBulkBusy(false);
  };

  const openEmptyPreview = async () => {
    setBulkBusy(true); setBulkMsg(''); setEmptyTyped('');
    try { setEmptyPreview(await api(`/api/tos/questionbank/empty-removed-preview?kind=${kind}`)); }
    catch (e: any) { setBulkMsg(e.message); }
    setBulkBusy(false);
  };

  const runEmpty = async () => {
    setBulkBusy(true); setBulkMsg('');
    try {
      let deleted = 0;
      for (;;) {
        const r: Json = await api('/api/tos/questionbank/empty-removed', {
          method: 'POST',
          body: { confirm: emptyTyped.trim(), kind },
        });
        deleted += Number(r.deleted) || 0;
        setBulkMsg(`Emptying: ${deleted} deleted so far...`);
        if (r.done) break;
      }
      setBulkMsg(`Removed bin emptied: ${deleted} permanently deleted.`);
      setEmptyPreview(null);
      setEmptyTyped('');
      loadList('replace');
      loadTree();
    } catch (e: any) { setBulkMsg(e.message); }
    setBulkBusy(false);
  };

  const openTopics = () => {
    setTopicsOpen(true);
    setTopicMsg('');
    setTopicPreview(null);
    setTopicNewName('');
    setTopicInto('');
    setTopicFrom('');
    setTopicSubject((tree?.subjects || [])[0]?.key || '');
  };

  const runTopicPreview = async () => {
    setBulkBusy(true); setTopicMsg(''); setTopicPreview(null);
    try {
      const p = new URLSearchParams({ kind, subjectKey: topicSubject, topicKey: topicFrom, mode: topicMode });
      if (topicMode === 'rename') p.set('toTopic', topicNewName); else p.set('intoTopicKey', topicInto);
      setTopicPreview(await api(`/api/tos/questionbank/topic-preview?${p.toString()}`));
    } catch (e: any) { setTopicMsg(e.message); }
    setBulkBusy(false);
  };

  const runTopicChange = async () => {
    setBulkBusy(true); setTopicMsg('');
    try {
      let updated = 0;
      for (;;) {
        const r: Json = await api('/api/tos/questionbank/topic-change', {
          method: 'POST',
          body: {
            confirm: topicMode === 'rename' ? 'TOPIC-RENAME' : 'TOPIC-MERGE',
            kind, subjectKey: topicSubject, topicKey: topicFrom, mode: topicMode,
            toTopic: topicNewName, intoTopicKey: topicInto,
          },
        });
        updated += Number(r.updated) || 0;
        setTopicMsg(`Working: ${updated} questions moved so far...`);
        if (r.done) break;
      }
      setTopicPreview(null);
      setTopicsOpen(false);
      setBulkMsg(`Done: ${updated} questions updated.`);
      loadList('replace');
      loadTree();
    } catch (e: any) { setTopicMsg(e.message); }
    setBulkBusy(false);
  };

  // ---- Imports register + undo --------------------------------------------

  const loadImports = useCallback(async (mode: 'replace' | 'more') => {
    setImportsLoading(true);
    try {
      const p = new URLSearchParams({ limit: '20' });
      if (mode === 'more' && importsCursor) p.set('cursor', importsCursor);
      const r: Json = await api(`/api/tos/questionbank/imports?${p.toString()}`);
      setImports((prev) => (mode === 'more' ? [...(prev || []), ...(r.items || [])] : r.items || []));
      setImportsCursor(r.nextCursor || null);
      setImportsHasMore(Boolean(r.hasMore));
    } catch (e: any) { setImportsMsg(e.message); }
    setImportsLoading(false);
  }, [importsCursor]);

  useEffect(() => { if (tab === 'imports') loadImports('replace'); }, [tab, loadImports]); // fresh list on each visit

  const openUndoPreview = async (batchId: string) => {
    setBulkBusy(true); setBulkMsg('');
    try { setUndoPreview(await api(`/api/tos/questionbank/undo-batch-preview?batchId=${encodeURIComponent(batchId)}`)); }
    catch (e: any) { setBulkMsg(e.message); }
    setBulkBusy(false);
  };

  const runUndo = async () => {
    setBulkBusy(true); setBulkMsg('');
    try {
      let deleted = 0;
      for (;;) {
        const r: Json = await api('/api/tos/questionbank/undo-batch', {
          method: 'POST',
          body: { confirm: 'UNDO-IMPORT', batchId: undoPreview?.batch?.batchId },
        });
        deleted += Number(r.deleted) || 0;
        setBulkMsg(`Undoing: ${deleted} drafts deleted so far...`);
        if (r.done) break;
      }
      setBulkMsg(`Batch undone: ${deleted} drafts deleted.`);
      setUndoPreview(null);
      setImports(null);
      await loadImports('replace');
      loadList('replace');
    } catch (e: any) { setBulkMsg(e.message); }
    setBulkBusy(false);
  };

  const setEditorField = (field: string, value: any) => {
    setEditor((prev) => (prev ? { ...prev, item: { ...prev.item, [field]: value } } : prev));
  };

  const toggleSubject = (key: string) => {
    setOpenSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const pickScope = (type: 'subject' | 'topic' | 'year', key: string, label: string) => {
    setScope({ type, key, label });
    setQ('');
    setQDebounced('');
    setDrawerOpen(false);
  };

  const scopeParamActive = Boolean(scope) || qDebounced.length >= 2 || Boolean(difficulty);
  const showingLine = scopeParamActive
    ? `Showing ${items.length}${hasMore ? ' (more available)' : ''}`
    : `Showing ${items.length} of ${Number(tabs.total) || 0}`;

  const treePanel = (
    <div className="space-y-1.5">
      {scope && (
        <button onClick={() => setScope(null)} className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-200 text-sm font-semibold">
          <span className="truncate">{scope.label}</span>
          <X className="w-4 h-4 shrink-0" />
        </button>
      )}
      {(tree?.subjects || []).map((s: any) => (
        <div key={s.key} className="rounded-xl border border-slate-700/50 bg-slate-900/40">
          <button onClick={() => toggleSubject(s.key)} className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left">
            <span className="text-sm font-semibold text-slate-200 truncate">{s.label}</span>
            <span className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] text-slate-500">{s.total}</span>
              <ChevronRight className={`w-4 h-4 text-slate-500 transition-transform ${openSubjects.has(s.key) ? 'rotate-90' : ''}`} />
            </span>
          </button>
          {openSubjects.has(s.key) && (
            <div className="px-3 pb-3 space-y-1">
              {Object.entries(s.byYear || {}).sort((a: any, b: any) => Number(b[0]) - Number(a[0])).slice(0, 12).map(([y, n]: any) => (
                <button key={y} onClick={() => pickScope('year', String(y), `Year ${y}`)} className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:bg-white/5">
                  <span>Year {y}</span><span className="text-slate-600">{n}</span>
                </button>
              ))}
              {(s.topics || []).map((t: any) => (
                <button key={t.key} onClick={() => pickScope('topic', t.key, t.label)} className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:bg-white/5">
                  <span className="truncate">{t.label}</span><span className="text-slate-600 shrink-0 ml-2">{t.total}</span>
                </button>
              ))}
              <button onClick={() => pickScope('subject', s.key, s.label)} className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-orange-300/90 hover:bg-white/5">
                <span>All of {s.label}</span><span className="text-slate-600">{s.total}</span>
              </button>
            </div>
          )}
        </div>
      ))}
      {tree && (tree.subjects || []).length === 0 && (
        <p className="text-xs text-slate-500 px-3 py-4">No counted subjects yet. Run Recount on the Authoring tab to build the tree.</p>
      )}
      <button onClick={openTopics} className="w-full mt-2 px-3 py-2.5 rounded-xl border border-slate-700/60 text-xs font-bold text-slate-300 hover:text-white min-h-[44px]">
        Manage topics (rename or merge)
      </button>
    </div>
  );


  // Imports tab (L5): every recorded paste, newest first, with undo.
  if (tab === 'imports') {
    return (
      <div className="space-y-4">
        <Card title="Imports">
          <p className="text-xs text-slate-400 mb-3">Every paste imported since this update went live, newest first. Undo a batch to delete the drafts it added; questions you already published stay live.</p>
          <div className="flex flex-wrap gap-2 mb-3">
            <button onClick={() => setTab('all')} className={btnGhost}>Back to the question list</button>
            <button onClick={() => loadImports('replace')} disabled={importsLoading} className={btnGhost}>{importsLoading ? 'Refreshing...' : 'Refresh'}</button>
          </div>
          {importsMsg && <p className="text-sm text-orange-300 mb-2">{importsMsg}</p>}
          {importsLoading && !imports && <p className="text-sm text-slate-400">Loading...</p>}
          {imports && imports.length === 0 && (
            <p className="text-sm text-slate-400">No import batches recorded yet. Batches imported before this update are not listed here.</p>
          )}
          <div className="space-y-2">
            {(imports || []).map((b: any) => (
              <div key={b.id} className="rounded-2xl border border-slate-700/50 bg-slate-900/40 p-3.5 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-200">{b.subject} · {b.topic}{b.year ? ` · ${b.year}` : ''}</p>
                  <p className="text-xs text-slate-500">{fmtDate(b.importedAt)} · {b.count} question{b.count === 1 ? '' : 's'} · {b.examType} · {b.importedByEmail || 'TOS admin'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {String(b.status) === 'undone' ? (
                    <span className="px-3 py-1.5 rounded-full text-xs font-bold border border-slate-700 text-slate-500">Undone</span>
                  ) : (
                    <>
                      <button className={`${btnGhost} text-xs`} onClick={() => { setBatchFilter(b.batchId); setScope(null); setQ(''); setTab('all'); }}>See the questions</button>
                      <button className={`${btnGhost} text-xs`} disabled={bulkBusy} onClick={() => openUndoPreview(b.batchId)}>Undo this batch</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          {importsHasMore && (
            <button onClick={() => loadImports('more')} disabled={importsLoading} className={`${btnGhost} mt-3`}>
              {importsLoading ? <Loader2 className="w-4 h-4 animate-spin inline" /> : null} Load 20 more
            </button>
          )}
        </Card>

        {undoPreview && (
          <div className="fixed inset-0 z-50 bg-slate-950/90 overflow-y-auto p-4" onClick={() => { if (!bulkBusy) setUndoPreview(null); }}>
            <div className="max-w-md mx-auto mt-16 rounded-2xl border border-amber-500/40 bg-slate-900 p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
              <p className="font-bold text-white">Undo this batch</p>
              <p className="text-sm text-slate-300">{undoPreview.note}</p>
              <p className="text-xs text-slate-500">
                Batch: {undoPreview.batch?.subject} · {undoPreview.batch?.topic}{undoPreview.batch?.year ? ` · ${undoPreview.batch?.year}` : ''} · {undoPreview.batch?.count} questions · imported {fmtDate(undoPreview.batch?.importedAt)}
              </p>
              <div className="flex flex-wrap gap-2">
                <button className={btnPrimary} disabled={bulkBusy || undoPreview.alreadyUndone} onClick={runUndo}>{bulkBusy ? 'Working...' : 'Confirm undo'}</button>
                <button className={btnGhost} disabled={bulkBusy} onClick={() => setUndoPreview(null)}>Cancel</button>
              </div>
              {bulkMsg && <p className="text-sm text-orange-200">{bulkMsg}</p>}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {tree?.setupNeeded && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
          <p className="font-bold text-amber-100">Set up needed</p>
          <p className="text-amber-200/90 mt-1">
            This stream has not had its one-time setup yet: Backfill (adds search keys to existing
            questions) then Recount (builds the counts). Run both from the Authoring tab; nothing is
            written until you confirm each step. Existing questions only appear in search after the
            backfill finishes.
          </p>
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-slate-700/60 overflow-hidden">
            {(['practice', 'mock'] as const).map((k) => (
              <button key={k} onClick={() => { setKind(k); setScope(null); }}
                className={`px-4 py-2 text-sm font-bold ${kind === k ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'}`}>
                {k === 'practice' ? 'Practice' : 'Mock'}
              </button>
            ))}
          </div>
          <button onClick={() => { loadTree(); loadList('replace'); }} className={btnGhost}><RefreshCw className="w-4 h-4" /> Refresh</button>
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search the whole stream (whole words, up to 3)..."
              className={`${inputCls} pl-9`}
            />
          </div>
          <button onClick={() => setDrawerOpen(true)} className="lg:hidden flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-700/60 text-sm font-semibold text-slate-300 min-h-[44px]">
            <FolderTree className="w-4 h-4" /> Browse
          </button>
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className={`${inputCls} w-auto`}>
            <option value="">Any difficulty</option>
            <option value="easy">Easy</option>
            <option value="hard">Hard</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className={`${inputCls} w-auto`}>
            <option value="updated">Newest activity</option>
            <option value="year">Year</option>
            <option value="subject">Subject A to Z</option>
          </select>
          <button onClick={() => { setSelectMode((v) => !v); setSelected(new Set()); setConfirmBulkRemove(false); }}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold min-h-[44px] ${selectMode ? 'border-orange-500/50 bg-orange-500/15 text-orange-200' : 'border-slate-700/60 text-slate-300'}`}>
            <Check className="w-4 h-4" /> {selectMode ? 'Selecting' : 'Select'}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {STATUS_TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border min-h-[36px] ${tab === t.id ? 'bg-orange-500 text-white border-orange-500' : 'border-slate-700/60 text-slate-400 hover:text-white'}`}>
              {t.label}{t.id === 'all' && ` (${Number(tabs.total) || 0})`}
              {t.id === 'draft' && ` (${Number(tabs.draft) || 0})`}
              {t.id === 'published' && ` (${Number(tabs.published) || 0})`}
              {t.id === 'changed' && ` (${Number(tabs.changed) || 0})`}
              {t.id === 'removed' && ` (${Number(tabs.removed) || 0})`}
            </button>
          ))}
          <button onClick={() => setTab('imports')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border min-h-[36px] ${tab === 'imports' ? 'bg-orange-500 text-white border-orange-500' : 'border-slate-700/60 text-slate-400 hover:text-white'}`}>
            Imports
          </button>
        </div>
        {batchFilter && (
          <button onClick={() => { setBatchFilter(null); loadList('replace'); }} className="mt-2 px-3 py-1.5 rounded-full text-xs font-bold border border-orange-500/50 bg-orange-500/10 text-orange-200">
            Showing one import batch · Clear
          </button>
        )}
        {tab === 'removed' && (Number(tabs.removed) || 0) > 0 && (
          <button onClick={openEmptyPreview} disabled={bulkBusy} className={`${btnGhost} mt-2`}>
            <Trash2 className="w-4 h-4" /> Empty removed bin
          </button>
        )}
        <p className="text-[11px] text-slate-500 mt-2">
          {qDebounced.length >= 2
            ? 'Search covers every question in this stream, including ones outside the tree.'
            : 'Tap a subject, topic or year in the Browse panel to narrow the list. Search covers the whole stream.'}
        </p>
      </Card>

      {selected.size > 0 && (
        <div className="rounded-2xl border border-orange-500/40 bg-orange-500/10 p-3.5 text-sm text-orange-100 space-y-2">
          <p>{selected.size} selected: {bulkStats.drafts} drafts, {bulkStats.published} published, {bulkStats.other} other.</p>
          {confirmBulkRemove ? (
            <div className="space-y-2">
              <p className="text-orange-200/90">Drafts are deleted outright; published ones are marked removed and stay in the Removed tab until you empty it. Up to 200 per action.</p>
              <div className="flex flex-wrap gap-2">
                <button className={btnPrimary} disabled={bulkBusy || selected.size > 200} onClick={runBulkRemove}>{bulkBusy ? 'Working...' : 'Confirm remove'}</button>
                <button className={btnGhost} disabled={bulkBusy} onClick={() => setConfirmBulkRemove(false)}>Back</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button className={btnPrimary} disabled={bulkBusy || selected.size > 200} onClick={() => setConfirmBulkRemove(true)}>{selected.size > 200 ? 'Over the 200 cap' : 'Remove selected'}</button>
              <button className={btnGhost} disabled={bulkBusy} onClick={() => { setSelected(new Set()); setSelectMode(false); setConfirmBulkRemove(false); }}>Clear</button>
            </div>
          )}
          {bulkMsg && <p className="font-semibold">{bulkMsg}</p>}
        </div>
      )}
      {listError && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">{listError}</div>
      )}

      <div className="lg:grid lg:grid-cols-[280px_1fr] lg:gap-4 items-start">
        <div className="hidden lg:block">
          <Card title="Browse"><div className="mt-2 max-h-[70vh] overflow-y-auto pr-1">{treePanel}</div></Card>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-slate-500 px-1">{loading ? 'Loading...' : showingLine}</p>
          {items.map((it) => (
            <button key={it.id} onClick={() => (selectMode ? toggleSelect(it.id) : openEditor(it.id))}
              className={`w-full text-left rounded-2xl border p-3.5 transition-colors ${selected.has(it.id) ? 'border-orange-500/60 bg-orange-500/10' : 'border-slate-700/50 bg-slate-900/40 hover:border-orange-500/40'}`}>
              <div className="flex items-start justify-between gap-3">
                {selectMode && (
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${selected.has(it.id) ? 'border-orange-400 bg-orange-500 text-white' : 'border-slate-600'}`}>
                    {selected.has(it.id) ? <Check className="w-3.5 h-3.5" /> : null}
                  </span>
                )}
                <p className="text-sm text-slate-200 line-clamp-2">{it.textPreview}</p>
                <Pencil className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2 items-center">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">{it.subject}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">{it.topic}</span>
                {it.year != null && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">{it.year}</span>}
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">{DIFF_LABELS[it.difficulty] || it.difficulty}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${it.status === 'published' ? 'bg-emerald-500/15 text-emerald-300' : it.status === 'removed' ? 'bg-red-500/15 text-red-300' : it.status === 'draft' ? 'bg-sky-500/15 text-sky-300' : 'bg-amber-500/15 text-amber-300'}`}>{it.status}</span>
                <span className="text-[10px] text-slate-600 ml-auto">{fmtDate(it.updatedAt)}</span>
              </div>
            </button>
          ))}
          {!loading && items.length === 0 && !listError && (
            <p className="text-sm text-slate-500 px-1 py-6">No questions match this view.</p>
          )}
          {hasMore && (
            <button onClick={() => loadList('more')} disabled={loadingMore}
              className={`${btnGhost} w-full justify-center`}>
              {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Load 50 more'}
            </button>
          )}
        </div>
      </div>

      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-slate-950/95 overflow-y-auto p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-white">Browse the bank</p>
            <button onClick={() => setDrawerOpen(false)} className="p-2 rounded-lg text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
          </div>
          {treePanel}
        </div>
      )}

      {(editor || editorLoading) && (
        <div className="fixed inset-0 z-50 bg-slate-950 lg:bg-slate-950/80 lg:flex lg:justify-end" onClick={() => { if (!saving) setEditor(null); }}>
          <div className="w-full lg:max-w-[520px] h-full bg-slate-950 border-l border-slate-800 overflow-y-auto p-4 lg:p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-white">Quick edit</p>
              <button onClick={() => setEditor(null)} disabled={saving} className="p-2 rounded-lg text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            {editorLoading && <p className="text-sm text-slate-500">Loading question...</p>}
            {editor?.item && (
              <>
                <div className="flex flex-wrap gap-1.5 text-[10px] text-slate-400">
                  <span className="font-bold px-2 py-0.5 rounded-full bg-slate-800">{editor.item.subject}</span>
                  <span className="font-bold px-2 py-0.5 rounded-full bg-slate-800">{editor.item.topic}</span>
                  <span className="font-bold px-2 py-0.5 rounded-full bg-slate-800">{editor.item.klass}</span>
                  <span className="font-bold px-2 py-0.5 rounded-full bg-slate-800">{editor.item.examType}</span>
                </div>
                <p className="text-[11px] text-slate-500">Subject, topic and class are edited on the Authoring tab, where the guides live.</p>
                <textarea value={editor.item.text} onChange={(e) => setEditorField('text', e.target.value)} rows={4} className={inputCls} />
                {['A', 'B', 'C', 'D'].map((k) => {
                  const opt = (editor.item.options || []).find((o: any) => o.key === k);
                  return (
                    <div key={k} className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-500 w-4">{k}</span>
                      <input
                        value={opt?.text || ''}
                        onChange={(e) => setEditorField('options', (editor.item.options || []).map((o: any) => (o.key === k ? { ...o, text: e.target.value } : o)))}
                        className={inputCls}
                      />
                    </div>
                  );
                })}
                <div className="grid grid-cols-2 gap-2">
                  <select value={editor.item.correct} onChange={(e) => setEditorField('correct', e.target.value)} className={inputCls}>
                    {['A', 'B', 'C', 'D'].map((k) => <option key={k} value={k}>Correct: {k}</option>)}
                  </select>
                  <select value={String(editor.item.difficulty)} onChange={(e) => setEditorField('difficulty', e.target.value)} className={inputCls}>
                    <option value="easy">Easy</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select value={String(editor.item.year ?? '')} onChange={(e) => setEditorField('year', e.target.value === '' ? '' : Number(e.target.value))} className={inputCls}>
                    <option value="">No year</option>
                    {BANK_YEARS.map((y: number) => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <p className="text-[11px] text-slate-500 self-center">Status: {editor.item.status}</p>
                </div>
                <textarea value={editor.item.explanation || ''} onChange={(e) => setEditorField('explanation', e.target.value)} rows={3} placeholder="Explanation (optional)" className={inputCls} />
                {editorError && <p className="text-sm text-red-300">{editorError}</p>}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button onClick={saveEditor} disabled={saving} className={btnPrimary}>{saving ? 'Saving...' : 'Save changes'}</button>
                  {confirmRemove ? (
                    <button onClick={removeQuestion} disabled={saving} className="px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold min-h-[44px]">Confirm remove</button>
                  ) : (
                    <button onClick={() => setConfirmRemove(true)} disabled={saving} className={btnGhost}>
                      <Trash2 className="w-4 h-4" /> Remove
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">Saving a published question marks it as a change the next publish picks up.</p>
              </>
            )}
          </div>
        </div>
      )}

      {emptyPreview && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 overflow-y-auto p-4" onClick={() => { if (!bulkBusy) setEmptyPreview(null); }}>
          <div className="max-w-md mx-auto mt-16 rounded-2xl border border-red-500/40 bg-slate-900 p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="font-bold text-white">Empty the removed bin</p>
            <p className="text-sm text-red-200">{emptyPreview.note}</p>
            <p className="text-sm text-slate-300">{emptyPreview.total} questions will be permanently deleted.</p>
            {(emptyPreview.samples || []).length > 0 && (
              <ul className="text-xs text-slate-500 space-y-1">
                {(emptyPreview.samples as string[]).map((t, i) => <li key={i} className="truncate">- {t}</li>)}
              </ul>
            )}
            <input value={emptyTyped} onChange={(e) => setEmptyTyped(e.target.value)} placeholder="Type EMPTY REMOVED" className={inputCls} />
            <div className="flex flex-wrap gap-2">
              <button className="px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold min-h-[44px] disabled:opacity-50"
                disabled={bulkBusy || emptyTyped.trim() !== 'EMPTY REMOVED'} onClick={runEmpty}>
                {bulkBusy ? 'Deleting...' : 'Permanently delete'}
              </button>
              <button className={btnGhost} disabled={bulkBusy} onClick={() => setEmptyPreview(null)}>Cancel</button>
            </div>
            {bulkMsg && <p className="text-sm text-orange-200">{bulkMsg}</p>}
          </div>
        </div>
      )}

      {topicsOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 overflow-y-auto p-4" onClick={() => { if (!bulkBusy) setTopicsOpen(false); }}>
          <div className="max-w-md mx-auto mt-16 rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="font-bold text-white">Manage topics</p>
            <select value={topicSubject} onChange={(e) => { setTopicSubject(e.target.value); setTopicFrom(''); setTopicPreview(null); }} className={inputCls}>
              {(tree?.subjects || []).map((s: any) => <option key={s.key} value={s.key}>{s.label} ({s.total})</option>)}
            </select>
            <select value={topicFrom} onChange={(e) => { setTopicFrom(e.target.value); setTopicPreview(null); }} className={inputCls}>
              <option value="">Choose the topic to change</option>
              {(((tree?.subjects || []).find((s: any) => s.key === topicSubject)?.topics) || []).map((t: any) => (
                <option key={t.key} value={t.key}>{t.label} ({t.total})</option>
              ))}
            </select>
            <div className="flex gap-2 text-sm">
              <button onClick={() => { setTopicMode('rename'); setTopicPreview(null); }}
                className={`flex-1 px-3 py-2 rounded-xl border font-semibold ${topicMode === 'rename' ? 'border-orange-500/50 bg-orange-500/15 text-orange-200' : 'border-slate-700 text-slate-400'}`}>Rename</button>
              <button onClick={() => { setTopicMode('merge'); setTopicPreview(null); }}
                className={`flex-1 px-3 py-2 rounded-xl border font-semibold ${topicMode === 'merge' ? 'border-orange-500/50 bg-orange-500/15 text-orange-200' : 'border-slate-700 text-slate-400'}`}>Merge into another</button>
            </div>
            {topicMode === 'rename' ? (
              <input value={topicNewName} onChange={(e) => setTopicNewName(e.target.value)} placeholder="New topic name" className={inputCls} />
            ) : (
              <select value={topicInto} onChange={(e) => { setTopicInto(e.target.value); setTopicPreview(null); }} className={inputCls}>
                <option value="">Merge into</option>
                {(((tree?.subjects || []).find((s: any) => s.key === topicSubject)?.topics) || []).filter((t: any) => t.key !== topicFrom).map((t: any) => (
                  <option key={t.key} value={t.key}>{t.label} ({t.total})</option>
                ))}
              </select>
            )}
            <div className="flex flex-wrap gap-2">
              <button className={btnGhost} disabled={bulkBusy || !topicFrom || (topicMode === 'rename' ? !topicNewName.trim() : !topicInto)} onClick={runTopicPreview}>Preview</button>
              {topicPreview && (
                <button className={btnPrimary} disabled={bulkBusy} onClick={runTopicChange}>{bulkBusy ? 'Working...' : 'Confirm'}</button>
              )}
              <button className={btnGhost} disabled={bulkBusy} onClick={() => setTopicsOpen(false)}>Close</button>
            </div>
            {topicPreview && (
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-sm text-slate-300 space-y-1">
                <p>{topicPreview.note}</p>
                <p className="text-xs text-slate-500">Runs in chunks of 200 so big topics cannot hit a time limit.</p>
              </div>
            )}
            {topicMsg && <p className="text-sm text-orange-200">{topicMsg}</p>}
          </div>
        </div>
      )}
    </div>
  );
};
