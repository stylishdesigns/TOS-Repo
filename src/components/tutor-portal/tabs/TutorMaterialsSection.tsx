import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  FileText,
  Image as ImageIcon,
  PlayCircle,
  Search,
  Plus,
  X,
  BookOpen,
  Layers,
  UploadCloud,
  Link2,
  Info,
  Pencil,
  Trash2,
} from 'lucide-react';
import { Tutor, TimetableSlot, StudyMaterial } from '../../../types';
import { useApp } from '../../../context/AppContext';
import { useScrollLock } from '../../../hooks/useScrollLock';
import { uploadStudyMaterialFile } from '../../../lib/studyMaterialUpload';
import { MaterialViewer, PdfDocumentView, toEmbedUrl } from '../../common/MaterialViewer';

type MaterialType = 'pdf' | 'image' | 'video';

interface TutorMaterialsSectionProps {
  tutor: Tutor;
  // Subjects the tutor takes, including ones picked up from the timetable.
  subjects?: string[];
  // When set, the add sheet opens straight away for this scheduled class and
  // the material is tied to its topic (the timetable's Add-material action).
  addForClass?: TimetableSlot | null;
  onClassHandled?: () => void;
}

const TYPE_LABEL: Record<MaterialType, string> = {
  pdf: 'PDF document',
  image: 'Image',
  video: 'Video link',
};

const formatDay = (iso: string) => {
  try {
    const d = new Date(iso);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    }
  } catch {}
  return iso;
};

const formatUploaded = (iso: string) => {
  try {
    const d = new Date(iso);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  } catch {}
  return 'Recently';
};

export const TutorMaterialsSection: React.FC<TutorMaterialsSectionProps> = ({
  tutor,
  subjects: subjectsProp,
  addForClass,
  onClassHandled,
}) => {
  const { studyMaterials = [], addStudyMaterial, updateStudyMaterial, deleteStudyMaterial, activeCentreId } = useApp();

  const [view, setView] = useState<'general' | 'topic'>('general');
  const [searchQuery, setSearchQuery] = useState('');

  // Add-material sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [materialKind, setMaterialKind] = useState<'general' | 'topic'>('general');
  const [materialType, setMaterialType] = useState<MaterialType>('pdf');
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [videoUrl, setVideoUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState('');
  const [viewing, setViewing] = useState<StudyMaterial | null>(null);
  const [uploadProgress, setUploadProgress] = useState('');

  // Material details (info) sheet state
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Edit reuses the upload form with the material prefilled, so saved files
  // can be dropped or replaced one by one exactly like a fresh upload.
  const [editId, setEditId] = useState<string | null>(null);
  const [existingFiles, setExistingFiles] = useState<Array<{ url: string; name?: string; sizeLabel?: string }>>([]);

  // Live thumbnails for the picked files (object URLs, revoked when they change).
  const previews = useMemo(
    () => files.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : '')),
    [files],
  );
  useEffect(() => () => { previews.forEach((u) => u && URL.revokeObjectURL(u)); }, [previews]);

  const classCtx = addForClass || null;
  const subjects: string[] =
    subjectsProp && subjectsProp.length > 0
      ? subjectsProp
      : Array.isArray(tutor.subjects)
        ? tutor.subjects
        : [];

  // Opened straight from a scheduled class: the material is topic-bound.
  useEffect(() => {
    if (classCtx) {
      setSheetOpen(true);
      setMaterialKind('topic');
      setMaterialType('pdf');
      setSubject(classCtx.subject || '');
      setTopic(classCtx.topic || '');
      setTitle('');
      setDescription('');
      setFiles([]);
      setVideoUrl('');
      setFormError('');
      setEditId(null);
      setExistingFiles([]);
    }
  }, [classCtx?.id]);

  useScrollLock(sheetOpen || !!detailsId || !!viewing);

  const closeSheet = () => {
    setEditId(null);
    setExistingFiles([]);
    setSheetOpen(false);
    if (classCtx) onClassHandled?.();
  };

  const openFresh = (kind: 'general' | 'topic') => {
    setSheetOpen(true);
    setMaterialKind(kind);
    setMaterialType('pdf');
    setTitle('');
    setSubject('');
    setTopic('');
    setDescription('');
    setFiles([]);
    setVideoUrl('');
    setFormError('');
  };

  const generalMaterials = useMemo(
    () => studyMaterials.filter((m) => m.kind !== 'topic'),
    [studyMaterials],
  );
  const topicMaterials = useMemo(
    () => studyMaterials.filter((m) => m.kind === 'topic'),
    [studyMaterials],
  );

  const filterBy = (list: StudyMaterial[]) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((m) =>
      [m.title, m.subject, m.topic, m.tutorName, m.description]
        .some((v) => (v || '').toLowerCase().includes(q)),
    );
  };

  const shownMaterials = useMemo(
    () => filterBy(view === 'general' ? generalMaterials : topicMaterials).sort(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, generalMaterials, topicMaterials, searchQuery],
  );

  const handleSubmit = async () => {
    setFormError('');
    if (editId) return handleEditSubmit();
    if (!title.trim()) return setFormError('Give the material a title.');
    if (!subject.trim()) return setFormError('Pick the subject this material belongs to.');
    if (materialKind === 'topic' && !topic.trim()) {
      return setFormError('Write the lesson topic this material is for.');
    }
    if (materialType === 'video') {
      if (!/^https?:\/\//i.test(videoUrl.trim())) {
        return setFormError('Paste the full video link, starting with https://');
      }
    } else if (files.length === 0) {
      return setFormError(`Choose at least one ${materialType === 'pdf' ? 'PDF' : 'image'} to upload.`);
    }

    setUploading(true);
    try {
      let url = videoUrl.trim();
      let fileName = '';
      let sizeLabel: string | undefined;
      let uploadedFiles: Array<{ url: string; name: string; sizeLabel?: string }> | undefined;
      if (materialType !== 'video' && files.length > 0) {
        const results: Array<{ url: string; name: string; sizeLabel?: string }> = [];
        let bytes = 0;
        for (let i = 0; i < files.length; i++) {
          setUploadProgress(`${i + 1} of ${files.length}`);
          const up = await uploadStudyMaterialFile(files[i], activeCentreId);
          results.push({ url: up.url, name: up.name, sizeLabel: up.sizeLabel });
          bytes += files[i].size;
        }
        setUploadProgress('');
        uploadedFiles = results;
        url = results[0].url;
        fileName = results.length > 1 ? `${results.length} files` : results[0].name;
        sizeLabel = bytes > 0 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : undefined;
      }
      await addStudyMaterial({
        title: title.trim(),
        subject: subject.trim(),
        topic: materialKind === 'topic' ? topic.trim() : undefined,
        description: description.trim() || undefined,
        tutorName: tutor.name,
        tutorId: tutor.id,
        fileType: materialType === 'pdf' ? 'PDF' : 'NOTES',
        fileSize: sizeLabel,
        downloadUrl: url,
        files: uploadedFiles,
        kind: materialKind,
        type: materialType,
        videoUrl: materialType === 'video' ? videoUrl.trim() : undefined,
        fileName: fileName || undefined,
        classId: classCtx?.id,
        classDate: classCtx?.date,
        classTime: classCtx?.time,
      } as any);
      closeSheet();
    } catch (err: any) {
      setFormError(err?.message || 'The material could not be added. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const renderMaterial = (m: StudyMaterial) => {
    const isVideo = m.type === 'video';
    const isImage = m.type === 'image';
    const target = isVideo ? m.videoUrl : m.downloadUrl;
    return (
      <div
        key={m.id}
        className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col gap-3 hover:border-slate-300 transition-all"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start space-x-3.5 min-w-0 flex-1">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            isVideo ? 'bg-rose-50 text-rose-500' : isImage ? 'bg-sky-50 text-sky-500' : 'bg-slate-100 text-slate-500'
          }`}>
            {isVideo ? <PlayCircle className="w-5 h-5" /> : isImage ? <ImageIcon className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black text-slate-900 leading-tight truncate">{m.title}</p>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200/70">
                {m.subject}
              </span>
              {m.kind === 'topic' && m.topic && (
                <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-[var(--brand,#EA580C)]/10 text-[var(--brand,#EA580C)] border border-[var(--brand,#EA580C)]/20 truncate max-w-[180px]">
                  {m.topic}
                </span>
              )}
              {m.classDate && (
                <span className="text-[9px] font-bold text-slate-500 flex items-center">
                  {formatDay(m.classDate)}
                </span>
              )}
            </div>
            <p className="text-[10px] font-bold text-slate-400 mt-1.5">
              {m.tutorName || 'Tutor'} · {formatUploaded(m.uploadedAt)}{m.fileSize ? ` · ${m.fileSize}` : ''}
            </p>
          </div>
        </div>
          <button
            type="button"
            aria-label="Material details"
            onClick={(e) => { e.stopPropagation(); openDetails(m); }}
            className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 hover:bg-slate-200 transition-all cursor-pointer"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>

        {/* View action sits at the bottom of the card, full width. */}
        {target ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setViewing(m); }}
            className="w-full h-10 rounded-xl bg-[var(--brand,#0f172a)] text-[var(--on-brand,#fff)] text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 hover:brightness-110 transition-all cursor-pointer"
          >
            {isVideo ? <PlayCircle className="w-4 h-4" /> : <BookOpen className="w-4 h-4" />}
            View
          </button>
        ) : (
          <span className="w-full h-10 rounded-xl bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest border border-slate-100 flex items-center justify-center">
            No file
          </span>
        )}
      </div>
    );
  };

  // Details (info) sheet: shows the material, its details, an edit mode and
  // a delete action at the bottom.
  const detailsMaterial = useMemo(
    () => studyMaterials.find((m) => m.id === detailsId) || null,
    [studyMaterials, detailsId],
  );
  const detailFiles: Array<{ url: string; name?: string }> = detailsMaterial
    ? detailsMaterial.files && detailsMaterial.files.length > 0
      ? detailsMaterial.files.map((f) => ({ url: f.url, name: f.name }))
      : detailsMaterial.downloadUrl
        ? [{ url: detailsMaterial.downloadUrl, name: detailsMaterial.fileName }]
        : []
    : [];
  const detailFirst = detailFiles[0];
  const detailIsVideo = !!detailsMaterial?.videoUrl && detailsMaterial.type === 'video';
  const detailIsImage = !!detailFirst && (detailsMaterial?.type === 'image' || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(detailFirst.url));

  const openDetails = (m: StudyMaterial) => {
    setDetailsId(m.id);
    setConfirmDelete(false);
  };
  const closeDetails = () => {
    setDetailsId(null);
    setConfirmDelete(false);
  };

  // Edit opens the same form used for uploading, prefilled with the saved
  // material. Files show in the same tile grid, each removable, and newly
  // picked files upload on save.
  const editingMaterial = useMemo(
    () => (editId ? studyMaterials.find((m) => m.id === editId) || null : null),
    [studyMaterials, editId],
  );
  const openEdit = (m: StudyMaterial) => {
    setDetailsId(null);
    setEditId(m.id);
    setMaterialKind(m.kind === 'topic' ? 'topic' : 'general');
    setMaterialType((m.type as MaterialType) || 'pdf');
    setTitle(m.title || '');
    setSubject(m.subject || '');
    setTopic(m.topic || '');
    setDescription(m.description || '');
    setVideoUrl(m.type === 'video' ? m.videoUrl || '' : '');
    setFiles([]);
    setExistingFiles(
      m.files && m.files.length > 0
        ? m.files.map((f) => ({ url: f.url, name: f.name, sizeLabel: (f as any).sizeLabel }))
        : m.downloadUrl
          ? [{ url: m.downloadUrl, name: m.fileName }]
          : [],
    );
    setFormError('');
    setSheetOpen(true);
  };
  const handleEditSubmit = async () => {
    const original = editingMaterial;
    if (!editId || !original) return setFormError('This material could not be found. Close this form and try again.');
    if (!title.trim()) return setFormError('Give the material a title.');
    if (!subject.trim()) return setFormError('Pick the subject this material belongs to.');
    if (materialKind === 'topic' && !topic.trim()) return setFormError('Write the lesson topic this material is for.');
    if (materialType === 'video' && !/^https?:\/\//i.test(videoUrl.trim())) {
      return setFormError('Paste the full video link, starting with https://');
    }
    if (materialType !== 'video' && files.length === 0 && existingFiles.length === 0) {
      return setFormError('Keep at least one file on this material. Delete the material instead if it should go away.');
    }
    setUploading(true);
    try {
      if (materialType === 'video') {
        await updateStudyMaterial(editId, {
          title: title.trim(),
          subject: subject.trim(),
          topic: materialKind === 'topic' ? topic.trim() : undefined,
          description: description.trim() || undefined,
          type: 'video',
          videoUrl: videoUrl.trim(),
          downloadUrl: videoUrl.trim(),
        } as any);
      } else {
        const results: Array<{ url: string; name: string; sizeLabel?: string }> = [];
        let newBytes = 0;
        for (let i = 0; i < files.length; i++) {
          setUploadProgress(`${i + 1} of ${files.length}`);
          const up = await uploadStudyMaterialFile(files[i], activeCentreId);
          results.push({ url: up.url, name: up.name, sizeLabel: up.sizeLabel });
          newBytes += files[i].size;
        }
        setUploadProgress('');
        const combined = [...existingFiles, ...results];
        const hasPdf = combined.some((f) => (f.name || '').toLowerCase().endsWith('.pdf') || f.url.toLowerCase().includes('.pdf'));
        const originalUrls = original.files && original.files.length > 0
          ? original.files.map((f) => f.url)
          : original.downloadUrl ? [original.downloadUrl] : [];
        const sameFiles = JSON.stringify(originalUrls) === JSON.stringify(combined.map((f) => f.url));
        let fileSize: string | undefined;
        if (sameFiles) {
          fileSize = original.fileSize;
        } else {
          let parsed = true;
          let total = newBytes;
          for (const f of existingFiles) {
            const m = /([\d.]+)\s*(KB|MB|GB)/i.exec(f.sizeLabel || '');
            if (!m) { parsed = false; break; }
            total += parseFloat(m[1]) * (m[2].toUpperCase() === 'KB' ? 1024 : m[2].toUpperCase() === 'GB' ? 1024 * 1024 * 1024 : 1024 * 1024);
          }
          fileSize = parsed && total > 0 ? `${(total / (1024 * 1024)).toFixed(1)} MB` : `${combined.length} files`;
        }
        await updateStudyMaterial(editId, {
          title: title.trim(),
          subject: subject.trim(),
          topic: materialKind === 'topic' ? topic.trim() : undefined,
          description: description.trim() || undefined,
          type: hasPdf ? 'pdf' : 'image',
          fileType: hasPdf ? 'PDF' : 'NOTES',
          files: combined.map((f) => ({ url: f.url, name: f.name || 'file' })) as any,
          downloadUrl: combined[0].url,
          fileName: combined.length > 1 ? `${combined.length} files` : (combined[0].name || 'file'),
          fileSize,
        } as any);
      }
      closeSheet();
    } catch (err: any) {
      setFormError(err?.message || 'The material could not be updated. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const doDelete = async () => {
    if (!detailsMaterial) return;
    setDeleting(true);
    try {
      await deleteStudyMaterial(detailsMaterial.id);
      setDetailsId(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-5 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <MaterialViewer material={viewing} onClose={() => setViewing(null)} />
      {/* 1. Heading + add button */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-[10px] font-extrabold uppercase text-[var(--brand,#EA580C)] tracking-wider block">
            {tutor.name} · Learning Resources
          </span>
          <h2 className="text-xl font-black text-[#0F172A] tracking-tight">Study Materials</h2>
          <p className="text-xs text-[#64748B] font-medium mt-0.5">
            Upload PDFs and images, or share lesson video links. Materials show on your students' portal.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => openFresh(view)}
        className="w-full h-12 rounded-2xl bg-[var(--brand,#0f172a)] text-[var(--on-brand,#fff)] text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-slate-200 hover:opacity-95 transition-all cursor-pointer"
      >
        <Plus className="w-4 h-4" />
        Upload Material
      </button>

      {/* 2. General vs Topic-specific */}
      <div className="bg-white rounded-[14px] p-1 border border-slate-200 shadow-xs grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={() => setView('general')}
          className={`h-10 rounded-[10px] text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            view === 'general'
              ? 'bg-[var(--brand,#0F172A)] text-[var(--on-brand,#fff)] shadow-xs'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          General
        </button>
        <button
          type="button"
          onClick={() => setView('topic')}
          className={`h-10 rounded-[10px] text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            view === 'topic'
              ? 'bg-[var(--brand,#0F172A)] text-[var(--on-brand,#fff)] shadow-xs'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          Class Topics
        </button>
      </div>

      {/* 3. Search */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by title, subject or topic..."
          className="w-full h-11 pl-10 pr-4 rounded-xl bg-white border border-[#E2E8F0] text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[var(--brand,#EA580C)] shadow-2xs transition-all"
        />
      </div>

      {/* 4. List */}
      <div className="space-y-3">
        {shownMaterials.length === 0 ? (
          <div className="py-12 px-6 bg-slate-50 rounded-3xl border border-slate-100 text-center space-y-3">
            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto shadow-sm">
              {view === 'general'
                ? <Layers className="w-8 h-8 text-slate-300" />
                : <BookOpen className="w-8 h-8 text-slate-300" />}
            </div>
            <h3 className="font-black text-slate-900">
              {view === 'general' ? 'No general materials yet' : 'No topic materials yet'}
            </h3>
            <p className="text-xs text-slate-500 font-medium max-w-[280px] mx-auto leading-relaxed">
              {view === 'general'
                ? 'Upload PDFs, images or lesson video links that are not tied to any class.'
                : 'Open a class in your timetable and tap Upload Material to attach materials to its topic.'}
            </p>
          </div>
        ) : (
          shownMaterials.map(renderMaterial)
        )}
      </div>

      {/* 5. Add-material sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-[110] overflow-y-auto p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="min-h-full flex items-center justify-center py-8">
            <div className="w-full max-w-sm bg-white rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col relative">
              {/* Header */}
              <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-[var(--brand,#EA580C)]/10 text-[var(--brand,#EA580C)] flex items-center justify-center">
                    <UploadCloud className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900 leading-tight">{editId ? 'Edit Material' : 'Upload Material'}</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                      {materialKind === 'topic' ? 'For a class topic' : 'General material'}
                    </p>
                  </div>
                </div>
                <button onClick={closeSheet} className="p-2 hover:bg-slate-50 rounded-xl transition-all" aria-label="Close">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* Class context banner */}
                {classCtx && (
                  <div className="p-3 rounded-2xl bg-slate-900 text-white flex items-center gap-2.5">
                    <BookOpen className="w-4 h-4 text-white/70 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-black truncate">{classCtx.subject}</p>
                      <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">
                        {classCtx.day || formatDay(classCtx.date)} · {classCtx.time}
                      </p>
                    </div>
                  </div>
                )}

                {/* Kind switch (only when not opened from a class) */}
                {!classCtx && !editId && (
                  <div className="bg-slate-50 rounded-2xl p-1 border border-slate-100 grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => setMaterialKind('general')}
                      className={`h-9 rounded-xl text-[10px] font-extrabold uppercase tracking-widest transition-all cursor-pointer ${
                        materialKind === 'general' ? 'bg-[var(--brand,#0F172A)] text-[var(--on-brand,#fff)] shadow-xs' : 'text-slate-500'
                      }`}
                    >
                      General
                    </button>
                    <button
                      type="button"
                      onClick={() => setMaterialKind('topic')}
                      className={`h-9 rounded-xl text-[10px] font-extrabold uppercase tracking-widest transition-all cursor-pointer ${
                        materialKind === 'topic' ? 'bg-[var(--brand,#0F172A)] text-[var(--on-brand,#fff)] shadow-xs' : 'text-slate-500'
                      }`}
                    >
                      Class topic
                    </button>
                  </div>
                )}

                {/* Type picker */}
                <div className="grid grid-cols-3 gap-2">
                  {(['pdf', 'image', 'video'] as MaterialType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => { setMaterialType(t); setFormError(''); if (editId) setExistingFiles([]); }}
                      className={`py-3 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest flex flex-col items-center gap-1 transition-all cursor-pointer ${
                        materialType === t
                          ? 'border-[var(--brand,#EA580C)] bg-[var(--brand,#EA580C)]/5 text-[var(--brand,#EA580C)]'
                          : 'border-slate-100 bg-white text-slate-400 hover:border-slate-200'
                      }`}
                    >
                      {t === 'pdf' ? <FileText className="w-4 h-4" /> : t === 'image' ? <ImageIcon className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}
                      {TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>

                {/* Upload or link input */}
                {materialType === 'video' ? (
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                      Video link <span className="text-slate-300 normal-case font-bold">(YouTube or any video URL)</span>
                    </label>
                    <div className="relative">
                      <Link2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="url"
                        value={videoUrl}
                        onChange={(e) => setVideoUrl(e.target.value)}
                        placeholder="https://youtube.com/watch?v=..."
                        className="w-full h-11 pl-10 pr-4 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-[var(--brand,#EA580C)]"
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium mt-1.5">
                      Videos are shared as links only. Students tap and watch on the video site.
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                      Upload {editId ? 'files' : materialType === 'pdf' ? 'PDFs' : 'images'} <span className="text-slate-300 normal-case font-bold">(you can pick several)</span>
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {editId && existingFiles.map((f, i) => (
                        <div key={`saved-${i}`} className="relative aspect-square rounded-xl border border-slate-200 bg-white overflow-hidden">
                          {/\.(png|jpe?g|gif|webp)(\?|$)/i.test(f.url) ? (
                            <img src={f.url} alt={f.name || 'file'} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-1 px-1">
                              <FileText className="w-5 h-5 text-slate-400 shrink-0" />
                              <p className="text-[8px] font-bold text-slate-500 text-center leading-tight line-clamp-2 break-all">{f.name || 'file'}</p>
                            </div>
                          )}
                          <button
                            type="button"
                            aria-label={`Remove ${f.name || 'file'}`}
                            onClick={() => setExistingFiles(existingFiles.filter((_, j) => j !== i))}
                            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-slate-900/80 text-white flex items-center justify-center hover:bg-slate-900 transition-colors cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      {files.map((f, i) => (
                        <div key={`${f.name}-${i}`} className="relative aspect-square rounded-xl border border-slate-200 bg-white overflow-hidden group">
                          {previews[i] ? (
                            <img src={previews[i]} alt={f.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-1 px-1">
                              <FileText className="w-5 h-5 text-slate-400 shrink-0" />
                              <p className="text-[8px] font-bold text-slate-500 text-center leading-tight line-clamp-2 break-all">{f.name}</p>
                            </div>
                          )}
                          <button
                            type="button"
                            aria-label={`Remove ${f.name}`}
                            onClick={() => { setFiles(files.filter((_, j) => j !== i)); setFormError(''); }}
                            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-slate-900/80 text-white flex items-center justify-center hover:bg-slate-900 transition-colors cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                          <div className="absolute inset-x-0 bottom-0 bg-slate-950/60 px-1.5 py-0.5">
                            <p className="text-[8px] font-bold text-white truncate">{(f.size / (1024 * 1024)).toFixed(1)} MB</p>
                          </div>
                        </div>
                      ))}
                      <label className="aspect-square rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-[var(--brand,#EA580C)] transition-all">
                        <Plus className="w-5 h-5 text-slate-400" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Add</span>
                        <UploadCloud className="w-4 h-4 text-slate-300" />
                        <input
                          type="file"
                          multiple
                          accept={editId ? '.pdf,application/pdf,image/*' : materialType === 'pdf' ? 'application/pdf' : 'image/*'}
                          className="hidden"
                          onChange={(e) => {
                            const picked = Array.from(e.target.files || []);
                            if (picked.length > 0) setFiles((prev) => [...prev, ...picked]);
                            e.target.value = '';
                            setFormError('');
                          }}
                        />
                      </label>
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium mt-1.5">
                      {editId ? 'Tap X to remove a file. Saved files are dropped when you save.' : 'Tap X on a file to remove it before uploading.'}
                    </p>
                  </div>
                )}

                {/* Title */}
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={materialType === 'video' ? 'e.g. Simultaneous equations lesson video' : 'e.g. Week 4 summary handout'}
                    className="w-full h-11 px-4 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-[var(--brand,#EA580C)]"
                  />
                </div>

                {/* Subject */}
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Subject</label>
                  {subjects.length > 0 ? (
                    <select
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="w-full h-11 px-4 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:border-[var(--brand,#EA580C)]"
                    >
                      <option value="">Choose subject</option>
                      {subjects.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Subject name"
                      className="w-full h-11 px-4 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-[var(--brand,#EA580C)]"
                    />
                  )}
                </div>

                {/* Topic (topic-bound only) */}
                {materialKind === 'topic' && (
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                      Lesson topic <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="What the class is covering"
                      className="w-full h-11 px-4 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-[var(--brand,#EA580C)]"
                    />
                  </div>
                )}

                {/* Description */}
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                    Description <span className="text-slate-300 normal-case font-bold">(optional)</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What is inside this material?"
                    className="w-full h-20 p-3 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-[var(--brand,#EA580C)]"
                  />
                </div>

                {formError && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-100">
                    <Info className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                    <p className="text-xs font-bold text-rose-700">{formError}</p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-5 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  disabled={uploading}
                  onClick={handleSubmit}
                  className="w-full h-12 rounded-2xl bg-[var(--brand,#0f172a)] text-[var(--on-brand,#fff)] text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-slate-200 disabled:opacity-60 cursor-pointer"
                >
                  {uploading ? (uploadProgress ? `Uploading ${uploadProgress}...` : 'Uploading...') : editId ? 'Save Changes' : materialType === 'video' ? 'Add Video Link' : 'Upload Material'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. Material details (info) sheet */}
      {detailsMaterial && createPortal(
        <div className="fixed inset-0 z-[120] overflow-y-auto p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="min-h-full flex items-center justify-center py-8">
            <div className="w-full max-w-sm bg-white rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[92vh]">
              {/* Header */}
              <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    detailIsVideo ? 'bg-rose-50 text-rose-500' : detailIsImage ? 'bg-sky-50 text-sky-500' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {detailIsVideo ? <PlayCircle className="w-5 h-5" /> : detailIsImage ? <ImageIcon className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-black text-slate-900 leading-tight truncate">{detailsMaterial.title}</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Material details</p>
                  </div>
                </div>
                <button onClick={closeDetails} className="p-2 hover:bg-slate-50 rounded-xl transition-all" aria-label="Close">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0 p-5 space-y-4">
                {/* Preview of the material itself */}
                {detailIsVideo && detailsMaterial.videoUrl && (toEmbedUrl(detailsMaterial.videoUrl) ? (
                  <iframe
                    src={toEmbedUrl(detailsMaterial.videoUrl) || undefined}
                    title={detailsMaterial.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full aspect-video rounded-2xl bg-black border-0"
                  />
                ) : (
                  <a
                    href={detailsMaterial.videoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 h-24 rounded-2xl bg-slate-50 border border-slate-100 text-xs font-black uppercase tracking-widest text-[var(--brand,#EA580C)] cursor-pointer"
                  >
                    <PlayCircle className="w-4 h-4" /> Open video link
                  </a>
                ))}
                {detailIsImage && detailFirst && (
                  <img src={detailFirst.url} alt={detailFirst.name || detailsMaterial.title} className="w-full max-h-56 object-contain rounded-2xl bg-slate-50 border border-slate-100" />
                )}
                {!detailIsVideo && detailFirst && !detailIsImage && (
                  <div className="h-56 rounded-2xl border border-slate-100 overflow-hidden bg-white">
                    <PdfDocumentView url={detailFirst.url} name={detailFirst.name || detailsMaterial.title} />
                  </div>
                )}

                  <>
                    {/* Details list */}
                    <div className="space-y-2.5">
                      {([
                        ['Subject', detailsMaterial.subject],
                        detailsMaterial.kind === 'topic' ? ['Lesson topic', detailsMaterial.topic] : null,
                        ['Uploaded by', detailsMaterial.tutorName],
                        ['Uploaded on', formatUploaded(detailsMaterial.uploadedAt)],
                        ['Files', detailFiles.length > 1 ? `${detailFiles.length} files` : detailFirst?.name || (detailIsVideo ? 'Video link' : '')],
                        detailsMaterial.fileSize ? ['Size', detailsMaterial.fileSize] : null,
                      ] as Array<[string, string] | null>).filter(Boolean).map(([label, value]) => (
                        <div key={label as string} className="flex items-start justify-between gap-3">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest shrink-0 pt-0.5">{label}</span>
                          <span className="text-xs font-bold text-slate-900 text-right break-words min-w-0">{value}</span>
                        </div>
                      ))}
                      {detailsMaterial.description && (
                        <div className="pt-1">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Description</p>
                          <p className="text-xs font-semibold text-slate-700 leading-relaxed">{detailsMaterial.description}</p>
                        </div>
                      )}
                    </div>
                  </>

              </div>

              {/* Footer: edit + delete */}
              <div className="p-5 border-t border-slate-100 shrink-0">
                {confirmDelete ? (
                  <div className="space-y-2">
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-100">
                      <Trash2 className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      <p className="text-xs font-bold text-rose-700">
                        Delete "{detailsMaterial.title}"? Students lose access to it and this cannot be undone.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        className="h-11 rounded-2xl bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={deleting}
                        onClick={doDelete}
                        className="h-11 rounded-2xl bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-60 cursor-pointer"
                      >
                        {deleting ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => detailsMaterial && openEdit(detailsMaterial)}
                      className="h-11 rounded-2xl bg-[var(--brand,#0f172a)] text-[var(--on-brand,#fff)] text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 hover:brightness-110 transition-all cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit Material
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      className="h-11 rounded-2xl bg-white border-2 border-rose-100 text-rose-600 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 hover:border-rose-300 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};
