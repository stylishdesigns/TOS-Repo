import React, { useMemo, useState } from 'react';
import { Copy, Check, ExternalLink, Download, FileText } from 'lucide-react';
import { Card, Field, inputCls, btnPrimary, btnGhost } from './tosShared';

/**
 * Batch 38: Proposals tab in the TOS console.
 * Generates a per-facility partnership-proposal link that opens a fully
 * designed proposal page addressed to that facility, with social preview
 * tags (WhatsApp, Facebook) and a direct PDF download on the page itself.
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

const ProposalsTab: React.FC = () => {
  const [name, setName] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const link = useMemo(() => (name.trim() ? proposalLinkFor(name.trim()) : ''), [name]);

  const copy = async () => {
    if (!link) return;
    setError('');
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch (e: any) {
      setError('Could not copy automatically. Select the link text and copy it.');
    }
  };

  const open = () => {
    if (link) window.open(link, '_blank', 'noopener');
  };

  const download = () => {
    // The proposal page auto-builds and saves the PDF when it opens with pdf=1.
    if (link) window.open(`${link}&pdf=1`, '_blank', 'noopener');
  };

  return (
    <div className="space-y-4">
      <Card title="Generate a proposal">
        <p className="text-xs text-slate-400 mb-4">
          Type a facility's name and copy its proposal link. The link opens a fully designed proposal page
          addressed to that facility, and when it is shared on WhatsApp or Facebook it shows a branded preview
          card with the facility's name in the title. The page carries its own Download PDF button, so the same
          design downloads as a PDF too. Prices are the same for every facility.
        </p>
        <Field label="Facility name">
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Bright Minds Tutorial"
            maxLength={120}
          />
        </Field>
        {link && (
          <div className="mt-3 rounded-xl border border-white/10 bg-slate-900/60 p-3">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Proposal link</p>
            <p className="text-xs text-orange-300 break-all font-mono">{link}</p>
          </div>
        )}
        {error && <p className="text-xs text-rose-400 mt-3">{error}</p>}
        <div className="flex flex-wrap gap-2 mt-4">
          <button onClick={copy} disabled={!link} className={btnPrimary}>
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          <button onClick={open} disabled={!link} className={btnGhost}>
            <ExternalLink className="w-4 h-4" /> Open preview
          </button>
          <button onClick={download} disabled={!link} className={btnGhost}>
            <Download className="w-4 h-4" /> Download PDF
          </button>
        </div>
      </Card>
      <Card title="How the link behaves">
        <div className="space-y-3 text-xs text-slate-400">
          <p className="flex gap-2">
            <FileText className="w-4 h-4 text-orange-400 flex-none mt-0.5" />
            <span>The link is public: whoever opens it sees the proposal, no sign-in needed. Anyone you send it to can read it.</span>
          </p>
          <p className="flex gap-2">
            <ExternalLink className="w-4 h-4 text-orange-400 flex-none mt-0.5" />
            <span>Shared on WhatsApp or Facebook, the link shows a Tutorial OS preview card whose title names the facility, e.g. "Tutorial OS x Bright Minds Tutorial - Partnership proposal".</span>
          </p>
          <p className="flex gap-2">
            <Download className="w-4 h-4 text-orange-400 flex-none mt-0.5" />
            <span>The Download PDF button on the page saves a copy of the exact same design, ready to print or attach to a WhatsApp message.</span>
          </p>
        </div>
      </Card>
    </div>
  );
};

export default ProposalsTab;
