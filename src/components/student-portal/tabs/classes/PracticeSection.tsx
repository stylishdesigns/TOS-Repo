import React, { useState, useEffect, useMemo } from 'react';
import { Student } from '../../../../types';
import { Sparkles, BookOpen, ChevronRight, HelpCircle, ArrowRight, CheckCircle2 } from 'lucide-react';
import {
  BankQuestion,
  getQuestionBank,
  getStudentPracticeProgress,
  saveTopicProgress,
  calculateAccuracy,
  TopicProgress,
} from './utils/practice';
import { PracticeSession } from './PracticeSession';
import { PracticeSummary } from './PracticeSummary';

interface PracticeSectionProps {
  student: Student;
  initialSubject?: string | null;
  onSwitchToTimetable?: () => void;
}

export const PracticeSection: React.FC<PracticeSectionProps> = ({
  student,
  initialSubject,
  onSwitchToTimetable,
}) => {
  // Available subjects for student
  const availableSubjects = useMemo(() => {
    if (student.subjects && student.subjects.length > 0) {
      return student.subjects;
    }
    return ['Mathematics', 'English Language', 'Physics', 'Chemistry', 'Biology'];
  }, [student.subjects]);

  const [selectedSubject, setSelectedSubject] = useState<string>(() => {
    if (initialSubject && availableSubjects.includes(initialSubject)) {
      return initialSubject;
    }
    return availableSubjects[0] || 'Mathematics';
  });

  const [topics, setTopics] = useState<{ topic: string; total: number }[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, TopicProgress>>({});
  const [loading, setLoading] = useState<boolean>(true);

  // Active run state
  const [activeSession, setActiveSession] = useState<{
    topic: string;
    questions: BankQuestion[];
  } | null>(null);

  // Summary state after completing a session
  const [completedSummary, setCompletedSummary] = useState<{
    topic: string;
    questions: BankQuestion[];
    userAnswers: Record<number, number>;
    prevAccuracy: number;
    newAccuracy: number;
  } | null>(null);

  // Load topics & student's progress for selected subject
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    const loadData = async () => {
      const bank = getQuestionBank();
      const [fetchedTopics, studentProgress] = await Promise.all([
        bank.getTopics(selectedSubject),
        getStudentPracticeProgress(student.id || student.uid || '', selectedSubject),
      ]);

      if (isMounted) {
        setTopics(fetchedTopics);
        setProgressMap(studentProgress);
        setLoading(false);
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [selectedSubject, student.id, student.uid]);

  // Determine "Suggested for you" topic
  // Lowest accuracy with at least 5 answered; otherwise first topic of the subject
  const suggestedTopic = useMemo(() => {
    if (topics.length === 0) return null;

    // Filter topics with >= 5 answered
    const topicsWithAtLeast5 = topics
      .filter((t) => {
        const prog = progressMap[t.topic];
        return prog && prog.answered >= 5;
      })
      .map((t) => {
        const prog = progressMap[t.topic]!;
        const acc = calculateAccuracy(prog.correct, prog.answered);
        return { topic: t.topic, accuracy: acc, answered: prog.answered, total: t.total };
      });

    if (topicsWithAtLeast5.length > 0) {
      // Pick lowest accuracy
      topicsWithAtLeast5.sort((a, b) => a.accuracy - b.accuracy);
      return topicsWithAtLeast5[0];
    }

    // Default to first topic
    const first = topics[0];
    const prog = progressMap[first.topic];
    return {
      topic: first.topic,
      accuracy: prog ? calculateAccuracy(prog.correct, prog.answered) : null,
      answered: prog ? prog.answered : 0,
      total: first.total,
    };
  }, [topics, progressMap]);

  // Start a 10-question practice set
  const handleStartSet = async (topicName: string) => {
    const bank = getQuestionBank();
    const currentProgress = progressMap[topicName];
    const excludeIds = currentProgress?.recentIds || [];

    const questions = await bank.getQuestions(selectedSubject, topicName, 10, excludeIds);
    if (questions.length === 0) {
      return;
    }

    setActiveSession({
      topic: topicName,
      questions,
    });
  };

  // When practice set is completed
  const handleFinishPractice = async (userAnswers: Record<number, number>) => {
    if (!activeSession) return;

    const { topic, questions } = activeSession;
    const answeredIndices = Object.keys(userAnswers).map(Number);
    const answeredCount = answeredIndices.length;

    if (answeredCount === 0) {
      setActiveSession(null);
      return;
    }

    let correctCount = 0;
    const answeredIds: string[] = [];

    answeredIndices.forEach((idx) => {
      const q = questions[idx];
      if (q) {
        answeredIds.push(q.id);
        if (userAnswers[idx] === q.correctIndex) {
          correctCount += 1;
        }
      }
    });

    const currentProg = progressMap[topic];
    const prevAcc = currentProg ? calculateAccuracy(currentProg.correct, currentProg.answered) : 0;

    // Save progress to Firestore once for the whole set
    const updatedProg = await saveTopicProgress(
      student.id || student.uid || '',
      selectedSubject,
      topic,
      answeredCount,
      correctCount,
      answeredIds
    );

    const newAcc = calculateAccuracy(updatedProg.correct, updatedProg.answered);

    // Update local progressMap
    setProgressMap((prev) => ({
      ...prev,
      [topic]: updatedProg,
    }));

    setActiveSession(null);
    setCompletedSummary({
      topic,
      questions: questions.slice(0, Math.max(answeredCount, 1)),
      userAnswers,
      prevAccuracy: prevAcc,
      newAccuracy: newAcc,
    });
  };

  // If inside an active session:
  if (activeSession) {
    return (
      <PracticeSession
        subject={selectedSubject}
        topic={activeSession.topic}
        questions={activeSession.questions}
        onComplete={handleFinishPractice}
        onExit={handleFinishPractice}
      />
    );
  }

  // If viewing summary:
  if (completedSummary) {
    return (
      <PracticeSummary
        studentName={student.name}
        subject={selectedSubject}
        topic={completedSummary.topic}
        questions={completedSummary.questions}
        userAnswers={completedSummary.userAnswers}
        prevAccuracy={completedSummary.prevAccuracy}
        newAccuracy={completedSummary.newAccuracy}
        onBackToTopics={() => setCompletedSummary(null)}
        onAnotherSet={() => {
          const t = completedSummary.topic;
          setCompletedSummary(null);
          handleStartSet(t);
        }}
      />
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Subject Chips (horizontal, height 40, active #C2410C with white text) */}
      <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
        {availableSubjects.map((subject) => {
          const isSelected = selectedSubject === subject;
          return (
            <button
              key={subject}
              type="button"
              onClick={() => setSelectedSubject(subject)}
              className={`h-10 px-4 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center justify-center border ${
                isSelected
                  ? 'bg-[#C2410C] text-white border-[#C2410C] shadow-sm font-extrabold'
                  : 'bg-white text-slate-700 border-[#E2E8F0] hover:bg-slate-50'
              }`}
            >
              <span>{subject}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="p-8 text-center bg-white rounded-[20px] border border-[#E2E8F0] space-y-2">
          <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-medium">Loading topics for {selectedSubject}...</p>
        </div>
      ) : topics.length === 0 ? (
        /* Empty State when no questions in bank */
        <div className="p-8 text-center bg-white rounded-[20px] border border-[#E2E8F0] shadow-2xs space-y-3">
          <BookOpen className="w-10 h-10 text-slate-300 mx-auto" />
          <h4 className="text-sm font-bold text-slate-900">
            No practice questions for {selectedSubject} yet.
          </h4>
          <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
            Your centre will add them soon. Select another subject above to practice.
          </p>
        </div>
      ) : (
        <>
          {/* "Suggested for you" Dark Card */}
          {suggestedTopic && (
            <div
              style={{
                background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 55%, #0B1224 100%)',
                boxShadow: '0 8px 24px rgba(2, 6, 23, 0.18)',
              }}
              className="rounded-[20px] p-5 border border-[#334155] text-white space-y-3.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-[#FDBA74]">
                  <Sparkles className="w-4 h-4 text-orange-400" />
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-orange-300">
                    SUGGESTED FOR YOU
                  </span>
                </div>
                {suggestedTopic.accuracy !== null && (
                  <span className="text-[10px] font-bold text-rose-300 bg-rose-950/60 border border-rose-800/40 px-2 py-0.5 rounded-full font-mono">
                    {suggestedTopic.accuracy}% accuracy
                  </span>
                )}
              </div>

              <div>
                <h3 className="text-base font-extrabold text-white tracking-tight">
                  {suggestedTopic.topic}
                </h3>
                <p className="text-xs text-slate-300 mt-1">
                  {suggestedTopic.accuracy !== null
                    ? `Strengthen this area with a targeted 10-question drill.`
                    : `Start your first diagnostic practice drill for this topic.`}
                </p>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => handleStartSet(suggestedTopic.topic)}
                  className="w-full h-11 px-4 rounded-xl bg-[#EA580C] hover:bg-[#C2410C] active:scale-98 text-white font-black text-xs uppercase tracking-wider shadow-sm transition-all flex items-center justify-center space-x-2 cursor-pointer"
                >
                  <span>Start 10 questions</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Topic List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#0F172A]">
                Topics ({topics.length})
              </h3>
              <span className="text-[11px] text-slate-400 font-medium">
                Tap to practice 10 questions
              </span>
            </div>

            <div className="space-y-2.5">
              {topics.map((t) => {
                const prog = progressMap[t.topic];
                const isUntouched = !prog || prog.answered === 0;
                const accuracy = prog ? calculateAccuracy(prog.correct, prog.answered) : 0;

                // Accuracy color: emerald at 70+, orange 50-69, rose under 50
                let badgeColor = 'bg-rose-50 text-rose-700 border-rose-200';
                let barColor = 'bg-rose-500';
                if (accuracy >= 70) {
                  badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                  barColor = 'bg-emerald-500';
                } else if (accuracy >= 50) {
                  badgeColor = 'bg-orange-50 text-orange-700 border-orange-200';
                  barColor = 'bg-orange-500';
                }

                if (isUntouched) {
                  return (
                    <button
                      key={t.topic}
                      type="button"
                      onClick={() => handleStartSet(t.topic)}
                      className="w-full min-h-[64px] p-4 rounded-2xl bg-white border border-dashed border-slate-300 hover:border-orange-400 hover:bg-orange-50/20 text-left transition-all flex items-center justify-between gap-3 group cursor-pointer shadow-2xs"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center space-x-2">
                          <h4 className="text-xs font-bold text-slate-800 group-hover:text-[#EA580C] transition-colors truncate">
                            {t.topic}
                          </h4>
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                            New
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          {t.total} questions in bank · Untouched
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#EA580C] transition-colors shrink-0" />
                    </button>
                  );
                }

                return (
                  <button
                    key={t.topic}
                    type="button"
                    onClick={() => handleStartSet(t.topic)}
                    className="w-full min-h-[68px] p-4 rounded-2xl bg-white border border-[#E2E8F0] hover:border-slate-300 text-left transition-all space-y-2.5 group cursor-pointer shadow-2xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-bold text-slate-900 group-hover:text-[#EA580C] transition-colors truncate flex-1">
                        {t.topic}
                      </h4>
                      <div className="flex items-center space-x-2 shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border font-mono tabular-nums ${badgeColor}`}
                        >
                          {accuracy}%
                        </span>
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
                      </div>
                    </div>

                    {/* Thin bar & Answered count */}
                    <div className="space-y-1">
                      <div className="w-full h-1.5 bg-[#F1F5F9] rounded-full overflow-hidden">
                        <div
                          style={{ width: `${Math.min(100, Math.max(0, accuracy))}%` }}
                          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                        />
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-slate-400 font-medium">
                        <span className="tabular-nums font-mono">
                          {prog.answered} answered ({prog.correct} correct)
                        </span>
                        <span>{t.total} in bank</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Educational Note */}
      <div className="pt-2">
        <p className="text-[11px] text-[#64748B] text-center leading-relaxed">
          Practice drills do not affect your formal examination grades or performance composite.
        </p>
      </div>
    </div>
  );
};
