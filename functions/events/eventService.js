const crypto = require('crypto');
const admin = require('firebase-admin');
const { HttpsError } = require('firebase-functions/v2/https');

const db = admin.firestore();
const INSTRUCTOR_ROLES = new Set(['instructor', 'admin']);
const EVENT_STATUSES = new Set(['draft', 'published', 'hidden', 'canceled', 'completed', 'archived']);
const MAX_EVENT_PARTICIPANTS_PER_ORDER = 12;
const RESERVATION_MINUTES = 35;

function clean(value, max = 500) {
    return String(value ?? '').trim().slice(0, max);
}

function normalizeEmail(value) {
    return clean(value, 320).toLowerCase();
}

function integer(value, min, max, fallback = min) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

function cents(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.round(number)) : fallback;
}

function requiredNonNegativeCents(value, fieldName) {
    if (value === '' || value === null || value === undefined) {
        throw new HttpsError('invalid-argument', `Enter ${fieldName}. Use 0 for a free event.`);
    }

    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) {
        throw new HttpsError(
            'invalid-argument',
            `${fieldName[0].toUpperCase()}${fieldName.slice(1)} must be 0 or greater.`,
        );
    }

    return Math.round(number);
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
        throw new HttpsError('unauthenticated', 'Sign in to view your event registrations.');
    }
    return request.auth.uid;
}

function timestamp(value, fieldName, { nullable = false } = {}) {
    if (!value && nullable) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.valueOf())) {
        throw new HttpsError('invalid-argument', `Enter a valid ${fieldName}.`);
    }
    return admin.firestore.Timestamp.fromDate(date);
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

function participantId(orderId, index) {
    return `${orderId}-participant-${index + 1}`;
}

function sanitizeEventParticipants(rawParticipants, quantity, purchaser, orderId = 'pending') {
    const count = integer(quantity, 1, MAX_EVENT_PARTICIPANTS_PER_ORDER, 1);
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
        const isMinor = raw?.isMinor === true;
        const guardianName = isMinor ? clean(raw?.guardianName, 160) : '';

        if (!fullName) {
            throw new HttpsError('invalid-argument', `Participant ${index + 1} needs a full name.`);
        }
        if (!email || !email.includes('@')) {
            throw new HttpsError(
                'invalid-argument',
                `Participant ${index + 1} needs a valid email for event and waiver communication.`,
            );
        }
        if (isMinor && !guardianName) {
            throw new HttpsError(
                'invalid-argument',
                `Enter a parent or guardian name for participant ${index + 1}.`,
            );
        }

        const isPurchaser = raw?.isPurchaser === true
            || (
                normalizeEmail(purchaser?.email)
                && normalizeEmail(purchaser.email) === email
            );

        return {
            id: orderId !== 'pending'
                ? participantId(orderId, index)
                : clean(raw?.id, 180) || `participant-${index + 1}`,
            fullName,
            email,
            phone: phone || null,
            isMinor,
            guardianName: guardianName || null,
            isPurchaser,
        };
    });
}

function registrationWindowState(event, now = Date.now()) {
    const start = event.registrationOpensAt?.toMillis?.() || 0;
    const close = event.registrationClosesAt?.toMillis?.() || 0;
    const eventStart = event.startsAt?.toMillis?.() || 0;

    if (event.status !== 'published') return event.status || 'draft';
    if (eventStart && now >= eventStart) return 'closed';
    if (start && now < start) return 'not_open';
    if (close && now > close) return 'closed';

    const capacity = Number(event.capacity || 0);
    const occupied = Number(event.registeredSeats || 0) + Number(event.reservedSeats || 0);
    if (capacity > 0 && occupied >= capacity) return 'sold_out';
    return 'open';
}

function publicEvent(snapshot) {
    const event = snapshot.data() || {};
    const capacity = Number(event.capacity || 0);
    const registered = Number(event.registeredSeats || 0);
    const reserved = Number(event.reservedSeats || 0);
    const remaining = capacity > 0 ? Math.max(0, capacity - registered - reserved) : null;

    return serialize({
        id: snapshot.id,
        title: event.title,
        shortDescription: event.shortDescription,
        longDescription: event.longDescription,
        status: event.status,
        registrationState: registrationWindowState(event),
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        registrationOpensAt: event.registrationOpensAt,
        registrationClosesAt: event.registrationClosesAt,
        timezone: event.timezone || 'America/New_York',
        location: event.location || {},
        capacity,
        registeredSeats: registered,
        reservedSeats: reserved,
        remainingSeats: remaining,
        minParticipantsPerOrder: Number(event.minParticipantsPerOrder || 1),
        maxParticipantsPerOrder: Number(event.maxParticipantsPerOrder || 6),
        currency: event.currency || 'usd',
        pricePerParticipantCents: Number(event.pricePerParticipantCents || 0),
        memberDiscountEligible: event.memberDiscountEligible !== false,
        waiverRequired: event.waiverRequired !== false,
    });
}

async function handleListPublishedEvents() {
    const snapshot = await db.collection('events').limit(200).get();
    const events = snapshot.docs
        .filter((item) => item.data()?.status === 'published')
        .map(publicEvent)
        .filter((event) => new Date(event.endsAt || event.startsAt || 0).valueOf() >= Date.now() - 24 * 60 * 60 * 1000)
        .sort((left, right) => new Date(left.startsAt || 0) - new Date(right.startsAt || 0));

    return { events };
}

function sanitizeEvent(data, instructorUid) {
    const title = clean(data?.title, 180);
    if (!title) throw new HttpsError('invalid-argument', 'Event title is required.');

    const startsAt = timestamp(data?.startsAt, 'event start time');
    const endsAt = timestamp(data?.endsAt, 'event end time');
    if (endsAt.toMillis() <= startsAt.toMillis()) {
        throw new HttpsError('invalid-argument', 'The event end time must be after the start time.');
    }

    const status = EVENT_STATUSES.has(data?.status) ? data.status : 'draft';
    const capacity = integer(data?.capacity, 1, 2000, 20);
    const maxParticipantsPerOrder = integer(
        data?.maxParticipantsPerOrder,
        1,
        MAX_EVENT_PARTICIPANTS_PER_ORDER,
        6,
    );
    const pricePerParticipantCents = requiredNonNegativeCents(
        data?.pricePerParticipantCents,
        'an event price per participant',
    );

    const registrationOpensAt = timestamp(
        data?.registrationOpensAt || new Date(),
        'registration opening time',
    );
    const registrationClosesAt = timestamp(
        data?.registrationClosesAt || startsAt.toDate(),
        'registration closing time',
    );
    if (registrationOpensAt.toMillis() > registrationClosesAt.toMillis()) {
        throw new HttpsError(
            'invalid-argument',
            'Registration must open before it closes.',
        );
    }
    if (registrationClosesAt.toMillis() > startsAt.toMillis()) {
        throw new HttpsError('invalid-argument', 'Registration must close by the event start time.');
    }

    return {
        title,
        shortDescription: clean(data?.shortDescription, 600),
        longDescription: clean(data?.longDescription, 6000),
        status,
        startsAt,
        endsAt,
        registrationOpensAt,
        registrationClosesAt,
        timezone: clean(data?.timezone || 'America/New_York', 80),
        location: {
            type: ['in_person', 'online', 'hybrid'].includes(data?.location?.type)
                ? data.location.type
                : 'in_person',
            name: clean(data?.location?.name, 180),
            address: clean(data?.location?.address, 500),
            onlineUrl: clean(data?.location?.onlineUrl, 1000),
        },
        capacity,
        minParticipantsPerOrder: 1,
        maxParticipantsPerOrder,
        currency: clean(data?.currency || 'usd', 8).toLowerCase(),
        pricePerParticipantCents,
        memberDiscountEligible: data?.memberDiscountEligible !== false,
        waiverRequired: data?.waiverRequired !== false,
        updatedBy: instructorUid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
}

async function handleSaveEvent(request) {
    const instructorUid = requireInstructor(request);
    const eventId = clean(request.data?.eventId, 160);
    const eventRef = eventId ? db.collection('events').doc(eventId) : db.collection('events').doc();
    const offerRef = db.collection('studioOffers').doc(eventRef.id);
    const [eventSnapshot, offerSnapshot] = await Promise.all([eventRef.get(), offerRef.get()]);
    const payload = sanitizeEvent(request.data, instructorUid);
    const offerStatus = payload.status === 'published'
        ? 'published'
        : payload.status === 'archived'
            ? 'archived'
            : payload.status === 'draft'
                ? 'draft'
                : 'hidden';

    const eventCreateFields = eventSnapshot.exists
        ? {}
        : {
            registeredSeats: 0,
            reservedSeats: 0,
            createdBy: instructorUid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };

    const batch = db.batch();
    batch.set(eventRef, { ...payload, ...eventCreateFields }, { merge: true });
    batch.set(offerRef, {
        purchaseType: 'event',
        name: payload.title,
        shortDescription: payload.shortDescription,
        status: offerStatus,
        currency: payload.currency,
        pricingModel: 'per_participant',
        unitAmountCents: payload.pricePerParticipantCents,
        amountCents: 0,
        participantAmountsCents: {},
        memberDiscountEligible: payload.memberDiscountEligible,
        metadata: {
            eventId: eventRef.id,
            maxParticipantsPerOrder: payload.maxParticipantsPerOrder,
        },
        updatedBy: instructorUid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: offerSnapshot.data()?.createdBy || instructorUid,
        createdAt: offerSnapshot.data()?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await batch.commit();

    return { eventId: eventRef.id };
}

async function prepareEventReservation({
    eventId,
    orderId,
    uid,
    purchaser,
    quantity,
    rawParticipants,
}) {
    const id = clean(eventId, 160);
    const registrationId = clean(orderId, 160);
    if (!id || !registrationId) {
        throw new HttpsError('invalid-argument', 'Event and order identifiers are required.');
    }

    const eventRef = db.collection('events').doc(id);
    const reservationRef = db.collection('eventReservations').doc(registrationId);
    let result = null;

    await db.runTransaction(async (transaction) => {
        const [eventSnapshot, reservationSnapshot] = await Promise.all([
            transaction.get(eventRef),
            transaction.get(reservationRef),
        ]);
        if (!eventSnapshot.exists) throw new HttpsError('not-found', 'That event was not found.');

        const event = eventSnapshot.data() || {};
        const count = integer(quantity, 1, MAX_EVENT_PARTICIPANTS_PER_ORDER, 1);
        const min = Number(event.minParticipantsPerOrder || 1);
        const max = Number(event.maxParticipantsPerOrder || 6);
        if (count < min || count > max) {
            throw new HttpsError(
                'failed-precondition',
                `This event allows ${min === max ? min : `${min}–${max}`} participant${max === 1 ? '' : 's'} per registration.`,
            );
        }

        const state = registrationWindowState(event);
        if (state !== 'open') {
            const messages = {
                not_open: 'Registration has not opened yet.',
                closed: 'Registration is closed.',
                sold_out: 'This event is sold out.',
                canceled: 'This event was canceled.',
                completed: 'This event has already taken place.',
            };
            throw new HttpsError('failed-precondition', messages[state] || 'This event is not accepting registrations.');
        }

        const capacity = Number(event.capacity || 0);
        const occupied = Number(event.registeredSeats || 0) + Number(event.reservedSeats || 0);
        if (capacity > 0 && occupied + count > capacity) {
            const available = Math.max(0, capacity - occupied);
            throw new HttpsError(
                'resource-exhausted',
                available > 0
                    ? `Only ${available} spot${available === 1 ? '' : 's'} remain.`
                    : 'This event is sold out.',
            );
        }

        const participants = sanitizeEventParticipants(rawParticipants, count, purchaser, registrationId);
        const expiresAt = admin.firestore.Timestamp.fromMillis(
            Date.now() + RESERVATION_MINUTES * 60 * 1000,
        );

        if (!reservationSnapshot.exists) {
            transaction.set(eventRef, {
                reservedSeats: admin.firestore.FieldValue.increment(count),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        }

        transaction.set(reservationRef, {
            id: registrationId,
            orderId: registrationId,
            eventId: id,
            uid: uid || null,
            purchaser,
            participants,
            participantCount: count,
            status: 'pending_payment',
            expiresAt,
            eventSnapshot: {
                title: event.title,
                startsAt: event.startsAt,
                endsAt: event.endsAt,
                timezone: event.timezone || 'America/New_York',
                location: event.location || {},
                waiverRequired: event.waiverRequired !== false,
            },
            createdAt: reservationSnapshot.data()?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        result = {
            event: { id, ...event },
            participants,
            participantCount: count,
            expiresAt,
        };
    });

    return result;
}

async function releaseEventReservation(orderId, reason = 'released') {
    const id = clean(orderId, 160);
    if (!id) return;
    const reservationRef = db.collection('eventReservations').doc(id);

    await db.runTransaction(async (transaction) => {
        const reservationSnapshot = await transaction.get(reservationRef);
        if (!reservationSnapshot.exists) return;
        const reservation = reservationSnapshot.data() || {};
        if (reservation.status !== 'pending_payment') return;

        const eventRef = db.collection('events').doc(reservation.eventId);
        const eventSnapshot = await transaction.get(eventRef);
        if (eventSnapshot.exists) {
            const current = Number(eventSnapshot.data()?.reservedSeats || 0);
            transaction.set(eventRef, {
                reservedSeats: Math.max(0, current - Number(reservation.participantCount || 0)),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        }
        transaction.set(reservationRef, {
            status: reason,
            releasedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    });
}

async function ensureEventRegistrationFromOrder(orderId) {
    const id = clean(orderId, 160);
    if (!id) return null;

    const orderRef = db.collection('studioOrders').doc(id);
    const reservationRef = db.collection('eventReservations').doc(id);
    const registrationRef = db.collection('eventRegistrations').doc(id);

    await db.runTransaction(async (transaction) => {
        const [orderSnapshot, reservationSnapshot, registrationSnapshot] = await Promise.all([
            transaction.get(orderRef),
            transaction.get(reservationRef),
            transaction.get(registrationRef),
        ]);

        if (registrationSnapshot.exists) return;
        if (!orderSnapshot.exists) throw new HttpsError('not-found', 'The event order was not found.');
        const order = orderSnapshot.data() || {};
        if (order.purchaseType !== 'event' || order.paymentStatus !== 'paid') {
            throw new HttpsError('failed-precondition', 'The event order is not paid.');
        }

        const reservation = reservationSnapshot.data() || {};
        const eventId = reservation.eventId || order.offerId;
        const eventRef = db.collection('events').doc(eventId);
        const eventSnapshot = await transaction.get(eventRef);
        if (!eventSnapshot.exists) throw new HttpsError('not-found', 'The event was not found.');

        const event = eventSnapshot.data() || {};
        const participants = Array.isArray(reservation.participants) && reservation.participants.length
            ? reservation.participants
            : Array.isArray(order.participants) ? order.participants : [];
        const count = Number(participants.length || order.participantCount || order.quantity || 1);
        const reservedSeats = Number(event.reservedSeats || 0);
        const registeredSeats = Number(event.registeredSeats || 0);

        transaction.set(eventRef, {
            reservedSeats: Math.max(0, reservedSeats - count),
            registeredSeats: registeredSeats + count,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        transaction.set(registrationRef, {
            id,
            orderId: id,
            eventId,
            uid: order.uid || null,
            purchaser: order.purchaser || reservation.purchaser || null,
            eventSnapshot: reservation.eventSnapshot || {
                title: event.title,
                startsAt: event.startsAt,
                endsAt: event.endsAt,
                timezone: event.timezone,
                location: event.location,
                waiverRequired: event.waiverRequired !== false,
            },
            participantCount: count,
            pricing: order.pricing || null,
            paymentStatus: 'paid',
            registrationStatus: 'confirmed',
            waiverStatus: event.waiverRequired === false ? 'not_required' : 'pending',
            checkInStatus: 'not_checked_in',
            stripeCheckoutSessionId: order.stripeCheckoutSessionId || null,
            stripePaymentIntentId: order.stripePaymentIntentId || null,
            paidAt: order.paidAt || admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        participants.forEach((participant, index) => {
            const idForParticipant = clean(participant.id, 180) || participantId(id, index);
            const participantRef = db.collection('eventParticipants').doc(idForParticipant);
            transaction.set(participantRef, {
                id: idForParticipant,
                registrationId: id,
                orderId: id,
                eventId,
                purchaserUid: order.uid || null,
                memberUid: participant.isPurchaser === true ? order.uid || null : null,
                fullName: participant.fullName,
                email: participant.email,
                phone: participant.phone || null,
                isMinor: participant.isMinor === true,
                guardianName: participant.guardianName || null,
                isPurchaser: participant.isPurchaser === true,
                registrationStatus: 'confirmed',
                waiverStatus: event.waiverRequired === false ? 'not_required' : 'pending',
                checkInStatus: 'not_checked_in',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        });

        if (reservationSnapshot.exists) transaction.delete(reservationRef);
    });

    return id;
}

async function authorizeRegistration(request, registration) {
    if (request.auth?.uid && registration.uid === request.auth.uid) return;
    if (INSTRUCTOR_ROLES.has(callerRole(request))) return;

    const orderSnapshot = await db.collection('studioOrders').doc(registration.orderId).get();
    const order = orderSnapshot.data() || {};
    const supplied = hashToken(request.data?.accessToken);
    if (!order.accessTokenHash || !safeEqual(order.accessTokenHash, supplied)) {
        throw new HttpsError('permission-denied', 'You do not have access to this registration.');
    }
}

async function participantsForRegistration(registrationId) {
    const snapshot = await db.collection('eventParticipants')
        .where('registrationId', '==', registrationId)
        .limit(MAX_EVENT_PARTICIPANTS_PER_ORDER)
        .get();
    return snapshot.docs
        .map((item) => serialize({ id: item.id, ...item.data() }))
        .sort((left, right) => String(left.fullName || '').localeCompare(String(right.fullName || '')));
}

async function handleGetEventRegistration(request) {
    const registrationId = clean(request.data?.registrationId || request.data?.orderId, 160);
    if (!registrationId) throw new HttpsError('invalid-argument', 'Registration ID is required.');

    const snapshot = await db.collection('eventRegistrations').doc(registrationId).get();
    if (!snapshot.exists) throw new HttpsError('not-found', 'That registration was not found.');
    const registration = { id: snapshot.id, ...snapshot.data() };
    await authorizeRegistration(request, registration);
    const participants = await participantsForRegistration(snapshot.id);
    return { registration: serialize(registration), participants };
}

async function handleListMyEventRegistrations(request) {
    const uid = requireAuthenticated(request);
    const snapshot = await db.collection('eventRegistrations')
        .where('uid', '==', uid)
        .limit(100)
        .get();

    const registrations = await Promise.all(snapshot.docs.map(async (item) => ({
        ...serialize({ id: item.id, ...item.data() }),
        participants: await participantsForRegistration(item.id),
    })));

    registrations.sort((left, right) => (
        new Date(left.eventSnapshot?.startsAt || 0) - new Date(right.eventSnapshot?.startsAt || 0)
    ));
    return { registrations };
}

async function handleListEventsAdmin(request) {
    requireInstructor(request);
    const [eventsSnapshot, registrationsSnapshot, participantsSnapshot] = await Promise.all([
        db.collection('events').limit(300).get(),
        db.collection('eventRegistrations').limit(500).get(),
        db.collection('eventParticipants').limit(1000).get(),
    ]);

    const events = eventsSnapshot.docs
        .map((item) => serialize({ id: item.id, ...item.data(), registrationState: registrationWindowState(item.data() || {}) }))
        .sort((left, right) => new Date(left.startsAt || 0) - new Date(right.startsAt || 0));
    const participants = participantsSnapshot.docs.map((item) => serialize({ id: item.id, ...item.data() }));
    const participantsByRegistration = participants.reduce((map, participant) => {
        const key = participant.registrationId;
        if (!map[key]) map[key] = [];
        map[key].push(participant);
        return map;
    }, {});
    const registrations = registrationsSnapshot.docs
        .map((item) => ({
            ...serialize({ id: item.id, ...item.data() }),
            participants: participantsByRegistration[item.id] || [],
        }))
        .sort((left, right) => new Date(right.paidAt || right.createdAt || 0) - new Date(left.paidAt || left.createdAt || 0));

    return { events, registrations };
}

module.exports = {
    MAX_EVENT_PARTICIPANTS_PER_ORDER,
    RESERVATION_MINUTES,
    sanitizeEventParticipants,
    prepareEventReservation,
    releaseEventReservation,
    ensureEventRegistrationFromOrder,
    handleListPublishedEvents,
    handleSaveEvent,
    handleGetEventRegistration,
    handleListMyEventRegistrations,
    handleListEventsAdmin,
};
