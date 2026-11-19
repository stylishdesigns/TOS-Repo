import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { AccessCodeSettings } from './AccessCodeSettings';
import { WebsiteLanding } from '../dashboard/WebsiteLanding';
import { ACCENTS } from '../../landing/landingContent';
import { ModernSelect } from '../ui/ModernSelect';
import {
  User,
  Shield,
  KeyRound,
  Laptop,
  CheckCircle2,
  Building,
  Save,
  Phone,
  Mail,
  Lock,
  Globe,
  Bell,
  Eye,
  EyeOff,
  LogOut,
  Sparkles,
  Plus,
  Calendar,
  X,
  Camera,
  ImagePlus,
  Trash2,
  RefreshCw,
} from 'lucide-react';

export const SettingsView: React.FC<{ mode?: 'profile' | 'facility' }> = ({ mode = 'profile' }) => {
  const { settings, updateSettings, addToast, authMethod, activeUser, activeCentre, updateAdmin, uploadCentreImage, getCentreSessions, revokeCentreSession, getCentreLogo, saveCentreLogo, getCentreWelcomeImage, saveCentreWelcomeImage, activeCentreId } = useApp();

  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'sessions'>('profile');

  // Sync active tab if security is forbidden
  React.useEffect(() => {
    if (activeTab === 'security' && authMethod === 'google') {
      setActiveTab('profile');
    }
  }, [activeTab, authMethod]);

  // ---- Facility logo: one image feeding the facility landing page and the
  // app icon families see when they install. Upload, replace and remove live
  // here alongside the facility photos.
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [centreLogo, setCentreLogo] = useState('');
  const [logoBusy, setLogoBusy] = useState(false);
  React.useEffect(() => {
    if (mode !== 'facility' || !activeCentreId) return;
    getCentreLogo().then(setCentreLogo).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, activeCentreId]);
  const handleLogoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file: File | undefined = (e.target.files || [])[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      addToast({ type: 'error', title: 'Unsupported Image', description: `${file.name} is not a PNG, JPG or WebP picture.` });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      addToast({ type: 'error', title: 'Logo Too Large', description: 'The logo can be up to 2 MB. Choose a smaller picture.' });
      return;
    }
    try {
      setLogoBusy(true);
      const dataUrl = await readFileAsDataUrl(file);
      const url = await saveCentreLogo(dataUrl);
      setCentreLogo(url);
      addToast({ type: 'success', title: 'Logo Updated', description: 'Your facility logo is live on the landing page and the app install page.' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Upload Failed', description: err?.message || 'The logo could not be uploaded. Please try again.' });
    } finally {
      setLogoBusy(false);
    }
  };
  const handleLogoRemove = async () => {
    try {
      setLogoBusy(true);
      await saveCentreLogo('');
      setCentreLogo('');
      addToast({ type: 'success', title: 'Logo Removed', description: 'Your facility name will show in place of a logo.' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Remove Failed', description: err?.message || 'The logo could not be removed. Please try again.' });
    } finally {
      setLogoBusy(false);
    }
  };

  // ---- Accent colour: one colour for the whole facility. Saving here moves
  // the account accent AND the website landing page accent together, so the
  // landing page, portals, login page, install page and app theme all agree.
  const [accent, setAccent] = useState('');
  const [accentDraft, setAccentDraft] = useState('');
  const [accentBusy, setAccentBusy] = useState(false);
  React.useEffect(() => {
    if (mode !== 'facility' || !activeCentreId) return;
    fetch('/api/centre/landing').then((r) => (r.ok ? r.json() : null)).then((d) => {
      const a = String(d?.content?.accent || '');
      if (/^#[0-9a-fA-F]{6}$/i.test(a)) {
        setAccent(a.toUpperCase());
        setAccentDraft(a.toUpperCase());
      }
    }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, activeCentreId]);
  const handleAccentSave = async () => {
    if (!/^#[0-9a-fA-F]{6}$/i.test(accentDraft)) {
      addToast({ type: 'error', title: 'Pick a Colour', description: 'Choose a preset or a custom colour before saving.' });
      return;
    }
    try {
      setAccentBusy(true);
      const r = await fetch('/api/centre/branding-accent', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accent: accentDraft }) });
      const d = await r.json().catch(() => null);
      if (!r.ok || d?.error) throw new Error(d?.error || 'The colour could not be saved. Please try again.');
      const saved = String(d.accent || accentDraft).toUpperCase();
      setAccent(saved);
      setAccentDraft(saved);
      addToast({ type: 'success', title: 'Colour Is Live', description: 'The landing page, portals, login page and install pages now use this colour.' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Save Failed', description: err?.message || 'The colour could not be saved. Please try again.' });
    } finally {
      setAccentBusy(false);
    }
  };

  // ---- Welcome image: the picture families see when the installed app opens
  // before they sign in. Upload, replace and remove, like the logo above; up
  // to 4 MB so phone photos work.
  const welcomeInputRef = useRef<HTMLInputElement>(null);
  const [centreWelcome, setCentreWelcome] = useState('');
  const [welcomeBusy, setWelcomeBusy] = useState(false);
  React.useEffect(() => {
    if (mode !== 'facility' || !activeCentreId) return;
    getCentreWelcomeImage().then(setCentreWelcome).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, activeCentreId]);
  const handleWelcomePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file: File | undefined = (e.target.files || [])[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      addToast({ type: 'error', title: 'Unsupported Image', description: `${file.name} is not a PNG, JPG or WebP picture.` });
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      addToast({ type: 'error', title: 'Image Too Large', description: 'The welcome image can be up to 4 MB. Choose a smaller picture.' });
      return;
    }
    try {
      setWelcomeBusy(true);
      const dataUrl = await readFileAsDataUrl(file);
      const url = await saveCentreWelcomeImage(dataUrl);
      setCentreWelcome(url);
      addToast({ type: 'success', title: 'Welcome Image Updated', description: 'The new image shows when the app opens before sign-in.' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Upload Failed', description: err?.message || 'The welcome image could not be uploaded. Please try again.' });
    } finally {
      setWelcomeBusy(false);
    }
  };
  const handleWelcomeRemove = async () => {
    try {
      setWelcomeBusy(true);
      await saveCentreWelcomeImage('');
      setCentreWelcome('');
      addToast({ type: 'success', title: 'Welcome Image Removed', description: 'The default students image shows again.' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Remove Failed', description: err?.message || 'The welcome image could not be removed. Please try again.' });
    } finally {
      setWelcomeBusy(false);
    }
  };

  // Profile Form state
  const [firstName, setFirstName] = useState(activeUser?.name?.split(' ')[0] || '');
  const [lastName, setLastName] = useState(activeUser?.name?.split(' ').slice(1).join(' ') || '');
  const [email, setEmail] = useState(activeUser?.email || '');
  const [phone, setPhone] = useState(activeUser?.phone || '');
  const [jobTitle, setJobTitle] = useState(activeUser?.jobTitle || '');
  const [department, setDepartment] = useState(activeUser?.department || '');

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  // Centre Configuration state
  const [centreForm, setCentreForm] = useState({
    centreName: settings.centreName || activeCentre?.name || '',
    tagline: settings.tagline,
    academicSession: settings.academicSession,
    currencySymbol: settings.currencySymbol,
    address: settings.address,
    state: settings.state,
    phone: settings.phone,
    email: settings.email,
    whatsapp: settings.whatsappNumber || settings.whatsapp || '',
    smsNotifications: settings.smsNotifications,
    emailNotifications: settings.emailNotifications,
  });

  // The centre official name submitted at creation prefills the field.
  React.useEffect(() => {
    if (activeCentre?.name && !centreForm.centreName) {
      const official = activeCentre.name;
      setCentreForm((f) => ({ ...f, centreName: official }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCentre]);

  const [showAddSessionModal, setShowAddSessionModal] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');

  // ---- Profile photo: uploaded to Cloudinary through the server, saved on the admin record.
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState(activeUser?.photoUrl || '');
  const [photoBusy, setPhotoBusy] = useState(false);

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const handlePhotoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      addToast({ type: 'error', title: 'Unsupported Image', description: 'Upload a PNG, JPG or WebP picture.' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      addToast({ type: 'error', title: 'Image Too Large', description: 'Your profile photo can be up to 2 MB.' });
      return;
    }
    if (!activeUser) return;
    setPhotoBusy(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const url = await uploadCentreImage(dataUrl, 'profile');
      setPhotoUrl(url);
      await updateAdmin(activeUser.id, { photoUrl: url });
      addToast({ type: 'success', title: 'Profile Photo Updated', description: 'Your new photo shows on the avatar and dropdown.' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Upload Failed', description: err?.message || 'The photo could not be uploaded. Please try again.' });
    } finally {
      setPhotoBusy(false);
    }
  };

  // ---- Session expiry: this account decides how long a login lasts.
  const [expiryDays, setExpiryDays] = useState<number>(activeUser?.sessionExpiryDays ?? 0);
  React.useEffect(() => {
    setExpiryDays(activeUser?.sessionExpiryDays ?? 0);
  }, [activeUser?.id, activeUser?.sessionExpiryDays]);
  const handleExpiryChange = (days: number) => {
    setExpiryDays(days);
    if (activeUser) updateAdmin(activeUser.id, { sessionExpiryDays: days });
  };

  // ---- Real active sessions: every device signed into this account.
  type SessionRow = { id: string; device: string; ip: string; loginAt: number; lastActiveAt: number; current: boolean; revoked: boolean };
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const timeAgo = (ts: number) => {
    if (!ts) return 'unknown';
    const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
    if (mins < 2) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    return `${days}d ago`;
  };
  const loadSessions = async () => {
    setSessionsLoading(true);
    try {
      const rows = await getCentreSessions();
      setSessions(rows);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Could Not Load Sessions', description: err?.message || 'Please try again.' });
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  };
  React.useEffect(() => {
    if (activeTab === 'sessions') loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);
  const handleRevokeSession = async (id: string) => {
    try {
      await revokeCentreSession(id);
      addToast({ type: 'info', title: 'Session Revoked', description: 'That device signs out the next time it checks in.' });
      loadSessions();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Revoke Failed', description: err?.message || 'Please try again.' });
    }
  };

  // ---- Facility photos: up to 5 images of the facility, hosted on Cloudinary.
  const facilityInputRef = useRef<HTMLInputElement>(null);
  const [facilityPhotos, setFacilityPhotos] = useState<string[]>(settings.centrePhotos || []);
  const [facilityBusy, setFacilityBusy] = useState(false);
  const [lightbox, setLightbox] = useState<string>('');
  React.useEffect(() => {
    setFacilityPhotos(settings.centrePhotos || []);
  }, [settings.centrePhotos]);
  const saveFacilityPhotos = (next: string[]) => {
    setFacilityPhotos(next);
    updateSettings({ centrePhotos: next });
  };
  const handleFacilityPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const room = 5 - facilityPhotos.length;
    if (room <= 0) {
      addToast({ type: 'error', title: 'Photo Limit Reached', description: 'A facility holds up to 5 photos. Remove one to add another.' });
      return;
    }
    const picked = files.slice(0, room);
    if (files.length > room) {
      addToast({ type: 'info', title: 'Some Photos Skipped', description: `Only ${room} more photo${room === 1 ? '' : 's'} fit. Remove one to add more.` });
    }
    setFacilityBusy(true);
    const added: string[] = [];
    for (const file of picked) {
      try {
        if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
          addToast({ type: 'error', title: 'Unsupported Image', description: `${file.name} is not a PNG, JPG or WebP picture.` });
          continue;
        }
        if (file.size > 4 * 1024 * 1024) {
          addToast({ type: 'error', title: 'Image Too Large', description: `${file.name} is over 4 MB. Choose a smaller picture.` });
          continue;
        }
        const dataUrl = await readFileAsDataUrl(file);
        added.push(await uploadCentreImage(dataUrl, 'facility'));
      } catch (err: any) {
        addToast({ type: 'error', title: 'Upload Failed', description: err?.message || 'One photo could not be uploaded. Please try again.' });
      }
    }
    if (added.length) saveFacilityPhotos([...facilityPhotos, ...added]);
    setFacilityBusy(false);
  };

  const handleUpdateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUser) return;
    const fullName = `${firstName} ${lastName}`.trim();
    if (!fullName) {
      addToast({ type: 'error', title: 'Name Required', description: 'Enter your first and last name.' });
      return;
    }
    updateAdmin(activeUser.id, { name: fullName, phone, jobTitle, department });
  };

  const handleUpdatePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      addToast({
        type: 'error',
        title: 'Password Too Short',
        description: 'New password must be at least 8 characters.',
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      addToast({
        type: 'error',
        title: 'Mismatch',
        description: 'New password and confirmation do not match.',
      });
      return;
    }

    addToast({
      type: 'success',
      title: 'Password Updated',
      description: 'Your system administrator password has been updated.',
    });
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleSaveCentreSettings = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings({
      centreName: centreForm.centreName,
      tagline: centreForm.tagline,
      academicSession: centreForm.academicSession,
      currencySymbol: centreForm.currencySymbol,
      address: centreForm.address,
      state: centreForm.state,
      phone: centreForm.phone,
      email: centreForm.email,
      whatsapp: centreForm.whatsapp,
      whatsappNumber: centreForm.whatsapp,
      smsNotifications: centreForm.smsNotifications,
      emailNotifications: centreForm.emailNotifications,
    });

    addToast({
      type: 'success',
      title: 'Facility Settings Saved',
      description: 'Global facility configuration and session parameters updated.',
    });
  };

  const handleAddNewSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSessionName.trim()) return;
    const currentSessions = settings.academicSessions || [];
    if (!currentSessions.includes(newSessionName.trim())) {
      const updated = [newSessionName.trim(), ...currentSessions];
      updateSettings({ academicSessions: updated, academicSession: newSessionName.trim() });
      setCentreForm(prev => ({ ...prev, academicSession: newSessionName.trim() }));
      addToast({
        type: 'success',
        title: 'Session Created',
        description: `${newSessionName} is now the active academic session.`,
      });
    }
    setNewSessionName('');
    setShowAddSessionModal(false);
  };

  return (
    <div id="system-settings-page" className="p-4 sm:p-6 md:p-8 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">
      {/* Top Banner Card: only on the Profile page; the facility page shows facility things */}
      {mode === 'profile' && (
      <div className="bg-white p-5 sm:p-6 rounded-xl border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          {photoUrl ? (
            <img src={photoUrl} alt={activeUser?.name || 'Administrator'} className="w-13 h-13 rounded-xl object-cover shrink-0 border border-orange-200" />
          ) : (
            <div className="w-13 h-13 rounded-xl bg-orange-100 text-orange-600 font-black text-xl flex items-center justify-center shrink-0 border border-orange-200">
              {firstName[0]}
              {lastName[0]}
            </div>
          )}
          <div>
            <div className="flex items-center space-x-2.5">
              <h2 className="text-xl font-bold text-slate-900">
                {activeUser?.name || 'Admin'}
              </h2>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                {activeUser?.role || 'Administrator'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mt-1">
              <span className="flex items-center space-x-1">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                <span>{activeUser?.email || ''}</span>
              </span>
              <span>•</span>
              <span className="flex items-center space-x-1">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span>{activeUser?.phone || 'No phone set'}</span>
              </span>
              <span>•</span>
              <span className="text-slate-600 font-medium">{activeUser?.department || 'General'}</span>
            </div>
          </div>
        </div>

        <div className="text-right self-start md:self-auto">
          <span className="text-xs text-slate-400 block">Current Academic Session</span>
          <span className="text-sm font-bold text-slate-800">{settings.academicSession}</span>
        </div>
      </div>
      )}

      {/* Tabs: only on the Profile page */}
      {mode === 'profile' && (
      <div className="flex items-center space-x-1.5 bg-slate-100/80 p-1.5 rounded-xl border border-slate-200/80 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('profile')}
          className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap flex items-center space-x-2 ${
            activeTab === 'profile'
              ? 'bg-orange-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
          }`}
        >
          <User className="w-3.5 h-3.5" />
          <span>Profile Details</span>
        </button>

        {authMethod !== 'google' && (
          <button
            onClick={() => setActiveTab('security')}
            className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap flex items-center space-x-2 ${
              activeTab === 'security'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Security & Password</span>
          </button>
        )}

        <button
          onClick={() => setActiveTab('sessions')}
          className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap flex items-center space-x-2 ${
            activeTab === 'sessions'
              ? 'bg-orange-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
          }`}
        >
          <Laptop className="w-3.5 h-3.5" />
          <span>Active Sessions</span>
        </button>
      </div>
      )}

      {/* Tab: Profile Details */}
      {mode === 'profile' && activeTab === 'profile' && (
        <div className="bg-white p-5 sm:p-6 rounded-xl border border-slate-200/90 shadow-xs space-y-5">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-900">Administrator Profile Details</h3>
            <p className="text-xs text-slate-500">
              Personal contact information and designation displayed across administrative records.
            </p>
          </div>

          <div className="flex items-center space-x-4">
            <div className="relative">
              {photoUrl ? (
                <img src={photoUrl} alt="Profile" className="w-16 h-16 rounded-xl object-cover border border-slate-200" />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-orange-100 text-orange-600 font-black text-lg grid place-items-center border border-orange-200">
                  {firstName[0]}{lastName[0]}
                </div>
              )}
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={photoBusy}
                aria-label="Upload profile photo"
                className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-orange-600 text-white shadow flex items-center justify-center hover:bg-orange-700 disabled:opacity-60 transition-colors"
              >
                {photoBusy ? <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800">Profile photo</p>
              <p className="text-[11px] text-slate-500">PNG, JPG or WebP, up to 2 MB. Shows on your avatar and dropdown.</p>
            </div>
            <input ref={photoInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handlePhotoPick} />
          </div>

          <form onSubmit={handleUpdateProfile} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">First Name *</label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Last Name *</label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  disabled
                  value={email}
                  className="w-full bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-slate-500 cursor-not-allowed"
                />
                <p className="text-[10px] text-slate-400 mt-1">Your email is your sign-in address, so it cannot be changed here.</p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Direct Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Official Job Title</label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Department</label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm flex items-center space-x-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Profile Changes</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab: Security & Password */}
      {mode === 'profile' && activeTab === 'security' && (
        <div className="space-y-6">
          <div className="bg-white p-5 sm:p-6 rounded-xl border border-slate-200/90 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Change Administrative Password</h3>
              <p className="text-xs text-slate-500">
                Choose a strong passphrase with numbers, uppercase letters, and symbols.
              </p>
            </div>

            <form onSubmit={handleUpdatePassword} className="space-y-3.5 text-xs max-w-lg">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Current Password *</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">New Password *</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Confirm New Password *</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                />
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="show-pass-cb"
                  checked={showPassword}
                  onChange={(e) => setShowPassword(e.target.checked)}
                  className="rounded text-orange-600 focus:ring-orange-500"
                />
                <label htmlFor="show-pass-cb" className="text-xs text-slate-600 cursor-pointer">
                  Show password characters
                </label>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm"
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>

          {/* 2FA Card */}
          <div className="bg-white p-5 sm:p-6 rounded-xl border border-slate-200/90 shadow-xs flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-slate-900">Two-Factor Authentication (2FA)</h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Require an SMS OTP code or Authenticator app token on login.
              </p>
            </div>
            <button
              onClick={() => {
                setTwoFactorEnabled(!twoFactorEnabled);
                addToast({
                  type: 'info',
                  title: '2FA Status',
                  description: !twoFactorEnabled ? 'Two-Factor Authentication activated.' : '2FA disabled.',
                });
              }}
              className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-all ${
                twoFactorEnabled
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {twoFactorEnabled ? '✓ Enabled' : 'Enable 2FA'}
            </button>
          </div>
        </div>
      )}

      {/* Tab: Active Sessions */}
      {mode === 'profile' && activeTab === 'sessions' && (
        <div className="space-y-6">
          <div className="bg-white p-5 sm:p-6 rounded-xl border border-slate-200/90 shadow-xs space-y-3">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Session Expiry</h3>
              <p className="text-xs text-slate-500">
                How long a login on any of your devices stays signed in. "None" keeps every device signed in until you sign out or revoke it.
              </p>
            </div>
            <div className="max-w-xs">
              <ModernSelect
                value={String(expiryDays)}
                onChange={(v: string) => handleExpiryChange(Number(v))}
                options={[
                  { value: '0', label: 'None (never expires)' },
                  { value: '30', label: '1 month' },
                  { value: '90', label: '3 months' },
                  { value: '180', label: '6 months' },
                ]}
              />
            </div>
          </div>

          <div className="bg-white p-5 sm:p-6 rounded-xl border border-slate-200/90 shadow-xs space-y-3">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Active Login Sessions</h3>
                <p className="text-xs text-slate-500">
                  Every device signed into this account, tracked live. Revoke one to sign it out.
                </p>
              </div>
              <button
                type="button"
                onClick={loadSessions}
                className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 flex items-center space-x-1.5 shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${sessionsLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            {sessionsLoading && !sessions && (
              <div className="py-8 grid place-items-center">
                <div className="w-7 h-7 rounded-full border-2 border-orange-300 border-t-transparent animate-spin" />
              </div>
            )}
            {sessions && sessions.length === 0 && (
              <p className="text-xs text-slate-400 py-3">No devices yet. A device appears here the first time it signs in.</p>
            )}
            <div className="divide-y divide-slate-100">
              {(sessions || []).map((s) => (
                <div key={s.id} className={`py-3 flex items-center justify-between gap-3 ${s.revoked ? 'opacity-50' : ''}`}>
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                      <Laptop className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">{s.device}{s.current ? ' (This device)' : ''}</p>
                      <p className="text-[11px] text-slate-400 font-mono truncate">
                        IP: {s.ip || 'unknown'} • Signed in {timeAgo(s.loginAt)} • {s.revoked ? 'Revoked' : `Active ${timeAgo(s.lastActiveAt)}`}
                      </p>
                    </div>
                  </div>
                  {s.current ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 shrink-0">This Device</span>
                  ) : s.revoked ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 shrink-0">Revoked</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleRevokeSession(s.id)}
                      className="px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded border border-rose-200 transition-colors shrink-0"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

            {/* Tab: Centre & System Parameters */}
      {mode === 'facility' && (
        <div>
          <h2 className="text-xl font-bold text-slate-900">Facility Settings</h2>
          <p className="text-xs text-slate-500 mt-0.5">Facility parameters, branding and your website landing page.</p>
        </div>
      )}

      {mode === 'facility' && (
        <div className="space-y-6">
          {/* Accent colour: one colour for the whole facility, saved to the
              account and the website landing page together. */}
          <div className="bg-white p-5 sm:p-6 rounded-xl border border-slate-200/90 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Accent colour</h3>
              <p className="text-xs text-slate-500">
                One colour for your facility: the website landing page, portals, login page and the app families install. Saving here updates them all together, no deploy needed.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {ACCENTS.map((a) => (
                <button key={a} type="button" onClick={() => setAccentDraft(a)} aria-label={`Accent ${a}`} className={`w-9 h-9 rounded-full border-2 transition-transform ${accentDraft === a ? 'border-slate-900 scale-110' : 'border-transparent'}`} style={{ background: a }} />
              ))}
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/i.test(accentDraft) ? accentDraft : '#F2A93B'}
                onChange={(e) => setAccentDraft(e.target.value.toUpperCase())}
                aria-label="Custom colour"
                title="Pick any colour"
                className="w-9 h-9 rounded-full border-2 border-dashed border-slate-300 bg-transparent p-0 cursor-pointer"
              />
              <span className="text-xs text-slate-400">{accentDraft || 'Pick a colour'}</span>
              <div className="flex-1" />
              <button type="button" onClick={handleAccentSave} disabled={accentBusy || accentDraft === accent} className="px-4 py-2 rounded-lg text-sm font-semibold bg-[var(--brand,#0f172a)] text-[var(--on-brand,#fff)] hover:brightness-110 disabled:opacity-50 transition-colors">
                {accentBusy ? 'Saving…' : 'Save colour'}
              </button>
            </div>
          </div>

          {/* Access code (Prompt C Part C): owner-managed, server-verified. */}
          <AccessCodeSettings />

          {/* Facility logo: upload, replace or remove; the landing page and app icon follow it. */}
          <div className="bg-white p-5 sm:p-6 rounded-xl border border-slate-200/90 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Facility Logo</h3>
              <p className="text-xs text-slate-500">
                Your logo appears on your facility's landing page and becomes the app icon when families install your app. A square image works best.
              </p>
            </div>
            <div className="flex items-center gap-4">
              {centreLogo ? (
                <img src={centreLogo} alt="Facility logo" className="w-20 h-20 rounded-xl object-contain border border-slate-200 bg-white p-1.5 shrink-0" />
              ) : (
                <div className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 grid place-items-center text-slate-300 shrink-0">
                  <ImagePlus className="w-6 h-6" />
                </div>
              )}
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={logoBusy}
                  className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm disabled:opacity-60 w-fit"
                >
                  {logoBusy ? 'Uploading…' : centreLogo ? 'Replace logo' : 'Upload logo'}
                </button>
                {centreLogo && !logoBusy && (
                  <button
                    type="button"
                    onClick={handleLogoRemove}
                    className="px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 w-fit"
                  >
                    Remove logo
                  </button>
                )}
                <p className="text-[11px] text-slate-400">PNG, JPG or WebP, up to 2 MB.</p>
              </div>
            </div>
            <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleLogoPick} />
          </div>

          {/* Welcome image: the picture on the app's welcome screen. Every
              facility starts on a default students image and can replace it. */}
          <div className="bg-white p-5 sm:p-6 rounded-xl border border-slate-200/90 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Welcome Image</h3>
              <p className="text-xs text-slate-500">
                The picture families see when your app opens, above Get Started and Log In. A photo of your centre or a graphic both work. A tall portrait image (three by four) fills the card best; every facility starts with a default students image until you change it.
              </p>
            </div>
            <div className="flex items-center gap-4">
              {centreWelcome ? (
                <img src={centreWelcome} alt="Welcome image" className="w-20 h-28 rounded-xl object-cover border border-slate-200 shrink-0" />
              ) : (
                <img src="/welcome-default.jpg" alt="Default welcome image" className="w-20 h-28 rounded-xl object-cover border border-slate-200 shrink-0" />
              )}
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => welcomeInputRef.current?.click()}
                  disabled={welcomeBusy}
                  className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm disabled:opacity-60 w-fit"
                >
                  {welcomeBusy ? 'Uploading…' : centreWelcome ? 'Replace image' : 'Upload your own image'}
                </button>
                {centreWelcome && !welcomeBusy && (
                  <button
                    type="button"
                    onClick={handleWelcomeRemove}
                    className="px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 w-fit"
                  >
                    Remove image
                  </button>
                )}
                <p className="text-[11px] text-slate-400">PNG, JPG or WebP, up to 4 MB.</p>
              </div>
            </div>
            <input ref={welcomeInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleWelcomePick} />
          </div>

          {/* Facility photos: up to 5 images of the facility, hosted on Cloudinary. */}
          <div className="bg-white p-5 sm:p-6 rounded-xl border border-slate-200/90 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Facility Photos</h3>
                <p className="text-xs text-slate-500">
                  Show families what your facility looks like. Add up to 5 photos, one at a time or several at once. Tap a photo to preview it large.
                </p>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200 shrink-0">
                {facilityPhotos.length}/5
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {facilityPhotos.map((url, i) => (
                <div key={url} className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100" style={{ aspectRatio: '4 / 3' }}>
                  <img
                    src={url}
                    alt={`Facility photo ${i + 1}`}
                    onClick={() => setLightbox(url)}
                    className="w-full h-full object-cover cursor-zoom-in"
                  />
                  <button
                    type="button"
                    aria-label={`Remove photo ${i + 1}`}
                    onClick={() => saveFacilityPhotos(facilityPhotos.filter((u) => u !== url))}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/95 text-rose-600 shadow flex items-center justify-center hover:bg-rose-50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {facilityBusy && (
                <div className="rounded-xl border border-orange-200 bg-orange-50 grid place-items-center" style={{ aspectRatio: '4 / 3' }}>
                  <div className="w-6 h-6 rounded-full border-2 border-orange-300 border-t-transparent animate-spin" />
                </div>
              )}
              {!facilityBusy && facilityPhotos.length < 5 && (
                <button
                  type="button"
                  onClick={() => facilityInputRef.current?.click()}
                  className="rounded-xl border-2 border-dashed border-slate-300 hover:border-orange-400 hover:bg-orange-50/40 transition-colors grid place-items-center text-slate-400 hover:text-orange-500"
                  style={{ aspectRatio: '4 / 3' }}
                >
                  <span className="flex flex-col items-center gap-1.5">
                    <ImagePlus className="w-6 h-6" />
                    <span className="text-[11px] font-semibold">Add photo{facilityPhotos.length === 4 ? '' : 's'}</span>
                  </span>
                </button>
              )}
            </div>
            <input ref={facilityInputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={handleFacilityPick} />
            {facilityPhotos.length === 0 && !facilityBusy && (
              <p className="text-[11px] text-slate-400">PNG, JPG or WebP, up to 4 MB each.</p>
            )}
          </div>
          <div className="bg-white p-5 sm:p-6 rounded-xl border border-slate-200/90 shadow-xs space-y-5">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-900">Facility Identity & Academic Parameters</h3>
            <p className="text-xs text-slate-500">
              Global Facility name, active academic session, and official contact lines.
            </p>
          </div>

          <form onSubmit={handleSaveCentreSettings} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Facility Official Name *
                </label>
                <input
                  type="text"
                  required
                  value={centreForm.centreName || ''}
                  onChange={(e) =>
                    setCentreForm({ ...centreForm, centreName: e.target.value })
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Motto / Tagline</label>
                <input
                  type="text"
                  value={centreForm.tagline || ''}
                  onChange={(e) =>
                    setCentreForm({ ...centreForm, tagline: e.target.value })
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                />
              </div>

              <div>
                <div className="flex items-end space-x-2">
                  <div className="flex-1">
                    <ModernSelect
                      label="Active Academic Session *"
                      value={centreForm.academicSession || ''}
                      onChange={(val) =>
                        setCentreForm({ ...centreForm, academicSession: val })
                      }
                      options={(settings.academicSessions || [settings.academicSession]).map((s) => ({
                        value: s,
                        label: s
                      }))}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddSessionModal(true)}
                    className="h-[42px] px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200 transition-colors shrink-0 flex items-center justify-center mb-[1px]"
                    title="Add new academic session"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>


              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  WhatsApp number (optional)
                </label>
                <input
                  type="tel"
                  value={centreForm.whatsapp || ''}
                  onChange={(e) =>
                    setCentreForm({ ...centreForm, whatsapp: e.target.value })
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Facility Public Email
                </label>
                <input
                  type="email"
                  required
                  value={centreForm.email || ''}
                  onChange={(e) =>
                    setCentreForm({ ...centreForm, email: e.target.value })
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Main Campus Physical Address
              </label>
              <input
                type="text"
                value={centreForm.address || ''}
                onChange={(e) =>
                  setCentreForm({ ...centreForm, address: e.target.value })
                }
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
              />
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm flex items-center space-x-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Facility Parameters</span>
              </button>
            </div>
          </form>
          </div>
        </div>
      )}

      {/* Facility mode, section two: the website landing page editor. */}
      {mode === 'facility' && (
        <div className="space-y-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">Website Landing Page</h3>
            <p className="text-xs text-slate-500">The public page families see at your facility's address. Edit what it says below.</p>
          </div>
          <WebsiteLanding />
        </div>
      )}

      {/* Add New Session Modal */}
      {showAddSessionModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Calendar className="w-5 h-5 text-orange-600" />
                <h3 className="font-bold text-base text-slate-900">Add Academic Session</h3>
              </div>
              <button
                onClick={() => setShowAddSessionModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddNewSession} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Session Name / Period *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 2026/2027 (Upcoming Session)"
                  value={newSessionName}
                  onChange={(e) => setNewSessionName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none font-medium"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddSessionModal(false)}
                  className="px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm"
                >
                  Add Session
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Facility photo lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[100] bg-slate-950/90 flex items-center justify-center p-4" onClick={() => setLightbox('')}>
          <img
            src={lightbox}
            alt="Facility photo preview"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[88vh] max-w-full rounded-xl shadow-2xl"
          />
          <button
            type="button"
            aria-label="Close preview"
            onClick={() => setLightbox('')}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white grid place-items-center hover:bg-white/20"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
};
