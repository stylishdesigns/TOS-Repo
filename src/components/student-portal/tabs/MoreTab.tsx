import React, { useMemo, useState } from 'react';
import { useApp } from '../../../context/AppContext';
import { Student } from '../../../types';
import regeneratedStudentAvatar from '../../../assets/images/regenerated_image_1789369642757.jpg';
import { ModernSelect } from '../../ui/ModernSelect';
import {
  User,
  GraduationCap,
  CreditCard,
  Receipt,
  Lock,
  KeyRound,
  Fingerprint,
  Palette,
  HelpCircle,
  FileText,
  LogOut,
  ChevronRight,
  CheckCircle2,
  Copy,
  Phone,
  Mail,
  MapPin,
  Globe,
  MessageSquare,
  X,
  Sun,
  Moon,
  Laptop,
  ShieldCheck,
  Check,
  AlertCircle,
  Calendar,
  DollarSign,
  Delete,
  Eye,
  EyeOff,
  Building2,
  Banknote,
  BookOpen,
  Upload,
  Image as ImageIcon,
} from 'lucide-react';

interface MoreTabProps {
  student: Student;
}

type ModalType =
  | 'personal_details'
  | 'academic_details'
  | 'id_card'
  | 'tuition_statement'
  | 'change_pin'
  | 'change_password'
  | 'theme_settings'
  | 'help_support'
  | 'exam_policy'
  | 'logout'
  | null;

const MALE_NIGERIAN_STUDENT_AVATAR =
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=500&q=80';

export const MoreTab: React.FC<MoreTabProps> = ({ student }) => {
  const {
    settings,
    payments,
    recordPayment,
    updateStudent,
    addToast,
    setViewMode,
    setAdminSection,
    bgTheme,
    setBgTheme,
    isAdmin,
    logout,
    centreName,
    subjects,
  } = useApp();

  // Active bottom splash-up modal
  const [activeModal, setActiveModal] = useState<ModalType>(null);

  // My subjects: view and edit the student's registered subjects from the centre's own list
  const [showSubjectsEditor, setShowSubjectsEditor] = useState<boolean>(() => {
    try {
      if (sessionStorage.getItem('EXCELLENCE_open_subject_editor') === '1') {
        sessionStorage.removeItem('EXCELLENCE_open_subject_editor');
        return true;
      }
    } catch {}
    return false;
  });
  const [subjectSearch, setSubjectSearch] = useState('');
  const [draftSubjects, setDraftSubjects] = useState<Set<string>>(() => new Set<string>());
  const [savingSubjects, setSavingSubjects] = useState(false);

  // Only this centre's subjects, never another centre's.
  const centreSubjects = subjects.filter(
    (sub) => !student.centreId || !sub.centreId || sub.centreId === student.centreId
  );
  const registeredNames = useMemo(
    () => (student.subjects || []).map((n) => String(n).trim()).filter(Boolean),
    [student]
  );
  const departmentOf = (name: string): string => {
    const found = centreSubjects.find((sub) => sub.name.trim().toLowerCase() === name.trim().toLowerCase());
    return found ? found.department : 'Other';
  };
  const groupOrder = ['General', 'Science', 'Commercial', 'Arts', 'Other'];
  const groupedRegistered = useMemo(() => {
    const acc: Record<string, string[]> = {};
    registeredNames.forEach((name) => {
      const dept = departmentOf(name);
      (acc[dept] = acc[dept] || []).push(name);
    });
    return acc;
  }, [registeredNames, centreSubjects]);
  const filteredCentreSubjects = centreSubjects.filter(
    (sub) => sub.name.toLowerCase().includes(subjectSearch.trim().toLowerCase())
  );

  const openSubjectsEditor = () => {
    setDraftSubjects(new Set(registeredNames));
    setSubjectSearch('');
    setShowSubjectsEditor(true);
  };
  const toggleDraftSubject = (name: string) => {
    setDraftSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };
  const saveSubjects = async () => {
    setSavingSubjects(true);
    try {
      await updateStudent(student.id, {
        subjects: Array.from(draftSubjects as Set<string>).sort((a, b) => a.localeCompare(b)),
      });
      setShowSubjectsEditor(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSavingSubjects(false);
    }
  };

  // Biometric toggle state
  const [biometricEnabled, setBiometricEnabled] = useState(true);

  // Theme selection state ('system' | 'light' | 'dark')
  const [selectedTheme, setSelectedTheme] = useState<'system' | 'light' | 'dark'>('system');

  // Copy indicator state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Personal Details form state
  const [firstName, setFirstName] = useState(student.name.split(' ')[0] || 'John');
  const [lastName, setLastName] = useState(student.name.split(' ').slice(1).join(' ') || 'Ade');
  const [phone, setPhone] = useState(student.phone || '+234 812 345 6789');
  const [email, setEmail] = useState(student.email || '');
  const [gender, setGender] = useState(student.gender || 'Male');
  const [dob, setDob] = useState(student.dob || '2008-04-12');
  const [address, setAddress] = useState(student.address || '12 Admiralty Way, Lekki Phase 1, Lagos');

  // Change PIN keypad state
  const [pin, setPin] = useState<string>('');

  // Password fields state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);

  // Tuition Payment state
  const [payAmount, setPayAmount] = useState<number>(
    student.outstandingBalance > 0 ? student.outstandingBalance : 15000
  );
  const [paymentMode, setPaymentMode] = useState<'Bank Transfer' | 'Card' | 'Cash'>('Bank Transfer');
  const [paymentNote, setPaymentNote] = useState('');
  const [evidenceDataUrl, setEvidenceDataUrl] = useState<string | null>(null);
  const [evidenceFileName, setEvidenceFileName] = useState<string>('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [activePaymentSubView, setActivePaymentSubView] = useState<'statement' | 'make_payment'>('statement');
  const [previewEvidenceUrl, setPreviewEvidenceUrl] = useState<string | null>(null);

  // Filter payments for this candidate
  const studentPayments = payments.filter(
    (p) => p.studentId === student.id || p.studentName === student.name
  );

  // Handle personal details save
  const handleSavePersonalDetails = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedFullName = `${firstName} ${lastName}`.trim();
    updateStudent(student.id, {
      name: updatedFullName,
      phone,
      email,
      gender,
      dob,
      address,
    });
    student.name = updatedFullName;
    student.phone = phone;
    student.email = email;
    student.gender = gender;
    student.dob = dob;
    student.address = address;

    addToast({
      type: 'success',
      title: 'Profile Updated',
      description: 'Candidate personal details have been updated successfully.',
    });
    setActiveModal(null);
  };

  // Handle PIN Keypad press
  const handlePinKey = (digit: string) => {
    if (pin.length < 4) {
      setPin((prev) => prev + digit);
    }
  };

  const handlePinBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  const handleConfirmPin = () => {
    if (pin.length !== 4) {
      addToast({
        type: 'error',
        title: 'Incomplete PIN',
        description: 'Please enter all 4 digits of your security PIN.',
      });
      return;
    }
    addToast({
      type: 'success',
      title: 'PIN Updated',
      description: 'Your 4-digit student portal PIN has been securely updated.',
    });
    setPin('');
    setActiveModal(null);
  };

  // Handle password update
  const handleUpdatePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) {
      addToast({
        type: 'error',
        title: 'Missing Fields',
        description: 'Please fill in both current and new password.',
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      addToast({
        type: 'error',
        title: 'Passwords Do Not Match',
        description: 'New password and confirmation must match.',
      });
      return;
    }
    addToast({
      type: 'success',
      title: 'Password Changed',
      description: 'Your portal login password was successfully changed.',
    });
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setActiveModal(null);
  };

  const handleEvidenceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      addToast({
        type: 'error',
        title: 'File Too Large',
        description: 'Please upload an image receipt under 5MB.',
      });
      return;
    }

    setEvidenceFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      setEvidenceDataUrl(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Handle Tuition Payment
  const handleCompletePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (payAmount <= 0) {
      addToast({
        type: 'error',
        title: 'Invalid Amount',
        description: 'Please enter a valid tuition payment amount.',
      });
      return;
    }

    if (paymentMode !== 'Cash' && !evidenceDataUrl) {
      addToast({
        type: 'error',
        title: 'Payment Evidence Required',
        description: `Please upload your payment receipt or transfer screenshot evidence to proceed with ${paymentMode}.`,
      });
      return;
    }

    setIsSubmittingPayment(true);
    try {
      const result = await recordPayment({
        studentId: student.id,
        amountPaid: payAmount,
        method: paymentMode,
        evidenceUrl: evidenceDataUrl || undefined,
        evidenceName: evidenceFileName || undefined,
        note: paymentNote.trim() || undefined,
      });
      if (!result) return; // The payment helper already explained the failure.

      addToast({
        type: 'success',
        title: 'Payment Submitted',
        description: `Your payment of ${settings.currencySymbol}${(payAmount || 0).toLocaleString()} via ${paymentMode} has been recorded. Receipt ${result.receiptNumber}.`,
      });

      setEvidenceDataUrl(null);
      setEvidenceFileName('');
      setPaymentNote('');
      setActivePaymentSubView('statement');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // Copy helper
  const handleCopy = (text: string, key: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    addToast({
      type: 'success',
      title: 'Copied to Clipboard',
      description: `${text} copied.`,
    });
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  // Resolved avatar ensuring an authentic Nigerian student portrait
  const MALE_NIGERIAN_STUDENT_AVATAR =
    regeneratedStudentAvatar ||
    'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=500&q=80';
  const FEMALE_NIGERIAN_STUDENT_AVATAR =
    'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?auto=format&fit=crop&w=500&q=80';

  const studentAvatar =
    MALE_NIGERIAN_STUDENT_AVATAR ||
    (student.avatar &&
    !student.avatar.includes('photo-1534528741775') &&
    !student.avatar.includes('photo-1517841905240')
      ? student.avatar
      : student.gender === 'Female'
      ? FEMALE_NIGERIAN_STUDENT_AVATAR
      : MALE_NIGERIAN_STUDENT_AVATAR);

  return (
    <div className="min-h-full bg-slate-50/70 pb-16 px-4 pt-6 max-w-lg mx-auto">
      {/* 1. Centered Profile Header (Exact Layout from reference video) */}
      <div className="flex flex-col items-center justify-center text-center">
        <div className="relative">
          <img
            src={studentAvatar}
            alt={student.name}
            className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-md ring-2 ring-orange-500/20"
          />
          <span className="absolute bottom-1 right-1 w-5 h-5 bg-emerald-500 border-2 border-white rounded-full flex items-center justify-center shadow-xs">
            <span className="w-2 h-2 bg-white rounded-full" />
          </span>
        </div>

        <h2 className="text-xl font-bold text-slate-900 mt-3.5 tracking-tight">
          {student.name}
        </h2>
      </div>

      {/* 1b. SECTION: My Subjects */}
      <div className="mt-7">
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1 mb-2">
          My Subjects
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <button
            type="button"
            onClick={openSubjectsEditor}
            className="w-full flex items-center justify-between p-3.5 hover:bg-slate-50/80 active:bg-slate-100/80 transition-colors text-left group"
          >
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <BookOpen className="w-4.5 h-4.5" />
              </div>
              <div>
                <span className="text-sm font-semibold text-slate-800 block">Registered subjects</span>
                <span className="text-[11px] text-slate-400 font-medium">
                  {registeredNames.length === 0 ? 'None yet' : `${registeredNames.length} registered`}
                </span>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
          </button>

          {showSubjectsEditor && (
            <div className="px-3.5 pb-3.5 pt-3 border-t border-slate-100 space-y-3">
              {registeredNames.length === 0 ? (
                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  You have no registered subjects yet. Choose from your centre's list below.
                </p>
              ) : (
                <div className="space-y-2">
                  {groupOrder.map((dept) =>
                    groupedRegistered[dept] ? (
                      <div key={dept}>
                        <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">{dept}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {groupedRegistered[dept].map((n) => (
                            <span key={n} className="px-2 py-1 rounded-full bg-slate-100 text-[11px] font-semibold text-slate-700">{n}</span>
                          ))}
                        </div>
                      </div>
                    ) : null
                  )}
                </div>
              )}

              {centreSubjects.length === 0 ? (
                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  Your centre hasn't set up its subject list yet. Please ask your centre to add subjects.
                </p>
              ) : (
                <>
                  <input
                    value={subjectSearch}
                    onChange={(e) => setSubjectSearch(e.target.value)}
                    placeholder="Search your centre's subjects"
                    className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#EA580C]/30"
                  />
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-100 divide-y divide-slate-100">
                    {filteredCentreSubjects.map((sub) => {
                      const checked = draftSubjects.has(sub.name);
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => toggleDraftSubject(sub.name)}
                          className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-50/80 active:bg-slate-100/80 transition-colors text-left"
                        >
                          <div className="flex items-center space-x-2.5 min-w-0">
                            <span
                              className={`w-4.5 h-4.5 rounded-md border flex items-center justify-center shrink-0 ${
                                checked ? 'bg-[#EA580C] border-[#EA580C] text-white' : 'border-slate-300 bg-white'
                              }`}
                            >
                              {checked ? <Check className="w-3 h-3" /> : null}
                            </span>
                            <span className="text-xs font-semibold text-slate-800 truncate">{sub.name}</span>
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0 ml-2">{sub.department}</span>
                        </button>
                      );
                    })}
                    {filteredCentreSubjects.length === 0 ? (
                      <div className="px-3 py-2.5 text-xs text-slate-400 font-medium">No subjects match your search.</div>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-500">{draftSubjects.size} selected</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowSubjectsEditor(false)}
                        className="h-10 px-4 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={savingSubjects}
                        onClick={saveSubjects}
                        className="h-10 px-4 rounded-xl bg-[#EA580C] text-white text-xs font-bold hover:bg-[#C2410C] transition-colors cursor-pointer disabled:opacity-60"
                      >
                        {savingSubjects ? 'Saving...' : 'Save subjects'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 2. SECTION: Account */}
      <div className="mt-7">
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1 mb-2">
          Account
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/90 divide-y divide-slate-100 shadow-2xs overflow-hidden">
          {/* Item 1: Personal Details */}
          <button
            onClick={() => setActiveModal('personal_details')}
            className="w-full flex items-center justify-between p-3.5 hover:bg-slate-50/80 active:bg-slate-100/80 transition-colors text-left group"
          >
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center shrink-0">
                <User className="w-4.5 h-4.5" />
              </div>
              <span className="text-sm font-semibold text-slate-800">Personal Details</span>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
          </button>

          {/* Item 2: Academic & Enrollment Details */}
          <button
            onClick={() => setActiveModal('academic_details')}
            className="w-full flex items-center justify-between p-3.5 hover:bg-slate-50/80 active:bg-slate-100/80 transition-colors text-left group"
          >
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                <GraduationCap className="w-4.5 h-4.5" />
              </div>
              <span className="text-sm font-semibold text-slate-800">
                Academic & Enrollment Details
              </span>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
          </button>

          {/* Item 3: Digital Student ID Card */}
          <button
            onClick={() => setActiveModal('id_card')}
            className="w-full flex items-center justify-between p-3.5 hover:bg-slate-50/80 active:bg-slate-100/80 transition-colors text-left group"
          >
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <CreditCard className="w-4.5 h-4.5" />
              </div>
              <span className="text-sm font-semibold text-slate-800">
                Digital Student ID Card
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                Verified
              </span>
              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
            </div>
          </button>

          {/* Item 4: Tuition & Payment Statement */}
          <button
            onClick={() => setActiveModal('tuition_statement')}
            className="w-full flex items-center justify-between p-3.5 hover:bg-slate-50/80 active:bg-slate-100/80 transition-colors text-left group"
          >
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <Receipt className="w-4.5 h-4.5" />
              </div>
              <span className="text-sm font-semibold text-slate-800">
                Tuition & Payment Statement
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                  student.outstandingBalance > 0
                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}
              >
                {student.outstandingBalance > 0
                  ? `${settings.currencySymbol}${(student.outstandingBalance || 0).toLocaleString()}`
                  : 'Cleared'}
              </span>
              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
            </div>
          </button>
        </div>
      </div>

      {/* 3. SECTION: Security & Preferences */}
      <div className="mt-6">
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1 mb-2">
          Security & Preferences
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/90 divide-y divide-slate-100 shadow-2xs overflow-hidden">
          {/* Item 1: Change Account PIN */}
          <button
            onClick={() => setActiveModal('change_pin')}
            className="w-full flex items-center justify-between p-3.5 hover:bg-slate-50/80 active:bg-slate-100/80 transition-colors text-left group"
          >
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <Lock className="w-4.5 h-4.5" />
              </div>
              <span className="text-sm font-semibold text-slate-800">Change Account PIN</span>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
          </button>

          {/* Item 2: Change Password */}
          <button
            onClick={() => setActiveModal('change_password')}
            className="w-full flex items-center justify-between p-3.5 hover:bg-slate-50/80 active:bg-slate-100/80 transition-colors text-left group"
          >
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <KeyRound className="w-4.5 h-4.5" />
              </div>
              <span className="text-sm font-semibold text-slate-800">Change Password</span>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
          </button>

          {/* Item 3: Enable Biometric (Interactive toggle matching video 00:02) */}
          <div className="w-full flex items-center justify-between p-3.5">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <Fingerprint className="w-4.5 h-4.5" />
              </div>
              <span className="text-sm font-semibold text-slate-800">Enable Biometric</span>
            </div>

            <button
              type="button"
              onClick={() => {
                const nextState = !biometricEnabled;
                setBiometricEnabled(nextState);
                addToast({
                  type: 'success',
                  title: nextState ? 'Biometrics Enabled' : 'Biometrics Disabled',
                  description: nextState
                    ? 'Fingerprint & FaceID active for quick portal authentication.'
                    : 'Biometric sign-in turned off.',
                });
              }}
              className={`w-11 h-6 rounded-full transition-colors relative focus:outline-none ${
                biometricEnabled ? 'bg-slate-900' : 'bg-slate-300'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full bg-white shadow-md block transform transition-transform ${
                  biometricEnabled ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* Item 4: Theme Settings */}
          <button
            onClick={() => setActiveModal('theme_settings')}
            className="w-full flex items-center justify-between p-3.5 hover:bg-slate-50/80 active:bg-slate-100/80 transition-colors text-left group"
          >
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-full bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
                <Palette className="w-4.5 h-4.5" />
              </div>
              <span className="text-sm font-semibold text-slate-800">Theme Settings</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-xs text-slate-500 font-medium capitalize">
                {selectedTheme}
              </span>
              <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
            </div>
          </button>
        </div>
      </div>

      {/* 4. SECTION: Others */}
      <div className="mt-6">
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1 mb-2">
          Others
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/90 divide-y divide-slate-100 shadow-2xs overflow-hidden">
          {/* Item 1: Help & Support */}
          <button
            onClick={() => setActiveModal('help_support')}
            className="w-full flex items-center justify-between p-3.5 hover:bg-slate-50/80 active:bg-slate-100/80 transition-colors text-left group"
          >
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <HelpCircle className="w-4.5 h-4.5" />
              </div>
              <span className="text-sm font-semibold text-slate-800">Help & Support</span>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
          </button>

          {/* Item 2: Examination & Privacy Policy */}
          <button
            onClick={() => setActiveModal('exam_policy')}
            className="w-full flex items-center justify-between p-3.5 hover:bg-slate-50/80 active:bg-slate-100/80 transition-colors text-left group"
          >
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                <FileText className="w-4.5 h-4.5" />
              </div>
              <span className="text-sm font-semibold text-slate-800">
                Examination & Privacy Policy
              </span>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
          </button>

          {/* Item 3: Log out / Switch User */}
          <button
            onClick={() => {
              if (isAdmin) {
                setViewMode('portal');
              } else {
                setActiveModal('logout');
              }
            }}
            className="w-full flex items-center justify-between p-3.5 hover:bg-rose-50/50 active:bg-rose-100/50 transition-colors text-left group"
          >
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                {isAdmin ? <ShieldCheck className="w-4.5 h-4.5" /> : <LogOut className="w-4.5 h-4.5" />}
              </div>
              <span className="text-sm font-semibold text-rose-600">
                {isAdmin ? 'Switch to Admin' : 'Log out'}
              </span>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-rose-500 transition-colors" />
          </button>
        </div>
      </div>

      {/* 5. Version Footer (Exact look from video) */}
      <div className="text-center pt-6 pb-4 text-slate-400 text-xs font-medium">
        {centreName} • Version 1.0.0 (2026)
      </div>

      {/* =========================================================================
          THE BOTTOM SPLASH-UP MODAL ENGINE
          (Slides up smoothly from the bottom with handle bar, title, subtitle & content)
         ========================================================================= */}
      {activeModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 transition-opacity">
          {/* Backdrop dismissal */}
          <div
            className="absolute inset-0"
            onClick={() => setActiveModal(null)}
          />

          {/* Modal Container */}
          <div className="relative z-10 w-full max-w-lg bg-white rounded-t-[32px] sm:rounded-3xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
            {/* Top Drag Handle Bar (The splash-up signature from video) */}
            <div
              className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto mt-3 mb-1 cursor-pointer shrink-0 hover:bg-slate-400 transition-colors"
              onClick={() => setActiveModal(null)}
            />

            {/* MODAL 1: Personal Details (Video 00:00) */}
            {activeModal === 'personal_details' && (
              <div className="p-6 overflow-y-auto space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-black text-slate-900">Personal Details</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Complete your candidate personal information
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveModal(null)}
                    className="p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleSavePersonalDetails} className="space-y-3.5 pt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        First Name
                      </label>
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        required
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:border-orange-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Last Name
                      </label>
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        required
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:border-orange-500 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:border-orange-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:border-orange-500 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <ModernSelect
                        label="Sex"
                        value={gender}
                        onChange={(val) => setGender(val)}
                        options={[
                          { value: 'Male', label: 'Male' },
                          { value: 'Female', label: 'Female' }
                        ]}
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Date of Birth
                      </label>
                      <input
                        type="date"
                        value={dob}
                        onChange={(e) => setDob(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium focus:border-orange-500 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Residential Address
                    </label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:border-orange-500 outline-none"
                    />
                  </div>

                  <div className="pt-3">
                    <button
                      type="submit"
                      className="w-full py-3.5 px-4 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-sm shadow-md active:scale-98 transition-all"
                    >
                      Save Changes
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* MODAL 2: Academic & Enrollment Details */}
            {activeModal === 'academic_details' && (
              <div className="p-6 overflow-y-auto space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-black text-slate-900">
                      Academic & Enrollment Details
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Candidate cohort, enrolled track, and exam configuration
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveModal(null)}
                    className="p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-0.5">
                    <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                      Programme Track
                    </span>
                    <span className="font-bold text-slate-900 block leading-tight">
                      {student.programmeName}
                    </span>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-0.5">
                    <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                      Academic Session
                    </span>
                    <span className="font-bold text-slate-900 block">
                      {settings.academicSession || '2026/2027 Session'}
                    </span>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-0.5 col-span-2">
                    <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                      Assigned Branch
                    </span>
                    <span className="font-bold text-slate-900 block">
                      {student.branchName || 'Main Campus'}
                    </span>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-0.5">
                    <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                      Parent / Guardian
                    </span>
                    <span className="font-bold text-slate-900 block">
                      {student.parentName || 'Chief Olumide Ade'}
                    </span>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-0.5">
                    <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                      Emergency Contact
                    </span>
                    <span className="font-bold text-slate-900 block">
                      {student.parentWhatsApp || '+234 803 111 2233'}
                    </span>
                  </div>
                </div>

                <div className="bg-emerald-50/80 p-3.5 rounded-xl border border-emerald-200 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-emerald-950 block">Attendance Standing</span>
                    <span className="text-[11px] text-emerald-800">
                      Eligible for official center mock examinations
                    </span>
                  </div>
                  <span className="text-base font-black text-emerald-700">
                    {student.attendancePercent || 92}%
                  </span>
                </div>
              </div>
            )}

            {/* MODAL 3: Digital Student ID Card */}
            {activeModal === 'id_card' && (
              <div className="p-6 overflow-y-auto space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-black text-slate-900">Student Identity Card</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Official digital candidate card with access barcode
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveModal(null)}
                    className="p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* ID Badge Card */}
                <div className="relative rounded-3xl overflow-hidden shadow-xl border border-slate-800 bg-gradient-to-br from-slate-950 via-[#070F1E] to-slate-900 text-white p-5 space-y-4">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-orange-500/15 rounded-full blur-3xl pointer-events-none" />

                  {/* Card Header */}
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3 relative z-10">
                    <div className="flex items-center space-x-2">
                      <div className="w-7 h-7 rounded-lg bg-[#EA580C] text-white flex items-center justify-center font-black text-xs">
                        EX
                      </div>
                      <div>
                        <span className="text-xs font-black tracking-wider uppercase block leading-none">
                          {centreName}
                        </span>
                        <span className="text-[9px] text-orange-400 font-semibold tracking-wider uppercase">
                          Official Student Identity Card
                        </span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      Active 2026
                    </span>
                  </div>

                  {/* Card Body */}
                  <div className="flex items-start gap-4 relative z-10">
                    <div className="relative shrink-0">
                      <img
                        src={studentAvatar}
                        alt={student.name}
                        className="w-20 h-24 rounded-2xl object-cover border-2 border-orange-500/80 shadow-lg"
                      />
                      <span className="absolute -bottom-1 -right-1 px-1.5 py-0.5 bg-slate-900 text-orange-300 font-mono text-[8px] font-bold rounded border border-orange-500/40">
                        VERIFIED
                      </span>
                    </div>

                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div>
                        <span className="text-[9px] text-slate-400 uppercase font-semibold block">
                          Candidate Name
                        </span>
                        <h4 className="text-sm font-black text-white truncate">{student.name}</h4>
                      </div>

                      <div>
                        <span className="text-[9px] text-slate-400 uppercase font-semibold block">
                          Target Programme
                        </span>
                        <span className="text-[11px] font-medium text-slate-300 line-clamp-1">
                          {student.programmeName}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer with Access Barcode */}
                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between relative z-10">
                    <div className="space-y-0.5">
                      <span className="text-[8px] text-slate-400 uppercase font-mono tracking-wider block">
                        Access Barcode
                      </span>
                      <div className="flex items-center space-x-0.5 h-6 opacity-85">
                        {[3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 1, 3, 4, 1, 2, 3, 1, 2, 4, 1, 3, 2].map(
                          (w, i) => (
                            <span
                              key={i}
                              style={{ width: `${w}px` }}
                              className="h-full bg-slate-200 inline-block"
                            />
                          )
                        )}
                      </div>
                    </div>

                    <span className="font-mono text-[9px] text-slate-400">
                      SEC-ID-{student.id}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* MODAL 4: Tuition & Payment Statement */}
            {activeModal === 'tuition_statement' && (
              <div className="p-6 overflow-y-auto space-y-4 max-h-[85vh]">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-black text-slate-900">
                      Tuition & Payment Statement
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Enrolled: {new Date(student.registrationDate || '2026-08-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} • {student.programmeName}
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveModal(null)}
                    className="p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-2 text-center bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                      Total Tuition
                    </span>
                    <span className="text-sm font-black text-slate-900">
                      {settings.currencySymbol}
                      {(student.totalFee || 0).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                      Total Paid
                    </span>
                    <span className="text-sm font-black text-emerald-700">
                      {settings.currencySymbol}
                      {(student.paidAmount || 0).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                      Balance Due
                    </span>
                    <span className="text-sm font-black text-rose-700">
                      {settings.currencySymbol}
                      {(student.outstandingBalance || 0).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Navigation sub-tabs */}
                <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setActivePaymentSubView('statement')}
                    className={`flex-1 py-2 rounded-lg transition-all cursor-pointer ${
                      activePaymentSubView === 'statement'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    Payment History ({studentPayments.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivePaymentSubView('make_payment')}
                    className={`flex-1 py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      activePaymentSubView === 'make_payment'
                        ? 'bg-[#EA580C] text-white shadow-xs'
                        : 'text-[#EA580C] hover:bg-orange-50'
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Make Payment</span>
                  </button>
                </div>

                {/* VIEW 1: Make Payment Flow */}
                {activePaymentSubView === 'make_payment' && (
                  <form onSubmit={handleCompletePayment} className="space-y-3.5 pt-1 text-xs">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="font-bold text-slate-700">
                          Amount to Pay ({settings.currencySymbol}) *
                        </label>
                        {student.outstandingBalance > 0 && (
                          <button
                            type="button"
                            onClick={() => setPayAmount(student.outstandingBalance)}
                            className="text-[10px] font-bold text-[#EA580C] hover:underline"
                          >
                            Pay Full Balance ({settings.currencySymbol}{(student.outstandingBalance || 0).toLocaleString()})
                          </button>
                        )}
                      </div>
                      <input
                        type="number"
                        required
                        min="1000"
                        value={payAmount}
                        onChange={(e) => setPayAmount(Number(e.target.value))}
                        className="w-full p-2.5 rounded-xl border border-slate-300 font-mono font-bold text-sm bg-white outline-none focus:border-orange-500"
                      />
                    </div>

                    {/* Mode of Payment Choices */}
                    <div>
                      <label className="font-bold text-slate-700 block mb-1.5">
                        Select Mode of Payment *
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { mode: 'Bank Transfer' as const, label: 'Bank Transfer', icon: Building2 },
                          { mode: 'Card' as const, label: 'Card / POS', icon: CreditCard },
                          { mode: 'Cash' as const, label: 'Cash Payment', icon: Banknote },
                        ].map(({ mode, label, icon: ModeIcon }) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setPaymentMode(mode)}
                            className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                              paymentMode === mode
                                ? 'bg-orange-50 border-orange-500 text-orange-950 font-bold shadow-xs'
                                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600 font-medium'
                            }`}
                          >
                            <ModeIcon className={`w-4 h-4 ${paymentMode === mode ? 'text-[#EA580C]' : 'text-slate-400'}`} />
                            <span className="text-[11px]">{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Conditional Box: Bank Transfer / Card */}
                    {(paymentMode === 'Bank Transfer' || paymentMode === 'Card') && (
                      <div className="space-y-3">
                        {/* Center Account Details */}
                        <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-xl space-y-2">
                          <div className="flex items-center justify-between text-blue-900 font-bold">
                            <span className="text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                              <Building2 className="w-3.5 h-3.5 text-blue-600" />
                              Official Centre Account Details
                            </span>
                            <span className="text-[10px] font-semibold text-blue-600">Verified</span>
                          </div>
                          
                          <div className="bg-white/90 p-2.5 rounded-lg border border-blue-100 space-y-1">
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-500 font-medium">Bank Name:</span>
                              <span className="font-bold text-slate-900">{settings.bankName || 'Access Bank Plc'}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-500 font-medium">Account Number:</span>
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-black text-slate-900 tracking-wider">
                                  {settings.bankAccountNumber || '0123456789'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopy(settings.bankAccountNumber || '0123456789', 'acc_num')}
                                  className="p-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 cursor-pointer"
                                  title="Copy Account Number"
                                >
                                  {copiedKey === 'acc_num' ? (
                                    <Check className="w-3 h-3 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-500 font-medium">Account Name:</span>
                              <span className="font-bold text-slate-900 truncate max-w-[180px]">
                                {settings.bankAccountName || centreName}
                              </span>
                            </div>
                          </div>

                          <p className="text-[10px] text-blue-700 leading-relaxed font-medium">
                            Please make payment of <strong>{settings.currencySymbol}{(payAmount || 0).toLocaleString()}</strong> to the centre account above, then upload your transaction receipt/screenshot below.
                          </p>
                        </div>

                        {/* Upload Evidence of Payment (Mandatory) */}
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">
                            Upload Payment Evidence / Receipt *
                          </label>
                          {evidenceDataUrl ? (
                            <div className="p-2.5 rounded-xl border border-emerald-300 bg-emerald-50/50 flex items-center justify-between">
                              <div className="flex items-center gap-2 overflow-hidden">
                                <img
                                  src={evidenceDataUrl}
                                  alt="Receipt thumbnail"
                                  className="w-10 h-10 object-cover rounded-lg border border-emerald-200 shrink-0 bg-white"
                                />
                                <div className="truncate">
                                  <p className="font-bold text-slate-900 text-xs truncate">{evidenceFileName || 'Payment_Proof.jpg'}</p>
                                  <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1">
                                    <Check className="w-3 h-3" /> Ready to submit
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setEvidenceDataUrl(null);
                                  setEvidenceFileName('');
                                }}
                                className="text-[10px] font-bold text-rose-600 hover:text-rose-700 px-2 py-1 bg-white rounded-lg border border-rose-200 shrink-0 cursor-pointer"
                              >
                                Remove
                              </button>
                            </div>
                          ) : (
                            <label className="border-2 border-dashed border-slate-300 hover:border-orange-500 rounded-xl p-3.5 flex flex-col items-center justify-center text-center cursor-pointer bg-slate-50 hover:bg-orange-50/40 transition-colors">
                              <Upload className="w-5 h-5 text-slate-400 mb-1" />
                              <span className="text-xs font-bold text-slate-700">Click to upload payment receipt</span>
                              <span className="text-[10px] text-slate-400 mt-0.5">JPG, PNG, WebP or PDF receipt screenshot (Max 5MB)</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleEvidenceFileChange}
                                className="hidden"
                              />
                            </label>
                          )}
                        </div>

                        {/* Short Note Field */}
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">
                            Short Note / Payment Reference (Optional)
                          </label>
                          <input
                            type="text"
                            value={paymentNote}
                            onChange={(e) => setPaymentNote(e.target.value)}
                            placeholder="e.g. Transfer from GTBank by parent Mr. Ade / Ref ID"
                            className="w-full p-2.5 rounded-xl border border-slate-300 text-xs bg-white outline-none focus:border-orange-500 font-medium"
                          />
                        </div>
                      </div>
                    )}

                    {/* Conditional Box: Cash */}
                    {paymentMode === 'Cash' && (
                      <div className="space-y-3">
                        {/* Cash Info Guide provided in settings */}
                        <div className="p-3.5 bg-amber-50/80 border border-amber-300 rounded-xl space-y-2">
                          <div className="flex items-center gap-2 text-amber-950 font-bold text-xs">
                            <Banknote className="w-4 h-4 text-amber-600" />
                            <span>Cash Payment Instructions</span>
                          </div>
                          <div className="p-2.5 bg-white/90 rounded-lg border border-amber-200 text-xs text-slate-800 leading-relaxed font-medium">
                            {settings.cashPaymentGuide ||
                              'Please proceed in person to the Centre Accounts Bursar, Mr. Adeleke, at the Admin Office (Reception Block A, 1st Floor). Always collect an official stamped paper receipt upon payment.'}
                          </div>
                          <p className="text-[10px] text-amber-800 font-semibold">
                            Notice: Cash must be paid directly to the authorized bursary desk. Keep your paper receipt safely.
                          </p>
                        </div>

                        {/* Short Note Field */}
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">
                            Cash Payment Short Note / Statement *
                          </label>
                          <input
                            type="text"
                            required
                            value={paymentNote}
                            onChange={(e) => setPaymentNote(e.target.value)}
                            placeholder="e.g. Handed cash to Bursar Mr. Adeleke at reception / Paper Receipt #1024"
                            className="w-full p-2.5 rounded-xl border border-slate-300 text-xs bg-white outline-none focus:border-orange-500 font-medium"
                          />
                        </div>

                        {/* Optional Evidence for Cash */}
                        <div>
                          <label className="font-semibold text-slate-600 block mb-1 text-[11px]">
                            Attach Photo of Paper Cash Receipt (Optional)
                          </label>
                          {evidenceDataUrl ? (
                            <div className="p-2 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
                              <span className="truncate text-slate-700 font-medium">{evidenceFileName || 'Cash_Receipt.jpg'}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setEvidenceDataUrl(null);
                                  setEvidenceFileName('');
                                }}
                                className="text-rose-600 font-bold text-[10px] hover:underline cursor-pointer"
                              >
                                Remove
                              </button>
                            </div>
                          ) : (
                            <label className="border border-slate-200 rounded-lg p-2 flex items-center justify-center gap-1.5 text-slate-500 hover:text-slate-700 cursor-pointer text-xs bg-white">
                              <Upload className="w-3.5 h-3.5" />
                              <span>Attach paper receipt photo</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleEvidenceFileChange}
                                className="hidden"
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Submit Button */}
                    <div className="pt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setActivePaymentSubView('statement')}
                        className="flex-1 py-2.5 rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingPayment}
                        className="flex-2 py-2.5 rounded-xl bg-[#EA580C] hover:bg-[#C2410C] text-white font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Check className="w-4 h-4" />
                        <span>Confirm & Submit Payment ({settings.currencySymbol}{(payAmount || 0).toLocaleString()})</span>
                      </button>
                    </div>
                  </form>
                )}

                {/* VIEW 2: Payment History & Statements (from enrollment month) */}
                {activePaymentSubView === 'statement' && (
                  <div className="space-y-3 pt-1">
                    {/* Outstanding alert banner */}
                    {student.outstandingBalance > 0 && (
                      <div className="p-3 bg-orange-50/80 border border-orange-200 rounded-xl flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-bold text-orange-950">Tuition Balance Outstanding</p>
                          <p className="text-[10px] text-orange-800">
                            {settings.currencySymbol}{(student.outstandingBalance || 0).toLocaleString()} pending payment
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setPayAmount(student.outstandingBalance);
                            setActivePaymentSubView('make_payment');
                          }}
                          className="px-3 py-1.5 text-xs font-bold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg shadow-2xs transition-all shrink-0 cursor-pointer"
                        >
                          Pay Now
                        </button>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-slate-500">
                      <span className="text-[11px] font-bold uppercase tracking-wider">
                        Payment History Since Enrollment ({new Date(student.registrationDate || '2026-08-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })})
                      </span>
                      <span className="text-[10px] font-bold text-slate-400">
                        {studentPayments.length} records
                      </span>
                    </div>

                    {studentPayments.length > 0 ? (
                      <div className="space-y-2.5">
                        {[...studentPayments]
                          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                          .map((p) => (
                            <div
                              key={p.id}
                              className="p-3.5 rounded-xl bg-slate-50 hover:bg-white border border-slate-200 transition-all space-y-2 text-xs"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-extrabold text-slate-900 text-sm">
                                      {settings.currencySymbol}{(p.amountPaid || 0).toLocaleString()}
                                    </span>
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                      p.status === 'Paid'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-amber-100 text-amber-800'
                                    }`}>
                                      {p.status}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                                    {p.receiptNumber} • {p.date} • {p.method}
                                  </p>
                                </div>

                                {p.evidenceUrl && (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewEvidenceUrl(p.evidenceUrl!)}
                                    className="px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-bold border border-blue-200 flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                                  >
                                    <ImageIcon className="w-3 h-3" />
                                    <span>View Proof</span>
                                  </button>
                                )}
                              </div>

                              {/* Short Note Statement */}
                              {p.note && (
                                <div className="p-2 bg-white rounded-lg border border-slate-200 text-[11px] text-slate-700 italic">
                                  <span className="font-bold text-slate-500 not-italic block text-[9px] uppercase tracking-wider mb-0.5">
                                    {p.method === 'Cash' ? 'Bursary Cash Statement / Note' : 'Payment Statement / Note'}
                                  </span>
                                  "{p.note}"
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                    ) : (
                      <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-2">
                        <Receipt className="w-8 h-8 text-slate-300 mx-auto" />
                        <p className="text-xs font-bold text-slate-700">No Payment History Yet</p>
                        <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                          No payments logged since candidate enrollment in {new Date(student.registrationDate || '2026-08-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.
                        </p>
                        <button
                          type="button"
                          onClick={() => setActivePaymentSubView('make_payment')}
                          className="mt-2 px-4 py-2 text-xs font-bold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg shadow-2xs transition-all inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>Make Tuition Payment</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Evidence Preview Modal for Student */}
            {previewEvidenceUrl && (
              <div className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-200">
                <div className="bg-white rounded-2xl max-w-md w-full p-4 shadow-2xl relative flex flex-col max-h-[85vh]">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <h4 className="font-bold text-slate-900 text-xs">Payment Evidence / Receipt</h4>
                    <button
                      onClick={() => setPreviewEvidenceUrl(null)}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="py-2 flex-1 overflow-auto flex items-center justify-center bg-slate-950/5 rounded-xl mt-2">
                    <img
                      src={previewEvidenceUrl}
                      alt="Uploaded Payment Evidence"
                      className="max-h-[65vh] w-auto max-w-full object-contain rounded-lg shadow-sm"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* MODAL 5: Change Account PIN (Exact Match to video 00:05!) */}
            {activeModal === 'change_pin' && (
              <div className="p-6 overflow-y-auto space-y-4">
                <div className="flex items-start justify-between">
                  <div className="w-full text-center">
                    {/* Pink/Rose icon circle */}
                    <div className="w-14 h-14 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-2">
                      <Lock className="w-7 h-7" />
                    </div>
                    <h3 className="text-lg font-black text-slate-900">Current PIN</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Enter your current 4-digit security PIN
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setPin('');
                      setActiveModal(null);
                    }}
                    className="absolute right-5 top-5 p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* 4 PIN Dots */}
                <div className="flex justify-center items-center space-x-4 my-6">
                  {[0, 1, 2, 3].map((index) => (
                    <div
                      key={index}
                      className={`w-4 h-4 rounded-full border-2 transition-all ${
                        pin.length > index
                          ? 'bg-slate-900 border-slate-900 scale-110'
                          : 'border-slate-300 bg-transparent'
                      }`}
                    />
                  ))}
                </div>

                {/* Number Keypad (1-9, 0, backspace) */}
                <div className="grid grid-cols-3 gap-2.5 max-w-xs mx-auto">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                    <button
                      key={digit}
                      type="button"
                      onClick={() => handlePinKey(digit)}
                      className="py-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold text-lg active:scale-95 transition-all shadow-2xs"
                    >
                      {digit}
                    </button>
                  ))}
                  <div />
                  <button
                    type="button"
                    onClick={() => handlePinKey('0')}
                    className="py-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold text-lg active:scale-95 transition-all shadow-2xs"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={handlePinBackspace}
                    className="py-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm active:scale-95 transition-all flex items-center justify-center shadow-2xs"
                    title="Backspace"
                  >
                    <Delete className="w-5 h-5" />
                  </button>
                </div>

                <div className="pt-3 max-w-xs mx-auto">
                  <button
                    type="button"
                    onClick={handleConfirmPin}
                    disabled={pin.length < 4}
                    className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all shadow-md ${
                      pin.length === 4
                        ? 'bg-slate-900 text-white hover:bg-black active:scale-98'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {/* MODAL 6: Change Password */}
            {activeModal === 'change_password' && (
              <div className="p-6 overflow-y-auto space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-black text-slate-900">Change Password</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Update your student portal login password
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveModal(null)}
                    className="p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleUpdatePassword} className="space-y-3.5 pt-2">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Current Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPasswords ? "text" : "password"}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        required
                        placeholder="••••••••"
                        className="w-full px-3 py-2.5 pr-10 rounded-xl border border-slate-200 text-sm focus:border-orange-500 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswords(!showPasswords)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      New Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPasswords ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        placeholder="At least 6 characters"
                        className="w-full px-3 py-2.5 pr-10 rounded-xl border border-slate-200 text-sm focus:border-orange-500 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswords(!showPasswords)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPasswords ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        placeholder="Re-type new password"
                        className="w-full px-3 py-2.5 pr-10 rounded-xl border border-slate-200 text-sm focus:border-orange-500 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswords(!showPasswords)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="pt-3">
                    <button
                      type="submit"
                      className="w-full py-3.5 px-4 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-sm shadow-md active:scale-98 transition-all"
                    >
                      Update Password
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* MODAL 7: Theme Settings (Exact Match to video 00:08!) */}
            {activeModal === 'theme_settings' && (
              <div className="p-6 overflow-y-auto space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-black text-slate-900">Theme</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Select your preferred display appearance
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveModal(null)}
                    className="p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-2 pt-2">
                  {[
                    { id: 'system', label: 'System', icon: Laptop, desc: 'Match device system settings' },
                    { id: 'light', label: 'Light', icon: Sun, desc: 'Clean bright layout' },
                    { id: 'dark', label: 'Dark', icon: Moon, desc: 'Eye-friendly dim display' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelectedTheme(item.id as 'system' | 'light' | 'dark');
                        if (item.id === 'dark') setBgTheme('dark');
                        else setBgTheme('light');
                        addToast({
                          type: 'success',
                          title: 'Theme Updated',
                          description: `Display theme set to ${item.label}.`,
                        });
                      }}
                      className={`w-full p-4 rounded-2xl border flex items-center justify-between transition-all ${
                        selectedTheme === item.id
                          ? 'bg-orange-50/80 border-orange-400 shadow-xs'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center space-x-3 text-left">
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                            selectedTheme === item.id
                              ? 'bg-orange-600 text-white'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <item.icon className="w-4.5 h-4.5" />
                        </div>
                        <div>
                          <span className="text-sm font-bold text-slate-900 block">
                            {item.label}
                          </span>
                          <span className="text-xs text-slate-500">{item.desc}</span>
                        </div>
                      </div>

                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          selectedTheme === item.id
                            ? 'border-orange-600 bg-orange-600 text-white'
                            : 'border-slate-300'
                        }`}
                      >
                        {selectedTheme === item.id && <Check className="w-3 h-3 stroke-3" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* MODAL 8: Help & Support (Exact Match to video 00:10!) */}
            {activeModal === 'help_support' && (
              <div className="p-6 overflow-y-auto space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-black text-slate-900">Help & Support</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Our team is here for candidate registration, mock exams, and academic guidance.
                      Reach us using any of the channels below.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveModal(null)}
                    className="p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 shrink-0 ml-2"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="pt-2 space-y-2.5">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Contact us
                  </div>

                  {/* Channel 1: Support Email */}
                  <div className="p-3.5 rounded-2xl border border-slate-200 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center shrink-0">
                        <Mail className="w-4.5 h-4.5" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                          Support Email
                        </span>
                        <span className="text-xs font-bold text-slate-800 truncate block">
                          {settings.email || 'support@excellencetutorials.ng'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        handleCopy(
                          settings.email || 'support@excellencetutorials.ng',
                          'email'
                        )
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 flex items-center space-x-1 shrink-0 ml-2"
                    >
                      {copiedKey === 'email' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Channel 2: Academic Advisory */}
                  <div className="p-3.5 rounded-2xl border border-slate-200 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                        <GraduationCap className="w-4.5 h-4.5" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                          Academic Advisory
                        </span>
                        <span className="text-xs font-bold text-slate-800 truncate block">
                          academics@excellencetutorials.ng
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        handleCopy('academics@excellencetutorials.ng', 'academics')
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 flex items-center space-x-1 shrink-0 ml-2"
                    >
                      {copiedKey === 'academics' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Channel 3: Phone Hotline */}
                  <div className="p-3.5 rounded-2xl border border-slate-200 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                        <Phone className="w-4.5 h-4.5" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                          Phone Helpline
                        </span>
                        <span className="text-xs font-bold text-slate-800 truncate block">
                          {settings.phone || '+234 805 676 5455'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        handleCopy(settings.phone || '+234 805 676 5455', 'phone')
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 flex items-center space-x-1 shrink-0 ml-2"
                    >
                      {copiedKey === 'phone' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Channel 4: WhatsApp Chat */}
                  <div className="p-3.5 rounded-2xl border border-slate-200 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                        <MessageSquare className="w-4.5 h-4.5" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                          WhatsApp Support
                        </span>
                        <span className="text-xs font-bold text-slate-800 truncate block">
                          {settings.whatsappNumber || settings.whatsapp || '+234 805 676 5455'}
                        </span>
                      </div>
                    </div>
                    <a
                      href={`https://wa.me/${(settings.whatsappNumber || settings.whatsapp || '+2348056765455').replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 flex items-center space-x-1 shrink-0 ml-2 shadow-2xs"
                    >
                      <span>Chat</span>
                    </a>
                  </div>

                  {/* Channel 5: Campus Address */}
                  <div className="p-3.5 rounded-2xl border border-slate-200 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                        <MapPin className="w-4.5 h-4.5" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                          Main Campus Center
                        </span>
                        <span className="text-xs font-bold text-slate-800 line-clamp-1 block">
                          {settings.address || '14 Allen Avenue, Ikeja, Lagos State, Nigeria'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        handleCopy(
                          settings.address || '14 Allen Avenue, Ikeja, Lagos State, Nigeria',
                          'address'
                        )
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 flex items-center space-x-1 shrink-0 ml-2"
                    >
                      {copiedKey === 'address' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* MODAL 9: Examination & Privacy Policy (Video 00:13) */}
            {activeModal === 'exam_policy' && (
              <div className="p-6 overflow-y-auto space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-black text-slate-900">
                      Examination & Privacy Policy
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Candidate guidelines and academic code of conduct
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveModal(null)}
                    className="p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3.5 text-xs text-slate-700 pt-2 leading-relaxed">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                    <h4 className="font-bold text-slate-900">
                      1. Examination Hall & CBT Lab Protocol
                    </h4>
                    <p>
                      Candidates are strictly expected to arrive at the CBT lab 15 minutes before the
                      commencement of any scheduled simulation drill. Mobile phones, programmable
                      calculators, and unauthorized materials are prohibited inside test terminals.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                    <h4 className="font-bold text-slate-900">
                      2. Attendance & Mock Eligibility
                    </h4>
                    <p>
                      To qualify for state and national preparatory mock assessments, students must
                      maintain a verified roll-call attendance rate of at least 80% across all registered
                      lecture cohorts.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                    <h4 className="font-bold text-slate-900">
                      3. Data Protection & Parental Transparency
                    </h4>
                    <p>
                      Candidate performance records, weekly mock scores, and center arrival times are
                      confidentially shared with designated parents/sponsors via automated SMS and
                      Parent Monitor Portal access.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* MODAL 10: Log Out */}
            {activeModal === 'logout' && (
              <div className="p-6 overflow-y-auto space-y-4 text-center">
                <div className="w-14 h-14 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
                  <LogOut className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Log out of Student Session</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                    Are you sure you want to end this student portal session or switch to another user?
                  </p>
                </div>

                <div className="pt-3 space-y-2">
                  {isAdmin ? (
                    <button
                      onClick={() => {
                        setActiveModal(null);
                        setViewMode('portal');
                        setAdminSection('dashboard');
                      }}
                      className="w-full py-3.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-sm shadow-md active:scale-98 transition-all"
                    >
                      Switch to Admin Dashboard
                    </button>
                  ) : (
                    <button
                      onClick={async () => {
                        setActiveModal(null);
                        try {
                          await logout();
                          addToast({
                            type: 'success',
                            title: 'Logged Out',
                            description: 'You have been successfully signed out of the portal.',
                          });
                        } catch (e) {
                          console.error(e);
                        }
                      }}
                      className="w-full py-3.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-md active:scale-98 transition-all"
                    >
                      Logout & Exit Session
                    </button>
                  )}
                  <button
                    onClick={() => setActiveModal(null)}
                    className="w-full py-3 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50"
                  >
                    Stay Signed In
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
