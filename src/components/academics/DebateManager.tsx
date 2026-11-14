import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Video,
  Users,
  Search,
  Settings,
  Sliders,
  CheckCircle,
  Clock,
  ChevronDown,
} from 'lucide-react';

export const DebateManager: React.FC = () => {
  const { setAdminSection, addToast } = useApp();

  const [activeTab, setActiveTab] = useState<'All' | 'Scored' | 'Awaiting'>('All');
  const [search, setSearch] = useState('');

  return (
    <div id="debate-management-page" className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Row (video 02:35) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Debate Completion</h2>
          <p className="text-xs text-slate-500 mt-1">
            Team video submissions scored by the jury panel. Top teams advance each phase.
          </p>
        </div>

        <button
          onClick={() => setAdminSection('tutors')}
          className="px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg shadow-sm transition-all flex items-center space-x-1.5 self-start sm:self-auto"
        >
          <Users className="w-4 h-4" />
          <span>Manage Jury</span>
        </button>
      </div>

      {/* 4 Stat Cards (video 02:35) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-xs">
          <p className="text-xs font-semibold text-slate-600">Videos Submitted</p>
          <p className="text-3xl font-extrabold text-slate-900 tracking-tight mt-2">0</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-xs">
          <p className="text-xs font-semibold text-slate-600">Fully Scored</p>
          <p className="text-3xl font-extrabold text-slate-900 tracking-tight mt-2">0</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-xs">
          <p className="text-xs font-semibold text-slate-600">Awaiting Scores</p>
          <p className="text-3xl font-extrabold text-slate-900 tracking-tight mt-2">0</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200/90 shadow-xs">
          <p className="text-xs font-semibold text-slate-600">Top Score</p>
          <p className="text-3xl font-extrabold text-slate-900 tracking-tight mt-2">—</p>
        </div>
      </div>

      {/* Filter Row (video 02:35 - 02:36) */}
      <div className="bg-white p-3 md:p-4 rounded-xl border border-slate-200/90 shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* Left: Filter Tabs & Rubric */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab('All')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'All'
                ? 'bg-[#EA580C] text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            All (0)
          </button>
          <button
            onClick={() => setActiveTab('Scored')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'Scored'
                ? 'bg-[#EA580C] text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            Scored (0)
          </button>
          <button
            onClick={() => setActiveTab('Awaiting')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === 'Awaiting'
                ? 'bg-[#EA580C] text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            Awaiting (0)
          </button>

          <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block" />

          <button
            onClick={() => {
              addToast({
                type: 'info',
                title: 'Debate Rubric',
                description: 'Criteria: Structure (30%), Evidence (30%), Delivery (20%), Rebuttal (20%).',
              });
            }}
            className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition-all flex items-center space-x-1"
          >
            <Sliders className="w-3 h-3 text-slate-500" />
            <span>Debate Rubric</span>
          </button>
        </div>

        {/* Right: Search */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <div className="relative flex items-center bg-slate-50/60 border border-slate-200 rounded-lg px-2.5 py-1.5 flex-1 sm:w-56 focus-within:bg-white focus-within:border-orange-500 transition-all">
            <Search className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search team..."
              className="bg-transparent text-xs outline-none w-full text-slate-800 placeholder:text-slate-400"
            />
          </div>
        </div>
      </div>

      {/* Empty State matching video 02:36 */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs p-16 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
          <Video className="w-6 h-6" />
        </div>
        <p className="text-xs font-medium text-slate-500">No submissions match that filter.</p>
        <p className="text-[11px] text-slate-400 mt-1 max-w-sm">
          Once school teams record and upload their round-one video debates, they will populate here for the jury to evaluate.
        </p>
      </div>
    </div>
  );
};
