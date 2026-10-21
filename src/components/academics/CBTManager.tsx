import React, { useState, useEffect } from 'react';
import { ModernSelect } from '../ui/ModernSelect';
import { useApp } from '../../context/AppContext';
import {
  Laptop,
  Clock,
  BookOpen,
  Award,
  Play,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  BarChart2,
  X,
  ChevronRight,
  Sparkles,
  Search,
  Plus,
  FileText,
  Import,
  Cpu,
  Users,
  Filter,
  Loader2,
  Pencil,
  Trash2,
  RotateCcw,
  RefreshCw,
  Settings,
  Copy,
  Check,
  Wand2,
} from 'lucide-react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, where, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { CBTExam, QuizQuestion, EssayPart, EssaySubPart } from '../../types';
import { parseEssayBlock, getEssayStructure, cleanPartLabel, cleanSubPartLabel, stripLeadingLabel, isGenericStem, buildEssayQuestionFromBlock } from '../../utils/essay';
import { EssayQuestion } from '../common/EssayQuestion';
import { gradeAllEssays, allocateEssayMarks } from '../../utils/essayGrading';
import { MathText, cleanOptionText } from '../common/MathText';
import { buildAssessmentAIPrompt } from '../../utils/aiPromptBuilder';

// -------------------------------------------------------------------------
// FIRESTORE ERROR HANDLING
// -------------------------------------------------------------------------
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(error: any, operationType: OperationType, path: string | null) {
  console.error(`Firestore ${operationType} Error on ${path}:`, error);
}

interface MockGradingSettings {
  programmeId: string;
  mcqScore: number;
  essayScore: number;
}

export const CBTManager: React.FC = () => {
  const { programmes, subjects: allSubjects, tutors, settings, addToast, exams, results, students, activeCentreId } = useApp();

  const [activeFrequency, setActiveFrequency] = useState<'General' | 'Mock'>('General');
  const [activeTimeFilter, setActiveTimeFilter] = useState<'Current' | 'Upcoming'>('Current');
  const [showArchive, setShowArchive] = useState(false);
  const [programmeTypeFilter, setProgrammeTypeFilter] = useState('All');
  const [subjectFilter, setSubjectFilter] = useState('All');
  const [tutorFilter, setTutorFilter] = useState('All');
  const [selectedWeek, setSelectedWeek] = useState<string>('all');
  const [showAnalyticsModal, setShowAnalyticsModal] = useState<CBTExam | null>(null);
  const [showGlobalGradingModal, setShowGlobalGradingModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [globalMockGrading, setGlobalMockGrading] = useState<MockGradingSettings[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [archivePage, setArchivePage] = useState(1);

  useEffect(() => {
    setArchivePage(1);
  }, [showArchive, programmeTypeFilter, subjectFilter, tutorFilter, selectedWeek, activeFrequency]);

  // Generate weeks dynamically (reused from portals)
  const generateWeeks = () => {
    const weeksList: string[] = [];
    const now = new Date();
    let current = new Date(now);
    current.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1) - 28);
    const endDate = new Date(now);
    endDate.setDate(now.getDate() + 90);

    while (current <= endDate) {
      const weekStart = new Date(current);
      const weekEnd = new Date(current);
      weekEnd.setDate(weekStart.getDate() + 6);
      const range = `${weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - ${weekEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
      weeksList.push(range);
      current.setDate(current.getDate() + 7);
    }
    return weeksList;
  };

  // Cache Buster: 20261001-0720
  const weeks = generateWeeks();
  const [deletingExamId, setDeletingExamId] = useState<string | null>(null);

  // Firestore Sync for Global Grading
  useEffect(() => {
    const unsub = onSnapshot(activeCentreId ? query(collection(db, 'mock_grading'), where('centreId', '==', activeCentreId)) : collection(db, 'mock_grading'), (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data() as MockGradingSettings);
      setGlobalMockGrading(data);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'mock_grading'));
    return () => unsub();
  }, [activeCentreId]);

  React.useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000); // Update every minute for timers
    return () => clearInterval(timer);
  }, []);
  const [activeQuizModal, setActiveQuizModal] = useState<CBTExam | null>(null);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGrading, setIsGrading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [generatedQuestions, setGeneratedQuestions] = useState<QuizQuestion[]>([]);

  // Assessment Setup Form State
  const [setupData, setSetupData] = useState({
    frequency: 'General' as 'General' | 'Mock',
    programmeId: '',
    subjectIds: [] as string[],
    topic: '',
    isClasswork: false,
    isAssignment: false,
    mode: 'MCQ' as 'MCQ' | 'Essay' | 'Both',
    department: 'All' as 'All' | 'Science' | 'Commercial' | 'Arts',
    tutorId: '',
    hasDuration: true,
    duration: 60,
    startTime: '',
    endTime: '',
    questionInputMode: 'Paste' as 'Paste' | 'AI',
    scorePerQuestion: 1,
    essayMarksPerQuestion: 20,
    questionCount: 10,
  });

  const [pastedText, setPastedText] = useState('');
  const [parsedQuestions, setParsedQuestions] = useState<QuizQuestion[]>([]);
  
  // State for Mock Exam multi-subject setup
  const [mockSubjectData, setMockSubjectData] = useState<Record<string, { pastedText: string; questions: QuizQuestion[] }>>({});
  const [activeMockSubjectId, setActiveMockSubjectId] = useState<string>('');

  const [showFormatGuide, setShowFormatGuide] = useState(false);

  const parsePastedQuestions = (text: string, subjectId?: string) => {
    const questions: QuizQuestion[] = [];
    
    // Split by main question markers: "1.", "Q1:", "Question 1:", "1)", "1:". 
    // Uses negative lookahead (?![a-z]) to avoid splitting on sub-questions like "1a."
    const blocks = text.split(/(?:\n|^)\s*(?=(?:Question\s*\d+|Q\d+|Q:|\d+)(?![a-z])[\.\):]?\s+)/im).filter(b => b.trim());
    
    let mcqMismatches = 0;
    let essayMismatches = 0;

    blocks.forEach(block => {
      const lines = block.split('\n').map(l => l.trim()).filter(l => l);
      if (lines.length < 1) return;

      // FIRST PASS: Detect characteristics
      const optionRegex = /^[A-D][.):]\s*\S/;
      const letterAnswerRegex = /^(?:Answer|Correct):\s*[A-D][.)]?\s*$/i;
      
      const uppercaseOptionsCount = lines.filter(line => optionRegex.test(line)).length;
      const likelyMCQ = uppercaseOptionsCount >= 2;

      // Determine parsing path based on SELECTED MODE
      const selectedMode = setupData.mode;
      let parseAsMCQ = (selectedMode === 'MCQ') ? true : (selectedMode === 'Essay' ? false : likelyMCQ);

      if (parseAsMCQ) {
        let currentQuestionText = "";
        let currentModelAnswer = "";
        const options: string[] = [];
        let correctAnswer = -1;
        let isCollectingAnswer = false;

        lines.forEach(line => {
          // Match options: "A:", "A.", "A)" (Strictly uppercase + marker + non-whitespace)
          if (optionRegex.test(line)) {
            const content = line.replace(/^[A-D][.):]\s*/, '').trim();
            options.push(content);
            isCollectingAnswer = true;
          } 
          // Match Answer key: "Answer: C", "Correct: C"
          else if (letterAnswerRegex.test(line)) {
            const match = line.match(/^(?:Answer|Correct):\s*([A-D])(?![a-z])/i);
            if (match) {
              correctAnswer = match[1].toUpperCase().charCodeAt(0) - 65;
            }
            isCollectingAnswer = true;
          } 
          // Match Explanations: "Model Answer:", "Explanation:"
          else if (/^(?:Model Answer|Explanation|Solution):/i.test(line)) {
            currentModelAnswer += (currentModelAnswer ? '\n' : '') + line.replace(/^(?:Model Answer|Explanation|Solution):/i, '').trim();
            isCollectingAnswer = true;
          } 
          else {
            if (isCollectingAnswer) {
              currentModelAnswer += (currentModelAnswer ? '\n' : '') + line;
            } else {
              let cleanLine = line;
              if (currentQuestionText === "") {
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
            id: `q-${Date.now()}-${Math.random()}`,
            question: currentQuestionText.trim(), 
            options: options, 
            correctAnswer: (correctAnswer >= 0 ? correctAnswer : -1), 
            explanation: currentModelAnswer.trim(),
            type: 'MCQ'
          });
        }
      } else {
        // Essay path using parseEssayBlock
        const structure = parseEssayBlock(lines);
        questions.push({
          id: `q-${Date.now()}-${Math.random()}`,
          question: structure.stem,
          parts: structure.parts,
          stemAnswer: structure.stemAnswer,
          stemPoints: structure.stemPoints,
          explanation: lines.slice(1).join('\n'), // raw for backward compat
          options: [],
          correctAnswer: -1,
          type: 'Essay'
        });
      }
    });

    if (subjectId) {
      setMockSubjectData(prev => ({
        ...prev,
        [subjectId]: { ...prev[subjectId], questions }
      }));
    } else {
      setParsedQuestions(questions);
    }

    if (questions.length > 0) {
      addToast({ 
        type: 'success', 
        title: 'Parsing Complete', 
        description: `Detected ${questions.length} valid questions.` 
      });
    } else {
      addToast({ 
        type: 'error', 
        title: 'Parsing Failed', 
        description: 'No valid questions found. Check the format guide.' 
      });
    }
  };

  // Live CBT Simulator state
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<{ [key: number]: number }>({});
  const [essayAnswers, setEssayAnswers] = useState<{ [key: number]: string }>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  const now = new Date();

  const totalQuestions = exams.reduce((sum, ex) => sum + (ex.questions?.length || ex.questionCount || 0), 0);
  const totalAttempts = exams.reduce((sum, ex) => sum + ex.attemptsCount, 0);

  const filteredExams = exams.filter((ex) => {
    const examStart = ex.startTime ? new Date(ex.startTime) : new Date(0);
    const examEnd = ex.endTime ? new Date(ex.endTime) : new Date(9999, 11, 31);
    
    // Terminology map - ensure old data maps correctly
    const mappedFreq = (ex.frequency as string === 'Daily' || ex.frequency as string === 'Weekly' || ex.frequency === 'General') ? 'General' : 'Mock';

    // Logic: Move to archive ONLY when the day has actually passed across all portals
    const isPastDay = new Date(currentTime.toDateString()).getTime() > new Date(examStart.toDateString()).getTime();

    // Robust "isPast" logic for tags/status
    const isPast = currentTime.getTime() > examEnd.getTime() || isPastDay;
    const isToday = examStart.toDateString() === currentTime.toDateString();
    
    const matchesFreq = mappedFreq === activeFrequency;
    const matchesProg = programmeTypeFilter === 'All' || ex.targetExam.includes(programmeTypeFilter);
    const matchesSub = subjectFilter === 'All' || ex.subjects.includes(subjectFilter);
    const matchesTutor = tutorFilter === 'All' || ex.tutorId === tutorFilter || (ex.tutorName && ex.tutorName === tutorFilter);
    
    // Global "All" Logic
    if (selectedWeek === 'all') {
      if (showArchive) return isPastDay && matchesFreq && matchesProg && matchesSub && matchesTutor;
      return !isPastDay && matchesFreq && matchesProg && matchesSub && matchesTutor;
    }

    // Weekly Filter (Consolidated)
    if (selectedWeek && selectedWeek.includes(' - ')) {
      const [startStr, endStr] = selectedWeek.split(' - ');
      const now = new Date();
      const currentYear = now.getFullYear();
      
      const parseRangeDate = (datePart: string) => {
        const parts = datePart.trim().split(' ');
        const d = parseInt(parts[0]);
        const mRaw = (parts[1] || '').replace(/[^a-z]/gi, '').toLowerCase();
        const monthMap: Record<string, number> = {
          jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11
        };
        const monthIndex = monthMap[mRaw] ?? 0;
        
        let year = currentYear;
        if (now.getMonth() === 0 && monthIndex === 11) year--;
        if (now.getMonth() === 11 && monthIndex === 0) year++;
        
        const date = new Date(year, monthIndex, d);
        date.setHours(0,0,0,0);
        return date;
      };

      const startDate = parseRangeDate(startStr);
      const endDate = parseRangeDate(endStr);
      endDate.setHours(23, 59, 59, 999);

      const checkDate = new Date(examStart.toDateString());
      checkDate.setHours(0,0,0,0);

      const matchesWeek = !selectedWeek || selectedWeek === 'all' || (checkDate.getTime() >= startDate.getTime() && checkDate.getTime() <= endDate.getTime());
      
      // Mode-specific filtering
      if (selectedWeek && selectedWeek !== 'all') {
        if (!matchesWeek) return false;
        // In weekly mode, we still respect basic frequency/dept/tutor filters
        return matchesFreq && matchesProg && matchesSub && matchesTutor;
      }
    }

    // Archive Logic: show anything NOT today
    if (showArchive) {
      return !isToday && matchesFreq && matchesProg && matchesSub && matchesTutor;
    }
    
    // Main View: show today's AND future assessments
    return !isPastDay && matchesFreq && matchesProg && matchesSub && matchesTutor;
  });

  const handleStartExam = (exam: CBTExam) => {
    setActiveQuizModal(exam);
    setCurrentQIndex(0);
    setSelectedAnswers({});
    setEssayAnswers({});
    setQuizSubmitted(false);
  };

  const handleSelectOption = (qIdx: number, optIdx: number) => {
    if (quizSubmitted) return;
    setSelectedAnswers({
      ...selectedAnswers,
      [qIdx]: optIdx,
    });
  };

  const handleEssayInput = (qIdx: number, text: string) => {
    if (quizSubmitted) return;
    setEssayAnswers({
      ...essayAnswers,
      [qIdx]: text
    });
  };

  const handleDeleteExam = async (examId?: string) => {
    const idToDelete = examId || editingExamId || deletingExamId;
    if (!idToDelete) return;
    
    try {
      await deleteDoc(doc(db, 'cbt_exams', idToDelete));
      setShowSetupModal(false);
      setEditingExamId(null);
      setDeletingExamId(null);
      addToast({
        type: 'success',
        title: 'Assessment Deleted',
        description: 'The assessment has been removed.'
      });
    } catch (err) {
      console.error("Delete error:", err);
      addToast({ type: 'error', title: 'Delete Failed', description: 'Ensure you have permission to delete this.' });
    }
  };

  const handleFinishQuiz = async () => {
    if (!activeQuizModal || isGrading) return;
    setIsGrading(true);
    setQuizSubmitted(true);
    
    const questions = activeQuizModal.questions.length > 0 ? activeQuizModal.questions : [];
    if (questions.length === 0) {
      setIsGrading(false);
      return;
    }

    let score = 0;
    const gradingWeight = activeQuizModal.scorePerQuestion || 1;

    if (activeQuizModal.mode === 'MCQ' || activeQuizModal.mode === 'Both') {
      let correct = 0;
      let mcqCount = 0;
      questions.forEach((q, idx) => {
        if (q.type === 'MCQ' || (activeQuizModal.mode === 'MCQ' && q.options.length > 0)) {
          mcqCount++;
          if (selectedAnswers[idx] === q.correctAnswer) correct++;
        }
      });
      if (mcqCount > 0) {
        score += correct * gradingWeight;
        const pct = Math.round((correct / mcqCount) * 100);
        addToast({
          type: 'success',
          title: 'MCQ Evaluated',
          description: `Score: ${correct * gradingWeight} / ${mcqCount * gradingWeight} (${pct}%).`,
        });
      }
    }
    
    if (activeQuizModal.mode === 'Essay' || activeQuizModal.mode === 'Both') {
      const { grades, got: essayGot, max: essayMax } = await gradeAllEssays(activeQuizModal, { [0]: {} }, essayAnswers);
      score += essayGot;
      
      addToast({
        type: 'success',
        title: 'Essays Evaluated',
        description: `Score: ${essayGot} / ${essayMax} Marks.`,
      });
    }

    setIsGrading(false);
  };

  const handleAutoFillPrompt = (subjectId?: string) => {
    if (!setupData.programmeId || (setupData.frequency !== 'Mock' && setupData.subjectIds.length === 0)) {
      addToast({ type: 'warning', title: 'Setup Details Needed', description: 'Please select a programme and at least one subject first.' });
      return;
    }

    const targetSubjectId = subjectId || (setupData.subjectIds.length === 1 ? setupData.subjectIds[0] : undefined);
    const subjectName = targetSubjectId 
      ? (allSubjects.find(s => s.id === targetSubjectId)?.name || 'General Subject')
      : (allSubjects.filter(s => setupData.subjectIds.includes(s.id)).map(s => s.name).join(', ') || 'General Subject');
    const progName = programmes.find(p => p.id === setupData.programmeId)?.name || 'Standard Exam';

    const promptText = buildAssessmentAIPrompt({
      subject: subjectName,
      programme: progName,
      topic: setupData.topic,
      mode: setupData.mode,
      questionCount: setupData.questionCount || 10,
      totalEssayMarks: setupData.essayMarksPerQuestion || 20,
      scorePerQuestion: setupData.scorePerQuestion || 1,
    });

    setAiPrompt(promptText);
    addToast({
      type: 'success',
      title: 'Prompt Auto-Filled',
      description: `Loaded structured instructions for ${subjectName}. You can customize or edit it anytime.`
    });
  };

  const handleGenerateAIQuestions = async (subjectId?: string) => {
    if (!setupData.programmeId || (setupData.frequency !== 'Mock' && setupData.subjectIds.length === 0)) {
      addToast({ type: 'error', title: 'Missing Info', description: 'Please select a programme and subject(s) first.' });
      return;
    }

    if (!aiPrompt.trim()) {
      addToast({
        type: 'warning',
        title: 'Instruction Prompt Required',
        description: 'Please click "Auto-Fill Prompt from Setup" to load guidelines from your setup form, or type your custom guidelines before generating.'
      });
      return;
    }

    const targetSubjectId = subjectId || setupData.subjectIds[0];
    if (!targetSubjectId) return;

    setGeneratingAI(true);
    try {
      const programme = programmes.find(p => p.id === setupData.programmeId)?.name || 'Standard Exam';
      const subject = allSubjects.find(s => s.id === targetSubjectId)?.name || 'General Subject';
      const topicContext = setupData.topic ? ` focusing on ${setupData.topic}` : '';
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 65000);

      const response = await fetch('/api/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          subject,
          programme,
          count: setupData.questionCount || 40,
          type: setupData.mode === 'Both' ? 'Mixed' : setupData.mode === 'MCQ' ? 'Multiple Choice' : 'Essay',
          prompt: aiPrompt || topicContext
        })
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || errData.error || `Server returned error (${response.status})`);
      }
      const data = await response.json();
      const formattedQuestions: QuizQuestion[] = [];

      // 1. Process structured essays if returned
      if (Array.isArray(data.essays)) {
        for (const block of data.essays) {
          if (typeof block === 'string' && block.trim()) {
            formattedQuestions.push(buildEssayQuestionFromBlock(block));
          }
        }
      }

      // 2. Process MCQs (and any legacy/JSON essay questions) if returned
      if (Array.isArray(data.questions)) {
        for (let idx = 0; idx < data.questions.length; idx++) {
          const q = data.questions[idx];
          if (q.type === 'Essay') {
            const rawStem = q.stem || q.question || '';
            const cleanedStem = isGenericStem(rawStem) ? '' : rawStem.trim();
            const parts: EssayPart[] = (q.parts || []).map((p: any, pIdx: number) => {
              const pLabel = cleanPartLabel(p.label, pIdx);
              return {
                key: pLabel,
                label: pLabel,
                question: stripLeadingLabel(p.text || p.question || ''),
                answer: p.answer || '',
                points: p.points || [],
                subParts: (p.subParts || []).map((sp: any, spIdx: number) => {
                  const spLabel = cleanSubPartLabel(sp.label, spIdx);
                  return {
                    key: `${pLabel}-${spLabel}`,
                    label: spLabel,
                    question: stripLeadingLabel(sp.text || sp.question || ''),
                    answer: sp.answer || '',
                    points: sp.points || []
                  };
                })
              };
            });

            formattedQuestions.push({
              id: `q-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
              type: 'Essay',
              question: cleanedStem,
              parts: parts,
              stemAnswer: q.stemAnswer || '',
              explanation: parts.map((p) => {
                let partText = `(${p.label}) ${p.answer}`;
                if (p.subParts && p.subParts.length > 0) {
                  partText += '\n' + p.subParts.map((sp) => `   (${sp.label}) ${sp.answer}`).join('\n');
                }
                return partText;
              }).join('\n\n') || q.stemAnswer || '',
              options: [],
              correctAnswer: -1
            });
          } else {
            const rawOptions = (q.options || []) as string[];
            const cleanedOptions = rawOptions.map(opt =>
              typeof opt === 'string' ? opt.replace(/^(?:\(?[A-Da-d]\)?[.):-]?)\s+/, '').trim() : opt
            );
            let cAns = -1;
            if (typeof q.correctAnswer === 'number') {
              cAns = q.correctAnswer;
            } else if (typeof q.correctAnswer === 'string') {
              const stripped = q.correctAnswer.replace(/^(?:\(?[A-Da-d]\)?[.):-]?)\s+/, '').trim().toLowerCase();
              const foundIdx = cleanedOptions.findIndex(o => o.toLowerCase() === stripped);
              if (foundIdx !== -1) {
                cAns = foundIdx;
              } else if (q.options) {
                cAns = q.options.indexOf(q.correctAnswer);
              }
            }
            formattedQuestions.push({
              id: `q-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
              type: 'MCQ',
              question: q.question || '',
              options: cleanedOptions,
              correctAnswer: cAns,
              explanation: q.explanation || '',
            });
          }
        }
      }

      if (formattedQuestions.length === 0) {
        throw new Error('No questions could be generated. Please refine your instruction prompt and try again.');
      }

      if (data.warnings && data.warnings.length > 0) {
        addToast({ type: 'warning', title: 'AI Warnings', description: data.warnings.join(' ') });
      }

      if (subjectId) {
        setMockSubjectData(prev => ({
          ...prev,
          [subjectId]: { ...prev[subjectId], questions: formattedQuestions }
        }));
      } else {
        setParsedQuestions(formattedQuestions);
      }
      setGeneratedQuestions(formattedQuestions);
      addToast({ type: 'success', title: 'Questions Ready', description: `Successfully generated ${formattedQuestions.length} questions.` });
    } catch (error: any) {
      console.error('Question Generation Error:', error);
      const isTimeout = error?.name === 'AbortError' || String(error).includes('timeout');
      const errorMsg = isTimeout 
        ? 'Question generation timed out. Please try again with fewer questions or a simpler topic.' 
        : (error?.message || 'Failed to generate questions. Please verify your connection and server configuration.');
      addToast({ 
        type: 'error', 
        title: 'Generation Failed', 
        description: errorMsg 
      });
    } finally {
      setGeneratingAI(false);
    }
  };

  const handleSetupAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    try {
      const programme = programmes.find(p => p.id === setupData.programmeId);
      const selectedSubjectsNames = allSubjects.filter(s => setupData.subjectIds.includes(s.id)).map(s => s.name);
      
      let finalQuestions: QuizQuestion[] = [];
      if (setupData.frequency === 'Mock') {
        setupData.subjectIds.forEach((sid: string) => {
          if (mockSubjectData[sid]?.questions) {
            finalQuestions = [...finalQuestions, ...mockSubjectData[sid].questions];
          }
        });
      } else {
        finalQuestions = parsedQuestions.length > 0 ? parsedQuestions : generatedQuestions;
      }
      
      if (finalQuestions.length === 0) {
        addToast({ 
          type: 'error', 
          title: 'No Questions', 
          description: 'Please add or generate questions for each subject before publishing.' 
        });
        setIsSaving(false);
        return;
      }

      // Essay Marks Validation
      const essayCount = finalQuestions.filter(q => q.type === 'Essay').length;
      const totalEssayMarks = setupData.essayMarksPerQuestion || 20;

      if (!setupData.startTime || !setupData.endTime) {
        addToast({ 
          type: 'error', 
          title: 'Missing Window', 
          description: 'Please select both a Start and End Window for this assessment.' 
        });
        setIsSaving(false);
        return;
      }

      const examId = editingExamId || `cbt-${Date.now()}`;

      const examData: CBTExam = {
        id: examId,
        title: `${programme?.name || 'CBT'} - ${setupData.frequency === 'General' ? 'CBT' : setupData.frequency} Assessment`,
        subjects: selectedSubjectsNames,
        topic: setupData.topic,
        questionCount: finalQuestions.length,
        durationMinutes: setupData.hasDuration ? setupData.duration : 0,
        targetExam: programme?.category || 'Standard',
        attemptsCount: exams.find(e => e.id === examId)?.attemptsCount || 0,
        averageScore: exams.find(e => e.id === examId)?.averageScore || 0,
        status: 'Live',
        questions: finalQuestions,
        frequency: setupData.frequency,
        isClasswork: setupData.isClasswork,
        isAssignment: setupData.isAssignment,
        department: setupData.department,
        mode: setupData.mode,
        startTime: setupData.startTime,
        endTime: setupData.endTime,
        createdAt: editingExamId ? (exams.find(e => e.id === editingExamId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
        tutorId: setupData.frequency === 'Mock' ? '' : setupData.tutorId,
        tutorName: setupData.frequency === 'Mock' ? '' : tutors.find(t => t.id === setupData.tutorId)?.name || '',
        scorePerQuestion: setupData.scorePerQuestion,
        essayMarksPerQuestion: setupData.essayMarksPerQuestion,
        essayTotalMarks: (setupData.mode === 'Essay' || setupData.mode === 'Both') ? totalEssayMarks : 0,
      };

      const examPayload = JSON.parse(JSON.stringify(examData)) as Record<string, any>;
      if (activeCentreId) examPayload.centreId = activeCentreId;
      await setDoc(doc(db, 'cbt_exams', examId), examPayload);
      addToast({ 
        type: 'success', 
        title: editingExamId ? 'Assessment Updated' : 'Assessment Published', 
        description: editingExamId ? 'Changes saved successfully.' : 'Added to live assessments list.' 
      });
      setShowSetupModal(false);
      setEditingExamId(null);
    } catch (err) {
      handleFirestoreError(err, editingExamId ? OperationType.UPDATE : OperationType.CREATE, `cbt_exams/${editingExamId || 'new'}`);
      addToast({ type: 'error', title: 'Save Failed', description: 'Database synchronization error.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenSetup = () => {
    setEditingExamId(null);
    setSetupData({
      frequency: activeFrequency,
      programmeId: '',
      subjectIds: [],
      topic: '',
      isClasswork: false,
      isAssignment: false,
      mode: 'MCQ',
      department: 'All',
      tutorId: '',
      hasDuration: true,
      duration: 60,
      startTime: '',
      endTime: '',
      questionInputMode: 'Paste',
      scorePerQuestion: 1,
      essayMarksPerQuestion: 20,
      questionCount: 10,
    });
    setPastedText('');
    setParsedQuestions([]);
    setGeneratedQuestions([]);
    setMockSubjectData({});
    setActiveMockSubjectId('');
    setShowSetupModal(true);
  };

  const handleOpenEdit = (exam: CBTExam) => {
    const prog = programmes.find(p => p.name === exam.title.split(' - ')[0]);
    const subIds = allSubjects.filter(s => exam.subjects.includes(s.name)).map(s => s.id);
    
    setEditingExamId(exam.id);
    setSetupData({
      frequency: ((exam.frequency as string) === 'Daily' || (exam.frequency as string) === 'Weekly' || exam.frequency === 'General') ? 'General' : 'Mock',
      programmeId: prog?.id || '',
      subjectIds: subIds,
      topic: exam.topic || '',
      isClasswork: !!exam.isClasswork,
      isAssignment: !!exam.isAssignment,
      mode: exam.mode,
      department: exam.department as any,
      tutorId: exam.tutorId || '',
      hasDuration: exam.durationMinutes > 0,
      duration: exam.durationMinutes || 60,
      startTime: exam.startTime || '',
      endTime: exam.endTime || '',
      questionInputMode: 'Paste',
      scorePerQuestion: exam.scorePerQuestion || 1,
      essayMarksPerQuestion: exam.essayMarksPerQuestion || 20,
      essayTotalMarks: exam.essayTotalMarks || (exam.questions.filter(q => !q.options || q.options.length === 0).length * (exam.scorePerQuestion || 1)),
      questionCount: exam.questions?.length || exam.questionCount || 10,
    });
    
    if (exam.frequency === 'Mock') {
      // For editing a mock, we don't know which questions belong to which subject easily
      // Populate first subject with all questions for now
      const firstSubId = subIds[0] || '';
      if (firstSubId) {
        setMockSubjectData({
          [firstSubId]: { pastedText: '', questions: exam.questions }
        });
        setActiveMockSubjectId(firstSubId);
      }
    } else {
      // Reconstruct pasted text if questions exist
      if (exam.questions.length > 0) {
        const text = exam.questions.map(q => {
          if (exam.mode === 'MCQ') {
            return `Q: ${q.question}\n${q.options.map((o, i) => `${String.fromCharCode(65+i)}: ${o}`).join('\n')}\nAnswer: ${String.fromCharCode(65+q.correctAnswer)}\nExplanation: ${q.explanation}`;
          } else {
            return `Q: ${q.question}\nExplanation: ${q.explanation}`;
          }
        }).join('\n\n');
        setPastedText(text);
        setParsedQuestions(exam.questions);
      }
    }
    
    setShowSetupModal(true);
  };

  return (
    <div id="cbt-management-page" className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto relative">
      {/* Global Settings Trigger - Top Right Corner */}
      {!showArchive && (
        <div className="absolute top-4 right-4 sm:top-8 sm:right-8 z-10">
          <button
            onClick={() => setShowGlobalGradingModal(true)}
            className="p-3 text-slate-400 hover:text-[#EA580C] hover:bg-orange-50 bg-white border border-slate-200 rounded-2xl shadow-sm transition-all group"
            title="Global Mock Grading Settings"
          >
            <Settings className="w-5 h-5 group-hover:rotate-90 transition-transform duration-500" />
          </button>
        </div>
      )}

      {/* Header Row */}
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              CBT Practice
            </h2>
            <p className="text-xs text-slate-500 mt-1">Configure automated assessments & simulations</p>
          </div>
        </div>

        {!showArchive && (
          <div className="flex items-center justify-between gap-4">
            <button
              onClick={handleOpenSetup}
              className="px-4 py-2.5 text-xs font-bold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-xl shadow-sm transition-all flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Set up Assessment</span>
            </button>
            <button
              onClick={() => setShowArchive(!showArchive)}
              className={`px-4 py-2.5 text-xs font-bold rounded-xl shadow-sm transition-all flex items-center space-x-2 border ml-auto ${
                showArchive 
                  ? 'bg-slate-900 text-white border-slate-900' 
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>{showArchive ? 'Back to Current' : 'Archive'}</span>
            </button>
          </div>
        )}
        {showArchive && (
          <div className="flex items-center justify-end">
            <button
              onClick={() => setShowArchive(false)}
              className="px-4 py-2.5 text-xs font-bold rounded-xl shadow-sm transition-all flex items-center space-x-2 border bg-slate-900 text-white border-slate-900"
            >
              <BookOpen className="w-4 h-4" />
              <span>Back to Current</span>
            </button>
          </div>
        )}
      </div>

      {/* KPI Cards - Hidden in Archive */}
      {!showArchive && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center sm:space-x-5">
            <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-orange-50 text-[#EA580C] flex items-center justify-center shrink-0 mb-2 sm:mb-0">
              <BookOpen className="w-5 h-5 sm:w-7 sm:h-7" />
            </div>
            <div>
              <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider block">Question Bank</span>
              <div className="flex items-baseline space-x-1">
                <span className="text-xl sm:text-3xl font-black text-slate-900">{totalQuestions.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center sm:space-x-5">
            <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mb-2 sm:mb-0">
              <Laptop className="w-5 h-5 sm:w-7 sm:h-7" />
            </div>
            <div>
              <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider block">Subject Run</span>
              <div className="flex items-baseline space-x-1">
                <span className="text-xl sm:text-3xl font-black text-slate-900">{totalAttempts.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Unified Filter Component */}
      <div className="bg-white p-4 md:p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-4">
        <div className="flex items-center space-x-3 mb-1">
           <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center">
              <Filter className="w-4 h-4 text-[#EA580C]" />
           </div>
           <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest leading-none">
             {showArchive ? 'Assessment & Archive Filters' : 'Assessment Filters'}
           </h3>
        </div>

        <div className={`grid gap-3 md:gap-4 ${showArchive ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2'}`}>
          <ModernSelect
            value={programmeTypeFilter}
            onChange={(val) => setProgrammeTypeFilter(val)}
            options={[
              { value: 'All', label: 'All Exam Programs' },
              { value: 'JAMB', label: 'JAMB / UTME' },
              { value: 'WAEC', label: 'WAEC / WASSCE' },
              { value: 'NECO', label: 'NECO SSCE' },
              { value: 'A-Levels', label: 'Cambridge A-Levels' },
            ]}
          />

          <ModernSelect
            value={subjectFilter}
            onChange={(val) => setSubjectFilter(val)}
            options={[
              { value: 'All', label: 'All Subjects' },
              ...allSubjects.map(sub => ({ value: sub.name, label: sub.name }))
            ]}
          />

          {showArchive && (
            <>
              <ModernSelect
                value={selectedWeek}
                onChange={(val) => setSelectedWeek(val)}
                options={[
                  { value: 'all', label: 'All Calendar Dates' },
                  ...weeks.map(w => ({ value: w, label: `Week: ${w}` }))
                ]}
              />

              <ModernSelect
                value={tutorFilter}
                onChange={(val) => setTutorFilter(val)}
                options={[
                  { value: 'All', label: 'All Tutors' },
                  ...tutors.map(t => ({ value: t.id, label: t.name }))
                ]}
              />
            </>
          )}
        </div>
      </div>

      {/* Frequency Toggle Switch - Moved below the main filter card */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center space-x-1 bg-slate-100 p-1.5 rounded-2xl w-fit mx-auto shadow-inner border border-slate-200">
          {(['General', 'Mock'] as const).map((freq) => (
            <button
              key={freq}
              onClick={() => setActiveFrequency(freq)}
              className={`px-8 py-2.5 text-[11px] font-black rounded-xl transition-all ${
                activeFrequency === freq
                  ? 'bg-white text-[#EA580C] shadow-md scale-105 ring-1 ring-slate-200'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {freq === 'General' ? 'CBT Assessment' : 'CBT Mock'}
            </button>
          ))}
        </div>

        {showArchive && (
          <div className="px-6 py-2.5 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 w-fit mx-auto shadow-xl ring-4 ring-slate-100">
             <BookOpen className="w-4 h-4 text-orange-400" />
             Archive View: Past {activeFrequency === 'General' ? 'CBT' : 'CBT Mock'} Assessments
          </div>
        )}
      </div>

      {/* Exam Modules Grid */}
      <div className="space-y-8">
        {(() => {
          const sortedExams = [...filteredExams].sort((a, b) => {
            const tA = a.startTime ? new Date(a.startTime).getTime() : 0;
            const tB = b.startTime ? new Date(b.startTime).getTime() : 0;
            
            const isTodayA = new Date(tA).toDateString() === currentTime.toDateString();
            const isTodayB = new Date(tB).toDateString() === currentTime.toDateString();

            // 1. Today's assessments always first
            if (isTodayA && !isTodayB) return -1;
            if (!isTodayA && isTodayB) return 1;

            // 2. For future assessments OR if both are today, differentiate by creation date as requested
            const createA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const createB = b.createdAt ? new Date(b.createdAt).getTime() : 0;

            if (!isTodayA && !isTodayB) {
              // Future ones: sort by creation date (newest first)
              return createB - createA;
            }

            // Both today: sort by start time, then creation date
            if (tA !== tB) return tA - tB;
            return createB - createA;
          });

          const ADMIN_ARCHIVE_PAGE_SIZE = 20;
          const totalArchivePages = Math.max(1, Math.ceil(sortedExams.length / ADMIN_ARCHIVE_PAGE_SIZE));
          const displayedExams = showArchive
            ? sortedExams.slice((archivePage - 1) * ADMIN_ARCHIVE_PAGE_SIZE, archivePage * ADMIN_ARCHIVE_PAGE_SIZE)
            : sortedExams;

          let lastTime: number | null = null;

          return (
            <>
              {displayedExams.map((exam, idx) => {
            const examStart = exam.startTime ? new Date(exam.startTime) : new Date(0);
            const examEnd = exam.endTime ? new Date(exam.endTime) : new Date(9999, 11, 31);
            const isPast = currentTime > examEnd;
            const startTimeMs = examStart.getTime();
            const showSeparator = !showArchive && lastTime !== null && (startTimeMs - lastTime) > (6 * 60 * 60 * 1000);
            lastTime = startTimeMs;

            return (
              <React.Fragment key={exam.id}>
                {showSeparator && (
                  <div className="flex items-center space-x-4 py-4">
                    <div className="h-px bg-slate-200 flex-1" />
                    {(() => {
                      const diffMs = startTimeMs - currentTime.getTime();
                      const d = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                      const h = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                      const m = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                      const countdown = d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
                      
                      return (
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-4 py-1.5 bg-slate-50 rounded-full border border-slate-100">
                          Next Window Starts in {countdown}
                        </span>
                      );
                    })()}
                    <div className="h-px bg-slate-200 flex-1" />
                  </div>
                )}
                
                <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between space-y-4 group relative overflow-hidden">
                  {(() => {
                    const isPast = currentTime > examEnd;
                    const isLive = currentTime >= examStart && !isPast;
                    const isToday = examStart.toDateString() === currentTime.toDateString();
                    const isStartingSoon = !isLive && !isPast && isToday;
                    
                    const mappedFreqLabel = (exam.frequency === 'General' || exam.frequency as any === 'Daily' || exam.frequency as any === 'Weekly') ? 'CBT' : 'CBT Mock';
                    
                    return (
                      <>
                        {/* Status Tag Top Left */}
                        <div className={`absolute top-0 left-0 px-3 py-1 text-[8px] font-black uppercase tracking-widest ${
                          isPast ? 'bg-slate-500 text-white' : 
                          isLive ? 'bg-emerald-600 text-white' : 
                          isStartingSoon ? 'bg-orange-500 text-white animate-pulse' :
                          'bg-blue-600 text-white'
                        }`}>
                          {isPast ? 'Finished' : isLive ? 'Live' : isStartingSoon ? 'Starts Today' : 'Upcoming'}
                        </div>

                        {/* Top Right Tip - Start Time or Created Date (Deep Grey Color) */}
                        <div className="absolute top-0 right-0 px-3 py-1 bg-slate-700 text-white text-[8px] font-black uppercase tracking-widest flex items-center gap-1 border-b border-l border-slate-600">
                          <Clock className="w-2.5 h-2.5 text-orange-400" />
                          {isPast 
                            ? <span>Created: <span className="text-orange-300">{exam.createdAt ? new Date(exam.createdAt).toLocaleDateString() : 'N/A'}</span></span>
                            : !isToday && !isLive
                              ? <span>Starts: <span className="text-orange-300">{examStart.toLocaleDateString([], { day: '2-digit', month: '2-digit' })} {examStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span></span>
                              : isLive
                                ? <span>Live Since: <span className="text-orange-300">{examStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span></span>
                                : <span>Starts: <span className="text-orange-300">{examStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span></span>
                          }
                        </div>
                      </>
                    );
                  })()}

                  <div>
                    <div className="flex items-center justify-between">
                      <span className="px-3 py-1 rounded-lg text-[10px] font-black bg-slate-50 text-slate-600 border border-slate-200 uppercase tracking-tighter">
                        {exam.targetExam}
                      </span>

                      <div className="flex items-center space-x-1.5 text-xs text-slate-500 font-bold">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{exam.durationMinutes} MINS</span>
                      </div>
                    </div>

                    <div className="mt-3 space-y-1">
                      <h3 className="font-black text-slate-900 text-lg group-hover:text-[#EA580C] transition-colors leading-tight">
                        {exam.title.replace(/General Assessment/g, 'CBT Assessment').replace(/General/g, 'CBT')}
                      </h3>
                      {exam.topic && (
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight flex items-center gap-1">
                          <FileText className="w-3 h-3 text-orange-500" />
                          Topic: {exam.topic}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      {exam.subjects.map((sub, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 rounded-md bg-orange-50/50 text-[#EA580C] text-[11px] font-bold border border-orange-100"
                        >
                          {sub}
                        </span>
                      ))}
                      {exam.isClasswork && (
                        <span className="px-2.5 py-1 rounded-md bg-purple-50 text-purple-600 text-[10px] font-black border border-purple-100 uppercase tracking-tighter">
                          Classwork
                        </span>
                      )}
                      {exam.isAssignment && (
                        <span className="px-2.5 py-1 rounded-md bg-blue-50 text-blue-600 text-[10px] font-black border border-blue-100 uppercase tracking-tighter">
                          Assignment
                        </span>
                      )}
                    </div>
                    {(() => {
                      const tutor = tutors.find(t => t.id === exam.tutorId);
                      if (!tutor) return null;
                      return (
                        <div className="flex items-center gap-1.5 mt-3 text-[10px] font-bold text-slate-400">
                          <Users className="w-3.5 h-3.5 text-slate-400" />
                          <span className="uppercase tracking-tight">Tutor: {tutor.name}</span>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="pt-5 border-t border-slate-100 flex items-center justify-between relative">
                    <div className="flex items-center space-x-4">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Attempts</span>
                        <span className="text-sm font-black text-slate-700">
                           {results.filter(r => r.examId === exam.id).length}
                        </span>
                      </div>
                    </div>

                    {/* Mode Tag at Bottom - Q Count ONLY (Mode differentiated in Performance) */}
                    <div className="absolute left-1/2 -translate-x-1/2 -bottom-6 px-4 py-2 bg-slate-50 text-slate-600 text-[9px] font-black uppercase tracking-[0.2em] rounded-b-md border-x border-b border-slate-100 shadow-sm flex items-center gap-2 whitespace-nowrap">
                      <span className="text-[#EA580C]">{exam.questions?.length || exam.questionCount || 0} Qs</span>
                    </div>

                    <div className="flex items-center space-x-2">
                      {!showArchive && !isPast && (
                        <button
                          onClick={() => handleOpenEdit(exam)}
                          className="p-2 text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-all"
                          title="Edit Assessment"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => setShowAnalyticsModal(exam)}
                        className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                        title="View Analytics"
                      >
                        <BarChart2 className="w-4 h-4" />
                      </button>
                      
                      {(() => {
                        const isExpired = currentTime > examEnd;
                        
                        return (
                            <button
                              onClick={() => handleStartExam(exam)}
                              className="px-5 py-2.5 text-xs font-black text-white rounded-xl shadow-lg transition-all flex items-center space-x-2 bg-slate-900 hover:bg-slate-800"
                            >
                              <span className="leading-none">
                                Review
                              </span>
                              <ChevronRight className="w-3.5 h-3.5 text-orange-400" />
                            </button>
                        );
                      })()}
                    </div>

                    {/*Mode Tag removed*/}
                  </div>
                </div>
              </React.Fragment>
            );
          })}

          {showArchive && totalArchivePages > 1 && (
            <div className="flex items-center justify-between pt-6 pb-2 text-xs">
              <button
                onClick={() => setArchivePage(p => Math.max(1, p - 1))}
                disabled={archivePage === 1}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Previous
              </button>
              <span className="text-xs font-bold text-slate-500">
                Page {archivePage} of {totalArchivePages} ({sortedExams.length} assessments)
              </span>
              <button
                onClick={() => setArchivePage(p => Math.min(totalArchivePages, p + 1))}
                disabled={archivePage === totalArchivePages}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Next
              </button>
            </div>
          )}
        </>
      );
    })()}
      </div>

      {/* Analytics Modal */}
      {showAnalyticsModal && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[32px] max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-slate-900 p-6 text-white relative">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md">
                  <BarChart2 className="w-6 h-6 text-orange-400" />
                </div>
                <div>
                  <h3 className="font-black text-xl tracking-tight leading-tight uppercase">Performance Insights</h3>
                  <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest">{showAnalyticsModal.title}</p>
                </div>
              </div>
              <button
                onClick={() => setShowAnalyticsModal(null)}
                className="absolute top-6 right-6 text-white/40 hover:text-white p-2 hover:bg-white/10 rounded-xl transition-all"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-8 space-y-8 max-h-[75vh] overflow-y-auto scrollbar-thin">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100 shadow-inner">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-1">Attempt Count</span>
                  <span className="text-3xl font-black text-slate-900 tracking-tighter">
                    {results.filter(r => r.examId === showAnalyticsModal.id).length}
                  </span>
                </div>
                <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100 shadow-inner">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-1">Average Acc.</span>
                  <span className="text-3xl font-black text-emerald-600 tracking-tighter">
                    {(() => {
                      const examResults = results.filter(r => r.examId === showAnalyticsModal.id);
                      return examResults.length > 0 
                        ? Math.round(examResults.reduce((acc, curr) => acc + curr.averagePercent, 0) / examResults.length) 
                        : 0;
                    })()}%
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-black text-slate-900 text-[10px] uppercase tracking-[0.2em] flex items-center gap-2">
                   <div className="w-2 h-2 rounded-full bg-blue-500" />
                   Class Performance Stats
                </h4>
                <div className="space-y-4">
                  {(() => {
                    const examResults = results.filter(r => r.examId === showAnalyticsModal.id).sort((a, b) => b.totalScore - a.totalScore);
                    const avgAccuracy = examResults.length > 0 
                      ? Math.round(examResults.reduce((acc, curr) => acc + curr.averagePercent, 0) / examResults.length) 
                      : 0;
                    
                    const deptStudents = students.filter(s => s.department === showAnalyticsModal.department || showAnalyticsModal.department === 'All');
                    const completionRate = deptStudents.length > 0 
                      ? Math.round((examResults.length / deptStudents.length) * 100) 
                      : (examResults.length > 0 ? 100 : 0);

                    return (
                      <>
                        {[
                          { label: 'Completion Rate', value: Math.min(100, completionRate), color: 'bg-blue-600', sub: `${examResults.length} / ${deptStudents.length} Students` },
                          { label: 'Avg Accuracy', value: avgAccuracy, color: 'bg-emerald-500', sub: `${avgAccuracy}% across all attempts` },
                          { label: 'Total Target', value: 100, color: 'bg-orange-500', sub: `${deptStudents.length} Students Enrolled` }
                        ].map((stat, i) => (
                          <div key={i} className="space-y-2">
                            <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-slate-500">
                              <span>{stat.label}</span>
                              <span>{stat.sub}</span>
                            </div>
                            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                              <div 
                                className={`h-full ${stat.color} transition-all duration-1000 ease-out shadow-sm`} 
                                style={{ width: `${stat.value}%` }}
                              />
                            </div>
                          </div>
                        ))}

                        <div className="mt-10 space-y-5">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                            <h4 className="font-black text-slate-900 text-[11px] uppercase tracking-[0.1em] flex items-center gap-2">
                               <Users className="w-4 h-4 text-[#EA580C]" />
                               Live Student Attempt Record
                            </h4>
                            <div className="flex items-center gap-2">
                               <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                               <span className="text-[9px] font-black text-slate-400 uppercase">
                                  {examResults.length} SYNCED RECORDS
                               </span>
                            </div>
                          </div>
                          
                          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
                            <table className="w-full text-left text-[11px]">
                              <thead className="bg-slate-50 text-slate-500 font-black uppercase tracking-widest border-b border-slate-100">
                                <tr>
                                  <th className="px-5 py-4">Student Name</th>
                                  <th className="px-5 py-4 text-center">Submission Date</th>
                                  <th className="px-5 py-4 text-right">Score / Acc.</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {examResults.length === 0 ? (
                                  <tr>
                                    <td colSpan={3} className="px-5 py-16 text-center text-slate-400 font-medium italic">
                                      <div className="flex flex-col items-center gap-2 opacity-50">
                                         <HelpCircle className="w-8 h-8" />
                                         <span>Gathering participation data...</span>
                                         <span className="text-[10px] uppercase font-black tracking-widest mt-1">Check database for exam ID: {showAnalyticsModal.id}</span>
                                      </div>
                                    </td>
                                  </tr>
                                ) : (
                                  examResults.map((res, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                                      <td className="px-5 py-4">
                                        <div className="flex flex-col">
                                          <span className="font-black text-slate-900 group-hover:text-[#EA580C] transition-colors">{res.studentName}</span>
                                          <span className="text-[9px] text-slate-400 font-bold uppercase">{res.programmeName}</span>
                                        </div>
                                      </td>
                                      <td className="px-5 py-4 text-center text-slate-500 font-bold font-mono">
                                        {res.date || 'Today'}
                                      </td>
                                      <td className="px-5 py-4 text-right">
                                        <div className="flex flex-col items-end">
                                          <span className="text-sm font-black text-slate-900">{res.totalScore}</span>
                                          <span className={`text-[9px] font-black uppercase ${res.averagePercent >= 50 ? 'text-emerald-600' : 'text-rose-500'}`}>{res.averagePercent}%</span>
                                        </div>
                                      </td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100">
                 <button
                   onClick={() => setShowAnalyticsModal(null)}
                   className="w-full py-5 bg-slate-950 text-white font-black uppercase tracking-[0.2em] rounded-2xl hover:bg-black transition-all shadow-xl active:scale-[0.98] text-[10px]"
                 >
                   Return to Dashboard
                 </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assessment Setup Modal */}
      {showSetupModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-5xl w-full shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 overflow-hidden flex flex-col h-[90vh] max-h-[90vh]">
            <div className="bg-[#EA580C] p-5 md:p-6 text-white relative shrink-0">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-black text-lg md:text-xl tracking-tight leading-tight">{editingExamId ? 'Edit Assessment' : 'Assessment Setup'}</h3>
                  <p className="text-white/80 text-[10px] md:text-xs font-medium">Configure real-time academic assessments</p>
                </div>
              </div>
              <button
                onClick={() => setShowSetupModal(false)}
                className="absolute top-1/2 -translate-y-1/2 right-6 text-white/60 hover:text-white p-1"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scroll-smooth">
              <form id="assessmentSetupForm" onSubmit={handleSetupAssessment} className="p-5 md:p-8 space-y-6 md:space-y-8 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 md:gap-6">
                    <ModernSelect
                      label="Assessment Type"
                      value={setupData.frequency}
                      onChange={(val) => setSetupData({...setupData, frequency: val})}
                      options={[
                        { value: 'General', label: 'CBT Assessment' },
                        { value: 'Mock', label: 'Mock Examination' }
                      ]}
                    />

                    <ModernSelect
                      label="Exam Programme"
                      value={setupData.programmeId}
                      onChange={(val) => setSetupData({...setupData, programmeId: val})}
                      options={[
                        { value: '', label: 'Select Programme...' },
                        ...programmes.map(p => ({ value: p.id, label: p.name }))
                      ]}
                    />

                    <ModernSelect
                      label="Department"
                      value={setupData.department}
                      onChange={(val) => setSetupData({...setupData, department: val})}
                      options={[
                        { value: 'All', label: 'All Departments' },
                        { value: 'Science', label: 'Science' },
                        { value: 'Commercial', label: 'Commercial' },
                        { value: 'Arts', label: 'Arts' }
                      ]}
                    />

                    <div>
                      <label className="block font-black text-slate-700 uppercase tracking-widest mb-1.5">Subject(s)</label>
                      {setupData.frequency === 'Mock' ? (
                        <div className="space-y-2 max-h-32 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-xl">
                          {allSubjects.map(s => (
                            <label key={s.id} className="flex items-center space-x-2 cursor-pointer p-1 hover:bg-white rounded transition-colors">
                              <input
                                type="checkbox"
                                checked={setupData.subjectIds.includes(s.id)}
                                onChange={(e) => {
                                  const ids = e.target.checked 
                                    ? [...setupData.subjectIds, s.id]
                                    : setupData.subjectIds.filter(id => id !== s.id);
                                  setSetupData({...setupData, subjectIds: ids});
                                }}
                                className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                              />
                              <span className="font-bold text-slate-700">{s.name}</span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <ModernSelect
                          value={setupData.subjectIds[0] || ''}
                          onChange={(val) => setSetupData({...setupData, subjectIds: [val]})}
                          options={[
                            { value: '', label: 'Select Subject...' },
                            ...allSubjects.map(s => ({ value: s.id, label: s.name }))
                          ]}
                        />
                      )}
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block font-black text-slate-700 uppercase tracking-widest mb-1.5">Topic / Focus Area</label>
                      <input
                        type="text"
                        value={setupData.topic || ''}
                        onChange={(e) => setSetupData({...setupData, topic: e.target.value})}
                        placeholder="e.g. Calculus, Atomic Structure, etc."
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-medium outline-none focus:bg-white focus:border-orange-500 transition-all"
                      />
                    </div>

                    <div className="flex flex-row items-center gap-4 sm:gap-6 py-2">
                       <label className={`flex items-center space-x-2.5 cursor-pointer group transition-all ${setupData.isAssignment ? 'opacity-40 grayscale' : 'opacity-100'}`}>
                          <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${setupData.isClasswork ? 'bg-orange-500 border-orange-500 shadow-md scale-110' : 'border-slate-300 group-hover:border-orange-400'}`}>
                             {setupData.isClasswork && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                          </div>
                          <input 
                            type="checkbox" 
                            className="hidden" 
                            disabled={setupData.isAssignment}
                            checked={setupData.isClasswork}
                            onChange={(e) => setSetupData({...setupData, isClasswork: e.target.checked, isAssignment: false})}
                          />
                          <span className="font-black text-slate-700 uppercase tracking-widest text-[9px]">Classwork</span>
                       </label>

                       <label className={`flex items-center space-x-2.5 cursor-pointer group transition-all ${setupData.isClasswork ? 'opacity-40 grayscale' : 'opacity-100'}`}>
                          <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${setupData.isAssignment ? 'bg-blue-600 border-blue-600 shadow-md scale-110' : 'border-slate-300 group-hover:border-blue-400'}`}>
                             {setupData.isAssignment && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                          </div>
                          <input 
                            type="checkbox" 
                            className="hidden" 
                            disabled={setupData.isClasswork}
                            checked={setupData.isAssignment}
                            onChange={(e) => setSetupData({...setupData, isAssignment: e.target.checked, isClasswork: false})}
                          />
                          <span className="font-black text-slate-700 uppercase tracking-widest text-[9px]">Assignment</span>
                       </label>
                    </div>

                    {setupData.frequency !== 'Mock' && (
                      <ModernSelect
                        label="Tutor (Optional)"
                        value={setupData.tutorId}
                        onChange={(val) => setSetupData({...setupData, tutorId: val})}
                        options={[
                          { value: '', label: 'No specific tutor' },
                          ...tutors.map(t => ({ value: t.id, label: t.name }))
                        ]}
                      />
                    )}

                    <div className="sm:col-span-2 space-y-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <ModernSelect
                          label="Duration Type"
                          value={setupData.hasDuration ? 'yes' : 'no'}
                          onChange={(val) => setSetupData({...setupData, hasDuration: val === 'yes'})}
                          options={[
                            { value: 'yes', label: 'Fixed Duration' },
                            { value: 'no', label: 'No Duration (No Time Limit)' }
                          ]}
                        />
                        {setupData.hasDuration && (
                          <ModernSelect
                            label="Minutes"
                            value={setupData.duration}
                            onChange={(val) => setSetupData({...setupData, duration: val})}
                            options={[15, 30, 45, 60, 90, 120, 150, 180].map(m => ({ value: m, label: `${m} Minutes` }))}
                          />
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div className="flex flex-col relative group">
                            <label className="block font-black text-slate-700 uppercase tracking-widest mb-1.5 text-[10px]">Start Window</label>
                            <div className="relative flex items-center group/input">
                              <input
                                id="start-window-input"
                                type="datetime-local"
                                value={setupData.startTime || ''}
                                onChange={(e) => setSetupData({...setupData, startTime: e.target.value})}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-medium outline-none focus:bg-white focus:border-orange-500 transition-all text-[10px] pr-16"
                              />
                              <button
                                type="button"
                                onClick={() => (document.activeElement as HTMLElement)?.blur()}
                                className="absolute right-1 top-1/2 -translate-y-1/2 px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all flex items-center gap-1 shadow-lg active:scale-95 z-20 border border-emerald-500"
                                title="Confirm Time"
                              >
                                <span className="text-[10px] font-black uppercase tracking-tighter">ok</span>
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            {!setupData.startTime && (
                              <span className="absolute left-4 top-[38px] text-slate-400 font-bold text-[9px] pointer-events-none sm:hidden">
                                DD/MM/YYYY HH:MM
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col relative group">
                            <label className="block font-black text-slate-700 uppercase tracking-widest mb-1.5 text-[10px]">End Window</label>
                            <div className="relative flex items-center group/input">
                              <input
                                id="end-window-input"
                                type="datetime-local"
                                value={setupData.endTime || ''}
                                onChange={(e) => setSetupData({...setupData, endTime: e.target.value})}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-medium outline-none focus:bg-white focus:border-orange-500 transition-all text-[10px] pr-16"
                              />
                              <button
                                type="button"
                                onClick={() => (document.activeElement as HTMLElement)?.blur()}
                                className="absolute right-1 top-1/2 -translate-y-1/2 px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all flex items-center gap-1 shadow-lg active:scale-95 z-20 border border-emerald-500"
                                title="Confirm Time"
                              >
                                <span className="text-[10px] font-black uppercase tracking-tighter">ok</span>
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            {!setupData.endTime && (
                              <span className="absolute left-4 top-[38px] text-slate-400 font-bold text-[9px] pointer-events-none sm:hidden">
                                DD/MM/YYYY HH:MM
                              </span>
                            )}
                          </div>
                      </div>

                      <div className="space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          {setupData.mode !== 'Essay' && (setupData.frequency === 'General' || (setupData as any).frequency === 'Daily' || (setupData as any).frequency === 'Weekly') && (
                            <ModernSelect
                              label={setupData.mode === 'Both' ? "Points / MCQ Question" : "Score Grading"}
                              value={setupData.scorePerQuestion}
                              onChange={(val) => setSetupData({...setupData, scorePerQuestion: val})}
                              options={[
                                { value: 1, label: '1 Point per Question' },
                                { value: 2, label: '2 Points per Question' },
                                { value: 3, label: '3 Points per Question' }
                              ]}
                            />
                          )}
                          {(setupData.mode === 'Essay' || setupData.mode === 'Both') && (
                            <div className="flex flex-col">
                              <label className="block font-black text-slate-700 uppercase tracking-widest mb-1.5 text-[10px]">Total Marks (Essay)</label>
                              <input
                                type="number"
                                value={setupData.essayMarksPerQuestion ?? 20}
                                onChange={(e) => setSetupData({...setupData, essayMarksPerQuestion: parseInt(e.target.value) || 0})}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-medium outline-none focus:bg-white focus:border-orange-500 transition-all text-[10px]"
                              />
                              <p className="text-[9px] text-slate-400 mt-1 italic">Total score awarded to essay assessment. Marks are distributed based on question difficulty.</p>
                            </div>
                          )}
                          <div className="flex flex-col">
                            <label className="block font-black text-slate-700 uppercase tracking-widest mb-1.5 text-[10px]">Number of Questions</label>
                            <input
                              type="number"
                              value={setupData.questionCount ?? 10}
                              onChange={(e) => setSetupData({...setupData, questionCount: parseInt(e.target.value) || 0})}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-medium outline-none focus:bg-white focus:border-orange-500 transition-all text-[10px]"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                </div>

                <div className="space-y-6 pt-6 border-t border-slate-100">
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <label className="block font-black text-slate-700 uppercase tracking-widest mb-1.5 text-[10px]">Assessment Mode</label>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          disabled={parsedQuestions.length > 0}
                          onClick={() => setSetupData({...setupData, mode: 'MCQ'})}
                          className={`py-3 rounded-xl font-black transition-all border text-[10px] uppercase tracking-widest ${setupData.mode === 'MCQ' ? 'bg-orange-50 border-orange-200 text-[#EA580C]' : 'bg-slate-50 border-slate-200 text-slate-400'} ${parsedQuestions.length > 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          MCQ
                        </button>
                        <button
                          type="button"
                          disabled={parsedQuestions.length > 0}
                          onClick={() => setSetupData({...setupData, mode: 'Essay'})}
                          className={`py-3 rounded-xl font-black transition-all border text-[10px] uppercase tracking-widest ${setupData.mode === 'Essay' ? 'bg-orange-50 border-orange-200 text-[#EA580C]' : 'bg-slate-50 border-slate-200 text-slate-400'} ${parsedQuestions.length > 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          ESSAY
                        </button>
                        <button
                          type="button"
                          disabled={parsedQuestions.length > 0}
                          onClick={() => setSetupData({...setupData, mode: 'Both'})}
                          className={`py-3 rounded-xl font-black transition-all border text-[10px] uppercase tracking-widest ${setupData.mode === 'Both' ? 'bg-orange-50 border-orange-200 text-[#EA580C]' : 'bg-slate-50 border-slate-200 text-slate-400'} ${parsedQuestions.length > 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          BOTH
                        </button>
                      </div>
                      {parsedQuestions.length > 0 && (
                        <p className="text-[9px] text-slate-400 mt-1 italic">* Clear questions to change mode</p>
                      )}
                    </div>

                    <div className="space-y-3">
                      <label className="block font-black text-slate-700 uppercase tracking-widest mb-1.5 text-[10px]">Question Acquisition Mode</label>
                    <div className="flex items-center space-x-3">
                      <button
                        type="button"
                        onClick={() => setSetupData({...setupData, questionInputMode: 'Paste'})}
                        className={`flex-1 p-4 rounded-2xl border-2 flex flex-col items-center space-y-2 transition-all ${setupData.questionInputMode === 'Paste' ? 'border-[#EA580C] bg-orange-50 text-[#EA580C]' : 'border-slate-100 bg-slate-50 text-slate-400'}`}
                      >
                        <FileText className="w-6 h-6" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Paste Copied Text</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSetupData({...setupData, questionInputMode: 'AI'})}
                        className={`flex-1 p-4 rounded-2xl border-2 flex flex-col items-center space-y-2 transition-all ${setupData.questionInputMode === 'AI' ? 'border-[#EA580C] bg-orange-50 text-[#EA580C]' : 'border-slate-100 bg-slate-50 text-slate-400'}`}
                      >
                        <Cpu className="w-6 h-6" />
                        <span className="text-[10px] font-black uppercase tracking-widest">AI Generation</span>
                      </button>
                    </div>
                  </div>

                  {setupData.frequency === 'Mock' && setupData.subjectIds.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-6 border-b border-slate-100 pb-4">
                      {setupData.subjectIds.map(sid => {
                        const s = allSubjects.find(sub => sub.id === sid);
                        const hasQuestions = (mockSubjectData[sid]?.questions?.length || 0) > 0;
                        return (
                          <button
                            key={sid}
                            type="button"
                            onClick={() => setActiveMockSubjectId(sid)}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border flex items-center gap-2 ${activeMockSubjectId === sid ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white text-slate-500 border-slate-200'}`}
                          >
                            {s?.name || 'Subject'}
                            {hasQuestions && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="p-5 bg-slate-50 border border-slate-100 rounded-2xl">
                    <div className="flex items-center justify-between mb-4">
                       <label className="font-black text-slate-700 uppercase tracking-widest text-[10px]">
                         {setupData.frequency === 'Mock' && activeMockSubjectId 
                            ? `Setup for ${allSubjects.find(s => s.id === activeMockSubjectId)?.name}` 
                            : (setupData.questionInputMode === 'Paste' ? 'Format Guides & Paste Area' : 'AI Prompt')}
                       </label>
                    </div>

                    {setupData.questionInputMode === 'Paste' ? (
                      <div className="space-y-6">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {(setupData.mode === 'MCQ' || setupData.mode === 'Both') && (
                              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 relative overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const selectedProg = programmes.find(p => p.id === setupData.programmeId);
                                    const selectedSubjectNames = allSubjects.filter(s => setupData.subjectIds.includes(s.id)).map(s => s.name).join(', ') || '[Subject]';
                                    const text = `You are a professional CBT question generator. Generate multiple-choice questions based on the subject, topic, class/level, difficulty, and number of questions I provide.

IMPORTANT: Format every question EXACTLY like this because the output will be imported directly into a CBT question engine:

1. What is the capital of Nigeria?
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
- Use exactly four options: A, B, C, D.
- Use exactly \`A:\`, \`B:\`, \`C:\`, \`D:\`.
- Use \`Answer:\` followed only by the correct letter.
- Always include a brief \`Explanation:\`.
- Number questions sequentially.
- Randomize the correct answer position.
- Ensure there is only one correct answer.
- Do not use tables, bullets, headings, or any extra text.
- Output ONLY the questions in this exact format.

Subject: ${selectedSubjectNames}
Topic: ${setupData.topic || '[Topic]'}
Class/Level: ${selectedProg?.name || '[Programme Category]'}
Number of Questions: ${setupData.questionCount}`;
                                    navigator.clipboard.writeText(text);
                                    addToast({ type: 'success', title: 'Guide Copied', description: 'Dynamic MCQ Prompt copied to clipboard.' });
                                  }}
                                  className="absolute top-2 right-2 p-1.5 bg-slate-100 hover:bg-orange-500 hover:text-white rounded-md transition-all group z-10"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                                <div className="flex items-center justify-between">
                                    <span className="font-black uppercase tracking-widest text-slate-900 flex items-center gap-2 text-[10px]">
                                      <FileText className="w-4 h-4 text-[#EA580C]" />
                                      MCQ AI Prompt Guide
                                    </span>
                                </div>
                                <div className="bg-slate-900 rounded-lg p-4 font-mono text-[10px] text-slate-300 leading-relaxed max-h-72 overflow-y-auto">
                                    You are a professional CBT question generator...<br/><br/>
                                    Subject: {allSubjects.filter(s => setupData.subjectIds.includes(s.id)).map(s => s.name).join(', ') || '[Subject]'}<br/>
                                    Topic: {setupData.topic || '[Topic]'}<br/>
                                    Class/Level: {programmes.find(p => p.id === setupData.programmeId)?.name || '[Programme Category]'}<br/>
                                    Number of Questions: {setupData.questionCount}
                                </div>
                              </div>
                            )}
                            {(setupData.mode === 'Essay' || setupData.mode === 'Both') && (
                              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 relative overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const selectedProg = programmes.find(p => p.id === setupData.programmeId);
                                    const selectedSubjectNames = allSubjects.filter(s => setupData.subjectIds.includes(s.id)).map(s => s.name).join(', ') || '[Subject]';
                                    const text = `You are a professional CBT essay question generator. Generate essay questions based on the subject, topic, class/level, difficulty, and number of questions I provide.

IMPORTANT: Format every question EXACTLY like this because the output will be imported directly into a CBT question engine:

1. Discuss the causes and effects of inflation in an economy.
a. Define inflation.
Answer: Inflation is a persistent increase in the general price level of goods and services over a period of time.
b. State:
i. Two major causes of inflation.
Answer: Excessive money supply and increased production costs.
ii. One effect of inflation on consumers.
Answer: Reduced purchasing power.

RULES:
- Number each main question sequentially: 1., 2., 3., etc.
- Use lowercase letters for sub-questions: a., b., c., etc.
- Use lowercase Roman numerals for sub-points: i., ii., iii., etc.
- Put each answer directly below the corresponding question or sub-question using exactly \`Answer:\`.
- Provide clear, accurate, and educational answers.
- Questions may contain multiple sub-questions and sub-points where appropriate.
- For maths and science, write all numbers, equations, and configurations in LaTeX inside $...$ (for example $2 \\times 3$, $3d^{5} 4s^{1}$, $\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$).
- Do not use tables, bullets, headings, or extra commentary.
- Output ONLY the questions and answers in this exact format.

Subject: ${selectedSubjectNames}
Topic: ${setupData.topic || '[Topic]'}
Class/Level: ${selectedProg?.name || '[Programme Category]'}
Number of Questions: ${setupData.questionCount}`;
                                    navigator.clipboard.writeText(text);
                                    addToast({ type: 'success', title: 'Guide Copied', description: 'Dynamic Essay Prompt copied to clipboard.' });
                                  }}
                                  className="absolute top-2 right-2 p-1.5 bg-slate-100 hover:bg-blue-600 hover:text-white rounded-md transition-all group z-10"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                                <div className="flex items-center justify-between">
                                    <span className="font-black uppercase tracking-widest text-slate-900 flex items-center gap-2 text-[10px]">
                                      <FileText className="w-4 h-4 text-blue-600" />
                                      Essay AI Prompt Guide
                                    </span>
                                </div>
                                <div className="bg-slate-900 rounded-lg p-4 font-mono text-[10px] text-slate-300 leading-relaxed max-h-72 overflow-y-auto">
                                    You are a professional CBT essay question generator...<br/><br/>
                                    1. Discuss inflation...<br/>
                                    a. Define...<br/>
                                    Answer: Inflation is...<br/>
                                    b. State causes...<br/>
                                    Answer: Excessive money supply...<br/><br/>
                                    Subject: {allSubjects.filter(s => setupData.subjectIds.includes(s.id)).map(s => s.name).join(', ') || '[Subject]'}<br/>
                                    Topic: {setupData.topic || '[Topic]'}<br/>
                                    Class/Level: {programmes.find(p => p.id === setupData.programmeId)?.name || '[Programme Category]'}<br/>
                                    Number of Questions: {setupData.questionCount}
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <label className="block font-black text-slate-500 uppercase tracking-widest text-[10px]">Paste Content Below</label>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (setupData.frequency === 'Mock' && activeMockSubjectId) {
                                      setMockSubjectData(prev => ({ ...prev, [activeMockSubjectId]: { pastedText: '', questions: [] } }));
                                    } else {
                                      setPastedText(''); setParsedQuestions([]);
                                    }
                                  }}
                                  className="text-[10px] font-black text-rose-500 uppercase hover:underline"
                                >
                                  Clear All
                                </button>
                            </div>
                            <textarea
                              value={setupData.frequency === 'Mock' && activeMockSubjectId ? (mockSubjectData[activeMockSubjectId]?.pastedText || '') : pastedText}
                              onChange={(e) => {
                                if (setupData.frequency === 'Mock' && activeMockSubjectId) {
                                  setMockSubjectData(prev => ({ ...prev, [activeMockSubjectId]: { ...prev[activeMockSubjectId], pastedText: e.target.value } }));
                                } else {
                                  setPastedText(e.target.value);
                                }
                              }}
                              placeholder="Paste questions here..."
                              className="w-full bg-white border border-slate-200 rounded-xl p-4 text-xs font-medium outline-none focus:border-orange-500 h-48 resize-none"
                            />
                            <button 
                              type="button"
                              onClick={() => {
                                if (setupData.frequency === 'Mock' && activeMockSubjectId) {
                                  parsePastedQuestions(mockSubjectData[activeMockSubjectId]?.pastedText || '', activeMockSubjectId);
                                } else {
                                  parsePastedQuestions(pastedText);
                                }
                              }}
                              className="w-full py-4 bg-slate-900 text-white font-black uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-lg"
                            >
                              <Plus className="w-4 h-4" />
                              Process & Parse Questions
                            </button>
                          </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2 text-orange-600">
                              <Sparkles className="w-4 h-4" />
                              <span className="font-black uppercase tracking-widest text-[10px]">AI Assessment Engine</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleAutoFillPrompt(activeMockSubjectId)}
                              className="px-3 py-1.5 bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all shadow-xs active:scale-95"
                              title="Auto-fill prompt from current setup settings"
                            >
                              <Wand2 className="w-3.5 h-3.5" />
                              <span>Auto-Fill Prompt from Setup</span>
                            </button>
                          </div>
                          
                          <div className="relative">
                            <textarea 
                              value={aiPrompt || ''}
                              onChange={(e) => setAiPrompt(e.target.value)}
                              placeholder="Click 'Auto-Fill Prompt from Setup' above to build structured guidelines from your form, or type your custom guidelines..."
                              className="w-full bg-white border border-slate-200 rounded-xl p-3.5 outline-none focus:border-orange-500 h-36 text-slate-800 text-xs font-mono leading-relaxed"
                            />
                            {aiPrompt && (
                              <button
                                type="button"
                                onClick={() => setAiPrompt('')}
                                className="absolute top-2.5 right-2.5 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-md text-[9px] font-bold uppercase tracking-wider transition-colors"
                                title="Clear prompt"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                          {(() => {
                            const hasGeneratedBefore = setupData.frequency === 'Mock' 
                              ? Boolean(activeMockSubjectId && (mockSubjectData[activeMockSubjectId]?.questions?.length || 0) > 0) 
                              : (parsedQuestions.length > 0 || generatedQuestions.length > 0);
                            return (
                              <button 
                                type="button" 
                                onClick={() => {
                                  if (setupData.frequency === 'Mock' && activeMockSubjectId) {
                                    handleGenerateAIQuestions(activeMockSubjectId);
                                  } else {
                                    handleGenerateAIQuestions();
                                  }
                                }}
                                disabled={generatingAI}
                                className={`w-full py-4 text-white font-black uppercase tracking-widest rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 disabled:opacity-50 ${
                                  hasGeneratedBefore ? 'bg-slate-900 hover:bg-slate-800' : 'bg-orange-500 hover:bg-orange-600'
                                }`}
                              >
                                {generatingAI ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : hasGeneratedBefore ? (
                                  <RefreshCw className="w-4 h-4" />
                                ) : (
                                  <Sparkles className="w-4 h-4" />
                                )}
                                <span>
                                  {generatingAI 
                                    ? (hasGeneratedBefore ? 'Regenerating Questions...' : 'Generating...') 
                                    : (hasGeneratedBefore ? 'Regenerate Questions' : 'Generate & Review Questions')}
                                </span>
                              </button>
                            );
                          })()}
                      </div>
                    )}

                    {(setupData.frequency === 'Mock' ? (mockSubjectData[activeMockSubjectId]?.questions?.length || 0) : parsedQuestions.length) > 0 && (
                      <div className="space-y-4 pt-4 border-t border-slate-100">
                        <div className="flex items-center justify-between">
                            <span className="font-black uppercase tracking-widest text-blue-600 text-[10px] bg-blue-50 px-3 py-1 rounded-full animate-pulse">
                              Ready for Professional Preview ({(setupData.frequency === 'Mock' ? mockSubjectData[activeMockSubjectId]?.questions?.length : parsedQuestions.length)})
                            </span>
                        </div>
                        <div className="grid grid-cols-1 gap-6 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                            {(setupData.frequency === 'Mock' ? mockSubjectData[activeMockSubjectId]?.questions : parsedQuestions).map((q, i) => (
                              <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm transition-all hover:shadow-md space-y-4">
                                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                    <span className="font-black text-blue-600 uppercase tracking-widest text-lg">Question {i + 1}</span>
                                    <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${q.type === 'Essay' ? 'text-blue-600 bg-blue-50' : 'text-emerald-600 bg-emerald-50'}`}>
                                        {q.type || 'MCQ'} Mode
                                    </span>
                                  </div>
                                  
                                  <div className="space-y-4">
                                    {q.type === 'Essay' ? (
                                      <EssayQuestion 
                                        question={q}
                                        mode="preview"
                                        theme="light"
                                        alloc={allocateEssayMarks(setupData.frequency === 'Mock' ? (mockSubjectData[activeMockSubjectId]?.questions || []) : (parsedQuestions.length > 0 ? parsedQuestions : generatedQuestions), (setupData.essayMarksPerQuestion || 20))[i]}
                                      />
                                    ) : (
                                      <>
                                        <MathText text={q.question} className="font-bold text-slate-900 text-base leading-relaxed" />
                                        
                                        {q.options && q.options.length > 0 && (
                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {q.options.map((opt, optIdx) => (
                                              <div key={optIdx} className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${q.correctAnswer === optIdx ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-100 text-slate-500'}`}>
                                                <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] ${q.correctAnswer === optIdx ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
                                                  {String.fromCharCode(65 + optIdx)}
                                                </span>
                                                <MathText text={cleanOptionText(opt)} />
                                              </div>
                                            ))}
                                          </div>
                                        )}

                                        {q.type === 'MCQ' && (
                                          <div className="pt-4 border-t border-slate-50">
                                            <div className="bg-emerald-50 border-l-4 border-emerald-500 rounded-r-xl p-3 text-[11px]">
                                              <span className="font-black text-emerald-700 mr-2 uppercase tracking-widest">Correct Answer:</span>
                                              <span className="text-emerald-800 font-bold">{q.correctAnswer >= 0 ? String.fromCharCode(65 + q.correctAnswer) : 'Not specified'}</span>
                                              {q.explanation && <MathText text={q.explanation} className="mt-1 text-emerald-600 font-medium italic" />}
                                            </div>
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </form>
          </div>

            {/* Fixed Footer with Action Buttons */}
            <div className="p-4 md:p-6 bg-slate-50 border-t border-slate-100 flex flex-col space-y-4 shrink-0">
                <div className="flex items-center justify-between">
                  <button 
                    type="button" 
                    onClick={() => setShowSetupModal(false)} 
                    className="px-6 py-2.5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] hover:text-rose-600 transition-colors border border-transparent hover:border-rose-100 hover:bg-rose-50 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    form="assessmentSetupForm"
                    disabled={isSaving}
                    className="px-10 py-3.5 bg-slate-900 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-xl shadow-xl hover:bg-slate-800 transition-all active:scale-95 ring-4 ring-slate-100 flex items-center justify-center gap-2 min-w-[160px]"
                  >
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : null}
                    <span>{editingExamId ? 'Update Assessment' : 'Publish'}</span>
                  </button>
                </div>
                {editingExamId && (
                  <button 
                    type="button" 
                    onClick={() => setDeletingExamId(editingExamId)}
                    className="w-full py-2 text-[8px] font-black text-rose-600 uppercase tracking-widest flex items-center justify-center space-x-1.5 hover:bg-rose-50 rounded-lg transition-all border border-rose-100"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Delete</span>
                  </button>
                )}
            </div>
          </div>
        </div>
      )}

      {/* Live CBT Simulator Modal (Scrollable Review Mode) */}
      {activeQuizModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-200 shrink-0">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                  <Laptop className="w-5 h-5 text-[#EA580C]" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-lg">{activeQuizModal.title}</h3>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">{activeQuizModal.targetExam} • {activeQuizModal.questions.length} QUESTIONS</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Assessment Duration</span>
                  <span className="text-sm font-black text-slate-900">{activeQuizModal.durationMinutes} Minutes</span>
                </div>
                <button onClick={() => setActiveQuizModal(null)} className="text-slate-400 hover:text-slate-700 p-2 hover:bg-slate-100 rounded-xl transition-all">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-thin scrollbar-thumb-slate-200">
               {activeQuizModal.questions.length === 0 ? (
                 <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                    <AlertCircle className="w-12 h-12 mb-3" />
                    <p className="font-black uppercase tracking-widest text-sm">No Questions Loaded</p>
                 </div>
               ) : (
                 activeQuizModal.questions.map((q, idx) => (
                    <div key={idx} className="space-y-4 pb-8 border-b border-slate-100 last:border-0">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                             <span className="px-2 py-0.5 bg-slate-900 text-white text-[10px] font-black rounded-md">Q{idx + 1}</span>
                             <span className={`px-2 py-0.5 text-[10px] font-black rounded-md uppercase tracking-widest ${(q as any).type === 'Essay' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-orange-50 text-orange-600 border border-orange-100'}`}>
                                {(q as any).type || (activeQuizModal.mode === 'Essay' ? 'Essay' : 'MCQ')}
                             </span>
                          </div>
                          
                          {(q as any).type === 'Essay' ? (
                            <EssayQuestion 
                              question={q}
                              mode="preview"
                              theme="light"
                            />
                          ) : (
                            <div className="space-y-4">
                              <MathText text={q.question} className="text-sm md:text-base font-bold text-slate-900 leading-relaxed" />
                              {q.options && q.options.length > 0 && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {q.options.map((opt, optIdx) => {
                                    const isCorrect = q.correctAnswer === optIdx;
                                    return (
                                      <div key={optIdx} className={`p-3.5 rounded-xl border flex items-center justify-between text-xs sm:text-sm ${isCorrect ? 'bg-emerald-50 border-emerald-500 text-emerald-900 font-bold' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                                        <div className="flex items-center space-x-3">
                                          <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${isCorrect ? 'bg-emerald-600 text-white' : 'bg-white text-slate-400 border border-slate-200'}`}>{String.fromCharCode(65 + optIdx)}</span>
                                          <MathText text={cleanOptionText(opt)} className="flex-1 font-bold" />
                                        </div>
                                        {isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 ml-2" />}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                              {/* MCQ Correct Answer & Explanation */}
                              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1.5 mt-3">
                                <div className="flex items-center space-x-2 text-emerald-800">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                  <span className="text-xs font-black uppercase tracking-wider">
                                    Correct Answer: Option {typeof q.correctAnswer === 'number' && q.correctAnswer >= 0 ? String.fromCharCode(65 + q.correctAnswer) : (q.correctAnswer || 'A')}
                                  </span>
                                </div>
                                {q.options && typeof q.correctAnswer === 'number' && q.options[q.correctAnswer] && (
                                    <p className="text-xs font-bold text-emerald-900 pl-6">
                                      <MathText text={cleanOptionText(q.options[q.correctAnswer])} />
                                    </p>
                                )}
                              </div>

                              {q.explanation && (
                                <div className="p-4 rounded-xl border bg-slate-50 border-slate-200 mt-2">
                                  <div className="flex items-center space-x-2 mb-1.5">
                                     <HelpCircle className="w-4 h-4 text-slate-500" />
                                     <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                                        Explanation & Solution
                                     </span>
                                  </div>
                                  <MathText text={q.explanation} className="text-xs sm:text-sm text-slate-700 leading-relaxed italic" />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                   </div>
                 ))
               )}
            </div>

            <div className="p-4 md:p-6 border-t border-slate-200 flex items-center justify-between shrink-0 bg-slate-50/50">
               {showArchive ? (
                 <div className="flex items-center space-x-2">
                   {!showDeleteConfirm ? (
                     <button 
                       onClick={() => setShowDeleteConfirm(true)}
                       className="px-6 py-2 bg-rose-50 text-rose-600 text-xs font-black uppercase tracking-widest rounded-xl hover:bg-rose-100 transition-all flex items-center gap-2 border border-rose-200"
                     >
                       <Trash2 className="w-4 h-4" />
                       Delete Archive
                     </button>
                   ) : (
                     <div className="flex items-center space-x-2 bg-rose-600 p-1 rounded-xl animate-in fade-in slide-in-from-left-4">
                        <span className="px-3 text-[9px] font-black text-white uppercase tracking-widest">Confirm?</span>
                        <button 
                          onClick={() => {
                            deleteDoc(doc(db, 'cbt_exams', activeQuizModal.id!))
                              .then(() => {
                                addToast({ type: 'success', title: 'Deleted', description: 'Archived assessment removed successfully.' });
                                setActiveQuizModal(null);
                                setShowDeleteConfirm(false);
                              })
                              .catch(err => handleFirestoreError(err, OperationType.DELETE, 'cbt_exams'));
                          }}
                          className="px-4 py-1.5 bg-white text-rose-600 text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-rose-50"
                        >
                          Yes, Delete
                        </button>
                        <button 
                          onClick={() => setShowDeleteConfirm(false)}
                          className="px-4 py-1.5 bg-rose-700 text-white text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-rose-800"
                        >
                          No
                        </button>
                     </div>
                   )}
                 </div>
               ) : <div />}
               <button 
                 onClick={() => {
                   setActiveQuizModal(null);
                   setShowDeleteConfirm(false);
                 }}
                 className="px-6 py-2 bg-slate-900 text-white text-xs font-black uppercase tracking-widest rounded-xl shadow-md hover:bg-slate-800 transition-all"
               >
                 Close Review
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Format Guide Modal */}
      {showFormatGuide && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-slate-900 p-8 text-white flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-orange-500/20 rounded-2xl">
                  <FileText className="w-8 h-8 text-orange-400" />
                </div>
                <div>
                  <h3 className="font-black text-2xl uppercase tracking-tighter">Copy-Paste Template</h3>
                  <p className="text-white/40 text-xs font-bold uppercase tracking-widest">Master the assessment parsing engine</p>
                </div>
              </div>
              <button onClick={() => setShowFormatGuide(false)} className="bg-white/10 p-2 rounded-xl hover:bg-white/20 transition-colors">
                <X className="w-6 h-6 text-white" />
              </button>
            </div>
            
            <div className="p-8 space-y-8 overflow-y-auto max-h-[75vh] scrollbar-thin scrollbar-thumb-slate-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div className="p-5 bg-orange-50 rounded-2xl border border-orange-100">
                    <h4 className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-2 flex items-center">
                      <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                      Rule #1: The Question Marker
                    </h4>
                    <p className="text-sm text-slate-700 font-bold leading-relaxed">
                      Every question MUST start with a number (e.g. <span className="text-orange-600">1.</span>), "Q:", or "Question 1:". 
                    </p>
                  </div>

                  <div>
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center">
                      <div className="w-2 h-2 rounded-full bg-blue-500 mr-2" />
                      Essay / Sub-Question Format
                    </h4>
                    <div className="bg-slate-900 rounded-2xl p-6 font-mono text-sm text-blue-300 leading-relaxed border border-slate-800 shadow-inner">
                      1. Discuss the impact of climate change.<br/>
                      a. Mention two causes.<br/>
                      b. Suggest one solution.<br/>
                      Explanation: Global warming leads to rising sea levels...<br/>
                      (a) Fossil fuels and deforestation.<br/>
                      (b) Reforestation and solar power.<br/><br/>
                      2. Explain the process of photosynthesis.<br/>
                      a. Where does it take place?<br/>
                      b. What are the reactants?<br/>
                      Explanation: Photosynthesis is the process...<br/>
                      (a) In the chloroplasts.<br/>
                      (b) Carbon dioxide and water.<br/><br/>
                      3. Identify the main organs of the respiratory system.<br/>
                      a. Name the primary organ.<br/>
                      Explanation: The respiratory system consists of...<br/>
                      (a) The lungs.
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-100">
                    <h4 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2 flex items-center">
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                      Rule #2: Clear Options
                    </h4>
                    <p className="text-sm text-slate-700 font-bold leading-relaxed">
                      For MCQ, place options A-D on separate lines. Always include the correct answer marker.
                    </p>
                  </div>

                  <div>
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 mr-2" />
                      Multiple Choice Format
                    </h4>
                    <div className="bg-slate-900 rounded-2xl p-6 font-mono text-sm text-emerald-300 leading-relaxed border border-slate-800 shadow-inner">
                      1. Which planet is known as the Red Planet?<br/>
                      A: Venus<br/>
                      B: Mars<br/>
                      C: Jupiter<br/>
                      D: Saturn<br/>
                      Answer: B<br/>
                      Explanation: Mars appears red due to iron oxide.<br/><br/>
                      2. What is the capital of France?<br/>
                      A: London<br/>
                      B: Berlin<br/>
                      C: Paris<br/>
                      D: Rome<br/>
                      Answer: C<br/>
                      Explanation: Paris is the capital and largest city of France.<br/><br/>
                      3. Which element has the chemical symbol O?<br/>
                      A: Gold<br/>
                      B: Oxygen<br/>
                      C: Silver<br/>
                      D: Iron<br/>
                      Answer: B<br/>
                      Explanation: Oxygen is represented by the symbol O.
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100">
                <button 
                  onClick={() => setShowFormatGuide(false)}
                  className="w-full py-5 bg-slate-900 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl hover:bg-slate-800 transition-all transform active:scale-[0.98]"
                >
                  I'm ready to paste my questions
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global Mock Grading Settings Modal */}
      {showGlobalGradingModal && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-slate-900 p-6 text-white relative">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md">
                  <Settings className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-black text-xl tracking-tight">Mock Grading Rules</h3>
                  <p className="text-white/60 text-xs font-medium">Default points for all Mock assessments</p>
                </div>
              </div>
              <button
                onClick={() => setShowGlobalGradingModal(false)}
                className="absolute top-6 right-6 text-white/40 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-8 space-y-6">
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                {programmes.map((prog) => {
                  const current = globalMockGrading.find(g => g.programmeId === prog.id) || { programmeId: prog.id, mcqScore: 1, essayScore: 5 };
                  return (
                    <div key={prog.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <span className="font-black text-slate-900 uppercase tracking-widest text-[10px]">{prog.name}</span>
                        <span className="text-[9px] font-bold text-slate-400">ID: {prog.id}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">MCQ Points/Q</label>
                          <input 
                            type="number"
                            value={current.mcqScore ?? 1}
                            onChange={(e) => {
                              const newVal = Number(e.target.value);
                              setGlobalMockGrading(prev => {
                                const filtered = prev.filter(p => p.programmeId !== prog.id);
                                return [...filtered, { ...current, mcqScore: newVal }];
                              });
                            }}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-orange-500"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Essay Points/Q</label>
                          <input 
                            type="number"
                            value={current.essayScore ?? 5}
                            onChange={(e) => {
                              const newVal = Number(e.target.value);
                              setGlobalMockGrading(prev => {
                                const filtered = prev.filter(p => p.programmeId !== prog.id);
                                return [...filtered, { ...current, essayScore: newVal }];
                              });
                            }}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-orange-500"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  onClick={async () => {
                    try {
                      for (const grading of globalMockGrading) {
                        await setDoc(doc(db, 'mock_grading', grading.programmeId), grading);
                      }
                      addToast({ type: 'success', title: 'Grading Saved', description: 'Global mock rules updated.' });
                      setShowGlobalGradingModal(false);
                    } catch (err) {
                      handleFirestoreError(err, OperationType.WRITE, 'mock_grading');
                      addToast({ type: 'error', title: 'Save Failed', description: 'Permission denied.' });
                    }
                  }}
                  className="flex-1 py-4 bg-slate-900 text-white font-black uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-all shadow-lg"
                >
                  Save All Rules
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {deletingExamId && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-sm w-full p-8 shadow-2xl animate-in zoom-in-95 duration-200 text-center">
            <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Trash2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-2">Delete Assessment?</h3>
            <p className="text-sm text-slate-500 mb-8 leading-relaxed">
              This action cannot be undone. All student attempts and data associated with this assessment will be permanently removed.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => handleDeleteExam(deletingExamId)}
                className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black text-sm shadow-xl shadow-rose-100 transition-all active:scale-95"
              >
                Yes, Delete Permanently
              </button>
              <button
                onClick={() => setDeletingExamId(null)}
                className="w-full py-3 text-slate-500 font-bold text-sm hover:bg-slate-50 rounded-xl transition-all"
              >
                No, Keep Assessment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
