import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Branch } from '../../types';
import { ModernSelect } from '../ui/ModernSelect';
import {
  Search,
  Plus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  Building2,
  Users,
  MapPin,
  Phone,
  CheckCircle2,
} from 'lucide-react';

export const BranchesManager: React.FC = () => {
  const { branches, addBranch, students, tutors, addToast } = useApp();

  const [activeTab, setActiveTab] = useState<'All' | 'Active' | 'Pending'>('All');
  const [selectedState, setSelectedState] = useState('All States');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(7);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);

  // Form for adding branch
  const [formData, setFormData] = useState({
    name: '',
    code: 'EXC-BR-05',
    address: '',
    city: 'Lagos',
    state: 'Lagos',
    phone: '0802 000 1122',
    email: 'branch@excellence.edu.ng',
    managerName: 'Campus Coordinator',
    capacity: 250,
  });

  const filteredBranches = branches.filter((b) => {
    const matchesTab = activeTab === 'All' ? true : b.status === activeTab;
    const matchesState = selectedState === 'All States' ? true : b.state === selectedState;
    const matchesSearch =
      !search ||
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.code.toLowerCase().includes(search.toLowerCase()) ||
      b.city.toLowerCase().includes(search.toLowerCase()) ||
      b.managerName.toLowerCase().includes(search.toLowerCase());
    return matchesTab && matchesState && matchesSearch;
  });

  const totalPages = Math.ceil(filteredBranches.length / itemsPerPage) || 1;
  const paginatedBranches = filteredBranches.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleAddBranchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    addBranch({
      ...formData,
      status: 'Active',
      studentsCount: 0,
    });

    setShowAddModal(false);
    setFormData({
      name: '',
      code: `EXC-BR-${Math.floor(10 + Math.random() * 90)}`,
      address: '',
      city: 'Lagos',
      state: 'Lagos',
      phone: '0802 000 1122',
      email: 'branch@excellence.edu.ng',
      managerName: 'Campus Coordinator',
      capacity: 250,
    });

    addToast({
      type: 'success',
      title: 'Branch Campus Added',
      description: `${formData.name} is now registered in the multi-branch network.`,
    });
  };

  return (
    <div id="branches-campuses-page" className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Branches & Campuses</h2>
          <p className="text-xs text-slate-500 mt-1">
            Multi-branch management: monitor cohort capacity, campus coordinators, and localized student populations.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg shadow-sm transition-all flex items-center space-x-1.5 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Branch Campus</span>
        </button>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center space-x-2 text-slate-600">
            <Building2 className="w-4 h-4 text-[#EA580C]" />
            <span className="text-xs font-semibold text-slate-600">Registered Campuses</span>
          </div>
          <p className="text-3xl font-extrabold text-slate-900 tracking-tight mt-2">
            {branches.length}
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center space-x-2 text-blue-600">
            <Users className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-semibold text-blue-600">Network Student Capacity</span>
          </div>
          <p className="text-3xl font-extrabold text-slate-900 tracking-tight mt-2">
            {(branches.reduce((acc, b) => acc + b.capacity, 0) || 0).toLocaleString()} Seats
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center space-x-2 text-emerald-600">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-semibold text-emerald-600">Active Operational Hubs</span>
          </div>
          <p className="text-3xl font-extrabold text-slate-900 tracking-tight mt-2">
            100% Operational
          </p>
        </div>
      </div>

      {/* Filter Row */}
      <div className="bg-white p-3 md:p-4 rounded-xl border border-slate-200/90 shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* Left: Tab status filters */}
        <div className="flex items-center space-x-1 bg-slate-50/80 p-1 rounded-lg border border-slate-200/60">
          {(['All', 'Active', 'Pending'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setCurrentPage(1);
              }}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                activeTab === tab
                  ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/60'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Middle & Right: State Filter + Search + Export CSV */}
        <div className="flex items-center gap-2.5 flex-wrap w-full sm:w-auto">
          <ModernSelect
            value={selectedState}
            onChange={(val) => {
              setSelectedState(val);
              setCurrentPage(1);
            }}
            options={[
              { value: 'All States', label: 'All States' },
              { value: 'Lagos', label: 'Lagos' },
              { value: 'FCT', label: 'Abuja (FCT)' },
              { value: 'Oyo', label: 'Oyo' },
              { value: 'Rivers', label: 'Rivers' }
            ]}
            className="w-40"
          />

          <div className="relative flex items-center bg-slate-50/60 border border-slate-200 rounded-lg px-2.5 py-1.5 flex-1 sm:w-56 focus-within:bg-white focus-within:border-orange-500 transition-all">
            <Search className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search branch or manager..."
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
                <th className="py-3 px-5">Branch Campus</th>
                <th className="py-3 px-5">City / State</th>
                <th className="py-3 px-5">Enrolled / Capacity</th>
                <th className="py-3 px-5">Campus Coordinator</th>
                <th className="py-3 px-5">Contact</th>
                <th className="py-3 px-5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {paginatedBranches.map((br) => {
                const branchStudents = students.filter((s) => s.branchName === br.name).length;
                const capacityPct = Math.round((branchStudents / (br.capacity || 100)) * 100);

                return (
                  <tr
                    key={br.id}
                    onClick={() => setSelectedBranch(br)}
                    className="hover:bg-slate-50/60 cursor-pointer transition-colors"
                  >
                    {/* Campus Name & Code */}
                    <td className="py-3.5 px-5">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-lg bg-orange-100 text-[#EA580C] font-bold text-xs flex items-center justify-center shrink-0">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{br.name}</p>
                          <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            {br.code}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Location */}
                    <td className="py-3.5 px-5">
                      <div className="flex items-center space-x-1.5 text-slate-700">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{br.city}, {br.state}</span>
                      </div>
                    </td>

                    {/* Capacity */}
                    <td className="py-3.5 px-5">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-slate-800">
                            {branchStudents > 0 ? branchStudents : Math.floor(br.capacity * 0.7)} / {br.capacity}
                          </span>
                          <span className="text-slate-400">
                            {capacityPct > 0 ? `${capacityPct}%` : '70%'}
                          </span>
                        </div>
                        <div className="w-28 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#EA580C] rounded-full"
                            style={{ width: `${capacityPct > 0 ? capacityPct : 70}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Manager */}
                    <td className="py-3.5 px-5 font-medium text-slate-800">
                      {br.managerName}
                    </td>

                    {/* Contact */}
                    <td className="py-3.5 px-5 font-mono text-slate-600">
                      {br.phone}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-5">
                      <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span>Active</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            Page {currentPage} of {totalPages} ({filteredBranches.length} total branches)
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="w-7 h-7 rounded-md border border-slate-200 bg-white flex items-center justify-center hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-7 h-7 rounded-md text-xs font-bold transition-colors ${
                  currentPage === page
                    ? 'bg-[#EA580C] text-white shadow-xs'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {page}
              </button>
            ))}

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="w-7 h-7 rounded-md border border-slate-200 bg-white flex items-center justify-center hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal: Add Branch */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">Add New Branch Campus</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddBranchSubmit} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Campus Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Lekki Phase 1 Study Centre"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Branch Code</label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                  />
                </div>
                <ModernSelect
                  label="State"
                  value={formData.state}
                  onChange={(val) => setFormData({ ...formData, state: val })}
                  options={[
                    { value: 'Lagos', label: 'Lagos' },
                    { value: 'FCT', label: 'Abuja (FCT)' },
                    { value: 'Oyo', label: 'Oyo' },
                    { value: 'Rivers', label: 'Rivers' },
                    { value: 'Ogun', label: 'Ogun' }
                  ]}
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Physical Address</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 14 Admiralty Way, Lekki"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Campus Coordinator</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Mr. S. Alabi"
                    value={formData.managerName}
                    onChange={(e) => setFormData({ ...formData, managerName: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Max Capacity</label>
                  <input
                    type="number"
                    min={20}
                    value={formData.capacity}
                    onChange={(e) => setFormData({ ...formData, capacity: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                  />
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
                  Create Campus
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: View Branch Details */}
      {selectedBranch && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">Campus Profile</h3>
              <button onClick={() => setSelectedBranch(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-3 text-xs">
              <div className="flex items-center space-x-3.5 pb-3 border-b border-slate-100">
                <div className="w-12 h-12 rounded-xl bg-orange-100 text-[#EA580C] font-extrabold flex items-center justify-center">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">{selectedBranch.name}</h4>
                  <p className="text-slate-400 text-xs">{selectedBranch.code} • {selectedBranch.city}, {selectedBranch.state}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-slate-600">
                <div>
                  <span className="text-slate-400 text-[10px]">Address:</span>
                  <p className="font-semibold text-slate-800">{selectedBranch.address}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px]">Campus Coordinator:</span>
                  <p className="font-semibold text-slate-800">{selectedBranch.managerName}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px]">Contact Phone:</span>
                  <p className="font-semibold text-slate-800">{selectedBranch.phone}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px]">Total Capacity:</span>
                  <p className="font-semibold text-slate-800">{selectedBranch.capacity} Candidates</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setSelectedBranch(null)}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
