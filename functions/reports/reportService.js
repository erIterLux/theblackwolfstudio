const admin = require('firebase-admin');
const { HttpsError } = require('firebase-functions/v2/https');

const db = admin.firestore();
const INSTRUCTOR_ROLES = new Set(['instructor', 'admin']);
const LIVE_MEMBERSHIP_STATUSES = new Set(['active', 'trialing']);
const ACTIVE_BOOKING_STATUSES = new Set(['requested', 'confirmed', 'rescheduled']);
const CLOSED_ATTENDANCE_STATUSES = new Set(['completed', 'no_show']);
const MAX_RANGE_DAYS = 730;

function clean(value, max = 500) {
    return String(value ?? '').trim().slice(0, max);
}

function callerRole(request) {
    if (request.auth?.token?.admin === true || request.auth?.token?.role === 'admin') return 'admin';
    if (request.auth?.token?.role === 'instructor') return 'instructor';
    return 'member';
}

function requireInstructor(request) {
    if (!request.auth?.uid || !INSTRUCTOR_ROLES.has(callerRole(request))) {
        throw new HttpsError('permission-denied', 'Instructor access is required.');
    }
    return request.auth.uid;
}

function toDate(value) {
    if (!value) return null;
    if (value instanceof admin.firestore.Timestamp) return value.toDate();
    if (value?.toDate instanceof Function) return value.toDate();
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.valueOf()) ? null : date;
}

function millis(value) {
    return toDate(value)?.getTime() || 0;
}

function serialize(value) {
    if (value == null) return value;
    if (value instanceof admin.firestore.Timestamp) return value.toDate().toISOString();
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(serialize);
    if (typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, serialize(child)]));
    }
    return value;
}

function parseRange(data = {}) {
    const now = new Date();
    const preset = clean(data.preset || '30d', 20).toLowerCase();
    let end = toDate(data.endDate) || now;
    end = new Date(end);
    end.setHours(23, 59, 59, 999);

    let start = toDate(data.startDate);
    if (!start) {
        if (preset === 'year') {
            start = new Date(end.getFullYear(), 0, 1);
        } else {
            const days = preset === '7d' ? 7 : preset === '90d' ? 90 : 30;
            start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
        }
    }
    start = new Date(start);
    start.setHours(0, 0, 0, 0);

    if (start > end) throw new HttpsError('invalid-argument', 'The report start date must be before the end date.');
    const days = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    if (days > MAX_RANGE_DAYS) {
        throw new HttpsError('invalid-argument', `Reports can cover up to ${MAX_RANGE_DAYS} days at a time.`);
    }

    return { start, end, days, preset };
}

function inRange(value, range) {
    const time = millis(value);
    return time >= range.start.getTime() && time <= range.end.getTime();
}

function recordDate(record, candidates) {
    for (const key of candidates) {
        if (record?.[key]) return record[key];
    }
    return null;
}

function docs(snapshot) {
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

const SECTION_CACHE_TTL_MS = 60 * 1000;
const SECTION_CACHE_MAX_ENTRIES = 40;
const reportCache = new Map();

function emptyReportData() {
    return {
        orders: [],
        membershipPayments: [],
        memberships: [],
        events: [],
        registrations: [],
        participants: [],
        waivers: [],
        privatePurchases: [],
        bookings: [],
        availability: [],
        progressionProfiles: [],
        truncatedCollections: [],
    };
}

function queryLimit(limit, fallback = 5000) {
    const numeric = Number(limit || fallback);
    return Math.min(10000, Math.max(1, Number.isFinite(numeric) ? Math.floor(numeric) : fallback));
}

function rowsFromSnapshot(snapshot) {
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

function mergeRows(...groups) {
    const byId = new Map();
    groups.flat().forEach((row) => {
        if (row?.id) byId.set(row.id, row);
    });
    return [...byId.values()];
}

function chunk(values, size = 30) {
    const unique = [...new Set(values.filter(Boolean))];
    const chunks = [];
    for (let index = 0; index < unique.length; index += size) {
        chunks.push(unique.slice(index, index + size));
    }
    return chunks;
}

async function loadCollection(name, limit = 5000) {
    const safeLimit = queryLimit(limit);
    const snapshot = await db.collection(name).limit(safeLimit).get();
    return { rows: rowsFromSnapshot(snapshot), truncated: snapshot.size >= safeLimit };
}

async function queryRange(name, field, range, limit = 5000) {
    const safeLimit = queryLimit(limit);
    const snapshot = await db.collection(name)
        .where(field, '>=', admin.firestore.Timestamp.fromDate(range.start))
        .where(field, '<=', admin.firestore.Timestamp.fromDate(range.end))
        .orderBy(field, 'asc')
        .limit(safeLimit)
        .get();
    return { rows: rowsFromSnapshot(snapshot), truncated: snapshot.size >= safeLimit };
}

async function queryWhere(name, field, operator, value, limit = 5000) {
    const safeLimit = queryLimit(limit);
    const snapshot = await db.collection(name)
        .where(field, operator, value)
        .limit(safeLimit)
        .get();
    return { rows: rowsFromSnapshot(snapshot), truncated: snapshot.size >= safeLimit };
}

async function queryInChunks(name, field, values, { limitPerChunk = 3000 } = {}) {
    const groups = chunk(values, 30);
    if (!groups.length) return { rows: [], truncated: false };
    const snapshots = await Promise.all(groups.map((group) => (
        db.collection(name)
            .where(field, 'in', group)
            .limit(queryLimit(limitPerChunk))
            .get()
    )));
    return {
        rows: mergeRows(...snapshots.map(rowsFromSnapshot)),
        truncated: snapshots.some((snapshot) => snapshot.size >= queryLimit(limitPerChunk)),
    };
}

async function getDocsByIds(name, ids) {
    const groups = chunk(ids, 250);
    if (!groups.length) return [];
    const rows = [];
    for (const group of groups) {
        const snapshots = await db.getAll(...group.map((id) => db.collection(name).doc(id)));
        snapshots.forEach((snapshot) => {
            if (snapshot.exists) rows.push({ id: snapshot.id, ...snapshot.data() });
        });
    }
    return rows;
}

function rangeFromDates(start, end) {
    return { start: new Date(start), end: new Date(end), days: 0, preset: 'internal' };
}

function cacheKey(section, range, extra = '') {
    return [
        section,
        range.start.toISOString(),
        range.end.toISOString(),
        extra,
    ].join('|');
}

function readCache(key) {
    const entry = reportCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.createdAt > SECTION_CACHE_TTL_MS) {
        reportCache.delete(key);
        return null;
    }
    return entry.value;
}

function writeCache(key, value) {
    reportCache.set(key, { createdAt: Date.now(), value });
    if (reportCache.size <= SECTION_CACHE_MAX_ENTRIES) return;
    const oldest = [...reportCache.entries()]
        .sort((left, right) => left[1].createdAt - right[1].createdAt)
        .slice(0, reportCache.size - SECTION_CACHE_MAX_ENTRIES);
    oldest.forEach(([entryKey]) => reportCache.delete(entryKey));
}

async function cachedSection(section, range, loader, extra = '', force = false) {
    const key = cacheKey(section, range, extra);
    if (!force) {
        const cached = readCache(key);
        if (cached) return cached;
    }
    const value = await loader();
    writeCache(key, value);
    return value;
}

function collectWarnings(entries) {
    return entries
        .filter((entry) => entry?.truncated)
        .map((entry) => entry.name);
}

async function loadRevenueData(range) {
    const [ordersResult, paymentsResult] = await Promise.all([
        queryRange('studioOrders', 'paidAt', range, 5000),
        queryRange('membershipPayments', 'paidAt', range, 5000),
    ]);
    const data = emptyReportData();
    data.orders = ordersResult.rows;
    data.membershipPayments = paymentsResult.rows;
    data.truncatedCollections = collectWarnings([
        { name: 'studioOrders', ...ordersResult },
        { name: 'membershipPayments', ...paymentsResult },
    ]);
    return data;
}

async function loadMembershipData(range) {
    const paymentStart = new Date(Math.min(
        range.start.getTime(),
        range.end.getTime() - 400 * 24 * 60 * 60 * 1000,
    ));
    const paymentRange = rangeFromDates(paymentStart, range.end);
    const [activeResult, pastDueResult, createdResult, updatedResult, paymentsResult] = await Promise.all([
        queryWhere('memberships', 'status', 'in', ['active', 'trialing'], 4000),
        queryWhere('memberships', 'status', '==', 'past_due', 2000),
        queryRange('memberships', 'createdAt', range, 4000),
        queryRange('memberships', 'updatedAt', range, 4000),
        queryRange('membershipPayments', 'paidAt', paymentRange, 7000),
    ]);
    const data = emptyReportData();
    data.memberships = mergeRows(
        activeResult.rows,
        pastDueResult.rows,
        createdResult.rows,
        updatedResult.rows,
    );
    data.membershipPayments = paymentsResult.rows;
    data.truncatedCollections = collectWarnings([
        { name: 'active memberships', ...activeResult },
        { name: 'past-due memberships', ...pastDueResult },
        { name: 'new memberships', ...createdResult },
        { name: 'updated memberships', ...updatedResult },
        { name: 'membership payments', ...paymentsResult },
    ]);
    return data;
}

async function loadMembershipOverviewData(range) {
    const [activeResult, pastDueResult, createdResult] = await Promise.all([
        queryWhere('memberships', 'status', 'in', ['active', 'trialing'], 4000),
        queryWhere('memberships', 'status', '==', 'past_due', 2000),
        queryRange('memberships', 'createdAt', range, 4000),
    ]);
    const data = emptyReportData();
    data.memberships = mergeRows(activeResult.rows, pastDueResult.rows, createdResult.rows);
    data.truncatedCollections = collectWarnings([
        { name: 'active memberships', ...activeResult },
        { name: 'past-due memberships', ...pastDueResult },
        { name: 'new memberships', ...createdResult },
    ]);
    return data;
}

async function loadEventData(range) {
    const eventsResult = await queryRange('events', 'startsAt', range, 1000);
    const eventIds = eventsResult.rows.map((event) => event.id);
    const [registrationsResult, ordersResult] = await Promise.all([
        queryInChunks('eventRegistrations', 'eventId', eventIds, { limitPerChunk: 4000 }),
        queryInChunks('studioOrders', 'offerId', eventIds, { limitPerChunk: 4000 }),
    ]);
    const data = emptyReportData();
    data.events = eventsResult.rows;
    data.registrations = registrationsResult.rows;
    data.orders = ordersResult.rows;
    data.truncatedCollections = collectWarnings([
        { name: 'events', ...eventsResult },
        { name: 'event registrations', ...registrationsResult },
        { name: 'event orders', ...ordersResult },
    ]);
    return data;
}

async function loadPrivateTrainingData(range) {
    const [purchasesInRange, activePurchases, bookingsResult, availabilityResult] = await Promise.all([
        queryRange('privateTrainingPurchases', 'paidAt', range, 5000),
        queryWhere('privateTrainingPurchases', 'status', '==', 'active', 5000),
        queryRange('privateTrainingBookings', 'startsAt', range, 7000),
        loadCollection('instructorAvailability', 500),
    ]);
    const data = emptyReportData();
    data.privatePurchases = mergeRows(purchasesInRange.rows, activePurchases.rows);
    data.bookings = bookingsResult.rows;
    data.availability = availabilityResult.rows;
    data.truncatedCollections = collectWarnings([
        { name: 'private-training purchases', ...purchasesInRange },
        { name: 'active private-training purchases', ...activePurchases },
        { name: 'private-training bookings', ...bookingsResult },
        { name: 'instructor availability', ...availabilityResult },
    ]);
    return data;
}

async function loadPrivateTrainingOverviewData(range) {
    const [purchasesInRange, activePurchases, bookingsResult] = await Promise.all([
        queryRange('privateTrainingPurchases', 'paidAt', range, 5000),
        queryWhere('privateTrainingPurchases', 'status', '==', 'active', 5000),
        queryRange('privateTrainingBookings', 'startsAt', range, 7000),
    ]);
    const data = emptyReportData();
    data.privatePurchases = mergeRows(purchasesInRange.rows, activePurchases.rows);
    data.bookings = bookingsResult.rows;
    data.truncatedCollections = collectWarnings([
        { name: 'private-training purchases', ...purchasesInRange },
        { name: 'active private-training purchases', ...activePurchases },
        { name: 'private-training bookings', ...bookingsResult },
    ]);
    return data;
}

async function loadAttendanceData(range) {
    const eventsResult = await queryRange('events', 'startsAt', range, 1000);
    const eventIds = eventsResult.rows.map((event) => event.id);
    const [participantsResult, bookingsResult] = await Promise.all([
        queryInChunks('eventParticipants', 'eventId', eventIds, { limitPerChunk: 7000 }),
        queryRange('privateTrainingBookings', 'startsAt', range, 7000),
    ]);
    const data = emptyReportData();
    data.events = eventsResult.rows;
    data.participants = participantsResult.rows;
    data.bookings = bookingsResult.rows;
    data.truncatedCollections = collectWarnings([
        { name: 'events', ...eventsResult },
        { name: 'event participants', ...participantsResult },
        { name: 'private-training bookings', ...bookingsResult },
    ]);
    return data;
}

async function loadEngagementData() {
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const activityRange = rangeFromDates(ninetyDaysAgo, now);
    const [membershipsResult, eventsResult, bookingsResult, purchasesResult] = await Promise.all([
        queryWhere('memberships', 'status', 'in', ['active', 'trialing'], 4000),
        queryRange('events', 'startsAt', activityRange, 1000),
        queryRange('privateTrainingBookings', 'startsAt', activityRange, 7000),
        queryWhere('privateTrainingPurchases', 'status', '==', 'active', 5000),
    ]);
    const eventIds = eventsResult.rows.map((event) => event.id);
    const memberIds = membershipsResult.rows.map((membership) => membership.uid || membership.id);
    const [participantsResult, profilesByMemberResult, profilesByUidResult, profileDocuments] = await Promise.all([
        queryInChunks('eventParticipants', 'eventId', eventIds, { limitPerChunk: 7000 }),
        queryInChunks('progressionProfiles', 'memberUid', memberIds, { limitPerChunk: 4000 }),
        queryInChunks('progressionProfiles', 'uid', memberIds, { limitPerChunk: 4000 }),
        getDocsByIds('progressionProfiles', memberIds),
    ]);
    const data = emptyReportData();
    data.memberships = membershipsResult.rows;
    data.events = eventsResult.rows;
    data.participants = participantsResult.rows;
    data.bookings = bookingsResult.rows;
    data.privatePurchases = purchasesResult.rows;
    data.progressionProfiles = mergeRows(
        profilesByMemberResult.rows,
        profilesByUidResult.rows,
        profileDocuments,
    );
    data.truncatedCollections = collectWarnings([
        { name: 'active memberships', ...membershipsResult },
        { name: 'recent events', ...eventsResult },
        { name: 'recent private-training bookings', ...bookingsResult },
        { name: 'active private-training purchases', ...purchasesResult },
        { name: 'recent event participants', ...participantsResult },
        { name: 'progression profiles', ...profilesByMemberResult },
        { name: 'progression profiles by uid', ...profilesByUidResult },
    ]);
    return data;
}

async function loadSystemHealthData() {
    const entries = await Promise.all([
        loadCollection('studioOrders', 5000),
        loadCollection('events', 1500),
        loadCollection('eventRegistrations', 7000),
        loadCollection('eventParticipants', 10000),
        loadCollection('eventWaivers', 10000),
        loadCollection('privateTrainingPurchases', 5000),
        loadCollection('privateTrainingBookings', 10000),
    ]);
    const data = emptyReportData();
    const names = ['orders', 'events', 'registrations', 'participants', 'waivers', 'privatePurchases', 'bookings'];
    entries.forEach((entry, index) => {
        data[names[index]] = entry.rows;
        if (entry.truncated) data.truncatedCollections.push(names[index]);
    });
    return data;
}


function moneyTotals(records, { membership = false } = {}) {
    return records.reduce((totals, record) => {
        if (membership) {
            const paid = Number(record.amountPaidCents || 0);
            const due = Number(record.amountDueCents || paid);
            const refunded = Number(record.amountRefundedCents || 0);
            totals.grossCents += due;
            totals.netCents += Math.max(0, paid - refunded);
            totals.refundCents += refunded;
            totals.transactions += 1;
            return totals;
        }

        const pricing = record.pricing || {};
        const subtotal = Number(pricing.subtotalCents || pricing.totalCents || 0);
        const discount = Number(pricing.discountAmountCents || 0);
        const paid = Number(pricing.totalCents || 0);
        const refund = Number(record.refundAmountCents || pricing.refundAmountCents || 0);
        totals.grossCents += subtotal;
        totals.discountCents += discount;
        totals.refundCents += refund;
        totals.netCents += Math.max(0, paid - refund);
        totals.transactions += 1;
        return totals;
    }, {
        grossCents: 0,
        discountCents: 0,
        refundCents: 0,
        netCents: 0,
        transactions: 0,
    });
}

function averageValue(totals) {
    return totals.transactions ? Math.round(totals.netCents / totals.transactions) : 0;
}

function dateKey(value) {
    const date = toDate(value);
    if (!date) return null;
    return date.toISOString().slice(0, 10);
}

function buildRevenueSeries(records, range) {
    const bucketCount = range.days > 120 ? 12 : range.days > 45 ? Math.ceil(range.days / 7) : range.days;
    const intervalMs = (range.end.getTime() - range.start.getTime() + 1) / bucketCount;
    const buckets = Array.from({ length: bucketCount }, (_, index) => {
        const start = new Date(range.start.getTime() + index * intervalMs);
        const end = index === bucketCount - 1
            ? range.end
            : new Date(range.start.getTime() + (index + 1) * intervalMs - 1);
        return { start, end, membershipCents: 0, eventCents: 0, privateTrainingCents: 0 };
    });

    records.forEach((record) => {
        const time = millis(record.date);
        if (!time) return;
        const index = Math.min(bucketCount - 1, Math.max(0, Math.floor((time - range.start.getTime()) / intervalMs)));
        const key = record.type === 'membership'
            ? 'membershipCents'
            : record.type === 'event'
                ? 'eventCents'
                : 'privateTrainingCents';
        buckets[index][key] += Number(record.amountCents || 0);
    });

    return buckets.map((bucket) => ({
        label: range.days > 120
            ? bucket.start.toLocaleDateString('en-US', { month: 'short' })
            : bucket.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        start: bucket.start,
        end: bucket.end,
        membershipCents: bucket.membershipCents,
        eventCents: bucket.eventCents,
        privateTrainingCents: bucket.privateTrainingCents,
        totalCents: bucket.membershipCents + bucket.eventCents + bucket.privateTrainingCents,
    }));
}

function revenueReport(data, range) {
    const paidOrders = data.orders.filter((order) => (
        order.paymentStatus === 'paid'
        && inRange(recordDate(order, ['paidAt', 'createdAt']), range)
    ));
    const membershipPayments = data.membershipPayments.filter((payment) => (
        (payment.paid === true || payment.status === 'paid')
        && inRange(recordDate(payment, ['paidAt', 'attemptedAt', 'createdAt']), range)
    ));
    const eventOrders = paidOrders.filter((order) => order.purchaseType === 'event');
    const privateOrders = paidOrders.filter((order) => order.purchaseType === 'private_training');

    const membership = moneyTotals(membershipPayments, { membership: true });
    const events = moneyTotals(eventOrders);
    const privateTraining = moneyTotals(privateOrders);
    membership.averagePurchaseCents = averageValue(membership);
    events.averagePurchaseCents = averageValue(events);
    privateTraining.averagePurchaseCents = averageValue(privateTraining);

    const totals = {
        grossCents: membership.grossCents + events.grossCents + privateTraining.grossCents,
        discountCents: membership.discountCents + events.discountCents + privateTraining.discountCents,
        refundCents: membership.refundCents + events.refundCents + privateTraining.refundCents,
        netCents: membership.netCents + events.netCents + privateTraining.netCents,
        transactions: membership.transactions + events.transactions + privateTraining.transactions,
    };
    totals.averagePurchaseCents = averageValue(totals);

    const seriesRecords = [
        ...membershipPayments.map((payment) => ({
            type: 'membership',
            date: recordDate(payment, ['paidAt', 'attemptedAt']),
            amountCents: Math.max(0, Number(payment.amountPaidCents || 0) - Number(payment.amountRefundedCents || 0)),
        })),
        ...eventOrders.map((order) => ({
            type: 'event',
            date: recordDate(order, ['paidAt', 'createdAt']),
            amountCents: Math.max(0, Number(order.pricing?.totalCents || 0) - Number(order.refundAmountCents || 0)),
        })),
        ...privateOrders.map((order) => ({
            type: 'private_training',
            date: recordDate(order, ['paidAt', 'createdAt']),
            amountCents: Math.max(0, Number(order.pricing?.totalCents || 0) - Number(order.refundAmountCents || 0)),
        })),
    ];

    return { totals, membership, events, privateTraining, series: buildRevenueSeries(seriesRecords, range) };
}

function monthlyEquivalent(payment) {
    const amount = Number(payment.amountPaidCents || 0);
    const start = millis(payment.periodStart);
    const end = millis(payment.periodEnd);
    const days = start && end ? Math.max(1, (end - start) / (24 * 60 * 60 * 1000)) : 30;
    return days > 300 ? Math.round(amount / 12) : days > 45 ? Math.round(amount * 30 / days) : amount;
}

function membershipReport(data, range) {
    const active = data.memberships.filter((membership) => LIVE_MEMBERSHIP_STATUSES.has(membership.status));
    const newMemberships = data.memberships.filter((membership) => inRange(membership.createdAt, range));
    const cancellations = data.memberships.filter((membership) => (
        membership.status === 'canceled' && inRange(membership.updatedAt, range)
    ));
    const canceling = active.filter((membership) => membership.cancelAtPeriodEnd === true);
    const pastDue = data.memberships.filter((membership) => membership.status === 'past_due');

    const latestPaymentByUid = new Map();
    data.membershipPayments
        .filter((payment) => payment.paid === true || payment.status === 'paid')
        .sort((left, right) => millis(right.paidAt || right.attemptedAt) - millis(left.paidAt || left.attemptedAt))
        .forEach((payment) => {
            if (payment.uid && !latestPaymentByUid.has(payment.uid)) latestPaymentByUid.set(payment.uid, payment);
        });

    const mrrCents = active.reduce((sum, membership) => {
        const payment = latestPaymentByUid.get(membership.uid || membership.id);
        return sum + (payment ? monthlyEquivalent(payment) : 0);
    }, 0);

    const planMap = new Map();
    active.forEach((membership) => {
        const key = membership.planKey || 'unknown';
        const current = planMap.get(key) || { planKey: key, planName: membership.planName || 'Membership', count: 0 };
        current.count += 1;
        planMap.set(key, current);
    });

    const denominator = active.length + cancellations.length;
    const retentionRate = denominator ? Math.round((active.length / denominator) * 1000) / 10 : 100;

    return {
        activeCount: active.length,
        newCount: newMemberships.length,
        canceledCount: cancellations.length,
        cancelingCount: canceling.length,
        pastDueCount: pastDue.length,
        mrrCents,
        arrCents: mrrCents * 12,
        retentionRate,
        plans: [...planMap.values()].sort((a, b) => b.count - a.count),
        alerts: [
            ...(pastDue.length ? [{ type: 'past_due', count: pastDue.length, message: `${pastDue.length} membership${pastDue.length === 1 ? ' is' : 's are'} past due.` }] : []),
            ...(canceling.length ? [{ type: 'canceling', count: canceling.length, message: `${canceling.length} membership${canceling.length === 1 ? ' is' : 's are'} scheduled to cancel.` }] : []),
        ],
    };
}

function eventReport(data, range) {
    const registrationsByEvent = new Map();
    const ordersByEvent = new Map();

    data.registrations.forEach((registration) => {
        const rows = registrationsByEvent.get(registration.eventId) || [];
        rows.push(registration);
        registrationsByEvent.set(registration.eventId, rows);
    });
    data.orders
        .filter((order) => order.purchaseType === 'event' && order.paymentStatus === 'paid')
        .forEach((order) => {
            const rows = ordersByEvent.get(order.offerId) || [];
            rows.push(order);
            ordersByEvent.set(order.offerId, rows);
        });

    const events = data.events
        .filter((event) => inRange(event.startsAt || event.createdAt, range))
        .map((event) => {
            const registrations = registrationsByEvent.get(event.id) || [];
            const confirmed = registrations.filter((registration) => registration.registrationStatus === 'confirmed');
            const participants = confirmed.reduce((sum, registration) => (
                sum + Number(registration.participantCount || 0)
            ), 0);
            const waiversComplete = confirmed.reduce((sum, registration) => (
                sum + Number(registration.waiversSignedCount || 0)
            ), 0);
            const checkedInFromRegistrations = confirmed.reduce((sum, registration) => (
                sum + Number(registration.checkedInCount || 0)
            ), 0);
            const checkedIn = Math.max(
                checkedInFromRegistrations,
                Number(event.checkedInCount || 0),
            );
            const participantCount = participants || Number(event.registeredSeats || 0);
            const orders = ordersByEvent.get(event.id) || [];
            const eventHasEnded = millis(event.endsAt || event.startsAt) > 0
                && millis(event.endsAt || event.startsAt) < Date.now();
            const noShows = eventHasEnded ? Math.max(0, participantCount - checkedIn) : 0;
            const revenue = moneyTotals(orders);
            const capacity = Number(event.capacity || 0);
            return {
                id: event.id,
                title: event.title || 'Untitled event',
                startsAt: event.startsAt || null,
                status: event.status || 'draft',
                capacity,
                registrations: confirmed.length,
                participants: participantCount,
                waiversComplete,
                checkedIn,
                noShows,
                attendanceRate: participantCount
                    ? Math.round((checkedIn / participantCount) * 1000) / 10
                    : 0,
                capacityUsed: capacity
                    ? Math.round((participantCount / capacity) * 1000) / 10
                    : null,
                grossCents: revenue.grossCents,
                discountCents: revenue.discountCents,
                refundCents: revenue.refundCents,
                netCents: revenue.netCents,
            };
        })
        .sort((left, right) => millis(right.startsAt) - millis(left.startsAt));

    const totalParticipants = events.reduce((sum, event) => sum + event.participants, 0);
    const totalCheckedIn = events.reduce((sum, event) => sum + event.checkedIn, 0);
    return {
        events,
        totals: {
            eventCount: events.length,
            registrations: events.reduce((sum, event) => sum + event.registrations, 0),
            participants: totalParticipants,
            waiversComplete: events.reduce((sum, event) => sum + event.waiversComplete, 0),
            checkedIn: totalCheckedIn,
            noShows: events.reduce((sum, event) => sum + event.noShows, 0),
            attendanceRate: totalParticipants
                ? Math.round((totalCheckedIn / totalParticipants) * 1000) / 10
                : 0,
            netRevenueCents: events.reduce((sum, event) => sum + event.netCents, 0),
        },
    };
}


function recurringAvailabilityMinutes(availability, range) {
    const weekly = availability.weekly || availability.weeklyHours || availability.recurringHours || {};
    const weekdayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    let total = 0;
    for (let cursor = new Date(range.start); cursor <= range.end; cursor.setDate(cursor.getDate() + 1)) {
        const windows = weekly[weekdayKeys[cursor.getDay()]] || [];
        windows.forEach((window) => {
            const [startHour, startMinute] = String(window.start || '').split(':').map(Number);
            const [endHour, endMinute] = String(window.end || '').split(':').map(Number);
            if ([startHour, startMinute, endHour, endMinute].every(Number.isFinite)) {
                total += Math.max(0, endHour * 60 + endMinute - startHour * 60 - startMinute);
            }
        });
    }
    return total;
}

function privateTrainingReport(data, range) {
    const purchases = data.privatePurchases.filter((purchase) => inRange(purchase.paidAt || purchase.createdAt, range));
    const bookings = data.bookings.filter((booking) => inRange(booking.startsAt || booking.createdAt, range));
    const allPurchases = data.privatePurchases;

    const instructorMap = new Map();
    bookings.forEach((booking) => {
        const key = booking.instructorUid || 'unassigned';
        const current = instructorMap.get(key) || {
            instructorUid: key,
            instructorName: booking.instructorName || 'Unassigned',
            sessionsScheduled: 0,
            sessionsCompleted: 0,
            teachingMinutes: 0,
            cancellations: 0,
            noShows: 0,
            bookedMinutes: 0,
        };
        if (ACTIVE_BOOKING_STATUSES.has(booking.status)) current.sessionsScheduled += 1;
        if (booking.status === 'completed') {
            current.sessionsCompleted += 1;
            current.teachingMinutes += Number(booking.durationMinutes || 0);
        }
        if (['canceled', 'late_canceled'].includes(booking.status)) current.cancellations += 1;
        if (booking.status === 'no_show') current.noShows += 1;
        if (!['canceled'].includes(booking.status)) current.bookedMinutes += Number(booking.durationMinutes || 0);
        instructorMap.set(key, current);
    });

    const availabilityByUid = new Map(data.availability.map((record) => [record.instructorUid || record.id, record]));
    const instructors = [...instructorMap.values()].map((record) => {
        const availability = availabilityByUid.get(record.instructorUid);
        const availableMinutes = availability ? recurringAvailabilityMinutes(availability, range) : 0;
        const closed = record.sessionsCompleted + record.noShows;
        return {
            ...record,
            teachingHours: Math.round((record.teachingMinutes / 60) * 10) / 10,
            availabilityUsed: availableMinutes ? Math.min(100, Math.round((record.bookedMinutes / availableMinutes) * 1000) / 10) : null,
            completionRate: closed ? Math.round((record.sessionsCompleted / closed) * 1000) / 10 : 0,
        };
    }).sort((a, b) => b.sessionsCompleted - a.sessionsCompleted);

    const totalPurchased = purchases.reduce((sum, purchase) => sum + Number(purchase.purchasedSessions || 0), 0);
    const credits = {
        purchased: totalPurchased,
        available: allPurchases.reduce((sum, purchase) => sum + Math.max(0, Number(purchase.remainingSessions || 0) - Number(purchase.reservedSessions || 0)), 0),
        reserved: allPurchases.reduce((sum, purchase) => sum + Number(purchase.reservedSessions || 0), 0),
        used: allPurchases.reduce((sum, purchase) => sum + Number(purchase.usedSessions || 0), 0),
        forfeited: bookings.filter((booking) => (
            booking.status === 'no_show'
            || (booking.status === 'late_canceled' && booking.creditStatus === 'used')
        )).length,
    };

    return {
        packagesSold: purchases.length,
        credits,
        sessions: {
            completed: bookings.filter((booking) => booking.status === 'completed').length,
            scheduled: bookings.filter((booking) => ACTIVE_BOOKING_STATUSES.has(booking.status)).length,
            canceled: bookings.filter((booking) => booking.status === 'canceled').length,
            lateCanceled: bookings.filter((booking) => booking.status === 'late_canceled').length,
            noShows: bookings.filter((booking) => booking.status === 'no_show').length,
        },
        instructors,
    };
}

function attendanceReport(data, range) {
    const eventMap = new Map(data.events.map((event) => [event.id, event]));
    const eventRows = data.participants
        .map((participant) => {
            const event = eventMap.get(participant.eventId) || {};
            return {
                id: `event-${participant.id}`,
                type: 'event',
                date: event.startsAt || participant.checkInAt || participant.createdAt,
                title: event.title || 'Event',
                participantName: participant.fullName || 'Participant',
                memberUid: participant.memberUid || participant.purchaserUid || null,
                instructorName: null,
                status: participant.checkInStatus === 'checked_in'
                    ? 'attended'
                    : millis(event.endsAt || event.startsAt) > 0 && millis(event.endsAt || event.startsAt) < Date.now()
                        ? 'no_show'
                        : 'registered',
                waiverStatus: participant.waiverStatus || 'pending',
            };
        })
        .filter((row) => inRange(row.date, range));

    const privateRows = data.bookings
        .filter((booking) => inRange(booking.startsAt, range))
        .flatMap((booking) => {
            const participants = booking.participants?.length
                ? booking.participants
                : [{ id: booking.uid, fullName: booking.purchaser?.name || 'Member' }];
            return participants.map((participant) => ({
                id: `private-${booking.id}-${participant.id || participant.fullName}`,
                type: 'private_training',
                date: booking.startsAt,
                title: booking.offerName || 'Private training',
                participantName: participant.fullName || participant.name || 'Participant',
                memberUid: booking.uid || null,
                instructorUid: booking.instructorUid || null,
                instructorName: booking.instructorName || 'Instructor',
                status: booking.status === 'completed'
                    ? 'attended'
                    : booking.status === 'no_show'
                        ? 'no_show'
                        : booking.status,
                waiverStatus: null,
            }));
        });

    const rows = [...eventRows, ...privateRows].sort((a, b) => millis(b.date) - millis(a.date));
    const attended = rows.filter((row) => row.status === 'attended').length;
    const noShows = rows.filter((row) => row.status === 'no_show').length;
    return {
        rows,
        totals: {
            records: rows.length,
            attended,
            noShows,
            attendanceRate: attended + noShows ? Math.round((attended / (attended + noShows)) * 1000) / 10 : 0,
        },
    };
}

function memberEngagementReport(data) {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const fourteenDaysFromNow = now + 14 * 24 * 60 * 60 * 1000;
    const activeMemberships = data.memberships.filter((membership) => LIVE_MEMBERSHIP_STATUSES.has(membership.status));
    const lastAttendance = new Map();
    const noShowCount = new Map();
    const eventsById = new Map(data.events.map((event) => [event.id, event]));

    data.participants.forEach((participant) => {
        const uid = participant.memberUid || participant.purchaserUid;
        if (!uid) return;
        if (participant.checkInStatus === 'checked_in') {
            lastAttendance.set(uid, Math.max(lastAttendance.get(uid) || 0, millis(participant.checkInAt || participant.updatedAt)));
        } else if (participant.checkInStatus === 'not_checked_in') {
            const event = eventsById.get(participant.eventId) || {};
            const eventEndedAt = millis(event.endsAt || event.startsAt);
            if (eventEndedAt > 0 && eventEndedAt < now) {
                noShowCount.set(uid, (noShowCount.get(uid) || 0) + 1);
            }
        }
    });
    data.bookings.forEach((booking) => {
        if (!booking.uid) return;
        if (booking.status === 'completed') {
            lastAttendance.set(booking.uid, Math.max(lastAttendance.get(booking.uid) || 0, millis(booking.startsAt)));
        } else if (booking.status === 'no_show') {
            noShowCount.set(booking.uid, (noShowCount.get(booking.uid) || 0) + 1);
        }
    });

    const inactiveMembers = activeMemberships.filter((membership) => {
        const last = lastAttendance.get(membership.uid || membership.id) || 0;
        return !last || last < thirtyDaysAgo;
    }).map((membership) => ({
        uid: membership.uid || membership.id,
        name: membership.displayName || membership.email || 'Member',
        email: membership.email || null,
        lastAttendanceAt: lastAttendance.get(membership.uid || membership.id) || null,
        reason: lastAttendance.has(membership.uid || membership.id) ? 'No attendance in 30 days' : 'Active membership with no attendance',
    }));

    const purchaseBookingIds = new Set(data.bookings.map((booking) => booking.purchaseId));
    const unbookedPurchases = data.privatePurchases.filter((purchase) => (
        purchase.status === 'active'
        && Number(purchase.remainingSessions || 0) > 0
        && !purchaseBookingIds.has(purchase.id)
    )).map((purchase) => ({
        purchaseId: purchase.id,
        uid: purchase.uid || null,
        name: purchase.purchaser?.name || purchase.purchaser?.email || 'Private-training purchaser',
        remainingSessions: Number(purchase.remainingSessions || 0),
        reason: 'Purchased private training but never booked',
    }));

    const expiringCredits = data.privatePurchases.filter((purchase) => {
        const expires = millis(purchase.expiresAt);
        return purchase.status === 'active'
            && Number(purchase.remainingSessions || 0) > 0
            && expires > now
            && expires <= fourteenDaysFromNow;
    }).map((purchase) => ({
        purchaseId: purchase.id,
        uid: purchase.uid || null,
        name: purchase.purchaser?.name || purchase.purchaser?.email || 'Private-training purchaser',
        remainingSessions: Number(purchase.remainingSessions || 0),
        expiresAt: purchase.expiresAt,
        reason: 'Credits expire within 14 days',
    }));

    const repeatedNoShows = activeMemberships.filter((membership) => (
        (noShowCount.get(membership.uid || membership.id) || 0) >= 2
    )).map((membership) => ({
        uid: membership.uid || membership.id,
        name: membership.displayName || membership.email || 'Member',
        count: noShowCount.get(membership.uid || membership.id),
        reason: 'Repeated no-shows',
    }));

    const profilesByUid = new Map(data.progressionProfiles.map((profile) => [profile.memberUid || profile.uid || profile.id, profile]));
    const progressionInactive = activeMemberships.filter((membership) => {
        const profile = profilesByUid.get(membership.uid || membership.id);
        return profile && millis(profile.updatedAt || profile.createdAt) < thirtyDaysAgo;
    }).map((membership) => ({
        uid: membership.uid || membership.id,
        name: membership.displayName || membership.email || 'Member',
        reason: 'Progression inactive for 30 days',
    }));

    return {
        inactiveMembers,
        unbookedPurchases,
        expiringCredits,
        repeatedNoShows,
        progressionInactive,
        counts: {
            inactiveMembers: inactiveMembers.length,
            unbookedPurchases: unbookedPurchases.length,
            expiringCredits: expiringCredits.length,
            repeatedNoShows: repeatedNoShows.length,
            progressionInactive: progressionInactive.length,
        },
    };
}

function systemHealthReport(data) {
    const issues = [];
    const registrationsById = new Map(data.registrations.map((row) => [row.id, row]));
    const participantsByRegistration = new Map();
    const participantsByEvent = new Map();
    data.participants.forEach((participant) => {
        const registrationRows = participantsByRegistration.get(participant.registrationId) || [];
        registrationRows.push(participant);
        participantsByRegistration.set(participant.registrationId, registrationRows);
        const eventRows = participantsByEvent.get(participant.eventId) || [];
        eventRows.push(participant);
        participantsByEvent.set(participant.eventId, eventRows);
    });
    const waiversById = new Map(data.waivers.map((row) => [row.id, row]));
    const bookingsByPurchase = new Map();
    data.bookings.forEach((booking) => {
        const rows = bookingsByPurchase.get(booking.purchaseId) || [];
        rows.push(booking);
        bookingsByPurchase.set(booking.purchaseId, rows);
    });
    const registrationIds = new Set(data.registrations.map((row) => row.id));
    const purchaseIds = new Set(data.privatePurchases.map((row) => row.id));

    data.orders.filter((order) => order.paymentStatus === 'paid').forEach((order) => {
        if (order.purchaseType === 'event' && !registrationIds.has(order.id)) {
            issues.push({ type: 'missing_event_registration', severity: 'high', recordId: order.id, message: `Paid event order ${order.id} has no registration record.`, repairable: false });
        }
        if (order.purchaseType === 'private_training' && !purchaseIds.has(order.id)) {
            issues.push({ type: 'missing_private_purchase', severity: 'high', recordId: order.id, message: `Paid private-training order ${order.id} has no package record.`, repairable: false });
        }
        if (order.paymentMethod !== 'free_registration' && !order.receiptUrl) {
            issues.push({ type: 'missing_receipt', severity: 'medium', recordId: order.id, message: `Paid order ${order.id} does not have a stored Stripe receipt.`, repairable: false });
        }
    });

    data.participants.forEach((participant) => {
        const registration = registrationsById.get(participant.registrationId);
        if (!registration) {
            issues.push({ type: 'orphan_event_participant', severity: 'high', recordId: participant.id, message: `${participant.fullName || participant.id} is not connected to an event registration.`, repairable: false });
        }
        if (participant.checkInStatus === 'checked_in' && registration?.registrationStatus !== 'confirmed') {
            issues.push({ type: 'invalid_check_in', severity: 'high', recordId: participant.id, message: `${participant.fullName || participant.id} is checked in without a confirmed registration.`, repairable: false });
        }
        const waiver = waiversById.get(participant.id);
        if (waiver?.status === 'signed' && participant.waiverStatus !== 'signed') {
            issues.push({ type: 'waiver_status_mismatch', severity: 'medium', recordId: participant.id, message: `${participant.fullName || participant.id} has a signed waiver but the participant record is not marked signed.`, repairable: true });
        }
    });

    data.events.forEach((event) => {
        const participants = participantsByEvent.get(event.id) || [];
        const registered = participants.filter((participant) => participant.registrationStatus === 'confirmed').length;
        const checkedIn = participants.filter((participant) => participant.checkInStatus === 'checked_in').length;
        if (Number(event.registeredSeats || 0) !== registered || Number(event.checkedInCount || 0) !== checkedIn) {
            issues.push({
                type: 'event_counter_mismatch',
                severity: 'medium',
                recordId: event.id,
                message: `${event.title || event.id} counters do not match participant records.`,
                repairable: true,
                expected: { registeredSeats: registered, checkedInCount: checkedIn },
                actual: { registeredSeats: Number(event.registeredSeats || 0), checkedInCount: Number(event.checkedInCount || 0) },
            });
        }
    });

    data.registrations.forEach((registration) => {
        const participants = participantsByRegistration.get(registration.id) || [];
        const checkedIn = participants.filter((participant) => participant.checkInStatus === 'checked_in').length;
        const signed = participants.filter((participant) => ['signed', 'not_required'].includes(participant.waiverStatus)).length;
        if (Number(registration.checkedInCount || 0) !== checkedIn || Number(registration.waiversSignedCount || 0) !== signed) {
            issues.push({ type: 'registration_counter_mismatch', severity: 'medium', recordId: registration.id, message: `Registration ${registration.id} counters do not match participant records.`, repairable: true });
        }
    });

    data.privatePurchases.forEach((purchase) => {
        const activeReservations = (bookingsByPurchase.get(purchase.id) || []).filter((booking) => (
            ACTIVE_BOOKING_STATUSES.has(booking.status)
            && ['held', 'reserved'].includes(booking.creditStatus)
        )).length;
        if (Number(purchase.reservedSessions || 0) !== activeReservations) {
            issues.push({
                type: 'private_reserved_counter_mismatch',
                severity: 'medium',
                recordId: purchase.id,
                message: `Private-training package ${purchase.id} has an incorrect reserved-credit count.`,
                repairable: true,
                expected: { reservedSessions: activeReservations },
                actual: { reservedSessions: Number(purchase.reservedSessions || 0) },
            });
        }
    });

    data.bookings.forEach((booking) => {
        if (CLOSED_ATTENDANCE_STATUSES.has(booking.status) && booking.creditStatus !== 'used') {
            issues.push({ type: 'closed_booking_credit_mismatch', severity: 'high', recordId: booking.id, message: `Closed booking ${booking.id} is not connected to a used credit. Review manually.`, repairable: false });
        }
    });

    const counts = issues.reduce((result, issue) => {
        result[issue.severity] = (result[issue.severity] || 0) + 1;
        return result;
    }, { high: 0, medium: 0, low: 0 });
    return { issues, counts, repairableCount: issues.filter((issue) => issue.repairable).length };
}

function metaFrom(...payloads) {
    return {
        truncatedCollections: [...new Set(payloads.flatMap((payload) => (
            payload?.meta?.truncatedCollections || payload?.truncatedCollections || []
        )))],
        cacheSeconds: Math.round(SECTION_CACHE_TTL_MS / 1000),
    };
}

async function buildRevenuePayload(range, force = false) {
    return cachedSection('revenue', range, async () => {
        const data = await loadRevenueData(range);
        return {
            range,
            revenue: revenueReport(data, range),
            meta: { truncatedCollections: data.truncatedCollections },
        };
    }, '', force);
}

async function buildMembershipPayload(range, force = false) {
    return cachedSection('memberships', range, async () => {
        const data = await loadMembershipData(range);
        return {
            range,
            memberships: membershipReport(data, range),
            meta: { truncatedCollections: data.truncatedCollections },
        };
    }, '', force);
}

async function buildEventPayload(range, force = false) {
    return cachedSection('events', range, async () => {
        const data = await loadEventData(range);
        return {
            range,
            events: eventReport(data, range),
            meta: { truncatedCollections: data.truncatedCollections },
        };
    }, '', force);
}

async function buildPrivateTrainingPayload(range, force = false) {
    return cachedSection('private-training', range, async () => {
        const data = await loadPrivateTrainingData(range);
        return {
            range,
            privateTraining: privateTrainingReport(data, range),
            meta: { truncatedCollections: data.truncatedCollections },
        };
    }, '', force);
}

async function buildAttendancePayload(range, force = false) {
    return cachedSection('attendance', range, async () => {
        const data = await loadAttendanceData(range);
        return {
            range,
            attendance: attendanceReport(data, range),
            meta: { truncatedCollections: data.truncatedCollections },
        };
    }, '', force);
}

async function buildEngagementPayload(range, force = false) {
    return cachedSection('engagement', range, async () => {
        const data = await loadEngagementData();
        return {
            range,
            engagement: memberEngagementReport(data),
            meta: { truncatedCollections: data.truncatedCollections },
        };
    }, '', force);
}

async function buildSystemHealthPayload(range, force = false) {
    return cachedSection('system-health', range, async () => {
        const data = await loadSystemHealthData();
        return {
            range,
            systemHealth: systemHealthReport(data),
            meta: { truncatedCollections: data.truncatedCollections },
        };
    }, '', force);
}

async function buildMembershipOverviewPayload(range, force = false) {
    return cachedSection('overview-memberships', range, async () => {
        const data = await loadMembershipOverviewData(range);
        return {
            range,
            memberships: membershipReport(data, range),
            meta: { truncatedCollections: data.truncatedCollections },
        };
    }, '', force);
}

async function buildPrivateTrainingOverviewPayload(range, force = false) {
    return cachedSection('overview-private-training', range, async () => {
        const data = await loadPrivateTrainingOverviewData(range);
        return {
            range,
            privateTraining: privateTrainingReport(data, range),
            meta: { truncatedCollections: data.truncatedCollections },
        };
    }, '', force);
}

function reportRange(request) {
    requireInstructor(request);
    return parseRange(request.data || {});
}

async function handleGetStudioReportSummary(request) {
    const range = reportRange(request);
    const force = request.data?.force === true;
    const [revenuePayload, membershipPayload, eventPayload, privatePayload] = await Promise.all([
        buildRevenuePayload(range, force),
        buildMembershipOverviewPayload(range, force),
        buildEventPayload(range, force),
        buildPrivateTrainingOverviewPayload(range, force),
    ]);

    const revenue = revenuePayload.revenue;
    const memberships = membershipPayload.memberships;
    const events = eventPayload.events;
    const privateTraining = privatePayload.privateTraining;
    const attended = Number(events.totals?.checkedIn || 0)
        + Number(privateTraining.sessions?.completed || 0);
    const noShows = Number(events.totals?.noShows || 0)
        + Number(privateTraining.sessions?.noShows || 0);
    const attendanceRate = attended + noShows
        ? Math.round((attended / (attended + noShows)) * 1000) / 10
        : 0;
    const noShowRate = attended + noShows
        ? Math.round((noShows / (attended + noShows)) * 1000) / 10
        : 0;

    return serialize({
        range,
        summary: {
            netRevenueCents: revenue.totals.netCents,
            membershipRevenueCents: revenue.membership.netCents,
            eventRevenueCents: revenue.events.netCents,
            privateTrainingRevenueCents: revenue.privateTraining.netCents,
            activeMembers: memberships.activeCount,
            newMembers: memberships.newCount,
            eventRegistrations: events.totals.registrations,
            privateSessionsCompleted: privateTraining.sessions.completed,
            attendanceRate,
            noShowRate,
            discountsCents: revenue.totals.discountCents,
            refundsCents: revenue.totals.refundCents,
        },
        revenue,
        memberships: {
            activeCount: memberships.activeCount,
            newCount: memberships.newCount,
            pastDueCount: memberships.pastDueCount,
            cancelingCount: memberships.cancelingCount,
        },
        events: { totals: events.totals },
        privateTraining: {
            packagesSold: privateTraining.packagesSold,
            credits: privateTraining.credits,
            sessions: privateTraining.sessions,
        },
        attendance: {
            totals: {
                records: attended + noShows,
                attended,
                noShows,
                attendanceRate,
            },
        },
        engagement: {
            deferred: true,
            message: 'Open Member attention to calculate current follow-up lists.',
        },
        systemHealth: {
            deferred: true,
            message: 'Open System health to run integrity checks on demand.',
        },
        meta: metaFrom(revenuePayload, membershipPayload, eventPayload, privatePayload),
    });
}

async function handleGetRevenueReport(request) {
    const range = reportRange(request);
    return serialize(await buildRevenuePayload(range, request.data?.force === true));
}

async function handleGetMembershipReport(request) {
    const range = reportRange(request);
    return serialize(await buildMembershipPayload(range, request.data?.force === true));
}

async function handleGetEventReport(request) {
    const range = reportRange(request);
    return serialize(await buildEventPayload(range, request.data?.force === true));
}

async function handleGetPrivateTrainingReport(request) {
    const range = reportRange(request);
    return serialize(await buildPrivateTrainingPayload(range, request.data?.force === true));
}

function attendancePageSize(value) {
    const number = Number(value || 100);
    return Math.min(200, Math.max(25, Number.isFinite(number) ? Math.floor(number) : 100));
}

function attendanceOffset(value) {
    const number = Number(value || 0);
    return Math.max(0, Number.isFinite(number) ? Math.floor(number) : 0);
}

async function handleGetAttendanceReport(request) {
    const range = reportRange(request);
    const payload = await buildAttendancePayload(range, request.data?.force === true);
    const rows = payload.attendance.rows || [];
    const pageSize = attendancePageSize(request.data?.pageSize);
    const offset = attendanceOffset(request.data?.cursor);
    const pageRows = rows.slice(offset, offset + pageSize);
    const nextOffset = offset + pageRows.length;
    return serialize({
        range,
        attendance: {
            ...payload.attendance,
            rows: pageRows,
        },
        page: {
            pageSize,
            returned: pageRows.length,
            totalRows: rows.length,
            hasMore: nextOffset < rows.length,
            nextCursor: nextOffset < rows.length ? String(nextOffset) : null,
        },
        meta: payload.meta,
    });
}

async function handleGetMemberEngagementReport(request) {
    const range = reportRange(request);
    return serialize(await buildEngagementPayload(range, request.data?.force === true));
}

async function handleGetSystemHealthReport(request) {
    const range = reportRange(request);
    return serialize(await buildSystemHealthPayload(range, request.data?.force === true));
}


function csvEscape(value) {
    const text = value == null ? '' : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function makeCsv(headers, rows) {
    return [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n');
}

function exportRows(type, data, reports, range) {
    if (type === 'revenue') {
        const rows = [];
        data.membershipPayments.filter((record) => inRange(recordDate(record, ['paidAt', 'attemptedAt']), range)).forEach((record) => rows.push([
            dateKey(recordDate(record, ['paidAt', 'attemptedAt'])), 'Membership', record.planName || 'Membership', record.uid || '', Number(record.amountDueCents || 0) / 100, 0, Number(record.amountRefundedCents || 0) / 100, Math.max(0, Number(record.amountPaidCents || 0) - Number(record.amountRefundedCents || 0)) / 100,
        ]));
        data.orders.filter((record) => record.paymentStatus === 'paid' && inRange(recordDate(record, ['paidAt', 'createdAt']), range)).forEach((record) => rows.push([
            dateKey(recordDate(record, ['paidAt', 'createdAt'])), record.purchaseType === 'event' ? 'Event' : 'Private training', record.offerName || '', record.purchaser?.email || record.uid || '', Number(record.pricing?.subtotalCents || 0) / 100, Number(record.pricing?.discountAmountCents || 0) / 100, Number(record.refundAmountCents || 0) / 100, Math.max(0, Number(record.pricing?.totalCents || 0) - Number(record.refundAmountCents || 0)) / 100,
        ]));
        return { headers: ['Date', 'Category', 'Description', 'Customer', 'Gross', 'Discount', 'Refund', 'Net'], rows };
    }
    if (type === 'transactions') {
        return {
            headers: ['Date', 'Order ID', 'Type', 'Purchaser', 'Email', 'Offering', 'Status', 'Subtotal', 'Discount', 'Paid', 'Receipt'],
            rows: data.orders.filter((record) => inRange(recordDate(record, ['paidAt', 'createdAt']), range)).map((record) => [
                dateKey(recordDate(record, ['paidAt', 'createdAt'])), record.id, record.purchaseType, record.purchaser?.name || '', record.purchaser?.email || '', record.offerName || '', record.paymentStatus || '', Number(record.pricing?.subtotalCents || 0) / 100, Number(record.pricing?.discountAmountCents || 0) / 100, Number(record.pricing?.totalCents || 0) / 100, record.receiptUrl || '',
            ]),
        };
    }
    if (type === 'event_attendance') {
        return {
            headers: ['Date', 'Event', 'Participant', 'Status', 'Waiver status', 'Member UID'],
            rows: reports.attendance.rows.filter((row) => row.type === 'event').map((row) => [dateKey(row.date), row.title, row.participantName, row.status, row.waiverStatus || '', row.memberUid || '']),
        };
    }
    if (type === 'private_attendance') {
        return {
            headers: ['Date', 'Package', 'Participant', 'Instructor', 'Status', 'Member UID'],
            rows: reports.attendance.rows.filter((row) => row.type === 'private_training').map((row) => [dateKey(row.date), row.title, row.participantName, row.instructorName || '', row.status, row.memberUid || '']),
        };
    }
    if (type === 'memberships') {
        return {
            headers: ['Member UID', 'Name', 'Email', 'Plan', 'Status', 'Cancel at period end', 'Period end'],
            rows: data.memberships.map((record) => [record.uid || record.id, record.displayName || '', record.email || '', record.planName || record.planKey || '', record.status || '', record.cancelAtPeriodEnd === true ? 'Yes' : 'No', dateKey(record.currentPeriodEnd)]),
        };
    }
    if (type === 'outstanding_credits') {
        return {
            headers: ['Package ID', 'Purchaser', 'Email', 'Package', 'Total sessions', 'Available', 'Reserved', 'Used', 'Expires'],
            rows: data.privatePurchases.filter((record) => Number(record.remainingSessions || 0) > 0).map((record) => [record.id, record.purchaser?.name || '', record.purchaser?.email || '', record.offerName || '', Number(record.totalSessions || 0), Math.max(0, Number(record.remainingSessions || 0) - Number(record.reservedSessions || 0)), Number(record.reservedSessions || 0), Number(record.usedSessions || 0), dateKey(record.expiresAt)]),
        };
    }
    if (type === 'discounts') {
        return {
            headers: ['Date', 'Order ID', 'Type', 'Offering', 'Discount source', 'Discount amount', 'Paid'],
            rows: data.orders.filter((record) => Number(record.pricing?.discountAmountCents || 0) > 0 && inRange(recordDate(record, ['paidAt', 'createdAt']), range)).map((record) => [dateKey(recordDate(record, ['paidAt', 'createdAt'])), record.id, record.purchaseType, record.offerName || '', record.pricing?.discount?.source || '', Number(record.pricing?.discountAmountCents || 0) / 100, Number(record.pricing?.totalCents || 0) / 100]),
        };
    }
    if (type === 'refunds') {
        return {
            headers: ['Date', 'Order ID', 'Type', 'Purchaser', 'Offering', 'Refund amount', 'Payment status'],
            rows: data.orders.filter((record) => Number(record.refundAmountCents || record.pricing?.refundAmountCents || 0) > 0 && inRange(recordDate(record, ['updatedAt', 'paidAt', 'createdAt']), range)).map((record) => [dateKey(recordDate(record, ['updatedAt', 'paidAt', 'createdAt'])), record.id, record.purchaseType, record.purchaser?.email || '', record.offerName || '', Number(record.refundAmountCents || record.pricing?.refundAmountCents || 0) / 100, record.paymentStatus || '']),
        };
    }
    throw new HttpsError('invalid-argument', 'Choose a supported report export.');
}

async function loadOrderExportData(range) {
    const [created, paid, updated] = await Promise.all([
        queryRange('studioOrders', 'createdAt', range, 10000),
        queryRange('studioOrders', 'paidAt', range, 10000),
        queryRange('studioOrders', 'updatedAt', range, 10000),
    ]);
    const data = emptyReportData();
    data.orders = mergeRows(created.rows, paid.rows, updated.rows);
    data.truncatedCollections = collectWarnings([
        { name: 'orders created in range', ...created },
        { name: 'orders paid in range', ...paid },
        { name: 'orders updated in range', ...updated },
    ]);
    return data;
}

async function loadExportPayload(type, range) {
    if (type === 'revenue') {
        const data = await loadRevenueData(range);
        return { data, reports: { attendance: { rows: [] } } };
    }
    if (['transactions', 'discounts', 'refunds'].includes(type)) {
        const data = await loadOrderExportData(range);
        return { data, reports: { attendance: { rows: [] } } };
    }
    if (['event_attendance', 'private_attendance'].includes(type)) {
        const data = await loadAttendanceData(range);
        return { data, reports: { attendance: attendanceReport(data, range) } };
    }
    if (type === 'memberships') {
        const result = await loadCollection('memberships', 10000);
        const data = emptyReportData();
        data.memberships = result.rows;
        if (result.truncated) data.truncatedCollections.push('memberships');
        return { data, reports: { attendance: { rows: [] } } };
    }
    if (type === 'outstanding_credits') {
        const result = await queryWhere('privateTrainingPurchases', 'status', '==', 'active', 10000);
        const data = emptyReportData();
        data.privatePurchases = result.rows;
        if (result.truncated) data.truncatedCollections.push('active private-training purchases');
        return { data, reports: { attendance: { rows: [] } } };
    }
    throw new HttpsError('invalid-argument', 'Choose a supported report export.');
}

async function handleExportStudioReport(request) {
    requireInstructor(request);
    const type = clean(request.data?.type, 40).toLowerCase();
    const range = parseRange(request.data || {});
    const { data, reports } = await loadExportPayload(type, range);
    const exportData = exportRows(type, data, reports, range);
    const content = makeCsv(exportData.headers, exportData.rows);
    return {
        filename: `black-wolf-${type}-${range.start.toISOString().slice(0, 10)}-to-${range.end.toISOString().slice(0, 10)}.csv`,
        mimeType: 'text/csv;charset=utf-8',
        content,
        rowCount: exportData.rows.length,
        truncatedCollections: data.truncatedCollections,
    };
}

function registrationCheckInStatus(checkedInCount, participantCount) {
    if (!checkedInCount) return 'not_checked_in';
    if (participantCount > 0 && checkedInCount >= participantCount) return 'complete';
    return 'partial';
}

function registrationWaiverStatus(signedCount, requiredCount) {
    if (!requiredCount) return 'not_required';
    if (signedCount >= requiredCount) return 'complete';
    if (signedCount > 0) return 'partial';
    return 'pending';
}

async function handleRepairStudioReportCounters(request) {
    const actorUid = requireInstructor(request);
    const dryRun = request.data?.confirm !== true;
    const data = await loadSystemHealthData();
    const repairs = [];
    const participantsByRegistration = new Map();
    const participantsByEvent = new Map();
    data.participants.forEach((participant) => {
        const registrationRows = participantsByRegistration.get(participant.registrationId) || [];
        registrationRows.push(participant);
        participantsByRegistration.set(participant.registrationId, registrationRows);
        const eventRows = participantsByEvent.get(participant.eventId) || [];
        eventRows.push(participant);
        participantsByEvent.set(participant.eventId, eventRows);
    });
    const bookingsByPurchase = new Map();
    data.bookings.forEach((booking) => {
        const rows = bookingsByPurchase.get(booking.purchaseId) || [];
        rows.push(booking);
        bookingsByPurchase.set(booking.purchaseId, rows);
    });
    const waiversById = new Map(data.waivers.map((waiver) => [waiver.id, waiver]));

    const batch = db.batch();
    data.events.forEach((event) => {
        const participants = participantsByEvent.get(event.id) || [];
        const registeredSeats = participants.filter((participant) => participant.registrationStatus === 'confirmed').length;
        const checkedInCount = participants.filter((participant) => participant.checkInStatus === 'checked_in').length;
        if (Number(event.registeredSeats || 0) !== registeredSeats || Number(event.checkedInCount || 0) !== checkedInCount) {
            repairs.push({ type: 'event_counters', id: event.id, registeredSeats, checkedInCount });
            if (!dryRun) batch.set(db.collection('events').doc(event.id), { registeredSeats, checkedInCount, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        }
    });

    data.registrations.forEach((registration) => {
        const participants = participantsByRegistration.get(registration.id) || [];
        const participantCount = participants.length;
        const checkedInCount = participants.filter((participant) => participant.checkInStatus === 'checked_in').length;
        const requiredCount = registration.waiversRequiredCount ?? (registration.eventSnapshot?.waiverRequired === false ? 0 : participantCount);
        const waiversSignedCount = participants.filter((participant) => ['signed', 'not_required'].includes(participant.waiverStatus)).length;
        if (Number(registration.checkedInCount || 0) !== checkedInCount || Number(registration.waiversSignedCount || 0) !== waiversSignedCount || Number(registration.participantCount || 0) !== participantCount) {
            repairs.push({ type: 'registration_counters', id: registration.id, participantCount, checkedInCount, waiversSignedCount });
            if (!dryRun) batch.set(db.collection('eventRegistrations').doc(registration.id), {
                participantCount,
                checkedInCount,
                checkInStatus: registrationCheckInStatus(checkedInCount, participantCount),
                waiversSignedCount,
                waiverStatus: registrationWaiverStatus(waiversSignedCount, Number(requiredCount || 0)),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        }
    });

    data.privatePurchases.forEach((purchase) => {
        const reservedSessions = (bookingsByPurchase.get(purchase.id) || []).filter((booking) => (
            ACTIVE_BOOKING_STATUSES.has(booking.status)
            && ['held', 'reserved'].includes(booking.creditStatus)
        )).length;
        if (Number(purchase.reservedSessions || 0) !== reservedSessions) {
            repairs.push({ type: 'reserved_credit_counter', id: purchase.id, reservedSessions });
            if (!dryRun) batch.set(db.collection('privateTrainingPurchases').doc(purchase.id), { reservedSessions, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        }
    });

    data.participants.forEach((participant) => {
        const waiver = waiversById.get(participant.id);
        if (waiver?.status === 'signed' && participant.waiverStatus !== 'signed') {
            repairs.push({ type: 'waiver_status', id: participant.id, waiverStatus: 'signed' });
            if (!dryRun) batch.set(db.collection('eventParticipants').doc(participant.id), { waiverStatus: 'signed', waiverSignedAt: waiver.signedAt || null, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        }
    });

    if (!dryRun && repairs.length) {
        if (repairs.length > 450) throw new HttpsError('resource-exhausted', 'Too many repairs were found for one run. Contact support before retrying.');
        batch.set(db.collection('reportRepairHistory').doc(), {
            actorUid,
            repairCount: repairs.length,
            repairs,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await batch.commit();
    }

    return { dryRun, repairCount: repairs.length, repairs };
}

module.exports = {
    handleGetStudioReportSummary,
    handleGetRevenueReport,
    handleGetMembershipReport,
    handleGetEventReport,
    handleGetPrivateTrainingReport,
    handleGetAttendanceReport,
    handleGetMemberEngagementReport,
    handleGetSystemHealthReport,
    handleExportStudioReport,
    handleRepairStudioReportCounters,
};
