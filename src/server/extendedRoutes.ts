import express from 'express';
import * as crypto from 'crypto';
import { STARTING_CONFIG } from './platformDefaults';
import { adminAuth, adminDb } from './firebaseAdmin';
import {
  Caller,
  effectiveStatus,
  getPlatformConfig,
  getPlatformPlan,
  httpError,
  requireMembership,
} from './tenantService';
import {
  buildVerificationEmail,
  emailProviderConfigured,
  sendEmail,
} from './email';
import {
  completeFirstLogin,
  normalizeEmail,
  provisionCentre,
  regenerateAccessCode,
  resendCredentials,
  runBillingSweep,
} from './provisioning';
import { deleteCentreCascade, loadBillingMap, registerTosRoutes2 } from './tosRoutes2';
import { registerChatRoutes } from './chatRoutes';
import { registerQuestionBankRoutes } from './questionBankRoutes';

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
        background_color: '#0F172A',
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
      res.json({ success: true, accessCode });
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
      const counts: Record<string, number> = { trial: 0, pending_payment: 0, active: 0, overdue: 0, suspended: 0 };
      let seatsUsed = 0;
      let seatsCap = 0;
      const trialsEndingSoon: any[] = [];
      const weekAhead = Date.now() + 7 * DAY_MS;
      centresSnap.docs.forEach((d) => {
        const centre = { id: d.id, ...(d.data() as any) };
        const billing = billingMap.get(d.id) || null;
        const status = effectiveStatus(centre, billing, config);
        counts[status] = (counts[status] || 0) + 1;
        if (billing) {
          seatsUsed += billing.activeStudentCount || 0;
          seatsCap += billing.seatCap || 0;
          const endsAt = billing.trialEndsAt ? new Date(billing.trialEndsAt) : null;
          if (endsAt && !isNaN(endsAt.getTime()) && endsAt.getTime() > Date.now() && endsAt.getTime() <= weekAhead) {
            trialsEndingSoon.push({ centreId: d.id, name: centre.name, endsAt: billing.trialEndsAt });
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
        trialsEndingSoon,
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
            planId: billing?.planId || null,
            seatsUsed: billing?.activeStudentCount ?? null,
            seatCap: billing?.seatCap ?? null,
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
      res.json({ centres });
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
      const paymentsSnap = await adminDb.collection('billingPayments').where('centreId', '==', req.params.id).limit(100).get();
      const auditSnap = await adminDb.collection('auditLogs').where('centreId', '==', req.params.id).limit(50).get();
      res.json({
        centre: { id: cDoc.id, ...cDoc.data() },
        billing: bDoc.exists ? bDoc.data() : null,
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
      if (type === 'extend-trial') {
        const days = Number(req.body?.days);
        if (!Number.isInteger(days) || days < 1 || days > 365) return res.status(400).json({ error: 'Days must be between 1 and 365.' });
        const billing = (bDoc.data() || {}) as any;
        if (billing.skippedTrial) return res.status(400).json({ error: 'This facility skipped the trial; there is no trial to extend.' });
        const current = billing.trialEndsAt ? new Date(billing.trialEndsAt).getTime() : Date.now();
        const base = Math.max(current, Date.now());
        const trialEndsAt = new Date(base + days * DAY_MS).toISOString();
        await bRef.update({ trialEndsAt });
        await auditChange('TRIAL_EXTENDED', { trialEndsAt, days });
        return res.json({ success: true, trialEndsAt });
      }
      if (type === 'start-trial') {
        const config = await getPlatformConfig();
        const days = Math.floor(Number((config as any)?.trialDays ?? STARTING_CONFIG.trialDays));
        if (!Number.isInteger(days) || days < 1) return res.status(400).json({ error: 'The trial length is not configured; set it under platform settings first.' });
        const trialEndsAt = new Date(Date.now() + days * DAY_MS).toISOString();
        await bRef.set({ trialEndsAt, skippedTrial: false }, { merge: true });
        await auditChange('TRIAL_STARTED', { trialEndsAt, days });
        return res.json({ success: true, trialEndsAt });
      }
      if (type === 'regenerate-access-code') {
        const result = await regenerateAccessCode(req.params.id, caller.uid, 'tos');
        return res.json({ success: true, accessCode: result.accessCode });
      }
      if (type === 'resend-credentials') {
        const result = await resendCredentials(req.params.id, caller.uid);
        return res.json({ success: true, delivered: result.delivered, ...(result.tempPassword ? { tempPassword: result.tempPassword } : {}) });
      }
      if (type === 'record-payment') {
        const amount = Number(req.body?.amount);
        const periodEnd = String(req.body?.periodEnd || '');
        const method = String(req.body?.method || '').trim().slice(0, 60);
        const reference = String(req.body?.reference || '').trim().slice(0, 120);
        const note = String(req.body?.note || '').trim().slice(0, 500);
        if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Enter a payment amount.' });
        if (!periodEnd || isNaN(new Date(periodEnd).getTime())) return res.status(400).json({ error: 'Enter the period the payment covers.' });
        if (!bDoc.exists) return res.status(400).json({ error: 'This facility has no billing document yet.' });
        await adminDb.collection('billingPayments').add({
          centreId: req.params.id,
          amount,
          periodCoveredUntil: new Date(periodEnd).toISOString(),
          method,
          reference,
          note,
          actorUid: caller.uid,
          at: new Date().toISOString(),
        });
        await bRef.update({ paidThrough: new Date(periodEnd).toISOString() });
        await cRef.update({ status: 'active', credentialsNotDelivered: false });
        await auditChange('PAYMENT_RECORDED', { amount, periodCoveredUntil: new Date(periodEnd).toISOString(), method, reference });
        return res.json({ success: true });
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

      if (config) {
        const update: Record<string, any> = {};
        ['trialDays', 'skipTrialDiscountPct', 'trialGraceDays', 'seatSwapLimitPerStudent', 'seatSwapWindowDays', 'aiRouteRateLimitPerHour', 'billedSeatsMinimum'].forEach((k) => {
          if (config[k] !== undefined) {
            const n = Number(config[k]);
            if (!Number.isFinite(n) || n < 0) throw httpError(400, `${k} must be zero or more.`);
            update[k] = n;
          }
        });
        if (Object.keys(update).length) {
          await adminDb.collection('platformConfig').doc('global').update(update);
          await audit({ actorUid: caller.uid, action: 'CONFIG_UPDATED', after: update });
        }
      }
      res.json({ success: true });
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
  registerTosRoutes2(app);
  registerChatRoutes(app);

  // Platform question bank: authoring + the versioned Cloudinary publish
  // pipeline. Same /api/tos guard; nothing here writes without confirm.
  registerQuestionBankRoutes(app);
}
