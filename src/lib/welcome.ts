import { getAuth } from 'firebase/auth';

/** Batch 58: the welcome trio. Fired once per account on its first look at
 *  its portal; the server guards the repeat, this only skips the obvious. */
export function fireFirstLook(uid: string | undefined | null): void {
  if (!uid) return;
  const key = `tos:welcome-look-${uid}`;
  try {
    if (localStorage.getItem(key)) return;
  } catch { /* storage off */ }
  void (async () => {
    try {
      const token = await getAuth().currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/welcome/first-look', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        try { localStorage.setItem(key, '1'); } catch { /* storage off */ }
      }
    } catch { /* silent: the server guard makes a missed call harmless */ }
  })();
}
