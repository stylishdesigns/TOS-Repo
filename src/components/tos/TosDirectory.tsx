import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import {
  api, fmtDate, fmtDateTime, STATUS_LABELS, STATUS_STYLES,
  StatusPill, Card, inputCls, btnGhost,
} from './tosShared';

// NOTE: this module was split out of TosPortal.tsx mechanically; code is
// moved verbatim with no behavior change. TosPortal.tsx imports it back.

// ---------------------------------------------------------------------------
// PLATFORM DIRECTORY (Prompt D, read only)
// ---------------------------------------------------------------------------
const SEAT_STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  disabled: 'Disabled',
  pending: 'Pending',
  unknown: 'Unknown',
};
const SEAT_STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  disabled: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  pending: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  unknown: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
};

const LoadingRow: React.FC = () => (
  <div className="flex items-center gap-2 text-slate-400 text-sm py-10 justify-center">
    <Loader2 className="w-4 h-4 animate-spin" /> Loading…
  </div>
);

const LoadMore: React.FC<{ onClick: () => void; busy: boolean; hidden?: boolean }> = ({ onClick, busy, hidden }) => {
  if (hidden) return null;
  return (
    <div className="flex justify-center pt-2">
      <button onClick={onClick} disabled={busy} className={btnGhost}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Load more
      </button>
    </div>
  );
};

const DirectorySearchBar: React.FC<{
  value: string; onChange: (v: string) => void; onSearch: () => void;
  placeholder: string; children?: React.ReactNode;
}> = ({ value, onChange, onSearch, placeholder, children }) => (
  <div className="flex flex-wrap items-center gap-3">
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') onSearch(); }}
      placeholder={placeholder}
      className={`${inputCls} max-w-72`}
    />
    <button onClick={onSearch} className={btnGhost}><RefreshCw className="w-4 h-4" /> Search</button>
    {children}
  </div>
);

export const OwnersTab: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (q: string) => {
    setLoading(true); setError('');
    try {
      const d = await api(`/api/tos/owners${q ? `?search=${encodeURIComponent(q)}` : ''}`);
      setRows(d.owners || []);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(''); }, [load]);

  return (
    <div className="space-y-4">
      <DirectorySearchBar
        value={search}
        onChange={setSearch}
        onSearch={() => load(search)}
        placeholder="Search by centre, owner name or email"
      />
      {error && <p className="text-rose-300 text-sm">{error}</p>}
      {loading ? <LoadingRow /> : rows.length === 0 ? (
        <Card><p className="text-slate-400 text-sm">No centre owners found.</p></Card>
      ) : (
        <div className="space-y-2">
          {rows.map((o) => (
            <div key={o.centreId} className="bg-slate-900/70 border border-white/10 rounded-2xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <p className="text-white font-bold">{o.centreName}</p>
                    <StatusPill status={o.status} labels={STATUS_LABELS} styles={STATUS_STYLES} />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {o.name || 'Name not on record'} · {o.email || 'No email on record'}{o.phone ? ` · ${o.phone}` : ''}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Last sign-in {o.lastSignInTime ? fmtDateTime(o.lastSignInTime) : 'never'}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const StudentsTab: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [nextCursor, setNextCursor] = useState('');
  const [search, setSearch] = useState('');
  const [centreId, setCentreId] = useState('');
  const [status, setStatus] = useState('');
  const [centres, setCentres] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [moreBusy, setMoreBusy] = useState(false);
  const [error, setError] = useState('');

  const buildQuery = (centre: string, cursorValue: string) => {
    const p = new URLSearchParams();
    if (centre) p.set('centreId', centre);
    if (status) p.set('status', status);
    if (search) p.set('search', search);
    if (cursorValue) p.set('cursor', cursorValue);
    const qs = p.toString();
    return `/api/tos/students${qs ? `?${qs}` : ''}`;
  };

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const d = await api(buildQuery(centreId, ''));
      setRows(d.students || []);
      setNextCursor(d.nextCursor || '');
      setCounts(d.counts || {});
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centreId, status, search]);

  useEffect(() => { load(); }, [centreId, status]);

  useEffect(() => {
    api('/api/tos/centres').then((d: any) => setCentres(d.centres || [])).catch(() => {});
  }, []);

  const more = async () => {
    if (!nextCursor) return;
    setMoreBusy(true); setError('');
    try {
      const d = await api(buildQuery(centreId, nextCursor));
      setRows((prev) => [...prev, ...(d.students || [])]);
      setNextCursor(d.nextCursor || '');
    } catch (e: any) { setError(e.message); } finally { setMoreBusy(false); }
  };

  const centreName = (id: string) => centres.find((c) => c.id === id)?.name || id;

  return (
    <div className="space-y-4">
      <DirectorySearchBar
        value={search}
        onChange={setSearch}
        onSearch={load}
        placeholder="Search by name, email or phone"
      >
        <select value={centreId} onChange={(e) => setCentreId(e.target.value)} className={`${inputCls} max-w-56`}>
          <option value="">All centres</option>
          {centres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputCls} max-w-44`}>
          <option value="">Any seat status</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
      </DirectorySearchBar>
      {error && <p className="text-rose-300 text-sm">{error}</p>}
      {!loading && Object.keys(counts).length > 0 && (
        <p className="text-[11px] text-slate-500">
          Students per centre: {Object.entries(counts).map(([id, n]) => `${centreName(id)}: ${n}`).join(' · ')}
        </p>
      )}
      {loading ? <LoadingRow /> : rows.length === 0 ? (
        <Card><p className="text-slate-400 text-sm">No students match this view.</p></Card>
      ) : (
        <>
          <div className="space-y-2">
            {rows.map((s) => (
              <div key={s.id} className="bg-slate-900/70 border border-white/10 rounded-2xl p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <p className="text-white font-bold">{s.name || 'Unnamed student'}</p>
                      <StatusPill status={s.seatStatus} labels={SEAT_STATUS_LABELS} styles={SEAT_STATUS_STYLES} />
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {s.email || 'No email on record'}{s.phone ? ` · ${s.phone}` : ''}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {s.centreName}{s.registrationDate ? ` · enrolled ${fmtDate(s.registrationDate)}` : ''}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <LoadMore onClick={more} busy={moreBusy} hidden={!nextCursor} />
        </>
      )}
    </div>
  );
};

export const TutorsTab: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [nextCursor, setNextCursor] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [moreBusy, setMoreBusy] = useState(false);
  const [error, setError] = useState('');

  const buildQuery = (cursorValue: string) =>
    `/api/tos/tutors${search ? `?search=${encodeURIComponent(search)}${cursorValue ? `&cursor=${encodeURIComponent(cursorValue)}` : ''}` : (cursorValue ? `?cursor=${encodeURIComponent(cursorValue)}` : '')}`;

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const d = await api(buildQuery(''));
      setRows(d.tutors || []);
      setNextCursor(d.nextCursor || '');
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => { load(); }, []);

  const more = async () => {
    if (!nextCursor) return;
    setMoreBusy(true); setError('');
    try {
      const d = await api(buildQuery(nextCursor));
      setRows((prev) => [...prev, ...(d.tutors || [])]);
      setNextCursor(d.nextCursor || '');
    } catch (e: any) { setError(e.message); } finally { setMoreBusy(false); }
  };

  return (
    <div className="space-y-4">
      <DirectorySearchBar
        value={search}
        onChange={setSearch}
        onSearch={load}
        placeholder="Search by name, email or phone"
      />
      {error && <p className="text-rose-300 text-sm">{error}</p>}
      {loading ? <LoadingRow /> : rows.length === 0 ? (
        <Card><p className="text-slate-400 text-sm">No tutors found across the platform yet.</p></Card>
      ) : (
        <>
          <div className="space-y-2">
            {rows.map((t) => (
              <div key={t.key} className="bg-slate-900/70 border border-white/10 rounded-2xl p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-white font-bold">{t.name || 'Unnamed tutor'}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {t.email || 'No email on record'}{t.phone ? ` · ${t.phone}` : ''}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Works for {(t.centres || []).length
                        ? t.centres.map((c: any) => `${c.name}${c.status && c.status !== 'Active' ? ` (${String(c.status).toLowerCase()})` : ''}`).join(', ')
                        : 'no centre on record'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <LoadMore onClick={more} busy={moreBusy} hidden={!nextCursor} />
        </>
      )}
    </div>
  );
};

const PEOPLE_TYPES = [
  { id: 'students', label: 'Students' },
  { id: 'tutors', label: 'Tutors' },
  { id: 'admins', label: 'Admins' },
  { id: 'owners', label: 'Owners' },
] as const;

export const CentrePeople: React.FC<{ centreId: string }> = ({ centreId }) => {
  const [type, setType] = useState<string>('students');
  const [items, setItems] = useState<any[]>([]);
  const [counts, setCounts] = useState<any | null>(null);
  const [seats, setSeats] = useState<any | null>(null);
  const [nextCursor, setNextCursor] = useState('');
  const [loading, setLoading] = useState(true);
  const [moreBusy, setMoreBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (t: string, cursorValue: string, append: boolean) => {
    if (append) setMoreBusy(true); else setLoading(true);
    setError('');
    try {
      const d = await api(`/api/tos/centres/${centreId}/people?type=${t}${cursorValue ? `&cursor=${encodeURIComponent(cursorValue)}` : ''}`);
      setItems((prev) => (append ? [...prev, ...(d.items || [])] : (d.items || [])));
      setNextCursor(d.nextCursor || '');
      if (!append) { setCounts(d.counts || null); setSeats(d.seats || null); }
    } catch (e: any) { setError(e.message); } finally { setLoading(false); setMoreBusy(false); }
  }, [centreId]);

  useEffect(() => { load(type, '', false); }, [type, load]);

  const renderRow = (item: any) => {
    if (type === 'students') {
      return (
        <>
          <div className="flex items-center gap-2.5 flex-wrap">
            <p className="text-white font-bold">{item.name || 'Unnamed student'}</p>
            <StatusPill status={item.seatStatus} labels={SEAT_STATUS_LABELS} styles={SEAT_STATUS_STYLES} />
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {item.email || 'No email on record'}{item.phone ? ` · ${item.phone}` : ''}
            {item.registrationDate ? ` · enrolled ${fmtDate(item.registrationDate)}` : ''}
          </p>
        </>
      );
    }
    if (type === 'tutors') {
      return (
        <>
          <p className="text-white font-bold">{item.name || 'Unnamed tutor'}</p>
          <p className="text-xs text-slate-400 mt-1">
            {item.email || 'No email on record'}{item.phone ? ` · ${item.phone}` : ''}
          </p>
        </>
      );
    }
    return (
      <>
        <div className="flex items-center gap-2.5 flex-wrap">
          <p className="text-white font-bold">{item.name || 'Name not on record'}</p>
          {item.status && <StatusPill status={item.status === 'owner of record' ? 'unknown' : item.status} labels={item.status === 'owner of record' ? { unknown: 'Owner of record' } : SEAT_STATUS_LABELS} styles={SEAT_STATUS_STYLES} />}
        </div>
        <p className="text-xs text-slate-400 mt-1">
          {item.email || 'No email on record'}{item.phone ? ` · ${item.phone}` : ''}
          {item.lastSignInTime ? ` · last sign-in ${fmtDateTime(item.lastSignInTime)}` : ''}
        </p>
      </>
    );
  };

  return (
    <div className="space-y-3">
      {counts && (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300">Owners {counts.owners}</span>
          <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300">Admins {counts.admins}</span>
          <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300">Tutors {counts.tutors}</span>
          <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300">Students {counts.students}</span>
          {seats && (
            <span className="px-2.5 py-1 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-300">
              Seats {seats.used}/{seats.cap || '∞'}
            </span>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {PEOPLE_TYPES.map((t) => (
          <button
            key={t.id}
            onClick={() => setType(t.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${type === t.id ? 'bg-orange-500/15 text-orange-300 border border-orange-500/30' : 'text-slate-400 hover:text-white border border-transparent'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {error && <p className="text-rose-300 text-sm">{error}</p>}
      {loading ? <LoadingRow /> : items.length === 0 ? (
        <p className="text-slate-500 text-sm">Nothing recorded here yet.</p>
      ) : (
        <>
          <div className="space-y-2">
            {items.map((item: any, i: number) => (
              <div key={item.id || item.uid || i} className="bg-slate-950/50 border border-white/5 rounded-xl px-3.5 py-2.5">
                {renderRow(item)}
              </div>
            ))}
          </div>
          <LoadMore onClick={() => load(type, nextCursor, true)} busy={moreBusy} hidden={!nextCursor} />
        </>
      )}
    </div>
  );
};
