const admin = require('firebase-admin');
const { HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const {
    LIVE_MEMBERSHIP_STATUSES,
    buildPriceMap,
    getPlanDefinition,
    getPlanForPriceId,
} = require('../config/membershipPlans');
const { configureEmail, sendMembershipLifecycleEmail } = require('../notifications/emailService');

function stripeClient(secretParam) {
    const key = secretParam?.value();
    if (!key) throw new HttpsError('failed-precondition', 'Stripe is not configured.');
    return require('stripe')(key);
}

function assertAuthenticated(request) {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in before managing membership.');
    return request.auth.uid;
}

function normalizedOrigin(appOrigin) {
    return String(appOrigin || '').trim().replace(/\/+$/, '');
}

function toDateFromUnix(value) {
    const seconds = Number(value || 0);
    return seconds > 0 ? new Date(seconds * 1000) : null;
}

function subscriptionPeriodEnd(subscription) {
    return subscription?.current_period_end
        || subscription?.items?.data?.[0]?.current_period_end
        || null;
}

function membershipRef(uid) {
    return admin.firestore().collection('memberships').doc(uid);
}

async function ensureStripeCustomer({ stripe, uid, email, displayName }) {
    const ref = membershipRef(uid);
    const snapshot = await ref.get();
    const existing = snapshot.data() || {};
    if (existing.stripeCustomerId) return existing.stripeCustomerId;

    let customer = null;
    if (email) {
        const matches = await stripe.customers.list({ email, limit: 1 });
        customer = matches.data?.[0] || null;
    }

    if (!customer) {
        customer = await stripe.customers.create({
            email: email || undefined,
            name: displayName || undefined,
            metadata: { firebaseUid: uid },
        });
    } else if (customer.metadata?.firebaseUid !== uid) {
        customer = await stripe.customers.update(customer.id, {
            metadata: { ...(customer.metadata || {}), firebaseUid: uid },
        });
    }

    await ref.set({
        uid,
        email: email || null,
        displayName: displayName || null,
        stripeCustomerId: customer.id,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: existing.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return customer.id;
}

async function handleCreateMembershipCheckout(request, dependencies = {}) {
    const uid = assertAuthenticated(request);
    const planKey = String(request.data?.planKey || '').trim().toLowerCase();
    const plan = getPlanDefinition(planKey);
    if (!plan) throw new HttpsError('invalid-argument', 'Choose a valid membership plan.');

    const priceMap = buildPriceMap(dependencies);
    const priceId = priceMap[planKey];
    if (!priceId || !priceId.startsWith('price_')) {
        throw new HttpsError('failed-precondition', `Stripe price for ${plan.name} is not configured.`);
    }

    const origin = normalizedOrigin(dependencies.appOrigin);
    if (!origin) throw new HttpsError('failed-precondition', 'APP_ORIGIN is not configured.');

    const stripe = stripeClient(dependencies.stripeSecretKey);
    const memberSnapshot = await membershipRef(uid).get();
    const member = memberSnapshot.data() || {};
    if (LIVE_MEMBERSHIP_STATUSES.has(member.status)) {
        throw new HttpsError('already-exists', 'You already have an active membership. Use Manage billing instead.');
    }

    const email = request.auth.token?.email || member.email || '';
    const displayName = request.auth.token?.name || member.displayName || '';
    const customerId = await ensureStripeCustomer({ stripe, uid, email, displayName });

    const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        client_reference_id: uid,
        line_items: [{ price: priceId, quantity: 1 }],
        allow_promotion_codes: true,
        success_url: `${origin}/member?membership=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/membership?membership=canceled`,
        metadata: { firebaseUid: uid, planKey },
        subscription_data: { metadata: { firebaseUid: uid, planKey } },
    });

    await membershipRef(uid).set({
        uid,
        email: email || null,
        displayName: displayName || null,
        requestedPlanKey: planKey,
        checkoutSessionId: session.id,
        stripeCustomerId: customerId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return { url: session.url };
}

async function handleCreateBillingPortal(request, dependencies = {}) {
    const uid = assertAuthenticated(request);
    const origin = normalizedOrigin(dependencies.appOrigin);
    const snapshot = await membershipRef(uid).get();
    const membership = snapshot.data() || {};
    if (!membership.stripeCustomerId) {
        throw new HttpsError('failed-precondition', 'No Stripe customer is connected to this account yet.');
    }

    const stripe = stripeClient(dependencies.stripeSecretKey);
    const session = await stripe.billingPortal.sessions.create({
        customer: membership.stripeCustomerId,
        return_url: `${origin}/member`,
    });
    return { url: session.url };
}

async function findUidForStripeObject(object) {
    const metadataUid = object?.metadata?.firebaseUid || object?.client_reference_id;
    if (metadataUid) return metadataUid;

    const customerId = typeof object?.customer === 'string' ? object.customer : object?.customer?.id;
    if (!customerId) return null;
    const query = await admin.firestore().collection('memberships')
        .where('stripeCustomerId', '==', customerId)
        .limit(1)
        .get();
    return query.empty ? null : query.docs[0].id;
}

async function safeMembershipEmail(payload) {
    try {
        await sendMembershipLifecycleEmail(payload);
    } catch (error) {
        logger.error('Membership state was synced, but the lifecycle email failed.', {
            type: payload.type,
            to: payload.to,
            error: error?.message,
        });
    }
}

async function syncSubscription({ stripe, subscription, eventType, priceMap }) {
    const uid = await findUidForStripeObject(subscription);
    if (!uid) {
        logger.warn('Could not map Stripe subscription to a Firebase user.', { subscriptionId: subscription?.id, eventType });
        return null;
    }

    const ref = membershipRef(uid);
    const beforeSnapshot = await ref.get();
    const before = beforeSnapshot.data() || {};
    const primaryPriceId = subscription?.items?.data?.[0]?.price?.id || '';
    const plan = getPlanDefinition(subscription?.metadata?.planKey) || getPlanForPriceId(primaryPriceId, priceMap);
    const status = String(subscription?.status || 'inactive');
    const isLive = LIVE_MEMBERSHIP_STATUSES.has(status);
    const periodEndUnix = subscriptionPeriodEnd(subscription);
    const periodEnd = toDateFromUnix(periodEndUnix);
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;

    let customer = null;
    if (customerId) {
        try { customer = await stripe.customers.retrieve(customerId); } catch (error) { logger.warn('Unable to retrieve Stripe customer.', error); }
    }

    const email = customer && !customer.deleted ? customer.email : before.email;
    const displayName = customer && !customer.deleted ? customer.name : before.displayName;

    const benefits = plan?.benefits || {};
    const discounts = plan?.discounts || {};
    const next = {
        uid,
        planKey: plan?.key || before.planKey || null,
        planName: plan?.name || before.planName || 'Membership',
        status,
        active: isLive,
        wolfGuideAccess: Boolean(isLive && (benefits.wolfGuideAccess ?? plan?.wolfGuide)),
        benefits: {
            progressionAccess: Boolean(isLive && benefits.progressionAccess),
            curriculumAccess: Boolean(isLive && benefits.curriculumAccess),
            instructorReviews: Boolean(isLive && benefits.instructorReviews),
            wolfGuideAccess: Boolean(isLive && (benefits.wolfGuideAccess ?? plan?.wolfGuide)),
        },
        discounts: {
            eventPercent: isLive ? Number(discounts.eventPercent || 0) : 0,
            privateTrainingPercent: isLive ? Number(discounts.privateTrainingPercent || 0) : 0,
        },
        eventDiscountPercent: isLive ? Number(discounts.eventPercent || 0) : 0,
        privateTrainingDiscountPercent: isLive ? Number(discounts.privateTrainingPercent || 0) : 0,
        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
        currentPeriodEnd: periodEnd ? admin.firestore.Timestamp.fromDate(periodEnd) : null,
        stripeCustomerId: customerId || before.stripeCustomerId || null,
        stripeSubscriptionId: subscription.id,
        email: email || null,
        displayName: displayName || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await ref.set(next, { merge: true });
    await admin.firestore().collection('users').doc(uid).set({
        membership: {
            planKey: next.planKey,
            status,
            active: isLive,
            wolfGuideAccess: next.wolfGuideAccess,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
    }, { merge: true });

    const emailContext = {
        to: email,
        displayName,
        planName: next.planName,
        periodEnd,
    };

    if (!LIVE_MEMBERSHIP_STATUSES.has(before.status) && isLive) {
        await safeMembershipEmail({ type: 'activated', ...emailContext });
    } else if (!before.cancelAtPeriodEnd && next.cancelAtPeriodEnd && isLive) {
        await safeMembershipEmail({ type: 'cancellationScheduled', ...emailContext });
    } else if (before.status !== 'canceled' && status === 'canceled') {
        await safeMembershipEmail({ type: 'canceled', ...emailContext });
    }

    return next;
}

async function claimStripeEvent(event) {
    const ref = admin.firestore().collection('stripeEvents').doc(event.id);
    return admin.firestore().runTransaction(async (transaction) => {
        const snap = await transaction.get(ref);
        const data = snap.data() || {};
        if (data.status === 'processed') return false;
        if (data.status === 'processing' && data.claimedAt?.toMillis?.() > Date.now() - 10 * 60 * 1000) return false;
        transaction.set(ref, {
            type: event.type,
            status: 'processing',
            claimedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        return true;
    });
}

async function markStripeEvent(event, status, error = null) {
    await admin.firestore().collection('stripeEvents').doc(event.id).set({
        type: event.type,
        status,
        processedAt: status === 'processed' ? admin.firestore.FieldValue.serverTimestamp() : null,
        failedAt: status === 'failed' ? admin.firestore.FieldValue.serverTimestamp() : null,
        lastError: error ? String(error.message || error).slice(0, 800) : admin.firestore.FieldValue.delete(),
    }, { merge: true });
}

async function handleStripeWebhook(req, res, dependencies = {}) {
    configureEmail(dependencies);
    const stripe = stripeClient(dependencies.stripeSecretKey);
    const signature = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.rawBody, signature, dependencies.stripeWebhookSecret.value());
    } catch (error) {
        logger.warn('Stripe webhook signature verification failed.', error);
        res.status(400).send(`Webhook Error: ${error.message}`);
        return;
    }

    const claimed = await claimStripeEvent(event);
    if (!claimed) {
        res.status(200).json({ received: true, duplicate: true });
        return;
    }

    const priceMap = buildPriceMap(dependencies);
    try {
        switch (event.type) {
            case 'checkout.session.completed':
            case 'checkout.session.async_payment_succeeded':
            case 'checkout.session.async_payment_failed':
            case 'checkout.session.expired': {
                const session = event.data.object;
                const { handleOneTimeCheckoutEvent } = require('../commerce/commerceFoundation');
                const handledOneTimePurchase = await handleOneTimeCheckoutEvent({
                    eventType: event.type,
                    session,
                });

                if (!handledOneTimePurchase && event.type === 'checkout.session.completed') {
                    const uid = await findUidForStripeObject(session);
                    if (uid) {
                        await membershipRef(uid).set({
                            stripeCustomerId: session.customer || null,
                            stripeSubscriptionId: session.subscription || null,
                            checkoutCompletedAt: admin.firestore.FieldValue.serverTimestamp(),
                            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        }, { merge: true });
                    }
                    if (session.subscription) {
                        const subscription = await stripe.subscriptions.retrieve(session.subscription);
                        await syncSubscription({ stripe, subscription, eventType: event.type, priceMap });
                    }
                }
                break;
            }
            case 'customer.subscription.created':
            case 'customer.subscription.updated':
            case 'customer.subscription.deleted':
                await syncSubscription({ stripe, subscription: event.data.object, eventType: event.type, priceMap });
                break;
            case 'invoice.paid': {
                const invoice = event.data.object;
                const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
                if (subscriptionId) {
                    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
                    await syncSubscription({ stripe, subscription, eventType: event.type, priceMap });
                }
                break;
            }
            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                const uid = await findUidForStripeObject(invoice);
                if (uid) {
                    const ref = membershipRef(uid);
                    const snap = await ref.get();
                    const member = snap.data() || {};
                    await ref.set({ status: 'past_due', active: false, wolfGuideAccess: false, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
                    await safeMembershipEmail({
                        type: 'paymentFailed',
                        to: member.email || invoice.customer_email,
                        displayName: member.displayName,
                        planName: member.planName,
                    });
                }
                break;
            }
            default:
                logger.info('Ignoring unneeded Stripe event.', { type: event.type });
        }

        await markStripeEvent(event, 'processed');
        res.status(200).json({ received: true });
    } catch (error) {
        logger.error('Stripe webhook processing failed.', { eventId: event.id, type: event.type, error });
        await markStripeEvent(event, 'failed', error);
        res.status(500).json({ received: false });
    }
}

module.exports = {
    handleCreateMembershipCheckout,
    handleCreateBillingPortal,
    handleStripeWebhook,
};
