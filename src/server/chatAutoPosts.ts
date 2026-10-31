/**
 * CH1 Step 6: automatic TOS posts into the Mock and Practice channel.
 *
 * Three fixed announcements, each behind its own switch in the TOS chat
 * settings: a mock opening for the day, results being released, and new
 * practice questions going live. Every post is fire-and-forget: it runs
 * alongside the release, publish or student call it belongs to and can
 * never block, delay or fail any of them. A missing channel or a switch
 * turned off is a silent no-op, by design.
 */
import { ServerValue } from 'firebase-admin/database';
import type { DocumentReference } from 'firebase-admin/firestore';
import { adminDb, adminRtdb } from './firebaseAdmin';
import { getTosChat } from './chatRoutes';

export type ChatAutoPostKind = 'mockOpen' | 'resultsOut' | 'practicePublished';

const AUTO_TEXTS: Record<ChatAutoPostKind, string> = {
  mockOpen: "Today's mock is open",
  resultsOut: 'Results are out',
  practicePublished: 'New practice questions published',
};

/** Post one announcement into the TOS channel if the channel exists and the
 *  switch for it is on. Resolves false instead of throwing, so a failure
 *  here can never surface as an error in the flow it rides along with. */
export async function postAutoTos(kind: ChatAutoPostKind): Promise<boolean> {
  try {
    const settings = await getTosChat();
    if (settings.autoPosts[kind] === false) return false;
    const snap = await adminDb.collection('chatGroups').where('kind', '==', 'tos_channel').limit(1).get();
    if (snap.empty) return false;
    const groupId = snap.docs[0].id;
    const msgRef = adminRtdb.ref(`chat/groups/${groupId}/messages`).push();
    await msgRef.set({
      uid: 'tos-auto',
      username: 'TOS',
      role: 'tos',
      text: AUTO_TEXTS[kind],
      photoUrl: null,
      at: ServerValue.TIMESTAMP,
      removed: null,
    });
    await adminRtdb
      .ref(`chat/groups/${groupId}/meta`)
      .transaction((m: any) => ({ ...(m || {}), msgCount: (Number(m?.msgCount) || 0) + 1 }));
    return true;
  } catch (e: any) {
    console.error(`[chatAutoPosts] ${kind} post failed:`, e?.message || e);
    return false;
  }
}

/** Post "Today's mock is open" once per mock. The claim is a merge write on
 *  the mock doc's own flag: whoever's transaction sets it first posts, and
 *  every later caller sees the flag and skips. Never throws, never blocks. */
export async function postMockOpenOnce(mockRef: DocumentReference): Promise<boolean> {
  let claimed = false;
  try {
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(mockRef);
      if (!snap.exists) return;
      if ((snap.data() as any)?.chatAutoPosts?.mockOpenPosted) return;
      tx.set(mockRef, { chatAutoPosts: { mockOpenPosted: new Date().toISOString() } }, { merge: true });
      claimed = true;
    });
    if (!claimed) return false;
    return await postAutoTos('mockOpen');
  } catch (e: any) {
    console.error('[chatAutoPosts] mockOpen claim failed:', e?.message || e);
    return false;
  }
}
