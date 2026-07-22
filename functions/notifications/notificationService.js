const admin = require('firebase-admin');
const { logger } = require('firebase-functions');
const { HttpsError } = require('firebase-functions/v2/https');

const db = admin.firestore();
const INSTRUCTOR_ROLES = new Set(['instructor', 'admin']);
const LIVE_MEMBERSHIP_STATUSES = new Set(['active', 'trialing']);
const OPTIONAL_PREFERENCES = Object.freeze({
    announcements: true,
    bookingReminders: true,
    eventReminders: true,
    progression: true,
    creditExpiration: true,
});
const CATEGORY_LABELS = Object.freeze({
    announcements: 'Studio announcement',
    bookings: 'Private training',
    events: 'Events',
    progression: 'Progression',
    payments: 'Payments',
    reminders: 'Reminder',
});

function clean(value, max = 500) {
    return String(value ?? '').trim().slice(0, max);
}

function safeId(value, max = 220) {
    return clean(value, max).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function callerRole(request) {
    return clean(request.auth?.token?.role || 'member', 40).toLowerCase();
}

function requireAuthenticated(request) {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to continue.');
    return request.auth.uid;
}

async function requireInstructor(request) {
    const uid = requireAuthenticated(request);
    if (INSTRUCTOR_ROLES.has(callerRole(request)) || request.auth?.token?.admin === true) return uid;
    const userSnapshot = await db.collection('users').doc(uid).get();
    const role = clean(userSnapshot.data()?.role || 'member', 40).toLowerCase();
    if (!INSTRUCTOR_ROLES.has(role)) {
        throw new HttpsError('permission-denied', 'Instructor access is required.');
    }
    return uid;
}

function timestampToIso(value) {
    if (value?.toDate) return value.toDate().toISOString();
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.valueOf()) ? date.toISOString() : null;
}

function serialize(value) {
    if (value === null || value === undefined) return value;
    if (value?.toDate) return value.toDate().toISOString();
    if (Array.isArray(value)) return value.map(serialize);
    if (typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
    }
    return value;
}

function defaultPreferences() {
    return {
        optional: { ...OPTIONAL_PREFERENCES },
        updatedAt: null,
    };
}

function mergePreferences(data = {}) {
    return {
        optional: {
            ...OPTIONAL_PREFERENCES,
            ...(data.optional || {}),
        },
        updatedAt: timestampToIso(data.updatedAt),
    };
}

async function preferenceEnabled(uid, key) {
    if (!key || !Object.prototype.hasOwnProperty.call(OPTIONAL_PREFERENCES, key)) return true;
    const snapshot = await db.collection('notificationPreferences').doc(uid).get();
    return snapshot.data()?.optional?.[key] !== false;
}

function notificationRef(uid, notificationId) {
    return db.collection('users').doc(uid).collection('notifications').doc(safeId(notificationId));
}

async function createNotification({
    uid,
    notificationId,
    category,
    title,
    message,
    actionLabel = 'View details',
    actionPath = '/member',
    priority = 'normal',
    preferenceKey = '',
    sourceType = '',
    sourceId = '',
    metadata = {},
}) {
    if (!uid || !notificationId || !title) return false;
    if (preferenceKey && priority !== 'urgent' && !(await preferenceEnabled(uid, preferenceKey))) return false;

    const ref = notificationRef(uid, notificationId);
    return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (snapshot.exists) return false;
        transaction.set(ref, {
            id: ref.id,
            recipientUid: uid,
            category: clean(category || 'announcements', 40),
            categoryLabel: CATEGORY_LABELS[category] || 'Notification',
            title: clean(title, 180),
            message: clean(message, 1000),
            actionLabel: clean(actionLabel, 80) || 'View details',
            actionPath: clean(actionPath, 500) || '/member',
            priority: ['normal', 'important', 'urgent'].includes(priority) ? priority : 'normal',
            status: 'unread',
            sourceType: clean(sourceType, 80) || null,
            sourceId: clean(sourceId, 220) || null,
            metadata,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            readAt: null,
        });
        return true;
    });
}

async function listRoleUsers(audience = 'all') {
    const snapshot = await db.collection('users').limit(2000).get();
    return snapshot.docs
        .map((item) => ({ uid: item.id, role: clean(item.data()?.role || 'member', 40).toLowerCase() }))
        .filter((item) => {
            if (audience === 'instructors') return INSTRUCTOR_ROLES.has(item.role);
            if (audience === 'members') return !INSTRUCTOR_ROLES.has(item.role);
            return true;
        });
}

async function notifyInstructors(payload, idPrefix) {
    const instructors = await listRoleUsers('instructors');
    const results = await Promise.all(instructors.map((item) => createNotification({
        uid: item.uid,
        notificationId: `${idPrefix}_${item.uid}`,
        ...payload,
    })));
    return results.filter(Boolean).length;
}

async function handleGetMyNotificationUnreadCount(request) {
    const uid = requireAuthenticated(request);
    const countSnapshot = await db.collection('users').doc(uid).collection('notifications')
        .where('status', '==', 'unread')
        .count()
        .get();
    return { unreadCount: Number(countSnapshot.data().count || 0) };
}

function parseNotificationCursor(value) {
    if (!value) return null;
    const id = safeId(value.id);
    const date = value.createdAt ? new Date(value.createdAt) : null;
    if (!id || !date || Number.isNaN(date.valueOf())) {
        throw new HttpsError('invalid-argument', 'The notification page cursor is invalid.');
    }
    return {
        id,
        createdAt: admin.firestore.Timestamp.fromDate(date),
    };
}

async function handleListMyNotifications(request) {
    const uid = requireAuthenticated(request);
    const pageSize = Math.min(50, Math.max(10, Number(request.data?.pageSize || request.data?.limit || 25)));
    const cursor = parseNotificationCursor(request.data?.cursor);

    let query = db.collection('users').doc(uid).collection('notifications')
        .orderBy('createdAt', 'desc')
        .orderBy(admin.firestore.FieldPath.documentId(), 'desc');

    if (cursor) query = query.startAfter(cursor.createdAt, cursor.id);

    const snapshot = await query.limit(pageSize + 1).get();
    const hasMore = snapshot.size > pageSize;
    const pageDocs = snapshot.docs.slice(0, pageSize);
    const notifications = pageDocs.map((item) => serialize({ id: item.id, ...item.data() }));
    const last = pageDocs[pageDocs.length - 1];

    return {
        notifications,
        hasMore,
        nextCursor: hasMore && last ? {
            id: last.id,
            createdAt: timestampToIso(last.data()?.createdAt),
        } : null,
    };
}

async function handleMarkNotificationRead(request) {
    const uid = requireAuthenticated(request);
    const notificationId = safeId(request.data?.notificationId);
    if (!notificationId) throw new HttpsError('invalid-argument', 'Choose a notification.');
    const ref = notificationRef(uid, notificationId);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw new HttpsError('not-found', 'That notification was not found.');
    const read = request.data?.read !== false;
    const previousStatus = snapshot.data()?.status || 'unread';
    const status = read ? 'read' : 'unread';
    await ref.set({
        status,
        readAt: read ? admin.firestore.FieldValue.serverTimestamp() : null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return {
        success: true,
        status,
        previousStatus,
        changed: previousStatus !== status,
    };
}

async function handleMarkAllNotificationsRead(request) {
    const uid = requireAuthenticated(request);
    let updated = 0;
    for (let page = 0; page < 5; page += 1) {
        const snapshot = await db.collection('users').doc(uid).collection('notifications')
            .where('status', '==', 'unread')
            .limit(400)
            .get();
        if (snapshot.empty) break;
        const batch = db.batch();
        snapshot.docs.forEach((item) => {
            batch.set(item.ref, {
                status: 'read',
                readAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        });
        await batch.commit();
        updated += snapshot.size;
        if (snapshot.size < 400) break;
    }
    return { success: true, updated };
}

async function handleGetMyNotificationPreferences(request) {
    const uid = requireAuthenticated(request);
    const snapshot = await db.collection('notificationPreferences').doc(uid).get();
    return { preferences: snapshot.exists ? mergePreferences(snapshot.data()) : defaultPreferences() };
}

async function handleSaveMyNotificationPreferences(request) {
    const uid = requireAuthenticated(request);
    const optional = {};
    Object.keys(OPTIONAL_PREFERENCES).forEach((key) => {
        optional[key] = request.data?.optional?.[key] !== false;
    });
    await db.collection('notificationPreferences').doc(uid).set({
        uid,
        optional,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { success: true, preferences: { optional } };
}

async function deliverAnnouncement(announcement) {
    const users = await listRoleUsers(announcement.audience || 'all');
    const preferencesSnapshot = await db.collection('notificationPreferences').limit(2000).get();
    const preferences = new Map(preferencesSnapshot.docs.map((item) => [item.id, item.data()]));
    const writer = db.bulkWriter();
    let delivered = 0;
    let skipped = 0;
    writer.onWriteError((error) => error.failedAttempts < 2);

    for (const user of users) {
        if (preferences.get(user.uid)?.optional?.announcements === false && announcement.priority !== 'urgent') {
            skipped += 1;
            continue;
        }
        const ref = notificationRef(user.uid, `announcement_${announcement.id}_v${announcement.version}`);
        writer.create(ref, {
            id: ref.id,
            recipientUid: user.uid,
            category: 'announcements',
            categoryLabel: CATEGORY_LABELS.announcements,
            title: announcement.title,
            message: announcement.message,
            actionLabel: announcement.actionLabel || 'Open member home',
            actionPath: announcement.actionPath || '/member',
            priority: announcement.priority || 'normal',
            status: 'unread',
            sourceType: 'studio_announcement',
            sourceId: announcement.id,
            metadata: { audience: announcement.audience, version: announcement.version },
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            readAt: null,
        }).then(() => { delivered += 1; }).catch((error) => {
            if (error.code === 6 || error.code === 'already-exists') return;
            logger.error('Announcement notification delivery failed.', {
                announcementId: announcement.id,
                uid: user.uid,
                error: error?.message,
            });
        });
    }
    await writer.close();
    return { delivered, skipped, eligible: users.length };
}

async function handleListStudioAnnouncementsAdmin(request) {
    await requireInstructor(request);
    const snapshot = await db.collection('studioAnnouncements')
        .orderBy('updatedAt', 'desc')
        .limit(100)
        .get();
    return { announcements: snapshot.docs.map((item) => serialize({ id: item.id, ...item.data() })) };
}

async function handleSaveStudioAnnouncement(request) {
    const actorUid = await requireInstructor(request);
    const announcementId = safeId(request.data?.announcementId) || db.collection('studioAnnouncements').doc().id;
    const ref = db.collection('studioAnnouncements').doc(announcementId);
    const snapshot = await ref.get();
    const before = snapshot.data() || {};
    const status = ['draft', 'published', 'archived'].includes(request.data?.status)
        ? request.data.status
        : 'draft';
    const title = clean(request.data?.title, 180);
    const message = clean(request.data?.message, 1600);
    if (!title || !message) throw new HttpsError('invalid-argument', 'Add an announcement title and message.');
    const audience = ['all', 'members', 'instructors'].includes(request.data?.audience)
        ? request.data.audience
        : 'all';
    const priority = ['normal', 'important', 'urgent'].includes(request.data?.priority)
        ? request.data.priority
        : 'normal';
    const contentChanged = before.title !== title
        || before.message !== message
        || before.audience !== audience
        || before.priority !== priority
        || before.actionPath !== clean(request.data?.actionPath, 500)
        || before.actionLabel !== clean(request.data?.actionLabel, 80);
    const shouldDeliver = status === 'published'
        && (before.status !== 'published' || contentChanged || request.data?.republish === true);
    const version = shouldDeliver ? Number(before.version || 0) + 1 : Number(before.version || 0);

    const announcement = {
        id: announcementId,
        title,
        message,
        audience,
        priority,
        actionLabel: clean(request.data?.actionLabel, 80) || 'Open member home',
        actionPath: clean(request.data?.actionPath, 500) || '/member',
        status,
        version,
        createdBy: before.createdBy || actorUid,
        updatedBy: actorUid,
        createdAt: before.createdAt || admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        publishedAt: shouldDeliver ? admin.firestore.FieldValue.serverTimestamp() : before.publishedAt || null,
    };
    await ref.set(announcement, { merge: true });

    let delivery = null;
    if (shouldDeliver) {
        delivery = await deliverAnnouncement({ ...announcement, createdAt: null, updatedAt: null, publishedAt: null });
        await ref.set({
            delivery,
            deliveredAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    }
    return { success: true, announcementId, status, version, delivery };
}

function bookingStatusMessage(status) {
    const map = {
        requested: ['Private-training request sent', 'Your requested session is waiting for instructor confirmation.'],
        confirmed: ['Private-training session confirmed', 'Your private-training session is confirmed.'],
        rescheduled: ['Private-training session rescheduled', 'Your private-training session time was updated.'],
        canceled: ['Private-training session canceled', 'Your session was canceled and the credit was restored.'],
        late_canceled: ['Private-training session canceled late', 'Your session was canceled inside the saved cancellation window.'],
        completed: ['Private-training session completed', 'Your session was marked complete.'],
        no_show: ['Private-training session marked missed', 'Your session was marked as a no-show.'],
    };
    return map[status] || ['Private-training booking updated', 'Your booking details were updated.'];
}

function dateChanged(before, after) {
    const beforeDate = before?.startsAt?.toMillis?.() || new Date(before?.startsAt || 0).getTime();
    const afterDate = after?.startsAt?.toMillis?.() || new Date(after?.startsAt || 0).getTime();
    return beforeDate !== afterDate;
}

async function handlePrivateTrainingBookingWritten(event) {
    const before = event.data?.before?.data() || null;
    const after = event.data?.after?.data() || null;
    if (!after) return;
    let status = '';
    if (!before) status = after.status || 'requested';
    else if (before.status !== after.status) status = after.status;
    else if (dateChanged(before, after)) status = 'rescheduled';
    if (!status) return;

    const [title, message] = bookingStatusMessage(status);
    const baseId = `booking_${event.params.bookingId}_${safeId(event.id)}`;
    const tasks = [];
    if (after.uid) {
        tasks.push(createNotification({
            uid: after.uid,
            notificationId: `${baseId}_member`,
            category: 'bookings',
            title,
            message,
            actionLabel: 'View private training',
            actionPath: '/member/private-training',
            priority: ['canceled', 'late_canceled', 'no_show'].includes(status) ? 'important' : 'normal',
            sourceType: 'private_training_booking',
            sourceId: event.params.bookingId,
            metadata: { status, startsAt: timestampToIso(after.startsAt) },
        }));
    }
    if (after.instructorUid) {
        tasks.push(createNotification({
            uid: after.instructorUid,
            notificationId: `${baseId}_instructor`,
            category: 'bookings',
            title: status === 'requested' ? 'New private-training request' : 'Private-training booking updated',
            message: `${after.purchaser?.displayName || after.purchaser?.email || 'A member'}: ${title}.`,
            actionLabel: 'Open booking calendar',
            actionPath: '/instructor/private-training/calendar',
            priority: status === 'requested' ? 'important' : 'normal',
            sourceType: 'private_training_booking',
            sourceId: event.params.bookingId,
            metadata: { status, startsAt: timestampToIso(after.startsAt) },
        }));
    }
    await Promise.all(tasks);
}

async function handleMembershipWritten(event) {
    const before = event.data?.before?.data() || {};
    const after = event.data?.after?.data() || null;
    if (!after) return;
    const uid = event.params.userId;
    let title = '';
    let message = '';
    let priority = 'normal';
    const wasLive = LIVE_MEMBERSHIP_STATUSES.has(before.status);
    const isLive = LIVE_MEMBERSHIP_STATUSES.has(after.status);
    if (!wasLive && isLive) {
        title = 'Membership active';
        message = `${after.planName || 'Your membership'} is active.`;
    } else if (!before.cancelAtPeriodEnd && after.cancelAtPeriodEnd && isLive) {
        title = 'Membership cancellation scheduled';
        message = 'Your membership will end after the current billing period.';
        priority = 'important';
    } else if (before.status !== after.status && ['past_due', 'unpaid', 'incomplete_expired'].includes(after.status)) {
        title = 'Membership payment needs attention';
        message = 'Your membership payment could not be completed. Review billing details to prevent interrupted access.';
        priority = 'urgent';
    } else if (before.status !== 'canceled' && after.status === 'canceled') {
        title = 'Membership canceled';
        message = 'Your membership is no longer active.';
        priority = 'important';
    }
    if (!title) return;
    await createNotification({
        uid,
        notificationId: `membership_${safeId(event.id)}`,
        category: 'payments',
        title,
        message,
        actionLabel: 'View membership and billing',
        actionPath: '/member/purchases',
        priority,
        sourceType: 'membership',
        sourceId: uid,
        metadata: { status: after.status, planName: after.planName || null },
    });
}

async function handleStudioOrderWritten(event) {
    const before = event.data?.before?.data() || {};
    const after = event.data?.after?.data() || null;
    if (!after?.uid || before.paymentStatus === after.paymentStatus) return;
    let title = '';
    let message = '';
    let priority = 'normal';
    if (after.paymentStatus === 'paid') {
        title = 'Payment complete';
        message = `${after.offerName || 'Your purchase'} is confirmed and available in purchase history.`;
    } else if (after.paymentStatus === 'refunded') {
        title = 'Refund recorded';
        message = `A refund was recorded for ${after.offerName || 'your purchase'}.`;
        priority = 'important';
    } else if (['failed', 'payment_failed'].includes(after.paymentStatus)) {
        title = 'Payment was not completed';
        message = `Payment for ${after.offerName || 'your purchase'} needs attention.`;
        priority = 'urgent';
    }
    if (!title) return;
    await createNotification({
        uid: after.uid,
        notificationId: `order_${event.params.orderId}_${safeId(event.id)}`,
        category: 'payments',
        title,
        message,
        actionLabel: 'View purchases',
        actionPath: '/member/purchases',
        priority,
        sourceType: 'studio_order',
        sourceId: event.params.orderId,
        metadata: { paymentStatus: after.paymentStatus, purchaseType: after.purchaseType || null },
    });
}

async function handleProgressionReviewWritten(event) {
    const before = event.data?.before?.data() || {};
    const after = event.data?.after?.data() || null;
    if (!after || before.status === after.status) return;
    const reviewId = event.params.reviewId;
    const levelLabel = after.levelLabel || after.levelKey || 'Progression level';
    if (after.status === 'submitted') {
        await notifyInstructors({
            category: 'progression',
            title: 'Progression review ready',
            message: `${after.memberDisplayName || 'A member'} submitted ${levelLabel} for review.`,
            actionLabel: 'Open review queue',
            actionPath: '/instructor/progression',
            priority: 'important',
            sourceType: 'progression_review',
            sourceId: reviewId,
            metadata: { status: after.status, memberUid: after.memberUid || null },
        }, `progression_${reviewId}_${safeId(event.id)}`);
        return;
    }
    if (!after.memberUid || !['needs_work', 'approved'].includes(after.status)) return;
    await createNotification({
        uid: after.memberUid,
        notificationId: `progression_${reviewId}_${safeId(event.id)}`,
        category: 'progression',
        title: after.status === 'approved' ? `${levelLabel} approved` : 'Instructor feedback is ready',
        message: after.status === 'approved'
            ? `Your instructor approved ${levelLabel}.`
            : `Review the instructor feedback for ${levelLabel} before submitting again.`,
        actionLabel: 'Open progression',
        actionPath: '/member/progression',
        priority: after.status === 'needs_work' ? 'important' : 'normal',
        preferenceKey: 'progression',
        sourceType: 'progression_review',
        sourceId: reviewId,
        metadata: { status: after.status, levelKey: after.levelKey || null },
    });
}

async function handleProgressionFeedbackCreated(event) {
    const feedback = event.data?.data() || {};
    const memberUid = event.params.memberUid || feedback.memberUid;
    if (!memberUid) return;
    await createNotification({
        uid: memberUid,
        notificationId: `feedback_${event.params.feedbackId}_${safeId(event.id)}`,
        category: 'progression',
        title: 'New instructor feedback',
        message: `New feedback was added to ${feedback.categoryLabel || event.params.categoryId || 'your progression work'}.`,
        actionLabel: 'Review feedback',
        actionPath: '/member/progression',
        priority: 'normal',
        preferenceKey: 'progression',
        sourceType: 'progression_feedback',
        sourceId: event.params.feedbackId,
        metadata: { levelId: event.params.levelId, categoryId: event.params.categoryId },
    });
}

async function handleEventRegistrationWritten(event) {
    const before = event.data?.before?.data() || null;
    const after = event.data?.after?.data() || null;
    if (!after?.uid) return;
    const eventTitle = after.eventSnapshot?.title || 'Studio event';
    let title = '';
    let message = '';
    let priority = 'normal';
    if (!before && after.registrationStatus === 'confirmed') {
        title = 'Event registration confirmed';
        message = `${eventTitle} is confirmed for ${after.participantCount || 1} participant${Number(after.participantCount || 1) === 1 ? '' : 's'}.`;
    } else if (before?.waiverStatus !== after.waiverStatus && after.waiverStatus === 'complete') {
        title = 'Event waivers complete';
        message = `All required waivers are complete for ${eventTitle}.`;
    } else if (before?.checkInStatus !== after.checkInStatus && after.checkInStatus === 'complete') {
        title = 'Event check-in complete';
        message = `All registered participants have checked in for ${eventTitle}.`;
    } else if (before?.registrationStatus !== after.registrationStatus && after.registrationStatus === 'canceled') {
        title = 'Event registration canceled';
        message = `Your registration for ${eventTitle} was canceled.`;
        priority = 'important';
    }
    if (!title) return;
    await createNotification({
        uid: after.uid,
        notificationId: `event_registration_${event.params.registrationId}_${safeId(event.id)}`,
        category: 'events',
        title,
        message,
        actionLabel: 'View event registration',
        actionPath: '/member/events',
        priority,
        sourceType: 'event_registration',
        sourceId: event.params.registrationId,
        metadata: {
            registrationStatus: after.registrationStatus || null,
            waiverStatus: after.waiverStatus || null,
            checkInStatus: after.checkInStatus || null,
        },
    });
}

function daysUntil(date) {
    return (date.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
}

function reminderBucket(hours) {
    if (hours >= 1 && hours <= 3) return 'two_hour';
    if (hours >= 22 && hours <= 26) return 'twenty_four_hour';
    return '';
}

async function createScheduledPrivateTrainingNotifications() {
    const snapshot = await db.collection('privateTrainingBookings').limit(500).get();
    let created = 0;
    for (const item of snapshot.docs) {
        const booking = item.data() || {};
        if (!booking.uid || !['confirmed', 'rescheduled'].includes(booking.status)) continue;
        const start = booking.startsAt?.toDate?.() || new Date(booking.startsAt || 0);
        if (Number.isNaN(start.valueOf())) continue;
        const hours = (start.getTime() - Date.now()) / (60 * 60 * 1000);
        const bucket = reminderBucket(hours);
        if (!bucket) continue;
        const didCreate = await createNotification({
            uid: booking.uid,
            notificationId: `booking_reminder_${item.id}_${bucket}`,
            category: 'reminders',
            title: bucket === 'two_hour' ? 'Private training starts soon' : 'Private training is tomorrow',
            message: `${booking.offerName || 'Your private-training session'} is scheduled soon.`,
            actionLabel: 'View booking',
            actionPath: '/member/private-training',
            priority: bucket === 'two_hour' ? 'important' : 'normal',
            preferenceKey: 'bookingReminders',
            sourceType: 'private_training_reminder',
            sourceId: item.id,
            metadata: { bucket, startsAt: start.toISOString() },
        });
        if (didCreate) created += 1;
    }
    return created;
}

async function createScheduledEventNotifications() {
    const snapshot = await db.collection('eventRegistrations').limit(500).get();
    let created = 0;
    for (const item of snapshot.docs) {
        const registration = item.data() || {};
        if (!registration.uid || registration.registrationStatus !== 'confirmed') continue;
        const start = registration.eventSnapshot?.startsAt?.toDate?.()
            || new Date(registration.eventSnapshot?.startsAt || 0);
        if (Number.isNaN(start.valueOf())) continue;
        const hours = (start.getTime() - Date.now()) / (60 * 60 * 1000);
        if (hours < 22 || hours > 26) continue;
        const pendingWaivers = registration.waiverStatus === 'pending';
        const didCreate = await createNotification({
            uid: registration.uid,
            notificationId: `event_reminder_${item.id}_twenty_four_hour`,
            category: 'reminders',
            title: pendingWaivers ? 'Event tomorrow — waiver still needed' : 'Your event is tomorrow',
            message: pendingWaivers
                ? `${registration.eventSnapshot?.title || 'Your event'} starts tomorrow and at least one waiver is still incomplete.`
                : `${registration.eventSnapshot?.title || 'Your event'} starts tomorrow.`,
            actionLabel: 'Review event details',
            actionPath: '/member/events',
            priority: pendingWaivers ? 'urgent' : 'normal',
            preferenceKey: 'eventReminders',
            sourceType: 'event_reminder',
            sourceId: item.id,
            metadata: { pendingWaivers, startsAt: start.toISOString() },
        });
        if (didCreate) created += 1;
    }
    return created;
}

async function createScheduledCreditNotifications() {
    const snapshot = await db.collection('privateTrainingPurchases').limit(500).get();
    let created = 0;
    for (const item of snapshot.docs) {
        const purchase = item.data() || {};
        if (!purchase.uid || Number(purchase.remainingSessions || 0) <= 0 || purchase.status !== 'active') continue;
        const expiration = purchase.expiresAt?.toDate?.() || new Date(purchase.expiresAt || 0);
        if (Number.isNaN(expiration.valueOf())) continue;
        const days = daysUntil(expiration);
        let bucket = '';
        if (days >= 0 && days <= 1.5) bucket = 'one_day';
        else if (days > 1.5 && days <= 7.5) bucket = 'seven_day';
        else if (days > 7.5 && days <= 14.5) bucket = 'fourteen_day';
        if (!bucket) continue;
        const didCreate = await createNotification({
            uid: purchase.uid,
            notificationId: `credit_expiration_${item.id}_${bucket}`,
            category: 'reminders',
            title: bucket === 'one_day' ? 'Private-training credits expire soon' : 'Schedule remaining private training',
            message: `${purchase.remainingSessions} session credit${Number(purchase.remainingSessions) === 1 ? '' : 's'} remain in ${purchase.offerName || 'your package'}.`,
            actionLabel: 'Book a session',
            actionPath: '/member/private-training/book',
            priority: bucket === 'one_day' ? 'urgent' : 'important',
            preferenceKey: 'creditExpiration',
            sourceType: 'private_training_purchase',
            sourceId: item.id,
            metadata: { bucket, expiresAt: expiration.toISOString(), remainingSessions: purchase.remainingSessions },
        });
        if (didCreate) created += 1;
    }
    return created;
}

async function handleCreateScheduledStudioNotifications() {
    const [bookingReminders, eventReminders, creditExpiration] = await Promise.all([
        createScheduledPrivateTrainingNotifications(),
        createScheduledEventNotifications(),
        createScheduledCreditNotifications(),
    ]);
    const result = { bookingReminders, eventReminders, creditExpiration };
    logger.info('Scheduled studio notifications completed.', result);
    return result;
}

module.exports = {
    handleGetMyNotificationUnreadCount,
    handleListMyNotifications,
    handleMarkNotificationRead,
    handleMarkAllNotificationsRead,
    handleGetMyNotificationPreferences,
    handleSaveMyNotificationPreferences,
    handleListStudioAnnouncementsAdmin,
    handleSaveStudioAnnouncement,
    handlePrivateTrainingBookingWritten,
    handleMembershipWritten,
    handleStudioOrderWritten,
    handleProgressionReviewWritten,
    handleProgressionFeedbackCreated,
    handleEventRegistrationWritten,
    handleCreateScheduledStudioNotifications,
};
