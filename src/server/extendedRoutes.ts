import express from 'express';
import * as crypto from 'crypto';
import { STARTING_CONFIG } from './platformDefaults';
import { adminAuth, adminDb } from './firebaseAdmin';
import { runStaffPayReminderSweep } from './staffPayReminders';
import { provisionSeats, getSeatPool, facilityTier, countPaidSeatsForCentre, addSeatsForCentre, enforceSeatConfigAcrossFacilities } from './seatDays';
import { runSeatPolicySweep } from './seatSweep';
import { payAccount, paidSeatStats, createUpgradeRequest, attachReceiptToUpgradeRequest, listUpgradeRequests, decideUpgradeRequest, listSeatPayments, notifySeatPaymentRegistered } from './seatUpgrades';
import {
  Caller,
  countActiveStudents,
  effectiveStatus,
  getPlatformConfig,
  getPlatformPlan,
  httpError,
  requireMembership,
  seatCapFor,
} from './tenantService';
import {
  buildStaffInviteEmail,
  buildVerificationEmail,
  emailProviderConfigured,
  sendEmail,
  sendOtpEmail,
} from './email';
import {
  completeFirstLogin,
  normalizeEmail,
  provisionCentre,
  regenerateAccessCode,
  resendCredentials,
  runBillingSweep, resendLoginDetails } from './provisioning';
import { deleteCentreCascade, loadBillingMap, registerTosRoutes2 } from './tosRoutes2';
import { registerChatRoutes } from './chatRoutes';
import { registerQuestionBankRoutes } from './questionBankRoutes';
import { registerProposalRoutes } from './proposalPage';
import { registerProposalApiRoutes } from './proposalRoutes';

/**
 * Prompt C routes: public lead capture and verification, the TOS platform
 * console API, owner access-code management, first-login completion, and the
 * billing sweep (manual TOS trigger + secret-protected internal trigger).
 * Registered from server.ts BEFORE the static/SPA fallback so no GET route is
 * ever swallowed by it.
 *
 * Enforcement lives here (Express + Admin SDK) and in Firestore rules, never
 * only in the UI. The /api/public/* and /api/internal/* prefixes are
 * unauthenticated by design; /public/leads/verify is gated by a one-time
 * token and /internal/* by the INTERNAL_API_SECRET header (checked by the
 * global middleware in server.ts). Everything else requires a verified
 * Firebase ID token, and TOS routes additionally require the `tos` claim.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Pulls the 11-character video id out of any normal YouTube URL shape
 *  (watch?v=, youtu.be/, shorts/, embed/, live/). Returns null for anything
 *  that is not a single YouTube video, so a playlist or channel link is
 *  refused with a clear message instead of embedded broken. */
function parseYoutubeId(raw: string): string | null {
  const url = String(raw || '').trim();
  if (!url) return null;
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  const idOk = (v: string) => /^[A-Za-z0-9_-]{11}$/.test(v);
  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0];
    return idOk(id) ? id : null;
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const v = u.searchParams.get('v');
    if (v && idOk(v)) return v;
    const m = u.pathname.match(/\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})(?:[/?#]|$)/);
    if (m) return m[1];
  }
  return null;
}

/** Short-lived in-memory cache for the public question-bank pointer. */
const qbPointerCache = new Map<string, { at: number; value: unknown }>();
const QB_POINTER_TTL_MS = 60 * 1000;

function getCaller(req: express.Request): Caller {
  const caller = (req as any).caller as Caller | undefined;
  if (!caller) throw httpError(401, 'Unauthorized');
  return caller;
}

function requireTos(req: express.Request): Caller {
  const caller = getCaller(req);
  if (!caller.tos) throw httpError(403, 'TOS staff only.');
  return caller;
}

/** Human one-liner for a user-agent: "Chrome on Windows" style. */
function describeDevice(ua: string): string {
  const u = ua || '';
  const browser = /Edg\//.test(u) ? 'Edge'
    : /OPR\//.test(u) ? 'Opera'
    : /SamsungBrowser/.test(u) ? 'Samsung Internet'
    : /Firefox\//.test(u) ? 'Firefox'
    : /CriOS\//.test(u) ? 'Chrome'
    : /FxiOS/.test(u) ? 'Firefox'
    : /Chrome\//.test(u) ? 'Chrome'
    : /Safari\//.test(u) ? 'Safari'
    : 'Browser';
  const os = /Windows/.test(u) ? 'Windows'
    : /Android/.test(u) ? 'Android'
    : /iPhone|iPad|iPod/.test(u) ? 'iOS'
    : /Mac OS X/.test(u) ? 'macOS'
    : /Linux/.test(u) ? 'Linux'
    : 'Unknown OS';
  return `${browser} on ${os}`;
}

function baseUrl(req: express.Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  const host = req.headers.host || 'localhost';
  return `https://${host}`;
}

/** Count-based sliding-window rate limit, shared across server instances. */
async function countRateLimit(key: string, max: number, windowMs: number): Promise<boolean> {
  const ref = adminDb.collection('rateLimits').doc(`lead:${key}`);
  const allowed = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const data = (snap.data() || {}) as { count?: number; windowStart?: number };
    const windowStart = typeof data.windowStart === 'number' ? data.windowStart : 0;
    const count = typeof data.count === 'number' ? data.count : 0;
    if (now - windowStart > windowMs) {
      tx.set(ref, { count: 1, windowStart: now, lockedUntil: null, expiresAt: new Date(now + windowMs) });
      return true;
    }
    if (count >= max) return false;
    tx.set(ref, { count: count + 1, windowStart, lockedUntil: null, expiresAt: new Date(now + windowMs) }, { merge: true });
    return true;
  });
  return allowed;
}

function clientIp(req: express.Request): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = Array.isArray(fwd) ? fwd[0] : typeof fwd === 'string' ? fwd.split(',')[0] : '';
  return (first || req.ip || 'unknown').trim();
}

function audit(entry: Record<string, any>): Promise<unknown> {
  return adminDb
    .collection('auditLogs')
    .add({ ...entry, at: entry.at || new Date().toISOString() })
    .catch((err) => console.error('[extendedRoutes] audit write failed:', err?.message || err));
}

function validateLeadBody(body: any): Record<string, any> | string {
  if (!body || typeof body !== 'object') return 'Invalid request.';
  if (typeof body.website === 'string' && body.website.trim() !== '') return 'Request rejected.'; // honeypot
  if (body.consent !== true) return 'Consent is required.';
  const fullName = String(body.fullName || '').trim();
  const businessName = String(body.businessName || '').trim();
  const email = normalizeEmail(String(body.email || ''));
  const phoneRaw = String(body.phone || '');
  const state = String(body.state || '').trim();
  const city = String(body.city || '').trim();
  const studentCountRaw = body.studentCount;
  const studentCount = typeof studentCountRaw === 'number' && Number.isInteger(studentCountRaw) && studentCountRaw >= 1 && studentCountRaw <= 10000
    ? studentCountRaw
    : (typeof studentCountRaw === 'string' && studentCountRaw.trim().length >= 1 && studentCountRaw.trim().length <= 20 ? studentCountRaw.trim() : null);
  const examTypes = Array.isArray(body.examTypes)
    ? body.examTypes.map((t: any) => String(t).trim()).filter(Boolean).slice(0, 10)
    : [];
  const skipTrial = body.skipTrial === true;
  // Optional accent colour the owner picked in the signup form (Nov 16).
  const accentRaw = String(body.accentColor || '').trim();
  const accentColor = /^#[0-9a-fA-F]{6}$/.test(accentRaw) ? accentRaw.toUpperCase() : '';
  const phoneDigits = phoneRaw.replace(/\D/g, '');
  if (fullName.length < 2 || fullName.length > 100) return 'Please give your full name.';
  if (businessName.length < 2 || businessName.length > 120) return 'Please give your facility name.';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'That email address does not look right.';
  if (phoneDigits.length < 7 || phoneDigits.length > 15) return 'That phone number does not look right.';
  if (!studentCount) return 'How many students does your facility have?';
  if (!state || state.length > 60) return 'Please choose a state.';
  if (city.length > 60) return 'Please tell us your city.';
  if (!examTypes.length) return 'Pick at least one exam type you teach.';
  return { fullName, businessName, email, phone: phoneDigits, state, city, studentCount, examTypes, skipTrial, accentColor };
}

async function verifyCaptcha(token: any): Promise<boolean> {
  const secret = process.env.CAPTCHA_SECRET;
  if (!secret) return true; // not configured: no captcha challenge
  if (!token || typeof token !== 'string') return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token }),
    });
    const data: any = await res.json();
    return !!data.success;
  } catch {
    return false;
  }
}

export function registerExtendedRoutes(app: express.Express): void {
  // ==========================================================================
  // PUBLIC: lead capture (Prompt C Part B)
  // ==========================================================================
  app.post('/api/public/leads', async (req, res) => {
    try {
      const ip = clientIp(req);
      if (!(await countRateLimit(`ip-${ip.replace(/\W/g, '')}`, 20, 60 * 60 * 1000))) {
        return res.status(429).json({ error: 'Too many requests. Please try again later.' });
      }
      const checked = validateLeadBody(req.body);
      if (typeof checked === 'string') return res.status(400).json({ error: checked });
      if (!(await verifyCaptcha(req.body.captchaToken))) {
        return res.status(400).json({ error: 'Captcha verification failed. Please try again.' });
      }
      if (!(await countRateLimit(`email-${checked.email.replace(/\W/g, '')}`, 5, 60 * 60 * 1000))) {
        return res.status(429).json({ error: 'Too many requests for this email. Please try again later.' });
      }

      const token = crypto.randomBytes(24).toString('hex');
      const leadRef = await adminDb.collection('leads').add({
        ...checked,
        status: 'unverified',
        verifyToken: token,
        verifyExpiresAt: new Date(Date.now() + 2 * DAY_MS).toISOString(),
        createdAt: new Date().toISOString(),
      });

      const verifyUrl = `${baseUrl(req)}/api/public/leads/verify?token=${token}`;
      const emailRes = await sendEmail(
        buildVerificationEmail({ to: checked.email, fullName: checked.fullName, businessName: checked.businessName, verifyUrl })
      );
      if (!emailRes.delivered) {
        // The link itself is not a secret and never carries credentials, so
        // logging it is safe and keeps the flow recoverable.
        console.log(`[leads] email not configured; verification link for lead ${leadRef.id}: ${verifyUrl}`);
        await leadRef.update({ emailNotDelivered: true });
      }
      await audit({ actorUid: 'public:lead-form', action: 'LEAD_CREATED', after: { leadId: leadRef.id, email: checked.email, businessName: checked.businessName } });
      res.json({ success: true });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[leads] create failed:', error?.message || error);
      res.status(500).json({ error: 'Could not save your request. Please try again.' });
    }
  });

  // ==========================================================================
  // PUBLIC: facility-name availability for the signup pages. The facility
  // page checks live while the owner types their facility name, so the
  // address they will get (tutorialos.com/<facility-name>) is known before
  // they continue. The WHOLE name is used with every space and symbol
  // removed ("Peace Academy" -> peaceacademy) and is never shortened.
  // Taken means a centre already carries that name.
  // ==========================================================================
  const slugifyName = (raw: string) =>
    String(raw || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  app.get('/api/public/name-check', async (req, res) => {
    try {
      const raw = String(req.query.name || '').trim();
      if (raw.length < 2) return res.json({ ok: false, reason: 'too-short' });
      if (raw.length > 120) return res.status(400).json({ error: 'Name is too long.' });
      const slug = slugifyName(raw);
      if (!slug) return res.json({ ok: false, reason: 'too-short' });
      const snap = await adminDb.collection('centres').limit(200).get();
      const taken = snap.docs.some((d) => slugifyName(String((d.data() as any)?.name || '')) === slug);
      res.json({ ok: true, slug, domain: `tutorialos.com/${slug}`, taken });
    } catch (error: any) {
      console.error('[name-check] failed:', error?.message || error);
      res.status(500).json({ error: 'Name check failed. Please try again.' });
    }
  });

  // ==========================================================================
  // PUBLIC: per-facility PWA manifest. When a device is tied to a facility
  // (?centre=<slug>), the install popup shows that facility's own name and
  // logo, and the installed app opens on the access-code page, never the
  // platform landing page.
  // ==========================================================================
  // PUBLIC: resolve a facility by its name slug, the value each installed
  // app's manifest start_url carries (?centre=<slug>). The app binds itself
  // to THIS facility at boot, so on a phone where every facility app shares
  // one address (and therefore one login session), each app only ever shows
  // its own facility: a signed-in account that does not belong to the bound
  // facility is signed out, and the app opens on its own welcome screen.
  app.get('/api/public/centre-by-slug', async (req, res) => {
    try {
      const slug = slugifyName(String(req.query.centre || '').trim());
      if (!slug) return res.status(400).json({ error: 'Missing facility.' });
      const snap = await adminDb.collection('centres').limit(200).get();
      const doc = snap.docs.find((d) => slugifyName(String((d.data() as any)?.name || '')) === slug);
      if (!doc) return res.status(404).json({ error: 'Facility not found.' });
      const data = doc.data() as any;
      // Batch 26: the landing-page gate is the tier, nothing else. A lead
      // (signed up, never upgraded) has no public landing page; upgrading
      // by paying for the minimum seats switches it on the same moment.
      const billingSnap = await adminDb.collection('centreBilling').doc(doc.id).get();
      const billing = billingSnap.data() || {};
      if (facilityTier(billing) === 'lead') {
        return res.json({
          locked: true,
          message: 'This facility page is not available right now. Please contact the facility admin directly.',
        });
      }
      const rawAccent = String(data.accentColor || '').trim();
      res.json({
        centreId: doc.id,
        centreName: String(data.name || '').slice(0, 60),
        accent: /^#[0-9a-fA-F]{6}$/.test(rawAccent) ? rawAccent : '',
        logoUrl: String(data.logoUrl || ''),
        // Batch 44: a facility that switched its access code off tells the
        // app here, so the gate never shows and sign-in follows the splash.
        accessCodeRequired: data.accessCodeRequired !== false,
      });
    } catch (error: any) {
      console.error('[centre-by-slug] failed:', error?.message || error);
      res.status(500).json({ error: 'Could not look up that facility. Please try again.' });
    }
  });

  // ==========================================================================
  // Batch 22: seat policy for the facility itself. Plan choice (the chosen
  // plan bills every seat the facility creates) and an on-demand run of the
  // seat-policy sweep, for testing and for a "run now" button later.
  // ==========================================================================
  app.get('/api/centre/seats/plan', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = String(req.query.centreId || '').trim().slice(0, 120);
      if (!centreId) throw httpError(400, 'centreId is required.');
      await requireMembership(caller, centreId, ['owner', 'admin']);
      const bDoc = await adminDb.collection('centreBilling').doc(centreId).get();
      const billing = (bDoc.data() || {}) as any;
      const plansSnap = await adminDb.collection('platformPlans').get();
      const plans = plansSnap.docs
        .map((d) => ({ id: d.id, name: String((d.data() as any).name || d.id), price: Number((d.data() as any).price || 0) }))
        .sort((a, b) => a.price - b.price);
      // Batch 27: everything the upgrade flow needs in one read: the paid-seat
      // minimum and how many active paid seats the facility holds (so the
      // student-count dropdown can start at the smallest valid purchase), the
      // cap, and the account facilities pay into.
      const cfg = await getPlatformConfig();
      const stats = await paidSeatStats(centreId);
      const account = await payAccount();
      // The facility's pending upgrade request, if any, drives the
      // "payment under confirmation" banner on the admin dashboard.
      let pendingUpgrade: any = null;
      try {
        const prSnap = await adminDb.collection('centreUpgradeRequests')
          .where('centreId', '==', centreId)
          .where('status', '==', 'pending')
          .get();
        const pendingDocs = prSnap.docs.sort((a, b) =>
          String((b.data() as any).createdAt || '').localeCompare(String((a.data() as any).createdAt || '')));
        if (pendingDocs.length) {
          const p = pendingDocs[0].data() as any;
          pendingUpgrade = {
            planName: String(p.planName || ''),
            seats: Number(p.seats || 0),
            total: Number(p.total || 0),
            receiptUploaded: !!p.receiptUrl,
            createdAt: String(p.createdAt || ''),
          };
        }
      } catch { /* the banner simply hides when this read fails */ }
      const cap = (cfg as any).paidSeatsUnlimited === true ? null : Math.max(1, Math.floor(Number((cfg as any).paidMaxSeats ?? 50)));
      return res.json({
        planId: String(billing.planId || ''),
        plans,
        paidSeatMinimum: Math.max(0, Math.floor(Number((cfg as any).paidSeatMinimum ?? 5))),
        activePaidSeats: stats.active,
        paidSeatsHeld: stats.total,
        paidMaxSeats: cap,
        payAccount: { name: account.name, number: account.number, bank: account.bank },
        whatsappNumber: account.whatsappNumber,
        pendingUpgrade,
      });
    } catch (error: any) {
      const status = Number(error?.status || 500);
      res.status(status).json({ error: error.message || 'Could not load plans.' });
    }
  });

  app.post('/api/centre/seats/plan', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = String(req.body?.centreId || '').trim().slice(0, 120);
      if (!centreId) throw httpError(400, 'centreId is required.');
      await requireMembership(caller, centreId, ['owner', 'admin']);
      const planId = String(req.body?.planId || '');
      await getPlatformPlan(planId); // validates the plan exists
      await adminDb.collection('centreBilling').doc(centreId).set(
        { planId, planChosenAt: new Date().toISOString() },
        { merge: true }
      );
      await adminDb.collection('auditLogs').add({
        actorUid: caller.uid,
        centreId,
        action: 'PLAN_CHOSEN',
        after: { planId },
        at: new Date().toISOString(),
      });
      return res.json({ success: true, planId });
    } catch (error: any) {
      const status = Number(error?.status || 500);
      res.status(status).json({ error: error.message || 'Could not save the plan.' });
    }
  });

  // Batch 23: the facility creates its own paid seat from the control room.
  // One seat per call; the cap and plan rules are the same ones payments use.
  app.post('/api/centre/seats/add', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = String(req.body?.centreId || '').trim().slice(0, 120);
      if (!centreId) throw httpError(400, 'centreId is required.');
      await requireMembership(caller, centreId, ['owner', 'admin']);
      const count = Math.floor(Number(req.body?.count ?? 1));
      if (!Number.isFinite(count) || count < 1 || count > 200) throw httpError(400, 'count must be between 1 and 200.');
      const result = await addSeatsForCentre(centreId, count);
      if (result.planRequired) return res.status(400).json({ error: result.message });
      if (result.underMinimum) {
        return res.status(409).json({ error: result.message, underMinimum: true, needed: result.needed, minimum: result.minimum, paidHeld: result.paidHeld });
      }
      if (result.capped) return res.status(409).json({ error: result.message });
      return res.json(result);
    } catch (error: any) {
      const status = Number(error?.status || 500);
      res.status(status).json({ error: error.message || 'Could not create the seats.' });
    }
  });

  // ==========================================================================
  // Batch 27: the upgrade flow. A facility on Free buys seats by picking a
  // plan, choosing how many students, paying by bank transfer and uploading
  // its receipt; a TOS admin confirms and the seats auto-populate. The
  // paid-seat minimum and cap are checked here and again on approval.
  // ==========================================================================
  app.post('/api/centre/seats/upgrade-request', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = String(req.body?.centreId || '').trim().slice(0, 120);
      if (!centreId) throw httpError(400, 'centreId is required.');
      await requireMembership(caller, centreId, ['owner', 'admin']);
      const centreDoc = await adminDb.collection('centres').doc(centreId).get();
      const centreName = String((centreDoc.data() as any)?.name || '');
      // The receipt comes with the request, always: a payment without proof
      // can never exist, so nothing is ever filed "awaiting confirmation"
      // before the facility uploads its receipt.
      const dataUrl = String(req.body?.receiptData || '');
      const m = /^data:(image\/(?:png|jpe?g|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
      if (!m) return res.status(400).json({ error: 'Upload your receipt as a PNG, JPG or WebP image, or a PDF.' });
      const bytes = Math.floor((m[2].length * 3) / 4);
      if (bytes > 4 * 1024 * 1024) return res.status(413).json({ error: 'The receipt can be up to 4 MB.' });
      const cloud = String(process.env.CLOUDINARY_CLOUD_NAME || '');
      const preset = String(process.env.CLOUDINARY_UPLOAD_PRESET || '');
      if (!cloud || !preset) return res.status(500).json({ error: 'Receipt hosting is not configured on this deployment.' });
      const endpoint = m[1] === 'application/pdf' ? 'raw' : 'image';
      const form = new FormData();
      form.append('upload_preset', preset);
      form.append('folder', 'tos/receipts');
      form.append('file', dataUrl);
      const resp = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/${endpoint}/upload`, { method: 'POST', body: form });
      const cd: any = await resp.json().catch(() => null);
      const receiptUrl = cd && typeof cd.secure_url === 'string' ? cd.secure_url : '';
      if (!resp.ok || !receiptUrl) return res.status(502).json({ error: 'The receipt could not be uploaded. Please try again.' });
      const result = await createUpgradeRequest({
        centreId,
        centreName,
        planId: String(req.body?.planId || ''),
        seats: Number(req.body?.seats || 0),
        receiptUrl,
        requestedByUid: caller.uid,
      });
      if (!result.ok) {
        return res.status(409).json({ error: result.error, needed: result.needed, minimum: result.minimum, active: result.active });
      }
      return res.json({ success: true, request: result.request });
    } catch (error: any) {
      const status = Number(error?.status || 500);
      res.status(status).json({ error: error.message || 'Could not file the upgrade request.' });
    }
  });

  // The payment receipt: a PNG/JPG/WebP image or a PDF, up to 4 MB. It uploads
  // straight into the request and lands on the TOS admin console.
  app.post('/api/centre/seats/upgrade-request/receipt', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = String(req.body?.centreId || '').trim().slice(0, 120);
      const requestId = String(req.body?.requestId || '').trim().slice(0, 120);
      if (!centreId || !requestId) throw httpError(400, 'A facility and a request are required.');
      await requireMembership(caller, centreId, ['owner', 'admin']);
      const rSnap = await adminDb.collection('centreUpgradeRequests').doc(requestId).get();
      if (!rSnap.exists) throw httpError(404, 'That upgrade request no longer exists.');
      const reqDoc = (rSnap.data() || {}) as any;
      if (String(reqDoc.centreId || '') !== centreId) throw httpError(403, 'That request belongs to another facility.');
      if (String(reqDoc.status || '') !== 'pending') throw httpError(409, 'That request was already handled.');
      const dataUrl = String(req.body?.data || '');
      const m = /^data:(image\/(?:png|jpe?g|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
      if (!m) return res.status(400).json({ error: 'Upload the receipt as a PNG, JPG or WebP image, or a PDF.' });
      const bytes = Math.floor((m[2].length * 3) / 4);
      if (bytes > 4 * 1024 * 1024) return res.status(413).json({ error: 'The receipt can be up to 4 MB.' });
      const cloud = String(process.env.CLOUDINARY_CLOUD_NAME || '');
      const preset = String(process.env.CLOUDINARY_UPLOAD_PRESET || '');
      if (!cloud || !preset) return res.status(500).json({ error: 'Receipt hosting is not configured on this deployment.' });
      const endpoint = m[1] === 'application/pdf' ? 'raw' : 'image';
      const form = new FormData();
      form.append('upload_preset', preset);
      form.append('folder', 'tos/receipts');
      form.append('file', dataUrl);
      const resp = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/${endpoint}/upload`, { method: 'POST', body: form });
      const data: any = await resp.json().catch(() => null);
      const url = data && typeof data.secure_url === 'string' ? data.secure_url : '';
      if (!resp.ok || !url) return res.status(502).json({ error: 'The receipt could not be uploaded. Please try again.' });
      await attachReceiptToUpgradeRequest(requestId, url, caller.uid);
      return res.json({ ok: true, url });
    } catch (error: any) {
      const status = Number(error?.status || 500);
      res.status(status).json({ error: error?.message || 'The receipt could not be uploaded.' });
    }
  });

  // Seat payment history for a facility: every seat payment made, with the
  // receipt, when it was paid and when Tutorial OS confirmed it.
  app.get('/api/centre/seats/payment-history', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = String(req.query.centreId || '').trim().slice(0, 120);
      if (!centreId) throw httpError(400, 'centreId is required.');
      await requireMembership(caller, centreId, ['owner', 'admin', 'tutor']);
      const payments = await listSeatPayments(centreId);
      return res.json({ success: true, payments });
    } catch (error: any) {
      const status = Number(error?.status || 500);
      res.status(status).json({ error: error.message || 'Could not load the seat payment history.' });
    }
  });

  app.get('/api/tos/upgrade-requests', async (req, res) => {
    try {
      requireTos(req);
      const requests = await listUpgradeRequests();
      return res.json({ requests });
    } catch (error: any) {
      const status = Number(error?.status || 500);
      res.status(status).json({ error: error.message || 'Could not load the upgrade requests.' });
    }
  });

  app.post('/api/tos/upgrade-requests/decide', async (req, res) => {
    try {
      const caller = requireTos(req);
      const requestId = String(req.body?.requestId || '').trim().slice(0, 120);
      if (!requestId) throw httpError(400, 'requestId is required.');
      const action = String(req.body?.action || '') === 'approve' ? 'approve' : 'decline';
      const result = await decideUpgradeRequest({
        requestId,
        action,
        actorUid: caller.uid,
        declineReason: String(req.body?.declineReason || ''),
      });
      return res.json({ success: true, ...result });
    } catch (error: any) {
      if (error?.message && !/server error/i.test(error.message)) {
        return res.status(409).json({ error: error.message });
      }
      const status = Number(error?.status || 500);
      res.status(status).json({ error: error.message || 'Could not record the decision.' });
    }
  });

  app.post('/api/centre/seats/sweep', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = String(req.body?.centreId || '').trim().slice(0, 120);
      if (!centreId) throw httpError(400, 'centreId is required.');
      await requireMembership(caller, centreId, ['owner', 'admin']);
      const result = await runSeatPolicySweep({ centreId });
      return res.json({ success: true, result });
    } catch (error: any) {
      const status = Number(error?.status || 500);
      res.status(status).json({ error: error.message || 'Could not run the seat sweep.' });
    }
  });

  app.get('/api/public/pwa-manifest', async (req, res) => {
    try {
      const slug = slugifyName(String(req.query.centre || '').trim());
      if (!slug) return res.status(400).json({ error: 'Missing facility.' });
      const snap = await adminDb.collection('centres').limit(200).get();
      const doc = snap.docs.find((d) => slugifyName(String((d.data() as any)?.name || '')) === slug);
      if (!doc) return res.status(404).json({ error: 'Facility not found.' });
      const name = String((doc.data() as any)?.name || 'Tutorial OS').slice(0, 60);
      const logoUrl = String((doc.data() as any)?.logoUrl || '');
      const rawAccent = String((doc.data() as any)?.accentColor || '').trim();
      const accent = /^#[0-9a-fA-F]{6}$/.test(rawAccent) ? rawAccent : '';
      const icon = (size: number, purpose: string) => {
        const m = logoUrl.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/);
        if (m) return { src: `${m[1]}w_${size},h_${size},c_pad,b_white,f_png/${m[2]}`, sizes: `${size}x${size}`, type: 'image/png', purpose };
        return { src: size <= 192 ? '/pwa-192x192.png' : '/pwa-512x512.png', sizes: `${size}x${size}`, type: 'image/png', purpose };
      };
      res.set('Content-Type', 'application/manifest+json');
      res.set('Cache-Control', 'public, max-age=300');
      res.json({
        id: `/pwa/${slug}`,
        name,
        short_name: name.slice(0, 12),
        description: `${name} on Tutorial OS.`,
        theme_color: accent || '#EA580C',
        background_color: accent || '#EA580C',
        display: 'standalone',
        // Each facility's app starts at its own address: the access-code page
        // carrying the facility, so Chrome's periodic app refresh re-reads
        // THIS facility's manifest. With two branded apps on one phone, a
        // shared start_url would let one app drift to the other's branding.
        start_url: `/?centre=${encodeURIComponent(slug)}#access`,
        scope: '/',
        icons: [icon(192, 'any'), icon(512, 'maskable')],
        related_applications: [{ platform: 'webapp', url: `/api/public/pwa-manifest?centre=${slug}`, id: `/pwa/${slug}` }],
      });
    } catch (error: any) {
      console.error('[pwa-manifest] failed:', error?.message || error);
      res.status(500).json({ error: 'Could not build the app manifest. Please try again.' });
    }
  });

  // ==========================================================================
  // PUBLIC: facility logo upload for the signup popup. A data URL in, a hosted
  // Cloudinary URL out (tos/logos), so the branding is ready before the centre
  // exists and provisionCentre can store it on the centre document.
  // ==========================================================================
  app.post('/api/public/logo-upload', async (req, res) => {
    try {
      const ip = clientIp(req);
      if (!(await countRateLimit(`logo-${ip.replace(/\W/g, '')}`, 10, 60 * 60 * 1000))) {
        return res.status(429).json({ error: 'Too many uploads. Please try again later.' });
      }
      const dataUrl = String(req.body?.data || '');
      const m = /^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
      if (!m) return res.status(400).json({ error: 'Upload a PNG, JPG or WebP image.' });
      const bytes = Math.floor((m[2].length * 3) / 4);
      if (bytes > 2 * 1024 * 1024) return res.status(413).json({ error: 'The logo can be up to 2 MB.' });
      const cloud = String(process.env.CLOUDINARY_CLOUD_NAME || '');
      const preset = String(process.env.CLOUDINARY_UPLOAD_PRESET || '');
      if (!cloud || !preset) return res.status(500).json({ error: 'Logo hosting is not configured on this deployment.' });
      const form = new FormData();
      form.append('upload_preset', preset);
      form.append('folder', 'tos/logos');
      form.append('file', dataUrl);
      const resp = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: 'POST', body: form });
      const data: any = await resp.json().catch(() => null);
      const url = data && typeof data.secure_url === 'string' ? data.secure_url : '';
      if (!resp.ok || !url) return res.status(502).json({ error: 'The logo could not be uploaded. Please try again.' });
      res.json({ ok: true, url });
    } catch (error: any) {
      console.error('[logo-upload] failed:', error?.message || error);
      res.status(500).json({ error: 'The logo could not be uploaded. Please try again.' });
    }
  });

  // ==========================================================================
  // AUTHENTICATED: image upload for profile photos and facility photos.
  // A data URL in, a hosted Cloudinary URL out (tos/profiles or tos/facility).
  // Profile photos up to 2 MB, facility photos up to 4 MB.
  // ==========================================================================
  // Cloudinary upload config for study materials (PDFs and images) uploaded by
  // tutors and centre admins. Videos are never uploaded: the tutor pastes a link.
  app.get('/api/centre/materials/upload-config', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = String(req.query.centreId || '').trim().slice(0, 120);
      if (!centreId) throw httpError(400, 'centreId is required.');
      await requireMembership(caller, centreId, ['owner', 'admin', 'tutor']);
      const cloud = String(process.env.CLOUDINARY_CLOUD_NAME || '');
      const preset = String(process.env.CLOUDINARY_UPLOAD_PRESET || '');
      if (!cloud || !preset) throw httpError(503, 'Material uploads are not configured yet.');
      res.json({ ok: true, cloud, preset, folder: 'tos/materials' });
    } catch (error: any) {
      const status = Number(error?.status || 500);
      res.status(status).json({ error: error?.message || 'Material upload config failed.' });
    }
  });

  // ==========================================================================
  // AUTHENTICATED: study-material deletion. Delete runs on the server (Admin
  // SDK) so it cannot be blocked by a stale rules release: a tutor may delete
  // only a material they uploaded, and centre admins/owners any material in
  // their centre. Centre isolation is checked on the material doc itself, so
  // one centre can never delete another centre's material.
  // ==========================================================================
  // Study-material create runs on the server (Admin SDK) so an upload reaches
  // every student of the centre even when the deployed Firestore rules release
  // is older than the app. The browser keeps its local copy either way.
  // ==========================================================================
  // AUTHENTICATED: student study-material list. Batch 45: served by the
  // server with pagination enforced HERE (10 per page, ?page= query), never
  // by slicing a full list in the browser. requireMembership checks the
  // caller really belongs to the centre they ask about, so one centre can
  // never read another centre's materials. The subject filter is applied
  // before the page is cut, so a filtered page is still a full page.
  // ==========================================================================
  app.get('/api/student/study-materials', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = String(req.query.centreId || '').trim().slice(0, 120);
      if (!centreId) throw httpError(400, 'centreId is required.');
      await requireMembership(caller, centreId);
      const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
      const limit = Math.min(50, Math.max(1, Number.parseInt(String(req.query.limit || '10'), 10) || 10));
      const subjectQ = String(req.query.subject || '').trim().toLowerCase();
      const snap = await adminDb.collection('studyMaterials').where('centreId', '==', centreId).limit(400).get();
      const all = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Record<string, any>) } as Record<string, any>))
        .sort((a, b) => String(b.uploadedAt || '').localeCompare(String(a.uploadedAt || '')));
      const rows = subjectQ && subjectQ !== 'all'
        ? all.filter((m) => String(m.subject || '').trim().toLowerCase() === subjectQ)
        : all;
      const total = rows.length;
      const paged = rows.slice((page - 1) * limit, page * limit);
      res.json({ ok: true, materials: paged, page, limit, hasMore: page * limit < total, total });
    } catch (error: any) {
      const status = Number(error?.status || 500);
      res.status(status).json({ error: error?.message || 'Study-material list failed.' });
    }
  });

  app.post('/api/centre/study-materials', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = String(req.query.centreId || req.body?.centreId || '').trim().slice(0, 120);
      const material = req.body?.material || {};
      if (!centreId) throw httpError(400, 'centreId is required.');
      await requireMembership(caller, centreId, ['owner', 'admin', 'tutor']);
      const id = String(material.id || '').trim().slice(0, 128);
      if (!id || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw httpError(400, 'A valid material id is required.');
      const title = String(material.title || '').trim().slice(0, 200);
      const subject = String(material.subject || '').trim().slice(0, 120);
      if (!title || !subject) throw httpError(400, 'Title and subject are required.');
      const membership = await requireMembership(caller, centreId, ['owner', 'admin', 'tutor']);
      const payload: Record<string, any> = {
        ...material,
        id,
        title,
        subject,
        centreId,
        uploadedAt: String(material.uploadedAt || new Date().toISOString()),
      };
      if (membership.role === 'tutor') payload.tutorId = caller.uid;
      delete payload.ownedBy;
      await adminDb.collection('studyMaterials').doc(id).set(JSON.parse(JSON.stringify(payload)));
      res.json({ ok: true, id });
    } catch (error: any) {
      const status = Number(error?.status || 500);
      res.status(status).json({ error: error?.message || 'Material upload failed.' });
    }
  });

  // Study-material edit: same server path so an edit (including a replaced
  // file list) persists for students regardless of the rules release.
  app.patch('/api/centre/study-materials/:id', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = String(req.query.centreId || req.body?.centreId || '').trim().slice(0, 120);
      const materialId = String(req.params?.id || '').trim().slice(0, 128);
      if (!centreId) throw httpError(400, 'centreId is required.');
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(materialId)) throw httpError(400, 'A valid material id is required.');
      const membership = await requireMembership(caller, centreId, ['owner', 'admin', 'tutor']);
      const ref = adminDb.collection('studyMaterials').doc(materialId);
      const snap = await ref.get();
      if (!snap.exists) throw httpError(404, 'This material no longer exists.');
      const data = snap.data() || {};
      if (String(data.centreId || '') !== centreId) throw httpError(403, 'You do not have access to this material.');
      if (membership.role === 'tutor' && String(data.tutorId || '') !== caller.uid) {
        throw httpError(403, 'You can only edit materials you uploaded.');
      }
      // Undefined values make the Admin SDK throw; strip them so a save
      // cannot fail just because an optional field was left out.
      const patch: Record<string, any> = JSON.parse(JSON.stringify(req.body?.patch || {}));
      delete patch.centreId;
      delete patch.id;
      delete patch.uploadedAt;
      if (membership.role === 'tutor') patch.tutorId = caller.uid;
      await ref.set(patch, { merge: true });
      res.json({ ok: true });
    } catch (error: any) {
      const status = Number(error?.status || 500);
      res.status(status).json({ error: error?.message || 'Material update failed.' });
    }
  });

  app.delete('/api/centre/study-materials/:id', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = String(req.query.centreId || req.body?.centreId || '').trim().slice(0, 120);
      const materialId = String(req.params?.id || '').trim().slice(0, 128);
      if (!centreId) throw httpError(400, 'centreId is required.');
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(materialId)) throw httpError(400, 'A valid material id is required.');
      const membership = await requireMembership(caller, centreId, ['owner', 'admin', 'tutor']);
      const ref = adminDb.collection('studyMaterials').doc(materialId);
      const snap = await ref.get();
      if (!snap.exists) throw httpError(404, 'This material no longer exists.');
      const data = snap.data() || {};
      if (String(data.centreId || '') !== centreId) throw httpError(403, 'You do not have access to this material.');
      if (membership.role === 'tutor' && String(data.tutorId || '') !== caller.uid) {
        throw httpError(403, 'You can only delete materials you uploaded.');
      }
      await ref.delete();
      res.json({ ok: true });
    } catch (error: any) {
      const status = Number(error?.status || 500);
      res.status(status).json({ error: error?.message || 'Material delete failed.' });
    }
  });

  // VIDEO RESOURCES (batch 41): platform-level YouTube lesson videos. The
  // videoResources collection is written ONLY here, by TOS staff routes, and
  // read through the student route below with the Admin SDK, so no Firestore
  // rules release is needed for any of this to work. One video the platform
  // admin adds once; every facility's students see the same library under
  // Learning Resources > Video classes.
  app.get('/api/tos/video-resources', async (req, res) => {
    try {
      requireTos(req);
      const snap = await adminDb.collection('videoResources').get();
      const videos = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Record<string, any>) } as Record<string, any>))
        .sort((a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || '')));
      res.json({ ok: true, videos });
    } catch (error: any) {
      const status = Number(error?.status || 500);
      res.status(status).json({ error: error?.message || 'Video list failed.' });
    }
  });

  app.post('/api/tos/video-resources', async (req, res) => {
    try {
      const caller = requireTos(req);
      const videoId = parseYoutubeId(String(req.body?.youtubeUrl || req.body?.link || ''));
      if (!videoId) throw httpError(400, 'That link is not a YouTube video link. Paste a link like https://www.youtube.com/watch?v=...');
      // Batch 42: the title field is gone. A video carries the exam types it
      // prepares students for (from the TOS exam registry), a subject and the
      // topic students see, which is now required.
      const subject = String(req.body?.subject || '').trim().slice(0, 120);
      if (!subject) throw httpError(400, 'Subject is required.');
      const examTypes = Array.isArray(req.body?.examTypes)
        ? Array.from(new Set((req.body.examTypes as any[]).map((x) => String(x).trim().toUpperCase().slice(0, 40)).filter(Boolean)))
        : [];
      if (!examTypes.length) throw httpError(400, 'Pick at least one exam type for this video.');
      const topic = String(req.body?.topic || '').trim().slice(0, 160);
      if (!topic) throw httpError(400, 'Topic is required. It is the name students see on the video.');
      const description = String(req.body?.description || '').trim().slice(0, 280);
      // One copy of each video: a repeat link is refused with a clear message.
      const dup = await adminDb.collection('videoResources').where('videoId', '==', videoId).limit(1).get();
      if (!dup.empty) throw httpError(409, 'This video is already in the library. Find it in the list and edit it instead of adding it again.');
      const id = 'vid-' + crypto.randomBytes(6).toString('hex');
      const now = new Date().toISOString();
      const payload: Record<string, any> = {
        id, subject, topic, description, examTypes, videoId,
        youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
        addedAt: now,
        addedBy: String(caller.email || caller.uid || ''),
        updatedAt: now,
      };
      await adminDb.collection('videoResources').doc(id).set(JSON.parse(JSON.stringify(payload)));
      res.json({ ok: true, id, video: payload });
    } catch (error: any) {
      const status = Number(error?.status || 500);
      res.status(status).json({ error: error?.message || 'Adding the video failed.' });
    }
  });

  app.patch('/api/tos/video-resources/:id', async (req, res) => {
    try {
      requireTos(req);
      const id = String(req.params?.id || '').trim();
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw httpError(400, 'A valid video id is required.');
      const ref = adminDb.collection('videoResources').doc(id);
      const snap = await ref.get();
      if (!snap.exists) throw httpError(404, 'This video no longer exists.');
      const patch: Record<string, any> = {};
      if (req.body?.youtubeUrl !== undefined) {
        const videoId = parseYoutubeId(String(req.body.youtubeUrl));
        if (!videoId) throw httpError(400, 'That link is not a YouTube video link.');
        patch.videoId = videoId;
        patch.youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
      }
      if (req.body?.examTypes !== undefined) {
        const examTypes = Array.isArray(req.body.examTypes)
          ? Array.from(new Set((req.body.examTypes as any[]).map((x) => String(x).trim().toUpperCase().slice(0, 40)).filter(Boolean)))
          : [];
        if (!examTypes.length) throw httpError(400, 'Pick at least one exam type for this video.');
        patch.examTypes = examTypes;
      }
      if (req.body?.subject !== undefined) {
        const subject = String(req.body.subject).trim().slice(0, 120);
        if (!subject) throw httpError(400, 'Subject cannot be empty.');
        patch.subject = subject;
      }
      if (req.body?.topic !== undefined) {
        const topic = String(req.body.topic).trim().slice(0, 160);
        if (!topic) throw httpError(400, 'Topic cannot be empty. It is the name students see on the video.');
        patch.topic = topic;
      }
      if (req.body?.description !== undefined) patch.description = String(req.body.description).trim().slice(0, 280);
      patch.updatedAt = new Date().toISOString();
      await ref.set(patch, { merge: true });
      res.json({ ok: true });
    } catch (error: any) {
      const status = Number(error?.status || 500);
      res.status(status).json({ error: error?.message || 'Video update failed.' });
    }
  });

  app.delete('/api/tos/video-resources/:id', async (req, res) => {
    try {
      requireTos(req);
      const id = String(req.params?.id || '').trim();
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw httpError(400, 'A valid video id is required.');
      await adminDb.collection('videoResources').doc(id).delete();
      res.json({ ok: true });
    } catch (error: any) {
      const status = Number(error?.status || 500);
      res.status(status).json({ error: error?.message || 'Video delete failed.' });
    }
  });

  // Student-side read: any verified caller (student, tutor or centre admin)
  // gets the same platform library, newest first, capped at 300.
  app.get('/api/student/video-resources', async (req, res) => {
    try {
      const caller = getCaller(req);
      const snap = await adminDb.collection('videoResources').get();
      const all = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Record<string, any>) } as Record<string, any>))
        .sort((a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || '')));
      // Batch 42 exam filter: a student sees the videos tagged with the exam
      // THEY are registered for. Their exam comes from the student record's
      // programme (examToRegister / programmeName, e.g. "JAMB UTME 2026"), so
      // the match is by keyword: a video tagged JAMB and WAEC shows for both,
      // a WAEC-only video stays hidden from a JAMB student. Videos without
      // exam tags (added before batch 42) and callers without an exam on
      // their profile (tutors, admins) see the whole library.
      let examStrings: string[] = [];
      let callerCentreId = '';
      try {
        const stu = await adminDb.collection('students').where('uid', '==', caller.uid).limit(20).get();
        for (const d of stu.docs) {
          const row = d.data() as Record<string, any>;
          if (!callerCentreId && row.centreId) callerCentreId = String(row.centreId);
          for (const key of ['examToRegister', 'programmeName']) {
            const v = String(row?.[key] || '').trim().toUpperCase();
            if (v && !examStrings.includes(v)) examStrings.push(v);
          }
        }
      } catch { examStrings = []; }
      // Batch 44: every facility decides whether its students ever see the
      // TOS video class library. The switch is read on this very request
      // from the centre's document, so it lands the moment the admin flips
      // it. A facility's own uploaded materials are a separate list and are
      // never touched by this switch.
      let videoClassesOff = false;
      if (callerCentreId) {
        try {
          const cs = await adminDb.collection('centres').doc(callerCentreId).get();
          videoClassesOff = cs.exists && (cs.data() as any)?.videoClassesEnabled === false;
        } catch { videoClassesOff = false; }
      }
      let hidden = 0;
      const videos = videoClassesOff ? [] : all.filter((v) => {
        const tags: string[] = Array.isArray(v.examTypes)
          ? (v.examTypes as any[]).map((x) => String(x).trim().toUpperCase()).filter(Boolean)
          : [];
        if (!tags.length) return true;
        if (!examStrings.length) return true;
        const hit = examStrings.some((s) => tags.some((t) => s.includes(t) || t.includes(s)));
        if (!hit) hidden += 1;
        return hit;
      }).slice(0, 300);
      // Batch 45: pagination is enforced HERE, on the server, never by
      // slicing in the browser. 10 lessons per page by default; the student
      // app asks for the next page when it needs it. The subject filter is
      // applied before the page is cut, so a filtered page is still a full
      // page of that subject.
      const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
      const limit = Math.min(50, Math.max(1, Number.parseInt(String(req.query.limit || '10'), 10) || 10));
      const subjectQ = String(req.query.subject || '').trim().toLowerCase();
      const rows = subjectQ && subjectQ !== 'all'
        ? videos.filter((v) => String(v.subject || '').trim().toLowerCase() === subjectQ)
        : videos;
      const total = rows.length;
      const paged = rows.slice((page - 1) * limit, page * limit);
      res.json({ ok: true, videos: paged, hidden, page, limit, hasMore: page * limit < total, total });
    } catch (error: any) {
      const status = Number(error?.status || 500);
      res.status(status).json({ error: error?.message || 'Video list failed.' });
    }
  });

  // EXAM REGISTRY (batch 42): the examinations TOS registers learning
  // resources for. Platform staff manage the list from the Learning
  // Resources tab; the first read seeds the standard Nigerian exams so the
  // picker is never empty. Students never read this list directly - their
  // programme matches against it on the student video route above.
  app.get('/api/tos/exam-types', async (req, res) => {
    try {
      requireTos(req);
      const ref = adminDb.collection('examTypes');
      let snap = await ref.get();
      if (snap.empty) {
        const now = new Date().toISOString();
        const batch = adminDb.batch();
        for (const name of ['JAMB', 'WAEC', 'NECO', 'IJMB', 'JUPEB']) {
          const id = 'exam-' + name.toLowerCase();
          // JAMB is objectives only; the essay bodies run both question forms
          // until an admin narrows them (batch 60).
          batch.set(ref.doc(id), { id, name, addedAt: now, questionType: id === 'exam-jamb' ? 'mcq' : 'both' });
        }
        await batch.commit();
        snap = await ref.get();
      }
      // Batch 60: every exam carries a question-type setting (mcq, theory or
      // both). Older docs predate the field, so backfill it on read: JAMB is
      // objectives only, every other exam runs both forms until narrowed.
      const missingType = snap.docs.filter((d) => !['mcq', 'theory', 'both'].includes(String((d.data() as any)?.questionType || '')));
      if (missingType.length) {
        const fix = adminDb.batch();
        for (const d of missingType) {
          fix.set(d.ref, { questionType: d.id === 'exam-jamb' ? 'mcq' : 'both' }, { merge: true });
        }
        await fix.commit();
      }
      const exams = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Record<string, any>) } as Record<string, any>))
        .map((e: Record<string, any>) => ({ ...e, questionType: ['mcq', 'theory', 'both'].includes(String(e.questionType || '')) ? String(e.questionType) : (String(e.id) === 'exam-jamb' ? 'mcq' : 'both') }))
        .sort((a: Record<string, any>, b: Record<string, any>) => String(a.name || '').localeCompare(String(b.name || '')));
      res.json({ ok: true, exams });
    } catch (error: any) {
      const status = Number(error?.status || 500);
      res.status(status).json({ error: error?.message || 'Exam list failed.' });
    }
  });

  app.post('/api/tos/exam-types', async (req, res) => {
    try {
      const caller = requireTos(req);
      const name = String(req.body?.name || '').trim().slice(0, 24);
      if (!name) throw httpError(400, 'Type the exam name to register.');
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const id = slug ? 'exam-' + slug : 'exam-' + crypto.randomBytes(4).toString('hex');
      const dup = await adminDb.collection('examTypes').doc(id).get();
      if (dup.exists) throw httpError(409, 'That exam is already registered.');
      const qType = String(req.body?.questionType || 'mcq').trim().toLowerCase();
      if (!['mcq', 'theory', 'both'].includes(qType)) throw httpError(400, 'Question type must be mcq, theory or both.');
      const now = new Date().toISOString();
      const payload = { id, name, addedAt: now, addedBy: String(caller.email || caller.uid || ''), questionType: qType };
      await adminDb.collection('examTypes').doc(id).set(payload);
      res.json({ ok: true, exam: payload });
    } catch (error: any) {
      const status = Number(error?.status || 500);
      res.status(status).json({ error: error?.message || 'Registering the exam failed.' });
    }
  });

  // Batch 60: change an exam's question form. The name is immutable because
  // question bank and mock documents key their exam tags on the normalised
  // name; renaming would orphan every tagged question.
  app.patch('/api/tos/exam-types/:id', async (req, res) => {
    try {
      requireTos(req);
      const id = String(req.params?.id || '').trim();
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw httpError(400, 'A valid exam id is required.');
      const qType = String(req.body?.questionType || '').trim().toLowerCase();
      if (!['mcq', 'theory', 'both'].includes(qType)) throw httpError(400, 'Question type must be mcq, theory or both.');
      const ref = adminDb.collection('examTypes').doc(id);
      const snap = await ref.get();
      if (!snap.exists) throw httpError(404, 'That exam is not registered.');
      await ref.set({ questionType: qType, updatedAt: new Date().toISOString() }, { merge: true });
      res.json({ ok: true, exam: { id, ...(snap.data() as Record<string, any>), questionType: qType } });
    } catch (error: any) {
      const status = Number(error?.status || 500);
      res.status(status).json({ error: error?.message || 'Updating the exam failed.' });
    }
  });

  app.delete('/api/tos/exam-types/:id', async (req, res) => {
    try {
      requireTos(req);
      const id = String(req.params?.id || '').trim();
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw httpError(400, 'A valid exam id is required.');
      await adminDb.collection('examTypes').doc(id).delete();
      res.json({ ok: true });
    } catch (error: any) {
      const status = Number(error?.status || 500);
      res.status(status).json({ error: error?.message || 'Removing the exam failed.' });
    }
  });

  // FACILITY TYPE REGISTRY (batch 54): the kinds of education facility TOS
  // serves and the exam programmes each one prepares students for. Platform
  // staff manage the list from the console's System tab; the signup flow's
  // Type-of-facility dropdown and its exam pre-selection read it live through
  // the public route below, so an edit here changes what new owners see the
  // next time the form opens. The first read seeds the six launch kinds so
  // the dropdown is never empty. Server-only collection (facilityTypes); the
  // public side only reads, so no Firestore rules release is needed.
  const FACILITY_TYPE_SEEDS: Array<{ name: string; exams: string[] }> = [
    { name: 'Tutorial centre', exams: ['JAMB', 'WAEC', 'NECO'] },
    { name: 'School', exams: ['WAEC', 'NECO'] },
    { name: 'A-level centre', exams: ['IJMB', 'JUPEB'] },
    { name: 'Adult education centre', exams: ['WAEC', 'NECO'] },
    { name: 'Bridge programmes', exams: ['JAMB', 'IJMB', 'JUPEB'] },
    { name: 'Professional exam centre', exams: [] },
  ];

  const listFacilityTypes = async () => {
    const ref = adminDb.collection('facilityTypes');
    let snap = await ref.get();
    if (snap.empty) {
      const now = new Date().toISOString();
      const batch = adminDb.batch();
      for (const seed of FACILITY_TYPE_SEEDS) {
        const slug = seed.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        const id = 'ftype-' + slug;
        batch.set(ref.doc(id), { id, name: seed.name, exams: seed.exams, addedAt: now });
      }
      await batch.commit();
      snap = await ref.get();
    }
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Record<string, any>) } as Record<string, any>))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  };

  // Exams arrive as an array or a comma-separated string; they are stored
  // uppercase and deduplicated, capped at 8, because that is what the exam
  // chips and question-bank tags compare against.
  const sanitizeFacilityExams = (raw: any): string[] => {
    const list = Array.isArray(raw) ? raw : String(raw || '').split(',');
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of list) {
      const name = String(item || '').trim().toUpperCase().slice(0, 24);
      if (name && !seen.has(name)) { seen.add(name); out.push(name); }
      if (out.length >= 8) break;
    }
    return out;
  };

  // Public read for the signup form: the dropdown lists these kinds and
  // picking one pre-selects its exams. Rate limited like the other public
  // routes; it writes nothing except the one-time seed above.
  app.get('/api/public/facility-types', async (req, res) => {
    try {
      const ip = clientIp(req);
      if (!(await countRateLimit(`ftypes-${ip.replace(/\W/g, '')}`, 60, 60 * 60 * 1000))) {
        return res.status(429).json({ error: 'Too many requests. Please try again later.' });
      }
      const types = await listFacilityTypes();
      res.set('Cache-Control', 'no-store');
      res.json({ ok: true, types: types.map((t) => ({ id: t.id, name: t.name, exams: Array.isArray(t.exams) ? t.exams : [] })) });
    } catch (error: any) {
      res.status(Number(error?.status || 500)).json({ error: error?.message || 'Facility type list failed.' });
    }
  });

  app.get('/api/tos/facility-types', async (req, res) => {
    try {
      requireTos(req);
      const types = await listFacilityTypes();
      res.json({ ok: true, types });
    } catch (error: any) {
      const status = Number(error?.status || 500);
      res.status(status).json({ error: error?.message || 'Facility type list failed.' });
    }
  });

  app.post('/api/tos/facility-types', async (req, res) => {
    try {
      const caller = requireTos(req);
      const name = String(req.body?.name || '').trim().slice(0, 60);
      if (!name) throw httpError(400, 'Type the facility kind to add.');
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const id = slug ? 'ftype-' + slug.slice(0, 48) : 'ftype-' + crypto.randomBytes(4).toString('hex');
      const dup = await adminDb.collection('facilityTypes').doc(id).get();
      if (dup.exists) throw httpError(409, 'That facility kind is already registered.');
      const now = new Date().toISOString();
      const payload = { id, name, exams: sanitizeFacilityExams(req.body?.exams), addedAt: now, addedBy: String(caller.email || caller.uid || '') };
      await adminDb.collection('facilityTypes').doc(id).set(payload);
      res.json({ ok: true, type: payload });
    } catch (error: any) {
      const status = Number(error?.status || 500);
      res.status(status).json({ error: error?.message || 'Adding the facility kind failed.' });
    }
  });

  app.patch('/api/tos/facility-types/:id', async (req, res) => {
    try {
      requireTos(req);
      const id = String(req.params?.id || '').trim();
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw httpError(400, 'A valid facility kind id is required.');
      const ref = adminDb.collection('facilityTypes').doc(id);
      const doc = await ref.get();
      if (!doc.exists) throw httpError(404, 'That facility kind no longer exists.');
      const patch: Record<string, any> = {};
      if (req.body?.name !== undefined) {
        const name = String(req.body.name || '').trim().slice(0, 60);
        if (!name) throw httpError(400, 'Type the facility kind name.');
        patch.name = name;
      }
      if (req.body?.exams !== undefined) patch.exams = sanitizeFacilityExams(req.body.exams);
      if (Object.keys(patch).length) await ref.set(patch, { merge: true });
      const after = await ref.get();
      res.json({ ok: true, type: { id, ...(after.data() as Record<string, any>) } });
    } catch (error: any) {
      const status = Number(error?.status || 500);
      res.status(status).json({ error: error?.message || 'Saving the facility kind failed.' });
    }
  });

  app.delete('/api/tos/facility-types/:id', async (req, res) => {
    try {
      requireTos(req);
      const id = String(req.params?.id || '').trim();
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw httpError(400, 'A valid facility kind id is required.');
      await adminDb.collection('facilityTypes').doc(id).delete();
      res.json({ ok: true });
    } catch (error: any) {
      const status = Number(error?.status || 500);
      res.status(status).json({ error: error?.message || 'Removing the facility kind failed.' });
    }
  });

  app.post('/api/centre/profile-image', async (req, res) => {
    try {
      const caller = getCaller(req);
      const kind = String(req.body?.kind || 'profile');
      // kind 'logo' is the facility's single logo image: besides uploading it
      // to Cloudinary it stores the hosted URL on the centre document, the
      // same place the signup puts it, so the facility landing page, the app
      // manifest and the app install page all pick the new logo up.
      const isLogo = kind === 'logo';
      const isWelcome = kind === 'welcome-image';
      const centreId = String(req.body?.centreId || '');
      if (isLogo || isWelcome) {
        if (!/^[a-zA-Z0-9_-]{3,160}$/.test(centreId)) return res.status(400).json({ error: 'A valid facility id is required.' });
        await requireMembership(caller, centreId, ['owner']);
      }
      const maxBytes = kind === 'facility' || isWelcome ? 4 * 1024 * 1024 : 2 * 1024 * 1024;
      const folder = kind === 'facility' ? 'tos/facility' : isLogo ? 'tos/logos' : isWelcome ? 'tos/welcome' : 'tos/profiles';
      const ip = clientIp(req);
      if (!(await countRateLimit(`img-${ip.replace(/\W/g, '')}`, 40, 60 * 60 * 1000))) {
        return res.status(429).json({ error: 'Too many uploads. Please try again later.' });
      }
      const dataUrl = String(req.body?.data || '');
      if ((isLogo || isWelcome) && req.body?.remove === true) {
        await adminDb.collection('centres').doc(centreId).set(isWelcome ? { welcomeImageUrl: '' } : { logoUrl: '' }, { merge: true });
        await audit({ actorUid: caller.uid, centreId, action: isWelcome ? 'FACILITY_WELCOME_IMAGE_REMOVED' : 'FACILITY_LOGO_REMOVED', before: null, after: null });
        return res.json({ ok: true, url: '' });
      }
      const m = /^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
      if (!m) return res.status(400).json({ error: 'Upload a PNG, JPG or WebP image.' });
      const bytes = Math.floor((m[2].length * 3) / 4);
      if (bytes > maxBytes) {
        return res.status(413).json({ error: kind === 'facility' ? 'Each facility photo can be up to 4 MB.' : 'The image can be up to 2 MB.' });
      }
      const cloud = String(process.env.CLOUDINARY_CLOUD_NAME || '');
      const preset = String(process.env.CLOUDINARY_UPLOAD_PRESET || '');
      if (!cloud || !preset) return res.status(500).json({ error: 'Image hosting is not configured on this deployment.' });
      const form = new FormData();
      form.append('upload_preset', preset);
      form.append('folder', folder);
      form.append('file', dataUrl);
      const resp = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: 'POST', body: form });
      const data: any = await resp.json().catch(() => null);
      const url = data && typeof data.secure_url === 'string' ? data.secure_url : '';
      if (!resp.ok || !url) return res.status(502).json({ error: 'The image could not be uploaded. Please try again.' });
      if (isLogo || isWelcome) {
        await adminDb.collection('centres').doc(centreId).set(isWelcome ? { welcomeImageUrl: url } : { logoUrl: url }, { merge: true });
        await audit({ actorUid: caller.uid, centreId, action: isWelcome ? 'FACILITY_WELCOME_IMAGE_UPDATED' : 'FACILITY_LOGO_UPDATED', before: null, after: isWelcome ? { welcomeImageUrl: url } : { logoUrl: url } });
      }
      res.json({ ok: true, url });
    } catch (error: any) {
      console.error('[profile-image] failed:', error?.message || error);
      res.status(error?.status || 500).json({ error: error?.message || 'The image could not be uploaded.' });
    }
  });

  // ADMIN: the facility's current logo, so the settings page can show what is
  // live before the admin uploads a replacement.
  app.get('/api/centre/branding-logo', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = String(req.query.centreId || '');
      if (!/^[a-zA-Z0-9_-]{3,160}$/.test(centreId)) return res.status(400).json({ error: 'A valid facility id is required.' });
      await requireMembership(caller, centreId, ['owner']);
      const snap = await adminDb.collection('centres').doc(centreId).get();
      res.json({ ok: true, logoUrl: String((snap.data() as any)?.logoUrl || ''), welcomeImageUrl: String((snap.data() as any)?.welcomeImageUrl || ''), accentColor: String((snap.data() as any)?.accentColor || '') });
    } catch (error: any) {
      console.error('[branding-logo] failed:', error?.message || error);
      res.status(error?.status || 500).json({ error: error?.message || 'Could not load the facility logo.' });
    }
  });

  // ==========================================================================
  // AUTHENTICATED: real device session tracking. Every signed-in device
  // registers itself (one doc per user + device), pings its last-active time,
  // and honours the account's own expiry setting (0 = never expires).
  // ==========================================================================
  app.post('/api/centre/session-ping', async (req, res) => {
    try {
      const caller = getCaller(req);
      const key = String(req.body?.deviceKey || '').replace(/[^\w-]/g, '').slice(0, 64);
      if (!key) return res.status(400).json({ error: 'Missing device key.' });
      const ref = adminDb.collection('adminSessions').doc(`${caller.uid}__${key}`);
      const adminSnap = await adminDb.collection('admins').doc(caller.uid).get();
      const admin = (adminSnap.data() || {}) as any;
      const now = Date.now();
      const expiryDays = Number(admin.sessionExpiryDays || 0);
      const snap = await ref.get();
      const existing = (snap.data() || {}) as any;
      if (existing.revoked) return res.json({ revoked: true });
      const freshFlag = req.body?.fresh === true;
      const loginAt = freshFlag ? now : (typeof existing.loginAt === 'number' && existing.loginAt > 0 ? existing.loginAt : now);
      if (expiryDays > 0 && now - loginAt > expiryDays * DAY_MS) {
        await ref.set({ ...existing, uid: caller.uid, loginAt, lastActiveAt: now, revoked: true, revokedAt: now, revokeReason: 'expired' }, { merge: true });
        return res.json({ expired: true });
      }
      await ref.set({
        uid: caller.uid,
        email: caller.email || admin.email || '',
        name: admin.name || '',
        role: admin.role || '',
        centreId: admin.centreId || '',
        deviceKey: key,
        ua: String(req.headers['user-agent'] || '').slice(0, 300),
        ip: clientIp(req),
        loginAt,
        lastActiveAt: now,
        revoked: false,
      }, { merge: true });
      res.json({ ok: true });
    } catch (error: any) {
      console.error('[session-ping] failed:', error?.message || error);
      res.status(error?.status || 500).json({ error: error?.message || 'Session check failed.' });
    }
  });

  app.get('/api/centre/sessions', async (req, res) => {
    try {
      const caller = getCaller(req);
      const current = String(req.query.device || '').replace(/[^\w-]/g, '').slice(0, 64);
      const snap = await adminDb.collection('adminSessions').where('uid', '==', caller.uid).get();
      const sessions = snap.docs
        .map((d) => {
          const v = d.data() as any;
          return {
            id: d.id,
            device: describeDevice(String(v.ua || '')),
            ip: String(v.ip || ''),
            loginAt: Number(v.loginAt || 0),
            lastActiveAt: Number(v.lastActiveAt || 0),
            revoked: !!v.revoked,
            current: current ? d.id.endsWith(`__${current}`) : false,
          };
        })
        .sort((a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0) || b.lastActiveAt - a.lastActiveAt);
      res.json({ ok: true, sessions });
    } catch (error: any) {
      res.status(error?.status || 500).json({ error: error?.message || 'Could not load sessions.' });
    }
  });

  app.post('/api/centre/sessions/revoke', async (req, res) => {
    try {
      const caller = getCaller(req);
      const id = String(req.body?.id || '');
      const ref = adminDb.collection('adminSessions').doc(id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'Session not found.' });
      if (String((snap.data() as any).uid || '') !== caller.uid) return res.status(403).json({ error: 'That session belongs to another account.' });
      await ref.set({ revoked: true, revokedAt: Date.now(), revokeReason: 'user' }, { merge: true });
      res.json({ ok: true });
    } catch (error: any) {
      res.status(error?.status || 500).json({ error: error?.message || 'Could not revoke the session.' });
    }
  });

  // ==========================================================================
  // PLATFORM: the app-only-portals switch. Public read (portals need it
  // before sign-in); writes go through TOS staff only.
  // ==========================================================================
  let platformSettingsCache: { at: number; value: { appOnlyPortals: boolean } } | null = null;
  app.get('/api/public/platform-settings', async (req, res) => {
    try {
      if (platformSettingsCache && Date.now() - platformSettingsCache.at < 15 * 1000) {
        return res.json(platformSettingsCache.value);
      }
      const snap = await adminDb.collection('platformSettings').doc('global').get();
      const value = { appOnlyPortals: !!(snap.data() as any)?.appOnlyPortals };
      platformSettingsCache = { at: Date.now(), value };
      res.set('Cache-Control', 'public, max-age=30');
      res.json(value);
    } catch (error: any) {
      console.error('[platform-settings] failed:', error?.message || error);
      res.json({ appOnlyPortals: false });
    }
  });

  app.post('/api/tos/platform-settings', async (req, res) => {
    try {
      const caller = requireTos(req);
      const enabled = req.body?.appOnlyPortals === true;
      await adminDb.collection('platformSettings').doc('global').set({
        appOnlyPortals: enabled,
        updatedAt: Date.now(),
        updatedBy: caller.uid,
      });
      platformSettingsCache = { at: Date.now(), value: { appOnlyPortals: enabled } };
      await audit({ actorUid: caller.uid, centreId: '', action: 'PLATFORM_SETTING_CHANGED', before: null, after: { appOnlyPortals: enabled } });
      res.json({ ok: true, appOnlyPortals: enabled });
    } catch (error: any) {
      res.status(error?.status || 500).json({ error: error?.message || 'Could not save the setting.' });
    }
  });

  // ==========================================================================
  // PUBLIC: self-serve trial. "Start my free trial" provisions the centre and
  // its owner on the spot and emails the welcome pack (access code, temporary
  // password, the centre's own sign-in link). No email-verification hop: the
  // credentials themselves are the verification, and a mistyped address
  // simply receives nothing. The same one-trial-per-person duplicate check
  // that provisioning applies keeps this endpoint from being farmed.
  // ==========================================================================
  app.post('/api/public/trial', async (req, res) => {
    try {
      const ip = clientIp(req);
      if (!(await countRateLimit(`ip-${ip.replace(/\W/g, '')}`, 20, 60 * 60 * 1000))) {
        return res.status(429).json({ error: 'Too many requests. Please try again later.' });
      }
      const checked = validateLeadBody(req.body);
      if (typeof checked === 'string') return res.status(400).json({ error: checked });
      if (!(await verifyCaptcha(req.body.captchaToken))) {
        return res.status(400).json({ error: 'Captcha verification failed. Please try again.' });
      }
      if (!(await countRateLimit(`email-${checked.email.replace(/\W/g, '')}`, 5, 60 * 60 * 1000))) {
        return res.status(429).json({ error: 'Too many requests for this email. Please try again later.' });
      }
      const result = await provisionCentre({
        fullName: checked.fullName,
        businessName: checked.businessName,
        email: checked.email,
        phone: checked.phone,
        studentCount: checked.studentCount,
        state: checked.state,
        city: checked.city,
        address: typeof req.body.address === 'string' ? String(req.body.address).trim().slice(0, 200) : '',
        logoUrl: typeof req.body.logoUrl === 'string' && /^https:\/\//.test(String(req.body.logoUrl)) ? String(req.body.logoUrl).trim() : '',
        teacherCount: typeof req.body.teacherCount === 'string' ? String(req.body.teacherCount).trim().slice(0, 20) : '',
        examTypes: Array.isArray(checked.examTypes) ? checked.examTypes.filter(Boolean) : [],
        facilityType: typeof req.body.facilityType === 'string' ? String(req.body.facilityType).trim().slice(0, 60) : '',
        accentColor: checked.accentColor,
        skipTrial: checked.skipTrial === true,
        source: 'lead',
        actorUid: 'public:trial-form',
        appBaseUrl: baseUrl(req),
      });
      await adminDb.collection('leads').add({
        ...checked,
        status: 'trial_started',
        centreId: result.centreId,
        welcomeDelivered: result.welcomeDelivered,
        createdAt: new Date().toISOString(),
      });
      await audit({
        actorUid: 'public:trial-form',
        action: 'TRIAL_STARTED',
        after: {
          centreId: result.centreId,
          email: checked.email,
          businessName: checked.businessName,
          welcomeDelivered: result.welcomeDelivered,
        },
      });
      res.json({ success: true, emailDelivered: result.welcomeDelivered });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[trial] start failed:', error?.message || error);
      res.status(500).json({ error: 'Could not start your trial. Please try again.' });
    }
  });

  // ==========================================================================
  // PUBLIC: email delivery test trigger (user-requested, 2026-11-13). A small
  // self-serve tool on the landing page: sends the ONE registered ZeptoMail
  // template (the welcome/login-details template) to an address the owner
  // types, so delivery can be checked without provisioning another trial
  // account. Guardrails: the endpoint is dead unless ZEPTOMAIL_TEST_TRIGGER
  // is "on" in the environment; per-IP and per-address rate limits; the
  // template key lives in the environment and is never logged; the merge
  // values are fixed sample data, so no real credentials flow through it.
  // Switch the env var off when testing is done.
  // ==========================================================================
  app.post('/api/public/email-test', async (req, res) => {
    if ((process.env.ZEPTOMAIL_TEST_TRIGGER || '').trim().toLowerCase() !== 'on') {
      return res.status(403).json({ error: 'The email test trigger is switched off.' });
    }
    try {
      const body = (req.body || {}) as Record<string, unknown>;
      const to = String(body.email || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || to.length > 200) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
      }
      const ip = clientIp(req);
      if (!(await countRateLimit(`emailtest-ip-${ip.replace(/\W/g, '')}`, 10, 60 * 60 * 1000))) {
        return res.status(429).json({ error: 'Too many requests. Please try again later.' });
      }
      if (!(await countRateLimit(`emailtest-to-${to.replace(/\W/g, '').toLowerCase()}`, 5, 60 * 60 * 1000))) {
        return res.status(429).json({ error: 'Too many test emails to this address. Please try again later.' });
      }
      // Fixed sample values so the template renders fully. Never a real
      // credential; login_email is the recipient's own address so the mail
      // reads sensibly when it lands.
      const result = await sendEmail({
        to,
        subject: 'Tutorial OS delivery test (welcome template)',
        html: '<p>Tutorial OS email delivery test: the welcome template. If you can read this, delivery works.</p>',
        text: 'Tutorial OS email delivery test: the welcome template. If you can read this, delivery works.',
        mergeFields: {
          full_name: 'Test Trigger',
          centre_name: 'TOS Test Facility',
          access_code: '123456',
          login_email: to,
          temp_password: 'Test-1234',
          sign_in_url: `${baseUrl(req)}/c/test-trigger`,
          app_url: 'https://tutorialos.com/app',
          whatsapp_url: 'https://chat.whatsapp.com/CfaN0Rt2J9IFZLsBkUUS2N?s=cl&p=a&iam=2',
        },
      });
      console.log(`[email-test] welcome template to ${to}: delivered=${result.delivered}${result.error ? ' error=' + result.error : ''}`);
      res.json({ success: result.delivered, delivered: result.delivered, error: result.error });
    } catch (error: any) {
      console.error('[email-test] failed:', error?.message || error);
      res.status(500).json({ error: 'Could not send the test email. Please try again.' });
    }
  });

  // ==========================================================================
  // PUBLIC: centre lookup by access code. The code is a centre selector, not
  // a secret: it reveals only the centre's own name before sign-in, and
  // sign-in plus membership still gate every piece of centre data.
  // ==========================================================================
  app.get('/api/public/centre-by-code', async (req, res) => {
    try {
      const code = String(req.query.code || '').trim();
      if (!/^\d{6}$/.test(code)) {
        return res.status(400).json({ error: 'Enter the 6-digit facility code.' });
      }
      const ip = clientIp(req);
      if (!(await countRateLimit(`code-lookup-${ip.replace(/\W/g, '')}`, 60, 15 * 60 * 1000))) {
        return res.status(429).json({ error: 'Too many lookups. Please try again shortly.' });
      }
      let centreId: string | null = null;
      const codeDoc = await adminDb.collection('accessCodes').doc(code).get();
      if (codeDoc.exists) centreId = codeDoc.data()?.centreId || null;
      if (!centreId) {
        // Codes set by hand on the centre document (as text or as a number).
        let snap = await adminDb.collection('centres').where('accessCode', '==', code).limit(2).get();
        if (snap.empty) {
          snap = await adminDb.collection('centres').where('accessCode', '==', Number(code)).limit(2).get();
        }
        const matches = snap.docs.filter((d) => String((d.data() as any)?.accessCode) === code);
        if (matches.length === 1) centreId = matches[0].id;
      }
      if (!centreId) {
        return res.status(404).json({ error: 'That code did not match any facility. Check it and try again.' });
      }
      const cDoc = await adminDb.collection('centres').doc(centreId).get();
      if (!cDoc.exists) {
        return res.status(404).json({ error: 'That code did not match any facility. Check it and try again.' });
      }
      const c = cDoc.data() as any;
      res.json({
        centreId,
        centreName: c.name || 'Education facility',
        logoUrl: typeof c.logoUrl === 'string' ? c.logoUrl : '',
        accentColor: typeof c.accentColor === 'string' ? c.accentColor : '',
        suspended: c.status === 'suspended' || c.status === 'closed',
        welcomeImageUrl: typeof c.welcomeImageUrl === 'string' ? c.welcomeImageUrl : '',
      });
    } catch (error: any) {
      console.error('[facility-by-code] lookup failed:', error?.message || error);
      res.status(500).json({ error: 'Could not look up that code. Please try again.' });
    }
  });

  // ==========================================================================
  // PUBLIC: current published question-bank pointer for the student practice
  // screen. Returns only where the public Cloudinary file lives; the bank
  // file itself is fetched straight from the CDN, so student practice costs
  // zero Firestore reads. The pointer read is cached server-side for the
  // same reason. No centre, student or result data is exposed here.
  // ==========================================================================
  app.get('/api/public/questionbank/current', async (req, res) => {
    // MB1 decision: only the practice bank has a public file. The mock bank
    // publishes nothing public, so no mock pointer is ever served here.
    const kindRaw = String(req.query.kind || 'practice').trim().toLowerCase();
    if (kindRaw !== 'practice') {
      return res.status(400).json({ error: 'Only the practice bank has a public file. Mock papers are private.' });
    }
    const cached = qbPointerCache.get(kindRaw);
    if (cached && Date.now() - cached.at < QB_POINTER_TTL_MS) {
      return res.json(cached.value);
    }
    try {
      const doc = await adminDb.collection('qbMeta').doc(kindRaw).get();
      const d = (doc.data() || {}) as any;
      const value = doc.exists && d.currentFileUrl
        ? {
            version: Number(d.currentVersion) || 0,
            fileUrl: String(d.currentFileUrl),
            publishedAt: String(d.currentPublishedAt || ''),
            liveCount: Number(d.liveCount) || 0,
            subjects: d.bySubject && typeof d.bySubject === 'object' ? d.bySubject : {},
          }
        : { version: 0 };
      qbPointerCache.set(kindRaw, { at: Date.now(), value });
      res.json(value);
    } catch (error: any) {
      console.error('[public/questionbank/current] failed:', error?.message || error);
      if (cached) return res.json(cached.value);
      res.status(500).json({ error: 'Could not load the question bank pointer. Please try again.' });
    }
  });

  app.get('/api/public/leads/verify', async (req, res) => {
    const token = String(req.query.token || '');
    const fail = (hash: string) => res.redirect(302, `${baseUrl(req)}/#${hash}`);
    if (!token) return fail('lead-invalid');
    try {
      const snap = await adminDb.collection('leads').where('verifyToken', '==', token).limit(1).get();
      if (snap.empty) return fail('lead-invalid');
      const leadDoc = snap.docs[0];
      const lead = leadDoc.data() as any;
      if (lead.status !== 'unverified') return fail('lead-welcome');
      if (lead.verifyExpiresAt && new Date(lead.verifyExpiresAt).getTime() < Date.now()) {
        await leadDoc.ref.update({ status: 'expired' });
        await audit({ actorUid: 'public:lead-verify', action: 'LEAD_EXPIRED', after: { leadId: leadDoc.id } });
        return fail('lead-expired');
      }
      if (!emailProviderConfigured()) {
        // No email provider: do not provision unattended (the temporary
        // password could not be delivered). TOS provisions from the portal
        // and shows the login details once.
        await leadDoc.ref.update({ status: 'verified', verifiedAt: new Date().toISOString() });
        return fail('lead-pending');
      }
      try {
        const result = await provisionCentre({
          fullName: lead.fullName,
          businessName: lead.businessName,
          email: lead.email,
          phone: lead.phone,
          studentCount: lead.studentCount,
          state: lead.state,
          city: lead.city,
          examTypes: lead.examTypes || [],
          skipTrial: lead.skipTrial === true,
          source: 'lead',
          actorUid: 'system:lead-verify',
        });
        await leadDoc.ref.update({
          status: 'provisioned',
          provisionedAt: new Date().toISOString(),
          centreId: result.centreId,
          credentialsNotDelivered: result.credentialsNotDelivered,
        });
        return fail('lead-welcome');
      } catch (err: any) {
        if (err?.status === 409) {
          await leadDoc.ref.update({ status: 'duplicate', notedAt: new Date().toISOString() });
          await audit({ actorUid: 'public:lead-verify', action: 'LEAD_DUPLICATE', after: { leadId: leadDoc.id, email: lead.email } });
          return fail('lead-duplicate');
        }
        throw err;
      }
    } catch (error: any) {
      console.error('[leads] verify failed:', error?.message || error);
      return fail('lead-invalid');
    }
  });

  // ==========================================================================
  // AUTH: first-login completion (Prompt C Part C)
  // ==========================================================================
  // ---- Student email OTP (registration confirmation) ----
  // Public prefix: these run before any sign-in exists.
  // Codes live server-side only; clients never read the collection. Six
  // digits, ten minutes, five wrong attempts burn the code.
  // The facility's registered programmes, for the student signup step pages:
  // exam options come from what the facility actually offers, and so do the
  // subject lists per exam. Only Active programmes are returned.
  app.get('/api/public/programmes', async (req, res) => {
    const centreId = String(req.query.centreId || '').trim();
    if (!centreId) return res.status(400).json({ error: 'centreId is required.' });
    try {
      // The installed app and the signup flow carry the facility's name slug
      // (?centre=godzilla) while programme records are keyed to the centre's
      // document id. Resolve the slug to the document id when the value is not
      // already one, so the facility's own programmes load either way.
      let resolvedCentreId = centreId;
      const centreDoc = await adminDb.collection('centres').doc(centreId).get().catch(() => null);
      if (!centreDoc || !centreDoc.exists) {
        const centresSnap = await adminDb.collection('centres').limit(200).get();
        const doc = centresSnap.docs.find(
          (d) => slugifyName(String((d.data() as any)?.name || '')) === slugifyName(centreId)
        );
        if (doc) resolvedCentreId = doc.id;
      }
      const snap = await adminDb.collection('programmes').where('centreId', '==', resolvedCentreId).get();
      const programmes = snap.docs
        .map((d) => d.data() as any)
        .filter((p) => p.status === 'Active')
        .map((p) => ({
          name: String(p.name || ''),
          category: String(p.category || ''),
          subjects: Array.isArray(p.subjects) ? p.subjects.map((s: any) => String(s)) : [],
        }));
      res.json({ programmes });
    } catch {
      res.status(500).json({ error: 'Could not load the facility programmes.' });
    }
  });

  // The facility's registered subjects, for the student signup step pages:
  // the subject picker lists only what the facility itself registered in the
  // Subjects Manager, each tagged with the department it belongs to.
  app.get('/api/public/subjects', async (req, res) => {
    const centreId = String(req.query.centreId || '').trim();
    if (!centreId) return res.status(400).json({ error: 'centreId is required.' });
    try {
      const snap = await adminDb.collection('subjects').where('centreId', '==', centreId).get();
      const subjects = snap.docs
        .map((d) => d.data() as any)
        .map((s) => ({ name: String(s.name || ''), department: String(s.department || 'General') }))
        .filter((s) => s.name);
      res.json({ subjects });
    } catch {
      res.status(500).json({ error: 'Could not load the facility subjects.' });
    }
  });

  // Server-side username availability for the student signup form.
  app.get('/api/public/username-check', async (req, res) => {
    const u = String(req.query.u || '').trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{2,19}$/.test(u)) return res.json({ available: false, invalid: true });
    const snap = await adminDb.collection('usernames').doc(u).get().catch(() => null);
    res.json({ available: !snap || !snap.exists });
  });

  // Reserve a username once the account exists: first writer wins.
  app.post('/api/public/reserve-username', async (req, res) => {
    const u = String(req.body?.username || '').trim().toLowerCase();
    const uid = String(req.body?.uid || '').trim();
    const centreId = String(req.body?.centreId || '').trim();
    if (!/^[a-z][a-z0-9_]{2,19}$/.test(u) || !uid) {
      return res.status(400).json({ error: 'A valid username and account are required.' });
    }
    const ref = adminDb.collection('usernames').doc(u);
    try {
      await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists) throw new Error('taken');
        tx.set(ref, { username: u, uid, centreId, createdAt: new Date().toISOString() });
      });
      res.json({ success: true });
    } catch {
      res.status(409).json({ error: 'That username has just been taken. Choose another one.' });
    }
  });

  app.post('/api/public/send-otp', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const centreName = String(req.body?.centreName || 'your centre').trim().slice(0, 80) || 'your centre';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }
    const ref = adminDb.collection('otpCodes').doc(email);
    const existing = await ref.get().catch(() => null);
    const prev: any = existing && existing.exists ? existing.data() : null;
    // A light resend brake: no more than one send every 45 seconds.
    if (prev?.lastSentAt && Date.now() - new Date(prev.lastSentAt).getTime() < 45000) {
      return res.status(429).json({ error: 'A code was just sent. Wait a moment and try again.' });
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const now = new Date();
    await ref.set({
      email,
      code,
      expiresAt: Date.now() + 10 * 60 * 1000,
      attempts: 0,
      createdAt: prev?.createdAt || now.toISOString(),
      lastSentAt: now.toISOString(),
    });
    const mail = await sendOtpEmail({ to: email, code, centreName, expiryMinutes: 10 });
    res.json({ success: true, delivered: mail.delivered });
  });

  app.post('/api/public/verify-otp', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const code = String(req.body?.code || '').trim();
    if (!email || !code) return res.status(400).json({ error: 'Email and code are required.' });
    const ref = adminDb.collection('otpCodes').doc(email);
    const snap = await ref.get().catch(() => null);
    if (!snap || !snap.exists) {
      return res.status(400).json({ error: 'No code was sent to this email. Request a new one.' });
    }
    const data: any = snap.data();
    if ((data.expiresAt || 0) < Date.now()) {
      await ref.delete().catch(() => {});
      return res.status(400).json({ error: 'That code has expired. Request a new one.' });
    }
    if ((data.attempts || 0) >= 5) {
      await ref.delete().catch(() => {});
      return res.status(429).json({ error: 'Too many wrong attempts. Request a new code.' });
    }
    if (String(data.code) !== code) {
      await ref.set({ attempts: (data.attempts || 0) + 1 }, { merge: true });
      return res.status(400).json({ error: 'That code is not correct. Check the email and try again.' });
    }
    await ref.delete().catch(() => {});
    // The code was correct: record it on the student record, so the app can
    // refuse any portal session for an account that never confirmed its
    // email. The uid must name a student whose email is the verified one, so
    // a guessed uid cannot mark someone else's account.
    const verifiedUid = String(req.body?.uid || '').trim();
    if (verifiedUid && /^[A-Za-z0-9_-]{20,}$/.test(verifiedUid)) {
      try {
        const sdoc = await adminDb.collection('students').doc(verifiedUid).get();
        if (sdoc.exists && String(sdoc.data()?.email || '').trim().toLowerCase() === email) {
          await adminDb.collection('students').doc(verifiedUid).set({ emailVerified: true }, { merge: true });
        }
      } catch (stampError: any) {
        console.error('[verify-otp] stamp failed:', stampError?.message || stampError);
      }
    }
    res.json({ success: true });
  });

  app.post('/api/auth/complete-first-login', async (req, res) => {
    try {
      const caller = getCaller(req);
      const result = await completeFirstLogin(caller.uid);
      res.json(result);
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[first-login] failed:', error?.message || error);
      res.status(500).json({ error: 'Could not finish first login. Please try again.' });
    }
  });

  // ==========================================================================
  // CENTRE: owner access-code management (Prompt C Part C)
  // ==========================================================================
  app.get('/api/centre/access-code', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = String(req.query.centreId || '');
      if (!centreId) return res.status(400).json({ error: 'centreId is required.' });
      await requireMembership(caller, centreId, ['owner']);
      const cDoc = await adminDb.collection('centres').doc(centreId).get();
      if (!cDoc.exists) return res.status(404).json({ error: 'Facility not found.' });
      let accessCode = (cDoc.data() as any)?.accessCode;
      if (!accessCode) {
        const regenerated = await regenerateAccessCode(centreId, caller.uid, 'owner');
        accessCode = regenerated.accessCode;
      }
      res.json({ success: true, accessCode, accessCodeRequired: (cDoc.data() as any)?.accessCodeRequired !== false });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[access-code] read failed:', error?.message || error);
      res.status(500).json({ error: 'Could not read the access code.' });
    }
  });

  app.post('/api/centre/access-code/regenerate', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = String(req.body?.centreId || '');
      if (!centreId) return res.status(400).json({ error: 'centreId is required.' });
      await requireMembership(caller, centreId, ['owner']);
      const result = await regenerateAccessCode(centreId, caller.uid, 'owner');
      res.json({ success: true, accessCode: result.accessCode });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[access-code] regenerate failed:', error?.message || error);
      res.status(500).json({ error: 'Could not regenerate the access code.' });
    }
  });

  // CENTRE (batch 44): the facility decides whether anyone is asked for the
  // access code at all. It is ON by default; a facility that switches it off
  // lets its students and staff go straight from the splash screen to
  // signing in. The code itself stays valid for anyone who still has it.
  app.post('/api/centre/access-code/require', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = String(req.body?.centreId || '');
      if (!centreId) return res.status(400).json({ error: 'centreId is required.' });
      await requireMembership(caller, centreId, ['owner', 'admin']);
      const required = req.body?.required !== false;
      await adminDb.collection('centres').doc(centreId).set(
        { accessCodeRequired: required, accessCodeRequiredUpdatedAt: new Date().toISOString() },
        { merge: true },
      );
      res.json({ success: true, accessCodeRequired: required });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[access-code] require toggle failed:', error?.message || error);
      res.status(500).json({ error: 'Could not save the access-code setting.' });
    }
  });

  // CENTRE (batch 44): whether the facility's students see the Tutorial OS
  // video class library at all. The flag lives on the centre's document and
  // is read on every student video fetch, so the switch lands instantly.
  app.get('/api/centre/video-classes', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = String(req.query.centreId || '');
      if (!centreId) return res.status(400).json({ error: 'centreId is required.' });
      await requireMembership(caller, centreId, ['owner', 'admin']);
      const cDoc = await adminDb.collection('centres').doc(centreId).get();
      res.json({ success: true, enabled: cDoc.exists ? (cDoc.data() as any)?.videoClassesEnabled !== false : true });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[video-classes] read failed:', error?.message || error);
      res.status(500).json({ error: 'Could not read the video-classes setting.' });
    }
  });

  app.post('/api/centre/video-classes', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = String(req.body?.centreId || '');
      if (!centreId) return res.status(400).json({ error: 'centreId is required.' });
      await requireMembership(caller, centreId, ['owner', 'admin']);
      const enabled = req.body?.enabled !== false;
      await adminDb.collection('centres').doc(centreId).set(
        { videoClassesEnabled: enabled, videoClassesUpdatedAt: new Date().toISOString() },
        { merge: true },
      );
      res.json({ success: true, enabled });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[video-classes] toggle failed:', error?.message || error);
      res.status(500).json({ error: 'Could not save the video-classes setting.' });
    }
  });

  // ==========================================================================
  // CENTRE: staff invitations. The temporary password is generated on the
  // server and only ever emailed to the invitee; the admin who invites never
  // sees it, and it is never stored anywhere.
  // ==========================================================================
  // CENTRE: staff pay records. Owners and admins record what was actually
  // paid, with optional screenshot evidence; staff read only their own
  // records. Amounts are whatever the owner paid, never auto-computed.
  // CENTRE: run the automatic staff pay reminder sweep for this facility now.
  // The Netlify scheduled function (staff-pay-reminders.mts) does the same
  // sweep every morning in production; this route lets an owner test or run
  // it on demand. Sends are deduplicated per staff member, day and channel.
  app.post('/api/centre/staff-pay-reminders/run', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = String(req.body?.centreId || '');
      if (!centreId) return res.status(400).json({ error: 'centreId is required.' });
      await requireMembership(caller, centreId, ['owner', 'admin']);
      const result = await runStaffPayReminderSweep({ centreId });
      res.json({ ok: true, ...result });
    } catch (error: any) {
      console.error('[staff pay reminders] failed:', error?.message || error);
      res.status(error?.status || 500).json({ error: error?.message || 'Could not run the reminders.' });
    }
  });

  // Plan capabilities for the active facility: which notification channels the
  // facility's plan allows. WhatsApp is a Facility Plus (centre_plus) feature;
  // Facility Standard facilities never see WhatsApp as a notification method.
  app.get('/api/centre/plan', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = String(req.query?.centreId || '');
      if (!centreId) return res.status(400).json({ error: 'centreId is required.' });
      await requireMembership(caller, centreId, ['owner', 'admin']);
      const bDoc = await adminDb.collection('centreBilling').doc(centreId).get();
      const billing = (bDoc.exists ? bDoc.data() : null) as any;
      const planId = String(billing?.planId || '') || 'centre_free';
      let planName = '';
      let whatsappNotifications = false;
      try {
        const plan = await getPlatformPlan(planId);
        planName = String(plan?.name || '');
        whatsappNotifications = plan?.whatsappNotifications === true;
      } catch { /* unknown plan: fail closed, WhatsApp stays hidden */ }
      res.json({ ok: true, planId, planName, whatsappNotifications });
    } catch (error: any) {
      console.error('[centre plan] failed:', error?.message || error);
      res.status(error?.status || 500).json({ error: error?.message || 'Could not load the plan.' });
    }
  });

  app.post('/api/centre/staff-payments', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = String(req.body?.centreId || '');
      if (!centreId) return res.status(400).json({ error: 'centreId is required.' });
      await requireMembership(caller, centreId, ['owner', 'admin']);

      const staffId = String(req.body?.staffId || '').trim();
      if (!staffId) return res.status(400).json({ error: 'staffId is required.' });
      const collection = req.body?.collection === 'admins' ? 'admins' : 'tutors';

      const staffRef = adminDb.collection(collection).doc(staffId);
      const staffSnap = await staffRef.get();
      if (!staffSnap.exists) return res.status(404).json({ error: 'Staff member not found.' });
      const staff = staffSnap.data() as any;
      if (String(staff?.centreId || '') !== centreId) {
        return res.status(403).json({ error: 'This staff member does not belong to your facility.' });
      }

      const amount = Number(req.body?.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: 'Enter the amount that was paid.' });
      }
      const modeRaw = String(req.body?.mode || '').trim();
      const mode = modeRaw === 'Cash' ? 'Cash' : 'Bank Transfer';
      const datePaid = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.datePaid || ''))
        ? String(req.body.datePaid)
        : new Date().toISOString().slice(0, 10);
      const periodsRaw = Number(req.body?.periodsCovered);
      const periodsCovered =
        collection === 'tutors' && Number.isFinite(periodsRaw) && periodsRaw > 0 ? Math.floor(periodsRaw) : null;
      const note = String(req.body?.note || '').slice(0, 400);
      const evidenceUrl = /^https:\/\//.test(String(req.body?.evidenceUrl || '')) ? String(req.body.evidenceUrl) : null;

      const doc: Record<string, any> = {
        centreId,
        staffId,
        collection,
        staffName: String(staff.name || ''),
        staffRole: String(staff.role || ''),
        amount: Math.round(amount),
        mode,
        datePaid,
        periodsCovered,
        note,
        evidenceUrl,
        recordedBy: caller.uid,
        createdAt: new Date().toISOString(),
      };
      const added = await adminDb.collection('staffPayments').add(doc);
      await staffRef.set({ lastPaidAt: datePaid, lastPaidAmount: Math.round(amount) }, { merge: true });
      res.json({ ok: true, id: added.id });
    } catch (error: any) {
      console.error('[staff payments record] failed:', error?.message || error);
      res.status(error?.status || 500).json({ error: error?.message || 'Could not record the payment.' });
    }
  });

  app.get('/api/centre/staff-payments', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = String(req.query?.centreId || '');
      if (!centreId) return res.status(400).json({ error: 'centreId is required.' });
      await requireMembership(caller, centreId, ['owner', 'admin']);
      const snap = await adminDb
        .collection('staffPayments')
        .where('centreId', '==', centreId)
        .orderBy('createdAt', 'desc')
        .limit(300)
        .get();
      res.json({ ok: true, payments: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
    } catch (error: any) {
      console.error('[staff payments list] failed:', error?.message || error);
      res.status(error?.status || 500).json({ error: error?.message || 'Could not load the pay records.' });
    }
  });

  app.get('/api/centre/staff-payments/mine', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = String(req.query?.centreId || '');
      if (!centreId) return res.status(400).json({ error: 'centreId is required.' });
      await requireMembership(caller, centreId);
      const snap = await adminDb
        .collection('staffPayments')
        .where('centreId', '==', centreId)
        .where('staffId', '==', caller.uid)
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get();
      res.json({ ok: true, payments: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
    } catch (error: any) {
      console.error('[staff payments mine] failed:', error?.message || error);
      res.status(error?.status || 500).json({ error: error?.message || 'Could not load your pay records.' });
    }
  });

  // CENTRE: staff pay setup. Only owners and admins set how a person is
  // paid; a tutor's per-class rate is a record of what a class is worth,
  // never an automatic salary calculation.
  // CENTRE: staff details edit. Everything about a staff member is editable
  // here except their email, which stays fixed. Bank account details ride
  // along so the facility always has where to pay them.
  app.patch('/api/centre/staff/details', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = String(req.body?.centreId || '');
      if (!centreId) return res.status(400).json({ error: 'centreId is required.' });
      await requireMembership(caller, centreId, ['owner', 'admin']);

      const staffId = String(req.body?.staffId || '').trim();
      if (!staffId) return res.status(400).json({ error: 'staffId is required.' });
      const collection = req.body?.collection === 'admins' ? 'admins' : 'tutors';
      const isTutorDoc = collection === 'tutors';

      const ref = adminDb.collection(collection).doc(staffId);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'Staff member not found.' });
      if (String((snap.data() as any)?.centreId || '') !== centreId) {
        return res.status(403).json({ error: 'This staff member does not belong to your facility.' });
      }

      const body = req.body || {};
      const update: Record<string, any> = { updatedAt: new Date().toISOString() };
      const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

      const name = str(body.name, 120);
      if (name) update.name = name;
      update.phone = str(body.phone, 40);
      update.bankName = str(body.bankName, 80);
      update.bankAccountName = str(body.bankAccountName, 80);
      update.bankAccountNumber = str(body.bankAccountNumber, 40);

      if (isTutorDoc) {
        update.bio = str(body.bio, 600);
        const depts = Array.isArray(body.departments)
          ? (body.departments as any[]).map(String).filter((d) => ['Science', 'Commercial', 'Arts'].includes(d)).slice(0, 5)
          : [];
        if (depts.length) update.departments = depts;
        const examTypes = Array.isArray(body.examTypes)
          ? (body.examTypes as any[]).map((x) => str(x, 80)).filter(Boolean).slice(0, 10)
          : [];
        if (examTypes.length) update.examTypes = examTypes;
        const subjects = Array.isArray(body.subjects)
          ? (body.subjects as any[]).map((x) => str(x, 80)).filter(Boolean).slice(0, 20)
          : [];
        if (subjects.length) update.subjects = subjects;
      } else {
        update.department = str(body.department, 80) || 'General';
        update.jobTitle = str(body.jobTitle, 80);
        const role = str(body.role, 40);
        if (['Super Admin', 'Facility Admin', 'Admin Secretary', 'Finance Admin', 'Tutor'].includes(role)) update.role = role;
      }

      const payFrequencyRaw = String(body.payFrequency || '').trim();
      const payFrequency = ['daily', 'weekly', 'monthly'].includes(payFrequencyRaw) ? payFrequencyRaw : '';
      update.payFrequency = payFrequency;
      const payDayRaw = Number(body.payDay);
      update.payDay = payFrequency && Number.isFinite(payDayRaw) && payDayRaw >= 0 && payDayRaw <= 28 ? Math.floor(payDayRaw) : null;
      const ratePerPeriod = Number(body.ratePerPeriod);
      update.ratePerPeriod = isTutorDoc && payFrequency && Number.isFinite(ratePerPeriod) && ratePerPeriod > 0 ? Math.round(ratePerPeriod) : null;
      const payAmount = Number(body.payAmount);
      update.payAmount = !isTutorDoc && payFrequency && Number.isFinite(payAmount) && payAmount > 0 ? Math.round(payAmount) : null;
      update.payUpdatedAt = new Date().toISOString();

      await ref.set(update, { merge: true });
      res.json({ ok: true });
    } catch (error: any) {
      console.error('[staff details] failed:', error?.message || error);
      res.status(error?.status || 500).json({ error: error?.message || 'Could not save the changes.' });
    }
  });

  app.patch('/api/centre/staff/pay', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = String(req.body?.centreId || '');
      if (!centreId) return res.status(400).json({ error: 'centreId is required.' });
      await requireMembership(caller, centreId, ['owner', 'admin']);

      const staffId = String(req.body?.staffId || '').trim();
      if (!staffId) return res.status(400).json({ error: 'staffId is required.' });
      const collection = req.body?.collection === 'admins' ? 'admins' : 'tutors';
      const isTutorDoc = collection === 'tutors';

      const ref = adminDb.collection(collection).doc(staffId);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'Staff member not found.' });
      if (String((snap.data() as any)?.centreId || '') !== centreId) {
        return res.status(403).json({ error: 'This staff member does not belong to your facility.' });
      }

      const payFrequencyRaw = String(req.body?.payFrequency || '').trim();
      const payFrequency = ['daily', 'weekly', 'monthly'].includes(payFrequencyRaw) ? payFrequencyRaw : '';
      const payDayRaw = Number(req.body?.payDay);
      const ratePerPeriod = Number(req.body?.ratePerPeriod);
      const payAmount = Number(req.body?.payAmount);

      const update: Record<string, any> = { payUpdatedAt: new Date().toISOString() };
      update.payFrequency = payFrequency;
      update.payDay = payFrequency && Number.isFinite(payDayRaw) && payDayRaw >= 0 && payDayRaw <= 28 ? Math.floor(payDayRaw) : null;
      update.ratePerPeriod = isTutorDoc && payFrequency && Number.isFinite(ratePerPeriod) && ratePerPeriod > 0 ? Math.round(ratePerPeriod) : null;
      update.payAmount = !isTutorDoc && payFrequency && Number.isFinite(payAmount) && payAmount > 0 ? Math.round(payAmount) : null;

      await ref.set(update, { merge: true });
      res.json({ ok: true });
    } catch (error: any) {
      console.error('[staff pay] failed:', error?.message || error);
      res.status(error?.status || 500).json({ error: error?.message || 'Could not save the pay setup.' });
    }
  });

  app.post('/api/centre/staff/invite', async (req, res) => {
    try {
      const caller = getCaller(req);
      const centreId = String(req.body?.centreId || '');
      if (!centreId) return res.status(400).json({ error: 'centreId is required.' });
      await requireMembership(caller, centreId, ['owner', 'admin']);

      const name = String(req.body?.name || '').trim().slice(0, 120);
      const email = normalizeEmail(String(req.body?.email || ''));
      const phone = String(req.body?.phone || '').trim().slice(0, 40);
      const role = String(req.body?.role || '').trim();
      const allowedRoles = ['Tutor', 'Facility Admin', 'Admin Secretary', 'Finance Admin', 'Super Admin'];
      if (!name) return res.status(400).json({ error: 'The name is required.' });
      if (!email || !email.includes('@')) return res.status(400).json({ error: 'A valid email address is required.' });
      if (!allowedRoles.includes(role)) return res.status(400).json({ error: 'Unknown role.' });

      const cDoc = await adminDb.collection('centres').doc(centreId).get();
      if (!cDoc.exists) return res.status(404).json({ error: 'Facility not found.' });
      const centreName = String((cDoc.data() as any)?.name || 'your facility');
      const accessCode = String((cDoc.data() as any)?.accessCode || '');

      for (const coll of ['admins', 'tutors']) {
        const dup = await adminDb.collection(coll)
          .where('centreId', '==', centreId)
          .where('email', '==', email)
          .limit(1)
          .get();
        if (!dup.empty) return res.status(409).json({ error: `${email} is already on this facility's staff list.` });
      }
      try {
        await adminAuth.getUserByEmail(email);
        return res.status(409).json({ error: `The email ${email} already has a Tutorial OS account.` });
      } catch {
        // No account with that email yet: good, carry on.
      }

      const tempPassword = crypto.randomBytes(12).toString('base64url');
      const authUser = await adminAuth.createUser({ email, password: tempPassword, displayName: name });

      const payFrequencyRaw = String(req.body?.payFrequency || '').trim();
      const payFrequency = ['daily', 'weekly', 'monthly'].includes(payFrequencyRaw) ? payFrequencyRaw : '';
      const payDayRaw = Number(req.body?.payDay);
      const ratePerPeriod = Number(req.body?.ratePerPeriod);
      const payAmount = Number(req.body?.payAmount);

      const isTutor = role === 'Tutor';
      const doc: Record<string, any> = {
        id: authUser.uid,
        name,
        email,
        phone,
        bankName: String(req.body?.bankName || '').trim().slice(0, 80),
        bankAccountName: String(req.body?.bankAccountName || '').trim().slice(0, 80),
        bankAccountNumber: String(req.body?.bankAccountNumber || '').trim().slice(0, 40),
        role,
        status: 'Invited',
        temporaryPassword: null,
        hasChangedPassword: false,
        createdAt: new Date().toISOString(),
        centreId,
      };
      if (isTutor) {
        doc.subjects = Array.isArray(req.body?.subjects) ? req.body.subjects.map((x: any) => String(x)).slice(0, 20) : ['General Studies'];
        doc.departments = Array.isArray(req.body?.departments) ? req.body.departments.map((x: any) => String(x)).slice(0, 5) : ['Science'];
        doc.examTypes = Array.isArray(req.body?.examTypes) ? req.body.examTypes.map((x: any) => String(x)).slice(0, 10) : [];
        doc.bio = String(req.body?.bio || '').slice(0, 600);
        doc.programmeIds = Array.isArray(req.body?.programmeIds) ? req.body.programmeIds.map((x: any) => String(x)).slice(0, 10) : [];
        doc.rating = 0;
        doc.totalClassesTaught = 0;
        doc.ratePerHour = 3500;
        doc.avatar = '';
      } else {
        doc.department = 'General';
        doc.jobTitle = role;
      }

      if (payFrequency) {
        doc.payFrequency = payFrequency as any;
        if (Number.isFinite(payDayRaw) && payDayRaw >= 0 && payDayRaw <= 28) doc.payDay = Math.floor(payDayRaw);
      }
      if (isTutor && Number.isFinite(ratePerPeriod) && ratePerPeriod > 0) doc.ratePerPeriod = Math.round(ratePerPeriod);
      if (!isTutor && Number.isFinite(payAmount) && payAmount > 0) doc.payAmount = Math.round(payAmount);

      const emailRes = await sendEmail(buildStaffInviteEmail({
        to: email,
        fullName: name,
        centreName,
        role,
        loginEmail: email,
        tempPassword,
        accessCode,
        appUrl: baseUrl(req),
      }));
      if (!emailRes.delivered) {
        // Without the email there is no way in, so undo the account entirely
        // rather than leave anyone stranded without a password.
        await adminAuth.deleteUser(authUser.uid).catch(() => undefined);
        return res.status(502).json({ error: 'The welcome email could not be sent, so nobody was invited. Please try again.' });
      }
      await adminDb.collection(isTutor ? 'tutors' : 'admins').doc(authUser.uid).set(doc);

      // The facility entry path reads memberships, so a new staff account
      // gets its row here and can enter the facility on first sign-in.
      const membershipRole = role === 'Tutor'
        ? 'tutor'
        : role === 'Admin Secretary'
          ? 'secretary'
          : role === 'Finance Admin'
            ? 'finance'
            : 'admin';
      const nowIso = new Date().toISOString();
      await adminDb.collection('memberships').doc(`${authUser.uid}__${centreId}`).set({
        uid: authUser.uid,
        centreId,
        role: membershipRole,
        status: 'active',
        createdAt: nowIso,
        updatedAt: nowIso,
      }, { merge: true });

      await audit({ actorUid: caller.uid, centreId, action: 'STAFF_INVITED', after: { email, role, collection: isTutor ? 'tutors' : 'admins' } });
      res.json({ success: true, emailDelivered: true });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      const code = String(error?.code || error?.errorInfo?.code || '');
      if (code.includes('email-already-exists') || code.includes('email-already-in-use')) {
        return res.status(409).json({ error: 'That email already has a Tutorial OS account.' });
      }
      console.error('[staff invite] failed:', error?.message || error);
      res.status(500).json({ error: 'Could not send the invitation.' });
    }
  });

  // ==========================================================================
  // TOS platform console API (Prompt C Part D). Every route below requires
  // the `tos` claim on a verified token.
  // ==========================================================================
  const tosGuard = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      requireTos(req);
      next();
    } catch (error: any) {
      res.status(error?.status || 403).json({ error: error?.message || 'TOS staff only.' });
    }
  };
  app.use('/api/tos', tosGuard);

  app.get('/api/tos/overview', async (req, res) => {
    try {
      // One round-trip batch: config, centres, leads and the audit page all
      // load together; only the billing map needs the centre ids first.
      const [config, centresSnap, leadsSnap, auditSnap] = await Promise.all([
        getPlatformConfig(),
        adminDb.collection('centres').limit(200).get(),
        adminDb.collection('leads').limit(200).get(),
        adminDb.collection('auditLogs').orderBy('at', 'desc').limit(10).get(),
      ]);
      const billingMap = await loadBillingMap(centresSnap.docs.map((d) => d.id));
      // Seat-days: facilities with a pool report active/total seats, not the
      // legacy billing counters.
      const seatPoolByCentre: Record<string, { active: number; total: number }> = {};
      try {
        const seatSnap = await adminDb.collection('centreSeats').get();
        for (const d of seatSnap.docs) {
          const cid = String((d.data() as any).centreId || '');
          const st = String((d.data() as any).status || 'available');
          if (!cid) continue;
          seatPoolByCentre[cid] = seatPoolByCentre[cid] || { active: 0, total: 0 };
          seatPoolByCentre[cid].total += 1;
          if (st === 'active') seatPoolByCentre[cid].active += 1;
        }
      } catch { /* the legacy counters stay the fallback */ }
      const counts: Record<string, number> = { trial: 0, pending_payment: 0, active: 0, overdue: 0, suspended: 0 };
      let seatsUsed = 0;
      let seatsCap = 0;
      const weekAhead = Date.now() + 7 * DAY_MS;
      const leadCentres: Array<{ centreId: string; name: string }> = [];
      centresSnap.docs.forEach((d) => {
        const centre = { id: d.id, ...(d.data() as any) };
        const billing = billingMap.get(d.id) || null;
        const status = effectiveStatus(centre, billing, config);
        counts[status] = (counts[status] || 0) + 1;
        if (billing) {
          const pool = seatPoolByCentre[d.id];
          if (pool && pool.total > 0) {
            seatsUsed += pool.active;
            seatsCap += pool.total;
          } else {
            seatsUsed += billing.activeStudentCount || 0;
            seatsCap += billing.seatCap || 0;
          }
          if (facilityTier(billing) === 'lead') {
            leadCentres.push({ centreId: d.id, name: centre.name });
          }
        }
      });
      const leadCounts: Record<string, number> = {};
      leadsSnap.docs.forEach((d) => {
        const s = (d.data() as any).status || 'unknown';
        leadCounts[s] = (leadCounts[s] || 0) + 1;
      });
      res.json({
        centres: { ...counts, total: centresSnap.size },
        seats: { used: seatsUsed, cap: seatsCap },
        leadCentres,
        leads: { ...leadCounts, total: leadsSnap.size },
        recentAudit: auditSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      });
    } catch (error: any) {
      console.error('[tos/overview] failed:', error?.message || error);
      res.status(500).json({ error: 'Could not load the overview.' });
    }
  });

  app.get('/api/tos/leads', async (req, res) => {
    try {
      const status = String(req.query.status || '');
      const snap = status
        ? await adminDb.collection('leads').where('status', '==', status).limit(200).get()
        : await adminDb.collection('leads').limit(200).get();
      const leads = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .sort((a: any, b: any) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      res.json({ leads });
    } catch (error: any) {
      console.error('[tos/leads] failed:', error?.message || error);
      res.status(500).json({ error: 'Could not load leads.' });
    }
  });

  app.post('/api/tos/leads/:id/action', async (req, res) => {
    try {
      const caller = requireTos(req);
      const leadRef = adminDb.collection('leads').doc(req.params.id);
      const leadDoc = await leadRef.get();
      if (!leadDoc.exists) return res.status(404).json({ error: 'Lead not found.' });
      const lead = leadDoc.data() as any;
      const type = String(req.body?.type || '');

      if (type === 'resend-verification') {
        if (lead.status !== 'unverified') return res.status(400).json({ error: 'Only unverified leads can be re-verified.' });
        const token = crypto.randomBytes(24).toString('hex');
        await leadRef.update({ verifyToken: token, verifyExpiresAt: new Date(Date.now() + 2 * DAY_MS).toISOString() });
        const verifyUrl = `${baseUrl(req)}/api/public/leads/verify?token=${token}`;
        const emailRes = await sendEmail(
          buildVerificationEmail({ to: lead.email, fullName: lead.fullName, businessName: lead.businessName, verifyUrl })
        );
        if (!emailRes.delivered) console.log(`[leads] verification link for lead ${leadDoc.id}: ${verifyUrl}`);
        await audit({ actorUid: caller.uid, action: 'LEAD_VERIFICATION_RESENT', after: { leadId: leadDoc.id, delivered: emailRes.delivered } });
        return res.json({ success: true, delivered: emailRes.delivered });
      }

      if (type === 'provision') {
        if (lead.status === 'provisioned') return res.status(400).json({ error: 'This lead is already provisioned.' });
        if (lead.status === 'rejected') return res.status(400).json({ error: 'This lead was rejected. Restore it first.' });
        const result = await provisionCentre({
          fullName: lead.fullName,
          businessName: lead.businessName,
          email: lead.email,
          phone: lead.phone,
          studentCount: lead.studentCount,
          state: lead.state,
          city: lead.city,
          examTypes: lead.examTypes || [],
          skipTrial: lead.skipTrial === true,
          source: 'tos',
          actorUid: caller.uid,
        });
        await leadRef.update({
          status: 'provisioned',
          provisionedAt: new Date().toISOString(),
          centreId: result.centreId,
          credentialsNotDelivered: result.credentialsNotDelivered,
        });
        // The temporary password is returned exactly once, only when the
        // email could not be delivered, so staff can hand it over directly.
        return res.json({
          success: true,
          centreId: result.centreId,
          accessCode: result.accessCode,
          welcomeDelivered: result.welcomeDelivered,
          ...(result.tempPassword ? { tempPassword: result.tempPassword } : {}),
        });
      }

      if (type === 'reject') {
        const reason = String(req.body?.reason || '').trim().slice(0, 300);
        await leadRef.update({ status: 'rejected', rejectedReason: reason, rejectedAt: new Date().toISOString() });
        await audit({ actorUid: caller.uid, action: 'LEAD_REJECTED', after: { leadId: req.params.id, reason } });
        return res.json({ success: true });
      }

      return res.status(400).json({ error: 'Unknown action.' });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[tos/leads] action failed:', error?.message || error);
      res.status(500).json({ error: 'Action failed.' });
    }
  });

  app.get('/api/tos/centres', async (req, res) => {
    try {
      const config = await getPlatformConfig();
      const queryText = String(req.query.query || '').toLowerCase();
      const statusFilter = String(req.query.status || '');
      const centresSnap = await adminDb.collection('centres').limit(200).get();
      const billingMap = await loadBillingMap(centresSnap.docs.map((d) => d.id));
      // Live seat numbers per facility: active student memberships counted in
      // one pass, and the same cap logic the facility's own panel uses (an
      // explicit TOS-set cap wins even during trial).
      const activeSeatsByCentre = new Map<string, number>();
      try {
        const activeSeatsSnap = await adminDb
          .collection('memberships')
          .where('role', '==', 'student')
          .where('status', '==', 'active')
          .select('centreId')
          .get();
        activeSeatsSnap.forEach((snap) => {
          const cid = String((snap.data() as any)?.centreId || '');
          if (cid) activeSeatsByCentre.set(cid, (activeSeatsByCentre.get(cid) || 0) + 1);
        });
      } catch { /* fall back to the stored counter below */ }
      const plansById = new Map<string, any>();
      for (const pid of Array.from(new Set(centresSnap.docs.map((d) => String((billingMap.get(d.id) as any)?.planId || '')).filter(Boolean)))) {
        try { plansById.set(pid, await getPlatformPlan(pid)); } catch { /* plan missing: cap falls back to the stored number */ }
      }
      // Leads vs facilities: a facility is onboarded once its owner set their
      // own password (ownerOnboardedAt, or the owner's staff record).
      const adminsSnap = await adminDb.collection('admins').limit(500).get();
      const onboardedByCentre = new Map<string, { uid: string; changed: boolean }>();
      for (const a of adminsSnap.docs) {
        const ad = a.data() as any;
        if (ad.centreId) onboardedByCentre.set(String(ad.centreId), { uid: String(ad.uid || a.id), changed: ad.hasChangedPassword === true });
      }
      const centres = centresSnap.docs
        .map((d) => {
          const centre = { id: d.id, ...(d.data() as any) };
          const billing = billingMap.get(d.id) || null;
          return {
            id: d.id,
            name: centre.name,
            ownerEmail: centre.ownerEmail || '',
            ownerName: centre.ownerName || '',
            centreStatus: centre.status,
            billingStatus: billing ? effectiveStatus(centre, billing, config) : centre.status,
            tier: facilityTier(billing),
            upgradedAt: billing?.upgradedAt || null,
            planId: billing?.planId || null,
            seatsUsed: activeSeatsByCentre.get(d.id) ?? (billing?.activeStudentCount ?? 0),
            seatCap: billing ? seatCapFor(billing, plansById.get(String(billing.planId || '')) || null, effectiveStatus(centre, billing, config)) : null,
            trialEndsAt: billing?.trialEndsAt || null,
            credentialsNotDelivered: !!centre.credentialsNotDelivered,
            ownerOnboarded: !!centre.ownerOnboardedAt || (onboardedByCentre.get(d.id)?.changed === true),
            createdAt: centre.createdAt,
          };
        })
        .filter((c) => {
          if (statusFilter && c.billingStatus !== statusFilter) return false;
          if (queryText && !`${c.name} ${c.ownerEmail}`.toLowerCase().includes(queryText)) return false;
          return true;
        })
        .sort((a: any, b: any) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      // Self-heal for facilities whose owner already set their own password
      // before this flag existed: one Auth read per unflagged facility, and
      // the flag is written once so later loads cost nothing extra.
      const needsCheck = centres.filter((c) => {
        if (c.ownerOnboarded) return false;
        const a = onboardedByCentre.get(String(c.id));
        return !!a?.uid;
      }).slice(0, 20);
      for (const c of needsCheck) {
        try {
          const owner = await adminAuth.getUser(onboardedByCentre.get(String(c.id))!.uid);
          const ownerClaims = (owner.customClaims || {}) as Record<string, any>;
          if (!ownerClaims.mustChangePassword) {
            await adminDb.collection('centres').doc(String(c.id)).set({ ownerOnboardedAt: new Date().toISOString() }, { merge: true });
            c.ownerOnboarded = true;
          }
        } catch { /* keep it as a lead when the lookup fails */ }
      }
      res.json({
        centres,
        seats: {
          used: centres.reduce((n: number, c: any) => n + (Number(c.seatsUsed) || 0), 0),
          cap: centres.reduce((n: number, c: any) => n + (Number(c.seatCap) || 0), 0),
        },
      });
    } catch (error: any) {
      console.error('[tos/facilities] failed:', error?.message || error);
      res.status(500).json({ error: 'Could not load facilities.' });
    }
  });

  // Bulk-delete facilities permanently: every facility-owned record, the
  // owner's and members' sign-in accounts included, with no trace left
  // behind (the platform's own audit trail for these facilities goes too).
  app.post('/api/tos/centres/bulk-delete', async (req, res) => {
    try {
      const caller = requireTos(req);
      const raw = Array.isArray(req.body?.ids) ? req.body.ids : [];
      const ids = raw.map((v: any) => String(v || '')).filter((v: string) => /^[A-Za-z0-9_-]{3,160}$/.test(v)).slice(0, 20);
      if (!ids.length) return res.status(400).json({ error: 'Select the facilities to delete first.' });
      const results: Array<{ id: string; ok: boolean; error?: string }> = [];
      for (const id of ids) {
        try {
          await deleteCentreCascade(id, caller.uid, 'Bulk delete from the Tutorial OS console', { audit: false, purgeAudit: true });
          results.push({ id, ok: true });
        } catch (err: any) {
          console.error('[tos/facilities] bulk delete failed:', id, err?.message || err);
          results.push({ id, ok: false, error: err?.message || 'Deletion failed.' });
        }
      }
      res.json({ results, deleted: results.filter((r) => r.ok).length });
    } catch (error: any) {
      console.error('[tos/facilities] bulk delete failed:', error?.message || error);
      res.status(500).json({ error: 'Could not delete the selected facilities.' });
    }
  });

  app.get('/api/tos/centres/:id', async (req, res) => {
    try {
      const cDoc = await adminDb.collection('centres').doc(req.params.id).get();
      if (!cDoc.exists) return res.status(404).json({ error: 'Facility not found.' });
      const bDoc = await adminDb.collection('centreBilling').doc(req.params.id).get();
      // Same seat numbers the facility's own panel shows: the live active
      // count and the effective cap (an explicit TOS-set cap wins even during
      // trial).
      const centre = cDoc.data() as any;
      const billing = bDoc.exists ? (bDoc.data() as any) : null;
      const config = await getPlatformConfig();
      let plan: any = null;
      if (billing?.planId) { try { plan = await getPlatformPlan(billing.planId); } catch { plan = null; } }
      const status = billing ? effectiveStatus(centre, billing, config) : 'active';
      const seatPool = await getSeatPool(req.params.id).catch(() => null);
      let seatsUsed = billing?.activeStudentCount ?? 0;
      try { seatsUsed = await countActiveStudents(req.params.id); } catch { /* keep the stored counter */ }
      const seats = seatPool && seatPool.total > 0
        ? { used: seatPool.active, cap: seatPool.total }
        : { used: seatsUsed, cap: billing ? seatCapFor(billing, plan, status) : 0 };
      const paymentsSnap = await adminDb.collection('billingPayments').where('centreId', '==', req.params.id).limit(100).get();
      const auditSnap = await adminDb.collection('auditLogs').where('centreId', '==', req.params.id).limit(50).get();
      res.json({
        centre: { id: cDoc.id, ...cDoc.data() },
        billing: bDoc.exists ? bDoc.data() : null,
        seats,
        seatPool: seatPool || undefined,
        payments: paymentsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as any))
          .sort((a: any, b: any) => String(b.at || '').localeCompare(String(a.at || ''))),
        audit: auditSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as any))
          .sort((a: any, b: any) => String(b.at || '').localeCompare(String(a.at || ''))),
      });
    } catch (error: any) {
      console.error('[tos/facilities] detail failed:', error?.message || error);
      res.status(500).json({ error: 'Could not load the facility.' });
    }
  });

  app.post('/api/tos/centres/:id/action', async (req, res) => {
    try {
      const caller = requireTos(req);
      const cRef = adminDb.collection('centres').doc(req.params.id);
      const cDoc = await cRef.get();
      if (!cDoc.exists) return res.status(404).json({ error: 'Facility not found.' });
      const bRef = adminDb.collection('centreBilling').doc(req.params.id);
      const bDoc = await bRef.get();
      const type = String(req.body?.type || '');
      const before = bDoc.exists ? bDoc.data() : null;

      const auditChange = async (action: string, after: any) =>
        audit({ actorUid: caller.uid, centreId: req.params.id, action, before, after });

      if (type === 'set-plan') {
        const planId = String(req.body?.planId || '');
        await getPlatformPlan(planId); // validates the plan exists
        await bRef.update({ planId });
        await auditChange('PLAN_CHANGED', { planId });
        return res.json({ success: true });
      }
      if (type === 'set-seat-cap') {
        const seatCap = Number(req.body?.seatCap);
        if (!Number.isInteger(seatCap) || seatCap < 1 || seatCap > 100000) return res.status(400).json({ error: 'Seat cap must be a positive number.' });
        await bRef.update({ seatCap });
        await auditChange('SEAT_CAP_CHANGED', { seatCap });
        return res.json({ success: true });
      }
      if (type === 'set-billed-minimum') {
        const billedSeatsMinimum = Number(req.body?.billedSeatsMinimum);
        if (!Number.isInteger(billedSeatsMinimum) || billedSeatsMinimum < 0 || billedSeatsMinimum > 100000) return res.status(400).json({ error: 'Minimum must be zero or more.' });
        await bRef.update({ billedSeatsMinimum });
        await auditChange('BILLED_MINIMUM_CHANGED', { billedSeatsMinimum });
        return res.json({ success: true });
      }
      if (type === 'set-free-seats') {
        // Batch 22: this facility's custom free-seat grant. null clears the
        // override so the platform-wide default applies again.
        const raw = req.body?.freeSeatsCustom;
        let value: number | null = null;
        if (raw !== null && raw !== undefined) {
          const n = Number(raw);
          if (!Number.isInteger(n) || n < 0 || n > 100000) return res.status(400).json({ error: 'Free seats must be zero or more.' });
          value = n;
        }
        await bRef.set({ freeSeatsCustom: value }, { merge: true });
        await auditChange('FREE_SEATS_OVERRIDE', { freeSeatsCustom: value });
        return res.json({ success: true, freeSeatsCustom: value });
      }
      if (type === 'regenerate-access-code') {
        const result = await regenerateAccessCode(req.params.id, caller.uid, 'tos');
        return res.json({ success: true, accessCode: result.accessCode });
      }
      if (type === 'resend-credentials') {
        const result = await resendCredentials(req.params.id, caller.uid);
        return res.json({ success: true, delivered: result.delivered, ...(result.tempPassword ? { tempPassword: result.tempPassword } : {}) });
      }
      // Batch 58: resend the login details WITHOUT resetting the password
      // while the owner has not signed in yet. Once they have set their own
      // password the temporary one is gone, so the console is told to use
      // the reset flow instead.
      if (type === 'resend-login-details') {
        const result = await resendLoginDetails(req.params.id, caller.uid);
        return res.json({
          success: true,
          delivered: result.delivered,
          alreadyActive: result.alreadyActive === true,
          ...(result.tempPassword ? { tempPassword: result.tempPassword } : {}),
        });
      }
      if (type === 'record-payment') {
        const amount = Number(req.body?.amount);
        const periodEnd = String(req.body?.periodEnd || '');
        const method = String(req.body?.method || '').trim().slice(0, 60);
        const reference = String(req.body?.reference || '').trim().slice(0, 120);
        const note = String(req.body?.note || '').trim().slice(0, 500);
        const seats = Math.max(0, Math.floor(Number(req.body?.seats || 0)));
        if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Enter a payment amount.' });
        if (!periodEnd || isNaN(new Date(periodEnd).getTime())) return res.status(400).json({ error: 'Enter the period the payment covers.' });
        if (!bDoc.exists) return res.status(400).json({ error: 'This facility has no billing document yet.' });
        // Batch 60: the console can attach the receipt (same rules as the
        // facility's own upload: PNG/JPG/WebP image or PDF, up to 4 MB), so
        // the facility sees the proof in its seat payment history, exactly
        // like the payments it makes itself.
        let receiptUrl = '';
        const receiptData = String(req.body?.receiptData || '');
        if (receiptData) {
          const rm = /^data:(image\/(?:png|jpe?g|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/.exec(receiptData);
          if (!rm) return res.status(400).json({ error: 'The receipt must be a PNG, JPG or WebP image, or a PDF.' });
          const rBytes = Math.floor((rm[2].length * 3) / 4);
          if (rBytes > 4 * 1024 * 1024) return res.status(413).json({ error: 'The receipt can be up to 4 MB.' });
          const cloud = String(process.env.CLOUDINARY_CLOUD_NAME || '');
          const preset = String(process.env.CLOUDINARY_UPLOAD_PRESET || '');
          if (!cloud || !preset) return res.status(500).json({ error: 'Receipt hosting is not configured on this deployment.' });
          const endpoint = rm[1] === 'application/pdf' ? 'raw' : 'image';
          try {
            const form = new FormData();
            form.append('upload_preset', preset);
            form.append('folder', 'tos/receipts');
            form.append('file', receiptData);
            const resp = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/${endpoint}/upload`, { method: 'POST', body: form });
            const cd: any = await resp.json().catch(() => null);
            receiptUrl = cd && typeof cd.secure_url === 'string' ? cd.secure_url : '';
            if (!resp.ok || !receiptUrl) return res.status(502).json({ error: 'The receipt could not be uploaded. Please try again.' });
          } catch { return res.status(502).json({ error: 'The receipt could not be uploaded. Please try again.' }); }
        }
        await adminDb.collection('billingPayments').add({
          centreId: req.params.id,
          amount,
          periodCoveredUntil: new Date(periodEnd).toISOString(),
          method,
          reference,
          note,
          ...(receiptUrl ? { receiptUrl } : {}),
          actorUid: caller.uid,
          at: new Date().toISOString(),
        });
        await bRef.update({ paidThrough: new Date(periodEnd).toISOString() });
        await cRef.update({ status: 'active', credentialsNotDelivered: false });
        // Seat-days: the payment tops the facility's seat pool. Locked seats
        // reopen with a fresh 30 days first, then new seats are added.
        let seatResult: any = null;
        if (seats > 0) {
          try { seatResult = await provisionSeats(req.params.id, seats); } catch (e) { console.error('[tos/facilities] seat provisioning failed:', (e as Error).message); }
          if (seatResult && seatResult.capped) {
            seatResult.message = `Only ${seatResult.added} of ${seatResult.requested} seat(s) could be added: this facility can hold up to ${seatResult.cap} paid seats.`;
          }
          if (seatResult && seatResult.planRequired) {
            return res.status(400).json({ error: seatResult.message || 'Choose a plan before creating seats.' });
          }
        }
        // Batch 26: paying for the platform minimum of seats upgrades a lead
        // into a facility. The tier flip is what turns the public landing
        // page on and moves the facility into the TOS facility section.
        let upgraded = false;
        try {
          const config = await getPlatformConfig();
          const minimum = Math.max(0, Math.floor(Number((config as any)?.paidSeatMinimum ?? 5)));
          const paidHeld = await countPaidSeatsForCentre(req.params.id);
          if (paidHeld >= minimum && facilityTier(before) === 'lead') {
            await bRef.update({ tier: 'facility', upgradedAt: new Date().toISOString() });
            await auditChange('FACILITY_UPGRADED', { paidHeld, minimum });
            upgraded = true;
          }
        } catch (e) { console.error('[tos/facilities] tier flip failed:', (e as Error).message); }
        await auditChange('PAYMENT_RECORDED', { amount, periodCoveredUntil: new Date(periodEnd).toISOString(), method, reference, seats, seatResult });
        // Batch 60: the facility hears immediately: in-app + push to the
        // owner and admins, and one email each.
        try {
          await notifySeatPaymentRegistered({ centreId: req.params.id, amount, periodEnd, seats, method, reference, ...(receiptUrl ? { receiptUrl } : {}) });
        } catch (e) { console.error('[tos/facilities] payment notify failed:', (e as Error).message); }
        return res.json({ success: true, ...(upgraded ? { upgraded: true } : {}), ...(seatResult ? { seats: seatResult } : {}) });
      }
      if (type === 'suspend') {
        const reason = String(req.body?.reason || '').trim().slice(0, 300);
        if (!reason) return res.status(400).json({ error: 'A reason is required.' });
        await cRef.update({ status: 'suspended', suspendedReason: reason });
        await audit({ actorUid: caller.uid, centreId: req.params.id, action: 'CENTRE_SUSPENDED', after: { reason } });
        return res.json({ success: true });
      }
      if (type === 'delete-centre') {
        const reason = String(req.body?.reason || '').trim().slice(0, 300);
        if (!reason) return res.status(400).json({ error: 'A reason is required to delete a facility.' });
        await deleteCentreCascade(req.params.id, caller.uid, reason);
        return res.json({ success: true });
      }
      if (type === 'reactivate') {
        const reason = String(req.body?.reason || '').trim().slice(0, 300);
        if (!reason) return res.status(400).json({ error: 'A reason is required.' });
        await cRef.update({ status: 'active', suspendedReason: null });
        await audit({ actorUid: caller.uid, centreId: req.params.id, action: 'CENTRE_REACTIVATED', after: { reason } });
        return res.json({ success: true });
      }
      return res.status(400).json({ error: 'Unknown action.' });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[tos/facilities] action failed:', error?.message || error);
      res.status(500).json({ error: 'Action failed.' });
    }
  });

  app.get('/api/tos/plans', async (req, res) => {
    try {
      const plansSnap = await adminDb.collection('platformPlans').get();
      const config = await getPlatformConfig();
      res.json({ plans: plansSnap.docs.map((d) => ({ id: d.id, ...d.data() })), config });
    } catch (error: any) {
      console.error('[tos/plans] read failed:', error?.message || error);
      res.status(500).json({ error: 'Could not load plans.' });
    }
  });

  app.post('/api/tos/plans', async (req, res) => {
    try {
      const caller = requireTos(req);
      const plans = Array.isArray(req.body?.plans) ? req.body.plans : [];
      const config = req.body?.config && typeof req.body.config === 'object' ? req.body.config : null;

      for (const p of plans) {
        const id = String(p?.id || '');
        if (!id) return res.status(400).json({ error: 'Each plan needs an id.' });
        const current = await getPlatformPlan(id);
        const update: Record<string, any> = {};
        const numeric = ['price', 'seatCap', 'trialSeatCap', 'trialDays'];
        const flags = ['studentChat', 'whatsappNotifications', 'aiEssayMarking', 'aiQuestionGen', 'aiPerformanceAnalysis'];
        numeric.forEach((k) => {
          if (p[k] !== undefined) {
            const n = Number(p[k]);
            if (!Number.isFinite(n) || n < 0) throw httpError(400, `${k} must be zero or more.`);
            update[k] = n;
          }
        });
        flags.forEach((k) => {
          if (p[k] !== undefined) update[k] = p[k] === true;
        });
        if (p.name !== undefined) update.name = String(p.name).slice(0, 80);
        if (Object.keys(update).length) {
          await adminDb.collection('platformPlans').doc(id).update(update);
          await audit({ actorUid: caller.uid, action: 'PLAN_UPDATED', before: { id, ...current }, after: { id, ...update } });
        }
      }

      let applied: any = null;
      if (config) {
        const update: Record<string, any> = {};
        ['trialDays', 'skipTrialDiscountPct', 'trialGraceDays', 'aiRouteRateLimitPerHour', 'billedSeatsMinimum', 'trialMaxSeats', 'paidMaxSeats', 'freeSeatsGeneral', 'paidSeatMinimum'].forEach((k) => {
          if (config[k] !== undefined) {
            const n = Number(config[k]);
            if (!Number.isFinite(n) || n < 0) throw httpError(400, `${k} must be zero or more.`);
            update[k] = n;
          }
        });
        if (config.paidSeatsUnlimited !== undefined) update.paidSeatsUnlimited = config.paidSeatsUnlimited === true;
        // Batch 27: the account facilities pay into and the admin WhatsApp
        // number are platform settings too.
        ['payAccountName', 'payAccountNumber', 'payBank', 'tosWhatsappNumber'].forEach((k) => {
          if (config[k] !== undefined) update[k] = String(config[k]).trim().slice(0, 120);
        });
        if (Object.keys(update).length) {
          await adminDb.collection('platformConfig').doc('global').update(update);
          // Batch 25: the saved numbers reach every facility NOW. The sweep
          // trims or tops up each facility's free-seat grant (override wins)
          // and holds trial facilities to the trial paid-seat cap, detaching
          // the students on removed seats.
          try {
            applied = await enforceSeatConfigAcrossFacilities(await getPlatformConfig());
            await audit({ actorUid: caller.uid, action: 'CONFIG_ENFORCED', after: { update, applied } });
          } catch (sweepError: any) {
            console.error('[tos/plans] config enforcement sweep failed:', sweepError?.message || sweepError);
          }
        }
      }
      res.json({ success: true, ...(applied ? { applied } : {}) });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[tos/plans] update failed:', error?.message || error);
      res.status(500).json({ error: 'Could not save plan changes.' });
    }
  });

  app.get('/api/tos/audit', async (req, res) => {
    try {
      const centreId = String(req.query.centreId || '');
      const queryText = String(req.query.query || '').toLowerCase();
      const snap = centreId
        ? await adminDb.collection('auditLogs').where('centreId', '==', centreId).limit(200).get()
        : await adminDb.collection('auditLogs').orderBy('at', 'desc').limit(200).get();
      const entries = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as any))
        .filter((e: any) => !queryText || JSON.stringify(e).toLowerCase().includes(queryText))
        .sort((a: any, b: any) => String(b.at || '').localeCompare(String(a.at || '')));
      res.json({ entries });
    } catch (error: any) {
      console.error('[tos/audit] failed:', error?.message || error);
      res.status(500).json({ error: 'Could not load the audit log.' });
    }
  });

  app.post('/api/tos/billing-sweep', async (req, res) => {
    try {
      const caller = requireTos(req);
      const result = await runBillingSweep();
      await audit({ actorUid: caller.uid, action: 'BILLING_SWEEP_RUN', after: result });
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error('[billing-sweep] manual run failed:', error?.message || error);
      res.status(500).json({ error: 'Billing sweep failed.' });
    }
  });

  // ==========================================================================
  // INTERNAL: billing sweep, protected by the INTERNAL_API_SECRET header.
  // ==========================================================================
  app.post('/api/internal/billing-sweep', async (req, res) => {
    try {
      const result = await runBillingSweep();
      await audit({ actorUid: 'system:billing-sweep', action: 'BILLING_SWEEP_RUN', after: result });
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error('[billing-sweep] failed:', error?.message || error);
      res.status(500).json({ error: 'Billing sweep failed.' });
    }
  });

  // Routes split into tosRoutes2.ts (manual centre creation, access-code
  // setting, team, directory views) register here so they stay behind the
  // same /api/tos guard and ahead of the static/SPA fallback.
  // Batch 38: the public partnership-proposal page (per-facility link with
  // social preview tags + client-side PDF). Unauthenticated by design.
  registerProposalRoutes(app);
  registerProposalApiRoutes(app);

  registerTosRoutes2(app);
  registerChatRoutes(app);

  // Platform question bank: authoring + the versioned Cloudinary publish
  // pipeline. Same /api/tos guard; nothing here writes without confirm.
  registerQuestionBankRoutes(app);
}
