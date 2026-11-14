import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ModernSelect } from '../ui/ModernSelect';
import {
  Award,
  Plus,
  Search,
  Edit2,
  Trash2,
  CheckCircle2,
  X,
  ExternalLink,
  BookOpen,
  Clock,
  Layers,
} from 'lucide-react';

export interface ExamTypeItem {
  id: string;
  name: string;
  code: string;
  boardAgency: string;
  duration: string;
  mode: 'CBT Online' | 'Paper-Based / Practical' | 'Digital Hybrid';
  description: string;
  status: 'Active' | 'Upcoming';
}

const DEFAULT_EXAM_TYPES: ExamTypeItem[] = [
  {
    id: 'et-1',
    name: 'JAMB / UTME',
    code: 'JAMB',
    boardAgency: 'Joint Admissions and Matriculation Board (Nigeria)',
    duration: '4 Months Intensive',
    mode: 'CBT Online',
    description: 'Computer-based matriculation examination required for all Nigerian universities and polytechnics.',
    status: 'Active',
  },
  {
    id: 'et-2',
    name: 'WAEC WASSCE',
    code: 'WAEC',
    boardAgency: 'West African Examinations Council',
    duration: '6 Months Comprehensive',
    mode: 'Paper-Based / Practical',
    description: 'Senior school certificate accreditation covering core subjects, essay theories, and laboratory practicals.',
    status: 'Active',
  },
  {
    id: 'et-3',
    name: 'NECO SSCE',
    code: 'NECO',
    boardAgency: 'National Examinations Council',
    duration: '5 Months Standard',
    mode: 'Paper-Based / Practical',
    description: 'National secondary school certificate examination facilitating university admissions.',
    status: 'Active',
  },
  {
    id: 'et-4',
    name: 'Cambridge A-Levels',
    code: 'A-Levels',
    boardAgency: 'Cambridge Assessment International Education (UK)',
    duration: '9 Months Fast-Track',
    mode: 'Paper-Based / Practical',
    description: 'Rigorous British advanced-level curriculum providing 200-level direct entry into top universities.',
    status: 'Active',
  },
  {
    id: 'et-5',
    name: 'Digital SAT',
    code: 'SAT',
    boardAgency: 'College Board (USA)',
    duration: '3 Months Adaptive',
    mode: 'Digital Hybrid',
    description: 'Standardized assessment for US, Canadian, and global undergraduate admissions and merit scholarships.',
    status: 'Active',
  },
];

export const ExamTypeTab: React.FC = () => {
  const { addToast } = useApp();
  const [examTypes, setExamTypes] = useState<ExamTypeItem[]>(() => {
    try {
      const saved = localStorage.getItem('EXCELLENCE_EXAM_TYPES_V1');
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_EXAM_TYPES;
  });

  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ExamTypeItem | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    boardAgency: '',
    duration: '4 Months Intensive',
    mode: 'CBT Online' as ExamTypeItem['mode'],
    description: '',
    status: 'Active' as ExamTypeItem['status'],
  });

  const saveExamTypes = (updated: ExamTypeItem[]) => {
    setExamTypes(updated);
    try {
      localStorage.setItem('EXCELLENCE_EXAM_TYPES_V1', JSON.stringify(updated));
    } catch {}
  };

  const filtered = examTypes.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.code.toLowerCase().includes(search.toLowerCase()) ||
      e.boardAgency.toLowerCase().includes(search.toLowerCase())
  );

  const handleOpenAdd = () => {
    setEditingItem(null);
    setFormData({
      name: '',
      code: '',
      boardAgency: '',
      duration: '4 Months Intensive',
      mode: 'CBT Online',
      description: '',
      status: 'Active',
    });
    setShowModal(true);
  };

  const handleOpenEdit = (item: ExamTypeItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      code: item.code,
      boardAgency: item.boardAgency,
      duration: item.duration,
      mode: item.mode,
      description: item.description,
      status: item.status,
    });
    setShowModal(true);
  };

  const handleDelete = (id: string, name: string) => {
    const updated = examTypes.filter((e) => e.id !== id);
    saveExamTypes(updated);
    addToast({
      type: 'info',
      title: 'Exam Type Removed',
      description: `${name} has been deleted.`,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.code.trim()) return;

    if (editingItem) {
      const updated = examTypes.map((item) =>
        item.id === editingItem.id
          ? {
              ...item,
              name: formData.name.trim(),
              code: formData.code.trim().toUpperCase(),
              boardAgency: formData.boardAgency.trim(),
              duration: formData.duration.trim(),
              mode: formData.mode,
              description: formData.description.trim(),
              status: formData.status,
            }
          : item
      );
      saveExamTypes(updated);
      addToast({
        type: 'success',
        title: 'Exam Type Updated',
        description: `${formData.name} specifications updated.`,
      });
    } else {
      const newItem: ExamTypeItem = {
        id: `et-${Date.now()}`,
        name: formData.name.trim(),
        code: formData.code.trim().toUpperCase(),
        boardAgency: formData.boardAgency.trim(),
        duration: formData.duration.trim(),
        mode: formData.mode,
        description: formData.description.trim(),
        status: formData.status,
      };
      saveExamTypes([...examTypes, newItem]);
      addToast({
        type: 'success',
        title: 'Exam Type Created',
        description: `${formData.name} added to exam curriculum catalog.`,
      });
    }
    setShowModal(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top action toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search exam types..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-orange-500 shadow-2xs"
          />
        </div>

        <button
          onClick={handleOpenAdd}
          className="px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg shadow-sm transition-all flex items-center justify-center space-x-1.5 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Exam Type</span>
        </button>
      </div>

      {/* Exam Types Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((item) => (
          <div
            key={item.id}
            className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-xs hover:border-orange-300 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 rounded-lg bg-orange-100 text-[#EA580C] font-extrabold flex items-center justify-center text-xs">
                    {item.code.slice(0, 3)}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{item.name}</h3>
                    <p className="text-[11px] text-slate-400 font-mono">{item.code}</p>
                  </div>
                </div>

                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    item.status === 'Active'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {item.status}
                </span>
              </div>

              <p className="text-xs text-slate-600 mt-3 line-clamp-2 leading-relaxed">
                {item.description}
              </p>

              <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="flex items-center space-x-1 text-slate-400">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Duration:</span>
                  </span>
                  <span className="font-semibold text-slate-800">{item.duration}</span>
                </div>
                <div className="flex items-center justify-between text-slate-500">
                  <span className="flex items-center space-x-1 text-slate-400">
                    <Layers className="w-3.5 h-3.5" />
                    <span>Examination Mode:</span>
                  </span>
                  <span className="font-semibold text-slate-800">{item.mode}</span>
                </div>
                <div className="text-[10px] text-slate-400 truncate pt-1">
                  Agency: {item.boardAgency}
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
              <button
                onClick={() => handleOpenEdit(item)}
                className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors flex items-center space-x-1"
              >
                <Edit2 className="w-3 h-3" />
                <span>Edit</span>
              </button>
              <button
                onClick={() => handleDelete(item.id, item.name)}
                className="p-1 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add / Edit Exam Type Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Award className="w-5 h-5 text-[#EA580C]" />
                <h3 className="font-bold text-base text-slate-900">
                  {editingItem ? 'Edit Exam Type' : 'Add New Exam Type'}
                </h3>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Exam Type Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. JAMB / UTME"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none font-medium"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Code / Abbr *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. JAMB"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none uppercase font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Board / Governing Agency</label>
                <input
                  type="text"
                  placeholder="e.g. Joint Admissions and Matriculation Board"
                  value={formData.boardAgency}
                  onChange={(e) => setFormData({ ...formData, boardAgency: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Standard Duration</label>
                  <input
                    type="text"
                    placeholder="e.g. 4 Months Intensive"
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                  />
                </div>
                <ModernSelect
                  label="Exam Mode"
                  value={formData.mode}
                  onChange={(val) => setFormData({ ...formData, mode: val as ExamTypeItem['mode'] })}
                  options={[
                    { value: 'CBT Online', label: 'CBT Online' },
                    { value: 'Paper-Based / Practical', label: 'Paper-Based / Practical' },
                    { value: 'Digital Hybrid', label: 'Digital Hybrid' }
                  ]}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Curriculum & Examination Scope</label>
                <textarea
                  rows={2}
                  placeholder="Summary of assessment structure and requirements..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 focus:bg-white focus:border-orange-500 outline-none resize-none"
                />
              </div>

              <ModernSelect
                label="Status"
                value={formData.status}
                onChange={(val) => setFormData({ ...formData, status: val as ExamTypeItem['status'] })}
                options={[
                  { value: 'Active', label: 'Active' },
                  { value: 'Upcoming', label: 'Upcoming' }
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
                  {editingItem ? 'Save Changes' : 'Create Exam Type'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
