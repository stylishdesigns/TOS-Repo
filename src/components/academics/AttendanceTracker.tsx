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

export const AttendanceTracker: React.FC = () => {
  const { students, programmes, settings, attendanceSettings, updateAttendanceSettings, attendanceLogs, addToast } =
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
      description: `SMS notification sent to ${record.parentPhone}: "${record.studentName} was marked absent today at ${settings.centreName}."`,
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
    updateAttendanceSettings(timingForm);
    addToast({
      type: 'success',
      title: 'Attendance Timing Saved',
      description: `Resumption: ${timingForm.resumptionTime} | Late Arrival: ${timingForm.lateArrivalTime} | Closing: ${timingForm.closingTime}`,
    });
    setShowSettingsModal(false);
  };

  return (
    <div id="attendance-tracking-page" className="p-4 sm:p-6 md:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Attendance
          </h2>
        </div>
      </div>

      {/* Timing Schedule Pill Banner */}
      <div className="bg-orange-50/70 border border-orange-200/80 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center space-x-2 text-slate-700 font-medium flex-wrap gap-y-1">
          <span className="font-bold text-[#EA580C] flex items-center space-x-1">
            <Clock className="w-3.5 h-3.5" />
            <span>Active Attendance Timings:</span>
          </span>
          <span className="px-2 py-0.5 rounded bg-white border border-orange-200 font-mono text-[11px]">
            Resumption: <strong>{attendanceSettings?.resumptionTime || '08:00 AM'}</strong>
          </span>
          <span className="px-2 py-0.5 rounded bg-white border border-orange-200 font-mono text-[11px] text-amber-700">
            Late Threshold: <strong>{attendanceSettings?.lateArrivalTime || '08:30 AM'}</strong>
          </span>
          <span className="px-2 py-0.5 rounded bg-white border border-orange-200 font-mono text-[11px]">
            Closing: <strong>{attendanceSettings?.closingTime || '03:30 PM'}</strong>
          </span>
        </div>
        <button
          onClick={() => setShowSettingsModal(true)}
          className="text-[11px] text-[#EA580C] hover:underline font-bold"
        >
          Modify Timings →
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-3.5 sm:p-5 rounded-xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center space-x-2 text-slate-600">
            <Users className="w-4 h-4 text-[#EA580C] shrink-0" />
            <span className="text-[11px] sm:text-xs font-semibold text-slate-600">Attendance Rate</span>
          </div>
          <p className="text-xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1.5 sm:mt-2">
            {attendanceRate}%
          </p>
          <p className="text-[10px] text-emerald-600 font-medium mt-1 hidden sm:block">Total Candidates: {attendanceList.length}</p>
        </div>

        <div className="bg-white p-3.5 sm:p-5 rounded-xl border border-slate-200/90 shadow-xs flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2 text-emerald-600">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="text-[11px] sm:text-xs font-semibold text-emerald-600">Present Today</span>
            </div>
            <p className="text-xl sm:text-3xl font-extrabold text-emerald-600 tracking-tight mt-1.5 sm:mt-2">
              {presentCount}
            </p>
            <p className="text-[10px] text-slate-400 mt-1 hidden sm:block">On-time arrivals</p>
          </div>
          <div className="text-right">
            <span className="text-sm font-black text-emerald-700">{presentPercent}%</span>
            <p className="text-[9px] font-bold text-slate-400 uppercase">Share</p>
          </div>
        </div>

        <div className="bg-white p-3.5 sm:p-5 rounded-xl border border-slate-200/90 shadow-xs flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2 text-amber-600">
              <Clock className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="text-[11px] sm:text-xs font-semibold text-amber-600">Late Arrivals</span>
            </div>
            <p className="text-xl sm:text-3xl font-extrabold text-amber-600 tracking-tight mt-1.5 sm:mt-2">
              {lateCount}
            </p>
            <p className="text-[10px] text-slate-400 mt-1 hidden sm:block">After {attendanceSettings?.lateArrivalTime || '08:30 AM'}</p>
          </div>
          <div className="text-right">
            <span className="text-sm font-black text-amber-700">{latePercent}%</span>
            <p className="text-[9px] font-bold text-slate-400 uppercase">Share</p>
          </div>
        </div>

        <div className="bg-white p-3.5 sm:p-5 rounded-xl border border-slate-200/90 shadow-xs flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2 text-rose-600">
              <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span className="text-[11px] sm:text-xs font-semibold text-rose-600">Absent Today</span>
            </div>
            <p className="text-xl sm:text-3xl font-extrabold text-rose-600 tracking-tight mt-1.5 sm:mt-2">
              {absentCount}
            </p>
            <p className="text-[10px] text-slate-400 mt-1 hidden sm:block">Alerts available</p>
          </div>
          <div className="text-right">
            <span className="text-sm font-black text-rose-700">{absentPercent}%</span>
            <p className="text-[9px] font-bold text-slate-400 uppercase">Share</p>
          </div>
        </div>
      </div>

      {/* Filter Row */}
      <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200/90 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5 flex-wrap gap-y-2">
          {/* Date Picker */}
          <div className="relative">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 font-medium text-slate-700 outline-none focus:border-orange-500"
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
          <div className="relative flex items-center bg-slate-50/60 border border-slate-200 rounded-lg px-2.5 py-1.5 flex-1 sm:w-60 focus-within:bg-white focus-within:border-orange-500 transition-all">
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
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-3 w-10 text-center">#</th>
                <th className="py-3 px-5">Candidate</th>
                <th className="py-3 px-5">Programme</th>
                <th className="py-3 px-5">Check-in Time</th>
                <th className="py-3 px-5">Checkout Time</th>
                <th className="py-3 px-5">Attendance Status</th>
                <th className="py-3 px-5 text-center">Times Marked</th>
                <th className="py-3 px-5 text-right">Parent Absent Alert</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredAttendance.map((rec, index) => (
                <tr key={rec.studentId} className="hover:bg-slate-50/60 transition-colors">
                  {/* Numbered column */}
                  <td className="py-3.5 px-3 text-center font-mono font-bold text-slate-400 text-[11px]">
                    {index + 1}
                  </td>

                  {/* Student Name */}
                  <td className="py-3.5 px-5">
                    <div>
                      <p className="font-bold text-slate-900">{rec.studentName}</p>
                    </div>
                  </td>

                  {/* Programme */}
                  <td className="py-3.5 px-5">
                    <p className="text-slate-800 font-medium">{rec.programmeName}</p>
                  </td>

                  {/* Check-in time */}
                  <td className="py-3.5 px-5 font-mono text-slate-600">
                    {rec.checkInTime ? (
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-semibold text-[11px]">
                        {rec.checkInTime}
                      </span>
                    ) : (
                      <span className="text-slate-300">Pending</span>
                    )}
                  </td>

                  {/* Checkout time column */}
                  <td className="py-3.5 px-5 font-mono text-slate-600">
                    {rec.checkOutTime ? (
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold text-[11px]">
                        {rec.checkOutTime}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>

                  {/* Status Display */}
                  <td className="py-3.5 px-5">
                    <span
                      className={`px-3 py-1 rounded-lg text-[10px] font-bold border ${
                        rec.status === 'Present'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : rec.status === 'Late'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : rec.status === 'No clock out'
                          ? 'bg-slate-50 text-slate-700 border-slate-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}
                    >
                      {rec.status}
                    </span>
                  </td>

                  {/* Total Attendance Count */}
                  <td className="py-3.5 px-5 text-center font-mono font-bold text-slate-700">
                    {rec.totalAttendanceCount}
                  </td>

                  {/* Parent Alert Action */}
                  <td className="py-3.5 px-5 text-right">
                    {rec.status === 'Absent' ? (
                      <button
                        onClick={() => handleSendAbsentAlert(rec)}
                        disabled={rec.parentNotified}
                        className={`inline-flex items-center space-x-1 px-3 py-1 text-xs font-semibold rounded-lg shadow-2xs transition-all ${
                          rec.parentNotified
                            ? 'bg-slate-100 text-slate-500 cursor-default'
                            : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                        }`}
                      >
                        <Send className="w-3 h-3" />
                        <span>{rec.parentNotified ? 'SMS Dispatched' : 'Alert Parent SMS'}</span>
                      </button>
                    ) : (
                      <span className="text-slate-400 text-[11px]">Normal</span>
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
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Clock className="w-5 h-5 text-[#EA580C]" />
                <h3 className="font-bold text-base text-slate-900">Attendance Timing Settings</h3>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTimingSettings} className="mt-4 space-y-4 text-xs">
              <p className="text-slate-500">
                Configure Centre roll-call timings, resumption gates, late arrival threshold, and departure checkout hours.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Resumption Time *
                  </label>
                  <input
                    type="time"
                    required
                    value={to24h(timingForm.resumptionTime)}
                    onChange={(e) =>
                      setTimingForm({ ...timingForm, resumptionTime: to12h(e.target.value) })
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-semibold focus:bg-white focus:border-orange-500 outline-none"
                  />
                  <span className="text-[10px] text-slate-400">Official opening gates</span>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Late Arrival Time *
                  </label>
                  <input
                    type="time"
                    required
                    value={to24h(timingForm.lateArrivalTime)}
                    onChange={(e) =>
                      setTimingForm({ ...timingForm, lateArrivalTime: to12h(e.target.value) })
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-amber-700 font-semibold focus:bg-white focus:border-orange-500 outline-none"
                  />
                  <span className="text-[10px] text-slate-400">Flagged as Late arrival</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Closing Time *
                  </label>
                  <input
                    type="time"
                    required
                    value={to24h(timingForm.closingTime)}
                    onChange={(e) =>
                      setTimingForm({ ...timingForm, closingTime: to12h(e.target.value) })
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-semibold focus:bg-white focus:border-orange-500 outline-none"
                  />
                  <span className="text-[10px] text-slate-400">End of regular classes</span>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg shadow-sm"
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
