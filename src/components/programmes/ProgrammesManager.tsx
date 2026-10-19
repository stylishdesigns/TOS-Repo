import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Programme } from '../../types';
import {
  BookOpen,
  GraduationCap,
  Users,
  Award,
  Calendar,
  Clock,
  CheckCircle2,
  Plus,
  Search,
  Filter,
  Layers,
  FileText,
  DollarSign,
  ChevronRight,
  ExternalLink,
  Edit,
  X,
  Sparkles,
  BookMarked,
  Check,
  AlertCircle,
  Archive,
  ListTree,
} from 'lucide-react';
import { ModernSelect } from '../ui/ModernSelect';
import { ExamProgrammesFeesTab } from './ExamProgrammesFeesTab';
import { ExamTypeTab } from './ExamTypeTab';
import { ArchivedProgrammesTab } from './ArchivedProgrammesTab';

type ProgrammeSubsection =
  | 'Exam Type'
  | 'Exam Programmes'
  | 'Exam Programmes & Fees'
  | 'Archived Exam Programs';

export const ProgrammesManager: React.FC = () => {
  const { programmes, subjects: allSubjects, addProgramme, updateProgramme, students, settings, updateSettings, addToast } = useApp();

  const [activeSubsection, setActiveSubsection] = useState<ProgrammeSubsection>('Exam Programmes');
  const academicSessions = settings.academicSessions || [];
  const [selectedSession, setSelectedSession] = useState<string>(settings.academicSession);

  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProg, setEditingProg] = useState<Programme | null>(null);
  const [inspectingProg, setInspectingProg] = useState<Programme | null>(null);

  // Form State for Add / Edit
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    category: 'JAMB' as Programme['category'],
    fee: 45000,
    duration: '4 Months (Jan - Apr)',
    startDate: '2027-01-10',
    endDate: '2027-05-02',
    maxStudents: 100,
    status: 'Active' as Programme['status'],
    selectedSubjects: [] as string[],
  });

  const categories: Programme['category'][] = [
    'JAMB',
    'WAEC',
    'NECO',
    'A-Levels',
    'SAT / International',
  ];

  // Filtered programmes
  const filteredProgrammes = (programmes || []).filter((p) => {
    const matchesCat = selectedCategory === 'All' || p.category === selectedCategory;
    const matchesStatus = selectedStatus === 'All' || p.status === selectedStatus;
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.subjects || []).some((s) => s.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCat && matchesStatus && matchesSearch;
  });

  // Calculate high-level KPIs
  const totalEnrolled = (programmes || []).reduce((acc, p) => acc + (p.enrolledStudents || 0), 0);
  const totalCapacity = (programmes || []).reduce((acc, p) => acc + (p.maxStudents || 1), 0);
  const activeCount = (programmes || []).filter((p) => p.status === 'Active').length;

  const handleOpenAdd = () => {
    setEditingProg(null);
    setFormData({
      name: '',
      code: '',
      description: '',
      category: 'JAMB',
      fee: 45000,
      duration: '4 Months (Jan - Apr)',
      startDate: '2027-01-10',
      endDate: '2027-05-02',
      maxStudents: 100,
      status: 'Active',
      selectedSubjects: [],
    });
    setShowAddModal(true);
  };

  const handleOpenEdit = (prog: Programme) => {
    setEditingProg(prog);
    setFormData({
      name: prog.name,
      code: prog.code,
      description: prog.description,
      category: prog.category,
      fee: prog.fee,
      duration: prog.duration,
      startDate: prog.startDate,
      endDate: prog.endDate,
      maxStudents: prog.maxStudents,
      status: prog.status,
      selectedSubjects: prog.subjects || [],
    });
    setShowAddModal(true);
  };

  const toggleSubjectSelection = (subjectName: string) => {
    setFormData(prev => ({
      ...prev,
      selectedSubjects: prev.selectedSubjects.includes(subjectName)
        ? prev.selectedSubjects.filter(s => s !== subjectName)
        : [...prev.selectedSubjects, subjectName]
    }));
  };

  const handleSaveProgramme = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.code.trim()) {
      addToast({ type: 'error', title: 'Missing Information', description: 'Please provide programme name and code.' });
      return;
    }

    if (editingProg) {
      updateProgramme(editingProg.id, {
        name: formData.name,
        code: formData.code.toUpperCase(),
        description: formData.description,
        category: formData.category,
        fee: Number(formData.fee),
        duration: formData.duration,
        startDate: formData.startDate,
        endDate: formData.endDate,
        maxStudents: Number(formData.maxStudents),
        status: formData.status,
        subjects: formData.selectedSubjects,
      });
      addToast({
        type: 'success',
        title: 'Programme Updated',
        description: `${formData.name} academic programme has been modified.`,
      });
    } else {
      addProgramme({
        name: formData.name,
        code: formData.code.toUpperCase(),
        description: formData.description,
        category: formData.category,
        fee: Number(formData.fee),
        duration: formData.duration,
        startDate: formData.startDate,
        endDate: formData.endDate,
        maxStudents: Number(formData.maxStudents),
        status: formData.status,
        subjects: formData.selectedSubjects,
      });
      addToast({
        type: 'success',
        title: 'Academic Programme Added',
        description: `${formData.name} is now open for candidate admissions.`,
      });
    }

    setShowAddModal(false);
  };

  // Category Badge Colors
  const getCategoryTheme = (category: Programme['category']) => {
    switch (category) {
      case 'JAMB':
        return {
          bg: 'bg-orange-50 text-orange-700 border-orange-200',
          badge: 'bg-[#EA580C] text-white',
          border: 'border-orange-500/40',
          accent: 'text-[#EA580C]',
        };
      case 'WAEC':
        return {
          bg: 'bg-blue-50 text-blue-700 border-blue-200',
          badge: 'bg-blue-600 text-white',
          border: 'border-blue-500/40',
          accent: 'text-blue-600',
        };
      case 'NECO':
        return {
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          badge: 'bg-emerald-600 text-white',
          border: 'border-emerald-500/40',
          accent: 'text-emerald-600',
        };
      case 'A-Levels':
        return {
          bg: 'bg-purple-50 text-purple-700 border-purple-200',
          badge: 'bg-purple-600 text-white',
          border: 'border-purple-500/40',
          accent: 'text-purple-600',
        };
      case 'SAT / International':
        return {
          bg: 'bg-sky-50 text-sky-700 border-sky-200',
          badge: 'bg-sky-600 text-white',
          border: 'border-sky-500/40',
          accent: 'text-sky-600',
        };
      default:
        return {
          bg: 'bg-slate-50 text-slate-700 border-slate-200',
          badge: 'bg-slate-700 text-white',
          border: 'border-slate-300',
          accent: 'text-slate-700',
        };
    }
  };

  return (
    <div id="academic-programmes-page" className="p-4 sm:p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Exam Programs</h2>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800">
            {selectedSession.split(' ')[0]}
          </span>
        </div>

        <div className="flex items-center space-x-4">
          <div className="text-right hidden md:block">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block leading-none">Academic Session</span>
            <span className="text-sm font-black text-[#EA580C]">{settings.academicSession}</span>
          </div>
          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg shadow-sm transition-all flex items-center space-x-1.5 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Exam Programs</span>
          </button>
        </div>
      </div>

      {/* Subsections Navigation Tabs */}
      <div className="flex items-center space-x-2 bg-slate-100/80 p-1.5 rounded-xl border border-slate-200/80 overflow-x-auto scrollbar-none">
        {(
          [
            { id: 'Exam Programmes', label: 'Exam Programmes', icon: BookOpen },
            { id: 'Archived Exam Programs', label: 'Archived Exam Programs', icon: Archive },
          ] as const
        ).map((sub) => {
          const Icon = sub.icon;
          const isActive = activeSubsection === sub.id;
          return (
            <button
              key={sub.id}
              onClick={() => setActiveSubsection(sub.id)}
              className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap flex items-center space-x-2 ${
                isActive
                  ? 'bg-[#EA580C] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-500'}`} />
              <span>{sub.label}</span>
            </button>
          );
        })}
      </div>

      {/* Subsection Content */}
      {activeSubsection === 'Exam Type' && <ExamTypeTab />}
      {activeSubsection === 'Exam Programmes & Fees' && <ExamProgrammesFeesTab />}
      {activeSubsection === 'Archived Exam Programs' && <ArchivedProgrammesTab />}

      {activeSubsection === 'Exam Programmes' && (
        <div className="space-y-6">
      {/* KPI Cards (2 cards side by side on mobile) */}
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center space-x-2 text-slate-600">
            <BookOpen className="w-4 h-4 text-[#EA580C]" />
            <span className="text-xs font-semibold text-slate-600 truncate">Exam Tracks</span>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-2">
            {programmes.length}
          </p>
          <p className="text-[10px] sm:text-[11px] text-emerald-600 font-medium mt-1 truncate">
            {activeCount} currently active
          </p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center space-x-2 text-blue-600">
            <Users className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-semibold text-blue-600 truncate">Enrolled Candidates</span>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-2">
            {totalEnrolled}
          </p>
          <p className="text-[10px] sm:text-[11px] text-slate-400 mt-1 truncate">
            Across all exam batches
          </p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Category Pills */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <button
            onClick={() => setSelectedCategory('All')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
              selectedCategory === 'All'
                ? 'bg-[#EA580C] text-white shadow-2xs'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            All Programmes ({programmes.length})
          </button>
          {categories.map((cat) => {
            const count = programmes.filter((p) => p.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                  selectedCategory === cat
                    ? 'bg-[#EA580C] text-white shadow-2xs'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>

        {/* Search & Status Filter */}
        <div className="flex items-center space-x-2 w-full md:w-auto">
          <ModernSelect
            value={selectedStatus}
            onChange={(val) => setSelectedStatus(val)}
            options={[
              { value: 'All', label: 'All Statuses' },
              { value: 'Active', label: 'Active' },
              { value: 'Upcoming', label: 'Upcoming' },
              { value: 'Archived', label: 'Archived' }
            ]}
            className="w-32"
          />

          <div className="relative flex items-center bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 w-full md:w-56 focus-within:bg-white focus-within:border-orange-500 transition-all">
            <Search className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search programme, syllabus..."
              className="bg-transparent text-xs outline-none w-full text-slate-800 placeholder:text-slate-400"
            />
          </div>
        </div>
      </div>

      {/* Programme Cards Grid */}
      {filteredProgrammes.length === 0 ? (
        <div className="bg-white p-12 rounded-xl border border-slate-200/90 text-center space-y-3">
          <div className="w-12 h-12 bg-orange-50 text-[#EA580C] rounded-full flex items-center justify-center mx-auto">
            <BookOpen className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-slate-800 text-base">No Academic Programmes Found</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            No programmes match your current filters. Try changing your search query or add a new exam track.
          </p>
          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg shadow-sm"
          >
            Create Programme
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
          {filteredProgrammes.map((prog) => {
            const theme = getCategoryTheme(prog.category);
            const fillRate = Math.min(
              100,
              Math.round(((prog.enrolledStudents || 0) / (prog.maxStudents || 1)) * 100)
            );

            return (
              <div
                key={prog.id}
                className="bg-white rounded-xl border border-slate-200/90 shadow-xs hover:shadow-md hover:border-slate-300 transition-all flex flex-col justify-between overflow-hidden group"
              >
                {/* Top Banner with Exam Tag & Status */}
                <div className="p-5 pb-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide uppercase border ${theme.bg}`}
                    >
                      {prog.category} Programme
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        prog.status === 'Active'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : prog.status === 'Upcoming'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {prog.status}
                    </span>
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900 text-base group-hover:text-[#EA580C] transition-colors leading-snug">
                      {prog.name}
                    </h3>
                    <p className="text-[11px] font-mono font-semibold text-slate-400 mt-0.5">
                      Code: {prog.code} • {prog.duration}
                    </p>
                  </div>

                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                    {prog.description}
                  </p>

                  {/* Enrollment Progress Bar */}
                  <div className="pt-2 border-t border-slate-100 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium">Cohort Enrollment:</span>
                      <span className="font-bold text-slate-800">
                        {prog.enrolledStudents || 0}{' '}
                        <span className="font-normal text-slate-400">/ {prog.maxStudents} desks</span>
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          fillRate >= 90
                            ? 'bg-rose-500'
                            : fillRate >= 70
                            ? 'bg-[#EA580C]'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${fillRate}%` }}
                      />
                    </div>
                  </div>

                  {/* Subjects Pill Preview */}
                  <div className="pt-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                      Core Exam Subjects
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {prog.subjects.slice(0, 4).map((sub, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded bg-slate-50 text-slate-700 text-[11px] font-medium border border-slate-200/80"
                        >
                          {sub}
                        </span>
                      ))}
                      {prog.subjects.length > 4 && (
                        <span className="px-1.5 py-0.5 text-[10px] text-slate-400 font-semibold self-center">
                          +{prog.subjects.length - 4} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Card Footer: Fee & Action Buttons */}
                <div className="px-5 py-3.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">TUITION / TERM</span>
                    <span className="text-sm font-extrabold text-slate-900">
                      ₦{(prog.fee || 0).toLocaleString()}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={() => handleOpenEdit(prog)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white rounded-md border border-transparent hover:border-slate-200 transition-colors"
                      title="Edit Programme details"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setInspectingProg(prog)}
                      className="px-3 py-1.5 text-xs font-semibold text-[#EA580C] bg-orange-50 hover:bg-orange-100 rounded-lg border border-orange-200 shadow-2xs transition-colors flex items-center space-x-1"
                    >
                      <span>Syllabus & Info</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
        </div>
      )}

      {/* MODAL: View Syllabus & Exam Schedule Breakdown */}
      {inspectingProg && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 backdrop-blur-sm overflow-y-auto pt-10">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 my-auto">
            <div className="p-6 sm:p-7 space-y-6">
              {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center space-x-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                      getCategoryTheme(inspectingProg.category).bg
                    }`}
                  >
                    {inspectingProg.category} Exam Track
                  </span>
                  <span className="text-xs font-mono text-slate-400 font-semibold">
                    {inspectingProg.code}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-slate-900 mt-1">{inspectingProg.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{inspectingProg.description}</p>
              </div>
              <button
                onClick={() => setInspectingProg(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200/70 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block font-medium">SESSION</span>
                <p className="font-semibold text-slate-800">{settings.academicSession}</p>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-medium">DURATION</span>
                <p className="font-semibold text-slate-800">{inspectingProg.duration}</p>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-medium">TUITION FEE</span>
                <p className="font-bold text-[#EA580C]">₦{(inspectingProg.fee || 0).toLocaleString()}</p>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-medium">ENROLLMENT</span>
                <p className="font-bold text-slate-800">
                  {inspectingProg.enrolledStudents || 0} / {inspectingProg.maxStudents}
                </p>
              </div>
            </div>

            {/* Subjects & Syllabus Structure */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-1.5">
                <BookMarked className="w-4 h-4 text-[#EA580C]" />
                <span>Curriculum Modules & Tested Subjects</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {inspectingProg.subjects.map((sub, i) => (
                  <div
                    key={i}
                    className="p-2.5 bg-slate-50/70 border border-slate-200/80 rounded-lg flex items-center justify-between"
                  >
                    <span className="font-semibold text-slate-800">{sub}</span>
                    <span className="text-[10px] font-mono text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                      Standard Syllabus
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Examination Plan & Methodology */}
            <div className="p-4 bg-orange-50/50 rounded-xl border border-orange-200/70 space-y-2 text-xs">
              <div className="flex items-center space-x-2 text-[#EA580C]">
                <Sparkles className="w-4 h-4" />
                <span className="font-bold uppercase tracking-wider text-[11px]">
                  Official Exam Mastery Methodology
                </span>
              </div>
              <ul className="space-y-1.5 text-slate-700 list-disc list-inside">
                <li>
                  Daily continuous assessment and simulated Computer Based Test (CBT) practice.
                </li>
                <li>
                  Exhaustive past question paper dissection (2010 – 2026 examination series).
                </li>
                <li>
                  Weekly parent academic progress SMS summaries and bi-weekly report cards.
                </li>
                <li>
                  Practical science laboratory mock examinations for WAEC & NECO candidates.
                </li>
              </ul>
            </div>

            {/* Footer buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <span className="text-[11px] text-slate-400">
                Official Programme Ref: ETC-{inspectingProg.code}
              </span>
              <button
                onClick={() => setInspectingProg(null)}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm"
              >
                Close Syllabus
              </button>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* MODAL: Add / Edit Academic Programme */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 backdrop-blur-xs overflow-y-auto pt-10 sm:pt-20">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 my-auto animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  {editingProg ? 'Edit Exam Program' : 'Add New Exam Program'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Set up exam board, tuition, subjects, and cohort capacity.
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProgramme} className="mt-4 space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ModernSelect
                  label="Exam Category *"
                  value={formData.category}
                  onChange={(val) => setFormData({ ...formData, category: val as any })}
                  options={categories.map(c => ({ value: c, label: c }))}
                />

                <ModernSelect
                  label="Status"
                  value={formData.status}
                  onChange={(val) => setFormData({ ...formData, status: val as any })}
                  options={[
                    { value: 'Active', label: 'Active' },
                    { value: 'Upcoming', label: 'Upcoming' },
                    { value: 'Archived', label: 'Archived' }
                  ]}
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Exam Program Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. WAEC / WASSCE Comprehensive Exam Prep"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Syllabus Overview & Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Summary of syllabus targets, lab practicals, CBT drills..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">Exam Subjects (Curriculum Scope) *</label>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
                    {allSubjects.map((subject) => (
                      <label key={subject.id} className="flex items-center space-x-2 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={formData.selectedSubjects.includes(subject.name)}
                          onChange={() => toggleSubjectSelection(subject.name)}
                          className="w-4 h-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                        />
                        <span className="text-xs text-slate-700 group-hover:text-slate-900">{subject.name}</span>
                      </label>
                    ))}
                    {allSubjects.length === 0 && (
                      <p className="text-[10px] text-slate-400 italic">No subjects registered. Please add subjects in the Subjects Manager.</p>
                    )}
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <ModernSelect
                      label="Max Student Capacity *"
                      value={formData.maxStudents}
                      onChange={(val) => setFormData({ ...formData, maxStudents: Number(val) })}
                      options={[20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 150, 200, 250, 300, 500].map(cap => ({
                        value: cap,
                        label: `${cap} Candidates`
                      }))}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <ModernSelect
                    label="Duration (Months) *"
                    value={formData.duration.split(' ')[0]}
                    onChange={(val) => setFormData({ ...formData, duration: `${val} Months` })}
                    options={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => ({
                      value: String(m),
                      label: `${m} ${m === 1 ? 'Month' : 'Months'}`
                    }))}
                  />
                </div>

                <div className="pt-5">
                   <span className="text-[10px] text-slate-400 italic">Duration determines cohort lifespan</span>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg shadow-sm"
                >
                  {editingProg ? 'Save Changes' : 'Create Exam Program'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
