import React, { useState, useEffect } from 'react';
import { ModernSelect } from '../../ui/ModernSelect';
import { useApp } from '../../../context/AppContext';
import { Student, CBTExam, QuizQuestion, StudentResult, EssayPart, EssaySubPart } from '../../../types';
import { CalculatorModal } from '../CalculatorModal';
import { StudentMockTab } from './StudentMockTab';
import { EssayQuestion } from '../../common/EssayQuestion';
import { flattenEssayAnswers, getEssayStructure } from '../../../utils/essay';
import { gradeAllEssays } from '../../../utils/essayGrading';
import { MathText, cleanOptionText } from '../../common/MathText';
import confetti from 'canvas-confetti';
import {
  Laptop,
  Clock,
  Calculator,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RotateCcw,
  Award,
  HelpCircle,
  BookOpen,
  History,
  Archive,
  X,
  MoreVertical,
  BarChart2,
  Play,
  Cpu
} from 'lucide-react';
import { 
  collection, 
  onSnapshot,
  doc,
  updateDoc,
  increment
} from 'firebase/firestore';
import { db, auth } from '../../../firebase';

interface CbtTabProps {
  student: Student;
  onHideBottomNav?: (hide: boolean) => void;
  initialSubjectFilter?: string | null;
  directReviewExamId?: string | null;
  directReviewResult?: StudentResult | null;
  onExitReview?: () => void;
  lockedFrequency?: 'General' | 'Mock';
  hideFrequencyToggle?: boolean;
  onGoToProfile?: () => void;
  renderUnderHeader?: (showArchive: boolean) => React.ReactNode;
}

type ExamState = 'select' | 'in_progress' | 'submitted';

export const CbtTab: React.FC<CbtTabProps> = ({
  student,
  onHideBottomNav,
  initialSubjectFilter,
  directReviewExamId,
  directReviewResult,
  onExitReview,
  lockedFrequency,
  hideFrequencyToggle = false,
  renderUnderHeader,
  onGoToProfile,
}) => {
  const { addToast, exams, results, addResult, centreName } = useApp();

  const [examState, setExamState] = useState<ExamState>('select');
  const [selectedExam, setSelectedExam] = useState<CBTExam | null>(null);
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [showResultMetrics, setShowResultMetrics] = useState<StudentResult | null>(null);
  const [activeFrequency, setActiveFrequency] = useState<'General' | 'Mock'>(lockedFrequency || 'General');

  useEffect(() => {
    if (lockedFrequency) {
      setActiveFrequency(lockedFrequency);
    }
  }, [lockedFrequency]);
  const [subjectPracticeFilter, setSubjectPracticeFilter] = useState<string | null>(initialSubjectFilter || null);
  const [archivePage, setArchivePage] = useState(1);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  const [essayAnswers, setEssayAnswers] = useState<Record<number, string>>({});
  const [essayPartAnswers, setEssayPartAnswers] = useState<Record<number, Record<string, string>>>({});
  const [essayScores, setEssayScores] = useState<Record<number, any>>({});
  const [finalResult, setFinalResult] = useState<any>(null);
  const [flaggedQuestions, setFlaggedQuestions] = useState<Record<number, boolean>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<string>('');

  const [currentTime, setCurrentTime] = useState(new Date());

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

  // Cache Buster: 20261001-0720
  const weeks = generateWeeks();

  useEffect(() => {
    if (!selectedWeek && weeks.length > 0) {
      const now = new Date();
      const ws = new Date(now);
      ws.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
      const we = new Date(ws);
      we.setDate(ws.getDate() + 6);
      const currentRange = `${ws.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - ${we.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
      const todayRange = weeks.find(w => w.startsWith(currentRange.split(' - ')[0]));
      setSelectedWeek(todayRange || weeks[4] || weeks[0]);
    }
  }, [weeks, selectedWeek]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const shouldHide = examState === 'in_progress' || examState === 'submitted' || isReviewMode;
    onHideBottomNav?.(shouldHide);
    return () => {
      onHideBottomNav?.(false);
    };
  }, [examState, isReviewMode, onHideBottomNav]);

  useEffect(() => {
    if (directReviewExamId || directReviewResult) {
      const examId = directReviewExamId || directReviewResult?.examId;
      const targetExam = exams.find(
        (e) => e.id === examId || (directReviewResult?.examTitle && e.title === directReviewResult.examTitle)
      );
      if (targetExam) {
        setSelectedExam(targetExam);
        setIsReviewMode(true);
        if (directReviewResult) {
          setUserAnswers(directReviewResult.userAnswers || {});
          setEssayAnswers(directReviewResult.essayAnswers || {});
          setEssayPartAnswers(directReviewResult.essayPartAnswers || {});
          setEssayScores(directReviewResult.essayScores || {});
        } else {
          const currentUid = auth.currentUser?.uid || student.id;
          const res = results.find((r) => r.studentId === currentUid && r.examId === targetExam.id);
          if (res) {
            setUserAnswers(res.userAnswers || {});
            setEssayAnswers(res.essayAnswers || {});
            setEssayPartAnswers(res.essayPartAnswers || {});
            setEssayScores(res.essayScores || {});
          }
        }
        setExamState('in_progress');
      }
    }
  }, [directReviewExamId, directReviewResult, exams, results, student.id]);

  useEffect(() => {
    setArchivePage(1);
  }, [showArchive, selectedWeek, activeFrequency]);

  // Filter exams based on student's programme (department) and subjects
  const availableExams = exams.filter(ex => {
    const matchesDept = ex.department === 'All' || 
                       ex.department.toLowerCase() === (student.department || '').toLowerCase() ||
                       ex.title.toLowerCase().includes((student.programmeName || '').toLowerCase());
    
    const matchesSubjects = ex.subjects.some(sub => (student.subjects || []).includes(sub));
    
    const examStart = ex.startTime ? new Date(ex.startTime) : new Date(0);
    const examEnd = ex.endTime ? new Date(ex.endTime) : new Date(9999, 11, 31);
    const isPast = currentTime.getTime() > examEnd.getTime();
    
    // Logic: Move to archive ONLY when the day has actually passed or if it's not today in the main view
    const isToday = examStart.toDateString() === currentTime.toDateString();
    const isPastDay = new Date(currentTime.toDateString()).getTime() > new Date(examStart.toDateString()).getTime();
    
    const currentUid = auth.currentUser?.uid || student.uid || student.id;
    const hasAttempted = results.some(r => r.studentId === currentUid && r.examId === ex.id);

    const mappedFreq = (ex.frequency as string === 'General' || ex.frequency as string === 'Daily' || ex.frequency as string === 'Weekly') ? 'General' : 'Mock';
    const matchesFreq = mappedFreq === activeFrequency;
    const isLive = currentTime.getTime() >= examStart.getTime() && !isPast;

    // 1. Weekly Filter (Only for Archive)
    if (showArchive && selectedWeek && selectedWeek !== 'all' && selectedWeek.includes(' - ')) {
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
      const isArchivedNotAttempted = !hasAttempted && (isPastDay || isPast) && !isToday;
      const isEligibleForArchive = hasAttempted || isArchivedNotAttempted;
      return isEligibleForArchive && matchesFreq && (matchesDept || matchesSubjects);
    }

    const isArchivedNotAttempted = !hasAttempted && (isPastDay || isPast) && !isToday;
    const isEligibleForArchive = hasAttempted || isArchivedNotAttempted;

    // Archive Rule: Finished assessments + Not attempted assessments from past days (not current day)
    if (showArchive) {
       return isEligibleForArchive && matchesFreq && (matchesDept || matchesSubjects);
    }

    // Main View: Current day assessments (isToday) or upcoming/live assessments.
    // "Not attempted" assessments from previous days are taken to archive.
    if (!hasAttempted) {
       const isCurrentDayOrUpcoming = isToday || !isPastDay;
       return isCurrentDayOrUpcoming && matchesFreq && (matchesDept || matchesSubjects);
    }

    // Attempted assessments also show in main view if taken today
    return isToday && matchesFreq && (matchesDept || matchesSubjects);
  }).sort((a, b) => {
    const timeA = a.startTime ? new Date(a.startTime).getTime() : 0;
    const timeB = b.startTime ? new Date(b.startTime).getTime() : 0;
    return timeB - timeA;
  });

  // Overall archive assessments (independent of weekly dropdown filter)
  const allArchiveExams = exams.filter(ex => {
    const matchesDept = ex.department === 'All' || 
                       ex.department.toLowerCase() === (student.department || '').toLowerCase() ||
                       ex.title.toLowerCase().includes((student.programmeName || '').toLowerCase());
    const matchesSubjects = ex.subjects.some(sub => (student.subjects || []).includes(sub));
    const examStart = ex.startTime ? new Date(ex.startTime) : new Date(0);
    const examEnd = ex.endTime ? new Date(ex.endTime) : new Date(9999, 11, 31);
    const isPast = currentTime.getTime() > examEnd.getTime();
    const isToday = examStart.toDateString() === currentTime.toDateString();
    const isPastDay = new Date(currentTime.toDateString()).getTime() > new Date(examStart.toDateString()).getTime();
    const currentUid = auth.currentUser?.uid || student.uid || student.id;
    const hasAttempted = results.some(r => r.studentId === currentUid && r.examId === ex.id);
    const mappedFreq = (ex.frequency as string === 'General' || ex.frequency as string === 'Daily' || ex.frequency as string === 'Weekly') ? 'General' : 'Mock';
    const matchesFreq = mappedFreq === activeFrequency;
    const isArchivedNotAttempted = !hasAttempted && (isPastDay || isPast) && !isToday;
    const isEligibleForArchive = hasAttempted || isArchivedNotAttempted;
    return isEligibleForArchive && matchesFreq && (matchesDept || matchesSubjects);
  });

  // Timer countdown hook
  useEffect(() => {
    let timer: any = null;
    if (isTimerRunning && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            handleSubmitExam();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isTimerRunning, timeLeft]);

  // Format seconds to hh:mm:ss
  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h > 0 ? `${String(h).padStart(2, '0')}:` : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Launch an exam
  const handleStartExam = (exam: CBTExam, review: boolean = false) => {
    setSelectedExam(exam);
    setIsReviewMode(review);
    
    if (review) {
      const currentUid = auth.currentUser?.uid || student.id;
      const res = results.find(r => r.studentId === currentUid && r.examId === exam.id);
      if (res) {
        setUserAnswers(res.userAnswers || {});
        setEssayAnswers(res.essayAnswers || {});
        setEssayPartAnswers(res.essayPartAnswers || {});
        setEssayScores(res.essayScores || {});
      } else {
        setUserAnswers({});
        setEssayAnswers({});
        setEssayPartAnswers({});
        setEssayScores({});
      }
    } else {
      setUserAnswers({});
      setEssayAnswers({});
      setEssayPartAnswers({});
      setEssayScores({});
    }
    
    setFlaggedQuestions({});
    setCurrentIndex(0);
    setTimeLeft((exam.durationMinutes || 30) * 60);
    setIsTimerRunning(!review);
    setExamState('in_progress');
  };

  const handleSelectOption = (optionIndex: number) => {
    if (!selectedExam) return;
    setUserAnswers((prev) => ({ ...prev, [currentIndex]: optionIndex }));
  };

  const handleEssayPartInput = (partKey: string, text: string) => {
    setEssayPartAnswers((prev) => ({
      ...prev,
      [currentIndex]: {
        ...(prev[currentIndex] || {}),
        [partKey]: text
      }
    }));
  };

  const handleToggleFlag = () => {
    setFlaggedQuestions((prev) => ({ ...prev, [currentIndex]: !prev[currentIndex] }));
  };

  const handleSubmitExam = async () => {
    setIsTimerRunning(false);
    setShowSubmitModal(false);
    
    if (selectedExam && !isReviewMode) {
      const hasEssays = selectedExam.questions.some(q => q.type === 'Essay' || q.options.length === 0);
      
      // Show evaluation loading screen if there are essays to evaluate
      if (hasEssays) {
        setIsSubmitting(true);
      }

      try {
        const resultsObj = await getResults();
        const { score, total, mcqScore, mcqTotal, essayScore, essayTotal, essayGrades } = resultsObj;
        setFinalResult(resultsObj);
        
        const pct = total > 0 ? Math.round((score / total) * 100) : 0;
        const currentUid = auth.currentUser?.uid || student.id;

        // Calculate time taken
        const totalDurationSeconds = (selectedExam.durationMinutes || 30) * 60;
        const timeTakenSeconds = totalDurationSeconds - timeLeft;

        if (!currentUid) {
          addToast({ type: 'error', title: 'Submission Denied', description: 'Authentication required to save results.' });
          setIsSubmitting(false);
          return;
        }

        // Switch UI state immediately for better UX
        setExamState('submitted');
        setIsSubmitting(false);

        // Check for existing result using latest results from context
        const hasExisting = results.some(r => r.studentId === currentUid && r.examId === selectedExam.id);
        
        if (!hasExisting) {
          // Record the result
          const finalEssayAnswers: Record<number, string> = { ...essayAnswers };
          
          // Flatten structured essay answers for backward compatibility and summary views
          selectedExam.questions.forEach((q, idx) => {
            if (q.type === 'Essay' || q.options.length === 0) {
              const struct = getEssayStructure(q);
              const partAns = essayPartAnswers[idx] || {};
              if (Object.keys(partAns).length > 0) {
                finalEssayAnswers[idx] = flattenEssayAnswers(struct, partAns);
              }
            }
          });

          // Build simplified essayScores for Firestore storage
          const essayScoresStorage: Record<number, any> = {};
          Object.entries(essayGrades).forEach(([idx, grade]: [string, any]) => {
            const leaves: Record<string, any> = {};
            grade.leaves.forEach((l: any) => {
              leaves[l.key] = {
                quality: l.quality,
                got: l.got,
                max: l.max,
                feedback: l.feedback,
                missed: l.missed,
                status: l.quality >= 0.85 ? 'full' : l.quality >= 0.2 ? 'partial' : 'missed'
              };
            });
            essayScoresStorage[parseInt(idx)] = {
              got: grade.got,
              max: grade.max,
              leaves
            };
          });

          const subjectScoresStorage: Record<string, { got: number; total: number }> = {};
          if (selectedExam.subjects && selectedExam.subjects.length > 0) {
            const primarySubject = selectedExam.subjects[0];
            subjectScoresStorage[primarySubject] = { got: score, total: (mcqTotal + essayTotal) || 100 };
          } else {
            subjectScoresStorage['General'] = { got: score, total: (mcqTotal + essayTotal) || 100 };
          }

          await addResult({
            studentId: currentUid,
            examId: selectedExam.id,
            studentName: student.name || 'Anonymous Student',
            programmeName: student.programmeName || 'General Programme',
            examTitle: selectedExam.title,
            subjects: selectedExam.subjects,
            date: new Date().toISOString().split('T')[0],
            scores: [
              { subject: 'MCQ', score: mcqScore, maxScore: mcqTotal },
              { subject: 'Essay', score: essayScore, maxScore: essayTotal }
            ],
            totalScore: score,
            averagePercent: pct,
            rank: 0,
            remark: pct >= 50 ? 'Passed' : 'Needs Improvement',
            userAnswers: { ...userAnswers },
            essayAnswers: finalEssayAnswers,
            essayPartAnswers: { ...essayPartAnswers },
            essayScores: essayScoresStorage,
            essayTotalMarks: essayTotal,
            gradingMethod: 'auto',
            timeTakenSeconds,
            subjectScores: subjectScoresStorage
          });

          setEssayScores(essayScoresStorage);

          // Increment attempts count using Firestore increment
          const examRef = doc(db, 'cbt_exams', selectedExam.id);
          await updateDoc(examRef, {
            attemptsCount: increment(1)
          });
        }
      } catch (err) {
        console.error("Critical: Failed to sync assessment metrics:", err);
        addToast({ 
          type: 'error', 
          title: 'Cloud Sync Failed', 
          description: 'Result saved locally but cloud metrics failed to update. Please refresh.' 
        });
      } finally {
        setIsSubmitting(false);
      }
    } else {
       setIsSubmitting(false);
       setExamState('submitted');
    }

    try {
      // Trigger a more energetic celebration
      const count = 150;
      const defaults = {
        origin: { y: 0.7 },
        colors: ['#EA580C', '#F97316', '#FDBA74', '#FFFFFF'],
        gravity: 1.2,
        scalar: 0.7,
        drift: 0,
        ticks: 200
      };

      function fire(particleRatio: number, opts: any) {
        confetti({
          ...defaults,
          ...opts,
          particleCount: Math.floor(count * particleRatio)
        });
      }

      fire(0.25, { spread: 26, startVelocity: 55 });
      fire(0.2, { spread: 60 });
      fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
      fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
      fire(0.1, { spread: 120, startVelocity: 45 });
    } catch {}
  };

  // Score calculation for both MCQ and Essay
  const getResults = async () => {
    if (!selectedExam) return { score: 0, total: 0, mcqScore: 0, mcqTotal: 0, essayScore: 0, essayTotal: 0, essayGrades: {} };
    
    const perQ = selectedExam.scorePerQuestion || 1;
    let mcqScore = 0;
    let mcqTotal = 0;
    
    selectedExam.questions.forEach((q, idx) => {
      if (q.type === 'MCQ' || q.options.length > 0) {
        mcqTotal += perQ;
        if (userAnswers[idx] === q.correctAnswer) mcqScore += perQ;
      }
    });

    const { grades: essayGrades, got: essayScore, max: essayTotal } = await gradeAllEssays(selectedExam, essayPartAnswers, essayAnswers);

    return { 
      score: mcqScore + essayScore, 
      total: mcqTotal + essayTotal,
      mcqScore,
      mcqTotal,
      essayScore,
      essayTotal,
      essayGrades
    };
  };

  const renderModals = () => (
    <>
      {/* Result Metrics Modal - Official Slip Style */}
      {showResultMetrics && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm overflow-y-auto font-sans">
          <div className="bg-white rounded-[32px] max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-300">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-3.5 flex items-center justify-between print:hidden">
              <div className="flex items-center space-x-2">
                <BarChart2 className="w-4 h-4 text-orange-400" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">
                  Performance Analytics
                </span>
              </div>
              <button
                onClick={() => setShowResultMetrics(null)}
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
                  {centreName}
                </h2>
                <div className="inline-block px-4 py-1 bg-slate-100 text-slate-800 rounded-full text-[10px] font-black uppercase tracking-[0.2em]">
                  Assessment Report
                </div>
              </div>

              {/* Bio Information */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs">
                <div>
                  <span className="text-[9px] text-slate-400 uppercase font-black block tracking-tighter mb-0.5">
                    Student Name
                  </span>
                  <span className="font-black text-slate-900 truncate block">{showResultMetrics.studentName}</span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 uppercase font-black block tracking-tighter mb-0.5">
                    Completion Date
                  </span>
                  <span className="font-bold text-slate-700">{showResultMetrics.date}</span>
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
                    {showResultMetrics.scores
                      .filter(s => s.maxScore > 0 || showResultMetrics.scores.length === 1)
                      .map((s, sIdx) => {
                        const exam = exams.find(e => e.id === showResultMetrics.examId);
                        const subjectName = (exam?.subjects?.length ? exam.subjects.join(', ') : (showResultMetrics.subjects?.length ? showResultMetrics.subjects.join(', ') : '')) || showResultMetrics.examTitle || 'General Subject';
                        const nonZeroScores = showResultMetrics.scores.filter(sc => sc.maxScore > 0);
                        const isMultiMode = nonZeroScores.length > 1;
                        let displaySubject = '';
                        if (isMultiMode && (s.subject === 'MCQ' || s.subject === 'Essay')) {
                          displaySubject = `${subjectName} (${s.subject})`;
                        } else {
                          displaySubject = subjectName;
                        }

                        return (
                          <tr key={sIdx} className="hover:bg-slate-50 transition-colors">
                            <td className="p-3">
                              <span className="font-black text-slate-800">{displaySubject}</span>
                            </td>
                            <td className="p-3 text-center font-mono text-slate-500">{s.maxScore}</td>
                            <td className="p-3 text-center font-mono font-black text-[#EA580C]">
                              {s.score}
                            </td>
                            <td className="p-3 text-right font-black text-emerald-700">
                              {s.maxScore > 0 ? Math.round((s.score / s.maxScore) * 100) : 0}%
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              {/* Assessment Type Tag (Replaces Reference Number) */}
              {(() => {
                const exam = exams.find(e => e.id === showResultMetrics.examId);
                const mode = exam?.mode || (showResultMetrics.scores.some(s => s.subject === 'Essay') && showResultMetrics.scores.some(s => s.subject === 'MCQ') ? 'Both' : showResultMetrics.scores.some(s => s.subject === 'Essay') ? 'Essay' : 'MCQ');
                const tagLabel = mode === 'Both' ? 'MCQ & ESSAY' : mode === 'Essay' ? 'ESSAY' : 'MCQ';
                const tagClass = mode === 'Essay' 
                  ? 'bg-blue-50 text-blue-700 border-blue-200' 
                  : mode === 'Both' 
                    ? 'bg-purple-50 text-purple-700 border-purple-200' 
                    : 'bg-orange-50 text-orange-700 border-orange-200';

                return (
                  <div className="flex items-center justify-center pt-2">
                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border shadow-xs ${tagClass}`}>
                      {tagLabel}
                    </span>
                  </div>
                );
              })()}

              <button
                onClick={() => setShowResultMetrics(null)}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-slate-800 transition-all active:scale-95 mt-4"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}

      {showCalculator && <CalculatorModal isOpen={showCalculator} onClose={() => setShowCalculator(false)} />}
      
      {showSubmitModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 text-center space-y-4">
              <div className="w-20 h-20 bg-orange-50 text-orange-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
                <AlertCircle className="w-10 h-10" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">Submit Assessment?</h3>
                <p className="text-sm text-slate-500 font-medium leading-relaxed">
                  You have attempted <span className="font-black text-slate-900">{attemptedCount}</span> out of <span className="font-black text-slate-900">{selectedExam?.questionCount}</span> questions.
                </p>
              </div>
              <div className="flex flex-col gap-3 pt-2">
                <button
                  onClick={handleSubmitExam}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-black/10 hover:bg-black transition-all active:scale-95"
                >
                  YES, SUBMIT NOW
                </button>
                <button
                  onClick={() => setShowSubmitModal(false)}
                  className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-slate-200 transition-all"
                >
                  NO, KEEP WORKING
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // ---------------- VIEW 1: Exam Selection ----------------
  if (examState === 'select') {
    const isMock = activeFrequency === 'Mock' && !showArchive;
    // The Mock tab is the TOS mock system, whole and only: today's mock,
    // the past list and the leaderboard. Nothing a tutor writes reaches it.
    if (isMock) {
      return (
        <StudentMockTab
          onHideBottomNav={onHideBottomNav}
          onGoToProfile={onGoToProfile}
          onExitToGeneral={() => setActiveFrequency('General')}
        />
      );
    }
    return (
      <div className={`space-y-4 transition-all duration-500 min-h-screen relative ${showArchive ? 'bg-slate-50' : (activeFrequency === 'Mock' ? 'bg-[#EA580C]' : 'bg-slate-50')} p-4`}>
        {renderModals()}
        {/* Overscroll Background Extender */}
        {(isMock || showArchive) && (
          <div className={`absolute top-[-1000px] left-0 right-0 h-[1000px] ${showArchive ? 'bg-slate-50' : 'bg-[#EA580C]'} -z-10`} />
        )}
        <div className="flex items-center justify-between">
          {!showArchive ? (
            <div className={activeFrequency === 'Mock' ? 'text-white' : ''}>
              <h2 className="text-xl font-black tracking-tight">
                 {activeFrequency === 'Mock' ? 'CBT Mock Exams' : 'CBT Assessment'}
              </h2>
            </div>
          ) : (
            <div className="flex items-center space-x-3">
              <button 
                onClick={() => setShowArchive(false)}
                className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200 transition-all"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h2 className="text-xl font-black tracking-tight text-slate-900">Archive</h2>
            </div>
          )}
          
          {!showArchive && activeFrequency !== 'Mock' && (
            <button 
              onClick={() => setShowArchive(true)}
              className="px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all flex items-center space-x-2 bg-white text-slate-600 border-slate-200 shadow-sm"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Archive</span>
            </button>
          )}
        </div>

        {/* Under-header controls (e.g. Assessment/Performance toggle), hidden when in Archive */}
        {!showArchive && renderUnderHeader && (
          <div className="pt-0.5 animate-in fade-in duration-200">
            {renderUnderHeader(showArchive)}
          </div>
        )}

        {/* Weekly Filter - Only in Archive */}
        {showArchive && (
          <div className="mb-4 animate-in slide-in-from-top-2 duration-300">
             <ModernSelect
              value={selectedWeek}
              onChange={setSelectedWeek}
              options={[
                { value: 'all', label: 'All Archived Assessments' },
                ...weeks.map(w => ({ value: w, label: `Week: ${w}` }))
              ]}
              className="w-full"
            />
          </div>
        )}

        {showArchive && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Archive</p>
                <p className="text-xl font-black text-slate-900 mt-0.5">{allArchiveExams.length}</p>
              </div>
              <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#EA580C]">
                <Archive className="w-4 h-4" />
              </div>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Not Attempted</p>
                <p className="text-xl font-black text-rose-600 mt-0.5">
                  {allArchiveExams.filter(ex => {
                    const currentUid = auth.currentUser?.uid || student.uid || student.id;
                    return !results.some(r => r.studentId === currentUid && r.examId === ex.id);
                  }).length}
                </p>
              </div>
              <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-500">
                <AlertCircle className="w-4 h-4" />
              </div>
            </div>
          </div>
        )}

        {/* Frequency Toggle */}
        {!showArchive && !hideFrequencyToggle && !lockedFrequency && (
          <div className={`flex p-1 rounded-xl ${activeFrequency === 'Mock' ? 'bg-black/10 border border-white/10' : 'bg-slate-100'}`}>
            <button
              onClick={() => {
                 if (lockedFrequency) return;
                 setActiveFrequency('General');
                 setShowArchive(false);
              }}
              className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${
                activeFrequency === 'General' ? 'bg-white text-[#EA580C] shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Assessments
            </button>
            <button
              onClick={() => {
                 if (lockedFrequency) return;
                 setActiveFrequency('Mock');
                 setShowArchive(false);
              }}
              className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${
                activeFrequency === 'Mock' ? 'bg-white text-[#EA580C] shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Mock Exams
            </button>
          </div>
        )}

        {(() => {
          const STUDENT_ARCHIVE_PAGE_SIZE = 10;
          const totalArchivePages = Math.max(1, Math.ceil(availableExams.length / STUDENT_ARCHIVE_PAGE_SIZE));
          const displayedExams = showArchive
            ? availableExams.slice((archivePage - 1) * STUDENT_ARCHIVE_PAGE_SIZE, archivePage * STUDENT_ARCHIVE_PAGE_SIZE)
            : availableExams;

          return (
            <div className="space-y-3">
              {displayedExams.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-slate-200">
                  <Laptop className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                  <p className="text-xs text-slate-500 font-medium">No {showArchive ? 'previous' : 'active'} assessments found.</p>
                </div>
              ) : (
                displayedExams.map((exam) => {
                  const currentUid = auth.currentUser?.uid || student.uid || student.id;
                  const hasAttempted = !!results.find(r => r.studentId === currentUid && r.examId === exam.id);
                  const examStart = exam.startTime ? new Date(exam.startTime) : new Date(0);
                  const examEnd = exam.endTime ? new Date(exam.endTime) : new Date(9999, 11, 31);
                  const isTimeStarted = new Date().getTime() >= examStart.getTime();
                  const isToday = examStart.toDateString() === currentTime.toDateString();
                  const isPastDay = new Date(currentTime.toDateString()).getTime() > new Date(examStart.toDateString()).getTime();
                  const isPast = currentTime.getTime() > examEnd.getTime();
                  const isLive = isTimeStarted && !isPast && !isPastDay;

                  return (
                    <div key={exam.id} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs hover:border-orange-300 transition-all relative overflow-hidden">
                      {hasAttempted ? (
                        <div className="absolute top-0 left-0 px-3 py-1 bg-slate-500 text-white text-[8px] font-black uppercase tracking-widest z-10">
                          Finished
                        </div>
                      ) : (isPast || isPastDay) ? (
                        <div className="absolute top-0 left-0 px-3 py-1 bg-rose-500 text-white text-[8px] font-black uppercase tracking-widest z-10">
                          Not attempted
                        </div>
                      ) : null}
                      <div className="flex items-start justify-between gap-2 mt-2">
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-1.5 items-center">
                            {isLive && !hasAttempted && (
                              <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-[8px] font-black uppercase border border-emerald-200">Live Now</span>
                            )}
                            {isToday && !isTimeStarted && (
                              <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 text-[8px] font-black uppercase border border-blue-200">Starts Today</span>
                            )}
                            
                            {(exam.isClasswork || exam.isAssignment) && (
                              <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-700 text-[8px] font-black uppercase border border-purple-200">
                                {exam.isClasswork ? 'Classwork' : 'Assignment'}
                              </span>
                            )}
                            
                            {exam.tutorName && (
                              <span className="px-2 py-0.5 rounded-md bg-slate-50 text-slate-500 text-[8px] font-black uppercase border border-slate-200">
                                Tutor: {exam.tutorName}
                              </span>
                            )}
                            
                            {showArchive && (
                              <span className="px-2 py-0.5 rounded-md bg-orange-50 text-[#EA580C] text-[8px] font-black uppercase border border-orange-100">
                                 {examStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </span>
                            )}
                          </div>
                      <h3 className="text-sm font-black text-slate-900">{exam.title.replace(/General Assessment/g, 'CBT Assessment').replace(/General/g, 'CBT')}</h3>
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">
                        {exam.subjects.join(' • ')}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center space-x-3 text-xs text-slate-500">
                      <span className="flex items-center space-x-1">
                        <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                        <strong className="text-slate-700">{exam.questionCount}</strong> Qs 
                        <span className="ml-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[8px] font-black uppercase border border-slate-200">
                          {exam.mode}
                        </span>
                      </span>
                      <span className="flex items-center space-x-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <strong className="text-slate-700">{exam.durationMinutes}</strong> Mins
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {hasAttempted && (
                        <>
                          <button
                            onClick={() => {
                              // Results are already filtered for the current student in AppContext
                              const res = results.find(r => r.examId === exam.id);
                              if (res) {
                                setShowResultMetrics(res);
                              } else {
                                addToast({ 
                                  type: 'info', 
                                  title: 'Analytics Unavailable', 
                                  description: 'Your result for this assessment is still synchronizing or was not found.' 
                                });
                              }
                            }}
                            className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all cursor-pointer relative z-[20]"
                            title="View Analytics"
                          >
                            <BarChart2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleStartExam(exam, true)}
                            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest active:scale-95 shadow-lg"
                          >
                            Review
                          </button>
                        </>
                      )}
                      
                      {/* Not Attempted in Archive or Past: Review button only, NO analytics */}
                      {!hasAttempted && (isPast || isPastDay || showArchive) && (
                        <button
                          onClick={() => handleStartExam(exam, true)}
                          className="px-5 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest active:scale-95 shadow-md hover:bg-slate-800 transition-all"
                        >
                          Review
                        </button>
                      )}

                      {/* Live / Upcoming: Start button (only when NOT in archive and not past) */}
                      {!hasAttempted && !isPast && !isPastDay && !showArchive && (
                        <button
                          disabled={!isTimeStarted}
                          onClick={() => handleStartExam(exam)}
                          className={`px-6 py-2 rounded-xl text-white text-[10px] font-black uppercase tracking-widest transition-all ${
                            isTimeStarted
                              ? 'bg-[#EA580C] shadow-lg shadow-orange-100 active:scale-95' 
                              : 'bg-slate-300 cursor-not-allowed'
                          }`}
                        >
                          {isTimeStarted ? 'Start' : `Starts ${examStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`}
                        </button>
                      )}
                    </div>
                  </div>
                    </div>
                  );
                })
              )}

              {/* Archive Pagination Controls */}
              {showArchive && totalArchivePages > 1 && (
                <div className="flex items-center justify-between pt-4 pb-2 text-xs">
                  <button
                    onClick={() => setArchivePage(p => Math.max(1, p - 1))}
                    disabled={archivePage === 1}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    Previous
                  </button>
                  <span className="text-[11px] font-bold text-slate-500">
                    Page {archivePage} of {totalArchivePages} ({availableExams.length} assessments)
                  </span>
                  <button
                    onClick={() => setArchivePage(p => Math.min(totalArchivePages, p + 1))}
                    disabled={archivePage === totalArchivePages}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    );
  }

  // ---------------- VIEW 2: Results ----------------
  if (examState === 'submitted' && selectedExam) {
    const { score, total, mcqScore, mcqTotal, essayScore, essayTotal } = finalResult || { score: 0, total: 0, mcqScore: 0, mcqTotal: 0, essayScore: 0, essayTotal: 0 };
    const pct = total > 0 ? Math.round((score / total) * 100) : 0;

    return (
      <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col overflow-y-auto pb-32 animate-in fade-in duration-300">
        {renderModals()}
        <div className="max-w-3xl mx-auto w-full p-4 space-y-6">
          <div className="bg-slate-900/80 rounded-3xl p-6 text-white text-center shadow-2xl border border-slate-800 space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center mx-auto text-orange-400">
              <Award className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-black">{selectedExam.title.replace(/General Assessment/g, 'CBT Assessment').replace(/General/g, 'CBT')}</h2>
              <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest">Assessment Completed</p>
            </div>
            
            <div className="flex flex-col space-y-2">
              <div className="inline-flex items-baseline justify-center space-x-2 bg-white/5 px-6 py-3 rounded-2xl border border-white/10">
                <span className="text-3xl font-black text-amber-400">{score}</span>
                <span className="text-slate-400 text-sm font-bold">/ {total} Total Marks</span>
                <span className="text-xs font-black text-emerald-400 ml-2">({pct}%)</span>
              </div>

              {(mcqTotal > 0 || essayTotal > 0) && (
                <div className="flex items-center justify-center gap-3">
                  {mcqTotal > 0 && (
                    <div className="px-3 py-1.5 bg-white/5 rounded-xl border border-white/5 text-[10px] font-bold text-slate-400">
                      MCQ: <span className="text-white">{mcqScore}/{mcqTotal}</span>
                    </div>
                  )}
                  {essayTotal > 0 && (
                    <div className="px-3 py-1.5 bg-white/5 rounded-xl border border-white/5 text-[10px] font-bold text-slate-400">
                      Essay: <span className="text-white">{essayScore}/{essayTotal}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-xs px-4">
              <button
                onClick={() => {
                  setIsReviewMode(false);
                  setExamState('select');
                  onHideBottomNav?.(false);
                  onExitReview?.();
                }}
                className="w-full py-4 bg-[#EA580C] text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl shadow-orange-950/40 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2 border border-orange-400/20"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Back to CBT</span>
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-white px-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#EA580C]" />
              Explanations & Corrections
            </h3>
            {selectedExam.questions.map((q, idx) => (
              <div key={idx}>
                {q.type === 'MCQ' || (q.options && q.options.length > 0) ? (
                  <div className="bg-slate-900/60 rounded-3xl p-6 border border-white/10 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-white/5 pb-3">
                      <span className="text-xs font-black uppercase text-white tracking-wider flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#EA580C]" />
                        Question {idx + 1}
                      </span>
                      {userAnswers[idx] === q.correctAnswer ? (
                        <span className="text-[9px] font-black px-2.5 py-1 rounded-full uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Correct</span>
                      ) : (
                        <span className="text-[9px] font-black px-2.5 py-1 rounded-full uppercase bg-rose-500/20 text-rose-400 border border-rose-500/30">Incorrect</span>
                      )}
                    </div>
                    <MathText text={q.question} className="text-base sm:text-lg font-black text-white leading-relaxed" />
                    <div className="space-y-2.5">
                      {q.options.map((opt, oIdx) => {
                        const isCorrect = oIdx === q.correctAnswer;
                        const isSelected = oIdx === userAnswers[idx];
                        return (
                          <div
                            key={oIdx}
                            className={`p-3.5 rounded-xl text-[12px] font-bold border flex items-center gap-3 ${
                              isCorrect ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300' : 
                              isSelected ? 'bg-rose-500/15 border-rose-500 text-rose-300' :
                              'bg-white/5 border-white/10 text-slate-300'
                            }`}
                          >
                            <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black ${
                              isCorrect ? 'bg-emerald-500 text-white' : 
                              isSelected ? 'bg-rose-500 text-white' :
                              'bg-white/10 text-slate-300 border border-white/10'
                            }`}>
                              {String.fromCharCode(65 + oIdx)}
                            </span>
                            <MathText text={typeof opt === 'string' ? opt.replace(/^(?:\(?[A-Da-d]\)?[.):-]?)\s+/, '').trim() : opt} className="flex-1 font-bold" />
                            {isCorrect && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 ml-auto" />}
                          </div>
                        );
                      })}
                    </div>
                    {/* Explicit Correct Answer & Explanation Box */}
                    <div className="mt-3 p-4 bg-white/5 rounded-2xl border border-white/10 space-y-2">
                      <div className="flex items-center space-x-2 text-emerald-400">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span className="text-xs font-black uppercase tracking-wider">
                          Correct Answer: Option {typeof q.correctAnswer === 'number' && q.correctAnswer >= 0 ? String.fromCharCode(65 + q.correctAnswer) : (q.correctAnswer || 'A')}
                        </span>
                      </div>
                      {q.options && typeof q.correctAnswer === 'number' && q.options[q.correctAnswer] && (
                        <p className="text-xs sm:text-sm text-emerald-300 font-bold pl-6">
                          {typeof q.options[q.correctAnswer] === 'string' ? q.options[q.correctAnswer].replace(/^(?:\(?[A-Da-d]\)?[.):-]?)\s+/, '').trim() : q.options[q.correctAnswer]}
                        </p>
                      )}
                      {q.explanation && (
                        <div className="pt-2 border-t border-white/10 space-y-1">
                          <p className="text-[10px] font-black uppercase text-amber-400 tracking-widest">Explanation & Solution</p>
                          <MathText text={q.explanation} className="text-xs sm:text-sm text-slate-200 font-medium leading-relaxed" />
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <EssayQuestion 
                    question={q}
                    mode="review"
                    answers={essayPartAnswers[idx]}
                    legacyAnswer={essayAnswers[idx]}
                    score={essayScores[idx]}
                    theme="dark"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ---------------- VIEW 3: In Progress / Review ----------------
  if (!selectedExam) return null;

  if (isSubmitting) {
    return (
      <div className="fixed inset-0 z-[300] bg-slate-950 flex flex-col items-center justify-center p-8 text-center space-y-6">
        <div className="relative">
          <div className="w-24 h-24 rounded-full border-4 border-orange-500/20 border-t-orange-500 animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Cpu className="w-8 h-8 text-orange-500 animate-pulse" />
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-white tracking-tight">System Evaluation in Progress</h2>
          <p className="text-sm text-slate-400 font-medium leading-relaxed max-w-xs">
            Please wait while the system evaluates your responses. This will only take a moment...
          </p>
        </div>
      </div>
    );
  }

  if (isReviewMode) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
        <div className="bg-slate-900/50 backdrop-blur-xl text-white p-4 flex items-center justify-between border-b border-white/5 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-[#EA580C] flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-tight">Review Mode</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{selectedExam.title.replace(/General Assessment/g, 'CBT Assessment').replace(/General/g, 'CBT')}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pb-10 bg-slate-950 scroll-smooth">
          <div className="max-w-3xl mx-auto p-4 space-y-6 pt-6">
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 text-center mb-8">
               <span className="text-[10px] font-black text-orange-400 uppercase tracking-[0.2em]">
                 Correct answers are highlighted in green
               </span>
            </div>

            {selectedExam.questions.map((q, idx) => (
              <div key={idx} className="space-y-2">
                <div className="flex items-center justify-between px-4 pb-1">
                   <span className="text-sm sm:text-base font-black uppercase text-white tracking-wider flex items-center gap-2">
                     <span className="w-2.5 h-2.5 rounded-full bg-[#EA580C]" />
                     Question {idx + 1}
                   </span>
                </div>
                {q.type === 'MCQ' || (q.options && q.options.length > 0) ? (
                  <div className="bg-slate-900/40 rounded-[32px] p-6 sm:p-10 border border-white/5 shadow-2xl space-y-6 backdrop-blur-sm">
                    <div className="flex items-center justify-between pb-4 border-b border-white/5">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">
                        Multiple Choice
                      </span>
                      {userAnswers[idx] === undefined ? (
                         <span className="text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest bg-slate-800 text-slate-300 border border-slate-700">Not Attempted</span>
                      ) : userAnswers[idx] === q.correctAnswer ? (
                         <span className="text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Correct</span>
                      ) : (
                         <span className="text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest bg-rose-500/20 text-rose-400 border border-rose-500/30">Incorrect</span>
                      )}
                    </div>

                    <MathText text={q.question} className="text-lg sm:text-xl font-black text-white leading-relaxed" />

                    <div className="space-y-3">
                      {q.options.map((opt, oIdx) => {
                        const isCorrect = oIdx === q.correctAnswer;
                        const isSelected = oIdx === userAnswers[idx];
                        return (
                          <div
                            key={oIdx}
                            className={`w-full p-4 rounded-2xl text-left text-[13px] font-bold border transition-all flex items-center space-x-4 ${
                              isCorrect ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300' : 
                              isSelected ? 'bg-rose-500/15 border-rose-500 text-rose-300' :
                              'bg-white/5 border-white/10 text-slate-300'
                            }`}
                          >
                            <span className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono text-xs shrink-0 transition-all ${
                              isCorrect ? 'bg-emerald-500 text-white font-black' : 
                              isSelected ? 'bg-rose-500 text-white font-black' :
                              'bg-white/10 text-slate-300 font-bold border border-white/10'
                            }`}>
                              {String.fromCharCode(65 + oIdx)}
                            </span>
                            <MathText text={cleanOptionText(opt)} className="flex-1 font-bold" />
                            {isCorrect && <CheckCircle2 className="w-4 h-4 ml-auto text-emerald-400" />}
                          </div>
                        );
                      })}
                    </div>

                    {/* MCQ Correct Answer & Explanation in Review Mode */}
                    <div className="p-5 bg-white/5 border border-white/10 rounded-2xl space-y-3 mt-4">
                      <div className="flex items-center space-x-2 text-emerald-400">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span className="text-xs font-black uppercase tracking-wider">
                          Correct Answer: Option {typeof q.correctAnswer === 'number' && q.correctAnswer >= 0 ? String.fromCharCode(65 + q.correctAnswer) : (q.correctAnswer || 'A')}
                        </span>
                      </div>
                      {q.options && typeof q.correctAnswer === 'number' && q.options[q.correctAnswer] && (
                        <div className="pl-6">
                          <MathText text={cleanOptionText(q.options[q.correctAnswer])} className="text-xs sm:text-sm text-emerald-300 font-bold" />
                        </div>
                      )}
                      {q.explanation && (
                        <div className="pt-3 border-t border-white/10 space-y-1.5">
                          <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">Explanation & Solution</span>
                          <MathText text={q.explanation} className="text-xs sm:text-sm text-slate-200 font-medium leading-relaxed block" />
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <EssayQuestion 
                    question={q}
                    mode="review"
                    answers={essayPartAnswers[idx]}
                    legacyAnswer={essayAnswers[idx]}
                    score={essayScores[idx]}
                    theme="dark"
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Floating Exit Review Button */}
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-xs px-4">
          <button
            onClick={() => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
              setIsReviewMode(false);
              setExamState('select');
              onHideBottomNav?.(false);
              onExitReview?.();
            }}
            className="w-full py-4 bg-[#EA580C] text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-2xl shadow-orange-950/40 hover:scale-105 active:scale-95 transition-all flex items-center justify-center space-x-2 border border-orange-400/20"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Back to CBT</span>
          </button>
        </div>
      </div>
    );
  }

  const currentQ = selectedExam.questions[currentIndex];
  
  const attemptedCount = selectedExam.questions.filter((q, idx) => {
    if (q.type === 'MCQ' || q.options.length > 0) {
      return userAnswers[idx] !== undefined;
    } else {
      const partAns = essayPartAnswers[idx] || {};
      const hasAnyPart = Object.values(partAns).some(v => (v as string).trim().length > 0);
      return hasAnyPart || (essayAnswers[idx]?.trim().length > 0);
    }
  }).length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
      {renderModals()}
      <div className="bg-slate-900/50 backdrop-blur-xl text-white p-4 flex items-center justify-between border-b border-white/5 shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center">
            <Laptop className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-sm font-black uppercase tracking-tight">
            {selectedExam.frequency === 'Mock' ? 'CBT Mock' : 'CBT Assessment'}
          </h2>
        </div>
        <div className="flex items-center space-x-3">
          <button onClick={() => setShowCalculator(true)} className="p-2 rounded-xl bg-white/5 text-slate-400 hover:text-white transition-colors">
            <Calculator className="w-4 h-4" />
          </button>
          {!isReviewMode && (
            <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-white/5 rounded-xl font-mono text-xs font-black border border-white/10 text-amber-400">
              <Clock className="w-4 h-4" />
              <span>{formatTime(timeLeft)}</span>
            </div>
          )}
          <button 
            onClick={() => setShowSubmitModal(true)} 
            className="px-4 py-2 bg-orange-500 text-white text-[10px] font-black rounded-xl uppercase tracking-widest shadow-lg shadow-orange-900/20 active:scale-95"
          >
            FINISH
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-6">
        <div className="max-w-4xl mx-auto p-4 space-y-6">
          {currentQ.options.length > 0 ? (
            <div className="bg-slate-900/40 rounded-[32px] p-6 sm:p-10 border border-white/5 shadow-2xl space-y-8 backdrop-blur-sm">
              <div className="flex items-center justify-between pb-6 border-b border-white/5">
                <span className="text-sm sm:text-base font-black uppercase text-white tracking-wider flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#EA580C]" />
                  Question {currentIndex + 1} <span className="mx-1 text-slate-500 font-bold">/</span> <span className="text-slate-300 font-bold">{selectedExam.questionCount}</span>
                </span>
              </div>

              <MathText text={currentQ.question} className="text-lg sm:text-xl font-bold text-white leading-relaxed" />

              <div className="space-y-4">
                {currentQ.options.map((opt, oIdx) => {
                  const isSelected = userAnswers[currentIndex] === oIdx;
                  const isCorrect = isReviewMode && oIdx === currentQ.correctAnswer;
                  const isWrong = isReviewMode && isSelected && oIdx !== currentQ.correctAnswer;

                  return (
                    <button
                      key={oIdx}
                      disabled={isReviewMode}
                      onClick={() => handleSelectOption(oIdx)}
                      className={`w-full p-5 rounded-2xl text-left text-[13px] font-bold border transition-all flex items-center space-x-4 ${
                        isCorrect ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' :
                        isWrong ? 'bg-rose-500/10 border-rose-500 text-rose-400' :
                        isSelected ? 'bg-orange-500/10 border-orange-500 text-orange-400' : 
                        'bg-white/5 border-white/10 text-slate-300 hover:bg-white/[0.08]'
                      }`}
                    >
                      <span className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono text-xs shrink-0 transition-all ${
                        isCorrect ? 'bg-emerald-500 text-white font-black' :
                        isWrong ? 'bg-rose-500 text-white font-black' :
                        isSelected ? 'bg-orange-500 text-white shadow-lg shadow-orange-900/40 font-black' : 
                        'bg-white/10 text-slate-400 border border-white/10 font-bold'
                      }`}>
                        {String.fromCharCode(65 + oIdx)}
                      </span>
                      <MathText text={cleanOptionText(opt)} className="flex-1 font-bold" />
                      {isCorrect && <CheckCircle2 className="w-4 h-4 ml-auto text-emerald-500" />}
                      {isWrong && <XCircle className="w-4 h-4 ml-auto text-rose-500" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <EssayQuestion 
              question={currentQ}
              mode="attempt"
              answers={essayPartAnswers[currentIndex]}
              onChange={handleEssayPartInput}
              theme="dark"
            />
          )}

          <div className="text-center">
            <div className="inline-flex items-center space-x-2 px-4 py-1.5 bg-white/5 rounded-full border border-white/5">
              <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {attemptedCount} Attempted <span className="mx-1 text-slate-700">•</span> {selectedExam.questionCount} Total
              </p>
            </div>
          </div>

          {/* Question Palette - Below Question */}
          <div className="bg-slate-900/40 rounded-2xl p-4 border border-white/5 shadow-xl">
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
              {selectedExam.questions.map((q, idx) => {
                const isAnswered = q.options.length > 0 
                  ? userAnswers[idx] !== undefined 
                  : (Object.keys(essayPartAnswers[idx] || {}).some(k => essayPartAnswers[idx][k]?.trim()) || essayAnswers[idx]?.trim());
                const isActive = currentIndex === idx;
                
                return (
                  <button
                    key={idx}
                    onClick={() => setCurrentIndex(idx)}
                    className={`h-10 rounded-lg flex items-center justify-center text-xs font-black transition-all border ${
                      isActive 
                        ? 'bg-orange-500 text-white border-orange-500 scale-110 shadow-lg shadow-orange-900/20 z-10' 
                        : isAnswered 
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' 
                          : 'bg-white/5 border-white/10 text-slate-500 hover:border-white/20'
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-900/80 backdrop-blur-xl border-t border-white/5 p-4 flex items-center justify-between gap-4 shrink-0">
        <button
          onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
          disabled={currentIndex === 0}
          className="flex-1 py-4 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-white/10 transition-all disabled:opacity-20"
        >
          Previous
        </button>
        <button
          onClick={() => {
            if (currentIndex < selectedExam.questionCount - 1) {
              setCurrentIndex(prev => prev + 1);
            } else if (isReviewMode) {
              setIsReviewMode(false);
              setExamState('select');
              onHideBottomNav?.(false);
              onExitReview?.();
            } else {
              setShowSubmitModal(true);
            }
          }}
          className="flex-1 py-4 bg-orange-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-orange-900/20 active:scale-95 transition-all"
        >
          {currentIndex === selectedExam.questionCount - 1 ? (isReviewMode ? 'Exit Review' : 'FINISH') : 'Next Question'}
        </button>
      </div>

    </div>
  );
};
