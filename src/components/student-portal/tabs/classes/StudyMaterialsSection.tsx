import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAuth } from 'firebase/auth';
import {
  Search,
  BookOpen,
  User,
  X,
  WifiOff,
  PlayCircle,
} from 'lucide-react';
import { Student, StudyMaterial } from '../../../../types';
import { SubjectDropdown } from './SubjectDropdown';
import { useApp } from '../../../../context/AppContext';
import { MaterialViewer } from '../../../common/MaterialViewer';

/** One small type label per file on a material (batch 43, fixed in batch
 *  45). The type is read from each saved file's extension: first from the
 *  file name, then from the upload URL (some uploads kept a name without an
 *  extension, so the URL is what usually answers), and only then from the
 *  material's stamped type and the tutor's category. Cloudinary strips the
 *  extension from stored names, which is why name-only matching mislabelled
 *  image-only materials as Notes and mixed materials as PDF-only. */
const FILE_TYPES: Record<string, string> = {
  pdf: 'PDF', doc: 'DOCX', docx: 'DOCX', ppt: 'Slides', pptx: 'Slides',
  jpg: 'Image', jpeg: 'Image', png: 'Image', webp: 'Image', gif: 'Image',
  mp4: 'Video', webm: 'Video', mov: 'Video', mkv: 'Video', avi: 'Video',
};

const extOf = (raw: string): string => {
  const s = String(raw || '').split(/[?#]/)[0];
  const m = s.match(/\.([a-zA-Z0-9]{1,5})$/);
  return m ? m[1].toLowerCase() : '';
};

const typeOfFile = (name: string, url: string, fallback: string): string => {
  const ext = extOf(name) || extOf(url);
  return FILE_TYPES[ext] || fallback;
};

const typeLabelOfMaterial = (m: StudyMaterial): string => {
  if (m.type === 'video') return 'Video link';
  if (m.type === 'image') return 'Image';
  if (m.type === 'pdf') return 'PDF';
  return m.fileType || 'File';
};

const materialTypes = (m: StudyMaterial): string[] => {
  const out = new Set<string>();
  const byType = typeLabelOfMaterial(m);
  if (Array.isArray(m.files) && m.files.length) {
    m.files.forEach((f) => out.add(typeOfFile(f.name, f.url, byType)));
  } else {
    out.add(byType);
  }
  return Array.from(out);
};

/** One cached page: the materials the server sent for one subject at one
 *  page number, plus whether a next page exists. Pagination is decided on
 *  the server (batch 45); the browser only shows the page it was given. */
interface MaterialCache { page: number; subject: string; materials: StudyMaterial[]; hasMore: boolean; }
let cache: MaterialCache | null = null;
const PAGE_SIZE = 10;

interface StudyMaterialsSectionProps {
  student: Student;
  initialSubject?: string | null;
  onSwitchToTimetable?: () => void;
  /** Batch 43: one subject dropdown shared with Video classes. When the
   *  parent passes subject/onSubjectChange the two views stay in lockstep:
   *  a pick in either is the pick in both. */
  subject?: string;
  onSubjectChange?: (next: string) => void;
  /** The subjects the student is registered for. */
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
  const { addToast, activeCentreId } = useApp();
  const [internalSubject, setInternalSubject] = useState<string>(initialSubject || 'All');
  const selectedSubject = subject !== undefined ? subject : internalSubject;
  const setSelectedSubject = (next: string) =>
    onSubjectChange ? onSubjectChange(next) : setInternalSubject(next);
  const seed = cache && cache.subject === selectedSubject ? cache : null;
  const [materials, setMaterials] = useState<StudyMaterial[]>(seed?.materials || []);
  const [page, setPage] = useState<number>(seed?.page || 1);
  const [hasMore, setHasMore] = useState<boolean>(!!seed?.hasMore);
  const [loading, setLoading] = useState(!seed);
  const [paging, setPaging] = useState(false);
  const [err, setErr] = useState('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [readingMaterial, setReadingMaterial] = useState<StudyMaterial | null>(null);
  const [viewing, setViewing] = useState<StudyMaterial | null>(null);

  const centreId = String(student.centreId || activeCentreId || '');

  const dropdownSubjects = useMemo(
    () => (registeredSubjects && registeredSubjects.length ? registeredSubjects : []),
    [registeredSubjects],
  );

  const fetchPage = useCallback(async (nextPage: number, nextSubject: string, mode: 'full' | 'silent' | 'page') => {
    const user = getAuth().currentUser;
    if (!user) {
      setErr('You are signed out. Sign in again to continue.');
      setLoading(false);
      setPaging(false);
      return;
    }
    if (mode === 'full') { setLoading(true); setErr(''); }
    if (mode === 'page') { setPaging(true); setErr(''); }
    try {
      const token = await user.getIdToken();
      const qs = new URLSearchParams({ centreId, page: String(nextPage), limit: String(PAGE_SIZE) });
      if (nextSubject && nextSubject !== 'All') qs.set('subject', nextSubject);
      const res = await fetch(`/api/student/study-materials?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Could not load the study materials. Pull down to retry.');
      const data: any = await res.json().catch(() => null);
      const list = Array.isArray(data?.materials) ? data.materials : [];
      const hasMoreNext = !!data?.hasMore;
      cache = { page: nextPage, subject: nextSubject, materials: list, hasMore: hasMoreNext };
      setMaterials(list);
      setPage(nextPage);
      setHasMore(hasMoreNext);
      setErr('');
    } catch (e: any) {
      if (mode !== 'silent') setErr(e?.message || 'Could not load the study materials. Pull down to retry.');
    } finally {
      if (mode === 'full') setLoading(false);
      if (mode === 'page') setPaging(false);
    }
  }, [centreId]);

  // First open: render the cached page instantly when it matches the current
  // subject, otherwise fetch. Any subject change re-queries from page 1.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      if (cache && cache.subject === selectedSubject) void fetchPage(cache.page, selectedSubject, 'silent');
      else void fetchPage(1, selectedSubject, 'full');
      return;
    }
    void fetchPage(1, selectedSubject, cache && cache.subject === selectedSubject ? 'silent' : 'full');
  }, [selectedSubject, fetchPage]);

  const gotoPage = (next: number) => {
    if (next < 1 || paging) return;
    void fetchPage(next, selectedSubject, 'page');
  };

  // Search runs inside the loaded page; the server decides what a page is.
  const filteredMaterials = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter((m) => {
      const inTitle = m.title?.toLowerCase().includes(q);
      const inTopic = m.topic?.toLowerCase().includes(q);
      const inTutor = m.tutorName?.toLowerCase().includes(q);
      const inDesc = m.description?.toLowerCase().includes(q);
      return inTitle || inTopic || inTutor || inDesc;
    });
  }, [materials, searchQuery]);

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

  const cardBg = 'bg-white border-[#E2E8F0]';
  const textMain = 'text-[#0F172A]';
  const textSub = 'text-[#64748B]';

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`rounded-[20px] border p-3.5 ${cardBg} animate-pulse`}>
            <div className="h-5 w-24 rounded-md" style={{ background: 'var(--brand-soft, rgba(100,116,139,0.15))' }} />
            <div className="mt-3 space-y-2">
              <div className="h-3.5 w-3/4 rounded" style={{ background: 'var(--brand-soft, rgba(100,116,139,0.15))' }} />
              <div className="h-2.5 w-1/3 rounded" style={{ background: 'var(--brand-soft, rgba(100,116,139,0.15))' }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Error state */}
      {err && (
        <div className={`rounded-[20px] border px-4 py-6 text-center ${cardBg}`}>
          <WifiOff className={`w-5 h-5 mx-auto mb-2 ${textSub}`} />
          <p className={`text-xs font-bold ${textMain}`}>{err}</p>
          <button
            type="button"
            onClick={() => fetchPage(page, selectedSubject, 'page')}
            className={`mt-3 inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-[var(--brand,#0F172A)] text-[var(--on-brand,#fff)] text-xs font-extrabold cursor-pointer`}
          >
            Try again
          </button>
        </div>
      )}

      {/* Search Bar */}
      {!err && (
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by topic, keyword, or tutor name..."
            className="w-full h-11 pl-10 pr-4 rounded-xl bg-[#f8fafc] border border-[#E2E8F0] text-xs font-semibold text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:border-orange-500 shadow-2xs transition-all"
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
      )}

      {/* Subject dropdown (batch 43): the shared, app-branded filter that
          Study materials and Video classes keep in lockstep. */}
      {!err && (
        <SubjectDropdown dark={false} subjects={dropdownSubjects} value={selectedSubject} onChange={setSelectedSubject} />
      )}

      {/* Materials List */}
      {!err && (
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
                  : `Your tutors haven't uploaded study materials for ${selectedSubject === 'All' ? 'your subjects' : selectedSubject} yet. Check back soon.`}
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
                  {/* Top Row: Subject Badge + Type chips */}
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${style.bg} ${style.text} ${style.border}`}
                    >
                      {material.subject}
                    </span>

                    {/* One small chip per type on the material, read from
                        each file's real extension (batch 45 fix). */}
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
      )}

      {/* Pager (batch 45): the server sends one page at a time and decides
          whether a next page exists; the buttons only ask for it. */}
      {!err && materials.length > 0 && (hasMore || page > 1) && (
        <div className="flex items-center justify-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => gotoPage(page - 1)}
            disabled={page <= 1 || paging}
            className="h-9 px-3.5 rounded-xl border border-[#E2E8F0] bg-white text-[#0F172A] text-[11px] font-extrabold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className={`text-[11px] font-extrabold px-1 ${textSub}`}>{paging ? 'Loading' : `Page ${page}`}</span>
          <button
            type="button"
            onClick={() => gotoPage(page + 1)}
            disabled={!hasMore || paging}
            className="h-9 px-3.5 rounded-xl border border-[#E2E8F0] bg-white text-[#0F172A] text-[11px] font-extrabold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next page
          </button>
        </div>
      )}

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
