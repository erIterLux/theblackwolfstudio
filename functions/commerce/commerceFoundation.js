const crypto = require('crypto');
const admin = require('firebase-admin');
const { HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const {
    LIVE_MEMBERSHIP_STATUSES,
    getPlanDefinition,
} = require('../config/membershipPlans');

const db = admin.firestore();
const INSTRUCTOR_ROLES = new Set(['instructor', 'admin']);
const PURCHASE_TYPES = new Set(['event', 'private_training']);
const OFFER_STATUSES = new Set(['draft', 'published', 'hidden', 'archived']);
const DISCOUNT_TYPES = new Set(['percent', 'amount']);

function clean(value, max = 500) {
    return String(value ?? '').trim().slice(0, max);
}

function normalizeEmail(value) {
    return clean(value, 320).toLowerCase();
}

function normalizeCode(value) {
    return clean(value, 80).replace(/[^a-z0-9-]/gi, '').toUpperCase();
}

function cents(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.round(number)) : fallback;
}

function positiveInteger(value, min = 1, max = 99, fallback = min) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

function nonNegativeInteger(value, max = 100000, fallback = 0) {
    if (value === '' || value == null) return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new HttpsError('invalid-argument', 'Enter a valid whole-number redemption limit.');
    }
    return Math.min(max, parsed);
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

function createAccessToken() {
    return crypto.randomBytes(32).toString('base64url');
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

function stripeClient(secretParam) {
    const key = secretParam?.value();
    if (!key) throw new HttpsError('failed-precondition', 'Stripe is not configured.');
    return require('stripe')(key);
}

function normalizedOrigin(value) {
    return clean(value, 500).replace(/\/+$/, '');
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

function assertPurchaseType(value) {
    const purchaseType = clean(value, 40).toLowerCase();
    if (!PURCHASE_TYPES.has(purchaseType)) {
        throw new HttpsError('invalid-argument', 'Choose a valid purchase type.');
    }
    return purchaseType;
}

function sanitizePurchaser(raw, request) {
    const name = clean(raw?.name || request.auth?.token?.name, 160);
    const email = normalizeEmail(raw?.email || request.auth?.token?.email);
    const phone = clean(raw?.phone, 40);

    if (!name) throw new HttpsError('invalid-argument', 'Purchaser name is required.');
    if (!email || !email.includes('@')) {
        throw new HttpsError('invalid-argument', 'A valid purchaser email is required.');
    }

    return { name, email, phone };
}

function priceForOffer(offer, quantity) {
    const pricingModel = clean(offer.pricingModel || 'flat', 40);
    const count = positiveInteger(quantity, 1, 12, 1);
    const allowsFree = offer.purchaseType === 'event';

    if (pricingModel === 'per_participant') {
        const unit = cents(offer.unitAmountCents);
        if (unit === 0 && !allowsFree) {
            throw new HttpsError('failed-precondition', 'This offer does not have a valid price.');
        }
        return {
            quantity: count,
            unitAmountCents: unit,
            subtotalCents: unit * count,
            pricingModel,
        };
    }

    if (pricingModel === 'participant_tiers') {
        const tierMap = offer.participantAmountsCents || {};
        const configuredValue = tierMap[String(count)] ?? tierMap[count];
        const total = cents(configuredValue);
        if ((configuredValue === undefined || configuredValue === null || configuredValue === '')
            || (total === 0 && !allowsFree)) {
            throw new HttpsError(
                'failed-precondition',
                `This offer is not configured for ${count} participant${count === 1 ? '' : 's'}.`,
            );
        }
        return {
            quantity: count,
            unitAmountCents: total,
            subtotalCents: total,
            pricingModel,
        };
    }

    const configuredValue = offer.amountCents;
    const total = cents(configuredValue);
    if ((configuredValue === undefined || configuredValue === null || configuredValue === '')
        || (total === 0 && !allowsFree)) {
        throw new HttpsError('failed-precondition', 'This offer does not have a valid price.');
    }
    return {
        quantity: 1,
        unitAmountCents: total,
        subtotalCents: total,
        pricingModel: 'flat',
    };
}

async function getPublishedOffer(offerId, requestedType) {
    const id = clean(offerId, 160);
    if (!id) throw new HttpsError('invalid-argument', 'Choose an offer.');

    const snapshot = await db.collection('studioOffers').doc(id).get();
    if (!snapshot.exists) throw new HttpsError('not-found', 'That offer was not found.');

    const offer = snapshot.data() || {};
    if (offer.status !== 'published') {
        throw new HttpsError('failed-precondition', 'That offer is not currently available.');
    }
    if (offer.purchaseType !== requestedType) {
        throw new HttpsError('invalid-argument', 'That offer does not match the selected purchase type.');
    }

    return { id: snapshot.id, ...offer };
}

async function getMembershipDiscount(uid, purchaseType) {
    if (!uid) return null;

    const snapshot = await db.collection('memberships').doc(uid).get();
    const membership = snapshot.data() || {};
    if (!LIVE_MEMBERSHIP_STATUSES.has(membership.status)) return null;

    const plan = getPlanDefinition(membership.planKey);
    const percent = purchaseType === 'event'
        ? Number(
            membership.discounts?.eventPercent
            ?? membership.eventDiscountPercent
            ?? plan?.discounts?.eventPercent
            ?? 0,
        )
        : Number(
            membership.discounts?.privateTrainingPercent
            ?? membership.privateTrainingDiscountPercent
            ?? plan?.discounts?.privateTrainingPercent
            ?? 0,
        );

    const normalized = Math.min(100, Math.max(0, percent));
    if (!normalized) return null;

    return {
        source: 'membership',
        label: `${membership.planName || plan?.name || 'Member'} pricing`,
        type: 'percent',
        value: normalized,
        membershipPlanKey: membership.planKey || null,
    };
}

async function getStudioDiscount({ code, purchaseType, offerId, uid }) {
    const normalized = normalizeCode(code);
    if (!normalized) return null;

    const query = await db.collection('studioDiscounts')
        .where('codeNormalized', '==', normalized)
        .limit(1)
        .get();

    if (query.empty) throw new HttpsError('not-found', 'That discount code is not valid.');

    const snapshot = query.docs[0];
    const discount = snapshot.data() || {};
    const now = Date.now();
    const startsAt = discount.startsAt?.toMillis?.() || 0;
    const endsAt = discount.endsAt?.toMillis?.() || 0;
    const maximum = Number(discount.maxRedemptions || 0);
    const used = Number(discount.redemptions || 0);

    if (discount.active !== true) {
        throw new HttpsError('failed-precondition', 'That discount code is inactive.');
    }
    if (startsAt && now < startsAt) {
        throw new HttpsError('failed-precondition', 'That discount code is not active yet.');
    }
    if (endsAt && now > endsAt) {
        throw new HttpsError('failed-precondition', 'That discount code has expired.');
    }
    if (maximum > 0 && used >= maximum) {
        throw new HttpsError('resource-exhausted', 'That discount code has reached its redemption limit.');
    }

    const appliesTo = Array.isArray(discount.appliesTo) ? discount.appliesTo : [];
    if (appliesTo.length && !appliesTo.includes(purchaseType)) {
        throw new HttpsError('failed-precondition', 'That discount does not apply to this purchase.');
    }

    const offerIds = Array.isArray(discount.offerIds) ? discount.offerIds : [];
    if (offerIds.length && !offerIds.includes(offerId)) {
        throw new HttpsError('failed-precondition', 'That discount does not apply to this offer.');
    }

    if (discount.memberOnly === true) {
        const memberDiscount = await getMembershipDiscount(uid, purchaseType);
        if (!memberDiscount) {
            throw new HttpsError('permission-denied', 'An active membership is required for that code.');
        }
    }

    const type = DISCOUNT_TYPES.has(discount.type) ? discount.type : 'percent';
    const value = type === 'percent'
        ? Math.min(100, Math.max(0, Number(discount.value || 0)))
        : cents(discount.value);

    return {
        source: 'promotion',
        label: clean(discount.name || discount.codeDisplay || normalized, 160),
        type,
        value,
        code: normalized,
        discountId: snapshot.id,
    };
}

function calculateDiscount(subtotalCents, discount) {
    if (!discount) return null;
    const amountCents = discount.type === 'amount'
        ? Math.min(subtotalCents, cents(discount.value))
        : Math.min(
            subtotalCents,
            Math.floor(subtotalCents * Number(discount.value || 0) / 100),
        );

    return amountCents > 0 ? { ...discount, amountCents } : null;
}

async function resolveDiscount({
    uid,
    purchaseType,
    offerId,
    subtotalCents,
    discountCode,
    memberDiscountEligible,
}) {
    const [member, promotion] = await Promise.all([
        memberDiscountEligible
            ? getMembershipDiscount(uid, purchaseType)
            : Promise.resolve(null),
        getStudioDiscount({ code: discountCode, purchaseType, offerId, uid }),
    ]);

    const memberCalculated = calculateDiscount(subtotalCents, member);
    const promotionCalculated = calculateDiscount(subtotalCents, promotion);

    if (!memberCalculated) return promotionCalculated;
    if (!promotionCalculated) return memberCalculated;

    return promotionCalculated.amountCents > memberCalculated.amountCents
        ? promotionCalculated
        : memberCalculated;
}

function makeQuote({ offer, price, discount }) {
    const discountAmountCents = discount?.amountCents || 0;
    return {
        purchaseType: offer.purchaseType,
        offerId: offer.id,
        offerName: offer.name,
        currency: clean(offer.currency || 'usd', 8).toLowerCase(),
        quantity: price.quantity,
        pricingModel: price.pricingModel,
        subtotalCents: price.subtotalCents,
        discountAmountCents,
        totalCents: Math.max(0, price.subtotalCents - discountAmountCents),
        discount: discount ? {
            source: discount.source,
            label: discount.label,
            code: discount.code || null,
            type: discount.type,
            value: discount.value,
            amountCents: discount.amountCents,
            membershipPlanKey: discount.membershipPlanKey || null,
            discountId: discount.discountId || null,
        } : null,
    };
}

async function buildQuote(request) {
    const purchaseType = assertPurchaseType(request.data?.purchaseType);
    const offer = await getPublishedOffer(request.data?.offerId, purchaseType);
    const maxQuantity = purchaseType === 'private_training' ? 3 : 12;
    const quantity = positiveInteger(request.data?.quantity, 1, maxQuantity, 1);
    const price = priceForOffer(offer, quantity);
    const discount = await resolveDiscount({
        uid: request.auth?.uid || null,
        purchaseType,
        offerId: offer.id,
        subtotalCents: price.subtotalCents,
        discountCode: request.data?.discountCode,
        memberDiscountEligible: offer.memberDiscountEligible !== false,
    });

    return { offer, price, quote: makeQuote({ offer, price, discount }) };
}

async function handleQuoteStudioCheckout(request) {
    const result = await buildQuote(request);
    return { quote: result.quote };
}

async function findOrCreateStripeCustomer({ stripe, uid, purchaser }) {
    if (!uid) return null;

    const membershipRef = db.collection('memberships').doc(uid);
    const membershipSnapshot = await membershipRef.get();
    const membership = membershipSnapshot.data() || {};
    if (membership.stripeCustomerId) return membership.stripeCustomerId;

    const matches = await stripe.customers.list({ email: purchaser.email, limit: 1 });
    let customer = matches.data?.[0] || null;

    if (!customer) {
        customer = await stripe.customers.create({
            email: purchaser.email,
            name: purchaser.name,
            phone: purchaser.phone || undefined,
            metadata: { firebaseUid: uid },
        });
    } else if (customer.metadata?.firebaseUid !== uid) {
        customer = await stripe.customers.update(customer.id, {
            metadata: { ...(customer.metadata || {}), firebaseUid: uid },
        });
    }

    await membershipRef.set({
        uid,
        email: purchaser.email,
        displayName: purchaser.name,
        stripeCustomerId: customer.id,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return customer.id;
}

async function handleCreateStudioCheckout(request, dependencies = {}) {
    const { offer, quote } = await buildQuote(request);
    const purchaser = sanitizePurchaser(request.data?.purchaser, request);
    let participants = [];
    let privateTraining = null;
    let eventReservation = null;

    if (offer.purchaseType === 'private_training') {
        const {
            sanitizePrivateTrainingParticipants,
            assertPrivateTrainingParticipantLimit,
        } = require('../privateTraining/privateTrainingService');

        privateTraining = assertPrivateTrainingParticipantLimit(offer, quote.quantity);
        participants = sanitizePrivateTrainingParticipants(
            request.data?.participants,
            quote.quantity,
            purchaser,
        );
    }

    const origin = normalizedOrigin(dependencies.appOrigin);
    if (!origin) throw new HttpsError('failed-precondition', 'APP_ORIGIN is not configured.');

    const orderRef = db.collection('studioOrders').doc();
    const orderAccessRef = db.collection('studioOrderAccess').doc(orderRef.id);
    const accessToken = createAccessToken();
    const isFreeRegistration = offer.purchaseType === 'event' && quote.totalCents === 0;
    let stripe = null;
    let stripeCustomerId = null;

    if (!isFreeRegistration) {
        stripe = stripeClient(dependencies.stripeSecretKey);
        stripeCustomerId = await findOrCreateStripeCustomer({
            stripe,
            uid: request.auth?.uid || null,
            purchaser,
        });
    }

    if (offer.purchaseType === 'event') {
        const { prepareEventReservation } = require('../events/eventService');
        eventReservation = await prepareEventReservation({
            eventId: offer.id,
            orderId: orderRef.id,
            uid: request.auth?.uid || null,
            purchaser,
            quantity: quote.quantity,
            rawParticipants: request.data?.participants,
        });
        participants = eventReservation.participants;
    }

    const order = {
        id: orderRef.id,
        uid: request.auth?.uid || null,
        purchaser,
        purchaseType: offer.purchaseType,
        offerId: offer.id,
        offerName: offer.name,
        quantity: quote.quantity,
        participantCount: participants.length || quote.quantity,
        participants,
        privateTraining,
        event: eventReservation ? {
            eventId: offer.id,
            startsAt: eventReservation.event.startsAt || null,
            endsAt: eventReservation.event.endsAt || null,
            timezone: eventReservation.event.timezone || 'America/New_York',
            location: eventReservation.event.location || {},
            waiverRequired: eventReservation.event.waiverRequired !== false,
            reservationExpiresAt: eventReservation.expiresAt,
        } : null,
        pricingModel: quote.pricingModel,
        currency: quote.currency,
        pricing: {
            subtotalCents: quote.subtotalCents,
            discountAmountCents: quote.discountAmountCents,
            totalCents: quote.totalCents,
            discount: quote.discount,
        },
        paymentStatus: isFreeRegistration ? 'paid' : 'pending',
        paymentMethod: isFreeRegistration ? 'free_registration' : 'stripe',
        fulfillmentStatus: isFreeRegistration ? 'confirmed' : 'pending',
        paidAt: isFreeRegistration
            ? admin.firestore.FieldValue.serverTimestamp()
            : null,
        accessTokenHash: hashToken(accessToken),
        stripeCustomerId: stripeCustomerId || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const successUrl = offer.purchaseType === 'private_training'
        ? `${origin}/private-training/success?order_id=${orderRef.id}&access_token=${accessToken}`
        : `${origin}/events/success?order_id=${orderRef.id}&access_token=${accessToken}`;
    const cancelUrl = `${origin}/${offer.purchaseType === 'event' ? 'events' : 'private-training'}?purchase=canceled`;
    const persistOrder = () => Promise.all([
        orderRef.set(order),
        orderAccessRef.set({
            orderId: orderRef.id,
            purchaseType: offer.purchaseType,
            token: accessToken,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }),
    ]);

    if (isFreeRegistration) {
        try {
            await persistOrder();
            const { ensureEventRegistrationFromOrder } = require('../events/eventService');
            await ensureEventRegistrationFromOrder(orderRef.id);
            if (quote.discount?.source === 'promotion') {
                await incrementDiscountRedemption(quote.discount.discountId);
            }
        } catch (error) {
            await orderRef.set({
                paymentStatus: 'registration_failed',
                checkoutError: clean(error?.message, 800),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            const { releaseEventReservation } = require('../events/eventService');
            await releaseEventReservation(orderRef.id, 'registration_failed');
            throw error;
        }

        return {
            url: successUrl,
            orderId: orderRef.id,
            accessToken,
            quote,
            freeRegistration: true,
        };
    }

    const sessionPayload = {
        mode: 'payment',
        client_reference_id: request.auth?.uid || orderRef.id,
        customer: stripeCustomerId || undefined,
        customer_email: stripeCustomerId ? undefined : purchaser.email,
        line_items: [{
            price_data: {
                currency: quote.currency,
                unit_amount: quote.totalCents,
                product_data: {
                    name: offer.name,
                    description: clean(offer.shortDescription, 500) || undefined,
                    metadata: {
                        offerId: offer.id,
                        purchaseType: offer.purchaseType,
                    },
                },
            },
            quantity: 1,
        }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
            orderId: orderRef.id,
            firebaseUid: request.auth?.uid || '',
            purchaseType: offer.purchaseType,
            offerId: offer.id,
            discountSource: quote.discount?.source || '',
            discountId: quote.discount?.discountId || '',
            participantCount: String(participants.length || quote.quantity),
        },
        payment_intent_data: {
            metadata: {
                orderId: orderRef.id,
                firebaseUid: request.auth?.uid || '',
                purchaseType: offer.purchaseType,
                offerId: offer.id,
            },
        },
        ...(offer.purchaseType === 'event' ? {
            expires_at: Math.floor(Date.now() / 1000) + 35 * 60,
        } : {}),
    };

    let session;
    try {
        await persistOrder();
        session = await stripe.checkout.sessions.create(
            sessionPayload,
            { idempotencyKey: `studio-order-${orderRef.id}` },
        );
    } catch (error) {
        await orderRef.set({
            paymentStatus: 'checkout_failed',
            checkoutError: clean(error?.message, 800),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        if (offer.purchaseType === 'event') {
            const { releaseEventReservation } = require('../events/eventService');
            await releaseEventReservation(orderRef.id, 'checkout_failed');
        }
        throw error;
    }

    await orderRef.set({
        stripeCheckoutSessionId: session.id,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return {
        url: session.url,
        orderId: orderRef.id,
        accessToken,
        quote,
    };
}

async function authorizeOrder(request, order) {
    if (request.auth?.uid && order.uid === request.auth.uid) return;
    if (INSTRUCTOR_ROLES.has(callerRole(request))) return;

    const suppliedHash = hashToken(request.data?.accessToken);
    if (!order.accessTokenHash || !safeEqual(order.accessTokenHash, suppliedHash)) {
        throw new HttpsError('permission-denied', 'You do not have access to this purchase.');
    }
}

async function handleGetStudioOrder(request) {
    const orderId = clean(request.data?.orderId, 160);
    if (!orderId) throw new HttpsError('invalid-argument', 'Purchase ID is required.');

    const snapshot = await db.collection('studioOrders').doc(orderId).get();
    if (!snapshot.exists) throw new HttpsError('not-found', 'That purchase was not found.');

    const order = { id: snapshot.id, ...snapshot.data() };
    await authorizeOrder(request, order);

    const safeOrder = { ...order };
    delete safeOrder.accessTokenHash;
    return { order: serialize(safeOrder) };
}

async function handleListMyStudioOrders(request) {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to view purchases.');

    const query = await db.collection('studioOrders')
        .where('uid', '==', request.auth.uid)
        .limit(100)
        .get();

    const orders = query.docs
        .map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }))
        .sort((left, right) => {
            const a = left.createdAt?.toMillis?.() || 0;
            const b = right.createdAt?.toMillis?.() || 0;
            return b - a;
        })
        .map((order) => {
            const safeOrder = { ...order };
            delete safeOrder.accessTokenHash;
            return serialize(safeOrder);
        });

    return { orders };
}

function sanitizeOffer(data, instructorUid) {
    const purchaseType = assertPurchaseType(data?.purchaseType);
    const status = OFFER_STATUSES.has(data?.status) ? data.status : 'draft';
    const name = clean(data?.name, 160);
    const pricingModel = ['flat', 'per_participant', 'participant_tiers'].includes(data?.pricingModel)
        ? data.pricingModel
        : 'flat';

    if (!name) throw new HttpsError('invalid-argument', 'Offer name is required.');

    const participantAmounts = data?.participantAmountsCents || {};
    const sanitized = {
        purchaseType,
        name,
        shortDescription: clean(data?.shortDescription, 500),
        status,
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
        metadata: data?.metadata && typeof data.metadata === 'object'
            ? data.metadata
            : {},
        updatedBy: instructorUid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    priceForOffer(sanitized, pricingModel === 'participant_tiers' ? 1 : 1);
    return sanitized;
}

async function handleSaveStudioOffer(request) {
    const instructorUid = requireInstructor(request);
    const offerId = clean(request.data?.offerId, 160);
    const ref = offerId
        ? db.collection('studioOffers').doc(offerId)
        : db.collection('studioOffers').doc();
    const existing = await ref.get();
    const payload = sanitizeOffer(request.data, instructorUid);

    await ref.set({
        ...payload,
        createdBy: existing.data()?.createdBy || instructorUid,
        createdAt: existing.data()?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return { offerId: ref.id };
}

function nullableTimestamp(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) {
        throw new HttpsError('invalid-argument', 'Enter a valid date.');
    }
    return admin.firestore.Timestamp.fromDate(date);
}

async function handleSaveStudioDiscount(request) {
    const instructorUid = requireInstructor(request);
    const discountId = clean(request.data?.discountId, 160);
    const ref = discountId
        ? db.collection('studioDiscounts').doc(discountId)
        : db.collection('studioDiscounts').doc();
    const existing = await ref.get();
    const codeNormalized = normalizeCode(request.data?.code);
    const type = DISCOUNT_TYPES.has(request.data?.type) ? request.data.type : 'percent';
    const rawValue = Number(request.data?.value);

    if (!codeNormalized) throw new HttpsError('invalid-argument', 'Discount code is required.');
    if (!Number.isFinite(rawValue) || rawValue <= 0) {
        throw new HttpsError('invalid-argument', 'Discount value must be greater than zero.');
    }
    if (type === 'percent' && rawValue > 100) {
        throw new HttpsError('invalid-argument', 'Percentage discounts cannot exceed 100%.');
    }

    const value = type === 'percent' ? rawValue : cents(rawValue);
    const startsAt = nullableTimestamp(request.data?.startsAt);
    const endsAt = nullableTimestamp(request.data?.endsAt);
    if (startsAt && endsAt && endsAt.toMillis() <= startsAt.toMillis()) {
        throw new HttpsError('invalid-argument', 'Discount end time must be after its start time.');
    }
    const maxRedemptions = nonNegativeInteger(request.data?.maxRedemptions);

    const duplicate = await db.collection('studioDiscounts')
        .where('codeNormalized', '==', codeNormalized)
        .limit(2)
        .get();
    if (duplicate.docs.some((snapshot) => snapshot.id !== ref.id)) {
        throw new HttpsError('already-exists', 'That discount code is already in use.');
    }

    const appliesTo = Array.isArray(request.data?.appliesTo)
        ? request.data.appliesTo.map((item) => clean(item, 40)).filter((item) => PURCHASE_TYPES.has(item))
        : [];
    const offerIds = Array.isArray(request.data?.offerIds)
        ? request.data.offerIds.map((item) => clean(item, 160)).filter(Boolean).slice(0, 100)
        : [];

    await ref.set({
        name: clean(request.data?.name || codeNormalized, 160),
        codeDisplay: clean(request.data?.code, 80).toUpperCase(),
        codeNormalized,
        type,
        value,
        active: request.data?.active !== false,
        memberOnly: request.data?.memberOnly === true,
        appliesTo,
        offerIds,
        startsAt,
        endsAt,
        maxRedemptions,
        redemptions: Number(existing.data()?.redemptions || 0),
        updatedBy: instructorUid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: existing.data()?.createdBy || instructorUid,
        createdAt: existing.data()?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return { discountId: ref.id };
}

async function handleListCommerceFoundationAdmin(request) {
    requireInstructor(request);

    const [offersSnapshot, discountsSnapshot, ordersSnapshot] = await Promise.all([
        db.collection('studioOffers').limit(200).get(),
        db.collection('studioDiscounts').limit(200).get(),
        db.collection('studioOrders').limit(200).get(),
    ]);

    const offers = offersSnapshot.docs
        .map((snapshot) => serialize({ id: snapshot.id, ...snapshot.data() }))
        .sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')));
    const discounts = discountsSnapshot.docs
        .map((snapshot) => serialize({ id: snapshot.id, ...snapshot.data() }))
        .sort((left, right) => String(left.codeDisplay || '').localeCompare(String(right.codeDisplay || '')));
    const orders = ordersSnapshot.docs.map((snapshot) => {
        const value = { id: snapshot.id, ...snapshot.data() };
        delete value.accessTokenHash;
        return serialize(value);
    });

    return { offers, discounts, orders };
}

async function incrementDiscountRedemption(discountId) {
    if (!discountId) return;
    await db.collection('studioDiscounts').doc(discountId).set({
        redemptions: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
}

async function handleOneTimeCheckoutEvent({ eventType, session, stripe = null }) {
    const purchaseType = clean(session?.metadata?.purchaseType, 40);
    const orderId = clean(session?.metadata?.orderId, 160);
    if (!PURCHASE_TYPES.has(purchaseType) || !orderId) return false;

    const orderRef = db.collection('studioOrders').doc(orderId);
    const snapshot = await orderRef.get();
    if (!snapshot.exists) {
        logger.warn('One-time Stripe session references an unknown studio order.', {
            orderId,
            eventType,
            sessionId: session?.id,
        });
        return true;
    }

    const order = snapshot.data() || {};
    let paymentStatus = order.paymentStatus || 'pending';
    if (eventType === 'checkout.session.completed') {
        paymentStatus = session.payment_status === 'paid' || session.payment_status === 'no_payment_required'
            ? 'paid'
            : 'processing';
    } else if (eventType === 'checkout.session.async_payment_succeeded') {
        paymentStatus = 'paid';
    } else if (eventType === 'checkout.session.async_payment_failed') {
        paymentStatus = 'failed';
    } else if (eventType === 'checkout.session.expired') {
        paymentStatus = 'expired';
    }

    const firstPaidTransition = paymentStatus === 'paid' && order.paymentStatus !== 'paid';
    await orderRef.set({
        paymentStatus,
        stripeCheckoutSessionId: session.id || order.stripeCheckoutSessionId || null,
        stripePaymentIntentId: typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id || null,
        stripeCustomerId: typeof session.customer === 'string'
            ? session.customer
            : session.customer?.id || order.stripeCustomerId || null,
        paidAt: firstPaidTransition
            ? admin.firestore.FieldValue.serverTimestamp()
            : order.paidAt || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    if (firstPaidTransition && order.pricing?.discount?.source === 'promotion') {
        await incrementDiscountRedemption(order.pricing.discount.discountId);
    }

    if (paymentStatus === 'paid' && stripe) {
        const { syncOneTimeReceipt } = require('../purchases/purchaseHistoryService');
        await syncOneTimeReceipt({ stripe, session, orderRef, order: { id: orderId, ...order } });
    }

    if (paymentStatus === 'paid' && purchaseType === 'private_training') {
        const {
            ensurePrivateTrainingPurchaseFromOrder,
        } = require('../privateTraining/privateTrainingService');
        await ensurePrivateTrainingPurchaseFromOrder(orderId);
    }

    if (purchaseType === 'event') {
        const {
            ensureEventRegistrationFromOrder,
            releaseEventReservation,
        } = require('../events/eventService');

        if (paymentStatus === 'paid') {
            await ensureEventRegistrationFromOrder(orderId);
        } else if (paymentStatus === 'failed' || paymentStatus === 'expired') {
            await releaseEventReservation(orderId, paymentStatus);
        }
    }

    return true;
}

module.exports = {
    handleQuoteStudioCheckout,
    handleCreateStudioCheckout,
    handleGetStudioOrder,
    handleListMyStudioOrders,
    handleSaveStudioOffer,
    handleSaveStudioDiscount,
    handleListCommerceFoundationAdmin,
    handleOneTimeCheckoutEvent,
};
