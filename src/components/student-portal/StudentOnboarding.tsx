import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { doc, setDoc } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { User, GraduationCap, School, BookOpen, Heart, Users, ArrowRight } from 'lucide-react';
import { COURSES, UNIVERSITIES } from '../../data/academicLists';
import { ModernSelect } from '../ui/ModernSelect';

interface StudentOnboardingProps {
  onComplete: () => void;
}

export const StudentOnboarding: React.FC<StudentOnboardingProps> = ({ onComplete }) => {
  const { addToast, activeCentreId, centreName, programmes, subjects } = useApp();
  const [loading, setLoading] = useState(false);
  // The facility's own registered subjects; General ones are open to every
  // student, department-specific ones only to that department.
  const centreSubjects = subjects.filter(
    (s) => !activeCentreId || !s.centreId || s.centreId === activeCentreId
  );
  const bestSubjectOptions = (() => {
    const dept = formData.department;
    const list = centreSubjects.filter((s) => s.department === 'General' || (!!dept && s.department === dept));
    return list.map((s) => ({ value: s.name, label: s.name }));
  })();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    dob: '',
    courseOfStudy: '',
    universityChoice: '',
    examToRegister: '',
    department: '',
    bestSubjects: '',
    parentName: '',
    parentWhatsApp: '',
    parentEmail: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const user = auth.currentUser;
    if (!user) return;

    try {
      const studentData = {
        uid: user.uid,
        name: `${formData.firstName} ${formData.lastName}`,
        email: user.email || '',
        dob: formData.dob,
        courseOfStudy: formData.courseOfStudy,
        universityChoice: formData.universityChoice,
        examToRegister: formData.examToRegister,
        department: formData.department,
        bestSubjects: formData.bestSubjects,
        parentName: formData.parentName,
        parentWhatsApp: formData.parentWhatsApp,
        parentEmail: formData.parentEmail,
        status: 'Active',
        registrationDate: new Date().toISOString(),
        avatar: user.photoURL || '',
        // Missing fields to satisfy Student interface
        gender: 'Male',
        address: '',
        programmeId: '',
        programmeName: formData.examToRegister || 'General Programme',
        branchId: '',
        branchName: 'Main Campus',
        subjects: [formData.bestSubjects],
        attendancePercent: 0,
        totalFee: 0,
        paidAmount: 0,
        outstandingBalance: 0,
      };

      await setDoc(doc(db, 'students', user.uid), { ...studentData, ...(activeCentreId ? { centreId: activeCentreId } : {}) }, { merge: true });
      addToast({
        type: 'success',
        title: 'Profile Created!',
        description: `Welcome to ${centreName}.`,
      });
      // Small delay to ensure Firestore propagation before parent re-renders
      setTimeout(() => {
        onComplete();
      }, 500);
    } catch (err) {
      console.error('Onboarding failed:', err);
      addToast({ type: 'error', title: 'Profile Error', description: 'Failed to save student details.' });
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-2xl mx-auto bg-white rounded-[32px] shadow-2xl border border-slate-100 overflow-hidden">
        <div className="bg-orange-600 p-8 text-white">
          <h1 className="text-3xl font-black mb-2">Complete Your Profile</h1>
          <p className="opacity-90 font-medium">Tell us more about your academic goals to get started.</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-8">
          {/* Personal Information */}
          <section className="space-y-4">
            <div className="flex items-center space-x-2 text-orange-600 mb-2">
              <User className="w-5 h-5" />
              <h2 className="font-black uppercase tracking-wider text-sm">Personal Information</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 ml-1">First Name</label>
                <input
                  required
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
                  placeholder="John"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 ml-1">Last Name</label>
                <input
                  required
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
                  placeholder="Doe"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 ml-1">Date of Birth</label>
                <input
                  required
                  type="date"
                  value={formData.dob}
                  onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
                />
              </div>
            </div>
          </section>

          {/* Academic Goals */}
          <section className="space-y-4">
            <div className="flex items-center space-x-2 text-orange-600 mb-2">
              <GraduationCap className="w-5 h-5" />
              <h2 className="font-black uppercase tracking-wider text-sm">Academic Goals</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ModernSelect
                label="Intended Course"
                value={formData.courseOfStudy}
                onChange={(val) => setFormData({ ...formData, courseOfStudy: val })}
                options={COURSES.map(course => ({ value: course, label: course }))}
                placeholder="Select Course"
              />
              <ModernSelect
                label="Target University"
                value={formData.universityChoice}
                onChange={(val) => setFormData({ ...formData, universityChoice: val })}
                options={UNIVERSITIES.map(uni => ({ value: uni, label: uni }))}
                placeholder="Select University"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ModernSelect
                label="Department"
                value={formData.department}
                onChange={(val) => setFormData({ ...formData, department: val, bestSubjects: '' })}
                options={[
                  { value: 'Science', label: 'Science' },
                  { value: 'Commercial', label: 'Commercial' },
                  { value: 'Arts', label: 'Arts' },
                ]}
                placeholder="Select Department"
              />
              <ModernSelect
                label="Best Subject"
                value={formData.bestSubjects}
                onChange={(val) => setFormData({ ...formData, bestSubjects: val })}
                options={[
                  { value: '', label: bestSubjectOptions.length ? 'Select Best Subject' : 'No subjects registered yet' },
                  ...bestSubjectOptions,
                ]}
                placeholder={bestSubjectOptions.length ? 'Select Best Subject' : 'No subjects registered yet'}
              />
              <ModernSelect
                label="Exam Type"
                value={formData.examToRegister}
                onChange={(val) => setFormData({ ...formData, examToRegister: val })}
                options={[
                  { value: '', label: programmes.length ? 'Select Exam' : 'No exam programmes set yet' },
                  ...programmes.map((p) => ({ value: p.name, label: p.name })),
                ]}
              />
            </div>
          </section>

          {/* Parent Information */}
          <section className="space-y-4">
            <div className="flex items-center space-x-2 text-orange-600 mb-2">
              <Users className="w-5 h-5" />
              <h2 className="font-black uppercase tracking-wider text-sm">Parent / Guardian Details</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 ml-1">Parent Name</label>
                <input
                  required
                  value={formData.parentName}
                  onChange={(e) => setFormData({ ...formData, parentName: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
                  placeholder="Full Name"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 ml-1 text-emerald-600">Parent WhatsApp Number</label>
                <input
                  required
                  value={formData.parentWhatsApp}
                  onChange={(e) => setFormData({ ...formData, parentWhatsApp: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
                  placeholder="+234"
                />
              </div>
            </div>
          </section>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white font-black py-4 rounded-2xl shadow-xl shadow-orange-500/30 transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {loading ? (
              <span className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>Complete Registration</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
