// Web push for planner reminders (Nov 19). The public key below is the Web
// Push certificate's public key: it ships to every browser that allows
// notifications and is safe to embed. The matching private key lives only in
// the server environment.
import { api } from '../tos/tosShared';

const VAPID_PUBLIC_KEY = 'BFMo8SSNA0RgwpNF0zVU_cVP5wVKRCjQrOBwh2ODha7Ml1iKBiXRsuuA3ySI77Zp5owrp3oC7kOHTv8H6Agtn6o';

export type PushState = 'unsupported' | 'denied' | 'default' | 'granted' | 'error';

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function pushPermission(): PushState {
  if (!pushSupported()) return 'unsupported';
  const p = Notification.permission;
  if (p === 'granted') return 'granted';
  if (p === 'denied') return 'denied';
  return 'default';
}

function urlB64ToUint8Array(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

// Ask (only when the browser requires an ask), subscribe this device through
// the app's own service worker, and hand the subscription to the server, which
// upserts it for this signed-in member. Safe to call again: an existing
// subscription is reused, and the server stores one device per endpoint.
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  try {
    if (Notification.permission === 'denied') return 'denied';
    if (Notification.permission === 'default') {
      const asked = await Notification.requestPermission();
      if (asked !== 'granted') return 'denied';
    }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    }
    await api('/api/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
    return 'granted';
  } catch (e) {
    console.error('push subscription failed', e);
    return 'error';
  }
}
