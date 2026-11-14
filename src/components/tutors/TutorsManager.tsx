import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Tutor } from '../../types';
import {
  GraduationCap,
  Search,
  Plus,
  X,
  Star,
  BookOpen,
  Phone,
  Mail,
  Calendar,
  Building2,
  Eye,
  UserX,
  Trash2,
  ShieldAlert,
  CheckSquare,
  Square,
  Info,
  Key,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { ModernSelect } from '../ui/ModernSelect';
import { ConfirmationModal } from '../common/ConfirmationModal';

export const TutorsManager: React.FC = () => {
  const { tutors, programmes, subjects: allSubjects, addTutor, deleteTutor, toggleTutorSuspend, settings, addToast, getTutorRatingStats, classRatings } = useApp();

  const [activeFilter, setActiveFilter] = useState<'All' | 'Active' | 'Invited' | 'Suspended'>('All');
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedTutor, setSelectedTutor] = useState<Tutor | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isInviting, setIsInviting] = useState(false);

  // Form states for new tutor
  const [formData, setFormData] = useState<{
    name: string;
    email: string;
    phone: string;
    departments: ('Science' | 'Commercial' | 'Arts')[];
    examType: string;
    selectedSubjects: string[];
    bio: string;
    tempPassword: string;
  }>({
    name: '',
    email: '',
    phone: '',
    departments: ['Science'],
    examType: programmes[0]?.name || 'JAMB UTME Prep',
    selectedSubjects: [],
    bio: 'Experienced subject specialist with proven track record in national examinations.',
    tempPassword: '',
  });

  const generatePassword = () => {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnopqrstuvwxyz';
    const numbers = '23456789';
    const special = '!@#$%&*';
    const all = upper + lower + numbers + special;
    
    let pass = '';
    pass += upper.charAt(Math.floor(Math.random() * upper.length));
    pass += lower.charAt(Math.floor(Math.random() * lower.length));
    pass += numbers.charAt(Math.floor(Math.random() * numbers.length));
    pass += special.charAt(Math.floor(Math.random() * special.length));
    
    for (let i = 0; i < 6; i++) {
      pass += all.charAt(Math.floor(Math.random() * all.length));
    }
    
    // Shuffle
    const shuffled = pass.split('').sort(() => 0.5 - Math.random()).join('');
    setFormData(prev => ({ ...prev, tempPassword: shuffled }));
  };

  const filteredTutors = (tutors || []).filter((t) => {
    const matchesFilter = activeFilter === 'All' ? true : t.status === activeFilter;
    const matchesSearch =
      !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.email.toLowerCase().includes(search.toLowerCase()) ||
      (t.subjects || []).some((s) => s.toLowerCase().includes(search.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  const toggleDepartmentSelection = (dept: 'Science' | 'Commercial' | 'Arts') => {
    setFormData((prev) => {
      const exists = prev.departments.includes(dept);
      const newDepts = exists
        ? (prev.departments.length === 1 ? prev.departments : prev.departments.filter((d) => d !== dept))
        : [...prev.departments, dept];
      
      // Filter subjects that are no longer in the selected departments
      const newDeptsList = newDepts;
      const filteredSubjects = prev.selectedSubjects.filter(subName => {
        const sub = allSubjects.find(s => s.name === subName);
        return sub && (sub.department === 'General' || newDeptsList.includes(sub.department as any));
      });

      return { 
        ...prev, 
        departments: newDepts,
        selectedSubjects: filteredSubjects
      };
    });
  };

  const toggleSubjectSelection = (subjectName: string) => {
    setFormData(prev => ({
      ...prev,
      selectedSubjects: prev.selectedSubjects.includes(subjectName)
        ? prev.selectedSubjects.filter(s => s !== subjectName)
        : [...prev.selectedSubjects, subjectName]
    }));
  };

  const handleAddTutorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim() || !formData.tempPassword) {
      if (!formData.tempPassword) {
        addToast({ type: 'error', title: 'Missing Password', description: 'Please generate a temporary password first.' });
      }
      return;
    }

    setIsInviting(true);
    const cleanEmail = formData.email.trim().toLowerCase();
    const chosenProg = programmes.find((p) => p.name === formData.examType) || programmes[0];

    try {
      await addTutor({
        name: formData.name,
        email: cleanEmail,
        phone: formData.phone || '0803 123 4567',
        subjects: formData.selectedSubjects.length > 0 ? formData.selectedSubjects : ['General Studies'],
        departments: formData.departments,
        examTypes: [formData.examType],
        bio: formData.bio,
        programmeIds: chosenProg ? [chosenProg.id] : ['prog-jamb'],
        status: 'Invited',
        rating: 0.0,
        totalClassesTaught: 0,
        ratePerHour: 3500,
        temporaryPassword: formData.tempPassword,
        hasChangedPassword: false,
        avatar: '',
      });

      setShowAddModal(false);
      setFormData({
        name: '',
        email: '',
        phone: '',
        departments: ['Science'],
        examType: programmes[0]?.name || 'JAMB UTME Prep',
        selectedSubjects: [],
        bio: '',
        tempPassword: '',
      });

      addToast({
        type: 'success',
        title: 'Tutor Invitation Sent',
        description: `${formData.name} invited. Access will be granted after password change.`,
      });
    } catch (error) {
      // Error is already handled with a toast in addTutor, but we can log it here
      console.error('Error in handleAddTutorSubmit:', error);
    } finally {
      setIsInviting(false);
    }
  };

  // Filter subjects based on selected departments
  const availableSubjects = allSubjects.filter(s => 
    s.department === 'General' || formData.departments.includes(s.department as any)
  );

  return (
    <div id="tutors-management-page" className="p-4 sm:p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Tutors</h2>
          <p className="text-xs text-slate-500 mt-1">
            Manage subject specialists, performance ratings, and portal access across academic departments.
          </p>
        </div>

        <div className="flex items-center space-x-4">
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg shadow-sm transition-all flex items-center space-x-1.5 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Add Tutor</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center space-x-2 text-slate-600">
            <GraduationCap className="w-4 h-4 text-[#EA580C]" />
            <span className="text-xs font-semibold text-slate-600">Total Tutors</span>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-2">
            {(tutors || []).length}
          </p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center space-x-2 text-amber-600">
            <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
            <span className="text-xs font-semibold text-amber-600">Average Student Rating</span>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-2">
            {classRatings.length > 0
              ? (classRatings.reduce((acc, r) => acc + (Number(r.stars) || 0), 0) / classRatings.length).toFixed(1)
              : '0.0'}{' '}
            / 5.0
          </p>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">
            {classRatings.length} {classRatings.length === 1 ? 'Rating' : 'Ratings'} Submitted
          </p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-3 md:p-4 rounded-xl border border-slate-200/90 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-1 bg-slate-50/80 p-1 rounded-lg border border-slate-200/60 overflow-x-auto">
          {(['All', 'Active', 'Invited', 'Suspended'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveFilter(tab)}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
                activeFilter === tab
                  ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/60'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <div className="relative flex items-center bg-slate-50/60 border border-slate-200 rounded-lg px-2.5 py-1.5 flex-1 sm:w-56 focus-within:bg-white focus-within:border-orange-500 transition-all shadow-2xs">
            <Search className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tutor or subject..."
              className="bg-transparent text-xs outline-none w-full text-slate-800 placeholder:text-slate-400"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-5">Tutor</th>
                <th className="py-3 px-5">Subjects</th>
                <th className="py-3 px-5">Departments</th>
                <th className="py-3 px-5 text-center">Rating</th>
                <th className="py-3 px-5 text-center">Status</th>
                <th className="py-3 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredTutors.map((tutor) => {
                const initials = tutor.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase();

                return (
                  <tr
                    key={tutor.id}
                    onClick={() => setSelectedTutor(tutor)}
                    className="hover:bg-slate-50/60 cursor-pointer transition-colors"
                  >
                    <td className="py-3.5 px-5">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-lg bg-orange-100 text-[#EA580C] font-bold text-xs flex items-center justify-center shrink-0">
                          {initials}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{tutor.name}</p>
                          <p className="text-[11px] text-slate-400">{tutor.email}</p>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-5">
                      <div className="flex flex-wrap gap-1 max-w-[300px]">
                        {(tutor.subjects || []).map((sub, i) => (
                          <span
                            key={i}
                            className="bg-slate-100 text-slate-700 font-medium px-2 py-0.5 rounded text-[10px]"
                          >
                            {sub}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td className="py-3.5 px-5">
                      <div className="flex flex-wrap gap-1">
                        {(tutor.departments || []).map((dept, i) => (
                          <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700">
                            {dept}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td className="py-3.5 px-5 text-center">
                      {(() => {
                        const stats = getTutorRatingStats(tutor.id);
                        const hasRatings = stats.totalRatings > 0;
                        return (
                          <div className="flex flex-col items-center justify-center">
                            <div className="flex items-center justify-center space-x-0.5">
                              {[1, 2, 3, 4, 5].map((s) => (
                                <Star
                                  key={s}
                                  className={`w-3 h-3 ${
                                    hasRatings && s <= Math.round(stats.averageRating)
                                      ? 'text-amber-400 fill-amber-400'
                                      : 'text-slate-200 fill-slate-100'
                                  }`}
                                />
                              ))}
                            </div>
                            <span className="text-[10px] font-bold text-slate-500 mt-0.5 tabular-nums">
                              {hasRatings ? `${stats.averageRating.toFixed(1)} (${stats.totalRatings})` : 'No ratings'}
                            </span>
                          </div>
                        );
                      })()}
                    </td>

                    <td className="py-3.5 px-5 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          tutor.status === 'Active'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                            : tutor.status === 'Invited'
                            ? 'bg-blue-50 text-blue-700 border border-blue-100'
                            : 'bg-rose-50 text-rose-700 border border-rose-100'
                        }`}
                      >
                        {tutor.status === 'Invited' ? 'Inactive' : tutor.status}
                      </span>
                    </td>

                    <td className="py-3.5 px-5 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          type="button"
                          onClick={() => setSelectedTutor(tutor)}
                          className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors inline-flex items-center space-x-1"
                          title="View tutor profile details"
                        >
                          <Eye className="w-3 h-3 text-slate-500" />
                          <span>View Details</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Add Tutor */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-base text-slate-900">Invite Tutor</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Assign academic departments and subjects taught.
                </p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddTutorSubmit} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Emmanuel Adeyemi"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    placeholder="tutor@excellence.edu.ng"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Phone (11 Digits)</label>
                  <input
                    type="tel"
                    required
                    maxLength={11}
                    minLength={11}
                    placeholder="08012345678"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '') })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Academic Departments *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Science', 'Commercial', 'Arts'] as const).map((dept) => {
                    const isChecked = formData.departments.includes(dept);
                    return (
                      <label
                        key={dept}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border text-[11px] font-bold transition-all cursor-pointer ${
                          isChecked
                            ? 'bg-orange-50 border-orange-300 text-orange-800'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded border mb-2 flex items-center justify-center transition-colors ${
                          isChecked ? 'bg-orange-600 border-orange-600' : 'bg-white border-slate-300'
                        }`}>
                          {isChecked && <CheckSquare className="w-3 h-3 text-white" />}
                        </div>
                        <span>{dept}</span>
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={isChecked}
                          onChange={() => toggleDepartmentSelection(dept)}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>

              <ModernSelect
                label="Programme *"
                value={formData.examType}
                onChange={(val) => setFormData({ ...formData, examType: val })}
                options={programmes.map(p => ({ value: p.name, label: p.name }))}
              />

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Subjects Taught *
                </label>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 border border-slate-200 rounded-lg bg-slate-50">
                  {availableSubjects.map((sub) => {
                    const isSelected = formData.selectedSubjects.includes(sub.name);
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => toggleSubjectSelection(sub.name)}
                        className={`flex items-center space-x-2 px-2 py-1.5 rounded text-[10px] font-medium border transition-all ${
                          isSelected
                            ? 'bg-orange-50 border-orange-200 text-orange-700'
                            : 'bg-white border-slate-100 text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        {isSelected ? <CheckCircle2 className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                        <span className="truncate">{sub.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Temporary Password *</label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    readOnly
                    value={formData.tempPassword}
                    placeholder="Click generate to create password"
                    className="flex-1 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 outline-none font-mono tracking-wider"
                  />
                  <button
                    type="button"
                    onClick={generatePassword}
                    className="px-3 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors flex items-center space-x-1"
                  >
                    <Key className="w-3.5 h-3.5" />
                    <span>Generate</span>
                  </button>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 flex items-start space-x-2.5">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed">
                  The tutor will use their email and this temporary password for the first login. They must change it to a permanent one before they can access the Tutor Portal.
                </p>
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
                  disabled={isInviting}
                  className="px-4 py-2 font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {isInviting ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <span>Send Invitation</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Tutor Profile Details */}
      {selectedTutor && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">Tutor Profile</h3>
              <button onClick={() => setSelectedTutor(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-4 text-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center space-x-3.5">
                  <div className="w-12 h-12 rounded-xl bg-orange-100 text-[#EA580C] font-extrabold text-base flex items-center justify-center overflow-hidden">
                    {selectedTutor.avatar ? (
                      <img src={selectedTutor.avatar} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      selectedTutor.name.charAt(0)
                    )}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">{selectedTutor.name}</h4>
                    <p className="text-slate-500 text-xs">{(selectedTutor.departments || []).join(', ') || 'General'}</p>
                  </div>
                </div>

                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    selectedTutor.status === 'Active'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : selectedTutor.status === 'Invited'
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}
                >
                  {selectedTutor.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Email</span>
                  <p className="font-semibold text-slate-800 truncate">{selectedTutor.email}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Phone</span>
                  <p className="font-semibold text-slate-800">{selectedTutor.phone}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Rating</span>
                  {(() => {
                    const stats = getTutorRatingStats(selectedTutor.id);
                    return (
                      <p className="font-semibold text-amber-600 flex items-center space-x-1">
                        <Star className="w-3.5 h-3.5 fill-amber-400" />
                        <span>
                          {stats.totalRatings > 0
                            ? `${stats.averageRating.toFixed(1)} / 5.0 (${stats.totalRatings} ratings)`
                            : 'No ratings yet'}
                        </span>
                      </p>
                    );
                  })()}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-slate-500 font-semibold">Assigned Subjects:</p>
                <div className="flex flex-wrap gap-1.5">
                  {(selectedTutor.subjects || []).map((sub, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 bg-orange-50 text-[#EA580C] font-semibold rounded-md border border-orange-200"
                    >
                      {sub}
                    </span>
                  ))}
                </div>
              </div>

              {selectedTutor.status === 'Invited' && (
                <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-100 text-blue-900 flex items-start space-x-2">
                  <Lock className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-[11px]">Pending Access</p>
                    <p className="text-[10px] text-blue-700 mt-0.5 leading-relaxed">
                      This tutor has been invited but has not yet completed their mandatory password change. They will remain inactive until their first successful login.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100 gap-2">
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    toggleTutorSuspend(selectedTutor.id);
                    setSelectedTutor((prev) =>
                      prev ? { ...prev, status: prev.status === 'Suspended' ? 'Active' : 'Suspended' } : null
                    );
                  }}
                  className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-colors inline-flex items-center space-x-1.5 uppercase tracking-wider border ${
                    selectedTutor.status === 'Suspended'
                      ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200'
                      : 'text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200'
                  }`}
                >
                  <UserX className="w-3.5 h-3.5" />
                  <span>{selectedTutor.status === 'Suspended' ? 'Reactivate' : 'Suspend'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-3 py-1.5 text-[10px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg uppercase tracking-wider flex items-center space-x-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setSelectedTutor(null)}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg shadow-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={async () => {
          if (selectedTutor) {
            await deleteTutor(selectedTutor.id);
            setSelectedTutor(null);
            setShowDeleteConfirm(false);
          }
        }}
        title="Delete Tutor?"
        message={`Are you sure you want to remove ${selectedTutor?.name} from the system? This will revoke all portal access and remove their association with assigned subjects.`}
        confirmText="Yes, Delete Permanently"
        type="danger"
      />
    </div>
  );
};
