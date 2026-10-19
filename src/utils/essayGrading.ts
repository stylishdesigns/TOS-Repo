
import { QuizQuestion, EssayPart, EssaySubPart, CBTExam } from '../types';
import { getEssayStructure } from './essay';

export interface LeafGrade {
  key: string;
  got: number;
  max: number;
  quality: number;
  missed: string[];
  feedback?: string;
  overridden?: boolean;
  originalGot?: number;
}

export interface EssayGrade {
  got: number;
  max: number;
  leaves: LeafGrade[];
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'at', 'from', 'by', 'for', 'with', 'in', 'on', 'to', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their', 'which', 'who', 'whom', 'whose'
]);

function normalizeText(text: string): string {
  if (!text) return '';
  
  // Lowercase
  let normalized = text.toLowerCase();
  
  // Map unicode superscripts/subscripts and symbols to ASCII
  const maps: Record<string, string> = {
    '²': '2', '³': '3', '¹': '1', '⁰': '0', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
    '⁺': '+', '⁻': '-', '×': 'x', '−': '-', '→': '->', '≥': '>=', '≤': '<=', '≠': '!='
  };
  
  for (const [uni, asc] of Object.entries(maps)) {
    normalized = normalized.split(uni).join(asc);
  }

  // Strip punctuation except digits, + - * / ^ = ( ) [ ] ; . (only between digits for .)
  // We'll keep basic math symbols
  normalized = normalized.replace(/[^a-z0-9+\-*/^=()[\];.\s]/g, ' ');
  
  // Refine dot: keep if between digits
  normalized = normalized.replace(/(\D)\./g, '$1 ').replace(/\.(\D)/g, ' $1');

  // Collapse whitespace
  return normalized.replace(/\s+/g, ' ').trim();
}

function lightStem(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.endsWith('ing')) return word.slice(0, -3);
  if (word.endsWith('ed')) return word.slice(0, -2);
  if (word.endsWith('es')) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  if (word.endsWith('ly')) return word.slice(0, -2);
  if (word.endsWith('ion')) return word.slice(0, -3);
  return word;
}

function getTokens(normalized: string, contentOnly = false): string[] {
  const tokens = normalized.split(' ').filter(Boolean);
  if (!contentOnly) return tokens;
  
  return tokens
    .filter(t => t.length > 2 && !STOP_WORDS.has(t))
    .map(lightStem);
}

function editDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) matrix[i][j] = matrix[i - 1][j - 1];
      else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}

function computeQuality(model: string, student: string, modelPoints?: string[]): { quality: number; missed: string[] } {
  const nModel = normalizeText(model);
  const nStudent = normalizeText(student);
  
  if (!nStudent) return { quality: 0, missed: [] };

  // 1. Exact match (ignoring spaces)
  if (nModel.replace(/\s/g, '') === nStudent.replace(/\s/g, '')) {
    return { quality: 1, missed: [] };
  }

  // 2. Keyword/Points check (if provided)
  if (modelPoints && modelPoints.length > 0) {
    let foundCount = 0;
    const missed: string[] = [];
    const nStudentRaw = nStudent; // Keep for partial matches
    
    for (const pointString of modelPoints) {
      const alternatives = pointString.split('|').map(alt => normalizeText(alt.trim())).filter(Boolean);
      const found = alternatives.some(nAlt => nStudentRaw.includes(nAlt));
      
      if (found) {
        foundCount++;
      } else {
        missed.push(pointString.split('|')[0].trim());
      }
    }
    
    const quality = foundCount / modelPoints.length;
    return { quality, missed: missed.slice(0, 5) };
  }

  // 3. Numeric/Symbolic check
  const modelTokens = getTokens(nModel);
  const studentTokens = getTokens(nStudent);
  const mathSymbols = new Set(['+', '-', '*', '/', '^', '=', '(', ')', '[', ']', ';']);
  const numericCount = modelTokens.filter(t => /^[0-9.]+$/.test(t) || mathSymbols.has(t)).length;
  
  if (numericCount > modelTokens.length * 0.5) {
    const modelMath = modelTokens.filter(t => /^[0-9.]+$/.test(t) || mathSymbols.has(t));
    const studentMath = studentTokens.filter(t => /^[0-9.]+$/.test(t) || mathSymbols.has(t));
    
    let matches = 0;
    for (let i = 0; i < Math.min(modelMath.length, studentMath.length); i++) {
      if (modelMath[i] === studentMath[i]) matches++;
    }
    
    if (matches === modelMath.length && modelMath.length === studentMath.length) return { quality: 1, missed: [] };
    const recall = matches / Math.max(1, modelMath.length);
    return { quality: Math.min(0.4, recall * 0.5), missed: [] };
  }

  // 4. Prose answers
  const modelContent = getTokens(nModel, true);
  const studentContent = getTokens(nStudent, true);
  
  if (modelContent.length === 0) return { quality: 1, missed: [] };

  let weightedRecall = 0;
  let totalWeight = 0;
  const missedWords: string[] = [];
  const studentContentSet = new Set(studentContent);

  modelContent.forEach(word => {
    const weight = word.length;
    totalWeight += weight;
    
    let found = studentContentSet.has(word);
    if (!found && word.length >= 6) {
      found = studentContent.some(sWord => editDistance(word, sWord) <= 1);
    }
    
    if (found) {
      weightedRecall += weight;
    } else {
      missedWords.push(word);
    }
  });

  const keywordRecall = weightedRecall / totalWeight;
  
  // Bigrams
  let bigramMatches = 0;
  const modelBigrams = [];
  for (let i = 0; i < modelContent.length - 1; i++) {
    modelBigrams.push(modelContent[i] + '_' + modelContent[i + 1]);
  }
  
  if (modelBigrams.length > 0) {
    const studentBigrams = new Set();
    for (let i = 0; i < studentContent.length - 1; i++) {
      studentBigrams.add(studentContent[i] + '_' + studentContent[i + 1]);
    }
    modelBigrams.forEach(bg => {
      if (studentBigrams.has(bg)) bigramMatches++;
    });
  }
  
  const bigramRecall = modelBigrams.length > 0 ? bigramMatches / modelBigrams.length : keywordRecall;
  const raw = 0.7 * keywordRecall + 0.3 * bigramRecall;
  
  let quality = 0;
  if (raw >= 0.8) quality = 1;
  else if (raw < 0.15) quality = 0;
  else quality = (raw - 0.15) / (0.8 - 0.15);

  // If student provided a non-empty, articulated response with relevant length, grant a fair baseline in fallback mode
  if (studentContent.length >= 3 && quality < 0.5) {
    const lengthRatio = Math.min(1, studentContent.length / Math.max(3, modelContent.length));
    quality = Math.max(quality, lengthRatio * 0.5);
  }

  // Anti-gaming (spamming excessive words without relevance)
  if (studentContent.length > modelContent.length * 6 && keywordRecall < 0.1) {
    quality *= 0.5;
  }

  return { quality, missed: quality >= 0.6 ? [] : missedWords.slice(0, 3) };
}

export function gradeEssayQuestion(
  q: QuizQuestion, 
  partAnswers: Record<string, string> | undefined, 
  legacyAnswer: string | undefined, 
  maxMarks: number
): EssayGrade {
  const structure = getEssayStructure(q);
  const leaves: { key: string; model: string; student: string; points?: string[] }[] = [];

  if (structure.parts.length === 0) {
    leaves.push({ 
      key: 'root', 
      model: structure.stemAnswer, 
      student: partAnswers?.['root'] || legacyAnswer || '',
      points: structure.stemPoints
    });
  } else {
    structure.parts.forEach(part => {
      if (part.subParts.length > 0) {
        part.subParts.forEach(sub => {
          leaves.push({ 
            key: sub.key, 
            model: sub.answer, 
            student: partAnswers?.[sub.key] || '',
            points: sub.points
          });
        });
      } else {
        leaves.push({ 
          key: part.key, 
          model: part.answer, 
          student: partAnswers?.[part.key] || '',
          points: part.points
        });
      }
    });
  }

  const leafMax = maxMarks / Math.max(1, leaves.length);
  const leafGrades: LeafGrade[] = leaves.map(leaf => {
    const { quality, missed } = computeQuality(leaf.model, leaf.student, leaf.points);
    const got = Math.round((leafMax * quality) * 2) / 2; // Nearest 0.5
    const feedback = quality >= 0.8
      ? 'Comprehensive response demonstrating clear mastery of the key concept.'
      : quality >= 0.4
        ? 'Valid points presented with partial coverage of the core concept.'
        : leaf.student.trim().length > 0
          ? 'Attempt noted. Review the explanation for complete coverage.'
          : 'No response submitted.';
    return {
      key: leaf.key,
      got,
      max: leafMax,
      quality,
      missed,
      feedback
    };
  });

  const totalGot = leafGrades.reduce((sum, g) => sum + g.got, 0);

  return {
    got: totalGot,
    max: maxMarks,
    leaves: leafGrades
  };
}

export async function gradeAllEssays(
  exam: CBTExam, 
  essayPartAnswers: Record<number, Record<string, string>>, 
  legacyEssayAnswers: Record<number, string>
): Promise<{ 
  grades: Record<number, EssayGrade>; 
  got: number; 
  max: number;
}> {
  const essayQuestions = exam.questions.filter(q => q.type === 'Essay');
  if (essayQuestions.length === 0) {
    return { grades: {}, got: 0, max: 0 };
  }

  // Total marks for the entire essay assessment
  const totalEssayMarks = (exam as any).totalEssayMarks ?? exam.essayMarksPerQuestion ?? 20;
  const questionAllocations = allocateEssayMarks(exam.questions, totalEssayMarks);

  const items: any[] = [];
  let essayIdx = 0;

  exam.questions.forEach((q, idx) => {
    if (q.type === 'Essay') {
      const structure = getEssayStructure(q);
      const maxMarks = questionAllocations[essayIdx] || Math.round((totalEssayMarks / essayQuestions.length) * 2) / 2;
      essayIdx++;
      
      const leaves: any[] = [];
      const totalLeaves = Math.max(1, structure.parts.reduce((sum, p) => sum + (p.subParts.length || 1), 0));
      const leafBaseMax = maxMarks / totalLeaves;

      if (structure.parts.length === 0) {
        leaves.push({
          key: 'root',
          question: q.question,
          modelAnswer: structure.stemAnswer || q.explanation,
          maxMarks: maxMarks,
          studentAnswer: essayPartAnswers[idx]?.['root'] || (!Object.keys(essayPartAnswers[idx] || {}).length ? (legacyEssayAnswers[idx] || '') : '')
        });
      } else {
        structure.parts.forEach(part => {
          if (part.subParts.length > 0) {
            part.subParts.forEach(sub => {
              leaves.push({
                key: sub.key,
                question: sub.text || (sub as any).question || '',
                modelAnswer: sub.answer,
                maxMarks: Math.round(leafBaseMax * 2) / 2 || leafBaseMax,
                studentAnswer: essayPartAnswers[idx]?.[sub.key] || (!Object.keys(essayPartAnswers[idx] || {}).length ? (legacyEssayAnswers[idx] || '') : '')
              });
            });
          } else {
            leaves.push({
              key: part.key,
              question: part.text || (part as any).question || '',
              modelAnswer: part.answer,
              maxMarks: Math.round(leafBaseMax * 2) / 2 || leafBaseMax,
              studentAnswer: essayPartAnswers[idx]?.[part.key] || (!Object.keys(essayPartAnswers[idx] || {}).length ? (legacyEssayAnswers[idx] || '') : '')
            });
          }
        });
      }

      items.push({
        questionIndex: idx,
        stem: structure.stem || q.question,
        subject: (exam.subjects && exam.subjects.length > 0) ? exam.subjects.join(', ') : 'General Subject',
        topic: exam.topic || '',
        targetExam: exam.targetExam || 'Standard',
        totalEssayMarks,
        leaves
      });
    }
  });

  try {
    const response = await fetch('/api/grade-essay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, totalEssayMarks })
    });

    if (!response.ok) throw new Error('System Evaluation Failed');
    const data = await response.json();

    const gradesMap: Record<number, EssayGrade> = {};
    let totalGot = 0;
    let totalMax = 0;

    items.forEach(item => {
      const qIdx = item.questionIndex;
      const itemGrades = data.grades.filter((g: any) => g.questionIndex === qIdx);
      
      const leafGrades: LeafGrade[] = item.leaves.map((leaf: any) => {
        const grade = itemGrades.find((g: any) => g.key === leaf.key);
        const got = grade ? Math.min(leaf.maxMarks, Math.max(0, grade.marksAwarded)) : 0;
        return {
          key: leaf.key,
          got,
          max: leaf.maxMarks,
          quality: leaf.maxMarks > 0 ? got / leaf.maxMarks : 0,
          missed: grade?.missedPoints || [],
          feedback: grade?.feedback || ''
        };
      });

      const qGot = leafGrades.reduce((sum, g) => sum + g.got, 0);
      const qMax = leafGrades.reduce((sum, g) => sum + g.max, 0);

      gradesMap[qIdx] = {
        got: qGot,
        max: qMax,
        leaves: leafGrades
      };

      totalGot += qGot;
      totalMax += qMax;
    });

    return { grades: gradesMap, got: totalGot, max: totalMax };
  } catch (error) {
    console.error("Essay Grading Error:", error);
    // Fallback to local grading if API fails
    return gradeAllEssaysLocal(exam, essayPartAnswers, legacyEssayAnswers);
  }
}

export function gradeAllEssaysLocal(
  exam: CBTExam, 
  essayPartAnswers: Record<number, Record<string, string>>, 
  legacyEssayAnswers: Record<number, string>
): { 
  grades: Record<number, EssayGrade>; 
  got: number; 
  max: number;
} {
  const grades: Record<number, EssayGrade> = {};
  let totalGot = 0;
  let totalMax = 0;

  const totalEssayMarks = (exam as any).totalEssayMarks ?? exam.essayMarksPerQuestion ?? 20;
  const questionAllocations = allocateEssayMarks(exam.questions, totalEssayMarks);
  let essayIdx = 0;

  exam.questions.forEach((q, idx) => {
    if (q.type === 'Essay') {
      const maxMarks = questionAllocations[essayIdx++] || Math.round((totalEssayMarks / (exam.questions.filter(eq => eq.type === 'Essay').length || 1)) * 2) / 2;
      const grade = gradeEssayQuestion(q, essayPartAnswers[idx], legacyEssayAnswers[idx], maxMarks);
      grades[idx] = grade;
      totalGot += grade.got;
      totalMax += grade.max;
    }
  });

  return { grades, got: totalGot, max: totalMax };
}

export function allocateEssayMarks(questions: QuizQuestion[], totalMarks: number): number[] {
  const essayQuestions = questions.filter(q => q.type === 'Essay');
  if (essayQuestions.length === 0) return [];
  if (essayQuestions.length === 1) return [totalMarks];
  
  // Weight difficulty by parts count, sub-parts, and depth
  const weights = essayQuestions.map(q => {
    const structure = getEssayStructure(q);
    const leafCount = structure.parts.reduce((sum, p) => sum + (p.subParts?.length || 1), 0);
    const lengthFactor = (q.question?.length || 0) > 120 ? 1.2 : 1.0;
    return Math.max(1, leafCount * lengthFactor);
  });

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const rawMarks = weights.map(w => Math.round(((w / totalWeight) * totalMarks) * 2) / 2);

  // Reconcile rounding difference to match totalMarks exactly
  const currentSum = rawMarks.reduce((sum, m) => sum + m, 0);
  const diff = Math.round((totalMarks - currentSum) * 2) / 2;
  if (diff !== 0 && rawMarks.length > 0) {
    rawMarks[0] = Math.max(1, Math.round((rawMarks[0] + diff) * 2) / 2);
  }

  return rawMarks;
}
