import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  BookOpen,
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  CheckCircle2,
  Filter,
} from 'lucide-react';
import { ModernSelect } from '../ui/ModernSelect';

export interface SubjectEntry {
  id: string;
  name: string;
  department: 'General' | 'Science' | 'Commercial' | 'Arts';
  description: string;
}

const DEFAULT_SUBJECT_ENTRIES: SubjectEntry[] = [
  {
    id: 'sub-1',
    name: 'Use of English',
    department: 'General',
    description: 'Comprehension, Lexis & Structure, Oral Forms, Concord, and Idiomatic Expressions.',
  },
  {
    id: 'sub-2',
    name: 'General Mathematics',
    department: 'General',
    description: 'Number & Numeration, Algebraic Processes, Trigonometry, Calculus, and Statistics.',
  },
  {
    id: 'sub-3',
    name: 'Physics',
    department: 'Science',
    description: 'Mechanics, Thermal Energy, Wave Motion & Optics, Electricity & Magnetism, Modern Physics.',
  },
  {
    id: 'sub-4',
    name: 'Chemistry',
    department: 'Science',
    description: 'Particulate Nature of Matter, Stoichiometry, Periodicity, Organic Chemistry, Electrochemistry.',
  },
  {
    id: 'sub-5',
    name: 'Biology',
    department: 'Science',
    description: 'Cell Biology, Nutrition, Internal Transport Systems, Genetics, Ecology, and Evolution.',
  },
  {
    id: 'sub-6',
    name: 'Further Mathematics',
    department: 'Science',
    description: 'Pure Mathematics, Coordinate Geometry, Vectors, Differential Equations, and Statics.',
  },
  {
    id: 'sub-7',
    name: 'Economics',
    department: 'Commercial',
    description: 'Basic Economic Principles, Demand & Supply, National Income Accounting, Public Finance, and Banking.',
  },
  {
    id: 'sub-8',
    name: 'Financial Accounting',
    department: 'Commercial',
    description: 'Principles of Double Entry, Final Accounts, Partnership Accounts, Company Accounts, and Auditing.',
  },
  {
    id: 'sub-9',
    name: 'Commerce',
    department: 'Commercial',
    description: 'Home & Foreign Trade, Aids to Trade, Banking & Finance, Capital Markets, Business Law.',
  },
  {
    id: 'sub-10',
    name: 'Literature in English',
    department: 'Arts',
    description: 'African & Non-African Prose, Poetic forms, Dramatic literary analysis, and Critical evaluation.',
  },
  {
    id: 'sub-11',
    name: 'Government',
    department: 'Arts',
    description: 'Theory of the State, Constitutions, Pre-colonial Administration, Nigerian Federalism, and Foreign Policy.',
  },
  {
    id: 'sub-12',
    name: 'Christian Religious Studies (CRS)',
    department: 'Arts',
    description: 'Old & New Testament themes, Faith and Christian living, Selected Epistles, and Contemporary Ethics.',
  },
  {
    id: 'sub-13',
    name: 'Islamic Religious Studies (IRS)',
    department: 'Arts',
    description: 'Tawheed, Fiqh, Hadith studies, Sirah of the Holy Prophet, and Islamic Social Ethics.',
  },
  {
    id: 'sub-14',
    name: 'Geography',
    department: 'Commercial',
    description: 'Physical Geography, Regional Geography of Nigeria, Map Reading, Climatology, and Human Settlements.',
  },
];

export const SubjectsManager: React.FC = () => {
  const { students, subjects, addSubject, updateSubject, deleteSubject, addToast } = useApp();

  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [search, setSearch] = useState<string>('');
  const [showModal, setShowModal] = useState<boolean>(false);
  const [editingSubject, setEditingSubject] = useState<SubjectEntry | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    department: 'General' as SubjectEntry['department'],
    description: '',
  });

  // Calculate Most Registered Subject
  const getMostRegistered = () => {
    const counts: Record<string, number> = {};
    (students || []).forEach((s) => {
      (s.subjects || []).forEach((subName) => {
        counts[subName] = (counts[subName] || 0) + 1;
      });
    });
    let most = 'None yet';
    let max = 0;
    Object.entries(counts).forEach(([name, count]) => {
      if (count > max) {
        max = count;
        most = name;
      }
    });
    return { name: most, count: max };
  };

  const mostRegistered = getMostRegistered();

  const filteredSubjects = (subjects || []).filter((s) => {
    const matchesDept = selectedDept === 'All' || s.department === selectedDept;
    const matchesSearch =
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.description && s.description.toLowerCase().includes(search.toLowerCase()));
    return matchesDept && matchesSearch;
  });

  const handleOpenAdd = () => {
    setEditingSubject(null);
    setFormData({
      name: '',
      department: 'General',
      description: '',
    });
    setShowModal(true);
  };

  const handleOpenEdit = (subject: SubjectEntry) => {
    setEditingSubject(subject);
    setFormData({
      name: subject.name,
      department: subject.department,
      description: subject.description || '',
    });
    setShowModal(true);
  };

  const handleDelete = (id: string, name: string) => {
    deleteSubject(id);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    if (editingSubject) {
      updateSubject(editingSubject.id, {
        name: formData.name.trim(),
        department: formData.department,
        description: formData.description.trim(),
      });
    } else {
      addSubject({
        name: formData.name.trim(),
        department: formData.department,
        description: formData.description.trim(),
      });
    }

    setShowModal(false);
  };

  const departmentBadge = (dept: SubjectEntry['department']) => {
    switch (dept) {
      case 'Science':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Commercial':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Arts':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'General':
      default:
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
  };

  return (
    <div id="subjects-management-page" className="p-4 sm:p-6 md:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Subjects
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Master catalog of academic disciplines taught across all tutorial tracks.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="px-4 py-2.5 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg shadow-sm transition-all flex items-center justify-center space-x-1.5 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Subject</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center space-x-4">
          <div className="w-10 h-10 rounded-full bg-orange-50 text-[#EA580C] flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Subjects</p>
            <p className="text-2xl font-black text-slate-900">{subjects.length}</p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center space-x-4">
          <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Most Registered</p>
            <p className="text-2xl font-black text-slate-900 truncate max-w-[120px] sm:max-w-[180px]">
              {mostRegistered.name}
            </p>
            <p className="text-[10px] text-slate-400 font-medium">By {mostRegistered.count} Candidates</p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Department Pills */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {['All', 'General', 'Science', 'Commercial', 'Arts'].map((dept) => (
            <button
              key={dept}
              onClick={() => setSelectedDept(dept)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                selectedDept === dept
                  ? 'bg-[#EA580C] text-white shadow-2xs'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {dept === 'All' ? 'All Departments' : dept}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search subjects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-orange-500 shadow-2xs"
          />
        </div>
      </div>

      {/* Subjects Data Table */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4 w-12">#</th>
                <th className="py-3 px-4">Subject Name</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSubjects.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-400 font-medium">
                    No subjects match your query.
                  </td>
                </tr>
              ) : (
                filteredSubjects.map((sub, idx) => (
                  <tr key={sub.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                      {idx + 1}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-7 h-7 rounded-lg bg-orange-50 text-[#EA580C] border border-orange-100 flex items-center justify-center font-bold text-xs shrink-0">
                          <BookOpen className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-bold text-slate-900 text-sm">{sub.name}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${departmentBadge(
                          sub.department
                        )}`}
                      >
                        {sub.department}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        onClick={() => handleOpenEdit(sub)}
                        className="px-3 py-1.5 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors inline-flex items-center space-x-1"
                        title="View and Edit Subject"
                      >
                        <Edit2 className="w-3 h-3 text-slate-500" />
                        <span>View</span>
                      </button>
                      <button
                        onClick={() => handleDelete(sub.id, sub.name)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Delete Subject"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Subject Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <BookOpen className="w-5 h-5 text-[#EA580C]" />
                <h3 className="font-bold text-base text-slate-900">
                  {editingSubject ? 'Edit Subject' : 'Add New Subject'}
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Subject Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Further Mathematics"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                />
              </div>

                <ModernSelect
                  label="Department *"
                  value={formData.department}
                  onChange={(val) => setFormData({ ...formData, department: val })}
                  options={[
                    { value: 'General', label: 'General' },
                    { value: 'Science', label: 'Science' },
                    { value: 'Commercial', label: 'Commercial' },
                    { value: 'Arts', label: 'Arts' }
                  ]}
                />

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg shadow-sm"
                >
                  {editingSubject ? 'Save Changes' : 'Add Subject'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
