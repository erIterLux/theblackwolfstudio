const { logger } = require('firebase-functions');
const {
  appUrl,
  configureEmail,
  emailShell,
  escapeHtml,
  sendEmail,
} = require('./emailService');

const MAX_RECIPIENTS = 20;

function clean(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeEmail(value) {
  const email = clean(value, 320).toLowerCase();
  return email && email.includes('@') ? email : '';
}

function uniqueEmails(values) {
  return [...new Set(values.map(normalizeEmail).filter(Boolean))].slice(0, MAX_RECIPIENTS);
}

function asDate(value) {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  return date && !Number.isNaN(date.valueOf()) ? date : null;
}

function utcCalendarDate(value) {
  const date = asDate(value);
  if (!date) return '';
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeCalendarText(value) {
  return clean(value, 5000)
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function foldCalendarLine(value) {
  const line = String(value);
  const lines = [];
  let current = '';
  let byteLimit = 75;

  for (const character of line) {
    if (Buffer.byteLength(current + character, 'utf8') > byteLimit) {
      lines.push(lines.length ? ` ${current}` : current);
      current = character;
      byteLimit = 74;
    } else {
      current += character;
    }
  }
  lines.push(lines.length ? ` ${current}` : current);
  return lines.join('\r\n');
}

function locationText(event = {}) {
  const location = event.location || {};
  return [
    location.name,
    location.address,
    location.onlineUrl,
  ].map((value) => clean(value, 1000)).filter(Boolean).join(' - ');
}

function eventDateLabel(event = {}) {
  const startsAt = asDate(event.startsAt);
  const endsAt = asDate(event.endsAt);
  if (!startsAt) return 'Date and time are available in the attached calendar file.';
  const timezone = clean(event.timezone, 100) || 'America/New_York';
  const dateOptions = {
    timeZone: timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  };
  try {
    const startLabel = startsAt.toLocaleString('en-US', dateOptions);
    if (!endsAt) return startLabel;
    const endLabel = endsAt.toLocaleTimeString('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
    return `${startLabel} - ${endLabel}`;
  } catch {
    return `${startsAt.toLocaleString('en-US')} - ${endsAt?.toLocaleTimeString('en-US') || ''}`;
  }
}

function calendarFilename(title) {
  const slug = clean(title, 100)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'black-wolf-studio-event'}.ics`;
}

function createEventCalendar(registration = {}, registrationId = '', createdAt = new Date()) {
  const event = registration.eventSnapshot || {};
  const startsAt = utcCalendarDate(event.startsAt);
  const endsAt = utcCalendarDate(event.endsAt);
  if (!startsAt || !endsAt) {
    throw new Error('The event start and end times are required for a calendar attachment.');
  }

  const title = clean(event.title, 240) || 'The Black Wolf Studio event';
  const participantCount = Math.max(1, Number(registration.participantCount || 1));
  const description = [
    'Your event registration is confirmed.',
    `Registration reference: ${registrationId}`,
    `Registered participants: ${participantCount}`,
    'Complete any required participant waivers before event check-in.',
    `Event information: ${appUrl('/events')}`,
  ].join('\n');
  const calendarLines = [
    'BEGIN:VCALENDAR',
    'PRODID:-//The Black Wolf Studio//Event Registration//EN',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:event-registration-${escapeCalendarText(registrationId)}@theblackwolf.studio`,
    `DTSTAMP:${utcCalendarDate(createdAt)}`,
    `DTSTART:${startsAt}`,
    `DTEND:${endsAt}`,
    `SUMMARY:${escapeCalendarText(title)}`,
    `DESCRIPTION:${escapeCalendarText(description)}`,
    `LOCATION:${escapeCalendarText(locationText(event))}`,
    `URL:${escapeCalendarText(appUrl('/events'))}`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'SEQUENCE:0',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${calendarLines.map(foldCalendarLine).join('\r\n')}\r\n`;
}

async function claimConfirmationEmail(ref) {
  return ref.firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;
    const registration = snapshot.data() || {};
    const status = registration.registrationConfirmationEmailStatus;
    if (status === 'sent' || status === 'sending' || status === 'skipped') return null;
    transaction.set(ref, {
      registrationConfirmationEmailStatus: 'sending',
      registrationConfirmationEmailUpdatedAt: new Date(),
    }, { merge: true });
    return registration;
  });
}

async function markConfirmationEmail(ref, status, details = {}) {
  await ref.set({
    registrationConfirmationEmailStatus: status,
    registrationConfirmationEmailUpdatedAt: new Date(),
    registrationConfirmationEmailError: details.error
      ? clean(details.error, 800)
      : null,
    registrationConfirmationEmailRecipientCount: Number(details.recipientCount || 0),
  }, { merge: true });
}

async function registrationRecipients(ref, registration) {
  const participantsSnapshot = await ref.firestore
    .collection('eventParticipants')
    .where('registrationId', '==', ref.id)
    .limit(MAX_RECIPIENTS)
    .get();
  const participants = participantsSnapshot.docs.map((item) => item.data() || {});
  const purchaserEmail = normalizeEmail(registration.purchaser?.email);
  const participantEmails = uniqueEmails(
    participants.flatMap((participant) => [
      participant.email,
      participant.isMinor === true ? participant.guardianEmail : null,
    ]),
  ).filter((email) => email !== purchaserEmail);
  return { purchaserEmail, participantEmails };
}

async function sendEventRegistrationConfirmation({ ref, registration }) {
  const { purchaserEmail, participantEmails } = await registrationRecipients(
    ref,
    registration,
  );
  const recipientCount = uniqueEmails([purchaserEmail, ...participantEmails]).length;
  if (!recipientCount) {
    logger.warn('Skipping event registration confirmation because no recipient was available.', {
      registrationId: ref.id,
    });
    await markConfirmationEmail(ref, 'skipped');
    return;
  }

  const event = registration.eventSnapshot || {};
  const title = clean(event.title, 240) || 'The Black Wolf Studio event';
  const dateLabel = eventDateLabel(event);
  const location = locationText(event) || 'Location information will be provided by the Studio.';
  const participantCount = Math.max(1, Number(registration.participantCount || 1));
  const calendar = createEventCalendar(registration, ref.id);
  const calendarAttachment = {
    filename: calendarFilename(title),
    content: Buffer.from(calendar, 'utf8'),
    contentType: 'text/calendar; charset=utf-8; method=PUBLISH',
    contentDisposition: 'attachment',
  };
  const accessSnapshot = await ref.firestore
    .collection('studioOrderAccess')
    .doc(registration.orderId || ref.id)
    .get();
  const managementToken = clean(accessSnapshot.data()?.token, 500);
  const managementUrl = managementToken
    ? appUrl(
      `/events/success?order_id=${encodeURIComponent(registration.orderId || ref.id)}`
      + `&access_token=${encodeURIComponent(managementToken)}`,
    )
    : appUrl('/events');
  const commonText = [
    `Your registration for ${title} is confirmed.`,
    `When: ${dateLabel}`,
    `Where: ${location}`,
    `Participants: ${participantCount}`,
    `Registration reference: ${ref.id}`,
    'A calendar file is attached. Complete any required participant waivers before check-in.',
  ];
  const commonBody = `
    <p>Your registration is confirmed.</p>
    <p><strong>When</strong><br>${escapeHtml(dateLabel)}</p>
    <p><strong>Where</strong><br>${escapeHtml(location)}</p>
    <p><strong>Registered participants</strong><br>${participantCount}</p>
    <p><strong>Registration reference</strong><br>${escapeHtml(ref.id)}</p>
    <p>A calendar file is attached. Complete any required participant waivers before event check-in.</p>`;

  if (purchaserEmail) {
    await sendEmail({
      to: purchaserEmail,
      subject: `Event registration confirmed - ${title}`,
      text: [
        ...commonText,
        `Manage this registration: ${managementUrl}`,
      ].join('\n'),
      html: emailShell({
        eyebrow: 'Event registration confirmed',
        title,
        bodyHtml: `${commonBody}
          <p>Use the secure registration page to review every participant and complete outstanding actions. This link is intended for the purchaser and should not be forwarded.</p>`,
        buttonLabel: 'Manage registration',
        buttonUrl: managementUrl,
      }),
      attachments: [calendarAttachment],
    });
  }

  if (participantEmails.length) {
    const recipientFields = participantEmails.length === 1
      ? { to: participantEmails[0] }
      : { bcc: participantEmails };
    await sendEmail({
      ...recipientFields,
      subject: `Event registration confirmed - ${title}`,
      text: [
        ...commonText,
        `Event information: ${appUrl('/events')}`,
      ].join('\n'),
      html: emailShell({
        eyebrow: 'Event registration confirmed',
        title,
        bodyHtml: commonBody,
        buttonLabel: 'View upcoming events',
        buttonUrl: appUrl('/events'),
      }),
      attachments: [calendarAttachment],
    });
  }

  await markConfirmationEmail(ref, 'sent', { recipientCount });
}

async function handleEventRegistrationCreated(event, dependencies = {}) {
  configureEmail(dependencies);
  const ref = event.data?.ref;
  if (!ref) return;
  const registration = await claimConfirmationEmail(ref);
  if (!registration) return;
  if (registration.registrationStatus !== 'confirmed') {
    await markConfirmationEmail(ref, 'skipped');
    return;
  }

  try {
    await sendEventRegistrationConfirmation({ ref, registration });
  } catch (error) {
    await markConfirmationEmail(ref, 'failed', { error: error?.message });
    throw error;
  }
}

module.exports = {
  createEventCalendar,
  handleEventRegistrationCreated,
};
