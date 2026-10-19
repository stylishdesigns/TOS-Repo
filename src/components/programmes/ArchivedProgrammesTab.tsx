import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ModernSelect } from '../ui/ModernSelect';
import {
  Archive,
  Calendar,
  Award,
  Users,
  Search,
  RotateCcw,
  CheckCircle2,
} from 'lucide-react';

interface ArchivedCohort {
  id: string;
  name: string;
  code: string;
  session: string;
  category: string;
  enrolledCount: number;
  completionRate: string;
  averageScoreOrDistinction: string;
  archiveDate: string;
  totalTuitionCollected: number;
  leadTutor: string;
}

const ARCHIVED_COHORTS: ArchivedCohort[] = [
  {
    id: 'arch-2025-jamb',
    name: '2024/2025 JAMB UTME High-Flyers Intensive',
    code: 'JAMB-2025-A',
    session: '2024/2025 Academic Session',
    category: 'JAMB',
    enrolledCount: 142,
    completionRate: '98%',
    averageScoreOrDistinction: '274.6 Avg (Top: 342)',
    archiveDate: '2025-05-15',
    totalTuitionCollected: 6390000,
    leadTutor: 'Dr. Emmanuel Adeyemi',
  },
  {
    id: 'arch-2025-waec',
    name: '2025 WAEC WASSCE May/June Masterclass',
    code: 'WAEC-2025-MJ',
    session: '2024/2025 Academic Session',
    category: 'WAEC',
    enrolledCount: 96,
    completionRate: '100%',
    averageScoreOrDistinction: '96.2% with 5+ Credits (A1-C6)',
    archiveDate: '2025-06-30',
    totalTuitionCollected: 4800000,
    leadTutor: 'Grace Okafor',
  },
  {
    id: 'arch-2025-neco',
    name: '2025 NECO Senior School Certificate Prep',
    code: 'NECO-2025-JJ',
    session: '2024/2025 Academic Session',
    category: 'NECO',
    enrolledCount: 68,
    completionRate: '97%',
    averageScoreOrDistinction: '94.8% Qualified for Direct Entry',
    archiveDate: '2025-08-10',
    totalTuitionCollected: 2720000,
    leadTutor: 'Engr. Babatunde Lawal',
  },
  {
    id: 'arch-2024-alevel',
    name: '2024 Cambridge A-Levels Oct/Nov Series',
    code: 'CAMB-2024-ON',
    session: '2023/2024 Academic Session',
    category: 'A-Levels',
    enrolledCount: 28,
    completionRate: '100%',
    averageScoreOrDistinction: '89.3% A* to B grades',
    archiveDate: '2024-12-05',
    totalTuitionCollected: 3360000,
    leadTutor: 'Dr. Emmanuel Adeyemi',
  },
  {
    id: 'arch-2024-sat',
    name: '2024 Digital SAT Fall Cohort',
    code: 'SAT-2024-FALL',
    session: '2023/2024 Academic Session',
    category: 'SAT / International',
    enrolledCount: 22,
    completionRate: '100%',
    averageScoreOrDistinction: '1380 Average (Top: 1540)',
    archiveDate: '2024-11-20',
    totalTuitionCollected: 3300000,
    leadTutor: 'Engr. Babatunde Lawal',
  },
];

export const ArchivedProgrammesTab: React.FC = () => {
  const { addToast } = useApp();
  const [search, setSearch] = useState('');
  const [selectedSession, setSelectedSession] = useState('All');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [archivedList, setArchivedList] = useState<ArchivedCohort[]>(ARCHIVED_COHORTS);

  const filtered = archivedList.filter((item) => {
    const matchesSession = selectedSession === 'All' || item.session.includes(selectedSession);
    const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
    const matchesSearch =
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.code.toLowerCase().includes(search.toLowerCase());
    return matchesSession && matchesCategory && matchesSearch;
  });

  const totalGraduated = archivedList.reduce((acc, c) => acc + c.enrolledCount, 0);
  const totalRevenuePast = archivedList.reduce((acc, c) => acc + c.totalTuitionCollected, 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Archive KPI banner */}
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center space-x-2 text-slate-600">
            <Archive className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-semibold text-slate-600 truncate">Archived Programs</span>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-2">
            {archivedList.length}
          </p>
          <p className="text-[10px] sm:text-[11px] text-slate-500 mt-1 truncate">Audited & closed</p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center space-x-2 text-blue-600">
            <Users className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-semibold text-blue-600 truncate">Past Graduates</span>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-2">
            {totalGraduated}
          </p>
          <p className="text-[10px] sm:text-[11px] text-blue-600 font-medium mt-1 truncate">97.4% syllabus</p>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="bg-white p-3 md:p-4 rounded-xl border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="grid grid-cols-2 md:flex md:items-center gap-2">
          {/* Exam Program Type Filter */}
          <ModernSelect
            label="Program Type"
            value={selectedCategory}
            onChange={(val) => setSelectedCategory(val)}
            options={[
              { value: 'All', label: 'All Exam Types' },
              { value: 'JAMB', label: 'JAMB / UTME' },
              { value: 'WAEC', label: 'WAEC WASSCE' },
              { value: 'NECO', label: 'NECO SSCE' },
              { value: 'A-Levels', label: 'Cambridge A-Levels' },
              { value: 'SAT / International', label: 'SAT / International' }
            ]}
            className="w-full md:w-48"
          />

          {/* Academic Session Filter */}
          <ModernSelect
            label="Session"
            value={selectedSession}
            onChange={(val) => setSelectedSession(val)}
            options={[
              { value: 'All', label: 'All Historical Sessions' },
              { value: '2024/2025', label: '2024/2025 Session' },
              { value: '2023/2024', label: '2023/2024 Session' }
            ]}
            className="w-full md:w-48"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex items-center bg-slate-50/60 border border-slate-200 rounded-lg px-2.5 py-1.5 flex-1 sm:w-60 focus-within:bg-white focus-within:border-orange-500 transition-all shadow-2xs">
            <Search className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search archived exam program..."
              className="bg-transparent text-xs outline-none w-full text-slate-800 placeholder:text-slate-400"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Archived Exam Program</th>
                <th className="py-3 px-4">Exam Program Type</th>
                <th className="py-3 px-4">Academic Session</th>
                <th className="py-3 px-4">Candidates Enrolled</th>
                <th className="py-3 px-4">Archived On</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((cohort) => (
                <tr key={cohort.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3.5 px-4">
                    <div>
                      <p className="font-bold text-slate-900">{cohort.name}</p>
                      <p className="text-[11px] text-slate-400 font-mono">{cohort.code}</p>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold">
                      {cohort.category}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-medium text-slate-800">
                    {cohort.session}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="font-bold text-slate-900">{cohort.enrolledCount} candidates</span>
                    <span className="block text-[10px] text-emerald-600 font-medium">
                      {cohort.completionRate} syllabus completion
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-500 font-mono text-[11px]">
                    {cohort.archiveDate}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
