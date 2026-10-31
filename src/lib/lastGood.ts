// A tiny "last good copy" store. Screens save every successful load here and
// read the saved copy back instantly the next time they mount (even after a
// full reload), while a fresh sync runs behind it. Nothing here invents data:
// it only ever replays what the server actually returned.
//
// PRIVACY (Prompt PF2): every key is prefixed with the signed-in user's uid
// here inside this file, so no screen can forget it. One account never reads
// or keeps another account's copy, two centres on the same browser never see
// each other's data, and clearAllLastGood() wipes everything on sign-out or
// whenever the signed-in uid changes (shared family phone, shared centre
// computer). While nobody is signed in, nothing is saved and nothing is read.
// Data that is sensitive out of proportion to the instant-open gain (full
// student/tutor lists with phone numbers) is not saved here at all: screens
// decide that at the call site and save only aggregates.
const mem = new Map<string, unknown>();

let ownerUid: string | null = null;

// Set (or clear) the signed-in identity. Whenever it changes - including
// changing to null on sign-out - every saved copy is wiped first, so a new
// account can never inherit the previous one's data.
export function setLastGoodOwner(uid: string | null): void {
  if (uid === ownerUid) return;
  clearAllLastGood();
  ownerUid = uid;
}

// Remove every saved copy: the in-memory map and every localStorage key this
// store owns. Also clears legacy copies saved before uid scoping, which match
// the same "lastgood:" prefix.
export function clearAllLastGood(): void {
  mem.clear();
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith('lastgood:')) doomed.push(k);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch {
    // Private mode or blocked storage: the map is cleared either way.
  }
}

// Another tab signing out or switching account also rewrites these keys
// through shared storage; drop our in-memory copies so this tab cannot keep
// replaying what the other tab just wiped.
try {
  window.addEventListener('storage', (e) => {
    if (e.key === null || (e.key && e.key.startsWith('lastgood:'))) mem.clear();
  });
} catch {
  // Non-browser environment: nothing to listen to.
}

function fullKey(key: string): string {
  return `${ownerUid}:${key}`;
}

export function loadLastGood<T>(key: string): T | null {
  if (!ownerUid) return null;
  const fk = fullKey(key);
  if (mem.has(fk)) return (mem.get(fk) as T) || null;
  try {
    const raw = localStorage.getItem(`lastgood:${fk}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T;
    mem.set(fk, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function loadLastGoodFlag(key: string): boolean {
  if (!ownerUid) return false;
  const fk = fullKey(key);
  try {
    if (mem.has(fk)) return mem.get(fk) === true;
    return localStorage.getItem(`lastgood:${fk}`) === '1';
  } catch {
    return false;
  }
}

export function saveLastGoodFlag(key: string, on: boolean): void {
  if (!ownerUid) return;
  const fk = fullKey(key);
  mem.set(fk, on);
  try {
    if (on) localStorage.setItem(`lastgood:${fk}`, '1');
    else localStorage.removeItem(`lastgood:${fk}`);
  } catch {
    // Private mode or a full disk: the copy simply lives in memory only.
  }
}

export function saveLastGood<T>(key: string, data: T): void {
  if (!ownerUid) return;
  if (data === null || data === undefined) return;
  const fk = fullKey(key);
  mem.set(fk, data);
  try {
    localStorage.setItem(`lastgood:${fk}`, JSON.stringify(data));
  } catch {
    // Too large for the device: keep the memory copy only.
  }
}
