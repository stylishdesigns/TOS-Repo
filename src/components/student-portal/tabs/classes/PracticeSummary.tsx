import React, { useState } from 'react';
import { CheckCircle2, XCircle, ArrowRight, RotateCcw, ChevronDown, ChevronUp, BookOpen } from 'lucide-react';
import { BankQuestion } from './utils/practice';
import { MathText } from '../../../common/MathText';

interface PracticeSummaryProps {
  studentName: string;
  topic: string;
  subject: string;
  questions: BankQuestion[];
  userAnswers: Record<number, number>; // questionIndex -> chosen option index
  prevAccuracy: number;
  newAccuracy: number;
  onBackToTopics: () => void;
  onAnotherSet: () => void;
}

export const PracticeSummary: React.FC<PracticeSummaryProps> = ({
  studentName,
  topic,
  subject,
  questions,
  userAnswers,
  prevAccuracy,
  newAccuracy,
  onBackToTopics,
  onAnotherSet,
}) => {
  const [expandedMissedIndex, setExpandedMissedIndex] = useState<number | null>(null);

  const firstName = studentName ? studentName.trim().split(' ')[0] : 'Student';

  // Compute results
  const results = questions.map((q, idx) => {
    const selected = userAnswers[idx];
    const isCorrect = selected === q.correctIndex;
    return { question: q, selected, isCorrect, index: idx };
  });

  const correctCount = results.filter((r) => r.isCorrect).length;
  const totalCount = questions.length;
  const missedResults = results.filter((r) => !r.isCorrect);

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header */}
      <div>
        <span className="text-[10px] font-extrabold uppercase text-[#EA580C] tracking-wider block">
          Practice Complete · {subject}
        </span>
        <h2 className="text-xl font-black text-slate-900 tracking-tight">
          Good work, {firstName}
        </h2>
        <p className="text-xs text-slate-500 font-medium mt-0.5">
          {topic}
        </p>
      </div>

      {/* Dark Score Card */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 55%, #0B1224 100%)',
          boxShadow: '0 8px 24px rgba(2, 6, 23, 0.18)',
        }}
        className="rounded-[20px] p-5 border border-[#334155] text-white space-y-4"
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#CBD5E1]">
            SESSION RESULT
          </span>
          <span className="text-xs font-bold text-orange-400 font-mono">
            {Math.round((correctCount / totalCount) * 100)}%
          </span>
        </div>

        <div className="flex items-baseline space-x-2">
          <span className="text-4xl font-extrabold tracking-tight tabular-nums text-white">
            {correctCount}
          </span>
          <span className="text-2xl font-bold text-slate-400">/</span>
          <span className="text-2xl font-bold text-slate-300 tabular-nums">
            {totalCount}
          </span>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">
            correct
          </span>
        </div>

        {/* 10-Segment Progress Bar */}
        <div className="grid grid-cols-10 gap-1.5 pt-1">
          {results.map((r, i) => (
            <div
              key={i}
              className={`h-2.5 rounded-full ${
                r.isCorrect ? 'bg-emerald-400 shadow-xs' : 'bg-rose-500 shadow-xs'
              }`}
            />
          ))}
        </div>

        {/* Accuracy Progression */}
        <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs">
          <span className="text-slate-400 font-medium">Topic accuracy</span>
          <div className="flex items-center space-x-2 font-mono font-bold">
            <span className="text-slate-400 tabular-nums">{prevAccuracy}%</span>
            <span className="text-orange-400">→</span>
            <span className="text-emerald-400 tabular-nums">{newAccuracy}%</span>
          </div>
        </div>
      </div>

      {/* Review Missed Questions */}
      {missedResults.length > 0 ? (
        <div className="bg-white rounded-[20px] p-4 border border-[#E2E8F0] shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#0F172A]">
              Review Missed Questions ({missedResults.length})
            </h3>
            <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100">
              Needs attention
            </span>
          </div>

          <div className="space-y-2.5">
            {missedResults.map(({ question, selected, index }) => {
              const isExpanded = expandedMissedIndex === index;
              const studentChoiceText =
                typeof selected === 'number' && question.options[selected]
                  ? question.options[selected]
                  : 'Unanswered';
              const correctChoiceText = question.options[question.correctIndex];

              return (
                <div
                  key={question.id || index}
                  className="rounded-xl border border-slate-200 overflow-hidden text-xs transition-all"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedMissedIndex(isExpanded ? null : index)}
                    className="w-full text-left p-3.5 bg-slate-50 hover:bg-slate-100/80 transition-colors flex items-center justify-between gap-3 cursor-pointer min-h-[44px]"
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 font-bold flex items-center justify-center shrink-0 text-[10px]">
                        {index + 1}
                      </span>
                      <p className="font-bold text-slate-800 truncate">
                        {question.text.replace(/\\\[.*?\\\]|\\\(.*?\\\)/g, ' ')}
                      </p>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="p-4 bg-white border-t border-slate-100 space-y-3">
                      <div>
                        <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block mb-1">
                          Question
                        </span>
                        <MathText text={question.text} className="text-slate-900 font-bold leading-relaxed" />
                      </div>

                      <div className="space-y-2 pt-1">
                        <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start space-x-2">
                          <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="text-[10px] font-black uppercase text-rose-700 tracking-wider block">
                              Your Answer
                            </span>
                            <MathText text={studentChoiceText} className="font-bold text-rose-900" />
                          </div>
                        </div>

                        <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start space-x-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="text-[10px] font-black uppercase text-emerald-700 tracking-wider block">
                              Correct Answer
                            </span>
                            <MathText text={correctChoiceText} className="font-bold text-emerald-900" />
                          </div>
                        </div>
                      </div>

                      {question.explanation && (
                        <div className="pt-2 border-t border-slate-100">
                          <span className="text-[10px] font-extrabold uppercase text-[#EA580C] tracking-wider block mb-1">
                            Why
                          </span>
                          <MathText
                            text={question.explanation}
                            className="text-slate-600 text-xs leading-relaxed italic"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-emerald-50 rounded-[20px] p-5 border border-emerald-200 text-center space-y-2">
          <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>
          <h4 className="text-sm font-black text-emerald-950">
            Perfect Score!
          </h4>
          <p className="text-xs text-emerald-800">
            You answered all questions correctly in this drill. Keep up the high standard!
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3 pt-2">
        <button
          type="button"
          onClick={onBackToTopics}
          className="min-h-[48px] px-4 py-3 rounded-2xl bg-white border border-[#E2E8F0] text-slate-800 font-bold text-xs uppercase tracking-wider hover:bg-slate-50 active:scale-98 transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-2xs"
        >
          <span>Back to topics</span>
        </button>

        <button
          type="button"
          onClick={onAnotherSet}
          className="min-h-[48px] px-4 py-3 rounded-2xl bg-[#EA580C] hover:bg-[#C2410C] text-white font-extrabold text-xs uppercase tracking-wider active:scale-98 transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-sm"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Another 10</span>
        </button>
      </div>
    </div>
  );
};
