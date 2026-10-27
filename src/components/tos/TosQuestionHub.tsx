import React, { useEffect, useState } from 'react';
import {
  RefreshCw, Play, Lock, Globe2, FileJson, Eye, EyeOff, Users, CalendarDays,
  BookOpen, AlertTriangle, ChevronRight, CheckCircle2, CircleDashed,
} from 'lucide-react';
import { api, Json } from './tosShared';

/**
 * MB1 Step 1: the Question Bank hub (design screen 1) and the Mock Bank's
 * "Mock papers" tab (design screen 7).
 *
 * The hub is the landing screen of Question Bank: two bank cards with live
 * numbers read from the server summary, and a plain-language table of how the
 * two banks differ. Nothing here is hard-coded to today's data: every number
 * comes from /api/tos/questionbank/bank-summary.
 *
 * The Mock papers tab is Step 1's honest placeholder for the real workspace
 * (Step 4): it reads the mocks list and shows, for every mock that is past
 * Draft, its date, exam, size, paper-file state and answers state. No paper
 * file has ever been built yet, so "Not built yet" is read from the data, not
 * hard-coded: a mock carries no paperFile field until Step 4 builds one.
 */

interface BankStat { kind: string; questions?: number; subjects?: number; drafts?: number; edited?: number; removed?: number; pending?: number; currentVersion?: number; currentPublishedAt?: string | null; currentFileUrl?: string; locked?: number; mockPapersCount?: number; }
type Summary = { practice: BankStat; mock: BankStat } | null;

const num = (v: number | undefined) => (typeof v === 'number' ? v.toLocaleString() : '\u2013');

const HubStat: React.FC<{ label: string; value: string; tone: string }> = ({ label, value, tone }) => (
  <div className="rounded-xl bg-slate-950/50 border border-white/5 px-3 py-2.5">
    <p className={`text-lg font-black leading-none ${tone}`}>{value}</p>
    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-1">{label}</p>
  </div>
);

export const QuestionBankHub: React.FC<{ summary: Summary; loading: boolean; error: string; onOpen: (k: 'practice' | 'mock') => void }> = ({ summary, loading, error, onOpen }) => {
  const p = summary?.practice;
  const m = summary?.mock;
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-black text-white">Question Bank</h2>
        <p className="text-sm text-slate-400 mt-1">Two separate banks that never mix questions. Pick one to work in.</p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Practice card (design screen 1, left) */}
        <div className="rounded-2xl border-2 border-sky-500/40 bg-sky-500/[0.06] p-5 flex flex-col">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-sky-400 text-slate-950 text-[10px] font-black tracking-wider">PRACTICE BANK</span>
              <p className="text-sm text-slate-300 mt-2.5">Students practise from this bank, across every centre. It publishes to a public file on the CDN.</p>
            </div>
            <BookOpen className="w-8 h-8 text-sky-300 shrink-0" />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <HubStat label="Questions" value={num(p?.questions)} tone="text-sky-300" />
            <HubStat label="Subjects" value={num(p?.subjects)} tone="text-sky-300" />
            <HubStat label="Drafts waiting" value={num(p?.drafts)} tone="text-slate-200" />
            <HubStat label="Changed since publish" value={num(p?.edited)} tone="text-slate-200" />
          </div>
          {p?.currentVersion ? (
            <p className="text-[11px] text-slate-500 mt-3">Live version {p.currentVersion}{p.currentPublishedAt ? `, published ${new Date(p.currentPublishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}.</p>
          ) : (
            <p className="text-[11px] text-slate-500 mt-3">Nothing published yet.</p>
          )}
          <button onClick={() => onOpen('practice')}
            className="mt-4 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm min-h-[44px] transition-colors">
            <Play className="w-4 h-4" /> Open Practice Bank
          </button>
        </div>

        {/* Mock card (design screen 1, right) */}
        <div className="rounded-2xl border-2 border-amber-500/40 bg-amber-500/[0.06] p-5 flex flex-col">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black tracking-wider">MOCK BANK</span>
              <p className="text-sm text-slate-300 mt-2.5">Feeds the daily mock exam only. Its questions are private: no public file, answers stay on the server.</p>
            </div>
            <Lock className="w-8 h-8 text-amber-300 shrink-0" />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <HubStat label="Questions" value={num(m?.questions)} tone="text-amber-300" />
            <HubStat label="Subjects" value={num(m?.subjects)} tone="text-amber-300" />
            <HubStat label="Drafts waiting" value={num(m?.drafts)} tone="text-slate-200" />
            <HubStat label="Locked in mocks" value={num(m?.locked)} tone="text-slate-200" />
          </div>
          <p className="text-[11px] text-slate-500 mt-3">Locking lands with the next step: once a scheduled mock takes questions, editing is stopped on the server.</p>
          <button onClick={() => onOpen('mock')}
            className="mt-4 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm min-h-[44px] transition-colors">
            <Play className="w-4 h-4" /> Open Mock Bank
          </button>
        </div>
      </div>

      {/* How they differ (design screen 1, bottom) */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/50 overflow-hidden">
        <p className="px-5 pt-4 pb-1 text-sm font-black text-white">How they differ</p>
        <div className="px-5 pb-5 pt-2 overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-3"></th>
                <th className="py-2 pr-3 text-sky-300">Practice Bank</th>
                <th className="py-2 text-amber-300">Mock Bank</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              <tr className="border-t border-white/5">
                <td className="py-2.5 pr-3 font-bold text-slate-200">Who uses it</td>
                <td className="py-2.5 pr-3">Every centre's students, practising any time</td>
                <td className="py-2.5">The daily mock exam only</td>
              </tr>
              <tr className="border-t border-white/5">
                <td className="py-2.5 pr-3 font-bold text-slate-200">How students get it</td>
                <td className="py-2.5 pr-3">A public file on the CDN, cached in the browser</td>
                <td className="py-2.5">A private paper, opened through a short-lived link from the server</td>
              </tr>
              <tr className="border-t border-white/5">
                <td className="py-2.5 pr-3 font-bold text-slate-200">Answers and explanations</td>
                <td className="py-2.5 pr-3">In the file; students see them while they practise</td>
                <td className="py-2.5">Firestore only; shown after results release at 6:00 am</td>
              </tr>
              <tr className="border-t border-white/5">
                <td className="py-2.5 pr-3 font-bold text-slate-200">How questions leave</td>
                <td className="py-2.5 pr-3">Publish writes one versioned public file</td>
                <td className="py-2.5">A scheduled mock freezes its questions into a private paper</td>
              </tr>
              <tr className="border-t border-white/5">
                <td className="py-2.5 pr-3 font-bold text-slate-200">Never mixes</td>
                <td className="py-2.5 pr-3" colSpan={2}>A question belongs to exactly one bank, and no screen moves one across. Both libraries list only their own questions.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {loading && <p className="text-xs text-slate-500">Reading the bank numbers&hellip;</p>}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Mock papers tab (design screen 7). Step 1 shows the workspace shape and the
// real mock list; Step 4 fills the paper building in.
// ---------------------------------------------------------------------------

const lagosYmd = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const MOCK_STEPS = [
  'Schedule the mock, size and exam type. From here or from the Mocks screen.',
  'The bank freezes the questions it will use. Nothing can be edited after this.',
  'Students sit the paper. Everything runs in the browser; one attempt.',
  'Results release at 6:00 am the next morning. Answers unlock, leaderboard settles.',
];

export const MockPapersTab: React.FC<{ refreshKey: number }> = ({ refreshKey }) => {
  const [data, setData] = useState<Json | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit' }).format(new Date());
    setLoading(true);
    setError('');
    api(`/api/tos/mocks?month=${month}`)
      .then((r) => { if (alive) setData(r); })
      .catch((e) => { if (alive) setError(e?.message || 'Could not load the mock list.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [refreshKey]);

  const mocks = Array.isArray(data?.mocks) ? (data.mocks as any[]) : [];
  const shown = mocks.filter((mm) => mm.status && mm.status !== 'draft');
  const today = lagosYmd();

  const stateOf = (mm: any) => {
    switch (mm.status) {
      case 'scheduled': return mm.date === today ? 'Opens today' : 'Scheduled';
      case 'live': return 'Open today';
      case 'closed': return 'Closed, awaiting results';
      case 'released': return 'Results out';
      default: return String(mm.status);
    }
  };
  const answersOf = (mm: any) => (mm.status === 'released' ? 'Released to students' : 'In Firestore only');
  const paperOf = (mm: any) => (mm.paperFileUrl ? 'Built' : 'Not built yet');

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {MOCK_STEPS.map((step, i) => (
          <div key={i} className="rounded-xl border border-white/10 bg-slate-900/50 p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-amber-300 mb-1.5">Step {i + 1}</p>
            <p className="text-xs text-slate-300 leading-relaxed">{step}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-100 leading-relaxed">
          Mock papers are private. Questions and options are written to a private Cloudinary file; answers and explanations stay in Firestore and are shown only after results release. Students receive a short-lived link when they start; the link expires. No public mock file ever exists.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-900/50 overflow-hidden">
        <div className="px-5 pt-4 pb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-black text-white">Papers</p>
          <p className="text-[11px] text-slate-500">This month in Lagos time</p>
        </div>
        {error && <p className="px-5 pb-4 text-sm text-rose-300">{error}</p>}
        {loading && <p className="px-5 pb-4 text-sm text-slate-500">Loading mocks&hellip;</p>}
        {!loading && !error && shown.length === 0 && (
          <p className="px-5 pb-5 text-sm text-slate-500">No mocks scheduled yet. Schedule one from the Mocks screen, or from the Mock Bank import tab once it is ready.</p>
        )}
        {!loading && !error && shown.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 border-t border-white/5">
                  <th className="px-5 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Exam</th>
                  <th className="px-3 py-2.5">Size</th>
                  <th className="px-3 py-2.5">Paper file</th>
                  <th className="px-3 py-2.5">Answers</th>
                  <th className="px-3 py-2.5">State</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((mm) => (
                  <tr key={String(mm.id)} className="border-t border-white/5 text-slate-300">
                    <td className="px-5 py-3 font-bold text-slate-100 whitespace-nowrap">
                      {new Date(`${String(mm.date)}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </td>
                    <td className="px-3 py-3">{mm.examType === 'jamb' ? 'JAMB' : mm.examType === 'waec_neco' ? 'WAEC/NECO' : String(mm.examType)}</td>
                    <td className="px-3 py-3">{typeof mm.questionCount === 'number' ? `${mm.questionCount} questions` : '\u2013'}</td>
                    <td className="px-3 py-3">{paperOf(mm)}</td>
                    <td className="px-3 py-3">{answersOf(mm)}</td>
                    <td className="px-3 py-3">{stateOf(mm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-500">Step 4 of the Mock Bank build replaces this list with the full paper workspace: build the paper, inspect the frozen questions, watch attempts and release results.</p>
    </div>
  );
};
