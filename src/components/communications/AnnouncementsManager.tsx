import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ModernSelect } from '../ui/ModernSelect';
import {
  Bell,
  Send,
  MessageSquare,
  Smartphone,
  Mail,
  Users,
  AlertTriangle,
  Clock,
  Plus,
  CheckCircle,
  X,
  Filter,
  Calendar,
  Image as ImageIcon,
  ChevronRight,
} from 'lucide-react';

interface AnnouncementItem {
  id: string;
  title: string;
  body: string;
  audience: string;
  channels: ('Student Channel' | 'WhatsApp' | 'In-App' | 'Email')[];
  dateSent: string;
  isEmergency?: boolean;
  status: 'Delivered' | 'Scheduled';
  imageUrl?: string;
  targetGroups: ('Student' | 'Parents')[];
}

export const AnnouncementsManager: React.FC = () => {
  const { programmes, addToast } = useApp();

  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([
    {
      id: 'ann-1',
      title: 'Mandatory Full-Length JAMB Mock Exam (Mock 3)',
      body: 'All registered 2026 UTME candidates are required to attend CBT Mock 3 this Saturday by 08:30 AM prompt. Come with your ID cards.',
      audience: 'JAMB / UTME',
      channels: ['In-App', 'Student Channel', 'WhatsApp'],
      dateSent: 'Today, 10:15 AM',
      isEmergency: false,
      status: 'Delivered',
      targetGroups: ['Student'],
    },
    {
      id: 'ann-2',
      title: 'Important: 2nd Tranche Tuition Fee Reminder',
      body: 'Dear parents, please be reminded that the final installment of the 2026 Academic Session tuition is due on Friday. Receipts are issued automatically upon bank transfer or online payment.',
      audience: 'WAEC / WASSCE',
      channels: ['Student Channel', 'WhatsApp'],
      dateSent: 'Yesterday, 02:00 PM',
      isEmergency: false,
      status: 'Delivered',
      targetGroups: ['Parents'],
    },
  ]);

  const [showComposeModal, setShowComposeModal] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    body: '',
    audience: 'All Programs',
    channels: ['In-App', 'Student Channel'] as ('Student Channel' | 'WhatsApp' | 'In-App' | 'Email')[],
    sendMode: 'now' as 'now' | 'schedule',
    scheduleTime: '',
    imageUrl: '',
  });

  const handleToggleChannel = (ch: 'Student Channel' | 'WhatsApp' | 'In-App' | 'Email') => {
    if (formData.channels.includes(ch)) {
      if (formData.channels.length === 1) return;
      setFormData({
        ...formData,
        channels: formData.channels.filter((c) => c !== ch),
      });
    } else {
      setFormData({
        ...formData,
        channels: [...formData.channels, ch],
      });
    }
  };

  const handleSend = (target: 'Student' | 'Parents') => {
    if (!formData.title.trim() || !formData.body.trim()) {
      addToast({ type: 'error', title: 'Missing Info', description: 'Please fill in the title and body.' });
      return;
    }

    if (formData.sendMode === 'schedule' && !formData.scheduleTime) {
      addToast({ type: 'error', title: 'Missing Time', description: 'Please select a schedule time.' });
      return;
    }

    const newAnn: AnnouncementItem = {
      id: `ann-${Date.now()}`,
      title: formData.title,
      body: formData.body,
      audience: formData.audience,
      channels: formData.channels,
      dateSent: formData.sendMode === 'now' ? 'Just now' : new Date(formData.scheduleTime).toLocaleString(),
      status: formData.sendMode === 'now' ? 'Delivered' : 'Scheduled',
      imageUrl: formData.imageUrl,
      targetGroups: [target],
    };

    setAnnouncements([newAnn, ...announcements]);
    setShowComposeModal(false);
    setFormData({
      title: '',
      body: '',
      audience: 'All Programs',
      channels: ['In-App', 'Student Channel'],
      sendMode: 'now',
      scheduleTime: '',
      imageUrl: '',
    });

    addToast({
      type: 'success',
      title: 'Broadcast Dispatched!',
      description: `Announcement pushed to ${target}s for ${formData.audience} via ${formData.channels.join(', ')}.`,
    });
  };

  return (
    <div id="announcements-manager-page" className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight text-[22px] sm:text-[26px]">
            Announcements
          </h2>
          <p className="text-[11px] text-slate-500 mt-1 uppercase font-black tracking-widest">
            Omnichannel notification broadcast via Student Channel, WhatsApp, In-App, and Email.
          </p>
        </div>

        <button
          onClick={() => setShowComposeModal(true)}
          className="px-6 py-3 text-[11px] font-black uppercase tracking-[0.15em] text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-xl shadow-lg shadow-orange-500/20 transition-all flex items-center space-x-2 self-start sm:self-auto active:scale-95"
        >
          <Send className="w-4 h-4" />
          <span>Broadcast Announcement</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-sm">
          <div className="flex items-center space-x-2 text-slate-600">
            <Bell className="w-3.5 h-3.5 text-[#EA580C]" />
            <span className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Broadcasts</span>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mt-1.5">
            {announcements.length}
          </p>
          <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">Current Session</p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-sm">
          <div className="flex items-center space-x-2 text-purple-600">
            <Users className="w-3.5 h-3.5 text-purple-600" />
            <span className="text-[9px] sm:text-[10px] font-black text-purple-600 uppercase tracking-[0.2em]">Reached</span>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-purple-600 tracking-tight mt-1.5">
            1,240+
          </p>
          <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">Total Audience</p>
        </div>
      </div>

      {/* Broadcast History List */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2">
           <div className="h-5 w-1.5 bg-[#EA580C] rounded-full" />
           <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Broadcast History</h3>
        </div>

        <div className="space-y-4">
          {announcements.map((ann) => (
            <div
              key={ann.id}
              className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-sm hover:border-slate-300 transition-all space-y-3.5 group relative overflow-hidden"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center flex-wrap gap-2.5">
                  <span className="px-3 py-1 rounded-lg text-[9px] font-black bg-slate-50 text-slate-600 border border-slate-200 uppercase tracking-widest">
                    {ann.audience}
                  </span>
                  <h4 className="font-black text-slate-900 text-base group-hover:text-[#EA580C] transition-colors">{ann.title}</h4>
                </div>

                <div className="flex items-center space-x-3 text-[10px] text-slate-400 font-bold self-start sm:self-auto uppercase tracking-tighter">
                  <span>{ann.dateSent}</span>
                  <span className="h-1 w-1 rounded-full bg-slate-300" />
                  <span className={`${ann.status === 'Delivered' ? 'text-emerald-600' : 'text-orange-600'} font-black flex items-center space-x-1.5`}>
                    {ann.status === 'Delivered' ? <CheckCircle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                    <span>{ann.status}</span>
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-5">
                {ann.imageUrl && (
                  <div className="w-full sm:w-40 h-28 rounded-2xl bg-slate-100 overflow-hidden shrink-0 border border-slate-200 shadow-inner">
                    <img src={ann.imageUrl} alt={ann.title} className="w-full h-full object-cover" />
                  </div>
                )}
                <p className="text-[13px] text-slate-600 leading-relaxed font-medium flex-1">{ann.body}</p>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-4 border-t border-slate-100 gap-3">
                <div className="flex items-center space-x-3">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Channels:</span>
                  <div className="flex items-center space-x-2">
                    {ann.channels.map((ch) => (
                      <span
                        key={ch}
                        className="px-2.5 py-1 rounded-lg text-[9px] font-black bg-slate-50 text-slate-600 border border-slate-100 uppercase"
                      >
                        {ch}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {ann.targetGroups.map(g => (
                    <span key={g} className="px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-orange-50 text-[#EA580C] border border-orange-100 shadow-sm">
                      To {g}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal: Compose Broadcast */}
      {showComposeModal && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4 backdrop-blur-md overflow-y-auto">
          <div className="bg-white rounded-[32px] max-w-lg w-full p-8 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 my-auto">
            <div className="flex items-center justify-between pb-5 border-b border-slate-100">
              <div className="flex items-center space-x-3">
                 <div className="w-10 h-10 rounded-2xl bg-orange-50 flex items-center justify-center">
                    <Send className="w-5 h-5 text-[#EA580C]" />
                 </div>
                 <h3 className="font-black text-slate-900 uppercase tracking-widest text-[14px]">New Broadcast</h3>
              </div>
              <button onClick={() => setShowComposeModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-6 space-y-6">
              <div>
                <label className="block font-black text-slate-700 mb-2 uppercase tracking-widest text-[10px]">Headline / Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Schedule for 2026 UTME Mock Series"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-slate-900 font-bold focus:bg-white focus:border-[#EA580C] outline-none transition-all placeholder:text-slate-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <ModernSelect
                    label="Target Audience"
                    value={formData.audience}
                    onChange={(val) => setFormData({ ...formData, audience: val })}
                    options={[
                      { value: 'All Programs', label: 'All Programs' },
                      ...programmes.map(p => ({ value: p.name, label: p.name }))
                    ]}
                  />
                </div>

                <div>
                  <label className="block font-black text-slate-700 mb-2 uppercase tracking-widest text-[10px]">Delivery Time</label>
                  <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-2">
                    <button
                      onClick={() => setFormData({ ...formData, sendMode: 'now' })}
                      className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                        formData.sendMode === 'now' ? 'bg-white text-[#EA580C] shadow-sm scale-[1.02]' : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      Now
                    </button>
                    <button
                      onClick={() => setFormData({ ...formData, sendMode: 'schedule' })}
                      className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                        formData.sendMode === 'schedule' ? 'bg-white text-[#EA580C] shadow-sm scale-[1.02]' : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      Schedule
                    </button>
                  </div>
                  {formData.sendMode === 'schedule' && (
                    <div className="animate-in slide-in-from-top-2">
                      <p className="block sm:hidden font-black text-slate-400 mb-1 uppercase tracking-widest text-[9px]">Select Schedule Date & Time</p>
                      <input 
                        type="datetime-local"
                        value={formData.scheduleTime}
                        onChange={(e) => setFormData({...formData, scheduleTime: e.target.value})}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 font-bold outline-none focus:bg-white focus:border-[#EA580C] transition-all text-[11px]"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block font-black text-slate-700 uppercase tracking-widest text-[10px]">Message Body *</label>
                  <div className="relative">
                    <input 
                      type="file" 
                      id="announcement-image-upload" 
                      className="hidden" 
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setFormData({ ...formData, imageUrl: reader.result as string });
                            addToast({ type: 'success', title: 'Image Uploaded', description: 'Your image has been attached to the broadcast.' });
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                    <button 
                      type="button"
                      onClick={() => document.getElementById('announcement-image-upload')?.click()}
                      className="flex items-center space-x-1.5 text-[10px] font-black text-blue-600 hover:text-blue-700 uppercase tracking-[0.15em] transition-colors"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>{formData.imageUrl ? 'Change Image' : 'Upload Image (Optional)'}</span>
                    </button>
                  </div>
                </div>
                <textarea
                  rows={4}
                  required
                  placeholder="Type announcement message here..."
                  value={formData.body}
                  onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-slate-700 font-medium focus:bg-white focus:border-[#EA580C] outline-none transition-all placeholder:text-slate-300"
                />
                {formData.imageUrl && (
                  <div className="mt-3 space-y-3 animate-in slide-in-from-top-2">
                    <div className="relative w-full aspect-video rounded-2xl bg-slate-100 overflow-hidden border border-slate-200 shadow-inner group/preview">
                       <img src={formData.imageUrl} alt="Broadcast preview" className="w-full h-full object-cover" />
                       <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/preview:opacity-100 transition-opacity flex items-center justify-center">
                          <button onClick={() => setFormData({ ...formData, imageUrl: '' })} className="bg-rose-500 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl">Remove Image</button>
                       </div>
                    </div>
                    <div className="flex items-center justify-between bg-emerald-50 px-4 py-2.5 rounded-2xl border border-emerald-100">
                      <div className="flex items-center space-x-2.5 text-[10px] text-emerald-700 font-black uppercase tracking-widest">
                         <ImageIcon className="w-4 h-4" />
                         <span>Image Ready for Broadcast</span>
                      </div>
                      <button onClick={() => setFormData({ ...formData, imageUrl: '' })} className="text-rose-500 hover:text-rose-600 underline font-black text-[10px] uppercase tracking-widest">Remove</button>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block font-black text-slate-700 mb-2.5 uppercase tracking-widest text-[10px]">
                  Delivery Channels
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {(['In-App', 'Student Channel', 'WhatsApp', 'Email'] as const).map((ch) => {
                    const active = formData.channels.includes(ch);
                    return (
                      <button
                        type="button"
                        key={ch}
                        onClick={() => handleToggleChannel(ch)}
                        className={`p-3 rounded-2xl border text-center font-black text-[9px] uppercase tracking-[0.2em] transition-all ${
                          active
                            ? 'bg-orange-50 border-orange-200 text-[#EA580C] shadow-sm'
                            : 'bg-slate-50 border-slate-100 text-slate-400 hover:bg-slate-100'
                        }`}
                      >
                        {ch}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-4 pt-6 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleSend('Student')}
                  className="flex-1 py-4 font-black text-white bg-slate-900 hover:bg-slate-800 rounded-[20px] shadow-xl shadow-slate-200 flex items-center justify-center space-x-2.5 uppercase tracking-[0.2em] text-[10px] transition-all group active:scale-95"
                >
                  <Send className="w-4 h-4 text-orange-400 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                  <span>Push to Student</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSend('Parents')}
                  className="flex-1 py-4 font-black text-[#EA580C] bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-[20px] shadow-sm flex items-center justify-center space-x-2.5 uppercase tracking-[0.2em] text-[10px] transition-all active:scale-95"
                >
                  <Users className="w-4 h-4" />
                  <span>Push to Parents</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
