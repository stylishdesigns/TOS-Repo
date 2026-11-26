// Proof-of-payment upload for admin-recorded payments: the admin attaches a
// receipt screenshot or photo and the secure link rides along on the payment
// record. The media-host details come from this deployment's own server
// route, never from the client.
import { auth as firebaseAuth } from '../firebase';

export interface PaymentProofResult {
  url: string;
  name: string;
}

export async function uploadPaymentProof(file: File): Promise<PaymentProofResult> {
  const token = await firebaseAuth.currentUser?.getIdToken();
  if (!token) throw new Error('You are signed out. Sign in again and try again.');
  const res = await fetch('/api/centre/payments/upload-config', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const cfg = await res.json().catch(() => ({}));
  if (!res.ok || !cfg?.ok || !cfg?.cloud || !cfg?.preset) {
    throw new Error(cfg?.error || 'Proof upload is not available on this deployment yet.');
  }
  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', String(cfg.preset));
  form.append('folder', String(cfg.folder || 'tos/payments'));
  const up = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(String(cfg.cloud))}/image/upload`,
    { method: 'POST', body: form },
  );
  const data = await up.json().catch(() => ({}));
  if (!up.ok || !data?.secure_url) {
    throw new Error('The proof image could not be uploaded. Please try again.');
  }
  return { url: String(data.secure_url), name: file.name };
}
