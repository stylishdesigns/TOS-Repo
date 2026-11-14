import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  User,
  Lock,
  Smartphone,
  LogOut,
  Edit2,
  CheckCircle2,
  Shield,
  Eye,
  EyeOff,
} from 'lucide-react';

export const AccountView: React.FC = () => {
  const { activeUser, addToast } = useApp();

  const [activeTab, setActiveTab] = useState<'Profile' | 'Password' | 'Sessions'>('Profile');

  // Profile Form State
  const [firstName, setFirstName] = useState('Platform');
  const [lastName, setLastName] = useState('Admin');
  const [email, setEmail] = useState(activeUser?.email || ''); // No hardcoded demo email
  const [phone, setPhone] = useState('08056765455');
  const [jobTitle, setJobTitle] = useState('Platform Owner');
  const [department, setDepartment] = useState('Technology');

  // Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Sessions State matching video 01:14 - 01:16
  const [twoFactor, setTwoFactor] = useState(false);

  return (
    <div id="account-settings-page" className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header matching video 01:06 */}
      <div>
        <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">My Account</h2>
        <p className="text-xs md:text-sm text-slate-500 mt-1">
          Manage your account settings and preferences
        </p>
      </div>

      {/* Profile Overview Card matching video 01:06 - 01:07 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-14 h-14 rounded-2xl bg-purple-100 text-purple-700 font-bold text-lg flex items-center justify-center shrink-0 border border-purple-200">
            PA
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-bold text-slate-900 text-lg">Platform Admin</h3>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />
                <span>Super Administrator</span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
              <span>{email}</span>
              <span>•</span>
              <span>08056765455</span>
              <span>•</span>
              <span>Administrator since Aug 2026</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => addToast({ type: 'info', title: 'Sign Out', description: 'Session ended successfully.' })}
          className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-all flex items-center space-x-1.5 shadow-2xs self-start sm:self-center shrink-0"
        >
          <LogOut className="w-4 h-4 text-slate-500" />
          <span>Sign out</span>
        </button>
      </div>

      {/* Tabs matching video 01:07 - 01:13 */}
      <div className="flex items-center space-x-2 border-b border-slate-200/80 pb-3">
        {(['Profile', 'Password', 'Sessions'] as const).map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-xl text-xs md:text-sm font-semibold transition-all ${
                isActive
                  ? 'bg-[#EE7026] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {tab}
            </button>
          );
        })}
      </div>

      {/* TAB 1: PROFILE (video 01:05 - 01:07) */}
      {activeTab === 'Profile' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">Profile Details</h3>
              <button
                onClick={() => addToast({ type: 'success', title: 'Saved', description: 'Profile details updated.' })}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-xl flex items-center space-x-1.5"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit Profile</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">First Name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs md:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-[#EE7026]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Last Name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs md:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-[#EE7026]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Email Address</label>
                <input
                  type="email"
                  value={email}
                  disabled
                  className="w-full px-3.5 py-2 text-xs md:text-sm bg-slate-100 border border-slate-200 rounded-xl text-slate-500 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Phone</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs md:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-[#EE7026]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Job Title</label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs md:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-[#EE7026]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Department</label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs md:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-[#EE7026]"
                />
              </div>
            </div>
          </div>

          {/* Access Level Card matching video 02:07 - 02:08 */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-3">
            <h3 className="font-bold text-slate-900 text-base">Access Level</h3>
            <p className="text-xs text-slate-700 leading-relaxed">
              <span className="font-bold text-purple-700">• Super Administrator</span> — full control. You can add and remove other administrators, approve schools, configure the campaign, rubric and security, and change every setting. This is the highest access level.
            </p>
            <p className="text-[11px] text-slate-400">
              Only a Super Administrator can change your role.
            </p>
          </div>
        </div>
      )}

      {/* TAB 2: PASSWORD (video 01:09 - 01:10) */}
      {activeTab === 'Password' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-6 max-w-2xl">
          <div>
            <h3 className="font-bold text-slate-900 text-base">Change Password</h3>
            <p className="text-xs text-slate-400 mt-1">
              You'll need your current password. Changing it signs you out everywhere, including here, so you'll sign in again with the new one.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Current Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3.5 py-2 pr-10 text-xs md:text-sm bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-[#EE7026]"
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">New Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3.5 py-2 pr-10 text-xs md:text-sm bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-[#EE7026]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="mt-2 space-y-1 text-xs text-slate-500">
                <p>✕ At least 8 characters</p>
                <p>✕ At least one number</p>
                <p>✕ At least one symbol</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Confirm New Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Re-enter your new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3.5 py-2 pr-10 text-xs md:text-sm bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-[#EE7026]"
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

            <button
              onClick={() => addToast({ type: 'success', title: 'Password Updated', description: 'Your password has been changed.' })}
              className="px-4 py-2 text-xs md:text-sm font-semibold text-white bg-[#EE7026] hover:bg-[#D9601A] rounded-xl shadow-xs transition-all"
            >
              Update Password
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: SESSIONS (video 01:14 - 01:16) */}
      {activeTab === 'Sessions' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
            <h3 className="font-bold text-slate-900 text-base">Two-factor authentication</h3>
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-xs font-semibold text-slate-800">Require a code at login</p>
                <p className="text-[11px] text-slate-400">We'll email you a six-digit code each time you sign in.</p>
              </div>
              <button
                onClick={() => setTwoFactor(!twoFactor)}
                className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                  twoFactor ? 'bg-[#EE7026]' : 'bg-slate-200'
                }`}
              >
                <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${twoFactor ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
            <h3 className="font-bold text-slate-900 text-base">Active Sessions</h3>
            <div className="divide-y divide-slate-100">
              <div className="py-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-800">
                    Chrome on ChromeOS <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded ml-2">This Device</span>
                  </p>
                  <p className="text-[11px] text-slate-400 font-mono">IP 100.64.0.14 • Active now</p>
                </div>
                <span className="text-xs font-semibold text-emerald-600">Current</span>
              </div>

              <div className="py-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-800">
                    Chrome on Windows <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded ml-2">Remembered</span>
                  </p>
                  <p className="text-[11px] text-slate-400 font-mono">IP 100.64.0.2 • 1 day ago</p>
                </div>
                <button className="text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 px-3 py-1 rounded-lg">
                  Sign out
                </button>
              </div>

              <div className="py-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-800">
                    Edge on Windows <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded ml-2">Remembered</span>
                  </p>
                  <p className="text-[11px] text-slate-400 font-mono">IP 100.64.0.3 • 4 days ago</p>
                </div>
                <button className="text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 px-3 py-1 rounded-lg">
                  Sign out
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button className="text-xs font-semibold text-slate-700 hover:underline">
                Sign out all other sessions
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
