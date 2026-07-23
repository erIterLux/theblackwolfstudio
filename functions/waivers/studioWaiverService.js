const crypto = require('crypto');
const admin = require('firebase-admin');
const { logger } = require('firebase-functions');
const { HttpsError } = require('firebase-functions/v2/https');
const {
  STUDIO_WAIVER_VERSION,
  approvedWaiverTerms,
} = require('../config/studioWaiver');

const db = admin.firestore();
const LIVE_MEMBERSHIP_STATUSES = new Set(['active', 'trialing']);
const INSTRUCTOR_ROLES = new Set(['instructor', 'admin']);
const MAX_SIGNATURE_DATA_URL_LENGTH = 350000;

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeEmail(value) {
  return clean(value, 320).toLowerCase();
}

function normalizeName(value) {
  return clean(value, 180).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
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

function isInstructor(request) {
  return Boolean(request.auth?.uid && INSTRUCTOR_ROLES.has(callerRole(request)));
}

function requireAuthenticated(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to continue.');
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

function accessToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function validateSignatureDataUrl(value) {
  const dataUrl = clean(value, MAX_SIGNATURE_DATA_URL_LENGTH + 1);
  if (!dataUrl.startsWith('data:image/png;base64,')) {
    throw new HttpsError('invalid-argument', 'Draw your signature before submitting the waiver.');
  }
  if (dataUrl.length > MAX_SIGNATURE_DATA_URL_LENGTH) {
    throw new HttpsError(
      'invalid-argument',
      'The signature image is too large. Clear it and try again.',
    );
  }
  return dataUrl;
}

function requestMetadata(request) {
  const forwarded = clean(request.rawRequest?.headers?.['x-forwarded-for'], 300);
  const ipAddress = forwarded.split(',')[0]?.trim() || clean(request.rawRequest?.ip, 120);
  return {
    ipAddress: ipAddress || null,
    userAgent: clean(request.rawRequest?.headers?.['user-agent'], 1000) || null,
  };
}

function privateWaiverId(purchaseId, participantId) {
  return `${clean(purchaseId, 160)}_${clean(participantId, 80)}`;
}

function completedWaiverStatus(status) {
  return status === 'signed' || status === 'covered' || status === 'not_required';
}

function emergencyContactReady(participant = {}) {
  return clean(participant.emergencyContactName, 180).length >= 2
    && clean(participant.emergencyContactPhone, 40).replace(/\D/g, '').length >= 7;
}

async function refreshLinkedMembershipCoverage(uid) {
  const [eventParticipants, privateWaivers] = await Promise.all([
    db.collection('eventParticipants').where('memberUid', '==', uid).limit(200).get(),
    db.collection('privateTrainingWaivers').where('memberUid', '==', uid).limit(200).get(),
  ]);
  const registrationIds = [...new Set(
    eventParticipants.docs.map((item) => item.data()?.registrationId).filter(Boolean),
  )];
  const purchaseIds = [...new Set(
    privateWaivers.docs.map((item) => item.data()?.purchaseId).filter(Boolean),
  )];
  const { ensureWaiversForRegistration } = require('../events/waiverService');
  await Promise.all([
    ...registrationIds.map((id) => ensureWaiversForRegistration(id)),
    ...purchaseIds.map((id) => ensurePrivateTrainingWaiversForPurchase(id)),
  ]);
}

async function currentMembershipWaiver(uid, participantName = '') {
  if (!uid) return null;
  const [membershipSnapshot, waiverSnapshot] = await Promise.all([
    db.collection('memberships').doc(uid).get(),
    db.collection('studioWaivers').doc(uid).get(),
  ]);
  const membership = membershipSnapshot.data() || {};
  const waiver = waiverSnapshot.data() || {};
  if (!LIVE_MEMBERSHIP_STATUSES.has(membership.status)) return null;
  if (
    waiver.status !== 'signed'
    || waiver.scope !== 'membership'
    || waiver.waiverSnapshot?.version !== STUDIO_WAIVER_VERSION
    || !emergencyContactReady(waiver.participantSnapshot)
  ) return null;
  if (
    participantName
    && normalizeName(waiver.participantSnapshot?.fullName)
      !== normalizeName(participantName)
  ) return null;
  return { id: waiverSnapshot.id, ...waiver };
}

async function handleGetMyMembershipWaiver(request) {
  const uid = requireAuthenticated(request);
  const [membershipSnapshot, waiverSnapshot] = await Promise.all([
    db.collection('memberships').doc(uid).get(),
    db.collection('studioWaivers').doc(uid).get(),
  ]);
  const membership = membershipSnapshot.data() || {};
  const waiver = waiverSnapshot.data() || {};
  const eligible = LIVE_MEMBERSHIP_STATUSES.has(membership.status);
  const current = waiver.status === 'signed'
    && waiver.waiverSnapshot?.version === STUDIO_WAIVER_VERSION
    && emergencyContactReady(waiver.participantSnapshot);
  const participantName = waiver.participantSnapshot?.fullName
    || clean(request.auth?.token?.name || membership.displayName, 180);
  const email = normalizeEmail(request.auth?.token?.email || membership.email);
  const participant = {
    fullName: participantName,
    email,
    isMinor: false,
    guardianName: null,
    guardianEmail: null,
    ...(waiver.participantSnapshot || {}),
    emergencyContactName: waiver.participantSnapshot?.emergencyContactName
      || membership.emergencyContact?.name
      || null,
    emergencyContactPhone: waiver.participantSnapshot?.emergencyContactPhone
      || membership.emergencyContact?.phone
      || null,
  };

  return {
    eligible,
    membership: serialize({
      planName: membership.planName || null,
      status: membership.status || null,
    }),
    waiver: serialize({
      id: uid,
      scope: 'membership',
      status: current ? 'signed' : 'pending',
      participant,
      terms: approvedWaiverTerms({
        scope: 'membership',
        context: { participantName },
      }),
      signer: waiver.signer || null,
      signedAt: current ? waiver.signedAt || null : null,
    }),
  };
}

async function handleSignMembershipWaiver(request) {
  const uid = requireAuthenticated(request);
  const membershipSnapshot = await db.collection('memberships').doc(uid).get();
  const membership = membershipSnapshot.data() || {};
  if (!LIVE_MEMBERSHIP_STATUSES.has(membership.status)) {
    throw new HttpsError(
      'failed-precondition',
      'An active membership is required to sign the membership waiver.',
    );
  }
  if (request.data?.accepted !== true || request.data?.electronicSignatureConsent !== true) {
    throw new HttpsError(
      'invalid-argument',
      'Accept the waiver and electronic-signature statements.',
    );
  }

  const participantName = clean(request.data?.participantFullName, 180);
  const emergencyContactName = clean(request.data?.emergencyContactName, 180);
  const emergencyContactPhone = clean(request.data?.emergencyContactPhone, 40);
  const isMinor = request.data?.isMinor === true;
  const guardianName = isMinor ? clean(request.data?.guardianName, 180) : '';
  const signerName = clean(request.data?.signerName, 180);
  const signerRelationship = isMinor ? clean(request.data?.signerRelationship, 120) : 'self';
  const signerEmail = normalizeEmail(request.auth?.token?.email || membership.email);
  const signatureDataUrl = validateSignatureDataUrl(request.data?.signatureDataUrl);

  if (participantName.length < 2) {
    throw new HttpsError('invalid-argument', "Enter the participant's full legal name.");
  }
  if (
    emergencyContactName.length < 2
    || emergencyContactPhone.replace(/\D/g, '').length < 7
  ) {
    throw new HttpsError(
      'invalid-argument',
      'Enter an emergency contact name and valid phone number.',
    );
  }
  if (signerName.length < 2) {
    throw new HttpsError('invalid-argument', "Enter the signer's full legal name.");
  }
  if (!signerEmail) {
    throw new HttpsError('failed-precondition', 'The signed-in account needs an email address.');
  }
  if (isMinor && (!guardianName || !signerRelationship)) {
    throw new HttpsError(
      'invalid-argument',
      'Enter the parent or guardian name and relationship.',
    );
  }

  const signedAt = admin.firestore.Timestamp.now();
  const terms = approvedWaiverTerms({
    scope: 'membership',
    context: { participantName },
  });
  const emergencyContact = {
    name: emergencyContactName,
    phone: emergencyContactPhone,
  };
  const batch = db.batch();
  batch.set(db.collection('studioWaivers').doc(uid), {
    id: uid,
    uid,
    scope: 'membership',
    status: 'signed',
    participantSnapshot: {
      fullName: participantName,
      email: signerEmail,
      emergencyContactName,
      emergencyContactPhone,
      isMinor,
      guardianName: guardianName || null,
      guardianEmail: isMinor ? signerEmail : null,
    },
    membershipSnapshot: {
      planKey: membership.planKey || null,
      planName: membership.planName || null,
      status: membership.status,
    },
    waiverSnapshot: terms,
    signer: {
      name: signerName,
      email: signerEmail,
      relationship: signerRelationship,
      capacity: isMinor ? 'guardian' : 'participant',
    },
    accepted: true,
    electronicSignatureConsent: true,
    signatureDataUrl,
    signatureHash: crypto.createHash('sha256').update(signatureDataUrl).digest('hex'),
    signedAt,
    source: requestMetadata(request),
    signedCopyEmailStatus: 'pending',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  batch.set(membershipSnapshot.ref, {
    emergencyContact,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  batch.set(db.collection('users').doc(uid), {
    emergencyContact,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  await batch.commit();

  try {
    await refreshLinkedMembershipCoverage(uid);
  } catch (error) {
    logger.warn('Membership waiver was signed, but linked coverage refresh was delayed.', {
      uid,
      error: error?.message,
    });
  }

  return {
    status: 'signed',
    signedAt: serialize(signedAt),
    emailRecipient: signerEmail,
  };
}

async function ensurePrivateTrainingWaiversForPurchase(purchaseIdValue) {
  const purchaseId = clean(purchaseIdValue, 160);
  if (!purchaseId) throw new HttpsError('invalid-argument', 'Package ID is required.');

  const purchaseRef = db.collection('privateTrainingPurchases').doc(purchaseId);
  const purchaseSnapshot = await purchaseRef.get();
  if (!purchaseSnapshot.exists) {
    throw new HttpsError('not-found', 'That private-training package was not found.');
  }
  const purchase = { id: purchaseSnapshot.id, ...purchaseSnapshot.data() };
  const participants = Array.isArray(purchase.participants) ? purchase.participants : [];

  const entries = await Promise.all(participants.map(async (participant) => {
    const waiverId = privateWaiverId(purchaseId, participant.id);
    const waiverRef = db.collection('privateTrainingWaivers').doc(waiverId);
    const accessRef = db.collection('privateTrainingWaiverAccess').doc(waiverId);
    const memberUid = participant.memberUid
      || (participant.isPurchaser === true ? purchase.uid || null : null);
    const [waiverSnapshot, accessSnapshot, memberWaiver] = await Promise.all([
      waiverRef.get(),
      accessRef.get(),
      currentMembershipWaiver(memberUid, participant.fullName),
    ]);
    return {
      participant,
      waiverId,
      waiverRef,
      accessRef,
      waiverSnapshot,
      accessSnapshot,
      memberUid,
      memberWaiver,
    };
  }));

  const batch = db.batch();
  let completedCount = 0;
  const updatedParticipants = [];

  entries.forEach((entry) => {
    const existing = entry.waiverSnapshot.data() || {};
    const existingSigned = existing.status === 'signed';
    const covered = !existingSigned && Boolean(entry.memberWaiver);
    const emergencyContactName = entry.participant.emergencyContactName
      || (covered ? entry.memberWaiver?.participantSnapshot?.emergencyContactName : null)
      || null;
    const emergencyContactPhone = entry.participant.emergencyContactPhone
      || (covered ? entry.memberWaiver?.participantSnapshot?.emergencyContactPhone : null)
      || null;
    const status = existingSigned ? 'signed' : covered ? 'covered' : 'pending';
    if (completedWaiverStatus(status)) completedCount += 1;

    if (!entry.accessSnapshot.exists && status === 'pending') {
      const token = accessToken();
      batch.set(entry.accessRef, {
        waiverId: entry.waiverId,
        participantId: entry.participant.id,
        purchaseId,
        token,
        tokenHash: hashToken(token),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    const terms = approvedWaiverTerms({
      scope: 'private_training',
      context: {
        participantName: entry.participant.fullName,
        title: purchase.offerName,
        referenceId: purchaseId,
      },
    });
    const baseDocument = {
      id: entry.waiverId,
      scope: 'private_training',
      participantId: entry.participant.id,
      purchaseId,
      orderId: purchase.orderId || purchaseId,
      memberUid: entry.memberUid || null,
      status,
      coverageSource: covered ? 'membership' : existing.coverageSource || null,
      coveredByWaiverId: covered ? entry.memberWaiver.id : existing.coveredByWaiverId || null,
      participantSnapshot: {
        fullName: entry.participant.fullName,
        email: entry.participant.email,
        emergencyContactName,
        emergencyContactPhone,
        isMinor: entry.participant.isMinor === true,
        guardianName: entry.participant.guardianName || null,
        guardianEmail: entry.participant.guardianEmail || null,
      },
      privateTrainingSnapshot: {
        title: purchase.offerName || 'Private training',
        purchaseId,
        sessionCount: Number(purchase.totalSessions || purchase.purchasedSessions || 0),
        sessionDurationMinutes: Number(purchase.sessionDurationMinutes || 0),
      },
      waiverSnapshot: terms,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (!entry.waiverSnapshot.exists) {
      batch.set(entry.waiverRef, {
        ...baseDocument,
        signer: null,
        signatureDataUrl: null,
        signatureHash: null,
        signedAt: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else if (
      !existingSigned
      && (
        existing.status !== status
        || existing.memberUid !== (entry.memberUid || null)
        || existing.coveredByWaiverId
          !== (covered ? entry.memberWaiver.id : existing.coveredByWaiverId || null)
        || existing.participantSnapshot?.emergencyContactName !== emergencyContactName
        || existing.participantSnapshot?.emergencyContactPhone !== emergencyContactPhone
      )
    ) {
      batch.set(entry.waiverRef, baseDocument, { merge: true });
    }

    updatedParticipants.push({
      ...entry.participant,
      memberUid: entry.memberUid || null,
      waiverId: entry.waiverId,
      waiverStatus: status,
      coverageSource: covered ? 'membership' : existing.coverageSource || null,
      emergencyContactName,
      emergencyContactPhone,
    });
  });

  const waiverStatus = participants.length === 0
    ? 'not_required'
    : completedCount >= participants.length
      ? 'complete'
      : completedCount > 0 ? 'partial' : 'pending';
  const participantsChanged = updatedParticipants.length !== participants.length
    || updatedParticipants.some((participant, index) => {
      const current = participants[index] || {};
      return current.memberUid !== participant.memberUid
        || current.waiverId !== participant.waiverId
        || current.waiverStatus !== participant.waiverStatus
        || current.coverageSource !== participant.coverageSource
        || current.emergencyContactName !== participant.emergencyContactName
        || current.emergencyContactPhone !== participant.emergencyContactPhone;
    });
  if (
    participantsChanged
    || Number(purchase.waiversRequiredCount || 0) !== participants.length
    || Number(purchase.waiversCompletedCount || 0) !== completedCount
    || purchase.waiverStatus !== waiverStatus
  ) {
    batch.set(purchaseRef, {
      participants: updatedParticipants,
      waiversRequiredCount: participants.length,
      waiversCompletedCount: completedCount,
      waiverStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  await batch.commit();

  return purchaseId;
}

async function decoratedPrivateTrainingParticipants(purchase) {
  const needsPreparation = (purchase.participants || []).some(
    (participant) => !participant.waiverId || !participant.waiverStatus,
  );
  if (needsPreparation) await ensurePrivateTrainingWaiversForPurchase(purchase.id);
  const refreshed = needsPreparation
    ? await db.collection('privateTrainingPurchases').doc(purchase.id).get()
    : null;
  const participants = refreshed?.data()?.participants || purchase.participants || [];
  return Promise.all(participants.map(async (participant) => {
    const waiverId = participant.waiverId || privateWaiverId(purchase.id, participant.id);
    const access = participant.waiverStatus === 'pending'
      ? (await db.collection('privateTrainingWaiverAccess').doc(waiverId).get()).data() || {}
      : {};
    return serialize({
      ...participant,
      waiverId,
      waiverStatus: participant.waiverStatus || 'pending',
      waiverAccessToken: access.token || null,
    });
  }));
}

async function getPrivateWaiverDocuments(waiverIdValue, request) {
  const waiverId = clean(waiverIdValue, 260);
  if (!waiverId) throw new HttpsError('invalid-argument', 'Waiver ID is required.');
  let waiverSnapshot = await db.collection('privateTrainingWaivers').doc(waiverId).get();
  if (!waiverSnapshot.exists) {
    throw new HttpsError('not-found', 'That private-training waiver was not found.');
  }
  let waiver = { id: waiverSnapshot.id, ...waiverSnapshot.data() };
  const accessSnapshot = await db.collection('privateTrainingWaiverAccess').doc(waiverId).get();
  const access = accessSnapshot.data() || {};
  const authEmail = normalizeEmail(request.auth?.token?.email);
  const participantEmail = normalizeEmail(waiver.participantSnapshot?.email);

  if (request.auth?.uid && authEmail && authEmail === participantEmail) {
    const purchaseRef = db.collection('privateTrainingPurchases').doc(waiver.purchaseId);
    const purchaseSnapshot = await purchaseRef.get();
    if (purchaseSnapshot.exists) {
      const participants = (purchaseSnapshot.data()?.participants || []).map((participant) => (
        participant.id === waiver.participantId
          ? { ...participant, memberUid: request.auth.uid }
          : participant
      ));
      await Promise.all([
        waiverSnapshot.ref.set({
          memberUid: request.auth.uid,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true }),
        purchaseRef.set({
          participants,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true }),
      ]);
      await ensurePrivateTrainingWaiversForPurchase(waiver.purchaseId);
      waiverSnapshot = await waiverSnapshot.ref.get();
      waiver = { id: waiverSnapshot.id, ...waiverSnapshot.data() };
    }
  }

  return { waiverSnapshot, waiver, access };
}

async function authorizePrivateWaiver(request, waiver, access, forSigning = false) {
  if (isInstructor(request) && !forSigning) return;
  const uid = request.auth?.uid || '';
  const authEmail = normalizeEmail(request.auth?.token?.email);
  const participantEmail = normalizeEmail(waiver.participantSnapshot?.email);
  const guardianEmail = normalizeEmail(waiver.participantSnapshot?.guardianEmail);
  const expectedEmail = waiver.participantSnapshot?.isMinor
    ? guardianEmail || participantEmail
    : participantEmail;

  if (uid && (
    waiver.memberUid === uid
    || (authEmail && authEmail === expectedEmail)
  )) return;

  if (!forSigning && uid) {
    const purchaseSnapshot = await db.collection('privateTrainingPurchases')
      .doc(waiver.purchaseId)
      .get();
    if (purchaseSnapshot.data()?.uid === uid) return;
  }

  const suppliedHash = hashToken(request.data?.accessToken);
  if (!access.tokenHash || !safeEqual(access.tokenHash, suppliedHash)) {
    throw new HttpsError(
      'permission-denied',
      'This waiver link is invalid or no longer available.',
    );
  }
}

async function handleGetPrivateTrainingWaiver(request) {
  const documents = await getPrivateWaiverDocuments(request.data?.waiverId, request);
  await authorizePrivateWaiver(request, documents.waiver, documents.access);
  const waiver = documents.waiver;
  return {
    waiver: serialize({
      id: waiver.id,
      scope: waiver.scope,
      status: waiver.status,
      coverageSource: waiver.coverageSource || null,
      participant: waiver.participantSnapshot,
      privateTraining: waiver.privateTrainingSnapshot,
      terms: waiver.waiverSnapshot,
      signer: waiver.signer || null,
      signedAt: waiver.signedAt || null,
    }),
  };
}

async function handleSignPrivateTrainingWaiver(request) {
  const documents = await getPrivateWaiverDocuments(request.data?.waiverId, request);
  await authorizePrivateWaiver(request, documents.waiver, documents.access, true);
  const waiver = documents.waiver;
  if (
    completedWaiverStatus(waiver.status)
    && emergencyContactReady(waiver.participantSnapshot)
  ) {
    return { status: waiver.status, signedAt: serialize(waiver.signedAt) };
  }
  if (request.data?.accepted !== true || request.data?.electronicSignatureConsent !== true) {
    throw new HttpsError(
      'invalid-argument',
      'Accept the waiver and electronic-signature statements.',
    );
  }

  const isMinor = waiver.participantSnapshot?.isMinor === true;
  const signerName = clean(request.data?.signerName, 180);
  const emergencyContactName = clean(request.data?.emergencyContactName, 180);
  const emergencyContactPhone = clean(request.data?.emergencyContactPhone, 40);
  const signerRelationship = isMinor ? clean(request.data?.signerRelationship, 120) : 'self';
  const signerEmail = normalizeEmail(
    isMinor
      ? waiver.participantSnapshot?.guardianEmail || waiver.participantSnapshot?.email
      : waiver.participantSnapshot?.email,
  );
  const signatureDataUrl = validateSignatureDataUrl(request.data?.signatureDataUrl);
  if (signerName.length < 2 || !signerEmail) {
    throw new HttpsError('invalid-argument', 'Enter valid signer information.');
  }
  if (
    emergencyContactName.length < 2
    || emergencyContactPhone.replace(/\D/g, '').length < 7
  ) {
    throw new HttpsError(
      'invalid-argument',
      'Enter an emergency contact name and valid phone number.',
    );
  }
  if (isMinor && !signerRelationship) {
    throw new HttpsError('invalid-argument', 'Enter the parent or guardian relationship.');
  }

  const purchaseRef = db.collection('privateTrainingPurchases').doc(waiver.purchaseId);
  const signedAt = admin.firestore.Timestamp.now();
  await db.runTransaction(async (transaction) => {
    const [currentWaiverSnapshot, purchaseSnapshot] = await Promise.all([
      transaction.get(documents.waiverSnapshot.ref),
      transaction.get(purchaseRef),
    ]);
    if (!currentWaiverSnapshot.exists || !purchaseSnapshot.exists) {
      throw new HttpsError('not-found', 'The private-training waiver could not be completed.');
    }
    const currentWaiver = currentWaiverSnapshot.data() || {};
    if (
      completedWaiverStatus(currentWaiver.status)
      && emergencyContactReady(currentWaiver.participantSnapshot)
    ) return;
    const purchase = purchaseSnapshot.data() || {};
    const participants = (purchase.participants || []).map((participant) => (
      participant.id === waiver.participantId
        ? {
          ...participant,
          waiverStatus: 'signed',
          waiverSignedAt: signedAt,
          coverageSource: 'private_training',
          emergencyContactName,
          emergencyContactPhone,
        }
        : participant
    ));
    const completedCount = participants.filter(
      (participant) => completedWaiverStatus(participant.waiverStatus),
    ).length;

    transaction.set(documents.waiverSnapshot.ref, {
      status: 'signed',
      coverageSource: 'private_training',
      participantSnapshot: {
        ...(currentWaiver.participantSnapshot || {}),
        emergencyContactName,
        emergencyContactPhone,
      },
      signer: {
        name: signerName,
        email: signerEmail,
        relationship: signerRelationship,
        capacity: isMinor ? 'guardian' : 'participant',
      },
      accepted: true,
      electronicSignatureConsent: true,
      signatureDataUrl,
      signatureHash: crypto.createHash('sha256').update(signatureDataUrl).digest('hex'),
      signedAt,
      source: requestMetadata(request),
      signedCopyEmailStatus: 'pending',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(purchaseRef, {
      participants,
      waiversCompletedCount: completedCount,
      waiverStatus: completedCount >= participants.length ? 'complete' : 'partial',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  return { status: 'signed', signedAt: serialize(signedAt), emailRecipient: signerEmail };
}

async function assertPrivateTrainingParticipantsCovered(purchaseId, participantIds = []) {
  await ensurePrivateTrainingWaiversForPurchase(purchaseId);
  const purchaseSnapshot = await db.collection('privateTrainingPurchases').doc(purchaseId).get();
  if (!purchaseSnapshot.exists) {
    throw new HttpsError('not-found', 'That private-training package was not found.');
  }
  const selected = new Set((participantIds || []).filter(Boolean));
  const participants = purchaseSnapshot.data()?.participants || [];
  const attending = selected.size
    ? participants.filter((participant) => selected.has(participant.id))
    : participants;
  const incomplete = attending.filter(
    (participant) => (
      !completedWaiverStatus(participant.waiverStatus)
      || !emergencyContactReady(participant)
    ),
  );
  if (incomplete.length) {
    throw new HttpsError(
      'failed-precondition',
      `${incomplete.map((participant) => participant.fullName).join(', ')} must have a completed waiver and emergency contact before private training can be booked or recorded.`,
    );
  }
  return true;
}

module.exports = {
  currentMembershipWaiver,
  ensurePrivateTrainingWaiversForPurchase,
  decoratedPrivateTrainingParticipants,
  assertPrivateTrainingParticipantsCovered,
  handleGetMyMembershipWaiver,
  handleSignMembershipWaiver,
  handleGetPrivateTrainingWaiver,
  handleSignPrivateTrainingWaiver,
};
