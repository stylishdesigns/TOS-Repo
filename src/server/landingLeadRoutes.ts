import express from "express";
import { adminDb } from "./firebaseAdmin";
import { Caller } from "./tenantService";

/**
 * Landing-page enquiry inbox (piece 3 of the landing-page feature).
 *
 * Visitors submit enquiries on a centre's public landing page into
 * centreLandingLeads (the public lead endpoint lives in landingRoutes.ts).
 * These routes let that centre's own admin read and manage their inbox:
 *   GET   /api/landing-leads        newest 200 enquiries for their centre
 *   PATCH /api/landing-leads/:id    mark one new or handled
 *
 * Every read is scoped to the caller's own centre via the admins record, so
 * no admin ever sees another centre's enquiries. Nothing student-related or
 * fee-related is ever stored in centreLandingLeads.
 */

const LEAD_LIMIT = 200;

async function centreIdForCaller(caller: Caller): Promise<string | null> {
  try {
    const snap = await adminDb.collection("admins").doc(caller.uid).get();
    if (snap.exists) {
      const id = (snap.data() as Record<string, unknown>)?.centreId;
      if (typeof id === "string" && id.trim()) return id.trim();
    }
    // Older admins records may store the centre in a lookup instead.
    const q = await adminDb
      .collection("admins")
      .where("uid", "==", caller.uid)
      .limit(1)
      .get()
      .catch(() => null);
    if (q && !q.empty) {
      const id = (q.docs[0].data() as Record<string, unknown>)?.centreId;
      if (typeof id === "string" && id.trim()) return id.trim();
    }
  } catch {
    // fall through to null
  }
  return null;
}

function callerOf(req: express.Request): Caller | undefined {
  return (req as any).caller as Caller | undefined;
}

export function registerLandingLeadRoutes(app: express.Express): void {
  app.get("/api/landing-leads", async (req, res) => {
    try {
      const caller = callerOf(req);
      if (!caller) return res.status(401).json({ error: "Unauthorized" });
      const centreId = await centreIdForCaller(caller);
      if (!centreId) {
        return res.status(403).json({ error: "Only a centre admin can view website enquiries." });
      }
      const snap = await adminDb
        .collection("centreLandingLeads")
        .where("centreId", "==", centreId)
        .limit(LEAD_LIMIT)
        .get()
        .catch(() => null);
      if (!snap) return res.status(500).json({ error: "Could not load enquiries. Please try again." });
      const leads = snap.docs
        .map((d) => {
          const v = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            name: typeof v.name === "string" ? v.name : "",
            phone: typeof v.phone === "string" ? v.phone : "",
            email: typeof v.email === "string" ? v.email : "",
            message: typeof v.message === "string" ? v.message : "",
            status: v.status === "handled" ? "handled" : "new",
            createdAt: typeof v.createdAt === "string" ? v.createdAt : "",
          };
        })
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
      return res.json({ ok: true, leads });
    } catch (err) {
      console.error("[landing-leads] list failed:", err);
      return res.status(500).json({ error: "Could not load enquiries. Please try again." });
    }
  });

  app.patch("/api/landing-leads/:id", async (req, res) => {
    try {
      const caller = callerOf(req);
      if (!caller) return res.status(401).json({ error: "Unauthorized" });
      const centreId = await centreIdForCaller(caller);
      if (!centreId) {
        return res.status(403).json({ error: "Only a centre admin can manage website enquiries." });
      }
      const id = String(req.params.id || "");
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
        return res.status(400).json({ error: "A valid enquiry id is required." });
      }
      const status = req.body?.status === "handled" ? "handled" : req.body?.status === "new" ? "new" : "";
      if (!status) return res.status(400).json({ error: "Status must be new or handled." });
      const ref = adminDb.collection("centreLandingLeads").doc(id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: "This enquiry no longer exists." });
      if ((snap.data() as Record<string, unknown>)?.centreId !== centreId) {
        return res.status(403).json({ error: "This enquiry belongs to a different centre." });
      }
      await ref.set({ status, updatedAt: new Date().toISOString(), updatedBy: caller.uid }, { merge: true });
      return res.json({ ok: true, status });
    } catch (err) {
      console.error("[landing-leads] update failed:", err);
      return res.status(500).json({ error: "Could not update the enquiry. Please try again." });
    }
  });
}
