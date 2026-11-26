// Web push for planner reminders (Nov 19). The public key below is our own
// VAPID public key: it ships to every browser that allows notifications and is
// safe to embed. The matching private key lives only in the Netlify server
// environment (WEB_PUSH_PRIVATE_KEY), never in this bundle.
import { api } from '../tos/tosShared';

const VAPID_PUBLIC_KEY = 'BFXOh72Rhv-vH1AhTTn375mvNJCweGgoGGjwATkQVuplkyGx3KqMWlZS4cEPWJr0WJk8nTHwMAN47-W9nAhifgs';
const KEY_STORE = 'tos:push-vapid-key';

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
    const lastKey = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY_STORE) : null;
    if (sub && lastKey && lastKey !== VAPID_PUBLIC_KEY) {
      // The app's VAPID key changed: the old subscription can never receive a
      // push we can sign, so drop it and subscribe again with the new key.
      await sub.unsubscribe().catch(() => {});
      sub = null;
    }
    if (sub && !lastKey) {
      // A subscription saved before the app started tracking its VAPID key
      // cannot be trusted to match the sender's key: replace it with a fresh
      // one so this device always ends up on the key we can sign with.
      await sub.unsubscribe().catch(() => {});
      sub = null;
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
      try { localStorage.setItem(KEY_STORE, VAPID_PUBLIC_KEY); } catch { /* private mode */ }
    }
    await api('/api/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
    return 'granted';
  } catch (e) {
    console.error('push subscription failed', e);
    return 'error';
  }
}

const LAST_REG_KEY = 'tos:push-last-reg';

// Self-healing registration (Nov 19): a device whose permission is granted
// but whose sender record was lost (a failed save, a key mismatch, a cleared
// database) repairs itself quietly here. It never asks: it only runs when
// permission is already granted, so a dismissed banner can never strand a
// device off the sender's list again.
export async function ensurePushRegistered(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission !== 'granted') return pushPermission();
  const state = await enablePush();
  if (state === 'granted') {
    try { localStorage.setItem(LAST_REG_KEY, new Date().toISOString()); } catch { /* private mode */ }
  }
  return state;
}

// Status read for the notifications screen: is this device receiving
// reminders, and when did it last confirm itself with the sender?
export function pushStatus(): { on: boolean; label: string; detail: string } {
  const perm = pushPermission();
  if (perm === 'unsupported') return { on: false, label: 'Reminders unavailable', detail: 'This browser cannot receive push notifications.' };
  if (perm === 'denied') return { on: false, label: 'Reminders blocked', detail: 'Allow notifications for this app in your browser settings.' };
  if (perm !== 'granted') return { on: false, label: 'Reminders off', detail: 'Turn them on to get planner reminders.' };
  let when = '';
  try {
    const raw = localStorage.getItem(LAST_REG_KEY);
    if (raw) when = new Date(raw).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch { /* private mode */ }
  return { on: true, label: 'Reminders on', detail: when ? `This device last synced ${when}.` : 'This device syncs on next open.' };
}
