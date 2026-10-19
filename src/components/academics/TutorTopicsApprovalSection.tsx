import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  BookOpen,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileCheck,
  Check,
  RotateCcw,
  GraduationCap,
  MessageSquare,
  Search,
} from 'lucide-react';

export interface TutorTopicProposal {
  id: string;
  topicTitle: string;
  subject: string;
  department: 'Science' | 'Commercial' | 'Arts' | 'General';
  tutorName: string;
  examBoard: string;
  weekNumber: number;
  learningObjectives: string;
  tutorConsent: boolean;
  status: 'pending_approval' | 'approved' | 'revision_requested';
  feedbackNotes?: string;
  submittedAt: string;
}

const INITIAL_TOPIC_PROPOSALS: TutorTopicProposal[] = [
  {
    id: 'top-1',
    topicTitle: 'Electrolysis, Faraday’s Laws & Quantitative Industrial Applications',
    subject: 'Chemistry',
    department: 'Science',
    tutorName: 'Dr. Emmanuel Adeyemi',
    examBoard: 'JAMB & WAEC',
    weekNumber: 3,
    learningObjectives: 'Calculations involving moles of electrons, quantitative cathode deposition, electroplating techniques.',
    tutorConsent: true,
    status: 'approved',
    submittedAt: 'Yesterday, 14:20',
  },
  {
    id: 'top-2',
    topicTitle: 'Calculus: Rates of Change, Maxima & Minima in Physics Problems',
    subject: 'General Mathematics',
    department: 'General',
    tutorName: 'Engr. Babatunde Lawal',
    examBoard: 'JAMB / UTME',
    weekNumber: 4,
    learningObjectives: 'First & second order derivatives, stationary points, real-life optimization problem solving.',
    tutorConsent: true,
    status: 'pending_approval',
    submittedAt: 'Today, 08:45',
  },
  {
    id: 'top-3',
    topicTitle: 'Double Entry System & Preparation of 3-Column Cash Book',
    subject: 'Financial Accounting',
    department: 'Commercial',
    tutorName: 'Grace Okafor',
    examBoard: 'WAEC / NECO',
    weekNumber: 2,
    learningObjectives: 'Discount allowed vs discount received postings, contra entries, cash and bank reconciliation.',
    tutorConsent: true,
    status: 'pending_approval',
    submittedAt: 'Today, 10:15',
  },
  {
    id: 'top-4',
    topicTitle: 'Themes & Character Analysis in Wole Soyinka’s "The Lion and the Jewel"',
    subject: 'Literature in English',
    department: 'Arts',
    tutorName: 'Grace Okafor',
    examBoard: 'WAEC Literature',
    weekNumber: 5,
    learningObjectives: 'Conflict between traditional African beliefs and Western modernization, dramatic irony.',
    tutorConsent: false,
    status: 'revision_requested',
    feedbackNotes: 'Please attach specific sample essay questions and past WAEC questions.',
    submittedAt: '2 days ago',
  },
];

export const TutorTopicsApprovalSection: React.FC = () => {
  const { addToast } = useApp();
  const [proposals, setProposals] = useState<TutorTopicProposal[]>(INITIAL_TOPIC_PROPOSALS);
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [search, setSearch] = useState('');

  const filtered = proposals.filter((p) => {
    const matchesStatus = filterStatus === 'All' || p.status === filterStatus;
    const matchesSearch =
      p.topicTitle.toLowerCase().includes(search.toLowerCase()) ||
      p.subject.toLowerCase().includes(search.toLowerCase()) ||
      p.tutorName.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const handleApprove = (id: string, title: string) => {
    setProposals((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: 'approved' } : p))
    );
    addToast({
      type: 'success',
      title: 'Topic Approved by Admin',
      description: `"${title}" has been authorized and published to students' syllabus.`,
    });
  };

  const handleRequestRevision = (id: string, title: string) => {
    const reason = window.prompt(
      'Enter feedback / revision required for tutor:',
      'Please align sub-topics with the latest 2026 JAMB/WAEC syllabus breakdown.'
    );
    if (reason === null) return;

    setProposals((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, status: 'revision_requested', feedbackNotes: reason } : p
      )
    );
    addToast({
      type: 'info',
      title: 'Revision Feedback Sent',
      description: `Tutor notified to update "${title}".`,
    });
  };

  const pendingCount = proposals.filter((p) => p.status === 'pending_approval').length;
  const approvedCount = proposals.filter((p) => p.status === 'approved').length;

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden space-y-4 p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <div className="flex items-center space-x-2">
            <h3 className="font-bold text-slate-900 text-sm">
              Tutor Topic Proposals & Consent Approvals
            </h3>
            {pendingCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 animate-pulse">
                {pendingCount} Pending Review
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Tutors propose lesson topics & affirm consent from the Tutor Portal; Administrators review and authorize for the syllabus.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1 bg-slate-50 p-1 rounded-lg border border-slate-200 text-xs">
            {(['All', 'pending_approval', 'approved', 'revision_requested'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`px-2.5 py-1 rounded font-semibold text-[11px] transition-colors ${
                  filterStatus === st
                    ? 'bg-[#EA580C] text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st === 'All'
                  ? 'All'
                  : st === 'pending_approval'
                  ? 'Pending'
                  : st === 'approved'
                  ? 'Approved'
                  : 'Needs Revision'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {filtered.map((topic) => (
          <div
            key={topic.id}
            className={`p-4 rounded-xl border transition-all space-y-2.5 ${
              topic.status === 'approved'
                ? 'bg-white border-emerald-200/80 shadow-2xs'
                : topic.status === 'revision_requested'
                ? 'bg-rose-50/30 border-rose-200'
                : 'bg-amber-50/20 border-amber-200 shadow-2xs'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                    Week {topic.weekNumber}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                    {topic.subject}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-500">
                    {topic.examBoard}
                  </span>
                </div>
                <h4 className="font-bold text-slate-900 text-sm mt-1.5">{topic.topicTitle}</h4>
              </div>

              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 border ${
                  topic.status === 'approved'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : topic.status === 'revision_requested'
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}
              >
                {topic.status === 'approved'
                  ? '✓ Approved'
                  : topic.status === 'revision_requested'
                  ? 'Revision Requested'
                  : 'Pending Approval'}
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-white/70 p-2 rounded-lg border border-slate-100">
              <strong className="text-slate-700 block text-[11px] mb-0.5">Learning Objectives:</strong>
              {topic.learningObjectives}
            </p>

            {topic.feedbackNotes && (
              <div className="p-2 bg-rose-50 rounded-lg border border-rose-200 text-xs text-rose-800">
                <span className="font-bold block text-[10px] uppercase">Admin Feedback Note:</span>
                {topic.feedbackNotes}
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px]">
              <div className="flex items-center space-x-1.5 text-slate-500">
                <GraduationCap className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-medium text-slate-700">{topic.tutorName}</span>
                <span className="text-slate-300">•</span>
                <span
                  className={`font-semibold ${
                    topic.tutorConsent ? 'text-emerald-600' : 'text-amber-600'
                  }`}
                >
                  {topic.tutorConsent ? '✓ Tutor Consented' : 'Consent Pending'}
                </span>
              </div>

              {topic.status === 'pending_approval' && (
                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => handleRequestRevision(topic.id, topic.topicTitle)}
                    className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
                  >
                    Feedback
                  </button>
                  <button
                    onClick={() => handleApprove(topic.id, topic.topicTitle)}
                    className="px-3 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-2xs transition-colors flex items-center space-x-1"
                  >
                    <Check className="w-3 h-3" />
                    <span>Approve Topic</span>
                  </button>
                </div>
              )}

              {topic.status === 'approved' && (
                <span className="text-[10px] text-emerald-600 font-semibold flex items-center space-x-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Synchronized to Master Timetable</span>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
