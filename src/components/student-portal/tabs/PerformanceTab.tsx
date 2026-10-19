import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../../context/AppContext';
import { Student, StudentResult, CBTExam } from '../../../types';
import { PeriodControl } from './performance/PeriodControl';
import { PerformanceHero } from './performance/PerformanceHero';
import { SubjectBreakdown } from './performance/SubjectBreakdown';
import { FocusCard } from './performance/FocusCard';
import { TimeManagementCard } from './performance/TimeManagementCard';
import { SubjectSheet } from './performance/SubjectSheet';
import { AssessmentSheet } from './performance/AssessmentSheet';
import { EmptyState } from './performance/EmptyState';
import {
  Period,
  SubjectItem,
  overall,
  bySubject,
  timeUsage,
  getFocusCardData,
  getSubjectBreakdown,
} from './performance/utils/performance';

interface PerformanceTabProps {
  student: Student;
  initialSelectedResult?: StudentResult | null;
  onNavigateTab?: (tab: string, filterSubject?: string) => void;
  onReviewAnswers?: (result: StudentResult) => void;
}

export const PerformanceTab: React.FC<PerformanceTabProps> = ({
  student,
  initialSelectedResult = null,
  onNavigateTab,
  onReviewAnswers,
}) => {
  const { results, exams } = useApp();

  const [period, setPeriod] = useState<Period>('last8');
  const [selectedSubject, setSelectedSubject] = useState<SubjectItem | null>(null);
  const [selectedResult, setSelectedResult] = useState<StudentResult | null>(initialSelectedResult);

  // Sync initialSelectedResult when returning back to assessment card
  useEffect(() => {
    if (initialSelectedResult) {
      setSelectedResult(initialSelectedResult);
    }
  }, [initialSelectedResult]);

  // 1. Filter real results for this student (newest first, no mock fallback)
  const currentUid = student.uid || student.id;
  const studentResults = useMemo(() => {
    return (results || [])
      .filter((r) => r.studentId === currentUid || r.studentId === student.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [results, currentUid, student.id]);

  const examsMap = useMemo(() => {
    return new Map<string, CBTExam>((exams || []).map((e) => [e.id, e]));
  }, [exams]);

  // 2. Compute dynamic metrics using the pure calculation module
  const overallStats = useMemo(() => {
    return overall(studentResults, period, examsMap);
  }, [studentResults, period, examsMap]);

  const subjectItems = useMemo(() => {
    return bySubject(studentResults, examsMap);
  }, [studentResults, examsMap]);

  const subjectSummaries = useMemo(() => {
    return getSubjectBreakdown(studentResults, exams || []);
  }, [studentResults, exams]);

  const focusData = useMemo(() => {
    return getFocusCardData(studentResults, subjectSummaries);
  }, [studentResults, subjectSummaries]);

  const timeStats = useMemo(() => {
    return timeUsage(studentResults, examsMap);
  }, [studentResults, examsMap]);

  const handleGoToCbt = () => {
    onNavigateTab?.('cbt');
  };

  const handlePractiseSubject = (subject: string) => {
    onNavigateTab?.('cbt', subject);
  };

  const handleTriggerReview = (result: StudentResult) => {
    if (onReviewAnswers) {
      onReviewAnswers(result);
    } else {
      onNavigateTab?.('cbt');
    }
  };

  // Find cohort results for selected exam (for rank chip in AssessmentSheet)
  const allResultsForSelectedExam = useMemo(() => {
    if (!selectedResult) return [];
    return (results || []).filter(
      (r) =>
        (selectedResult.examId && r.examId === selectedResult.examId) ||
        r.examTitle === selectedResult.examTitle
    );
  }, [selectedResult, results]);

  return (
    <div className="space-y-4 px-4 py-3 max-w-lg mx-auto pb-20">
      {/* Eyebrow Header */}
      <div>
        <span className="text-[10px] font-extrabold uppercase text-[#C2410C] tracking-wider block">
          {student.name} · {student.programmeName || 'Pre-Exam Track'}
        </span>
        <h2 className="text-xl font-black text-[#0F172A] tracking-tight">
          Performance
        </h2>
      </div>

      {studentResults.length === 0 ? (
        /* Empty State */
        <EmptyState onGoToCbt={handleGoToCbt} />
      ) : (
        <>
          {/* Period Control (segmented control: Last 8 | This Term | All Time) */}
          <PeriodControl value={period} onChange={setPeriod} />

          {/* 1. Overall Average Hero Card */}
          <PerformanceHero stats={overallStats} />

          {/* 2. Subject Breakdown (Subjects list alone, with class average line, without total) */}
          <SubjectBreakdown
            subjects={subjectItems}
            onSelectSubject={(subj) => setSelectedSubject(subj)}
          />

          {/* 3. Focus Area */}
          <FocusCard
            data={focusData}
            onPractiseSubject={handlePractiseSubject}
          />

          {/* 4. Time Management (Placed directly under Focus Area) */}
          <TimeManagementCard stats={timeStats} />
        </>
      )}

      {/* Subject Bottom Sheet */}
      {selectedSubject && (
        <SubjectSheet
          subject={selectedSubject as any}
          allResults={studentResults}
          onClose={() => setSelectedSubject(null)}
          onSelectResult={(res) => {
            // Keep selectedSubject open in background so user can return back to it
            setSelectedResult(res);
          }}
        />
      )}

      {/* Assessment Detail Sheet */}
      {selectedResult && (
        <AssessmentSheet
          result={selectedResult}
          allResultsForExam={allResultsForSelectedExam}
          exam={selectedResult.examId ? examsMap.get(selectedResult.examId) : undefined}
          parentSubject={selectedSubject?.subject}
          onClose={() => setSelectedResult(null)}
          onReviewAnswers={handleTriggerReview}
        />
      )}
    </div>
  );
};

// Re-export so any older imports of ResultsTab continue to resolve seamlessly
export { PerformanceTab as ResultsTab };
