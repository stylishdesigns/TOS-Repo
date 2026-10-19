import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
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
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { settings, updateSettings, addToast, authMethod, activeUser } = useApp();

  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'sessions' | 'centre'>('profile');

  // Sync active tab if security is forbidden
  React.useEffect(() => {
    if (activeTab === 'security' && authMethod === 'google') {
      setActiveTab('profile');
    }
  }, [activeTab, authMethod]);

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
    centreName: settings.centreName,
    tagline: settings.tagline,
    academicSession: settings.academicSession,
    currencySymbol: settings.currencySymbol,
    address: settings.address,
    state: settings.state,
    phone: settings.phone,
    email: settings.email,
    whatsapp: settings.whatsappNumber || settings.whatsapp || '+234 805 676 5455',
    smsNotifications: settings.smsNotifications,
    emailNotifications: settings.emailNotifications,
  });

  const [showAddSessionModal, setShowAddSessionModal] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');

  const handleUpdateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    addToast({
      type: 'success',
      title: 'Admin Profile Updated',
      description: `Saved details for ${firstName} ${lastName}.`,
    });
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
      title: 'System Settings Saved',
      description: 'Global centre configuration and session parameters updated.',
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
      {/* Top Banner Card */}
      <div className="bg-white p-5 sm:p-6 rounded-xl border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-13 h-13 rounded-xl bg-orange-100 text-[#EA580C] font-black text-xl flex items-center justify-center shrink-0 border border-orange-200">
            {firstName[0]}
            {lastName[0]}
          </div>
          <div>
            <div className="flex items-center space-x-2.5">
              <h2 className="text-xl font-bold text-slate-900">
                {activeUser.name}
              </h2>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                {activeUser.role}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mt-1">
              <span className="flex items-center space-x-1">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                <span>{activeUser.email}</span>
              </span>
              <span>•</span>
              <span className="flex items-center space-x-1">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span>{activeUser.phone || 'No phone set'}</span>
              </span>
              <span>•</span>
              <span className="text-slate-600 font-medium">{activeUser.department}</span>
            </div>
          </div>
        </div>

        <div className="text-right self-start md:self-auto">
          <span className="text-xs text-slate-400 block">Current Academic Session</span>
          <span className="text-sm font-bold text-slate-800">{settings.academicSession}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-1.5 bg-slate-100/80 p-1.5 rounded-xl border border-slate-200/80 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('profile')}
          className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap flex items-center space-x-2 ${
            activeTab === 'profile'
              ? 'bg-[#EA580C] text-white shadow-xs'
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
                ? 'bg-[#EA580C] text-white shadow-xs'
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
              ? 'bg-[#EA580C] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
          }`}
        >
          <Laptop className="w-3.5 h-3.5" />
          <span>Active Sessions</span>
        </button>

        <button
          onClick={() => setActiveTab('centre')}
          className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap flex items-center space-x-2 ${
            activeTab === 'centre'
              ? 'bg-[#EA580C] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
          }`}
        >
          <Building className="w-3.5 h-3.5" />
          <span>Centre & System Parameters</span>
        </button>
      </div>

      {/* Tab: Profile Details */}
      {activeTab === 'profile' && (
        <div className="bg-white p-5 sm:p-6 rounded-xl border border-slate-200/90 shadow-xs space-y-5">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-900">Administrator Profile Details</h3>
            <p className="text-xs text-slate-500">
              Personal contact information and designation displayed across administrative records.
            </p>
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
                <label className="block font-semibold text-slate-700 mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                />
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
                className="px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg shadow-sm flex items-center space-x-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Profile Changes</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab: Security & Password */}
      {activeTab === 'security' && (
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
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg shadow-sm"
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
      {activeTab === 'sessions' && (
        <div className="bg-white p-5 sm:p-6 rounded-xl border border-slate-200/90 shadow-xs space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-900">Active Login Sessions</h3>
            <p className="text-xs text-slate-500">
              Devices and browsers currently logged into this administrator account.
            </p>
          </div>

          <div className="divide-y divide-slate-100">
            <div className="py-3 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                  <Laptop className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">
                    Chrome 122 on macOS (Current Session)
                  </p>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Lagos, Nigeria • IP: 102.89.44.12 • Active Now
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                This Device
              </span>
            </div>

            <div className="py-3 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                  <Laptop className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">
                    Safari on iPhone 15 Pro
                  </p>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Ikeja, Lagos • IP: 102.89.44.58 • 2 hours ago
                  </p>
                </div>
              </div>
              <button
                onClick={() =>
                  addToast({
                    type: 'info',
                    title: 'Session Revoked',
                    description: 'Device logged out safely.',
                  })
                }
                className="px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded border border-rose-200 transition-colors"
              >
                Revoke
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Centre & System Parameters */}
      {activeTab === 'centre' && (
        <div className="bg-white p-5 sm:p-6 rounded-xl border border-slate-200/90 shadow-xs space-y-5">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-900">Centre Identity & Academic Parameters</h3>
            <p className="text-xs text-slate-500">
              Global Centre name, active academic session, currency symbol, and official contact lines.
            </p>
          </div>

          <form onSubmit={handleSaveCentreSettings} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Centre Official Name *
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
                  Currency Symbol
                </label>
                <input
                  type="text"
                  required
                  value={centreForm.currencySymbol || ''}
                  onChange={(e) =>
                    setCentreForm({ ...centreForm, currencySymbol: e.target.value })
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-bold focus:bg-white focus:border-orange-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  WhatsApp Support Line *
                </label>
                <input
                  type="tel"
                  required
                  value={centreForm.whatsapp || ''}
                  onChange={(e) =>
                    setCentreForm({ ...centreForm, whatsapp: e.target.value })
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Centre Public Email
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
                className="px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg shadow-sm flex items-center space-x-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Centre Parameters</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add New Session Modal */}
      {showAddSessionModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Calendar className="w-5 h-5 text-[#EA580C]" />
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
                  className="px-4 py-2 font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg shadow-sm"
                >
                  Add Session
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
