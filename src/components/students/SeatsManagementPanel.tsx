import React, { useState, useEffect } from 'react';
import {
  Users,
  Sparkles,
  AlertCircle,
  RefreshCw,
  Search,
  Power,
  Info,
  History,
  UserPlus,
  X,
  Lock,
  CircleDot,
  CheckCircle2,
  Clock3,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Student, SeatSummary } from '../../types';

interface SeatsManagementPanelProps {
  students: Student[];
}

const statusChip = (status: string) => {
  if (status === 'active')
    return 'bg-[var(--brand,#0F172A)] text-[var(--on-brand,#fff)] border-transparent';
  if (status === 'locked')
    return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20';
  return 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700';
};

const statusLabel = (status: string) =>
  status === 'active' ? 'Running' : status === 'locked' ? 'Locked' : 'Banked';

const fmtDay = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
    : '';

export const SeatsManagementPanel: React.FC<SeatsManagementPanelProps> = ({ students }) => {
  const {
    activeCentreId,
    activeCentre,
    seatsSummary,
    refreshSeatsSummary,
    toggleStudentAccess,
    setSeatSwitch,
    assignStudentToSeat,
    addToast,
  } = useApp();

  const [togglingStudentId, setTogglingStudentId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'active' | 'disabled'>('all');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [detailSeat, setDetailSeat] = useState<SeatSummary | null>(null);
  const [seatSwitchingId, setSeatSwitchingId] = useState<string | null>(null);
  const [assignSeat, setAssignSeat] = useState<SeatSummary | null>(null);
  const [assignPick, setAssignPick] = useState('');
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    refreshSeatsSummary();
  }, [activeCentreId]);

  const seats = seatsSummary?.seats ?? [];
  const pool = seatsSummary?.pool ?? {
    total: seats.length,
    active: 0,
    available: 0,
    locked: 0,
    bankedDays: 0,
  };
  const enrolled = students.filter((s) => s.status !== 'Suspended').length;
  const used = seatsSummary?.used ?? students.filter((s) => s.status !== 'Suspended').length;
  const isTrial = seatsSummary?.isTrial ?? activeCentre?.status === 'trial';
  const trialDaysLeft = seatsSummary?.trialDaysLeft ?? 30;

  // Which seat each student holds, straight from the pool.
  const seatByUid = new Map<string, SeatSummary>();
  seats.forEach((s) => {
    if (s.studentUid) seatByUid.set(s.studentUid, s);
  });

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
        description: newActive
          ? `${student.name} now holds a seat; its 30-day count is running.`
          : `${student.name}'s seat is back in the pool with its remaining days banked.`,
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

  const handleSeatSwitch = async (seat: SeatSummary, active: boolean) => {
    setSeatSwitchingId(seat.id);
    setErrorMessage(null);
    try {
      await setSeatSwitch(seat.id, active);
      await refreshSeatsSummary();
      addToast({
        type: 'success',
        title: active ? `Seat ${seat.seatNo} switched on` : `Seat ${seat.seatNo} switched off`,
        description: active
          ? `Seat ${seat.seatNo}'s day count is running now, with or without a student on it.`
          : seat.studentName
          ? `${seat.studentName} left Seat ${seat.seatNo}; their access is off and their app now shows the contact-admin banner. The seat is banked with its remaining days.`
          : `Seat ${seat.seatNo} is banked; its days stop counting and its remaining days are safe.`,
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to switch the seat.');
      addToast({
        type: 'error',
        title: 'Action Denied',
        description: err.message || 'Could not switch the seat.',
      });
    } finally {
      setSeatSwitchingId(null);
    }
  };

  const handleAssign = async () => {
    if (!assignSeat || !assignPick) return;
    const student = students.find((s) => (s.uid || s.id) === assignPick);
    setAssigning(true);
    setErrorMessage(null);
    try {
      await assignStudentToSeat(assignSeat.id, assignPick);
      await refreshSeatsSummary();
      addToast({
        type: 'success',
        title: `Added to Seat ${assignSeat.seatNo}`,
        description: `${student?.name || 'The student'} now holds Seat ${assignSeat.seatNo}; their access is on and they can sign in.`,
      });
      setAssignSeat(null);
      setAssignPick('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to add the student to the seat.');
      addToast({
        type: 'error',
        title: 'Action Denied',
        description: err.message || 'Could not add the student to the seat.',
      });
    } finally {
      setAssigning(false);
    }
  };

  const filteredStudents = students.filter((student) => {
    const studentUid = student.uid || student.id;
    const accessData = seatsSummary?.studentAccess?.[studentUid];
    const isCurrentlyActive = accessData
      ? accessData.status === 'active'
      : student.status !== 'Suspended';

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
      {/* Top header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-2xl bg-[var(--brand,#0F172A)]/10 text-[var(--brand,#0F172A)] dark:text-[var(--brand-tint,#93c5fd)] flex items-center justify-center font-bold">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Seat Control Room</span>
                {isTrial && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    <Sparkles className="w-3 h-3" />
                    Trial Active ({trialDaysLeft} days left)
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xl">
                You pay for seats, not students. A seat only counts while a student is on it:
                adding a student switches the seat on and starts its count, and switching them off
                banks it with its remaining days. When a seat's days run out it locks until a new
                payment reopens it.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => refreshSeatsSummary()}
          className="p-2 text-slate-400 hover:text-[var(--brand,#0F172A)] rounded-xl hover:bg-slate-50 dark:hover:brightness-110 transition-colors self-start md:self-auto"
          title="Refresh seats"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Pool metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-6">
        <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 rounded-2xl p-3.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 block">
            Seats paid
          </span>
          <span className="text-2xl font-black text-slate-900 dark:text-white">{pool.total}</span>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 rounded-2xl p-3.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 block">
            Running now
          </span>
          <span className="text-2xl font-black text-[var(--brand,#0F172A)] dark:text-[var(--brand-tint,#93c5fd)]">
            {pool.active}
          </span>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 rounded-2xl p-3.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 block">
            Banked seats
          </span>
          <span className="text-2xl font-black text-slate-900 dark:text-white">
            {pool.available}
          </span>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 rounded-2xl p-3.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 block">
            Locked
          </span>
          <span className="text-2xl font-black text-rose-500">{pool.locked}</span>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 rounded-2xl p-3.5 col-span-2 sm:col-span-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 block">
            Banked days
          </span>
          <span className="text-2xl font-black text-slate-900 dark:text-white">
            {pool.bankedDays}
          </span>
        </div>
      </div>

      {/* Error notice */}
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

      {/* Seat pool: a table with a live switch on every seat */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">The pool</h3>
          <span className="text-[11px] text-slate-400">
            {enrolled} enrolled · {used} holding a running seat
          </span>
        </div>
        {seats.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-6 text-center text-xs text-slate-400">
            No seats in this facility&apos;s pool yet. Seats arrive when the trial starts or a payment is
            recorded on the TOS console.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700/60">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Seat</th>
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Days</th>
                  <th className="py-3 px-4 text-center">Switch</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {seats.map((seat) => {
                  const pct = Math.min(100, Math.round((seat.daysUsed / Math.max(1, seat.daysTotal)) * 100));
                  const low = seat.remaining <= 5 && seat.status === 'active';
                  const seatBusy = seatSwitchingId === seat.id;
                  return (
                    <tr key={seat.id} className="hover:bg-slate-50/50 dark:hover:brightness-110/30 transition-colors">
                      <td className="py-3 px-4">
                        <span className="text-xs font-black text-slate-900 dark:text-white">
                          Seat {seat.seatNo}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {seat.studentName ? (
                          <span className="font-bold text-slate-900 dark:text-white">{seat.studentName}</span>
                        ) : (
                          <span className="italic text-slate-400">No student</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusChip(seat.status)}`}
                        >
                          {seat.status === 'locked' ? (
                            <Lock className="w-3 h-3" />
                          ) : seat.status === 'active' ? (
                            <CircleDot className="w-3 h-3" />
                          ) : (
                            <CheckCircle2 className="w-3 h-3" />
                          )}
                          {statusLabel(seat.status)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {seat.status === 'locked' ? (
                          <span className="text-[11px] text-rose-500 font-semibold">
                            Completed its {seat.daysTotal} days · needs payment
                          </span>
                        ) : (
                          <div>
                            <div className="flex items-baseline gap-2">
                              <span className="text-[10px] text-slate-400">
                                Day {seat.daysUsed} of {seat.daysTotal}
                              </span>
                              <span
                                className={`text-[11px] font-black ${low ? 'text-rose-500' : 'text-slate-700 dark:text-slate-200'}`}
                              >
                                {seat.remaining} left
                              </span>
                            </div>
                            <div className="h-1.5 w-24 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mt-1">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${low ? 'bg-rose-500' : 'bg-[var(--brand,#0F172A)]'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {seat.studentUid ? (
                          <button
                            type="button"
                            disabled={seatBusy}
                            onClick={() => handleSeatSwitch(seat, false)}
                            title="Switch off: the count stops, the student leaves and the seat is banked"
                            className={`relative inline-flex h-7 w-14 shrink-0 items-center rounded-full border transition-colors duration-200 ${
                              seat.status === 'active'
                                ? 'bg-emerald-500 border-emerald-500'
                                : 'bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600'
                            } ${seatBusy ? 'opacity-60 cursor-wait' : ''}`}
                          >
                            <span
                              className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform duration-200 ${
                                seat.status === 'active' ? 'translate-x-7' : 'translate-x-0.5'
                              }`}
                            />
                          </button>
                        ) : (
                          <span
                            className="text-[11px] text-slate-300 dark:text-slate-600 font-bold"
                            title="A seat switches on only when a student is added to it"
                          >
                            —
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {!seat.studentUid && seat.status !== 'locked' && (
                            <button
                              type="button"
                              onClick={() => {
                                setAssignSeat(seat);
                                setAssignPick('');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-white bg-[var(--brand,#0F172A)] hover:brightness-110 rounded-lg transition-all"
                              title="Add a student to this seat"
                            >
                              <UserPlus className="w-3.5 h-3.5" />
                              Add student
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setDetailSeat(seat)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:brightness-110 rounded-lg transition-colors"
                            title="View this seat's history and details"
                          >
                            <History className="w-3.5 h-3.5" />
                            Details
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Filter and search controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-8 mb-4">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search students..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-[var(--brand,#0F172A)]"
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
            Access ON ({used})
          </button>
          <button
            onClick={() => setFilterMode('disabled')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              filterMode === 'disabled'
                ? 'bg-white dark:bg-slate-700 text-rose-600 dark:text-rose-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Access OFF ({Math.max(0, students.length - used)})
          </button>
        </div>
      </div>

      {/* Student list */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
              <th className="py-3 px-4">Student</th>
              <th className="py-3 px-4">Programme</th>
              <th className="py-3 px-4">Seat</th>
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
                const heldSeat = seatByUid.get(studentUid);

                return (
                  <tr
                    key={student.id}
                    className="hover:bg-slate-50/50 dark:hover:brightness-110/30 transition-colors"
                  >
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-slate-600 dark:text-slate-300">
                          {student.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white">{student.name}</div>
                          <div className="text-[11px] text-slate-400">{student.email || 'No email'}</div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 font-medium">
                      {student.programmeName || 'General'}
                    </td>

                    <td className="py-3.5 px-4">
                      {heldSeat && isCurrentlyActive ? (
                        <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                          Seat {heldSeat.seatNo}
                          <span className="block text-[10px] text-slate-400 font-medium">
                            {heldSeat.remaining} day{heldSeat.remaining === 1 ? '' : 's'} left
                          </span>
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">No seat</span>
                      )}
                    </td>

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
                            <Clock3 className="w-3 h-3" />
                            <span>Running</span>
                          </>
                        ) : (
                          <>
                            <Power className="w-3 h-3" />
                            <span>Access Off</span>
                          </>
                        )}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleToggle(student, isCurrentlyActive)}
                        className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border transition-colors duration-200 ${
                          isCurrentlyActive
                            ? 'bg-emerald-500 border-emerald-500'
                            : 'bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600'
                        } ${isBusy ? 'opacity-50 cursor-wait' : ''}`}
                        title={
                          isCurrentlyActive
                            ? 'Switch off access: freezes the used days and banks the seat'
                            : 'Switch on: the student draws the free seat with the most days left'
                        }
                      >
                        <span
                          className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ${
                            isCurrentlyActive ? 'translate-x-7' : 'translate-x-0.5'
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

      <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 flex items-center gap-1.5">
        <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span>
          A seat counts only while a student is on it; empty seats stay banked and never count.
          Adding a student switches the seat on, and a student can hold only one seat.
        </span>
      </div>

      {/* Add-student-to-seat modal: this is also the only way a seat turns on */}
      {assignSeat && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !assigning && setAssignSeat(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-sm p-6 border border-slate-200 dark:border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Add a student to Seat {assignSeat.seatNo}
                </h3>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  The seat starts counting the day it takes the student. Only students without a
                  seat are listed here.
                </p>
              </div>
              <button
                onClick={() => setAssignSeat(null)}
                disabled={assigning}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Choose student
            </label>
            {(() => {
              const unseated = students.filter((s) => !seatByUid.get(s.uid || s.id));
              if (unseated.length === 0) {
                return (
                  <p className="text-[11px] text-slate-400 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-3">
                    Every student in this facility already holds a seat. Switch a student off to
                    free their seat first, or enrol a new student.
                  </p>
                );
              }
              return (
                <select
                  value={assignPick}
                  onChange={(e) => setAssignPick(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-900 dark:text-white outline-none focus:border-[var(--brand,#0F172A)]"
                >
                  <option value="">Select a student...</option>
                  {unseated.map((s) => {
                    const uid = s.uid || s.id;
                    return (
                      <option key={uid} value={uid}>
                        {s.name}
                      </option>
                    );
                  })}
                </select>
              );
            })()}

            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setAssignSeat(null)}
                disabled={assigning}
                className="px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:brightness-110 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!assignPick || assigning}
                onClick={handleAssign}
                className="px-4 py-2 text-xs font-bold text-white bg-[var(--brand,#0F172A)] hover:brightness-110 rounded-xl transition-all disabled:opacity-40"
              >
                {assigning ? 'Adding...' : 'Add student'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Seat details + history modal */}
      {detailSeat && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDetailSeat(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto p-6 border border-slate-200 dark:border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  Seat {detailSeat.seatNo}
                </h3>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold mt-1 ${statusChip(detailSeat.status)}`}
                >
                  {statusLabel(detailSeat.status)}
                </span>
              </div>
              <button
                onClick={() => setDetailSeat(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 mb-4">
              <p>
                <span className="text-slate-400">Status: </span>
                {detailSeat.status === 'active'
                  ? 'Running, one day burns each calendar day'
                  : detailSeat.status === 'locked'
                  ? 'Locked, a payment reopens it'
                  : 'Banked in the pool, not counting'}
              </p>
              {detailSeat.status !== 'locked' && (
                <p>
                  <span className="text-slate-400">Days: </span>
                  Day {detailSeat.daysUsed} of {detailSeat.daysTotal} ·{' '}
                  <span className="font-bold">{detailSeat.remaining} left</span>
                </p>
              )}
              {detailSeat.status === 'active' && detailSeat.startedAt && (
                <p>
                  <span className="text-slate-400">Switched on: </span>
                  {fmtDay(detailSeat.startedAt)}
                </p>
              )}
              <p>
                <span className="text-slate-400">Student on it now: </span>
                {detailSeat.studentName || 'No student'}
              </p>
            </div>

            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">
              History of students on this seat
            </h4>
            {detailSeat.history.length === 0 ? (
              <p className="text-xs text-slate-400">
                No student history on this seat yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {detailSeat.history
                  .slice()
                  .reverse()
                  .map((h, i) => (
                    <li
                      key={`${h.uid}-${i}`}
                      className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 px-3 py-2 text-[11px]"
                    >
                      <div className="font-bold text-slate-700 dark:text-slate-200">
                        {h.name || h.uid}
                      </div>
                      <div className="text-slate-400">
                        {fmtDay(h.from)} → {fmtDay(h.to)}
                        {h.reason ? ` · ${h.reason}` : ''}
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
