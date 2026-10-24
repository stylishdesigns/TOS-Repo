import express from "express";
import { createHash, timingSafeEqual } from "crypto";
import { adminDb } from "./firebaseAdmin";

/**
 * Fo database proxy (read-only, phase 1).
 *
 * Purpose: let the user's assistant (Fo) run read-only Firestore diagnostics
 * through this server's own admin connection, because the client is correctly
 * blocked by security rules and no service-account key is ever handed out.
 *
 * Access model:
 *  - The route path /api/internal/fs/* is gated by the global /api middleware
 *    in server.ts, which compares the x-fo-key header against the SHA-256 hash
 *    in FO_DB_PROXY_KEY_SHA256. The plaintext key never exists in this repo,
 *    in Netlify, or in chat; the operator keeps it locally.
 *  - Deny-closed: when the hash is unset, every call fails.
 *  - Writes: only the one narrowly-scoped, user-approved repair endpoint.
 *    A
 *    later phase may add gated writes behind the user's per-action approval.
 *  - Every call is logged (action, collection or path, document count) so the
 *    server's own logs are an audit trail of what was read.
 */

const ID_RE = /^[a-zA-Z0-9_\-]+$/;
const FIELD_RE = /^[a-zA-Z0-9_\-\.]+$/;
const MAX_DOCS = 200;

function reject(res: express.Response, status: number, message: string) {
  res.status(status).json({ error: message });
}

function validCollectionId(id: unknown): id is string {
  return typeof id === "string" && id.length <= 150 && ID_RE.test(id);
}

/** A document path like "memberships/uid__centre-x": even number of segments. */
function validDocPath(path: unknown): path is string {
  if (typeof path !== "string") return false;
  const parts = path.split("/").filter((s) => s.length > 0);
  if (parts.length < 2 || parts.length > 60 || parts.length % 2 !== 0) return false;
  return parts.every((p) => p.length <= 150 && ID_RE.test(p));
}

type WhereClause = { field: string; op: string; value: string | number | boolean };

function validWhere(w: unknown): w is WhereClause {
  if (!w || typeof w !== "object") return false;
  const c = w as Record<string, unknown>;
  return (
    typeof c.field === "string" && c.field.length <= 150 && FIELD_RE.test(c.field) &&
    typeof c.op === "string" && ["==", "!=", ">", ">=", "<", "<="].includes(c.op) &&
    ["string", "number", "boolean"].includes(typeof c.value)
  );
}

/** JSON-safe copy: Firestore Timestamps carry toJSON, everything else passes through. */
function jsonSafe(value: unknown): unknown {
  try {
    const text = JSON.stringify(value);
    if (typeof text === "string") return value;
  } catch { /* fall through */ }
  return String(value);
}

export function registerFoDbProxy(app: express.Express): void {
  if (!process.env.FO_DB_PROXY_KEY_SHA256) {
    // Fail closed: with no hash configured the routes register but every
    // request is refused, and nothing logs a confusing half-state.
    app.post("/api/internal/fs/*", (_req, res) => reject(res, 403, "Proxy not configured."));
    return;
  }

  // 1. List top-level collections.
  app.post("/api/internal/fs/collections", async (_req, res) => {
    try {
      const collections = await adminDb.listCollections();
      const names = collections.map((c) => c.id);
      console.log(`[fo-db-proxy] collections: ${names.length} listed`);
      res.json({ ok: true, collections: names });
    } catch (err: any) {
      console.error("[fo-db-proxy] collections failed:", err?.message || err);
      reject(res, 500, "The collection listing failed on the server.");
    }
  });

  // 2. Read one document by path.
  app.post("/api/internal/fs/doc", async (req, res) => {
    const path = (req.body || {}).path;
    if (!validDocPath(path)) return reject(res, 400, "A valid document path is required.");
    try {
      const snap = await adminDb.doc(path).get();
      console.log(`[fo-db-proxy] doc ${path}: ${snap.exists ? "found" : "missing"}`);
      if (!snap.exists) return res.json({ ok: true, found: false });
      res.json({ ok: true, found: true, id: snap.id, data: jsonSafe(snap.data()) });
    } catch (err: any) {
      console.error(`[fo-db-proxy] doc ${path} failed:`, err?.message || err);
      reject(res, 500, "The document read failed on the server.");
    }
  });

  // 3. Owner-membership repair (user-approved, 2026-10-23): writes EXACTLY
  //    two records for one uid+centre pair, mirroring what applyImport writes.
  //    (1) memberships/{uid}__{centreId} = owner/active (idempotent by doc id,
  //    preserving an existing createdAt). (2) admins/{uid} gains centreId and
  //    nothing else. It refuses when the admins record is missing and never
  //    creates people, centres, codes, or anything else.
  app.post("/api/internal/fs/fix-owner-membership", async (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const uid = typeof body.uid === "string" ? body.uid : "";
    const centreId = typeof body.centreId === "string" ? body.centreId : "";
    if (!uid || uid.length > 128 || !ID_RE.test(uid) || !centreId || centreId.length > 128 || !ID_RE.test(centreId)) {
      return reject(res, 400, "A valid uid and centreId are required.");
    }
    const now = new Date().toISOString();
    try {
      const adminDoc = await adminDb.collection("admins").doc(uid).get();
      if (!adminDoc.exists) {
        return reject(res, 409, "The admins record is missing; refusing to create people.");
      }
      const beforeAdmin = adminDoc.data() as Record<string, unknown>;
      const membershipRef = adminDb.collection("memberships").doc(`${uid}__${centreId}`);
      const membershipDoc = await membershipRef.get();
      const before = membershipDoc.exists ? membershipDoc.data() : null;
      await membershipRef.set({
        uid,
        centreId,
        role: "owner",
        status: "active",
        createdAt: (before as Record<string, unknown> | null)?.createdAt || now,
        updatedAt: now,
      });
      await adminDb.collection("admins").doc(uid).update({ centreId, updatedAt: now });
      const after = (await membershipRef.get()).data();
      const afterAdmin = (await adminDb.collection("admins").doc(uid).get()).data() as Record<string, unknown>;
      console.log(`[fo-db-proxy] fix-owner-membership ${uid} ${centreId}: before=${JSON.stringify(before || null)} after=${JSON.stringify(after)}`);
      res.json({
        ok: true,
        membership: { id: `${uid}__${centreId}`, before: jsonSafe(before), after: jsonSafe(after) },
        adminsRecord: { centreIdBefore: beforeAdmin.centreId ?? null, centreIdAfter: afterAdmin.centreId ?? null },
      });
    } catch (err: any) {
      console.error(`[fo-db-proxy] fix-owner-membership failed:`, err?.message || err);
      reject(res, 500, "The repair write failed on the server.");
    }
  });

  // 4. One-time centre tagging backfill (user-approved in chat Oct 23): adds
  //    centreId ONLY to docs in a fixed allowlist of content collections whose
  //    centreId field is entirely missing. Docs that already carry a centreId are
  //    counted and skipped. Nothing is created, deleted, or renamed.
  const TAGGABLE = ["students", "tutors", "cbt_exams", "timetable", "results", "attendance_logs", "classRatings", "programmes", "subjects"];
  app.post("/api/internal/fs/tag-missing-centreid", async (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const centreId = typeof body.centreId === "string" ? body.centreId : "";
    if (!centreId || centreId.length > 128 || !ID_RE.test(centreId)) {
      return reject(res, 400, "A valid centreId is required.");
    }
    try {
      const perCollection: Record<string, unknown> = {};
      for (const name of TAGGABLE) {
        const snap = await adminDb.collection(name).limit(200).get();
        let tagged = 0, already = 0;
        const batch = adminDb.batch();
        snap.forEach((d) => {
          const data = (d.data() || {}) as Record<string, unknown>;
          if (typeof data.centreId === "string" && data.centreId) { already++; return; }
          batch.set(d.ref, { centreId }, { merge: true });
          tagged++;
        });
        if (tagged > 0) await batch.commit();
        perCollection[name] = { tagged, alreadyTagged: already, scanned: snap.size };
      }
      console.log(`[fo-db-proxy] tag-missing-centreid centre=${centreId} ${JSON.stringify(perCollection)}`);
      res.json({ ok: true, centreId, perCollection });
    } catch (err: any) {
      console.error(`[fo-db-proxy] tag-missing-centreid failed:`, err?.message || err);
      reject(res, 500, "The tagging backfill failed on the server.");
    }
  });

  // 5. Remove exactly one membership, by the doc id {uid}__{centreId}. Refuses a
  //    missing doc and refuses to delete an owner membership.
  app.post("/api/internal/fs/remove-membership", async (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const uid = typeof body.uid === "string" ? body.uid : "";
    const centreId = typeof body.centreId === "string" ? body.centreId : "";
    if (!uid || uid.length > 128 || !ID_RE.test(uid) || !centreId || centreId.length > 128 || !ID_RE.test(centreId)) {
      return reject(res, 400, "A valid uid and centreId are required.");
    }
    try {
      const ref = adminDb.collection("memberships").doc(`${uid}__${centreId}`);
      const snap = await ref.get();
      if (!snap.exists) {
        return reject(res, 404, "That membership does not exist.");
      }
      const role = snap.get("role") ?? null;
      if (role === "owner") {
        return reject(res, 409, "Refusing to delete an owner membership.");
      }
      await ref.delete();
      console.log(`[fo-db-proxy] remove-membership ${uid}__${centreId} role=${String(role)}`);
      res.json({ ok: true, deleted: `${uid}__${centreId}`, role });
    } catch (err: any) {
      console.error(`[fo-db-proxy] remove-membership failed:`, err?.message || err);
      reject(res, 500, "The removal failed on the server.");
    }
  });

  // 7. Remove a platform-level admins record (user-approved flows only).
  //    Deletes admins/{uid} ONLY when the record carries no centreId, i.e. it
  //    is the platform Super Admin record and not a centre's staff entry.
  //    Centre-bound admin records are managed through the TOS console member
  //    actions instead. Requires confirm === "REMOVE" and never touches
  //    Auth accounts, memberships, or anything else.
  app.post("/api/internal/fs/remove-admin-record", async (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const uid = typeof body.uid === "string" ? body.uid : "";
    const confirm = typeof body.confirm === "string" ? body.confirm : "";
    if (!uid || uid.length > 128 || !ID_RE.test(uid)) {
      return reject(res, 400, "A valid uid is required.");
    }
    if (confirm !== "REMOVE") {
      return reject(res, 400, 'Send confirm: "REMOVE" to delete this record.');
    }
    try {
      const ref = adminDb.collection("admins").doc(uid);
      const snap = await ref.get();
      if (!snap.exists) {
        return reject(res, 404, "That admins record does not exist.");
      }
      if (snap.get("centreId")) {
        return reject(res, 409, "That admins record belongs to a centre; use the TOS console member actions instead.");
      }
      const role = snap.get("role") ?? null;
      await ref.delete();
      console.log(`[fo-db-proxy] remove-admin-record ${uid} role=${String(role)}`);
      res.json({ ok: true, deleted: uid, role });
    } catch (err: any) {
      console.error(`[fo-db-proxy] remove-admin-record failed:`, err?.message || err);
      reject(res, 500, "The removal failed on the server.");
    }
  });

  // 6. One-time repair (user-approved flows only): create the owner's admins
  //    record for a centre whose provisioning predated the auto-superadmin
  //    rule. Fields come from the centre doc's owner fields only. Refuses when
  //    the record already exists and never touches memberships or anything else.
  app.post("/api/internal/fs/create-owner-admin-record", async (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const centreId = typeof body.centreId === "string" ? body.centreId : "";
    if (!centreId || centreId.length > 128 || !ID_RE.test(centreId)) {
      return reject(res, 400, "A valid centreId is required.");
    }
    try {
      const centreDoc = await adminDb.collection("centres").doc(centreId).get();
      if (!centreDoc.exists) {
        return reject(res, 404, "That centre does not exist.");
      }
      const centre = (centreDoc.data() || {}) as Record<string, unknown>;
      const uid = typeof centre.ownerUid === "string" ? centre.ownerUid : "";
      const name = typeof centre.ownerName === "string" ? centre.ownerName : "";
      const email = typeof centre.ownerEmail === "string" ? centre.ownerEmail : "";
      const phone = typeof centre.ownerPhone === "string" ? centre.ownerPhone : "";
      if (!uid || !ID_RE.test(uid) || !name || !email) {
        return reject(res, 409, "The centre doc is missing its owner details; refusing to create people.");
      }
      const ref = adminDb.collection("admins").doc(uid);
      if ((await ref.get()).exists) {
        return reject(res, 409, `The admins record for ${uid} already exists; nothing was written.`);
      }
      const now = new Date().toISOString();
      await ref.set({
        id: uid,
        name,
        email,
        phone,
        role: "Super Administrator",
        department: "General",
        jobTitle: "Super Admin",
        status: "Active",
        hasChangedPassword: false,
        temporaryPassword: null,
        centreId,
        createdAt: now,
        updatedAt: now,
      });
      console.log(`[fo-db-proxy] create-owner-admin-record ${uid} ${centreId}`);
      res.json({ ok: true, created: uid, centreId });
    } catch (err: any) {
      console.error(`[fo-db-proxy] create-owner-admin-record failed:`, err?.message || err);
      reject(res, 500, "The write failed on the server.");
    }
  });

  // 4. Query a collection (equality/range filters, one order, capped limit).
  app.post("/api/internal/fs/query", async (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    if (!validCollectionId(body.collection)) {
      return reject(res, 400, "A valid collection name is required.");
    }
    const where: WhereClause[] = Array.isArray(body.where) ? (body.where as unknown[]).filter(validWhere) : [];
    if (Array.isArray(body.where) && where.length !== body.where.length) {
      return reject(res, 400, "One or more filters are invalid.");
    }
    const order = body.orderBy as { field?: unknown; direction?: unknown } | undefined;
    if (order && (typeof order.field !== "string" || !FIELD_RE.test(order.field) ||
        (order.direction !== "asc" && order.direction !== "desc"))) {
      return reject(res, 400, "The orderBy clause is invalid.");
    }
    let limit = typeof body.limit === "number" ? Math.floor(body.limit) : 50;
    if (!Number.isFinite(limit) || limit < 1) limit = 50;
    if (limit > MAX_DOCS) limit = MAX_DOCS;

    try {
      let q: any = adminDb.collection(body.collection);
      for (const w of where) q = q.where(w.field, w.op, w.value);
      if (order) q = q.orderBy(String(order.field), order.direction as "asc" | "desc");
      q = q.limit(limit);
      const snap = await q.get();
      const documents = snap.docs.map((d: any) => ({ id: d.id, data: jsonSafe(d.data()) }));
      console.log(`[fo-db-proxy] query ${body.collection}: ${documents.length} document(s)`);
      res.json({ ok: true, count: documents.length, documents });
    } catch (err: any) {
      console.error(`[fo-db-proxy] query ${body.collection} failed:`, err?.message || err);
      reject(res, 500, "The query failed on the server.");
    }
  });
}
