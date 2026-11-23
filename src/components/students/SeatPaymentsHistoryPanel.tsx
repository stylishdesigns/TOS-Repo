import React, { useCallback, useEffect, useState } from 'react';
import { Eye, Loader2, Receipt, RefreshCw, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { api } from '../tos/tosShared';

// Seat Payment History: every payment this facility has made for seats, with
// the receipt, when it was paid, and when Tutorial OS confirmed it. Nothing
// here ever names an admin: the confirmation party is always Tutorial OS.
export const SeatPaymentsHistoryPanel: React.FC = () => {
  const { activeCentreId, addToast } = useApp();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewReceipt, setViewReceipt] = useState<any | null>(null);
  const [viewMore, setViewMore] = useState<any | null>(null);

  const load = useCallback(async () => {
    if (!activeCentreId) return;
    setLoading(true);
    try {
      const d: any = await api(`/api/centre/seats/payment-history?centreId=${encodeURIComponent(activeCentreId)}`);
      setRows(Array.isArray(d?.payments) ? d.payments : []);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Could not load payments', description: err.message || 'Try again.' });
    } finally {
      setLoading(false);
    }
  }, [activeCentreId, addToast]);

  useEffect(() => { load(); }, [load]);

  const fmtDateTime = (iso: string) => {
    if (!iso) return 'Not recorded';
    try {
      return new Date(iso).toLocaleString([], {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return iso; }
  };
  const nairaFmt = (n: number) => `\u20A6${Number(n || 0).toLocaleString()}`;

  const statusOf = (r: any) => {
    const s = String(r.status || 'pending');
    if (s === 'approved') return { label: 'Confirmed', cls: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10' };
    if (s === 'declined') return { label: 'Declined', cls: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10' };
    return { label: 'Awaiting confirmation from Tutorial OS', cls: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10' };
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">Seat Payment History</h3>
          <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Every payment made for seats: the receipt, when it was paid, and when Tutorial OS confirmed it.
          </p>
        </div>
        <button
          onClick={load}
          className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading payments...
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-8 text-center">
          <Receipt className="w-6 h-6 mx-auto text-slate-300 dark:text-slate-600" />
          <p className="text-xs text-slate-400 mt-2">No seat payments yet. When you pay for seats, the payment and its receipt appear here.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700/60">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr className="text-[10px] uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2.5 font-bold">Paid on</th>
                <th className="px-3 py-2.5 font-bold">Seats</th>
                <th className="px-3 py-2.5 font-bold">Amount</th>
                <th className="px-3 py-2.5 font-bold">Status</th>
                <th className="px-3 py-2.5 font-bold text-right">Receipt</th>
                <th className="px-3 py-2.5 font-bold text-right">More</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((r) => {
                const st = statusOf(r);
                return (
                  <tr key={`${r.source}-${r.id}`} className="text-slate-700 dark:text-slate-200">
                    <td className="px-3 py-2.5 whitespace-nowrap">{fmtDateTime(r.paidAt)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-bold">
                      {r.seats} seat{Number(r.seats) === 1 ? '' : 's'}
                      {r.planName ? <span className="block text-[10px] font-semibold text-slate-400">{r.planName}</span> : null}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-bold">{nairaFmt(r.amount)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${st.cls}`}>{st.label}</span>
                      {r.status === 'approved' && r.confirmedAt ? (
                        <span className="block text-[10px] text-slate-400 mt-0.5">{fmtDateTime(r.confirmedAt)}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {r.receiptUrl ? (
                        <button
                          onClick={() => setViewReceipt(r)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-[var(--brand,#0F172A)] hover:brightness-125"
                        >
                          <Eye className="w-3.5 h-3.5" /> View receipt
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-400">None</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        onClick={() => setViewMore(r)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white"
                      >
                        View more
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {viewReceipt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setViewReceipt(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl p-5 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Payment receipt</h3>
              <button onClick={() => setViewReceipt(null)} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            {String(viewReceipt.receiptUrl).toLowerCase().endsWith('.pdf') ? (
              <iframe src={viewReceipt.receiptUrl} title="Payment receipt" className="w-full h-72 rounded-xl border border-slate-100 dark:border-slate-700" />
            ) : (
              <img src={viewReceipt.receiptUrl} alt="Payment receipt" className="w-full max-h-72 object-contain rounded-xl" />
            )}
          </div>
        </div>
      )}

      {viewMore && (() => {
        const st = statusOf(viewMore);
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setViewMore(null)}
          >
            <div
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-3xl p-5 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-black text-slate-900 dark:text-white">Payment details</h3>
                <button onClick={() => setViewMore(null)} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                {([
                  ['Seats paid for', `${viewMore.seats} seat${Number(viewMore.seats) === 1 ? '' : 's'}${viewMore.planName ? ` on the ${viewMore.planName} plan` : ''}`],
                  ['Amount', nairaFmt(viewMore.amount)],
                  ['Payment made on', fmtDateTime(viewMore.paidAt)],
                  ['Status', st.label],
                  ['Confirmed on', viewMore.status === 'approved' ? fmtDateTime(viewMore.confirmedAt) : 'Awaiting confirmation from Tutorial OS'],
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-3 px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
                    <p className="text-xs font-bold text-slate-900 dark:text-white text-right">{value}</p>
                  </div>
                ))}
              </div>
              {viewMore.receiptUrl ? (
                <div className="mt-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Receipt</p>
                  {String(viewMore.receiptUrl).toLowerCase().endsWith('.pdf') ? (
                    <iframe src={viewMore.receiptUrl} title="Payment receipt" className="w-full h-56 rounded-xl border border-slate-100 dark:border-slate-700" />
                  ) : (
                    <img src={viewMore.receiptUrl} alt="Payment receipt" className="w-full max-h-56 object-contain rounded-xl" />
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 mt-3">No receipt was attached to this payment.</p>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
};
