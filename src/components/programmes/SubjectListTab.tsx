import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ModernSelect } from '../ui/ModernSelect';
import {
  BookOpen,
  Plus,
  Search,
  Users,
  GraduationCap,
  Layers,
  X,
  CheckCircle2,
  Filter,
} from 'lucide-react';

interface SubjectItem {
  id: string;
  name: string;
  department: 'Science' | 'Commercial' | 'Arts' | 'General';
  examBoards: string[];
  assignedTutors: string[];
  topicsCount: number;
  description: string;
}

const DEFAULT_SUBJECTS: SubjectItem[] = [
  {
    id: 'sub-eng',
    name: 'Use of English',
    department: 'General',
    examBoards: ['JAMB', 'WAEC', 'NECO'],
    assignedTutors: ['Dr. Emmanuel Adeyemi', 'Grace Okafor'],
    topicsCount: 28,
    description: 'Comprehension, Lexis & Structure, Oral Forms, Concord, Idiomatic Expressions.',
  },
  {
    id: 'sub-math',
    name: 'General Mathematics',
    department: 'General',
    examBoards: ['JAMB', 'WAEC', 'NECO'],
    assignedTutors: ['Engr. Babatunde Lawal', 'Dr. Emmanuel Adeyemi'],
    topicsCount: 34,
    description: 'Number & Numeration, Algebraic Processes, Trigonometry, Calculus & Statistics.',
  },
  {
    id: 'sub-phy',
    name: 'Physics',
    department: 'Science',
    examBoards: ['JAMB', 'WAEC', 'NECO'],
    assignedTutors: ['Dr. Emmanuel Adeyemi'],
    topicsCount: 26,
    description: 'Mechanics, Heat Energy, Waves & Optics, Electricity & Magnetism, Modern Physics.',
  },
  {
    id: 'sub-chem',
    name: 'Chemistry',
    department: 'Science',
    examBoards: ['JAMB', 'WAEC', 'NECO'],
    assignedTutors: ['Dr. Emmanuel Adeyemi'],
    topicsCount: 30,
    description: 'Particulate Nature of Matter, Stoichiometry, Periodicity, Organic Chemistry, Electrochemistry.',
  },
  {
    id: 'sub-bio',
    name: 'Biology',
    department: 'Science',
    examBoards: ['JAMB', 'WAEC', 'NECO'],
    assignedTutors: ['Grace Okafor'],
    topicsCount: 32,
    description: 'Cell Biology, Nutrition, Transport Systems, Genetics, Ecology & Evolution.',
  },
  {
    id: 'sub-fmath',
    name: 'Further Mathematics',
    department: 'Science',
    examBoards: ['WAEC', 'NECO', 'Cambridge'],
    assignedTutors: ['Engr. Babatunde Lawal'],
    topicsCount: 22,
    description: 'Pure Maths, Coordinate Geometry, Vectors, Differential Equations, Mechanics.',
  },
  {
    id: 'sub-econ',
    name: 'Economics',
    department: 'Commercial',
    examBoards: ['JAMB', 'WAEC', 'NECO'],
    assignedTutors: ['Grace Okafor'],
    topicsCount: 24,
    description: 'Basic Economic Principles, Demand & Supply, National Income, Public Finance, Money & Banking.',
  },
  {
    id: 'sub-acc',
    name: 'Financial Accounting',
    department: 'Commercial',
    examBoards: ['JAMB', 'WAEC', 'NECO'],
    assignedTutors: ['Grace Okafor'],
    topicsCount: 25,
    description: 'Principles of Double Entry, Final Accounts, Partnership Accounts, Company Accounts.',
  },
  {
    id: 'sub-comm',
    name: 'Commerce',
    department: 'Commercial',
    examBoards: ['JAMB', 'WAEC', 'NECO'],
    assignedTutors: ['Grace Okafor'],
    topicsCount: 20,
    description: 'Home & Foreign Trade, Aids to Trade, Banking & Finance, Business Communication.',
  },
  {
    id: 'sub-lit',
    name: 'Literature in English',
    department: 'Arts',
    examBoards: ['JAMB', 'WAEC', 'NECO'],
    assignedTutors: ['Grace Okafor'],
    topicsCount: 21,
    description: 'African & Non-African Prose, Poetry, Drama texts for 2026/2027 prescribed syllabus.',
  },
  {
    id: 'sub-gov',
    name: 'Government',
    department: 'Arts',
    examBoards: ['JAMB', 'WAEC', 'NECO'],
    assignedTutors: ['Grace Okafor'],
    topicsCount: 27,
    description: 'Concepts of the State, Constitutions, Pre-colonial Administration, Nigerian Federalism.',
  },
  {
    id: 'sub-crs',
    name: 'Christian Religious Studies (CRS)',
    department: 'Arts',
    examBoards: ['JAMB', 'WAEC', 'NECO'],
    assignedTutors: ['Grace Okafor'],
    topicsCount: 18,
    description: 'Old & New Testament themes, Christian Living, Selected Epistles.',
  },
];

export const SubjectListTab: React.FC = () => {
  const { tutors, addToast } = useApp();

  const [subjects, setSubjects] = useState<SubjectItem[]>(DEFAULT_SUBJECTS);
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    department: 'Science' as 'Science' | 'Commercial' | 'Arts' | 'General',
    examBoards: 'JAMB, WAEC, NECO',
    assignedTutor: tutors[0]?.name || 'Dr. Emmanuel Adeyemi',
    topicsCount: 24,
    description: '',
  });

  const filteredSubjects = subjects.filter((s) => {
    const matchesDept = selectedDept === 'All' || s.department === selectedDept;
    const matchesSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase()) ||
      s.assignedTutors.some((t) => t.toLowerCase().includes(search.toLowerCase()));
    return matchesDept && matchesSearch;
  });

  const handleAddSubject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    const newSub: SubjectItem = {
      id: `sub-${Date.now()}`,
      name: formData.name,
      department: formData.department,
      examBoards: formData.examBoards.split(',').map((b) => b.trim()),
      assignedTutors: [formData.assignedTutor],
      topicsCount: Number(formData.topicsCount) || 20,
      description: formData.description || 'Comprehensive exam syllabus coverage.',
    };

    setSubjects((prev) => [newSub, ...prev]);
    setShowAddModal(false);
    setFormData({
      name: '',
      department: 'Science',
      examBoards: 'JAMB, WAEC, NECO',
      assignedTutor: tutors[0]?.name || '',
      topicsCount: 24,
      description: '',
    });

    addToast({
      type: 'success',
      title: 'Subject Added',
      description: `${formData.name} added to the official subject directory.`,
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs">
          <span className="text-xs font-semibold text-slate-500">Total Subjects</span>
          <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">{subjects.length}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Across 4 departments</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs">
          <span className="text-xs font-semibold text-blue-600">Science</span>
          <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
            {subjects.filter((s) => s.department === 'Science').length}
          </p>
          <p className="text-[10px] text-blue-500 mt-0.5">Stem / Engineering / Medical</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs">
          <span className="text-xs font-semibold text-emerald-600">Commercial</span>
          <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
            {subjects.filter((s) => s.department === 'Commercial').length}
          </p>
          <p className="text-[10px] text-emerald-500 mt-0.5">Finance / Business tracks</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs">
          <span className="text-xs font-semibold text-purple-600">Arts & Hum.</span>
          <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
            {subjects.filter((s) => s.department === 'Arts').length}
          </p>
          <p className="text-[10px] text-purple-500 mt-0.5">Law / Social Sciences</p>
        </div>
      </div>

      {/* Filter and Action Bar */}
      <div className="bg-white p-3 md:p-4 rounded-xl border border-slate-200/90 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-1 bg-slate-50/80 p-1 rounded-lg border border-slate-200/60 overflow-x-auto">
          {(['All', 'General', 'Science', 'Commercial', 'Arts'] as const).map((dept) => (
            <button
              key={dept}
              onClick={() => setSelectedDept(dept)}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
                selectedDept === dept
                  ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/60'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {dept}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex items-center bg-slate-50/60 border border-slate-200 rounded-lg px-2.5 py-1.5 flex-1 sm:w-56 focus-within:bg-white focus-within:border-orange-500 transition-all shadow-2xs">
            <Search className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search subject or tutor..."
              className="bg-transparent text-xs outline-none w-full text-slate-800 placeholder:text-slate-400"
            />
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg shadow-sm transition-all flex items-center space-x-1.5 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Subject</span>
          </button>
        </div>
      </div>

      {/* Subjects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSubjects.map((sub) => (
          <div
            key={sub.id}
            className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs hover:border-orange-300 transition-all space-y-3"
          >
            <div className="flex items-start justify-between">
              <div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    sub.department === 'Science'
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : sub.department === 'Commercial'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : sub.department === 'Arts'
                      ? 'bg-purple-50 text-purple-700 border border-purple-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  {sub.department} Department
                </span>
                <h4 className="font-bold text-slate-900 text-sm mt-1.5">{sub.name}</h4>
              </div>
              <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                {sub.topicsCount} Topics
              </span>
            </div>

            <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{sub.description}</p>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
              <div>
                <span className="text-slate-400 block text-[10px]">Assigned Faculty:</span>
                <p className="font-semibold text-slate-800">{sub.assignedTutors.join(', ')}</p>
              </div>
              <div className="text-right">
                <span className="text-slate-400 block text-[10px]">Exam Targets:</span>
                <div className="flex gap-1 justify-end mt-0.5">
                  {sub.examBoards.map((eb, i) => (
                    <span
                      key={i}
                      className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-orange-50 text-orange-700 border border-orange-200"
                    >
                      {eb}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Subject Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">Add Academic Subject</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubject} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Subject Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Agricultural Science"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <ModernSelect
                  label="Department *"
                  value={formData.department}
                  onChange={(val) => setFormData({ ...formData, department: val as any })}
                  options={[
                    { value: 'General', label: 'General' },
                    { value: 'Science', label: 'Science' },
                    { value: 'Commercial', label: 'Commercial' },
                    { value: 'Arts', label: 'Arts' }
                  ]}
                />
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Topics In Syllabus</label>
                  <input
                    type="number"
                    min={5}
                    value={formData.topicsCount}
                    onChange={(e) => setFormData({ ...formData, topicsCount: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                  />
                </div>
              </div>

              <ModernSelect
                label="Lead Tutor / Specialist"
                value={formData.assignedTutor}
                onChange={(val) => setFormData({ ...formData, assignedTutor: val })}
                options={tutors.map(t => ({ value: t.name, label: t.name }))}
              />

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Description / Syllabus</label>
                <textarea
                  rows={2}
                  placeholder="Key concepts, themes and topics..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none resize-none"
                />
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
                  Add Subject
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
