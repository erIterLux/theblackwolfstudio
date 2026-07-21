const crypto = require('crypto');
const admin = require('firebase-admin');
const { HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');

const db = admin.firestore();
const INSTRUCTOR_ROLES = new Set(['instructor', 'admin']);
const LIVE_MEMBERSHIP_STATUSES = new Set(['active', 'trialing']);

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
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

function stripeClient(secretParam) {
  const key = secretParam?.value();
  if (!key) throw new HttpsError('failed-precondition', 'Stripe is not configured.');
  return require('stripe')(key);
}

function callerRole(request) {
  if (request.auth?.token?.admin === true || request.auth?.token?.role === 'admin') {
    return 'admin';
  }
  if (request.auth?.token?.role === 'instructor') return 'instructor';
  return 'member';
}

function requireAuthenticated(request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in to view purchase history.');
  }
  return request.auth.uid;
}

function requireInstructor(request) {
  const uid = requireAuthenticated(request);
  if (!INSTRUCTOR_ROLES.has(callerRole(request))) {
    throw new HttpsError('permission-denied', 'Instructor access is required.');
  }
  return uid;
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

function safeOrder(value) {
  const result = { ...value };
  delete result.accessTokenHash;
  delete result.checkoutError;
  return serialize(result);
}

async function authorizeOrder(request, order) {
  if (request.auth?.uid && order.uid === request.auth.uid) return;
  if (INSTRUCTOR_ROLES.has(callerRole(request))) return;

  const suppliedHash = hashToken(request.data?.accessToken);
  if (!order.accessTokenHash || !safeEqual(order.accessTokenHash, suppliedHash)) {
    throw new HttpsError('permission-denied', 'You do not have access to this purchase.');
  }
}

function unixToTimestamp(value) {
  const seconds = Number(value || 0);
  return seconds > 0
    ? admin.firestore.Timestamp.fromMillis(seconds * 1000)
    : null;
}

function invoiceRecord(invoice, uid, membership = {}) {
  const subscriptionId = typeof invoice.subscription === 'string'
    ? invoice.subscription
    : invoice.subscription?.id || membership.stripeSubscriptionId || null;

  return {
    id: invoice.id,
    uid,
    type: 'membership_invoice',
    planKey: membership.planKey || null,
    planName: membership.planName || 'Membership',
    status: clean(invoice.status || 'unknown', 40),
    paid: invoice.paid === true || invoice.status === 'paid',
    amountDueCents: Number(invoice.amount_due || 0),
    amountPaidCents: Number(invoice.amount_paid || 0),
    amountRemainingCents: Number(invoice.amount_remaining || 0),
    currency: clean(invoice.currency || 'usd', 8).toLowerCase(),
    hostedInvoiceUrl: invoice.hosted_invoice_url || null,
    invoicePdfUrl: invoice.invoice_pdf || null,
    stripeInvoiceId: invoice.id,
    stripeCustomerId: typeof invoice.customer === 'string'
      ? invoice.customer
      : invoice.customer?.id || membership.stripeCustomerId || null,
    stripeSubscriptionId: subscriptionId,
    billingReason: invoice.billing_reason || null,
    periodStart: unixToTimestamp(invoice.period_start),
    periodEnd: unixToTimestamp(invoice.period_end),
    paidAt: unixToTimestamp(invoice.status_transitions?.paid_at),
    attemptedAt: unixToTimestamp(invoice.created),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

async function recordMembershipInvoice({ invoice, uid, membership = {} }) {
  if (!invoice?.id || !uid) return null;
  const record = invoiceRecord(invoice, uid, membership);
  await db.collection('membershipPayments').doc(invoice.id).set(record, { merge: true });
  return record;
}

function chargeFromPaymentIntent(paymentIntent) {
  if (!paymentIntent || typeof paymentIntent === 'string') return null;
  const latestCharge = paymentIntent.latest_charge;
  if (latestCharge && typeof latestCharge !== 'string') return latestCharge;
  return paymentIntent.charges?.data?.[0] || null;
}

function receiptRecord({ session, paymentIntent, charge }) {
  const paymentMethod = charge?.payment_method_details?.card || {};
  return {
    stripeCheckoutSessionId: session?.id || null,
    stripePaymentIntentId: typeof paymentIntent === 'string'
      ? paymentIntent
      : paymentIntent?.id || null,
    stripeChargeId: charge?.id || null,
    receiptUrl: charge?.receipt_url || null,
    receiptNumber: charge?.receipt_number || null,
    paymentMethod: charge?.payment_method_details?.type || null,
    paymentCardBrand: paymentMethod.brand || null,
    paymentCardLast4: paymentMethod.last4 || null,
    paymentCapturedAt: unixToTimestamp(charge?.created || session?.created),
    receiptUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

async function retrieveReceiptDetails(stripe, sessionId, paymentIntentId = null) {
  if (!sessionId && !paymentIntentId) return null;

  let session = null;
  let paymentIntent = null;

  if (sessionId) {
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent.latest_charge'],
    });
    paymentIntent = session.payment_intent || null;
  }

  if ((!paymentIntent || typeof paymentIntent === 'string') && paymentIntentId) {
    paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge'],
    });
  } else if (typeof paymentIntent === 'string') {
    paymentIntent = await stripe.paymentIntents.retrieve(paymentIntent, {
      expand: ['latest_charge'],
    });
  }

  const charge = chargeFromPaymentIntent(paymentIntent);
  return receiptRecord({ session, paymentIntent, charge });
}

async function syncOneTimeReceipt({ stripe, session, orderRef, order }) {
  if (!stripe || !session?.id || !orderRef) return null;
  try {
    const details = await retrieveReceiptDetails(
      stripe,
      session.id,
      typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id,
    );
    if (details) {
      await orderRef.set(details, { merge: true });
      return details;
    }
  } catch (error) {
    logger.warn('Order was fulfilled, but its Stripe receipt could not be synchronized.', {
      orderId: order?.id || orderRef.id,
      sessionId: session?.id,
      error: error?.message,
    });
  }
  return null;
}

async function syncMembershipInvoices({ stripe, uid, membership }) {
  if (!stripe || !membership?.stripeCustomerId) return [];

  const result = await stripe.invoices.list({
    customer: membership.stripeCustomerId,
    limit: 36,
  });

  const records = [];
  for (const invoice of result.data || []) {
    const record = invoiceRecord(invoice, uid, membership);
    records.push(record);
    await db.collection('membershipPayments').doc(invoice.id).set(record, { merge: true });
  }
  return records;
}

async function listStoredMembershipPayments(uid) {
  const snapshot = await db.collection('membershipPayments')
    .where('uid', '==', uid)
    .limit(100)
    .get();

  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((left, right) => {
      const a = left.attemptedAt?.toMillis?.() || left.paidAt?.toMillis?.() || 0;
      const b = right.attemptedAt?.toMillis?.() || right.paidAt?.toMillis?.() || 0;
      return b - a;
    });
}

async function listOrdersForUid(uid) {
  const snapshot = await db.collection('studioOrders')
    .where('uid', '==', uid)
    .limit(200)
    .get();

  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((left, right) => {
      const a = left.createdAt?.toMillis?.() || 0;
      const b = right.createdAt?.toMillis?.() || 0;
      return b - a;
    });
}

async function purchaseSummary(uid, orders) {
  const [privateSnapshot, eventSnapshot] = await Promise.all([
    db.collection('privateTrainingPurchases').where('uid', '==', uid).limit(100).get(),
    db.collection('eventRegistrations').where('uid', '==', uid).limit(100).get(),
  ]);

  const remainingPrivateSessions = privateSnapshot.docs.reduce(
    (sum, doc) => sum + Math.max(0, Number(doc.data()?.remainingSessions || 0)),
    0,
  );

  const now = Date.now();
  const upcomingEvents = eventSnapshot.docs.filter((doc) => {
    const value = doc.data() || {};
    const startsAt = value.eventSnapshot?.startsAt?.toMillis?.() || 0;
    return value.registrationStatus === 'confirmed' && startsAt >= now;
  }).length;

  return {
    oneTimePurchaseCount: orders.length,
    paidOneTimePurchaseCount: orders.filter((order) => order.paymentStatus === 'paid').length,
    remainingPrivateSessions,
    upcomingEvents,
  };
}

async function handleListMyPurchaseHistory(request, dependencies = {}) {
  const uid = requireAuthenticated(request);
  const membershipSnapshot = await db.collection('memberships').doc(uid).get();
  const membership = membershipSnapshot.exists
    ? { id: membershipSnapshot.id, ...membershipSnapshot.data() }
    : null;

  const stripe = membership?.stripeCustomerId
    ? stripeClient(dependencies.stripeSecretKey)
    : null;

  if (stripe) {
    try {
      await syncMembershipInvoices({ stripe, uid, membership });
    } catch (error) {
      logger.warn('Membership invoices could not be refreshed from Stripe.', {
        uid,
        error: error?.message,
      });
    }
  }

  const [payments, orders] = await Promise.all([
    listStoredMembershipPayments(uid),
    listOrdersForUid(uid),
  ]);
  const summary = await purchaseSummary(uid, orders);

  return {
    membership: membership ? serialize(membership) : null,
    membershipPayments: payments.map(serialize),
    orders: orders.map(safeOrder),
    summary: {
      ...summary,
      activeMembership: Boolean(
        membership && LIVE_MEMBERSHIP_STATUSES.has(membership.status),
      ),
    },
  };
}

async function handleGetPurchaseReceipt(request, dependencies = {}) {
  const orderId = clean(request.data?.orderId, 160);
  if (!orderId) throw new HttpsError('invalid-argument', 'Purchase number is required.');

  const orderRef = db.collection('studioOrders').doc(orderId);
  const snapshot = await orderRef.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'That purchase was not found.');

  const order = { id: snapshot.id, ...snapshot.data() };
  await authorizeOrder(request, order);

  if (order.paymentStatus !== 'paid') {
    throw new HttpsError('failed-precondition', 'A receipt is available after payment is complete.');
  }
  if (Number(order.pricing?.totalCents || 0) === 0) {
    return { receipt: null, freePurchase: true };
  }
  if (order.receiptUrl) {
    return {
      receipt: serialize({
        url: order.receiptUrl,
        number: order.receiptNumber || null,
        cardBrand: order.paymentCardBrand || null,
        cardLast4: order.paymentCardLast4 || null,
      }),
    };
  }

  const stripe = stripeClient(dependencies.stripeSecretKey);
  const details = await retrieveReceiptDetails(
    stripe,
    order.stripeCheckoutSessionId,
    order.stripePaymentIntentId,
  );

  if (!details?.receiptUrl) {
    throw new HttpsError('not-found', 'Stripe has not made a receipt available for this payment yet.');
  }

  await orderRef.set(details, { merge: true });
  return {
    receipt: serialize({
      url: details.receiptUrl,
      number: details.receiptNumber || null,
      cardBrand: details.paymentCardBrand || null,
      cardLast4: details.paymentCardLast4 || null,
    }),
  };
}

async function handleListCommerceOrdersAdmin(request) {
  requireInstructor(request);

  const [ordersSnapshot, paymentsSnapshot, membershipsSnapshot] = await Promise.all([
    db.collection('studioOrders').limit(500).get(),
    db.collection('membershipPayments').limit(500).get(),
    db.collection('memberships').limit(500).get(),
  ]);

  const orders = ordersSnapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((left, right) => (right.createdAt?.toMillis?.() || 0) - (left.createdAt?.toMillis?.() || 0))
    .map(safeOrder);

  const membershipPayments = paymentsSnapshot.docs
    .map((doc) => serialize({ id: doc.id, ...doc.data() }))
    .sort((left, right) => String(right.attemptedAt || '').localeCompare(String(left.attemptedAt || '')));

  const memberships = membershipsSnapshot.docs.map((doc) => serialize({
    id: doc.id,
    uid: doc.id,
    planKey: doc.data()?.planKey || null,
    planName: doc.data()?.planName || null,
    status: doc.data()?.status || 'inactive',
    email: doc.data()?.email || null,
    displayName: doc.data()?.displayName || null,
    currentPeriodEnd: doc.data()?.currentPeriodEnd || null,
    cancelAtPeriodEnd: Boolean(doc.data()?.cancelAtPeriodEnd),
  }));

  return { orders, membershipPayments, memberships };
}

module.exports = {
  handleListMyPurchaseHistory,
  handleGetPurchaseReceipt,
  handleListCommerceOrdersAdmin,
  recordMembershipInvoice,
  syncOneTimeReceipt,
};
