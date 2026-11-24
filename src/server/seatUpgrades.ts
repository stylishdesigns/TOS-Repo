// ============================================================================
// Batch 27: the Free / Standard / Premium plan model and the upgrade flow.
//
// Every lead and facility sits on the Free plan by default: free seats only.
// More seats come from an approved upgrade request: the facility picks
// Standard or Premium, picks how many students, pays by bank transfer to the
// account held in the platform settings, uploads the receipt, and a TOS admin
// confirms on the console. Confirming assigns exactly the seats paid for
// (they auto-populate on the facility's dashboard above the free seats),
// moves the billing to the chosen plan, raises the tier to facility and sends
// the two confirmation emails (payment, then upgrade).
// ============================================================================

import { adminDb } from './firebaseAdmin';
import { addSeatsForCentre, facilityTier, seatKind, SeatRead } from './seatDays';
import { sendEmail, emailProviderConfigured, OutgoingEmail } from './email';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The bank account facilities pay into. Editable in the TOS console
 *  Settings (platformConfig/global); the values below are the starting
 *  defaults and a saved setting always wins. */
const PAY_ACCOUNT_DEFAULTS = {
  name: 'Michael Ogunnaike',
  number: '5070133907',
  bank: 'Moniepoint',
};
const WHATSAPP_ADMIN_DEFAULT = '09030064109';

async function readPlatformConfig(): Promise<any> {
  const snap = await adminDb.collection('platformConfig').doc('global').get();
  return snap.data() || {};
}

export async function payAccount(): Promise<{
  name: string;
  number: string;
  bank: string;
  whatsappNumber: string;
}> {
  const cfg = await readPlatformConfig();
  return {
    name: String(cfg.payAccountName || '').trim() || PAY_ACCOUNT_DEFAULTS.name,
    number: String(cfg.payAccountNumber || '').trim() || PAY_ACCOUNT_DEFAULTS.number,
    bank: String(cfg.payBank || '').trim() || PAY_ACCOUNT_DEFAULTS.bank,
    whatsappNumber: String(cfg.tosWhatsappNumber || '').trim() || WHATSAPP_ADMIN_DEFAULT,
  };
}

/**
 * One-time plan-model migration, guarded by plansV2DoneAt on
 * platformConfig/global: seeds the Free plan, renames the display names
 * (Facility Standard -> Standard, Facility Plus -> Premium) and moves every
 * lead (and any facility with no plan on file) onto the Free plan. Rides the
 * seats read like the batch 26 migration so no terminal or script is needed.
 */
/**
 * One-time plan-feature migration, guarded by plansV3DoneAt on
 * platformConfig/global: renames the plan display names to the Facility
 * suffix (Free Facility, Standard Facility, Premium Facility), stamps the
 * per-plan feature fields (AI credits per seat, storage GB, question-bank
 * cap, notification channels) and moves AI question generation and AI
 * performance analysis onto Standard Facility. Rides the seats read like the
 * earlier migrations so no terminal or script is needed.
 */
export async function ensurePlansV3(): Promise<void> {
  const cfgRef = adminDb.collection('platformConfig').doc('global');
  const cfgSnap = await cfgRef.get();
  const cfg = (cfgSnap.data() || {}) as any;
  if (cfg.plansV3DoneAt) return;

  const planFields: Record<string, Record<string, unknown>> = {
    centre_free: {
      name: 'Free Facility',
      aiQuestionGen: false,
      aiPerformanceAnalysis: false,
      aiCreditsPerSeat: 50,
      storageGb: 1,
      questionBankCap: 1000, // 0 = unlimited
      notificationChannels: ['email'],
    },
    centre_standard: {
      name: 'Standard Facility',
      aiQuestionGen: true,
      aiPerformanceAnalysis: true,
      aiCreditsPerSeat: 200,
      storageGb: 10,
      questionBankCap: 0, // 0 = unlimited
      notificationChannels: ['email', 'push'],
    },
    centre_plus: {
      name: 'Premium Facility',
      aiQuestionGen: true,
      aiPerformanceAnalysis: true,
      aiCreditsPerSeat: 500,
      storageGb: 25,
      questionBankCap: 0, // 0 = unlimited
      notificationChannels: ['email', 'push', 'whatsapp'],
    },
  };
  for (const [id, fields] of Object.entries(planFields)) {
    const ref = adminDb.collection('platformPlans').doc(id);
    const snap = await ref.get();
    if (snap.exists) await ref.set(fields, { merge: true });
  }

  await cfgRef.set({ plansV3DoneAt: new Date().toISOString() }, { merge: true });
  console.warn('[plansV3] plan names renamed to the Facility suffix and feature fields stamped');
}

export async function ensurePlansV2(): Promise<void> {
  const cfgRef = adminDb.collection('platformConfig').doc('global');
  const cfgSnap = await cfgRef.get();
  const cfg = (cfgSnap.data() || {}) as any;
  if (cfg.plansV2DoneAt) return;

  // 1. The Free plan: create-if-missing.
  const freeRef = adminDb.collection('platformPlans').doc('centre_free');
  const freeSnap = await freeRef.get();
  if (!freeSnap.exists) {
    await freeRef.set({
      id: 'centre_free',
      name: 'Free',
      price: 0,
      priceType: 'per_seat',
      seatCap: 0,
      trialSeatCap: 0,
      trialDays: 0,
      studentChat: true,
      whatsappNotifications: false,
      aiEssayMarking: false,
      aiQuestionGen: false,
      aiPerformanceAnalysis: false,
    });
  }

  // 2. Display renames. Ids never change so billing documents stay valid.
  const renames: Record<string, string> = {
    centre_standard: 'Standard',
    centre_plus: 'Premium',
  };
  for (const [id, name] of Object.entries(renames)) {
    const ref = adminDb.collection('platformPlans').doc(id);
    const snap = await ref.get();
    if (snap.exists) {
      const current = String((snap.data() as any)?.name || '');
      if (current && current !== name) await ref.update({ name });
    }
  }

  // 3. Leads (and any billing doc without a plan) default to Free.
  let moved = 0;
  const billings = await adminDb.collection('centreBilling').get();
  const batch = adminDb.batch();
  billings.docs.forEach((d) => {
    const b = d.data() as any;
    const planId = String(b.planId || '');
    if (facilityTier(b) === 'lead' && planId !== 'centre_free') {
      batch.set(d.ref, { planId: 'centre_free', planSetByPlatform: 'plans_v2' }, { merge: true });
      moved += 1;
    }
  });
  if (moved) await batch.commit();

  await cfgRef.set(
    { plansV2DoneAt: new Date().toISOString(), plansV2Moved: moved },
    { merge: true }
  );
  console.warn(
    `[plans-v2] Free plan ensured, plan names updated (Standard/Premium), ${moved} lead billing doc(s) moved to Free.`
  );
}

/** Paid seats by state: "active" is anything not locked (running or paused),
 *  "locked" seats have finished their days and need a new payment. */
export async function paidSeatStats(
  centreId: string
): Promise<{ total: number; active: number; locked: number }> {
  const snap = await adminDb.collection('centreSeats').where('centreId', '==', centreId).get();
  let total = 0;
  let active = 0;
  let locked = 0;
  snap.docs.forEach((d) => {
    const s = d.data() as any;
    if (seatKind(s as SeatRead) !== 'paid') return;
    total += 1;
    if (String(s.status || '') === 'locked') locked += 1;
    else active += 1;
  });
  return { total, active, locked };
}

export interface UpgradeRequestOutcome {
  ok: boolean;
  error?: string;
  needed?: number;
  minimum?: number;
  active?: number;
  request?: { id: string; seats: number; total: number; planName: string };
}

/** The facility files an upgrade request. The paid-seat minimum and the cap
 *  are checked here AND again on approval, so a stale request never writes a
 *  half state. The active-plus-purchase total may never land below the
 *  platform minimum (batch 27 ruling). */
export async function createUpgradeRequest(input: {
  centreId: string;
  centreName: string;
  planId: string;
  seats: number;
  receiptUrl: string;
  requestedByUid: string;
}): Promise<UpgradeRequestOutcome> {
  const seats = Math.max(1, Math.floor(Number(input.seats || 0)));
  if (!['centre_standard', 'centre_plus'].includes(input.planId)) {
    return {
      ok: false,
      error: 'Pick the Standard or Premium plan to buy seats. The Free plan needs no payment.',
    };
  }
  const planSnap = await adminDb.collection('platformPlans').doc(input.planId).get();
  if (!planSnap.exists) return { ok: false, error: 'That plan no longer exists. Pick another plan.' };
  const plan = planSnap.data() as any;

  const cfg = await readPlatformConfig();
  const minimum = Math.max(0, Math.floor(Number(cfg.paidSeatMinimum ?? 5)));
  const cap =
    cfg.paidSeatsUnlimited === true
      ? Infinity
      : Math.max(1, Math.floor(Number(cfg.paidMaxSeats ?? 50)));
  const stats = await paidSeatStats(input.centreId);

  // With paid seats already active, the purchase tops the pool up to at
  // least the minimum: active + this purchase >= minimum.
  const minSeats = stats.active >= 1 ? Math.max(1, minimum - stats.active) : Math.max(1, minimum);
  if (seats < minSeats) {
    return {
      ok: false,
      error:
        stats.active >= 1
          ? `Your facility already holds ${stats.active} active paid seat${stats.active === 1 ? '' : 's'}, so this purchase must take the total to at least ${minimum}: buy at least ${minSeats} seat${minSeats === 1 ? '' : 's'}.`
          : `The platform minimum is ${minimum} paid seats on the first purchase, so pick at least ${minimum}.`,
      needed: minSeats,
      minimum,
      active: stats.active,
    };
  }
  if (Number.isFinite(cap) && stats.total + seats > cap) {
    return {
      ok: false,
      error: `This purchase would take the facility past its ${cap}-paid-seat cap. The most it can buy now is ${Math.max(0, cap - stats.total)}.`,
    };
  }

  const perSeat = Math.max(0, Number(plan.price || 0));
  const total = seats * perSeat;
  // A request never leaves this function without its receipt: the receipt is
  // uploaded before the request exists, so a payment without proof can never
  // sit waiting for confirmation.
  const doc = await adminDb.collection('centreUpgradeRequests').add({
    centreId: input.centreId,
    centreName: String(input.centreName || ''),
    planId: input.planId,
    planName: String(plan.name || input.planId),
    seats,
    perSeatPrice: perSeat,
    total,
    status: 'pending',
    receiptUrl: String(input.receiptUrl || ''),
    receiptUploadedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    requestedByUid: String(input.requestedByUid || ''),
  });
  await adminDb.collection('auditLogs').add({
    actorUid: input.requestedByUid,
    centreId: input.centreId,
    action: 'UPGRADE_REQUEST_CREATED',
    after: { requestId: doc.id, planId: input.planId, seats, total, hasReceipt: true },
    at: new Date().toISOString(),
  });
  return {
    ok: true,
    request: { id: doc.id, seats, total, planName: String(plan.name || '') },
  };
}

export async function attachReceiptToUpgradeRequest(
  requestId: string,
  receiptUrl: string,
  actorUid: string
): Promise<void> {
  await adminDb
    .collection('centreUpgradeRequests')
    .doc(requestId)
    .set(
      { receiptUrl: String(receiptUrl || ''), receiptUploadedAt: new Date().toISOString() },
      { merge: true }
    );
  await adminDb.collection('auditLogs').add({
    actorUid,
    action: 'UPGRADE_RECEIPT_UPLOADED',
    after: { requestId, receiptUrl: String(receiptUrl || '') },
    at: new Date().toISOString(),
  });
}

// Every seat payment a facility has made, newest first: bank-transfer
// upgrade requests (with their receipt and confirmation times) plus payments a
// platform admin recorded directly that bought seats. Awaiting rows are
// confirmed only when Tutorial OS has approved them.
export async function listSeatPayments(centreId: string): Promise<any[]> {
  const rows: any[] = [];
  const reqSnap = await adminDb
    .collection('centreUpgradeRequests')
    .where('centreId', '==', centreId)
    .get();
  reqSnap.forEach((d) => {
    const v = d.data() as any;
    const status = String(v.status || 'pending');
    rows.push({
      id: d.id,
      source: 'transfer',
      planName: String(v.planName || ''),
      seats: Number(v.seats || 0),
      amount: Number(v.total || 0),
      paidAt: String(v.createdAt || ''),
      status,
      confirmedAt: status === 'approved' ? String(v.decidedAt || '') : '',
      receiptUrl: String(v.receiptUrl || ''),
      reference: String(v.reference || ''),
    });
  });
  const paySnap = await adminDb
    .collection('billingPayments')
    .where('centreId', '==', centreId)
    .get();
  paySnap.forEach((d) => {
    const v = d.data() as any;
    const seats = Math.max(0, Math.floor(Number(v.seats || 0)));
    if (seats <= 0) return; // only payments that bought seats belong here
    rows.push({
      id: d.id,
      source: 'recorded',
      planName: '',
      seats,
      amount: Number(v.amount || 0),
      paidAt: String(v.at || ''),
      status: 'approved',
      confirmedAt: String(v.at || ''),
      receiptUrl: String(v.receiptUrl || ''),
      reference: String(v.reference || ''),
    });
  });
  rows.sort((a, b) => String(b.paidAt || '').localeCompare(String(a.paidAt || '')));
  return rows;
}

export async function listUpgradeRequests(): Promise<any[]> {
  const snap = await adminDb
    .collection('centreUpgradeRequests')
    .orderBy('createdAt', 'desc')
    .limit(200)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Emails + in-app/push audience for one facility: owner and active
 *  owner/admin members, the same source the seat sweeps use. */
async function centreAudience(centreId: string): Promise<{ emails: string[]; uids: string[] }> {
  const emails = new Set<string>();
  const uids = new Set<string>();
  try {
    const centreDoc = await adminDb.collection('centres').doc(centreId).get();
    const ownerEmail = String((centreDoc.data() as any)?.ownerEmail || '');
    if (ownerEmail && EMAIL_RE.test(ownerEmail)) emails.add(ownerEmail.toLowerCase());
  } catch { /* best effort */ }
  try {
    const memSnap = await adminDb.collection('memberships').where('centreId', '==', centreId).get();
    memSnap.docs.forEach((d) => {
      const m = d.data() as any;
      if (['owner', 'admin'].includes(String(m.role || '')) && String(m.status || 'active') === 'active' && m.uid) {
        uids.add(String(m.uid));
      }
    });
  } catch { /* best effort */ }
  for (const uid of uids) {
    try {
      const uDoc = await adminDb.collection('users').doc(uid).get();
      const email = String((uDoc.data() as any)?.email || '').toLowerCase();
      if (email && EMAIL_RE.test(email)) emails.add(email);
    } catch { /* skip this one */ }
  }
  return { emails: [...emails], uids: [...uids] };
}

/** In-app + push notice to the facility's admins, same write shape the seat
 *  sweeps use. */
async function notifyCentreAdmins(
  centreId: string,
  uids: string[],
  key: string,
  kind: string,
  title: string,
  body: string
): Promise<void> {
  for (const uid of uids) {
    try {
      await adminDb.collection('notifications').doc(`not-${key}-${uid.slice(0, 8)}`).set({
        centreId,
        type: 'billing',
        title,
        body,
        audienceUid: uid,
        createdAt: Date.now(),
        subjects: [],
        programmes: [],
      });
    } catch { /* in-app is best effort; the push still tries */ }
    try {
      await adminDb.collection('pushQueue').doc(`push-${key}-${uid.slice(0, 8)}`).set({
        kind,
        uid,
        centreId,
        pushTitle: title,
        pushBody: body,
        sendAt: Date.now(),
        sent: false,
      });
    } catch { /* push is best effort */ }
  }
}

const naira = (n: number) => `₦${Number(n || 0).toLocaleString()}`;

function emailShell(title: string, bodyHtml: string): string {
  return `
  <div style="font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px 16px;">
    <p style="font-size: 12px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #F97316; margin: 0 0 12px;">Tutorial OS</p>
    <h1 style="font-size: 22px; font-weight: 800; color: #0F172A; margin: 0 0 12px;">${title}</h1>
    ${bodyHtml}
    <p style="font-size: 12px; color: #94A3B8; margin-top: 24px;">The Tutorial OS team</p>
  </div>`;
}

function planBenefits(plan: any): string[] {
  const out: string[] = [];
  if (plan?.studentChat !== false) out.push('Student chat with tutors');
  if (plan?.whatsappNotifications === true) out.push('WhatsApp notifications for parents');
  if (plan?.aiQuestionGen === true) out.push('AI question generation');
  if (plan?.aiPerformanceAnalysis === true) out.push('AI performance analysis');
  if (plan?.id === 'centre_plus') out.push('Everything in Standard, plus Premium support');
  return out;
}

/**
 * The TOS admin's decision. Approve creates exactly the seats paid for (the
 * minimum and cap are re-checked first, so a stale request never writes a
 * half state), flips the billing to the chosen plan and the tier to
 * facility, records the platform payment, and sends the two confirmation
 * emails. Decline records the reason and tells the facility.
 */
export async function decideUpgradeRequest(input: {
  requestId: string;
  action: 'approve' | 'decline';
  actorUid: string;
  declineReason?: string;
}): Promise<{ ok: boolean; action: string; seatsCreated?: number[]; emailsSent?: number }> {
  const ref = adminDb.collection('centreUpgradeRequests').doc(input.requestId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('That upgrade request no longer exists.');
  const req = snap.data() as any;
  if (String(req.status || '') !== 'pending') throw new Error('That request was already handled.');
  const centreId = String(req.centreId || '');
  const now = new Date().toISOString();

  if (input.action === 'decline') {
    await ref.set(
      {
        status: 'declined',
        declineReason: String(input.declineReason || '').slice(0, 300),
        decidedAt: now,
        decidedBy: input.actorUid,
      },
      { merge: true }
    );
    await adminDb.collection('auditLogs').add({
      actorUid: input.actorUid,
      centreId,
      action: 'UPGRADE_REQUEST_DECLINED',
      after: { requestId: input.requestId, reason: String(input.declineReason || '') },
      at: now,
    });
    const audience = await centreAudience(centreId);
    if (audience.uids.length) {
      await notifyCentreAdmins(
        centreId,
        audience.uids,
        `upgdecl-${input.requestId.slice(0, 6)}`,
        'upgrade_declined',
        'Upgrade request declined',
        `Your ${String(req.planName || '')} upgrade request for ${Number(req.seats || 0)} seats was declined.${input.declineReason ? ` Reason: ${String(input.declineReason).slice(0, 200)}` : ''}`
      );
    }
    return { ok: true, action: 'declined' };
  }

  // Approve: re-check the rules, then create the seats and flip the billing.
  const seats = Math.max(1, Math.floor(Number(req.seats || 0)));
  const result = await addSeatsForCentre(centreId, seats);
  if (result.planRequired || result.underMinimum || result.capped) {
    throw new Error(result.message || 'The seats can no longer be created as requested. Review the facility and try again.');
  }

  await adminDb.collection('centreBilling').doc(centreId).set(
    {
      planId: String(req.planId || ''),
      tier: 'facility',
      paidThrough: now,
      upgradedAt: now,
    },
    { merge: true }
  );
  await ref.set(
    { status: 'approved', decidedAt: now, decidedBy: input.actorUid, seatsCreated: result.created },
    { merge: true }
  );
  await adminDb.collection('platformPayments').add({
    centreId,
    centreName: String(req.centreName || ''),
    planId: String(req.planId || ''),
    planName: String(req.planName || ''),
    seats,
    total: Number(req.total || 0),
    requestId: input.requestId,
    at: now,
  });
  await adminDb.collection('auditLogs').add({
    actorUid: input.actorUid,
    centreId,
    action: 'UPGRADE_APPROVED',
    after: { requestId: input.requestId, planId: req.planId, seats, total: req.total },
    at: now,
  });

  const planSnap = await adminDb.collection('platformPlans').doc(String(req.planId || '')).get();
  const plan = (planSnap.data() || {}) as any;
  const centreName = String(req.centreName || 'your facility');
  const total = Number(req.total || 0);
  const perSeat = Number(req.perSeatPrice || 0);

  const audience = await centreAudience(centreId);

  // Email 1: the payment confirmation, about the transaction itself.
  const paymentMail: Omit<OutgoingEmail, 'to'> = {
    subject: `Payment confirmed: ${naira(total)} for ${centreName}`,
    html: emailShell(
      'Payment confirmed',
      `<p style="font-size:14px;color:#334155;line-height:1.6;margin:0 0 12px;">We have confirmed your payment of <strong style="color:#0F172A;">${naira(total)}</strong> for the <strong style="color:#0F172A;">${String(req.planName || '')}</strong> plan: ${seats} seat${seats === 1 ? '' : 's'} at ${naira(perSeat)} per seat.</p>
       <p style="font-size:14px;color:#334155;line-height:1.6;margin:0;">Your upgrade is being finalised right now and a second email is on its way with everything that came with it.</p>`
    ),
    text: `We have confirmed your payment of ${naira(total)} for the ${String(req.planName || '')} plan (${seats} seats at ${naira(perSeat)} per seat). Your upgrade is being finalised now.`,
  };
  // Email 2: the upgrade confirmation, about what they now have.
  const benefits = planBenefits(plan);
  const benefitsHtml = benefits.length
    ? `<ul style="font-size:14px;color:#334155;line-height:1.7;margin:8px 0 16px;padding-left:20px;">${benefits.map((b) => `<li>${b}</li>`).join('')}</ul>`
    : '';
  const upgradeMail: Omit<OutgoingEmail, 'to'> = {
    subject: `Welcome to ${String(req.planName || '')} — your upgrade is live`,
    html: emailShell(
      'Congratulations, your upgrade is live',
      `<p style="font-size:14px;color:#334155;line-height:1.6;margin:0 0 12px;">${centreName} is now on the <strong style="color:#0F172A;">${String(req.planName || '')}</strong> plan. Your <strong style="color:#0F172A;">${seats} paid seat${seats === 1 ? '' : 's'}</strong> have landed on your dashboard already, ready on top of your free seats.</p>
       ${benefitsHtml ? `<p style="font-size:14px;color:#334155;line-height:1.6;margin:0 0 4px;">What comes with ${String(req.planName || '')}:</p>${benefitsHtml}` : ''}
       <p style="font-size:14px;color:#334155;line-height:1.6;margin:0;">Add your students to their seats whenever you are ready. Welcome aboard.</p>`
    ),
    text: `Congratulations, your upgrade is live. ${centreName} is now on the ${String(req.planName || '')} plan with ${seats} paid seats on top of your free seats.${benefits.length ? ` Included: ${benefits.join(', ')}.` : ''} Add your students whenever you are ready.`,
  };

  let emailsSent = 0;
  for (const mail of [paymentMail, upgradeMail]) {
    for (const to of audience.emails) {
      try {
        const r = await sendEmail({ ...mail, to });
        if (r.delivered) emailsSent += 1;
      } catch { /* one recipient failing never blocks the rest */ }
    }
  }

  if (audience.uids.length) {
    await notifyCentreAdmins(
      centreId,
      audience.uids,
      `upgappr-${input.requestId.slice(0, 6)}`,
      'upgrade_approved',
      'Upgrade approved',
      `Your ${String(req.planName || '')} upgrade is live: ${seats} paid seat${seats === 1 ? '' : 's'} just landed on your dashboard, on top of your free seats.`
    );
  }

  return { ok: true, action: 'approved', seatsCreated: result.created, emailsSent };
}
