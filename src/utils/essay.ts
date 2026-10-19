import { QuizQuestion, EssayPart, EssaySubPart } from '../types';

export interface EssayStructure {
  stem: string;
  stemAnswer: string;
  stemPoints?: string[];
  parts: EssayPart[];
}

const ROMAN_NUMERALS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii'];

/**
 * Checks if a stem text is just generic placeholder text like "Essay", "Question", etc.
 */
export function isGenericStem(text?: string): boolean {
  if (!text) return true;
  const clean = text.trim().toLowerCase();
  return (
    clean === '' ||
    clean === 'essay' ||
    clean === 'essay question' ||
    clean === 'essay component' ||
    clean === 'question' ||
    clean === 'n/a' ||
    clean === 'none' ||
    /^essay(?:\s*question|\s*component)?[:.]?$/i.test(clean) ||
    /^question\s*\d*[:.]?$/i.test(clean)
  );
}

/**
 * Normalizes a part label into clean lowercase letters (a, b, c, d...)
 */
export function cleanPartLabel(rawLabel: string | undefined, index: number): string {
  if (!rawLabel) return String.fromCharCode(97 + index);
  const trimmed = rawLabel.trim().toLowerCase().replace(/^part\s+/i, '').replace(/[\(\)\[\].:]/g, '').trim();
  if (/^[a-z]$/.test(trimmed)) {
    return trimmed;
  }
  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && num >= 1 && num <= 26) {
    return String.fromCharCode(96 + num);
  }
  return String.fromCharCode(97 + index);
}

/**
 * Normalizes a sub-part label into clean lowercase Roman numerals (i, ii, iii, iv...)
 */
export function cleanSubPartLabel(rawLabel: string | undefined, index: number): string {
  if (!rawLabel) return ROMAN_NUMERALS[index] || `sub-${index + 1}`;
  const trimmed = rawLabel.trim().toLowerCase().replace(/^sub(?:part)?\s+/i, '').replace(/[\(\)\[\].:]/g, '').trim();
  if (ROMAN_NUMERALS.includes(trimmed)) {
    return trimmed;
  }
  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && num >= 1 && num <= ROMAN_NUMERALS.length) {
    return ROMAN_NUMERALS[num - 1];
  }
  return ROMAN_NUMERALS[index] || trimmed;
}

/**
 * Strips duplicate leading labels like "(a)", "a.", "(i)", "i." from question text
 */
export function stripLeadingLabel(text: string): string {
  if (!text) return '';
  return text
    .replace(/^(?:\(?[a-z]\)?[.:]?)\s+/i, '')
    .replace(/^(?:\(?[ivx]+\)?[.:]?)\s+/i, '')
    .replace(/^(?:part\s+[a-z][.:]?)\s+/i, '')
    .replace(/^(?:sub(?:part)?\s+[ivx0-9]+[.:]?)\s+/i, '')
    .trim();
}

/**
 * Parses raw text lines into a structured essay object.
 * Format expected:
 * 1. Stem text... (or scenario/context)
 * a. Sub-question text...
 * Answer: Model answer...
 * b. Sub-question text...
 * i. Sub-point text...
 * Answer: Model answer...
 * ii. Sub-point text...
 * Answer: Model answer...
 * 
 * Note: Keywords/keypoints lines are no longer required as AI evaluates 
 * student responses with deep subject-matter comprehension and domain validity.
 */
export function parseEssayBlock(lines: string[]): EssayStructure {
  const structure: EssayStructure = {
    stem: '',
    stemAnswer: '',
    parts: []
  };

  if (lines.length === 0) return structure;

  // Clean lines and first line marker (1., Q1:, Question 1:, Q:)
  const cleanLines = lines.map(l => l.trim()).filter(l => l);
  if (cleanLines.length === 0) return structure;

  // First line handling: remove leading question number/prefix
  let firstLine = cleanLines[0].replace(/^(?:Question\s*\d+|Q\d+|Q:|\d+)(?![a-z])[\.\):]?\s*/i, '').trim();
  
  const level1Regex = /^([a-z])[.)]\s+(.*)/i;
  const level2Regex = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x)[.)]\s+(.*)/i;
  const answerRegex = /^(?:Answer|Model Answer|Correct|Solution):\s*(.*)/i;
  const keywordsRegex = /^(?:Keywords|Keypoints|Key\s*points):\s*(.*)/i;

  let currentPart: EssayPart | null = null;
  let currentSubPart: EssaySubPart | null = null;
  let target: 'stem' | 'part' | 'subPart' = 'stem';
  let isCollectingAnswer = false;

  structure.stem = isGenericStem(firstLine) ? '' : firstLine;

  for (let i = 1; i < cleanLines.length; i++) {
    const line = cleanLines[i];
    
    // Ignore / safely swallow legacy Keywords or Keypoints lines if present
    const kwMatch = line.match(keywordsRegex);
    if (kwMatch) {
      const kwString = kwMatch[1].trim();
      if (kwString) {
        const points = kwString.split(';').map(p => p.trim()).filter(Boolean);
        if (target === 'subPart' && currentSubPart) {
          currentSubPart.points = points;
        } else if (target === 'part' && currentPart) {
          currentPart.points = points;
        } else {
          structure.stemPoints = points;
        }
      }
      continue;
    }

    // Check for Answer marker
    const answerMatch = line.match(answerRegex);
    if (answerMatch) {
      isCollectingAnswer = true;
      const content = answerMatch[1].trim();
      if (target === 'subPart' && currentSubPart) {
        currentSubPart.answer = content;
      } else if (target === 'part' && currentPart) {
        currentPart.answer = content;
      } else {
        structure.stemAnswer = content;
      }
      continue;
    }

    // Check for Level 1 Marker (a., b.)
    const l1Match = line.match(level1Regex);
    const isActuallyL1 = l1Match && !(l1Match[1].toLowerCase() === 'i' && currentPart);

    if (isActuallyL1) {
      if (currentPart) structure.parts.push(currentPart);
      
      const label = cleanPartLabel(l1Match![1], structure.parts.length);
      currentPart = {
        key: label,
        label: label,
        text: stripLeadingLabel(l1Match![2].trim()),
        answer: '',
        subParts: []
      };
      currentSubPart = null;
      target = 'part';
      isCollectingAnswer = false;
      continue;
    }

    // Check for Level 2 Marker (i., ii.)
    const l2Match = line.match(level2Regex);
    if (l2Match && currentPart) {
      if (currentSubPart) currentPart.subParts.push(currentSubPart);
      
      const label = cleanSubPartLabel(l2Match[1], currentPart.subParts.length);
      currentSubPart = {
        key: `${currentPart.key}-${label}`,
        label: label,
        text: stripLeadingLabel(l2Match[2].trim()),
        answer: ''
      };
      target = 'subPart';
      isCollectingAnswer = false;
      continue;
    }

    // Continuation lines
    if (isCollectingAnswer) {
      if (target === 'subPart' && currentSubPart) {
        currentSubPart.answer += (currentSubPart.answer ? '\n' : '') + line;
      } else if (target === 'part' && currentPart) {
        currentPart.answer += (currentPart.answer ? '\n' : '') + line;
      } else {
        structure.stemAnswer += (structure.stemAnswer ? '\n' : '') + line;
      }
    } else {
      if (target === 'subPart' && currentSubPart) {
        currentSubPart.text += (currentSubPart.text ? '\n' : '') + line;
      } else if (target === 'part' && currentPart) {
        currentPart.text += (currentPart.text ? '\n' : '') + line;
      } else {
        structure.stem += (structure.stem ? '\n' : '') + line;
      }
    }
  }

  // Push final parts
  if (currentSubPart && currentPart) {
    currentPart.subParts.push(currentSubPart);
  }
  if (currentPart) {
    structure.parts.push(currentPart);
  }

  return structure;
}

/**
 * Rebuilds structured essay data for rendering.
 * Uses `parts` if available (newly saved), else parses `question + explanation` (legacy).
 */
export function getEssayStructure(q: QuizQuestion): EssayStructure {
  if (q.parts && q.parts.length > 0) {
    const rawStem = q.question || '';
    const cleanStem = isGenericStem(rawStem) ? '' : rawStem.trim();
    const cleanParts: EssayPart[] = (q.parts as EssayPart[]).map((p, pIdx) => {
      const pLabel = cleanPartLabel(p.label, pIdx);
      return {
        ...p,
        key: p.key || pLabel,
        label: pLabel,
        text: stripLeadingLabel(p.text || (p as any).question || ''),
        question: stripLeadingLabel(p.text || (p as any).question || ''),
        subParts: (p.subParts || []).map((sp, spIdx) => {
          const spLabel = cleanSubPartLabel(sp.label, spIdx);
          return {
            ...sp,
            key: sp.key || `${pLabel}-${spLabel}`,
            label: spLabel,
            text: stripLeadingLabel(sp.text || (sp as any).question || ''),
            question: stripLeadingLabel(sp.text || (sp as any).question || '')
          };
        })
      };
    });

    return {
      stem: cleanStem,
      stemAnswer: (q as any).stemAnswer || '',
      stemPoints: (q as any).stemPoints,
      parts: cleanParts
    };
  }

  // Rebuild from legacy string format
  const rawQ = q.question || '';
  const lines = [rawQ, ...(q.explanation ? q.explanation.split('\n') : [])];
  return parseEssayBlock(lines);
}

/**
 * Flattens structured answers into a single string for legacy storage if needed.
 */
export function flattenEssayAnswers(structure: EssayStructure, partAnswers: Record<string, string>): string {
  if (structure.parts.length === 0) {
    return partAnswers['root'] || '';
  }

  const lines: string[] = [];
  structure.parts.forEach(part => {
    if (part.subParts.length > 0) {
      part.subParts.forEach(sub => {
        const ans = partAnswers[sub.key];
        if (ans) lines.push(`(${part.label})(${sub.label}) ${ans.trim()}`);
      });
    } else {
      const ans = partAnswers[part.key];
      if (ans) lines.push(`(${part.label}) ${ans.trim()}`);
    }
  });

  return lines.join('\n\n');
}

/**
 * Builds a QuizQuestion object from a raw essay text block.
 * Splits into non-empty trimmed lines, runs parseEssayBlock, and packages identically to the manual paste flow.
 */
export function buildEssayQuestionFromBlock(blockText: string): QuizQuestion {
  const lines = blockText
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  const structure = parseEssayBlock(lines);

  return {
    id: `q-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    question: structure.stem,
    parts: structure.parts,
    stemAnswer: structure.stemAnswer,
    stemPoints: structure.stemPoints,
    explanation: lines.slice(1).join('\n'),
    options: [],
    correctAnswer: -1,
    type: 'Essay'
  };
}
