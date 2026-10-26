import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  LogOut,
  Edit2,
  Calendar,
  Mail,
  Phone,
  ShieldCheck,
  Check,
  Eye,
  EyeOff,
  Monitor,
  Laptop,
} from 'lucide-react';

export const MyAccountView: React.FC = () => {
  const { activeUser, addToast } = useApp();

  const [activeTab, setActiveTab] = useState<'Profile' | 'Password' | 'Sessions'>('Profile');

  // Profile Form state
  const [firstName, setFirstName] = useState('Platform');
  const [lastName, setLastName] = useState('Admin');
  const [email, setEmail] = useState(activeUser?.email || ''); // No hardcoded demo email
  const [phone, setPhone] = useState('08056765455');
  const [jobTitle, setJobTitle] = useState('Platform Owner');
  const [department, setDepartment] = useState('Technology');
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // 2FA state
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  const handleUpdatePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      addToast({
        type: 'error',
        title: 'Weak Password',
        description: 'Password must be at least 8 characters long.',
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      addToast({
        type: 'error',
        title: 'Password Mismatch',
        description: 'New password and confirmation do not match.',
      });
      return;
    }
    addToast({
      type: 'success',
      title: 'Password Updated',
      description: 'Your administrative password has been updated.',
    });
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  return (
    <div id="my-account-page" className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header Card (video 01:06 - 01:08) */}
      <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="flex items-center space-x-4">
          <div className="w-14 h-14 rounded-xl bg-[#FED7AA] text-[#C2410C] font-extrabold text-xl flex items-center justify-center shrink-0">
            PA
          </div>
          <div>
            <div className="flex items-center space-x-2.5">
              <h2 className="text-xl font-bold text-slate-900">{firstName} {lastName}</h2>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 mr-1.5" />
                Super Administrator
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-500 mt-1.5">
              <span className="flex items-center space-x-1">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                <span>{email}</span>
              </span>
              <span className="flex items-center space-x-1">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span>{phone}</span>
              </span>
              <span className="flex items-center space-x-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Administrator since Aug 2026</span>
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            addToast({
              type: 'info',
              title: 'Signed Out',
              description: 'You have been safely signed out.',
            });
          }}
          className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition-all flex items-center space-x-2 self-start md:self-auto"
        >
          <LogOut className="w-3.5 h-3.5 text-slate-500" />
          <span>Sign out</span>
        </button>
      </div>

      {/* Tabs Row (video 01:06 - 01:08) */}
      <div className="flex items-center space-x-1.5">
        {(['Profile', 'Password', 'Sessions'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              activeTab === tab
                ? 'bg-[#EA580C] text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content: Profile (video 01:06 - 01:08, 02:07 - 02:08) */}
      {activeTab === 'Profile' && (
        <div className="space-y-6">
          {/* Profile Details Card */}
          <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-xs">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">Profile Details</h3>
              <button
                onClick={() => {
                  setIsEditingProfile(!isEditingProfile);
                  if (isEditingProfile) {
                    addToast({
                      type: 'success',
                      title: 'Profile Saved',
                      description: 'Changes have been updated successfully.',
                    });
                  }
                }}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition-all flex items-center space-x-1.5"
              >
                <Edit2 className="w-3 h-3 text-slate-500" />
                <span>{isEditingProfile ? 'Save Profile' : 'Edit Profile'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">First Name</label>
                <input
                  type="text"
                  disabled={!isEditingProfile}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 disabled:opacity-80 rounded-lg px-3.5 py-2 text-xs text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Last Name</label>
                <input
                  type="text"
                  disabled={!isEditingProfile}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 disabled:opacity-80 rounded-lg px-3.5 py-2 text-xs text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email Address</label>
                <input
                  type="email"
                  disabled={!isEditingProfile}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 disabled:opacity-80 rounded-lg px-3.5 py-2 text-xs text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Phone</label>
                <input
                  type="text"
                  disabled={!isEditingProfile}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 disabled:opacity-80 rounded-lg px-3.5 py-2 text-xs text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Job Title</label>
                <input
                  type="text"
                  disabled={!isEditingProfile}
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 disabled:opacity-80 rounded-lg px-3.5 py-2 text-xs text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Department</label>
                <input
                  type="text"
                  disabled={!isEditingProfile}
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 disabled:opacity-80 rounded-lg px-3.5 py-2 text-xs text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Role</label>
                <input
                  type="text"
                  disabled
                  value="Super Administrator"
                  className="w-full bg-slate-100 border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-600 outline-none font-medium"
                />
              </div>
            </div>
          </div>

          {/* Access Level Card (video 02:07 - 02:08) */}
          <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-xs space-y-3">
            <h3 className="font-bold text-base text-slate-900">Access Level</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              <span className="font-bold text-slate-900">• Super Administrator — full control.</span>{' '}
              You can add and remove other administrators, approve schools, configure the campaign, rubric and security, and change every setting. This is the highest access level.
            </p>
            <div className="p-3 bg-slate-50 rounded-lg text-[11px] text-slate-500">
              Areas you can open: Dashboard • Schools • Students • Other Learners • Juries • Training • Assessments • Debate • Leaderboard • Reports • Account • Settings
            </div>
          </div>
        </div>
      )}

      {/* Tab Content: Password (video 01:09 - 01:12) */}
      {activeTab === 'Password' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-xs max-w-2xl">
          <h3 className="font-bold text-base text-slate-900 pb-2 border-b border-slate-100">Change Password</h3>
          <p className="text-xs text-slate-500 mt-2">
            You'll need your current password. Changing it signs you out everywhere, including here, so you'll sign in again with the new one.
          </p>

          <form onSubmit={handleUpdatePassword} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Current Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Enter your current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 pr-10 text-xs text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">New Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="Enter your new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
              />
            </div>

            {/* Password strength criteria (video 01:10) */}
            <div className="p-3 bg-slate-50 rounded-lg space-y-1 text-[11px] text-slate-500">
              <p className={newPassword.length >= 8 ? 'text-emerald-600 font-semibold' : ''}>
                ✕ At least 8 characters
              </p>
              <p className={/\d/.test(newPassword) ? 'text-emerald-600 font-semibold' : ''}>
                ✕ At least one number
              </p>
              <p className={/[!@#$%^&*]/.test(newPassword) ? 'text-emerald-600 font-semibold' : ''}>
                ✕ At least one symbol
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Confirm New Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="Re-enter your new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-900 focus:bg-white focus:border-orange-500 outline-none"
              />
            </div>

            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg shadow-sm transition-all"
            >
              Update Password
            </button>
          </form>
        </div>
      )}

      {/* Tab Content: Sessions (video 01:14 - 01:21) */}
      {activeTab === 'Sessions' && (
        <div className="space-y-6">
          {/* Two-factor authentication (video 01:14 - 01:16) */}
          <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-xs flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Two-factor authentication</h3>
              <p className="text-xs font-medium text-slate-800 mt-1">Require a code at login</p>
              <p className="text-[11px] text-slate-400 mt-0.5">We'll email you a six-digit code each time you sign in.</p>
            </div>

            <button
              onClick={() => {
                setTwoFactorEnabled(!twoFactorEnabled);
                addToast({
                  type: 'info',
                  title: '2FA Updated',
                  description: twoFactorEnabled ? 'Two-factor auth disabled.' : 'Two-factor auth enabled.',
                });
              }}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                twoFactorEnabled ? 'bg-[#EA580C]' : 'bg-slate-200'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  twoFactorEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Active Sessions (video 01:15, 01:20) */}
          <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-xs space-y-4">
            <h3 className="font-bold text-base text-slate-900 pb-3 border-b border-slate-100">Active Sessions</h3>

            <div className="space-y-3">
              {/* Session 1 (Current) */}
              <div className="p-3.5 bg-slate-50/70 rounded-xl flex items-center justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <p className="text-xs font-bold text-slate-900">Chrome on ChromeOS</p>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200 text-slate-700">
                      This Device
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">IP 100.64.0.14 • Active now</p>
                </div>
                <span className="text-xs font-semibold text-emerald-600">Current</span>
              </div>

              {/* Session 2 */}
              <div className="p-3.5 bg-white border border-slate-100 rounded-xl flex items-center justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <p className="text-xs font-bold text-slate-900">Chrome on Windows</p>
                    <span className="text-[10px] text-slate-400">Remembered</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">IP 100.64.0.2 • 1 day ago</p>
                </div>
                <button className="px-3 py-1 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md">
                  Sign out
                </button>
              </div>

              {/* Session 3 */}
              <div className="p-3.5 bg-white border border-slate-100 rounded-xl flex items-center justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <p className="text-xs font-bold text-slate-900">Edge on Windows</p>
                    <span className="text-[10px] text-slate-400">Remembered</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">IP 100.64.0.3 • 4 days ago</p>
                </div>
                <button className="px-3 py-1 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md">
                  Sign out
                </button>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100">
              <button
                onClick={() => {
                  addToast({
                    type: 'info',
                    title: 'Sessions Terminated',
                    description: 'All other devices have been signed out.',
                  });
                }}
                className="text-xs font-semibold text-slate-700 hover:text-slate-900 hover:underline"
              >
                Sign out all other sessions
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
