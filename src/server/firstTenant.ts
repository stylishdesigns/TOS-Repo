import { adminDb } from './firebaseAdmin';
import { applyImport } from './tosImport';

/**
 * One-time first-tenant reconciliation, requested by the user on 2026-10-21:
 * provision the first centre (Excellence Tutorial Centre) automatically at
 * platform sign-in, because its owner account already exists in Firebase Auth
 * and the manual Add-centre form deliberately rejects existing emails. This
 * runs the SAME reviewed import-apply logic as the console import
 * (tosImport.applyImport) with the agreed parameters, stamped in
 * platformConfig/global so it runs at most once. applyImport is idempotent,
 * so a retry or a later console import changes nothing the second time.
 */
const FIRST_TENANT = {
  centreId: 'centre-excellence',
  ownerUid: 'BGQSmv8YPfhJb1VE4bG3SaM1XVx1',
  ownerEmail: 'superadmin@mailto.plus',
  centreName: 'Excellence Tutorial Centre',
};

export async function reconcileFirstTenant(): Promise<void> {
  try {
    const configRef = adminDb.collection('platformConfig').doc('global');
    const configDoc = await configRef.get();
    if (configDoc.exists && (configDoc.data() as any)?.firstTenantReconciledAt) return;
    const result = await applyImport({ ...FIRST_TENANT, actorUid: 'system:first-tenant-reconcile' });
    await configRef.set(
      {
        firstTenantReconciledAt: new Date().toISOString(),
        firstTenantCentreId: FIRST_TENANT.centreId,
      },
      { merge: true }
    );
    console.warn(
      `[first-tenant] ${FIRST_TENANT.centreId} reconciled: ` +
        `access code ${result.removedCodes.length > 0 ? `rotated (removed ${result.removedCodes.join(', ')})` : 'set'}, ` +
        `backfill updated ${result.backfillUpdated} document(s).`
    );
  } catch (err) {
    // Never block sign-in. No stamp is written on failure, so the next
    // platform sign-in retries.
    console.error('[first-tenant] reconciliation failed (retries at the next sign-in):', (err as any)?.message || err);
  }
}
