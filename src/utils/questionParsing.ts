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
  // Per-question overrides (rebuild piece 0). Present only when the paste
  // carries a "Year:" or "Difficulty:" line for the question; the import
  // falls back to the batch values chosen in Step 1 when they are absent.
  year?: number;
  difficulty?: string;
}

export interface ParseResult {
  questions: ParsedBankQuestion[];
  mcqCount: number;
  skippedEssay: number;
  skippedEmpty: number;
}

// Inline question support: some publishers write a whole question on one
// line, e.g.
//   1. Which particle bonds atoms? A: Protons B: Neutrons C: Electrons
//   D: Nuclei Answer: C Explanation: Bonding uses valence electrons.
// splitInlineQuestion turns such a line into the line-per-part shape the
// state machine below already understands. It only fires when the line is
// unambiguous: four option markers in A-to-D order plus "Answer: <letter>".
const INLINE_OPTION_RE = /(?:^|(?<=\s))([A-D])[:.)]\s+/g;

const splitInlineQuestion = (line: string): string[] | null => {
  if (/^[A-D][.):]\s/.test(line)) return null;
  if (/^(?:Answer|Correct|Explanation|Solution|Model Answer)\s*:/i.test(line)) return null;
  if (!/(?:^|(?<=\s))(?:Answer|Correct)\s*:\s*[A-D](?![a-z])/i.test(line)) return null;

  const markers: { letter: string; start: number; contentStart: number }[] = [];
  let m: RegExpExecArray | null;
  INLINE_OPTION_RE.lastIndex = 0;
  while ((m = INLINE_OPTION_RE.exec(line)) !== null) {
    markers.push({ letter: m[1], start: m.index, contentStart: m.index + m[0].length });
  }
  const wanted = ['A', 'B', 'C', 'D'];
  const picked: typeof markers = [];
  let wi = 0;
  markers.forEach((mk) => {
    if (wi < wanted.length && mk.letter === wanted[wi] && (!picked.length || mk.start > picked[picked.length - 1].start)) {
      picked.push(mk);
      wi += 1;
    }
  });
  if (picked.length < 4 || picked[0].start === 0) return null;

  const answerMatch = /(?:^|(?<=\s))(?:Answer|Correct)\s*:\s*([A-D])(?![a-z])/i.exec(line);
  if (!answerMatch || answerMatch.index <= picked[3].start) return null;
  const explanationMatch = /(?:^|(?<=\s))(?:Explanation|Solution|Model Answer)\s*:/i.exec(line);

  const out: string[] = [line.slice(0, picked[0].start).trim()];
  picked.forEach((p, i) => {
    const end = i < 3 ? picked[i + 1].start : answerMatch.index;
    out.push(p.letter + ': ' + line.slice(p.contentStart, end).trim());
  });
  out.push('Answer: ' + answerMatch[1].toUpperCase());
  if (explanationMatch) {
    let expl = line.slice(explanationMatch.index + explanationMatch[0].length).trim();
    // Lift a trailing Year/Difficulty out of the explanation onto its own
    // line so the state machine captures it as a per-question override.
    const iy = /(?:^|\s)Year\s*:\s*(\d{4})(?=\s|$)/i.exec(expl);
    if (iy) { out.push('Year: ' + iy[1]); expl = expl.replace(iy[0], ' ').trim(); }
    const idf = /(?:^|\s)Difficulty\s*:\s*(easy|hard)(?=\s|$)/i.exec(expl);
    if (idf) { out.push('Difficulty: ' + idf[1].toLowerCase()); expl = expl.replace(idf[0], ' ').trim(); }
    out.push('Explanation: ' + expl);
  }
  return out;
};

export function parseBankPaste(input: string): ParseResult {
  const questions: ParsedBankQuestion[] = [];
  // Pre-pass: a paste may put several whole questions on one line. Give each
  // question its own line before blocking, but only on lines that carry an
  // "Answer:" marker so ordinary prose is never touched. Tolerates an
  // escaped question dot ("20\.").
  const text = input.split('\n').map((line) => {
    if (!/answer\s*:/i.test(line)) return line;
    return line.split(/(?<=^|\s)(?=(?:Question\s*\d+|Q\d+|\d{1,3})(?![a-z])(?:\\)?[.):]\s)/i).join('\n');
  }).join('\n');

  let skippedEssay = 0;
  let skippedEmpty = 0;

  // Split by main question markers: "1.", "Q1:", "Question 1:", "1)", "1:".
  // Negative lookahead (?![a-z]) avoids splitting on sub-questions like "1a."
  const blocks = text.split(/(?:\n|^)\s*(?=(?:Question\s*\d+|Q\d+|Q:|\d+)(?![a-z])(?:\\)?[\.\):]?\s+)/im).filter(b => b.trim());

  blocks.forEach(block => {
    const rawLines = block.split('\n').map(l => l.trim()).filter(l => l);
    // Expand inline one-line questions into the line-per-part shape below.
    const lines: string[] = [];
    rawLines.forEach((line) => {
      const inline = splitInlineQuestion(line);
      if (inline) lines.push(...inline);
      else lines.push(line);
    });
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
    let currentYear = -1;
    let currentDifficulty = '';

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
      } else if (/^Year\s*:\s*(\d{4})$/i.test(line)) {
        // Per-question year override; an out-of-range value is ignored so the
        // batch choice still applies.
        const y = Number(line.match(/^Year\s*:\s*(\d{4})$/i)![1]);
        if (y >= 1978 && y <= 2099) currentYear = y;
        isCollectingAnswer = true;
      } else if (/^Difficulty\s*:\s*(easy|hard)$/i.test(line)) {
        currentDifficulty = (line.match(/^Difficulty\s*:\s*(easy|hard)$/i)![1] || '').toLowerCase();
        isCollectingAnswer = true;
      } else {
        if (isCollectingAnswer) {
          currentExplanation += (currentExplanation ? '\n' : '') + line;
        } else {
          let cleanLine = line;
          if (currentQuestionText === '') {
            cleanLine = line.replace(/^(?:Question\s*\d+|Q\d+|Q:|\d+)(?![a-z])(?:\\)?[\.\):]?\s*/i, '');
          }
          if (cleanLine) {
            currentQuestionText += (currentQuestionText ? '\n' : '') + cleanLine;
          }
        }
      }
    });

    if (currentQuestionText.trim()) {
      // Inline pastes can leave a trailing "Year:"/"Difficulty:" inside the
      // explanation text; strip it so it never reads as part of the answer.
      const explanationClean = currentExplanation.trim()
        .replace(/\s*Year\s*:\s*\d{4}\s*$/i, '')
        .replace(/\s*Difficulty\s*:\s*(?:easy|hard)\s*$/i, '')
        .trim();
      const q: ParsedBankQuestion = {
        text: currentQuestionText.trim(),
        options: ['A', 'B', 'C', 'D'].map((key, i) => ({ key, text: options[i] || '' })),
        correct: correctAnswer >= 0 ? ['A', 'B', 'C', 'D'][correctAnswer] : '',
        explanation: explanationClean,
      };
      if (currentYear >= 0) q.year = currentYear;
      if (currentDifficulty) q.difficulty = currentDifficulty;
      questions.push(q);
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
- Optional per question: "Year: 2019" and "Difficulty: easy" (or "hard") on their own lines. They override the year and difficulty chosen in Step 1 for that question. Practice only.
- Write maths and science notation in LaTeX inside $...$.
- Putting everything on one line per question also works: the question, then A: ... B: ... C: ... D: ..., then Answer:, then Explanation:.
- No tables, bullets, headings or extra text.`;
