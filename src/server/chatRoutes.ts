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
import { CentreChatSettings, ChatAccessRule, TosChatSettings } from '../types';

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
  kind: 'subject' | 'announcements' | 'custom' | 'tos_channel';
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
  const s: TosChatSettings = { ...START_TOS_CHAT, autoPosts: { ...START_TOS_CHAT.autoPosts } };
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

async function writeMessage(group: GroupDoc, sender: { uid: string; username: string; role: string }, text: string, photoUrl: string | null): Promise<void> {
  const msgRef = adminRtdb.ref(`chat/groups/${group.id}/messages`).push();
  await msgRef.set({
    uid: sender.uid,
    username: sender.username,
    role: sender.role,
    text,
    photoUrl: photoUrl || null,
    at: ServerValue.TIMESTAMP,
    removed: null,
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
  if (!isTosChannel && group.centreId !== centreId) throw httpError(404, 'Group not found.');
  if (isTosChannel && group.centreId) throw httpError(404, 'Group not found.');
  const centreChat = isTosChannel ? await getCentreChat(centreId) : await getCentreChat(group.centreId as string);
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
  if (!studentInGroup(student.subjects, group)) throw httpError(403, 'You are not a member of this group.');
  return { student, centreId, group, centreChat, lock, isTosChannel };
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

  // Paged history for one group. A locked student gets the lock state back
  // with their real numbers (the S4 screen), never the messages.
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
      await writeMessage(ctx.group, { uid: caller.uid, username, role: 'student' }, text.slice(0, tosChat.messageMaxChars), photoUrl);
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
      await writeMessage(group, { uid: caller.uid, username: 'TOS', role: 'tos' }, text.slice(0, tosChat.messageMaxChars), null);
      res.json({ ok: true });
    } catch (error: any) {
      handleRouteError(res, error, '[chat] tos post failed');
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
