import express from "express";
import { adminDb } from "./firebaseAdmin";
import { defaultLandingContent, isLandingContent, LandingContent } from "../landing/landingContent";

/**
 * Public centre landing pages (piece 1 of the landing-page feature).
 *
 * GET /api/landing/:centreId
 *   Anonymous endpoint. Returns ONLY public marketing content: either the
 *   centre's published landing-page content from centreLandingPages/{centreId},
 *   or starter content generated from the centre's name. Never returns student
 *   records, fee data, access codes or any private centre data.
 */
export function registerLandingRoutes(app: express.Express): void {
  app.get("/api/public/landing/:centreId", async (req, res) => {
    try {
      const centreId = String(req.params.centreId || "");
      if (!/^[a-zA-Z0-9_-]{3,64}$/.test(centreId)) {
        return res.status(400).json({ error: "A valid centre id is required." });
      }

      let centreName = "Our tutorial centre";
      try {
        const centreSnap = await adminDb.collection("centres").doc(centreId).get();
        if (centreSnap.exists) {
          const data = centreSnap.data() as Record<string, unknown> | undefined;
          if (data && typeof data.name === "string" && data.name.trim()) {
            centreName = data.name.trim();
          }
        }
      } catch {
        // Name lookup failure must not break the page; fall back to the default.
      }

      let content: LandingContent = defaultLandingContent(centreName);
      let published = false;

      try {
        const snap = await adminDb.collection("centreLandingPages").doc(centreId).get();
        if (snap.exists) {
          const data = snap.data() as Record<string, unknown> | undefined;
          if (data && data.published === true && isLandingContent(data.content)) {
            content = data.content as LandingContent;
            if (!content.footer?.copyright) {
              content = {
                ...content,
                footer: { copyright: `© ${new Date().getFullYear()} ${centreName}` },
              };
            }
            published = true;
          }
        }
      } catch {
        // No published page (or read failed): serve the starter content instead.
      }

      res.set("Cache-Control", "public, max-age=60");
      return res.json({ ok: true, published, centreName, content });
    } catch (err) {
      console.error("[landing] GET /api/public/landing failed:", err);
      return res.status(500).json({ error: "Could not load this centre's website." });
    }
  });
}
