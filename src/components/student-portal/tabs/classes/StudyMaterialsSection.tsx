import React, { useState, useMemo } from 'react';
import {
  Search,
  BookOpen,
  Calendar,
  User,
  CheckCircle,
  X,
  ExternalLink,
  FileDown,
  Layers,
  PlayCircle,
} from 'lucide-react';
import { Student, StudyMaterial } from '../../../../types';
import { SubjectDropdown } from './SubjectDropdown';

/** One small type label per file on a material (batch 43). The type is read
 *  from each saved file's extension when the material carries files, and
 *  from the material's own type otherwise. */
const FILE_TYPES: Record<string, string> = {
  pdf: 'PDF', doc: 'DOCX', docx: 'DOCX', ppt: 'Slides', pptx: 'Slides',
  jpg: 'Image', jpeg: 'Image', png: 'Image', webp: 'Image', gif: 'Image',
  mp4: 'Video', webm: 'Video', mov: 'Video', mkv: 'Video', avi: 'Video',
};

const typeOfFileName = (name: string, fallback: string): string => {
  const ext = (String(name || '').split('.').pop() || '').toLowerCase();
  return FILE_TYPES[ext] || fallback;
};

const materialTypes = (m: StudyMaterial): string[] => {
  const out = new Set<string>();
  if (Array.isArray(m.files) && m.files.length) {
    m.files.forEach((f) => out.add(typeOfFileName(f.name, m.fileType || 'File')));
  } else if (m.type === 'video') out.add('Video link');
  else if (m.type === 'image') out.add('Image');
  else out.add(m.fileType || 'PDF');
  return Array.from(out);
};
import { useApp } from '../../../../context/AppContext';
import { MaterialViewer } from '../../../common/MaterialViewer';

interface StudyMaterialsSectionProps {
  student: Student;
  initialSubject?: string | null;
  onSwitchToTimetable?: () => void;
  /** Batch 43: one subject dropdown shared with Video classes. When the
   *  parent passes subject/onSubjectChange the two views stay in lockstep:
   *  a pick in either is the pick in both. */
  subject?: string;
  onSubjectChange?: (next: string) => void;
  /** The subjects the student is registered for; falls back to the subjects
   *  present on the materials. */
  registeredSubjects?: string[];
}

const SUBJECT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Mathematics: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  Physics: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  'English Language': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  Chemistry: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  Biology: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
  'Further Mathematics': { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  General: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
};

export const StudyMaterialsSection: React.FC<StudyMaterialsSectionProps> = ({
  student,
  initialSubject,
  onSwitchToTimetable,
  subject,
  onSubjectChange,
  registeredSubjects,
}) => {
  const { studyMaterials = [], addToast } = useApp();
  const [internalSubject, setInternalSubject] = useState<string>(initialSubject || 'All');
  const selectedSubject = subject !== undefined ? subject : internalSubject;
  const setSelectedSubject = (next: string) =>
    onSubjectChange ? onSubjectChange(next) : setInternalSubject(next);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [readingMaterial, setReadingMaterial] = useState<StudyMaterial | null>(null);
  const [viewing, setViewing] = useState<StudyMaterial | null>(null);

  // Extract unique subjects
  const availableSubjects = useMemo(() => {
    const list = new Set<string>();
    // Only subjects that actually have materials here get a filter chip; a
    // student subject with no uploads shows no chip.
    studyMaterials.forEach((m) => {
      if (m.subject) list.add(m.subject);
    });
    return Array.from(list);
  }, [studyMaterials]);

  // Dropdown options: the student's registered subjects when the parent
  // supplies them, otherwise the subjects on the materials themselves.
  const dropdownSubjects = useMemo(
    () => (registeredSubjects && registeredSubjects.length ? registeredSubjects : Array.from(availableSubjects)),
    [registeredSubjects, availableSubjects],
  );

  // Filtered materials
  const filteredMaterials = useMemo(() => {
    return studyMaterials.filter((m) => {
      const matchesSubject = selectedSubject === 'All' || m.subject.toLowerCase() === selectedSubject.toLowerCase();
      if (!matchesSubject) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const inTitle = m.title?.toLowerCase().includes(q);
      const inTopic = m.topic?.toLowerCase().includes(q);
      const inTutor = m.tutorName?.toLowerCase().includes(q);
      const inDesc = m.description?.toLowerCase().includes(q);
      return inTitle || inTopic || inTutor || inDesc;
    });
  }, [studyMaterials, selectedSubject, searchQuery]);

  const handleDownload = (material: StudyMaterial, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const target = material.type === 'video' ? material.videoUrl : material.downloadUrl;
    if (target) {
      setViewing(material);
    } else {
      addToast({
        type: 'info',
        title: 'No file yet',
        description: 'This material has no file attached yet.',
      });
    }
  };

  const formatUploadedDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      }
    } catch {}
    return 'Recently';
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Header: the title alone (batch 43). */}
      <div className="pt-1">
        <h2 className="text-xl font-black text-slate-900 tracking-tight">
          Study Materials
        </h2>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by topic, keyword, or tutor name..."
          className="w-full h-11 pl-10 pr-4 rounded-xl bg-white border border-[#E2E8F0] text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-orange-500 shadow-2xs transition-all"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-md"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Subject dropdown (batch 43): the shared, app-branded filter that
          Study materials and Video classes keep in lockstep. */}
      <SubjectDropdown dark={false} subjects={dropdownSubjects} value={selectedSubject} onChange={setSelectedSubject} />

      {/* Materials List */}
      <div className="space-y-3">
        {filteredMaterials.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-200/90 p-6 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-orange-50 border border-orange-100 text-orange-600 flex items-center justify-center mx-auto">
              <BookOpen className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-black text-slate-900">No Study Materials Found</h4>
            <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed font-medium">
              {searchQuery
                ? `No materials matched "${searchQuery}". Try a different keyword.`
                : `Your tutors haven't uploaded study materials for ${selectedSubject} yet. Check back soon.`}
            </p>
            {onSwitchToTimetable && (
              <button
                type="button"
                onClick={onSwitchToTimetable}
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-[var(--brand,#0f172a)] text-[var(--on-brand,#fff)] font-extrabold text-xs shadow-sm hover:brightness-110 transition-all cursor-pointer"
              >
                <span>View Timetable</span>
              </button>
            )}
          </div>
        ) : (
          filteredMaterials.map((material) => {
            const style = SUBJECT_COLORS[material.subject] || {
              bg: 'bg-slate-50',
              text: 'text-slate-700',
              border: 'border-slate-200',
            };

            return (
              <div
                key={material.id}
                onClick={() => setReadingMaterial(material)}
                className="bg-white rounded-[20px] p-4.5 border border-[#E2E8F0] shadow-2xs hover:border-slate-300 transition-all cursor-pointer space-y-3 group active:scale-[0.99]"
              >
                {/* Top Row: Subject Badge + File Type/Size */}
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${style.bg} ${style.text} ${style.border}`}
                  >
                    {material.subject}
                  </span>

                  {/* Type chips only (batch 43): one small chip per type on
                      the material - PDF, image, video link - and the file
                      size is gone. */}
                  <span className="flex flex-wrap gap-1 justify-end shrink-0">
                    {materialTypes(material).map((t) => (
                      <span key={t} className="text-[10px] font-black uppercase tracking-wider text-slate-500 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200/60">
                        {t}
                      </span>
                    ))}
                  </span>
                </div>

                {/* Title & Topic */}
                <div className="space-y-1">
                  <h3 className="text-[15px] font-black text-[#0F172A] tracking-tight group-hover:text-[var(--brand,#EA580C)] transition-colors leading-snug">
                    {material.title}
                  </h3>
                  {material.topic && (
                    <p className="text-xs text-orange-600 font-extrabold">
                      Topic: {material.topic}
                    </p>
                  )}
                  {material.description && (
                    <p className="text-xs text-slate-500 font-medium line-clamp-2 leading-relaxed">
                      {material.description}
                    </p>
                  )}
                </div>

                {/* Footer Row: Tutor info & Action buttons */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center space-x-1.5 text-slate-500 font-medium truncate">
                    <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{material.tutorName || 'Course Tutor'}</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-[11px] text-slate-400 shrink-0">
                      {formatUploadedDate(material.uploadedAt)}
                    </span>
                  </div>

                  <div className="flex items-center shrink-0">
                    {/* One plain Open button (batch 43): the Read button and
                        the download-style arrow icon are gone. */}
                    <button
                      type="button"
                      onClick={(e) => handleDownload(material, e)}
                      className="px-3 py-1.5 rounded-lg bg-orange-700 hover:bg-orange-600 text-white font-extrabold text-[11px] shadow-2xs cursor-pointer transition-all active:scale-95"
                    >
                      <span>Open</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Reading Handout Modal */}
      {readingMaterial && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={readingMaterial.title}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setReadingMaterial(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col relative"
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-black uppercase text-orange-700 tracking-wider block">
                  {readingMaterial.subject} · {readingMaterial.topic || 'Lecture Note'}
                </span>
                <h3 className="text-base font-black text-slate-900 tracking-tight leading-snug mt-0.5">
                  {readingMaterial.title}
                </h3>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  Uploaded by {readingMaterial.tutorName}{readingMaterial.pages ? ` · ${readingMaterial.pages} pages` : ''}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setReadingMaterial(null)}
                aria-label="Close"
                className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center cursor-pointer shrink-0 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content Scroll */}
            <div className="flex-1 overflow-y-auto py-4 space-y-4 text-xs text-slate-700 leading-relaxed font-medium">
              <div className="p-3.5 bg-orange-50/60 rounded-2xl border border-orange-100 space-y-1">
                <h4 className="text-xs font-black text-orange-700 uppercase tracking-wider flex items-center gap-1.5">
                  <span>Overview & Objectives</span>
                </h4>
                <p className="text-slate-600">
                  {readingMaterial.description || 'The tutor has not added a description for this material yet.'}
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setReadingMaterial(null)}
                className="h-11 px-4 rounded-xl text-slate-600 hover:text-slate-900 font-extrabold text-xs transition-colors cursor-pointer"
              >
                Close Preview
              </button>

              <button
                type="button"
                onClick={() => handleDownload(readingMaterial)}
                className="h-11 px-5 rounded-xl bg-orange-700 hover:bg-orange-600 text-white font-extrabold text-xs flex items-center space-x-2 shadow-sm transition-all cursor-pointer active:scale-95"
              >
                {readingMaterial.type === 'video' ? (
                  <PlayCircle className="w-4 h-4" />
                ) : (
                  <BookOpen className="w-4 h-4" />
                )}
                <span>{readingMaterial.type === 'video' ? 'Watch video' : readingMaterial.type === 'image' ? 'View image' : 'Open file'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      <MaterialViewer material={viewing} onClose={() => setViewing(null)} />
    </div>
  );
};
