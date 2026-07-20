const crypto = require('crypto');
const admin = require('firebase-admin');
const { HttpsError } = require('firebase-functions/v2/https');

const db = admin.firestore();
const INSTRUCTOR_ROLES = new Set(['instructor', 'admin']);
const MAX_SIGNATURE_DATA_URL_LENGTH = 350000;

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeEmail(value) {
  return clean(value, 320).toLowerCase();
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

function hashToken(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
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

function waiverReady(waiver) {
  return Boolean(
    clean(waiver?.version, 80)
      && clean(waiver?.title, 220)
      && clean(waiver?.body, 30000)
      && clean(waiver?.acknowledgement, 1500),
  );
}

function normalizeWaiverSnapshot(waiver) {
  return {
    version: clean(waiver?.version, 80),
    title: clean(waiver?.title, 220),
    body: clean(waiver?.body, 30000),
    acknowledgement: clean(waiver?.acknowledgement, 1500),
    minorAcknowledgement: clean(
      waiver?.minorAcknowledgement
        || 'I am the participant’s parent or legal guardian and am authorized to sign on their behalf.',
      1500,
    ),
  };
}

function accessToken() {
  return crypto.randomBytes(32).toString('base64url');
}

async function loadRegistrationContext(registrationId) {
  const registrationRef = db.collection('eventRegistrations').doc(registrationId);
  const registrationSnapshot = await registrationRef.get();
  if (!registrationSnapshot.exists) {
    throw new HttpsError('not-found', 'That event registration was not found.');
  }

  const registration = { id: registrationSnapshot.id, ...registrationSnapshot.data() };
  const eventRef = db.collection('events').doc(registration.eventId);
  const [eventSnapshot, participantsSnapshot] = await Promise.all([
    eventRef.get(),
    db.collection('eventParticipants')
      .where('registrationId', '==', registrationId)
      .limit(20)
      .get(),
  ]);

  const event = eventSnapshot.exists ? { id: eventSnapshot.id, ...eventSnapshot.data() } : null;
  const participants = participantsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));

  return {
    registrationRef,
    registration,
    event,
    participants,
  };
}

async function ensureWaiversForRegistration(registrationId) {
  const id = clean(registrationId, 180);
  if (!id) throw new HttpsError('invalid-argument', 'Registration ID is required.');

  const context = await loadRegistrationContext(id);
  const waiverRequired = context.registration.eventSnapshot?.waiverRequired !== false
    && context.event?.waiverRequired !== false;
  const snapshot = normalizeWaiverSnapshot(
    context.registration.waiverSnapshot || context.event?.waiver || {},
  );
  const ready = !waiverRequired || waiverReady(snapshot);

  const refs = context.participants.map((participant) => ({
    participant,
    waiverRef: db.collection('eventWaivers').doc(participant.id),
    accessRef: db.collection('eventWaiverAccess').doc(participant.id),
  }));

  const current = await Promise.all(refs.map(async (entry) => {
    const [waiverDocument, accessDocument] = await Promise.all([
      entry.waiverRef.get(),
      entry.accessRef.get(),
    ]);
    return { ...entry, waiverDocument, accessDocument };
  }));

  const batch = db.batch();
  let requiredCount = 0;
  let signedCount = 0;

  current.forEach((entry) => {
    const { participant, waiverRef, accessRef, waiverDocument, accessDocument } = entry;
    const existingWaiver = waiverDocument.data() || {};
    const status = waiverDocument.exists
      ? existingWaiver.status
      : !waiverRequired
        ? 'not_required'
        : ready
          ? 'pending'
          : 'setup_required';

    if (status !== 'not_required') requiredCount += 1;
    if (status === 'signed') signedCount += 1;

    if (!accessDocument.exists && waiverRequired) {
      const token = accessToken();
      batch.set(accessRef, {
        participantId: participant.id,
        registrationId: context.registration.id,
        eventId: context.registration.eventId,
        token,
        tokenHash: hashToken(token),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    if (!waiverDocument.exists) {
      batch.set(waiverRef, {
        id: participant.id,
        participantId: participant.id,
        registrationId: context.registration.id,
        eventId: context.registration.eventId,
        status,
        participantSnapshot: {
          fullName: participant.fullName,
          email: participant.email,
          isMinor: participant.isMinor === true,
          guardianName: participant.guardianName || null,
        },
        eventSnapshot: {
          title: context.registration.eventSnapshot?.title || context.event?.title || '',
          startsAt: context.registration.eventSnapshot?.startsAt || context.event?.startsAt || null,
          endsAt: context.registration.eventSnapshot?.endsAt || context.event?.endsAt || null,
          timezone: context.registration.eventSnapshot?.timezone || context.event?.timezone || 'America/New_York',
          location: context.registration.eventSnapshot?.location || context.event?.location || {},
        },
        waiverSnapshot: snapshot,
        signer: null,
        signatureDataUrl: null,
        signatureHash: null,
        signedAt: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else if (existingWaiver.status === 'setup_required' && ready) {
      batch.set(waiverRef, {
        status: 'pending',
        waiverSnapshot: snapshot,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    batch.set(db.collection('eventParticipants').doc(participant.id), {
      waiverId: participant.id,
      waiverStatus: existingWaiver.status === 'signed'
        ? 'signed'
        : !waiverRequired
          ? 'not_required'
          : ready
            ? 'pending'
            : 'setup_required',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  const registrationStatus = requiredCount === 0
    ? 'not_required'
    : signedCount >= requiredCount
      ? 'complete'
      : signedCount > 0
        ? 'partial'
        : ready
          ? 'pending'
          : 'setup_required';

  batch.set(context.registrationRef, {
    waiverSnapshot: snapshot,
    waiversRequiredCount: requiredCount,
    waiversSignedCount: signedCount,
    waiverStatus: registrationStatus,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  await batch.commit();
  return context.registration.id;
}

async function decorateParticipantsWithWaiverAccess(participants) {
  if (!participants.length) return [];
  const records = await Promise.all(participants.map(async (participant) => {
    const [waiverSnapshot, accessSnapshot] = await Promise.all([
      db.collection('eventWaivers').doc(participant.id).get(),
      db.collection('eventWaiverAccess').doc(participant.id).get(),
    ]);
    const waiver = waiverSnapshot.data() || {};
    const access = accessSnapshot.data() || {};
    return serialize({
      ...participant,
      waiverStatus: waiver.status || participant.waiverStatus || 'pending',
      waiverSignedAt: waiver.signedAt || null,
      waiverSignerName: waiver.signer?.name || null,
      waiverAccessToken: access.token || null,
    });
  }));
  return records;
}

async function authorizeWaiver(request, participant, access) {
  if (isInstructor(request)) return;

  const uid = request.auth?.uid || '';
  const authEmail = normalizeEmail(request.auth?.token?.email);
  if (
    uid
    && (
      participant.purchaserUid === uid
      || participant.memberUid === uid
      || (authEmail && authEmail === normalizeEmail(participant.email))
    )
  ) return;

  const suppliedHash = hashToken(request.data?.accessToken);
  if (!access?.tokenHash || !safeEqual(access.tokenHash, suppliedHash)) {
    throw new HttpsError('permission-denied', 'This waiver link is invalid or no longer available.');
  }
}

async function getWaiverDocuments(participantIdValue) {
  const participantId = clean(participantIdValue, 180);
  if (!participantId) throw new HttpsError('invalid-argument', 'Participant ID is required.');

  const participantRef = db.collection('eventParticipants').doc(participantId);
  const participantSnapshot = await participantRef.get();
  if (!participantSnapshot.exists) {
    throw new HttpsError('not-found', 'That event participant was not found.');
  }

  const participant = { id: participantSnapshot.id, ...participantSnapshot.data() };
  await ensureWaiversForRegistration(participant.registrationId);

  const [waiverSnapshot, accessSnapshot] = await Promise.all([
    db.collection('eventWaivers').doc(participant.id).get(),
    db.collection('eventWaiverAccess').doc(participant.id).get(),
  ]);

  if (!waiverSnapshot.exists) {
    throw new HttpsError('not-found', 'A waiver record could not be prepared for this participant.');
  }

  return {
    participantRef,
    participant,
    waiverRef: waiverSnapshot.ref,
    waiver: { id: waiverSnapshot.id, ...waiverSnapshot.data() },
    access: accessSnapshot.data() || {},
  };
}

async function handleGetEventWaiver(request) {
  const documents = await getWaiverDocuments(request.data?.participantId);
  await authorizeWaiver(request, documents.participant, documents.access);

  return {
    waiver: serialize({
      id: documents.waiver.id,
      status: documents.waiver.status,
      participant: documents.waiver.participantSnapshot,
      event: documents.waiver.eventSnapshot,
      terms: documents.waiver.waiverSnapshot,
      signer: documents.waiver.signer || null,
      signedAt: documents.waiver.signedAt || null,
    }),
  };
}

function validateSignatureDataUrl(value) {
  const dataUrl = clean(value, MAX_SIGNATURE_DATA_URL_LENGTH + 1);
  if (!dataUrl.startsWith('data:image/png;base64,')) {
    throw new HttpsError('invalid-argument', 'Draw your signature before submitting the waiver.');
  }
  if (dataUrl.length > MAX_SIGNATURE_DATA_URL_LENGTH) {
    throw new HttpsError('invalid-argument', 'The signature image is too large. Clear it and try again.');
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

async function handleSignEventWaiver(request) {
  const documents = await getWaiverDocuments(request.data?.participantId);
  await authorizeWaiver(request, documents.participant, documents.access);

  if (documents.waiver.status === 'signed') {
    return { status: 'signed', signedAt: serialize(documents.waiver.signedAt) };
  }
  if (documents.waiver.status === 'not_required') {
    throw new HttpsError('failed-precondition', 'A waiver is not required for this participant.');
  }
  if (documents.waiver.status === 'setup_required') {
    throw new HttpsError(
      'failed-precondition',
      'The instructor must finish the event waiver setup before it can be signed.',
    );
  }
  if (request.data?.accepted !== true || request.data?.electronicSignatureConsent !== true) {
    throw new HttpsError('invalid-argument', 'Accept the waiver and electronic-signature statements.');
  }

  const signerName = clean(request.data?.signerName, 180);
  const signerEmail = normalizeEmail(request.data?.signerEmail);
  const signerRelationship = clean(request.data?.signerRelationship, 120);
  const signatureDataUrl = validateSignatureDataUrl(request.data?.signatureDataUrl);

  if (signerName.length < 2) {
    throw new HttpsError('invalid-argument', 'Enter the signer’s full legal name.');
  }
  if (!signerEmail || !signerEmail.includes('@')) {
    throw new HttpsError('invalid-argument', 'Enter a valid signer email address.');
  }
  if (documents.participant.isMinor === true && !signerRelationship) {
    throw new HttpsError('invalid-argument', 'Enter the parent or guardian relationship.');
  }

  const registrationRef = db.collection('eventRegistrations').doc(documents.participant.registrationId);
  const metadata = requestMetadata(request);
  let signedAt = null;

  await db.runTransaction(async (transaction) => {
    const [waiverSnapshot, participantSnapshot, registrationSnapshot] = await Promise.all([
      transaction.get(documents.waiverRef),
      transaction.get(documents.participantRef),
      transaction.get(registrationRef),
    ]);

    if (!waiverSnapshot.exists || !participantSnapshot.exists || !registrationSnapshot.exists) {
      throw new HttpsError('not-found', 'The waiver registration could not be completed.');
    }

    const currentWaiver = waiverSnapshot.data() || {};
    if (currentWaiver.status === 'signed') {
      signedAt = currentWaiver.signedAt || null;
      return;
    }

    const registration = registrationSnapshot.data() || {};
    const requiredCount = Math.max(
      1,
      Number(registration.waiversRequiredCount || registration.participantCount || 1),
    );
    const currentSignedCount = Number(registration.waiversSignedCount || 0);
    const nextSignedCount = Math.min(requiredCount, currentSignedCount + 1);
    signedAt = admin.firestore.Timestamp.now();

    transaction.set(documents.waiverRef, {
      status: 'signed',
      signer: {
        name: signerName,
        email: signerEmail,
        relationship: documents.participant.isMinor === true
          ? signerRelationship
          : 'self',
        capacity: documents.participant.isMinor === true ? 'guardian' : 'participant',
      },
      accepted: true,
      electronicSignatureConsent: true,
      signatureDataUrl,
      signatureHash: crypto.createHash('sha256').update(signatureDataUrl).digest('hex'),
      signedAt,
      source: metadata,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    transaction.set(documents.participantRef, {
      waiverStatus: 'signed',
      waiverSignedAt: signedAt,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    transaction.set(registrationRef, {
      waiversSignedCount: nextSignedCount,
      waiverStatus: nextSignedCount >= requiredCount ? 'complete' : 'partial',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  return {
    status: 'signed',
    signedAt: serialize(signedAt),
  };
}

module.exports = {
  ensureWaiversForRegistration,
  decorateParticipantsWithWaiverAccess,
  handleGetEventWaiver,
  handleSignEventWaiver,
};
