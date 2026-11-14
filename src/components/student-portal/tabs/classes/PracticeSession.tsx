import React, { useState } from 'react';
import { X, CheckCircle2, XCircle, ArrowRight, HelpCircle, AlertCircle } from 'lucide-react';
import { BankQuestion } from './utils/practice';
import { MathText } from '../../../common/MathText';

interface PracticeSessionProps {
  subject: string;
  topic: string;
  questions: BankQuestion[];
  onComplete: (userAnswers: Record<number, number>) => void;
  onExit: (userAnswers: Record<number, number>) => void;
}

export const PracticeSession: React.FC<PracticeSessionProps> = ({
  subject,
  topic,
  questions,
  onComplete,
  onExit,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  if (!questions || questions.length === 0) {
    return (
      <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 space-y-3">
        <HelpCircle className="w-10 h-10 text-slate-300 mx-auto" />
        <h4 className="text-sm font-bold text-slate-800">No questions available</h4>
        <p className="text-xs text-slate-500">
          This practice drill has no available questions at this time.
        </p>
        <button
          type="button"
          onClick={() => onExit({})}
          className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold"
        >
          Back
        </button>
      </div>
    );
  }

  const currentQ = questions[currentIndex];
  const hasAnsweredCurrent = userAnswers[currentIndex] !== undefined;
  const selectedOption = userAnswers[currentIndex];
  const isLast = currentIndex === questions.length - 1;

  const handleSelectOption = (optionIndex: number) => {
    if (hasAnsweredCurrent) return; // Locked once answered
    setUserAnswers((prev) => ({
      ...prev,
      [currentIndex]: optionIndex,
    }));
  };

  const handleNext = () => {
    if (isLast) {
      onComplete(userAnswers);
    } else {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const answeredCount = Object.keys(userAnswers).length;

  return (
    <div className="space-y-4 pb-24 animate-in fade-in duration-200">
      {/* Top Bar */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200/80">
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={() => setShowExitConfirm(true)}
            aria-label="Close Practice"
            className="w-10 h-10 rounded-xl bg-white border border-[#E2E8F0] text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
          >
            <X className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="text-[10px] font-extrabold uppercase text-[#EA580C] tracking-wider">
                Practice
              </span>
              <span className="text-slate-300 text-xs">•</span>
              <span className="text-[10px] font-bold text-slate-500 truncate max-w-[150px]">
                {subject}
              </span>
            </div>
            <h3 className="text-xs font-black text-slate-900 tracking-tight truncate max-w-[200px]">
              {topic}
            </h3>
          </div>
        </div>

        <div className="text-right">
          <span className="text-xs font-black text-[#0F172A] font-mono tabular-nums">
            {currentIndex + 1} <span className="text-slate-400 font-normal">of</span> {questions.length}
          </span>
        </div>
      </div>

      {/* 10-Segment Progress Bar */}
      <div className="grid grid-cols-10 gap-1.5">
        {questions.map((q, i) => {
          const ans = userAnswers[i];
          const isAnswered = ans !== undefined;
          const isCorrect = isAnswered && ans === q.correctIndex;
          const isCurrent = i === currentIndex;

          let colorClass = 'bg-slate-200';
          if (isAnswered) {
            colorClass = isCorrect ? 'bg-emerald-500' : 'bg-rose-500';
          } else if (isCurrent) {
            colorClass = 'bg-[#0F172A]';
          }

          return (
            <div
              key={i}
              className={`h-2 rounded-full transition-colors duration-300 ${colorClass}`}
            />
          );
        })}
      </div>

      {/* Question Card */}
      <div className="bg-white rounded-[20px] p-5 border border-[#E2E8F0] shadow-2xs space-y-4">
        <div>
          <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block mb-1">
            Question {currentIndex + 1}
          </span>
          <MathText
            text={currentQ.text}
            className="text-base font-bold text-[#0F172A] leading-relaxed"
          />
        </div>

        {/* 4 Options */}
        <div className="space-y-2.5 pt-1">
          {currentQ.options.map((optionText, optIndex) => {
            const isSelected = selectedOption === optIndex;
            const isCorrect = optIndex === currentQ.correctIndex;

            let optionStyle =
              'bg-white border-[#E2E8F0] text-slate-800 hover:border-slate-300 hover:bg-slate-50';

            if (hasAnsweredCurrent) {
              if (isCorrect) {
                // Correct option in emerald
                optionStyle = 'bg-emerald-50 border-emerald-500 text-emerald-950 font-black shadow-xs';
              } else if (isSelected && !isCorrect) {
                // Student choice if wrong in rose
                optionStyle = 'bg-rose-50 border-rose-500 text-rose-950 font-black shadow-xs';
              } else {
                optionStyle = 'bg-slate-50/60 border-slate-200 text-slate-400 opacity-60';
              }
            }

            return (
              <button
                key={optIndex}
                type="button"
                disabled={hasAnsweredCurrent}
                onClick={() => handleSelectOption(optIndex)}
                className={`w-full min-h-[48px] p-3.5 rounded-2xl text-left border text-xs transition-all flex items-center justify-between gap-3 cursor-pointer ${optionStyle}`}
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <span
                    className={`w-7 h-7 rounded-xl flex items-center justify-center font-mono font-bold text-xs shrink-0 border ${
                      hasAnsweredCurrent && isCorrect
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : hasAnsweredCurrent && isSelected
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    {String.fromCharCode(65 + optIndex)}
                  </span>
                  <MathText text={optionText} className="font-semibold leading-relaxed" />
                </div>

                {hasAnsweredCurrent && (
                  <div className="shrink-0 flex items-center space-x-1.5 text-[11px] font-black uppercase">
                    {isCorrect && (
                      <span className="text-emerald-700 flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Correct</span>
                      </span>
                    )}
                    {isSelected && !isCorrect && (
                      <span className="text-rose-700 flex items-center gap-1">
                        <XCircle className="w-4 h-4 text-rose-600" />
                        <span>Your answer</span>
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Explanation Card (shows after answered) */}
        {hasAnsweredCurrent && currentQ.explanation && (
          <div className="mt-4 p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-1.5 animate-in fade-in duration-300">
            <div className="flex items-center space-x-1.5 text-[#EA580C]">
              <HelpCircle className="w-3.5 h-3.5" />
              <span className="text-[10px] font-extrabold uppercase tracking-wider">
                Why
              </span>
            </div>
            <MathText
              text={currentQ.explanation}
              className="text-xs text-slate-700 leading-relaxed font-medium"
            />
          </div>
        )}
      </div>

      {/* Sticky Bottom Next Button */}
      {hasAnsweredCurrent && (
        <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-4 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent z-40">
          <button
            type="button"
            onClick={handleNext}
            className="w-full h-[52px] bg-[#EA580C] hover:bg-[#C2410C] text-white font-extrabold text-xs uppercase tracking-wider rounded-2xl shadow-xl shadow-orange-950/20 active:scale-98 transition-all flex items-center justify-center space-x-2 cursor-pointer"
          >
            <span>{isLast ? 'Finish Practice' : 'Next Question'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* End Practice Confirmation Dialog */}
      {showExitConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-xs w-full p-6 shadow-2xl border border-slate-100 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-orange-100 text-[#EA580C] mx-auto flex items-center justify-center">
              <AlertCircle className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h4 className="text-base font-black text-slate-900 tracking-tight">
                End practice?
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Your answers so far ({answeredCount} answered) will be saved to your topic progress.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowExitConfirm(false);
                  onExit(userAnswers);
                }}
                className="w-full py-3 bg-[#EA580C] text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-[#C2410C] transition-all cursor-pointer"
              >
                End Practice
              </button>
              <button
                type="button"
                onClick={() => setShowExitConfirm(false)}
                className="w-full py-2.5 text-slate-600 font-bold text-xs hover:text-slate-900 transition-colors cursor-pointer"
              >
                Keep Practicing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
