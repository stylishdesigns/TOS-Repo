// A tiny "last good copy" store. Screens save every successful load here and
// read the saved copy back instantly the next time they mount (even after a
// full reload), while a fresh sync runs behind it. Nothing here invents data:
// it only ever replays what the server actually returned, and every key is
// scoped to the signed-in identity so one account or centre never sees
// another's copy.
const mem = new Map<string, unknown>();

export function loadLastGood<T>(key: string): T | null {
  if (mem.has(key)) return (mem.get(key) as T) || null;
  try {
    const raw = localStorage.getItem(`lastgood:${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T;
    mem.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function loadLastGoodFlag(key: string): boolean {
  try {
    if (mem.has(key)) return mem.get(key) === true;
    return localStorage.getItem(`lastgood:${key}`) === '1';
  } catch {
    return false;
  }
}

export function saveLastGoodFlag(key: string, on: boolean): void {
  mem.set(key, on);
  try {
    if (on) localStorage.setItem(`lastgood:${key}`, '1');
    else localStorage.removeItem(`lastgood:${key}`);
  } catch {
    // Private mode or a full disk: the copy simply lives in memory only.
  }
}

export function saveLastGood<T>(key: string, data: T): void {
  if (data === null || data === undefined) return;
  mem.set(key, data);
  try {
    localStorage.setItem(`lastgood:${key}`, JSON.stringify(data));
  } catch {
    // Too large for the device: keep the memory copy only.
  }
}
