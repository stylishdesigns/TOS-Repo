import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api, inputCls } from './tosShared';
import { LandingEditor } from '../landing/LandingEditor';

/**
 * App tab (piece 2 of the landing-page feature): the TOS-side builder for
 * each centre's public landing page. The dropdown picks the facility; the
 * editor itself lives in landing/LandingEditor and writes only PUBLIC
 * marketing content (centreLandingPages/{centreId}).
 */

export const WebsiteTab: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const [centres, setCentres] = useState<Array<{ id: string; name: string }>>([]);
  const [centreId, setCentreId] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    api('/api/tos/centres')
      .then((d: any) => {
        const list = (d?.centres || d?.items || []).map((c: any) => ({ id: String(c.id || c.centreId || ''), name: String(c.name || '') })).filter((c: any) => c.id);
        setCentres(list);
        if (list.length && !centreId) setCentreId(list[0].id);
      })
      .catch((e) => setErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <select value={centreId} onChange={(e) => setCentreId(e.target.value)} className={`${inputCls} max-w-[320px] min-h-[44px]`} aria-label="Choose a facility">
          {centres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {err && <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-100">{err}</div>}

      {!centres.length && !err ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading facilities…</div>
      ) : null}

      {centreId ? <LandingEditor key={centreId} apiPath={`/api/tos/landing/${centreId}`} /> : null}
    </div>
  );
};
