import express from 'express';
import { adminDb } from './firebaseAdmin';

/**
 * Batch 40: saved proposals for the TOS console.
 * Every proposal the console generates is saved here so the owner can track
 * it; the public /proposal/:slug page (proposalPage.ts) counts real opens on
 * the same documents, so the list doubles as the follow-up board.
 */

export const proposalSlug = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function registerProposalApiRoutes(app: express.Express) {
  // Save (or re-save) a proposal for a facility. Re-saving the same facility
  // updates the name and keeps the open history.
  app.post('/api/tos/proposals', async (req, res) => {
    try {
      const name = String((req.body || {}).name || '').trim().slice(0, 120);
      const slug = proposalSlug(name);
      if (!name || !slug) return res.status(400).json({ error: 'Enter the facility name first' });
      const ref = adminDb.collection('proposalShares').doc(slug);
      const snap = await ref.get();
      const now = Date.now();
      const prev = (snap.exists ? snap.data() : {}) as any;
      const record = {
        slug,
        name,
        opens: Number(prev.opens || 0),
        lastOpenedAt: Number(prev.lastOpenedAt || 0),
        firstOpenedAt: Number(prev.firstOpenedAt || 0),
        lastNotifiedAt: Number(prev.lastNotifiedAt || 0),
        createdAt: Number(prev.createdAt || 0) || now,
        updatedAt: now,
      };
      await ref.set(record, { merge: true });
      res.json({ proposal: record });
    } catch (error: any) {
      console.error('[tos/proposals] save failed:', error?.message || error);
      res.status(500).json({ error: 'Could not save the proposal' });
    }
  });

  app.get('/api/tos/proposals', async (req, res) => {
    try {
      const snap = await adminDb.collection('proposalShares').orderBy('createdAt', 'desc').limit(200).get();
      res.json({ proposals: snap.docs.map((d) => ({ slug: d.id, ...(d.data() as any) })) });
    } catch (error: any) {
      console.error('[tos/proposals] list failed:', error?.message || error);
      res.status(500).json({ error: 'Could not load saved proposals' });
    }
  });

  app.delete('/api/tos/proposals/:slug', async (req, res) => {
    try {
      await adminDb.collection('proposalShares').doc(String(req.params.slug || '')).delete();
      res.json({ ok: true });
    } catch (error: any) {
      console.error('[tos/proposals] delete failed:', error?.message || error);
      res.status(500).json({ error: 'Could not delete the proposal' });
    }
  });
}
