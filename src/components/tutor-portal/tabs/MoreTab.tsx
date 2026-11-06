import React, { useRef, useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { Tutor } from '../../../types';
import {
  LogOut,
  X,
  Building2,
  Check,
  Camera,
  Moon,
  Sun,
  Monitor,
  Loader2,
  User,
  Palette,
  Pencil,
  ChevronRight
} from 'lucide-react';

interface MoreTabProps {
  tutor: Tutor;
  onExit: () => void;
}

export const MoreTab: React.FC<MoreTabProps> = ({ tutor, onExit }) => {
  const { addToast, activeCentreId, userCentres, switchCentre, bgTheme, setBgTheme, updateTutor } = useApp();
  const [editOpen, setEditOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [draftName, setDraftName] = useState(tutor.name);
  const [draftPhone, setDraftPhone] = useState(tutor.phone || '');
  const [draftBio, setDraftBio] = useState(tutor.bio || '');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarRef = useRef<HTMLInputElement | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<'light' | 'dark'>(() => (bgTheme === 'dark' ? 'dark' : 'light'));

  const initials = tutor.name.trim().split(/\s+/).slice(0, 2).map((n) => n[0]).join('').toUpperCase();

  // A profile photo picked on the phone is compressed in the browser, then
  // saved on the tutor's record so every screen that shows them picks it up.
  const pickAvatar = (file: File | null | undefined) => {
    if (!file) return;
    if (!/^image\//.test(file.type || '')) {
      addToast({ type: 'error', title: 'Not a photo', description: 'Choose an image for the profile photo.' });
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      addToast({ type: 'error', title: 'Too large', description: 'Choose a smaller photo.' });
      return;
    }
    setUploadingAvatar(true);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxEdge = 512;
        const scale = Math.min(1, maxEdge / Math.max(img.width || 1, img.height || 1));
        const w = Math.max(1, Math.round((img.width || maxEdge) * scale));
        const h = Math.max(1, Math.round((img.height || maxEdge) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { setUploadingAvatar(false); return; }
        ctx.drawImage(img, 0, 0, w, h);
        const out = canvas.toDataURL('image/jpeg', 0.82);
        updateTutor(tutor.id, { avatar: out });
        setUploadingAvatar(false);
        addToast({ type: 'success', title: 'Photo updated', description: 'Your profile photo has been saved.' });
      };
      img.onerror = () => {
        setUploadingAvatar(false);
        addToast({ type: 'error', title: 'Could not read photo', description: 'Try another image.' });
      };
      img.src = String(reader.result || '');
    };
    reader.onerror = () => {
      setUploadingAvatar(false);
      addToast({ type: 'error', title: 'Could not read photo', description: 'Try another image.' });
    };
    reader.readAsDataURL(file);
  };

  const saveProfile = async () => {
    if (saving) return;
    if (!draftName.trim()) {
      addToast({ type: 'error', title: 'Name required', description: 'Your name cannot be empty.' });
      return;
    }
    setSaving(true);
    try {
      await updateTutor(tutor.id, {
        name: draftName.trim(),
        phone: draftPhone.trim(),
        bio: draftBio.trim()
      });
      setEditOpen(false);
      addToast({ type: 'success', title: 'Profile updated', description: 'Your details have been saved.' });
    } finally {
      setSaving(false);
    }
  };

  const applyTheme = (id: 'light' | 'dark') => {
    setSelectedTheme(id);
    setBgTheme(id);
    addToast({ type: 'success', title: 'Theme Updated', description: `Display theme set to ${id === 'dark' ? 'Dark' : 'Light'}.` });
  };

  const themeItems = [
    { id: 'light' as const, label: 'Light', icon: Sun, desc: 'Bright and clear' },
    { id: 'dark' as const, label: 'Dark', icon: Moon, desc: 'Eye-friendly dim display' }
  ];

  return (
    <div className="p-5 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-32">
      {/* 1. Header Profile */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs flex flex-col items-center text-center space-y-3">
        <div className="relative">
          <button
            onClick={() => avatarRef.current?.click()}
            className="w-20 h-20 rounded-full bg-slate-100 border-4 border-white shadow-md flex items-center justify-center text-2xl font-black text-slate-400 overflow-hidden active:scale-95 transition"
            aria-label="Change profile photo"
          >
            {tutor.avatar ? (
              <img src={tutor.avatar} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              initials
            )}
          </button>
          {uploadingAvatar ? (
            <div className="absolute inset-0 rounded-full bg-slate-900/40 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-white" />
            </div>
          ) : (
            <div className="absolute bottom-0 right-0 w-7 h-7 bg-[#EA580C] border-2 border-white rounded-full shadow-sm flex items-center justify-center">
              <Camera className="w-3.5 h-3.5 text-white" />
            </div>
          )}
          <input
            ref={avatarRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { pickAvatar(e.target.files && e.target.files[0]); e.target.value = ''; }}
          />
        </div>
        <div>
          <h2 className="text-lg font-black text-slate-900 tracking-tight">{tutor.name}</h2>
          <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">
            {(tutor as any).role || 'Tutor'}{(tutor as any).department ? ` • ${(tutor as any).department}` : ''}
          </p>
          {tutor.bio && <p className="text-xs text-slate-500 font-medium mt-1.5 max-w-xs">{tutor.bio}</p>}
        </div>
      </div>

      {/* 2. Menu Sections */}
      <div className="space-y-2">
        <button
          onClick={() => { setDraftName(tutor.name); setDraftPhone(tutor.phone || ''); setDraftBio(tutor.bio || ''); setEditOpen(true); }}
          className="w-full bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between group active:scale-[0.98] transition-all"
        >
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-orange-50 text-orange-500">
              <User className="w-5 h-5" />
            </div>
            <span className="text-xs font-black text-slate-700 tracking-tight">Profile setup</span>
          </div>
          <ChevronRightSpacer />
        </button>

        <button
          onClick={() => setThemeOpen(true)}
          className="w-full bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between group active:scale-[0.98] transition-all"
        >
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-violet-50 text-violet-500">
              <Palette className="w-5 h-5" />
            </div>
            <span className="text-xs font-black text-slate-700 tracking-tight">Appearance</span>
          </div>
          <span className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 capitalize">{selectedTheme}</span>
            <ChevronRightSpacer />
          </span>
        </button>
      </div>

      {/* 3. My Centres Switcher */}
      {userCentres.length > 0 && (
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-800 tracking-tight flex items-center gap-2">
              <Building2 className="w-4 h-4 text-orange-500" />
              <span>My Centres</span>
            </span>
            <span className="text-[10px] text-slate-400 font-bold uppercase">
              {userCentres.length} Assigned
            </span>
          </div>

          <div className="space-y-2">
            {userCentres.map((centre) => {
              const isActive = centre.centreId === activeCentreId;
              return (
                <button
                  key={centre.centreId}
                  onClick={() => !isActive && switchCentre(centre.centreId)}
                  className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition-all ${
                    isActive
                      ? 'border-orange-500/50 bg-orange-50/50 text-slate-900 cursor-default'
                      : 'border-slate-100 hover:border-slate-300 hover:bg-slate-50 text-slate-600 cursor-pointer active:scale-[0.98]'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                      isActive ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {centre.centreName.charAt(0)}
                    </div>
                    <div>
                      <p className="text-xs font-black text-slate-900">{centre.centreName}</p>
                      <p className="text-[10px] text-slate-400 capitalize">{centre.role}</p>
                    </div>
                  </div>
                  {isActive ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      Active
                    </span>
                  ) : (
                    <span className="text-[10px] text-orange-600 font-bold hover:underline">
                      Switch
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Dangerous Actions */}
      <div className="pt-2">
        <button
          onClick={onExit}
          className="w-full p-4 rounded-2xl border border-rose-100 bg-rose-50 flex items-center justify-between group active:scale-[0.98] transition-all"
        >
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-rose-500 text-white">
              <LogOut className="w-5 h-5" />
            </div>
            <span className="text-xs font-black text-rose-700 tracking-tight">Logout & Exit Portal</span>
          </div>
          <ChevronRightSpacer />
        </button>
      </div>

      {/* Profile setup sheet */}
      {editOpen && (
        <div className="fixed inset-0 z-[80] bg-slate-950/50 flex flex-col justify-end" onClick={() => { if (!saving) setEditOpen(false); }}>
          <div className="bg-white rounded-t-3xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white rounded-t-3xl border-b border-slate-100 px-5 pt-4 pb-3 flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900">Profile setup</h3>
              <button onClick={() => setEditOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Full name</label>
                <input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  maxLength={80}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-800 focus:outline-none focus:border-orange-300"
                />
              </div>
              <div>
                <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Phone</label>
                <input
                  value={draftPhone}
                  onChange={(e) => setDraftPhone(e.target.value)}
                  maxLength={24}
                  inputMode="tel"
                  placeholder="Your phone number"
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-orange-300"
                />
              </div>
              <div>
                <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1.5">About you</label>
                <textarea
                  value={draftBio}
                  onChange={(e) => setDraftBio(e.target.value)}
                  rows={3}
                  maxLength={300}
                  placeholder="A short note students and colleagues see"
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-orange-300 resize-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Subjects</label>
                <div className="flex flex-wrap gap-1.5">
                  {(tutor.subjects || []).length > 0 ? tutor.subjects.map((sub) => (
                    <span key={sub} className="text-[11px] font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-full px-3 py-1.5">{sub}</span>
                  )) : (
                    <p className="text-[11px] text-slate-400 font-medium">No subjects assigned yet.</p>
                  )}
                </div>
              </div>
              <button
                onClick={saveProfile}
                disabled={saving}
                className="w-full py-3.5 rounded-2xl bg-[#EA580C] text-white text-sm font-black active:scale-[0.99] transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Appearance modal */}
      {themeOpen && (
        <div className="fixed inset-0 z-[80] bg-slate-950/50 flex flex-col justify-end" onClick={() => setThemeOpen(false)}>
          <div className="bg-white rounded-t-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 pt-4 pb-2 flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-900">Appearance</h3>
              <button onClick={() => setThemeOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-slate-500 font-medium px-5 pb-3">Select your preferred display appearance</p>
            <div className="px-5 pb-6 space-y-2">
              {themeItems.map((item) => {
                const active = selectedTheme === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => applyTheme(item.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border text-left transition ${
                      active ? 'border-orange-400 bg-orange-50' : 'border-slate-200 bg-white active:scale-[0.99]'
                    }`}
                  >
                    <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${active ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      <item.icon className="w-5 h-5" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-black text-slate-900">{item.label}</span>
                      <span className="block text-[11px] text-slate-500 font-medium">{item.desc}</span>
                    </span>
                    {active && <Check className="w-4 h-4 text-orange-600" />}
                  </button>
                );
              })}
              <p className="text-[10px] text-slate-400 font-medium pt-1 flex items-center gap-1.5">
                <Monitor className="w-3.5 h-3.5" /> Dark mode dims the screens that support it.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// A small chevron that keeps the row markup short.
const ChevronRightSpacer = () => <ChevronRight className="w-4 h-4 text-slate-300" />;
