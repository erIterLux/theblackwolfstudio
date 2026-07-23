const admin = require('firebase-admin');
const { logger } = require('firebase-functions');
const {
  configureEmail,
  escapeHtml,
  emailShell,
  sendEmail,
  studioNotificationEmail,
} = require('./emailService');

async function claimInquiryEmail(inquiryRef) {
  return admin.firestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(inquiryRef);
    if (!snapshot.exists) return false;
    const status = snapshot.data()?.notifications?.inquiryEmail?.status;
    if (status === 'sending' || status === 'sent') return false;

    transaction.set(inquiryRef, {
      notifications: {
        inquiryEmail: {
          status: 'sending',
          claimedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
    }, { merge: true });
    return true;
  });
}

async function handleInquiryCreated(event, dependencies = {}) {
  configureEmail(dependencies);
  const inquiryRef = event.data?.ref;
  const inquiry = event.data?.data() || {};
  if (!inquiryRef) return;

  const claimed = await claimInquiryEmail(inquiryRef);
  if (!claimed) return;

  const name = String(inquiry.name || 'Website visitor').trim();
  const email = String(inquiry.email || '').trim().toLowerCase();
  const phone = String(inquiry.phone || '').trim();
  const interest = String(inquiry.interest || 'General inquiry').trim();
  const message = String(inquiry.message || '').trim();

  try {
    const adminRecipient = studioNotificationEmail();
    if (adminRecipient) {
      await sendEmail({
        to: adminRecipient,
        replyTo: email || undefined,
        subject: `New Black Wolf Studio inquiry — ${interest}`,
        text: `Name: ${name}\nEmail: ${email}\nPhone: ${phone}\nInterest: ${interest}\n\n${message}`,
        html: emailShell({
          title: 'New website inquiry',
          bodyHtml: `
            <p><strong>Name:</strong> ${escapeHtml(name)}</p>
            <p><strong>Email:</strong> ${escapeHtml(email || 'Not provided')}</p>
            <p><strong>Phone:</strong> ${escapeHtml(phone || 'Not provided')}</p>
            <p><strong>Interest:</strong> ${escapeHtml(interest)}</p>
            <p><strong>Message:</strong></p>
            <p style="white-space:pre-wrap">${escapeHtml(message || 'No message provided.')}</p>`,
        }),
      });
    }

    if (email) {
      await sendEmail({
        to: email,
        subject: 'We received your Black Wolf Studio inquiry',
        text: `Hi ${name}, we received your message and will follow up soon.`,
        html: emailShell({
          title: 'We received your message',
          bodyHtml: `<p>Hi ${escapeHtml(name)},</p><p>Thank you for reaching out to The Black Wolf Studio. We received your inquiry about <strong>${escapeHtml(interest)}</strong> and will follow up as soon as possible.</p><p>There is nothing else you need to do right now.</p>`,
        }),
      });
    }

    await inquiryRef.set({
      notifications: {
        inquiryEmail: {
          status: 'sent',
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          lastError: admin.firestore.FieldValue.delete(),
        },
      },
    }, { merge: true });
  } catch (error) {
    logger.error('Failed to send inquiry notification emails.', error);
    await inquiryRef.set({
      notifications: {
        inquiryEmail: {
          status: 'failed',
          failedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastError: String(error?.message || 'Unknown email error').slice(0, 500),
        },
      },
    }, { merge: true });
    throw error;
  }
}

module.exports = { handleInquiryCreated };
