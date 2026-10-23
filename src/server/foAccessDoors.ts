import express from "express";
import { adminApp, adminAuth, projectId, databaseId } from "./firebaseAdmin";

/**
 * Fo Firebase access doors (phase 2, 2026-10-23, user-approved build).
 *
 * Extends the data-only proxy (foDbProxy.ts) with five more doors that all run
 * through this server's own Firebase service credential. Every door sits under
 * /api/internal/fs/... so the same x-fo-key gate in server.ts protects it, and
 * every call is logged with [fo-fb-door].
 *
 * Doors:
 *   1. rules   (READ-ONLY: the live rulesets; publishing stays in the console)
 *   2. backup  (export is safe; import requires confirm === "IMPORT")
 *   3. auth    (list + lookup are reads; disable/enable, claims and reset link
 *               are reversible; DELETE requires confirm === "DELETE <uid>")
 *   4. storage (read-only listings of buckets and objects)
 *   5. push    (FCM v1 send, for reminders the user asks for)
 *
 * No door ever returns credentials, tokens, or password material. Upstream
 * Firebase errors are surfaced verbatim so a missing service-account role is
 * visible instead of being hidden behind a generic message.
 */

const TAG = "[fo-fb-door]";

type Body = Record<string, unknown>;

function reject(res: express.Response, status: number, message: string) {
  res.status(status).json({ error: message });
}

function str(body: Body, key: string, max = 256): string {
  const v = body[key];
  return typeof v === "string" ? v.slice(0, max) : "";
}

const BUCKET_RE = /^[a-z0-9][a-z0-9._-]{1,220}$/;
const GSPATH_RE = /^[A-Za-z0-9._/-]{0,300}$/;
const OP_RE =
  /^projects\/[a-zA-Z0-9-]+\/databases\/[a-zA-Z0-9-]+\/operations\/[A-Za-z0-9_.-]+$/;
const UID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

async function bearerToken(): Promise<string> {
  const cred = (adminApp.options as any)?.credential;
  if (!cred || typeof cred.getAccessToken !== "function") {
    throw new Error("This server has no Firebase credential available for API calls.");
  }
  const tok: any = await cred.getAccessToken();
  const token = tok?.accessToken || tok?.access_token;
  if (!token) throw new Error("Could not obtain an access token for the Firebase API.");
  return String(token);
}

async function googleApi(
  url: string,
  method: "GET" | "POST",
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const token = await bearerToken();
  const fetchFn = (globalThis as any).fetch as
    | ((u: string, i?: unknown) => Promise<any>)
    | undefined;
  if (typeof fetchFn !== "function") {
    throw new Error("This runtime has no HTTP client for Google API calls.");
  }
  const res = await fetchFn(url, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = String(await res.text().catch(() => ""));
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: Number(res.status), json };
}

function upstreamFail(
  res: express.Response,
  what: string,
  r: { status: number; json: any },
) {
  const msg =
    r.json?.error?.message ||
    (typeof r.json?.error === "string" ? r.json.error : "") ||
    r.json?.raw ||
    `HTTP ${r.status}`;
  console.error(`${TAG} ${what}: HTTP ${r.status} ${msg}`);
  return res
    .status(502)
    .json({ ok: false, error: `${what} (Firebase answered ${r.status}).`, upstream: String(msg).slice(0, 500) });
}

function sanitizeUser(u: any) {
  return {
    uid: u?.uid || "",
    email: u?.email || "",
    emailVerified: !!u?.emailVerified,
    displayName: u?.displayName || "",
    disabled: !!u?.disabled,
    customClaims: u?.customClaims || {},
    creationTime: u?.metadata?.creationTime || "",
    lastSignInTime: u?.metadata?.lastSignInTime || "",
    providers: (u?.providerData || []).map((p: any) => p?.providerId || "").filter(Boolean),
  };
}

export function registerFoAccessDoors(app: express.Express): void {
  const dbId = databaseId || "(default)";

  // ------------------------------------------------------------------
  // Door 1: live Firestore rules (READ-ONLY, by design).
  // ------------------------------------------------------------------
  app.post("/api/internal/fs/fb/rules", async (_req, res) => {
    try {
      const base = `https://firebaserules.googleapis.com/v1/projects/${projectId}`;
      const list = await googleApi(`${base}/releases`, "GET");
      if (list.status !== 200) return upstreamFail(res, "Listing rules releases failed", list);
      const releases: any[] = list.json?.releases || [];
      const firestoreReleases = releases.filter((r) =>
        String(r?.name || "").toLowerCase().includes("firestore"),
      );
      if (firestoreReleases.length === 0) {
        console.log(`${TAG} rules: no firestore releases visible`);
        return res.json({ ok: true, releases: [], rulesets: [] });
      }
      const seen = new Set<string>();
      const rulesets: any[] = [];
      for (const rel of firestoreReleases.slice(0, 6)) {
        const rulesetName = String(rel?.rulesetName || "");
        if (!rulesetName || seen.has(rulesetName)) continue;
        seen.add(rulesetName);
        const got = await googleApi(
          `https://firebaserules.googleapis.com/v1/${rulesetName}`,
          "GET",
        );
        if (got.status !== 200) {
          rulesets.push({ release: rel?.name, ruleset: rulesetName, error: got.json?.error?.message || `HTTP ${got.status}` });
          continue;
        }
        const files = (got.json?.source?.files || []).map((f: any) => ({
          name: f?.name || "",
          content: String(f?.content || ""),
        }));
        rulesets.push({ release: rel?.name, ruleset: rulesetName, files });
      }
      console.log(`${TAG} rules: ${firestoreReleases.length} release(s), ${rulesets.length} ruleset(s) read`);
      res.json({ ok: true, releases: firestoreReleases.map((r) => r?.name), rulesets });
    } catch (err: any) {
      console.error(`${TAG} rules failed:`, err?.message || err);
      reject(res, 500, `The rules read failed on the server: ${String(err?.message || err).slice(0, 300)}`);
    }
  });

  // ------------------------------------------------------------------
  // Door 2: backups (export / status / gated import).
  // ------------------------------------------------------------------
  app.post("/api/internal/fs/fb/backup/export", async (req, res) => {
    const body = (req.body || {}) as Body;
    const bucket = str(body, "bucket", 222);
    const prefix = str(body, "prefix", 300);
    if (!BUCKET_RE.test(bucket)) return reject(res, 400, "A valid Cloud Storage bucket name is required.");
    if (prefix && !GSPATH_RE.test(prefix)) return reject(res, 400, "The backup path has characters that are not allowed.");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const out = `gs://${bucket}/${prefix ? prefix.replace(/\/+$/, "") + "/" : "tos-backup-"}${stamp}`;
    try {
      const r = await googleApi(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}:exportDocuments`,
        "POST",
        { outputUriPrefix: out },
      );
      if (r.status !== 200) return upstreamFail(res, "Starting the export failed", r);
      const name = String(r.json?.name || "");
      console.log(`${TAG} backup export started -> ${out} op=${name}`);
      res.json({ ok: true, operation: name, destination: out, done: !!r.json?.done, metadata: r.json?.metadata || {} });
    } catch (err: any) {
      console.error(`${TAG} backup export failed:`, err?.message || err);
      reject(res, 500, `The export could not start: ${String(err?.message || err).slice(0, 300)}`);
    }
  });

  app.post("/api/internal/fs/fb/backup/status", async (req, res) => {
    const body = (req.body || {}) as Body;
    const op = str(body, "operation", 400);
    try {
      if (op) {
        if (!OP_RE.test(op)) return reject(res, 400, "That is not a valid Firestore operation name.");
        const r = await googleApi(`https://firestore.googleapis.com/v1/${op}`, "GET");
        if (r.status !== 200) return upstreamFail(res, "Reading the operation failed", r);
        console.log(`${TAG} backup status ${op}: ${r.json?.done ? "done" : "running"}`);
        return res.json({ ok: true, operation: r.json });
      }
      const r = await googleApi(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/operations`,
        "GET",
      );
      if (r.status !== 200) return upstreamFail(res, "Listing operations failed", r);
      const ops: any[] = (r.json?.operations || []).slice(0, 20);
      console.log(`${TAG} backup status: ${ops.length} recent operation(s)`);
      res.json({
        ok: true,
        operations: ops.map((o) => ({
          name: o?.name || "",
          done: !!o?.done,
          destination: o?.metadata?.outputUriPrefix || o?.metadata?.inputUriPrefix || "",
          error: o?.error?.message || "",
        })),
      });
    } catch (err: any) {
      console.error(`${TAG} backup status failed:`, err?.message || err);
      reject(res, 500, `The operation status read failed: ${String(err?.message || err).slice(0, 300)}`);
    }
  });

  app.post("/api/internal/fs/fb/backup/import", async (req, res) => {
    const body = (req.body || {}) as Body;
    const bucket = str(body, "bucket", 222);
    const path = str(body, "path", 300);
    const confirm = str(body, "confirm", 40);
    if (!BUCKET_RE.test(bucket)) return reject(res, 400, "A valid Cloud Storage bucket name is required.");
    if (!path || !GSPATH_RE.test(path)) return reject(res, 400, "A valid backup path is required.");
    if (confirm !== "IMPORT") {
      return reject(res, 403, "Importing overwrites data. It is refused without confirm: \"IMPORT\".");
    }
    try {
      const r = await googleApi(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}:importDocuments`,
        "POST",
        { inputUriPrefix: `gs://${bucket}/${path}` },
      );
      if (r.status !== 200) return upstreamFail(res, "Starting the import failed", r);
      const name = String(r.json?.name || "");
      console.log(`${TAG} backup IMPORT started <- gs://${bucket}/${path} op=${name}`);
      res.json({ ok: true, operation: name });
    } catch (err: any) {
      console.error(`${TAG} backup import failed:`, err?.message || err);
      reject(res, 500, `The import could not start: ${String(err?.message || err).slice(0, 300)}`);
    }
  });

  // ------------------------------------------------------------------
  // Door 3: Auth accounts (reads; reversible actions; gated delete).
  // ------------------------------------------------------------------
  app.post("/api/internal/fs/fb/auth/list", async (req, res) => {
    const body = (req.body || {}) as Body;
    const maxRaw = Number(body.max || 200);
    const max = Number.isFinite(maxRaw) ? Math.min(Math.max(1, Math.floor(maxRaw)), 500) : 200;
    const pageToken = str(body, "pageToken", 512);
    try {
      const r = await adminAuth.listUsers(max, pageToken || undefined);
      console.log(`${TAG} auth list: ${r.users.length} account(s)`);
      res.json({
        ok: true,
        count: r.users.length,
        pageToken: (r as any).pageToken || "",
        users: r.users.map(sanitizeUser),
      });
    } catch (err: any) {
      console.error(`${TAG} auth list failed:`, err?.message || err);
      reject(res, 500, `The account listing failed: ${String(err?.message || err).slice(0, 300)}`);
    }
  });

  app.post("/api/internal/fs/fb/auth/lookup", async (req, res) => {
    const body = (req.body || {}) as Body;
    const uid = str(body, "uid", 128);
    const email = str(body, "email", 200);
    if (!uid && !email) return reject(res, 400, "Give a uid or an email to look up.");
    try {
      const u = uid ? await adminAuth.getUser(uid) : await adminAuth.getUserByEmail(email);
      console.log(`${TAG} auth lookup ${uid ? `uid=${uid}` : `email`}: found`);
      res.json({ ok: true, found: true, user: sanitizeUser(u) });
    } catch (err: any) {
      const code = String(err?.code || "");
      if (code.includes("user-not-found")) {
        console.log(`${TAG} auth lookup: not found`);
        return res.json({ ok: true, found: false });
      }
      console.error(`${TAG} auth lookup failed:`, err?.message || err);
      reject(res, 500, `The account lookup failed: ${String(err?.message || err).slice(0, 300)}`);
    }
  });

  app.post("/api/internal/fs/fb/auth/action", async (req, res) => {
    const body = (req.body || {}) as Body;
    const action = str(body, "action", 40);
    const uid = str(body, "uid", 128);
    const email = str(body, "email", 200);
    const confirm = str(body, "confirm", 160);
    if (!["disable", "enable", "set-claims", "reset-link", "delete"].includes(action)) {
      return reject(res, 400, "Unknown auth action.");
    }
    try {
      if (action === "disable" || action === "enable") {
        if (!uid || !UID_RE.test(uid)) return reject(res, 400, "A valid uid is required.");
        await adminAuth.updateUser(uid, { disabled: action === "disable" });
        console.log(`${TAG} auth action ${action} uid=${uid}`);
        return res.json({ ok: true, action, uid, disabled: action === "disable" });
      }
      if (action === "set-claims") {
        if (!uid || !UID_RE.test(uid)) return reject(res, 400, "A valid uid is required.");
        const claims = (body.claims && typeof body.claims === "object" ? body.claims : {}) as Record<string, unknown>;
        await adminAuth.setCustomUserClaims(uid, claims);
        console.log(`${TAG} auth action set-claims uid=${uid}`);
        return res.json({ ok: true, action, uid, claims });
      }
      if (action === "reset-link") {
        if (!email) return reject(res, 400, "An email address is required for a reset link.");
        const link = await adminAuth.generatePasswordResetLink(email);
        console.log(`${TAG} auth action reset-link (link not logged)`);
        return res.json({ ok: true, action, email, link });
      }
      // delete: the one-way door, doubly gated.
      if (!uid || !UID_RE.test(uid)) return reject(res, 400, "A valid uid is required.");
      if (confirm !== `DELETE ${uid}`) {
        return reject(res, 403, `Deleting an Auth account is permanent. It needs confirm: "DELETE ${uid}".`);
      }
      await adminAuth.deleteUser(uid);
      console.log(`${TAG} auth action DELETE uid=${uid}`);
      res.json({ ok: true, action, uid, deleted: true });
    } catch (err: any) {
      console.error(`${TAG} auth action ${action} failed:`, err?.message || err);
      reject(res, 500, `The auth action failed: ${String(err?.message || err).slice(0, 300)}`);
    }
  });

  // ------------------------------------------------------------------
  // Door 4: Cloud Storage listings (read-only).
  // ------------------------------------------------------------------
  app.post("/api/internal/fs/fb/storage/buckets", async (_req, res) => {
    try {
      const r = await googleApi(`https://storage.googleapis.com/storage/v1/b?project=${projectId}`, "GET");
      if (r.status !== 200) return upstreamFail(res, "Listing buckets failed", r);
      const buckets: string[] = (r.json?.items || []).map((b: any) => String(b?.name || "")).filter(Boolean);
      console.log(`${TAG} storage buckets: ${buckets.length}`);
      res.json({ ok: true, buckets });
    } catch (err: any) {
      console.error(`${TAG} storage buckets failed:`, err?.message || err);
      reject(res, 500, `The bucket listing failed: ${String(err?.message || err).slice(0, 300)}`);
    }
  });

  app.post("/api/internal/fs/fb/storage/objects", async (req, res) => {
    const body = (req.body || {}) as Body;
    const bucket = str(body, "bucket", 222);
    const prefix = str(body, "prefix", 300);
    const maxRaw = Number(body.max || 100);
    const max = Number.isFinite(maxRaw) ? Math.min(Math.max(1, Math.floor(maxRaw)), 200) : 100;
    if (!BUCKET_RE.test(bucket)) return reject(res, 400, "A valid Cloud Storage bucket name is required.");
    if (prefix && !GSPATH_RE.test(prefix)) return reject(res, 400, "The prefix has characters that are not allowed.");
    try {
      const q = new URLSearchParams({ maxResults: String(max) });
      if (prefix) q.set("prefix", prefix);
      const r = await googleApi(
        `https://storage.googleapis.com/storage/v1/b/${bucket}/o?${q.toString()}`,
        "GET",
      );
      if (r.status !== 200) return upstreamFail(res, "Listing objects failed", r);
      const items: any[] = (r.json?.items || []).map((o: any) => ({
        name: String(o?.name || ""),
        size: o?.size || "0",
        contentType: o?.contentType || "",
        updated: o?.updated || "",
      }));
      console.log(`${TAG} storage objects ${bucket}: ${items.length}`);
      res.json({ ok: true, bucket, count: items.length, items });
    } catch (err: any) {
      console.error(`${TAG} storage objects failed:`, err?.message || err);
      reject(res, 500, `The object listing failed: ${String(err?.message || err).slice(0, 300)}`);
    }
  });

  // ------------------------------------------------------------------
  // Door 5: push notifications (FCM v1), for reminders the user asks for.
  // ------------------------------------------------------------------
  app.post("/api/internal/fs/fb/push/send", async (req, res) => {
    const body = (req.body || {}) as Body;
    const to = str(body, "to", 512);
    const toType = str(body, "toType", 10) || "token";
    const title = str(body, "title", 120);
    const bodyText = str(body, "body", 400);
    const dataRaw = body.data && typeof body.data === "object" ? (body.data as Record<string, unknown>) : {};
    if (!to) return reject(res, 400, "A device token or topic is required.");
    if (!["token", "topic"].includes(toType)) return reject(res, 400, "toType must be token or topic.");
    const data: Record<string, string> = {};
    for (const [k, v] of Object.entries(dataRaw)) {
      if (typeof k === "string" && k.length <= 64) data[k.slice(0, 64)] = String(v).slice(0, 512);
    }
    const message: Record<string, unknown> = toType === "token" ? { token: to } : { topic: to };
    if (title || bodyText) message.notification = { title, body: bodyText };
    if (Object.keys(data).length > 0) message.data = data;
    try {
      const r = await googleApi(
        `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
        "POST",
        { message },
      );
      if (r.status !== 200) return upstreamFail(res, "Sending the notification failed", r);
      console.log(`${TAG} push sent to ${toType}=${to.slice(0, 12)}...`);
      res.json({ ok: true, messageId: r.json?.name || r.json?.messageId || "" });
    } catch (err: any) {
      console.error(`${TAG} push send failed:`, err?.message || err);
      reject(res, 500, `The notification could not be sent: ${String(err?.message || err).slice(0, 300)}`);
    }
  });
}
