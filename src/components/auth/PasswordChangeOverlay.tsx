import React, { useState } from 'react';
import { Shield, Eye, EyeOff, LogOut, GraduationCap } from 'lucide-react';
import { useFirebase } from '../../context/FirebaseContext';

interface PasswordChangeOverlayProps {
  userName: string;
  userType: 'Admin' | 'Tutor';
  userId: string;
  onSuccess: () => Promise<void>;
  onLogout: () => Promise<void>;
}

export const PasswordChangeOverlay: React.FC<PasswordChangeOverlayProps> = ({ 
  userName, 
  userType, 
  onSuccess, 
  onLogout 
}) => {
  const { updatePassword } = useFirebase();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const validatePassword = (pass: string) => {
    const hasUpper = /[A-Z]/.test(pass);
    const hasLower = /[a-z]/.test(pass);
    const hasDigit = /\d/.test(pass);
    const hasSymbol = /[!@#$%^&*(),.?":{}|<>]/.test(pass);
    const isLongEnough = pass.length >= 8;

    if (!isLongEnough) return 'Password must be at least 8 characters long.';
    if (!hasUpper) return 'Include at least one uppercase letter.';
    if (!hasLower) return 'Include at least one lowercase letter.';
    if (!hasDigit) return 'Include at least one digit.';
    if (!hasSymbol) return 'Include at least one special character.';
    return null;
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match!");
      return;
    }
    
    const error = validatePassword(newPassword);
    if (error) {
      setPasswordError(error);
      return;
    }

    setIsChangingPassword(true);
    try {
      await updatePassword(newPassword);
      await onSuccess();
    } catch (err: any) {
      setPasswordError(err.message || "Failed to update account. Ensure you are signed in.");
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/98 backdrop-blur-2xl overflow-y-auto selection:bg-orange-500 selection:text-white">
      <div className="min-h-full w-full flex flex-col items-center justify-center py-12 px-4">
        <div className="w-full max-w-md bg-white rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-500 relative">
          <div className="bg-[#EA580C] p-8 text-white text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-white/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 -ml-8 -mb-8 w-32 h-32 bg-orange-400/20 rounded-full blur-2xl" />
            
            <div className="relative z-10">
              <div className="w-16 h-16 bg-white/20 rounded-2xl backdrop-blur-md flex items-center justify-center mx-auto mb-4 border border-white/30">
                <GraduationCap className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-black mb-2">Welcome, {userName}!</h3>
              <p className="text-orange-50 text-sm opacity-90 leading-relaxed">
                To secure your {userType.toLowerCase()} account and access the portal, please set your permanent password.
              </p>
            </div>
          </div>

          <form onSubmit={handlePasswordChange} className="p-8 space-y-5">
            {passwordError && (
              <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-start space-x-3 text-rose-600 animate-in slide-in-from-top-2">
                <Shield className="w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-xs font-bold leading-tight">{passwordError}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
                New Permanent Password
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  autoFocus
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-4 pr-12 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-orange-500/10 focus:border-[#EA580C] transition-all outline-none text-slate-900 font-bold placeholder:text-slate-400"
                  placeholder="Min 8 chars, A-z, 0-9, symbol"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-4 pr-12 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-orange-500/10 focus:border-[#EA580C] transition-all outline-none text-slate-900 font-bold placeholder:text-slate-400"
                  placeholder="Repeat new password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isChangingPassword}
                className="w-full py-4 bg-[#EA580C] hover:bg-[#C2410C] text-white rounded-2xl font-black shadow-lg shadow-orange-200/50 transition-all active:scale-95 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isChangingPassword ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Activate My Account</span>
                    <div className="w-2 h-2 rounded-full bg-white/30 animate-pulse" />
                  </>
                )}
              </button>
            </div>

            <div className="pt-4 border-t border-slate-100 text-center">
              <button
                type="button"
                onClick={onLogout}
                className="flex items-center space-x-2 text-slate-400 hover:text-slate-600 transition-colors mx-auto"
              >
                <LogOut className="w-3.5 h-3.5 rotate-180" />
                <span className="text-[10px] font-black uppercase tracking-widest">Back to Login / Sign Out</span>
              </button>
            </div>

            <p className="text-[10px] text-center text-slate-400 leading-relaxed px-4 font-medium">
              By activating your account, you agree to our terms of service and internal academic guidelines.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};
