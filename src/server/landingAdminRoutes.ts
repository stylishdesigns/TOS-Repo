import express from 'express';
import { adminDb } from './firebaseAdmin';
import { defaultLandingContent, isLandingContent, LandingContent, TEMPLATE_PRESETS, normalizeTemplateId } from '../landing/landingContent';
import { Caller } from './tenantService';
import { centreIdForCaller } from './landingLeadRoutes';

/**
 * TOS-admin routes for centre landing pages (piece 2 of the landing-page
 * feature) plus the facility-admin routes (piece 4) that let each centre's
 * own admin edit their landing page from the centre portal. The public read
 * lives in landingRoutes.ts; these routes let TOS staff edit and publish any
 * centre's public marketing content, and let a facility admin edit ONLY their
 * own facility's page (the facility id is resolved from their admins record,
 * never from the request).
 *
 * The same privacy rule as the public side: ONLY public marketing content is
 * stored in centreLandingPages/{centreId}. Every field written here is
 * clamped, length-capped and re-validated, so nothing private can ride along.
 */

const CENTRE_ID_RE = /^[a-zA-Z0-9_-]{3,64}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const MAX_HERO_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB before upload

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function safeHref(v: unknown): string {
  const s = str(v, 300);
  return s.startsWith('/') || s.startsWith('#') ? s : '/';
}

/** Social page links must be real https addresses; anything else is dropped. */
function safeLink(v: unknown): string {
  const s = str(v, 200);
  return /^https:\/\/[^\s]+$/i.test(s) ? s : '';
}

function sanitizeLandingContent(raw: unknown): LandingContent {
  const v = (raw || {}) as Record<string, any>;
  const hero = (v.hero || {}) as Record<string, any>;
  const programs = (v.programs || {}) as Record<string, any>;
  const whyUs = (v.whyUs || {}) as Record<string, any>;
  const testimonials = (v.testimonials || {}) as Record<string, any>;
  const contact = (v.contact || {}) as Record<string, any>;
  const footer = (v.footer || {}) as Record<string, any>;

  const buttons = Array.isArray(hero.buttons) ? hero.buttons.slice(0, 3) : [];
  const badges = Array.isArray(hero.badges) ? hero.badges.slice(0, 8) : [];
  const stats = Array.isArray(v.stats) ? v.stats.slice(0, 4) : [];
  const pCards = Array.isArray(programs.cards) ? programs.cards.slice(0, 6) : [];
  const wCards = Array.isArray(whyUs.cards) ? whyUs.cards.slice(0, 6) : [];
  const quotes = Array.isArray(testimonials.quotes) ? testimonials.quotes.slice(0, 6) : [];

  const photoUrl = str(hero.photoUrl, 600);

  const out: LandingContent = {
    templateId: normalizeTemplateId(v.templateId && typeof v.templateId === 'string' && TEMPLATE_PRESETS.some((tp) => tp.id === v.templateId) ? v.templateId : v.templateId === 'classic-orange' ? 'classic-orange' : 'scholar'),
    accent: HEX_RE.test(str(v.accent, 9)) ? str(v.accent, 9) : '#F2A93B',
    ribbon: str(v.ribbon, 120) || undefined,
    hero: {
      headline: str(hero.headline, 140) || 'Learn. Excel. Succeed with us.',
      subText: str(hero.subText, 500),
      photoUrl: photoUrl || undefined,
      buttons: buttons.map((b: any) => ({
        label: str(b?.label, 40) || 'Sign up',
        href: safeHref(b?.href),
        kind: b?.kind === 'ghost' ? 'ghost' : 'primary',
      })),
      badges: badges.map((b: unknown) => str(b, 48)).filter(Boolean),
    },
    stats: stats.map((s: any) => ({ value: str(s?.value, 12), label: str(s?.label, 60) })).filter((s) => s.value || s.label),
    programs: {
      title: str(programs.title, 80) || 'Our programs',
      lead: str(programs.lead, 300),
      cards: pCards.map((c: any) => ({
        icon: str(c?.icon, 16) || undefined,
        title: str(c?.title, 60),
        text: str(c?.text, 300),
      })).filter((c) => c.title || c.text),
    },
    whyUs: {
      title: str(whyUs.title, 80) || 'Why parents choose us',
      lead: str(whyUs.lead, 300),
      cards: wCards.map((c: any) => ({
        icon: str(c?.icon, 16) || undefined,
        title: str(c?.title, 60),
        text: str(c?.text, 300),
      })).filter((c) => c.title || c.text),
    },
    testimonials: {
      title: str(testimonials.title, 80) || 'What parents say',
      lead: str(testimonials.lead, 300),
      quotes: quotes.map((q: any) => ({
        quote: str(q?.quote, 500),
        name: str(q?.name, 60),
        role: str(q?.role, 80) || undefined,
      })).filter((q) => q.quote || q.name),
    },
    contact: {
      title: str(contact.title, 80) || 'Ready to enrol?',
      text: str(contact.text, 500),
      ctaLabel: str(contact.ctaLabel, 40) || 'Register your child now',
      address: str(contact.address, 200) || undefined,
      phone: str(contact.phone, 40) || undefined,
      hours: str(contact.hours, 120) || undefined,
    },
    footer: { copyright: str(footer.copyright, 120) },
    socials: {
      facebook: safeLink(v.socials?.facebook),
      instagram: safeLink(v.socials?.instagram),
      tiktok: safeLink(v.socials?.tiktok),
    },
  };
  // Firestore rejects undefined field values, so strip every undefined key
  // (this bit a real save: any empty optional field made the write throw).
  return JSON.parse(JSON.stringify(out)) as LandingContent;
}


function requireTos(req: express.Request): { uid: string } {
  const caller = (req as any).caller;
  if (!caller || !caller.uid) throw new Error('Unauthorized');
  if (!caller.tos) throw new Error('TOS staff only.');
  return caller;
}

/**
 * Resolve the signed-in facility admin to their own facility id. The id
 * always comes from the caller's admins record, never from the request, so an
 * admin can only ever read and write their own facility's page.
 */
async function requireCentreAdmin(req: express.Request): Promise<{ uid: string; centreId: string }> {
  const caller = (req as any).caller as Caller | undefined;
  if (!caller || !caller.uid) throw new Error('Unauthorized');
  const centreId = await centreIdForCaller(caller);
  if (!centreId) throw new Error('Only a facility admin can manage a landing page.');
  return { uid: caller.uid, centreId };
}

/** Shared read: one facility's landing content (stored, or the day-one starter). */
async function readLanding(centreId: string) {
  const db = adminDb;
  const [centreSnap, pageSnap] = await Promise.all([
    db.collection('centres').doc(centreId).get(),
    db.collection('centreLandingPages').doc(centreId).get(),
  ]);
  const centreName = String((centreSnap.data() as any)?.name || '');
  if (!centreSnap.exists) return null;
  const stored = pageSnap.data() as any;
  const content = isLandingContent(stored?.content) ? stored.content : defaultLandingContent(centreName);
  return {
    centreId,
    centreName,
    published: stored?.published === true,
    updatedAt: stored?.updatedAt || null,
    content,
  };
}

/** Shared save: write sanitized content for one facility. Returns null when the facility does not exist. */
async function saveLanding(callerUid: string, centreId: string, body: any) {
  const db = adminDb;
  const centreSnap = await db.collection('centres').doc(centreId).get();
  if (!centreSnap.exists) return null;
  const content = sanitizeLandingContent((body || {}).content);
  const published = (body || {}).published === true;
  const now = new Date().toISOString();
  await db.collection('centreLandingPages').doc(centreId).set({
    content,
    published,
    updatedAt: now,
    updatedBy: callerUid,
  }, { merge: true });
  return { success: true, published, updatedAt: now };
}

type HeroUpload = { ok: true; url: string } | { ok: false; status: number; error: string };

/** Shared hero upload: a data URL in, a hosted Cloudinary URL out. Same
 * unsigned preset the chat and status uploads use; a dedicated folder keeps
 * hero images separate. */
async function uploadHero(dataUrl: unknown): Promise<HeroUpload> {
  const m = /^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return { ok: false, status: 400, error: 'That file is not a photo this page can use.' };
  const bytes = Math.floor((m[2].length * 3) / 4);
  if (bytes > MAX_HERO_IMAGE_BYTES) return { ok: false, status: 413, error: 'Hero photos can be up to 8 MB.' };
  const cloud = String(process.env.CLOUDINARY_CLOUD_NAME || '');
  const preset = String(process.env.CLOUDINARY_UPLOAD_PRESET || '');
  if (!cloud || !preset) return { ok: false, status: 500, error: 'Photo hosting is not configured on this deployment.' };
  const form = new FormData();
  form.append('upload_preset', preset);
  form.append('folder', 'tos/hero');
  form.append('file', String(dataUrl));
  const resp = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: 'POST', body: form });
  const data: any = await resp.json().catch(() => null);
  const url = data && typeof data.secure_url === 'string' ? data.secure_url : '';
  if (!resp.ok || !url) return { ok: false, status: 502, error: 'The photo could not be uploaded. Try again.' };
  return { ok: true, url };
}

function statusFor(error: unknown): number {
  const msg = String((error as any)?.message || '');
  if (msg === 'Unauthorized') return 401;
  if (/facility admin/.test(msg)) return 403;
  return 500;
}

export function registerLandingAdminRoutes(app: express.Express): void {
  // ---- TOS staff: edit any facility's page from the Tutorial OS dashboard ----
  app.get('/api/tos/landing/:centreId', async (req, res) => {
    try {
      requireTos(req);
      const centreId = String(req.params.centreId || '');
      if (!CENTRE_ID_RE.test(centreId)) return res.status(400).json({ error: 'Invalid facility id.' });
      const out = await readLanding(centreId);
      if (!out) return res.status(404).json({ error: 'Facility not found.' });
      res.json(out);
    } catch (error: any) {
      console.error('[landing-admin] read failed:', error?.message || error);
      res.status(500).json({ error: 'Could not load this facility\'s landing content.' });
    }
  });

  // Save and/or publish a centre's landing content.
  app.put('/api/tos/landing/:centreId', async (req, res) => {
    try {
      const caller = requireTos(req);
      const centreId = String(req.params.centreId || '');
      if (!CENTRE_ID_RE.test(centreId)) return res.status(400).json({ error: 'Invalid facility id.' });
      const out = await saveLanding(caller.uid, centreId, req.body);
      if (!out) return res.status(404).json({ error: 'Facility not found.' });
      res.json(out);
    } catch (error: any) {
      console.error('[landing-admin] save failed:', error?.message || error);
      res.status(500).json({ error: 'Could not save this facility\'s landing content.' });
    }
  });

  app.post('/api/tos/landing/:centreId/hero-image', async (req, res) => {
    try {
      requireTos(req);
      const centreId = String(req.params.centreId || '');
      if (!CENTRE_ID_RE.test(centreId)) return res.status(400).json({ error: 'Invalid facility id.' });
      const up = await uploadHero((req.body as any)?.dataUrl);
      if (up.ok === false) return res.status(up.status).json({ error: up.error });
      res.json({ url: up.url });
    } catch (error: any) {
      console.error('[landing-admin] hero upload failed:', error?.message || error);
      res.status(500).json({ error: 'The photo could not be uploaded.' });
    }
  });

  // ---- Facility admins: only ever their own facility ----
  app.get('/api/centre/landing', async (req, res) => {
    try {
      const admin = await requireCentreAdmin(req);
      const out = await readLanding(admin.centreId);
      if (!out) return res.status(404).json({ error: 'Facility not found.' });
      res.json(out);
    } catch (error: any) {
      console.error('[landing-admin] facility read failed:', error?.message || error);
      const status = statusFor(error);
      res.status(status).json({ error: status === 500 ? 'Could not load this facility\'s landing content.' : String(error?.message || 'Unauthorized') });
    }
  });

  app.put('/api/centre/landing', async (req, res) => {
    try {
      const admin = await requireCentreAdmin(req);
      const out = await saveLanding(admin.uid, admin.centreId, req.body);
      if (!out) return res.status(404).json({ error: 'Facility not found.' });
      res.json(out);
    } catch (error: any) {
      console.error('[landing-admin] facility save failed:', error?.message || error);
      const status = statusFor(error);
      res.status(status).json({ error: status === 500 ? 'Could not save this facility\'s landing content.' : String(error?.message || 'Unauthorized') });
    }
  });

  app.post('/api/centre/landing/hero-image', async (req, res) => {
    try {
      await requireCentreAdmin(req);
      const up = await uploadHero((req.body as any)?.dataUrl);
      if (up.ok === false) return res.status(up.status).json({ error: up.error });
      res.json({ url: up.url });
    } catch (error: any) {
      console.error('[landing-admin] facility hero upload failed:', error?.message || error);
      const status = statusFor(error);
      res.status(status).json({ error: status === 500 ? 'The photo could not be uploaded.' : String(error?.message || 'Unauthorized') });
    }
  });
}
