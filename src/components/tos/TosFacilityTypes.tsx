import React, { useCallback, useEffect, useState } from 'react';
import { ListPlus, Loader2, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { api, inputCls } from './tosShared';

/**
 * FACILITY TYPE REGISTRY (batch 54). The kinds of education facility TOS
 * serves and the exam programmes each one prepares students for. Platform
 * staff manage the list here; the signup flow's Type-of-facility dropdown
 * and its exam pre-selection read it live through /api/public/facility-types,
 * so an edit here changes what new owners see the next time the form opens.
 * The first read seeds the six launch kinds, so the list is never empty.
 * Server-only collection (facilityTypes); nothing on the facility side reads
 * it directly, so no Firestore rules release is needed.
 */

interface FacilityType { id: string; name: string; exams: string[]; addedAt?: string; }

export const TosFacilityTypes = ({ refreshKey }: { refreshKey: number }) => {
  const [types, setTypes] = useState<FacilityType[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [formErr, setFormErr] = useState('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [exams, setExams] = useState('');
  const [editId, setEditId] = useState('');
  const [editName, setEditName] = useState('');
  const [editExams, setEditExams] = useState('');
  const [confirmId, setConfirmId] = useState('');

  const load = useCallback(async () => {
    setErr(''); setLoading(true);
    try {
      const d: any = await api('/api/tos/facility-types');
      if (d && Array.isArray(d?.types)) setTypes(d.types);
    } catch (e: any) {
      setErr(e?.message || 'The facility type list could not load.');
    } finally { setLoading(false); }
  }, []);

  // refreshKey bumps when the console reloads its data; the tab itself only
  // loads when it opens or the Refresh button is pressed. No auto-refresh.
  useEffect(() => { load(); }, [refreshKey, load]);

  const add = async () => {
    setFormErr('');
    const nm = name.trim();
    if (!nm) { setFormErr('Type the facility kind to add.'); return; }
    setBusy(true);
    try {
      const d: any = await api('/api/tos/facility-types', { method: 'POST', body: { name: nm, exams } });
      if (d?.type) setTypes((list) => [...list, d.type].sort((a, b) => String(a.name).localeCompare(String(b.name))));
      setName(''); setExams(''); setAdding(false);
    } catch (e: any) {
      setFormErr(e?.message || 'Adding the facility kind failed.');
    } finally { setBusy(false); }
  };

  const saveEdit = async () => {
    setFormErr('');
    const nm = editName.trim();
    if (!nm) { setFormErr('Type the facility kind name.'); return; }
    setBusy(true);
    try {
      const d: any = await api(`/api/tos/facility-types/${editId}`, { method: 'PATCH', body: { name: nm, exams: editExams } });
      if (d?.type) setTypes((list) => list.map((t) => (t.id === editId ? { ...t, ...d.type } : t)).sort((a, b) => String(a.name).localeCompare(String(b.name))));
      setEditId(''); setEditName(''); setEditExams('');
    } catch (e: any) {
      setFormErr(e?.message || 'Saving the facility kind failed.');
    } finally { setBusy(false); }
  };

  const remove = async (t: FacilityType) => {
    setFormErr(''); setBusy(true);
    try {
      await api(`/api/tos/facility-types/${t.id}`, { method: 'DELETE' });
      setTypes((list) => list.filter((x) => x.id !== t.id));
      setConfirmId('');
    } catch (e: any) {
      setFormErr(e?.message || 'Removing the facility kind failed.');
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => { setFormErr(''); setAdding((v) => !v); }}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-orange-500 text-sm font-extrabold text-white hover:bg-orange-400 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> Add facility kind
        </button>
        <p className="text-xs text-slate-500 ml-auto">
          {loading ? 'Loading…' : `${types.length} kind${types.length === 1 ? '' : 's'}`}
        </p>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-white/10 bg-white/5 text-sm font-bold text-slate-200 hover:bg-white/10 hover:text-white transition-colors"
          title="Reload the facility type list"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 text-orange-400" />} Refresh
        </button>
      </div>

      {err && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-100 flex items-center justify-between gap-3">
          <span>{err}</span>
          <button onClick={load} className="underline underline-offset-2 hover:text-white">Retry</button>
        </div>
      )}

      <p className="text-xs text-slate-400">
        The signup form's Type of facility dropdown and the exams it pre-selects read this list live. Add a kind,
        attach the exam programmes it prepares students for, and new owners see it the next time the form opens.
        Exam programmes are stored in capitals, up to 8 per kind.
      </p>

      {adding && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-bold text-slate-300 mb-1.5">Facility kind</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Vocational centre" className={inputCls} maxLength={60} />
            </label>
            <label className="block">
              <span className="block text-xs font-bold text-slate-300 mb-1.5">Exam programmes (comma separated)</span>
              <input value={exams} onChange={(e) => setExams(e.target.value)} placeholder="e.g. JAMB, WAEC, NECO" className={inputCls} />
            </label>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={add} disabled={busy} className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-orange-500 text-sm font-extrabold text-white hover:bg-orange-400 transition-colors disabled:opacity-60">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListPlus className="w-4 h-4" />} Save kind
            </button>
            <button onClick={() => { setAdding(false); setFormErr(''); }} className="h-10 px-4 rounded-xl border border-white/10 bg-white/5 text-sm font-bold text-slate-300 hover:text-white transition-colors">Cancel</button>
            {formErr && <span className="text-xs text-rose-300">{formErr}</span>}
          </div>
        </div>
      )}

      {formErr && !adding && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-100">{formErr}</div>
      )}

      {!loading && !err && types.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-orange-500/15 border border-orange-500/30 grid place-items-center mb-4">
            <ListPlus className="w-6 h-6 text-orange-400" />
          </div>
          <h3 className="text-sm font-bold text-white mb-1">No facility kinds yet</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">Add the first kind and the exam programmes it prepares students for.</p>
        </div>
      )}

      <div className="space-y-3">
        {types.map((t) => (
          <div key={t.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            {editId === t.id ? (
              <div className="space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} className={inputCls} maxLength={60} />
                  <input value={editExams} onChange={(e) => setEditExams(e.target.value)} className={inputCls} placeholder="JAMB, WAEC, NECO" />
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={saveEdit} disabled={busy} className="h-10 px-4 rounded-xl bg-orange-500 text-sm font-extrabold text-white hover:bg-orange-400 transition-colors disabled:opacity-60">Save</button>
                  <button onClick={() => { setEditId(''); setFormErr(''); }} className="h-10 px-4 rounded-xl border border-white/10 bg-white/5 text-sm font-bold text-slate-300 hover:text-white transition-colors">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-white">{t.name}</span>
                <span className="flex flex-wrap gap-1.5 ml-1">
                  {(t.exams || []).map((x) => (
                    <span key={x} className="inline-flex items-center h-6 px-2 rounded-full bg-orange-500/15 border border-orange-500/30 text-[10px] font-extrabold text-orange-300">{x}</span>
                  ))}
                </span>
                <span className="ml-auto flex items-center gap-1.5">
                  <button
                    onClick={() => { setEditId(t.id); setEditName(t.name); setEditExams((t.exams || []).join(', ')); setFormErr(''); }}
                    className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-xs font-bold text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    Edit
                  </button>
                  {confirmId === t.id ? (
                    <span className="flex items-center gap-1.5">
                      <button onClick={() => remove(t)} disabled={busy} className="h-8 px-3 rounded-lg bg-rose-500 text-xs font-extrabold text-white hover:bg-rose-400 transition-colors disabled:opacity-60">Delete</button>
                      <button onClick={() => setConfirmId('')} className="h-8 px-2 rounded-lg border border-white/10 bg-white/5 text-xs font-bold text-slate-300 hover:text-white transition-colors" title="Keep it"><X className="w-3.5 h-3.5" /></button>
                    </span>
                  ) : (
                    <button onClick={() => setConfirmId(t.id)} className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-xs font-bold text-slate-300 hover:text-rose-300 hover:bg-rose-500/10 transition-colors" title="Remove this facility kind">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
