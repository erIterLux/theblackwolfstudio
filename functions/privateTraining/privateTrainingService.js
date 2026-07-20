const crypto = require('crypto');
const admin = require('firebase-admin');
const { HttpsError } = require('firebase-functions/v2/https');

const db = admin.firestore();
const INSTRUCTOR_ROLES = new Set(['instructor', 'admin']);
const OFFER_STATUSES = new Set(['draft', 'published', 'hidden', 'archived']);
const PRICING_MODELS = new Set(['flat', 'per_participant', 'participant_tiers']);
const MAX_PRIVATE_PARTICIPANTS = 3;

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeEmail(value) {
  return clean(value, 320).toLowerCase();
}

function cents(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : fallback;
}

function integer(value, min, max, fallback = min) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function lines(value, limit = 20) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => clean(item, 240)).filter(Boolean).slice(0, limit);
}

function serialize(value) {
  if (value == null) return value;
  if (value instanceof admin.firestore.Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, serialize(child)]),
    );
  }
  return value;
}

function callerRole(request) {
  if (request.auth?.token?.admin === true || request.auth?.token?.role === 'admin') {
    return 'admin';
  }
  if (request.auth?.token?.role === 'instructor') return 'instructor';
  return 'member';
}

function requireInstructor(request) {
  if (!request.auth?.uid || !INSTRUCTOR_ROLES.has(callerRole(request))) {
    throw new HttpsError('permission-denied', 'Instructor access is required.');
  }
  return request.auth.uid;
}

function requireAuthenticated(request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in to view private training.');
  }
  return request.auth.uid;
}

function hashToken(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function participantId(index) {
  return `participant-${index + 1}`;
}

function sanitizePrivateTrainingParticipants(rawParticipants, quantity, purchaser) {
  const count = integer(quantity, 1, MAX_PRIVATE_PARTICIPANTS, 1);
  const input = Array.isArray(rawParticipants) ? rawParticipants : [];

  if (input.length !== count) {
    throw new HttpsError(
      'invalid-argument',
      `Enter information for all ${count} participant${count === 1 ? '' : 's'}.`,
    );
  }

  return input.map((raw, index) => {
    const fullName = clean(raw?.fullName || raw?.name, 160);
    const email = normalizeEmail(raw?.email);
    const phone = clean(raw?.phone, 40);

    if (!fullName) {
      throw new HttpsError(
        'invalid-argument',
        `Participant ${index + 1} needs a full name.`,
      );
    }
    if (email && !email.includes('@')) {
      throw new HttpsError(
        'invalid-argument',
        `Participant ${index + 1} has an invalid email address.`,
      );
    }

    const isPurchaser = raw?.isPurchaser === true
      || (
        normalizeEmail(purchaser?.email)
        && email
        && normalizeEmail(purchaser.email) === email
      );

    return {
      id: clean(raw?.id, 80) || participantId(index),
      fullName,
      email: email || null,
      phone: phone || null,
      isPurchaser,
    };
  });
}

function privateTrainingConfigFromOffer(offer) {
  const raw = offer?.privateTraining || offer?.metadata?.privateTraining || {};
  return {
    sessionCount: integer(raw.sessionCount, 1, 100, 1),
    sessionDurationMinutes: integer(raw.sessionDurationMinutes, 15, 240, 60),
    expirationDays: integer(raw.expirationDays, 0, 730, 180),
    maxParticipants: integer(
      raw.maxParticipants,
      1,
      MAX_PRIVATE_PARTICIPANTS,
      MAX_PRIVATE_PARTICIPANTS,
    ),
    included: lines(raw.included, 20),
    focusAreas: lines(raw.focusAreas, 20),
  };
}

function assertPrivateTrainingParticipantLimit(offer, quantity) {
  const count = integer(quantity, 1, MAX_PRIVATE_PARTICIPANTS, 1);
  const config = privateTrainingConfigFromOffer(offer);
  if (count > config.maxParticipants) {
    throw new HttpsError(
      'failed-precondition',
      `This package supports up to ${config.maxParticipants} participant${config.maxParticipants === 1 ? '' : 's'}.`,
    );
  }
  return config;
}

function sanitizePrivateTrainingOffer(data, instructorUid) {
  const name = clean(data?.name, 160);
  const status = OFFER_STATUSES.has(data?.status) ? data.status : 'draft';
  const pricingModel = PRICING_MODELS.has(data?.pricingModel)
    ? data.pricingModel
    : 'participant_tiers';
  const maxParticipants = integer(
    data?.maxParticipants,
    1,
    MAX_PRIVATE_PARTICIPANTS,
    MAX_PRIVATE_PARTICIPANTS,
  );

  if (!name) throw new HttpsError('invalid-argument', 'Package name is required.');

  const participantAmounts = data?.participantAmountsCents || {};
  const payload = {
    purchaseType: 'private_training',
    name,
    shortDescription: clean(data?.shortDescription, 500),
    longDescription: clean(data?.longDescription, 4000),
    status,
    sortOrder: integer(data?.sortOrder, 0, 9999, 0),
    currency: clean(data?.currency || 'usd', 8).toLowerCase(),
    pricingModel,
    amountCents: cents(data?.amountCents),
    unitAmountCents: cents(data?.unitAmountCents),
    participantAmountsCents: {
      1: cents(participantAmounts[1] ?? participantAmounts['1']),
      2: cents(participantAmounts[2] ?? participantAmounts['2']),
      3: cents(participantAmounts[3] ?? participantAmounts['3']),
    },
    memberDiscountEligible: data?.memberDiscountEligible !== false,
    privateTraining: {
      sessionCount: integer(data?.sessionCount, 1, 100, 1),
      sessionDurationMinutes: integer(data?.sessionDurationMinutes, 15, 240, 60),
      expirationDays: integer(data?.expirationDays, 0, 730, 180),
      maxParticipants,
      included: lines(data?.included, 20),
      focusAreas: lines(data?.focusAreas, 20),
    },
    updatedBy: instructorUid,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (pricingModel === 'flat' && !payload.amountCents) {
    throw new HttpsError('invalid-argument', 'Enter a package price.');
  }
  if (pricingModel === 'per_participant' && !payload.unitAmountCents) {
    throw new HttpsError('invalid-argument', 'Enter a per-participant price.');
  }
  if (pricingModel === 'participant_tiers') {
    for (let count = 1; count <= maxParticipants; count += 1) {
      if (!payload.participantAmountsCents[count]) {
        throw new HttpsError(
          'invalid-argument',
          `Enter a price for ${count} participant${count === 1 ? '' : 's'}.`,
        );
      }
    }
  }

  return payload;
}

async function handleSavePrivateTrainingOffer(request) {
  const instructorUid = requireInstructor(request);
  const offerId = clean(request.data?.offerId, 160);
  const ref = offerId
    ? db.collection('studioOffers').doc(offerId)
    : db.collection('studioOffers').doc();
  const existing = await ref.get();
  const payload = sanitizePrivateTrainingOffer(request.data, instructorUid);

  await ref.set({
    ...payload,
    createdBy: existing.data()?.createdBy || instructorUid,
    createdAt: existing.data()?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return { offerId: ref.id };
}

function publicOffer(snapshot) {
  const offer = snapshot.data() || {};
  const config = privateTrainingConfigFromOffer(offer);
  return serialize({
    id: snapshot.id,
    name: offer.name,
    shortDescription: offer.shortDescription,
    longDescription: offer.longDescription,
    status: offer.status,
    currency: offer.currency || 'usd',
    pricingModel: offer.pricingModel || 'participant_tiers',
    amountCents: offer.amountCents || 0,
    unitAmountCents: offer.unitAmountCents || 0,
    participantAmountsCents: offer.participantAmountsCents || {},
    memberDiscountEligible: offer.memberDiscountEligible !== false,
    privateTraining: config,
    sortOrder: Number(offer.sortOrder || 0),
  });
}

async function handleListPrivateTrainingOffers() {
  const snapshot = await db.collection('studioOffers')
    .where('purchaseType', '==', 'private_training')
    .limit(100)
    .get();

  const offers = snapshot.docs
    .filter((item) => item.data()?.status === 'published')
    .map(publicOffer)
    .sort((left, right) => (
      Number(left.sortOrder || 0) - Number(right.sortOrder || 0)
      || String(left.name || '').localeCompare(String(right.name || ''))
    ));

  return { offers };
}

function purchaseStatus(remainingSessions, expiresAt) {
  if (remainingSessions <= 0) return 'used';
  if (expiresAt?.toMillis?.() && expiresAt.toMillis() < Date.now()) return 'expired';
  return 'active';
}

function purchaseExpiration(baseTimestamp, expirationDays) {
  if (!expirationDays) return null;
  const base = baseTimestamp?.toDate?.() || new Date();
  return admin.firestore.Timestamp.fromDate(
    new Date(base.getTime() + expirationDays * 24 * 60 * 60 * 1000),
  );
}

async function ensurePrivateTrainingPurchaseFromOrder(orderId) {
  const id = clean(orderId, 160);
  if (!id) return null;

  const orderRef = db.collection('studioOrders').doc(id);
  const purchaseRef = db.collection('privateTrainingPurchases').doc(id);

  await db.runTransaction(async (transaction) => {
    const [orderSnapshot, purchaseSnapshot] = await Promise.all([
      transaction.get(orderRef),
      transaction.get(purchaseRef),
    ]);

    if (purchaseSnapshot.exists) return;
    if (!orderSnapshot.exists) {
      throw new Error(`Private training order ${id} was not found.`);
    }

    const order = orderSnapshot.data() || {};
    if (order.purchaseType !== 'private_training' || order.paymentStatus !== 'paid') return;

    const config = order.privateTraining || {};
    const purchasedSessions = integer(config.sessionCount, 1, 100, 1);
    const expirationDays = integer(config.expirationDays, 0, 730, 180);
    const expiresAt = purchaseExpiration(order.paidAt, expirationDays);

    transaction.set(purchaseRef, {
      id,
      orderId: id,
      uid: order.uid || null,
      purchaser: order.purchaser || null,
      participants: Array.isArray(order.participants) ? order.participants : [],
      participantCount: Number(order.participantCount || order.quantity || 1),
      offerId: order.offerId,
      offerName: order.offerName,
      pricing: order.pricing || null,
      purchasedSessions,
      adjustmentSessions: 0,
      totalSessions: purchasedSessions,
      usedSessions: 0,
      remainingSessions: purchasedSessions,
      sessionDurationMinutes: integer(config.sessionDurationMinutes, 15, 240, 60),
      maxParticipants: integer(config.maxParticipants, 1, MAX_PRIVATE_PARTICIPANTS, 3),
      expirationDays,
      expiresAt,
      status: purchaseStatus(purchasedSessions, expiresAt),
      stripeCheckoutSessionId: order.stripeCheckoutSessionId || null,
      stripePaymentIntentId: order.stripePaymentIntentId || null,
      paidAt: order.paidAt || admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  return id;
}

async function authorizePurchase(request, purchase) {
  if (request.auth?.uid && request.auth.uid === purchase.uid) return;
  if (INSTRUCTOR_ROLES.has(callerRole(request))) return;

  const orderSnapshot = await db.collection('studioOrders').doc(purchase.orderId).get();
  const order = orderSnapshot.data() || {};
  const supplied = hashToken(request.data?.accessToken);
  if (!order.accessTokenHash || !safeEqual(order.accessTokenHash, supplied)) {
    throw new HttpsError('permission-denied', 'You do not have access to this package.');
  }
}

async function getHistory(purchaseId) {
  const snapshot = await db.collection('privateTrainingPurchases')
    .doc(purchaseId)
    .collection('sessionHistory')
    .limit(200)
    .get();

  return snapshot.docs
    .map((item) => serialize({ id: item.id, ...item.data() }))
    .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));
}

async function handleGetPrivateTrainingPurchase(request) {
  const purchaseId = clean(request.data?.purchaseId || request.data?.orderId, 160);
  if (!purchaseId) throw new HttpsError('invalid-argument', 'Package ID is required.');

  const snapshot = await db.collection('privateTrainingPurchases').doc(purchaseId).get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'That package was not found.');

  const purchase = { id: snapshot.id, ...snapshot.data() };
  await authorizePurchase(request, purchase);
  const history = await getHistory(snapshot.id);
  return { purchase: serialize(purchase), history };
}

async function handleListMyPrivateTrainingPurchases(request) {
  const uid = requireAuthenticated(request);
  const snapshot = await db.collection('privateTrainingPurchases')
    .where('uid', '==', uid)
    .limit(100)
    .get();

  const purchases = snapshot.docs
    .map((item) => serialize({ id: item.id, ...item.data() }))
    .sort((left, right) => new Date(right.paidAt || right.createdAt || 0) - new Date(left.paidAt || left.createdAt || 0));

  return { purchases };
}

async function handleListPrivateTrainingAdmin(request) {
  requireInstructor(request);

  const [offersSnapshot, purchasesSnapshot] = await Promise.all([
    db.collection('studioOffers')
      .where('purchaseType', '==', 'private_training')
      .limit(200)
      .get(),
    db.collection('privateTrainingPurchases').limit(300).get(),
  ]);

  const offers = offersSnapshot.docs
    .map((item) => serialize({ id: item.id, ...item.data() }))
    .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0));
  const purchases = purchasesSnapshot.docs
    .map((item) => serialize({ id: item.id, ...item.data() }))
    .sort((left, right) => new Date(right.paidAt || right.createdAt || 0) - new Date(left.paidAt || left.createdAt || 0));

  return { offers, purchases };
}

function parseSessionDate(value) {
  if (!value) return admin.firestore.Timestamp.now();
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    throw new HttpsError('invalid-argument', 'Enter a valid session date.');
  }
  return admin.firestore.Timestamp.fromDate(date);
}

async function handleRecordPrivateTrainingSession(request) {
  const instructorUid = requireInstructor(request);
  const purchaseId = clean(request.data?.purchaseId, 160);
  const notes = clean(request.data?.notes, 1200);
  const sessionAt = parseSessionDate(request.data?.sessionAt);
  const requestedParticipantIds = Array.isArray(request.data?.participantIds)
    ? request.data.participantIds.map((value) => clean(value, 80)).filter(Boolean)
    : [];

  if (!purchaseId) throw new HttpsError('invalid-argument', 'Choose a package.');

  const purchaseRef = db.collection('privateTrainingPurchases').doc(purchaseId);
  const historyRef = purchaseRef.collection('sessionHistory').doc();
  let result = null;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(purchaseRef);
    if (!snapshot.exists) throw new HttpsError('not-found', 'That package was not found.');

    const purchase = snapshot.data() || {};
    const remaining = Number(purchase.remainingSessions || 0);
    if (remaining <= 0) {
      throw new HttpsError('failed-precondition', 'This package has no remaining sessions.');
    }
    if (purchase.expiresAt?.toMillis?.() && purchase.expiresAt.toMillis() < Date.now()) {
      throw new HttpsError('failed-precondition', 'This package has expired.');
    }

    const validIds = new Set((purchase.participants || []).map((item) => item.id));
    const participantIds = requestedParticipantIds.length
      ? requestedParticipantIds
      : [...validIds];
    if (!participantIds.length || participantIds.some((id) => !validIds.has(id))) {
      throw new HttpsError('invalid-argument', 'Choose valid participants for the session.');
    }

    const nextRemaining = remaining - 1;
    const nextUsed = Number(purchase.usedSessions || 0) + 1;
    const status = purchaseStatus(nextRemaining, purchase.expiresAt);

    transaction.set(historyRef, {
      type: 'session_used',
      delta: -1,
      sessionAt,
      participantIds,
      notes: notes || null,
      recordedBy: instructorUid,
      beforeRemaining: remaining,
      afterRemaining: nextRemaining,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    transaction.set(purchaseRef, {
      remainingSessions: nextRemaining,
      usedSessions: nextUsed,
      status,
      lastSessionAt: sessionAt,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    result = {
      purchaseId,
      remainingSessions: nextRemaining,
      usedSessions: nextUsed,
      status,
    };
  });

  return result;
}

async function handleAdjustPrivateTrainingCredits(request) {
  const instructorUid = requireInstructor(request);
  const purchaseId = clean(request.data?.purchaseId, 160);
  const delta = Number.parseInt(request.data?.delta, 10);
  const notes = clean(request.data?.notes, 1200);

  if (!purchaseId) throw new HttpsError('invalid-argument', 'Choose a package.');
  if (!Number.isInteger(delta) || delta === 0 || delta < -50 || delta > 50) {
    throw new HttpsError('invalid-argument', 'Credit adjustment must be between -50 and 50.');
  }
  if (!notes) throw new HttpsError('invalid-argument', 'Explain the credit adjustment.');

  const purchaseRef = db.collection('privateTrainingPurchases').doc(purchaseId);
  const historyRef = purchaseRef.collection('sessionHistory').doc();
  let result = null;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(purchaseRef);
    if (!snapshot.exists) throw new HttpsError('not-found', 'That package was not found.');

    const purchase = snapshot.data() || {};
    const purchasedSessions = Number(purchase.purchasedSessions || 0);
    const usedSessions = Number(purchase.usedSessions || 0);
    const currentAdjustment = Number(purchase.adjustmentSessions || 0);
    const nextAdjustment = currentAdjustment + delta;
    const totalSessions = purchasedSessions + nextAdjustment;
    const remainingSessions = totalSessions - usedSessions;

    if (totalSessions < 0 || remainingSessions < 0) {
      throw new HttpsError(
        'failed-precondition',
        'That adjustment would reduce the package below the sessions already used.',
      );
    }

    const status = purchaseStatus(remainingSessions, purchase.expiresAt);
    transaction.set(historyRef, {
      type: 'credit_adjustment',
      delta,
      notes,
      recordedBy: instructorUid,
      beforeRemaining: Number(purchase.remainingSessions || 0),
      afterRemaining: remainingSessions,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    transaction.set(purchaseRef, {
      adjustmentSessions: nextAdjustment,
      totalSessions,
      remainingSessions,
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    result = {
      purchaseId,
      remainingSessions,
      totalSessions,
      adjustmentSessions: nextAdjustment,
      status,
    };
  });

  return result;
}

module.exports = {
  MAX_PRIVATE_PARTICIPANTS,
  sanitizePrivateTrainingParticipants,
  privateTrainingConfigFromOffer,
  assertPrivateTrainingParticipantLimit,
  ensurePrivateTrainingPurchaseFromOrder,
  handleListPrivateTrainingOffers,
  handleSavePrivateTrainingOffer,
  handleGetPrivateTrainingPurchase,
  handleListMyPrivateTrainingPurchases,
  handleListPrivateTrainingAdmin,
  handleRecordPrivateTrainingSession,
  handleAdjustPrivateTrainingCredits,
};
