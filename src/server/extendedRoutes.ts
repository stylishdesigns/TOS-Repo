import express from 'express';
import * as crypto from 'crypto';
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

/**
 * Prompt C routes: public lead capture and verification, the TOS platform
 * console API, owner access-code management, first-login completion, and the
 * internal billing sweep. Registered from server.ts BEFORE the static/SPA
 * fallback so no GET route is ever swallowed by it.
 *
 * Enforcement lives here (Express + Admin SDK) and in Firestore rules, never
 * only in the UI. The /api/public/* and /api/internal/* prefixes are
 * unauthenticated by design; /public/leads/verify is gated by a one-time
 * token and /internal/* by the INTERNAL_API_SECRET header (checked by the
 * global middleware in server.ts). Everything else requires a verified
 * Firebase ID token, and TOS routes additionally require the `tos` claim.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

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
  const studentCount = Number(body.studentCount);
  const examTypes = Array.isArray(body.examTypes)
    ? body.examTypes.map((t: any) => String(t).trim()).filter(Boolean).slice(0, 10)
    : [];
  const skipTrial = body.skipTrial === true;
  const phoneDigits = phoneRaw.replace(/\D/g, '');
  if (fullName.length < 2 || fullName.length > 100) return 'Please give your full name.';
  if (businessName.length < 2 || businessName.length > 120) return 'Please give your centre name.';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'That email address does not look right.';
  if (phoneDigits.length < 7 || phoneDigits.length > 15) return 'That phone number does not look right.';
  if (!Number.isInteger(studentCount) || studentCount < 1 || studentCount > 10000) return 'How many students do you teach?';
  if (!state || state.length > 60) return 'Please choose a state.';
  if (!city || city.length > 60) return 'Please tell us your city.';
  if (!examTypes.length) return 'Pick at least one exam type you teach.';
  return { fullName, businessName, email, phone: phoneDigits, state, city, studentCount, examTypes, skipTrial };
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
      if (!cDoc.exists) return res.status(404).json({ error: 'Centre not found.' });
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

  const loadBillingMap = async (centreIds: string[]): Promise<Map<string, any>> => {
    const map = new Map<string, any>();
    for (let i = 0; i < centreIds.length; i += 100) {
      const refs = centreIds.slice(i, i + 100).map((id) => adminDb.collection('centreBilling').doc(id));
      const docs = await adminDb.getAll(...refs);
      docs.forEach((d) => {
        if (d.exists) map.set(d.id, d.data());
      });
    }
    return map;
  };

  app.get('/api/tos/overview', async (req, res) => {
    try {
      const config = await getPlatformConfig();
      const centresSnap = await adminDb.collection('centres').limit(200).get();
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
      const leadsSnap = await adminDb.collection('leads').limit(200).get();
      const leadCounts: Record<string, number> = {};
      leadsSnap.docs.forEach((d) => {
        const s = (d.data() as any).status || 'unknown';
        leadCounts[s] = (leadCounts[s] || 0) + 1;
      });
      const auditSnap = await adminDb.collection('auditLogs').orderBy('at', 'desc').limit(10).get();
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
            createdAt: centre.createdAt,
          };
        })
        .filter((c) => {
          if (statusFilter && c.billingStatus !== statusFilter) return false;
          if (queryText && !`${c.name} ${c.ownerEmail}`.toLowerCase().includes(queryText)) return false;
          return true;
        })
        .sort((a: any, b: any) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      res.json({ centres });
    } catch (error: any) {
      console.error('[tos/centres] failed:', error?.message || error);
      res.status(500).json({ error: 'Could not load centres.' });
    }
  });

  app.get('/api/tos/centres/:id', async (req, res) => {
    try {
      const cDoc = await adminDb.collection('centres').doc(req.params.id).get();
      if (!cDoc.exists) return res.status(404).json({ error: 'Centre not found.' });
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
      console.error('[tos/centres] detail failed:', error?.message || error);
      res.status(500).json({ error: 'Could not load the centre.' });
    }
  });

  app.post('/api/tos/centres/:id/action', async (req, res) => {
    try {
      const caller = requireTos(req);
      const cRef = adminDb.collection('centres').doc(req.params.id);
      const cDoc = await cRef.get();
      if (!cDoc.exists) return res.status(404).json({ error: 'Centre not found.' });
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
        if (billing.skippedTrial) return res.status(400).json({ error: 'This centre skipped the trial; there is no trial to extend.' });
        const current = billing.trialEndsAt ? new Date(billing.trialEndsAt).getTime() : Date.now();
        const base = Math.max(current, Date.now());
        const trialEndsAt = new Date(base + days * DAY_MS).toISOString();
        await bRef.update({ trialEndsAt });
        await auditChange('TRIAL_EXTENDED', { trialEndsAt, days });
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
        if (!bDoc.exists) return res.status(400).json({ error: 'This centre has no billing document yet.' });
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
      console.error('[tos/centres] action failed:', error?.message || error);
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

  app.get('/api/tos/team', async (req, res) => {
    try {
      const staff: any[] = [];
      let pageToken: string | undefined = undefined;
      for (let i = 0; i < 5; i++) {
        const list = await adminAuth.listUsers(1000, pageToken);
        list.users.forEach((u) => {
          if ((u.customClaims || {}).tos === true) {
            staff.push({ uid: u.uid, email: u.email, role: (u.customClaims || {}).tosRole || 'owner' });
          }
        });
        if (!list.pageToken) break;
        pageToken = list.pageToken;
      }
      res.json({ staff });
    } catch (error: any) {
      console.error('[tos/team] failed:', error?.message || error);
      res.status(500).json({ error: 'Could not load the team.' });
    }
  });

  app.post('/api/tos/team', async (req, res) => {
    try {
      const caller = requireTos(req);
      const email = normalizeEmail(String(req.body?.email || ''));
      const role = String(req.body?.role || 'support');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email.' });
      if (!['owner', 'support'].includes(role)) return res.status(400).json({ error: 'Role must be owner or support.' });
      let user;
      try {
        user = await adminAuth.getUserByEmail(email);
      } catch {
        return res.status(404).json({ error: 'No account with that email yet. They must sign in once first, then you can add them.' });
      }
      const claims = (user.customClaims || {}) as Record<string, any>;
      if (claims.tos === true) return res.status(400).json({ error: 'That person is already TOS staff.' });
      await adminAuth.setCustomUserClaims(user.uid, { ...claims, tos: true, tosRole: role });
      await audit({ actorUid: caller.uid, action: 'STAFF_ADDED', after: { email, role } });
      res.json({ success: true });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[tos/team] add failed:', error?.message || error);
      res.status(500).json({ error: 'Could not add staff.' });
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
}
