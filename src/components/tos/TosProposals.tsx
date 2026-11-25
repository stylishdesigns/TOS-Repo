import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Check, ExternalLink, Download, Trash2, RefreshCw, FileText } from 'lucide-react';
import { Card, Field, inputCls, btnPrimary, btnGhost, api } from './tosShared';

/**
 * Batch 38/40: Proposals tab in the TOS console.
 * Every proposal the owner generates is SAVED and LISTED here with its open
 * history, so sent proposals can be tracked and hot leads followed up. The
 * public /proposal/:slug page counts real opens (not previews, not the PDF
 * download, not social-media crawlers) on the same records.
 */

/** Facility name -> URL slug: "Bright Minds Tutorial!" -> "bright-minds-tutorial". */
export const slugifyFacility = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** The shareable proposal link for a facility name, on the current host. */
export const proposalLinkFor = (name: string): string =>
  `${window.location.origin}/proposal/${slugifyFacility(name)}?n=${encodeURIComponent(name)}`;

type Proposal = {
  slug: string;
  name: string;
  opens?: number;
  lastOpenedAt?: number;
  firstOpenedAt?: number;
  createdAt?: number;
};

const lagos = (ts?: number) =>
  ts
    ? new Date(ts).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : '';

const ProposalsTab: React.FC = () => {
  const [name, setName] = useState('');
  const [items, setItems] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const d: any = await api('/api/tos/proposals');
      setItems(d.proposals || []);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Could not load saved proposals.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const linkOf = (p: Proposal) => `${window.location.origin}/proposal/${p.slug}?n=${encodeURIComponent(p.name)}`;

  const generate = async () => {
    const n = name.trim();
    if (!n) return;
    setSaving(true);
    setError('');
    try {
      await api('/api/tos/proposals', { method: 'POST', body: { name: n } });
      setName('');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Could not save the proposal.');
    } finally {
      setSaving(false);
    }
  };

  const copy = async (p: Proposal) => {
    setError('');
    try {
      await navigator.clipboard.writeText(linkOf(p));
      setCopiedSlug(p.slug);
      window.setTimeout(() => setCopiedSlug(''), 2200);
    } catch (e: any) {
      setError('Could not copy automatically. Select the link text and copy it.');
    }
  };

  const openPreview = (p: Proposal) => window.open(`${linkOf(p)}&preview=1`, '_blank', 'noopener');
  const downloadPdf = (p: Proposal) => window.open(`${linkOf(p)}&pdf=1`, '_blank', 'noopener');
  const remove = async (p: Proposal) => {
    if (!window.confirm(`Delete the saved proposal for ${p.name}?`)) return;
    try {
      await api(`/api/tos/proposals/${p.slug}`, { method: 'DELETE' });
      await load();
    } catch (e: any) {
      setError(e?.message || 'Could not delete the proposal.');
    }
  };

  return (
    <div className="space-y-4">
      <Card title="Generate a proposal">
        <Field label="Facility name">
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') generate(); }}
            placeholder="e.g. Bright Minds Tutorial"
            maxLength={120}
          />
        </Field>
        <div className="flex flex-wrap gap-2 mt-4">
          <button onClick={generate} disabled={!name.trim() || saving} className={btnPrimary}>
            <FileText className="w-4 h-4" />
            {saving ? 'Saving...' : 'Generate proposal'}
          </button>
        </div>
        {error && <p className="text-xs text-rose-400 mt-3">{error}</p>}
      </Card>

      <Card title="Saved proposals">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-slate-400">
            Every proposal you generate is saved here. When someone opens one, it shows here and you get an email, so you know exactly who to follow up with.
          </p>
          <button onClick={load} className="text-xs text-orange-300 flex items-center gap-1 flex-none ml-3 hover:text-orange-200">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
        {loading ? (
          <p className="text-xs text-slate-500">Loading saved proposals...</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-slate-500">No proposals yet. Generate the first one above.</p>
        ) : (
          <div className="space-y-3">
            {items.map((p) => (
              <div key={p.slug} className="rounded-xl border border-white/10 bg-slate-900/60 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{p.name}</p>
                    <p className="text-[11px] text-slate-500 font-mono truncate">{linkOf(p)}</p>
                  </div>
                  <span className={`flex-none text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${p.opens ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700/40 text-slate-400'}`}>
                    {p.opens ? `Opened ${p.opens}${p.opens === 1 ? '' : 'x'}` : 'Not opened'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  {p.opens
                    ? <>Last opened {lagos(p.lastOpenedAt)} · first {lagos(p.firstOpenedAt)} · saved {lagos(p.createdAt)}</>
                    : <>Saved {lagos(p.createdAt)} · not opened yet</>}
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button onClick={() => copy(p)} className={btnGhost}>
                    {copiedSlug === p.slug ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copiedSlug === p.slug ? 'Copied!' : 'Copy link'}
                  </button>
                  <button onClick={() => openPreview(p)} className={btnGhost}>
                    <ExternalLink className="w-4 h-4" /> Open preview
                  </button>
                  <button onClick={() => downloadPdf(p)} className={btnGhost}>
                    <Download className="w-4 h-4" /> Download PDF
                  </button>
                  <button onClick={() => remove(p)} className="text-xs text-rose-300/80 hover:text-rose-300 flex items-center gap-1 px-3 py-2">
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default ProposalsTab;
