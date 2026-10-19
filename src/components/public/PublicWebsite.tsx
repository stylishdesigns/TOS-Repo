import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { PWAInstallButton } from '../pwa/PWAInstallButton';
import { ModernSelect } from '../ui/ModernSelect';
import {
  GraduationCap,
  Phone,
  Mail,
  MapPin,
  Clock,
  CheckCircle,
  Star,
  Award,
  BookOpen,
  ArrowRight,
  ShieldCheck,
  Send,
  Building2,
  Lock,
  ExternalLink,
  MessageSquare,
  Sparkles,
  Smartphone,
} from 'lucide-react';

export const PublicWebsite: React.FC = () => {
  const {
    settings,
    programmes,
    tutors,
    branches,
    testimonials,
    submitAdmission,
    setViewMode,
  } = useApp();

  const [registrationSubmitted, setRegistrationSubmitted] = useState(false);
  const [regForm, setRegForm] = useState({
    applicantName: '',
    email: '',
    phone: '',
    gender: 'Male' as 'Male' | 'Female',
    parentName: '',
    parentWhatsApp: '',
    programmeId: programmes[0]?.id || '',
    branchId: branches[0]?.id || '',
    subjectsString: 'English, Mathematics, Physics, Chemistry',
    notes: '',
  });

  const selectedProgramme = programmes.find((p) => p.id === regForm.programmeId) || programmes[0];

  const handleRegistrationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const subjects = regForm.subjectsString.split(',').map((s) => s.trim()).filter(Boolean);
    submitAdmission({
      ...regForm,
      programmeName: selectedProgramme?.name || 'JAMB Intensive',
      subjects,
    });
    setRegistrationSubmitted(true);
  };

  return (
    <div id="public-website-view" className="min-h-screen bg-white text-slate-900 flex flex-col font-sans">
      {/* 1. Announcement Ticker Banner */}
      {settings.announcementTicker && (
        <div className="bg-slate-950 text-white text-xs py-2 px-4 text-center font-medium border-b border-amber-500/30 flex items-center justify-center space-x-2">
          <span className="bg-amber-500 text-slate-950 text-[10px] font-black px-1.5 py-0.5 rounded uppercase">
            Notice
          </span>
          <span className="truncate">{settings.announcementTicker}</span>
        </div>
      )}

      {/* 2. Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-slate-950 border border-amber-500/40 flex items-center justify-center text-amber-500 shadow-sm">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <span className="text-base font-black tracking-tight text-slate-900 uppercase block leading-tight">
                {settings.centreName}
              </span>
              <span className="text-[10px] text-slate-500 font-semibold tracking-wider block uppercase">
                {settings.tagline}
              </span>
            </div>
          </div>

          {/* Quick links & Portal access */}
          <div className="flex items-center space-x-3">
            <a
              href={`https://wa.me/${(settings.whatsappNumber || settings.whatsapp || '+2348056765455').replace(/[^0-9]/g, '')}`}
              target="_blank"
              rel="noreferrer"
              className="hidden md:flex items-center space-x-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-2 rounded-lg transition-colors border border-emerald-200"
            >
              <span>WhatsApp Us: {settings.whatsappNumber || settings.whatsapp || '+234 805 676 5455'}</span>
            </a>

            <a
              href="#admissions"
              className="px-3.5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm transition-all"
            >
              Register Online
            </a>

            <PWAInstallButton variant="compact" className="hidden md:flex" />

            <button
              onClick={() => setViewMode('student')}
              className="px-3 py-2 text-xs font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-lg border border-orange-200 flex items-center space-x-1.5 transition-all shadow-2xs"
            >
              <Smartphone className="w-3.5 h-3.5 text-[#EA580C]" />
              <span>Student App</span>
            </button>

            <button
              onClick={() => setViewMode('portal')}
              className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200/80 flex items-center space-x-1.5"
            >
              <Lock className="w-3.5 h-3.5 text-slate-500" />
              <span>Staff Portal</span>
            </button>
          </div>
        </div>
      </header>

      {/* 3. Hero Section */}
      <section className="relative overflow-hidden bg-slate-950 text-white py-16 sm:py-24 border-b border-slate-800">
        <div className="absolute inset-0 z-0 opacity-20">
          <img
            src={settings.heroImageUrl}
            alt="Hero Background"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/90 to-transparent" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl space-y-6">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Academic Session {settings.academicSession} Intake Ongoing</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight text-white">
              {settings.heroTitle}
            </h1>

            <p className="text-sm sm:text-base text-slate-300 leading-relaxed font-normal">
              {settings.heroSubtitle}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <a
                href="#admissions"
                className="px-6 py-3.5 text-sm font-extrabold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl shadow-lg transition-all text-center flex items-center justify-center space-x-2"
              >
                <span>{settings.heroCtaText}</span>
                <ArrowRight className="w-4 h-4" />
              </a>

              <a
                href="#programmes"
                className="px-6 py-3.5 text-sm font-bold text-white bg-slate-800/80 hover:bg-slate-800 border border-slate-700 rounded-xl transition-all text-center"
              >
                View Programmes & Fees
              </a>
            </div>

            {/* Quick trust metrics */}
            <div className="grid grid-cols-3 gap-4 pt-6 border-t border-slate-800">
              <div>
                <span className="text-2xl sm:text-3xl font-black text-amber-400">
                  {settings.statsSuccessRate}%
                </span>
                <span className="block text-[11px] text-slate-400 font-medium">
                  First-Choice Admission Rate
                </span>
              </div>
              <div>
                <span className="text-2xl sm:text-3xl font-black text-white">
                  {settings.statsTotalStudents}+
                </span>
                <span className="block text-[11px] text-slate-400 font-medium">
                  Graduates Coached
                </span>
              </div>
              <div>
                <span className="text-2xl sm:text-3xl font-black text-amber-400">
                  {settings.statsTutors}+
                </span>
                <span className="block text-[11px] text-slate-400 font-medium">
                  Specialist Subject Tutors
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Programmes & Tuition Structure */}
      <section id="programmes" className="py-16 bg-slate-50 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="text-xs font-extrabold text-amber-600 tracking-wider uppercase">
              Curriculum & Tuition
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Academic Programmes & Examination Prep
            </h2>
            <p className="text-xs sm:text-sm text-slate-500">
              Structured lectures, comprehensive CBT simulations, past question drills, and continuous weekly diagnostic assessments.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {programmes.map((prog) => (
              <div
                key={prog.id}
                className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between hover:border-amber-400 transition-all group"
              >
                <div>
                  <div className="flex justify-between items-start">
                    <span className="px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-amber-50 text-amber-900 border border-amber-200">
                      {prog.code}
                    </span>
                    <div className="text-right">
                      <span className="text-xl font-black text-slate-900">
                        {settings.currencySymbol}
                        {(prog.fee || 0).toLocaleString()}
                      </span>
                      <span className="block text-[10px] text-slate-400">Full Cohort Fee</span>
                    </div>
                  </div>

                  <h3 className="text-lg font-black text-slate-900 mt-3 group-hover:text-amber-600 transition-colors">
                    {prog.name}
                  </h3>

                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                    {prog.description}
                  </p>

                  <div className="mt-4 pt-4 border-t border-slate-100 space-y-2 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Duration:</span>
                      <span className="font-bold text-slate-900">{prog.duration}</span>
                    </div>
                    <div>
                      <span className="text-[11px] font-bold text-slate-500 block mb-1">
                        Syllabus Covered:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {prog.subjects.map((sub, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-semibold"
                          >
                            {sub}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-5 mt-5 border-t border-slate-100">
                  <a
                    href="#admissions"
                    onClick={() => setRegForm({ ...regForm, programmeId: prog.id })}
                    className="w-full py-2.5 text-xs font-bold text-center text-slate-900 bg-slate-100 hover:bg-amber-500 hover:text-white rounded-lg transition-colors block"
                  >
                    Enroll In This Programme →
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Meet the Faculty / Tutors */}
      <section id="tutors" className="py-16 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="text-xs font-extrabold text-amber-600 tracking-wider uppercase">
              Proven Educators
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Meet Our Expert Tutorial Faculty
            </h2>
            <p className="text-xs sm:text-sm text-slate-500">
              Seasoned subject specialists with university degrees and over a decade of combined track record in national examinations.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {tutors.map((tutor) => (
              <div
                key={tutor.id}
                className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-white transition-all space-y-4 shadow-2xs"
              >
                <div className="flex items-center space-x-3.5">
                  <img
                    src={tutor.avatar}
                    alt={tutor.name}
                    className="w-14 h-14 rounded-full object-cover border-2 border-amber-500"
                  />
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-sm">{tutor.name}</h3>
                    <p className="text-[11px] text-amber-700 font-semibold">{tutor.qualifications}</p>
                    <div className="flex items-center text-amber-500 text-xs mt-0.5">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      <span className="ml-1 font-bold text-[10px]">{tutor.rating.toFixed(1)} / 5.0 Rating</span>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-600 italic leading-relaxed">
                  "{tutor.bio}"
                </p>

                <div className="pt-2 border-t border-slate-200">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                    Specialist Subjects:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {tutor.subjects.map((sub, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700 text-[10px] font-bold"
                      >
                        {sub}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. Hall of Fame / Testimonials */}
      <section className="py-16 bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="text-xs font-extrabold text-amber-400 tracking-wider uppercase">
              Hall of Fame
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Alumni Success Stories & High Scores
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Real results from students who trusted our tutorial method and secured university admissions.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <div
                key={t.id}
                className="p-6 rounded-2xl bg-slate-800/80 border border-slate-700 space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <img
                      src={t.photo}
                      alt={t.studentName}
                      className="w-11 h-11 rounded-full object-cover border border-amber-400/40"
                    />
                    <div>
                      <h4 className="font-extrabold text-white text-xs">{t.studentName}</h4>
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-black bg-amber-400 text-slate-950 mt-0.5">
                        {t.score}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 italic leading-relaxed">
                    "{t.quote}"
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-700 text-[11px] text-amber-300 font-semibold">
                  Admitted to {t.institutionAdmitted}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Online Admissions & Registration Form */}
      <section id="admissions" className="py-16 bg-slate-50 border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
            <div className="bg-slate-950 p-6 sm:p-8 text-white">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block mb-1">
                Online Registration & Enrolment
              </span>
              <h2 className="text-xl sm:text-2xl font-black">
                Register for {settings.centreName}
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Complete this form to reserve your seat for the {settings.academicSession} academic session.
              </p>
            </div>

            <div className="p-6 sm:p-8">
              {registrationSubmitted ? (
                <div className="text-center py-10 space-y-4">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-extrabold text-slate-900">
                    Application Submitted Successfully!
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto">
                    Thank you, <span className="font-bold">{regForm.applicantName}</span>. Your application is queued in the admissions registry. An SMS confirmation will be sent to <span className="font-mono font-bold">{regForm.phone}</span>.
                  </p>

                  {/* Bank payment instructions */}
                  <div className="max-w-md mx-auto p-4 bg-slate-50 rounded-2xl border border-slate-200 text-left text-xs space-y-2 mt-4">
                    <p className="font-extrabold text-slate-900 text-sm">
                      Tuition Bank Transfer Details:
                    </p>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Bank Name:</span>
                      <span className="font-bold text-slate-900">{settings.bankName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Account Number:</span>
                      <span className="font-mono font-black text-amber-600 text-sm">
                        {settings.bankAccountNumber}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Account Name:</span>
                      <span className="font-semibold text-slate-800">{settings.bankAccountName}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200 pt-1.5 font-bold">
                      <span>Total Tuition:</span>
                      <span className="text-emerald-700">
                        {settings.currencySymbol}
                        {(selectedProgramme?.fee || 0).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="pt-4 flex justify-center space-x-3">
                    <button
                      onClick={() => setRegistrationSubmitted(false)}
                      className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                    >
                      Submit Another Registration
                    </button>
                    <button
                      onClick={() => setViewMode('admin_portal')}
                      className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
                    >
                      Review in Admin Portal
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleRegistrationSubmit} className="space-y-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Student Full Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Samuel Adeleke"
                        value={regForm.applicantName}
                        onChange={(e) => setRegForm({ ...regForm, applicantName: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Student Phone Number *
                      </label>
                      <input
                        type="tel"
                        required
                        placeholder="+234 800 000 0000"
                        value={regForm.phone}
                        onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-mono"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Email Address</label>
                      <input
                        type="email"
                        placeholder="student@gmail.com"
                        value={regForm.email}
                        onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                      />
                    </div>

                    <div>
                      <ModernSelect
                        label="Gender"
                        value={regForm.gender}
                        onChange={(val) => setRegForm({ ...regForm, gender: val as any })}
                        options={[
                          { value: 'Male', label: 'Male' },
                          { value: 'Female', label: 'Female' }
                        ]}
                      />
                    </div>

                    <div>
                      <ModernSelect
                        label="Select Examination Programme *"
                        value={regForm.programmeId}
                        onChange={(val) => setRegForm({ ...regForm, programmeId: val })}
                        options={programmes.map((p) => ({
                          value: p.id,
                          label: `${p.name} (${settings.currencySymbol}${(p.fee || 0).toLocaleString()})`
                        }))}
                      />
                    </div>

                    <div>
                      <ModernSelect
                        label="Preferred Campus / Branch *"
                        value={regForm.branchId}
                        onChange={(val) => setRegForm({ ...regForm, branchId: val })}
                        options={branches.map((b) => ({
                          value: b.id,
                          label: `${b.name} (${b.city})`
                        }))}
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Parent / Guardian Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Mr. Adeleke"
                        value={regForm.parentName}
                        onChange={(e) => setRegForm({ ...regForm, parentName: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Parent / Guardian WhatsApp Number *
                      </label>
                      <input
                        type="tel"
                        required
                        placeholder="+234 802 000 0000"
                        value={regForm.parentWhatsApp}
                        onChange={(e) => setRegForm({ ...regForm, parentWhatsApp: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block font-bold text-slate-700 mb-1">
                        Exam Subjects to Prepare For (comma-separated)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. English, Mathematics, Physics, Chemistry"
                        value={regForm.subjectsString}
                        onChange={(e) => setRegForm({ ...regForm, subjectsString: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block font-bold text-slate-700 mb-1">
                        Additional Notes / Target Course
                      </label>
                      <textarea
                        rows={2}
                        placeholder="e.g. Aiming for 320+ to study Medicine at UNILAG..."
                        value={regForm.notes}
                        onChange={(e) => setRegForm({ ...regForm, notes: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="text-slate-500 text-[11px]">
                      Tuition Fee for selected programme:{' '}
                      <span className="font-extrabold text-slate-900">
                        {settings.currencySymbol}
                        {(selectedProgramme?.fee || 0).toLocaleString()}
                      </span>
                    </div>

                    <button
                      type="submit"
                      className="w-full sm:w-auto px-8 py-3 text-xs font-black text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-md transition-all flex items-center justify-center space-x-2"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Submit Online Registration</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 8. Campus Branches & Contacts */}
      <section id="campuses" className="py-16 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="text-xs font-extrabold text-amber-600 tracking-wider uppercase">
              Our Locations
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Visit Any of Our Campus Branches
            </h2>
            <p className="text-xs sm:text-sm text-slate-500">
              Equipped with CBT simulation computer laboratories, lecture halls, and library study spaces.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {branches.map((b) => (
              <div key={b.id} className="p-6 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="font-black text-slate-900 text-base">{b.name}</h3>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-white border border-slate-200 rounded">
                    {b.code}
                  </span>
                </div>
                <div className="space-y-1.5 text-xs text-slate-600">
                  <p className="flex items-center space-x-2">
                    <MapPin className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>{b.address}, {b.city}, {b.state}</span>
                  </p>
                  <p className="flex items-center space-x-2">
                    <Phone className="w-4 h-4 text-amber-600 shrink-0" />
                    <span className="font-mono">{b.phone}</span>
                  </p>
                  <p className="flex items-center space-x-2">
                    <Mail className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>{b.email}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 9. Footer */}
      <footer className="bg-slate-950 text-slate-400 text-xs py-12 border-t border-slate-800 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-black">
              E
            </div>
            <div>
              <p className="font-extrabold text-white">{settings.centreName}</p>
              <p className="text-[10px] text-slate-500">{settings.tagline}</p>
            </div>
          </div>

          <div className="text-center sm:text-right text-[11px] space-y-1">
            <p>© {new Date().getFullYear()} {settings.centreName}. All rights reserved.</p>
            <p className="text-slate-500">
              Powered by Excellence Tutorial Management System & Dynamic CMS Software.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};
