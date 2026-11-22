import React, { useRef, useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { Tutor } from '../../../types';
import {
  LogOut,
  X,
  Check,
  Moon,
  Sun,
  Monitor,
  Loader2,
  User,
  Palette,
  Pencil,
  ChevronRight,
  Wallet,
  Clock,
  ShieldCheck
} from 'lucide-react';
import { getAuth, signInWithEmailAndPassword, updatePassword } from 'firebase/auth';
import { formatPayInfo } from '../../staff/PaySetupFields';
import { formatDateLong } from '../../../lib/paymentDates';
import { computeNextPayDate } from '../../../lib/staffPay';

interface MoreTabProps {
  tutor: Tutor;
  onExit: () => void;
}

export const MoreTab: React.FC<MoreTabProps> = ({ tutor, onExit }) => {
  const { addToast, activeCentreId, centreName, bgTheme, setBgTheme, updateTutor } = useApp();
  const [editOpen, setEditOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [draftName, setDraftName] = useState(tutor.name);
  const [draftPhone, setDraftPhone] = useState(tutor.phone || '');
  const [draftBio, setDraftBio] = useState(tutor.bio || '');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarRef = useRef<HTMLInputElement | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<'light' | 'dark'>(() => (bgTheme === 'dark' ? 'dark' : 'light'));
  const [payOpen, setPayOpen] = useState(false);
  const [payHistory, setPayHistory] = useState<any[] | null>(null);
  const [payLoading, setPayLoading] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  // Security: change this tutor's own login password. Re-authenticating with
  // the current password first is what lets Firebase allow the change.
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) {
      addToast({ type: 'error', title: 'Passwords Do Not Match', description: 'The new password and its confirmation are different.' });
      return;
    }
    setPwSaving(true);
    try {
      const auth = getAuth();
      if (!auth.currentUser) throw new Error('You are signed out.');
      await signInWithEmailAndPassword(auth, tutor.email, currentPw);
      await updatePassword(auth.currentUser, newPw);
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setPwOpen(false);
      addToast({ type: 'success', title: 'Password Changed', description: 'Your login password has been updated.' });
    } catch (err: any) {
      const code = String(err?.code || '');
      const msg = code.includes('wrong-password') || code.includes('invalid-credential')
        ? 'Your current password is not correct.'
        : code.includes('weak-password')
        ? 'The new password is too weak; use at least 6 characters.'
        : code.includes('too-many-requests')
        ? 'Too many attempts. Try again in a few minutes.'
        : err?.message || 'Could not change the password.';
      addToast({ type: 'error', title: 'Change Failed', description: msg });
    } finally {
      setPwSaving(false);
    }
  };

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

  // My Pay: what the centre has set up for this tutor and what they have
  // actually been paid. History loads when the sheet opens.
  const openPay = async () => {
    setPayOpen(true);
    setPayLoading(true);
    setPayHistory(null);
    try {
      const token = (await getAuth().currentUser?.getIdToken()) || '';
      const res = await fetch(`/api/centre/staff-payments/mine?centreId=${encodeURIComponent(activeCentreId || '')}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not load your pay records.');
      setPayHistory(data.payments || []);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Load Failed', description: err?.message || 'Could not load your pay records.' });
      setPayHistory([]);
    } finally {
      setPayLoading(false);
    }
  };

  return (
    <div className="p-5 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-32">
      {/* 1. Header Profile */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs flex flex-col items-center text-center space-y-3">
        <div className="relative">
          <div
            className="w-20 h-20 rounded-full bg-slate-100 border-4 border-white shadow-md flex items-center justify-center text-2xl font-black text-slate-400 overflow-hidden"
          >
            {tutor.avatar ? (
              <img src={tutor.avatar} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              initials
            )}
          </div>
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

        <button
          onClick={openPay}
          className="w-full bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between group active:scale-[0.98] transition-all"
        >
          <div className="flex items-center space-x-3 min-w-0">
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <Wallet className="w-5 h-5" />
            </div>
            <div className="text-left min-w-0">
              <span className="text-xs font-black text-slate-700 tracking-tight">My Pay</span>
              <p className="text-[10px] font-bold text-slate-400 truncate max-w-[190px]">{formatPayInfo(tutor as any, true)}</p>
            </div>
          </div>
          <ChevronRightSpacer />
        </button>

        <button
          onClick={() => { setCurrentPw(''); setNewPw(''); setConfirmPw(''); setPwOpen(true); }}
          className="w-full bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between group active:scale-[0.98] transition-all"
        >
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-sky-50 text-sky-500">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="text-left">
              <span className="text-xs font-black text-slate-700 tracking-tight">Security</span>
              <p className="text-[10px] font-bold text-slate-400">Change your password</p>
            </div>
          </div>
          <ChevronRightSpacer />
        </button>
      </div>

      {/* 4. Session */}
      <div className="pt-2">
        <button
          onClick={onExit}
          className="w-full p-4 rounded-2xl border border-slate-200 bg-white flex items-center justify-between group active:scale-[0.98] transition-all hover:border-rose-200"
        >
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-rose-50 text-rose-500">
              <LogOut className="w-5 h-5" />
            </div>
            <div className="text-left">
              <p className="text-xs font-black text-slate-700 tracking-tight">Log out</p>
              <p className="text-[10px] font-medium text-slate-400">End your session on this device</p>
            </div>
          </div>
          <ChevronRightSpacer />
        </button>
        <p className="text-center pt-6 pb-2 text-slate-400 text-[11px] font-medium">{centreName} • Version 1.0.0 (2026)</p>
      </div>

      {/* My Pay sheet */}
      {payOpen && (
        <div className="fixed inset-0 z-[80] bg-slate-950/50 flex flex-col justify-end" onClick={() => setPayOpen(false)}>
          <div className="bg-white rounded-t-3xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 pb-3 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-base font-black text-slate-900">My Pay</h3>
              <button onClick={() => setPayOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 pt-4 overflow-y-auto space-y-4">
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Pay Setup</p>
                <p className="text-sm font-black text-slate-900 mt-1">{formatPayInfo(tutor as any, true)}</p>
                {(() => {
                  const nextPay = computeNextPayDate((tutor as any).payFrequency, (tutor as any).payDay, (tutor as any).lastPaidAt);
                  if (!nextPay) return null;
                  return (
                    <p className="text-[11px] font-bold text-emerald-700 mt-1.5 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      Next pay: {formatDateLong(nextPay)}
                    </p>
                  );
                })()}
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Payment History</p>
                {payLoading ? (
                  <p className="text-xs text-slate-400 font-bold py-4 text-center">Loading...</p>
                ) : !payHistory || payHistory.length === 0 ? (
                  <p className="text-xs text-slate-400 font-bold py-4 text-center">No payments recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {payHistory.map((p) => (
                      <div key={p.id} className="p-3 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-black text-slate-900">₦{Number(p.amount).toLocaleString('en-NG')}</p>
                          <p className="text-[10px] text-slate-400 font-bold">
                            {formatDateLong(p.datePaid)} · {p.mode}
                            {(tutor as any).payFrequency && p.periodsCovered ? ` · ${p.periodsCovered} class${p.periodsCovered > 1 ? 'es' : ''}` : ''}
                          </p>
                          {p.note && <p className="text-[10px] text-slate-500 mt-0.5 truncate">{p.note}</p>}
                        </div>
                        {p.evidenceUrl ? (
                          <a href={p.evidenceUrl} target="_blank" rel="noreferrer" className="text-[10px] font-black text-orange-600 uppercase tracking-wider shrink-0">
                            View Proof
                          </a>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Security sheet */}
      {pwOpen && (
        <div className="fixed inset-0 z-[80] bg-slate-950/50 flex flex-col justify-end" onClick={() => { if (!pwSaving) setPwOpen(false); }}>
          <div className="bg-white rounded-t-3xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 pb-3 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="text-base font-black text-slate-900">Security</h3>
              <button onClick={() => setPwOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleChangePassword} className="p-5 pt-4 space-y-4 overflow-y-auto">
              <p className="text-[11px] text-slate-500 font-medium">Confirm your current password, then choose a new one. You stay signed in on this device after the change.</p>
              <div>
                <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Current password</label>
                <input
                  type="password"
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-orange-300"
                />
              </div>
              <div>
                <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1.5">New password</label>
                <input
                  type="password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                  placeholder="At least 6 characters"
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-orange-300"
                />
              </div>
              <div>
                <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Confirm new password</label>
                <input
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  autoComplete="new-password"
                  required
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-orange-300"
                />
              </div>
              <button
                type="submit"
                disabled={pwSaving}
                className="w-full py-3.5 rounded-2xl bg-orange-600 text-white text-sm font-black active:scale-[0.99] transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {pwSaving && <Loader2 className="w-4 h-4 animate-spin" />} Change password
              </button>
            </form>
          </div>
        </div>
      )}

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
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 rounded-full bg-slate-100 border-4 border-white shadow-md flex items-center justify-center text-lg font-black text-slate-400 overflow-hidden relative shrink-0">
                  {tutor.avatar ? (
                    <img src={tutor.avatar} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    initials
                  )}
                  {uploadingAvatar && (
                    <div className="absolute inset-0 rounded-full bg-slate-900/40 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 animate-spin text-white" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black text-slate-700 tracking-tight">Profile photo</p>
                  <p className="text-[11px] text-slate-500 font-medium">Shown to students and staff across the portal.</p>
                  <button
                    onClick={() => avatarRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="mt-2 px-3 py-1.5 rounded-xl bg-orange-600 text-white text-[10px] font-black uppercase tracking-widest active:scale-[0.98] transition disabled:opacity-60"
                  >
                    {uploadingAvatar ? 'Uploading...' : 'Change photo'}
                  </button>
                </div>
                <input
                  ref={avatarRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { pickAvatar(e.target.files && e.target.files[0]); e.target.value = ''; }}
                />
              </div>
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
                className="w-full py-3.5 rounded-2xl bg-orange-600 text-white text-sm font-black active:scale-[0.99] transition disabled:opacity-60 flex items-center justify-center gap-2"
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
const ChevronRightSpacer = () => <ChevronRight strokeWidth={2.75} className="w-4 h-4 text-slate-700" />;
