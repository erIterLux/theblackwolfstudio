const crypto = require('crypto');
const admin = require('firebase-admin');
const { HttpsError } = require('firebase-functions/v2/https');
const { approvedWaiverTerms } = require('../config/studioWaiver');
const { currentMembershipWaiver } = require('../waivers/studioWaiverService');

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

function accessToken() {
    return crypto.randomBytes(32).toString('base64url');
}

function completedStatus(status) {
    return status === 'signed' || status === 'covered' || status === 'not_required';
}

function waiverReady(waiver) {
    return Boolean(
        clean(waiver?.version, 80)
        && clean(waiver?.title, 220)
        && clean(waiver?.body, 30000)
        && clean(waiver?.acknowledgement, 1500),
    );
}

function eventDateLabel(value) {
    const date = value?.toDate?.() || (value ? new Date(value) : null);
    if (!date || Number.isNaN(date.valueOf())) return '';
    return date.toLocaleDateString('en-US', {
        timeZone: 'America/New_York',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });
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

    return {
        registrationRef,
        registration,
        event: eventSnapshot.exists ? { id: eventSnapshot.id, ...eventSnapshot.data() } : null,
        participants: participantsSnapshot.docs.map(
            (item) => ({ id: item.id, ...item.data() }),
        ),
    };
}

function waiverTerms(context, participant) {
    const event = context.registration.eventSnapshot || context.event || {};
    return approvedWaiverTerms({
        scope: 'event',
        context: {
            participantName: participant.fullName,
            title: event.title || context.event?.title || 'Studio event',
            dateLabel: eventDateLabel(event.startsAt || context.event?.startsAt),
        },
        override: context.registration.waiverSnapshot || context.event?.waiver || null,
    });
}

async function ensureWaiversForRegistration(registrationId) {
    const id = clean(registrationId, 180);
    if (!id) throw new HttpsError('invalid-argument', 'Registration ID is required.');

    const context = await loadRegistrationContext(id);
    const waiverRequired = context.registration.eventSnapshot?.waiverRequired !== false
        && context.event?.waiverRequired !== false;
    const alwaysRequireEventWaiver = (
        context.registration.eventSnapshot?.alwaysRequireEventWaiver === true
        || context.event?.alwaysRequireEventWaiver === true
    );

    const entries = await Promise.all(context.participants.map(async (participant) => {
        const waiverRef = db.collection('eventWaivers').doc(participant.id);
        const accessRef = db.collection('eventWaiverAccess').doc(participant.id);
        const [waiverDocument, accessDocument, memberWaiver] = await Promise.all([
            waiverRef.get(),
            accessRef.get(),
            !alwaysRequireEventWaiver
                ? currentMembershipWaiver(participant.memberUid, participant.fullName)
                : Promise.resolve(null),
        ]);
        return {
            participant,
            waiverRef,
            accessRef,
            waiverDocument,
            accessDocument,
            memberWaiver,
        };
    }));

    const batch = db.batch();
    let requiredCount = 0;
    let completedCount = 0;

    entries.forEach((entry) => {
        const existing = entry.waiverDocument.data() || {};
        const terms = waiverTerms(context, entry.participant);
        const ready = !waiverRequired || waiverReady(terms);
        const existingSigned = existing.status === 'signed';
        const covered = waiverRequired && !existingSigned && Boolean(entry.memberWaiver);
        const status = existingSigned
            ? 'signed'
            : !waiverRequired
                ? 'not_required'
                : covered
                    ? 'covered'
                    : ready ? 'pending' : 'setup_required';

        if (status !== 'not_required') requiredCount += 1;
        if (completedStatus(status)) completedCount += 1;

        if (
            !entry.accessDocument.exists
            && waiverRequired
            && status !== 'covered'
        ) {
            const token = accessToken();
            batch.set(entry.accessRef, {
                participantId: entry.participant.id,
                registrationId: context.registration.id,
                eventId: context.registration.eventId,
                token,
                tokenHash: hashToken(token),
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }

        const baseDocument = {
            id: entry.participant.id,
            participantId: entry.participant.id,
            registrationId: context.registration.id,
            eventId: context.registration.eventId,
            memberUid: entry.participant.memberUid || null,
            status,
            coverageSource: covered ? 'membership' : existing.coverageSource || null,
            coveredByWaiverId: covered
                ? entry.memberWaiver.id
                : existing.coveredByWaiverId || null,
            participantSnapshot: {
                fullName: entry.participant.fullName,
                email: entry.participant.email,
                isMinor: entry.participant.isMinor === true,
                guardianName: entry.participant.guardianName || null,
                guardianEmail: entry.participant.guardianEmail || null,
            },
            eventSnapshot: {
                title: context.registration.eventSnapshot?.title || context.event?.title || '',
                startsAt: context.registration.eventSnapshot?.startsAt
                    || context.event?.startsAt
                    || null,
                endsAt: context.registration.eventSnapshot?.endsAt
                    || context.event?.endsAt
                    || null,
                timezone: context.registration.eventSnapshot?.timezone
                    || context.event?.timezone
                    || 'America/New_York',
                location: context.registration.eventSnapshot?.location
                    || context.event?.location
                    || {},
            },
            mediaConsentSnapshot: context.registration.eventSnapshot?.mediaConsent
                || context.event?.mediaConsent
                || { enabled: false, text: '' },
            waiverSnapshot: terms,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (!entry.waiverDocument.exists) {
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
                || existing.memberUid !== (entry.participant.memberUid || null)
                || existing.coveredByWaiverId
                    !== (covered ? entry.memberWaiver.id : existing.coveredByWaiverId || null)
            )
        ) {
            batch.set(entry.waiverRef, baseDocument, { merge: true });
        }

        const participantCoverageSource = covered
            ? 'membership'
            : existing.coverageSource || null;
        const coveredByWaiverId = covered
            ? entry.memberWaiver.id
            : existing.coveredByWaiverId || null;
        if (
            entry.participant.waiverStatus !== status
            || entry.participant.waiverId !== entry.participant.id
            || entry.participant.coverageSource !== participantCoverageSource
            || entry.participant.coveredByWaiverId !== coveredByWaiverId
        ) {
            batch.set(db.collection('eventParticipants').doc(entry.participant.id), {
                waiverId: entry.participant.id,
                waiverStatus: status,
                coverageSource: participantCoverageSource,
                coveredByWaiverId,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        }
    });

    const registrationStatus = requiredCount === 0
        ? 'not_required'
        : completedCount >= requiredCount
            ? 'complete'
            : completedCount > 0
                ? 'partial'
                : entries.some((entry) => !waiverReady(waiverTerms(context, entry.participant)))
                    ? 'setup_required'
                    : 'pending';

    if (
        Number(context.registration.waiversRequiredCount || 0) !== requiredCount
        || Number(context.registration.waiversSignedCount || 0) !== completedCount
        || context.registration.waiverStatus !== registrationStatus
    ) {
        batch.set(context.registrationRef, {
            waiversRequiredCount: requiredCount,
            waiversSignedCount: completedCount,
            waiverStatus: registrationStatus,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    }

    await batch.commit();
    return context.registration.id;
}

async function decorateParticipantsWithWaiverAccess(participants) {
    if (!participants.length) return [];
    return Promise.all(participants.map(async (participant) => {
        const [waiverSnapshot, accessSnapshot] = await Promise.all([
            db.collection('eventWaivers').doc(participant.id).get(),
            db.collection('eventWaiverAccess').doc(participant.id).get(),
        ]);
        const waiver = waiverSnapshot.data() || {};
        const access = accessSnapshot.data() || {};
        return serialize({
            ...participant,
            waiverStatus: waiver.status || participant.waiverStatus || 'pending',
            coverageSource: waiver.coverageSource || participant.coverageSource || null,
            waiverSignedAt: waiver.signedAt || null,
            waiverSignerName: waiver.signer?.name || null,
            waiverAccessToken: access.token || null,
        });
    }));
}

function expectedSignerEmail(participant) {
    return normalizeEmail(
        participant.isMinor === true
            ? participant.guardianEmail || participant.email
            : participant.email,
    );
}

async function authorizeWaiver(request, participant, access, forSigning = false) {
    if (isInstructor(request) && !forSigning) return;

    const uid = request.auth?.uid || '';
    const authEmail = normalizeEmail(request.auth?.token?.email);
    if (
        uid
        && (
            participant.memberUid === uid
            || (authEmail && authEmail === expectedSignerEmail(participant))
            || (!forSigning && participant.purchaserUid === uid)
        )
    ) return;

    const suppliedHash = hashToken(request.data?.accessToken);
    if (!access?.tokenHash || !safeEqual(access.tokenHash, suppliedHash)) {
        throw new HttpsError(
            'permission-denied',
            'This waiver link is invalid or no longer available.',
        );
    }
}

async function getWaiverDocuments(participantIdValue, request) {
    const participantId = clean(participantIdValue, 180);
    if (!participantId) throw new HttpsError('invalid-argument', 'Participant ID is required.');

    const participantRef = db.collection('eventParticipants').doc(participantId);
    let participantSnapshot = await participantRef.get();
    if (!participantSnapshot.exists) {
        throw new HttpsError('not-found', 'That event participant was not found.');
    }
    let participant = { id: participantSnapshot.id, ...participantSnapshot.data() };
    const authEmail = normalizeEmail(request.auth?.token?.email);
    if (
        request.auth?.uid
        && authEmail
        && authEmail === expectedSignerEmail(participant)
        && participant.memberUid !== request.auth.uid
    ) {
        await participantRef.set({
            memberUid: request.auth.uid,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        participantSnapshot = await participantRef.get();
        participant = { id: participantSnapshot.id, ...participantSnapshot.data() };
    }

    await ensureWaiversForRegistration(participant.registrationId);
    const [waiverSnapshot, accessSnapshot] = await Promise.all([
        db.collection('eventWaivers').doc(participant.id).get(),
        db.collection('eventWaiverAccess').doc(participant.id).get(),
    ]);
    if (!waiverSnapshot.exists) {
        throw new HttpsError(
            'not-found',
            'A waiver record could not be prepared for this participant.',
        );
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
    const documents = await getWaiverDocuments(request.data?.participantId, request);
    await authorizeWaiver(request, documents.participant, documents.access);
    return {
        waiver: serialize({
            id: documents.waiver.id,
            scope: 'event',
            status: documents.waiver.status,
            coverageSource: documents.waiver.coverageSource || null,
            participant: documents.waiver.participantSnapshot,
            event: documents.waiver.eventSnapshot,
            terms: documents.waiver.waiverSnapshot,
            mediaConsent: {
                ...(documents.waiver.mediaConsentSnapshot || {
                    enabled: false,
                    text: '',
                }),
                accepted: documents.waiver.mediaConsentAccepted === true,
            },
            signer: documents.waiver.signer || null,
            signedAt: documents.waiver.signedAt || null,
        }),
    };
}

function validateSignatureDataUrl(value) {
    const dataUrl = clean(value, MAX_SIGNATURE_DATA_URL_LENGTH + 1);
    if (!dataUrl.startsWith('data:image/png;base64,')) {
        throw new HttpsError(
            'invalid-argument',
            'Draw your signature before submitting the waiver.',
        );
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

async function handleSignEventWaiver(request) {
    const documents = await getWaiverDocuments(request.data?.participantId, request);
    await authorizeWaiver(request, documents.participant, documents.access, true);

    if (documents.waiver.status === 'signed' || documents.waiver.status === 'covered') {
        return {
            status: documents.waiver.status,
            signedAt: serialize(documents.waiver.signedAt),
        };
    }
    if (documents.waiver.status === 'not_required') {
        throw new HttpsError(
            'failed-precondition',
            'A waiver is not required for this participant.',
        );
    }
    if (documents.waiver.status === 'setup_required') {
        throw new HttpsError(
            'failed-precondition',
            'The instructor must finish the event waiver setup before it can be signed.',
        );
    }
    if (request.data?.accepted !== true || request.data?.electronicSignatureConsent !== true) {
        throw new HttpsError(
            'invalid-argument',
            'Accept the waiver and electronic-signature statements.',
        );
    }

    const signerName = clean(request.data?.signerName, 180);
    const signerEmail = expectedSignerEmail(documents.participant);
    const signerRelationship = clean(request.data?.signerRelationship, 120);
    const signatureDataUrl = validateSignatureDataUrl(request.data?.signatureDataUrl);
    if (signerName.length < 2) {
        throw new HttpsError('invalid-argument', 'Enter the signer’s full legal name.');
    }
    if (!signerEmail) {
        throw new HttpsError('failed-precondition', 'The registered signer email is missing.');
    }
    if (documents.participant.isMinor === true && !signerRelationship) {
        throw new HttpsError(
            'invalid-argument',
            'Enter the parent or guardian relationship.',
        );
    }

    const registrationRef = db.collection('eventRegistrations')
        .doc(documents.participant.registrationId);
    const signedAt = admin.firestore.Timestamp.now();
    await db.runTransaction(async (transaction) => {
        const [waiverSnapshot, participantSnapshot, registrationSnapshot] = await Promise.all([
            transaction.get(documents.waiverRef),
            transaction.get(documents.participantRef),
            transaction.get(registrationRef),
        ]);
        if (!waiverSnapshot.exists || !participantSnapshot.exists || !registrationSnapshot.exists) {
            throw new HttpsError(
                'not-found',
                'The waiver registration could not be completed.',
            );
        }

        const currentWaiver = waiverSnapshot.data() || {};
        if (completedStatus(currentWaiver.status)) return;
        const registration = registrationSnapshot.data() || {};
        const requiredCount = Math.max(
            1,
            Number(registration.waiversRequiredCount || registration.participantCount || 1),
        );
        const nextCompletedCount = Math.min(
            requiredCount,
            Number(registration.waiversSignedCount || 0) + 1,
        );

        transaction.set(documents.waiverRef, {
            status: 'signed',
            coverageSource: 'event',
            signer: {
                name: signerName,
                email: signerEmail,
                relationship: documents.participant.isMinor === true
                    ? signerRelationship
                    : 'self',
                capacity: documents.participant.isMinor === true
                    ? 'guardian'
                    : 'participant',
            },
            accepted: true,
            electronicSignatureConsent: true,
            signatureDataUrl,
            signatureHash: crypto.createHash('sha256')
                .update(signatureDataUrl)
                .digest('hex'),
            signedAt,
            source: requestMetadata(request),
            signedCopyEmailStatus: 'pending',
            mediaConsentAccepted: request.data?.mediaConsent === true,
            mediaConsentRecordedAt: request.data?.mediaConsent === true ? signedAt : null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        transaction.set(documents.participantRef, {
            waiverStatus: 'signed',
            coverageSource: 'event',
            waiverSignedAt: signedAt,
            mediaConsent: request.data?.mediaConsent === true,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        transaction.set(registrationRef, {
            waiversSignedCount: nextCompletedCount,
            waiverStatus: nextCompletedCount >= requiredCount ? 'complete' : 'partial',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    });

    return {
        status: 'signed',
        signedAt: serialize(signedAt),
        emailRecipient: signerEmail,
    };
}

module.exports = {
    ensureWaiversForRegistration,
    decorateParticipantsWithWaiverAccess,
    handleGetEventWaiver,
    handleSignEventWaiver,
};
