import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { ModernSelect } from '../ui/ModernSelect';
import {
  Award,
  Search,
  Trophy,
  Medal,
  Sparkles,
  TrendingUp,
  FileText,
  X,
  ChevronDown,
  CheckCircle,
  BarChart2,
  Clock,
  Filter,
  Users,
  BookOpen,
} from 'lucide-react';

interface PerformanceRecord {
  studentId: string;
  studentName: string;
  department: 'Science' | 'Commercial' | 'Arts';
  category: 'JAMB' | 'WAEC' | 'NECO' | 'A-Levels' | 'SAT';
  programme: string;
  type: 'Daily' | 'Weekly' | 'Mock';
  subject: string;
  score: number;
  maxScore: number;
  durationMinutes: number;
  date: string;
  rank: number;
}

export const PerformanceManager: React.FC = () => {
  const { students, programmes, exams, results, addToast, subjects: allSubjects, tutors } = useApp();

  const [activeToggle, setActiveToggle] = useState<'General' | 'Mock'>('General');
  const [selectedDepartment, setSelectedDepartment] = useState<'All' | 'Science' | 'Commercial' | 'Arts'>('All');
  const [search, setSearch] = useState('');
  const [expandedExamId, setExpandedExamId] = useState<string | null>(null);

  const [programmeTypeFilter, setProgrammeTypeFilter] = useState('All');
  const [subjectFilter, setSubjectFilter] = useState('All');
  const [tutorFilter, setTutorFilter] = useState('All');
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [performancePage, setPerformancePage] = useState(1);

  useEffect(() => {
    setPerformancePage(1);
  }, [activeToggle, selectedDepartment, programmeTypeFilter, subjectFilter, tutorFilter, selectedWeek, search]);

  // Generate weeks dynamically
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

  const currentTime = new Date();

  const filteredExams = exams.filter(exam => {
    // Live assessment or upcoming ones should never show in the performance section of the admin until after it has finished
    const examEnd = exam.endTime ? new Date(exam.endTime) : new Date(9999, 11, 31);
    const isFinished = currentTime.getTime() > examEnd.getTime();
    if (!isFinished) return false;

    const matchesFreq = exam.frequency === activeToggle;
    const matchesDept = selectedDepartment === 'All' || exam.department === selectedDepartment;
    const matchesProg = programmeTypeFilter === 'All' || exam.targetExam.includes(programmeTypeFilter);
    const matchesSub = subjectFilter === 'All' || exam.subjects.includes(subjectFilter);
    const matchesTutor = tutorFilter === 'All' || exam.tutorId === tutorFilter || (exam.tutorName && exam.tutorName === tutorFilter);
    
    let matchesWeek = true;
    if (selectedWeek && selectedWeek !== 'all' && selectedWeek.includes(' - ')) {
      const examStart = exam.startTime ? new Date(exam.startTime) : new Date(0);
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

      matchesWeek = (checkDate.getTime() >= startDate.getTime() && checkDate.getTime() <= endDate.getTime());
    }

    const matchesSearch = !search || exam.title.toLowerCase().includes(search.toLowerCase());
    
    return matchesFreq && matchesDept && matchesProg && matchesSub && matchesTutor && matchesWeek && matchesSearch;
  }).sort((a, b) => {
    const timeA = a.startTime ? new Date(a.startTime).getTime() : 0;
    const timeB = b.startTime ? new Date(b.startTime).getTime() : 0;
    return timeB - timeA;
  });

  return (
    <div id="academic-performance-page" className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Performance Analytics
          </h2>
          <p className="text-xs text-slate-500 mt-1">In-depth student performance & class leaderboards</p>
        </div>
      </div>

      {/* View Mode Toggle */}
      <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl w-fit">
        {(['General', 'Mock'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setActiveToggle(mode)}
            className={`px-8 py-2.5 text-xs font-black rounded-lg transition-all ${
              activeToggle === mode
                ? 'bg-white text-[#EA580C] shadow-md scale-105'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {mode === 'General' ? 'CBT Assessment Performance' : 'CBT Mock Performance'}
          </button>
        ))}
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 md:p-6 rounded-3xl border border-slate-200/90 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
             <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center">
                <Filter className="w-4 h-4 text-[#EA580C]" />
             </div>
             <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest leading-none">Performance Filters</h3>
          </div>

          <div className="relative flex items-center bg-slate-50/60 border border-slate-200 rounded-lg px-3 py-2 w-full sm:w-72 focus-within:bg-white focus-within:border-orange-500 transition-all">
            <Search className="w-4 h-4 text-slate-400 mr-2.5 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search assessments..."
              className="bg-transparent text-xs outline-none w-full text-slate-800 placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
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
        </div>
        
        <div className="pt-2 border-t border-slate-100">
          <ModernSelect
            value={selectedDepartment}
            onChange={(val) => setSelectedDepartment(val as any)}
            options={[
              { value: 'All', label: 'All Departments' },
              { value: 'Science', label: 'Science' },
              { value: 'Commercial', label: 'Commercial' },
              { value: 'Arts', label: 'Arts' }
            ]}
            className="w-full"
          />
        </div>
      </div>

      {/* Assessment Leaderboards List */}
      <div className="space-y-4">
        {(() => {
          const ADMIN_PERFORMANCE_PAGE_SIZE = 20;
          const totalPerformancePages = Math.max(1, Math.ceil(filteredExams.length / ADMIN_PERFORMANCE_PAGE_SIZE));
          const paginatedExams = filteredExams.slice((performancePage - 1) * ADMIN_PERFORMANCE_PAGE_SIZE, performancePage * ADMIN_PERFORMANCE_PAGE_SIZE);

          if (filteredExams.length === 0) {
            return (
              <div className="py-12 bg-white rounded-3xl border border-dashed border-slate-200 text-center space-y-3">
                 <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto">
                    <BarChart2 className="w-8 h-8 text-slate-300" />
                 </div>
                 <p className="text-xs font-medium text-slate-400">No assessments found for this category.</p>
              </div>
            );
          }

          return (
            <>
              {paginatedExams.map((exam) => {
            const examEnd = exam.endTime ? new Date(exam.endTime) : new Date(9999, 11, 31);
            const isPast = currentTime > examEnd;
            const examResults = results.filter(r => r.examId === exam.id).sort((a, b) => b.totalScore - a.totalScore);

            return (
              <div key={exam.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden transition-all shadow-sm hover:border-orange-200 relative">
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
                       <h3 className="text-slate-900 font-black text-base truncate">{exam.title.replace(/General Assessment/g, 'CBT Assessment').replace(/General/g, 'CBT')}</h3>
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
                                   <td colSpan={4} className="px-4 py-8 text-center text-slate-400 font-medium italic">
                                     No attempts recorded for this assessment yet.
                                   </td>
                                 </tr>
                               ) : (
                                 examResults.map((result, idx) => (
                                    <tr key={result.id} className="hover:bg-white transition-colors group">
                                       <td className="px-4 py-4">
                                          <span className={`flex items-center justify-center w-6 h-6 rounded-lg text-[10px] font-black ${
                                             idx === 0 ? 'bg-amber-100 text-amber-700 shadow-sm' : 
                                             idx === 1 ? 'bg-slate-100 text-slate-600' :
                                             idx === 2 ? 'bg-orange-50 text-orange-700' : 'text-slate-400'
                                          }`}>
                                             #{idx + 1}
                                          </span>
                                       </td>
                                       <td className="px-4 py-4">
                                          <div className="flex items-center space-x-2.5">
                                             <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400 border border-slate-200 group-hover:border-orange-200 transition-colors">
                                                {result.studentName.charAt(0)}
                                             </div>
                                             <div className="flex flex-col">
                                               <span className="font-bold text-slate-900 leading-tight">{result.studentName}</span>
                                             </div>
                                          </div>
                                       </td>
                                       <td className="px-4 py-4 text-center">
                                          <div className="flex flex-col items-center">
                                             <span className="font-mono text-slate-600">
                                                {result.timeTakenSeconds ? `${Math.floor(result.timeTakenSeconds / 60)}m ${result.timeTakenSeconds % 60}s` : 'N/A'}
                                             </span>
                                          </div>
                                       </td>
                                       <td className="px-4 py-4 text-right">
                                          <div className="flex flex-col items-end">
                                             <span className="text-sm font-black text-[#EA580C]">{result.totalScore}</span>
                                             <span className="text-[9px] font-bold text-slate-400 uppercase">{result.averagePercent}% Acc.</span>
                                          </div>
                                       </td>
                                    </tr>
                                 ))
                               )}
                            </tbody>
                         </table>
                      </div>
                   </div>
                 )}
              </div>
            );
          })}

          {totalPerformancePages > 1 && (
            <div className="flex items-center justify-between pt-6 pb-2 text-xs">
              <button
                onClick={() => setPerformancePage(p => Math.max(1, p - 1))}
                disabled={performancePage === 1}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Previous
              </button>
              <span className="text-xs font-bold text-slate-500">
                Page {performancePage} of {totalPerformancePages} ({filteredExams.length} assessments)
              </span>
              <button
                onClick={() => setPerformancePage(p => Math.min(totalPerformancePages, p + 1))}
                disabled={performancePage === totalPerformancePages}
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
    </div>
  );
};

