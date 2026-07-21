const admin = require('firebase-admin');
const { HttpsError } = require('firebase-functions/v2/https');

const db = admin.firestore();
const INSTRUCTOR_ROLES = new Set(['instructor', 'admin']);
const ACTIVE_BOOKING_STATUSES = new Set(['requested', 'confirmed', 'rescheduled']);
const FINAL_BOOKING_STATUSES = new Set([
  'completed',
  'canceled',
  'late_canceled',
  'no_show',
]);
const VALID_LOCATION_TYPES = new Set(['in_person', 'remote', 'client_location']);
const VALID_OVERRIDE_MODES = new Set(['blocked', 'available']);
const WEEKDAY_KEYS = ['0', '1', '2', '3', '4', '5', '6'];
const DEFAULT_TIMEZONE = 'America/New_York';
const SLOT_STEP_MINUTES = 30;
const MAX_SLOT_DAYS = 31;

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

function boolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
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

function requireAuthenticated(request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in to manage private training.');
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

function isInstructorRequest(request) {
  return Boolean(request.auth?.uid && INSTRUCTOR_ROLES.has(callerRole(request)));
}

function validTimeZone(value) {
  const candidate = clean(value, 80) || DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function normalizeClock(value) {
  const match = clean(value, 10).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function clockMinutes(value) {
  const normalized = normalizeClock(value);
  if (!normalized) return null;
  const [hours, minutes] = normalized.split(':').map(Number);
  return hours * 60 + minutes;
}

function sanitizeWindows(rawWindows, limit = 6) {
  if (!Array.isArray(rawWindows)) return [];
  const windows = rawWindows.slice(0, limit).map((raw) => {
    const start = normalizeClock(raw?.start);
    const end = normalizeClock(raw?.end);
    if (!start || !end || clockMinutes(start) >= clockMinutes(end)) {
      throw new HttpsError(
        'invalid-argument',
        'Availability windows need a valid start and end time.',
      );
    }
    return { start, end };
  });

  return windows.sort((left, right) => clockMinutes(left.start) - clockMinutes(right.start));
}

function sanitizeWeekly(rawWeekly) {
  const weekly = {};
  for (const dayKey of WEEKDAY_KEYS) {
    weekly[dayKey] = sanitizeWindows(rawWeekly?.[dayKey] || []);
  }
  return weekly;
}

function sanitizeDurations(rawDurations) {
  const values = Array.isArray(rawDurations) ? rawDurations : [60];
  const durations = [...new Set(
    values
      .map((value) => integer(value, 15, 240, 60))
      .filter((value) => value % 15 === 0),
  )].sort((left, right) => left - right);
  return durations.length ? durations : [60];
}

function availabilityDefaults(uid, token = {}) {
  return {
    instructorUid: uid,
    displayName: clean(token.name || token.email || 'Instructor', 160),
    email: normalizeEmail(token.email) || null,
    active: true,
    timezone: DEFAULT_TIMEZONE,
    requiresApproval: false,
    minNoticeHours: 12,
    maxAdvanceDays: 60,
    bufferMinutes: 15,
    cancellationNoticeHours: 24,
    lateCancellationConsumesCredit: true,
    defaultLocationType: 'in_person',
    defaultLocation: '',
    remoteInstructions: '',
    supportedDurations: [60],
    weekly: Object.fromEntries(WEEKDAY_KEYS.map((key) => [key, []])),
  };
}

function sanitizeAvailability(data, uid, token = {}) {
  const defaults = availabilityDefaults(uid, token);
  const locationType = VALID_LOCATION_TYPES.has(data?.defaultLocationType)
    ? data.defaultLocationType
    : defaults.defaultLocationType;

  return {
    instructorUid: uid,
    displayName: clean(data?.displayName || token.name || token.email || 'Instructor', 160),
    email: normalizeEmail(data?.email || token.email) || null,
    active: boolean(data?.active, true),
    timezone: validTimeZone(data?.timezone),
    requiresApproval: boolean(data?.requiresApproval, false),
    minNoticeHours: integer(data?.minNoticeHours, 0, 168, 12),
    maxAdvanceDays: integer(data?.maxAdvanceDays, 1, 365, 60),
    bufferMinutes: integer(data?.bufferMinutes, 0, 120, 15),
    cancellationNoticeHours: integer(data?.cancellationNoticeHours, 0, 336, 24),
    lateCancellationConsumesCredit: boolean(data?.lateCancellationConsumesCredit, true),
    defaultLocationType: locationType,
    defaultLocation: clean(data?.defaultLocation, 500),
    remoteInstructions: clean(data?.remoteInstructions, 1200),
    supportedDurations: sanitizeDurations(data?.supportedDurations),
    weekly: sanitizeWeekly(data?.weekly),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function sanitizeOverride(data, instructorUid) {
  const dateKey = clean(data?.dateKey, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new HttpsError('invalid-argument', 'Choose a valid override date.');
  }
  const mode = VALID_OVERRIDE_MODES.has(data?.mode) ? data.mode : 'blocked';
  const windows = mode === 'available' ? sanitizeWindows(data?.windows || []) : [];
  if (mode === 'available' && !windows.length) {
    throw new HttpsError('invalid-argument', 'Add at least one availability window.');
  }
  return {
    instructorUid,
    dateKey,
    mode,
    windows,
    note: clean(data?.note, 500) || null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function dateKeyInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function weekdayInTimeZone(date, timeZone) {
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  }).format(date);
  return String(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(label));
}

function timezoneOffsetMilliseconds(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  return asUtc - date.getTime();
}

function zonedDateTimeToDate(dateKey, clock, timeZone) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hour, minute] = normalizeClock(clock).split(':').map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const firstOffset = timezoneOffsetMilliseconds(guess, timeZone);
  let result = new Date(guess.getTime() - firstOffset);
  const secondOffset = timezoneOffsetMilliseconds(result, timeZone);
  if (secondOffset !== firstOffset) {
    result = new Date(guess.getTime() - secondOffset);
  }
  return result;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + Number(minutes || 0) * 60 * 1000);
}

function addDaysToDateKey(dateKey, days) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function timestampsOverlap(startA, endA, startB, endB, bufferMinutes = 0) {
  const buffer = Number(bufferMinutes || 0) * 60 * 1000;
  return startA.getTime() < endB.getTime() + buffer
    && endA.getTime() + buffer > startB.getTime();
}

function availableSessionCount(purchase) {
  return Math.max(
    0,
    Number(purchase.remainingSessions || 0) - Number(purchase.reservedSessions || 0),
  );
}

function activeIntervals(dayData = {}) {
  const intervals = Array.isArray(dayData.intervals) ? dayData.intervals : [];
  return intervals.filter((item) => ACTIVE_BOOKING_STATUSES.has(item.status));
}

function intervalOverlaps(intervals, startsAt, endsAt, bufferMinutes, excludeBookingId = '') {
  return intervals.some((item) => {
    if (item.bookingId === excludeBookingId) return false;
    const existingStart = item.startsAt?.toDate?.() || new Date(item.startsAt);
    const existingEnd = item.endsAt?.toDate?.() || new Date(item.endsAt);
    return timestampsOverlap(startsAt, endsAt, existingStart, existingEnd, bufferMinutes);
  });
}

function windowsForDate(availability, override, dateKey) {
  if (override?.mode === 'blocked') return [];
  if (override?.mode === 'available') return override.windows || [];
  const sample = zonedDateTimeToDate(dateKey, '12:00', availability.timezone);
  const dayKey = weekdayInTimeZone(sample, availability.timezone);
  return availability.weekly?.[dayKey] || [];
}

function sessionFitsWindows(availability, override, dateKey, startsAt, endsAt) {
  const windows = windowsForDate(availability, override, dateKey);
  return windows.some((window) => {
    const windowStart = zonedDateTimeToDate(dateKey, window.start, availability.timezone);
    const windowEnd = zonedDateTimeToDate(dateKey, window.end, availability.timezone);
    return startsAt.getTime() >= windowStart.getTime()
      && endsAt.getTime() <= windowEnd.getTime();
  });
}

function bookingDayId(instructorUid, dateKey) {
  return `${instructorUid}_${dateKey}`;
}

function normalizeParticipants(purchase, requestedIds) {
  const participants = Array.isArray(purchase.participants) ? purchase.participants : [];
  const validIds = new Set(participants.map((participant) => participant.id));
  const ids = Array.isArray(requestedIds)
    ? [...new Set(requestedIds.map((value) => clean(value, 80)).filter(Boolean))]
    : [];
  const selected = ids.length ? ids : [...validIds];
  if (!selected.length || selected.some((id) => !validIds.has(id))) {
    throw new HttpsError('invalid-argument', 'Choose valid registered participants.');
  }
  return selected;
}

function bookingContact(purchase, request) {
  const purchaser = purchase.purchaser || {};
  return {
    displayName: clean(
      request.auth?.token?.name
        || purchaser.name
        || purchaser.fullName
        || request.auth?.token?.email
        || 'Member',
      160,
    ),
    email: normalizeEmail(request.auth?.token?.email || purchaser.email) || null,
    phone: clean(purchaser.phone, 40) || null,
  };
}

async function getAvailabilityAndOverride(instructorUid, dateKey, transaction = null) {
  const availabilityRef = db.collection('instructorAvailability').doc(instructorUid);
  const overrideRef = availabilityRef.collection('overrides').doc(dateKey);
  const getter = transaction ? (ref) => transaction.get(ref) : (ref) => ref.get();
  const [availabilitySnapshot, overrideSnapshot] = await Promise.all([
    getter(availabilityRef),
    getter(overrideRef),
  ]);
  if (!availabilitySnapshot.exists) {
    throw new HttpsError('failed-precondition', 'That instructor has not published availability.');
  }
  const availability = availabilitySnapshot.data() || {};
  if (!availability.active) {
    throw new HttpsError('failed-precondition', 'That instructor is not currently accepting bookings.');
  }
  return {
    availability,
    override: overrideSnapshot.exists ? overrideSnapshot.data() : null,
    availabilityRef,
    overrideRef,
  };
}

async function handleGetMyInstructorAvailability(request) {
  const instructorUid = requireInstructor(request);
  const availabilityRef = db.collection('instructorAvailability').doc(instructorUid);
  const [snapshot, overridesSnapshot] = await Promise.all([
    availabilityRef.get(),
    availabilityRef.collection('overrides').limit(200).get(),
  ]);
  const availability = snapshot.exists
    ? { id: snapshot.id, ...snapshot.data() }
    : availabilityDefaults(instructorUid, request.auth.token);
  const overrides = overridesSnapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((left, right) => String(left.dateKey).localeCompare(String(right.dateKey)));
  return { availability: serialize(availability), overrides: serialize(overrides) };
}

async function handleSaveMyInstructorAvailability(request) {
  const instructorUid = requireInstructor(request);
  const payload = sanitizeAvailability(request.data, instructorUid, request.auth.token);
  const ref = db.collection('instructorAvailability').doc(instructorUid);
  const existing = await ref.get();
  await ref.set({
    ...payload,
    createdAt: existing.data()?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return { instructorUid };
}

async function handleSaveInstructorAvailabilityOverride(request) {
  const instructorUid = requireInstructor(request);
  const payload = sanitizeOverride(request.data, instructorUid);
  const ref = db.collection('instructorAvailability')
    .doc(instructorUid)
    .collection('overrides')
    .doc(payload.dateKey);
  await ref.set({
    ...payload,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return { dateKey: payload.dateKey };
}

async function handleDeleteInstructorAvailabilityOverride(request) {
  const instructorUid = requireInstructor(request);
  const dateKey = clean(request.data?.dateKey, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new HttpsError('invalid-argument', 'Choose a valid override date.');
  }
  await db.collection('instructorAvailability')
    .doc(instructorUid)
    .collection('overrides')
    .doc(dateKey)
    .delete();
  return { dateKey };
}

async function authorizeMemberPurchase(request, purchase) {
  const uid = requireAuthenticated(request);
  if (purchase.uid !== uid) {
    throw new HttpsError('permission-denied', 'That package does not belong to this account.');
  }
  return uid;
}

function parseRange(data, timezone) {
  const today = dateKeyInTimeZone(new Date(), timezone);
  const startKey = /^\d{4}-\d{2}-\d{2}$/.test(clean(data?.dateFrom, 10))
    ? clean(data.dateFrom, 10)
    : addDaysToDateKey(today, 1);
  const requestedEnd = /^\d{4}-\d{2}-\d{2}$/.test(clean(data?.dateTo, 10))
    ? clean(data.dateTo, 10)
    : addDaysToDateKey(startKey, 13);
  const startDate = new Date(`${startKey}T00:00:00Z`);
  const endDate = new Date(`${requestedEnd}T00:00:00Z`);
  const diffDays = Math.floor((endDate - startDate) / (24 * 60 * 60 * 1000));
  const cappedEnd = diffDays < 0
    ? startKey
    : addDaysToDateKey(startKey, Math.min(MAX_SLOT_DAYS - 1, diffDays));
  return { startKey, endKey: cappedEnd };
}

async function loadDayAndOverride(instructorUid, dateKey) {
  const [daySnapshot, overrideSnapshot] = await Promise.all([
    db.collection('privateTrainingBookingDays')
      .doc(bookingDayId(instructorUid, dateKey))
      .get(),
    db.collection('instructorAvailability')
      .doc(instructorUid)
      .collection('overrides')
      .doc(dateKey)
      .get(),
  ]);
  return {
    day: daySnapshot.exists ? daySnapshot.data() : {},
    override: overrideSnapshot.exists ? overrideSnapshot.data() : null,
  };
}

function makeSlotsForDate({ availability, override, day, dateKey, durationMinutes, excludeBookingId = '' }) {
  const now = Date.now();
  const earliest = now + Number(availability.minNoticeHours || 0) * 60 * 60 * 1000;
  const maxDate = now + Number(availability.maxAdvanceDays || 60) * 24 * 60 * 60 * 1000;
  const bufferMinutes = Number(availability.bufferMinutes || 0);
  const intervals = activeIntervals(day);
  const slots = [];

  for (const window of windowsForDate(availability, override, dateKey)) {
    const windowStartMinutes = clockMinutes(window.start);
    const windowEndMinutes = clockMinutes(window.end);
    for (
      let minute = windowStartMinutes;
      minute + durationMinutes <= windowEndMinutes;
      minute += SLOT_STEP_MINUTES
    ) {
      const clock = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
      const startsAt = zonedDateTimeToDate(dateKey, clock, availability.timezone);
      const endsAt = addMinutes(startsAt, durationMinutes);
      if (startsAt.getTime() < earliest || startsAt.getTime() > maxDate) continue;
      if (intervalOverlaps(intervals, startsAt, endsAt, bufferMinutes, excludeBookingId)) continue;
      slots.push({
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        dateKey,
      });
    }
  }
  return slots;
}

async function handleListPrivateTrainingAvailability(request) {
  const uid = requireAuthenticated(request);
  const purchaseId = clean(request.data?.purchaseId, 160);
  if (!purchaseId) throw new HttpsError('invalid-argument', 'Choose a private training package.');

  const purchaseSnapshot = await db.collection('privateTrainingPurchases').doc(purchaseId).get();
  if (!purchaseSnapshot.exists) throw new HttpsError('not-found', 'That package was not found.');
  const purchase = { id: purchaseSnapshot.id, ...purchaseSnapshot.data() };
  if (purchase.uid !== uid) throw new HttpsError('permission-denied', 'That package does not belong to this account.');
  const rescheduleBookingId = clean(request.data?.bookingId, 160);
  let rescheduleBooking = null;
  if (rescheduleBookingId) {
    const bookingSnapshot = await db.collection('privateTrainingBookings').doc(rescheduleBookingId).get();
    if (!bookingSnapshot.exists) throw new HttpsError('not-found', 'That booking was not found.');
    rescheduleBooking = { id: bookingSnapshot.id, ...bookingSnapshot.data() };
    if (rescheduleBooking.uid !== uid || rescheduleBooking.purchaseId !== purchaseId) {
      throw new HttpsError('permission-denied', 'That booking does not belong to this package.');
    }
    if (!ACTIVE_BOOKING_STATUSES.has(rescheduleBooking.status)) {
      throw new HttpsError('failed-precondition', 'That booking can no longer be rescheduled.');
    }
  }
  if (purchase.status !== 'active' || (!rescheduleBooking && availableSessionCount(purchase) <= 0)) {
    throw new HttpsError('failed-precondition', 'This package has no bookable session credits.');
  }
  if (purchase.expiresAt?.toMillis?.() && purchase.expiresAt.toMillis() < Date.now()) {
    throw new HttpsError('failed-precondition', 'This package has expired.');
  }

  const durationMinutes = integer(purchase.sessionDurationMinutes, 15, 240, 60);
  const availabilitySnapshot = await db.collection('instructorAvailability')
    .where('active', '==', true)
    .limit(50)
    .get();
  const requestedInstructorUid = clean(request.data?.instructorUid, 160);
  const instructors = availabilitySnapshot.docs
    .filter((item) => !requestedInstructorUid || item.id === requestedInstructorUid)
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((item) => !item.supportedDurations?.length || item.supportedDurations.includes(durationMinutes));

  if (!instructors.length) return { instructors: [], slots: [] };

  const timezone = validTimeZone(instructors[0].timezone);
  const { startKey, endKey } = parseRange(request.data, timezone);
  const dates = [];
  let cursor = startKey;
  while (cursor <= endKey && dates.length < MAX_SLOT_DAYS) {
    dates.push(cursor);
    cursor = addDaysToDateKey(cursor, 1);
  }

  const slots = [];
  for (const instructor of instructors) {
    const availability = {
      ...availabilityDefaults(instructor.id),
      ...instructor,
      timezone: validTimeZone(instructor.timezone),
    };
    for (const dateKey of dates) {
      const { day, override } = await loadDayAndOverride(instructor.id, dateKey);
      const dateSlots = makeSlotsForDate({
        availability,
        override,
        day,
        dateKey,
        durationMinutes,
        excludeBookingId: rescheduleBooking?.id || '',
      });
      for (const slot of dateSlots) {
        slots.push({
          ...slot,
          instructorUid: instructor.id,
          instructorName: availability.displayName || 'Instructor',
          timezone: availability.timezone,
          locationType: availability.defaultLocationType,
          location: availability.defaultLocation || null,
          requiresApproval: availability.requiresApproval === true,
        });
      }
    }
  }

  slots.sort((left, right) => new Date(left.startsAt) - new Date(right.startsAt));
  return {
    purchase: serialize({
      id: purchase.id,
      offerName: purchase.offerName,
      participants: purchase.participants || [],
      participantCount: purchase.participantCount || 1,
      durationMinutes,
      remainingSessions: purchase.remainingSessions || 0,
      reservedSessions: purchase.reservedSessions || 0,
      availableSessions: availableSessionCount(purchase),
      rescheduleBookingId: rescheduleBooking?.id || null,
    }),
    instructors: instructors.map((item) => serialize({
      uid: item.id,
      displayName: item.displayName || 'Instructor',
      timezone: item.timezone || DEFAULT_TIMEZONE,
      defaultLocationType: item.defaultLocationType || 'in_person',
      defaultLocation: item.defaultLocation || null,
      requiresApproval: item.requiresApproval === true,
    })),
    slots,
  };
}

async function validateBookingTime({ transaction, instructorUid, startsAt, durationMinutes, excludeBookingId = '', ignoreNotice = false }) {
  const baseAvailabilitySnapshot = await transaction.get(
    db.collection('instructorAvailability').doc(instructorUid),
  );
  if (!baseAvailabilitySnapshot.exists || baseAvailabilitySnapshot.data()?.active !== true) {
    throw new HttpsError('failed-precondition', 'That instructor is not accepting bookings.');
  }
  const availability = {
    ...availabilityDefaults(instructorUid),
    ...baseAvailabilitySnapshot.data(),
    timezone: validTimeZone(baseAvailabilitySnapshot.data()?.timezone),
  };
  if (
    availability.supportedDurations?.length
    && !availability.supportedDurations.includes(durationMinutes)
  ) {
    throw new HttpsError('failed-precondition', 'That instructor does not offer this session duration.');
  }

  const endsAt = addMinutes(startsAt, durationMinutes);
  const dateKey = dateKeyInTimeZone(startsAt, availability.timezone);
  const overrideRef = db.collection('instructorAvailability')
    .doc(instructorUid)
    .collection('overrides')
    .doc(dateKey);
  const dayRef = db.collection('privateTrainingBookingDays')
    .doc(bookingDayId(instructorUid, dateKey));
  const [overrideSnapshot, daySnapshot] = await Promise.all([
    transaction.get(overrideRef),
    transaction.get(dayRef),
  ]);
  const override = overrideSnapshot.exists ? overrideSnapshot.data() : null;
  const day = daySnapshot.exists ? daySnapshot.data() : {};

  const currentTime = Date.now();
  const earliest = currentTime + Number(availability.minNoticeHours || 0) * 60 * 60 * 1000;
  const latest = currentTime + Number(availability.maxAdvanceDays || 60) * 24 * 60 * 60 * 1000;
  if (startsAt.getTime() <= currentTime) {
    throw new HttpsError('failed-precondition', 'Choose a future session time.');
  }
  if (!ignoreNotice && startsAt.getTime() < earliest) {
    throw new HttpsError('failed-precondition', 'That time is inside the minimum booking notice.');
  }
  if (startsAt.getTime() > latest) {
    throw new HttpsError('failed-precondition', 'That time is too far in advance.');
  }
  if (!sessionFitsWindows(availability, override, dateKey, startsAt, endsAt)) {
    throw new HttpsError('failed-precondition', 'That time is no longer available.');
  }
  if (intervalOverlaps(
    activeIntervals(day),
    startsAt,
    endsAt,
    availability.bufferMinutes,
    excludeBookingId,
  )) {
    throw new HttpsError('already-exists', 'That time was just booked. Choose another time.');
  }

  return { availability, endsAt, dateKey, dayRef, day };
}

function updateDayIntervals(day, bookingId, interval) {
  const current = Array.isArray(day?.intervals) ? day.intervals : [];
  const next = current.filter((item) => item.bookingId !== bookingId);
  if (interval) next.push(interval);
  return next;
}

function bookingInterval(bookingId, startsAt, endsAt, status) {
  return {
    bookingId,
    startsAt: admin.firestore.Timestamp.fromDate(startsAt),
    endsAt: admin.firestore.Timestamp.fromDate(endsAt),
    status,
  };
}

function parseIsoDate(value, fieldLabel = 'date and time') {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    throw new HttpsError('invalid-argument', `Enter a valid ${fieldLabel}.`);
  }
  return date;
}

async function handleCreatePrivateTrainingBooking(request) {
  const uid = requireAuthenticated(request);
  const purchaseId = clean(request.data?.purchaseId, 160);
  const instructorUid = clean(request.data?.instructorUid, 160);
  const startsAt = parseIsoDate(request.data?.startsAt, 'session time');
  const note = clean(request.data?.note, 1200) || null;
  if (!purchaseId || !instructorUid) {
    throw new HttpsError('invalid-argument', 'Choose a package, instructor, and session time.');
  }

  const purchaseRef = db.collection('privateTrainingPurchases').doc(purchaseId);
  const bookingRef = db.collection('privateTrainingBookings').doc();
  const historyRef = bookingRef.collection('history').doc();
  let result;

  await db.runTransaction(async (transaction) => {
    const purchaseSnapshot = await transaction.get(purchaseRef);
    if (!purchaseSnapshot.exists) throw new HttpsError('not-found', 'That package was not found.');
    const purchase = purchaseSnapshot.data() || {};
    if (purchase.uid !== uid) throw new HttpsError('permission-denied', 'That package does not belong to this account.');
    if (purchase.status !== 'active' || availableSessionCount(purchase) <= 0) {
      throw new HttpsError('failed-precondition', 'This package has no available session credits.');
    }
    if (purchase.expiresAt?.toMillis?.() && purchase.expiresAt.toMillis() < Date.now()) {
      throw new HttpsError('failed-precondition', 'This package has expired.');
    }

    const participantIds = normalizeParticipants(purchase, request.data?.participantIds);
    const durationMinutes = integer(purchase.sessionDurationMinutes, 15, 240, 60);
    const {
      availability,
      endsAt,
      dateKey,
      dayRef,
      day,
    } = await validateBookingTime({
      transaction,
      instructorUid,
      startsAt,
      durationMinutes,
    });

    const status = availability.requiresApproval ? 'requested' : 'confirmed';
    const creditStatus = availability.requiresApproval ? 'held' : 'reserved';
    const contact = bookingContact(purchase, request);
    const timestampStart = admin.firestore.Timestamp.fromDate(startsAt);
    const timestampEnd = admin.firestore.Timestamp.fromDate(endsAt);
    const locationType = VALID_LOCATION_TYPES.has(request.data?.locationType)
      ? request.data.locationType
      : availability.defaultLocationType;
    const location = clean(request.data?.location || availability.defaultLocation, 500) || null;

    const booking = {
      id: bookingRef.id,
      uid,
      purchaseId,
      offerId: purchase.offerId || null,
      offerName: purchase.offerName || 'Private training',
      purchaser: contact,
      participants: (purchase.participants || []).filter((item) => participantIds.includes(item.id)),
      participantIds,
      participantCount: participantIds.length,
      instructorUid,
      instructorName: availability.displayName || 'Instructor',
      instructorEmail: normalizeEmail(availability.email) || null,
      startsAt: timestampStart,
      endsAt: timestampEnd,
      dateKey,
      timezone: availability.timezone,
      durationMinutes,
      locationType,
      location,
      remoteInstructions: locationType === 'remote'
        ? clean(availability.remoteInstructions, 1200) || null
        : null,
      status,
      creditStatus,
      memberNote: note,
      instructorNote: null,
      cancellationPolicySnapshot: {
        noticeHours: Number(availability.cancellationNoticeHours || 24),
        lateCancellationConsumesCredit: availability.lateCancellationConsumesCredit !== false,
      },
      requestedAt: admin.firestore.FieldValue.serverTimestamp(),
      confirmedAt: status === 'confirmed'
        ? admin.firestore.FieldValue.serverTimestamp()
        : null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    transaction.set(bookingRef, booking);
    transaction.set(historyRef, {
      action: status === 'confirmed' ? 'created_confirmed' : 'created_requested',
      actorUid: uid,
      actorRole: 'member',
      startsAt: timestampStart,
      endsAt: timestampEnd,
      note,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    transaction.set(dayRef, {
      instructorUid,
      dateKey,
      timezone: availability.timezone,
      intervals: updateDayIntervals(
        day,
        bookingRef.id,
        bookingInterval(bookingRef.id, startsAt, endsAt, status),
      ),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(purchaseRef, {
      reservedSessions: Number(purchase.reservedSessions || 0) + 1,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    result = { bookingId: bookingRef.id, status };
  });

  return result;
}

async function handleListMyPrivateTrainingBookings(request) {
  const uid = requireAuthenticated(request);
  const snapshot = await db.collection('privateTrainingBookings')
    .where('uid', '==', uid)
    .limit(200)
    .get();
  const bookings = snapshot.docs
    .map((item) => serialize({ id: item.id, ...item.data() }))
    .sort((left, right) => new Date(left.startsAt || 0) - new Date(right.startsAt || 0));
  return { bookings };
}

async function handleListPrivateTrainingBookingsAdmin(request) {
  requireInstructor(request);
  const [bookingsSnapshot, availabilitySnapshot] = await Promise.all([
    db.collection('privateTrainingBookings').limit(500).get(),
    db.collection('instructorAvailability').limit(100).get(),
  ]);
  const bookings = bookingsSnapshot.docs
    .map((item) => serialize({ id: item.id, ...item.data() }))
    .sort((left, right) => new Date(left.startsAt || 0) - new Date(right.startsAt || 0));
  const instructors = availabilitySnapshot.docs
    .map((item) => serialize({ uid: item.id, ...item.data() }))
    .sort((left, right) => String(left.displayName || '').localeCompare(String(right.displayName || '')));
  return { bookings, instructors };
}

function memberCanChangeBooking(request, booking) {
  return Boolean(request.auth?.uid && request.auth.uid === booking.uid);
}

function updatePurchaseForRelease(purchase, consumesCredit) {
  const reservedSessions = Math.max(0, Number(purchase.reservedSessions || 0) - 1);
  if (!consumesCredit) {
    return { reservedSessions };
  }
  const usedSessions = Number(purchase.usedSessions || 0) + 1;
  const remainingSessions = Math.max(0, Number(purchase.remainingSessions || 0) - 1);
  return {
    reservedSessions,
    usedSessions,
    remainingSessions,
    status: remainingSessions <= 0 ? 'used' : purchase.status,
  };
}

async function handleUpdatePrivateTrainingBooking(request) {
  const actorUid = requireAuthenticated(request);
  const instructor = isInstructorRequest(request);
  const bookingId = clean(request.data?.bookingId, 160);
  const action = clean(request.data?.action, 40);
  const note = clean(request.data?.note, 1200) || null;
  if (!bookingId || !action) {
    throw new HttpsError('invalid-argument', 'Choose a booking action.');
  }

  const bookingRef = db.collection('privateTrainingBookings').doc(bookingId);
  const historyRef = bookingRef.collection('history').doc();
  let response;

  await db.runTransaction(async (transaction) => {
    const bookingSnapshot = await transaction.get(bookingRef);
    if (!bookingSnapshot.exists) throw new HttpsError('not-found', 'That booking was not found.');
    const booking = bookingSnapshot.data() || {};
    if (!instructor && !memberCanChangeBooking(request, booking)) {
      throw new HttpsError('permission-denied', 'You do not have access to that booking.');
    }
    if (FINAL_BOOKING_STATUSES.has(booking.status)) {
      throw new HttpsError('failed-precondition', 'That booking is already closed.');
    }

    const purchaseRef = db.collection('privateTrainingPurchases').doc(booking.purchaseId);
    const purchaseSnapshot = await transaction.get(purchaseRef);
    if (!purchaseSnapshot.exists) throw new HttpsError('not-found', 'The related package was not found.');
    const purchase = purchaseSnapshot.data() || {};
    const oldStart = booking.startsAt?.toDate?.() || new Date(booking.startsAt);
    const oldEnd = booking.endsAt?.toDate?.() || new Date(booking.endsAt);
    const oldDayRef = db.collection('privateTrainingBookingDays')
      .doc(bookingDayId(booking.instructorUid, booking.dateKey));
    const oldDaySnapshot = await transaction.get(oldDayRef);
    const oldDay = oldDaySnapshot.exists ? oldDaySnapshot.data() : {};
    const now = Date.now();
    const policy = booking.cancellationPolicySnapshot || {};

    if (action === 'confirm') {
      if (!instructor) throw new HttpsError('permission-denied', 'Only an instructor can confirm a request.');
      if (booking.status !== 'requested') {
        throw new HttpsError('failed-precondition', 'Only requested bookings can be confirmed.');
      }
      transaction.set(bookingRef, {
        status: 'confirmed',
        creditStatus: 'reserved',
        confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
        instructorNote: note || booking.instructorNote || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(oldDayRef, {
        intervals: updateDayIntervals(
          oldDay,
          bookingId,
          bookingInterval(bookingId, oldStart, oldEnd, 'confirmed'),
        ),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      response = { bookingId, status: 'confirmed' };
    } else if (action === 'reschedule') {
      if (!instructor
        && booking.status !== 'requested'
        && oldStart.getTime() - now < Number(policy.noticeHours || 24) * 60 * 60 * 1000) {
        throw new HttpsError(
          'failed-precondition',
          'This session is inside the rescheduling notice window. Contact the instructor for help.',
        );
      }
      const startsAt = parseIsoDate(request.data?.startsAt, 'new session time');
      const instructorUid = clean(request.data?.instructorUid || booking.instructorUid, 160);
      const durationMinutes = integer(booking.durationMinutes, 15, 240, 60);
      const validated = await validateBookingTime({
        transaction,
        instructorUid,
        startsAt,
        durationMinutes,
        excludeBookingId: bookingId,
        ignoreNotice: instructor,
      });
      const nextStatus = booking.status === 'requested' ? 'requested' : 'rescheduled';
      const nextStart = admin.firestore.Timestamp.fromDate(startsAt);
      const nextEnd = admin.firestore.Timestamp.fromDate(validated.endsAt);

      transaction.set(oldDayRef, {
        intervals: updateDayIntervals(oldDay, bookingId, null),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(validated.dayRef, {
        instructorUid,
        dateKey: validated.dateKey,
        timezone: validated.availability.timezone,
        intervals: updateDayIntervals(
          validated.day,
          bookingId,
          bookingInterval(bookingId, startsAt, validated.endsAt, nextStatus),
        ),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(bookingRef, {
        instructorUid,
        instructorName: validated.availability.displayName || booking.instructorName,
        instructorEmail: normalizeEmail(validated.availability.email) || null,
        startsAt: nextStart,
        endsAt: nextEnd,
        dateKey: validated.dateKey,
        timezone: validated.availability.timezone,
        locationType: validated.availability.defaultLocationType,
        location: clean(validated.availability.defaultLocation, 500) || null,
        status: nextStatus,
        rescheduledAt: admin.firestore.FieldValue.serverTimestamp(),
        rescheduledBy: actorUid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      response = { bookingId, status: nextStatus };
    } else if (action === 'cancel') {
      const isLate = !instructor
        && booking.status !== 'requested'
        && oldStart.getTime() - now < Number(policy.noticeHours || 24) * 60 * 60 * 1000;
      const consumesCredit = isLate && policy.lateCancellationConsumesCredit !== false;
      const status = consumesCredit ? 'late_canceled' : 'canceled';
      transaction.set(bookingRef, {
        status,
        creditStatus: consumesCredit ? 'forfeited' : 'restored',
        canceledAt: admin.firestore.FieldValue.serverTimestamp(),
        canceledBy: actorUid,
        cancellationReason: note,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(oldDayRef, {
        intervals: updateDayIntervals(oldDay, bookingId, null),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(purchaseRef, {
        ...updatePurchaseForRelease(purchase, consumesCredit),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      if (consumesCredit) {
        transaction.set(purchaseRef.collection('sessionHistory').doc(), {
          type: 'late_cancellation',
          delta: -1,
          bookingId,
          sessionAt: booking.startsAt,
          participantIds: booking.participantIds || [],
          notes: note,
          recordedBy: actorUid,
          beforeRemaining: Number(purchase.remainingSessions || 0),
          afterRemaining: Math.max(0, Number(purchase.remainingSessions || 0) - 1),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      response = { bookingId, status };
    } else if (action === 'complete' || action === 'no_show') {
      if (!instructor) throw new HttpsError('permission-denied', 'Only an instructor can close a session.');
      if (booking.status === 'requested') {
        throw new HttpsError('failed-precondition', 'Confirm the booking before closing the session.');
      }
      if (oldStart.getTime() > now) {
        throw new HttpsError('failed-precondition', 'The session has not started yet.');
      }
      const status = action === 'complete' ? 'completed' : 'no_show';
      transaction.set(bookingRef, {
        status,
        creditStatus: 'used',
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        instructorNote: note || booking.instructorNote || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(oldDayRef, {
        intervals: updateDayIntervals(oldDay, bookingId, null),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      const purchaseUpdate = updatePurchaseForRelease(purchase, true);
      transaction.set(purchaseRef, {
        ...purchaseUpdate,
        lastSessionAt: booking.startsAt,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(purchaseRef.collection('sessionHistory').doc(), {
        type: action === 'complete' ? 'session_used' : 'no_show',
        delta: -1,
        bookingId,
        sessionAt: booking.startsAt,
        participantIds: booking.participantIds || [],
        notes: note,
        recordedBy: actorUid,
        beforeRemaining: Number(purchase.remainingSessions || 0),
        afterRemaining: purchaseUpdate.remainingSessions,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      response = { bookingId, status };
    } else {
      throw new HttpsError('invalid-argument', 'That booking action is not supported.');
    }

    transaction.set(historyRef, {
      action,
      actorUid,
      actorRole: instructor ? callerRole(request) : 'member',
      note,
      previousStatus: booking.status,
      nextStatus: response.status,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  return response;
}

module.exports = {
  handleGetMyInstructorAvailability,
  handleSaveMyInstructorAvailability,
  handleSaveInstructorAvailabilityOverride,
  handleDeleteInstructorAvailabilityOverride,
  handleListPrivateTrainingAvailability,
  handleCreatePrivateTrainingBooking,
  handleListMyPrivateTrainingBookings,
  handleListPrivateTrainingBookingsAdmin,
  handleUpdatePrivateTrainingBooking,
};
