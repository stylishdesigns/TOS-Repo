import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { useFirebase } from '../../../context/FirebaseContext';
import { CheckCircle, ChevronDown, Sparkles, TrendingUp } from 'lucide-react';
import { flushPendingPracticeSummaries, localDay, PRACTISE_NOW_KEY } from '../practiceSummaryClient';

// Practice Analytics (Prompt P5b). Shows the student their OWN practice
// numbers only: what they answered, how well, and when. Nothing here feeds
// Performance, scores, leaderboards or tutor views, and nothing about the
// question bank itself (no bank counts, no class comparisons).

interface TopicStats {
  name: string;
  answered: number;
  correct: number;
}

interface SubjectStats {
  name: string;
  answered: number;
  correct: number;
  topics?: Record<string, TopicStats>;
}

interface Summary {
  updatedAt: string | null;
  totals: { answered: number; correct: number; sessions: number };
  days: Record<string, boolean>;
  subjects: Record<string, SubjectStats>;
  recent: Array<{
    at: string;
    examType?: string;
    subject?: string;
    topic?: string;
    mode?: string;
    answered?: number;
    correct?: number;
  }>;
}

const CACHE_KEY = 'TOS_practice_last_summary';

function pct(correct: number, answered: number): number {
  if (!answered || answered <= 0) return 0;
  return Math.round((correct / answered) * 100);
}

function dayKeyFor(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function readCache(): Summary | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || !v.totals || typeof v.totals.answered !== 'number') return null;
    return v as Summary;
  } catch {
    return null;
  }
}

function writeCache(s: Summary | null) {
  try {
    if (s) localStorage.setItem(CACHE_KEY, JSON.stringify(s));
    else localStorage.removeItem(CACHE_KEY);
  } catch { /* ignore */ }
}

interface Row {
  subject: string;
  topic: string;
  answered: number;
  correct: number;
}

function collectTopics(s: Summary): Row[] {
  const rows: Row[] = [];
  for (const sk of Object.keys(s.subjects || {})) {
    const sub = s.subjects[sk];
    const subjectName = sub?.name || sk;
    for (const tk of Object.keys(sub?.topics || {})) {
      const t = sub.topics![tk];
      if (!t || typeof t.answered !== 'number' || t.answered <= 0) continue;
      rows.push({ subject: subjectName, topic: t?.name || tk, answered: t.answered, correct: t.correct || 0 });
    }
  }
  return rows;
}

interface SubjectRow {
  key: string;
  name: string;
  answered: number;
  correct: number;
  topics: Array<{ key: string; name: string; answered: number; correct: number }>;
}

function collectSubjects(s: Summary): SubjectRow[] {
  const rows: SubjectRow[] = [];
  for (const sk of Object.keys(s.subjects || {})) {
    const sub = s.subjects[sk];
    if (!sub || !sub.answered || sub.answered <= 0) continue;
    const topics = Object.keys(sub?.topics || {})
      .map((tk) => ({ key: tk, name: sub.topics![tk]?.name || tk, answered: sub.topics![tk]?.answered || 0, correct: sub.topics![tk]?.correct || 0 }))
      .filter((t) => t.answered > 0)
      .sort((a, b) => b.answered - a.answered);
    rows.push({ key: sk, name: sub.name || sk, answered: sub.answered, correct: sub.correct || 0, topics });
  }
  return rows.sort((a, b) => b.answered - a.answered);
}

const WEEKDAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function shortWeekday(iso: string | undefined): string {
  try {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short' });
  } catch {
    return '';
  }
}

interface PracticeAnalyticsProps {
  onStartPractice: () => void;
}

export const PracticeAnalytics: React.FC<PracticeAnalyticsProps> = ({ onStartPractice }) => {
  const { activeCentre } = useApp();
  const { user } = useFirebase();
  const centreId = activeCentre?.id || '';

  const [cached] = useState<Summary | null>(() => readCache());
  const [live, setLive] = useState<Summary | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const summary = live ?? cached;

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      if (user) await flushPendingPracticeSummaries(async () => user.getIdToken());
    } catch { /* a failed flush never blocks the summary read */ }
    try {
      if (!user || !centreId) {
        setStatus('error');
        return;
      }
      const token = await user.getIdToken();
      const res = await fetch(`/api/student/practice/summary?centreId=${encodeURIComponent(centreId)}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      const next = data && data.found ? (data.summary as Summary) : null;
      setLive(next);
      writeCache(next);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [user, centreId]);

  useEffect(() => {
    void load();
  }, [load, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const startTopic = useCallback((subject: string, topic: string) => {
    try {
      localStorage.setItem(PRACTISE_NOW_KEY, JSON.stringify({ subject, topic }));
    } catch { /* ignore */ }
    onStartPractice();
  }, [onStartPractice]);

  const toggleSubject = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Derived views. The streak counts consecutive days with at least one
  // session, counting back from today (or yesterday if today has none yet,
  // since the day is not over). One missed day resets it.
  const view = useMemo(() => {
    if (!summary) return null;
    const totals = summary.totals || { answered: 0, correct: 0, sessions: 0 };
    const hasData = totals.answered > 0 || (summary.recent?.length || 0) > 0;
    const today = localDay();
    const week = Array.from({ length: 7 }, (_, i) => dayKeyFor(-i));
    const weekPractised = week.filter((d) => summary.days?.[d]).length;
    let streak = 0;
    if (summary.days?.[today]) streak += 1;
    for (let i = 1; i <= 60; i += 1) {
      if (summary.days?.[dayKeyFor(-i)]) streak += 1;
      else break;
    }
    const topics = collectTopics(summary);
    const scored = topics.map((r) => ({ ...r, accuracy: pct(r.correct, r.answered) }));
    const needsWork = scored
      .filter((r) => r.answered >= 5 && r.accuracy < 100)
      .sort((a, b) => a.accuracy - b.accuracy || b.answered - a.answered)
      .slice(0, 5);
    const doingWell = scored
      .filter((r) => r.answered >= 5)
      .sort((a, b) => b.accuracy - a.accuracy || b.answered - a.answered)
      .slice(0, 3);
    const subjectRows = collectSubjects(summary);
    const weekStrip = week.map((day) => ({
      day,
      practised: Boolean(summary.days?.[day]),
      letter: WEEKDAY_LETTER[new Date(day + 'T12:00:00').getDay()],
    })).reverse();
    return {
      hasData,
      totals,
      accuracy: pct(totals.correct, totals.answered),
      weekPractised,
      streak,
      needsWork,
      doingWell,
      subjectRows,
      weekStrip,
      recent: (summary.recent || []).slice(0, 5),
    };
  }, [summary]);

  if (status === 'loading' && !summary) {
    return (
      <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm space-y-4" data-testid="practice-analytics-loading">
        <div className="h-16 rounded-2xl bg-slate-100 animate-pulse" />
        <div className="h-4 w-3/4 rounded bg-slate-100 animate-pulse" />
        <div className="h-4 w-1/2 rounded bg-slate-100 animate-pulse" />
        <div className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
      </div>
    );
  }

  if (status === 'error' && !summary) {
    return (
      <div className="bg-white rounded-3xl p-8 border border-slate-200/90 shadow-sm text-center space-y-4" data-testid="practice-analytics-error">
        <div className="w-16 h-16 rounded-2xl bg-orange-50 border border-orange-100 text-[#EA580C] flex items-center justify-center mx-auto shadow-sm">
          <TrendingUp className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-black text-slate-900 tracking-tight">Practice Analytics</h3>
        <p className="text-sm text-slate-500 leading-relaxed font-medium">
          Couldn't load your progress. Try again.
        </p>
        <button
          type="button"
          onClick={retry}
          className="h-11 px-5 rounded-full bg-[#0F172A] text-white text-sm font-extrabold shadow-sm active:scale-[0.98] transition-transform cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!view || !view.hasData) {
    return (
      <div className="bg-white rounded-3xl p-8 border border-slate-200/90 shadow-sm text-center space-y-4" data-testid="practice-analytics-empty">
        <div className="w-16 h-16 rounded-2xl bg-orange-50 border border-orange-100 text-[#EA580C] flex items-center justify-center mx-auto shadow-sm">
          <TrendingUp className="w-8 h-8" />
        </div>
        <div className="space-y-1.5 max-w-xs mx-auto">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-100/60 text-[#C2410C] text-[10px] font-extrabold uppercase tracking-wider mb-1">
            <Sparkles className="w-3 h-3" />
            <span>Progress Insights</span>
          </div>
          <h3 className="text-lg font-black text-slate-900 tracking-tight">Practice Analytics</h3>
          <p className="text-sm text-slate-500 leading-relaxed font-medium">
            Do your first practice and your progress shows up here.
          </p>
        </div>
        <button
          type="button"
          onClick={onStartPractice}
          className="h-11 px-6 rounded-full bg-[#EA580C] text-white text-sm font-extrabold shadow-sm active:scale-[0.98] transition-transform cursor-pointer"
        >
          Start practising
        </button>
      </div>
    );
  }

  const { totals, accuracy, weekPractised, streak } = view;

  return (
    <div className="space-y-3" data-testid="practice-analytics">
      {/* Summary line */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm space-y-2">
        <p className="text-sm font-extrabold text-slate-900 leading-relaxed" data-testid="practice-summary-line">
          {totals.answered} question{totals.answered === 1 ? '' : 's'} answered · {accuracy}% correct · {weekPractised}{' '}
          {weekPractised === 1 ? 'day' : 'days'} practised this week
        </p>
        {streak > 0 && (
          <p className="text-xs text-slate-500 font-medium">
            {streak === 1 ? "You're on a streak. Keep it going." : `You're on a ${streak}-day streak. Keep it going.`}
          </p>
        )}
        {status === 'error' && (
          <p className="text-xs text-slate-400 font-medium">
            Showing your last saved progress.{' '}
            <button type="button" onClick={retry} className="font-bold text-[#C2410C] cursor-pointer">
              Try again
            </button>
          </p>
        )}
      </div>

      {/* Needs work: lowest-accuracy topics with enough answers */}
      {view.needsWork.length > 0 && (
        <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm space-y-3" data-testid="practice-needs-work">
          <h4 className="text-sm font-extrabold text-slate-900">Worth another look</h4>
          <div className="space-y-2">
            {view.needsWork.map((r) => (
              <div key={`${r.subject}__${r.topic}`} className="flex items-center gap-3 bg-slate-50 rounded-2xl px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{r.topic}</p>
                  <p className="text-xs text-slate-500 font-medium truncate">
                    {r.subject} · {r.correct} of {r.answered} correct
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => startTopic(r.subject, r.topic)}
                  className="shrink-0 h-11 px-3.5 rounded-full bg-[#EA580C] text-white text-xs font-extrabold shadow-sm active:scale-[0.98] transition-transform cursor-pointer"
                >
                  Practise this
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Doing well: highest-accuracy topics with enough answers */}
      {view.doingWell.length > 0 && (
        <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm space-y-3" data-testid="practice-doing-well">
          <h4 className="text-sm font-extrabold text-slate-900">Doing well</h4>
          <div className="space-y-2">
            {view.doingWell.map((r) => (
              <div key={`${r.subject}__${r.topic}`} className="flex items-center gap-3 bg-orange-50/60 rounded-2xl px-3 py-2.5">
                <CheckCircle className="w-4 h-4 shrink-0 text-[#C2410C]" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{r.topic}</p>
                  <p className="text-xs text-slate-500 font-medium truncate">{r.subject}</p>
                </div>
                <p className="shrink-0 text-xs font-extrabold text-[#C2410C]">{r.accuracy}%</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By subject: expandable rows */}
      {view.subjectRows.length > 0 && (
        <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm space-y-2" data-testid="practice-by-subject">
          <h4 className="text-sm font-extrabold text-slate-900">By subject</h4>
          <div className="space-y-2">
            {view.subjectRows.map((s) => {
              const open = expanded.has(s.key);
              return (
                <div key={s.key} className="border border-slate-100 rounded-2xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleSubject(s.key)}
                    className="w-full flex items-center gap-3 px-3 py-3 text-left cursor-pointer active:bg-slate-50"
                    aria-expanded={open}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">{s.name}</p>
                      <p className="text-xs text-slate-500 font-medium">{pct(s.correct, s.answered)}% correct · {s.answered} answered</p>
                    </div>
                    <ChevronDown className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                  {open && s.topics.length > 0 && (
                    <div className="px-3 pb-3 space-y-1.5">
                      {s.topics.map((t) => (
                        <div key={t.key} className="flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2">
                          <p className="flex-1 min-w-0 text-xs font-bold text-slate-800 truncate">{t.name}</p>
                          <p className="shrink-0 text-xs text-slate-500 font-medium">
                            {pct(t.correct, t.answered)}% · {t.answered} answered
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Last 7 days + streak */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm space-y-3" data-testid="practice-week">
        <h4 className="text-sm font-extrabold text-slate-900">Last 7 days</h4>
        <div className="flex items-center gap-1.5">
          {view.weekStrip.map((d) => (
            <div
              key={d.day}
              className={`flex-1 flex flex-col items-center gap-1 rounded-xl py-2 ${
                d.practised ? 'bg-[#EA580C]/10 text-[#C2410C]' : 'bg-slate-50 text-slate-300'
              }`}
              title={d.day}
            >
              <span className="text-[10px] font-extrabold">{d.letter}</span>
              <span className={`w-2 h-2 rounded-full ${d.practised ? 'bg-[#EA580C]' : 'bg-slate-200'}`} />
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500 font-medium">
          {streak > 0
            ? `${streak} day${streak === 1 ? '' : 's'} in a row.`
            : 'Practise today to start a streak.'}
        </p>
      </div>

      {/* Recent sessions */}
      {view.recent.length > 0 && (
        <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm space-y-3" data-testid="practice-recent">
          <h4 className="text-sm font-extrabold text-slate-900">Recent practice</h4>
          <div className="space-y-2">
            {view.recent.map((r, i) => (
              <div key={`${r.at}__${i}`} className="flex items-center gap-3 bg-slate-50 rounded-2xl px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">
                    {r.subject || 'Practice'}{r.topic && r.topic !== 'All topics' ? ` · ${r.topic}` : ''}
                  </p>
                  <p className="text-xs text-slate-500 font-medium truncate">
                    {typeof r.answered === 'number' ? `${r.correct || 0} of ${r.answered} correct` : ''} · {shortWeekday(r.at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
