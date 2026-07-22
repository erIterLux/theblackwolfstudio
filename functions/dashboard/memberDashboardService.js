const admin = require('firebase-admin');
const { HttpsError } = require('firebase-functions/v2/https');

const db = admin.firestore();
const LIVE_MEMBERSHIP_STATUSES = new Set(['active', 'trialing']);
const INSTRUCTOR_ROLES = new Set(['instructor', 'admin']);
const ACTIVE_BOOKING_STATUSES = new Set(['requested', 'confirmed', 'rescheduled']);

function requireAuthenticated(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to continue.');
  return uid;
}

function serialize(value) {
  if (value === null || value === undefined) return value;
  if (value?.toDate) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serialize(item)]),
    );
  }
  return value;
}

function millis(value) {
  if (value?.toMillis) return value.toMillis();
  const parsed = value ? new Date(value).valueOf() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanRole(value) {
  const role = String(value || 'member').trim().toLowerCase();
  return INSTRUCTOR_ROLES.has(role) ? role : 'member';
}

async function roleFor(request, uid) {
  const tokenRole = request.auth?.token?.admin === true
    ? 'admin'
    : cleanRole(request.auth?.token?.role);
  if (INSTRUCTOR_ROLES.has(tokenRole)) return tokenRole;
  const snapshot = await db.collection('users').doc(uid).get();
  return cleanRole(snapshot.data()?.role);
}

function summarizePrivateTraining(purchaseDocs, bookingDocs) {
  const now = Date.now();
  const activePurchases = purchaseDocs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((item) => item.status === 'active' && (!item.expiresAt || millis(item.expiresAt) >= now));

  const availableSessions = activePurchases.reduce((total, item) => (
    total + Math.max(
      0,
      Number(item.remainingSessions || 0) - Number(item.reservedSessions || 0),
    )
  ), 0);
  const reservedSessions = activePurchases.reduce(
    (total, item) => total + Math.max(0, Number(item.reservedSessions || 0)),
    0,
  );
  const nearestExpiration = activePurchases
    .map((item) => item.expiresAt)
    .filter(Boolean)
    .sort((left, right) => millis(left) - millis(right))[0] || null;

  const nextBooking = bookingDocs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((item) => ACTIVE_BOOKING_STATUSES.has(item.status) && millis(item.endsAt) >= now)
    .sort((left, right) => millis(left.startsAt) - millis(right.startsAt))[0] || null;

  return serialize({
    activePurchaseCount: activePurchases.length,
    availableSessions,
    reservedSessions,
    nearestExpiration,
    nextBooking: nextBooking ? {
      id: nextBooking.id,
      status: nextBooking.status,
      startsAt: nextBooking.startsAt,
      endsAt: nextBooking.endsAt,
      timezone: nextBooking.timezone || 'America/New_York',
      participantCount: Number(nextBooking.participantCount || 0),
      instructorDisplayName: nextBooking.instructorDisplayName || null,
    } : null,
  });
}

function summarizeEvents(registrationDocs) {
  const now = Date.now();
  const upcoming = registrationDocs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((item) => (
      item.registrationStatus === 'confirmed'
      && millis(item.eventSnapshot?.endsAt || item.eventSnapshot?.startsAt) >= now
    ))
    .sort((left, right) => (
      millis(left.eventSnapshot?.startsAt) - millis(right.eventSnapshot?.startsAt)
    ));

  const next = upcoming[0] || null;
  return serialize({
    upcomingCount: upcoming.length,
    nextRegistration: next ? {
      id: next.id,
      registrationStatus: next.registrationStatus,
      participantCount: Number(next.participantCount || 0),
      waiverStatus: next.waiverStatus || null,
      waiversRequiredCount: Number(next.waiversRequiredCount || 0),
      waiversSignedCount: Number(next.waiversSignedCount || 0),
      eventSnapshot: next.eventSnapshot || null,
    } : null,
  });
}

function buildAttentionItems({ membership, privateTraining, events }) {
  const items = [];
  if (membership?.status === 'past_due') {
    items.push({
      key: 'membership-past-due',
      priority: 'important',
      title: 'Membership payment needs attention',
      actionPath: '/member/purchases',
    });
  }
  if (membership?.cancelAtPeriodEnd === true) {
    items.push({
      key: 'membership-ending',
      priority: 'normal',
      title: 'Membership is scheduled to end',
      actionPath: '/member/purchases',
    });
  }
  if (privateTraining?.nextBooking?.status === 'requested') {
    items.push({
      key: 'booking-requested',
      priority: 'normal',
      title: 'Private session is awaiting confirmation',
      actionPath: '/member/private-training',
    });
  }
  if (events?.nextRegistration?.waiverStatus === 'pending') {
    items.push({
      key: 'event-waiver-pending',
      priority: 'important',
      title: 'An upcoming event waiver still needs completion',
      actionPath: '/member/events',
    });
  }
  return items.slice(0, 5);
}

async function handleGetMemberDashboardSummary(request) {
  const uid = requireAuthenticated(request);
  const startedAt = Date.now();

  const [membershipSnapshot, role, purchaseSnapshot, bookingSnapshot, registrationSnapshot] = await Promise.all([
    db.collection('memberships').doc(uid).get(),
    roleFor(request, uid),
    db.collection('privateTrainingPurchases').where('uid', '==', uid).limit(100).get(),
    db.collection('privateTrainingBookings').where('uid', '==', uid).limit(100).get(),
    db.collection('eventRegistrations').where('uid', '==', uid).limit(100).get(),
  ]);

  const membership = membershipSnapshot.exists
    ? serialize({ id: membershipSnapshot.id, ...membershipSnapshot.data() })
    : null;
  const privateTraining = summarizePrivateTraining(purchaseSnapshot.docs, bookingSnapshot.docs);
  const events = summarizeEvents(registrationSnapshot.docs);
  const progressionAccess = INSTRUCTOR_ROLES.has(role)
    || LIVE_MEMBERSHIP_STATUSES.has(membership?.status);

  let progression = {
    data: null,
    accessAvailable: progressionAccess,
    error: '',
  };

  if (progressionAccess) {
    try {
      const { readProgressionSummary } = require('../progression/progressionService');
      progression = {
        data: await readProgressionSummary(uid, request.auth?.token || {}),
        accessAvailable: true,
        error: '',
      };
    } catch (error) {
      progression = {
        data: null,
        accessAvailable: true,
        error: 'Progression summary could not be loaded.',
      };
    }
  }

  return {
    membership,
    role,
    progression,
    privateTraining,
    events,
    purchases: {
      activeMembership: LIVE_MEMBERSHIP_STATUSES.has(membership?.status),
      remainingPrivateSessions: Number(privateTraining.availableSessions || 0),
      upcomingEvents: Number(events.upcomingCount || 0),
    },
    attentionItems: buildAttentionItems({ membership, privateTraining, events }),
    meta: {
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
    },
  };
}

module.exports = {
  handleGetMemberDashboardSummary,
};
