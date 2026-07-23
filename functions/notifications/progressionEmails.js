const admin = require('firebase-admin');
const { logger } = require('firebase-functions');
const { getLevel } = require('../config/progressionSystem');
const {
  configureEmail,
  emailShell,
  sendEmail,
  studioNotificationEmail,
  appUrl,
  escapeHtml,
} = require('./emailService');

function statusChanged(before = {}, after = {}) {
  return String(before.status || '') !== String(after.status || '');
}

function progressionLevelLabel(review = {}) {
  return getLevel(review.levelKey)?.label
    || review.levelLabel
    || review.levelKey
    || 'progression level';
}

async function sendInstructorSubmissionEmail(reviewId, review) {
  const to = studioNotificationEmail();
  if (!to) {
    logger.warn('Skipping progression submission email because STUDIO_NOTIFICATION_EMAIL is empty.', { reviewId });
    return;
  }

  const memberName = review.memberDisplayName || review.memberEmail || 'A member';
  const levelLabel = progressionLevelLabel(review);
  await sendEmail({
    to,
    subject: `${memberName} submitted ${levelLabel} for review`,
    text: `${memberName} submitted ${levelLabel} for instructor review. Open the queue: ${appUrl('/instructor/progression')}`,
    html: emailShell({
      eyebrow: 'Progression review',
      title: 'A progression level is ready',
      bodyHtml: `<p><strong>${escapeHtml(memberName)}</strong> submitted <strong>${escapeHtml(levelLabel)}</strong> for instructor review.</p><p>Review the seven skill categories, watch the current evidence videos, and record a clear decision for each category.</p>`,
      buttonLabel: 'Open instructor queue',
      buttonUrl: appUrl('/instructor/progression'),
    }),
  });
}

async function sendMemberReviewEmail(type, review) {
  const to = review.memberEmail;
  if (!to) {
    logger.warn('Skipping member progression email because no member email is available.', { type, reviewId: review.reviewId });
    return;
  }

  const firstName = String(review.memberDisplayName || '').trim().split(/\s+/)[0] || 'there';
  const levelLabel = progressionLevelLabel(review);

  if (type === 'needs_work') {
    await sendEmail({
      to,
      subject: `${levelLabel} review: updates requested`,
      text: `Hi ${firstName}, your instructor requested updates for ${levelLabel}. Open your progression page: ${appUrl('/member/progression')}`,
      html: emailShell({
        eyebrow: 'Progression review',
        title: 'Your instructor left feedback',
        bodyHtml: `<p>Hi ${escapeHtml(firstName)},</p><p>Your instructor requested updates for one or more <strong>${escapeHtml(levelLabel)}</strong> categories. Review the instructor notes, replace evidence where needed, and submit the level again when it is ready.</p>`,
        buttonLabel: 'Review progression',
        buttonUrl: appUrl('/member/progression'),
      }),
    });
    return;
  }

  await sendEmail({
    to,
    subject: `${levelLabel} approved — progression earned`,
    text: `Hi ${firstName}, your instructor approved ${levelLabel}. View your progression: ${appUrl('/member/progression')}`,
    html: emailShell({
      eyebrow: 'Progression approved',
      title: `${levelLabel} is complete`,
      bodyHtml: `<p>Hi ${escapeHtml(firstName)},</p><p>Your instructor approved all seven categories for <strong>${escapeHtml(levelLabel)}</strong>. Your progression record has been updated.</p><p>Keep the emphasis on consistent practice, sound judgment, and training safely with qualified instruction.</p>`,
      buttonLabel: 'View progression',
      buttonUrl: appUrl('/member/progression'),
    }),
  });
}

async function handleProgressionReviewWritten(event, dependencies = {}) {
  configureEmail(dependencies);
  const before = event.data?.before?.data() || {};
  const after = event.data?.after?.data() || {};
  const reviewId = event.params.reviewId;
  if (!after.status || !statusChanged(before, after)) return;

  try {
    if (after.status === 'submitted') {
      await sendInstructorSubmissionEmail(reviewId, after);
    } else if (after.status === 'needs_work') {
      await sendMemberReviewEmail('needs_work', after);
    } else if (after.status === 'approved') {
      await sendMemberReviewEmail('approved', after);
    }

    await event.data.after.ref.set({
      notifications: {
        [after.status]: {
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
    }, { merge: true });
  } catch (error) {
    logger.error('Progression email failed.', { reviewId, status: after.status, error: error?.message });
    await event.data.after.ref.set({
      notifications: {
        [after.status]: {
          failedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastError: String(error?.message || 'Unknown email error').slice(0, 500),
        },
      },
    }, { merge: true });
  }
}

module.exports = { handleProgressionReviewWritten };
