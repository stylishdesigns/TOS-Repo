import express from 'express';
import { ServerValue } from 'firebase-admin/database';
import { DocumentData, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { adminDb, adminRtdb } from './firebaseAdmin';
import {
  Caller,
  getCentreEntitlements,
  getPlatformConfig,
  httpError,
  requireMembership,
} from './tenantService';
import { CentreChatSettings, ChatAccessRule, TosChatSettings, TosStatusSettings } from '../types';

// ============================================================================
// CH1 student chat, Step 2: the server engine.
//
// Groups, reports and mutes live in Firestore and are written ONLY here
// (the rules lock those collections to server access). Message streams live
// in the Realtime Database under chat/groups/{groupId}/... and are also read
// and written ONLY here, because the RTDB rules deny every direct client
// access. Every read and post re-verifies: identity, centre membership, the
// centre's chat entitlement, the rolling 7-day practice gate and the rate
// limit. Nothing is decided in a screen.
// ============================================================================

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_NAME_CHARS = 80;
const MAX_SUBJECT_CHARS = 80;
const MAX_REASON_CHARS = 500;
const MAX_EXCERPT_CHARS = 300;
const MAX_PAGE = 50;
const DEFAULT_PAGE = 20;
const MAX_PHOTO_URL_CHARS = 500;
const RETENTION_BATCH = 100;
const SEVEN_DAYS = 7;

// Starting values, used until the T2 and C3 screens save real ones. They are
// settings, not constants: every one is editable on its own screen and stored
// in the platform config document or the centre document.
const START_TOS_CHAT: TosChatSettings = {
  defaultGroupSubjects: [],
  mockPracticeChannelName: 'Mock and Practice',
  mockPracticeThresholdPercent: 0,
  photoMaxKb: 500,
  retentionDays: 30,
  messageMaxChars: 2000,
  postRateLimitPerHour: 30,
  autoPosts: { mockOpen: true, resultsOut: true, practicePublished: true },
  status: {
    enabled: true,
    allowText: true,
    allowPhoto: true,
    allowVideo: true,
    allowMusic: true,
    allowReplies: true,
    adminsCanRemove: true,
    lastsHours: 24,
    maxVideoSeconds: 30,
    maxVideoMb: 50,
    maxAudioMb: 10,
    statusesPerDay: 5,
    maxTextChars: 280,
  },
  updatedAt: null,
};

const START_CENTRE_CHAT: CentreChatSettings = {
  defaultThresholdPercent: 0,
  minAnswers: 10,
  autoSubjectGroups: false,
  photosAllowed: false,
  tutorsCanRemove: true,
  paused: false,
  muteDayOptions: [1, 3, 7],
  updatedAt: null,
};

interface GroupDoc {
  id: string;
  centreId: string | null;
  name: string;
  kind: 'subject' | 'announcements' | 'custom' | 'tos_channel' | 'personal';
  subject: string | null;
  access: ChatAccessRule;
  createdBy: string;
  createdByRole: string;
  createdAt: string;
  updatedAt: string;
  active: boolean;
}

interface ChatStats {
  answered: number;
  correct: number;
  percent: number;
}

function getCaller(req: express.Request): Caller {
  const caller = (req as any).caller as Caller | undefined;
  if (!caller) throw httpError(401, 'Unauthorized');
  return caller;
}

function cleanStr(v: unknown, max: number): string {
  return String(v ?? '').trim().slice(0, max);
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function mergeTosChat(raw: any): TosChatSettings {
  const s: TosChatSettings = {
    ...START_TOS_CHAT,
    autoPosts: { ...START_TOS_CHAT.autoPosts },
    status: { ...START_TOS_CHAT.status },
  };
  if (!raw || typeof raw !== 'object') return s;
  if (Array.isArray(raw.defaultGroupSubjects)) {
    s.defaultGroupSubjects = raw.defaultGroupSubjects
      .map((x: unknown) => cleanStr(x, MAX_SUBJECT_CHARS))
      .filter(Boolean)
      .slice(0, 25);
  }
  if (typeof raw.mockPracticeChannelName === 'string' && raw.mockPracticeChannelName.trim()) {
    s.mockPracticeChannelName = cleanStr(raw.mockPracticeChannelName, MAX_NAME_CHARS);
  }
  s.mockPracticeThresholdPercent = clampInt(raw.mockPracticeThresholdPercent, 0, 100, s.mockPracticeThresholdPercent);
  s.photoMaxKb = clampInt(raw.photoMaxKb, 10, 10240, s.photoMaxKb);
  s.retentionDays = clampInt(raw.retentionDays, 1, 365, s.retentionDays);
  s.messageMaxChars = clampInt(raw.messageMaxChars, 100, 8000, s.messageMaxChars);
  s.postRateLimitPerHour = clampInt(raw.postRateLimitPerHour, 1, 1000, s.postRateLimitPerHour);
  if (raw.autoPosts && typeof raw.autoPosts === 'object') {
    s.autoPosts = {
      mockOpen: raw.autoPosts.mockOpen !== false,
      resultsOut: raw.autoPosts.resultsOut !== false,
      practicePublished: raw.autoPosts.practicePublished !== false,
    };
  }
  if (raw.status && typeof raw.status === 'object') {
    const w = raw.status;
    s.status = {
      enabled: w.enabled !== false,
      allowText: w.allowText !== false,
      allowPhoto: w.allowPhoto !== false,
      allowVideo: w.allowVideo !== false,
      allowMusic: w.allowMusic !== false,
      allowReplies: w.allowReplies !== false,
      adminsCanRemove: w.adminsCanRemove !== false,
      lastsHours: clampInt(w.lastsHours, 1, 720, s.status.lastsHours),
      maxVideoSeconds: clampInt(w.maxVideoSeconds, 5, 120, s.status.maxVideoSeconds),
      maxVideoMb: clampInt(w.maxVideoMb, 1, 500, s.status.maxVideoMb),
      maxAudioMb: clampInt(w.maxAudioMb, 1, 50, s.status.maxAudioMb),
      statusesPerDay: clampInt(w.statusesPerDay, 1, 20, s.status.statusesPerDay),
      maxTextChars: clampInt(w.maxTextChars, 20, 1000, s.status.maxTextChars),
    };
  }
  if (typeof raw.updatedAt === 'string') s.updatedAt = raw.updatedAt;
  return s;
}

function mergeCentreChat(raw: any): CentreChatSettings {
  const s: CentreChatSettings = { ...START_CENTRE_CHAT, muteDayOptions: [...START_CENTRE_CHAT.muteDayOptions] };
  if (!raw || typeof raw !== 'object') return s;
  s.defaultThresholdPercent = clampInt(raw.defaultThresholdPercent, 0, 100, s.defaultThresholdPercent);
  s.minAnswers = clampInt(raw.minAnswers, 1, 1000, s.minAnswers);
  s.autoSubjectGroups = raw.autoSubjectGroups === true;
  s.photosAllowed = raw.photosAllowed === true;
  s.tutorsCanRemove = raw.tutorsCanRemove !== false;
  s.paused = raw.paused === true;
  if (Array.isArray(raw.muteDayOptions)) {
    const rawList: number[] = raw.muteDayOptions.map((x: unknown) => clampInt(x, 1, 365, 0));
    const opts: number[] = Array.from(new Set<number>(rawList.filter((n: number) => n > 0))).sort((a: number, b: number) => a - b);
    if (opts.length > 0) s.muteDayOptions = opts.slice(0, 5);
  }
  if (typeof raw.updatedAt === 'string') s.updatedAt = raw.updatedAt;
  return s;
}

export async function getTosChat(): Promise<TosChatSettings> {
  try {
    const cfg = await getPlatformConfig();
    return mergeTosChat((cfg as any)?.chat);
  } catch {
    return mergeTosChat(null);
  }
}

async function getCentreChat(centreId: string): Promise<CentreChatSettings> {
  try {
    const doc = await adminDb.collection('centres').doc(centreId).get();
    return mergeCentreChat(doc.exists ? (doc.data() as any)?.chat : null);
  } catch (err: any) {
    if (err?.status) throw err;
    console.error('[chat] centre settings read failed:', err?.message || err);
    throw httpError(500, 'A server error occurred. Please try again.');
  }
}

async function loadGroup(groupId: string): Promise<GroupDoc> {
  const snap = await adminDb.collection('chatGroups').doc(groupId).get();
  if (!snap.exists) throw httpError(404, 'Group not found.');
  const d = snap.data() as any;
  if (d.active === false) throw httpError(404, 'Group not found.');
  return {
    id: snap.id,
    centreId: d.centreId ?? null,
    name: cleanStr(d.name, MAX_NAME_CHARS),
    kind: d.kind,
    subject: d.subject ? cleanStr(d.subject, MAX_SUBJECT_CHARS) : null,
    access: d.access && typeof d.access === 'object' ? d.access : { mode: 'centre_default' },
    createdBy: cleanStr(d.createdBy, 64),
    createdByRole: cleanStr(d.createdByRole, 20),
    createdAt: cleanStr(d.createdAt, 40),
    updatedAt: cleanStr(d.updatedAt, 40),
    active: true,
  };
}

function gateFor(group: GroupDoc, centreChat: CentreChatSettings, tosChat: TosChatSettings): { useGate: boolean; thresholdPercent: number } {
  if (group.kind === 'personal') return { useGate: false, thresholdPercent: 0 };
  if (group.kind === 'tos_channel') {
    const t = clampInt(tosChat.mockPracticeThresholdPercent, 0, 100, 0);
    return { useGate: t > 0, thresholdPercent: t };
  }
  const mode = group.access?.mode || 'centre_default';
  if (mode === 'none') return { useGate: false, thresholdPercent: 0 };
  if (mode === 'custom') {
    const t = clampInt(group.access?.thresholdPercent, 0, 100, 0);
    return { useGate: true, thresholdPercent: t };
  }
  return { useGate: true, thresholdPercent: clampInt(centreChat.defaultThresholdPercent, 0, 100, 0) };
}

/** Rolling 7-day answered/correct from the practice stats document's `daily`
 *  map, which the summary write maintains in the same transaction. */
async function sevenDayStats(uid: string, centreId: string): Promise<ChatStats> {
  try {
    const doc = await adminDb.collection('practiceStats').doc(`${uid}__${centreId}`).get();
    const daily = (doc.data() as any)?.daily;
    const keys = new Set<string>();
    const now = new Date();
    for (let i = 0; i < SEVEN_DAYS; i++) {
      const d = new Date(now.getTime() - i * DAY_MS);
      keys.add(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`);
    }
    let answered = 0;
    let correct = 0;
    if (daily && typeof daily === 'object') {
      keys.forEach((k) => {
        const e = (daily as any)[k];
        if (e && typeof e === 'object') {
          answered += Number(e.answered) || 0;
          correct += Number(e.correct) || 0;
        }
      });
    }
    return { answered, correct, percent: answered > 0 ? Math.round((correct * 100) / answered) : 0 };
  } catch (err: any) {
    if (err?.status) throw err;
    console.error('[chat] practice stats read failed:', err?.message || err);
    throw httpError(500, 'A server error occurred. Please try again.');
  }
}

interface LockState {
  locked: boolean;
  useGate: boolean;
  thresholdPercent: number;
  myPercent: number;
  myAnswers: number;
  minAnswers: number;
}

function lockState(group: GroupDoc, gate: { useGate: boolean; thresholdPercent: number }, stats: ChatStats, centreChat: CentreChatSettings): LockState {
  const minAnswers = centreChat.minAnswers;
  const base: LockState = {
    locked: false,
    useGate: gate.useGate,
    thresholdPercent: gate.thresholdPercent,
    myPercent: stats.percent,
    myAnswers: stats.answered,
    minAnswers,
  };
  if (!gate.useGate) return base;
  // A student who has not answered enough yet is treated as not locked, and
  // their score does not count until they do.
  if (stats.answered < minAnswers) return base;
  return { ...base, locked: stats.percent < gate.thresholdPercent };
}

/** The student's own record answers everything membership needs: subject
 *  groups match on the subjects array, everything else is centre-wide, and
 *  the TOS channel is platform-wide for entitled students. */
function studentInGroup(studentSubjects: unknown, group: GroupDoc): boolean {
  if (group.kind === 'tos_channel') return true;
  if (group.subject) return Array.isArray(studentSubjects) && (studentSubjects as string[]).includes(group.subject);
  return true;
}

// ============================================================================
// Personal chats (one-to-one) and friend requests.
//
// The rules the platform enforces here: inside one centre, every member can
// message every other member with no request of any kind. A one-to-one chat
// across two centres exists only between two students who have accepted each
// other as friends, so friend requests are only ever needed across centres.
// Staff (admins and tutors) never chat across centres, and students only
// discover students from other centres through the leaderboard and the TOS
// channels, so a friend request starts from a leaderboard username.
// ============================================================================

const MAX_FRIENDS_PAGE = 100;

/** Deterministic ids for a pair of people, so both sides and every repeated
 *  attempt land on the same chat document and the same friend-request record. */
function pairId(prefix: string, a: string, b: string): string {
  const pair = [cleanStr(a, 64), cleanStr(b, 64)].sort();
  return `${prefix}-${pair[0]}__${pair[1]}`;
}

/** The two members of a personal chat, read fresh from its document. */
async function personalMembersOf(chatId: string): Promise<string[]> {
  const snap = await adminDb.collection('chatGroups').doc(chatId).get();
  if (!snap.exists) return [];
  const d = snap.data() as any;
  if (d.kind !== 'personal' || d.active === false) return [];
  const members = Array.isArray(d.members)
    ? d.members.map((x: unknown) => cleanStr(x, 64)).filter(Boolean)
    : [];
  return members.length === 2 ? members : [];
}

/** Two students are friends when their friend-request document says accepted.
 *  A declined or missing record means not friends. */
async function friendshipAccepted(a: string, b: string): Promise<boolean> {
  const snap = await adminDb.collection('chatFriendRequests').doc(pairId('fr', a, b)).get();
  return snap.exists && (snap.data() as any)?.status === 'accepted';
}

/** Who a chat target is: their student record when they are a student, plus
 *  every centre they hold a staff membership in. Memberships stay the source
 *  of truth for staff centres, exactly like the rest of the platform. */
async function chatTargetInfo(uid: string): Promise<{ uid: string; isStudent: boolean; centres: string[]; name: string; username: string } | null> {
  const id = cleanStr(uid, 64);
  if (!id) return null;
  const centres = new Set<string>();
  let name = '';
  let isStudent = false;
  const stuSnap = await adminDb.collection('students').doc(id).get();
  if (stuSnap.exists) {
    const v = stuSnap.data() as any;
    const c = cleanStr(v?.centreId, 120);
    if (c) centres.add(c);
    name = cleanStr(v?.name, MAX_NAME_CHARS);
    isStudent = true;
  }
  const memSnap = await adminDb.collection('memberships').where('uid', '==', id).limit(10).get();
  memSnap.forEach((d) => {
    const v = d.data() as any;
    const role = cleanStr(v?.role, 20);
    const c = cleanStr(v?.centreId, 120);
    if (c && ['owner', 'admin', 'tutor'].includes(role)) centres.add(c);
  });
  if (centres.size === 0 && !isStudent) return null;
  try {
    const adm = await adminDb.collection('admins').doc(id).get();
    if (adm.exists) {
      const v = adm.data() as any;
      name = cleanStr(v?.name || v?.displayName || v?.fullName, MAX_NAME_CHARS) || name;
    }
  } catch { /* the student name stands */ }
  if (!name) {
    try {
      const tut = await adminDb.collection('tutors').where('uid', '==', id).limit(1).get();
      if (!tut.empty) name = cleanStr(tut.docs[0].data()?.name, MAX_NAME_CHARS) || name;
    } catch { /* keep what we have */ }
  }
  const username = await usernameFor(id);
  return { uid: id, isStudent, centres: [...centres], name, username };
}

/** The chat name of a person follows the platform rule: students show their
 *  username, staff show their staff name. */
function personDisplayName(p: { isStudent: boolean; name: string; username: string }): string {
  return p.isStudent ? (p.username || p.name) : (p.name || 'Staff');
}

async function centreNamesFor(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const id of Array.from(new Set(ids.filter(Boolean))).slice(0, 10)) {
    try {
      const snap = await adminDb.collection('centres').doc(id).get();
      out.set(id, snap.exists ? (cleanStr((snap.data() as any)?.name, 120) || id) : id);
    } catch { out.set(id, id); }
  }
  return out;
}

/** Shared student preconditions for the personal-chat and friend routes. */
async function studentChatBase(caller: Caller): Promise<{ student: any; centreId: string }> {
  const stuSnap = await getStudentDoc(caller.uid);
  if (!stuSnap) throw httpError(403, 'No student record is linked to this account.');
  const student = stuSnap.data() as any;
  const centreId = cleanStr(student.centreId, 120);
  if (!centreId) throw httpError(403, 'No centre is linked to this account.');
  await requireMembership(caller, centreId);
  const entitlements = await getCentreEntitlements(centreId);
  if (entitlements.chat !== true) {
    throw httpError(403, 'Chat is not part of your centre\u2019s plan yet.');
  }
  return { student, centreId };
}

/** Open (or return) the one-to-one chat between the caller and one target.
 *  Same centre: open to everyone, no request of any kind. Across centres:
 *  students only, and only when an accepted friend request links them. Staff
 *  callers never reach past their own centre. */
/** ---------------------------------------------------------------------------
 * Student chat privacy settings (the Friends and privacy screen). One doc per
 * student in the chatSettings collection; the server reads them wherever a
 * friend request is sent or a cross-centre chat is opened, so the choices are
 * enforced here, never only in the screens.
 * ------------------------------------------------------------------------- */
const CHAT_SETTINGS_DEFAULTS = { friendRequests: 'everyone', messages: 'friends', autoAccept: 'ask' };
const CHAT_FRIEND_REQUEST_CHOICES = ['everyone', 'centre', 'class', 'nobody'];
const CHAT_MESSAGE_CHOICES = ['friends', 'friends_class', 'nobody'];
const CHAT_AUTO_ACCEPT_CHOICES = ['ask', 'auto'];

type ChatSettings = { friendRequests: string; messages: string; autoAccept: string };

async function chatSettingsFor(uid: string): Promise<ChatSettings> {
  try {
    const snap = await adminDb.collection('chatSettings').doc(cleanStr(uid, 64)).get();
    const v = (snap.data() || {}) as any;
    const fr = cleanStr(v.friendRequests, 16);
    const ms = cleanStr(v.messages, 16);
    const aa = cleanStr(v.autoAccept, 16);
    return {
      friendRequests: CHAT_FRIEND_REQUEST_CHOICES.includes(fr) ? fr : CHAT_SETTINGS_DEFAULTS.friendRequests,
      messages: CHAT_MESSAGE_CHOICES.includes(ms) ? ms : CHAT_SETTINGS_DEFAULTS.messages,
      autoAccept: CHAT_AUTO_ACCEPT_CHOICES.includes(aa) ? aa : CHAT_SETTINGS_DEFAULTS.autoAccept,
    };
  } catch {
    return { ...CHAT_SETTINGS_DEFAULTS };
  }
}

async function openPersonalCore(caller: Caller, opts: { role: 'student' | 'staff'; centreId: string; targetUid: string }): Promise<Record<string, unknown>> {
  const targetUid = cleanStr(opts.targetUid, 64);
  if (!targetUid) throw httpError(400, 'Choose who you want to chat with.');
  if (targetUid === caller.uid) throw httpError(400, 'You cannot start a chat with yourself.');
  const target = await chatTargetInfo(targetUid);
  if (!target) throw httpError(404, 'No member was found for that chat.');

  const staffRole = opts.role === 'staff';
  const sameCentre = target.centres.includes(opts.centreId);
  if (!sameCentre) {
    if (staffRole || !target.isStudent) {
      throw httpError(403, 'Staff can only chat with people in their own centre.');
    }
    if (!(await friendshipAccepted(caller.uid, targetUid))) {
      throw httpError(403, 'You can only chat with students from other centres after you become friends. Send a friend request from the leaderboard.');
    }
    // The target's own choice: "nobody" closes new cross-centre chats even
    // for existing friends. Chats already opened are untouched.
    const targetSettings = await chatSettingsFor(targetUid);
    if (targetSettings.messages === 'nobody') {
      throw httpError(403, `${target.username} is not opening new chats right now.`);
    }
  }

  const chatId = pairId('dm', caller.uid, targetUid);
  const snap = await adminDb.collection('chatGroups').doc(chatId).get();
  const now = new Date().toISOString();
  const memberCentres: Record<string, string> = { [caller.uid]: opts.centreId };
  memberCentres[targetUid] = sameCentre ? opts.centreId : (target.centres.find((c) => c !== opts.centreId) || '');
  await adminDb.collection('chatGroups').doc(chatId).set({
    kind: 'personal',
    centreId: sameCentre ? opts.centreId : null,
    crossCentre: !sameCentre,
    members: [caller.uid, targetUid].sort(),
    memberCentres,
    access: { mode: 'none' },
    createdBy: snap.exists ? cleanStr((snap.data() as any)?.createdBy, 64) || caller.uid : caller.uid,
    createdByRole: snap.exists ? cleanStr((snap.data() as any)?.createdByRole, 20) || (staffRole ? 'centre_admin' : 'student') : (staffRole ? 'centre_admin' : 'student'),
    createdAt: snap.exists ? cleanStr((snap.data() as any)?.createdAt, 40) || now : now,
    updatedAt: now,
    active: true,
  }, { merge: true });
  return {
    ok: true,
    chatId,
    created: !snap.exists,
    name: personDisplayName(target),
    username: target.username,
    crossCentre: !sameCentre,
  };
}

/** The pending and accepted friend requests of one student. */
async function friendsListFor(caller: Caller): Promise<Record<string, unknown>> {
  const { centreId } = await studentChatBase(caller);
  const [outSnap, inSnap] = await Promise.all([
    adminDb.collection('chatFriendRequests').where('fromUid', '==', caller.uid).limit(MAX_FRIENDS_PAGE).get(),
    adminDb.collection('chatFriendRequests').where('toUid', '==', caller.uid).limit(MAX_FRIENDS_PAGE).get(),
  ]);
  const centreIds: string[] = [centreId];
  const incoming: any[] = [];
  const outgoing: any[] = [];
  const friends: any[] = [];
  const seen = new Set<string>();
  const handle = (doc: QueryDocumentSnapshot<DocumentData>) => {
    const d = doc.data() as any;
    const status = cleanStr(d?.status, 12);
    const fromUid = cleanStr(d?.fromUid, 64);
    const toUid = cleanStr(d?.toUid, 64);
    if (!fromUid || !toUid) return;
    const iAmFrom = fromUid === caller.uid;
    const otherUid = iAmFrom ? toUid : fromUid;
    if (!otherUid || otherUid === caller.uid) return;
    const entry = {
      id: doc.id,
      uid: otherUid,
      username: cleanStr(iAmFrom ? d?.toUsername : d?.fromUsername, 16),
      centreId: cleanStr(iAmFrom ? d?.toCentreId : d?.fromCentreId, 120),
      at: cleanStr(d?.createdAt, 40),
    };
    if (entry.centreId) centreIds.push(entry.centreId);
    if (status === 'pending') {
      (iAmFrom ? outgoing : incoming).push(entry);
    } else if (status === 'accepted' && !seen.has(otherUid)) {
      seen.add(otherUid);
      friends.push({ ...entry, chatId: pairId('dm', caller.uid, otherUid) });
    }
  };
  outSnap.forEach(handle);
  inSnap.forEach(handle);
  const centreNames = await centreNamesFor(centreIds);
  const withCentre = (x: any) => ({ ...x, centreName: centreNames.get(x.centreId) || x.centreId });
  return { ok: true, incoming: incoming.map(withCentre), outgoing: outgoing.map(withCentre), friends: friends.map(withCentre) };
}

async function readMeta(groupId: string): Promise<{ msgCount: number; pruned: number }> {
  const snap = await adminRtdb.ref(`chat/groups/${groupId}/meta`).get();
  const v = snap.val() || {};
  return { msgCount: Number(v.msgCount) || 0, pruned: Number(v.pruned) || 0 };
}

async function lastReadCount(groupId: string, uid: string): Promise<number> {
  const snap = await adminRtdb.ref(`chat/groups/${groupId}/counters/${uid}/lastReadCount`).get();
  return Number(snap.val()) || 0;
}

async function unreadFor(groupId: string, uid: string): Promise<number> {
  const meta = await readMeta(groupId);
  const read = await lastReadCount(groupId, uid);
  return Math.max(0, meta.msgCount - meta.pruned - read);
}

async function mutedUntil(uid: string, centreId: string): Promise<number | null> {
  const snap = await adminDb.collection('chatMutes').doc(`${centreId}__${uid}`).get();
  if (!snap.exists) return null;
  const until = Number((snap.data() as any)?.until) || 0;
  return until > Date.now() ? until : null;
}

async function usernameFor(uid: string): Promise<string> {
  const snap = await adminDb.collection('usernames').where('studentId', '==', uid).limit(1).get();
  if (snap.empty) return '';
  return cleanStr(snap.docs[0].data().username, 16);
}

async function consumePostRateLimit(uid: string, maxPerHour: number): Promise<void> {
  await adminDb.runTransaction(async (tx) => {
    const ref = adminDb.collection('rateLimits').doc(`chat:${uid}`);
    const doc = await tx.get(ref);
    const now = Date.now();
    let count = 1;
    let windowStart = now;
    if (doc.exists && now - ((doc.data() as any)?.windowStart || 0) <= 60 * 60 * 1000) {
      count = ((doc.data() as any)?.count || 0) + 1;
      windowStart = (doc.data() as any).windowStart;
    }
    if (count > maxPerHour) {
      const waitMinutes = Math.ceil((windowStart + 60 * 60 * 1000 - now) / 60000);
      throw httpError(429, `You are sending messages too quickly. Please wait ${waitMinutes} minutes.`);
    }
    tx.set(ref, { count, windowStart, expiresAt: new Date(windowStart + 2 * 60 * 60 * 1000) }, { merge: true });
  });
}

async function writeMessage(group: GroupDoc, sender: { uid: string; username: string; role: string }, text: string, photoUrl: string | null, extras?: Record<string, unknown>): Promise<void> {
  const msgRef = adminRtdb.ref(`chat/groups/${group.id}/messages`).push();
  await msgRef.set({
    uid: sender.uid,
    username: sender.username,
    role: sender.role,
    text,
    photoUrl: photoUrl || null,
    at: ServerValue.TIMESTAMP,
    removed: null,
    ...(extras || {}),
  });
  const metaRef = adminRtdb.ref(`chat/groups/${group.id}/meta`);
  await metaRef.transaction((m: any) => ({ ...(m || {}), msgCount: (Number(m?.msgCount) || 0) + 1 }));
}

/** Retention: messages past the setting are deleted in small batches on group
 *  opens, and the pruned count keeps unread badges honest. */
async function pruneOld(group: GroupDoc, retentionDays: number): Promise<void> {
  if (!(retentionDays > 0)) return;
  const cutoff = Date.now() - retentionDays * DAY_MS;
  const snap = await adminRtdb
    .ref(`chat/groups/${group.id}/messages`)
    .orderByChild('at')
    .endBefore(cutoff)
    .limitToFirst(RETENTION_BATCH)
    .get();
  const keys: string[] = [];
  snap.forEach((c) => { if (c.key) keys.push(c.key); });
  if (keys.length === 0) return;
  const updates: Record<string, null> = {};
  keys.forEach((k) => { updates[k] = null; });
  await adminRtdb.ref(`chat/groups/${group.id}/messages`).update(updates);
  const metaRef = adminRtdb.ref(`chat/groups/${group.id}/meta`);
  await metaRef.transaction((m: any) => ({ ...(m || {}), pruned: (Number(m?.pruned) || 0) + keys.length }));
}

/** Reactions may only be emoji: one short emoji string, nothing else. */
const EMOJI_OK = /^(?:[\u{1F000}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|[\u{2B00}-\u{2BFF}]|[\u{1F1E6}-\u{1F1FF}]|[\u{00A9}\u{00AE}\u{203C}\u{2049}\u{2122}]|[\u{FE0F}\u{200D}\u{20E3}])+$/u;
function sanitizeEmoji(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const e = raw.trim();
  if (!e || e.length > 16) return null;
  return EMOJI_OK.test(e) ? e : null;
}

/** Only real emoji strings survive a read, keyed by the reacting user's id. */
function sanitizeReactions(v: unknown): Record<string, string> | null {
  if (!v || typeof v !== 'object') return null;
  const out: Record<string, string> = {};
  Object.entries(v as Record<string, unknown>).forEach(([k, val]) => {
    if (typeof val === 'string' && val && val.length <= 16) out[cleanStr(k, 64)] = val;
  });
  return Object.keys(out).length ? out : null;
}

/** One message straight off the RTDB node, for actions that act on it. */
async function loadMessage(groupId: string, msgId: string): Promise<Record<string, any>> {
  const snap = await adminRtdb.ref(`chat/groups/${groupId}/messages/${cleanStr(msgId, 128)}`).get();
  const v = snap.val();
  if (!v) throw httpError(404, 'That message is no longer available.');
  return v as Record<string, any>;
}

/** Reactions: one emoji per person per message; sending the same emoji again
 *  takes it back off. The reactions live on the message node itself. */
async function toggleReaction(groupId: string, msgId: string, uid: string, emoji: string): Promise<void> {
  const ref = adminRtdb.ref(`chat/groups/${groupId}/messages/${cleanStr(msgId, 128)}`);
  const v = await loadMessage(groupId, msgId);
  const reactions: Record<string, string> = {};
  const existing = (v.reactions && typeof v.reactions === 'object') ? v.reactions : {};
  Object.entries(existing).forEach(([k, val]) => {
    if (typeof val === 'string' && val && val.length <= 16) reactions[cleanStr(k, 64)] = val;
  });
  if (reactions[uid] === emoji) delete reactions[uid];
  else reactions[uid] = emoji;
  await ref.child('reactions').set(Object.keys(reactions).length ? reactions : null);
}

/** Reply context: a short quote of the message being replied to, built on the
 *  server so a reply always matches the real message it points at. */
async function buildReplyTo(groupId: string, msgId: unknown): Promise<Record<string, string> | null> {
  if (typeof msgId !== 'string' || !msgId.trim()) return null;
  const id = msgId.trim().slice(0, 128);
  const v = await loadMessage(groupId, id);
  if (v.removed) throw httpError(404, 'The message you replied to is no longer available.');
  return {
    id,
    username: cleanStr(v.username, 16) || 'Member',
    excerpt: v.text ? String(v.text).slice(0, 120) : '[Photo]',
  };
}

async function getStudentDoc(uid: string) {
  const snap = await adminDb.collection('students').where('uid', '==', uid).limit(1).get();
  if (snap.empty) return null;
  return snap.docs[0];
}

/** Shared student-side preconditions for one group: entitlement, group
 *  existence, centre match, pause, membership, gate. Returns everything the
 *  routes need afterwards. */
async function studentGroupContext(caller: Caller, groupId: string, forPost: boolean) {
  const stuSnap = await getStudentDoc(caller.uid);
  if (!stuSnap) throw httpError(403, 'No student record is linked to this account.');
  const student = stuSnap.data() as any;
  const centreId = cleanStr(student.centreId, 120);
  if (!centreId) throw httpError(403, 'No centre is linked to this account.');
  await requireMembership(caller, centreId);
  const entitlements = await getCentreEntitlements(centreId);
  if (entitlements.chat !== true) {
    throw httpError(403, 'Chat is not part of your centre\u2019s plan yet.');
  }
  const group = await loadGroup(groupId);
  const isTosChannel = group.kind === 'tos_channel';
  const isPersonal = group.kind === 'personal';
  if (isPersonal) {
    // A one-to-one chat is open only to its two members, whatever centres
    // they belong to; the friend rules were already checked when it opened.
    if (!(await personalMembersOf(groupId)).includes(caller.uid)) throw httpError(404, 'Group not found.');
  } else {
    if (!isTosChannel && group.centreId !== centreId) throw httpError(404, 'Group not found.');
    if (isTosChannel && group.centreId) throw httpError(404, 'Group not found.');
  }
  const centreChat = isTosChannel || isPersonal ? await getCentreChat(centreId) : await getCentreChat(group.centreId as string);
  if (!isTosChannel && centreChat.paused) {
    throw httpError(503, 'Chat is paused for your centre right now.');
  }
  const stats = await sevenDayStats(caller.uid, centreId);
  const gate = gateFor(group, centreChat, await getTosChat());
  const lock = lockState(group, gate, stats, centreChat);
  if (lock.locked) {
    if (forPost) {
      throw httpError(403, JSON.stringify({ locked: true, myPercent: lock.myPercent, thresholdPercent: lock.thresholdPercent, myAnswers: lock.myAnswers, minAnswers: lock.minAnswers }));
    }
  }
  if (!isPersonal && !studentInGroup(student.subjects, group)) throw httpError(403, 'You are not a member of this group.');
  return { student, centreId, group, centreChat, lock, isTosChannel };
}

/** One chat photo upload: a data URL in, a hosted URL out. Photos ride the
 *  same unsigned Cloudinary preset the platform already uses, and the centre's
 *  own photo size setting decides the cap. */
async function uploadChatPhoto(dataUrl: string, photoMaxKb: number): Promise<string> {
  const m = /^data:(image\/(?:png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw httpError(400, 'That file is not a photo this chat can send.');
  const bytes = Math.floor((m[2].length * 3) / 4);
  if (bytes > photoMaxKb * 1024) throw httpError(413, `Photos can be up to ${photoMaxKb} KB after compression.`);
  const cloud = String(process.env.CLOUDINARY_CLOUD_NAME || '');
  const preset = String(process.env.CLOUDINARY_UPLOAD_PRESET || '');
  if (!cloud || !preset) throw httpError(500, 'Photo hosting is not configured on this deployment.');
  const form = new FormData();
  form.append('upload_preset', preset);
  form.append('folder', 'tos/chat');
  form.append('file', dataUrl);
  const resp = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: 'POST', body: form });
  const data: any = await resp.json().catch(() => null);
  const url = data && typeof data.secure_url === 'string' ? data.secure_url : '';
  if (!resp.ok || !url) throw httpError(502, 'The photo could not be uploaded. Try again.');
  return url;
}

// Status media upload. The same unsigned Cloudinary preset the chat photo
// route uses; video and music files go through the video endpoint, which is
// where Cloudinary takes audio too. Each kind is capped by its own stored
// setting, checked here before anything leaves the server.
async function uploadStatusMedia(kind: 'photo' | 'video' | 'music', dataUrl: string, st: TosStatusSettings, photoMaxKb: number): Promise<string> {
  const pattern = kind === 'photo'
    ? /^data:(image\/(?:png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=]+)$/
    : kind === 'video'
      ? /^data:(video\/(?:mp4|webm|quicktime|x-m4v|3gpp|ogg));base64,([A-Za-z0-9+/=]+)$/
      : /^data:(audio\/(?:mpeg|mp3|ogg|wav|x-m4a|m4a|aac|flac|webm));base64,([A-Za-z0-9+/=]+)$/;
  const m = pattern.exec(dataUrl);
  if (!m) {
    const what = kind === 'photo' ? 'photo' : kind === 'video' ? 'video' : 'music file';
    throw httpError(400, `That file is not a ${what} this status can use.`);
  }
  const bytes = Math.floor((m[2].length * 3) / 4);
  if (kind === 'photo' && bytes > photoMaxKb * 1024) {
    throw httpError(413, `Photos can be up to ${photoMaxKb} KB after compression.`);
  }
  if (kind === 'video' && bytes > st.maxVideoMb * 1024 * 1024) {
    throw httpError(413, `Videos can be up to ${st.maxVideoMb} MB.`);
  }
  if (kind === 'music' && bytes > st.maxAudioMb * 1024 * 1024) {
    throw httpError(413, `Music files can be up to ${st.maxAudioMb} MB.`);
  }
  const cloud = String(process.env.CLOUDINARY_CLOUD_NAME || '');
  const preset = String(process.env.CLOUDINARY_UPLOAD_PRESET || '');
  if (!cloud || !preset) throw httpError(500, 'Media hosting is not configured on this deployment.');
  const endpoint = kind === 'photo' ? 'image' : 'video';
  const form = new FormData();
  form.append('upload_preset', preset);
  form.append('folder', 'tos/status');
  form.append('file', dataUrl);
  const resp = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/${endpoint}/upload`, { method: 'POST', body: form });
  const data: any = await resp.json().catch(() => null);
  const url = data && typeof data.secure_url === 'string' ? data.secure_url : '';
  if (!resp.ok || !url) throw httpError(502, 'The upload could not be completed. Try again.');
  return url;
}

// ============================================================================
// Student routes
// ============================================================================

export function registerChatRoutes(app: express.Express): void {
  // The chat home: the student's groups with unread counts and lock states.
  app.get('/api/student/chat/overview', async (req, res) => {
    try {
      const caller = getCaller(req);
      const stuSnap = await getStudentDoc(caller.uid);
      if (!stuSnap) return res.status(403).json({ error: 'No student record is linked to this account.' });
      const student = stuSnap.data() as any;
      const centreId = cleanStr(student.centreId, 120);
      if (!centreId) return res.status(403).json({ error: 'No centre is linked to this account.' });
      await requireMembership(caller, centreId);
      const entitlements = await getCentreEntitlements(centreId);
      if (entitlements.chat !== true) {
        return res.status(403).json({ error: 'Chat is not part of your centre\u2019s plan yet.' });
      }
      const [centreChat, tosChat] = await Promise.all([getCentreChat(centreId), getTosChat()]);
      const stats = await sevenDayStats(caller.uid, centreId);
      const username = await usernameFor(caller.uid);

      const centreGroupsSnap = await adminDb.collection('chatGroups').where('centreId', '==', centreId).limit(50).get();
      const tosChannelSnap = await adminDb.collection('chatGroups').where('kind', '==', 'tos_channel').limit(1).get();
      const docs = [...centreGroupsSnap.docs, ...tosChannelSnap.docs];

      const groups: any[] = [];
      for (const g of docs) {
        const group = loadGroupFromDoc(g);
        if (!studentInGroup(student.subjects, group)) continue;
        const gate = gateFor(group, centreChat, tosChat);
        const lock = lockState(group, gate, stats, centreChat);
        const unread = lock.locked ? 0 : await unreadFor(group.id, caller.uid);
        let last: any = null;
        if (!lock.locked) {
          const snap = await adminRtdb.ref(`chat/groups/${group.id}/messages`).limitToLast(1).get();
          snap.forEach((c) => {
            const v = c.val() || {};
            last = { text: cleanStr(v.text, 120), at: Number(v.at) || 0, removed: Boolean(v.removed), role: cleanStr(v.role, 20) };
          });
        }
        groups.push({
          id: group.id,
          name: group.name,
          kind: group.kind,
          subject: group.subject,
          unread,
          locked: lock.locked,
          thresholdPercent: lock.thresholdPercent,
          myPercent: lock.myPercent,
          myAnswers: lock.myAnswers,
          minAnswers: lock.minAnswers,
          lastMessage: last,
          canPost: group.kind !== 'announcements' && group.kind !== 'tos_channel',
        });
      }
      // One-to-one chats: every personal chat this student is in, named after
      // the other person by the platform's chat-name rule. Personal chats are
      // never gated, so their lock is always open.
      const personalSnap = await adminDb.collection('chatGroups')
        .where('members', 'array-contains', caller.uid).limit(100).get();
      const personalDocs: { id: string; other: string }[] = [];
      const otherUids: string[] = [];
      personalSnap.forEach((d) => {
        const v = d.data() as any;
        if (v.kind !== 'personal' || v.active === false) return;
        const members = Array.isArray(v.members) ? v.members.map((x: any) => cleanStr(x, 64)).filter(Boolean) : [];
        if (members.length !== 2 || !members.includes(caller.uid)) return;
        const other = members.find((m) => m !== caller.uid) as string;
        personalDocs.push({ id: d.id, other });
        otherUids.push(other);
      });
      const personalNames = await statusNamesFor(otherUids);
      for (const p of personalDocs) {
        const info = personalNames.get(p.other);
        const displayName = info ? (info.username || info.name || 'Chat') : 'Chat';
        const unread = await unreadFor(p.id, caller.uid);
        let last: any = null;
        const snap = await adminRtdb.ref(`chat/groups/${p.id}/messages`).limitToLast(1).get();
        snap.forEach((c) => {
          const v = c.val() || {};
          last = { text: cleanStr(v.text, 120), at: Number(v.at) || 0, removed: Boolean(v.removed), role: cleanStr(v.role, 20) };
        });
        groups.push({
          id: p.id,
          name: displayName,
          kind: 'personal',
          subject: null,
          unread,
          locked: false,
          thresholdPercent: 0,
          myPercent: stats.percent,
          myAnswers: stats.answered,
          minAnswers: centreChat.minAnswers,
          lastMessage: last,
          canPost: true,
          peerUid: p.other,
          peerUsername: info?.username || '',
        });
      }
      groups.sort((a, b) => {
        const rank = (k: string) => (k === 'announcements' ? 0 : k === 'tos_channel' ? 1 : 2);
        const r = rank(a.kind) - rank(b.kind);
        if (r !== 0) return r;
        const at = a.lastMessage?.at || 0;
        const bt = b.lastMessage?.at || 0;
        if (at !== bt) return bt - at;
        return a.name.localeCompare(b.name);
      });

      res.json({
        ok: true,
        username,
        photosAllowed: centreChat.photosAllowed,
        paused: centreChat.paused,
        messageMaxChars: tosChat.messageMaxChars,
        myPercent: stats.percent,
        myAnswers: stats.answered,
        minAnswers: centreChat.minAnswers,
        groups,
      });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] overview failed');
    }
  });

  // Status home, piece 1 (read-only): the centre's active status updates,
  // split into new and already-seen for this viewer. Status data lives in the
  // Realtime Database under chat/status/{centreId}/{uid}/{statusId} and is
  // read ONLY here, like every other chat path. A status is active until its
  // stored expiresAt, which the poster's write sets from the lasts-hours
  // setting that was in force when it was posted: settings apply going
  // forward, nothing is rewritten in old statuses. The seen index lives at
  // chat/statusViews/{centreId}/{viewerUid}/{statusId} and is written by the
  // viewer route in a later piece, so until then nothing counts as seen.
  app.get('/api/student/chat/status/overview', async (req, res) => {
    try {
      const caller = getCaller(req);
      const stuSnap = await getStudentDoc(caller.uid);
      if (!stuSnap) return res.status(403).json({ error: 'No student record is linked to this account.' });
      const student = stuSnap.data() as any;
      // Every centre this student belongs to, not just the one they joined
      // first; statuses from all of them (plus TOS's own feed) make up the
      // overview. A centre whose plan has no chat contributes nothing.
      const memSnap = await adminDb.collection('memberships').where('uid', '==', caller.uid).limit(10).get();
      const centreIds: string[] = [];
      memSnap.forEach((d) => {
        const v = d.data() as any;
        const cid = cleanStr(v?.centreId, 120);
        const role = cleanStr(v?.role, 20);
        if (cid && ['student', ''].includes(role) && !centreIds.includes(cid)) centreIds.push(cid);
      });
      const activeCentreIds: string[] = [];
      for (const cid of centreIds) {
        const ent = await getCentreEntitlements(cid);
        if (ent.chat === true) activeCentreIds.push(cid);
      }
      if (!activeCentreIds.length) {
        return res.status(403).json({ error: 'Chat is not part of your centre\u2019s plan yet.' });
      }
      res.json(await statusOverviewCore(caller, activeCentreIds, { name: cleanStr(student.name, MAX_NAME_CHARS), username: await usernameFor(caller.uid), avatar: cleanStr(student.avatar, 400) }, { includeTos: true }));
    } catch (error: any) {
      handleRouteError(res, error, '[chat] status overview failed');
    }
  });

  // Piece 2: posting a text status. The same preconditions as the overview,
  // then the stored settings decide everything: whether status is on at all,
  // whether text updates are allowed, how long the status lives (expiresAt is
  // fixed at post time from the setting in force then) and how many statuses
  // one student may post in a rolling 24 hours. Nothing is decided in a
  // screen and no cap lives in code.
  app.post('/api/student/chat/status', async (req, res) => {
    try {
      const caller = getCaller(req);
      const body = req.body || {};
      const stuSnap = await getStudentDoc(caller.uid);
      if (!stuSnap) throw httpError(403, 'No student record is linked to this account.');
      const student = stuSnap.data() as any;
      const centreId = cleanStr(student.centreId, 120);
      if (!centreId) throw httpError(403, 'No centre is linked to this account.');
      await requireMembership(caller, centreId);
      const entitlements = await getCentreEntitlements(centreId);
      if (entitlements.chat !== true) throw httpError(403, 'Chat is not part of your centre\u2019s plan yet.');
      res.json(await statusPostCore(caller, centreId, body));
    } catch (error: any) {
      handleRouteError(res, error, '[chat] status post failed');
    }
  });

  // Piece 4: media uploads for statuses. Same preconditions as posting; the
  // kind's stored setting decides the cap, and the video length is checked
  // against maxVideoSeconds before anything is stored. The upload returns a
  // Cloudinary URL that the status POST then verifies belongs to this app.
  app.post('/api/student/chat/status/upload', async (req, res) => {
    try {
      const caller = getCaller(req);
      const body = req.body || {};
      const stuSnap = await getStudentDoc(caller.uid);
      if (!stuSnap) throw httpError(403, 'No student record is linked to this account.');
      const student = stuSnap.data() as any;
      const centreId = cleanStr(student.centreId, 120);
      if (!centreId) throw httpError(403, 'No centre is linked to this account.');
      await requireMembership(caller, centreId);
      const entitlements = await getCentreEntitlements(centreId);
      if (entitlements.chat !== true) throw httpError(403, 'Chat is not part of your centre\u2019s plan yet.');
      res.json(await statusUploadCore(caller, centreId, body));
    } catch (error: any) {
      handleRouteError(res, error, '[chat] status upload failed');
    }
  });

  // Upload authorization for the direct browser-to-hosting upload the media
  // composer uses; the stored settings decide every cap, checked here.
  app.post('/api/student/chat/status/upload-config', async (req, res) => {
    try {
      const caller = getCaller(req);
      const body = req.body || {};
      const stuSnap = await getStudentDoc(caller.uid);
      if (!stuSnap) throw httpError(403, 'No student record is linked to this account.');
      const student = stuSnap.data() as any;
      const centreId = cleanStr(student.centreId, 120);
      if (!centreId) throw httpError(403, 'No centre is linked to this account.');
      await requireMembership(caller, centreId);
      const entitlements = await getCentreEntitlements(centreId);
      if (entitlements.chat !== true) throw httpError(403, 'Chat is not part of your centre\u2019s plan yet.');
      res.json(await statusUploadConfigCore(caller, centreId, body));
    } catch (error: any) {
      handleRouteError(res, error, '[chat] status upload config failed');
    }
  });

  // Piece 3: viewing statuses. One endpoint returns one person's active
  // statuses; the viewer marks them seen (POST seen) and may reply (POST
  // reply). Every route re-checks membership, the chat entitlement and the
  // stored status settings; nothing is decided in a screen.
  app.get('/api/student/chat/status/user/:uid', async (req, res) => {
    try {
      const caller = getCaller(req);
      const stuSnap = await getStudentDoc(caller.uid);
      if (!stuSnap) return res.status(403).json({ error: 'No student record is linked to this account.' });
      const student = stuSnap.data() as any;
      let centreId = cleanStr(student.centreId, 120);
      if (!centreId) return res.status(403).json({ error: 'No centre is linked to this account.' });
      // A status may live in any centre the caller belongs to, or in TOS's
      // own feed; the request names the centre it came from.
      const requestedCentre = cleanStr(String((req.query || {}).centreId || ''), 120);
      if (requestedCentre && requestedCentre !== centreId) {
        if (requestedCentre !== TOS_STATUS_CENTRE) {
          await requireMembership(caller, requestedCentre);
          const otherEnt = await getCentreEntitlements(requestedCentre);
          if (otherEnt.chat !== true) return res.status(403).json({ error: 'Chat is not part of your centre\u2019s plan yet.' });
        }
        centreId = requestedCentre;
      } else {
        await requireMembership(caller, centreId);
        const entitlements = await getCentreEntitlements(centreId);
        if (entitlements.chat !== true) return res.status(403).json({ error: 'Chat is not part of your centre\u2019s plan yet.' });
      }
      const ownerUid = cleanStr(req.params?.uid, 64);
      if (!ownerUid) return res.status(400).json({ error: 'Which status is this?' });
      res.json(await statusUserCore(caller, centreId, ownerUid, cleanStr(student.name, MAX_NAME_CHARS), await usernameFor(caller.uid)));
    } catch (error: any) {
      handleRouteError(res, error, '[chat] status user failed');
    }
  });

  // Marking a status seen. Idempotent per viewer: the first view writes the
  // seen index and bumps the owner's seen counter, later ones change nothing.
  app.post('/api/student/chat/status/seen', async (req, res) => {
    try {
      const caller = getCaller(req);
      const body = req.body || {};
      const stuSnap = await getStudentDoc(caller.uid);
      if (!stuSnap) return res.status(403).json({ error: 'No student record is linked to this account.' });
      const student = stuSnap.data() as any;
      let centreId = cleanStr(student.centreId, 120);
      if (!centreId) return res.status(403).json({ error: 'No centre is linked to this account.' });
      // A status may live in any centre the caller belongs to, or in TOS's
      // own feed; the request names the centre it came from.
      const requestedCentre = cleanStr(String((req.query || {}).centreId || ''), 120);
      if (requestedCentre && requestedCentre !== centreId) {
        if (requestedCentre !== TOS_STATUS_CENTRE) {
          await requireMembership(caller, requestedCentre);
          const otherEnt = await getCentreEntitlements(requestedCentre);
          if (otherEnt.chat !== true) return res.status(403).json({ error: 'Chat is not part of your centre\u2019s plan yet.' });
        }
        centreId = requestedCentre;
      } else {
        await requireMembership(caller, centreId);
        const entitlements = await getCentreEntitlements(centreId);
        if (entitlements.chat !== true) return res.status(403).json({ error: 'Chat is not part of your centre\u2019s plan yet.' });
      }
      res.json(await statusSeenCore(caller, centreId, body));
    } catch (error: any) {
      handleRouteError(res, error, '[chat] status seen failed');
    }
  });

  // Replying to a status. Replies live with the status, and only the owner
  // reads them back, so the reply rides the same preconditions as viewing:
  // membership, entitlement, and the stored allowReplies setting in force
  // right now. The reply length uses the chat message cap, and posting
  // shares the chat rate limit so replies cannot be used to flood.
  app.post('/api/student/chat/status/reply', async (req, res) => {
    try {
      const caller = getCaller(req);
      const body = req.body || {};
      const stuSnap = await getStudentDoc(caller.uid);
      if (!stuSnap) return res.status(403).json({ error: 'No student record is linked to this account.' });
      const student = stuSnap.data() as any;
      let centreId = cleanStr(student.centreId, 120);
      if (!centreId) return res.status(403).json({ error: 'No centre is linked to this account.' });
      // A status may live in any centre the caller belongs to, or in TOS's
      // own feed; the request names the centre it came from.
      const requestedCentre = cleanStr(String((req.query || {}).centreId || ''), 120);
      if (requestedCentre && requestedCentre !== centreId) {
        if (requestedCentre !== TOS_STATUS_CENTRE) {
          await requireMembership(caller, requestedCentre);
          const otherEnt = await getCentreEntitlements(requestedCentre);
          if (otherEnt.chat !== true) return res.status(403).json({ error: 'Chat is not part of your centre\u2019s plan yet.' });
        }
        centreId = requestedCentre;
      } else {
        await requireMembership(caller, centreId);
        const entitlements = await getCentreEntitlements(centreId);
        if (entitlements.chat !== true) return res.status(403).json({ error: 'Chat is not part of your centre\u2019s plan yet.' });
      }
      res.json(await statusReplyCore(caller, centreId, body, { name: cleanStr(student.name, MAX_NAME_CHARS), username: await usernameFor(caller.uid) }));
    } catch (error: any) {
      handleRouteError(res, error, '[chat] status reply failed');
    }
  });

  // ---------------------------------------------------------------------------
  // TOS status: the platform's own feed. It lives in the same status engine
  // under the reserved centre id '__tos__', so the stored settings, the
  // limits and expiry all apply unchanged. Only TOS staff may post here;
  // every student's overview merges this feed into their centre feeds.
  // ---------------------------------------------------------------------------

  app.get('/api/tos/chat/status/overview', async (req, res) => {
    try {
      const caller = getCaller(req);
      if (!caller.tos) throw httpError(403, 'TOS staff only.');
      res.json(await statusOverviewCore(caller, [TOS_STATUS_CENTRE], { name: 'TOS', username: '' }));
    } catch (error: any) {
      handleRouteError(res, error, '[chat] tos status overview failed');
    }
  });

  app.post('/api/tos/chat/status', async (req, res) => {
    try {
      const caller = getCaller(req);
      if (!caller.tos) throw httpError(403, 'TOS staff only.');
      res.json(await statusPostCore(caller, TOS_STATUS_CENTRE, req.body || {}));
    } catch (error: any) {
      handleRouteError(res, error, '[chat] tos status post failed');
    }
  });

  app.post('/api/tos/chat/status/upload', async (req, res) => {
    try {
      const caller = getCaller(req);
      if (!caller.tos) throw httpError(403, 'TOS staff only.');
      res.json(await statusUploadCore(caller, TOS_STATUS_CENTRE, req.body || {}));
    } catch (error: any) {
      handleRouteError(res, error, '[chat] tos status upload failed');
    }
  });

  app.post('/api/tos/chat/status/upload-config', async (req, res) => {
    try {
      const caller = getCaller(req);
      if (!caller.tos) throw httpError(403, 'TOS staff only.');
      res.json(await statusUploadConfigCore(caller, TOS_STATUS_CENTRE, req.body || {}));
    } catch (error: any) {
      handleRouteError(res, error, '[chat] tos status upload config failed');
    }
  });

  app.get('/api/tos/chat/status/user/:uid', async (req, res) => {
    try {
      const caller = getCaller(req);
      if (!caller.tos) throw httpError(403, 'TOS staff only.');
      const ownerUid = cleanStr(req.params?.uid, 64);
      if (!ownerUid) throw httpError(400, 'Which status is this?');
      res.json(await statusUserCore(caller, TOS_STATUS_CENTRE, ownerUid, 'TOS', ''));
    } catch (error: any) {
      handleRouteError(res, error, '[chat] tos status user failed');
    }
  });

  app.post('/api/tos/chat/status/seen', async (req, res) => {
    try {
      const caller = getCaller(req);
      if (!caller.tos) throw httpError(403, 'TOS staff only.');
      res.json(await statusSeenCore(caller, TOS_STATUS_CENTRE, req.body || {}));
    } catch (error: any) {
      handleRouteError(res, error, '[chat] tos status seen failed');
    }
  });

  app.post('/api/tos/chat/status/reply', async (req, res) => {
    try {
      const caller = getCaller(req);
      if (!caller.tos) throw httpError(403, 'TOS staff only.');
      res.json(await statusReplyCore(caller, TOS_STATUS_CENTRE, req.body || {}, { name: 'TOS', username: '' }));
    } catch (error: any) {
      handleRouteError(res, error, '[chat] tos status reply failed');
    }
  });

  app.post('/api/tos/chat/status/delete', async (req, res) => {
    try {
      const caller = getCaller(req);
      if (!caller.tos) throw httpError(403, 'TOS staff only.');
      const statusId = cleanStr(String((req.body || {}).statusId || ''), 64);
      if (!statusId) throw httpError(400, 'Which status is this?');
      await adminRtdb.ref(`chat/status/${TOS_STATUS_CENTRE}/${caller.uid}/${statusId}`).remove();
      res.json({ ok: true });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] tos status delete failed');
    }
  });

  // ---------------------------------------------------------------------------
  // Staff status (ST1): admins and tutors post to their centre's status and
  // view students' updates under the same stored settings and the same limits
  // students have. Their updates land in the same centre-wide list students
  // see, and the shared status engine keeps every rule in one place.
  // ---------------------------------------------------------------------------

  app.get('/api/centre/chat/status/overview', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = cleanStr(String(req.query.centreId || ''), 120);
      await staffStatusContext(caller, centreId);
      res.json(await statusOverviewCore(caller, [centreId], { name: await staffDisplayName(caller), username: '' }));
    } catch (error: any) {
      handleRouteError(res, error, '[chat] staff status overview failed');
    }
  });

  app.post('/api/centre/chat/status', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = cleanStr(String(req.query.centreId || ''), 120);
      await staffStatusContext(caller, centreId);
      res.json(await statusPostCore(caller, centreId, req.body || {}));
    } catch (error: any) {
      handleRouteError(res, error, '[chat] staff status post failed');
    }
  });

  app.post('/api/centre/chat/status/upload', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = cleanStr(String(req.query.centreId || ''), 120);
      await staffStatusContext(caller, centreId);
      res.json(await statusUploadCore(caller, centreId, req.body || {}));
    } catch (error: any) {
      handleRouteError(res, error, '[chat] staff status upload failed');
    }
  });

  app.post('/api/centre/chat/status/upload-config', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = cleanStr(String(req.query.centreId || ''), 120);
      await staffStatusContext(caller, centreId);
      res.json(await statusUploadConfigCore(caller, centreId, req.body || {}));
    } catch (error: any) {
      handleRouteError(res, error, '[chat] staff status upload config failed');
    }
  });

  app.get('/api/centre/chat/status/user/:uid', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = cleanStr(String(req.query.centreId || ''), 120);
      await staffStatusContext(caller, centreId);
      const ownerUid = cleanStr(req.params?.uid, 64);
      if (!ownerUid) throw httpError(400, 'Which status is this?');
      res.json(await statusUserCore(caller, centreId, ownerUid, await staffDisplayName(caller), ''));
    } catch (error: any) {
      handleRouteError(res, error, '[chat] staff status user failed');
    }
  });

  app.post('/api/centre/chat/status/seen', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = cleanStr(String(req.query.centreId || ''), 120);
      await staffStatusContext(caller, centreId);
      res.json(await statusSeenCore(caller, centreId, req.body || {}));
    } catch (error: any) {
      handleRouteError(res, error, '[chat] staff status seen failed');
    }
  });

  app.post('/api/centre/chat/status/reply', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = cleanStr(String(req.query.centreId || ''), 120);
      await staffStatusContext(caller, centreId);
      res.json(await statusReplyCore(caller, centreId, req.body || {}, { name: await staffDisplayName(caller), username: '' }));
    } catch (error: any) {
      handleRouteError(res, error, '[chat] staff status reply failed');
    }
  });

  // Paged history for one group. A locked student gets the lock state back
  // with their real numbers (the S4 screen), never the messages.
  // ---------------------------------------------------------------------------
  // Personal chats and friend requests. Opening a one-to-one chat enforces the
  // platform rules: inside one centre everyone can chat with everyone, with no
  // request of any kind; across centres it is students only, and only with an
  // accepted friend request; staff never chat across centres. Friend requests
  // start from a leaderboard username, which is the one place students see
  // students from other centres outside the TOS channels.
  // ---------------------------------------------------------------------------
  app.post('/api/student/chat/personal', async (req, res) => {
    try {
      const caller = getCaller(req);
      const { centreId } = await studentChatBase(caller);
      const centreChat = await getCentreChat(centreId);
      if (centreChat.paused) throw httpError(503, 'Chat is paused for your centre right now.');
      res.json(await openPersonalCore(caller, { role: 'student', centreId, targetUid: String((req.body || {}).uid || '') }));
    } catch (error: any) {
      handleRouteError(res, error, '[chat] personal open failed');
    }
  });

  app.post('/api/centre/chat/personal', async (req, res) => {
    try {
      const caller = getCaller(req);
      const body = req.body || {};
      const centreId = cleanStr(body.centreId, 120);
      if (!centreId) throw httpError(400, 'centreId is required.');
      await requireMembership(caller, centreId, ['owner', 'admin', 'tutor']);
      const entitlements = await getCentreEntitlements(centreId);
      if (entitlements.chat !== true) {
        throw httpError(403, 'Chat is not part of your centre\u2019s plan yet.');
      }
      const centreChat = await getCentreChat(centreId);
      if (centreChat.paused) throw httpError(503, 'Chat is paused for your centre right now.');
      res.json(await openPersonalCore(caller, { role: 'staff', centreId, targetUid: String(body.uid || '') }));
    } catch (error: any) {
      handleRouteError(res, error, '[chat] staff personal open failed');
    }
  });

  app.get('/api/student/chat/settings', async (req, res) => {
    try {
      const caller = getCaller(req);
      await studentChatBase(caller);
      res.json({ ok: true, settings: await chatSettingsFor(caller.uid) });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] settings read failed');
    }
  });

  app.post('/api/student/chat/settings', async (req, res) => {
    try {
      const caller = getCaller(req);
      await studentChatBase(caller);
      const body = req.body || {};
      const friendRequests = cleanStr(body.friendRequests, 16);
      const messages = cleanStr(body.messages, 16);
      const autoAccept = cleanStr(body.autoAccept, 16);
      if (friendRequests && !CHAT_FRIEND_REQUEST_CHOICES.includes(friendRequests)) {
        throw httpError(400, 'That friend-request choice is not one of the options.');
      }
      if (messages && !CHAT_MESSAGE_CHOICES.includes(messages)) {
        throw httpError(400, 'That messaging choice is not one of the options.');
      }
      if (autoAccept && !CHAT_AUTO_ACCEPT_CHOICES.includes(autoAccept)) {
        throw httpError(400, 'That request-handling choice is not one of the options.');
      }
      const current = await chatSettingsFor(caller.uid);
      const next: ChatSettings = {
        friendRequests: friendRequests || current.friendRequests,
        messages: messages || current.messages,
        autoAccept: autoAccept || current.autoAccept,
      };
      await adminDb.collection('chatSettings').doc(caller.uid).set({ ...next, updatedAt: new Date().toISOString() }, { merge: true });
      res.json({ ok: true, settings: next });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] settings save failed');
    }
  });

  app.post('/api/student/chat/friends/request', async (req, res) => {
    try {
      const caller = getCaller(req);
      const { centreId } = await studentChatBase(caller);
      const uname = cleanStr((req.body || {}).username, 16);
      if (!uname) throw httpError(400, 'Type the username to add.');
      let snap = await adminDb.collection('usernames').where('username', '==', uname).limit(1).get();
      if (snap.empty && uname.toLowerCase() !== uname) {
        snap = await adminDb.collection('usernames').where('username', '==', uname.toLowerCase()).limit(1).get();
      }
      if (snap.empty) throw httpError(404, 'No student uses that username on the leaderboard.');
      const targetUid = cleanStr(snap.docs[0].data()?.studentId, 64);
      if (!targetUid || targetUid === caller.uid) throw httpError(404, 'No student uses that username on the leaderboard.');
      const target = await chatTargetInfo(targetUid);
      if (!target || !target.isStudent) throw httpError(404, 'No student uses that username on the leaderboard.');
      const targetCentre = target.centres[0] || '';
      if (!targetCentre || targetCentre === centreId) {
        throw httpError(400, 'You can already chat with students in your centre. Start a chat with them instead.');
      }
      // The target's own privacy choice decides whether this request may
      // even be sent, checked here on the server.
      const targetSettings = await chatSettingsFor(targetUid);
      const acceptsRequests = targetSettings.friendRequests === 'everyone'
        || (['centre', 'class'].includes(targetSettings.friendRequests) && targetCentre === centreId);
      if (!acceptsRequests) {
        throw httpError(403, `${target.username} is not accepting friend requests right now.`);
      }
      const docRef = adminDb.collection('chatFriendRequests').doc(pairId('fr', caller.uid, targetUid));
      const existing = await docRef.get();
      if (existing.exists) {
        const d = existing.data() as any;
        if (d?.status === 'accepted') throw httpError(409, 'You are already friends.');
        if (d?.status === 'pending' && cleanStr(d?.fromUid, 64) === caller.uid) {
          return res.json({ ok: true, status: 'pending', already: true });
        }
        if (d?.status === 'pending' && cleanStr(d?.toUid, 64) === caller.uid) {
          // They asked first, so this request answers theirs.
          await docRef.set({ status: 'accepted', respondedAt: new Date().toISOString() }, { merge: true });
          return res.json({ ok: true, status: 'accepted' });
        }
      }
      const now = new Date().toISOString();
      await docRef.set({
        fromUid: caller.uid,
        fromCentreId: centreId,
        fromUsername: await usernameFor(caller.uid),
        toUid: targetUid,
        toCentreId: targetCentre,
        toUsername: target.username,
        status: targetSettings.autoAccept === 'auto' ? 'accepted' : 'pending',
        createdAt: existing.exists ? cleanStr((existing.data() as any)?.createdAt, 40) || now : now,
        respondedAt: targetSettings.autoAccept === 'auto' ? now : null,
      }, { merge: true });
      res.json({ ok: true, status: targetSettings.autoAccept === 'auto' ? 'accepted' : 'pending' });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] friend request failed');
    }
  });

  app.post('/api/student/chat/friends/respond', async (req, res) => {
    try {
      const caller = getCaller(req);
      await studentChatBase(caller);
      const body = req.body || {};
      const requestId = cleanStr(body.requestId, 80);
      const action = body.action === 'accept' ? 'accept' : body.action === 'decline' ? 'decline' : '';
      if (!requestId || !action) throw httpError(400, 'Choose a request and what to do with it.');
      const ref = adminDb.collection('chatFriendRequests').doc(requestId);
      const snap = await ref.get();
      if (!snap.exists) throw httpError(404, 'That request is not there anymore.');
      const d = snap.data() as any;
      if (cleanStr(d?.toUid, 64) !== caller.uid) throw httpError(403, 'Only the person who received this request can respond.');
      if (d?.status !== 'pending') throw httpError(409, 'That request has already been answered.');
      await ref.set({ status: action === 'accept' ? 'accepted' : 'declined', respondedAt: new Date().toISOString() }, { merge: true });
      res.json({ ok: true, status: action === 'accept' ? 'accepted' : 'declined' });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] friend response failed');
    }
  });

  app.get('/api/student/chat/friends', async (req, res) => {
    try {
      const caller = getCaller(req);
      res.json(await friendsListFor(caller));
    } catch (error: any) {
      handleRouteError(res, error, '[chat] friends list failed');
    }
  });

  app.get('/api/student/chat/directory', async (req, res) => {
    try {
      const caller = getCaller(req);
      const { centreId } = await studentChatBase(caller);
      res.json(await chatDirectoryFor(centreId, caller.uid));
    } catch (error: any) {
      handleRouteError(res, error, '[chat] student directory failed');
    }
  });

  app.get('/api/centre/chat/directory', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = cleanStr(req.query.centreId, 120);
      if (!centreId) throw httpError(400, 'centreId is required.');
      await requireMembership(caller, centreId, ['owner', 'admin', 'tutor']);
      const entitlements = await getCentreEntitlements(centreId);
      if (entitlements.chat !== true) {
        throw httpError(403, 'Chat is not part of your centre\u2019s plan yet.');
      }
      res.json(await chatDirectoryFor(centreId, caller.uid));
    } catch (error: any) {
      handleRouteError(res, error, '[chat] staff directory failed');
    }
  });

  app.get('/api/student/chat/groups/:id/messages', async (req, res) => {
    try {
      const caller = getCaller(req);
      const ctx = await studentGroupContext(caller, String(req.params.id || ''), false);
      if (ctx.lock.locked) {
        return res.json({
          ok: true,
          locked: true,
          groupName: ctx.group.name,
          myPercent: ctx.lock.myPercent,
          thresholdPercent: ctx.lock.thresholdPercent,
          myAnswers: ctx.lock.myAnswers,
          minAnswers: ctx.lock.minAnswers,
          messages: [],
        });
      }
      const tosChat = await getTosChat();
      const limit = clampInt(req.query.limit, 1, MAX_PAGE, DEFAULT_PAGE);
      const before = Math.floor(Number(req.query.before) || 0);
      await pruneOld(ctx.group, tosChat.retentionDays);
      let q = adminRtdb.ref(`chat/groups/${ctx.group.id}/messages`).orderByChild('at');
      if (before > 0) q = q.endBefore(before);
      const snap = await q.limitToLast(limit).get();
      const messages: any[] = [];
      snap.forEach((c) => {
        const v = c.val() || {};
        messages.push({
          id: c.key,
          uid: cleanStr(v.uid, 64),
          username: cleanStr(v.username, 16),
          role: cleanStr(v.role, 20),
          text: String(v.text ?? '').slice(0, tosChat.messageMaxChars),
          photoUrl: typeof v.photoUrl === 'string' ? v.photoUrl.slice(0, MAX_PHOTO_URL_CHARS) : null,
          at: Number(v.at) || 0,
          removed: Boolean(v.removed),
          forwardedFrom: typeof v.forwardedFrom === 'string' ? cleanStr(v.forwardedFrom, 80) : null,
          replyTo: v.replyTo && typeof v.replyTo === 'object' ? { id: cleanStr(v.replyTo.id, 128), username: cleanStr(v.replyTo.username, 16), excerpt: String(v.replyTo.excerpt ?? '').slice(0, 140) } : null,
          reactions: sanitizeReactions(v.reactions),
          mine: v.uid === caller.uid,
        });
      });
      messages.reverse(); // oldest first for a chat timeline
      const meta = await readMeta(ctx.group.id);
      const read = await lastReadCount(ctx.group.id, caller.uid);
      res.json({
        ok: true,
        locked: false,
        groupName: ctx.group.name,
        kind: ctx.group.kind,
        canPost: ctx.group.kind !== 'announcements' && ctx.group.kind !== 'tos_channel',
        photosAllowed: ctx.isTosChannel ? false : ctx.centreChat.photosAllowed,
        photoMaxKb: tosChat.photoMaxKb,
        messageMaxChars: tosChat.messageMaxChars,
        messages,
        unread: Math.max(0, meta.msgCount - meta.pruned - read),
        meta,
        myLastReadCount: read,
      });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] messages read failed');
    }
  });

  // Posting. Announcements groups and the TOS channel are read-only for
  // students; mutes, the gate and the rate limit all re-check here.
  app.post('/api/student/chat/groups/:id/messages', async (req, res) => {
    try {
      const caller = getCaller(req);
      const ctx = await studentGroupContext(caller, String(req.params.id || ''), true);
      if (ctx.group.kind === 'announcements') throw httpError(403, 'Only your centre can post in Announcements.');
      if (ctx.group.kind === 'tos_channel') throw httpError(403, 'Only TOS can post in this channel.');
      if (ctx.lock.locked) {
        throw httpError(403, JSON.stringify({ locked: true, myPercent: ctx.lock.myPercent, thresholdPercent: ctx.lock.thresholdPercent, myAnswers: ctx.lock.myAnswers, minAnswers: ctx.lock.minAnswers }));
      }
      if (ctx.centreChat.paused) throw httpError(503, 'Chat is paused for your centre right now.');
      const mute = await mutedUntil(caller.uid, ctx.centreId);
      if (mute) {
        const days = Math.max(1, Math.ceil((mute - Date.now()) / DAY_MS));
        throw httpError(403, `You have been muted from this centre's chats for ${days} more day${days === 1 ? '' : 's'}.`);
      }
      const username = await usernameFor(caller.uid);
      if (!username) throw httpError(403, 'Set your username in your profile before using chat.');
      const tosChat = await getTosChat();
      const body = req.body || {};
      const text = String(body.text ?? '').replace(/\s+$/g, '');
      const photoUrl = ctx.centreChat.photosAllowed && typeof body.photoUrl === 'string' && body.photoUrl.trim()
        ? body.photoUrl.trim().slice(0, MAX_PHOTO_URL_CHARS)
        : null;
      if (!text && !photoUrl) throw httpError(400, 'Write a message first.');
      if (text.length > tosChat.messageMaxChars) throw httpError(400, `Messages can be up to ${tosChat.messageMaxChars} characters.`);
      await consumePostRateLimit(caller.uid, tosChat.postRateLimitPerHour);
      const replyTo = await buildReplyTo(ctx.group.id, body.replyTo);
      await writeMessage(ctx.group, { uid: caller.uid, username, role: 'student' }, text.slice(0, tosChat.messageMaxChars), photoUrl, replyTo ? { replyTo } : undefined);
      const meta = await readMeta(ctx.group.id);
      res.json({ ok: true, meta });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] post failed');
    }
  });

  // Marking a group read. The counter can only move up to the current count.
  app.post('/api/student/chat/groups/:id/read', async (req, res) => {
    try {
      const caller = getCaller(req);
      const ctx = await studentGroupContext(caller, String(req.params.id || ''), false);
      const meta = await readMeta(ctx.group.id);
      const max = Math.max(0, meta.msgCount - meta.pruned);
      const value = clampInt(req.body?.lastReadCount, 0, max, 0);
      await adminRtdb.ref(`chat/groups/${ctx.group.id}/counters/${caller.uid}`).set({ lastReadCount: value, at: ServerValue.TIMESTAMP });
      res.json({ ok: true, lastReadCount: value });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] read marker failed');
    }
  });

  // A student reports a message. The report goes to the centre only; the
  // reporter gets a confirmation and nothing about what happens next.
  // Reactions inside a group: one emoji per person per message.
  app.post('/api/student/chat/groups/:id/messages/:msgId/react', async (req, res) => {
    try {
      const caller = getCaller(req);
      const ctx = await studentGroupContext(caller, String(req.params.id || ''), false);
      if (ctx.lock.locked) throw httpError(403, JSON.stringify({ locked: true, myPercent: ctx.lock.myPercent, thresholdPercent: ctx.lock.thresholdPercent, myAnswers: ctx.lock.myAnswers, minAnswers: ctx.lock.minAnswers }));
      const emoji = sanitizeEmoji(req.body?.emoji);
      if (!emoji) throw httpError(400, 'Pick a reaction from the list.');
      await toggleReaction(ctx.group.id, String(req.params.msgId || ''), caller.uid, emoji);
      res.json({ ok: true });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] react failed');
    }
  });

  // Starred messages: a private copy per student, so a favourite keeps its text
  // even after the group's retention window removes the original.
  app.get('/api/student/chat/starred', async (req, res) => {
    try {
      const caller = getCaller(req);
      const snap = await adminRtdb.ref(`chat/starred/${caller.uid}`).get();
      const items: any[] = [];
      snap.forEach((c) => {
        const v = c.val() || {};
        items.push({
          key: c.key,
          groupId: cleanStr(v.groupId, 120),
          groupName: cleanStr(v.groupName, 80),
          msgId: cleanStr(v.msgId, 128),
          username: cleanStr(v.username, 16),
          role: cleanStr(v.role, 20),
          text: String(v.text ?? '').slice(0, 2000),
          photoUrl: typeof v.photoUrl === 'string' ? v.photoUrl.slice(0, MAX_PHOTO_URL_CHARS) : null,
          at: Number(v.at) || 0,
          starredAt: Number(v.starredAt) || 0,
        });
      });
      items.sort((a, b) => b.starredAt - a.starredAt);
      res.json({ ok: true, items });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] starred read failed');
    }
  });

  app.post('/api/student/chat/starred', async (req, res) => {
    try {
      const caller = getCaller(req);
      const body = req.body || {};
      const groupId = cleanStr(body.groupId, 120);
      const msgId = cleanStr(body.msgId, 128);
      if (!groupId || !msgId) throw httpError(400, 'Which message should be saved?');
      const ctx = await studentGroupContext(caller, groupId, false);
      const v = await loadMessage(ctx.group.id, msgId);
      if (v.removed) throw httpError(404, 'That message is no longer available.');
      const key = `${ctx.group.id}__${msgId}`;
      await adminRtdb.ref(`chat/starred/${caller.uid}/${key}`).set({
        groupId: ctx.group.id,
        groupName: cleanStr(ctx.group.name, 80),
        msgId,
        username: cleanStr(v.username, 16),
        role: cleanStr(v.role, 20),
        text: String(v.text ?? '').slice(0, 2000),
        photoUrl: typeof v.photoUrl === 'string' ? v.photoUrl.slice(0, MAX_PHOTO_URL_CHARS) : null,
        at: Number(v.at) || 0,
        starredAt: ServerValue.TIMESTAMP,
      });
      res.json({ ok: true });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] star failed');
    }
  });

  app.post('/api/student/chat/starred/unstar', async (req, res) => {
    try {
      const caller = getCaller(req);
      const body = req.body || {};
      const groupId = cleanStr(body.groupId, 120);
      const msgId = cleanStr(body.msgId, 128);
      if (!groupId || !msgId) throw httpError(400, 'Which message should be removed from favourites?');
      await adminRtdb.ref(`chat/starred/${caller.uid}/${groupId}__${msgId}`).set(null);
      res.json({ ok: true });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] unstar failed');
    }
  });

  // Forwarding: a fresh copy of one message into another group the student can
  // post in. Every check a normal post goes through applies here too, and the
  // rate limit counts it like any other message.
  app.post('/api/student/chat/forward', async (req, res) => {
    try {
      const caller = getCaller(req);
      const body = req.body || {};
      const fromId = cleanStr(body.fromGroupId, 120);
      const toId = cleanStr(body.toGroupId, 120);
      const msgId = cleanStr(body.msgId, 128);
      if (!fromId || !toId || !msgId) throw httpError(400, 'Choose a message and a group to forward it to.');
      const fromCtx = await studentGroupContext(caller, fromId, false);
      const v = await loadMessage(fromCtx.group.id, msgId);
      if (v.removed) throw httpError(404, 'That message is no longer available.');
      const toCtx = await studentGroupContext(caller, toId, true);
      if (toCtx.group.kind === 'announcements') throw httpError(403, 'Only your centre can post in Announcements.');
      if (toCtx.group.kind === 'tos_channel') throw httpError(403, 'Only TOS can post in this channel.');
      if (toCtx.centreChat.paused) throw httpError(503, 'Chat is paused for your centre right now.');
      const mute = await mutedUntil(caller.uid, toCtx.centreId);
      if (mute) {
        const days = Math.max(1, Math.ceil((mute - Date.now()) / DAY_MS));
        throw httpError(403, `You have been muted from this centre's chats for ${days} more day${days === 1 ? '' : 's'}.`);
      }
      const username = await usernameFor(caller.uid);
      if (!username) throw httpError(403, 'Set your username in your profile before using chat.');
      const tosChat = await getTosChat();
      await consumePostRateLimit(caller.uid, tosChat.postRateLimitPerHour);
      const text = String(v.text ?? '').slice(0, tosChat.messageMaxChars);
      const photoUrl = toCtx.centreChat.photosAllowed && typeof v.photoUrl === 'string' ? v.photoUrl.slice(0, MAX_PHOTO_URL_CHARS) : null;
      if (!text && !photoUrl) throw httpError(400, 'Nothing to forward.');
      await writeMessage(toCtx.group, { uid: caller.uid, username, role: 'student' }, text, photoUrl, {
        forwardedFrom: cleanStr(fromCtx.group.name, 80),
      });
      res.json({ ok: true });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] forward failed');
    }
  });

  // Deleting your own message from a group.
  app.post('/api/student/chat/groups/:id/messages/:msgId/remove', async (req, res) => {
    try {
      const caller = getCaller(req);
      const ctx = await studentGroupContext(caller, String(req.params.id || ''), false);
      if (ctx.lock.locked) throw httpError(403, 'Open the group to manage your messages.');
      const msgRef = adminRtdb.ref(`chat/groups/${ctx.group.id}/messages/${cleanStr(String(req.params.msgId || ''), 128)}`);
      const snap = await msgRef.get();
      const v = snap.val();
      if (!v) throw httpError(404, 'That message is no longer available.');
      if (v.uid !== caller.uid) throw httpError(403, 'You can only delete your own messages.');
      if (v.removed) return res.json({ ok: true });
      await msgRef.set({ ...v, removed: { by: caller.uid, byRole: 'student', at: ServerValue.TIMESTAMP } });
      res.json({ ok: true });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] student remove failed');
    }
  });

  app.post('/api/student/chat/groups/:id/report', async (req, res) => {
    try {
      const caller = getCaller(req);
      const ctx = await studentGroupContext(caller, String(req.params.id || ''), false);
      const messageId = cleanStr(req.body?.messageId, 200);
      if (!messageId) throw httpError(400, 'Which message are you reporting?');
      const snap = await adminRtdb.ref(`chat/groups/${ctx.group.id}/messages/${messageId}`).get();
      const msg = snap.val();
      if (!msg || msg.removed) throw httpError(404, 'That message is no longer available.');
      if (msg.uid === caller.uid) throw httpError(400, 'You cannot report your own message.');
      const reporterUsername = await usernameFor(caller.uid);
      await adminDb.collection('chatReports').add({
        centreId: ctx.group.centreId,
        groupId: ctx.group.id,
        messageId,
        offenderUid: cleanStr(msg.uid, 64),
        offenderUsername: cleanStr(msg.username, 16),
        offenderRole: cleanStr(msg.role, 20),
        messageExcerpt: String(msg.text ?? '').slice(0, MAX_EXCERPT_CHARS),
        reporterUid: caller.uid,
        reporterUsername,
        reason: cleanStr(req.body?.reason, MAX_REASON_CHARS) || 'No reason given',
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      res.json({ ok: true });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] report failed');
    }
  });

  // ------------------------------------------------------------------
  // Centre admin routes (C1-C4 screens)
  // ------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Centre staff chat (Step 7): admins and tutors read and post in their own
// centre's groups. Every check stays server-side; the same limits students
// have (length, rate limit, photos setting, pause) apply to staff posts, and
// each message records the sender's role ('admin' or 'tutor').
// ---------------------------------------------------------------------------

async function staffGroupContext(caller: Caller, centreId: string, groupId: string) {
  if (!centreId) throw httpError(400, 'No centre is selected.');
  const membership = await requireMembership(caller, centreId, ['owner', 'admin', 'tutor']);
  const entitlements = await getCentreEntitlements(centreId);
  if (entitlements.chat !== true) {
    throw httpError(403, 'Chat is not part of your centre\u2019s plan yet.');
  }
  const group = await loadGroup(groupId);
  const isPersonal = group.kind === 'personal';
  if (group.kind === 'tos_channel' || (!isPersonal && group.centreId !== centreId)) throw httpError(404, 'Group not found.');
  if (isPersonal && !(await personalMembersOf(groupId)).includes(caller.uid)) throw httpError(404, 'Group not found.');
  const centreChat = await getCentreChat(centreId);
  return { membership, group, centreChat };
}

/** Staff display name: their centre staff record's name, else the email prefix. */
async function staffDisplayName(caller: Caller): Promise<string> {
  try {
    let snap = await adminDb.collection('admins').where('uid', '==', caller.uid).limit(1).get();
    if (snap.empty && cleanStr(caller.email, 120)) {
      snap = await adminDb.collection('admins').where('email', '==', cleanStr(caller.email, 120).toLowerCase()).limit(1).get();
    }
    if (!snap.empty) {
      const d = snap.docs[0].data() as any;
      const nm = cleanStr(d.name || d.displayName || d.fullName, 40);
      if (nm) return nm;
    }
  } catch { /* fall through to the email prefix */ }
  const prefix = cleanStr(caller.email, 120).split('@')[0] || '';
  return cleanStr(prefix, 40) || 'Staff';
}

/** Resolve the display name for one status owner: their student record first,
 *  then their admin or tutor record. Used so a staff member's status shows a
 *  real name in every list, students' and staff's alike. */
async function statusOwnerName(ownerUid: string): Promise<string> {
  const uid = cleanStr(ownerUid, 64);
  if (!uid) return '';
  try {
    const stu = await adminDb.collection('students').where('uid', '==', uid).limit(1).get();
    const stuName = cleanStr(stu.docs[0]?.data()?.name, MAX_NAME_CHARS);
    if (stuName) return stuName;
  } catch { /* keep looking */ }
  for (const col of ['admins', 'tutors'] as const) {
    try {
      const snap = await adminDb.collection(col).where('uid', '==', uid).limit(1).get();
      const nm = cleanStr(snap.docs[0]?.data()?.name || snap.docs[0]?.data()?.displayName || snap.docs[0]?.data()?.fullName, MAX_NAME_CHARS);
      if (nm) return nm;
    } catch { /* keep looking */ }
  }
  return '';
}

/** Name and handle maps for a batch of status owners. Students get their
 *  stored name plus their chat handle; admins and tutors get their staff
 *  record's name with no handle (staff are shown by name, like their chat
 *  messages are). Batched the same way the overview did, 10 uids per query. */
function emailPrefixOf(email: unknown): string {
  const raw = cleanStr(email, 120).toLowerCase();
  return cleanStr(raw.split('@')[0], 40);
}

/** Names and usernames for a batch of uids, from the students, admins and
 *  tutors collections. When a staff record carries no name, the email
 *  prefix travels along so screens never fall back to a generic label. */
async function statusNamesFor(uids: string[]): Promise<Map<string, { name: string; username: string; emailPrefix: string }>> {
  const out = new Map<string, { name: string; username: string; emailPrefix: string }>();
  const unresolved = new Set<string>(uids.map((u) => cleanStr(u, 64)).filter(Boolean));
  const chunks: string[][] = [];
  const all = [...unresolved];
  for (let i = 0; i < all.length; i += 10) chunks.push(all.slice(i, i + 10));
  for (const part of chunks) {
    const stuList = await adminDb.collection('students').where('uid', 'in', part).get();
    stuList.forEach((d) => {
      const v = d.data() as any;
      const uid = cleanStr(v.uid, 64);
      if (uid) { out.set(uid, { name: cleanStr(v.name, MAX_NAME_CHARS), username: '', emailPrefix: '' }); unresolved.delete(uid); }
    });
    const userList = await adminDb.collection('usernames').where('studentId', 'in', part).get();
    userList.forEach((d) => {
      const v = d.data() as any;
      const sid = cleanStr(v.studentId, 64);
      const cur = out.get(sid);
      if (cur && !cur.username) cur.username = cleanStr(v.username, 16);
    });
  }
  const staffChunks: string[][] = [];
  const rest = [...unresolved];
  for (let i = 0; i < rest.length; i += 10) staffChunks.push(rest.slice(i, i + 10));
  for (const part of staffChunks) {
    const admList = await adminDb.collection('admins').where('uid', 'in', part).get();
    admList.forEach((d) => {
      const v = d.data() as any;
      const uid = cleanStr(v.uid, 64) || cleanStr(d.id, 64);
      if (uid) {
        out.set(uid, { name: cleanStr(v.name || v.displayName || v.fullName, MAX_NAME_CHARS), username: '', emailPrefix: emailPrefixOf(v.email) });
        unresolved.delete(uid);
      }
    });
  }
  const rest2 = [...unresolved];
  if (rest2.length) {
    const tutList = await adminDb.collection('tutors').where('uid', 'in', rest2).get();
    tutList.forEach((d) => {
      const v = d.data() as any;
      // Tutor docs are keyed by their own id, so the uid comes from the
      // document's field, never from the doc id alone.
      const uid = cleanStr(v.uid, 64) || cleanStr(d.id, 64);
      if (uid) out.set(uid, { name: cleanStr(v.name || v.displayName || v.fullName, MAX_NAME_CHARS), username: '', emailPrefix: emailPrefixOf(v.email) });
    });
  }
  return out;
}

/** ---------------------------------------------------------------------------
 * Shared status engine. Once a caller's own gate has run (student or staff),
 * every status route uses the same stored settings, the same RTDB paths and
 * the same limits, so staff and students get identical behaviour from one
 * implementation. Nothing here knows who called: identity arrives as plain
 * name and handle values from the route's own gate.
 * ------------------------------------------------------------------------- */

/** One centre's chat directory: students by username, staff by staff name.
 *  This is what a new-chat picker lists, so the platform's chat-name rule
 *  holds there too. */
async function chatDirectoryFor(centreId: string, excludeUid: string): Promise<Record<string, unknown>> {
  const stuSnap = await adminDb.collection('students').where('centreId', '==', centreId).limit(200).get();
  const uids: string[] = [];
  stuSnap.forEach((d) => {
    const u = cleanStr((d.data() as any)?.uid, 64);
    if (u) uids.push(u);
  });
  const studentMap = await statusNamesFor(uids);
  const students = uids
    .filter((u) => u !== excludeUid && (studentMap.get(u)?.username || '') !== '')
    .map((u) => ({ uid: u, username: (studentMap.get(u) as { username: string }).username }))
    .sort((a, b) => a.username.localeCompare(b.username))
    .slice(0, 100);
  const memSnap = await adminDb.collection('memberships').where('centreId', '==', centreId).limit(200).get();
  const staffUids: string[] = [];
  memSnap.forEach((d) => {
    const v = d.data() as any;
    const u = cleanStr(v?.uid, 64);
    const role = cleanStr(v?.role, 20);
    if (u && u !== excludeUid && ['owner', 'admin', 'tutor'].includes(role) && !staffUids.includes(u)) staffUids.push(u);
  });
  // Tutors also live in the tutors collection; union it in so every tutor of
  // this centre is reachable even without a membership document.
  const tutSnap = await adminDb.collection('tutors').where('centreId', '==', centreId).limit(200).get();
  tutSnap.forEach((d) => {
    const u = cleanStr((d.data() as any)?.uid, 64);
    if (u && u !== excludeUid && !staffUids.includes(u)) staffUids.push(u);
  });
  const staffMap = await statusNamesFor(staffUids);
  const staff = staffUids
    .map((u) => ({ uid: u, name: personDisplayName({ isStudent: false, name: staffMap.get(u)?.name || staffMap.get(u)?.emailPrefix || '', username: '' }) }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 50);
  return { ok: true, students, staff };
}

// Reserved centre id for the platform's own status feed. TOS staff post
// statuses here through /api/tos/chat/status/*; every student's overview
// merges this feed in, so platform-wide updates reach everyone.
const TOS_STATUS_CENTRE = '__tos__';

async function statusOverviewCore(caller: Caller, centreIds: string[], me: { name: string; username: string; avatar?: string }, opts?: { includeTos?: boolean }): Promise<Record<string, unknown>> {
  const tosChat = await getTosChat();
  const st = tosChat.status;
  if (!st.enabled) return { ok: true, enabled: false };

  const ids = [...centreIds];
  if (opts?.includeTos && !ids.includes(TOS_STATUS_CENTRE)) ids.push(TOS_STATUS_CENTRE);

  const now = Date.now();
  interface One { centreId: string; uid: string; statusId: string; kind: string; at: number; expiresAt: number; text: string; bg: string; photoUrl: string; videoUrl: string; audioUrl: string; durationSeconds: number; }
  const latestByUid = new Map<string, One>();
  // Seen marks are stored per centre, so keys carry the centre too and two
  // feeds can never collapse one status into another.
  const seenKeys = new Set<string>();
  for (const centreId of ids) {
    const centreSnap = await adminRtdb.ref(`chat/status/${centreId}`).get();
    centreSnap.forEach((c) => {
      const uid = cleanStr(c.key as string, 64);
      if (!uid) return;
      c.forEach((s) => {
        const v = s.val() || {};
        const expiresAt = Number(v.expiresAt) || 0;
        if (expiresAt <= now) return; // expired statuses vanish everywhere.
        const item: One = {
          centreId,
          uid,
          statusId: cleanStr(s.key as string, 64),
          kind: cleanStr(v.kind, 10) || 'text',
          at: Number(v.at) || 0,
          expiresAt,
          text: cleanStr(v.text, 300),
          bg: cleanStr(v.bg, 9),
          photoUrl: cleanStr(v.photoUrl, 400),
          videoUrl: cleanStr(v.videoUrl, 400),
          audioUrl: cleanStr(v.audioUrl, 400),
          durationSeconds: Number(v.durationSeconds) || 0,
        };
        const prev = latestByUid.get(uid);
        if (!prev || item.at > prev.at) latestByUid.set(uid, item);
      });
    });
    const seenSnap = await adminRtdb.ref(`chat/statusViews/${centreId}/${caller.uid}`).get();
    seenSnap.forEach((c) => {
      if (c.val() !== null && c.val() !== undefined) seenKeys.add(`${centreId}:${String(c.key)}`);
    });
  }

  const myLatest = latestByUid.get(caller.uid) || null;
  const others = [...latestByUid.values()]
    .filter((o) => o.uid !== caller.uid)
    .sort((a, b) => b.at - a.at);

  const names = await statusNamesFor(others.map((o) => o.uid));
  const shape = (o: One) => ({
    centreId: o.centreId,
    uid: o.uid,
    name: o.centreId === TOS_STATUS_CENTRE ? 'TOS' : (names.get(o.uid)?.name || names.get(o.uid)?.emailPrefix || ''),
    username: o.centreId === TOS_STATUS_CENTRE ? '' : (names.get(o.uid)?.username || ''),
    statusId: o.statusId,
    kind: o.kind,
    at: o.at,
    expiresAt: o.expiresAt,
    text: o.text,
    bg: o.bg,
    photoUrl: o.photoUrl,
    videoUrl: o.videoUrl,
    audioUrl: o.audioUrl,
    durationSeconds: o.durationSeconds,
  });

  return {
    ok: true,
    enabled: true,
    settings: {
      allowText: st.allowText,
      allowPhoto: st.allowPhoto,
      allowVideo: st.allowVideo,
      allowMusic: st.allowMusic,
      allowReplies: st.allowReplies,
      lastsHours: st.lastsHours,
      statusesPerDay: st.statusesPerDay,
      maxTextChars: st.maxTextChars,
      maxVideoSeconds: st.maxVideoSeconds,
      maxVideoMb: st.maxVideoMb,
      maxAudioMb: st.maxAudioMb,
      photoMaxKb: tosChat.photoMaxKb,
    },
    me: {
      name: me.name,
      username: me.username,
      avatar: me.avatar || '',
      latest: myLatest
        ? {
            centreId: myLatest.centreId,
            statusId: myLatest.statusId, kind: myLatest.kind, at: myLatest.at, expiresAt: myLatest.expiresAt,
            text: myLatest.text, bg: myLatest.bg, photoUrl: myLatest.photoUrl, videoUrl: myLatest.videoUrl,
            audioUrl: myLatest.audioUrl, durationSeconds: myLatest.durationSeconds,
          }
        : null,
    },
    recent: others.filter((o) => !seenKeys.has(`${o.centreId}:${o.statusId}`)).map(shape),
    viewed: others.filter((o) => seenKeys.has(`${o.centreId}:${o.statusId}`)).map(shape),
  };
}

async function statusUserCore(caller: Caller, centreId: string, ownerUid: string, ownName: string, ownUsername: string): Promise<Record<string, unknown>> {
  const st = (await getTosChat()).status;
  if (!st.enabled) return { ok: true, enabled: false, statuses: [] };

  const now = Date.now();
  const mine = await adminRtdb.ref(`chat/status/${centreId}/${ownerUid}`).get();
  const statuses: any[] = [];
  mine.forEach((s) => {
    const v = s.val() || {};
    const expiresAt = Number(v.expiresAt) || 0;
    if (expiresAt <= now) return;
    statuses.push({
      statusId: cleanStr(s.key as string, 64),
      kind: cleanStr(v.kind, 10) || 'text',
      at: Number(v.at) || 0,
      expiresAt,
      text: cleanStr(v.text, 300),
      bg: cleanStr(v.bg, 9),
      photoUrl: cleanStr(v.photoUrl, 400),
      videoUrl: cleanStr(v.videoUrl, 400),
      audioUrl: cleanStr(v.audioUrl, 400),
      durationSeconds: Number(v.durationSeconds) || 0,
    });
  });
  statuses.sort((a, b) => a.at - b.at);

  if (ownerUid === caller.uid) {
    for (const s of statuses) {
      const viewsSnap = await adminRtdb.ref(`chat/statusSeenCount/${centreId}/${s.statusId}`).get();
      s.views = Number(viewsSnap.val()) || 0;
      const repliesSnap = await adminRtdb.ref(`chat/statusReplies/${centreId}/${s.statusId}`).get();
      const replies: any[] = [];
      repliesSnap.forEach((c) => {
        const v = c.val() || {};
        replies.push({
          uid: cleanStr(v.uid, 64),
          name: cleanStr(v.name, MAX_NAME_CHARS),
          username: cleanStr(v.username, 16),
          text: cleanStr(v.text, 2000),
          at: Number(v.at) || 0,
        });
      });
      replies.sort((a, b) => b.at - a.at);
      s.replies = replies.slice(0, 50);
    }
  }

  const ownerName = ownerUid === caller.uid ? ownName : (await statusOwnerName(ownerUid)) || '';
  return {
    ok: true,
    owner: { uid: ownerUid, name: cleanStr(ownerName, MAX_NAME_CHARS), username: ownerUid === caller.uid ? ownUsername : await usernameFor(ownerUid) },
    statuses,
  };
}

async function statusPostCore(caller: Caller, centreId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const tosChat = await getTosChat();
  const st = tosChat.status;
  if (!st.enabled) throw httpError(403, 'Status is not turned on.');
  const kind = cleanStr(body.kind, 10) || 'text';
  const text = cleanStr(body.text, st.maxTextChars);

  if (kind === 'text') {
    if (!st.allowText) throw httpError(403, 'Text updates are turned off.');
    if (!text) throw httpError(400, 'Type your update first.');
  } else if (kind === 'photo' || kind === 'video' || kind === 'music') {
    if (kind === 'photo' && !st.allowPhoto) throw httpError(403, 'Photo updates are turned off.');
    if (kind === 'video' && !st.allowVideo) throw httpError(403, 'Video updates are turned off.');
    if (kind === 'music' && !st.allowMusic) throw httpError(403, 'Music updates are turned off.');
    if (kind === 'video') {
      const dur = Math.round(Number(body.durationSeconds) || 0);
      if (dur <= 0 || dur > st.maxVideoSeconds) {
        throw httpError(400, `Videos can be up to ${st.maxVideoSeconds} seconds.`);
      }
    }
  } else {
    throw httpError(400, 'That kind of update is not open yet.');
  }

  const now = Date.now();
  let inWindow = 0;
  const mine = await adminRtdb.ref(`chat/status/${centreId}/${caller.uid}`).get();
  mine.forEach((c) => {
    const v = c.val() || {};
    if ((Number(v.at) || 0) > now - DAY_MS) inWindow += 1;
  });
  if (inWindow >= st.statusesPerDay) {
    throw httpError(429, 'You have reached the status limit for today. Try again later.');
  }

  const expiresAt = now + st.lastsHours * 60 * 60 * 1000;
  const ref = adminRtdb.ref(`chat/status/${centreId}/${caller.uid}`).push();
  let status: Record<string, unknown>;
  if (kind === 'text') {
    const bg = cleanStr(body.bg, 9);
    if (!/^#[0-9a-fA-F]{6}$/.test(bg)) throw httpError(400, 'Pick a background colour for the update.');
    status = { kind: 'text', text, bg, at: now, expiresAt };
  } else {
    // Media updates only accept files this app uploaded itself: the URL
    // must point at this deployment's Cloudinary cloud, so a client
    // cannot post an arbitrary link as its own photo or video.
    const cloud = String(process.env.CLOUDINARY_CLOUD_NAME || '');
    const prefix = `https://res.cloudinary.com/${cloud}/${kind === 'photo' ? 'image' : 'video'}/upload/`;
    const url = cleanStr(body.url, 400);
    if (!cloud || !url.startsWith(prefix)) throw httpError(400, 'Upload the file through this app first.');
    await verifyStatusMediaSize(kind, url, st, tosChat.photoMaxKb);
    status = { kind, at: now, expiresAt };
    if (text) status.text = text;
    if (kind === 'photo') status.photoUrl = url;
    if (kind === 'video') {
      status.videoUrl = url;
      status.durationSeconds = Math.round(Number(body.durationSeconds) || 0);
    }
    if (kind === 'music') {
      status.audioUrl = url;
      const bg = cleanStr(body.bg, 9);
      status.bg = /^#[0-9a-fA-F]{6}$/.test(bg) ? bg : '#7C3AED';
    }
  }
  await ref.set(status);
  return {
    ok: true,
    status: { statusId: ref.key, ...status },
    remainingToday: Math.max(0, st.statusesPerDay - (inWindow + 1)),
  };
}

async function statusUploadCore(caller: Caller, centreId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const tosChat = await getTosChat();
  const st = tosChat.status;
  if (!st.enabled) throw httpError(403, 'Status is not turned on.');
  const kind = cleanStr(body.kind, 10);
  if (kind !== 'photo' && kind !== 'video' && kind !== 'music') throw httpError(400, 'Which kind of update is this?');
  if (kind === 'photo' && !st.allowPhoto) throw httpError(403, 'Photo updates are turned off.');
  if (kind === 'video' && !st.allowVideo) throw httpError(403, 'Video updates are turned off.');
  if (kind === 'music' && !st.allowMusic) throw httpError(403, 'Music updates are turned off.');
  if (kind === 'video') {
    const dur = Math.round(Number(body.durationSeconds) || 0);
    if (dur <= 0 || dur > st.maxVideoSeconds) {
      throw httpError(400, `Videos can be up to ${st.maxVideoSeconds} seconds.`);
    }
  }
  const url = await uploadStatusMedia(kind, String(body.dataUrl || ''), st, tosChat.photoMaxKb);
  return { ok: true, url };
}

// Upload authorization for direct browser-to-hosting uploads. The server
// checks the same preconditions and stored caps the /upload route checks,
// then hands the browser the unsigned preset details so a video or music
// file can upload straight to the media host instead of riding through the
// server as base64 (the serverless function's request cap is far below a
// video's stored size cap). The stored URL is still verified at post time to
// belong to this app's media host and to sit within the stored size cap.
async function statusUploadConfigCore(caller: Caller, centreId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const tosChat = await getTosChat();
  const st = tosChat.status;
  if (!st.enabled) throw httpError(403, 'Status is not turned on.');
  const kind = cleanStr(body.kind, 10);
  if (kind !== 'photo' && kind !== 'video' && kind !== 'music') throw httpError(400, 'Which kind of update is this?');
  if (kind === 'photo' && !st.allowPhoto) throw httpError(403, 'Photo updates are turned off.');
  if (kind === 'video' && !st.allowVideo) throw httpError(403, 'Video updates are turned off.');
  if (kind === 'music' && !st.allowMusic) throw httpError(403, 'Music updates are turned off.');
  const sizeBytes = Math.floor(Number(body.sizeBytes) || 0);
  if (sizeBytes <= 0) throw httpError(400, 'Choose the file first.');
  if (kind === 'photo' && sizeBytes > Math.max(10, tosChat.photoMaxKb) * 1024) {
    throw httpError(413, `Photos can be up to ${tosChat.photoMaxKb} KB after compression.`);
  }
  if (kind === 'video') {
    if (sizeBytes > st.maxVideoMb * 1024 * 1024) throw httpError(413, `Videos can be up to ${st.maxVideoMb} MB.`);
    const dur = Math.round(Number(body.durationSeconds) || 0);
    if (dur <= 0 || dur > st.maxVideoSeconds) {
      throw httpError(400, `Videos can be up to ${st.maxVideoSeconds} seconds.`);
    }
  }
  if (kind === 'music' && sizeBytes > st.maxAudioMb * 1024 * 1024) {
    throw httpError(413, `Music files can be up to ${st.maxAudioMb} MB.`);
  }
  const cloud = String(process.env.CLOUDINARY_CLOUD_NAME || '');
  const preset = String(process.env.CLOUDINARY_UPLOAD_PRESET || '');
  if (!cloud || !preset) throw httpError(500, 'Media hosting is not configured on this deployment.');
  return { ok: true, cloud, preset, folder: 'tos/status', endpoint: kind === 'photo' ? 'image' : 'video' };
}

// Server-side size enforcement for media statuses: the URL a status points at
// must hold a file no bigger than that kind's stored cap. A HEAD request reads
// the file's size from the media host without downloading it; when the size
// cannot be read, the URL-origin check in statusPostCore still holds.
async function verifyStatusMediaSize(kind: 'photo' | 'video' | 'music', url: string, st: TosStatusSettings, photoMaxKb: number): Promise<void> {
  try {
    const head = await fetch(url, { method: 'HEAD' });
    const len = Number(head.headers.get('content-length') || 0);
    if (!head.ok || !len) return;
    const cap = kind === 'photo'
      ? Math.max(10, photoMaxKb) * 1024
      : kind === 'video'
        ? st.maxVideoMb * 1024 * 1024
        : st.maxAudioMb * 1024 * 1024;
    if (len > cap) {
      const what = kind === 'photo'
        ? `Photos can be up to ${photoMaxKb} KB after compression.`
        : kind === 'video'
          ? `Videos can be up to ${st.maxVideoMb} MB.`
          : `Music files can be up to ${st.maxAudioMb} MB.`;
      throw httpError(413, what);
    }
  } catch (e: any) {
    if (e && typeof e.status === 'number') throw e; // our own limit error
    // A network hiccup reading the size must not block a legitimate post.
  }
}

async function statusSeenCore(caller: Caller, centreId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const st = (await getTosChat()).status;
  if (!st.enabled) return { ok: true };

  const ownerUid = cleanStr(body.ownerUid, 64);
  const statusId = cleanStr(body.statusId, 64);
  if (!ownerUid || !statusId) throw httpError(400, 'Which status is this?');
  if (ownerUid === caller.uid) return { ok: true }; // Own views never count as seen.

  const now = Date.now();
  const statusSnap = await adminRtdb.ref(`chat/status/${centreId}/${ownerUid}/${statusId}`).get();
  const sv = statusSnap.val() || {};
  if (!statusSnap.exists() || (Number(sv.expiresAt) || 0) <= now) {
    throw httpError(404, 'That status is gone.');
  }

  const seenRef = adminRtdb.ref(`chat/statusViews/${centreId}/${caller.uid}/${statusId}`);
  const already = await seenRef.get();
  if (!already.exists()) {
    await seenRef.set({ at: now });
    const countRef = adminRtdb.ref(`chat/statusSeenCount/${centreId}/${statusId}`);
    await countRef.set(ServerValue.increment(1));
  }
  return { ok: true };
}

async function statusReplyCore(caller: Caller, centreId: string, body: Record<string, unknown>, identity: { name: string; username: string }): Promise<Record<string, unknown>> {
  const tosChat = await getTosChat();
  const st = tosChat.status;
  if (!st.enabled) throw httpError(403, 'Status is not turned on.');
  if (!st.allowReplies) throw httpError(403, 'Status replies are turned off.');

  const ownerUid = cleanStr(body.ownerUid, 64);
  const statusId = cleanStr(body.statusId, 64);
  const text = String(body.text ?? '').trim();
  if (!ownerUid || !statusId || !text) throw httpError(400, 'Type your reply first.');
  if (ownerUid === caller.uid) throw httpError(400, 'You cannot reply to your own status.');
  if (text.length > tosChat.messageMaxChars) {
    throw httpError(400, `Replies can be up to ${tosChat.messageMaxChars} characters.`);
  }
  await consumePostRateLimit(caller.uid, tosChat.postRateLimitPerHour);

  const now = Date.now();
  const statusSnap = await adminRtdb.ref(`chat/status/${centreId}/${ownerUid}/${statusId}`).get();
  const sv = statusSnap.val() || {};
  if (!statusSnap.exists() || (Number(sv.expiresAt) || 0) <= now) {
    throw httpError(404, 'That status is gone.');
  }

  const ref = adminRtdb.ref(`chat/statusReplies/${centreId}/${statusId}`).push();
  const reply = {
    uid: caller.uid,
    name: cleanStr(identity.name, MAX_NAME_CHARS),
    username: cleanStr(identity.username, 16),
    text: text.slice(0, tosChat.messageMaxChars),
    at: now,
  };
  await ref.set(reply);
  return { ok: true, reply: { ...reply, replyId: ref.key } };
}

/** Staff status gate: a centre membership with a staff role plus the chat
 *  entitlement. Same bar the centre staff chat routes use. */
async function staffStatusContext(caller: Caller, centreId: string) {
  if (!centreId) throw httpError(400, 'No centre is selected.');
  const membership = await requireMembership(caller, centreId, ['owner', 'admin', 'tutor']);
  const entitlements = await getCentreEntitlements(centreId);
  if (entitlements.chat !== true) {
    throw httpError(403, 'Chat is not part of your centre\u2019s plan yet.');
  }
  return membership;
}


  // Staff thread read. Owner/admin/tutor of the group's centre; same shape as
  // the student read minus the student gate.
  app.get('/api/centre/chat/groups/:id/messages', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = cleanStr(String(req.query.centreId || ''), 120);
      const ctx = await staffGroupContext(caller, centreId, String(req.params.id || ''));
      const tosChat = await getTosChat();
      const limit = clampInt(req.query.limit, 1, MAX_PAGE, DEFAULT_PAGE);
      const before = Math.floor(Number(req.query.before) || 0);
      await pruneOld(ctx.group, tosChat.retentionDays);
      let q = adminRtdb.ref(`chat/groups/${ctx.group.id}/messages`).orderByChild('at');
      if (before > 0) q = q.endBefore(before);
      const snap = await q.limitToLast(limit).get();
      const messages: any[] = [];
      snap.forEach((c) => {
        const v = c.val() || {};
        messages.push({
          id: c.key,
          uid: cleanStr(v.uid, 64),
          username: cleanStr(v.username, 16),
          role: cleanStr(v.role, 20),
          text: String(v.text ?? '').slice(0, tosChat.messageMaxChars),
          photoUrl: typeof v.photoUrl === 'string' ? v.photoUrl.slice(0, MAX_PHOTO_URL_CHARS) : null,
          at: Number(v.at) || 0,
          removed: Boolean(v.removed),
          forwardedFrom: typeof v.forwardedFrom === 'string' ? cleanStr(v.forwardedFrom, 80) : null,
          replyTo: v.replyTo && typeof v.replyTo === 'object' ? { id: cleanStr(v.replyTo.id, 128), username: cleanStr(v.replyTo.username, 16), excerpt: String(v.replyTo.excerpt ?? '').slice(0, 140) } : null,
          reactions: sanitizeReactions(v.reactions),
          mine: v.uid === caller.uid,
        });
      });
      messages.reverse(); // oldest first for a chat timeline
      res.json({
        ok: true,
        groupName: ctx.group.name,
        kind: ctx.group.kind,
        role: ctx.membership.role,
        canPost: true,
        photosAllowed: ctx.centreChat.photosAllowed,
        photoMaxKb: tosChat.photoMaxKb,
        messageMaxChars: tosChat.messageMaxChars,
        messages,
      });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] staff read failed');
    }
  });

  // Staff posting. Announcements groups are centre-posted, so staff can write
  // there; the pause, mutes, length and rate limit all re-check here.
  app.post('/api/centre/chat/groups/:id/messages', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = cleanStr(String(req.query.centreId || ''), 120);
      const ctx = await staffGroupContext(caller, centreId, String(req.params.id || ''));
      if (ctx.centreChat.paused) throw httpError(503, 'Chat is paused for your centre right now.');
      const mute = await mutedUntil(caller.uid, centreId);
      if (mute) {
        const days = Math.max(1, Math.ceil((mute - Date.now()) / DAY_MS));
        throw httpError(403, `You have been muted from this centre's chats for ${days} more day${days === 1 ? '' : 's'}.`);
      }
      const tosChat = await getTosChat();
      const body = req.body || {};
      const text = String(body.text ?? '').replace(/\s+$/g, '');
      const photoUrl = ctx.centreChat.photosAllowed && typeof body.photoUrl === 'string' && body.photoUrl.trim()
        ? body.photoUrl.trim().slice(0, MAX_PHOTO_URL_CHARS)
        : null;
      if (!text && !photoUrl) throw httpError(400, 'Write a message first.');
      if (text.length > tosChat.messageMaxChars) throw httpError(400, `Messages can be up to ${tosChat.messageMaxChars} characters.`);
      await consumePostRateLimit(caller.uid, tosChat.postRateLimitPerHour);
      const username = (await staffDisplayName(caller)).slice(0, 16);
      const role = ctx.membership.role === 'tutor' ? 'tutor' : 'admin';
      const replyTo = await buildReplyTo(ctx.group.id, body.replyTo);
      await writeMessage(ctx.group, { uid: caller.uid, username, role }, text.slice(0, tosChat.messageMaxChars), photoUrl, replyTo ? { replyTo } : undefined);
      const meta = await readMeta(ctx.group.id);
      res.json({ ok: true, meta });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] staff post failed');
    }
  });

  // Staff reactions and removals inside their centre's groups.
  app.post('/api/centre/chat/groups/:id/messages/:msgId/react', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = cleanStr(String(req.query.centreId || ''), 120);
      const ctx = await staffGroupContext(caller, centreId, String(req.params.id || ''));
      const emoji = sanitizeEmoji(req.body?.emoji);
      if (!emoji) throw httpError(400, 'Pick a reaction from the list.');
      await toggleReaction(ctx.group.id, String(req.params.msgId || ''), caller.uid, emoji);
      res.json({ ok: true });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] staff react failed');
    }
  });

  app.post('/api/centre/chat/groups/:id/messages/:msgId/remove', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = cleanStr(String(req.query.centreId || ''), 120);
      const ctx = await staffGroupContext(caller, centreId, String(req.params.id || ''));
      const msgRef = adminRtdb.ref(`chat/groups/${ctx.group.id}/messages/${cleanStr(String(req.params.msgId || ''), 128)}`);
      const snap = await msgRef.get();
      const v = snap.val();
      if (!v) throw httpError(404, 'That message is no longer available.');
      if (v.removed) return res.json({ ok: true });
      await msgRef.set({ ...v, removed: { by: caller.uid, byRole: ctx.membership.role, at: ServerValue.TIMESTAMP } });
      res.json({ ok: true });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] staff remove failed');
    }
  });

  // Photo upload for student posts. The centre's own photo settings decide
  // whether photos are allowed at all and how big one may be.
  app.post('/api/student/chat/photo', async (req, res) => {
    try {
      const caller = getCaller(req);
      const stuSnap = await getStudentDoc(caller.uid);
      if (!stuSnap) throw httpError(403, 'No student record is linked to this account.');
      const student = stuSnap.data() as any;
      const centreId = cleanStr(student.centreId, 120);
      if (!centreId) throw httpError(403, 'No centre is linked to this account.');
      await requireMembership(caller, centreId);
      const entitlements = await getCentreEntitlements(centreId);
      if (entitlements.chat !== true) throw httpError(403, 'Chat is not part of your centre\u2019s plan yet.');
      const centreChat = await getCentreChat(centreId);
      if (centreChat.paused) throw httpError(503, 'Chat is paused for your centre right now.');
      if (!centreChat.photosAllowed) throw httpError(403, 'Your centre has turned photo sharing off.');
      const url = await uploadChatPhoto(String(req.body?.dataUrl || ''), (await getTosChat()).photoMaxKb);
      res.json({ ok: true, url });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] student photo failed');
    }
  });

  app.post('/api/centre/chat/photo', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = cleanStr(String(req.query.centreId || ''), 120);
      await requireMembership(caller, centreId, ['owner', 'admin', 'tutor']);
      const entitlements = await getCentreEntitlements(centreId);
      if (entitlements.chat !== true) throw httpError(403, 'Chat is not part of your centre\u2019s plan yet.');
      const centreChat = await getCentreChat(centreId);
      if (centreChat.paused) throw httpError(503, 'Chat is paused for your centre right now.');
      if (!centreChat.photosAllowed) throw httpError(403, 'Your centre has turned photo sharing off.');
      const url = await uploadChatPhoto(String(req.body?.dataUrl || ''), (await getTosChat()).photoMaxKb);
      res.json({ ok: true, url });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] staff photo failed');
    }
  });

  app.get('/api/centre/chat/bootstrap', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = cleanStr(req.query.centreId, 120);
      if (!centreId) throw httpError(400, 'centreId is required.');
      const membership = await requireMembership(caller, centreId, ['owner', 'admin', 'tutor']);
      const centreChat = await getCentreChat(centreId);
      const tosChat = await getTosChat();
      const groupsSnap = await adminDb.collection('chatGroups').where('centreId', '==', centreId).limit(100).get();
      const groups = groupsSnap.docs
        .map((g) => loadGroupFromDoc(g))
        .filter((g) => g.active)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((g) => ({ id: g.id, name: g.name, kind: g.kind, subject: g.subject, access: g.access, createdAt: g.createdAt }));
      // One-to-one chats this staff member is part of, same-centre only by
      // the rules that guard opening one.
      const staffPersonalSnap = await adminDb.collection('chatGroups')
        .where('members', 'array-contains', caller.uid).limit(100).get();
      const staffPersonalDocs: { id: string; other: string }[] = [];
      const staffOtherUids: string[] = [];
      staffPersonalSnap.forEach((d) => {
        const v = d.data() as any;
        if (v.kind !== 'personal' || v.active === false) return;
        const members = Array.isArray(v.members) ? v.members.map((x: any) => cleanStr(x, 64)).filter(Boolean) : [];
        if (members.length !== 2 || !members.includes(caller.uid)) return;
        const other = members.find((m) => m !== caller.uid) as string;
        staffPersonalDocs.push({ id: d.id, other });
        staffOtherUids.push(other);
      });
      const staffPersonalNames = await statusNamesFor(staffOtherUids);
      for (const p of staffPersonalDocs) {
        const info = staffPersonalNames.get(p.other);
        groups.push({
          id: p.id,
          name: info ? (info.username || info.name || 'Chat') : 'Chat',
          kind: 'personal',
          subject: null,
          access: { mode: 'none' },
          createdAt: '',
          peerUid: p.other,
          peerUsername: info?.username || '',
        } as any);
      }
      const reportsSnap = await adminDb.collection('chatReports')
        .where('centreId', '==', centreId).orderBy('createdAt', 'desc').limit(50).get();
      const reports = reportsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      res.json({
        ok: true,
        role: membership.role,
        settings: centreChat,
        platform: {
          mockPracticeChannelName: tosChat.mockPracticeChannelName,
          mockPracticeThresholdPercent: tosChat.mockPracticeThresholdPercent,
          defaultGroupSubjects: tosChat.defaultGroupSubjects,
          photoMaxKb: tosChat.photoMaxKb,
          retentionDays: tosChat.retentionDays,
          messageMaxChars: tosChat.messageMaxChars,
          postRateLimitPerHour: tosChat.postRateLimitPerHour,
          autoPosts: tosChat.autoPosts,
        },
        groups,
        reports,
      });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] centre bootstrap failed');
    }
  });

  app.post('/api/centre/chat/groups', async (req, res) => {
    try {
      const caller = getCaller(req);
      const body = req.body || {};
      const centreId = cleanStr(body.centreId, 120);
      if (!centreId) throw httpError(400, 'centreId is required.');
      await requireMembership(caller, centreId, ['owner', 'admin']);
      const name = cleanStr(body.name, MAX_NAME_CHARS);
      if (!name) throw httpError(400, 'Give the group a name.');
      const kind = body.kind === 'announcements' ? 'announcements' : 'custom';
      const subject = kind === 'custom' && typeof body.subject === 'string' && body.subject.trim()
        ? cleanStr(body.subject, MAX_SUBJECT_CHARS) : null;
      const access = validateAccess(body.access);
      const now = new Date().toISOString();
      const ref = await adminDb.collection('chatGroups').add({
        centreId,
        name,
        kind,
        subject,
        access,
        createdBy: caller.uid,
        createdByRole: 'centre_admin',
        createdAt: now,
        updatedAt: now,
        active: true,
      });
      res.json({ ok: true, groupId: ref.id });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] group create failed');
    }
  });

  app.put('/api/centre/chat/groups/:id', async (req, res) => {
    try {
      const caller = getCaller(req);
      const body = req.body || {};
      const centreId = cleanStr(body.centreId, 120);
      if (!centreId) throw httpError(400, 'centreId is required.');
      await requireMembership(caller, centreId, ['owner', 'admin']);
      const group = await loadGroup(String(req.params.id || ''));
      if (group.kind === 'tos_channel' || group.centreId !== centreId) throw httpError(404, 'Group not found.');
      const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (typeof body.name === 'string' && body.name.trim()) update.name = cleanStr(body.name, MAX_NAME_CHARS);
      if (body.access && typeof body.access === 'object') update.access = validateAccess(body.access);
      await adminDb.collection('chatGroups').doc(group.id).update(update);
      res.json({ ok: true });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] group update failed');
    }
  });

  app.get('/api/centre/chat/settings', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = cleanStr(req.query.centreId, 120);
      if (!centreId) throw httpError(400, 'centreId is required.');
      await requireMembership(caller, centreId, ['owner', 'admin']);
      res.json({ ok: true, settings: await getCentreChat(centreId) });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] centre settings read failed');
    }
  });

  app.put('/api/centre/chat/settings', async (req, res) => {
    try {
      const caller = getCaller(req);
      const body = req.body || {};
      const centreId = cleanStr(body.centreId, 120);
      if (!centreId) throw httpError(400, 'centreId is required.');
      await requireMembership(caller, centreId, ['owner', 'admin']);
      const merged = mergeCentreChat(body.settings);
      await adminDb.collection('centres').doc(centreId).set(
        { chat: { ...merged, updatedAt: new Date().toISOString() } },
        { merge: true },
      );
      res.json({ ok: true, settings: await getCentreChat(centreId) });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] centre settings save failed');
    }
  });

  app.get('/api/centre/chat/reports', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = cleanStr(req.query.centreId, 120);
      if (!centreId) throw httpError(400, 'centreId is required.');
      await requireMembership(caller, centreId, ['owner', 'admin']);
      const status = cleanStr(req.query.status, 20);
      let query = adminDb.collection('chatReports').where('centreId', '==', centreId).orderBy('createdAt', 'desc');
      if (status === 'pending') query = query.where('status', '==', 'pending').limit(50) as any;
      else query = query.limit(100);
      const snap = await query.get();
      res.json({ ok: true, reports: snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] centre reports read failed');
    }
  });

  // One action per report: remove the message, mute the student, dismiss, or
  // escalate to TOS. Mute days come from the centre's own muteDayOptions.
  app.post('/api/centre/chat/reports/:id/action', async (req, res) => {
    try {
      const caller = getCaller(req);
      const body = req.body || {};
      const centreId = cleanStr(body.centreId, 120);
      if (!centreId) throw httpError(400, 'centreId is required.');
      const membership = await requireMembership(caller, centreId, ['owner', 'admin', 'tutor']);
      const isTutor = membership.role === 'tutor';
      const reportRef = adminDb.collection('chatReports').doc(String(req.params.id || ''));
      const reportSnap = await reportRef.get();
      if (!reportSnap.exists) throw httpError(404, 'Report not found.');
      const report = reportSnap.data() as any;
      if (report.centreId !== centreId) throw httpError(404, 'Report not found.');
      const action = cleanStr(body.action, 20);
      if (isTutor && action !== 'remove') throw httpError(403, 'Only centre admins can do that.');
      if (isTutor) {
        const cc = await getCentreChat(centreId);
        if (!cc.tutorsCanRemove) throw httpError(403, 'Tutors cannot remove messages in your centre.');
      }
      const now = new Date().toISOString();
      const resolve = (resolution: string) => reportRef.set({
        status: 'resolved', resolution, handledBy: caller.uid, handledByRole: membership.role, resolvedAt: now,
      }, { merge: true });

      if (action === 'remove') {
        const msgRef = adminRtdb.ref(`chat/groups/${report.groupId}/messages/${report.messageId}`);
        const msgSnap = await msgRef.get();
        const msg = msgSnap.val();
        if (!msg) throw httpError(404, 'That message is no longer available.');
        if (msg.role === 'tos') throw httpError(403, 'Centre admins cannot remove TOS posts.');
        if (msg.role === 'tutor' && membership.role === 'tutor') throw httpError(403, 'Tutors cannot remove tutor messages.');
        await msgRef.set({ ...msg, removed: { by: caller.uid, byRole: membership.role, at: ServerValue.TIMESTAMP } });
        await resolve('message_removed');
      } else if (action === 'mute') {
        const centreChat = await getCentreChat(centreId);
        const days = clampInt(body.days, 0, 365, 0);
        if (!centreChat.muteDayOptions.includes(days)) throw httpError(400, 'Choose a mute length from your saved options.');
        await adminDb.collection('chatMutes').doc(`${centreId}__${report.offenderUid}`).set({
          centreId, uid: report.offenderUid, until: Date.now() + days * DAY_MS, by: caller.uid, createdAt: now,
        }, { merge: true });
        await resolve('muted');
      } else if (action === 'dismiss') {
        await resolve('dismissed');
      } else if (action === 'escalate') {
        await reportRef.set({ status: 'escalated', escalatedAt: now, escalatedBy: caller.uid }, { merge: true });
      } else {
        throw httpError(400, 'Unknown action.');
      }
      res.json({ ok: true });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] report action failed');
    }
  });

  // ------------------------------------------------------------------
  // TOS routes (T1-T3 screens)
  // ------------------------------------------------------------------

  app.get('/api/tos/chat/settings', async (req, res) => {
    try {
      getCaller(req);
      res.json({ ok: true, settings: await getTosChat() });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] tos settings read failed');
    }
  });

  app.put('/api/tos/chat/settings', async (req, res) => {
    try {
      const caller = getCaller(req);
      if (!caller.tos) throw httpError(403, 'Not allowed.');
      if (String(req.body?.confirm || '') !== 'APPLY') {
        throw httpError(400, 'Type APPLY to confirm the change.');
      }
      const merged = mergeTosChat(req.body?.settings);
      await adminDb.collection('platformConfig').doc('global').set(
        { chat: { ...merged, updatedAt: new Date().toISOString() } },
        { merge: true },
      );
      res.json({ ok: true, settings: await getTosChat() });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] tos settings save failed');
    }
  });

  // The TOS-owned cross-centre channel (Mock and Practice). Created once,
  // explicitly, by TOS; centre admins can never edit or remove it.
  app.post('/api/tos/chat/channel/create', async (req, res) => {
    try {
      const caller = getCaller(req);
      if (!caller.tos) throw httpError(403, 'Not allowed.');
      const existing = await adminDb.collection('chatGroups').where('kind', '==', 'tos_channel').limit(1).get();
      if (!existing.empty) {
        return res.json({ ok: true, groupId: existing.docs[0].id, alreadyExists: true });
      }
      const tosChat = await getTosChat();
      const now = new Date().toISOString();
      const ref = await adminDb.collection('chatGroups').add({
        centreId: null,
        name: tosChat.mockPracticeChannelName,
        kind: 'tos_channel',
        subject: null,
        access: { mode: 'centre_default', thresholdPercent: null },
        createdBy: caller.uid,
        createdByRole: 'tos',
        createdAt: now,
        updatedAt: now,
        active: true,
      });
      res.json({ ok: true, groupId: ref.id });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] channel create failed');
    }
  });

  app.get('/api/tos/chat/channel', async (req, res) => {
    try {
      const caller = getCaller(req);
      if (!caller.tos) throw httpError(403, 'Not allowed.');
      const snap = await adminDb.collection('chatGroups').where('kind', '==', 'tos_channel').limit(1).get();
      if (snap.empty) return res.json({ ok: true, channel: null, messages: [] });
      const group = loadGroupFromDoc(snap.docs[0]);
      const tosChat = await getTosChat();
      const limit = clampInt(req.query.limit, 1, MAX_PAGE, MAX_PAGE);
      await pruneOld(group, tosChat.retentionDays);
      const messagesSnap = await adminRtdb.ref(`chat/groups/${group.id}/messages`).orderByChild('at').limitToLast(limit).get();
      const messages: any[] = [];
      messagesSnap.forEach((c) => {
        const v = c.val() || {};
        messages.push({
          id: c.key,
          uid: cleanStr(v.uid, 64),
          username: cleanStr(v.username, 16),
          role: cleanStr(v.role, 20),
          text: String(v.text ?? '').slice(0, tosChat.messageMaxChars),
          at: Number(v.at) || 0,
          removed: Boolean(v.removed),
          forwardedFrom: typeof v.forwardedFrom === 'string' ? cleanStr(v.forwardedFrom, 80) : null,
          replyTo: v.replyTo && typeof v.replyTo === 'object' ? { id: cleanStr(v.replyTo.id, 128), username: cleanStr(v.replyTo.username, 16), excerpt: String(v.replyTo.excerpt ?? '').slice(0, 140) } : null,
          reactions: sanitizeReactions(v.reactions),
          mine: v.uid === caller.uid,
        });
      });
      res.json({ ok: true, channel: group, messages: messages.reverse(), meta: await readMeta(group.id) });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] channel read failed');
    }
  });

  app.post('/api/tos/chat/channel/messages', async (req, res) => {
    try {
      const caller = getCaller(req);
      if (!caller.tos) throw httpError(403, 'Not allowed.');
      const snap = await adminDb.collection('chatGroups').where('kind', '==', 'tos_channel').limit(1).get();
      if (snap.empty) throw httpError(404, 'Create the channel first.');
      const group = loadGroupFromDoc(snap.docs[0]);
      const tosChat = await getTosChat();
      const text = String(req.body?.text ?? '').replace(/\s+$/g, '');
      if (!text) throw httpError(400, 'Write a message first.');
      if (text.length > tosChat.messageMaxChars) throw httpError(400, `Messages can be up to ${tosChat.messageMaxChars} characters.`);
      const replyTo = await buildReplyTo(group.id, req.body?.replyTo);
      await writeMessage(group, { uid: caller.uid, username: 'TOS', role: 'tos' }, text.slice(0, tosChat.messageMaxChars), null, replyTo ? { replyTo } : undefined);
      res.json({ ok: true });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] tos post failed');
    }
  });

  // TOS reactions and removals inside the platform channel.
  app.post('/api/tos/chat/channel/messages/:msgId/react', async (req, res) => {
    try {
      const caller = getCaller(req);
      if (!caller.tos) throw httpError(403, 'Not allowed.');
      const snap = await adminDb.collection('chatGroups').where('kind', '==', 'tos_channel').limit(1).get();
      if (snap.empty) throw httpError(404, 'Create the channel first.');
      const group = loadGroupFromDoc(snap.docs[0]);
      const emoji = sanitizeEmoji(req.body?.emoji);
      if (!emoji) throw httpError(400, 'Pick a reaction from the list.');
      await toggleReaction(group.id, String(req.params.msgId || ''), caller.uid, emoji);
      res.json({ ok: true });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] tos react failed');
    }
  });

  app.post('/api/tos/chat/channel/messages/:msgId/remove', async (req, res) => {
    try {
      const caller = getCaller(req);
      if (!caller.tos) throw httpError(403, 'Not allowed.');
      const snap = await adminDb.collection('chatGroups').where('kind', '==', 'tos_channel').limit(1).get();
      if (snap.empty) throw httpError(404, 'Create the channel first.');
      const group = loadGroupFromDoc(snap.docs[0]);
      const msgRef = adminRtdb.ref(`chat/groups/${group.id}/messages/${cleanStr(String(req.params.msgId || ''), 128)}`);
      const m = await msgRef.get();
      const v = m.val();
      if (!v) throw httpError(404, 'That message is no longer available.');
      if (v.removed) return res.json({ ok: true });
      await msgRef.set({ ...v, removed: { by: caller.uid, byRole: 'tos', at: ServerValue.TIMESTAMP } });
      res.json({ ok: true });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] tos remove failed');
    }
  });

  app.get('/api/tos/chat/overview', async (req, res) => {
    try {
      const caller = getCaller(req);
      if (!caller.tos) throw httpError(403, 'Not allowed.');
      const [tosChat, centresSnap, groupsSnap, escalatedSnap] = await Promise.all([
        getTosChat(),
        adminDb.collection('centres').limit(100).get(),
        adminDb.collection('chatGroups').limit(200).get(),
        adminDb.collection('chatReports').where('status', '==', 'escalated').limit(100).get(),
      ]);
      const centres = centresSnap.docs.map((d) => ({ id: d.id, name: cleanStr((d.data() as any).name, 120) }));
      const byCentre: Record<string, { groups: number; channel: boolean }> = {};
      groupsSnap.docs.forEach((g) => {
        const v = g.data() as any;
        if (v.active === false) return;
        const cid = cleanStr(v.centreId, 120) || '';
        if (!cid) return;
        byCentre[cid] = byCentre[cid] || { groups: 0, channel: false };
        byCentre[cid].groups += 1;
      });
      const escalatedCentreIds = new Set(escalatedSnap.docs.map((d) => cleanStr((d.data() as any).centreId, 120)));
      res.json({
        ok: true,
        settings: tosChat,
        centres: centres.map((c) => ({
          id: c.id,
          name: c.name,
          groups: (byCentre[c.id] || { groups: 0, channel: false }).groups,
          escalatedReports: escalatedCentreIds.has(c.id),
        })),
        totals: { groups: groupsSnap.docs.filter((g) => (g.data() as any).active !== false).length, escalated: escalatedSnap.size },
      });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] tos overview failed');
    }
  });

  // TOS sees only escalated reports, each with the centre name beside it.
  app.get('/api/tos/chat/reports', async (req, res) => {
    try {
      const caller = getCaller(req);
      if (!caller.tos) throw httpError(403, 'Not allowed.');
      const snap = await adminDb.collection('chatReports').where('status', '==', 'escalated').limit(100).get();
      const centres = await adminDb.collection('centres').limit(100).get();
      const nameById = new Map<string, string>();
      centres.docs.forEach((d) => nameById.set(d.id, cleanStr((d.data() as any).name, 120)));
      const reports = snap.docs.map((d) => {
        const v = d.data() as any;
        return { id: d.id, ...v, centreName: nameById.get(cleanStr(v.centreId, 120)) || '' };
      });
      res.json({ ok: true, reports });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] tos reports read failed');
    }
  });

  app.post('/api/tos/chat/reports/:id/action', async (req, res) => {
    try {
      const caller = getCaller(req);
      if (!caller.tos) throw httpError(403, 'Not allowed.');
      const reportRef = adminDb.collection('chatReports').doc(String(req.params.id || ''));
      const reportSnap = await reportRef.get();
      if (!reportSnap.exists) throw httpError(404, 'Report not found.');
      const report = reportSnap.data() as any;
      if (report.status !== 'escalated') throw httpError(400, 'Only escalated reports come to TOS.');
      const action = cleanStr(req.body?.action, 20);
      const now = new Date().toISOString();
      if (action === 'remove') {
        const msgRef = adminRtdb.ref(`chat/groups/${report.groupId}/messages/${report.messageId}`);
        const msgSnap = await msgRef.get();
        const msg = msgSnap.val();
        if (!msg) throw httpError(404, 'That message is no longer available.');
        await msgRef.set({ ...msg, removed: { by: caller.uid, byRole: 'tos', at: ServerValue.TIMESTAMP } });
        await reportRef.set({ status: 'resolved', resolution: 'removed_by_tos', handledBy: caller.uid, resolvedAt: now }, { merge: true });
      } else if (action === 'dismiss') {
        await reportRef.set({ status: 'resolved', resolution: 'dismissed_by_tos', handledBy: caller.uid, resolvedAt: now }, { merge: true });
      } else {
        throw httpError(400, 'Unknown action.');
      }
      res.json({ ok: true });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] tos report action failed');
    }
  });
}

// ---------------------------------------------------------------------------
// Shared helpers kept after the routes for readability.
// ---------------------------------------------------------------------------

function loadGroupFromDoc(doc: QueryDocumentSnapshot<DocumentData>): GroupDoc {
  const d = doc.data() as any;
  return {
    id: doc.id,
    centreId: d.centreId ?? null,
    name: cleanStr(d.name, MAX_NAME_CHARS),
    kind: d.kind,
    subject: d.subject ? cleanStr(d.subject, MAX_SUBJECT_CHARS) : null,
    access: d.access && typeof d.access === 'object' ? d.access : { mode: 'centre_default' },
    createdBy: cleanStr(d.createdBy, 64),
    createdByRole: cleanStr(d.createdByRole, 20),
    createdAt: cleanStr(d.createdAt, 40),
    updatedAt: cleanStr(d.updatedAt, 40),
    active: d.active !== false,
  };
}

function validateAccess(raw: any): ChatAccessRule {
  const mode = raw?.mode === 'custom' ? 'custom' : raw?.mode === 'none' ? 'none' : 'centre_default';
  if (mode !== 'custom') return { mode, thresholdPercent: null };
  return { mode, thresholdPercent: clampInt(raw.thresholdPercent, 0, 100, 0) };
}

function handleRouteError(res: express.Response, error: any, context: string): void {
  const done = (code: number, body: unknown) => { res.status(code).json(body); };
  if (error?.status) {
    // Locked students get their real numbers back inside the 403 body.
    if (error.status === 403 && error.message.startsWith('{')) {
      try {
        const payload = JSON.parse(error.message);
        done(403, { ok: false, ...payload });
        return;
      } catch { /* fall through to the plain error below */ }
    }
    done(error.status, { error: error.message });
    return;
  }
  console.error(`${context}:`, error?.message || error);
  done(500, { error: 'A server error occurred. Please try again.' });
}
