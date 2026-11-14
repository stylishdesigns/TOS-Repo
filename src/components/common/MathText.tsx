import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface MathTextProps {
  text: string;
  className?: string;
}

/**
 * Normalizes math string and cleans unwanted parens around inline LaTeX formulas like ($26\text{ m}$)
 */
export function normalizeMathText(raw: string): string {
  if (!raw) return '';
  return raw
    // Convert display math \[ ... \] to $$...$$
    .replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$')
    // Convert inline math \( ... \) to $...$
    .replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$')
    // Convert ($...$) to $...$ to prevent raw ($26\text{ m}$) where KaTeX or user wraps in parens
    .replace(/\(\$([^\$]+)\$\)/g, '$$$1$$');
}

/**
 * Cleans multiple choice option text by removing leading letter prefixes (A:, A., (A))
 * and normalizing LaTeX formulas so mathematical expressions render beautifully.
 */
export function cleanOptionText(opt: unknown): string {
  if (typeof opt !== 'string') return typeof opt === 'number' ? String(opt) : '';
  let s = opt.trim();
  // Strip leading option markers: A:, A., (A), A), a:, etc.
  s = s.replace(/^(?:\(?[A-Da-d]\)?[.):-]?)\s+/, '');
  // Normalize LaTeX expressions
  return normalizeMathText(s).trim();
}

export const MathText: React.FC<MathTextProps> = ({ text, className = "" }) => {
  if (!text) return null;

  const normalized = normalizeMathText(text);

  // Split text by display math ($$...$$) and inline math ($...$)
  // We use a regex that captures the delimiters to keep them in the array
  const parts = normalized.split(/(\$\$.*?\$\$|\$.*?\$)/g);

  return (
    <div className={`whitespace-pre-wrap ${className}`}>
      {parts.map((part, index) => {
        if (part.startsWith('$$') && part.endsWith('$$')) {
          const formula = part.slice(2, -2);
          try {
            return (
              <div
                key={index}
                className="my-2 flex justify-center overflow-x-auto"
                dangerouslySetInnerHTML={{
                  __html: katex.renderToString(formula, {
                    displayMode: true,
                    throwOnError: false,
                  }),
                }}
              />
            );
          } catch (e) {
            return <span key={index}>{part}</span>;
          }
        } else if (part.startsWith('$') && part.endsWith('$')) {
          const formula = part.slice(1, -1);
          try {
            return (
              <span
                key={index}
                className="inline-block"
                dangerouslySetInnerHTML={{
                  __html: katex.renderToString(formula, {
                    displayMode: false,
                    throwOnError: false,
                  }),
                }}
              />
            );
          } catch (e) {
            return <span key={index}>{part}</span>;
          }
        }
        return <span key={index}>{part}</span>;
      })}
    </div>
  );
};

