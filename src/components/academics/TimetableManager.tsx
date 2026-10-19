import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Calendar,
  Clock,
  MapPin,
  Plus,
  Filter,
  CheckCircle,
  X,
  GraduationCap,
  Edit2,
  CalendarClock,
  Ban,
  RotateCcw,
  ChevronDown,
  LayoutGrid,
  Bell,
  Trash2,
} from 'lucide-react';
import { ClassroomSettingsModal } from './ClassroomSettingsModal';
import { CalendarView } from '../common/CalendarView';
import { ConfirmationModal } from '../common/ConfirmationModal';
import { ModernSelect } from '../ui/ModernSelect';
import { TimetableSlot } from '../../types';
import { useScrollLock } from '../../hooks/useScrollLock';

export const TimetableManager: React.FC = () => {
  const { 
    programmes, 
    tutors, 
    settings, 
    classrooms, 
    subjects,
    timetable,
    addTimetableSlot,
    addMultipleTimetableSlots,
    updateTimetableSlot,
    deleteTimetableSlot,
    addToast 
  } = useApp();

  const [selectedProgramme, setSelectedProgramme] = useState<string>('All');
  const [selectedDay, setSelectedDay] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [currentDate, setCurrentDate] = useState(new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));

  const [showCalendar, setShowCalendar] = useState(false);

  // Generate weeks dynamically (Date ranges only)
  const generateWeeks = () => {
    const weeksList: string[] = [];
    const now = new Date();
    // Start from 4 weeks ago
    let current = new Date(now);
    current.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1) - 28);
    
    const endDate = new Date(now);
    endDate.setDate(now.getDate() + 90); // 3 months ahead

    while (current <= endDate) {
      const weekStart = new Date(current);
      const weekEnd = new Date(current);
      weekEnd.setDate(weekStart.getDate() + 6);
      
      const startStr = weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      const endStr = weekEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: weekEnd.getFullYear() !== weekStart.getFullYear() ? 'numeric' : undefined });
      
      const range = `${startStr} - ${endStr}`;
      weeksList.push(range);
      
      current.setDate(current.getDate() + 7);
    }
    return weeksList;
  };

  const weeks = generateWeeks();

  useEffect(() => {
    if (!selectedWeek && weeks.length > 0) {
      // Find current week range
      const now = new Date();
      const ws = new Date(now);
      ws.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
      const we = new Date(ws);
      we.setDate(ws.getDate() + 6);
      const currentRange = `${ws.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - ${we.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
      
      // Select the week that contains today
      const todayRange = weeks.find(w => {
        const [start] = w.split(' - ');
        return currentRange.startsWith(start);
      });
      
      setSelectedWeek(todayRange || weeks[4] || weeks[0]);
    }
  }, [weeks, selectedWeek]);

  const daysList: TimetableSlot['day'][] = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ];

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showClassroomModal, setShowClassroomModal] = useState(false);
  const [editingSession, setEditingSession] = useState<TimetableSlot | null>(null);
  const [postponingSession, setPostponingSession] = useState<TimetableSlot | null>(null);
  const [viewingSession, setViewingSession] = useState<TimetableSlot | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  useScrollLock(showAddModal || !!postponingSession || !!viewingSession || !!showDeleteConfirm || showCalendar);

  const formatTimeAMPM = (time: string) => {
    if (!time) return '';
    const [hours, minutes] = time.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${hours12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  const formatTimeRangeAMPM = (range: string) => {
    if (!range || !range.includes(' - ')) return range;
    const [start, end] = range.split(' - ');
    return `${formatTimeAMPM(start)} - ${formatTimeAMPM(end)}`;
  };

  const parseTo24H = (timeStr: string) => {
    if (!timeStr) return "00:00";
    const cleaned = timeStr.trim().toUpperCase();
    if (!cleaned.includes('AM') && !cleaned.includes('PM')) return cleaned;
    
    const [time, modifier] = cleaned.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  const getLocalDateTime = (dateStr: string, time24: string) => {
    if (!dateStr || !time24) return new Date();
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hours, minutes] = time24.split(':').map(Number);
    return new Date(year, month - 1, day, hours, minutes);
  };

  const isFinished = (timeStr: string, date: string) => {
    if (!timeStr || !date) return false;
    const parts = timeStr.split(' - ');
    const endTime = parseTo24H(parts[1]);
    const endDateTime = getLocalDateTime(date, endTime);
    const now = new Date();
    return now.getTime() > endDateTime.getTime();
  };

  const isInSession = (timeStr: string, date: string) => {
    if (!timeStr || !date) return false;
    const parts = timeStr.split(' - ');
    const startTime = parseTo24H(parts[0]);
    const endTime = parseTo24H(parts[1]);
    const now = new Date();
    const startDateTime = getLocalDateTime(date, startTime);
    const endDateTime = getLocalDateTime(date, endTime);
    return now.getTime() >= startDateTime.getTime() && now.getTime() <= endDateTime.getTime();
  };

  const isNextUp = (timeStr: string, date: string) => {
    if (!timeStr || !date) return false;
    const parts = timeStr.split(' - ');
    const startTime = parseTo24H(parts[0]);
    const startDateTime = getLocalDateTime(date, startTime);
    const now = new Date();
    return now.getTime() < startDateTime.getTime();
  };

  const [postponeNote, setPostponeNote] = useState('');

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    startTime: '09:00',
    endTime: '11:00',
    subject: subjects[0]?.name || '',
    topic: '',
    programmeId: programmes[0]?.id || '',
    tutorName: tutors[0]?.name || '',
    room: '',
    repeatForMonth: false
  });

  const filteredSessions = timetable.filter((s) => {
    const matchesProg = selectedProgramme === 'All' || s.programmeId === selectedProgramme;
    const matchesDay = selectedDay === 'All' || s.day === selectedDay;
    const matchesStatus = selectedStatus === 'All' || s.status === selectedStatus;
    
    // Week filter: parse selectedWeek range
    if (!selectedWeek || !selectedWeek.includes(' - ')) return matchesProg && matchesDay && matchesStatus;
    
    const [startStr, endStr] = selectedWeek.split(' - ');
    const now = new Date();
    const currentYear = now.getFullYear();
    
    const parseRangeDate = (datePart: string) => {
      const [d, m] = datePart.trim().split(' ');
      const monthIndex = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(m);
      return new Date(currentYear, monthIndex, parseInt(d));
    };

    const startDate = parseRangeDate(startStr);
    const endDate = parseRangeDate(endStr);
    endDate.setHours(23, 59, 59, 999);
    
    const slotDate = new Date(s.date);
    const matchesWeek = slotDate >= startDate && slotDate <= endDate;
    
    return matchesProg && matchesDay && matchesStatus && matchesWeek;
  });

  const handleOpenAdd = () => {
    setEditingSession(null);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      startTime: '09:00',
      endTime: '11:00',
      subject: subjects[0]?.name || '',
      topic: '',
      programmeId: programmes[0]?.id || '',
      tutorName: tutors[0]?.name || '',
      room: '',
      repeatForMonth: false
    });
    setShowAddModal(true);
  };

  const handleOpenEdit = (sess: TimetableSlot) => {
    setEditingSession(sess);
    setFormData({
      date: sess.date,
      startTime: sess.startTime || sess.time.split(' - ')[0],
      endTime: sess.endTime || sess.time.split(' - ')[1],
      subject: sess.subject,
      topic: sess.topic || '',
      programmeId: sess.programmeId,
      tutorName: sess.tutorName,
      room: sess.room || '',
      repeatForMonth: false
    });
    setShowAddModal(true);
  };

  const [isSaving, setIsSaving] = useState(false);

  const handleSaveSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      // Validation for past date/time
      const startTime24 = parseTo24H(formData.startTime);
      const selectedDateTime = getLocalDateTime(formData.date, startTime24);
      const now = new Date();
      
      // Buffer of 1 minute to account for slight delays
      const oneMinuteBuffer = 60 * 1000;
      
      if (selectedDateTime.getTime() < (now.getTime() - oneMinuteBuffer)) {
        const formattedNow = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        const formattedDate = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        addToast({
          type: 'error',
          title: 'Scheduling Error',
          description: `Cannot schedule in the past. Current time is ${formattedNow} on ${formattedDate}. Please select a future time.`
        });
        setIsSaving(false);
        return;
      }

      const prog = programmes.find((p) => p.id === formData.programmeId);
      const tutor = tutors.find((t) => t.name === formData.tutorName);

      const slotBase: any = {
        date: formData.date,
        day: new Date(formData.date).toLocaleDateString('en-US', { weekday: 'long' }) as any,
        startTime: formData.startTime,
        endTime: formData.endTime,
        time: `${formData.startTime} - ${formData.endTime}`,
        subject: formData.subject,
        topic: formData.topic || undefined,
        programmeId: formData.programmeId,
        programmeName: prog ? prog.name : 'Unknown',
        tutorName: formData.tutorName,
        tutorId: tutor?.id,
        room: formData.room || undefined,
      };

      if (editingSession) {
        await updateTimetableSlot(editingSession.id, slotBase);
      } else {
        const finalSlot = { ...slotBase, status: 'pending_tutor_consent' };
        if (formData.repeatForMonth) {
          const selectedDate = new Date(formData.date);
          const year = selectedDate.getFullYear();
          const month = selectedDate.getMonth();
          const dayOfWeek = selectedDate.getDay();
          
          const slots: Omit<TimetableSlot, 'id'>[] = [];
          
          const d = new Date(year, month, 1);
          while (d.getMonth() === month) {
            if (d.getDay() === dayOfWeek) {
              const dateStr = d.toISOString().split('T')[0];
              slots.push({
                ...finalSlot,
                date: dateStr,
                day: finalSlot.day
              });
            }
            d.setDate(d.getDate() + 1);
          }
          await addMultipleTimetableSlots(slots);
        } else {
          await addTimetableSlot(finalSlot);
        }
      }
      setShowAddModal(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReinstate = async (sess: TimetableSlot) => {
    setIsSaving(true);
    try {
      await updateTimetableSlot(sess.id, { status: 'active', postponedNote: undefined, cancellationReason: undefined });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePostponeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postponingSession) return;
    setIsSaving(true);
    try {
      await updateTimetableSlot(postponingSession.id, { status: 'postponed', postponedNote: postponeNote });
      setPostponingSession(null);
      setPostponeNote('');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div id="timetable-management-page" className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight uppercase">
            Timetable
          </h2>
          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-1">
            Today: {currentDate}
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="text-right hidden md:block">
            <span className="px-3 py-1.5 rounded-lg bg-orange-50 text-[11px] font-black text-[#EA580C] uppercase tracking-wider">{settings.academicSession}</span>
          </div>
        </div>
      </div>

      {/* Week Selection & Calendar View Buttons */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <ModernSelect
          value={selectedWeek}
          onChange={setSelectedWeek}
          options={weeks.map(w => ({ value: w, label: w }))}
        />

        <button
          onClick={() => setShowCalendar(true)}
          className="px-3 sm:px-5 py-3 text-[9px] sm:text-[10px] font-black text-white bg-slate-900 hover:bg-black rounded-xl shadow-lg shadow-slate-200 transition-all uppercase tracking-widest flex items-center justify-center space-x-2"
        >
          <LayoutGrid className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-orange-500" />
          <span>Calendar</span>
        </button>
      </div>

      {/* Filters Section (Programme & Status Toggle Side-by-Side) */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <div className="bg-slate-50 p-1.5 rounded-2xl border border-slate-200 flex items-center">
          <ModernSelect
            value={selectedProgramme}
            onChange={setSelectedProgramme}
            options={[
              { value: 'All', label: 'All Exams' },
              ...programmes.map(p => ({ value: p.id, label: p.name }))
            ]}
            className="w-full"
          />
        </div>

        <div className="bg-white p-1.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-center overflow-hidden">
          <div className="flex flex-nowrap overflow-x-auto gap-1 scrollbar-none">
            {[
              { id: 'All', label: 'All' },
              { id: 'active', label: 'Approved' },
              { id: 'pending_tutor_consent', label: 'Pending' },
              { id: 'postponed', label: 'Postpone' },
            ].map((status) => (
              <button
                key={status.id}
                onClick={() => setSelectedStatus(status.id)}
                className={`px-2 py-2 text-[8px] font-black uppercase tracking-tighter rounded-lg border-2 transition-all whitespace-nowrap ${
                  selectedStatus === status.id
                    ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                    : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'
                }`}
              >
                {status.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        onClick={handleOpenAdd}
        className="w-full py-2.5 text-sm font-black text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-2xl shadow-lg shadow-orange-200/50 transition-all flex items-center justify-center space-x-2"
      >
        <Plus className="w-5 h-5" />
        <span>SCHEDULE CLASS</span>
      </button>

      {/* Day Selection Tabs */}
      <div className="space-y-4">
        <div className="flex items-center space-x-1 overflow-x-auto pb-2 scrollbar-none">
          <button
            onClick={() => setSelectedDay('All')}
            className={`px-4 py-2 text-[10px] font-black rounded-lg transition-all uppercase tracking-widest whitespace-nowrap border-2 ${
              selectedDay === 'All' ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'
            }`}
          >
            Entire Week
          </button>
          {daysList.map((day) => {
            const daySessionsCount = filteredSessions.filter((s) => s.day === day).length;
            return (
              <div key={day} className="flex flex-col items-center">
                <button
                  onClick={() => setSelectedDay(day)}
                  className={`px-4 py-2 text-[10px] font-black rounded-lg transition-all uppercase tracking-widest whitespace-nowrap border-2 ${
                    selectedDay === day ? 'bg-orange-500 border-orange-500 text-white shadow-md shadow-orange-100' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'
                  }`}
                >
                  {day}
                </button>
                {daySessionsCount > 0 && (
                  <span className="text-[10px] font-black text-slate-500 uppercase mt-1">
                    {daySessionsCount} {daySessionsCount === 1 ? 'Period' : 'Periods'}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Schedule Content */}
      <div className="space-y-4">
        {daysList
          .filter((day) => selectedDay === 'All' || selectedDay === day)
          .map((day) => {
            const daySessions = filteredSessions.filter((s) => s.day === day);
            if (daySessions.length === 0) return null;

            return (
              <div key={day} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="px-5 py-3 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="font-black text-xs text-slate-900 uppercase tracking-widest">{day} Class</h3>
                </div>

                <div className="space-y-4 p-5 bg-slate-50/30">
                    {daySessions.map((sess, idx) => {
                      const finished = isFinished(sess.time, sess.date);
                      const inSession = isInSession(sess.time, sess.date);
                      const isUpcoming = isNextUp(sess.time, sess.date);
                      
                      const statusColor = finished ? 'bg-slate-400' :
                                        inSession ? 'bg-emerald-600' :
                                        sess.status === 'active' ? 'bg-emerald-600' :
                                        sess.status === 'pending_tutor_consent' ? 'bg-amber-500' :
                                        sess.status === 'postponed' ? 'bg-orange-600' : 'bg-slate-400';

                      return (
                      <React.Fragment key={sess.id}>
                        {idx > 0 && (
                          <div className="relative py-6">
                            <div className="absolute inset-0 flex items-center" aria-hidden="true">
                              <div className="w-full border-t-8 border-slate-100" />
                            </div>
                            <div className="relative flex justify-center">
                              <span className="bg-slate-900 px-6 text-[9px] font-black text-white uppercase tracking-[0.2em] rounded-full py-1 shadow-sm">Next Period</span>
                            </div>
                          </div>
                        )}
                        <div 
                          onClick={() => setViewingSession(sess)}
                          className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer group"
                        >
                          {/* Top Tip Header (Status Colored) */}
                          <div className={`px-4 py-2.5 flex items-center justify-between ${statusColor}`}>
                            <div className="flex items-center space-x-2">
                              {!finished && (inSession || isUpcoming) && (
                                <span className="px-2 py-0.5 rounded bg-white/20 border border-white/30 text-[8px] font-black uppercase text-white tracking-widest">
                                  {sess.status === 'active' ? 'Approval' : 
                                   sess.status === 'pending_tutor_consent' ? 'Pending' : 
                                   sess.status === 'postponed' ? 'Postpone' : 'Status'}
                                </span>
                              )}
                              <h4 className="text-[10px] font-black text-white uppercase tracking-widest">{day} Class</h4>
                            </div>
                            
                            <div className="flex items-center space-x-2">
                              {inSession && (
                                <div className="flex items-center space-x-1 bg-white/20 px-2 py-0.5 rounded text-[8px] font-black text-white uppercase animate-pulse">
                                  <span className="w-1 h-1 rounded-full bg-white" />
                                  <span>Live</span>
                                </div>
                              )}
                              <span className="text-[9px] font-black text-white/90 uppercase tracking-widest">
                                {formatTimeAMPM(sess.startTime || sess.time.split(' - ')[0])}
                              </span>
                            </div>
                          </div>

                          <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-start space-x-4">
                              <div className={`w-14 h-14 rounded-2xl border flex flex-col items-center justify-center shrink-0 ${finished ? 'bg-slate-50 border-slate-100 text-slate-400' : 'bg-orange-50 border-orange-100 text-[#EA580C]'}`}>
                                 <Clock className="w-4 h-4 mb-1" />
                                 <span className="text-[9px] font-black">
                                   {new Date(sess.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                 </span>
                              </div>
                              <div>
                                <div className="flex items-center space-x-2">
                                   <h4 className={`font-black text-sm leading-tight ${finished ? 'text-slate-400' : 'text-slate-900'}`}>{sess.subject}</h4>
                                   {finished && (
                                     <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase bg-slate-100 text-slate-400 border border-slate-200">
                                       Completed
                                     </span>
                                   )}
                                </div>
                                {sess.topic && <p className={`text-[10px] font-bold mt-1 ${finished ? 'text-slate-400' : 'text-slate-500'}`}>Topic: {sess.topic}</p>}
                                 <div className="grid grid-cols-2 sm:flex sm:items-center gap-x-4 gap-y-1 mt-2 text-[11px]">
                                   <div className={`flex items-center space-x-1.5 font-bold ${finished ? 'text-slate-400' : 'text-slate-700'}`}>
                                      <GraduationCap className="w-3.5 h-3.5 text-slate-400" />
                                      <span>{sess.tutorName}</span>
                                   </div>
                                   {sess.room && (
                                     <div className={`flex items-center space-x-1.5 font-bold ${finished ? 'text-slate-400' : 'text-slate-500'}`}>
                                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                        <span>{sess.room}</span>
                                     </div>
                                   )}
                                   <div className={`col-span-2 sm:col-span-1 flex items-center space-x-1.5 font-bold ${finished ? 'text-slate-400' : 'text-orange-600'}`}>
                                      <CheckCircle className="w-3.5 h-3.5 opacity-50" />
                                      <span>{sess.programmeName}</span>
                                   </div>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between mt-4 md:mt-0 w-full md:w-auto space-x-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setViewingSession(sess);
                                }}
                                className="flex-1 md:flex-none px-4 py-2 text-[10px] font-black text-slate-400 hover:text-slate-900 transition-colors uppercase tracking-widest"
                              >
                                View
                              </button>
                              {!finished && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenEdit(sess);
                                  }}
                                  className="flex-1 md:flex-none px-4 py-2 text-[10px] font-black text-slate-600 bg-white hover:bg-slate-900 hover:text-white border border-slate-200 hover:border-slate-900 rounded-xl transition-all uppercase tracking-widest"
                                >
                                  Modify
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </React.Fragment>
                      );
                    })}
                </div>
              </div>
            );
          })}
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 z-50 overflow-y-auto p-4 backdrop-blur-xs">
          <div className="min-h-full flex items-center justify-center py-8">
            <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 relative">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="font-black text-lg text-slate-900 uppercase tracking-tight">
                {editingSession ? 'Modify Period' : 'New Schedule'}
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-700 p-1">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSaveSession} className="mt-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-black text-slate-700 uppercase tracking-widest mb-1.5">Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.date || ''}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-bold outline-none focus:bg-white focus:border-orange-500"
                  />
                </div>
                <ModernSelect
                  label="Programme *"
                  value={formData.programmeId}
                  onChange={(val) => setFormData({ ...formData, programmeId: val })}
                  options={programmes.map(p => ({ value: p.id, label: p.name }))}
                />
              </div>

              {!editingSession && (
                <div className="flex items-center space-x-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <input
                    type="checkbox"
                    id="repeatForMonth"
                    checked={formData.repeatForMonth}
                    onChange={(e) => setFormData({ ...formData, repeatForMonth: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                  />
                  <label htmlFor="repeatForMonth" className="text-[10px] font-black text-slate-700 uppercase tracking-tight">
                    Repeat for all {new Date(formData.date).toLocaleDateString('en-US', { weekday: 'long' })}s of the month
                  </label>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <ModernSelect
                  label="Subject *"
                  value={formData.subject}
                  onChange={(val) => setFormData({ ...formData, subject: val })}
                  options={subjects.map(s => ({ value: s.name, label: s.name }))}
                  placeholder="Select Subject"
                />
                <div>
                  <label className="block font-black text-slate-700 uppercase tracking-widest mb-1.5">Topic (Optional)</label>
                  <input
                    type="text"
                    value={formData.topic || ''}
                    onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-bold outline-none focus:bg-white focus:border-orange-500"
                    placeholder="e.g. Calculus Intro"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-black text-slate-700 uppercase tracking-widest mb-1.5">Start *</label>
                  <input
                    type="time"
                    required
                    value={formData.startTime || ''}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-bold outline-none"
                  />
                </div>
                <div>
                  <label className="block font-black text-slate-700 uppercase tracking-widest mb-1.5">End *</label>
                  <input
                    type="time"
                    required
                    value={formData.endTime || ''}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-bold outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <ModernSelect
                  label="Tutor *"
                  value={formData.tutorName}
                  onChange={(val) => setFormData({ ...formData, tutorName: val })}
                  options={tutors.map(t => ({ value: t.name, label: t.name }))}
                  placeholder="Select Tutor"
                />
                <ModernSelect
                  label="Room (Optional)"
                  value={formData.room}
                  onChange={(val) => setFormData({ ...formData, room: val })}
                  options={[
                    { value: '', label: 'No Room Assigned' },
                    ...classrooms.map(c => ({ value: c.name, label: c.name }))
                  ]}
                />
              </div>

              {/* Dynamic Notification Instruction */}
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start space-x-3">
                <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shrink-0 shadow-sm">
                  <Bell className="w-4 h-4 text-amber-600 animate-bounce" />
                </div>
                <p className="text-[10px] font-bold text-amber-800 leading-relaxed">
                  {formData.topic.trim() === '' 
                    ? "The tutor is going to receive the notification, will put the topic and will consent to it to make the scheduled class active for the student."
                    : "The tutor is going to receive the notification for the class scheduled and will consent to it to make the scheduled class active."
                  }
                </p>
              </div>

              <div className="pt-6 flex flex-col space-y-3">
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="w-full py-3 bg-slate-900 text-white font-black uppercase tracking-widest rounded-xl shadow-xl hover:bg-slate-800 transition-all disabled:opacity-50 flex items-center justify-center space-x-2"
                    >
                      {isSaving ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                          <span>Processing...</span>
                        </>
                      ) : (
                        <span>{editingSession ? 'Update Class' : 'Schedule Period'}</span>
                      )}
                    </button>
                    
                    {editingSession && (
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => { setPostponingSession(editingSession); setShowAddModal(false); }}
                          className="py-3 bg-amber-50 text-amber-700 font-black uppercase tracking-widest rounded-xl border border-amber-200 text-[10px] shadow-sm hover:bg-amber-100 transition-all"
                        >
                          Postpone
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowDeleteConfirm(editingSession.id)}
                          className="py-3 bg-rose-50 text-rose-600 border border-rose-100 font-black uppercase tracking-widest rounded-xl text-[10px] hover:bg-rose-100 transition-all"
                        >
                          Delete Scheduled Class
                        </button>
                      </div>
                    )}
              </div>
            </form>
          </div>
        </div>
      </div>
    )}

      {/* Postpone Modal */}
      {postponingSession && (
        <div className="fixed inset-0 bg-black/60 z-50 overflow-y-auto p-4 backdrop-blur-xs">
          <div className="min-h-full flex items-center justify-center py-8">
            <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl animate-in fade-in zoom-in-95 relative">
              <h3 className="font-black text-lg text-slate-900 uppercase">Postpone Class</h3>
            <p className="text-xs text-slate-500 mt-1">Reason or New Date for "{postponingSession.subject}"</p>
            <form onSubmit={handlePostponeSubmit} className="mt-6 space-y-4">
              <textarea
                required
                value={postponeNote || ''}
                onChange={(e) => setPostponeNote(e.target.value)}
                placeholder="e.g. Rescheduled to Saturday 10am due to public holiday..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-bold outline-none h-32"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setPostponingSession(null)} className="flex-1 py-3 font-black uppercase text-slate-400">Back</button>
                <button type="submit" className="flex-1 py-3 bg-amber-500 text-white font-black uppercase rounded-xl">Save Note</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    )}

      <CalendarView
        isOpen={showCalendar}
        onClose={() => setShowCalendar(false)}
        slots={timetable}
        title="Centre Master Timetable"
      />

      {/* View Session Modal */}
      {viewingSession && (() => {
        const finished = isFinished(viewingSession.time, viewingSession.date);
        const inSession = isInSession(viewingSession.time, viewingSession.date);

        return (
          <div className="fixed inset-0 bg-black/60 z-50 overflow-y-auto p-4 backdrop-blur-xs">
          <div className="min-h-full flex items-center justify-center py-8">
            <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 relative">
               <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                   <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center">
                      <CalendarClock className="w-5 h-5" />
                   </div>
                   <div>
                      <h3 className="font-black text-slate-900 uppercase tracking-tight">Class Details</h3>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{viewingSession.day}, {new Date(viewingSession.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                   </div>
                </div>
                <button onClick={() => setViewingSession(null)} className="p-2 bg-slate-50 text-slate-400 hover:text-rose-500 rounded-xl">
                   <X className="w-5 h-5" />
                </button>
             </div>

             <div className="space-y-5">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                   <div>
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Subject</span>
                      <p className="text-sm font-black text-slate-900">{viewingSession.subject}</p>
                   </div>
                   {viewingSession.topic && (
                      <div>
                         <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Topic</span>
                         <p className="text-xs font-bold text-slate-700">{viewingSession.topic}</p>
                      </div>
                   )}
                   <div className="grid grid-cols-2 gap-4 pt-2">
                      <div>
                         <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Time</span>
                         <div className="flex items-center space-x-1.5 mt-0.5">
                            <Clock className="w-3.5 h-3.5 text-orange-500" />
                            <span className="text-xs font-black text-slate-800">{formatTimeRangeAMPM(viewingSession.time)}</span>
                         </div>
                      </div>
                      <div>
                         <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Room</span>
                         <div className="flex items-center space-x-1.5 mt-0.5">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-xs font-black text-slate-800">{viewingSession.room || 'No Room'}</span>
                         </div>
                      </div>
                   </div>
                </div>

                <div className="space-y-4">
                   <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tutor Assigned</span>
                      <span className="text-lg font-black text-orange-600 bg-orange-50 px-3 py-1 rounded-xl">{viewingSession.tutorName}</span>
                   </div>
                   
                   <div className="pt-4 border-t border-slate-100">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Schedule Status</span>
                       <div className={`p-3 rounded-xl border-2 flex items-center justify-between shadow-sm ${
                          inSession ? 'bg-emerald-600 border-emerald-500 text-white' :
                          finished ? 'bg-slate-400 border-slate-300 text-white' :
                          isNextUp(viewingSession.time, viewingSession.date) ? 'bg-blue-600 border-blue-500 text-white' :
                          viewingSession.status === 'pending_tutor_consent' ? 'bg-amber-500 border-amber-400 text-white' :
                          'bg-orange-600 border-orange-500 text-white'
                       }`}>
                          <div className="flex items-center space-x-2">
                             <div className={`w-2.5 h-2.5 rounded-full bg-white shadow-xs ${
                                (inSession || viewingSession.status === 'pending_tutor_consent') ? 'animate-pulse' : ''
                             }`} />
                             <span className="text-[11px] font-black uppercase">
                               {inSession ? 'In-Session' : 
                                finished ? 'Completed' : 
                                isNextUp(viewingSession.time, viewingSession.date) ? 'Next Up' :
                                viewingSession.status === 'pending_tutor_consent' ? 'Pending Consent' : 
                                'Postponed'}
                             </span>
                          </div>
                       </div>
                   </div>

                   {(viewingSession.postponedNote || viewingSession.cancellationReason) && (
                      <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl">
                         <span className="text-[9px] font-black text-rose-400 uppercase tracking-widest block mb-1">Reason / Note</span>
                         <p className="text-xs font-bold text-rose-700 leading-relaxed italic">
                            "{viewingSession.postponedNote || viewingSession.cancellationReason}"
                         </p>
                      </div>
                   )}
                </div>
             </div>

             <div className="pt-8 grid grid-cols-2 gap-3">
                {!isFinished(viewingSession.time, viewingSession.date) && (
                  <button 
                    onClick={() => setShowDeleteConfirm(viewingSession.id)}
                    className="py-3 bg-rose-600 text-white font-black text-[10px] uppercase tracking-widest rounded-2xl hover:bg-rose-700 transition-all shadow-lg shadow-rose-100"
                  >
                    Delete Schedule
                  </button>
                )}
                <button 
                  onClick={() => setViewingSession(null)}
                  className={`py-3 bg-slate-100 text-slate-600 font-black text-[10px] uppercase tracking-widest rounded-2xl hover:bg-slate-200 transition-all ${isFinished(viewingSession.time, viewingSession.date) ? 'col-span-2' : ''}`}
                >
                  Close
                </button>
             </div>
          </div>
        </div>
      </div>
      );
    })()}

      {/* Confirmation Modals */}
      <ConfirmationModal
        isOpen={!!showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(null)}
        onConfirm={async () => {
          if (showDeleteConfirm) {
            await deleteTimetableSlot(showDeleteConfirm);
            setShowDeleteConfirm(null);
            setViewingSession(null);
            setShowAddModal(false);
          }
        }}
        title="Delete Class?"
        message="This action is irreversible. The scheduled session will be permanently removed from the master timetable."
        confirmText="Delete Now"
        type="danger"
      />

      {/* Classroom Settings Modal */}
      <ClassroomSettingsModal
        isOpen={showClassroomModal}
        onClose={() => setShowClassroomModal(false)}
      />
    </div>
  );
};
