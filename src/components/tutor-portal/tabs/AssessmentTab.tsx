import React, { useState, useEffect } from 'react';
import { ModernSelect } from '../../ui/ModernSelect';
import { useApp } from '../../../context/AppContext';
import {
  Laptop,
  Clock,
  BookOpen,
  X,
  Plus,
  FileText,
  Copy,
  Filter,
  Pencil,
  Trash2,
  Settings,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  GraduationCap,
  Loader2,
  RefreshCw,
  Sparkles,
  HelpCircle,
  Cpu,
  CheckCircle2,
  Users,
  BarChart2,
  AlertCircle,
  XCircle,
  History,
  Check,
  Wand2,
} from 'lucide-react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc
} from 'firebase/firestore';
import { db } from '../../../firebase';
import { Tutor, CBTExam, QuizQuestion, StudentResult, EssayPart, EssaySubPart } from '../../../types';
import { parseEssayBlock, cleanPartLabel, cleanSubPartLabel, stripLeadingLabel, isGenericStem, buildEssayQuestionFromBlock } from '../../../utils/essay';
import { allocateEssayMarks } from '../../../utils/essayGrading';
import { EssayQuestion } from '../../common/EssayQuestion';
import { MathText, cleanOptionText } from '../../common/MathText';
import { buildAssessmentAIPrompt } from '../../../utils/aiPromptBuilder';

interface AssessmentTabProps {
  tutor: Tutor;
}

export const AssessmentTab: React.FC<AssessmentTabProps> = ({ tutor }) => {
  const { programmes, subjects: allSubjects, addToast, exams, results, students } = useApp();
  const [activeFrequency] = useState<'General'>('General');
  const [activeTab, setActiveTab] = useState<'Assessment' | 'Performance'>('Assessment');
  const [expandedExamId, setExpandedExamId] = useState<string | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<string>('all');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [archivePage, setArchivePage] = useState(1);
  const [performancePage, setPerformancePage] = useState(1);

  useEffect(() => {
    setArchivePage(1);
    setPerformancePage(1);
  }, [selectedWeek, activeTab, showArchive, activeFrequency]);

  const myExams = exams.filter(ex => 
    ex.tutorId === tutor.id || (ex.tutorName && ex.tutorName.toLowerCase() === tutor.name.toLowerCase())
  );

  const totalQuestions = myExams.reduce((sum, ex) => sum + (ex.questions?.length || ex.questionCount || 0), 0);
  const totalAttempts = myExams.reduce((sum, ex) => sum + ex.attemptsCount, 0);

  // Generate weeks dynamically (reused from ScheduleTab)
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

  // Cache Buster: 20261001-0730
  const weeks = generateWeeks();

  useEffect(() => {
    if ((!selectedWeek || selectedWeek === '') && weeks.length > 0) {
      setSelectedWeek('all');
    }
  }, [weeks, selectedWeek]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const [activeQuizModal, setActiveQuizModal] = useState<CBTExam | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingExamId, setDeletingExamId] = useState<string | null>(null);

  const [showSetupModal, setShowSetupModal] = useState(false);
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState<CBTExam | null>(null);
  const [selectedStudentResult, setSelectedStudentResult] = useState<StudentResult | null>(null);
  const [showOverrideModal, setShowOverrideModal] = useState<StudentResult | null>(null);
  const [overridingScores, setOverridingScores] = useState<Record<number, any>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [generatedQuestions, setGeneratedQuestions] = useState<QuizQuestion[]>([]);

  // Setup Form State
  const [setupData, setSetupData] = useState({
    frequency: 'General' as 'General' | 'Mock',
    programmeId: '',
    subjectIds: [] as string[],
    topic: '',
    isClasswork: false,
    isAssignment: false,
    mode: 'MCQ' as 'MCQ' | 'Essay' | 'Both',
    department: 'All' as 'All' | 'Science' | 'Commercial' | 'Arts',
    hasDuration: true,
    duration: 60,
    startTime: '',
    endTime: '',
    questionInputMode: 'Paste' as 'Paste' | 'AI',
    scorePerQuestion: 1,
    essayMarksPerQuestion: 5,
    questionCount: 10,
  });

  const [pastedText, setPastedText] = useState('');
  const [parsedQuestions, setParsedQuestions] = useState<QuizQuestion[]>([]);
  const [showFormatGuide, setShowFormatGuide] = useState(false);

  // Filter subjects to only those assigned to this tutor
  const tutorSubjects = allSubjects.filter(s => 
    tutor.subjects?.some(ts => {
      const tutorSub = (ts || '').toString().trim().toLowerCase();
      const sysSub = (s.name || '').toString().trim().toLowerCase();
      return tutorSub === sysSub || ts === s.id;
    })
  );

  const filteredExams = exams.filter((ex) => {
    // Only show assessments created by this tutor or tagged to this tutor
    const isMyExam = ex.tutorId === tutor.id || (ex.tutorName && ex.tutorName.toLowerCase() === tutor.name.toLowerCase());
    if (!isMyExam) return false;

    const examStart = ex.startTime ? new Date(ex.startTime) : new Date(0);
    const examEnd = ex.endTime ? new Date(ex.endTime) : new Date(9999, 11, 31);
    
    // Status Logic
    const isToday = examStart.toDateString() === currentTime.toDateString();
    const isPastDay = new Date(currentTime.toDateString()).getTime() > new Date(examStart.toDateString()).getTime();
    const isActuallyPast = currentTime.getTime() > examEnd.getTime() || isPastDay;

    // 1. Weekly Filter (Consolidated)
    if (selectedWeek && selectedWeek !== 'all' && selectedWeek.includes(' - ')) {
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

      const matchesWeek = (checkDate.getTime() >= startDate.getTime() && checkDate.getTime() <= endDate.getTime());
      
      if (!matchesWeek) return false;
      // In weekly mode, we still respect the "Performance" tab vs "Assessment" tab
      if (activeTab === 'Performance') return isActuallyPast || (ex.attemptsCount || 0) > 0;
      return true;
    }

    // Archive Logic: show anything that is PAST (either past day or past end window)
    if (showArchive) return isActuallyPast;
    
    // Performance Tab View: shows results for past/active tests
    if (activeTab === 'Performance') return isActuallyPast || (ex.attemptsCount || 0) > 0;
    
    // Main View: show today's AND future assessments
    return !isActuallyPast;
  }).sort((a, b) => {
    const startA = a.startTime ? new Date(a.startTime).getTime() : 0;
    const startB = b.startTime ? new Date(b.startTime).getTime() : 0;
    const isTodayA = new Date(startA).toDateString() === currentTime.toDateString();
    const isTodayB = new Date(startB).toDateString() === currentTime.toDateString();

    // 1. Today's assessments always come first
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
    if (startA !== startB) return startA - startB;
    return createB - createA;
  });

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
      hasDuration: true,
      duration: 60,
      startTime: '',
      endTime: '',
      questionInputMode: 'Paste',
      scorePerQuestion: 1,
      questionCount: 10,
    });
    setPastedText('');
    setParsedQuestions([]);
    setGeneratedQuestions([]);
    setAiPrompt('');
    setShowSetupModal(true);
  };

  const handleOpenEdit = (exam: CBTExam) => {
    const prog = programmes.find(p => p.name === exam.title.split(' - ')[0]);
    const subIds = allSubjects.filter(s => exam.subjects.includes(s.name)).map(s => s.id);
    
    setEditingExamId(exam.id);
    setSetupData({
      frequency: (exam.frequency as string === 'General' || exam.frequency as string === 'Daily' || exam.frequency as string === 'Weekly') ? 'General' : 'Mock',
      programmeId: prog?.id || '',
      subjectIds: subIds,
      topic: exam.topic || '',
      isClasswork: !!exam.isClasswork,
      isAssignment: !!exam.isAssignment,
      mode: exam.mode,
      department: exam.department as any,
      hasDuration: exam.durationMinutes > 0,
      duration: exam.durationMinutes || 60,
      startTime: exam.startTime || '',
      endTime: exam.endTime || '',
      questionInputMode: 'Paste',
      scorePerQuestion: exam.scorePerQuestion || 1,
      essayMarksPerQuestion: exam.essayMarksPerQuestion || 5,
      questionCount: exam.questions?.length || exam.questionCount || 10,
    });
    
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
    
    setShowSetupModal(true);
  };

  const parsePastedQuestions = (text: string) => {
    const questions: QuizQuestion[] = [];
    const blocks = text.split(/(?:\n|^)\s*(?=(?:Question\s*\d+|Q\d+|Q:|\d+)(?![a-z])[\.\):]?\s+)/im).filter(b => b.trim());
    
    blocks.forEach(block => {
      const lines = block.split('\n').map(l => l.trim()).filter(l => l);
      if (lines.length < 1) return;

      const optionRegex = /^[A-D][.):]\s*\S/;
      const letterAnswerRegex = /^(?:Answer|Correct):\s*[A-D][.)]?\s*$/i;

      const uppercaseOptionsCount = lines.filter(l => optionRegex.test(l)).length;
      const likelyMCQ = uppercaseOptionsCount >= 2;

      const selectedMode = setupData.mode;
      let parseAsMCQ = (selectedMode === 'MCQ') ? true : (selectedMode === 'Essay' ? false : likelyMCQ);

      if (parseAsMCQ) {
        let currentQuestionText = "";
        let currentModelAnswer = "";
        const options: string[] = [];
        let correctAnswer = -1;
        let isCollectingAnswer = false;

        lines.forEach(line => {
          if (optionRegex.test(line)) {
            options.push(line.replace(/^[A-D][.):]\s*/, '').trim());
            isCollectingAnswer = true;
          } else if (letterAnswerRegex.test(line)) {
            const match = line.match(/^(?:Answer|Correct):\s*([A-D])(?![a-z])/i);
            if (match) correctAnswer = match[1].toUpperCase().charCodeAt(0) - 65;
            isCollectingAnswer = true;
          } else if (/^(?:Model Answer|Explanation|Solution):/i.test(line)) {
            currentModelAnswer += (currentModelAnswer ? '\n' : '') + line.replace(/^(?:Model Answer|Explanation|Solution):/i, '').trim();
            isCollectingAnswer = true;
          } else {
            if (isCollectingAnswer) {
              currentModelAnswer += (currentModelAnswer ? '\n' : '') + line;
            } else {
              let cleanLine = line;
              if (currentQuestionText === "") {
                cleanLine = line.replace(/^(?:Question\s*\d+|Q\d+|Q:|\d+)(?![a-z])[\.\):]?\s*/i, '');
              }
              currentQuestionText += (currentQuestionText ? '\n' : '') + cleanLine;
            }
          }
        });
        
        if (currentQuestionText.trim()) {
          questions.push({ 
            id: `q-${Date.now()}-${Math.random()}`,
            question: currentQuestionText.trim(), 
            options: options, 
            correctAnswer: correctAnswer, 
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

    setParsedQuestions(questions);
    if (questions.length > 0) {
      addToast({ type: 'success', title: 'Parsing Complete', description: `Detected ${questions.length} questions.` });
    } else {
      addToast({ type: 'error', title: 'Parsing Failed', description: 'No valid questions found.' });
    }
  };

  const handleAutoFillPrompt = () => {
    if (!setupData.programmeId || setupData.subjectIds.length === 0) {
      addToast({ type: 'warning', title: 'Setup Details Needed', description: 'Please select a programme and at least one subject first.' });
      return;
    }

    const subjectName = (setupData.subjectIds.length === 1 
      ? allSubjects.find(s => s.id === setupData.subjectIds[0])?.name 
      : allSubjects.filter(s => setupData.subjectIds.includes(s.id)).map(s => s.name).join(', ')) || 'General Subject';
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

  const handleGenerateAIQuestions = async () => {
    if (!setupData.programmeId || setupData.subjectIds.length === 0) {
      addToast({ type: 'error', title: 'Missing Info', description: 'Please select a programme and at least one subject first.' });
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

    setGeneratingAI(true);
    try {
      const programme = programmes.find(p => p.id === setupData.programmeId)?.name || 'Standard Exam';
      const subject = allSubjects.find(s => s.id === setupData.subjectIds[0])?.name || 'General Subject';
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

      setParsedQuestions(formattedQuestions);
      setGeneratedQuestions(formattedQuestions);
      addToast({ type: 'success', title: 'AI Generation Complete', description: `Successfully generated ${formattedQuestions.length} questions.` });
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

  const handleSaveAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!setupData.programmeId) {
      addToast({ type: 'error', title: 'Missing Info', description: 'Please select a target programme.' });
      return;
    }
    
    if (setupData.subjectIds.length === 0) {
      addToast({ type: 'error', title: 'Missing Info', description: 'Please select at least one subject.' });
      return;
    }

    if (!setupData.startTime || !setupData.endTime) {
      addToast({ type: 'error', title: 'Missing Window', description: 'Please select both a Start and End Window.' });
      return;
    }

    setIsSaving(true);
    const programme = programmes.find(p => p.id === setupData.programmeId);
    const selectedSubjectsNames = allSubjects.filter(s => setupData.subjectIds.includes(s.id)).map(s => s.name);
    
    const finalQuestions = parsedQuestions.length > 0 ? parsedQuestions : generatedQuestions;
    if (finalQuestions.length === 0) {
      addToast({ type: 'error', title: 'No Questions', description: 'Please add or generate questions before publishing.' });
      setIsSaving(false);
      return;
    }

    const essayCount = finalQuestions.filter(q => q.type === 'Essay').length;
    const totalEssayMarks = setupData.essayMarksPerQuestion || 20;

    const examId = editingExamId || `cbt-${Date.now()}`;
    const examData: CBTExam = {
      id: examId,
      title: `${programme?.name || 'General'} - ${setupData.frequency} ${setupData.mode} Assessment`,
      subjects: selectedSubjectsNames,
      topic: setupData.topic || '',
      questionCount: finalQuestions.length,
      durationMinutes: setupData.hasDuration ? setupData.duration : 0,
      targetExam: programme?.category || 'Standard',
      attemptsCount: exams.find(e => e.id === examId)?.attemptsCount || 0,
      averageScore: exams.find(e => e.id === examId)?.averageScore || 0,
      status: 'Live',
      questions: finalQuestions,
      frequency: setupData.frequency,
      isClasswork: setupData.isClasswork || false,
      isAssignment: setupData.isAssignment || false,
      department: setupData.department || 'All',
      mode: setupData.mode,
      startTime: setupData.startTime,
      endTime: setupData.endTime,
      createdAt: editingExamId ? (exams.find(e => e.id === editingExamId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
      tutorId: tutor.id,
      tutorName: tutor.name,
      scorePerQuestion: setupData.scorePerQuestion || 1,
      essayMarksPerQuestion: setupData.essayMarksPerQuestion,
      essayTotalMarks: (setupData.mode === 'Essay' || setupData.mode === 'Both') ? totalEssayMarks : 0,
    };

    try {
      await setDoc(doc(db, 'cbt_exams', examId), JSON.parse(JSON.stringify(examData)));
      addToast({ type: 'success', title: editingExamId ? 'Assessment Updated' : 'Assessment Published' });
      setShowSetupModal(false);
    } catch (err) {
      console.error('Publish Error:', err);
      addToast({ type: 'error', title: 'Publish Failed', description: (err as Error).message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartExam = (exam: CBTExam) => {
    setActiveQuizModal(exam);
  };

  const handleDeleteExam = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this assessment?')) return;
    try {
      await deleteDoc(doc(db, 'cbt_exams', id));
      addToast({ type: 'success', title: 'Deleted' });
    } catch (err) {
      addToast({ type: 'error', title: 'Delete Failed' });
    }
  };

  const handleSaveOverride = async () => {
    if (!showOverrideModal) return;
    setIsSaving(true);
    try {
      const resultId = showOverrideModal.id;
      
      // Calculate new total score
      const mcqScore = showOverrideModal.scores.find(s => s.subject === 'MCQ')?.score || 0;
      const essayTotalMarks = showOverrideModal.essayTotalMarks || 0;
      
      let newEssayScore = 0;
      Object.values(overridingScores).forEach((score: any) => {
        newEssayScore += score?.got || 0;
      });

      const newTotalScore = mcqScore + newEssayScore;
      const maxTotal = (showOverrideModal.scores.find(s => s.subject === 'MCQ')?.maxScore || 0) + essayTotalMarks;
      const newPct = maxTotal > 0 ? Math.round((newTotalScore / maxTotal) * 100) : 0;

      const newScores = [
        { subject: 'MCQ', score: mcqScore, maxScore: showOverrideModal.scores.find(s => s.subject === 'MCQ')?.maxScore || 0 },
        { subject: 'Essay', score: newEssayScore, maxScore: essayTotalMarks }
      ];

      await setDoc(doc(db, 'results', resultId), {
        ...showOverrideModal,
        essayScores: overridingScores,
        totalScore: newTotalScore,
        averagePercent: newPct,
        scores: newScores,
        gradingMethod: 'manual_override',
        updatedAt: new Date().toISOString()
      }, { merge: true });

      addToast({ type: 'success', title: 'Override Saved', description: 'Student result has been updated.' });
      setShowOverrideModal(null);
    } catch (err) {
      console.error('Override Error:', err);
      addToast({ type: 'error', title: 'Save Failed', description: 'Could not save manual override.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={`transition-all duration-500 min-h-screen relative ${activeTab === 'Performance' ? 'bg-slate-950 -m-5 p-5' : 'bg-slate-50 p-5'} ${showArchive ? 'bg-white p-5' : ''}`}>
      {/* Tutor Override Modal */}
      {showOverrideModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 my-8">
            <div className="bg-slate-900 p-6 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center">
                  <Pencil className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight">Tutor Override</h3>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Grading for: {showOverrideModal.studentName}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowOverrideModal(null)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
              {Object.entries(overridingScores).map(([qIdx, score]: [string, any]) => {
                const idx = parseInt(qIdx);
                const question = exams.find(e => e.id === showOverrideModal.examId)?.questions[idx];
                if (!question) return null;

                return (
                  <div key={qIdx} className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Question {idx + 1}</span>
                      <div className="flex items-center gap-2">
                         <span className="text-[10px] font-black text-slate-400 uppercase">Max: {score.max}</span>
                         <input 
                            type="number" 
                            step="0.5"
                            min="0"
                            max={score.max}
                            value={score.got ?? 0}
                            onChange={(e) => {
                               const val = Math.min(score.max, Math.max(0, parseFloat(e.target.value) || 0));
                               setOverridingScores(prev => ({
                                  ...prev,
                                  [qIdx]: { ...score, got: val }
                               }));
                            }}
                            className="w-16 px-2 py-1 rounded-lg border border-slate-200 text-center font-black text-slate-900 bg-white"
                         />
                      </div>
                    </div>
                    <p className="text-xs font-bold text-slate-700 leading-relaxed">{question.question}</p>
                    
                    <div className="grid grid-cols-1 gap-2 mt-2">
                       {Object.entries(score.leaves || {}).map(([lKey, l]: [string, any]) => (
                          <div key={lKey} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
                             <div className="flex-1">
                                <span className="text-[9px] font-black text-slate-400 uppercase block tracking-tighter">Leaf: {lKey}</span>
                                <p className="text-[11px] font-medium text-slate-600 italic">"{l.feedback || 'No AI feedback'}"</p>
                             </div>
                             <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-slate-400 uppercase">Points</span>
                                <input 
                                   type="number" 
                                   step="0.5"
                                   min="0"
                                   max={l.max || score.max}
                                   value={l.got || 0}
                                   onChange={(e) => {
                                      const val = Math.min(l.max || score.max, Math.max(0, parseFloat(e.target.value) || 0));
                                      const newLeaves = { ...score.leaves, [lKey]: { ...l, got: val, quality: (l.max || score.max) > 0 ? val / (l.max || score.max) : 0 } };
                                      const newTotalGot = Object.values(newLeaves).reduce((sum, leaf: any) => sum + (leaf.got || 0), 0);
                                      setOverridingScores(prev => ({
                                         ...prev,
                                         [qIdx]: { ...score, got: newTotalGot, leaves: newLeaves }
                                      }));
                                   }}
                                   className="w-14 px-1.5 py-1 rounded-lg border border-slate-200 text-center font-bold text-slate-800 bg-slate-50"
                                />
                             </div>
                          </div>
                       ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-200 flex gap-3">
              <button 
                onClick={() => setShowOverrideModal(null)}
                className="flex-1 py-4 rounded-2xl border border-slate-200 text-slate-600 font-black text-[10px] uppercase tracking-[0.2em] hover:bg-white transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveOverride}
                disabled={isSaving}
                className="flex-[2] py-4 rounded-2xl bg-slate-900 text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-black transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>Save Manual Grades</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Overscroll Background Extender */}
      {(activeTab === 'Performance' || showArchive) && (
        <div className={`absolute top-[-1000px] left-0 right-0 h-[1000px] ${showArchive ? 'bg-white' : 'bg-slate-950'} -z-10`} />
      )}
      <div className="flex items-center justify-between relative h-12 mb-6">
        {activeTab === 'Assessment' && !showArchive && (
          <button 
            onClick={handleOpenSetup}
            className="w-10 h-10 rounded-xl bg-[#EA580C] text-white flex items-center justify-center shadow-lg shadow-orange-100 absolute left-0"
          >
            <Plus className="w-5 h-5" />
          </button>
        )}

        {showArchive && (
          <button 
            onClick={() => setShowArchive(false)}
            className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200 transition-all absolute left-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        
        <div className="flex-1 text-center">
          <h2 className={`text-xl font-black tracking-tight ${activeTab === 'Performance' ? 'text-white' : 'text-slate-900'}`}>
            {activeTab === 'Performance' ? 'Performance Analytics' : (showArchive ? 'Assessment Archive' : 'Tutor Assessments')}
          </h2>
          <p className={`text-[11px] font-medium ${activeTab === 'Performance' ? 'text-slate-400' : 'text-slate-500'}`}>
            {activeTab === 'Performance' ? 'In-depth student performance & class leaderboards' : (showArchive ? 'Historical archive of completed tests' : 'Manage CBT tests & simulations')}
          </p>
        </div>

        {activeTab === 'Assessment' && !showArchive && (
          <button 
            onClick={() => setShowArchive(true)}
            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all absolute right-0 border bg-white text-slate-400 border-slate-200"
            title="View Archive"
          >
            <History className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* KPI Cards - Only for Assessments, Hidden in Archive */}
      {activeTab === 'Assessment' && !showArchive && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6">
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center sm:space-x-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-orange-50 text-[#EA580C] flex items-center justify-center shrink-0 mb-2 sm:mb-0">
              <BookOpen className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Assigned Qs</span>
              <div className="flex items-baseline space-x-1">
                <span className="text-xl sm:text-2xl font-black text-slate-900">{totalQuestions.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center sm:space-x-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mb-2 sm:mb-0">
              <Laptop className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Student Runs</span>
              <div className="flex items-baseline space-x-1">
                <span className="text-xl sm:text-2xl font-black text-slate-900">{totalAttempts.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Weekly Filter - Only for Performance or Archive */}
      {(activeTab === 'Performance' || showArchive) && (
        <div className="mb-6 animate-in slide-in-from-top-2 duration-300">
           <ModernSelect
            value={selectedWeek}
            onChange={setSelectedWeek}
            options={[
              { value: 'all', label: 'All Assessments' },
              ...weeks.map(w => ({ value: w, label: `Week: ${w}` }))
            ]}
            className="w-full"
          />
        </div>
      )}

      {!showArchive && (
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex items-center justify-between gap-3">
            <div className={`flex items-center space-x-1 p-1.5 rounded-2xl flex-1 border transition-all ${activeTab === 'Performance' ? 'bg-white/5 border-white/10' : 'bg-slate-100 border-slate-200'}`}>
              {(['Assessment', 'Performance'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    setActiveTab(tab);
                    if (tab === 'Performance') setShowArchive(false);
                  }}
                  className={`flex-1 py-3 text-[12px] font-black uppercase tracking-wider rounded-xl transition-all ${
                    activeTab === tab 
                      ? 'bg-white text-slate-900 shadow-md' 
                      : (activeTab === 'Performance' ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600')
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {(() => {
          const TUTOR_PAGE_SIZE = 10;
          const isPaginated = activeTab === 'Performance' || showArchive;
          const currentPage = activeTab === 'Performance' ? performancePage : archivePage;
          const setCurrentPage = activeTab === 'Performance' ? setPerformancePage : setArchivePage;
          const totalPages = Math.max(1, Math.ceil(filteredExams.length / TUTOR_PAGE_SIZE));
          const displayedExams = isPaginated
            ? filteredExams.slice((currentPage - 1) * TUTOR_PAGE_SIZE, currentPage * TUTOR_PAGE_SIZE)
            : filteredExams;

          if (displayedExams.length === 0) {
            return (
              <div className={`py-12 rounded-3xl border border-dashed text-center space-y-3 ${activeTab === 'Performance' || showArchive ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200'}`}>
                 <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto ${activeTab === 'Performance' || showArchive ? 'bg-white/5' : 'bg-slate-50'}`}>
                    <Laptop className={`w-8 h-8 ${activeTab === 'Performance' || showArchive ? 'text-slate-600' : 'text-slate-300'}`} />
                 </div>
                 <p className={`text-xs font-medium ${activeTab === 'Performance' || showArchive ? 'text-slate-500' : 'text-slate-400'}`}>No assessments found in this category.</p>
              </div>
            );
          }

          return (
            <>
              {displayedExams.map((exam) => {
                const examStart = exam.startTime ? new Date(exam.startTime) : new Date(0);
                const examEnd = exam.endTime ? new Date(exam.endTime) : new Date(9999, 11, 31);
                const isPast = currentTime > examEnd;
                const isLive = currentTime >= examStart && !isPast;
                const examResults = results.filter(r => r.examId === exam.id).sort((a, b) => b.totalScore - a.totalScore);

                if (activeTab === 'Performance') {
                  return (
                    <div key={exam.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden transition-all shadow-lg hover:border-orange-200 relative">
                       {/* Top Right Corner - Created Date */}
                       <div className="absolute top-0 right-0 px-3 py-1 bg-slate-700 text-white text-[8px] font-black uppercase tracking-widest flex items-center gap-1 border-b border-l border-slate-600 rounded-bl-lg z-10">
                          <Clock className="w-2.5 h-2.5 text-orange-400" />
                          <span>Created: <span className="text-orange-300">{exam.createdAt ? new Date(exam.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : (exam.startTime ? new Date(exam.startTime).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A')}</span></span>
                       </div>

                       <div className="p-5 pt-6 flex items-center justify-between gap-4">
                          <div className="flex-1 min-w-0">
                             <div className="flex items-center gap-2 mb-1.5">
                                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${isPast ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-600'}`}>
                                   {isPast ? 'Finished' : 'Live Now'}
                                </span>
                                <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-wider border shadow-xs ${
                                   exam.mode === 'Essay' ? 'bg-blue-50 text-blue-600 border-blue-200' : 
                                   exam.mode === 'MCQ' ? 'bg-orange-50 text-orange-600 border-orange-200' : 
                                   'bg-purple-50 text-purple-600 border-purple-200'
                                }`}>
                                   {exam.mode === 'Both' ? 'MCQ & Essay' : exam.mode}
                                </span>
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tight truncate">
                                   {exam.subjects.join(', ')}
                                </span>
                             </div>
                         <h3 className="text-slate-900 font-black text-base truncate">{exam.title}</h3>
                         <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter mt-1">{exam.targetExam}</p>
                      </div>

                      <div className="flex items-center gap-6 shrink-0">
                         <div className="text-right border-l border-slate-100 pl-6">
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Students</span>
                            <span className="text-lg font-black text-slate-900">{examResults.length}</span>
                         </div>
                         <button
                            onClick={() => setExpandedExamId(expandedExamId === exam.id ? null : exam.id)}
                            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${expandedExamId === exam.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                         >
                            <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${expandedExamId === exam.id ? 'rotate-180' : 'rotate-0'}`} />
                         </button>
                      </div>
                   </div>

                   {expandedExamId === exam.id && (
                     <div className="bg-slate-50 border-t border-slate-100 animate-in slide-in-from-top-2 duration-300">
                        <div className="p-4 overflow-x-auto">
                           <table className="w-full text-left text-[11px]">
                              <thead>
                                 <tr className="text-slate-400 font-black uppercase tracking-[0.2em] border-b border-slate-200">
                                    <th className="px-4 py-3 w-16">Rank</th>
                                    <th className="px-4 py-3">Student</th>
                                    <th className="px-4 py-3 text-center">Duration</th>
                                    <th className="px-4 py-3 text-right">Score</th>
                                 </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                 {examResults.length === 0 ? (
                                    <tr>
                                       <td colSpan={4} className="px-4 py-12 text-center text-slate-400 font-bold italic">
                                          Gathering participation data... No attempts recorded yet.
                                       </td>
                                    </tr>
                                 ) : (
                                    examResults.map((res, rIdx) => {
                                       const studentInfo = students.find(s => s.id === res.studentId);
                                       return (
                                          <tr key={res.id} className="hover:bg-white transition-colors group">
                                             <td className="px-4 py-4">
                                                <span className={`flex items-center justify-center w-6 h-6 rounded-lg text-[10px] font-black ${
                                                   rIdx === 0 ? 'bg-amber-100 text-amber-700 shadow-sm' : 
                                                   rIdx === 1 ? 'bg-slate-100 text-slate-600' :
                                                   rIdx === 2 ? 'bg-orange-50 text-orange-700' : 'text-slate-400'
                                                }`}>
                                                   #{rIdx + 1}
                                                </span>
                                             </td>
                                             <td className="px-4 py-4">
                                                <div className="flex items-center gap-3">
                                                   <span className="font-black text-slate-900 transition-colors">{res.studentName}</span>
                                                </div>
                                             </td>
                                             <td className="px-4 py-4 text-center">
                                                <span className="px-2.5 py-1 rounded-md bg-white border border-slate-100 text-[9px] font-black uppercase text-slate-500 tracking-tighter">
                                                   {res.timeTakenSeconds ? (
                                                     `${Math.floor(res.timeTakenSeconds / 60)}m ${res.timeTakenSeconds % 60}s`
                                                   ) : (
                                                     '--'
                                                   )}
                                                </span>
                                             </td>
                                             <td className="px-4 py-4 text-right">
                                                <div className="flex flex-col items-end">
                                                   <div className="flex items-center gap-2">
                                                      {res.essayScores && Object.keys(res.essayScores).length > 0 && (
                                                         <button
                                                            onClick={() => {
                                                               setShowOverrideModal(res);
                                                               setOverridingScores(JSON.parse(JSON.stringify(res.essayScores || {})));
                                                            }}
                                                            className="p-1.5 rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100 transition-all border border-orange-200 shadow-sm"
                                                            title="Tutor Override"
                                                         >
                                                            <Pencil className="w-3 h-3" />
                                                         </button>
                                                      )}
                                                      <span className="text-sm font-black text-[#EA580C]">{res.totalScore}</span>
                                                   </div>
                                                   <span className="text-[9px] font-bold text-slate-400 uppercase">{res.averagePercent}% Acc.</span>
                                                </div>
                                             </td>
                                          </tr>
                                       );
                                    })
                                 )}
                              </tbody>
                           </table>
                        </div>
                     </div>
                   )}
                </div>
              );
            }

            // Default Assessment Card View
            const isActuallyPast = currentTime.getTime() > examEnd.getTime();
            const isPastDay = new Date(currentTime.toDateString()).getTime() > new Date(examStart.toDateString()).getTime();
            const isToday = examStart.toDateString() === currentTime.toDateString();
            const isStartingSoon = !isLive && !isPastDay && isToday;
            const mappedFreqLabel = (exam.frequency === 'General' || (exam.frequency as any) === 'Daily' || (exam.frequency as any) === 'Weekly') ? 'General' : 'CBT Mock';

            return (
              <div key={exam.id} className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between space-y-4 group relative overflow-hidden">
                {(() => {
                  const isActuallyPast = currentTime.getTime() > examEnd.getTime();
                  const isLiveNow = currentTime >= examStart && !isActuallyPast;
                  const isTodayNow = examStart.toDateString() === currentTime.toDateString();
                  const isStartingSoonNow = !isLiveNow && !isPastDay && isTodayNow;
                  
                  return (
                    <>
                      {/* Status Tag Top Left */}
                      <div className={`absolute top-0 left-0 px-3 py-1 text-[8px] font-black uppercase tracking-widest ${
                        isActuallyPast ? 'bg-slate-500 text-white' : 
                        isLiveNow ? 'bg-emerald-600 text-white' : 
                        isStartingSoonNow ? 'bg-orange-500 text-white animate-pulse' :
                        'bg-blue-600 text-white'
                      }`}>
                        {isActuallyPast ? 'Finished' : isLiveNow ? 'Live' : isStartingSoonNow ? 'Starts Today' : 'Upcoming'}
                      </div>

                      {/* Top Right Tip - Start Time or Created Date (Deep Grey Color) */}
                      <div className="absolute top-0 right-0 px-3 py-1 bg-slate-700 text-white text-[8px] font-black uppercase tracking-widest flex items-center gap-1 border-b border-l border-slate-600">
                        <Clock className="w-2.5 h-2.5 text-orange-500" />
                        {isActuallyPast 
                          ? <span>Created: <span className="text-orange-300">{exam.createdAt ? new Date(exam.createdAt).toLocaleDateString() : 'N/A'}</span></span>
                          : !isTodayNow && !isLiveNow
                            ? <span>Starts: <span className="text-orange-300">{examStart.toLocaleDateString([], { day: '2-digit', month: '2-digit' })} {examStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span></span>
                            : isLiveNow
                              ? <span>Live Since: <span className="text-orange-300">{examStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span></span>
                              : <span>Starts: <span className="text-orange-300">{examStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span></span>
                        }
                      </div>
                    </>
                  );
                })()}

                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 rounded-lg text-[10px] font-black bg-slate-50 text-slate-600 border border-slate-200 uppercase tracking-tighter">
                        {exam.targetExam}
                      </span>
                    </div>

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
                  
                  <div className="flex items-center gap-1.5 mt-3 text-[10px] font-bold text-slate-400">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span className="uppercase tracking-tight">Tutor: {tutor.name}</span>
                  </div>
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
                    <span className="text-[#EA580C] uppercase">{exam.questions?.length || exam.questionCount || 0} Qs</span>
                  </div>

                  <div className="flex items-center space-x-2">
                    {activeTab === 'Assessment' ? (
                      <>
                        <button
                          onClick={() => setShowAnalyticsModal(exam)}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                          title="View Assessment Insights"
                        >
                          <BarChart2 className="w-4 h-4" />
                        </button>
                        {!isActuallyPast && (
                          <button
                            onClick={() => handleOpenEdit(exam)}
                            className="p-2 text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-all"
                            title="Edit Assessment"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        
                        <button
                          onClick={() => handleStartExam(exam)}
                          className="px-5 py-2.5 text-xs font-black text-white rounded-xl shadow-lg transition-all flex items-center space-x-2 bg-slate-900 hover:bg-slate-800"
                        >
                          <span className="leading-none">
                            Review
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-orange-400" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setExpandedExamId(expandedExamId === exam.id ? null : exam.id)}
                        className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center space-x-2 ${
                          expandedExamId === exam.id 
                            ? 'bg-rose-50 text-rose-600 border border-rose-100' 
                            : 'bg-blue-50 text-blue-600 border border-blue-100'
                        }`}
                      >
                        <BarChart2 className="w-4 h-4" />
                        <span>{expandedExamId === exam.id ? 'Hide Leaderboard' : 'View Performance'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Consolidated Collapsible Leaderboard for ALL modes */}
                {expandedExamId === exam.id && (
                  <div className="mt-4 pt-4 border-t border-slate-100 animate-in slide-in-from-top-4 duration-300">
                    <div className="flex items-center justify-between mb-4">
                       <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-900 flex items-center gap-2">
                          <Users className="w-4 h-4 text-[#EA580C]" />
                          Student Participation
                       </h4>
                    </div>

                    <div className="bg-slate-50 rounded-2xl overflow-hidden border border-slate-200">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-[11px]">
                          <thead className="bg-slate-900 text-white font-black uppercase tracking-widest">
                            <tr>
                              <th className="px-4 py-3 w-16">Rank</th>
                              <th className="px-4 py-3">Student</th>
                              <th className="px-4 py-3 text-center">Duration</th>
                              <th className="px-4 py-3 text-right">Score</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {(() => {
                              const examResults = results
                                .filter(r => r.examId === exam.id)
                                .sort((a, b) => b.totalScore - a.totalScore);
                              
                              if (examResults.length === 0) {
                                return (
                                  <tr>
                                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400 font-medium italic">
                                      No students have attempted this assessment yet.
                                    </td>
                                  </tr>
                                );
                              }

                              return examResults.map((res, rIdx) => {
                                return (
                                  <tr key={res.id} className="hover:bg-white transition-colors group/row">
                                    <td className="px-4 py-3">
                                      <span className={`flex items-center justify-center w-6 h-6 rounded-lg text-[10px] font-black ${
                                        rIdx === 0 ? 'bg-yellow-50 text-yellow-600' :
                                        rIdx === 1 ? 'bg-slate-100 text-slate-600' :
                                        rIdx === 2 ? 'bg-orange-50 text-orange-600' :
                                        'text-slate-400'
                                      }`}>
                                        #{rIdx + 1}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 font-black text-slate-900">
                                      {res.studentName}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      <span className="px-2.5 py-1 rounded-md bg-white border border-slate-100 text-[9px] font-black uppercase text-slate-500 tracking-tighter">
                                         {res.timeTakenSeconds ? (
                                           `${Math.floor(res.timeTakenSeconds / 60)}m ${res.timeTakenSeconds % 60}s`
                                         ) : (
                                           '--'
                                         )}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                      <div className="flex flex-col items-end">
                                        <span className="text-sm font-black text-[#EA580C]">{res.totalScore}</span>
                                        <span className="text-[9px] text-slate-400 uppercase font-bold tracking-tighter">{res.averagePercent}% Acc.</span>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              });
                            })()}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {isPaginated && totalPages > 1 && (
            <div className="flex items-center justify-between pt-6 pb-2 text-xs">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className={`px-4 py-2 rounded-xl border font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  activeTab === 'Performance'
                    ? 'border-white/10 bg-white/5 text-white hover:bg-white/10'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                Previous
              </button>
              <span className={`text-xs font-bold ${activeTab === 'Performance' ? 'text-slate-400' : 'text-slate-500'}`}>
                Page {currentPage} of {totalPages} ({filteredExams.length} assessments)
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className={`px-4 py-2 rounded-xl border font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  activeTab === 'Performance'
                    ? 'border-white/10 bg-white/5 text-white hover:bg-white/10'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                Next
              </button>
            </div>
          )}
        </>
      );
    })()}
      </div>

      {showSetupModal && (
        <div className="fixed inset-0 bg-slate-950/60 z-50 overflow-y-auto p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="min-h-full flex items-center justify-center py-8">
            <div className="bg-white rounded-[32px] max-w-3xl w-full p-6 sm:p-8 shadow-2xl animate-in zoom-in-95 duration-300 relative">
              <div className="flex items-center justify-between mb-8 border-b border-slate-100 pb-4">
                <div className="flex items-center space-x-3">
                   <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-[#EA580C]">
                      <Laptop className="w-6 h-6" />
                   </div>
                   <div>
                      <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">{editingExamId ? 'Edit' : 'New'} Assessment</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Configure your professional CBT parameters</p>
                   </div>
                </div>
                <button onClick={() => setShowSetupModal(false)} className="p-2 bg-slate-50 text-slate-400 hover:text-rose-500 rounded-xl transition-colors"><X className="w-6 h-6" /></button>
              </div>

              <form onSubmit={handleSaveAssessment} className="space-y-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                        <ModernSelect
                          label="Target Programme"
                          value={setupData.programmeId}
                          onChange={(val) => setSetupData({ ...setupData, programmeId: val })}
                          options={programmes.map(p => ({ value: p.id, label: p.name }))}
                        />
                        <ModernSelect
                          label="Department"
                          value={setupData.department}
                          onChange={(val) => setSetupData({ ...setupData, department: val as any })}
                          options={[
                            { value: 'All', label: 'All Dept' },
                            { value: 'Science', label: 'Science' },
                            { value: 'Commercial', label: 'Commercial' },
                            { value: 'Arts', label: 'Arts' },
                          ]}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block font-black text-slate-700 uppercase tracking-widest text-[10px]">Select Subject</label>
                        <ModernSelect
                          value={setupData.subjectIds[0] || ''}
                          onChange={(val) => setSetupData({ ...setupData, subjectIds: [val] })}
                          options={[
                            { value: '', label: 'Select Subject...' },
                            ...allSubjects.map(s => ({ value: s.id, label: s.name }))
                          ]}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block font-black text-slate-700 uppercase tracking-widest text-[10px]">Topic / Focus Area</label>
                        <input
                          type="text"
                          value={setupData.topic || ''}
                          onChange={(e) => setSetupData({...setupData, topic: e.target.value})}
                          placeholder="e.g. Calculus, Atomic Structure, etc."
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-medium outline-none focus:bg-white focus:border-orange-500 transition-all text-xs"
                        />
                      </div>

                      <div className="flex flex-row items-center gap-6 py-2">
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
                    </div>

                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                        <ModernSelect
                          label="Duration Type"
                          value={setupData.hasDuration ? 'yes' : 'no'}
                          onChange={(val) => setSetupData({...setupData, hasDuration: val === 'yes'})}
                          options={[
                            { value: 'yes', label: 'Fixed Duration' },
                            { value: 'no', label: 'No Duration' }
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
                          <div className="flex flex-col">
                            <label className="block font-black text-slate-700 uppercase tracking-widest mb-1.5 text-[10px]">Start Window</label>
                            <div className="relative flex items-center group/input">
                              <input
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
                          </div>
                          <div className="flex flex-col">
                            <label className="block font-black text-slate-700 uppercase tracking-widest mb-1.5 text-[10px]">End Window</label>
                            <div className="relative flex items-center group/input">
                              <input
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
                          </div>
                      </div>

                      <div className="space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          {setupData.mode !== 'Essay' && setupData.frequency === 'General' && (
                            <ModernSelect
                              label={setupData.mode === 'Both' ? "Points / MCQ" : "Points / Question"}
                              value={setupData.scorePerQuestion}
                              onChange={(val) => setSetupData({...setupData, scorePerQuestion: val})}
                              options={[
                                { value: 1, label: '1 Point per Question' },
                                { value: 2, label: '2 Points per Question' },
                                { value: 3, label: '3 Points per Question' },
                                { value: 5, label: '5 Points per Question' }
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

                <div className="space-y-6 pt-8 border-t border-slate-100">
                  <div className="space-y-3">
                    <label className="block font-black text-slate-700 uppercase tracking-widest text-[10px]">Assessment Mode</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['MCQ', 'Essay', 'Both'] as const).map(m => (
                        <button
                          key={m}
                          type="button"
                          disabled={parsedQuestions.length > 0}
                          onClick={() => setSetupData({...setupData, mode: m})}
                          className={`py-3 rounded-xl font-black transition-all border text-[12px] uppercase tracking-widest ${setupData.mode === m ? 'bg-orange-50 border-orange-200 text-[#EA580C]' : 'bg-slate-50 border-slate-200 text-slate-400'} ${parsedQuestions.length > 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="block font-black text-slate-700 uppercase tracking-widest text-[10px]">Question Acquisition Mode</label>
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

                  {setupData.questionInputMode === 'AI' ? (
                    <div className="p-5 bg-orange-50 border border-orange-100 rounded-2xl space-y-4 animate-in slide-in-from-top-2">
                       <div className="flex items-center justify-between">
                         <div className="flex items-center gap-2">
                           <Sparkles className="w-4 h-4 text-[#EA580C]" />
                           <label className="block font-black text-orange-950 uppercase tracking-widest text-[10px]">AI Instruction Prompt</label>
                         </div>
                         <button
                           type="button"
                           onClick={handleAutoFillPrompt}
                           className="px-3 py-1.5 bg-white text-[#EA580C] hover:bg-orange-100/60 border border-orange-200 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all shadow-xs active:scale-95"
                           title="Auto-fill dynamic prompt from current setup settings"
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
                           className="w-full h-36 bg-white border border-orange-200 rounded-xl p-3.5 text-xs text-slate-800 font-mono leading-relaxed outline-none focus:border-orange-500 resize-none"
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
                         const hasGeneratedBefore = parsedQuestions.length > 0 || generatedQuestions.length > 0;
                         return (
                           <button 
                             type="button"
                             disabled={generatingAI}
                             onClick={handleGenerateAIQuestions}
                             className={`w-full py-3 text-white font-black uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-50 ${
                               hasGeneratedBefore ? 'bg-slate-900 hover:bg-slate-800' : 'bg-[#EA580C] hover:bg-orange-600'
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
                  ) : (
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
                            <div className="bg-slate-900 rounded-lg p-4 font-mono text-[10px] text-slate-300 leading-relaxed max-h-48 overflow-y-auto">
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
                            <div className="bg-slate-900 rounded-lg p-4 font-mono text-[10px] text-slate-300 leading-relaxed max-h-48 overflow-y-auto">
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

                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                           <label className="font-black text-slate-700 uppercase tracking-widest text-[10px]">Paste Content Below</label>
                           <button type="button" onClick={() => {setPastedText(''); setParsedQuestions([]);}} className="text-[10px] font-black text-rose-500 uppercase hover:underline">
                              Clear All
                           </button>
                        </div>
                        
                        <textarea
                          value={pastedText || ''}
                          onChange={(e) => setPastedText(e.target.value)}
                          placeholder="Paste questions here following the guides above..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-medium outline-none focus:border-orange-500 h-48 resize-none"
                        />
                        <button 
                          type="button"
                          onClick={() => parsePastedQuestions(pastedText)}
                          className="w-full py-4 bg-slate-900 text-white font-black uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-lg"
                        >
                          <Plus className="w-4 h-4" />
                          Process & Parse Questions
                        </button>
                      </div>
                    </div>
                  )}

                  {(parsedQuestions.length > 0 || generatedQuestions.length > 0) && (
                    <div className="space-y-4 pt-4">
                      <div className="flex items-center justify-between bg-blue-50 p-4 rounded-xl border border-blue-100">
                          <span className="font-black uppercase tracking-widest text-blue-600 text-[10px]">Ready for Professional Preview ({parsedQuestions.length || generatedQuestions.length})</span>
                          <button type="button" onClick={() => {setParsedQuestions([]); setGeneratedQuestions([]);}} className="text-[10px] font-black text-rose-500 uppercase">Clear All</button>
                      </div>

                      <div className="grid grid-cols-1 gap-6 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                        {(parsedQuestions.length > 0 ? parsedQuestions : generatedQuestions).map((q, i) => (
                          <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm transition-all hover:shadow-md space-y-4">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                              <span className="font-black text-blue-600 uppercase tracking-widest text-lg">Question {i + 1}</span>
                              <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${q.type === 'Essay' ? 'text-blue-600 bg-blue-50' : 'text-emerald-600 bg-emerald-50'}`}>
                                  {q.type || 'MCQ'} Mode
                              </span>
                            </div>
                            
                              {q.type === 'Essay' ? (
                                <EssayQuestion 
                                  question={q}
                                  mode="preview"
                                  theme="light"
                                  alloc={allocateEssayMarks(parsedQuestions.length > 0 ? parsedQuestions : generatedQuestions, (setupData.essayMarksPerQuestion || 20))[i]}
                                />
                              ) : (
                                <div className="space-y-4">
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
                                  {q.explanation && (
                                    <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl space-y-2">
                                       <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Explanation</span>
                                       <MathText text={q.explanation} className="text-xs text-slate-700 leading-relaxed italic" />
                                    </div>
                                  )}
                                </div>
                              )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-8 border-t border-slate-100 flex items-center justify-between">
                  <button 
                    type="button" 
                    onClick={() => setShowSetupModal(false)} 
                    className="px-6 py-3 text-slate-400 font-black uppercase tracking-widest text-[10px] hover:text-rose-500 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={isSaving || (parsedQuestions.length === 0 && generatedQuestions.length === 0)}
                    className="px-10 py-3.5 bg-[#EA580C] text-white font-black text-[12px] uppercase tracking-widest rounded-xl shadow-xl shadow-orange-100 disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center gap-2 min-w-[160px]"
                  >
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : null}
                    <span>{editingExamId ? 'Update Assessment' : 'Publish'}</span>
                  </button>
                </div>
              </form>
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
                        </div>
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
                              <div className="pl-6">
                                <MathText text={cleanOptionText(q.options[q.correctAnswer])} className="text-xs font-bold text-emerald-900" />
                              </div>
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
                 ))
                )}
            </div>

            <div className="p-4 md:p-6 border-t border-slate-200 flex items-center justify-end shrink-0 bg-slate-50/50">
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
      {/* Assessment Insights Modal - Mirroring Admin Portal Style */}
      {showAnalyticsModal && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-blue-600 p-6 text-white relative">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md">
                  <BarChart2 className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-black text-xl tracking-tight leading-tight">Assessment Insights</h3>
                  <p className="text-white/80 text-xs font-medium">{showAnalyticsModal.title}</p>
                </div>
              </div>
              <button
                onClick={() => setShowAnalyticsModal(null)}
                className="absolute top-6 right-6 text-white/60 hover:text-white p-1"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Total Attempts</span>
                  <span className="text-2xl font-black text-slate-900">
                    {results.filter(r => r.examId === showAnalyticsModal.id).length}
                  </span>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Avg. Score</span>
                  <span className="text-2xl font-black text-emerald-600">
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
                <h4 className="font-black text-slate-900 text-sm uppercase tracking-widest">Performance Snapshot</h4>
                <div className="space-y-3">
                  {(() => {
                    const examResults = results.filter(r => r.examId === showAnalyticsModal.id);
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
                          { label: 'Completion Rate', value: Math.min(100, completionRate), color: 'bg-blue-500' },
                          { label: 'Accuracy', value: avgAccuracy, color: 'bg-emerald-500' },
                          { label: 'Participation', value: examResults.length > 0 ? 100 : 0, color: 'bg-orange-500' }
                        ].map((stat, i) => (
                          <div key={i} className="space-y-1.5">
                            <div className="flex justify-between text-[10px] font-black uppercase tracking-tighter text-slate-500">
                              <span>{stat.label}</span>
                              <span>{stat.value}%</span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div 
                                className={`h-full ${stat.color} transition-all duration-1000`} 
                                style={{ width: `${stat.value}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </>
                    );
                  })()}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                 <button
                   onClick={() => setShowAnalyticsModal(null)}
                   className="w-full py-3 bg-slate-900 text-white font-black uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-all shadow-lg"
                 >
                   Close Insights
                 </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Student Result Detailed Slip Modal - Reuse the style from student portal */}
      {selectedStudentResult && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 bg-black/90 backdrop-blur-md overflow-y-auto">
          <div className="bg-white rounded-[32px] max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-300">
            {/* Modal Header */}
            <div className="bg-slate-950 text-white p-4 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <BarChart2 className="w-4 h-4 text-orange-400" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">
                  Official Performance Analytics
                </span>
              </div>
              <button
                onClick={() => setSelectedStudentResult(null)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Printable Slip Paper Body */}
            <div className="p-6 space-y-6 bg-white text-slate-900">
              {/* Slip Header */}
              <div className="text-center pb-5 border-b-2 border-slate-900 space-y-1.5">
                <div className="w-12 h-12 rounded-2xl bg-[#EA580C] text-white flex items-center justify-center font-black text-xl mx-auto mb-2 shadow-lg shadow-orange-100">
                  EX
                </div>
                <h2 className="text-lg font-black tracking-tight uppercase text-slate-900">
                  Excellence Tutorial Centre
                </h2>
                <div className="inline-block px-4 py-1 bg-slate-100 text-slate-800 rounded-full text-[10px] font-black uppercase tracking-[0.2em]">
                  Student Assessment Certificate
                </div>
              </div>

              {/* Bio Information */}
              <div className="grid grid-cols-1 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs">
                <div>
                  <span className="text-[9px] text-slate-400 uppercase font-black block tracking-tighter mb-0.5">
                    Student Name
                  </span>
                  <span className="font-black text-slate-900 truncate block">{selectedStudentResult.studentName}</span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 uppercase font-black block tracking-tighter mb-0.5">
                    Completion Date
                  </span>
                  <span className="font-bold text-slate-700">{selectedStudentResult.date}</span>
                </div>
              </div>

              {/* Score Breakdown */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-[11px] text-left">
                  <thead className="bg-slate-900 text-white font-black uppercase tracking-widest">
                    <tr>
                      <th className="p-3">Subject</th>
                      <th className="p-3 text-center">Max</th>
                      <th className="p-3 text-center">Score</th>
                      <th className="p-3 text-right">Grade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedStudentResult.scores.map((s, sIdx) => {
                      const exam = exams.find(e => e.id === selectedStudentResult.examId);
                      const displaySubject = s.subject === 'Total' && exam
                        ? exam.subjects.join(', ')
                        : s.subject;

                      return (
                        <tr key={sIdx} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3 font-black text-slate-800">
                            {displaySubject}
                          </td>
                          <td className="p-3 text-center font-mono text-slate-500">{s.maxScore}</td>
                          <td className="p-3 text-center font-mono font-black text-[#EA580C]">
                            {s.score}
                          </td>
                          <td className="p-3 text-right font-black text-emerald-700">
                            {Math.round((s.score / s.maxScore) * 100)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-center pt-2">
                <div className="text-center p-3 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 bg-slate-50/50">
                  <span className="text-[9px] font-black uppercase tracking-widest block">
                    Official Performance Record
                  </span>
                  <span className="text-[8px] font-mono opacity-60 uppercase">Reference: {selectedStudentResult.id.split('-').pop()}</span>
                </div>
              </div>

              <button
                onClick={() => setSelectedStudentResult(null)}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-slate-800 transition-all active:scale-95 mt-4"
              >
                Back to Analytics
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
