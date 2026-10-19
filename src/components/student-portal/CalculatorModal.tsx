import React, { useState } from 'react';
import { X, Delete } from 'lucide-react';

interface CalculatorModalProps {
  isOpen?: boolean;
  onClose: () => void;
}

export const CalculatorModal: React.FC<CalculatorModalProps> = ({ isOpen = true, onClose }) => {
  const [display, setDisplay] = useState('0');
  const [expression, setExpression] = useState('');
  const [prevVal, setPrevVal] = useState<number | null>(null);
  const [op, setOp] = useState<string | null>(null);
  const [resetNext, setResetNext] = useState(false);

  if (!isOpen) return null;

  const handleNum = (num: string) => {
    if (display === '0' || resetNext) {
      setDisplay(num);
      setResetNext(false);
    } else {
      if (display.length < 15) {
        setDisplay(display + num);
      }
    }
    setExpression(prev => prev + num);
  };

  const handleDot = () => {
    if (resetNext) {
      setDisplay('0.');
      setResetNext(false);
      setExpression(prev => prev + '0.');
      return;
    }
    if (!display.includes('.')) {
      setDisplay(display + '.');
      setExpression(prev => prev + '.');
    }
  };

  const handleOp = (nextOp: string) => {
    const current = parseFloat(display);
    if (prevVal === null) {
      setPrevVal(current);
    } else if (op) {
      const result = calculate(prevVal, current, op);
      setPrevVal(result);
      setDisplay(String(result));
    }
    setOp(nextOp);
    setResetNext(true);
    setExpression(prev => prev + ' ' + nextOp + ' ');
  };

  const calculate = (a: number, b: number, operator: string): number => {
    switch (operator) {
      case '+': return a + b;
      case '-': return a - b;
      case '×': return a * b;
      case '÷': return b !== 0 ? a / b : 0;
      default: return b;
    }
  };

  const handleEquals = () => {
    if (prevVal === null || !op) return;
    const current = parseFloat(display);
    const result = calculate(prevVal, current, op);
    const rounded = Math.round(result * 1000000) / 1000000;
    setDisplay(String(rounded));
    setExpression(String(rounded));
    setPrevVal(null);
    setOp(null);
    setResetNext(true);
  };

  const handleClear = () => {
    setDisplay('0');
    setExpression('');
    setPrevVal(null);
    setOp(null);
    setResetNext(false);
  };

  const handleSqrt = () => {
    const current = parseFloat(display);
    if (current >= 0) {
      const res = Math.round(Math.sqrt(current) * 1000000) / 1000000;
      setDisplay(String(res));
      setExpression(`√(${expression})`);
      setResetNext(true);
    }
  };

  const handlePercent = () => {
    const current = parseFloat(display);
    setDisplay(String(current / 100));
    setExpression(`${expression}%`);
    setResetNext(true);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 text-white rounded-3xl p-5 w-full max-w-[320px] shadow-2xl border border-slate-700 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-orange-500 flex items-center justify-center">
              <span className="text-[10px] font-black">JAMB</span>
            </div>
            <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
              Scientific Calculator
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 flex items-center justify-center text-slate-300 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Display Screen */}
        <div className="my-5 p-4 bg-slate-950 rounded-2xl border border-slate-800 text-right shadow-inner flex flex-col justify-end min-h-[90px]">
          <div className="text-xs text-slate-400 font-mono mb-1 overflow-x-auto whitespace-nowrap custom-scrollbar pb-1">
            {expression || ' '}
          </div>
          <div className="text-3xl font-mono font-black text-amber-400 overflow-x-auto whitespace-nowrap custom-scrollbar">
            {display}
          </div>
        </div>

        {/* Buttons Grid */}
        <div className="grid grid-cols-4 gap-2.5">
          <button
            onClick={handleClear}
            className="p-4 rounded-2xl bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 font-black text-sm transition-all active:scale-95"
          >
            C
          </button>
          <button
            onClick={handleSqrt}
            className="p-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm transition-all active:scale-95"
          >
            √
          </button>
          <button
            onClick={handlePercent}
            className="p-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm transition-all active:scale-95"
          >
            %
          </button>
          <button
            onClick={() => handleOp('÷')}
            className="p-4 rounded-2xl bg-orange-500/10 text-orange-500 hover:bg-orange-500 hover:text-white font-black text-base transition-all active:scale-95"
          >
            ÷
          </button>

          {['7', '8', '9'].map((n) => (
            <button
              key={n}
              onClick={() => handleNum(n)}
              className="p-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-lg transition-all active:scale-95 shadow-sm"
            >
              {n}
            </button>
          ))}
          <button
            onClick={() => handleOp('×')}
            className="p-4 rounded-2xl bg-orange-500/10 text-orange-500 hover:bg-orange-500 hover:text-white font-black text-base transition-all active:scale-95"
          >
            ×
          </button>

          {['4', '5', '6'].map((n) => (
            <button
              key={n}
              onClick={() => handleNum(n)}
              className="p-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-lg transition-all active:scale-95 shadow-sm"
            >
              {n}
            </button>
          ))}
          <button
            onClick={() => handleOp('-')}
            className="p-4 rounded-2xl bg-orange-500/10 text-orange-500 hover:bg-orange-500 hover:text-white font-black text-base transition-all active:scale-95"
          >
            -
          </button>

          {['1', '2', '3'].map((n) => (
            <button
              key={n}
              onClick={() => handleNum(n)}
              className="p-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-lg transition-all active:scale-95 shadow-sm"
            >
              {n}
            </button>
          ))}
          <button
            onClick={() => handleOp('+')}
            className="p-4 rounded-2xl bg-orange-500/10 text-orange-500 hover:bg-orange-500 hover:text-white font-black text-base transition-all active:scale-95"
          >
            +
          </button>

          <button
            onClick={() => handleNum('0')}
            className="col-span-2 p-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-lg transition-all active:scale-95 shadow-sm"
          >
            0
          </button>
          <button
            onClick={handleDot}
            className="p-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-lg transition-all active:scale-95 shadow-sm"
          >
            .
          </button>
          <button
            onClick={handleEquals}
            className="p-4 rounded-2xl bg-emerald-500 text-white hover:bg-emerald-600 font-black text-lg transition-all active:scale-95 shadow-lg shadow-emerald-900/20"
          >
            =
          </button>
        </div>
      </div>
    </div>
  );
};
