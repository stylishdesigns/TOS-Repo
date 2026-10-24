/**
 * Platform question-bank paste parser (publish pipeline).
 *
 * This is the same parsing engine the centres' CBT publisher uses
 * (CBTManager.parsePastedQuestions, MCQ path): questions are pasted as
 * numbered blocks with A-D options, an "Answer:" letter line and an
 * "Explanation:" line. The regexes and the line-by-line state machine are
 * ported verbatim from that engine so a paste that parses for a centre also
 * parses here. Essay-style blocks (no A-D options) are detected and reported
 * as skipped: the platform practice bank currently takes objective questions
 * only, essay authoring rides with the mock piece.
 *
 * The client-side parse is a PREVIEW only; the server re-validates every
 * imported question before anything is stored.
 */

export interface ParsedBankQuestion {
  text: string;
  options: { key: string; text: string }[];
  correct: string; // 'A' | 'B' | 'C' | 'D'
  explanation: string;
}

export interface ParseResult {
  questions: ParsedBankQuestion[];
  mcqCount: number;
  skippedEssay: number;
  skippedEmpty: number;
}

export function parseBankPaste(text: string): ParseResult {
  const questions: ParsedBankQuestion[] = [];
  let skippedEssay = 0;
  let skippedEmpty = 0;

  // Split by main question markers: "1.", "Q1:", "Question 1:", "1)", "1:".
  // Negative lookahead (?![a-z]) avoids splitting on sub-questions like "1a."
  const blocks = text.split(/(?:\n|^)\s*(?=(?:Question\s*\d+|Q\d+|Q:|\d+)(?![a-z])[\.\):]?\s+)/im).filter(b => b.trim());

  blocks.forEach(block => {
    const lines = block.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length < 1) return;

    // FIRST PASS: detect characteristics (same detection as the centre engine)
    const optionRegex = /^[A-D][.):]\s*\S/;
    const letterAnswerRegex = /^(?:Answer|Correct):\s*[A-D][.)]?\s*$/i;
    const uppercaseOptionsCount = lines.filter(line => optionRegex.test(line)).length;
    const likelyMCQ = uppercaseOptionsCount >= 2;

    if (!likelyMCQ) {
      // Essay-style block: real content but no A-D options. Counted, not
      // silently dropped, so the preview can say what was left out.
      if (lines.some(l => l.length > 3)) skippedEssay += 1;
      else skippedEmpty += 1;
      return;
    }

    let currentQuestionText = '';
    let currentExplanation = '';
    const options: string[] = [];
    let correctAnswer = -1;
    let isCollectingAnswer = false;

    lines.forEach(line => {
      if (optionRegex.test(line)) {
        const content = line.replace(/^[A-D][.):]\s*/, '').trim();
        options.push(content);
        isCollectingAnswer = true;
      } else if (letterAnswerRegex.test(line)) {
        const match = line.match(/^(?:Answer|Correct):\s*([A-D])(?![a-z])/i);
        if (match) correctAnswer = match[1].toUpperCase().charCodeAt(0) - 65;
        isCollectingAnswer = true;
      } else if (/^(?:Model Answer|Explanation|Solution):/i.test(line)) {
        currentExplanation += (currentExplanation ? '\n' : '') + line.replace(/^(?:Model Answer|Explanation|Solution):/i, '').trim();
        isCollectingAnswer = true;
      } else {
        if (isCollectingAnswer) {
          currentExplanation += (currentExplanation ? '\n' : '') + line;
        } else {
          let cleanLine = line;
          if (currentQuestionText === '') {
            cleanLine = line.replace(/^(?:Question\s*\d+|Q\d+|Q:|\d+)(?![a-z])[\.\):]?\s*/i, '');
          }
          if (cleanLine) {
            currentQuestionText += (currentQuestionText ? '\n' : '') + cleanLine;
          }
        }
      }
    });

    if (currentQuestionText.trim()) {
      questions.push({
        text: currentQuestionText.trim(),
        options: ['A', 'B', 'C', 'D'].map((key, i) => ({ key, text: options[i] || '' })),
        correct: correctAnswer >= 0 ? ['A', 'B', 'C', 'D'][correctAnswer] : '',
        explanation: currentExplanation.trim(),
      });
    } else {
      skippedEmpty += 1;
    }
  });

  return {
    questions,
    mcqCount: questions.filter(q => q.correct).length,
    skippedEssay,
    skippedEmpty,
  };
}

export const BANK_FORMAT_GUIDE = `1. What is the capital of Nigeria?
A: Lagos
B: Abuja
C: Kano
D: Ibadan
Answer: B
Explanation: Abuja became the capital of Nigeria in 1991.

2. Which planet is known as the Red Planet?
A: Venus
B: Mars
C: Jupiter
D: Saturn
Answer: B
Explanation: Mars appears red due to iron oxide on its surface.

RULES:
- Number questions sequentially (1. 2. 3. ...).
- Use exactly four options: A, B, C, D.
- Use "Answer:" followed only by the correct letter.
- Include a brief "Explanation:" line.
- Write maths and science notation in LaTeX inside $...$.
- No tables, bullets, headings or extra text.`;
