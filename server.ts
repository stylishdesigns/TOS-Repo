import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { parseEssayBlock } from "./src/utils/essay";
import { createHash, timingSafeEqual } from "crypto";
import { adminAuth, adminDb, adminCredentialSource, projectId, databaseId } from "./src/server/firebaseAdmin";
import {
  enterCentreService,
  validateActiveCentreService,
  listUserCentresService,
  joinCentreService,
  activateStudentService,
  toggleStudentAccessService,
  getCentreEntitlements,
  getSeatsSummaryService,
  isTosUser,
  requireMembership,
  getPlatformConfig,
  getCentreSubscriptionStatus,
  consumeAiRateLimit,
  httpError
} from "./src/server/tenantService";
import { ensureBootstrapSuperAdmin } from "./src/server/platformDefaults";
import { registerExtendedRoutes } from "./src/server/extendedRoutes";
import { registerFoDbProxy } from "./src/server/foDbProxy";
import { registerFoAccessDoors } from "./src/server/foAccessDoors";
import { registerPracticeStatsRoutes } from "./src/server/practiceStatsRoutes";
import { registerMockRoutes } from "./src/server/mockRoutes";
import { registerStudentMockRoutes } from "./src/server/studentMockRoutes";


// Source file is ESM, but compiled to CJS for production.
// We handle both environments for path resolution.
const getDistPath = (isProd: boolean) => {
  if (isProd) {
    // In production, server.cjs is inside the dist folder.
    // __dirname will be available in the bundled CJS file.
    return typeof __dirname !== 'undefined' ? __dirname : path.resolve(process.cwd(), 'dist');
  }
  return path.resolve(process.cwd(), "dist");
};

const AI_MODEL = "gemini-3.8-flash";

// DO NOT CHANGE: this app must call Vertex AI (Gemini Enterprise Agent Platform) using the
// EXCELLENT_API_KEY secret so usage bills to the Google Cloud project. Never switch to the
// plain Gemini Developer API. Never read GEMINI_API_KEY; AI Studio injects it and it bills AI Studio.
async function getAiClient() {
  const { GoogleGenAI } = await import("@google/genai");
  const apiKey = process.env.EXCELLENT_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error("EXCELLENT_API_KEY secret is not set"), { status: 400 });
  }
  console.log("AI backend: Vertex (enterprise) via EXCELLENT_API_KEY");
  const ai = new GoogleGenAI({
    enterprise: true,
    apiKey,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } }
  });
  if (!ai.vertexai) {
    throw new Error("AI client is not on Vertex. Refusing to run.");
  }
  return ai;
}

const ROMAN_NUMERALS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii'];

function has4WordRepetition(text: string): boolean {
  const words = text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length < 4) return false;
  const counts: Record<string, number> = {};
  for (let i = 0; i <= words.length - 4; i++) {
    const seq = `${words[i]} ${words[i+1]} ${words[i+2]} ${words[i+3]}`;
    counts[seq] = (counts[seq] || 0) + 1;
    if (counts[seq] >= 4) return true;
  }
  return false;
}

function containsForbiddenPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  if (lower.includes("without any other text")) return true;
  if (lower.includes("done safely")) return true;
  if (lower.includes("here are the")) return true;
  if (/Total:\s*\d+\s*marks?/i.test(text)) return true;
  return false;
}

function parseMCQFromText(rawText: string): any[] {
  const questions: any[] = [];
  const blocks = rawText.split(/(?=(?:^|\n)\s*(?:(?:Question\s*\d+|\d+)[.:)]))/i).filter(b => b.trim());

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 3) continue;

    const qLine = lines[0].replace(/^(?:Question\s*\d+|\d+)[.:)]\s*/i, '').trim();
    const options: string[] = [];
    let correctLetter = '';
    let explanation = '';

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const optMatch = line.match(/^([A-D])[.:)]\s*(.*)/i);
      const ansMatch = line.match(/^(?:Answer|Correct Answer):\s*([A-D]|.+)/i);
      const expMatch = line.match(/^(?:Explanation):\s*(.*)/i);

      if (optMatch) {
        options.push(optMatch[2].trim());
      } else if (ansMatch) {
        correctLetter = ansMatch[1].trim();
      } else if (expMatch) {
        explanation = expMatch[1].trim();
      }
    }

    if (options.length >= 2) {
      let cleanCorrect = options[0];
      const letterIdx = ['a', 'b', 'c', 'd'].indexOf(correctLetter.toLowerCase());
      if (letterIdx !== -1 && options[letterIdx]) {
        cleanCorrect = options[letterIdx];
      } else if (correctLetter) {
        cleanCorrect = correctLetter;
      }

      questions.push({
        type: 'MCQ',
        question: qLine,
        options,
        correctAnswer: cleanCorrect,
        explanation: explanation || 'Refer to the textbook syllabus for the detailed solution.',
        difficulty: 'Medium'
      });
    }
  }

  return questions;
}

function splitEssayBlocks(rawText: string): string[] {
  let cleanText = rawText;
  // Drop any leading text before the first question marker
  const firstQMatch = cleanText.search(/(?:^|\n)\s*(?:(?:Question\s*\d+|\d+)[.:)])/i);
  if (firstQMatch !== -1) {
    cleanText = cleanText.slice(firstQMatch).trim();
  }

  const rawBlocks = cleanText.split(/^\s*###\s*$/m);
  const result: string[] = [];

  for (let block of rawBlocks) {
    let lines = block.split('\n').map(l => l.trimEnd());

    const firstQIdx = lines.findIndex(l => /^(?:(?:Question\s*\d+|\d+)[.:)])/i.test(l.trim()));
    if (firstQIdx > 0) {
      lines = lines.slice(firstQIdx);
    }

    while (lines.length > 0) {
      const lastLine = lines[lines.length - 1].trim();
      if (!lastLine || /^(?:Here are|These are|I hope|Let me know|Hope this|Feel free)/i.test(lastLine)) {
        lines.pop();
      } else {
        break;
      }
    }

    const trimmedBlock = lines.join('\n').trim();
    if (trimmedBlock) {
      result.push(trimmedBlock);
    }
  }

  return result;
}

function validateEssayBlock(rawBlock: string): { valid: boolean; reason?: string } {
  const lines = rawBlock.split('\n').map(l => l.trim()).filter(Boolean);
  const structure = parseEssayBlock(lines);

  // If parts exist, silently clear the stem answer instead of rejecting
  if (structure.parts.length > 0 && structure.stemAnswer) {
    structure.stemAnswer = '';
  }

  // 1. fewer than 2 parts
  if (structure.parts.length < 2) {
    return { valid: false, reason: `fewer than 2 parts (found ${structure.parts.length})` };
  }

  // 2. part labels are not a, b, c in order, or sub-point labels are not i, ii, iii in order
  for (let pIdx = 0; pIdx < structure.parts.length; pIdx++) {
    const part = structure.parts[pIdx];
    const expectedPartLabel = String.fromCharCode(97 + pIdx);
    if (part.label.toLowerCase() !== expectedPartLabel) {
      return { valid: false, reason: `part label out of order: expected "${expectedPartLabel}", got "${part.label}"` };
    }

    if (part.subParts && part.subParts.length > 0) {
      for (let spIdx = 0; spIdx < part.subParts.length; spIdx++) {
        const sp = part.subParts[spIdx];
        const expectedSubLabel = ROMAN_NUMERALS[spIdx];
        if (sp.label.toLowerCase() !== expectedSubLabel) {
          return { valid: false, reason: `sub-point label out of order: expected "${expectedSubLabel}", got "${sp.label}"` };
        }
      }
    }
  }

  // Collect all text fields to validate
  const allTextFields: string[] = [];
  if (structure.stem) allTextFields.push(structure.stem);
  if (structure.stemAnswer) allTextFields.push(structure.stemAnswer);

  for (const part of structure.parts) {
    if (part.subParts && part.subParts.length > 0) {
      if (part.text) allTextFields.push(part.text);
      for (const sp of part.subParts) {
        if ((sp.text || '').trim().length < 8) {
          return { valid: false, reason: `sub-point question text under 8 characters: "${sp.text}"` };
        }
        if (!(sp.answer || '').trim()) {
          return { valid: false, reason: `sub-point answer is empty for part ${part.label} (${sp.label})` };
        }
        allTextFields.push(sp.text, sp.answer);
      }
    } else {
      if ((part.text || '').trim().length < 8) {
        return { valid: false, reason: `part question text under 8 characters: "${part.text}"` };
      }
      if (!(part.answer || '').trim()) {
        return { valid: false, reason: `part answer is empty for part ${part.label}` };
      }
      allTextFields.push(part.text, part.answer);
    }
  }

  for (const field of allTextFields) {
    if (field.length > 1500) {
      return { valid: false, reason: `text field exceeds 1500 characters (length: ${field.length})` };
    }
    if (has4WordRepetition(field)) {
      return { valid: false, reason: `repetition loop: 4-word sequence appears 4+ times in field` };
    }
    if (containsForbiddenPhrase(field)) {
      return { valid: false, reason: `field contains forbidden phrase or mark total` };
    }
  }

  return { valid: true };
}

async function startServer() {
  const app = express();
  app.use(express.json());
  app.disable("x-powered-by");

  // ---------------------------------------------------------------------------
  // Security headers and origin guard (Prompt A phase 2). The API is same-origin
  // only (the SPA calls /api on its own host), so mutating requests that carry a
  // cross-origin Origin header are refused, and standard safe headers are set on
  // every response. Written directly instead of adding helmet/cors packages.
  // ---------------------------------------------------------------------------
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    if ((req.headers["x-forwarded-proto"] || "") === "https") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    const method = (req.method || "").toUpperCase();
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
      if (origin) {
        const host = (req.headers["x-forwarded-host"] as string) || (req.headers.host as string) || "";
        let originHost = "";
        try { originHost = new URL(origin).host; } catch { originHost = ""; }
        if (!originHost || originHost !== host) {
          return res.status(403).json({ error: "Cross-origin requests are not allowed on the API." });
        }
      }
    }
    next();
  });

  // ---------------------------------------------------------------------------
  // Global authentication for the API (Prompt A step 1): every /api route
  // requires a verified Firebase ID token, except:
  //   - /api/health (Cloud Run health check)
  //   - /api/public/* (public endpoints, e.g. the lead form in Prompt C)
  //   - /api/internal/* (protected by the INTERNAL_API_SECRET header instead)
  // The verified caller is attached to the request for every handler below.
  // ---------------------------------------------------------------------------
  app.use("/api", (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const path = req.path; // relative to the /api mount
    if (path === "/health") return next();
    if (path === "/health/deep") return next(); // public diagnostic, returns no secrets
    if (path.startsWith("/public/")) return next();
    if (path.startsWith("/internal/fs/")) {
      // Fo database proxy (read-only): its own secret, stored in Netlify only
      // as a SHA-256 hash (FO_DB_PROXY_KEY_SHA256), separate from
      // INTERNAL_API_SECRET. Deny-closed when the hash is not configured.
      const key = req.headers["x-fo-key"];
      const hash = process.env.FO_DB_PROXY_KEY_SHA256 || "";
      if (!hash || typeof key !== "string" || key.length === 0 || key.length > 256) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const got = createHash("sha256").update(key).digest();
      const want = Buffer.from(hash, "hex");
      const keyOk = want.length === got.length && timingSafeEqual(got, want);
      if (!keyOk) return res.status(401).json({ error: "Unauthorized" });
      return next();
    }
    if (path.startsWith("/internal/")) {
      const secret = req.headers["x-internal-secret"];
      if (!process.env.INTERNAL_API_SECRET || secret !== process.env.INTERNAL_API_SECRET) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      return next();
    }
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    adminAuth
      .verifyIdToken(authHeader.slice("Bearer ".length).trim())
      .then((decoded) => {
        (req as any).caller = {
          uid: decoded.uid,
          email: decoded.email || "",
          tos: isTosUser(decoded as any),
          claims: decoded,
        };
        next();
      })
      .catch(() => {
        res.status(401).json({ error: "Unauthorized" });
      });
  });

  const PORT = process.env.PORT || 3000;
  const isProd = process.env.NODE_ENV === "production";
  const distPath = getDistPath(isProd);

  // Request logging middleware
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`${new Date().toISOString()} [${req.method}] ${req.path} - ${res.statusCode} (${duration}ms)`);
    });
    next();
  });

  console.log(`Starting server in ${isProd ? "production" : "development"} mode...`);
  console.log(`Working directory: ${process.cwd()}`);
  console.log(`Distribution path: ${distPath}`);

  // Health check for Cloud Run
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      mode: isProd ? "production" : "development",
      time: new Date().toISOString()
    });
  });

  // Deep health check (Prompt D): verifies the Admin SDK actually works in this
  // environment by performing one tiny Firestore read and one tiny Auth read.
  // Public by design and returns no secrets: ids and booleans only. Results are
  // cached briefly so uptime monitors cannot hammer the reads.
  let deepHealthCache: { at: number; body: any } | null = null;
  const DEEP_HEALTH_TTL_MS = 30_000;
  app.get("/api/health/deep", async (req, res) => {
    if (deepHealthCache && Date.now() - deepHealthCache.at < DEEP_HEALTH_TTL_MS) {
      return res.json(deepHealthCache.body);
    }
    const body: any = {
      adminCredential: adminCredentialSource,
      projectId,
      databaseId,
      firestoreReadOk: false,
      authReadOk: false,
      // Presence booleans only (no values): proves the publish route's
      // Cloudinary configuration is visible to this deployment at runtime.
      cloudinaryConfigured: {
        cloudName: Boolean(process.env.CLOUDINARY_CLOUD_NAME),
        uploadPreset: Boolean(process.env.CLOUDINARY_UPLOAD_PRESET),
      },
    };
    try {
      const snap = await adminDb.collection("platformConfig").doc("global").get();
      body.firestoreReadOk = true;
      body.platformConfigPresent = snap.exists;
    } catch (e: any) {
      body.firestoreErrorCode = e?.code || "unknown";
    }
    try {
      await adminAuth.listUsers(1);
      body.authReadOk = true;
    } catch (e: any) {
      body.authErrorCode = e?.code || "unknown";
    }
    deepHealthCache = { at: Date.now(), body };
    res.json(body);
  });

  // Tenant Session Claims Sync Endpoint
  app.post("/api/session/sync", async (req, res) => {
    try {
      // The token was already verified by the global /api middleware.
      const caller = (req as any).caller;
      const decoded = caller.claims;
      const uid = caller.uid;

      // Query active memberships for this user
      const snap = await adminDb.collection("memberships")
        .where("uid", "==", uid)
        .where("status", "==", "active")
        .get();

      const roleCodeMap: Record<string, string> = {
        owner: "own",
        admin: "adm",
        secretary: "sec",
        finance: "fin",
        tutor: "tut",
        student: "stu",
      };

      const m: Record<string, string> = {};
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.centreId && data.role) {
          const code = roleCodeMap[data.role] || data.role.substring(0, 3);
          m[data.centreId] = code;
        }
      });

      // One-time bootstrap: the first verified sign-in from an address in
      // TOS_BOOTSTRAP_EMAILS seeds the platform defaults and stamps the tos
      // claim permanently (platformDefaults.ensureBootstrapSuperAdmin). Session
      // sync preserves existing claims and never invents one on its own.
      let bootstrapGranted = false;
      try {
        bootstrapGranted = await ensureBootstrapSuperAdmin(uid, decoded.email || null);
      } catch (e) {
        console.error("[TOS bootstrap] unexpected failure:", (e as any)?.message || e);
      }
      const hasTos = decoded.tos === true || bootstrapGranted;

      // Merge, never replace: a provisioned owner's mustChangePassword claim
      // must survive the sync so the forced first-password change still
      // happens. Session sync still never invents a claim of its own.
      const syncUserRecord = await adminAuth.getUser(uid);
      const preserved: Record<string, any> = { ...((syncUserRecord.customClaims || {}) as Record<string, any>) };
      delete preserved.m;
      delete preserved.tos;
      const claims: { m: Record<string, string>; tos?: boolean } = { ...preserved, m };
      if (hasTos || preserved.tos === true) {
        claims.tos = true;
      }

      await adminAuth.setCustomUserClaims(uid, claims);

      res.json({
        success: true,
        uid,
        claims,
        centreCount: Object.keys(m).length,
        activeCentres: Object.keys(m),
      });
    } catch (error: any) {
      console.error("Session sync error:", error);
      res.status(500).json({ error: "Failed to sync session claims", detail: error.message || String(error) });
    }
  });

  // Helper to extract the authenticated caller attached by the global /api
  // middleware. Real authentication only: a request without a verified token
  // never reaches a route, so there is no fallback decoding of any kind.
  const getCaller = async (req: express.Request): Promise<{ uid: string; email: string; tos: boolean; claims: any }> => {
    const caller = (req as any).caller;
    if (!caller) {
      const err: any = new Error("Unauthorized");
      err.status = 401;
      throw err;
    }
    return caller;
  };

  // 1. Enter Centre with 6-digit access code (Part A, point 3)
  app.post("/api/auth/enter-centre", async (req, res) => {
    try {
      const caller = await getCaller(req);
      const { code } = req.body;
      const ip = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "127.0.0.1";

      if (!code || typeof code !== "string" || code.trim().length !== 6) {
        return res.status(400).json({ error: "That code did not match. Check it and try again." });
      }

      const result = await enterCentreService({
        uid: caller.uid,
        userEmail: caller.email,
        code: code.trim(),
        ip,
        tos: caller.tos,
      });

      res.json({ success: true, ...result });
    } catch (error: any) {
      console.warn("enter-centre error:", error.message || error);
      const status = error.status || (error.message?.includes("Too many") ? 429 : 400);
      res.status(status).json({ error: error.message || "That code did not match. Check it and try again." });
    }
  });

  // 2. Validate currently active centre on page reload (Part A, point 4)
  app.post("/api/auth/validate-active-centre", async (req, res) => {
    try {
      const caller = await getCaller(req);
      const { centreId } = req.body;
      if (!centreId) {
        return res.status(400).json({ error: "Missing centreId" });
      }

      const result = await validateActiveCentreService({
        uid: caller.uid,
        userEmail: caller.email,
        centreId,
        tos: caller.tos,
      });

      res.json({ success: true, ...result, centreId });
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Active centre verification failed." });
    }
  });

  // 3. List active centres for a tutor/user (Part A, point 6)
  app.get("/api/auth/my-centres", async (req, res) => {
    try {
      const caller = await getCaller(req);
      const centres = await listUserCentresService({
        uid: caller.uid,
        userEmail: caller.email,
        tos: caller.tos,
      });
      res.json({ success: true, centres });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: error.message || "Failed to list centres" });
    }
  });

  // 4. Join a centre using 6-digit access code (Part B)
  app.post("/api/auth/join-centre", async (req, res) => {
    try {
      const caller = await getCaller(req);
      const { code } = req.body;
      const ip = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "127.0.0.1";

      if (!code || typeof code !== "string" || code.trim().length !== 6) {
        return res.status(400).json({ error: "That code did not match. Check it and try again." });
      }

      const result = await joinCentreService({
        uid: caller.uid,
        userEmail: caller.email,
        code: code.trim(),
        ip,
        tos: caller.tos,
      });

      res.json({ success: true, ...result });
    } catch (error: any) {
      console.warn("join-centre error:", error.message || error);
      if (error.code === "CENTRE_FULL") {
        return res.status(409).json({
          code: "CENTRE_FULL",
          error: "Centre Full",
          centreName: error.centreName,
          message: error.message,
        });
      }
      res.status(400).json({ error: error.message || "That code did not match. Check it and try again." });
    }
  });

  // 5. Activate student membership (Part C, point 1)
  app.post("/api/centre/students/activate", async (req, res) => {
    try {
      const caller = await getCaller(req);
      const { studentUid, centreId } = req.body;
      if (!studentUid || !centreId) {
        return res.status(400).json({ error: "Missing studentUid or centreId" });
      }

      const result = await activateStudentService({
        actorUid: caller.uid,
        actorEmail: caller.email,
        studentUid,
        centreId,
        tos: caller.tos,
      });

      res.json(result);
    } catch (error: any) {
      console.warn("activate-student error:", error.message || error);
      res.status(400).json({ error: error.message || "Failed to activate student" });
    }
  });

  // 6. Toggle student access switch on/off (Part C, point 2)
  app.post("/api/centre/students/toggle-access", async (req, res) => {
    try {
      const caller = await getCaller(req);
      const { studentUid, centreId, active } = req.body;
      if (!studentUid || !centreId || typeof active !== "boolean") {
        return res.status(400).json({ error: "Missing studentUid, centreId, or active flag" });
      }

      const result = await toggleStudentAccessService({
        actorUid: caller.uid,
        actorEmail: caller.email,
        studentUid,
        centreId,
        active,
        tos: caller.tos,
      });

      res.json(result);
    } catch (error: any) {
      console.warn("toggle-access error:", error.message || error);
      res.status(400).json({ error: error.message || "Failed to toggle student access" });
    }
  });

  // 6c. Record a payment (Part C, point 3). Fees move through this route
  // only: the server computes paidAmount / outstandingBalance / paymentStatus
  // from the student's stored fees inside a transaction, so no device ever
  // sends fee numbers. A student may only pay their own record; centre admins
  // only their own centre's students. Every payment leaves an audit record.
  app.post("/api/centre/students/payment", async (req, res) => {
    try {
      const caller = await getCaller(req);
      const { studentId, amountPaid, method, note, evidenceUrl, evidenceName } = req.body || {};
      if (typeof studentId !== "string" || !/^[a-zA-Z0-9_\-]{1,128}$/.test(studentId)) {
        return res.status(400).json({ error: "Invalid studentId" });
      }
      const amount = Number(amountPaid);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) {
        return res.status(400).json({ error: "Invalid payment amount" });
      }
      const payMethod = method === "Bank Transfer" || method === "Cash" ? method : "Card";
      if (typeof evidenceUrl === "string" && evidenceUrl.length > 900000) {
        return res.status(400).json({ error: "Payment evidence is too large. Please attach a smaller image." });
      }

      const adminSnap = await adminDb.collection("admins").doc(caller.uid).get();
      const isAdminCaller = adminSnap.exists || caller.tos === true;
      const callerCentreId = adminSnap.exists
        ? String((adminSnap.data() as Record<string, unknown>).centreId || "")
        : "";

      const result = await adminDb.runTransaction(async (tx) => {
        const studentRef = adminDb.collection("students").doc(studentId);
        const studentSnap = await tx.get(studentRef);
        if (!studentSnap.exists) {
          throw new Error("NOT_FOUND:Student record not found");
        }
        const s = studentSnap.data() as Record<string, any>;
        if (isAdminCaller) {
          if (callerCentreId && s.centreId && callerCentreId !== s.centreId) {
            throw new Error("FORBIDDEN:That student belongs to a different centre");
          }
        } else if (s.uid !== caller.uid && studentId !== caller.uid) {
          throw new Error("FORBIDDEN:You can only record payments for your own student record");
        }
        const totalFee = typeof s.totalFee === "number" ? s.totalFee : 0;
        const currentPaid = typeof s.paidAmount === "number" ? s.paidAmount : 0;
        const newPaid = currentPaid + amount;
        const outstanding = Math.max(totalFee - newPaid, 0);
        const paymentStatus = outstanding <= 0 ? "Paid" : "Partial";
        const paymentId = `pay-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
        const receiptNumber = `REC-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
        const paymentDoc: Record<string, any> = {
          centreId: s.centreId || callerCentreId || "",
          receiptNumber,
          studentId,
          studentName: typeof s.name === "string" ? s.name : "",
          programmeName: typeof s.programmeName === "string" ? s.programmeName : "",
          amountPaid: amount,
          totalFee,
          balance: outstanding,
          status: paymentStatus,
          method: payMethod,
          date: new Date().toISOString().split("T")[0],
          submittedBy: isAdminCaller ? "Admin" : "Student",
          createdAt: Date.now(),
        };
        if (typeof note === "string" && note.trim()) paymentDoc.note = note.trim().slice(0, 500);
        if (typeof evidenceUrl === "string" && evidenceUrl) paymentDoc.evidenceUrl = evidenceUrl;
        if (typeof evidenceName === "string" && evidenceName) paymentDoc.evidenceName = evidenceName.slice(0, 200);
        tx.set(adminDb.collection("payments").doc(paymentId), paymentDoc);
        tx.update(studentRef, {
          paidAmount: newPaid,
          outstandingBalance: outstanding,
          paymentStatus,
        });
        tx.set(adminDb.collection("auditLogs").doc(), {
          action: "payment.record",
          actorUid: caller.uid,
          actorEmail: caller.email,
          centreId: paymentDoc.centreId,
          studentId,
          paymentId,
          receiptNumber,
          amountPaid: amount,
          method: payMethod,
          at: new Date().toISOString(),
        });
        return {
          payment: { id: paymentId, ...paymentDoc },
          student: { paidAmount: newPaid, outstandingBalance: outstanding, paymentStatus },
        };
      });

      res.json({ success: true, ...result });
    } catch (error: any) {
      const msg = String(error?.message || error);
      const code = msg.startsWith("NOT_FOUND:") ? 404 : msg.startsWith("FORBIDDEN:") ? 403 : 500;
      console.warn("record-payment error:", msg);
      res.status(code).json({ error: msg.replace(/^(NOT_FOUND|FORBIDDEN):/, "") || "Failed to record payment" });
    }
  });

  // 7. Get feature entitlements for centre (Part E)
  app.get("/api/centre/entitlements", async (req, res) => {
    try {
      const caller = await getCaller(req);
      const centreId = (req.query.centreId as string) || (req.headers["x-centre-id"] as string);
      if (!centreId) {
        return res.status(400).json({ error: "Missing centreId" });
      }

      // Step 6: any active member of the centre may read entitlements, but the
      // membership is verified on the server; the client-supplied id is only
      // ever validated, never trusted.
      await requireMembership(caller, centreId);

      const entitlements = await getCentreEntitlements(centreId);
      res.json({ success: true, centreId, entitlements });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: error.message || "Failed to get entitlements" });
    }
  });

  // 8. Get seats summary for centre (Part D)
  app.get("/api/centre/seats-summary", async (req, res) => {
    try {
      const caller = await getCaller(req);
      const centreId = (req.query.centreId as string) || (req.headers["x-centre-id"] as string);
      if (!centreId) {
        return res.status(400).json({ error: "Missing centreId" });
      }

      // Step 6: seats summary is owner/admin (or TOS) of that centre only.
      await requireMembership(caller, centreId, ["owner", "admin"]);

      const summary = await getSeatsSummaryService(centreId);
      res.json({ success: true, centreId, summary });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: error.message || "Failed to get seats summary" });
    }
  });


  // AI Backend Status
  app.get("/api/ai-status", (req, res) => {
    res.json({
      backend: "vertex",
      model: AI_MODEL,
      keyConfigured: Boolean(process.env.EXCELLENT_API_KEY)
    });
  });

  // ---------------------------------------------------------------------------
  // AI route gating (Prompt A step 10). Middleware only: the handlers below are
  // untouched. generate-questions requires a signed-in active owner, admin or
  // tutor of a centre whose subscription is active; grade-essay any signed-in
  // active member. Both are per-user rate limited in Firestore.
  // ---------------------------------------------------------------------------
  const ROLE_CODES: Record<string, string> = {
    own: "owner",
    adm: "admin",
    sec: "secretary",
    fin: "finance",
    tut: "tutor",
    stu: "student",
  };

  const aiQuestionsGate = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const caller = await getCaller(req);
      const bodyCentre = (req.body && req.body.centreId) || (req.headers["x-centre-id"] as string) || "";
      let centreId = "";
      if (bodyCentre) {
        const m = await requireMembership(caller, bodyCentre, ["owner", "admin", "tutor"]);
        centreId = m.centreId;
      } else {
        const m = caller.claims?.m || {};
        const candidate = Object.keys(m).find(
          (cid) => ["owner", "admin", "tutor"].includes(ROLE_CODES[m[cid]])
        );
        if (!candidate) {
          throw httpError(403, "You do not have access to this feature.");
        }
        await requireMembership(caller, candidate, ["owner", "admin", "tutor"]);
        centreId = candidate;
      }
      const status = await getCentreSubscriptionStatus(centreId);
      if (status !== "trial" && status !== "active") {
        throw httpError(
          403,
          "This feature is unavailable while the centre's subscription is not active."
        );
      }
      const config = await getPlatformConfig();
      await consumeAiRateLimit(caller.uid, "ai-questions", config);
      // Body caps (Prompt A phase 2), enforced here so the handler stays untouched:
      // count must be a whole number 1-50, text fields capped at 2,000 characters.
      const qBody = req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? (req.body as Record<string, unknown>) : {};
      const rawCount = Number(qBody.count ?? 10);
      if (!Number.isFinite(rawCount) || Math.floor(rawCount) !== rawCount || rawCount < 1 || rawCount > 50) {
        throw httpError(400, "Question count must be a whole number between 1 and 50.");
      }
      for (const field of ["subject", "programme", "type", "prompt", "topic"] as const) {
        const value = qBody[field];
        if (value != null && (typeof value !== "string" || value.length > 2000)) {
          throw httpError(400, `The ${field} field must be text under 2,000 characters.`);
        }
      }
      next();
    } catch (error: any) {
      res.status(error.status || 500).json({ error: error.message || "Unauthorized" });
    }
  };

  const aiEssayGate = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const caller = await getCaller(req);
      let centreId = (req.body && req.body.centreId) || (req.headers["x-centre-id"] as string) || "";
      if (centreId) {
        await requireMembership(caller, centreId);
      } else {
        const m = caller.claims?.m || {};
        const candidate = Object.keys(m)[0];
        if (candidate) {
          await requireMembership(caller, candidate);
          centreId = candidate;
        } else {
          // No claim yet: fall back to a live membership lookup.
          const snap = await adminDb
            .collection("memberships")
            .where("uid", "==", caller.uid)
            .where("status", "==", "active")
            .limit(1)
            .get();
          if (snap.empty) {
            throw httpError(403, "You do not have access to this feature.");
          }
          centreId = snap.docs[0].data().centreId;
        }
      }
      const status = await getCentreSubscriptionStatus(centreId);
      if (status === "suspended" || status === "pending_payment") {
        throw httpError(
          403,
          "This feature is unavailable while the centre's subscription is not active."
        );
      }
      const config = await getPlatformConfig();
      await consumeAiRateLimit(caller.uid, "ai-essay", config);
      // Body caps (Prompt A phase 2): items must be an array of 1-50 objects and
      // every string value capped, again without touching the handler.
      const eBody = req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? (req.body as Record<string, unknown>) : {};
      const items = eBody.items;
      if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
        throw httpError(400, "Send between 1 and 50 essay items to grade.");
      }
      for (const item of items) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          throw httpError(400, "Each essay item must be an object.");
        }
        for (const value of Object.values(item as Record<string, unknown>)) {
          if (typeof value === "string" && value.length > 8000) {
            throw httpError(400, "An essay field is too long (8,000 characters maximum).");
          }
        }
      }
      const rawMarks = Number(eBody.totalEssayMarks ?? 0);
      if (!Number.isFinite(rawMarks) || rawMarks < 0 || rawMarks > 100000) {
        throw httpError(400, "The total marks value is out of range.");
      }
      next();
    } catch (error: any) {
      res.status(error.status || 500).json({ error: error.message || "Unauthorized" });
    }
  };

  // AI Question Generation Endpoint
  app.post("/api/generate-questions", aiQuestionsGate, async (req, res) => {
    try {
      const { subject, programme, count, type, prompt: userPrompt, topic } = req.body;
      const { Type } = await import("@google/genai");
      const ai = await getAiClient();

      const totalCount = count || 10;
      let mcqCount = 0;
      let essayCount = 0;

      if (type === 'Essay' || type === 'Essay Mode') {
        mcqCount = 0;
        essayCount = totalCount;
      } else if (type === 'MCQ' || type === 'Multiple Choice') {
        mcqCount = totalCount;
        essayCount = 0;
      } else {
        // Mixed / Both
        mcqCount = Math.max(1, Math.round(totalCount * 0.7));
        essayCount = totalCount - mcqCount;
      }

      const generateMCQBatch = async (batchCount: number) => {
        const prompt = `You are a professional CBT question generator for Excellence Tutorial Centre.
Generate ${batchCount} multiple-choice questions for the subject "${subject}" tailored for the "${programme}" curriculum.
${userPrompt ? `Focus specifically on: ${userPrompt}` : ''}

MATHS RULES:
- Write all mathematical expressions in LaTeX inside $...$ (e.g., $x^2$, $\\frac{1}{2}$, $\\sqrt{x}$).
- Use $\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$ for matrices.
- Use $\\times$ for multiplication.
- Use $\\mathrm{H_2O}$ or $3d^5 4s^1$ for chemistry/physics notation.
- Plain text stays outside the dollar signs. Never use unicode superscripts like ² or ³.

MCQ RULES:
- Provide 4 options (A, B, C, D).
- NEVER include option letter prefixes like "A.", "B.", "C.", or "D." or "(A)" inside the option strings. Provide ONLY the pure option text.
- correctAnswer is the EXACT STRING matching one option.
- explanation should be a clear step-by-step guide.`;

        const response = await ai.models.generateContent({
          model: AI_MODEL,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING, enum: ["MCQ"] },
                  question: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctAnswer: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                  difficulty: { type: Type.STRING, enum: ["Easy", "Medium", "Hard"] }
                },
                required: ["type", "question", "options", "correctAnswer", "difficulty"]
              }
            }
          }
        });

        const rawText = response.text || "[]";
        try {
          const cleanedText = rawText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(cleanedText);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
          if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).questions)) {
            return (parsed as any).questions;
          }
          return parseMCQFromText(rawText);
        } catch {
          return parseMCQFromText(rawText);
        }
      };

      const generateEssayText = async (n: number) => {
        const topicFocus = [
          topic ? `Topic: ${topic}.` : '',
          userPrompt ? `${userPrompt}` : ''
        ].filter(Boolean).join(' ').trim();

        const prompt = `You are a professional CBT essay question generator. Generate ${n} structured essay questions for ${subject || 'General Subject'} for the ${programme || 'Standard Exam'} curriculum. ${topicFocus}

Format every question EXACTLY like this, because the output is imported directly into a CBT engine:

1. Discuss the causes and effects of inflation in an economy.
a. Define inflation.
Answer: Inflation is a persistent increase in the general price level of goods and services over a period of time.
b. State:
i. Two major causes of inflation.
Answer: Excessive money supply and increased production costs.
ii. One effect of inflation on consumers.
Answer: Reduced purchasing power.
###

RULES:
- Number each main question 1., 2., 3. Use lowercase letters for parts (a., b., c.) and lowercase Roman numerals for sub-points (i., ii., iii.).
- Each essay has 2 to 4 lettered parts. Use sub-points only where natural.
- A question line contains only what the student sees. Never put solutions, hints, working or final answers in it.
- Every part or sub-point that asks something has its own single-line 'Answer:' directly below it. Do not write an Answer line for the opening statement.
- Write each Answer on ONE line. Chain calculation steps with semicolons. Never start a line inside an answer with a letter, Roman numeral or number followed by a period or bracket.
- Answers are complete but concise, with key working and the final result with units.
- Do not mention marks, mark allocation or totals anywhere. The system assigns marks.
- Write all maths, equations, formulas, matrices and chemical formulas in LaTeX inside single $...$, for example $x^{2}$, $\\frac{3}{5}$, $\\begin{pmatrix} 5 & 2 \\\\ 7 & 3 \\end{pmatrix}$, $\\mathrm{CuSO_4}$. Ordinary words stay outside the dollar signs. No unicode superscripts.
- Put a line containing only ### after each question.
- Do not repeat any sentence or phrase. No introduction, no closing sentence, no commentary, no tables, no bullets, no headings. Output only the questions and answers.`;

        const response = await ai.models.generateContent({
          model: AI_MODEL,
          contents: prompt,
          config: {
            maxOutputTokens: 16000
          }
        });

        return response.text || '';
      };

      let warnings: string[] = [];

      const sanitizeMCQ = (q: any) => {
        const cleanedOptions = (q.options || []).map((opt: any) => 
          typeof opt === 'string' ? opt.replace(/^(?:\(?[A-Da-d]\)?[.):-]?)\s+/, '').trim() : opt
        );
        let cleanCorrect = q.correctAnswer;
        if (typeof cleanCorrect === 'string') {
          const stripped = cleanCorrect.replace(/^(?:\(?[A-Da-d]\)?[.):-]?)\s+/, '').trim();
          const matchIdx = cleanedOptions.findIndex((o: any) => typeof o === 'string' && o.toLowerCase() === stripped.toLowerCase());
          cleanCorrect = matchIdx !== -1 ? cleanedOptions[matchIdx] : stripped;
        }
        return {
          ...q,
          type: 'MCQ',
          options: cleanedOptions,
          correctAnswer: cleanCorrect
        };
      };

      let mcqQuestions: any[] = [];
      if (mcqCount > 0) {
        const rawMCQs = await generateMCQBatch(mcqCount);
        mcqQuestions = rawMCQs.map(sanitizeMCQ);
      }

      let validEssayBlocks: string[] = [];
      if (essayCount > 0) {
        const rawEssayText = await generateEssayText(essayCount);
        const initialBlocks = splitEssayBlocks(rawEssayText);

        for (const block of initialBlocks) {
          if (validEssayBlocks.length >= essayCount) break;
          const validation = validateEssayBlock(block);
          if (validation.valid) {
            validEssayBlocks.push(block);
          } else {
            console.error(`Rejected essay block (${validation.reason}):\n`, block.substring(0, 500));
          }
        }

        const needed = essayCount - validEssayBlocks.length;
        if (needed > 0) {
          const retryEssayText = await generateEssayText(needed);
          const retryBlocks = splitEssayBlocks(retryEssayText);
          for (const block of retryBlocks) {
            if (validEssayBlocks.length >= essayCount) break;
            const validation = validateEssayBlock(block);
            if (validation.valid) {
              validEssayBlocks.push(block);
            } else {
              console.error(`Rejected retry essay block (${validation.reason}):\n`, block.substring(0, 500));
            }
          }
        }

        const discardedCount = essayCount - validEssayBlocks.length;
        if (discardedCount > 0) {
          warnings.push(`${discardedCount} essays discarded`);
        }
      }

      res.json({
        questions: mcqQuestions,
        essays: validEssayBlocks,
        warnings
      });
    } catch (error: any) {
      console.error("Question Generation Error:", error);
      if (error?.status === 400 || error?.message === "EXCELLENT_API_KEY secret is not set") {
        return res.status(400).json({ error: "API Key Missing", detail: "EXCELLENT_API_KEY secret is not set" });
      }
      res.status(500).json({ error: "Failed to generate questions", detail: String(error) });
    }
  });

  // System Essay Grading Endpoint
  app.post("/api/grade-essay", aiEssayGate, async (req, res) => {
    try {
      const { items } = req.body;
      const { Type } = await import("@google/genai");
      const ai = await getAiClient();

      const prompt = `You are the automated examination grading system for Excellence Tutorial Centre.
      Your responsibility is to grade student essay answers with high academic intelligence, pedagogical fairness, deep subject-matter comprehension, and robust syllabus awareness.
      
      CORE GRADING PRINCIPLES:
      1. SUBJECT-SCOPE & DOMAIN-AWARE EVALUATION (DO NOT GRADE STRICTLY AGAINST THE MODEL ANSWER ALONE):
         - The provided "modelAnswer" is ONLY an illustrative sample or reference benchmark. It is NEVER the only acceptable answer.
         - You MUST determine whether the student's answer is FACTUAL, ACCURATE, LOGICAL, and VALID WITHIN THE SUBJECT SCOPE (e.g., Economics, Biology, Physics, Chemistry, Government, Literature in English, Mathematics, Accounting, Commerce, Agricultural Science, Geography, Civic Education).
         - If a student provides an answer, explanation, example, definition, cause, effect, function, advantage, or formula that DIFFERS from the model answer, BUT is a recognized, correct concept within that academic discipline that directly answers the question prompt:
           --> YOU MUST AWARD FULL MARKS (or proportional marks if partially complete).
         
         EXEMPLARY SUBJECT-MATTER PARADIGMS:
         * ECONOMICS:
           - Question: "Define inflation."
             - Model answer: "Persistent increase in the general price level of goods and services over a period of time."
             - Acceptable student alternatives: "A sustained fall in the purchasing power of money" OR "A situation where aggregate demand exceeds aggregate supply leading to continuous price increases" OR "A continuous rise in the Consumer Price Index (CPI) over time" -> ALL are 100% correct in Economics. Award FULL MARKS!
           - Question: "Two major causes of inflation."
             - Model answer: "Excessive money supply and increased production costs."
             - Acceptable student alternatives: "1. Demand-pull inflation from excessive consumer spending. 2. Cost-push inflation from rising fuel or wage costs" OR "1. Currency depreciation/devaluation raising import prices. 2. Budget deficit financing by central bank money creation" OR "1. Supply chain bottlenecks. 2. Structural hoarding or bottlenecks" -> ALL are 100% correct in Economics. Award FULL MARKS!
           - Question: "One effect of inflation on consumers."
             - Model answer: "Reduced purchasing power."
             - Acceptable student alternatives: "Erosion of real income for fixed wage earners" OR "Reduction in the standard of living" OR "Diminished real value of monetary savings" -> ALL are 100% correct in Economics. Award FULL MARKS!
         
         * BIOLOGY & LIFE SCIENCES:
           - For anatomical structures, organelle functions, metabolic pathways, or ecological relationships: accept any established biological textbook role or equivalent scientific terminology (e.g., mitochondria: ATP generation, aerobic respiration, cellular energy; ribosome: protein synthesis, translation of mRNA; transpiration: cooling mechanism, mineral transport, water uptake).
         
         * CHEMISTRY & PHYSICS:
           - Accept equivalent scientific definitions (e.g. Arrhenius vs Bronsted-Lowry vs Lewis acids; Newton's laws in verbal or momentum derivative form; work expressed in Joules or Newton-metres; alternative valid balanced reactions, ionic equations, or energy states).
         
         * MATHEMATICS & QUANTITATIVE:
           - Accept alternative valid mathematical methods, algebraic factorizations, fractions vs decimals, simplified forms, and valid step-by-step reasoning that yield correct conclusions.
         
         * GOVERNMENT, CIVICS, COMMERCE, ACCOUNTING & HUMANITIES:
           - Accept legitimate constitutional functions, recognized economic or commercial principles, alternative valid accounting entries or dual-aspect explanations, and text-supported literary analyses.

      2. INCOMPLETE & DEVELOPING ANSWERS (PROPORTIONAL PARTIAL MARKS):
         - You MUST properly grade incomplete answers so that students earn fair partial marks for incomplete points, partial definitions, or any answers that are correct but incomplete.
         - NEVER award 0 marks to a student who has written a correct but incomplete point or definition!
         - If the question asks for N items (e.g., "State two causes..."):
           * If student provides N valid points: award maxMarks.
           * If student provides 1 valid point out of 2 requested: award 50% of maxMarks (e.g., 1.0 out of 2.0, or 1.5 out of 3.0).
         - For partial definitions (e.g., defined "increase in price level" but forgot "over a sustained period"): award 50-70% of maxMarks (rounded to nearest 0.5).
         - Only award 0 marks if:
           a) The student answer is completely empty, blank, whitespace, or states "I don't know" / "nil".
           b) The answer is completely nonsensical, off-topic, or factually wrong within the subject domain.
         - Forgive informal typing, conversational tone, minor spelling/grammar errors, and plain text notations.

      3. SHORT & BRIEF EXPLANATION:
         - For "feedback", provide a concise, brief explanation (1-2 sentences) of the answer and score. This serves as the short Explanation displayed directly below the Answer.
         - "missedPoints": Leave empty [] when the student answered adequately. Only list missing required components if the prompt explicitly requested a count the student missed.

      4. DIFFICULTY-BASED MARKS DISTRIBUTION:
         - Each leaf has an assigned "maxMarks". Grade each leaf fairly within its allotted maxMarks based on question difficulty and depth.

      ESSAYS TO GRADE:
      ${JSON.stringify(items, null, 2)}
      
      Return a JSON object with a "grades" array containing the grading results for each leaf.`;

      const callWithRetry = async (fn: () => Promise<any>, maxRetries = 2, delayMs = 1500) => {
        let lastErr;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            return await fn();
          } catch (err: any) {
            lastErr = err;
            const isRateLimit = String(err).includes('429') || String(err).includes('RESOURCE_EXHAUSTED');
            if (isRateLimit && attempt < maxRetries) {
              await new Promise(res => setTimeout(res, delayMs * (attempt + 1)));
              continue;
            }
            throw err;
          }
        }
        throw lastErr;
      };

      const response = await callWithRetry(() => ai.models.generateContent({
        model: AI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              grades: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    questionIndex: { type: Type.NUMBER },
                    key: { type: Type.STRING, description: "The leaf key (e.g., 'root', 'a', 'b-i')" },
                    marksAwarded: { type: Type.NUMBER },
                    feedback: { type: Type.STRING },
                    missedPoints: { 
                      type: Type.ARRAY, 
                      items: { type: Type.STRING } 
                    }
                  },
                  required: ["questionIndex", "key", "marksAwarded", "feedback", "missedPoints"]
                }
              }
            },
            required: ["grades"]
          }
        }
      }));

      const result = JSON.parse(response.text || '{"grades":[]}');
      res.json(result);
    } catch (error: any) {
      console.error("AI Grading Error:", error);
      if (error?.status === 400 || error?.message === "EXCELLENT_API_KEY secret is not set") {
        return res.status(400).json({ error: "API Key Missing", detail: "EXCELLENT_API_KEY secret is not set" });
      }
      res.status(500).json({ error: "Failed to grade essays", detail: String(error) });
    }
  });

  // Prompt C routes (leads, TOS console, access codes, billing sweep) must be
  // registered before the static/SPA fallback so no GET route is swallowed.
  registerExtendedRoutes(app);
  registerPracticeStatsRoutes(app);
  registerMockRoutes(app);
  registerStudentMockRoutes(app);

  // Fo database proxy (read-only): Firestore diagnostics through the server's
  // own admin connection, gated by FO_DB_PROXY_KEY_SHA256 (see foDbProxy.ts).
  registerFoDbProxy(app);

  // Fo Firebase access doors (rules read, backups, auth, storage, push),
  // same x-fo-key gate as the data proxy (see foAccessDoors.ts).
  registerFoAccessDoors(app);

  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Explicitly handle sw.js to prevent any unexpected redirects
    app.get("/sw.js", (req, res) => {
      res.sendFile(path.join(distPath, "sw.js"));
    });

    // Serve static files
    app.use(express.static(distPath, {
      maxAge: '1d',
      index: false
    }));

    // Fallback for SPA
    app.get("*", (req, res) => {
      // Don't serve index.html for missing API routes or assets that should have been in dist
      if (req.path.startsWith('/api/') || req.path.includes('.')) {
        return res.status(404).send('Not found');
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  if (process.env.NETLIFY === "true") {
    // Running inside a Netlify Function: never bind a port, just return the app.
    return app;
  }

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

if (process.env.NETLIFY !== "true") {
  startServer().catch(err => {
    console.error("CRITICAL: Failed to start server:", err);
    process.exit(1);
  });
}

export { startServer };
