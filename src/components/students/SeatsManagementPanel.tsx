import React, { useState, useEffect } from 'react';
import {
  Users,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Search,
  Power,
  Info
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Student } from '../../types';

interface SeatsManagementPanelProps {
  students: Student[];
}

export const SeatsManagementPanel: React.FC<SeatsManagementPanelProps> = ({ students }) => {
  const { 
    activeCentreId, 
    activeCentre, 
    seatsSummary, 
    refreshSeatsSummary, 
    toggleStudentAccess,
    addToast 
  } = useApp();

  const [togglingStudentId, setTogglingStudentId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'active' | 'disabled'>('all');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    refreshSeatsSummary();
  }, [activeCentreId]);

  const used = seatsSummary?.used ?? students.filter(s => s.status !== 'Suspended').length;
  const cap = seatsSummary?.cap ?? 10;
  const isTrial = seatsSummary?.isTrial ?? (activeCentre?.status === 'trial');
  const trialDaysLeft = seatsSummary?.trialDaysLeft ?? 30;

  const percentageUsed = Math.min(100, Math.round((used / cap) * 100));

  const handleToggle = async (student: Student, currentStatusActive: boolean) => {
    const studentUid = student.uid || student.id;
    setTogglingStudentId(studentUid);
    setErrorMessage(null);

    try {
      const newActive = !currentStatusActive;
      await toggleStudentAccess(studentUid, newActive);
      addToast({
        type: 'success',
        title: newActive ? 'Access Restored' : 'Access Suspended',
        description: `${student.name}'s seat access is now ${newActive ? 'Active' : 'Disabled'}. Seat count updated.`,
      });
      await refreshSeatsSummary();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update student access.');
      addToast({
        type: 'error',
        title: 'Action Denied',
        description: err.message || 'Could not update student seat access.',
      });
    } finally {
      setTogglingStudentId(null);
    }
  };

  const filteredStudents = students.filter((student) => {
    const studentUid = student.uid || student.id;
    const accessData = seatsSummary?.studentAccess?.[studentUid];
    const isCurrentlyActive = accessData ? accessData.status === 'active' : student.status !== 'Suspended';

    if (filterMode === 'active' && !isCurrentlyActive) return false;
    if (filterMode === 'disabled' && isCurrentlyActive) return false;

    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      student.name.toLowerCase().includes(query) ||
      (student.email && student.email.toLowerCase().includes(query)) ||
      (student.programmeName && student.programmeName.toLowerCase().includes(query))
    );
  });

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm transition-all mb-8">
      {/* Top Header & Overview */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-2xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center font-bold">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Student Seats</span>
                {isTrial && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    <Sparkles className="w-3 h-3" />
                    Trial Active ({trialDaysLeft} days left)
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Live seat allocation and individual student access controls.
              </p>
            </div>
          </div>
        </div>

        {/* Live Seat Metric Widget */}
        <div className="flex items-center gap-6 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/60">
          <div className="text-left">
            <span className="text-xs text-slate-400 dark:text-slate-400 font-medium block">
              Active Seats
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                {used}
              </span>
              <span className="text-sm font-semibold text-slate-400">
                of {cap} seats
              </span>
            </div>
          </div>

          <div className="w-32 hidden sm:block">
            <div className="h-2.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  percentageUsed >= 100
                    ? 'bg-rose-500'
                    : percentageUsed >= 80
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${percentageUsed}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block text-right font-medium">
              {cap - used > 0 ? `${cap - used} seats free` : 'Cap reached'}
            </span>
          </div>

          <button
            onClick={() => refreshSeatsSummary()}
            className="p-2 text-slate-400 hover:text-orange-500 rounded-xl hover:bg-white dark:hover:bg-slate-700 transition-colors"
            title="Refresh seats"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Error Notice */}
      {errorMessage && (
        <div className="mt-4 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-xs underline hover:text-rose-700 dark:hover:text-rose-300 ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter and Search controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 mb-4">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search students..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-orange-500"
          />
        </div>

        <div className="flex items-center gap-1.5 self-end sm:self-auto bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs">
          <button
            onClick={() => setFilterMode('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              filterMode === 'all'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            All ({students.length})
          </button>
          <button
            onClick={() => setFilterMode('active')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              filterMode === 'active'
                ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Active ({used})
          </button>
          <button
            onClick={() => setFilterMode('disabled')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              filterMode === 'disabled'
                ? 'bg-white dark:bg-slate-700 text-rose-600 dark:text-rose-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Disabled ({Math.max(0, students.length - used)})
          </button>
        </div>
      </div>

      {/* Student List Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
              <th className="py-3 px-4">Student</th>
              <th className="py-3 px-4">Programme</th>
              <th className="py-3 px-4">Last Status Change</th>
              <th className="py-3 px-4 text-center">Seat Status</th>
              <th className="py-3 px-4 text-right">Access Switch</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {filteredStudents.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-400">
                  No students found matching your filter.
                </td>
              </tr>
            ) : (
              filteredStudents.map((student) => {
                const studentUid = student.uid || student.id;
                const accessData = seatsSummary?.studentAccess?.[studentUid];
                const isCurrentlyActive = accessData
                  ? accessData.status === 'active'
                  : student.status !== 'Suspended';
                const isBusy = togglingStudentId === studentUid;

                const lastChangedDate = accessData?.lastToggledAt
                  ? new Date(accessData.lastToggledAt).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Joined';

                return (
                  <tr
                    key={student.id}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    {/* Student Info */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-slate-600 dark:text-slate-300">
                          {student.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white">
                            {student.name}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {student.email || 'No email'}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Programme */}
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 font-medium">
                      {student.programmeName || 'General'}
                    </td>

                    {/* Last Changed */}
                    <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                      {lastChangedDate}
                    </td>

                    {/* Badge */}
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                          isCurrentlyActive
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {isCurrentlyActive ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Active Seat</span>
                          </>
                        ) : (
                          <>
                            <Power className="w-3 h-3" />
                            <span>Access Off</span>
                          </>
                        )}
                      </span>
                    </td>

                    {/* Toggle Switch */}
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleToggle(student, isCurrentlyActive)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          isCurrentlyActive ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                        } ${isBusy ? 'opacity-50 cursor-wait' : ''}`}
                        title={isCurrentlyActive ? 'Switch off access to free seat' : 'Restore student seat access'}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                            isCurrentlyActive ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-slate-400" />
          Switching access off frees a seat immediately. Re-activating an account requires an available seat.
        </span>
        <span className="text-[10px]">
          Seat swap limit: 2 per student / 30 days
        </span>
      </div>
    </div>
  );
};
