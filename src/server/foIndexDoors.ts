import express from "express";
import { projectId, databaseId, adminDb } from "./firebaseAdmin";
import { INDEX_SPEC } from "./indexSpec";

/**
 * Fo index doors (2026-10-27, prompt S follow-up: the Past tab needs its
 * composite index and index deploys used to be a manual console errand).
 *
 * Two doors under /api/internal/fs/... behind the same x-fo-key gate as the
 * other doors:
 *   - list   GET: the composite indexes Firestore actually has, per collection.
 *   - deploy POST: creates ONE index, and only one that matches an entry in
 *     the bundled spec exactly, so nothing arbitrary can be created. 409
 *     (already exists) is reported as exists, not a failure.
 *   - check  POST: runs one bounded read-only query and reports whether the
 *     server answered it or asked for an index. No writes, limit capped low,
 *     value sizes capped.
 *
 * Every call is logged with [fo-index-door]. No door ever returns credentials
 * or tokens; upstream Firebase errors surface verbatim.
 */

const TAG = "[fo-index-door]";

type Body = Record<string, unknown>;

async function bearerToken(): Promise<string> {
  // Same source as the other doors: the server's own admin credential.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { adminApp } = await import("./firebaseAdmin");
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
  const res = await fetch(url, {
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

const normFields = (fields: any) =>
  (Array.isArray(fields) ? fields : []).map((f: any) => ({
    fieldPath: String(f?.fieldPath || ""),
    ...(f?.order ? { order: String(f.order).toUpperCase() } : {}),
    ...(f?.arrayConfig ? { arrayConfig: String(f.arrayConfig).toUpperCase() } : {}),
  }));

const sameFields = (a: any[], b: any[]) =>
  a.length === b.length &&
  a.every((f, i) => {
    const g = b[i];
    if (f.fieldPath !== g.fieldPath) return false;
    if ((f.order || "") !== (g.order || "")) return false;
    if ((f.arrayConfig || "") !== (g.arrayConfig || "")) return false;
    return true;
  });

export function registerFoIndexDoors(app: express.Express): void {
  const dbId = databaseId || "(default)";
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}`;

  // GET list?collection=mockAttempts — what Firestore holds right now.
  app.get("/api/internal/fs/fb/indexes/list", async (req, res) => {
    try {
      const col = String(req.query.collection || "").trim();
      if (col && !/^[A-Za-z0-9_-]{1,150}$/.test(col)) {
        return res.status(400).json({ ok: false, error: "Bad collection name." });
      }
      const url = col
        ? `${base}/collectionGroups/${col}/indexes?pageSize=200&showMissing=false`
        : `${base}/collectionGroups/-/indexes?pageSize=200&showMissing=false`;
      const r = await googleApi(url, "GET");
      if (r.status !== 200) {
        const msg = r.json?.error?.message || `HTTP ${r.status}`;
        console.error(`${TAG} list failed: HTTP ${r.status} ${msg}`);
        return res.status(502).json({ ok: false, error: String(msg).slice(0, 400) });
      }
      const rows = ((r.json?.indexes || []) as any[]).map((ix) => ({
        collection: String(ix.name || "").split("/collectionGroups/")[1]?.split("/indexes")[0] || "",
        queryScope: String(ix.queryScope || "COLLECTION"),
        fields: normFields(ix.fields),
        state: String(ix.state || ""),
        serving: Boolean(ix.serving),
      }));
      console.error(`${TAG} list: ${rows.length} composite indexes${col ? ` for ${col}` : ""}`);
      res.json({ ok: true, indexes: rows });
    } catch (error: any) {
      console.error(`${TAG} list threw:`, error?.message || error);
      res.status(500).json({ ok: false, error: "Index list failed." });
    }
  });

  // POST deploy — body { index: {collectionGroup, queryScope?, fields:[...] } }.
  // Only creates what the bundled spec declares, character for character.
  app.post("/api/internal/fs/fb/indexes/deploy", async (req, res) => {
    try {
      const body = (req.body || {}) as Body;
      const wanted = body.index as any;
      const collectionGroup = String(wanted?.collectionGroup || "").trim();
      const fields = normFields(wanted?.fields);
      const queryScope = String(wanted?.queryScope || "COLLECTION").toUpperCase();
      if (!/^[A-Za-z0-9_-]{1,150}$/.test(collectionGroup) || fields.length === 0 || fields.length > 12) {
        return res.status(400).json({ ok: false, error: "Bad index request." });
      }
      if (fields.some((f) => !/^[A-Za-z0-9_]{1,150}$/.test(f.fieldPath) || !(f.order || f.arrayConfig))) {
        return res.status(400).json({ ok: false, error: "Bad index fields." });
      }
      const match = INDEX_SPEC.find(
        (e) =>
          e.collectionGroup === collectionGroup &&
          String(e.queryScope).toUpperCase() === queryScope &&
          sameFields(normFields(e.fields), fields),
      );
      if (!match) {
        return res.status(403).json({
          ok: false,
          error: "That index is not in the app's index spec, so it will not be created.",
        });
      }
      const r = await googleApi(
        `${base}/collectionGroups/${collectionGroup}/indexes`,
        "POST",
        { queryScope, fields },
      );
      if (r.status === 200 || r.status === 201) {
        const op = String(r.json?.name || "");
        console.error(`${TAG} deploy: creating ${collectionGroup} (${fields.map((f) => f.fieldPath).join(",")})`);
        return res.json({ ok: true, state: "creating", operation: op });
      }
      if (r.status === 409) {
        console.error(`${TAG} deploy: already exists (${collectionGroup})`);
        return res.json({ ok: true, state: "exists" });
      }
      const msg = r.json?.error?.message || `HTTP ${r.status}`;
      console.error(`${TAG} deploy failed: HTTP ${r.status} ${msg}`);
      return res.status(502).json({ ok: false, error: String(msg).slice(0, 400) });
    } catch (error: any) {
      console.error(`${TAG} deploy threw:`, error?.message || error);
      res.status(500).json({ ok: false, error: "Index deploy failed." });
    }
  });

  // POST check — body { collectionGroup, filters:[{path,op,value}], orderBy?:{path,dir}, limit? }.
  // Read-only proof that a query shape the app uses is servable.
  app.post("/api/internal/fs/fb/indexes/check", async (req, res) => {
    try {
      const body = (req.body || {}) as Body;
      const cg = String(body.collectionGroup || "").trim();
      if (!/^[A-Za-z0-9_-]{1,150}$/.test(cg) || !INDEX_SPEC.some((e) => e.collectionGroup === cg)) {
        return res.status(400).json({ ok: false, error: "Unknown collection for a check." });
      }
      const rawFilters = Array.isArray(body.filters) ? (body.filters as any[]) : [];
      if (rawFilters.length > 3) return res.status(400).json({ ok: false, error: "Too many filters." });
      const OPS: Record<string, FirebaseFirestore.WhereFilterOp> = {
        "==": "==", "<": "<", "<=": "<=", ">": ">", ">=": ">=",
      };
      let q: FirebaseFirestore.Query = adminDb.collection(cg);
      for (const f of rawFilters) {
        const path = String(f?.path || "");
        const op = OPS[String(f?.op || "")];
        if (!/^[A-Za-z0-9_]{1,150}$/.test(path) || !op) {
          return res.status(400).json({ ok: false, error: "Bad filter." });
        }
        const value = typeof f?.value === "number" ? f.value : String(f?.value ?? "").slice(0, 128);
        q = q.where(path, op, value);
      }
      if (body.orderBy && typeof body.orderBy === "object") {
        const path = String((body.orderBy as any).path || "");
        const dir = String((body.orderBy as any).dir || "asc").toLowerCase() === "desc" ? "desc" : "asc";
        if (!/^[A-Za-z0-9_]{1,150}$/.test(path)) {
          return res.status(400).json({ ok: false, error: "Bad orderBy." });
        }
        q = q.orderBy(path, dir as "asc" | "desc");
      }
      q = q.limit(Math.min(50, Math.max(1, Number(body.limit) || 1)));
      const snap = await q.get();
      console.error(`${TAG} check: ${cg} served, ${snap.size} doc(s)`);
      res.json({ ok: true, docs: snap.size });
    } catch (error: any) {
      const msg = String(error?.message || error).slice(0, 500);
      console.error(`${TAG} check refused: ${msg}`);
      res.json({ ok: false, error: msg });
    }
  });
}
