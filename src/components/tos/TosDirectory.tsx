import React, { useCallback, useEffect, useState } from 'react';
import { loadLastGood, saveLastGood } from '../../lib/lastGood';
import { Loader2, Ban, Trash2, RotateCcw, X } from 'lucide-react';
import {
  api, fmtDate, fmtDateTime,
  StatusPill, btnGhost,
} from './tosShared';

// NOTE: the platform-wide Owners/Students/Tutors directory tabs were removed:
// every centre's people now live in a table inside that centre's own record
// in the TOS console, with the same member powers a TC admin has (suspend,
// restore, remove, delete). This module keeps only that per-centre table.

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

const PEOPLE_TYPES = [
  { id: 'students', label: 'Students' },
  { id: 'tutors', label: 'Tutors' },
  { id: 'admins', label: 'Admins' },
  { id: 'owners', label: 'Owners' },
] as const;

const VISIBLE_ROWS = 8;
const MAX_MEMBERS = 500;

const ACTION_COPY: Record<string, string> = {
  suspend: 'loses access until restored.',
  restore: 'gets their access back.',
  remove: 'loses access to this centre. Their record stays on file.',
  delete: 'is removed from this centre completely. This cannot be undone.',
};

export const CentrePeople: React.FC<{ centreId: string }> = ({ centreId }) => {
  const [type, setType] = useState<string>('students');
  const [items, setItems] = useState<any[]>(() => loadLastGood<any[]>(`dir:${centreId}:${'students'}:items`) || []);
  const [counts, setCounts] = useState<any | null>(() => loadLastGood<any>(`dir:${centreId}:students:counts`));
  const [seats, setSeats] = useState<any | null>(() => loadLastGood<any>(`dir:${centreId}:students:seats`));
  const [nextCursor, setNextCursor] = useState('');
  const [loading, setLoading] = useState(true);
  const [moreBusy, setMoreBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [pending, setPending] = useState<{ role: string; item: any; action: string } | null>(null);

  const fetchPage = useCallback(async (t: string, cursorValue: string, append: boolean) => {
    const d = await api(`/api/tos/centres/${centreId}/people?type=${t}&pageSize=100${cursorValue ? `&cursor=${encodeURIComponent(cursorValue)}` : ''}`);
    if (!append) {
      setItems((d.items || []).slice(0, MAX_MEMBERS));
      setCounts(d.counts || null);
      setSeats(d.seats || null);
      saveLastGood(`dir:${centreId}:${t}:items`, (d.items || []).slice(0, MAX_MEMBERS));
      saveLastGood(`dir:${centreId}:${t}:counts`, d.counts || null);
      saveLastGood(`dir:${centreId}:${t}:seats`, d.seats || null);
    } else {
      setItems((prev) => [...prev, ...(d.items || [])].slice(0, MAX_MEMBERS));
    }
    setNextCursor(d.nextCursor || '');
  }, [centreId]);

  const load = useCallback(async (t: string) => {
    setLoading(true); setError('');
    try { await fetchPage(t, '', false); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [fetchPage]);

  useEffect(() => { load(type); }, [type, load]);

  const switchType = (t: string) => {
    setType(t); setExpanded(false); setPending(null);
    // Show the saved copy of this people type at once, then refresh.
    const cachedItems = loadLastGood<any[]>(`dir:${centreId}:${t}:items`);
    if (cachedItems && cachedItems.length) {
      setItems(cachedItems);
      setCounts(loadLastGood<any>(`dir:${centreId}:${t}:counts`) || null);
      setSeats(loadLastGood<any>(`dir:${centreId}:${t}:seats`) || null);
    } else {
      setItems([]); setCounts(null); setSeats(null);
    }
  };

  // "See the rest": pull every remaining page of this people type at once.
  const seeAll = async () => {
    setExpanded(true);
    setMoreBusy(true); setError('');
    try {
      let cursor = nextCursor;
      let guard = 0;
      while (cursor && guard < 10) {
        const d = await api(`/api/tos/centres/${centreId}/people?type=${type}&pageSize=100&cursor=${encodeURIComponent(cursor)}`);
        setItems((prev) => [...prev, ...(d.items || [])].slice(0, MAX_MEMBERS));
        cursor = d.nextCursor || '';
        setNextCursor(cursor);
        guard += 1;
      }
    } catch (e: any) { setError(e.message); }
    finally { setMoreBusy(false); }
  };

  const runAction = async (role: string, item: any, action: string) => {
    setBusyKey(`${item.uid || item.id}:${action}`);
    setError('');
    try {
      await api(`/api/tos/centres/${centreId}/members/action`, {
        method: 'POST',
        body: { role, uid: item.uid || '', docId: item.id || '', action },
      });
      setPending(null);
      await load(type);
    } catch (e: any) { setError(e.message); }
    finally { setBusyKey(''); }
  };

  const memberName = (item: any) => item.name || (type === 'students' ? 'Unnamed student' : 'Name not on record');
  const renderRow = (item: any) => {
    const uid = item.uid || '';
    const docId = item.id || '';
    const busy = busyKey !== '';
    if (type === 'students') {
      return (
        <tr key={uid || docId} className="border-t border-white/5">
          <td className="py-2.5 pr-3"><span className="text-white font-semibold">{memberName(item)}</span></td>
          <td className="py-2.5 pr-3 text-xs text-slate-400">{item.email || '—'}{item.phone ? ` · ${item.phone}` : ''}</td>
          <td className="py-2.5 pr-3"><StatusPill status={item.seatStatus} labels={SEAT_STATUS_LABELS} styles={SEAT_STATUS_STYLES} /></td>
          <td className="py-2.5 pr-3 text-xs text-slate-400">{item.registrationDate ? fmtDate(item.registrationDate) : '—'}</td>
          <td className="py-2.5 text-right">
            {uid ? (
              <div className="flex items-center justify-end gap-1.5">
                {item.seatStatus === 'active' ? (
                  <button onClick={() => setPending({ role: 'student', item, action: 'suspend' })} disabled={busy} className="px-2.5 py-1.5 rounded-lg border border-white/10 text-[11px] font-bold text-slate-300 hover:border-amber-500/40 hover:text-amber-300 disabled:opacity-40" title="Suspend access">Suspend</button>
                ) : (
                  <button onClick={() => setPending({ role: 'student', item, action: 'restore' })} disabled={busy} className="px-2.5 py-1.5 rounded-lg border border-white/10 text-[11px] font-bold text-slate-300 hover:border-emerald-500/40 hover:text-emerald-300 disabled:opacity-40" title="Restore access">Restore</button>
                )}
                <button onClick={() => setPending({ role: 'student', item, action: 'remove' })} disabled={busy} className="px-2.5 py-1.5 rounded-lg border border-white/10 text-[11px] font-bold text-slate-300 hover:border-orange-500/40 hover:text-orange-300 disabled:opacity-40" title="Revoke access, keep the record">Remove</button>
                <button onClick={() => setPending({ role: 'student', item, action: 'delete' })} disabled={busy} className="px-2.5 py-1.5 rounded-lg border border-white/10 text-[11px] font-bold text-rose-300 hover:border-rose-500/40 disabled:opacity-40" title="Delete completely">Delete</button>
              </div>
            ) : <span className="text-slate-600 text-xs">—</span>}
          </td>
        </tr>
      );
    }
    if (type === 'tutors') {
      return (
        <tr key={docId} className="border-t border-white/5">
          <td className="py-2.5 pr-3"><span className="text-white font-semibold">{memberName(item)}</span></td>
          <td className="py-2.5 pr-3 text-xs text-slate-400">{item.email || '—'}{item.phone ? ` · ${item.phone}` : ''}</td>
          <td className="py-2.5 pr-3"><span className={`text-[11px] font-bold ${item.status === 'Suspended' ? 'text-rose-300' : 'text-emerald-300'}`}>{item.status || '—'}</span></td>
          <td className="py-2.5 text-right">
            {docId ? (
              <div className="flex items-center justify-end gap-1.5">
                {item.status === 'Suspended' ? (
                  <button onClick={() => setPending({ role: 'tutor', item, action: 'restore' })} disabled={busy} className="px-2.5 py-1.5 rounded-lg border border-white/10 text-[11px] font-bold text-slate-300 hover:border-emerald-500/40 hover:text-emerald-300 disabled:opacity-40">Restore</button>
                ) : (
                  <button onClick={() => setPending({ role: 'tutor', item, action: 'suspend' })} disabled={busy} className="px-2.5 py-1.5 rounded-lg border border-white/10 text-[11px] font-bold text-slate-300 hover:border-amber-500/40 hover:text-amber-300 disabled:opacity-40">Suspend</button>
                )}
                <button onClick={() => setPending({ role: 'tutor', item, action: 'delete' })} disabled={busy} className="px-2.5 py-1.5 rounded-lg border border-white/10 text-[11px] font-bold text-rose-300 hover:border-rose-500/40 disabled:opacity-40" title="Remove from the centre">Delete</button>
              </div>
            ) : <span className="text-slate-600 text-xs">—</span>}
          </td>
        </tr>
      );
    }
    const isOwner = item.status === 'owner of record';
    return (
      <tr key={uid || docId} className="border-t border-white/5">
        <td className="py-2.5 pr-3"><span className="text-white font-semibold">{memberName(item)}</span></td>
        <td className="py-2.5 pr-3 text-xs text-slate-400">{item.email || '—'}{item.phone ? ` · ${item.phone}` : ''}</td>
        <td className="py-2.5 pr-3">
          {isOwner
            ? <StatusPill status="unknown" labels={{ unknown: 'Owner of record' }} styles={SEAT_STATUS_STYLES} />
            : <span className={`text-[11px] font-bold ${item.status === 'Suspended' ? 'text-rose-300' : 'text-emerald-300'}`}>{item.status || '—'}</span>}
        </td>
        <td className="py-2.5 pr-3 text-xs text-slate-400">{item.lastSignInTime ? fmtDateTime(item.lastSignInTime) : 'never'}</td>
        <td className="py-2.5 text-right">
          {!isOwner && uid ? (
            <div className="flex items-center justify-end gap-1.5">
              {item.status === 'Suspended' ? (
                <button onClick={() => setPending({ role: 'admin', item, action: 'restore' })} disabled={busy} className="px-2.5 py-1.5 rounded-lg border border-white/10 text-[11px] font-bold text-slate-300 hover:border-emerald-500/40 hover:text-emerald-300 disabled:opacity-40">Restore</button>
              ) : (
                <button onClick={() => setPending({ role: 'admin', item, action: 'suspend' })} disabled={busy} className="px-2.5 py-1.5 rounded-lg border border-white/10 text-[11px] font-bold text-slate-300 hover:border-amber-500/40 hover:text-amber-300 disabled:opacity-40">Suspend</button>
              )}
              <button onClick={() => setPending({ role: 'admin', item, action: 'delete' })} disabled={busy} className="px-2.5 py-1.5 rounded-lg border border-white/10 text-[11px] font-bold text-rose-300 hover:border-rose-500/40 disabled:opacity-40" title="Remove this admin from the centre">Delete</button>
            </div>
          ) : <span className="text-slate-600 text-xs">—</span>}
        </td>
      </tr>
    );
  };

  const shown = expanded ? items : items.slice(0, VISIBLE_ROWS);
  const canSeeAll = !expanded && (items.length > VISIBLE_ROWS || nextCursor !== '');
  const columns = type === 'students'
    ? ['Name', 'Contact', 'Seat', 'Enrolled', '']
    : type === 'tutors'
      ? ['Name', 'Contact', 'Status', '']
      : ['Name', 'Contact', 'Status', 'Last sign-in', ''];

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
            onClick={() => switchType(t.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${type === t.id ? 'bg-orange-500/15 text-orange-300 border border-orange-500/30' : 'text-slate-400 hover:text-white border border-transparent'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {error && <p className="text-rose-300 text-sm">{error}</p>}
      {loading && items.length === 0 ? <LoadingRow /> : items.length === 0 ? (
        <p className="text-slate-500 text-sm">Nothing recorded here yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                {columns.map((c, i) => <th key={i} className={`py-2 pr-3 font-bold ${i === columns.length - 1 ? 'text-right' : ''}`}>{c}</th>)}
              </tr>
            </thead>
            <tbody>{shown.map(renderRow)}</tbody>
          </table>
          <div className="flex justify-center pt-3">
            {canSeeAll && (
              <button onClick={seeAll} disabled={moreBusy} className={btnGhost}>
                {moreBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                See the rest ({(counts?.[type] ?? items.length) > items.length ? `${counts?.[type]} ` : ''}members)
              </button>
            )}
          </div>
        </div>
      )}

      {pending && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPending(null)}>
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-2">
              <h3 className="text-white font-bold capitalize">
                {pending.action} {memberName(pending.item)}?
              </h3>
              <button onClick={() => setPending(null)} className="text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed">
              {memberName(pending.item)} {ACTION_COPY[pending.action] || ''}
            </p>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setPending(null)} className={`${btnGhost} flex-1`}>Cancel</button>
              <button
                onClick={() => runAction(pending.role, pending.item, pending.action)}
                disabled={busyKey !== ''}
                className={`flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-xl ${pending.action === 'delete' ? 'bg-rose-600 hover:bg-rose-500' : 'bg-orange-600 hover:bg-orange-500'} disabled:opacity-50 text-white font-bold text-sm`}
              >
                {busyKey !== '' ? <Loader2 className="w-4 h-4 animate-spin" /> : `${pending.action.charAt(0).toUpperCase()}${pending.action.slice(1)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
