// Study-material uploads (PDFs and images) go to this deployment's own media
// host through its server route; the tutor never sees a key. Videos are never
// uploaded here: the tutor pastes a link instead.
import { auth as firebaseAuth } from '../firebase';

export interface MaterialUploadResult {
  url: string;
  name: string;
  sizeLabel?: string;
}

export async function uploadStudyMaterialFile(
  file: File,
  centreId: string | null | undefined,
): Promise<MaterialUploadResult> {
  const token = await firebaseAuth.currentUser?.getIdToken();
  if (!token) throw new Error('You are signed out. Sign in again and try again.');
  const qs = centreId ? `?centreId=${encodeURIComponent(centreId)}` : '';
  const res = await fetch(`/api/centre/materials/upload-config${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const cfg = await res.json().catch(() => ({}));
  if (!res.ok || !cfg?.ok || !cfg?.cloud || !cfg?.preset) {
    throw new Error(cfg?.error || 'Material upload is not available on this deployment yet.');
  }
  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', String(cfg.preset));
  form.append('folder', String(cfg.folder || 'tos/materials'));
  const up = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(String(cfg.cloud))}/auto/upload`,
    { method: 'POST', body: form },
  );
  const data = await up.json().catch(() => ({}));
  if (!up.ok || !data?.secure_url) {
    throw new Error('The file could not be uploaded. Please try again.');
  }
  const bytes = Number(data.bytes || 0);
  // Cloudinary's original_filename arrives WITHOUT its extension, and the
  // material's type chip reads the extension from the stored name. Keep it:
  // the Cloudinary format ("jpg", "pdf") or the original file's own
  // extension is appended back on.
  const base = String(data.original_filename || String(file.name || '').replace(/\.[^.]+$/, '') || 'material');
  const ext = String(data.format || (String(file.name || '').match(/\.([A-Za-z0-9]{1,5})$/)?.[1]) || '').toLowerCase();
  return {
    url: String(data.secure_url),
    name: ext ? `${base}.${ext}` : base,
    sizeLabel: bytes > 0 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : undefined,
  };
}
