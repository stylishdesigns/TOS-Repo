import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Programme, Student } from '../../types';
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
  const { programmes, subjects: allSubjects, addProgramme, updateProgramme, students, settings, updateSettings, addToast, seatsSummary, refreshSeatsSummary } = useApp();

  const [activeSubsection, setActiveSubsection] = useState<ProgrammeSubsection>('Exam Programmes');

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
    duration: '4 Months',
    startDate: '2027-01-10',
    endDate: '2027-05-02',
    status: 'Active' as Programme['status'],
    selectedSubjects: [] as string[],
  });

  // Programme data still carries a legacy category field, but the UI no longer
  // shows or asks for it: the exam name is the programme.
  // Filtered programmes
  const filteredProgrammes = (programmes || []).filter((p) => {
    const matchesStatus = selectedStatus === 'All' || p.status === selectedStatus;
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.subjects || []).some((s) => s.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesStatus && matchesSearch;
  });

  // Live cohort counts: the number on each exam programme is the real count
  // of students registered on it, excluding suspended students and students
  // whose seat access has been switched off. There is no capacity or limit.
  React.useEffect(() => {
    if (!seatsSummary) void refreshSeatsSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const seatActiveOf = (s: Student) => {
    const access = seatsSummary?.studentAccess?.[s.uid || s.id];
    return access ? access.status === 'active' : s.status !== 'Suspended';
  };
  const matchesProgramme = (s: Student, prog: Programme) =>
    s.programmeId
      ? s.programmeId === prog.id
      : String(s.programmeName || '').trim().toLowerCase() === String(prog.name || '').trim().toLowerCase();
  const enrolledOf = (prog: Programme) =>
    students.filter((s) => matchesProgramme(s, prog) && seatActiveOf(s)).length;

  // Calculate high-level KPIs
  const totalEnrolled = (programmes || []).reduce((acc, p) => acc + enrolledOf(p), 0);
  const activeCount = (programmes || []).filter((p) => p.status === 'Active').length;

  const handleOpenAdd = () => {
    setEditingProg(null);
    setFormData({
      name: '',
      code: '',
      description: '',
      category: 'JAMB',
      fee: 45000,
      duration: '4 Months',
      startDate: '2027-01-10',
      endDate: '2027-05-02',
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
      duration: normalizedDuration(prog.duration),
      startDate: prog.startDate,
      endDate: prog.endDate,
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

  // The form no longer collects a programme code; derive a short readable one
  // from the title so cards, search and the inspect modal still have one.
  const deriveCode = (name: string) => {
    const words = name.replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
    const base = (words.map((w) => w[0]).join('') || 'EXAM').toUpperCase().slice(0, 5);
    return `${base}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
  };

  // Duration is stored as a plain "N Months" / "N Years" string. Older records
  // carried attached date ranges like "4 Months (Jan - Apr)"; those are
  // normalised away here so nothing re-attaches them.
  const parseDuration = (d: string): { value: number; unit: 'Months' | 'Years' } => {
    const m = String(d || '').match(/(\d+)\s*(month|year)/i);
    if (m) {
      const n = Math.max(1, parseInt(m[1], 10));
      return /^year/i.test(m[2])
        ? { value: Math.min(n, 5), unit: 'Years' }
        : { value: Math.min(n, 60), unit: 'Months' };
    }
    return { value: 4, unit: 'Months' };
  };
  const durationLabel = (n: number, unit: 'Months' | 'Years') => {
    if (unit === 'Years') return `${n} ${n === 1 ? 'Year' : 'Years'}`;
    if (n < 12) return `${n} ${n === 1 ? 'Month' : 'Months'}`;
    const y = Math.floor(n / 12);
    const r = n % 12;
    if (r === 0) return `${n} Months (${y} ${y === 1 ? 'Year' : 'Years'})`;
    return `${n} Months (${y} yr ${r} mo)`;
  };
  const normalizedDuration = (d: string) => {
    const p = parseDuration(d);
    return `${p.value} ${p.unit}`;
  };

  const handleSaveProgramme = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      addToast({ type: 'error', title: 'Missing Information', description: 'Please provide the exam program title.' });
      return;
    }

    if (editingProg) {
      updateProgramme(editingProg.id, {
        name: formData.name,
        code: (formData.code.trim() || deriveCode(formData.name)).toUpperCase(),
        description: formData.description,
        category: formData.category,
        fee: Number(formData.fee),
        duration: normalizedDuration(formData.duration),
        startDate: formData.startDate,
        endDate: formData.endDate,
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
        code: (formData.code.trim() || deriveCode(formData.name)).toUpperCase(),
        description: formData.description,
        category: formData.category,
        fee: Number(formData.fee),
        duration: normalizedDuration(formData.duration),
        startDate: formData.startDate,
        endDate: formData.endDate,
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

  return (
    <div id="academic-programmes-page" className="p-4 sm:p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Exam Programs</h2>
        </div>

        <div className="flex items-center space-x-4">
          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm transition-all flex items-center space-x-1.5 shadow-xs"
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
                  ? 'bg-orange-600 text-white shadow-xs'
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
            <BookOpen className="w-4 h-4 text-orange-600" />
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
          <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-full flex items-center justify-center mx-auto">
            <BookOpen className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-slate-800 text-base">No Academic Programmes Found</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            No programmes match your current filters. Try changing your search query or add a new exam track.
          </p>
          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm"
          >
            Create Programme
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
          {filteredProgrammes.map((prog) => {
            return (
              <div
                key={prog.id}
                className="bg-white rounded-xl border border-slate-200/90 shadow-xs hover:shadow-md hover:border-slate-300 transition-all flex flex-col justify-between overflow-hidden group"
              >
                {/* Top Banner with Exam Tag & Status */}
                <div className="p-5 pb-4 space-y-3">
                  <div className="flex items-center justify-end gap-2">
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
                    <h3 className="font-bold text-slate-900 text-base group-hover:text-orange-600 transition-colors leading-snug">
                      {prog.name}
                    </h3>
                    <p className="text-[11px] font-mono font-semibold text-slate-400 mt-0.5">
                      Code: {prog.code} • {prog.duration}
                    </p>
                  </div>

                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                    {prog.description}
                  </p>

                  {/* Live cohort count */}
                  <div className="pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium">Cohort Enrollment:</span>
                      <span className="font-bold text-slate-800">
                        {enrolledOf(prog)}{' '}
                        <span className="font-normal text-slate-400">students</span>
                      </span>
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
                      className="px-3 py-1.5 text-xs font-semibold text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-lg border border-orange-200 shadow-2xs transition-colors flex items-center space-x-1"
                    >
                      <span>Info</span>
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
                <p className="font-bold text-orange-600">₦{(inspectingProg.fee || 0).toLocaleString()}</p>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-medium">ENROLLMENT</span>
                <p className="font-bold text-slate-800">
                  {enrolledOf(inspectingProg)} students
                </p>
              </div>
            </div>

            {/* Registered Students (live) */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-1.5">
                <Users className="w-4 h-4 text-orange-600" />
                <span>Registered Students</span>
              </h4>
              {(() => {
                const roster = students.filter((s) => matchesProgramme(s, inspectingProg));
                if (roster.length === 0) {
                  return (
                    <p className="text-xs text-slate-500">No student has registered for this exam programme yet.</p>
                  );
                }
                return (
                  <div className="space-y-2">
                    {roster.map((s) => {
                      const seatOn = seatActiveOf(s);
                      return (
                        <div key={s.id} className="flex items-center justify-between gap-3 p-2.5 bg-slate-50/70 border border-slate-200/80 rounded-lg text-xs">
                          <span className="font-semibold text-slate-800 truncate">{s.name}</span>
                          <span className="flex items-center gap-1.5 shrink-0">
                            {!seatOn && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-600">
                                {s.status === 'Suspended' ? 'Suspended' : 'Seat off'}
                              </span>
                            )}
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${s.paymentStatus === 'Paid' ? 'bg-emerald-50 text-emerald-700' : s.paymentStatus === 'Partial' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                              {s.paymentStatus || 'Pending'}
                            </span>
                            <span className="font-bold text-slate-700">&#8358;{(s.outstandingBalance || 0).toLocaleString()}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Subjects & Syllabus Structure */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-1.5">
                <BookMarked className="w-4 h-4 text-orange-600" />
                <span>Curriculum Modules & Tested Subjects</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {inspectingProg.subjects.map((sub, i) => (
                  <div
                    key={i}
                    className="p-2.5 bg-slate-50/70 border border-slate-200/80 rounded-lg flex items-center justify-between"
                  >
                    <span className="font-semibold text-slate-800">{sub}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer buttons */}
            <div className="flex items-center justify-end pt-4 border-t border-slate-100">
              <button
                onClick={() => setInspectingProg(null)}
                className="px-4 py-2 text-xs font-semibold text-[var(--on-brand,#fff)] bg-[var(--brand,#0f172a)] hover:brightness-110 rounded-lg shadow-sm"
              >
                Close
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
                  Set up exam board, tuition, subjects and duration.
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
                  label="Status"
                  value={formData.status}
                  onChange={(val) => setFormData({ ...formData, status: val as any })}
                  options={[
                    { value: 'Active', label: 'Active' },
                    { value: 'Upcoming', label: 'Upcoming' },
                    { value: 'Archived', label: 'Archived' }
                  ]}
                />
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Tuition fee (&#8358;) *
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={500}
                    value={formData.fee}
                    onChange={(e) => setFormData({ ...formData, fee: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                  />
                </div>
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

              {(() => {
                const dur = parseDuration(formData.duration);
                return (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-2 gap-3">
                      <ModernSelect
                        label="Duration *"
                        value={String(dur.value)}
                        onChange={(val) => setFormData({ ...formData, duration: `${val} ${dur.unit}` })}
                        options={
                          dur.unit === 'Years'
                            ? [1, 2, 3, 4, 5].map((y) => ({ value: String(y), label: durationLabel(y, 'Years') }))
                            : Array.from({ length: 60 }, (_, i) => i + 1).map((m) => ({ value: String(m), label: durationLabel(m, 'Months') }))
                        }
                      />
                      <ModernSelect
                        label="Duration unit"
                        value={dur.unit}
                        onChange={(val) => {
                          const unit = val as 'Months' | 'Years';
                          const converted = unit === 'Years'
                            ? Math.max(1, Math.round(dur.value / 12))
                            : Math.min(60, dur.value * 12);
                          setFormData({ ...formData, duration: `${converted} ${unit}` });
                        }}
                        options={[
                          { value: 'Months', label: 'Months' },
                          { value: 'Years', label: 'Years' },
                        ]}
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 italic">
                      Months or years, anything up to five years. Duration determines cohort lifespan.
                    </p>
                  </div>
                );
              })()}

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
                  className="px-4 py-2 font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm"
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
