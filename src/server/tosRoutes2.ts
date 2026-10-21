import express from 'express';
import { adminAuth, adminDb } from './firebaseAdmin';
import { FieldPath } from 'firebase-admin/firestore';
import type { CollectionReference, Query, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { Caller, effectiveStatus, getPlatformConfig, httpError } from './tenantService';
import { normalizeEmail, provisionCentre, setAccessCode } from './provisioning';

/**
 * TOS console routes split out of extendedRoutes.ts: manual centre creation
 * and owner access-code setting (Prompt F), the team routes, and the
 * platform directory views (Prompt D). Registered from extendedRoutes.ts so
 * every route here stays behind the /api/tos guard and ahead of the
 * static/SPA fallback. Enforcement lives here, never only in the UI.
 */

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

function audit(entry: Record<string, any>): Promise<unknown> {
  return adminDb
    .collection('auditLogs')
    .add({ ...entry, at: entry.at || new Date().toISOString() })
    .catch((err) => console.error('[tosRoutes2] audit write failed:', err?.message || err));
}

export const loadBillingMap = async (centreIds: string[]): Promise<Map<string, any>> => {
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


  // ==========================================================================
  // Platform-wide directory views (Prompt D, read only). Every route requires
  // the `tos` claim, returns only whitelisted fields (never password fields
  // or tokens), and pages with limits and cursors: no whole-collection reads.
  // ==========================================================================

  const DIRECTORY_DEFAULT_PAGE = 25;
  const DIRECTORY_MAX_PAGE = 100;
  const DIRECTORY_SCAN_CAP = 2000; // per-request scan ceiling for windowed reads

  function parseDirectoryQuery(req: express.Request): { pageSize: number; cursor: string; search: string } {
    const raw = Number(req.query.pageSize);
    const pageSize = Number.isFinite(raw) && raw > 0
      ? Math.min(Math.floor(raw), DIRECTORY_MAX_PAGE)
      : DIRECTORY_DEFAULT_PAGE;
    return {
      pageSize,
      cursor: String(req.query.cursor || ''),
      search: String(req.query.search || '').trim().toLowerCase(),
    };
  }

  function searchHit(fields: any[], search: string): boolean {
    if (!search) return true;
    return fields.some((v) => String(v || '').toLowerCase().includes(search));
  }

  // Walk a collection in document-id order with equality filters only, so no
  // composite index is required. The caller stops once its page is full; a
  // single request never reads more than maxDocs documents.
  async function* scanBatches(params: {
    col: CollectionReference;
    filters?: [string, any][];
    cursor?: string;
    maxDocs: number;
  }): AsyncGenerator<{ docs: QueryDocumentSnapshot[]; lastId: string; done: boolean }> {
    let remaining = params.maxDocs;
    let after = params.cursor || '';
    while (remaining > 0) {
      const batch = Math.min(400, remaining);
      let q: Query = params.col;
      for (const [field, value] of params.filters || []) q = q.where(field, '==', value);
      q = q.orderBy(FieldPath.documentId()).limit(batch);
      if (after) q = q.startAfter(after);
      const snap = await q.get();
      if (snap.empty) return;
      remaining -= snap.size;
      const lastId = snap.docs[snap.docs.length - 1]!.id;
      const done = snap.size < batch;
      yield { docs: snap.docs, lastId, done };
      if (done) return;
      after = lastId;
    }
  }

  async function lookupUsers(uids: string[]): Promise<Map<string, any>> {
    const map = new Map<string, any>();
    const unique = Array.from(new Set(uids.map((u) => String(u || '')).filter(Boolean)));
    for (let i = 0; i < unique.length; i += 100) {
      try {
        const result = await adminAuth.getUsers(unique.slice(i, i + 100).map((uid) => ({ uid })));
        for (const u of result.users) map.set(u.uid, u);
      } catch (e: any) {
        console.error('[tos directory] user lookup failed:', e?.message || e);
      }
    }
    return map;
  }

  async function centreNameMap(ids: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const unique = Array.from(new Set(ids.map((i) => String(i || '')).filter(Boolean)));
    await Promise.all(unique.map(async (id) => {
      try {
        const snap = await adminDb.collection('centres').doc(id).get();
        if (snap.exists) map.set(id, String((snap.data() as any)?.name || id));
      } catch (e: any) {
        console.error('[tos directory] centre lookup failed:', e?.message || e);
      }
    }));
    return map;
  }

  // Seat status for a page of students, read from their centre memberships
  // (membership id is `${uid}__${centreId}`).
  async function seatStatusMap(rows: { uid?: string; centreId?: string }[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const refs = rows
      .filter((r) => r.uid && r.centreId)
      .map((r) => adminDb.collection('memberships').doc(`${r.uid}__${r.centreId}`));
    for (let i = 0; i < refs.length; i += 50) {
      const snaps = await Promise.all(refs.slice(i, i + 50).map((ref) => ref.get()));
      for (const snap of snaps) {
        if (snap.exists) map.set(snap.id, String((snap.data() as any)?.status || 'unknown'));
      }
    }
    return map;
  }

export function registerTosRoutes2(app: express.Express): void {
  // ==========================================================================
  // Manual centre creation (Prompt F item 1). TOS staff create a centre and
  // its owner directly, without the public sign-up form. The temporary
  // password (from the portal's Generate button) is validated here, used for
  // the new Auth account, and shown once; the mustChangePassword claim keeps
  // the owner on the password-change screen until they set their own.
  // ==========================================================================
  app.post('/api/tos/centres', async (req, res) => {
    try {
      const caller = requireTos(req);
      const body = req.body || {};
      const fullName = String(body.fullName || '').trim();
      const businessName = String(body.businessName || '').trim();
      const email = normalizeEmail(String(body.email || ''));
      const phoneDigits = String(body.phone || '').replace(/\D/g, '');
      const state = String(body.state || '').trim();
      const city = String(body.city || '').trim();
      const planId = String(body.planId || '').trim() || undefined;
      const skipTrial = body.skipTrial === true;
      const tempPassword = String(body.tempPassword || '');
      const accessCode = String(body.accessCode || '').trim();
      if (fullName.length < 2 || fullName.length > 100) return res.status(400).json({ error: 'Please give the owner full name.' });
      if (businessName.length < 2 || businessName.length > 120) return res.status(400).json({ error: 'Please give the centre name.' });
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'That email address does not look right.' });
      if (phoneDigits.length < 7 || phoneDigits.length > 15) return res.status(400).json({ error: 'That phone number does not look right.' });
      if (accessCode && !/^\d{6}$/.test(accessCode)) return res.status(400).json({ error: 'The access code must be exactly 6 digits, or left blank to generate one.' });
      // A manual centre starts from a fresh account so the temporary password
      // and the first-login lock apply. An email that already has an account
      // keeps that account's password, which would defeat the flow.
      try {
        await adminAuth.getUserByEmail(email);
        return res.status(409).json({ error: 'An account with this email already exists. Pick a different email, or ask the owner to sign in with that account.' });
      } catch (err: any) {
        if (err?.code !== 'auth/user-not-found') {
          console.error('[tos/centres] auth lookup failed:', err?.code || err);
          return res.status(500).json({ error: 'Could not look up the account. Please try again.' });
        }
      }
      const result = await provisionCentre({
        fullName,
        businessName,
        email,
        phone: phoneDigits,
        studentCount: Number.isInteger(body.studentCount) && body.studentCount > 0 ? Number(body.studentCount) : 0,
        state,
        city,
        examTypes: [],
        skipTrial,
        source: 'tos',
        actorUid: caller.uid,
        ...(planId ? { planId } : {}),
        ...(tempPassword ? { tempPassword } : {}),
        ...(accessCode ? { preferredAccessCode: accessCode } : {}),
      });
      await audit({
        actorUid: caller.uid,
        centreId: result.centreId,
        action: 'CENTRE_CREATED_MANUALLY',
        at: new Date().toISOString(),
        after: { ownerEmail: email, planId: planId || 'centre_standard', skipTrial, createdAuthUser: result.createdAuthUser },
      });
      return res.json({
        success: true,
        centreId: result.centreId,
        centreName: result.centreName,
        accessCode: result.accessCode,
        welcomeDelivered: result.welcomeDelivered,
        ...(result.tempPassword ? { tempPassword: result.tempPassword } : {}),
      });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[tos/centres] create failed:', error?.message || error);
      res.status(500).json({ error: 'Could not create the centre. Please try again.' });
    }
  });

  app.post('/api/tos/centres/:id/access-code', async (req, res) => {
    try {
      const caller = requireTos(req);
      const result = await setAccessCode(req.params.id, String(req.body?.code || ''), caller.uid, 'tos');
      return res.json({ success: true, accessCode: result.accessCode });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[tos/centres] access-code set failed:', error?.message || error);
      res.status(500).json({ error: 'Could not set the access code.' });
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

  app.get('/api/tos/owners', async (req, res) => {
    try {
      requireTos(req);
      const { search } = parseDirectoryQuery(req);
      const centresSnap = await adminDb.collection('centres').limit(200).get();
      const config = await getPlatformConfig();
      const billingMap = await loadBillingMap(centresSnap.docs.map((d) => d.id));
      const users = await lookupUsers(centresSnap.docs.map((d) => String((d.data() as any).ownerUid || '')));
      const owners = centresSnap.docs
        .map((d) => {
          const centre = { id: d.id, ...(d.data() as any) };
          const billing = billingMap.get(d.id) || null;
          const u = users.get(String(centre.ownerUid || ''));
          return {
            centreId: d.id,
            centreName: String(centre.name || d.id),
            uid: centre.ownerUid || '',
            name: u?.displayName || '',
            email: u?.email || '',
            phone: u?.phoneNumber || '',
            status: effectiveStatus(centre, billing, config),
            lastSignInTime: u?.lastSignInTime || '',
          };
        })
        .filter((row) => searchHit([row.centreName, row.name, row.email], search));
      res.json({ owners, total: centresSnap.size });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[tos/owners] failed:', error?.message || error);
      res.status(500).json({ error: 'Could not load centre owners.' });
    }
  });

  app.get('/api/tos/students', async (req, res) => {
    try {
      requireTos(req);
      const { pageSize, cursor, search } = parseDirectoryQuery(req);
      const centreId = String(req.query.centreId || '');
      const seatFilter = String(req.query.status || '');
      const col = adminDb.collection('students');
      const filters: [string, any][] = centreId ? [['centreId', centreId]] : [];
      const rows: any[] = [];
      let nextCursor = '';
      const names = new Map<string, string>();
      for await (const batch of scanBatches({ col, filters, cursor, maxDocs: DIRECTORY_SCAN_CAP })) {
        const batchData: any[] = batch.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        const seats = await seatStatusMap(batchData);
        const unknownCentres = batchData.map((s) => String(s.centreId || '')).filter((c) => c && !names.has(c));
        (await centreNameMap(unknownCentres)).forEach((v, k) => names.set(k, v));
        for (const s of batchData) {
          const seatStatus = seats.get(`${s.uid}__${s.centreId}`) || 'unknown';
          if (seatFilter && seatStatus !== seatFilter) continue;
          if (!searchHit([s.name, s.email, s.phone], search)) continue;
          rows.push({
            id: s.id,
            uid: s.uid || '',
            name: s.name || '',
            email: s.email || '',
            phone: s.phone || '',
            centreId: s.centreId || '',
            centreName: names.get(String(s.centreId || '')) || String(s.centreId || ''),
            seatStatus,
            registrationDate: s.registrationDate || '',
          });
          if (rows.length >= pageSize) {
            nextCursor = batch.lastId;
            break;
          }
        }
        if (rows.length >= pageSize) break;
        if (batch.done) { nextCursor = ''; break; }
      }
      // Real counts per centre via count() aggregations (bounded to the first
      // 50 centres by id; these queries read no documents).
      const centresSnap = await adminDb.collection('centres').limit(50).get();
      const counts: Record<string, number> = {};
      await Promise.all(centresSnap.docs.map(async (c) => {
        try {
          const agg = await col.where('centreId', '==', c.id).count().get();
          counts[c.id] = agg.data().count || 0;
        } catch (e: any) {
          counts[c.id] = -1;
        }
      }));
      res.json({ students: rows, nextCursor, counts, totalCentres: centresSnap.size });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[tos/students] failed:', error?.message || error);
      res.status(500).json({ error: 'Could not load students.' });
    }
  });

  app.get('/api/tos/tutors', async (req, res) => {
    try {
      requireTos(req);
      const { pageSize, cursor, search } = parseDirectoryQuery(req);
      const col = adminDb.collection('tutors');
      const groups = new Map<string, any>();
      const names = new Map<string, string>();
      let nextCursor = '';
      for await (const batch of scanBatches({ col, cursor, maxDocs: DIRECTORY_SCAN_CAP })) {
        const batchData: any[] = batch.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        const unknownCentres = batchData.map((t) => String(t.centreId || '')).filter((c) => c && !names.has(c));
        (await centreNameMap(unknownCentres)).forEach((v, k) => names.set(k, v));
        for (const t of batchData) {
          if (!searchHit([t.name, t.email, t.phone], search)) continue;
          const key = String(t.email || t.phone || t.id).toLowerCase();
          const group = groups.get(key) || {
            key,
            name: t.name || '',
            email: t.email || '',
            phone: t.phone || '',
            centres: new Map<string, any>(),
          };
          if (t.centreId) {
            group.centres.set(String(t.centreId), {
              id: t.centreId,
              name: names.get(String(t.centreId)) || String(t.centreId),
              status: t.status || '',
            });
          }
          groups.set(key, group);
        }
        if (batch.done) { nextCursor = ''; break; }
        if (groups.size >= pageSize) { nextCursor = batch.lastId; break; }
      }
      const tutors = Array.from(groups.values()).map((g) => ({ ...g, centres: Array.from(g.centres.values()) }));
      res.json({ tutors, nextCursor });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[tos/tutors] failed:', error?.message || error);
      res.status(500).json({ error: 'Could not load tutors.' });
    }
  });

  app.get('/api/tos/centres/:id/people', async (req, res) => {
    try {
      requireTos(req);
      const centreId = String(req.params.id || '');
      const type = String(req.query.type || 'students');
      const { pageSize, cursor, search } = parseDirectoryQuery(req);
      if (!centreId) throw httpError(400, 'Centre is required.');
      if (!['owners', 'admins', 'tutors', 'students'].includes(type)) throw httpError(400, 'Unknown people type.');

      // Counts and seats first: cheap aggregation reads, no documents fetched.
      const [ownersCount, adminsCount, tutorsCount, studentsCount] = await Promise.all([
        adminDb.collection('memberships').where('centreId', '==', centreId).where('role', '==', 'owner').count().get()
          .then((s) => s.data().count || 0).catch(() => 0),
        adminDb.collection('memberships').where('centreId', '==', centreId).where('role', '==', 'admin').count().get()
          .then((s) => s.data().count || 0).catch(() => 0),
        adminDb.collection('tutors').where('centreId', '==', centreId).count().get()
          .then((s) => s.data().count || 0).catch(() => 0),
        adminDb.collection('students').where('centreId', '==', centreId).count().get()
          .then((s) => s.data().count || 0).catch(() => 0),
      ]);
      const billingSnap = await adminDb.collection('centreBilling').doc(centreId).get();
      const seats = {
        used: Number((billingSnap.data() as any)?.activeStudentCount || 0),
        cap: Number((billingSnap.data() as any)?.seatCap || 0),
      };

      const rows: any[] = [];
      let nextCursor = '';

      if (type === 'owners' || type === 'admins') {
        const role = type === 'owners' ? 'owner' : 'admin';
        for await (const batch of scanBatches({
          col: adminDb.collection('memberships'),
          filters: [['centreId', centreId], ['role', role]],
          cursor,
          maxDocs: DIRECTORY_SCAN_CAP,
        })) {
          const batchData: any[] = batch.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
          const users = await lookupUsers(batchData.map((m) => String(m.uid || '')));
          for (const m of batchData) {
            const u = users.get(String(m.uid || ''));
            if (!searchHit([u?.displayName, u?.email, u?.phoneNumber], search)) continue;
            rows.push({
              uid: m.uid || '',
              name: u?.displayName || '',
              email: u?.email || '',
              phone: u?.phoneNumber || '',
              status: m.status || '',
              createdAt: m.createdAt || '',
              lastSignInTime: u?.lastSignInTime || '',
            });
            if (rows.length >= pageSize) { nextCursor = batch.lastId; break; }
          }
          if (rows.length >= pageSize) break;
          if (batch.done) { nextCursor = ''; break; }
        }
        if (type === 'owners' && !cursor) {
          // Legacy centres may have no owner membership row; always surface
          // the centre's recorded ownerUid as well.
          const centreSnap = await adminDb.collection('centres').doc(centreId).get();
          const ownerUid = String((centreSnap.data() as any)?.ownerUid || '');
          if (ownerUid && !rows.some((r) => r.uid === ownerUid)) {
            const u = (await lookupUsers([ownerUid])).get(ownerUid);
            rows.unshift({
              uid: ownerUid,
              name: u?.displayName || '',
              email: u?.email || '',
              phone: u?.phoneNumber || '',
              status: 'owner of record',
              createdAt: '',
              lastSignInTime: u?.lastSignInTime || '',
            });
          }
        }
      } else if (type === 'tutors') {
        for await (const batch of scanBatches({
          col: adminDb.collection('tutors'),
          filters: [['centreId', centreId]],
          cursor,
          maxDocs: DIRECTORY_SCAN_CAP,
        })) {
          const batchData: any[] = batch.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
          for (const t of batchData) {
            if (!searchHit([t.name, t.email, t.phone], search)) continue;
            rows.push({
              id: t.id,
              name: t.name || '',
              email: t.email || '',
              phone: t.phone || '',
              status: t.status || '',
            });
            if (rows.length >= pageSize) { nextCursor = batch.lastId; break; }
          }
          if (rows.length >= pageSize) break;
          if (batch.done) { nextCursor = ''; break; }
        }
      } else {
        for await (const batch of scanBatches({
          col: adminDb.collection('students'),
          filters: [['centreId', centreId]],
          cursor,
          maxDocs: DIRECTORY_SCAN_CAP,
        })) {
          const batchData: any[] = batch.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
          const seatsMap = await seatStatusMap(batchData);
          for (const s of batchData) {
            const seatStatus = seatsMap.get(`${s.uid}__${s.centreId}`) || 'unknown';
            if (!searchHit([s.name, s.email, s.phone], search)) continue;
            rows.push({
              id: s.id,
              uid: s.uid || '',
              name: s.name || '',
              email: s.email || '',
              phone: s.phone || '',
              seatStatus,
              registrationDate: s.registrationDate || '',
            });
            if (rows.length >= pageSize) { nextCursor = batch.lastId; break; }
          }
          if (rows.length >= pageSize) break;
          if (batch.done) { nextCursor = ''; break; }
        }
      }

      res.json({
        type,
        counts: { owners: ownersCount, admins: adminsCount, tutors: tutorsCount, students: studentsCount },
        seats,
        items: rows,
        nextCursor,
      });
    } catch (error: any) {
      if (error?.status) return res.status(error.status).json({ error: error.message });
      console.error('[tos/centre-people] failed:', error?.message || error);
      res.status(500).json({ error: 'Could not load the centre people.' });
    }
  });
}
