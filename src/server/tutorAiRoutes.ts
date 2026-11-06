// ============================================================================
// Tutor AI (T1/T2) — general study-assistant chat for centre members.
//
// Scope: centre portals only (students, tutors, centre admins). T1 is the
// general conversation layer: the model answers study questions and photos
// of work. It does NOT read student records, results or centre data yet —
// personalisation lands in a later piece, and until then the assistant says
// plainly that it cannot see those records.
//
// Engine: the SAME key and backend as the existing AI feature in server.ts —
// EXCELLENT_API_KEY calling Vertex AI (Gemini Enterprise) through
// @google/genai in enterprise mode. Never GEMINI_API_KEY. This module is
// separate new code; the existing AI routes and collections are untouched.
//
// Storage (T2): each chat a member has with the AI is its own document in
// `tutorAiConversations` (id `${centreId}__${uid}__${createdAtMs}`), written
// by the server only, so the client can list a chat history sidebar. Messages
// are capped so each document stays small; image attachments are stored as
// small thumbnails only, never the full upload. The legacy single-chat
// collection `tutorAiChats` is no longer written and stays untouched.
//
// Monthly usage moves to its own counter document `tutorAiUsage/${centreId}__${uid}`
// so the per-centre monthly cap counts across every conversation of a member.
//
// Caps (both overridable via platformConfig): a monthly per-centre message
// cap and an hourly per-user burst cap, enforced server-side.
// ============================================================================

import express from 'express';
import { adminDb } from './firebaseAdmin';
import {
  requireMembership,
  getCentreSubscriptionStatus,
  getPlatformConfig,
  httpError,
  listActiveMembershipsForUser,
  type Caller,
} from './tenantService';

const TUTOR_AI_MODEL = 'gemini-3.8-flash';
const MESSAGES_KEPT = 60; // newest messages kept per conversation
const CONTEXT_MESSAGES = 24; // newest messages sent to the model as context
const CONVERSATIONS_LISTED = 50; // newest conversations shown in the sidebar
const DEFAULT_MONTHLY_CAP = 300; // messages per centre per month
const DEFAULT_HOURLY_CAP = 30; // messages per user per hour
const MAX_TEXT_CHARS = 4000;
const MAX_IMAGE_BASE64_CHARS = 4_600_000; // ~3.4 MB binary
const MAX_THUMB_BASE64_CHARS = 260_000; // ~190 KB binary
const ID_RE = /^[a-zA-Z0-9_\-]+$/;
// Photos sent to the AI are stored as small thumbnails inside the
// conversation document (the full upload is never stored). Any thumbnail
// older than this is dropped the next time the conversation is written, so
// old chats do not pile up storage forever.
const IMAGE_RETENTION_DAYS = 30;
const pruneOldImages = (messages: any[], now = Date.now()) =>
  messages.map((m) =>
    m && m.img && now - (m.at || 0) > IMAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000
      ? { ...m, img: null }
      : m
  );

const rateLimitDocId = (key: string) => encodeURIComponent(key).slice(0, 1400);

const SYSTEM_PROMPT = [
  'You are Tutor AI, the study assistant inside a Nigerian tutorial centre app.',
  'You help secondary-school students and their tutors with their studies: explain topics simply,',
  'answer academic questions step by step, help practise, and help with exam preparation for WAEC, NECO and JAMB.',
  'Rules:',
  '- Keep answers clear, warm and concise. Short paragraphs or numbered steps. Simple language.',
  '- Format answers with simple markdown so the app can render them cleanly: **bold** for key terms,',
  '  ## headings for sections of a longer answer, and bullet or numbered lists for steps. Never use',
  '  code blocks or LaTeX for maths: write mathematics in plain text, x^2, sqrt(x), 2x + 5 = 17, 3/4.',
  '  Avoid unicode superscripts.',
  '- Never invent facts about the centre, its staff or its students. If unsure, say so.',
  '- Never discuss, identify or gossip about other students or staff members.',
  '- Respond in the language the question is written in (English stays English, Yoruba stays Yoruba, and so on).',
  '- Refuse to help cheat in a live exam or produce work meant to deceive teachers; help with real learning instead.',
  '- If the user sends a photo, read the question or work in it and answer or correct it step by step.',
  '  If the photo is unreadable, ask for a clearer photo.',
].join('\n');

function tutorAiFailure(context: string, err: unknown): never {
  const message = (err as any)?.message || String(err);
  console.log(`[tutorAi] Firestore failure in ${context}: ${message}`);
  throw httpError(500, 'Tutor AI could not be reached just now. Please try again.');
}

function getCallerOr401(req: express.Request): Caller {
  const caller = (req as any).caller as Caller | undefined;
  if (!caller) throw httpError(401, 'Unauthorized');
  return caller;
}

// Resolve the centre: an explicit centreId wins (tutors and admins may belong
// to more than one, so the client sends the active one); otherwise fall back
// to the caller's single active membership (students belong to one centre).
async function resolveCentreId(caller: Caller, centreId: string): Promise<string> {
  if (centreId) {
    await requireMembership(caller, centreId);
    return centreId;
  }
  const memberships = await listActiveMembershipsForUser(caller.uid);
  if (!memberships.length) throw httpError(403, 'You do not have access to this feature.');
  const first = memberships[0] as any;
  const cid = first.centreId || '';
  if (!cid) throw httpError(403, 'You do not have access to this feature.');
  await requireMembership(caller, cid);
  return cid;
}

// A conversation id only counts when it belongs to this caller in this centre,
// so one member can never read or write another member's conversations.
function validateConversationId(raw: string, centreId: string, uid: string): string {
  const id = String(raw || '').trim();
  if (!id) return '';
  if (!ID_RE.test(id) || id.length > 200 || !id.startsWith(`${centreId}__${uid}__`)) {
    throw httpError(400, 'That conversation could not be opened.');
  }
  return id;
}

// Who the AI is talking to: their portal role (student, tutor or centre
// admin) and their name, read from the centre's own records, so the same
// assistant speaks differently in each portal. Students get a friendly
// subject teacher; tutors get a teaching colleague; admins get a centre
// management assistant.
async function personaFor(centreId: string, caller: Caller): Promise<string> {
  let role = '';
  let name = '';
  try {
    const mem = await adminDb.collection('memberships').doc(`${caller.uid}__${centreId}`).get();
    if (mem.exists) role = String((mem.data() as any)?.role || '');
  } catch { /* the fallback persona covers it */ }
  try {
    const stu = await adminDb.collection('students').doc(caller.uid).get();
    if (stu.exists) {
      name = String((stu.data() as any)?.name || '');
      role = 'student';
    }
  } catch { /* keep the membership role */ }
  if (!name && (role === 'tutor' || role === 'owner' || role === 'admin' || !role)) {
    try {
      const tut = await adminDb.collection('tutors').where('uid', '==', caller.uid).limit(1).get();
      if (!tut.empty) name = String((tut.docs[0].data() as any)?.name || '');
    } catch { /* unnamed is fine */ }
  }
  if (!name) {
    try {
      const adm = await adminDb.collection('admins').doc(caller.uid).get();
      if (adm.exists) {
        const v = (adm.data() as any) || {};
        name = String(v.name || v.displayName || v.fullName || '');
      }
    } catch { /* unnamed is fine */ }
  }
  let centreName = '';
  try {
    const centre = await adminDb.collection('centres').doc(centreId).get();
    if (centre.exists) centreName = String((centre.data() as any)?.name || '');
  } catch { /* unnamed is fine */ }
  const at = centreName ? ` at ${centreName}` : '';
  const who = name || 'The person you are talking to';
  if (role === 'tutor') {
    return [
      `Who you are talking to: ${name ? `${name}, a tutor${at}.` : `a tutor${at}.`}`,
      'Treat them as a teaching professional, never like a student. Discuss lesson planning, explaining difficult topics, teaching strategies, class management, marking guidance and how to help their students perform better in WAEC, NECO and JAMB.',
      name ? `When they greet you (for example "hi"), greet ${name} back by name and offer tutor-relevant help.` : 'When they greet you, greet them back warmly and offer tutor-relevant help.',
      "You cannot see the centre’s records (results, attendance, fees) yet. If asked about a specific student’s performance, say plainly that you cannot see that yet and give guidance based on what they tell you.",
    ].join(' ');
  }
  if (role === 'owner' || role === 'admin') {
    return [
      `Who you are talking to: ${name ? `${name}, the administrator of ${centreName || 'a tutorial centre'}.` : `the administrator of ${centreName || 'a tutorial centre'}.`}`,
      "Treat them as the centre’s manager. Help with running the centre: understanding student performance and attendance patterns, communicating with students and staff, planning academic programmes, exam preparation logistics and getting the most from the platform.",
      name ? `When they greet you (for example "hi"), greet ${name} back by name and offer admin-relevant help.` : 'When they greet you, greet them back warmly and offer admin-relevant help.',
      "You cannot see the centre’s records (results, attendance, fees) yet. If asked about specific student data, say plainly that you cannot see that yet and give guidance based on what they tell you.",
    ].join(' ');
  }
  return [
    `Who you are talking to: ${name ? `${name}, a student${at}.` : `a student${at}.`}`,
    'Talk like a friendly, encouraging subject teacher helping a secondary-school student: simple words, step-by-step explanations, exam tips for WAEC, NECO and JAMB.',
    name ? `When they greet you (for example "hi"), greet ${name} back by name and offer study help.` : 'When they greet you, greet them back warmly and offer study help.',
    "You cannot see the student’s results, attendance, fees or any school records yet. If asked about their personal performance or school data, say plainly that you cannot see that yet and offer what you can help with instead.",
  ].join(' ');
}

function titleFrom(text: string, hasImage: boolean): string {
  const base = text.trim();
  if (base) return base.length > 60 ? `${base.slice(0, 57)}…` : base;
  return hasImage ? 'Photo question' : 'New chat';
}

function parseImageDataUrl(value: unknown): { mimeType: string; data: string } | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw httpError(400, 'The attached image is not valid.');
  const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) throw httpError(400, 'Only photo attachments (JPG, PNG or WebP) are supported.');
  if (value.length > MAX_IMAGE_BASE64_CHARS) throw httpError(400, 'The photo is too large. Please attach a smaller one.');
  return { mimeType: match[1] === 'image/jpg' ? 'image/jpeg' : match[1], data: match[2] };
}

async function consumeBurstLimit(caller: Caller, config: any): Promise<void> {
  const limitPerHour = Number(config?.tutorAiHourlyCap) || DEFAULT_HOURLY_CAP;
  const id = rateLimitDocId(`tutor-ai-burst:${caller.uid}`);
  try {
    await adminDb.runTransaction(async (tx) => {
      const ref = adminDb.collection('rateLimits').doc(id);
      const doc = await tx.get(ref);
      const now = Date.now();
      const windowMs = 60 * 60 * 1000;
      let count = 1;
      let windowStart = now;
      if (doc.exists && now - (doc.data()!.windowStart || 0) <= windowMs) {
        count = (doc.data()!.count || 0) + 1;
        windowStart = doc.data()!.windowStart;
      }
      if (count > limitPerHour) {
        const waitMinutes = Math.ceil((windowStart + windowMs - now) / 60000);
        throw httpError(429, `You are sending messages too quickly. Please wait ${waitMinutes} minute${waitMinutes === 1 ? '' : 's'} before trying again.`);
      }
      tx.set(ref, { count, windowStart, expiresAt: new Date(windowStart + windowMs + windowMs) }, { merge: true });
    });
  } catch (err: any) {
    if (err?.status === 429) throw err;
    tutorAiFailure('consumeBurstLimit', err);
  }
}

export function registerTutorAiRoutes(app: express.Express) {
  // Send a message (and optionally a photo) to the Tutor AI. The first message
  // of a new chat creates the conversation; later messages carry its id.
  app.post('/api/tutor-ai/chat', async (req, res) => {
    try {
      const caller = getCallerOr401(req);
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const rawText = typeof body.text === 'string' ? body.text.trim() : '';
      const image = parseImageDataUrl(body.image);
      const thumb = parseImageDataUrl(body.imageThumb);
      if (thumb && !image) throw httpError(400, 'The photo attachment is incomplete. Please try again.');
      if (!rawText && !image) throw httpError(400, 'Type a question or attach a photo first.');
      if (rawText.length > MAX_TEXT_CHARS) throw httpError(400, `Messages are limited to ${MAX_TEXT_CHARS.toLocaleString()} characters.`);

      const centreId = await resolveCentreId(caller, String(body.centreId || '').slice(0, 128));

      const status = await getCentreSubscriptionStatus(centreId);
      if (status !== 'active' && status !== 'trial') {
        throw httpError(403, 'Tutor AI is unavailable while the centre\'s subscription is not active.');
      }

      const config = await getPlatformConfig();
      const monthlyCap = Number((config as any)?.tutorAiMonthlyCap) || DEFAULT_MONTHLY_CAP;
      await consumeBurstLimit(caller, config);

      const requestedId = validateConversationId(String(body.conversationId || ''), centreId, caller.uid);
      const now = Date.now();
      const conversationId = requestedId || `${centreId}__${caller.uid}__${now}`;
      const convRef = adminDb.collection('tutorAiConversations').doc(conversationId);

      // One transaction: enforce the monthly cap across all conversations,
      // create the conversation when it is new, and store the user's message
      // (thumbnail only, never the full upload). Firestore requires every
      // read inside a transaction to run before any write, so both documents
      // are read first and only then written.
      let history: Array<{ role: 'user' | 'ai'; text: string }> = [];
      let remaining = 0;
      await adminDb.runTransaction(async (tx) => {
        const usageRef = adminDb.collection('tutorAiUsage').doc(`${centreId}__${caller.uid}`);
        const usageSnap = await tx.get(usageRef);
        const convSnap = await tx.get(convRef);
        const u = (usageSnap.exists ? usageSnap.data() : null) as any;
        const monthKey = new Date().toISOString().slice(0, 7);
        const monthCount = u && u.monthKey === monthKey ? (u.monthCount || 0) + 1 : 1;
        if (monthCount > monthlyCap) {
          throw httpError(429, 'Tutor AI has reached its message limit for this centre this month. Ask the centre admin for help.');
        }
        remaining = Math.max(0, monthlyCap - monthCount);
        const data = (convSnap.exists ? convSnap.data() : null) as any;
        const previous: any[] = Array.isArray(data?.messages) ? data.messages : [];
        history = previous.slice(-CONTEXT_MESSAGES).map((m: any) => ({ role: m.role === 'ai' ? 'ai' : 'user', text: String(m.text || '') }));
        const userMsg = { role: 'user', text: rawText, img: thumb ? thumb.data : null, at: now };
        const messages = pruneOldImages([...previous, userMsg].slice(-MESSAGES_KEPT), now);
        tx.set(usageRef, { centreId, uid: caller.uid, monthKey, monthCount, updatedAt: now }, { merge: false });
        tx.set(convRef, {
          centreId,
          uid: caller.uid,
          email: caller.email || '',
          title: data?.title || titleFrom(rawText, !!image),
          createdAt: data?.createdAt || now,
          updatedAt: now,
          messages,
        }, { merge: false });
      });

      // Ask the model. The image rides only on this request; history is text.
      const persona = await personaFor(centreId, caller);

      const ai = await getTutorAiClient();
      const contents: any[] = history
        .filter((m) => m.text)
        .map((m) => ({ role: m.role === 'ai' ? 'model' : 'user', parts: [{ text: m.text }] }));
      const finalParts: any[] = [];
      if (image) finalParts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
      finalParts.push({ text: rawText || 'Please look at this photo and help me with it.' });
      contents.push({ role: 'user', parts: finalParts });

      let reply = '';
      try {
        const response = await ai.models.generateContent({
          model: TUTOR_AI_MODEL,
          contents,
          config: { systemInstruction: `${SYSTEM_PROMPT}\n\n${persona}` },
        });
        reply = String(response.text || '').trim();
      } catch (err: any) {
        console.log(`[tutorAi] model call failed: ${err?.message || err}`);
        throw httpError(502, 'Tutor AI could not answer just now. Please try again in a moment.');
      }
      if (!reply) throw httpError(502, 'Tutor AI could not answer just now. Please try again in a moment.');

      // Store the assistant's reply, keeping the document bounded.
      await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(convRef);
        const data = (snap.exists ? snap.data() : null) as any;
        const previous: any[] = Array.isArray(data?.messages) ? data.messages : [];
        const messages = pruneOldImages([...previous, { role: 'ai', text: reply, img: null, at: Date.now() }].slice(-MESSAGES_KEPT));
        tx.set(convRef, { ...(data || { centreId, uid: caller.uid }), messages, updatedAt: Date.now() }, { merge: false });
      }).catch((err) => tutorAiFailure('storeReply', err));

      const after = await convRef.get();
      res.json({
        reply,
        conversationId,
        messages: (after.data() as any)?.messages || [],
        remaining,
        cap: monthlyCap,
      });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: error.message || 'Tutor AI could not answer just now. Please try again.' });
    }
  });

  // List the member's chats with the Tutor AI, newest first, for the sidebar.
  app.get('/api/tutor-ai/conversations', async (req, res) => {
    try {
      const caller = getCallerOr401(req);
      const centreId = await resolveCentreId(caller, String((req.query.centreId as string) || '').slice(0, 128));
      const snap = await adminDb
        .collection('tutorAiConversations')
        .where('centreId', '==', centreId)
        .where('uid', '==', caller.uid)
        .orderBy('updatedAt', 'desc')
        .limit(CONVERSATIONS_LISTED)
        .get()
        .catch((err: any) => tutorAiFailure('listConversations', err));
      const conversations = snap.docs.map((d: any) => {
        const x = d.data() || {};
        return { id: d.id, title: String(x.title || 'New chat'), updatedAt: x.updatedAt || x.createdAt || 0 };
      });
      res.json({ conversations });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: error.message || 'Could not load the chat list.' });
    }
  });

  // Load one conversation's messages; without an id, the newest one.
  app.get('/api/tutor-ai/history', async (req, res) => {
    try {
      const caller = getCallerOr401(req);
      const centreId = await resolveCentreId(caller, String((req.query.centreId as string) || '').slice(0, 128));
      const config = await getPlatformConfig();
      const monthlyCap = Number((config as any)?.tutorAiMonthlyCap) || DEFAULT_MONTHLY_CAP;
      let conversationId = validateConversationId(String((req.query.conversationId as string) || ''), centreId, caller.uid);
      if (!conversationId) {
        const latest = await adminDb
          .collection('tutorAiConversations')
          .where('centreId', '==', centreId)
          .where('uid', '==', caller.uid)
          .orderBy('updatedAt', 'desc')
          .limit(1)
          .get()
          .catch((err: any) => tutorAiFailure('latestConversation', err));
        conversationId = latest.empty ? '' : latest.docs[0].id;
      }
      let messages: any[] = [];
      if (conversationId) {
        const snap = await adminDb.collection('tutorAiConversations').doc(conversationId).get();
        const data = (snap.exists ? snap.data() : null) as any;
        messages = Array.isArray(data?.messages) ? data.messages : [];
      }
      const usage = await adminDb.collection('tutorAiUsage').doc(`${centreId}__${caller.uid}`).get();
      const u = (usage.exists ? usage.data() : null) as any;
      const monthKey = new Date().toISOString().slice(0, 7);
      const used = u && u.monthKey === monthKey ? u.monthCount || 0 : 0;
      res.json({
        conversationId: conversationId || null,
        messages,
        remaining: Math.max(0, monthlyCap - used),
        cap: monthlyCap,
      });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: error.message || 'Could not load the conversation.' });
    }
  });

  // Delete one conversation from the history (the monthly cap already counts
  // the messages sent, so it is not reset). Without an id, the newest goes.
  app.post('/api/tutor-ai/clear', async (req, res) => {
    try {
      const caller = getCallerOr401(req);
      const centreId = await resolveCentreId(caller, String(req.body?.centreId || '').slice(0, 128));
      let conversationId = validateConversationId(String(req.body?.conversationId || ''), centreId, caller.uid);
      if (!conversationId) {
        const latest = await adminDb
          .collection('tutorAiConversations')
          .where('centreId', '==', centreId)
          .where('uid', '==', caller.uid)
          .orderBy('updatedAt', 'desc')
          .limit(1)
          .get()
          .catch((err: any) => tutorAiFailure('latestConversation', err));
        conversationId = latest.empty ? '' : latest.docs[0].id;
      }
      if (conversationId) {
        await adminDb.collection('tutorAiConversations').doc(conversationId).delete()
          .catch((err: any) => tutorAiFailure('deleteConversation', err));
      }
      res.json({ ok: true });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: error.message || 'Could not delete the conversation.' });
    }
  });
}

async function getTutorAiClient() {
  const { GoogleGenAI } = await import('@google/genai');
  const apiKey = process.env.EXCELLENT_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error('The Tutor AI is not configured yet. Please contact the platform team.'), { status: 400 });
  }
  console.log('Tutor AI backend: Vertex (enterprise) via EXCELLENT_API_KEY');
  const ai = new GoogleGenAI({
    enterprise: true,
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });
  if (!ai.vertexai) {
    throw httpError(400, 'The Tutor AI is not configured correctly. Please contact the platform team.');
  }
  return ai;
}
