const { logger } = require('firebase-functions');
const {
  appUrl,
  configureEmail,
  emailShell,
  escapeHtml,
  sendEmail,
} = require('./emailService');

function clean(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeEmail(value) {
  const email = clean(value, 320).toLowerCase();
  return email && email.includes('@') ? email : '';
}

async function claimConfirmationEmail(ref) {
  return ref.firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;
    const purchase = snapshot.data() || {};
    const status = purchase.purchaseConfirmationEmailStatus;
    if (status === 'sent' || status === 'sending' || status === 'skipped') return null;
    transaction.set(ref, {
      purchaseConfirmationEmailStatus: 'sending',
      purchaseConfirmationEmailUpdatedAt: new Date(),
    }, { merge: true });
    return purchase;
  });
}

async function markConfirmationEmail(ref, status, error = '') {
  await ref.set({
    purchaseConfirmationEmailStatus: status,
    purchaseConfirmationEmailUpdatedAt: new Date(),
    purchaseConfirmationEmailError: error ? clean(error, 800) : null,
  }, { merge: true });
}

async function sendPrivateTrainingPurchaseConfirmation({ ref, purchase }) {
  const recipient = normalizeEmail(purchase.purchaser?.email);
  if (!recipient) {
    logger.warn('Skipping private-training confirmation because no purchaser email was available.', {
      purchaseId: ref.id,
    });
    await markConfirmationEmail(ref, 'skipped', 'No purchaser email.');
    return;
  }

  const accessSnapshot = await ref.firestore
    .collection('studioOrderAccess')
    .doc(purchase.orderId || ref.id)
    .get();
  const managementToken = clean(accessSnapshot.data()?.token, 500);
  const managementUrl = managementToken
    ? appUrl(
      `/private-training/success?order_id=${encodeURIComponent(purchase.orderId || ref.id)}`
      + `&access_token=${encodeURIComponent(managementToken)}`,
    )
    : appUrl('/private-training');
  const title = clean(purchase.offerName, 240) || 'Private training package';
  const sessions = Math.max(
    1,
    Number(purchase.totalSessions || purchase.purchasedSessions || 1),
  );
  const participantCount = Math.max(1, Number(purchase.participantCount || 1));

  await sendEmail({
    to: recipient,
    subject: `Private training confirmed - ${title}`,
    text: [
      `Your ${title} purchase is confirmed.`,
      `Session credits: ${sessions}`,
      `Registered participants: ${participantCount}`,
      `Package reference: ${ref.id}`,
      'Use the secure package page to review participants and complete outstanding waivers.',
      `Manage your package: ${managementUrl}`,
    ].join('\n'),
    html: emailShell({
      eyebrow: 'Private training confirmed',
      title,
      bodyHtml: `
        <p>Your private-training package is confirmed.</p>
        <p><strong>Session credits</strong><br>${sessions}</p>
        <p><strong>Registered participants</strong><br>${participantCount}</p>
        <p><strong>Package reference</strong><br>${escapeHtml(ref.id)}</p>
        <p>Use the secure package page to review participants and complete outstanding waivers. This link is intended for the purchaser and should not be forwarded.</p>`,
      buttonLabel: 'Manage private training',
      buttonUrl: managementUrl,
    }),
  });

  await markConfirmationEmail(ref, 'sent');
}

async function handlePrivateTrainingPurchaseCreated(event, dependencies = {}) {
  configureEmail(dependencies);
  const ref = event.data?.ref;
  if (!ref) return;
  const purchase = await claimConfirmationEmail(ref);
  if (!purchase) return;

  try {
    await sendPrivateTrainingPurchaseConfirmation({ ref, purchase });
  } catch (error) {
    await markConfirmationEmail(ref, 'failed', error?.message);
    throw error;
  }
}

module.exports = {
  handlePrivateTrainingPurchaseCreated,
};
