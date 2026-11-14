
import React, { useRef } from 'react';
import { QuizQuestion, EssayPart, EssaySubPart } from '../../types';
import { getEssayStructure, cleanPartLabel, cleanSubPartLabel, stripLeadingLabel, isGenericStem } from '../../utils/essay';
import { FileText, CheckCircle2, HelpCircle } from 'lucide-react';
import { MathText } from './MathText';

interface EssayQuestionProps {
  question: QuizQuestion;
  mode: 'attempt' | 'review' | 'preview';
  answers?: Record<string, string>;
  onChange?: (partKey: string, text: string) => void;
  legacyAnswer?: string;
  theme?: 'dark' | 'light';
  alloc?: number;
  score?: { 
    got: number; 
    max: number; 
    leaves: Record<string, { quality: number; status: 'full' | 'partial' | 'missed'; missed?: string[]; feedback?: string }> 
  };
}

export const EssayQuestion: React.FC<EssayQuestionProps> = ({
  question,
  mode,
  answers = {},
  onChange,
  legacyAnswer,
  theme = 'light',
  alloc,
  score
}) => {
  const structure = getEssayStructure(question);
  const isDark = theme === 'dark';
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const baseClasses = isDark ? 'text-white' : 'text-slate-900';
  const cardClasses = isDark 
    ? 'bg-slate-900/40 border-white/5 backdrop-blur-sm' 
    : 'bg-white border-slate-200 shadow-sm';
  const subCardClasses = isDark
    ? 'bg-white/5 border-white/10'
    : 'bg-slate-50 border-slate-100';

  const insertSymbol = (key: string, symbol: string) => {
    const textarea = textareaRefs.current[key];
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentVal = answers[key] || '';
    const newVal = currentVal.substring(0, start) + symbol + currentVal.substring(end);
    
    onChange?.(key, newVal);
    
    // Set focus back and move cursor
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + symbol.length, start + symbol.length);
    }, 0);
  };

  const renderPart = (part: EssayPart, pIdx: number) => {
    const hasSubParts = part.subParts && part.subParts.length > 0;
    const pLabel = cleanPartLabel(part.label, pIdx);
    const pQuestion = stripLeadingLabel(part.text || (part as any).question || '');
    
    return (
      <div key={part.key || pLabel} className={`rounded-2xl border p-4 sm:p-6 space-y-4 ${cardClasses}`}>
        <div className="flex items-start gap-3">
          <span className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black uppercase tracking-tight ${
            isDark 
              ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' 
              : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
          }`}>
            ({pLabel})
          </span>
          <div className="flex-1 pt-0.5">
            <MathText text={pQuestion} className={`text-sm sm:text-base font-semibold leading-relaxed ${baseClasses}`} />
          </div>
        </div>

        {/* Part Level Answer Area (only if no subparts) */}
        {!hasSubParts && renderAnswerArea(part.key || pLabel, pLabel, part.answer, part.points)}

        {/* Sub-parts */}
        {hasSubParts && (
          <div className="pl-3 sm:pl-8 space-y-3.5 border-l-2 border-indigo-500/20 ml-3 sm:ml-4">
            {part.subParts.map((sub, sIdx) => {
              const sLabel = cleanSubPartLabel(sub.label, sIdx);
              const sQuestion = stripLeadingLabel(sub.text || (sub as any).question || '');
              const compositeKey = sub.key || `${pLabel}-${sLabel}`;
              return (
                <div key={compositeKey} className={`rounded-xl border p-4 space-y-3 ${subCardClasses}`}>
                  <div className="flex items-start gap-2.5">
                    <span className={`flex-shrink-0 px-2.5 py-1 rounded-md text-xs font-black lowercase tracking-wider ${
                      isDark 
                        ? 'bg-indigo-500/30 text-indigo-300 border border-indigo-500/40' 
                        : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                    }`}>
                      ({sLabel})
                    </span>
                    <div className="flex-1 pt-0.5">
                      <MathText text={sQuestion} className={`text-xs sm:text-sm font-medium leading-relaxed ${baseClasses}`} />
                    </div>
                  </div>
                  {renderAnswerArea(compositeKey, `${pLabel})(${sLabel}`, sub.answer, sub.points)}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderAnswerArea = (key: string, label: string, modelAnswer: string, points?: string[]) => {
    const userAnswer = answers[key] || '';

    if (mode === 'attempt') {
      const symbols = ['²', '³', '⁻¹', '√', '×', '÷', '½', 'π', '≤', '≥', '≠'];
      return (
        <div className="space-y-2">
          {/* Symbol Bar */}
          <div className="flex flex-wrap gap-1 pb-1">
            {symbols.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => insertSymbol(key, s)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold border transition-all ${
                  isDark ? 'bg-white/10 border-white/10 text-white hover:bg-white/20' : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {s}
              </button>
            ))}
            <button
              type="button"
              onClick={() => insertSymbol(key, '[ a b ; c d ]')}
              className={`px-2 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold border transition-all ${
                isDark ? 'bg-white/10 border-white/10 text-white hover:bg-white/20' : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
              }`}
            >
              2x2 Matrix
            </button>
          </div>
          <textarea
            ref={el => textareaRefs.current[key] = el}
            value={userAnswer}
            onChange={(e) => onChange?.(key, e.target.value)}
            placeholder={`Type your answer to (${label}) here...`}
            className={`w-full min-h-[120px] p-4 rounded-xl text-sm font-medium transition-all outline-none border-2 ${
              isDark 
                ? 'bg-black/20 border-white/5 text-white focus:border-indigo-500/50 placeholder:text-slate-600' 
                : 'bg-white border-slate-100 text-slate-700 focus:border-indigo-500/30 placeholder:text-slate-400 shadow-inner'
            }`}
          />
        </div>
      );
    }

    if (mode === 'review') {
      const leafScore = score?.leaves[key];
      const statusColor = leafScore?.status === 'full' ? 'text-emerald-500' : leafScore?.status === 'partial' ? 'text-orange-500' : 'text-rose-500';
      const statusBg = leafScore?.status === 'full' ? 'bg-emerald-500/10' : leafScore?.status === 'partial' ? 'bg-orange-500/10' : 'bg-rose-500/10';

      return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            {/* User Answer */}
            <div className={`p-4 rounded-xl border ${isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-100'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <FileText className={`w-3 h-3 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                  <span className={`text-[9px] font-black uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Your Answer</span>
                </div>
                {leafScore && (
                  <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${statusBg} ${statusColor}`}>
                    {leafScore.status}
                  </span>
                )}
              </div>
              <p className={`text-[11px] leading-relaxed whitespace-pre-wrap font-medium ${userAnswer ? (isDark ? 'text-slate-200' : 'text-slate-700') : 'text-slate-400 italic'}`}>
                {userAnswer || 'No response recorded.'}
              </p>
            </div>

            {/* Answer */}
            <div className={`p-4 rounded-xl border ${isDark ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-emerald-50 border-emerald-100'}`}>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                <span className={`text-[9px] font-black uppercase tracking-widest ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>Answer</span>
              </div>
              <MathText text={modelAnswer} className={`text-[11px] leading-relaxed font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`} />
            </div>
          </div>

          {/* Explanation below the Answer */}
          {leafScore?.feedback && (
            <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-blue-500/5 border-blue-500/10' : 'bg-blue-50 border-blue-100'}`}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <HelpCircle className="w-3 h-3 text-blue-500" />
                <span className={`text-[9px] font-black uppercase tracking-widest ${isDark ? 'text-blue-400' : 'text-blue-700'}`}>Explanation</span>
              </div>
              <MathText text={leafScore.feedback} className={`text-[10px] font-medium leading-relaxed ${isDark ? 'text-blue-300' : 'text-blue-800'}`} />
            </div>
          )}
        </div>
      );
    }

    // preview mode
    return (
      <div className="space-y-3">
        <div className={`p-4 rounded-xl border ${isDark ? 'bg-blue-500/5 border-blue-500/20' : 'bg-blue-50 border-blue-100'}`}>
          <div className="flex items-center gap-2 mb-2">
            <HelpCircle className="w-3 h-3 text-blue-500" />
            <span className={`text-[9px] font-black uppercase tracking-widest ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>Answer</span>
          </div>
          <MathText text={modelAnswer} className={`text-[11px] leading-relaxed font-bold ${isDark ? 'text-blue-300' : 'text-blue-800'}`} />
        </div>
      </div>
    );
  };

  const answeredPartsCount = structure.parts.reduce((acc, part) => {
    if (part.subParts.length > 0) {
      return acc + part.subParts.filter(sub => answers[sub.key]?.trim()).length;
    }
    return acc + (answers[part.key]?.trim() ? 1 : 0);
  }, 0);

  const totalPartsCount = structure.parts.reduce((acc, part) => {
    return acc + (part.subParts.length > 0 ? part.subParts.length : 1);
  }, 0);

  const hasStemText = Boolean(structure.stem && !isGenericStem(structure.stem));

  return (
    <div className="space-y-4">
      {/* Status Bar (attempt parts count, score, or mark allocation) */}
      {((mode === 'attempt' && totalPartsCount > 0) || (mode === 'review' && score) || (alloc !== undefined)) && (
        <div className="flex items-center justify-between pb-1">
          <div className="flex items-center gap-2">
            {mode === 'attempt' && totalPartsCount > 0 && (
              <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${
                isDark ? 'border-white/10 text-slate-400 bg-white/5' : 'border-slate-200 text-slate-600 bg-slate-50'
              }`}>
                {answeredPartsCount} / {totalPartsCount} Parts Answered
              </span>
            )}
            {mode === 'review' && score && (
              <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${
                isDark ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>
                Grade: {score.got} / {score.max}
              </span>
            )}
            {alloc !== undefined && mode === 'preview' && (
              <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${
                isDark ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-blue-50 text-blue-700 border border-blue-200'
              }`}>
                Total Marks: {alloc}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Stem Card (only rendered if there is meaningful stem text, e.g. scenario / equations) */}
      {hasStemText && (
        <div className={`rounded-2xl sm:rounded-3xl p-5 sm:p-7 border shadow-sm space-y-4 ${cardClasses}`}>
          <MathText text={structure.stem} className={`text-base sm:text-lg font-bold leading-relaxed ${baseClasses}`} />

          {/* Legacy Answer Block for Review Mode */}
          {mode === 'review' && legacyAnswer && (
            <div className={`mt-4 p-5 rounded-2xl border ${isDark ? 'bg-orange-500/5 border-orange-500/20' : 'bg-orange-50 border-orange-100'}`}>
               <div className="flex items-center gap-2 mb-2">
                 <FileText className="w-4 h-4 text-orange-500" />
                 <span className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-orange-400' : 'text-orange-600'}`}>Overall Response</span>
               </div>
               <p className={`text-sm leading-relaxed whitespace-pre-wrap font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                 {legacyAnswer}
               </p>
            </div>
          )}

          {/* Single TextArea for Single-Stem Essay (no parts) */}
          {structure.parts.length === 0 && (
            <div className="mt-4">
              {renderAnswerArea('root', 'Answer', structure.stemAnswer, structure.stemPoints)}
            </div>
          )}
        </div>
      )}

      {/* Fallback for Single Essay with no stem text */}
      {!hasStemText && structure.parts.length === 0 && (
        <div className={`rounded-2xl p-5 sm:p-7 border shadow-sm ${cardClasses}`}>
          {renderAnswerArea('root', 'Answer', structure.stemAnswer, structure.stemPoints)}
        </div>
      )}

      {/* Parts List */}
      {structure.parts.length > 0 && (
        <div className="space-y-4">
          {structure.parts.map((part, pIdx) => renderPart(part, pIdx))}
        </div>
      )}
    </div>
  );
};
