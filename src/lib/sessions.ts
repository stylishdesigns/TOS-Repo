/** Stable, per-browser device key used to track real login sessions. */
const DEVICE_KEY = 'tos:device-key';

export function deviceKey(): string {
  try {
    let key = localStorage.getItem(DEVICE_KEY);
    if (!key) {
      key = 'dk-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
      localStorage.setItem(DEVICE_KEY, key);
    }
    return key;
  } catch {
    return 'dk-ephemeral';
  }
}
