import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, FileText, PlayCircle, ExternalLink, Minus, Plus } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { StudyMaterial } from '../../types';

// In-app viewer for study materials: images page through full-screen, PDFs
// render page by page on canvas (PDF.js) so the document never leaves the app,
// YouTube videos play in an embedded frame.
// Nothing here sends the user out to the file host.

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface ViewerFile { url: string; name?: string; kind: 'image' | 'pdf' | 'video' }

export const toEmbedUrl = (raw: string): string | null => {
  try {
    const u = new URL(raw);
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return `https://www.youtube.com/embed/${v}`;
      if (u.pathname.startsWith('/embed/')) return raw;
    }
    if (u.hostname === 'youtu.be') return `https://www.youtube.com/embed${u.pathname}`;
    return null;
  } catch {
    return null;
  }
};

const looksPdf = (f: { url: string; name?: string }, materialType?: string) =>
  materialType === 'pdf' || (f.name || '').toLowerCase().endsWith('.pdf') || f.url.toLowerCase().includes('.pdf');

// PDF pages rendered straight onto canvases inside the app. An iframe to the
// file host was dropped: browsers without the PDF plugin (and iOS Safari)
// show a dead placeholder or an Open-to-host link instead of the document.
export const PdfDocumentView: React.FC<{ url: string; name: string; zoom?: number }> = ({ url, zoom = 1 }) => {
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [progressLabel, setProgressLabel] = useState('');

  // Re-size the already-rendered pages when the zoom level changes. Done in
  // JS with explicit widths: the page always grows with the percentage and
  // the document scrolls both ways.
  useEffect(() => {
    const container = pagesRef.current;
    if (!container) return;
    container.querySelectorAll('canvas').forEach((c) => {
      const base = Number((c as HTMLCanvasElement).dataset.baseWidth || '');
      if (!base) return;
      c.style.maxWidth = zoom > 1 ? 'none' : '100%';
      c.style.width = `${Math.round(base * zoom)}px`;
    });
  }, [zoom]);

  useEffect(() => {
    let cancelled = false;
    let pdf: any = null;
    const container = pagesRef.current;
    if (container) container.innerHTML = '';
    setStatus('loading');
    setProgressLabel('');

    const render = async () => {
      try {
        const task = pdfjsLib.getDocument({ url, disableRange: true });
        pdf = await task.promise;
        if (cancelled) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
          if (cancelled) return;
          setProgressLabel(`Page ${pageNo} of ${pdf.numPages}`);
          const page = await pdf.getPage(pageNo);
          if (cancelled) return;
          const targetWidth = container ? Math.min(container.clientWidth || 720, 980) : 720;
          const base = page.getViewport({ scale: 1 });
          const scale = (targetWidth / base.width) * dpr;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${Math.round(viewport.width / dpr)}px`;
          canvas.style.maxWidth = '100%';
          canvas.style.height = 'auto';
          canvas.style.display = 'block';
          (canvas as HTMLCanvasElement).dataset.baseWidth = String(Math.round(viewport.width / dpr));
          const ctx = canvas.getContext('2d');
          await page.render({ canvasContext: ctx as CanvasRenderingContext2D, viewport }).promise;
          if (cancelled) return;
          container?.appendChild(canvas);
          if (pageNo === 1) setStatus('ready');
        }
        if (!cancelled) setProgressLabel('');
      } catch (e) {
        if (!cancelled) {
          console.warn('PDF render failed:', e);
          setStatus('error');
        }
      }
    };
    void render();
    return () => {
      cancelled = true;
      try { void pdf?.destroy(); } catch { /* already gone */ }
    };
  }, [url]);

  return (
    <div className="w-full h-full rounded-xl bg-white shadow-2xl overflow-auto overscroll-contain">
      <div ref={pagesRef} className="flex flex-col items-center gap-4 p-3 sm:p-5" />
      {status === 'loading' && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-[var(--brand,#EA580C)]" />
          </div>
          <p className="text-xs font-bold">{progressLabel || 'Opening document…'}</p>
        </div>
      )}
      {status === 'error' && (
        <div className="flex flex-col items-center justify-center gap-2 py-16 px-6 text-center">
          <FileText className="w-10 h-10 text-slate-300" />
          <p className="text-sm font-bold text-slate-600">This document could not be opened.</p>
          <p className="text-xs text-slate-400">Try uploading it again from the tutor portal.</p>
        </div>
      )}
    </div>
  );
};

export const MaterialViewer: React.FC<{
  material: StudyMaterial | null;
  onClose: () => void;
}> = ({ material, onClose }) => {
  const [idx, setIdx] = useState(0);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    setIdx(0);
    setZoom(1);
  }, [material?.id]);

  // A different file starts fresh at its fit-to-screen size.
  useEffect(() => {
    setZoom(1);
  }, [idx]);

  const files = useMemo<ViewerFile[]>(() => {
    if (!material) return [];
    if (material.type === 'video' && material.videoUrl) {
      return [{ url: material.videoUrl, kind: 'video', name: material.fileName }];
    }
    const list = material.files && material.files.length > 0
      ? material.files
      : material.downloadUrl
        ? [{ url: material.downloadUrl, name: material.fileName }]
        : [];
    return list.map((f) => ({
      url: f.url,
      name: f.name,
      kind: looksPdf(f, material.type) ? 'pdf' : 'image',
    }));
  }, [material]);

  if (!material || files.length === 0) return null;
  const current = files[Math.min(idx, files.length - 1)];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={material.title}
      className="fixed inset-0 z-[100] flex flex-col bg-slate-950/95 backdrop-blur-sm animate-in fade-in duration-200"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-4 border-b border-white/10 shrink-0">
        <div className="min-w-0 flex-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--brand,#EA580C)] block truncate">
            {material.subject}{material.topic ? ` · ${material.topic}` : ''}
          </span>
          <h3 className="text-sm font-black text-white leading-snug mt-0.5 truncate">{material.title}</h3>
          {files.length > 1 && (
            <p className="text-[10px] font-bold text-slate-400 mt-0.5">
              {idx + 1} of {files.length} files
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close viewer"
          className="w-9 h-9 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer shrink-0"
        >
          <X className="w-4.5 h-4.5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 relative flex items-center justify-center p-3 sm:p-6">
        {current.kind !== 'video' && (
          <div className="absolute top-2 right-2 sm:top-3 sm:right-3 z-20 flex items-center gap-0.5 rounded-full bg-slate-900/90 border border-white/10 px-1.5 py-1 shadow-lg backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(1, Math.round((z - 0.5) * 10) / 10))}
              disabled={zoom <= 1}
              aria-label="Zoom out"
              className="w-8 h-8 rounded-full text-white flex items-center justify-center hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              aria-label="Reset zoom"
              className="w-12 h-8 rounded-full text-white text-[10px] font-black tracking-wide hover:bg-white/10 transition-colors cursor-pointer"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.5) * 10) / 10))}
              disabled={zoom >= 3}
              aria-label="Zoom in"
              className="w-8 h-8 rounded-full text-white flex items-center justify-center hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        )}
        {current.kind === 'image' && (
          <div className="w-full h-full overflow-auto flex">
            <img
              src={current.url}
              alt={current.name || material.title}
              className={zoom > 1 ? 'm-auto rounded-xl shadow-2xl' : 'm-auto max-w-full max-h-full object-contain rounded-xl shadow-2xl'}
              style={zoom > 1 ? { width: `${zoom * 100}%`, height: 'auto', maxWidth: 'none', maxHeight: 'none' } : undefined}
            />
          </div>
        )}
        {current.kind === 'pdf' && (
          <PdfDocumentView url={current.url} name={current.name || material.title} zoom={zoom} />
        )}
        {current.kind === 'video' && (
          toEmbedUrl(current.url) ? (
            <iframe
              src={toEmbedUrl(current.url) || undefined}
              title={material.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full aspect-video max-h-full rounded-xl bg-black shadow-2xl border-0"
            />
          ) : (
            <div className="text-center space-y-3 p-6">
              <PlayCircle className="w-12 h-12 text-white/70 mx-auto" />
              <p className="text-xs font-bold text-slate-300 max-w-xs mx-auto">
                This video is hosted outside the app. Open it on the source site to watch.
              </p>
              <a
                href={current.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--brand,#EA580C)] text-white text-xs font-black uppercase tracking-widest cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" />
                Open video
              </a>
            </div>
          )
        )}

        {files.length > 1 && idx > 0 && (
          <button
            type="button"
            onClick={() => setIdx(idx - 1)}
            aria-label="Previous file"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        {files.length > 1 && idx < files.length - 1 && (
          <button
            type="button"
            onClick={() => setIdx(idx + 1)}
            aria-label="Next file"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Thumbnail strip */}
      {files.length > 1 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-none p-3 border-t border-white/10 shrink-0">
          {files.map((f, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`File ${i + 1}`}
              className={`w-12 h-12 rounded-lg overflow-hidden shrink-0 flex items-center justify-center border-2 transition-all cursor-pointer ${
                i === idx
                  ? 'border-[var(--brand,#EA580C)] bg-white/15'
                  : 'border-white/10 bg-white/5 hover:border-white/25'
              }`}
            >
              {f.kind === 'image' ? (
                <img src={f.url} alt="" className="w-full h-full object-cover" />
              ) : f.kind === 'pdf' ? (
                <FileText className="w-5 h-5 text-white/80" />
              ) : (
                <PlayCircle className="w-5 h-5 text-white/80" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
};
