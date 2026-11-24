import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ModernSelect } from '../ui/ModernSelect';
import {
  UserCheck,
  Calendar,
  Clock,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Send,
  Filter,
  Users,
  ShieldCheck,
  Settings,
  X,
  LogOut,
  Save,
} from 'lucide-react';

interface AttendanceRecord {
  studentId: string;
  studentName: string;
  programmeName: string;
  parentPhone: string;
  status: 'Present' | 'Absent' | 'Late' | 'No clock out';
  checkInTime?: string;
  checkOutTime?: string;
  parentNotified?: boolean;
  totalAttendanceCount?: number;
}

const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const shortDays = (days?: string[]) => (days && days.length ? days : ALL_DAYS).map((d) => d.slice(0, 3)).join(', ');

export const AttendanceTracker: React.FC = () => {
  const { students, programmes, settings, attendanceSettings, updateAttendanceSettings, attendanceLogs, addToast, centreName } =
    useApp();

  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [selectedProgramme, setSelectedProgramme] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Timing settings form state
  const [timingForm, setTimingForm] = useState({
    resumptionTime: attendanceSettings?.resumptionTime || '08:00 AM',
    closingTime: attendanceSettings?.closingTime || '03:30 PM',
    lateArrivalTime: attendanceSettings?.lateArrivalTime || '08:30 AM',
    operatingDays: Array.isArray(attendanceSettings?.operatingDays) && attendanceSettings.operatingDays.length
      ? attendanceSettings.operatingDays
      : ALL_DAYS,
  });

  // Map attendance logs to records
  const attendanceList: AttendanceRecord[] = (students || []).map((s) => {
    const log = attendanceLogs.find(l => l.studentId === s.id && l.date === selectedDate);
    
    return {
      studentId: s.id,
      studentName: s.name,
      programmeName: s.programmeName,
      parentPhone: s.parentPhone,
      status: log?.status || 'Absent',
      checkInTime: log?.clockInAt ? new Date(log.clockInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
      checkOutTime: log?.clockOutAt ? new Date(log.clockOutAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
      parentNotified: false,
      totalAttendanceCount: s.totalAttendanceCount || 0
    };
  });

  const filteredAttendance = attendanceList.filter((rec) => {
    const matchesProg =
      selectedProgramme === 'All' || rec.programmeName === selectedProgramme;
    const matchesSearch =
      !search ||
      rec.studentName.toLowerCase().includes(search.toLowerCase());
    return matchesProg && matchesSearch;
  });

  const presentCount = attendanceList.filter((r) => r.status === 'Present').length;
  const lateCount = attendanceList.filter((r) => r.status === 'Late').length;
  const absentCount = attendanceList.filter((r) => r.status === 'Absent').length;
  const noClockOutCount = attendanceList.filter((r) => r.status === 'No clock out').length;
  const total = attendanceList.length || 1;

  const presentPercent = Math.round((presentCount / total) * 100);
  const latePercent = Math.round((lateCount / total) * 100);
  const absentPercent = Math.round((absentCount / total) * 100);
  const attendanceRate = Math.round(
    ((presentCount + lateCount) / total) * 100
  );

  const handleUpdateStatus = (
    studentId: string,
    newStatus: 'Present' | 'Late' | 'Absent'
  ) => {
    // Manual status update disabled as per requirement
    addToast({
      type: 'info',
      title: 'Action Restricted',
      description: 'Attendance status is automated based on check-in activities.',
    });
  };

  const handleSendAbsentAlert = (record: AttendanceRecord) => {
    addToast({
      type: 'success',
      title: 'Parent Alert Dispatched!',
      description: `SMS notification sent to ${record.parentPhone}: "${record.studentName} was marked absent today at ${centreName}."`,
    });
  };

  // Helpers to convert between 12h and 24h formats for the time input
  const to24h = (time12h: string) => {
    if (!time12h) return "08:00";
    const [time, modifier] = time12h.split(' ');
    let [hours, minutes] = time.split(':');
    if (hours === '12') hours = '00';
    if (modifier === 'PM') hours = (parseInt(hours, 10) + 12).toString();
    return `${hours.padStart(2, '0')}:${minutes}`;
  };

  const to12h = (time24h: string) => {
    if (!time24h) return "08:00 AM";
    const [hours, minutes] = time24h.split(':');
    const h = parseInt(hours, 10);
    const modifier = h >= 12 ? 'PM' : 'AM';
    const displayHours = (h % 12 || 12).toString().padStart(2, '0');
    return `${displayHours}:${minutes} ${modifier}`;
  };

  const handleSaveTimingSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (!timingForm.operatingDays.length) {
      addToast({
        type: 'error',
        title: 'Pick at least one open day',
        description: 'Select the days your facility opens so students know when to check in.',
      });
      return;
    }
    updateAttendanceSettings(timingForm);
    addToast({
      type: 'success',
      title: 'Attendance Settings Saved',
      description: `Open days: ${timingForm.operatingDays.map((d) => d.slice(0, 3)).join(', ')} | Resumption: ${timingForm.resumptionTime} | Late Arrival: ${timingForm.lateArrivalTime} | Closing: ${timingForm.closingTime}`,
    });
    setShowSettingsModal(false);
  };

  return (
    <div id="attendance-tracking-page" className="p-4 sm:p-6 md:p-8 space-y-5 max-w-7xl mx-auto animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Attendance
          </h2>
          <p className="text-sm sm:text-[15px] font-bold text-slate-900 mt-0.5">
            Who is in, late or away for the selected day.
          </p>
        </div>
        <button
          onClick={() => setShowSettingsModal(true)}
          className="self-start sm:self-auto inline-flex items-center space-x-1.5 px-3.5 py-2 text-[11px] font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 active:scale-[0.98] transition-all"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Attendance Settings</span>
        </button>
      </div>

      {/* Timing Schedule Pill Banner */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-slate-900">
            <Clock className="w-4 h-4 text-orange-600" />
            <span className="text-[11px] font-black uppercase tracking-wider">Active timings</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-500 font-medium">
              Resumption <span className="font-bold text-slate-800 ml-1">{attendanceSettings?.resumptionTime || '08:00 AM'}</span>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-amber-50/70 border border-amber-200/80 text-[11px] text-amber-700 font-medium">
              Late after <span className="font-bold text-amber-800 ml-1">{attendanceSettings?.lateArrivalTime || '08:30 AM'}</span>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-500 font-medium">
              Closing <span className="font-bold text-slate-800 ml-1">{attendanceSettings?.closingTime || '03:30 PM'}</span>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-500 font-medium">
              Open days <span className="font-bold text-slate-800 ml-1">{shortDays(attendanceSettings?.operatingDays)}</span>
            </span>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center">
            <Users className="w-4 h-4 text-orange-600" />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-3">Attendance Rate</p>
          <p className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mt-0.5">{attendanceRate}%</p>
          <p className="text-[10px] text-slate-400 font-medium mt-1 hidden sm:block">{attendanceList.length} candidates today</p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{presentPercent}%</span>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-3">Present Today</p>
          <p className="text-2xl sm:text-3xl font-black text-emerald-600 tracking-tight mt-0.5">{presentCount}</p>
          <p className="text-[10px] text-slate-400 font-medium mt-1 hidden sm:block">On-time arrivals</p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center">
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">{latePercent}%</span>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-3">Late Arrivals</p>
          <p className="text-2xl sm:text-3xl font-black text-amber-600 tracking-tight mt-0.5">{lateCount}</p>
          <p className="text-[10px] text-slate-400 font-medium mt-1 hidden sm:block">After {attendanceSettings?.lateArrivalTime || '08:30 AM'}</p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center">
              <XCircle className="w-4 h-4 text-rose-500" />
            </div>
            <span className="text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full">{absentPercent}%</span>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-3">Absent Today</p>
          <p className="text-2xl sm:text-3xl font-black text-rose-600 tracking-tight mt-0.5">{absentCount}</p>
          <p className="text-[10px] text-slate-400 font-medium mt-1 hidden sm:block">Alerts available</p>
        </div>
      </div>

      {/* Filter Row */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5 flex-wrap gap-y-2">
          {/* Date Picker */}
          <div className="relative">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-semibold text-slate-700 outline-none focus:border-orange-500"
            />
          </div>

          {/* Programme Filter */}
          <ModernSelect
            value={selectedProgramme}
            onChange={(val) => setSelectedProgramme(val)}
            options={[
              { value: 'All', label: 'All Programmes' },
              ...programmes.map(p => ({ value: p.name, label: p.name }))
            ]}
            className="w-48"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <div className="relative flex items-center bg-slate-50/60 border border-slate-200 rounded-xl px-2.5 py-2 flex-1 sm:w-60 focus-within:bg-white focus-within:border-orange-500 transition-all">
            <Search className="w-3.5 h-3.5 text-slate-400 mr-2 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search candidate..."
              className="bg-transparent text-xs outline-none w-full text-slate-800 placeholder:text-slate-400"
            />
          </div>
        </div>
      </div>

      {/* Attendance Register Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                <th className="py-3.5 px-3 w-10 text-center font-bold">#</th>
                <th className="py-3.5 px-5 font-bold">Candidate</th>
                <th className="py-3.5 px-5 font-bold">Programme</th>
                <th className="py-3.5 px-5 font-bold">Check-in</th>
                <th className="py-3.5 px-5 font-bold">Checkout</th>
                <th className="py-3.5 px-5 font-bold">Status</th>
                <th className="py-3.5 px-5 text-center font-bold">Times Marked</th>
                <th className="py-3.5 px-5 text-right font-bold">Parent Absent Alert</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAttendance.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center">
                    <Users className="w-7 h-7 text-slate-300 mx-auto" />
                    <p className="text-sm font-bold text-slate-700 mt-2">No candidates match this filter</p>
                    <p className="text-xs text-slate-400 mt-0.5">Try another programme or clear the search.</p>
                  </td>
                </tr>
              ) : filteredAttendance.map((rec, index) => (
                <tr key={rec.studentId} className="hover:bg-slate-50/70 transition-colors">
                  {/* Numbered column */}
                  <td className="py-3.5 px-3 text-center text-[11px] font-semibold text-slate-300">
                    {index + 1}
                  </td>

                  {/* Student Name */}
                  <td className="py-3.5 px-5">
                    <p className="text-[13px] font-semibold text-slate-900">{rec.studentName}</p>
                  </td>

                  {/* Programme */}
                  <td className="py-3.5 px-5">
                    <p className="text-xs text-slate-500 font-medium">{rec.programmeName}</p>
                  </td>

                  {/* Check-in time */}
                  <td className="py-3.5 px-5">
                    {rec.checkInTime ? (
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[11px]">
                        {rec.checkInTime}
                      </span>
                    ) : (
                      <span className="text-slate-300 text-xs">Pending</span>
                    )}
                  </td>

                  {/* Checkout time column */}
                  <td className="py-3.5 px-5">
                    {rec.checkOutTime ? (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold text-[11px]">
                        {rec.checkOutTime}
                      </span>
                    ) : (
                      <span className="text-slate-300 text-xs">&mdash;</span>
                    )}
                  </td>

                  {/* Status Display */}
                  <td className="py-3.5 px-5">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                        rec.status === 'Present'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : rec.status === 'Late'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : rec.status === 'No clock out'
                          ? 'bg-slate-50 text-slate-700 border-slate-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        rec.status === 'Present'
                          ? 'bg-emerald-500'
                          : rec.status === 'Late'
                          ? 'bg-amber-500'
                          : rec.status === 'No clock out'
                          ? 'bg-slate-400'
                          : 'bg-rose-500'
                      }`} />
                      {rec.status}
                    </span>
                  </td>

                  {/* Total Attendance Count */}
                  <td className="py-3.5 px-5 text-center text-xs font-semibold text-slate-700">
                    {rec.totalAttendanceCount}
                  </td>

                  {/* Parent Alert Action */}
                  <td className="py-3.5 px-5 text-right">
                    {rec.status === 'Absent' ? (
                      <button
                        onClick={() => handleSendAbsentAlert(rec)}
                        disabled={rec.parentNotified}
                        className={`inline-flex items-center space-x-1.5 px-3 py-1.5 text-[11px] font-bold rounded-full transition-all ${
                          rec.parentNotified
                            ? 'bg-slate-100 text-slate-500 cursor-default'
                            : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 active:scale-[0.97]'
                        }`}
                      >
                        <Send className="w-3 h-3" />
                        <span>{rec.parentNotified ? 'SMS Dispatched' : 'Alert Parent'}</span>
                      </button>
                    ) : (
                      <span className="text-slate-300 text-[11px] font-medium">Normal</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Attendance Timing Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center">
                  <Clock className="w-4.5 h-4.5 text-orange-600" />
                </div>
                <h3 className="font-black text-base text-slate-900 tracking-tight">Attendance Settings</h3>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTimingSettings} className="mt-4 space-y-4 text-xs">
              <p className="text-slate-500 font-medium">
                Set your check-in and check-out times and pick the days your facility opens. Students are asked to check in only on the open days you select.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Resumption Time *
                  </label>
                  <input
                    type="time"
                    required
                    value={to24h(timingForm.resumptionTime)}
                    onChange={(e) =>
                      setTimingForm({ ...timingForm, resumptionTime: to12h(e.target.value) })
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 font-semibold focus:bg-white focus:border-orange-500 outline-none"
                  />
                  <span className="text-[10px] text-slate-400 font-medium">Official opening gates</span>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Late Arrival Time *
                  </label>
                  <input
                    type="time"
                    required
                    value={to24h(timingForm.lateArrivalTime)}
                    onChange={(e) =>
                      setTimingForm({ ...timingForm, lateArrivalTime: to12h(e.target.value) })
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-amber-700 font-semibold focus:bg-white focus:border-orange-500 outline-none"
                  />
                  <span className="text-[10px] text-slate-400 font-medium">Flagged as late arrival</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Closing Time *
                  </label>
                  <input
                    type="time"
                    required
                    value={to24h(timingForm.closingTime)}
                    onChange={(e) =>
                      setTimingForm({ ...timingForm, closingTime: to12h(e.target.value) })
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 font-semibold focus:bg-white focus:border-orange-500 outline-none"
                  />
                  <span className="text-[10px] text-slate-400 font-medium">End of regular classes</span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1.5">Open Days *</label>
                <p className="text-[10px] text-slate-400 font-medium mb-2">Tap the days your facility opens. Students are only asked to check in on these days.</p>
                <div className="grid grid-cols-4 gap-2">
                  {ALL_DAYS.map((d) => {
                    const on = timingForm.operatingDays.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() =>
                          setTimingForm((f) => ({
                            ...f,
                            operatingDays: on ? f.operatingDays.filter((x) => x !== d) : [...f.operatingDays, d],
                          }))
                        }
                        className={`py-2 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all ${on ? 'bg-orange-600 text-white border-orange-600' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'}`}
                      >
                        {d.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="px-4 py-2.5 font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-xl shadow-sm active:scale-[0.98] transition-all"
                >
                  Save Timing Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
