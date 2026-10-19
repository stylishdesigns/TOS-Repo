import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
} from 'firebase/firestore';
import { db } from '../../../../../firebase';

export interface BankQuestion {
  id: string;
  subject: string;
  topic: string;
  text: string; // may contain LaTeX, render with the existing MathText
  options: string[]; // 4 options
  correctIndex: number;
  explanation: string; // may contain LaTeX
  difficulty?: 'easy' | 'medium' | 'hard';
}

export interface QuestionBankProvider {
  getTopics(subject: string): Promise<{ topic: string; total: number }[]>;
  getQuestions(
    subject: string,
    topic: string | null,
    count: number,
    excludeIds: string[]
  ): Promise<BankQuestion[]>;
}

export interface TopicProgress {
  studentId: string;
  subject: string;
  topic: string;
  answered: number;
  correct: number;
  lastAt: string;
  recentIds: string[];
}

/**
 * Shuffle array client-side (Fisher-Yates)
 */
function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Firestore implementation of QuestionBankProvider.
 * Queries read-only collection 'questionBank'.
 * Never falls back to mock questions.
 */
export class FirestoreQuestionBank implements QuestionBankProvider {
  async getTopics(subject: string): Promise<{ topic: string; total: number }[]> {
    try {
      const q = query(
        collection(db, 'questionBank'),
        where('subject', '==', subject)
      );
      const snapshot = await getDocs(q);

      const topicCounts = new Map<string, number>();

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const topic = data.topic ? String(data.topic).trim() : 'General';
        topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
      });

      return Array.from(topicCounts.entries())
        .map(([topic, total]) => ({ topic, total }))
        .sort((a, b) => a.topic.localeCompare(b.topic));
    } catch (err) {
      console.warn('Error fetching question bank topics from Firestore:', err);
      return [];
    }
  }

  async getQuestions(
    subject: string,
    topic: string | null,
    count: number = 10,
    excludeIds: string[] = []
  ): Promise<BankQuestion[]> {
    try {
      let q = topic
        ? query(
            collection(db, 'questionBank'),
            where('subject', '==', subject),
            where('topic', '==', topic)
          )
        : query(
            collection(db, 'questionBank'),
            where('subject', '==', subject)
          );

      const snapshot = await getDocs(q);
      const allQuestions: BankQuestion[] = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        allQuestions.push({
          id: docSnap.id,
          subject: data.subject || subject,
          topic: data.topic || (topic || 'General'),
          text: data.text || data.question || '',
          options: Array.isArray(data.options) ? data.options : [],
          correctIndex:
            typeof data.correctIndex === 'number'
              ? data.correctIndex
              : typeof data.correctAnswer === 'number'
              ? data.correctAnswer
              : 0,
          explanation: data.explanation || '',
          difficulty: data.difficulty,
        });
      });

      if (allQuestions.length === 0) {
        return [];
      }

      // Exclude recent IDs first
      const excludeSet = new Set(excludeIds);
      const freshQuestions = allQuestions.filter((q) => !excludeSet.has(q.id));

      let selected: BankQuestion[];
      if (freshQuestions.length >= count) {
        selected = shuffle(freshQuestions).slice(0, count);
      } else {
        // If fresh questions are fewer than count, reuse oldest from excluded to make up count
        const needed = count - freshQuestions.length;
        const reused = allQuestions.filter((q) => excludeSet.has(q.id));
        selected = [...shuffle(freshQuestions), ...shuffle(reused).slice(0, needed)];
      }

      return selected;
    } catch (err) {
      console.warn('Error fetching questions from questionBank:', err);
      return [];
    }
  }
}

let questionBankInstance: QuestionBankProvider | null = null;

export function getQuestionBank(): QuestionBankProvider {
  if (!questionBankInstance) {
    questionBankInstance = new FirestoreQuestionBank();
  }
  return questionBankInstance;
}

/**
 * Fetch practice progress for a student across all topics in a subject
 */
export async function getStudentPracticeProgress(
  studentId: string,
  subject: string
): Promise<Record<string, TopicProgress>> {
  try {
    const q = query(
      collection(db, 'practiceProgress'),
      where('studentId', '==', studentId),
      where('subject', '==', subject)
    );
    const snapshot = await getDocs(q);
    const progressMap: Record<string, TopicProgress> = {};

    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as TopicProgress;
      progressMap[data.topic] = data;
    });

    return progressMap;
  } catch (err) {
    console.warn('Error fetching practice progress:', err);
    return {};
  }
}

/**
 * Save practice progress for a topic once per set (never per question).
 * Limits writes to Firestore.
 */
export async function saveTopicProgress(
  studentId: string,
  subject: string,
  topic: string,
  answeredInSet: number,
  correctInSet: number,
  questionIdsInSet: string[]
): Promise<TopicProgress> {
  const docId = `${studentId}__${subject}__${topic}`;
  const docRef = doc(db, 'practiceProgress', docId);

  let existing: TopicProgress | null = null;
  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      existing = snap.data() as TopicProgress;
    }
  } catch (e) {
    console.warn('Could not read existing practiceProgress:', e);
  }

  const prevAnswered = existing?.answered || 0;
  const prevCorrect = existing?.correct || 0;
  const prevRecent = existing?.recentIds || [];

  const updated: TopicProgress = {
    studentId,
    subject,
    topic,
    answered: prevAnswered + answeredInSet,
    correct: prevCorrect + correctInSet,
    lastAt: new Date().toISOString(),
    recentIds: Array.from(new Set([...questionIdsInSet, ...prevRecent])).slice(0, 100),
  };

  try {
    await setDoc(docRef, updated);
  } catch (err) {
    console.error('Failed to save practiceProgress:', err);
  }

  return updated;
}

/**
 * Helper to compute accuracy percentage
 */
export function calculateAccuracy(correct: number, answered: number): number {
  if (!answered || answered <= 0) return 0;
  return Math.round((correct / answered) * 100);
}
