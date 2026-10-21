import React, { useState } from 'react';
import { useFirebase } from '../../context/FirebaseContext';
import { useApp } from '../../context/AppContext';
import { db } from '../../firebase';
import { doc, getDoc, updateDoc, query, collection, where, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { 
  GraduationCap, 
  Mail, 
  Lock, 
  ArrowRight, 
  Loader2, 
  AlertCircle,
  Eye,
  EyeOff,
  CheckCircle2
} from 'lucide-react';

// Google Icon Component
const GoogleIcon = () => (
  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

interface AuthPortalProps {
  portalType: 'admin' | 'tutor' | 'student';
  title: string;
  subtitle: string;
  onSuccess: () => void;
  onBack?: () => void;
}

export const AuthPortal: React.FC<AuthPortalProps> = ({ 
  portalType, 
  title, 
  subtitle,
  onSuccess,
  onBack
}) => {
  const { loginWithEmail, loginWithGoogle, signUpWithEmail, resetPassword, updatePassword, logout } = useFirebase();
  const { addToast, activeCentreId } = useApp();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');

  // New Password Flow
  const [needsPasswordChange, setNeedsPasswordChange] = useState(false);
  const [passwordChangeStep, setPasswordChangeStep] = useState<'verify' | 'new'>('verify');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [userDocInfo, setUserDocInfo] = useState<{ id: string, collection: string } | null>(null);

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
    if (!hasSymbol) return 'Include at least one special character (!@#$%^&* etc.).';
    return null;
  };

  const portalStyles = {
    admin: {
      accent: 'bg-slate-900 hover:bg-slate-800',
      text: 'text-slate-900',
      bg: 'bg-slate-50',
      border: 'border-slate-100',
      icon: <Lock className="w-6 h-6 text-white" />
    },
    tutor: {
      accent: 'bg-[#f97316] hover:bg-[#ea580c]',
      text: 'text-[#f97316]',
      bg: 'bg-orange-50',
      border: 'border-orange-100',
      icon: <Lock className="w-6 h-6 text-white" />
    },
    student: {
      accent: 'bg-[#f97316] hover:bg-[#ea580c]',
      text: 'text-[#f97316]',
      bg: 'bg-orange-50',
      border: 'border-orange-100',
      icon: <GraduationCap className="w-6 h-6 text-white" />,
      pageBg: 'bg-[#f97316]'
    }
  };

  const style = portalStyles[portalType];
  const isStudent = portalType === 'student';
  const pageBackground = isStudent ? style.pageBg : 'bg-slate-900';

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    const cleanEmail = email.trim().toLowerCase();
    try {
      const userCredential = await loginWithEmail(cleanEmail, password);
      const uid = (userCredential as any)?.user?.uid;
      const userEmail = (userCredential as any)?.user?.email;
      
      let passwordChangeNeeded = false;

      if (uid && userEmail) {
        // Helper to find and verify user doc with JIT migration
        const findUserDoc = async (collName: string) => {
          try {
            // 1. Try by UID first (Correct approach)
            let snap = await getDoc(doc(db, collName, uid));
            if (snap.exists()) return { id: uid, data: snap.data() };

            // 2. Try by Email if UID not found (Legacy ID migration)
            const q = query(collection(db, collName), where('email', '==', userEmail));
            const querySnap = await getDocs(q);
            
            if (!querySnap.empty) {
              const legacyDoc = querySnap.docs[0];
              const legacyData = legacyDoc.data();
              const legacyId = legacyDoc.id;

              // If the ID is not the UID, perform JIT migration
              if (legacyId !== uid) {
                console.log(`JIT Migration: Moving ${collName} doc ${legacyId} to new UID ${uid}`);
                
                // Copy to new document with UID as key
                await setDoc(doc(db, collName, uid), { 
                  ...legacyData, 
                  id: uid 
                });
                
                // Delete the old legacy document
                await deleteDoc(doc(db, collName, legacyId));

                // Robust Migration: Update references in other collections
                if (collName === 'tutors') {
                  try {
                    const qTT = query(collection(db, 'timetable'), where('tutorId', '==', legacyId));
                    const ttSnap = await getDocs(qTT);
                    const updates = ttSnap.docs.map(ttDoc => 
                      updateDoc(doc(db, 'timetable', ttDoc.id), { tutorId: uid })
                    );
                    await Promise.all(updates);
                    if (ttSnap.size > 0) {
                      console.log(`Successfully migrated ${ttSnap.size} timetable slots for tutor ${uid}`);
                    }
                  } catch (ttErr) {
                    console.error('Failed to migrate timetable references:', ttErr);
                  }
                }

                // For now, we return the new UID and data
                return { id: uid, data: legacyData };
              }
              
              return { id: legacyId, data: legacyData };
            }
          } catch (e) {
            console.error(`Error finding user in ${collName}:`, e);
          }
          return null;
        };

        // Check Tutors
        const tutorInfo = await findUserDoc('tutors');
        if (tutorInfo) {
          if (!tutorInfo.data.hasChangedPassword) {
            setUserDocInfo({ id: tutorInfo.id, collection: 'tutors' });
            setCurrentPassword(''); // Clear to force user to re-enter
            setNeedsPasswordChange(true);
            setPasswordChangeStep('verify');
            passwordChangeNeeded = true;
          }
        } else {
          // Check Admins
          const adminInfo = await findUserDoc('admins');
          if (adminInfo) {
            if (!adminInfo.data.hasChangedPassword) {
              setUserDocInfo({ id: adminInfo.id, collection: 'admins' });
              setCurrentPassword(''); // Clear to force user to re-enter
              setNeedsPasswordChange(true);
              setPasswordChangeStep('verify');
              passwordChangeNeeded = true;
            }
          }
        }
      }

      if (passwordChangeNeeded) {
        setIsLoading(false);
        return;
      }

      // Determine dynamic role for toast message
      let displayRole = portalType.charAt(0).toUpperCase() + portalType.slice(1);
      try {
        if (uid) {
          const adminDoc = await getDoc(doc(db, 'admins', uid));
          if (adminDoc.exists()) {
            displayRole = adminDoc.data().role || 'Administrator';
          } else {
            const tutorDoc = await getDoc(doc(db, 'tutors', uid));
            if (tutorDoc.exists()) {
              displayRole = 'Tutor';
            } else {
              const studentDoc = await getDoc(doc(db, 'students', uid));
              if (studentDoc.exists()) {
                displayRole = 'Student';
              }
            }
          }
        }
      } catch (e) {
        console.warn("Failed to fetch specific role for toast, using default portal type.");
      }

      addToast({
        type: 'success',
        title: `Welcome Back, ${displayRole}!`,
        description: `We're glad to have you back at Excellence Tutorials.`
      });
      onSuccess();
    } catch (err: any) {
      console.error("Login handle error:", err);
      // Refined error handling for login details
      const errorMessage = err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password'
        ? 'The email or password you entered is incorrect. Please try again.'
        : (err.message || 'Login failed. Please check your credentials.');
      
      setError(errorMessage);
      setIsLoading(false);
    } finally {
      // Use a small delay to ensure React state updates have registered if we're not staying in loading mode
      setTimeout(() => setIsLoading(false), 100);
    }
  };

  const handleStudentSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const passError = validatePassword(password);
    if (passError) {
      setError(passError);
      setIsLoading(false);
      return;
    }

    try {
      const userCredential = await signUpWithEmail(email, password);
      const uid = (userCredential as any)?.user?.uid;
      
      // Create a skeleton student record in Firestore
      if (uid) {
        const newStudent: any = {
          id: uid,
          name: email.split('@')[0],
          email: email,
          studentId: `STU-${Math.floor(1000 + Math.random() * 9000)}`,
          status: 'Active',
          paidAmount: 0,
          totalFee: 0,
          outstandingBalance: 0,
          attendance: 100,
          dateJoined: new Date().toISOString().split('T')[0],
          programmeName: 'General Student',
          courses: []
        };
        await setDoc(doc(db, 'students', uid), { ...newStudent, ...(activeCentreId ? { centreId: activeCentreId } : {}) });
      }

      addToast({
        type: 'success',
        title: 'Account Created',
        description: 'Your student portal account is ready. Please log in.'
      });
      setAuthMode('login');
    } catch (err: any) {
      setError(err.message || 'Failed to create account.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (passwordChangeStep === 'verify') {
      // Logic to verify current password
      // Since we just logged in with 'password' (state variable from login form), 
      // we check against that.
      if (currentPassword !== password) {
        setError('The password entered does not match your current login password.');
        return;
      }
      setPasswordChangeStep('new');
      setError(null);
      setCurrentPassword(currentPassword); // Keep it verified
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    
    if (newPassword === currentPassword) {
      setError('New password cannot be the same as the temporary password.');
      return;
    }
    
    const passError = validatePassword(newPassword);
    if (passError) {
      setError(passError);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await updatePassword(newPassword);
      if (userDocInfo) {
        const updateData: any = {
          hasChangedPassword: true,
          temporaryPassword: null,
          status: 'Active' // Always set to Active upon activation
        };
        
        await updateDoc(doc(db, userDocInfo.collection, userDocInfo.id), updateData);
      }
      addToast({
        type: 'success',
        title: 'Account Activated',
        description: 'Your permanent password has been set. Welcome!'
      });
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to update password.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    setIsLoading(true);
    try {
      await logout();
      setNeedsPasswordChange(false);
      setPasswordChangeStep('verify');
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to sign out.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      setError('Please enter your email address to reset your password.');
      return;
    }
    setIsLoading(true);
    try {
      await resetPassword(email);
      setResetSent(true);
      addToast({
        type: 'info',
        title: 'Reset Email Sent',
        description: 'Please check your inbox for instructions.'
      });
    } catch (err: any) {
      setError(err.message || 'Could not send reset email.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const userCredential = await loginWithGoogle();
      const user = (userCredential as any)?.user;
      const uid = user?.uid;
      const userEmail = user?.email;
      
      if (!uid) throw new Error("Authentication failed: No UID returned");

      // Check if user already exists in any collection
      const adminDoc = await getDoc(doc(db, 'admins', uid));
      const tutorDoc = await getDoc(doc(db, 'tutors', uid));
      const studentDoc = await getDoc(doc(db, 'students', uid));

      let displayRole = 'Student';

      if (adminDoc.exists()) {
        displayRole = adminDoc.data().role || 'Administrator';
      } else if (tutorDoc.exists()) {
        displayRole = 'Tutor';
      } else if (studentDoc.exists()) {
        displayRole = 'Student';
      } else if (portalType === 'student') {
        // Create new student record if they don't exist and are in student portal
        const newStudent: any = {
          id: uid,
          name: user.displayName || userEmail?.split('@')[0] || 'Student',
          email: userEmail,
          studentId: `STU-${Math.floor(1000 + Math.random() * 9000)}`,
          status: 'Active',
          paidAmount: 0,
          totalFee: 0,
          outstandingBalance: 0,
          attendance: 100,
          dateJoined: new Date().toISOString().split('T')[0],
          programmeName: 'General Student',
          courses: []
        };
        await setDoc(doc(db, 'students', uid), { ...newStudent, ...(activeCentreId ? { centreId: activeCentreId } : {}) });
        displayRole = 'Student';
      } else {
        // If in admin/tutor portal and user doesn't exist, this might be an error or they need to be invited
        // But for now, let's just allow them in if they are authenticated, or maybe block?
        // The prompt says "google auth should also be for signing up" specifically for students
        throw new Error("No account found for this user. Please contact an administrator.");
      }

      addToast({
        type: 'success',
        title: `Welcome, ${displayRole}!`,
        description: `You're now signed in to Excellence Tutorials.`
      });
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Google Sign-In failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const fillDemoCredentials = () => {
    const demoCreds = {
      admin: { e: 'admin@excellencetutorials.ng', p: 'Admin@123' },
      tutor: { e: 'tutor@excellencetutorials.ng', p: 'Tutor@123' },
      student: { e: 'student@excellencetutorials.ng', p: 'Student@123' }
    };
    const cred = (demoCreds as any)[portalType];
    setEmail(cred.e);
    setPassword(cred.p);
  };

  return (
    <div className={`min-h-screen ${pageBackground} overflow-y-auto overflow-x-hidden selection:bg-orange-500 selection:text-white`}>
      <div className="min-h-full w-full flex flex-col items-center justify-center py-8 md:py-20 px-4">
        <div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl shadow-black/50 border border-white/10 overflow-hidden animate-in fade-in zoom-in-95 duration-500 relative">
          <div className={`p-8 ${style.bg} border-b ${style.border} text-center relative`}>
          <div className={`w-12 h-12 rounded-xl ${style.accent} flex items-center justify-center mx-auto mb-4 shadow-lg shadow-black/5`}>
            {style.icon}
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <p className="text-slate-500 text-sm mt-1">{subtitle}</p>
        </div>

        <div className="p-8">
          {error && (
              <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start space-x-3 text-rose-600 animate-in slide-in-from-top-2">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-sm font-bold">{error}</p>
              </div>
          )}

          {resetSent ? (
            <div className="text-center py-4 space-y-4">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Reset Link Sent</h3>
              <p className="text-sm text-slate-500">
                We've sent a password reset link to <span className="font-bold">{email}</span>.
              </p>
              <button
                onClick={() => setResetSent(false)}
                className="text-sm font-bold text-[#EA580C] hover:underline"
              >
                Back to Login
              </button>
            </div>
          ) : needsPasswordChange ? (
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-blue-700 text-[10px] font-black uppercase tracking-widest mb-4">
                Mandatory Security Update Required
              </div>
              
              {passwordChangeStep === 'verify' ? (
                <div className="space-y-1.5 animate-in slide-in-from-right-4 duration-300">
                  <label className="text-[10px] font-black text-slate-700 uppercase tracking-[0.2em] px-1">
                    Enter Current (Temporary) Password
                  </label>
                  <div className="relative group">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showCurrentPassword ? 'text' : 'password'}
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password to continue"
                      className="w-full pl-10 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-4 focus:ring-slate-100 focus:border-slate-900 outline-none transition-all font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[9px] text-slate-400 font-medium px-1 mt-2 uppercase tracking-wider">
                    * Verifying identity before password change
                  </p>
                </div>
              ) : (
                <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-700 uppercase tracking-[0.2em] px-1">
                      New Permanent Password
                    </label>
                    <div className="relative group">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Min 8 chars, A-z, 0-9, symbol"
                        className="w-full pl-10 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-4 focus:ring-slate-100 focus:border-slate-900 outline-none transition-all font-medium"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-700 uppercase tracking-[0.2em] px-1">
                      Confirm New Password
                    </label>
                    <div className="relative group">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repeat new password"
                        className="w-full pl-10 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-4 focus:ring-slate-100 focus:border-slate-900 outline-none transition-all font-medium"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-500 font-bold px-1 py-2 opacity-60">
                    <p className="uppercase tracking-widest mb-1 font-black text-slate-400">Security Requirements:</p>
                    <ul className="grid grid-cols-2 gap-x-2 list-disc list-inside">
                      <li>8+ Characters</li>
                      <li>Uppercase</li>
                      <li>Lowercase</li>
                      <li>Special Symbol</li>
                    </ul>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className={`w-full py-4 rounded-xl text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-xl flex items-center justify-center space-x-2 transition-all ${style.accent} hover:shadow-2xl active:scale-[0.98] disabled:opacity-50 mt-4`}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>{passwordChangeStep === 'verify' ? 'Verify & Proceed' : 'Activate My Account'}</span>
                    <ArrowRight className="w-4 h-4 text-white/50" />
                  </>
                )}
              </button>

              {passwordChangeStep === 'new' && (
                <button
                  type="button"
                  onClick={() => {
                    setPasswordChangeStep('verify');
                    setError(null);
                  }}
                  className="w-full text-[9px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest transition-colors py-2"
                >
                  Go Back
                </button>
              )}

              <button
                type="button"
                onClick={handleLogout}
                className="w-full text-[10px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest transition-colors py-2 mt-4 border-t border-slate-100 pt-4"
              >
                Sign Out & Start Over
              </button>
            </form>
          ) : (
            <div className="space-y-6">
              {portalType === 'student' && !isResetting && (
                <div className="flex p-1 bg-slate-100 rounded-2xl mb-2">
                  <button
                    type="button"
                    onClick={() => setAuthMode('login')}
                    className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${authMode === 'login' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMode('signup')}
                    className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${authMode === 'signup' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    Sign Up
                  </button>
                </div>
              )}

              <form onSubmit={authMode === 'login' ? handleEmailLogin : handleStudentSignup} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-700 uppercase tracking-[0.2em] px-1">
                    Email Address
                  </label>
                  <div className="relative group">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-slate-600 transition-colors" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. name@excellencetutorials.ng"
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-4 focus:ring-slate-100 focus:border-slate-900 outline-none transition-all font-medium"
                    />
                  </div>
                </div>

                {!isResetting && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between px-1">
                      <label className="text-[10px] font-black text-slate-700 uppercase tracking-[0.2em]">
                        {authMode === 'login' ? 'Password' : 'Choose Password'}
                      </label>
                      {authMode === 'login' && (
                        <button
                          type="button"
                          onClick={() => setIsResetting(true)}
                          className="text-[9px] font-black text-slate-400 hover:text-[#EA580C] uppercase tracking-widest transition-colors"
                        >
                          Forgot?
                        </button>
                      )}
                    </div>
                    <div className="relative group">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-slate-600 transition-colors" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-10 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:ring-4 focus:ring-slate-100 focus:border-slate-900 outline-none transition-all font-medium"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type={isResetting ? 'button' : 'submit'}
                  onClick={isResetting ? handleResetPassword : undefined}
                  disabled={isLoading}
                  className={`w-full py-4 rounded-xl text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-xl flex items-center justify-center space-x-2 transition-all ${style.accent} hover:shadow-2xl active:scale-[0.98] disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none mt-2`}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <span>{isResetting ? 'Send Reset Link' : (authMode === 'signup' ? 'Create My Account' : 'Sign In')}</span>
                      {!isResetting && <ArrowRight className="w-4 h-4 text-white/50" />}
                    </>
                  )}
                </button>

                {isStudent && !isResetting && (
                  <div className="relative my-8">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-100"></div>
                    </div>
                    <div className="relative flex justify-center text-[10px] uppercase font-black tracking-widest">
                      <span className="px-4 bg-white text-slate-400">Or continue with</span>
                    </div>
                  </div>
                )}

                {isStudent && !isResetting && (
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={isLoading}
                    className="w-full py-4 border border-slate-200 rounded-xl text-slate-700 font-bold text-sm flex items-center justify-center hover:bg-slate-50 transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    <GoogleIcon />
                    {authMode === 'login' ? 'Sign in' : 'Sign up'} with Google
                  </button>
                )}

                {onBack && !isResetting && (
                  <button
                    type="button"
                    onClick={onBack}
                    className="w-full mt-4 flex items-center justify-center space-x-2 py-3 border border-dashed border-slate-200 rounded-xl text-slate-400 hover:text-slate-600 hover:border-slate-300 transition-all text-[10px] font-black uppercase tracking-widest"
                  >
                    <ArrowRight className="w-4 h-4 rotate-180 opacity-50" />
                    <span>Back to landing page</span>
                  </button>
                )}

                {isResetting && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsResetting(false);
                      setError(null);
                    }}
                    className="w-full text-[10px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest transition-colors py-2"
                  >
                    Back to login
                  </button>
                )}
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
);
};
