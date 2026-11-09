import React, { useCallback, useEffect, useState } from 'react';
import { Check, Inbox, Phone, RefreshCw, RotateCcw, Mail } from 'lucide-react';

/**
 * Website Enquiries inbox for centre admins (landing-page piece 3).
 *
 * Every enquiry a visitor submits on the centre's public landing page lands
 * here: who sent it, how to reach them, and what they asked. Scoped strictly
 * to the signed-in admin's own centre by the server.
 */

type Lead = {
  id: string;
  name: string;
  phone: string;
  email: string;
  message: string;
  status: 'new' | 'handled';
  createdAt: string;
};

function dayLabel(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Today ${time}`;
  const yest = new Date(now.getTime() - 24 * 3600 * 1000);
  if (d.toDateString() === yest.toDateString()) return `Yesterday ${time}`;
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`;
}

function waDigits(v: string): string {
  let digits = (v || '').replace(/[^0-9]/g, '');
  // Nigerian numbers are usually saved locally (0903…); wa.me needs 234….
  if (digits.length === 11 && digits.startsWith('0')) digits = '234' + digits.slice(1);
  return digits;
}
const waLink = (phone: string): string => { const d = waDigits(phone); return d ? `https://wa.me/${d}` : '#'; };

export const LandingEnquiries: React.FC = () => {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    setErr('');
    try {
      const r = await fetch('/api/landing-leads');
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j?.error || 'Could not load enquiries. Please try again.');
        setLeads([]);
      } else {
        setLeads(j.leads || []);
      }
    } catch {
      setErr('Could not load enquiries. Please check your connection and try again.');
      setLeads([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const flip = async (lead: Lead) => {
    setBusyId(lead.id);
    try {
      const next = lead.status === 'new' ? 'handled' : 'new';
      const r = await fetch(`/api/landing-leads/${encodeURIComponent(lead.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (r.ok) {
        setLeads((ls) => (ls || []).map((l) => (l.id === lead.id ? { ...l, status: next } : l)));
      }
    } finally {
      setBusyId('');
    }
  };

  const newCount = (leads || []).filter((l) => l.status === 'new').length;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white">Website Enquiries</h1>
          <p className="text-sm text-slate-400 mt-1">
            Messages parents and students send through your centre's landing page.
            {leads && newCount > 0 ? ` ${newCount} new.` : ''}
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-[#0F1B2E] text-slate-300 border border-slate-800 hover:bg-[#15233C] min-h-[44px]"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-900/60 bg-red-950/40 text-red-200 text-sm px-4 py-3">{err}</div>
      ) : null}

      {leads === null && !err ? (
        <div className="text-slate-500 text-sm py-10 text-center">Loading…</div>
      ) : null}

      {leads && leads.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-[#0F1B2E]/60 px-6 py-12 text-center">
          <Inbox className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-300 font-semibold">No enquiries yet</p>
          <p className="text-slate-500 text-sm mt-1">
            When someone fills the enquiry form on your landing page, their message shows up here.
          </p>
        </div>
      ) : null}

      <div className="space-y-3">
        {(leads || []).map((l) => (
          <div
            key={l.id}
            className={`rounded-2xl border px-4 py-4 sm:px-5 ${l.status === 'new' ? 'border-[#EA580C]/50 bg-[#0F1B2E]' : 'border-slate-800 bg-[#0F1B2E]/50'}`}
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-bold text-[15px]">{l.name}</span>
                  {l.status === 'new' ? (
                    <span className="text-[10px] font-extrabold uppercase tracking-wide bg-[#EA580C] text-white px-2 py-0.5 rounded-full">New</span>
                  ) : null}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{dayLabel(l.createdAt)}</div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`tel:${l.phone.replace(/\s/g, '')}`}
                  title="Call"
                  className="w-9 h-9 rounded-full bg-[#15233C] text-slate-300 hover:text-white flex items-center justify-center border border-slate-800"
                >
                  <Phone className="w-4 h-4" />
                </a>
                <a
                  href={waLink(l.phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Chat on WhatsApp"
                  className="w-9 h-9 rounded-full bg-[#25D366]/20 text-[#25D366] hover:bg-[#25D366] hover:text-white flex items-center justify-center border border-[#25D366]/30"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.6.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4 0-.6.2-.8l.4-.5c.1-.2.2-.3.3-.5v-.5c0-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1.1 2.7c.1.2 1.9 2.9 4.6 4 .6.3 1.1.4 1.5.5.6.2 1.2.2 1.6.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z" />
                  </svg>
                </a>
                {l.email ? (
                  <a
                    href={`mailto:${l.email}`}
                    title={l.email}
                    className="w-9 h-9 rounded-full bg-[#15233C] text-slate-300 hover:text-white flex items-center justify-center border border-slate-800"
                  >
                    <Mail className="w-4 h-4" />
                  </a>
                ) : null}
                <button
                  onClick={() => flip(l)}
                  disabled={busyId === l.id}
                  className="flex items-center gap-1.5 px-3 h-9 rounded-full text-xs font-semibold border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-50"
                >
                  {l.status === 'new' ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> Mark handled
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-3.5 h-3.5" /> Mark new
                    </>
                  )}
                </button>
              </div>
            </div>
            <p className="text-sm text-slate-300 mt-3 whitespace-pre-wrap break-words">{l.message}</p>
            <div className="text-xs text-slate-500 mt-2">{l.phone}{l.email ? ` · ${l.email}` : ''}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
