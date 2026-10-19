import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Palette,
  Globe,
  Layout,
  Save,
  CheckCircle,
  Eye,
  Sliders,
  Image,
  Bell,
  MessageSquare,
  Building,
  CreditCard,
  Plus,
  Trash2,
} from 'lucide-react';

export const CmsManager: React.FC = () => {
  const { settings, updateSettings, testimonials, addTestimonial, deleteTestimonial, setViewMode, addToast } = useApp();

  const [activeSubTab, setActiveSubTab] = useState<'branding' | 'hero' | 'announcements' | 'testimonials' | 'bank'>('branding');

  // Form state
  const [formData, setFormData] = useState({
    centreName: settings.centreName || '',
    tagline: settings.tagline || '',
    primaryColor: settings.primaryColor || '#f97316',
    accentColor: settings.accentColor || '#0ea5e9',
    currencySymbol: settings.currencySymbol || '₦',
    phone: settings.phone || '',
    whatsappNumber: settings.whatsappNumber || settings.whatsapp || '+234 805 676 5455',
    email: settings.email || '',
    address: settings.address || '',
    academicSession: settings.academicSession || '',
    heroTitle: settings.heroTitle || '',
    heroSubtitle: settings.heroSubtitle || '',
    heroCtaText: settings.heroCtaText || '',
    heroImageUrl: settings.heroImageUrl || '',
    announcementTicker: settings.announcementTicker || '',
    statsSuccessRate: settings.statsSuccessRate || '',
    statsTotalStudents: settings.statsTotalStudents || '',
    statsTutors: settings.statsTutors || '',
    bankName: settings.bankName || '',
    bankAccountNumber: settings.bankAccountNumber || '',
    bankAccountName: settings.bankAccountName || '',
  });

  // Testimonial modal state
  const [showTestimonialModal, setShowTestimonialModal] = useState(false);
  const [newTestimonial, setNewTestimonial] = useState({
    studentName: '',
    score: '328 in JAMB',
    programme: 'JAMB Intensive',
    quote: '',
    institutionAdmitted: 'University of Ibadan (Medicine)',
    photo: '',
    year: '2026',
  });

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings(formData);
    addToast({
      type: 'success',
      title: 'Website CMS Updated!',
      description: 'Your changes are live on the public website immediately.',
    });
  };

  const handleAddTestimonial = (e: React.FormEvent) => {
    e.preventDefault();
    addTestimonial(newTestimonial);
    setShowTestimonialModal(false);
    setNewTestimonial({
      studentName: '',
      score: '',
      programme: 'JAMB Intensive',
      quote: '',
      institutionAdmitted: '',
      photo: '',
      year: '2026',
    });
  };

  return (
    <div id="cms-manager-page" className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900 uppercase tracking-wider">
              No-Code Dynamic CMS
            </span>
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight mt-1">
            Website Content & Template Studio
          </h2>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">
            Customize branding, banners, hero text, announcements, and bank payment info without coding
          </p>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={() => setViewMode('website')}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg flex items-center space-x-1.5 shadow-2xs"
          >
            <Eye className="w-3.5 h-3.5 text-slate-500" />
            <span>Preview Live Site</span>
          </button>

          <button
            onClick={handleSaveSettings}
            className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm flex items-center space-x-1.5"
          >
            <Save className="w-3.5 h-3.5 text-amber-400" />
            <span>Publish Changes</span>
          </button>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {[
          { id: 'branding', label: 'Branding & Identity', icon: Palette },
          { id: 'hero', label: 'Hero Banner & Copy', icon: Layout },
          { id: 'announcements', label: 'Notice Ticker & Stats', icon: Bell },
          { id: 'bank', label: 'Bursary Bank Details', icon: CreditCard },
          { id: 'testimonials', label: 'Hall of Fame & Testimonials', icon: MessageSquare },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
                isActive
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Form Body */}
      <form onSubmit={handleSaveSettings}>
        {/* SUBTAB 1: BRANDING */}
        {activeSubTab === 'branding' && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Institute Identity & Contacts</h3>
              <p className="text-xs text-slate-500">
                Setup for selling this software to any tutorial centre: changes here rebrand the entire website and receipt headers.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Tutorial Centre Name *</label>
                <input
                  type="text"
                  required
                  value={formData.centreName}
                  onChange={(e) => setFormData({ ...formData, centreName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Centre Tagline / Motto *</label>
                <input
                  type="text"
                  required
                  value={formData.tagline}
                  onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Official Support Phone</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">WhatsApp Admissions Line</label>
                <input
                  type="text"
                  value={formData.whatsappNumber}
                  onChange={(e) => setFormData({ ...formData, whatsappNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Support Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Current Academic Session</label>
                <input
                  type="text"
                  value={formData.academicSession}
                  onChange={(e) => setFormData({ ...formData, academicSession: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Main Campus Address</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Currency Symbol</label>
                <input
                  type="text"
                  value={formData.currencySymbol}
                  onChange={(e) => setFormData({ ...formData, currencySymbol: e.target.value })}
                  className="w-24 px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold"
                />
              </div>
            </div>
          </div>
        )}

        {/* SUBTAB 2: HERO BANNER & COPY */}
        {activeSubTab === 'hero' && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Hero Section & Headline Copy</h3>
              <p className="text-xs text-slate-500">
                The first thing prospective parents and students see when visiting the website.
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Hero Main Heading *</label>
                <input
                  type="text"
                  required
                  value={formData.heroTitle}
                  onChange={(e) => setFormData({ ...formData, heroTitle: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Hero Subtitle Paragraph</label>
                <textarea
                  rows={3}
                  value={formData.heroSubtitle}
                  onChange={(e) => setFormData({ ...formData, heroSubtitle: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Call to Action (CTA) Button Label</label>
                  <input
                    type="text"
                    value={formData.heroCtaText}
                    onChange={(e) => setFormData({ ...formData, heroCtaText: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Hero Banner Image URL</label>
                  <input
                    type="url"
                    value={formData.heroImageUrl}
                    onChange={(e) => setFormData({ ...formData, heroImageUrl: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              {/* Image Preview */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center space-x-4">
                <img
                  src={formData.heroImageUrl}
                  alt="Hero Preview"
                  className="w-32 h-20 object-cover rounded-lg border border-slate-300"
                />
                <div className="text-xs text-slate-500">
                  <p className="font-bold text-slate-700">Image Live Preview</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    High resolution academic imagery representing classroom excellence.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SUBTAB 3: ANNOUNCEMENT TICKER & STATS */}
        {activeSubTab === 'announcements' && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Urgent Announcements & Verified Stats</h3>
              <p className="text-xs text-slate-500">
                Flash bar at the very top of the website and trust proof metrics.
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Top Bar Announcement Ticker Text
                </label>
                <input
                  type="text"
                  value={formData.announcementTicker}
                  onChange={(e) => setFormData({ ...formData, announcementTicker: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Success Rate (%)</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={formData.statsSuccessRate}
                    onChange={(e) => setFormData({ ...formData, statsSuccessRate: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Alumni / Total Students</label>
                  <input
                    type="number"
                    value={formData.statsTotalStudents}
                    onChange={(e) => setFormData({ ...formData, statsTotalStudents: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Experienced Faculty Count</label>
                  <input
                    type="number"
                    value={formData.statsTutors}
                    onChange={(e) => setFormData({ ...formData, statsTutors: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SUBTAB 4: BANK DETAILS */}
        {activeSubTab === 'bank' && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Tuition Payment Bank Account</h3>
              <p className="text-xs text-slate-500">
                Shown to candidates at the end of the online registration form to pay via direct bank transfer or USSD.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Bank Name *</label>
                <input
                  type="text"
                  required
                  value={formData.bankName}
                  onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Account Number *</label>
                <input
                  type="text"
                  required
                  value={formData.bankAccountNumber}
                  onChange={(e) => setFormData({ ...formData, bankAccountNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Account Beneficiary Name *</label>
                <input
                  type="text"
                  required
                  value={formData.bankAccountName}
                  onChange={(e) => setFormData({ ...formData, bankAccountName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>
            </div>

            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs">
              <span className="font-bold">Student Bursary Notice:</span> When students register online, these account details will be presented with their auto-generated payment reference code so their parent can make immediate transfers.
            </div>
          </div>
        )}

        {/* SUBTAB 5: TESTIMONIALS */}
        {activeSubTab === 'testimonials' && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Hall of Fame & Alumni Testimonials</h3>
                <p className="text-xs text-slate-500">
                  Highlight success stories on the public landing page to drive conversion.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowTestimonialModal(true)}
                className="px-3 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg flex items-center space-x-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Testimonial</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {testimonials.map((t) => (
                <div key={t.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 relative group flex flex-col justify-between">
                  <div>
                    <div className="flex items-center space-x-3 mb-3">
                      <img src={t.photo} alt={t.studentName} className="w-10 h-10 rounded-full object-cover" />
                      <div>
                        <p className="font-bold text-slate-900 text-xs">{t.studentName}</p>
                        <p className="text-[10px] font-bold text-amber-600">{t.score}</p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-600 italic">"{t.quote}"</p>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-200 flex justify-between items-center text-[10px] text-slate-400">
                    <span className="truncate">{t.institutionAdmitted}</span>
                    <button
                      type="button"
                      onClick={() => deleteTestimonial(t.id)}
                      className="text-slate-300 hover:text-red-600 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-4 flex justify-end">
          <button
            type="submit"
            className="px-6 py-2.5 text-xs font-extrabold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-md transition-all flex items-center space-x-2"
          >
            <Save className="w-4 h-4" />
            <span>Save & Publish All CMS Settings</span>
          </button>
        </div>
      </form>

      {/* Add Testimonial Modal */}
      {showTestimonialModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="font-extrabold text-slate-900 text-base mb-3">Add Hall of Fame Story</h3>
            <form onSubmit={handleAddTestimonial} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Student Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. David Adeyemi"
                  value={newTestimonial.studentName}
                  onChange={(e) => setNewTestimonial({ ...newTestimonial, studentName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Exam Score</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 338 in UTME"
                  value={newTestimonial.score}
                  onChange={(e) => setNewTestimonial({ ...newTestimonial, score: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Admitted University & Course</label>
                <input
                  type="text"
                  placeholder="e.g. University of Lagos (Medicine & Surgery)"
                  value={newTestimonial.institutionAdmitted}
                  onChange={(e) => setNewTestimonial({ ...newTestimonial, institutionAdmitted: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Testimonial Quote</label>
                <textarea
                  rows={2}
                  required
                  placeholder="The rigorous mock tests prepared me..."
                  value={newTestimonial.quote}
                  onChange={(e) => setNewTestimonial({ ...newTestimonial, quote: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowTestimonialModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-white bg-slate-900 hover:bg-slate-800 rounded-lg font-bold"
                >
                  Add Story
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
