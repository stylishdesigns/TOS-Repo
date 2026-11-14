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
        return res.status(400).json({ error: "A valid facility id is required." });
      }

      let centreName = "Our education facility";
      let centrePhone = "";
      try {
        const centreSnap = await adminDb.collection("centres").doc(centreId).get();
        if (centreSnap.exists) {
          const data = centreSnap.data() as Record<string, unknown> | undefined;
          if (data && typeof data.name === "string" && data.name.trim()) {
            centreName = data.name.trim();
          }
          if (data && typeof data.phone === "string") centrePhone = data.phone;
        }
      } catch {
        // Name lookup failure must not break the page; fall back to the default.
      }

      // The centre's WhatsApp line, exactly what getCentreWhatsApp reads for
      // the blocked-access screen: centreSettings/{id}__global, with the
      // centre phone as the fallback. Only ever used for the floating
      // WhatsApp button; nothing private leaves the server here.
      let whatsapp = "";
      try {
        const wsSnap = await adminDb.collection("centreSettings").doc(`${centreId}__global`).get();
        if (wsSnap.exists) {
          const ws = wsSnap.data() as Record<string, unknown> | undefined;
          const raw = (ws?.whatsappNumber || ws?.whatsapp || ws?.phone || "") as string;
          if (typeof raw === "string" && raw.trim()) whatsapp = raw.trim();
        }
      } catch {
        // No WhatsApp line configured: the page simply renders without it.
      }
      if (!whatsapp && centrePhone.trim()) whatsapp = centrePhone.trim();

      let content: LandingContent = defaultLandingContent(centreName);
      let published = false;

      try {
        const snap = await adminDb.collection("centreLandingPages").doc(centreId).get();
        if (snap.exists) {
          const data = snap.data() as Record<string, unknown> | undefined;
          if (data && data.published === true && isLandingContent(data.content)) {
            const stored = data.content as LandingContent;
            // Older saved pages predate the socials block: fill it in.
            const socials = stored.socials || { facebook: "", instagram: "", tiktok: "" };
            content = {
              ...stored,
              socials: {
                facebook: typeof socials.facebook === "string" ? socials.facebook : "",
                instagram: typeof socials.instagram === "string" ? socials.instagram : "",
                tiktok: typeof socials.tiktok === "string" ? socials.tiktok : "",
              },
            };
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
      return res.json({ ok: true, published, centreName, content, whatsapp });
    } catch (err) {
      console.error("[landing] GET /api/public/landing failed:", err);
      return res.status(500).json({ error: "Could not load this facility's website." });
    }
  });

  // Enquiry form on the landing page: anonymous visitors send their name,
  // phone and message. Stored in centreLandingLeads for the centre's own
  // admin inbox. Only public marketing data is ever involved here.
  const leadAttempts = new Map<string, number[]>();

  function tooManyRequests(ip: string): boolean {
    const now = Date.now();
    const list = (leadAttempts.get(ip) || []).filter((t) => now - t < 15 * 60 * 1000);
    if (list.length >= 5) {
      leadAttempts.set(ip, list);
      return true;
    }
    list.push(now);
    leadAttempts.set(ip, list);
    if (leadAttempts.size > 5000) leadAttempts.clear();
    return false;
  }

  app.post("/api/public/landing/:centreId/lead", async (req, res) => {
    try {
      const centreId = String(req.params.centreId || "");
      if (!/^[a-zA-Z0-9_-]{3,64}$/.test(centreId)) {
        return res.status(400).json({ error: "A valid facility is required." });
      }
      const ip = String(req.headers["x-forwarded-for"] || req.ip || "anon").split(",")[0].trim();
      if (tooManyRequests(ip)) {
        return res.status(429).json({ error: "Too many enquiries from this device. Please try again later." });
      }
      const body = (req.body || {}) as Record<string, unknown>;
      const name = String(body.name || "").trim().slice(0, 80);
      const phone = String(body.phone || "").trim().slice(0, 24);
      const email = String(body.email || "").trim().slice(0, 120);
      const message = String(body.message || "").trim().slice(0, 1000);
      if (!name || !phone || !message) {
        return res.status(400).json({ error: "Your name, phone number and message are required." });
      }
      if (!/^[0-9+\-() ]{7,24}$/.test(phone)) {
        return res.status(400).json({ error: "Please enter a valid phone number." });
      }
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return res.status(400).json({ error: "Please enter a valid email address, or leave it out." });
      }
      const centreSnap = await adminDb.collection("centres").doc(centreId).get();
      if (!centreSnap.exists) {
        return res.status(404).json({ error: "This facility is not available." });
      }
      const now = new Date().toISOString();
      const ref = await adminDb.collection("centreLandingLeads").add({
        centreId,
        name,
        phone,
        email: email || "",
        message,
        status: "new",
        createdAt: now,
        source: "landing-page",
      });
      console.log(`[landing] lead written facility=${centreId} id=${ref.id}`);
      return res.json({ ok: true });
    } catch (err) {
      console.error("[landing] POST lead failed:", err);
      return res.status(500).json({ error: "Your enquiry could not be sent. Please try again." });
    }
  });
}