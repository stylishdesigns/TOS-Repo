import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Search,
  Plus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Info,
  X,
} from 'lucide-react';

interface OtherLearner {
  id: string;
  name: string;
  initials: string;
  state: string;
  school?: string;
  progress: 'Not started' | 'Training';
  status: 'Active' | 'Idle';
}

export const AdmissionsManager: React.FC = () => {
  const { settings, admissions, approveAdmission, rejectAdmission, addToast } = useApp();

  const [activeTab, setActiveTab] = useState<'Pending' | 'Approved' | 'Rejected'>('Pending');
  const [programmeFilter, setProgrammeFilter] = useState('All Programmes');
  const [search, setSearch] = useState('');

  const filtered = (admissions || []).filter((l) => {
    const matchesTab = l.status === activeTab;
    const matchesProg = programmeFilter === 'All Programmes' ? true : l.programmeName === programmeFilter;
    const matchesSearch =
      !search ||
      l.applicantName.toLowerCase().includes(search.toLowerCase()) ||
      l.email.toLowerCase().includes(search.toLowerCase());
    return matchesTab && matchesProg && matchesSearch;
  });

  return (
    <div id="admissions-management-page" className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Admissions Registry</h2>
          <p className="text-xs text-slate-500 mt-1">
            Review and process incoming applications for various academic programmes.
          </p>
        </div>

        <div className="flex items-center space-x-4">
          <div className="text-right hidden md:block">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block leading-none">Academic Session</span>
            <span className="text-sm font-black text-[#EA580C]">{settings.academicSession}</span>
          </div>
        </div>
      </div>

      {/* Tabs Row */}
      <div className="flex items-center space-x-2">
        {(['Pending', 'Approved', 'Rejected'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === tab
                ? 'bg-[#EA580C] text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            {tab} Applications ({(admissions || []).filter(a => a.status === tab).length})
          </button>
        ))}
      </div>

      {/* Filter Row */}
      <div className="bg-white p-3 md:p-4 rounded-xl border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full md:w-64 pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-orange-500 shadow-2xs"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-5">Applicant</th>
                <th className="py-3 px-5">Programme</th>
                <th className="py-3 px-5">Applied Date</th>
                <th className="py-3 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-slate-400 font-medium italic">
                    No {activeTab.toLowerCase()} applications found.
                  </td>
                </tr>
              ) : (
                filtered.map((app) => (
                  <tr key={app.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-5">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-lg bg-orange-50 text-[#EA580C] font-bold text-xs flex items-center justify-center shrink-0">
                          {app.applicantName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{app.applicantName}</p>
                          <p className="text-[10px] text-slate-500">{app.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-5 font-medium text-slate-600">{app.programmeName}</td>
                    <td className="py-3.5 px-5 font-medium text-slate-600">{app.appliedDate}</td>
                    <td className="py-3.5 px-5 text-right">
                      {app.status === 'Pending' ? (
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => approveAdmission(app.id)}
                            className="px-3 py-1 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => rejectAdmission(app.id)}
                            className="px-3 py-1 bg-rose-50 text-rose-600 rounded-lg font-bold hover:bg-rose-100 transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          app.status === 'Approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}>
                          {app.status}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
